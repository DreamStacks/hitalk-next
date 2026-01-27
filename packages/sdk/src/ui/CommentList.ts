/**
 * CommentList 评论列表组件
 */

import type { Comment } from '@hitalk/shared'
import { renderCommentList } from '../renderer/comment'
import { bindCommentEvents } from '../renderer/comment-events'

export class CommentList {
  private container: HTMLElement
  private avatarType: string
  private onReply: (id: string, nick: string) => void
  private onLike: (id: string) => void

  constructor(
    container: HTMLElement,
    avatarType: string,
    onReply: (id: string, nick: string) => void,
    onLike: (id: string) => void
  ) {
    this.container = container
    this.avatarType = avatarType
    this.onReply = onReply
    this.onLike = onLike
  }

  render(comments: Comment[]) {
    this.container.innerHTML = renderCommentList(
      comments,
      this.avatarType,
      this.onReply,
      this.onLike
    )

    // 绑定事件
    bindCommentEvents(this.container, this.onReply, this.onLike)
  }

  update(comments: Comment[]) {
    this.render(comments)
  }
}
