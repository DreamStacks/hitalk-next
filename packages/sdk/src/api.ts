import type {
  Comment,
  CommentCreateRequest,
  CommentListResponse,
  ReplyListResponse,
  CommentContextResponse,
  LikeResponse,
  CommentCountResponse,
} from '@hitalk/shared'
import { VisitorIdentity } from './identity'
export class APIError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public retryAfter: number | null = null
  ) {
    super(message)
  }
}
export class HitalkAPI {
  readonly baseURL: string
  readonly identity: VisitorIdentity
  private controllers = new Set<AbortController>()
  private destroyed = false
  constructor(server: string) {
    if (!server) throw new Error('Hitalk: 缺少 server 配置')
    const url = new URL(server, globalThis.location?.href)
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Hitalk: API 地址无效')
    if (
      url.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      throw new Error('Hitalk: API 必须使用 HTTPS')
    this.baseURL = url.href.replace(/\/+$/, '')
    this.identity = new VisitorIdentity(this.baseURL)
  }
  private async request<T>(
    path: string,
    init: RequestInit = {},
    write = false
  ): Promise<T> {
    if (this.destroyed) throw new Error('Hitalk instance has been destroyed')
    let token = this.identity.read()
    if (write) {
      try {
        token = await this.identity.ensure()
      } catch (error) {
        throw new APIError(
          error instanceof Error ? error.message : '无法保存匿名身份',
          'IDENTITY_STORAGE',
          0
        )
      }
    }
    if (this.destroyed) throw new Error('Hitalk instance has been destroyed')
    const controller = new AbortController()
    this.controllers.add(controller)
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const headers = new Headers(init.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      const response = await fetch(this.baseURL + path, {
        ...init,
        signal: controller.signal,
        headers,
      })
      let body
      try {
        body = await response.json()
      } catch {
        throw new APIError(
          `服务器响应无效 (${response.status})`,
          'INVALID_RESPONSE',
          response.status
        )
      }
      if (!response.ok)
        throw new APIError(
          typeof body.message === 'string' ? body.message : '请求失败',
          typeof body.code === 'string' ? body.code : 'REQUEST_FAILED',
          response.status,
          response.headers.has('Retry-After')
            ? Number(response.headers.get('Retry-After'))
            : null
        )
      return body as T
    } finally {
      clearTimeout(timeout)
      this.controllers.delete(controller)
    }
  }
  fetchComments(
    path: string,
    cursor: string | null = null,
    limit = 10
  ): Promise<CommentListResponse> {
    return this.request(
      `/comments?path=${encodeURIComponent(path)}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    )
  }
  fetchReplies(root: string, cursor: string): Promise<ReplyListResponse> {
    return this.request(
      `/threads/${encodeURIComponent(root)}/replies?cursor=${encodeURIComponent(cursor)}`
    )
  }
  pendingComments(
    path: string
  ): Promise<{ comments: Comment[]; next: number | null }> {
    return this.request(
      `/me/comments?path=${encodeURIComponent(path)}&status=pending`
    )
  }
  context(id: string): Promise<CommentContextResponse> {
    return this.request(`/comments/${encodeURIComponent(id)}/context`)
  }
  createComment(data: CommentCreateRequest): Promise<Comment> {
    return this.request(
      '/comments',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      true
    )
  }
  likeComment(id: string, liked: boolean): Promise<LikeResponse> {
    return this.request(
      `/comments/${encodeURIComponent(id)}/like`,
      { method: liked ? 'PUT' : 'DELETE' },
      true
    )
  }
  deleteComment(id: string): Promise<{ success: true }> {
    return this.request(
      `/comments/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      true
    )
  }
  getCommentCounts(paths: string[]): Promise<CommentCountResponse> {
    return this.request(
      `/comments/count?${paths.map(p => `paths[]=${encodeURIComponent(p)}`).join('&')}`
    )
  }
  destroy() {
    this.destroyed = true
    this.controllers.forEach(c => c.abort())
    this.controllers.clear()
  }
}
