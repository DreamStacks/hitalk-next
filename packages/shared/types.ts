/**
 * Hitalk v2 共享类型定义
 * 前后端共用的数据模型和 API 接口定义
 */

// ============ 数据模型 ============

/** Public response only. Database records and notification addresses stay on the server. */
export interface Comment {
  id: string
  parent_id: string | null
  nick: string
  website?: string
  avatar_hash: string
  content_html: string
  like_count: number
  is_pinned: boolean
  is_admin: boolean
  created_at: string
  updated_at: string
  // 前端渲染时添加
  children?: Comment[]
}

// ============ API 请求/响应类型 ============

// 创建评论请求
export interface CommentCreateRequest {
  path: string
  title?: string
  nick: string
  email?: string
  website?: string
  content: string
  parent_id?: string
}

// 评论列表响应
export interface CommentListResponse {
  comments: Comment[]
  total: number
  pagination: { page: number; page_size: number; has_more: boolean }
  page_info: {
    path: string
    title?: string
    comment_count: number
  }
}

// 评论数批量查询响应
export interface CommentCountResponse {
  [path: string]: number
}

// 点赞请求响应
export interface LikeResponse {
  success: boolean
  like_count: number
}

// 错误响应
export interface ErrorResponse {
  error: string
  message: string
}

// 成功响应 (通用)
export interface SuccessResponse {
  success: boolean
  message?: string
}

// ============ SDK 配置类型 ============

export interface HitalkOptions {
  server: string // API 服务器 URL
  path?: string // 页面路径,默认 location.pathname
  title?: string // 页面标题
  placeholder?: string // 编辑器占位文本
  avatar?: 'mm' | 'identicon' | 'monsterid' | 'wavatar' | 'retro' | 'hide'
  pageSize?: number // 每页根评论数，默认 10，最大 50；回复随根评论返回
}

// ============ 工具类型 ============

export interface UserInfo {
  nick: string
  email: string
  website: string
}
