import type { Comment, UserInfo } from '@hitalk/shared'

/** Only comment changes notify list subscribers. Editor identity/reply state does not redraw the list. */
export class Store {
  private comments: Comment[] = []
  private userInfo: UserInfo | null = null
  private replyTarget: { id: string; nick: string } | null = null
  private listeners = new Set<() => void>()

  constructor() {
    try {
      const cached: unknown = JSON.parse(
        localStorage.getItem('HitalkCache') || 'null'
      )
      if (
        cached &&
        typeof cached === 'object' &&
        'nick' in cached &&
        'email' in cached &&
        'website' in cached &&
        typeof cached.nick === 'string' &&
        typeof cached.email === 'string' &&
        typeof cached.website === 'string'
      ) {
        this.userInfo = {
          nick: cached.nick,
          email: cached.email,
          website: cached.website,
        }
      }
    } catch {
      /* Storage may be unavailable in an embedded/private context. */
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setComments(comments: Comment[]) {
    this.comments = comments
    this.listeners.forEach(listener => listener())
  }

  getComments(): Comment[] {
    return this.comments
  }

  setLikeCount(id: string, count: number) {
    const update = (comments: Comment[]): Comment[] =>
      comments.map(comment => ({
        ...comment,
        like_count: comment.id === id ? count : comment.like_count,
        children: comment.children ? update(comment.children) : undefined,
      }))
    this.setComments(update(this.comments))
  }

  setUserInfo(info: UserInfo) {
    this.userInfo = info
    try {
      localStorage.setItem('HitalkCache', JSON.stringify(info))
    } catch {
      /* Optional cache. */
    }
  }
  getUserInfo(): UserInfo | null {
    return this.userInfo
  }
  setReplyTarget(target: { id: string; nick: string } | null) {
    this.replyTarget = target
  }
  getReplyTarget() {
    return this.replyTarget
  }
}
