/** The single public API contract. Internal records never cross this boundary. */
export type ModerationStatus = 'published' | 'pending' | 'hidden' | 'spam'
export interface Comment {
  sequence: number
  id: string
  root_id: string | null
  reply_to: { id: string; nick: string; available: boolean } | null
  nick: string
  website?: string
  avatar_hash: string
  content_html: string
  deleted: boolean
  status: ModerationStatus
  like_count: number
  liked: boolean
  can_delete: boolean
  can_reply: boolean
  is_pinned: boolean
  is_admin: boolean
  created_at: string
  updated_at: string
  client?: { browser?: string; os?: string }
  replies?: Comment[]
  reply_count?: number
  reply_cursor?: string | null
}
export interface CommentCreateRequest {
  path: string
  title?: string
  nick: string
  email?: string
  website?: string
  content: string
  reply_to_id?: string
  client_request_id: string
  notify?: boolean
}
export interface CommentListResponse {
  comments: Comment[]
  pinned: Comment[]
  total: number
  next_cursor: string | null
  comments_enabled: boolean
}
export interface ReplyListResponse {
  comments: Comment[]
  next_cursor: string | null
}
export interface CommentContextResponse {
  root: Comment
  target_id: string
}
export interface CommentCountResponse {
  [path: string]: number
}
export interface LikeResponse {
  liked: boolean
  like_count: number
}
export interface ErrorResponse {
  code: string
  message: string
  request_id: string
}
export type GuestField = 'nick' | 'email' | 'website'
export interface HitalkOptions {
  server: string
  path?: string
  title?: string
  placeholder?: string
  avatar?: 'mm' | 'identicon' | 'monsterid' | 'wavatar' | 'retro' | 'hide'
  pageSize?: number
  guestFields?: readonly GuestField[]
}
export interface UserInfo {
  nick: string
  email: string
  website: string
}
