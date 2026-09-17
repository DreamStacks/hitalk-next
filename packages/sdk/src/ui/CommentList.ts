import { nothing, render } from 'lit-html'
import type { Comment } from '@hitalk/shared'
import { renderCommentList, type CommentActions } from '../renderer/comment'

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

  destroy() {
    render(nothing, this.container).setConnected(false)
  }
}
