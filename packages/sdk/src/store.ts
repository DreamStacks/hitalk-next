import type { Comment, UserInfo } from '@hitalk/shared'
export class Store {
  private comments: Comment[] = []
  private userInfo: UserInfo | null = null
  private replyTarget: { id: string; nick: string } | null = null
  private listeners = new Set<() => void>()
  constructor(private key: string) {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) || 'null')
      if (
        value &&
        typeof value === 'object' &&
        'nick' in value &&
        typeof value.nick === 'string' &&
        'email' in value &&
        typeof value.email === 'string' &&
        'website' in value &&
        typeof value.website === 'string'
      )
        this.userInfo = {
          nick: value.nick,
          email: value.email,
          website: value.website,
        }
    } catch {
      /* optional profile cache */
    }
  }
  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  setComments(comments: Comment[]) {
    this.comments = comments
      .map(c => ({
        ...c,
        replies: c.replies
          ? [...c.replies].sort((a, b) => a.sequence - b.sequence)
          : undefined,
      }))
      .sort(
        (a, b) =>
          Number(b.is_pinned) - Number(a.is_pinned) || b.sequence - a.sequence
      )
    this.listeners.forEach(fn => fn())
  }
  getComments() {
    return this.comments
  }
  find(id: string) {
    return this.comments
      .flatMap(c => [c, ...(c.replies || [])])
      .find(c => c.id === id)
  }
  patch(id: string, patch: Partial<Comment>) {
    this.setComments(
      this.comments.map(c =>
        c.id === id
          ? { ...c, ...patch }
          : {
              ...c,
              replies: c.replies?.map(r =>
                r.id === id ? { ...r, ...patch } : r
              ),
            }
      )
    )
  }
  markDeleted(id: string) {
    const old = this.find(id)
    const erase = (c: Comment): Comment => ({
      ...c,
      ...(c.id === id
        ? {
            deleted: true,
            nick: '评论已删除',
            content_html: '',
            website: undefined,
            avatar_hash: '',
            client: undefined,
            can_delete: false,
            can_reply: false,
            liked: false,
            like_count: 0,
            is_pinned: false,
          }
        : {}),
      ...(c.reply_to?.id === id
        ? { reply_to: { id, nick: '评论不可用', available: false } }
        : {}),
    })
    this.setComments(
      this.comments
        .map(root => {
          const result = { ...erase(root), replies: root.replies?.map(erase) }
          if (
            old?.root_id === root.id &&
            !old.deleted &&
            old.status === 'published'
          )
            result.reply_count = Math.max(0, (root.reply_count || 0) - 1)
          return result
        })
        .filter(
          root =>
            !root.deleted ||
            (root.reply_count || 0) > 0 ||
            root.replies?.some(c => !c.deleted && c.status === 'published')
        )
    )
  }
  upsert(comment: Comment) {
    if (!comment.root_id) {
      const exists = this.comments.some(c => c.id === comment.id)
      this.setComments(
        exists
          ? this.comments.map(c =>
              c.id === comment.id ? { ...c, ...comment } : c
            )
          : [comment, ...this.comments]
      )
      return
    }
    this.setComments(
      this.comments.map(c =>
        c.id === comment.root_id
          ? {
              ...c,
              replies: [
                ...new Map(
                  [...(c.replies || []), comment].map(r => [r.id, r])
                ).values(),
              ],
            }
          : c
      )
    )
  }
  setUserInfo(info: UserInfo) {
    this.userInfo = info
    try {
      localStorage.setItem(this.key, JSON.stringify(info))
    } catch {
      /* optional */
    }
  }
  getUserInfo() {
    return this.userInfo
  }
  setReplyTarget(value: { id: string; nick: string } | null) {
    this.replyTarget = value
  }
  getReplyTarget() {
    return this.replyTarget
  }
}
