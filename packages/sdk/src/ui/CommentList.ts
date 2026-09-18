import { nothing, render } from 'lit-html'
import type { Comment } from '@hitalk/shared'
import { renderCommentList, type CommentActions } from '../renderer/comment'
import { likeMotion } from './motion'

export class CommentList {
  private measured = new WeakMap<HTMLElement, string>()

  constructor(
    private container: HTMLElement,
    private avatarType: string,
    private actions: CommentActions
  ) {}

  update(comments: Comment[]) {
    render(
      renderCommentList(comments, this.avatarType, this.actions),
      this.container
    )
    // Likes and ordering changes preserve a reader's expanded comment.
    for (const content of this.container.querySelectorAll<HTMLElement>(
      '.vcontent'
    )) {
      const markup = content.innerHTML
      if (this.measured.get(content) === markup) continue
      content.classList.remove('expand')
      if (content.offsetHeight > 180) content.classList.add('expand')
      this.measured.set(content, markup)
    }
  }

  replySlot(id: string): HTMLElement | undefined {
    return (
      Array.from(this.container.querySelectorAll<HTMLElement>('.vcard'))
        .find(element => element.id === id)
        ?.querySelector<HTMLElement>(':scope > section > .hitalk-reply-slot') ||
      undefined
    )
  }

  locate(id: string) {
    // Scope to this instance: the same article can be mounted more than once on a host page.
    const target = Array.from(
      this.container.querySelectorAll<HTMLElement>('.vcard')
    ).find(element => element.id === id)
    if (!target) return
    target
      .querySelector(':scope > section > .vcontent')
      ?.classList.remove('expand')
    target.focus({ preventScroll: true })
    target.scrollIntoView({ block: 'center', behavior: 'instant' })
  }

  celebrateLike(id: string) {
    const card = Array.from(this.container.querySelectorAll('.vcard')).find(
      element => element.id === id
    )
    likeMotion(
      card?.querySelector(':scope > section > .vmeta > .vlike') || null
    )
  }

  destroy() {
    render(nothing, this.container).setConnected(false)
  }
}
