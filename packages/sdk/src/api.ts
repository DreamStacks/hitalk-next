/**
 * API 封装层
 */

import type {
  Comment,
  CommentCreateRequest,
  CommentListResponse,
  LikeResponse,
  CommentCountResponse,
  ErrorResponse,
} from '@hitalk/shared'

export class HitalkAPI {
  private baseURL: string

  constructor(serverURL: string) {
    this.baseURL = serverURL
  }

  /**
   * 获取评论列表
   */
  async fetchComments(path: string): Promise<CommentListResponse> {
    const response = await fetch(
      `${this.baseURL}/comments?path=${encodeURIComponent(path)}`
    )

    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse
      throw new Error(error.message || '获取评论失败')
    }

    return response.json()
  }

  /**
   * 创建评论
   */
  async createComment(data: CommentCreateRequest): Promise<Comment> {
    const response = await fetch(`${this.baseURL}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse
      throw new Error(error.message || '创建评论失败')
    }

    return response.json()
  }

  /**
   * 点赞评论
   */
  async likeComment(id: string): Promise<LikeResponse> {
    const response = await fetch(`${this.baseURL}/comments/${id}/like`, {
      method: 'POST',
    })

    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse
      throw new Error(error.message || '点赞失败')
    }

    return response.json()
  }

  /**
   * 批量获取评论数
   */
  async getCommentCounts(paths: string[]): Promise<CommentCountResponse> {
    const query = paths.map(p => `paths[]=${encodeURIComponent(p)}`).join('&')
    const response = await fetch(`${this.baseURL}/comments/count?${query}`)

    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse
      throw new Error(error.message || '获取评论数失败')
    }

    return response.json()
  }
}
