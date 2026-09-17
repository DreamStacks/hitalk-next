import { html, nothing, render } from 'lit-html'
import { createRef, ref } from 'lit-html/directives/ref.js'
import type { HitalkOptions } from '@hitalk/shared'
import { HitalkAPI } from './api'
import { Store } from './store'
import { Editor, type EditorData } from './ui/Editor'
import { CommentList } from './ui/CommentList'
import { check } from './utils'
import './styles.css'

export type {
  HitalkOptions,
  Comment,
  CommentCreateRequest,
  CommentListResponse,
} from '@hitalk/shared'
const instances = new WeakMap<HTMLElement, Hitalk>()

export class Hitalk {
  private api: HitalkAPI
  private store = new Store()
  private container: HTMLElement
  private editor: Editor
  private editorContainer: HTMLElement
  private view: HTMLElement
  private editorHome = createRef<HTMLElement>()
  private listContainer = createRef<HTMLElement>()
  private message = ''
  private total: number | null = null
  private hasMore = false
  private retry = false
  private commentList: CommentList
  private options: Required<HitalkOptions>
  private unsubscribe: () => void
  private destroyed = false
  private submitting = false
  private liking = new Set<string>()
  private loadSequence = 0
  private loadingPage = false
  private pending = 0
  private page = 1
  private likeRevision = 0
  private likeUpdates = new Map<string, { revision: number; count: number }>()

  constructor(selector: string | HTMLElement, options: HitalkOptions) {
    const el =
      typeof selector === 'string' ? document.querySelector(selector) : selector
    if (!(el instanceof HTMLElement))
      throw new Error('Hitalk: 无法找到指定的容器元素')
    if (!options.server) throw new Error('Hitalk: 缺少 server 配置')
    const pageSize = options.pageSize ?? 10
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50)
      throw new Error('Hitalk: pageSize 必须为 1–50 的整数')
    instances.get(el)?.destroy()
    this.container = el
    this.options = {
      server: options.server,
      path: options.path || location.pathname.replace(/index\.(html|htm)$/, ''),
      title: options.title || document.title,
      placeholder: options.placeholder || '说点什么吧...',
      avatar: options.avatar || 'mm',
      pageSize,
    }
    this.api = new HitalkAPI(this.options.server)
    el.classList.add('Hitalk')
    this.view = el.ownerDocument.createElement('div')
    this.view.className = 'hitalk-root'
    el.replaceChildren(this.view)
    this.renderShell()
    this.editorContainer = el.ownerDocument.createElement('div')
    this.editorContainer.className = 'editor-container'
    this.editorHome.value!.append(this.editorContainer)
    this.editor = new Editor(
      this.editorContainer,
      this.store.getUserInfo(),
      this.options.placeholder,
      data => {
        void this.handleSubmit(data)
      },
      () => this.handleCancelReply()
    )
    this.commentList = new CommentList(
      this.listContainer.value!,
      this.options.avatar,
      {
        onReply: (id, nick) => this.handleReply(id, nick),
        onLike: id => {
          void this.handleLike(id)
        },
      }
    )
    this.unsubscribe = this.store.subscribe(() => this.updateUI())
    instances.set(el, this)
    void this.refresh()
  }

  /** Reload the first page without replacing the editor or its draft. */
  async refresh(): Promise<void> {
    if (!this.destroyed) await this.loadComments(1)
  }

  private async loadComments(page: number) {
    const sequence = ++this.loadSequence
    const likeRevision = this.likeRevision
    this.loadingPage = true
    this.retry = false
    this.message = ''
    this.busy(1)
    try {
      const result = await this.api.fetchComments(
        this.options.path,
        page,
        this.options.pageSize
      )
      if (this.destroyed || sequence !== this.loadSequence) return
      const mergeLikes = (
        comments: typeof result.comments
      ): typeof result.comments =>
        comments.map(comment => {
          const update = this.likeUpdates.get(comment.id)
          return {
            ...comment,
            like_count:
              update && update.revision > likeRevision
                ? Math.max(comment.like_count, update.count)
                : comment.like_count,
            children: comment.children
              ? mergeLikes(comment.children)
              : undefined,
          }
        })
      const received = mergeLikes(result.comments)
      const comments =
        page === 1 ? received : [...this.store.getComments(), ...received]
      this.store.setComments([
        ...new Map(comments.map(comment => [comment.id, comment])).values(),
      ])
      this.page = page
      this.total = result.total
      this.hasMore = result.pagination.has_more
    } catch (error) {
      if (!this.destroyed && sequence === this.loadSequence) {
        this.showMessage(`加载失败：${this.errorMessage(error)}`)
        this.retry = true
      }
    } finally {
      if (!this.destroyed && sequence === this.loadSequence)
        this.loadingPage = false
      this.busy(-1)
    }
  }

  private async handleSubmit(data: EditorData) {
    if (this.destroyed || this.submitting) return
    const nick = data.nick || 'Guest'
    if (!data.content) return this.showMessage('请先填写评论内容')
    if (data.email && !check.mail(data.email).k)
      return this.showMessage('您的邮箱格式不正确')
    if (data.website && !check.link(data.website).k)
      return this.showMessage('您的网址格式不正确')
    this.submitting = true
    this.editor.setSubmitting(true)
    this.busy(1)
    this.showMessage('')
    try {
      const target = this.store.getReplyTarget()
      await this.api.createComment({
        path: this.options.path,
        title: this.options.title,
        nick,
        email: data.email || undefined,
        website: data.website || undefined,
        content: data.content,
        parent_id: target?.id,
      })
      if (this.destroyed) return
      this.handleCancelReply()
      if (nick !== 'Guest')
        this.store.setUserInfo({
          nick,
          email: data.email,
          website: data.website,
        })
      this.editor.clear()
      await this.refresh()
    } catch (error) {
      if (!this.destroyed)
        this.showMessage(`提交失败：${this.errorMessage(error)}`)
    } finally {
      this.submitting = false
      this.busy(-1)
      if (!this.destroyed) this.editor.setSubmitting(false)
    }
  }

  private updateUI() {
    const active = this.container.ownerDocument.activeElement
    const focused =
      active instanceof HTMLElement && this.view.contains(active)
        ? active
        : null
    this.commentList.update(this.store.getComments())
    const target = this.store.getReplyTarget()
    if (target && !this.commentList.replySlot(target.id))
      this.handleCancelReply()
    else
      this.placeEditor(
        target ? this.commentList.replySlot(target.id)! : this.editorHome.value!
      )
    // Keyed list reordering can move an ancestor of the focused element.
    if (
      focused?.isConnected &&
      focused !== this.container.ownerDocument.activeElement
    )
      focused.focus({ preventScroll: true })
  }

  private placeEditor(slot: HTMLElement) {
    if (this.editorContainer.parentElement !== slot)
      slot.append(this.editorContainer)
  }

  private handleReply(id: string, nick: string) {
    if (this.submitting || this.destroyed) return
    const slot = this.commentList.replySlot(id)
    if (!slot) return
    this.store.setReplyTarget({ id, nick })
    this.placeEditor(slot)
    this.editor.setReply(nick)
    this.editor.focus()
  }

  private handleCancelReply() {
    this.store.setReplyTarget(null)
    this.placeEditor(this.editorHome.value!)
    this.editor.setReply(null)
  }

  private async handleLike(id: string) {
    if (this.destroyed || this.liking.has(id)) return
    this.liking.add(id)
    try {
      const result = await this.api.likeComment(id)
      if (this.destroyed) return
      this.likeUpdates.set(id, {
        revision: ++this.likeRevision,
        count: result.like_count,
      })
      this.store.setLikeCount(id, result.like_count)
      if (!result.success) this.showMessage('您已经点过赞了')
    } catch (error) {
      if (!this.destroyed)
        this.showMessage(`点赞失败：${this.errorMessage(error)}`)
    } finally {
      this.liking.delete(id)
    }
  }

  private renderShell() {
    if (this.destroyed) return
    render(
      html`
        <div ${ref(this.editorHome)} class="editor-home"></div>
        <div class="info">
          <div class="count">
            ${this.total === null ? '' : `评论(${this.total})`}
          </div>
        </div>
        <div class="hitalk-status" role="status" aria-live="polite">
          ${this.message}
        </div>
        <button
          type="button"
          class="vbtn hitalk-retry"
          ?hidden=${!this.retry}
          @click=${() => {
            void this.refresh()
          }}
        >
          重新加载
        </button>
        <div class="loading-container">
          <div class="vloading${this.pending ? '' : ' dn'}">
            <div class="spinner">
              <div class="r1"></div>
              <div class="r2"></div>
              <div class="r3"></div>
              <div class="r4"></div>
              <div class="r5"></div>
            </div>
          </div>
        </div>
        <div ${ref(this.listContainer)} class="comment-list-container"></div>
        <button
          type="button"
          class="vbtn hitalk-more"
          ?hidden=${!this.hasMore}
          ?disabled=${this.loadingPage || this.submitting}
          @click=${() => {
            if (!this.loadingPage && !this.submitting)
              void this.loadComments(this.page + 1)
          }}
        >
          加载更多
        </button>
      `,
      this.view
    )
  }

  private busy(delta: number) {
    this.pending = Math.max(0, this.pending + delta)
    this.renderShell()
  }

  private showMessage(message: string) {
    this.message = message
    this.renderShell()
  }
  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '请稍后重试'
  }

  /** Release requests, subscriptions and document listeners before SPA navigation/remount. */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.loadSequence++
    this.api.destroy()
    this.unsubscribe()
    this.editor.destroy()
    this.commentList.destroy()
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
