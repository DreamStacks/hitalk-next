import type {
  Comment,
  CommentCreateRequest,
  CommentListResponse,
  LikeResponse,
  CommentCountResponse,
} from '@hitalk/shared'

export class HitalkAPI {
  private baseURL: string
  private controllers = new Set<AbortController>()
  private destroyed = false

  constructor(serverURL: string) {
    this.baseURL = serverURL.replace(/\/+$/, '')
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (this.destroyed) throw new Error('Hitalk instance has been destroyed')
    const controller = new AbortController()
    this.controllers.add(controller)
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(this.baseURL + path, {
        ...init,
        signal: controller.signal,
      })
      let body
      try {
        body = await response.json()
      } catch {
        throw new Error(`服务器返回了无效响应 (${response.status})`)
      }
      if (!response.ok)
        throw new Error(
          typeof body?.message === 'string'
            ? body.message
            : `请求失败 (${response.status})`
        )
      return body as T
    } finally {
      clearTimeout(timeout)
      this.controllers.delete(controller)
    }
  }

  fetchComments(
    path: string,
    page = 1,
    pageSize = 10
  ): Promise<CommentListResponse> {
    return this.request(
      `/comments?path=${encodeURIComponent(path)}&page=${page}&pageSize=${pageSize}`
    )
  }
  createComment(data: CommentCreateRequest): Promise<Comment> {
    return this.request('/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  }
  likeComment(id: string): Promise<LikeResponse> {
    return this.request(`/comments/${encodeURIComponent(id)}/like`, {
      method: 'POST',
    })
  }
  getCommentCounts(paths: string[]): Promise<CommentCountResponse> {
    return this.request(
      `/comments/count?${paths.map(path => `paths[]=${encodeURIComponent(path)}`).join('&')}`
    )
  }
  destroy() {
    this.destroyed = true
    this.controllers.forEach(controller => controller.abort())
    this.controllers.clear()
  }
}
