import type { HitalkOptions } from '@hitalk/shared'
import { HitalkAPI } from './api'
import { Store } from './store'
import { Editor, type EditorData } from './ui/Editor'
import { Loading } from './ui/Loading'
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
  private loading: Loading
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
    el.innerHTML = `<div class="editor-container"></div>
      <div class="info"><div class="count"></div></div>
      <div class="hitalk-status" role="status" aria-live="polite"></div>
      <button type="button" class="vbtn hitalk-retry" hidden>重新加载</button>
      <div class="loading-container"></div><div class="comment-list-container"></div>
      <button type="button" class="vbtn hitalk-more" hidden>加载更多</button>`
    this.editorContainer = el.querySelector<HTMLElement>('.editor-container')!
    this.editor = new Editor(
      this.editorContainer,
      this.store.getUserInfo(),
      this.options.placeholder,
      data => {
        void this.handleSubmit(data)
      },
      () => this.handleCancelReply()
    )
    this.loading = new Loading(
      el.querySelector<HTMLElement>('.loading-container')!
    )
    this.commentList = new CommentList(
      el.querySelector<HTMLElement>('.comment-list-container')!,
      this.options.avatar,
      (id, nick) => this.handleReply(id, nick),
      id => {
        void this.handleLike(id)
      }
    )
    this.unsubscribe = this.store.subscribe(() => this.updateUI())
    el.querySelector('.hitalk-retry')!.addEventListener('click', () => {
      void this.refresh()
    })
    el.querySelector('.hitalk-more')!.addEventListener('click', () => {
      if (!this.loadingPage && !this.submitting)
        void this.loadComments(this.page + 1)
    })
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
    this.busy(1)
    this.showMessage('')
    const more =
      this.container.querySelector<HTMLButtonElement>('.hitalk-more')!
    more.disabled = true
    this.container.querySelector<HTMLButtonElement>('.hitalk-retry')!.hidden =
      true
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
      this.container.querySelector('.count')!.textContent =
        `评论(${result.total})`
      more.hidden = !result.pagination.has_more
    } catch (error) {
      if (!this.destroyed && sequence === this.loadSequence) {
        this.showMessage(`加载失败：${this.errorMessage(error)}`)
        this.container.querySelector<HTMLButtonElement>(
          '.hitalk-retry'
        )!.hidden = false
      }
    } finally {
      this.busy(-1)
      if (!this.destroyed && sequence === this.loadSequence) {
        this.loadingPage = false
        more.disabled = false
      }
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

  /** Move the live editor outside the list before replacing list nodes, then restore it. */
  private updateUI() {
    const focused = this.editorContainer.contains(document.activeElement)
      ? (document.activeElement as HTMLElement)
      : null
    this.container.prepend(this.editorContainer)
    this.commentList.update(this.store.getComments())
    const target = this.store.getReplyTarget()
    if (target) {
      const section = this.findSection(target.id)
      if (section) section.append(this.editorContainer)
      else this.handleCancelReply()
    }
    focused?.focus({ preventScroll: true })
  }

  private findSection(id: string): HTMLElement | undefined {
    // Comment IDs need not be valid CSS identifiers.
    return (
      Array.from(this.container.querySelectorAll<HTMLElement>('.vcard'))
        .find(element => element.id === id)
        ?.querySelector<HTMLElement>(':scope > section') || undefined
    )
  }

  private handleReply(id: string, nick: string) {
    if (this.submitting || this.destroyed) return
    const section = this.findSection(id)
    if (!section) return
    this.store.setReplyTarget({ id, nick })
    section.append(this.editorContainer)
    const input =
      this.editorContainer.querySelector<HTMLTextAreaElement>('.veditor')!
    input.placeholder = `回复 @${nick}`
    input.focus()
    this.editorContainer.querySelector('.vcancel-reply')!.classList.remove('dn')
  }

  private handleCancelReply() {
    this.store.setReplyTarget(null)
    this.container.prepend(this.editorContainer)
    this.editorContainer.querySelector<HTMLTextAreaElement>(
      '.veditor'
    )!.placeholder = this.options.placeholder
    this.editorContainer.querySelector('.vcancel-reply')!.classList.add('dn')
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

  private busy(delta: number) {
    this.pending = Math.max(0, this.pending + delta)
    if (!this.destroyed) {
      if (this.pending) this.loading.show()
      else this.loading.hide()
    }
  }
  private showMessage(message: string) {
    const status = this.container.querySelector('.hitalk-status')
    if (status) status.textContent = message
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
    this.container.replaceChildren()
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
