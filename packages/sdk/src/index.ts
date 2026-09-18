import './styles.css'
import { html, nothing, render } from 'lit-html'
import { createRef, ref } from 'lit-html/directives/ref.js'
import {
  normalizePagePath,
  isValidEmail,
  isValidWebsite,
  type Comment,
  type CommentCreateRequest,
  type HitalkOptions,
} from '@hitalk/shared'
import { HitalkAPI, APIError } from './api'
import { Store } from './store'
import { Editor, type EditorData } from './ui/Editor'
import { CommentList } from './ui/CommentList'
import type { CommentActions } from './renderer/comment'
import { renderFeedback, type FeedbackKind } from './renderer/feedback'
export type {
  Comment,
  CommentCreateRequest,
  CommentListResponse,
  ReplyListResponse,
  HitalkOptions,
  GuestField,
  UserInfo,
} from '@hitalk/shared'
export { getCommentCounts, fillCommentCounts } from './counts'
export { normalizePagePath } from '@hitalk/shared'
const instances = new WeakMap<HTMLElement, Hitalk>()
interface Pending {
  fingerprint: string
  request: CommentCreateRequest
}
export class Hitalk {
  private api: HitalkAPI
  private store: Store
  private editor: Editor
  private commentList: CommentList
  private receiptList: CommentList
  private receipts: Comment[] = []
  private receiptContainer = createRef<HTMLElement>()
  private container: HTMLElement
  private view: HTMLElement
  private editorContainer: HTMLElement
  private editorHome = createRef<HTMLElement>()
  private listContainer = createRef<HTMLElement>()
  private unsubscribe: () => void
  private events = new AbortController()
  private path: string
  private draftKey: string
  private requestKey: string
  private pending: Pending | null = null
  private destroyed = false
  private submitting = false
  private loading = false
  private retry = false
  private sequence = 0
  private mutation = 0
  private cursor: string | null = null
  private total: number | null = null
  private enabled = true
  private firstLoad = true
  private message = ''
  private messageKind: FeedbackKind = 'info'
  private busyReplies = new Set<string>()
  private busyMutations = new Set<string>()
  private options: HitalkOptions
  constructor(selector: string | HTMLElement, options: HitalkOptions) {
    const el =
      typeof selector === 'string' ? document.querySelector(selector) : selector
    if (!(el instanceof HTMLElement))
      throw new Error('Hitalk: 无法找到指定的容器元素')
    const path = normalizePagePath(options.path ?? location.pathname)
    if (
      !Number.isInteger(options.pageSize ?? 10) ||
      (options.pageSize ?? 10) < 1 ||
      (options.pageSize ?? 10) > 20
    )
      throw new Error('Hitalk: pageSize 必须为 1–20 的整数')
    const fields = options.guestFields ?? ['nick', 'email', 'website']
    if (
      !Array.isArray(fields) ||
      fields.some(f => !['nick', 'email', 'website'].includes(f))
    )
      throw new Error('Hitalk: guestFields 无效')
    this.api = new HitalkAPI(options.server)
    this.path = path
    this.options = options
    this.draftKey = `hitalk:draft:${this.api.baseURL}:${path}`
    this.requestKey = `${this.draftKey}:request`
    this.store = new Store(`hitalk:profile:${this.api.baseURL}`)
    instances.get(el)?.destroy()
    this.container = el
    el.classList.add('Hitalk')
    this.view = el.ownerDocument.createElement('div')
    this.view.className = 'hitalk-root'
    el.replaceChildren(this.view)
    this.shell()
    this.editorContainer = el.ownerDocument.createElement('div')
    this.editorContainer.className = 'editor-container'
    this.editorHome.value!.append(this.editorContainer)
    this.editor = new Editor(
      this.editorContainer,
      this.store.getUserInfo(),
      options.placeholder || '说点什么吧…',
      data => {
        void this.submit(data)
      },
      () => this.cancelReply(),
      [...new Set(fields)],
      info => {
        this.store.setUserInfo(info)
        this.saveDraft()
      }
    )
    const actions: CommentActions = {
      onReply: (id, nick) => this.reply(id, nick),
      onLike: id => {
        void this.like(id)
      },
      onLocate: id => {
        void this.locate(id)
      },
      onDelete: id => {
        void this.remove(id)
      },
      onMore: id => {
        void this.moreReplies(id)
      },
      isLoading: id => this.busyReplies.has(id),
    }
    this.commentList = new CommentList(
      this.listContainer.value!,
      options.avatar || 'mm',
      actions
    )
    this.receiptList = new CommentList(
      this.receiptContainer.value!,
      options.avatar || 'mm',
      actions
    )
    this.unsubscribe = this.store.subscribe(() => this.update())
    this.restoreDraft()
    this.editorContainer.addEventListener('input', () => this.saveDraft(), {
      signal: this.events.signal,
    })
    this.editorContainer.addEventListener('change', () => this.saveDraft(), {
      signal: this.events.signal,
    })
    instances.set(el, this)
    void this.refresh()
  }
  private saveDraft() {
    try {
      sessionStorage.setItem(
        this.draftKey,
        JSON.stringify({
          fields: this.editor.snapshot(),
          reply: this.store.getReplyTarget(),
        })
      )
    } catch {
      /* draft persistence is optional */
    }
  }
  private restoreDraft() {
    try {
      const draft = JSON.parse(sessionStorage.getItem(this.draftKey) || 'null')
      if (draft && typeof draft.fields === 'object')
        this.editor.restore(draft.fields)
      if (
        draft?.reply &&
        typeof draft.reply.id === 'string' &&
        typeof draft.reply.nick === 'string'
      ) {
        this.store.setReplyTarget(draft.reply)
        this.editor.setReply(draft.reply.nick)
      }
      const pending: unknown = JSON.parse(
        sessionStorage.getItem(this.requestKey) || 'null'
      )
      if (
        pending &&
        typeof pending === 'object' &&
        'fingerprint' in pending &&
        typeof pending.fingerprint === 'string' &&
        'request' in pending &&
        typeof pending.request === 'object'
      )
        this.pending = pending as Pending
    } catch {
      /* damaged session cache is ignored */
    }
  }
  private notice(message: string, kind: FeedbackKind = 'info') {
    this.message = message
    this.messageKind = kind
    this.shell()
    const feedback = this.view.querySelector<HTMLElement>('.hitalk-feedback')
    feedback?.getAnimations?.().forEach(animation => animation.cancel())
    if (
      message &&
      !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      feedback?.animate?.(
        [
          { opacity: 0.6, transform: 'translateY(-4px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 200, easing: 'ease-out' }
      )
    }
  }
  private error(error: unknown) {
    return error instanceof APIError && error.code === 'RATE_LIMITED'
      ? `操作过于频繁，请在 ${error.retryAfter || 60} 秒后重试`
      : error instanceof Error
        ? error.message
        : '请稍后重试'
  }
  async refresh(): Promise<void> {
    if (!this.destroyed) await this.load(false)
  }
  private async load(more: boolean) {
    const sequence = ++this.sequence,
      revision = this.mutation
    this.loading = true
    this.retry = false
    this.shell()
    try {
      const result = await this.api.fetchComments(
        this.path,
        more ? this.cursor : null,
        this.options.pageSize || 10
      )
      if (
        this.destroyed ||
        sequence !== this.sequence ||
        revision !== this.mutation
      )
        return
      if (!more && this.api.identity.read()) {
        try {
          const own = await this.api.pendingComments(this.path)
          if (
            this.destroyed ||
            sequence !== this.sequence ||
            revision !== this.mutation
          )
            return
          this.receipts = own.comments.filter(
            c => c.status === 'pending' && !c.deleted
          )
        } catch (error) {
          if (error instanceof APIError && error.status === 401)
            this.receipts = []
        }
      }
      if (
        this.destroyed ||
        sequence !== this.sequence ||
        revision !== this.mutation
      )
        return
      this.store.setComments([
        ...new Map(
          [
            ...(more ? this.store.getComments() : result.pinned),
            ...result.comments,
          ].map(c => [c.id, c])
        ).values(),
      ])
      this.cursor = result.next_cursor
      this.total = result.total
      this.enabled = result.comments_enabled
      if (!this.enabled) this.notice('此页面已关闭评论', 'warning')
      if (this.firstLoad) {
        this.firstLoad = false
        const target = location.hash.slice(1)
        if (/^[0-9a-f-]{36}$/i.test(target)) void this.locate(target)
      }
    } catch (error) {
      if (!this.destroyed && sequence === this.sequence) {
        this.retry = true
        this.notice(`加载失败：${this.error(error)}`, 'error')
      }
    } finally {
      if (!this.destroyed && sequence === this.sequence) {
        this.loading = false
        this.shell()
      }
    }
  }
  private update() {
    const active = this.container.ownerDocument.activeElement
    this.commentList.update(this.store.getComments())
    this.receiptList.update(this.receipts)
    const target = this.store.getReplyTarget()
    const slot = target ? this.commentList.replySlot(target.id) : null
    ;(slot || this.editorHome.value)!.append(this.editorContainer)
    if (
      active instanceof HTMLElement &&
      active.isConnected &&
      this.container.contains(active)
    )
      active.focus({ preventScroll: true })
  }
  private reply(id: string, nick: string) {
    if (this.submitting) return
    this.store.setReplyTarget({ id, nick })
    this.editor.setReply(nick)
    this.update()
    this.editor.focus()
    this.saveDraft()
  }
  private cancelReply() {
    this.store.setReplyTarget(null)
    this.editor.setReply(null)
    this.editorHome.value!.append(this.editorContainer)
    this.saveDraft()
  }
  private async submit(data: EditorData) {
    if (this.destroyed || this.submitting) return
    if (!this.enabled) {
      this.notice('此页面已关闭评论', 'warning')
      return
    }
    if (!data.content.trim()) {
      this.notice('请先填写评论内容', 'error')
      return
    }
    if (data.email && !isValidEmail(data.email.trim())) {
      this.notice('邮箱格式不正确', 'error')
      return
    }
    if (data.website && !isValidWebsite(data.website.trim())) {
      this.notice('网址格式不正确', 'error')
      return
    }
    const input = {
      path: this.path,
      title: this.options.title || document.title,
      nick: data.nick.trim() || 'Guest',
      email: data.email.trim() || undefined,
      website: data.website.trim() || undefined,
      content: data.content.trim(),
      reply_to_id: this.store.getReplyTarget()?.id,
      notify: Boolean(data.email.trim() && data.notify),
    }
    const fingerprint = JSON.stringify(input)
    if (this.pending?.fingerprint !== fingerprint)
      this.pending = {
        fingerprint,
        request: { ...input, client_request_id: crypto.randomUUID() },
      }
    this.saveDraft()
    try {
      sessionStorage.setItem(this.requestKey, JSON.stringify(this.pending))
    } catch {
      /* in-memory retry remains available */
    }
    this.submitting = true
    this.editor.setSubmitting(true)
    this.notice('正在发送，请稍候…', 'loading')
    try {
      const created = await this.api.createComment(this.pending!.request)
      if (this.destroyed) return
      this.mutation++
      this.pending = null
      try {
        sessionStorage.removeItem(this.requestKey)
      } catch {
        /* optional */
      }
      this.editor.saveProfile({
        nick: input.nick,
        email: data.email,
        website: data.website,
      })
      this.editor.clear()
      this.cancelReply()
      this.saveDraft()
      if (created.deleted) {
        this.notice('这条评论已经删除，不会重复发布')
        return
      }
      if (created.status === 'published') this.store.upsert(created)
      else {
        this.receipts = [
          created,
          ...this.receipts.filter(c => c.id !== created.id),
        ]
        this.update()
      }
      this.notice(
        created.status === 'published'
          ? '评论已发送'
          : '已提交，审核通过后展示',
        created.status === 'published' ? 'success' : 'warning'
      )
      if (created.status === 'published') {
        try {
          if (created.root_id) {
            const context = await this.api.context(created.id)
            if (!this.destroyed) {
              const existing = this.store.find(context.root.id)
              this.store.upsert({
                ...context.root,
                replies: [
                  ...new Map(
                    [
                      ...(existing?.replies || []),
                      ...(context.root.replies || []),
                    ].map(c => [c.id, c])
                  ).values(),
                ],
                reply_cursor:
                  existing?.reply_cursor ?? context.root.reply_cursor,
              })
            }
          }
          const counts = await this.api.getCommentCounts([this.path])
          if (!this.destroyed) {
            this.total = counts[this.path]
            this.shell()
          }
        } catch {
          if (!this.destroyed)
            this.notice('评论已发送，列表同步失败，可重新加载', 'warning')
        }
      }
    } catch (error) {
      if (!this.destroyed)
        this.notice(
          error instanceof APIError
            ? `提交失败：${this.error(error)}`
            : '暂未确认发送结果，重试会使用同一请求，不会重复发布',
          error instanceof APIError ? 'error' : 'warning'
        )
    } finally {
      this.submitting = false
      if (!this.destroyed) this.editor.setSubmitting(false)
    }
  }
  private async like(id: string) {
    if (this.destroyed || this.busyMutations.has(id)) return
    const comment = this.store.find(id)
    if (!comment) return
    this.busyMutations.add(id)
    try {
      const result = await this.api.likeComment(id, !comment.liked)
      if (!this.destroyed) {
        this.mutation++
        this.store.patch(id, result)
      }
    } catch (error) {
      if (!this.destroyed) this.notice(this.error(error), 'error')
    } finally {
      this.busyMutations.delete(id)
    }
  }
  private async remove(id: string) {
    if (this.destroyed || this.busyMutations.has(id)) return
    this.busyMutations.add(id)
    try {
      await this.api.deleteComment(id)
      if (!this.destroyed) {
        this.mutation++
        this.receipts = this.receipts.filter(c => c.id !== id)
        this.store.markDeleted(id)
        if (this.store.getReplyTarget()?.id === id) this.cancelReply()
        this.notice('评论已删除', 'success')
        const counts = await this.api.getCommentCounts([this.path])
        if (!this.destroyed) {
          this.total = counts[this.path]
          this.shell()
        }
      }
    } catch (error) {
      if (!this.destroyed) this.notice(this.error(error), 'error')
    } finally {
      this.busyMutations.delete(id)
    }
  }
  private async moreReplies(id: string) {
    const root = this.store.find(id)
    if (this.destroyed || !root?.reply_cursor || this.busyReplies.has(id))
      return
    this.busyReplies.add(id)
    this.update()
    const revision = this.mutation
    try {
      const result = await this.api.fetchReplies(id, root.reply_cursor)
      if (!this.destroyed && revision === this.mutation) {
        const current = this.store.find(id)
        this.store.patch(id, {
          replies: [
            ...new Map(
              [...(current?.replies || []), ...result.comments].map(c => [
                c.id,
                c,
              ])
            ).values(),
          ],
          reply_cursor: result.next_cursor,
        })
      }
    } catch (error) {
      if (!this.destroyed) this.notice(this.error(error), 'error')
    } finally {
      this.busyReplies.delete(id)
      if (!this.destroyed) this.update()
    }
  }
  private async locate(id: string) {
    if (this.store.find(id)) {
      this.commentList.locate(id)
      return
    }
    const revision = this.mutation
    try {
      const context = await this.api.context(id)
      if (this.destroyed || revision !== this.mutation) return
      const current = this.store.find(context.root.id)
      this.store.upsert({
        ...context.root,
        replies: [
          ...new Map(
            [...(current?.replies || []), ...(context.root.replies || [])].map(
              c => [c.id, c]
            )
          ).values(),
        ],
        reply_cursor: current?.reply_cursor ?? context.root.reply_cursor,
      })
      this.commentList.locate(id)
    } catch (error) {
      if (!this.destroyed) this.notice(this.error(error), 'error')
    }
  }
  private shell() {
    if (this.destroyed) return
    render(
      html`<div ${ref(this.editorHome)} class="editor-home"></div>
        ${renderFeedback(this.message, this.messageKind)}
        <button
          class="vbtn hitalk-retry"
          ?hidden=${!this.retry}
          @click=${() => {
            void this.refresh()
          }}
        >
          重新加载
        </button>
        <div class="info">
          <span class="count"
            >${this.total === null ? '' : `评论(${this.total})`}</span
          >
        </div>
        ${this.loading ? html`<div class="hitalk-loading" role="status">正在加载…</div>` : nothing}
        <div class="hitalk-receipts" ?hidden=${!this.receipts.length}>
          <p class="hitalk-receipts-title">我的最近待审核评论</p>
          <div ${ref(this.receiptContainer)}></div>
        </div>
        <div ${ref(this.listContainer)} class="comment-list-container"></div>
        <button
          class="vbtn hitalk-more"
          ?hidden=${!this.cursor}
          ?disabled=${this.loading || this.submitting}
          @click=${() => {
            void this.load(true)
          }}
        >
          加载更多评论
        </button>`,
      this.view
    )
  }
  destroy(): void {
    if (this.destroyed) return
    this.saveDraft()
    this.destroyed = true
    this.sequence++
    this.api.destroy()
    this.events.abort()
    this.unsubscribe()
    this.editor.destroy()
    this.commentList.destroy()
    this.receiptList.destroy()
    render(nothing, this.view).setConnected(false)
    this.view.remove()
    this.container.classList.remove('Hitalk')
    instances.delete(this.container)
  }
}
export function mount(
  selector: string | HTMLElement,
  options: HitalkOptions
): Hitalk {
  return new Hitalk(selector, options)
}
