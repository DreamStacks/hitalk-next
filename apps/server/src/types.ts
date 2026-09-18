import type { ModerationStatus } from '@hitalk/shared'
export interface Bindings {
  DB: D1Database
  ADMIN_TOKEN?: string
  IP_HASH_SALT?: string
  EMAIL_ENABLED?: string
  RESEND_API_KEY?: string
  ADMIN_EMAIL?: string
  EMAIL_NAME?: string
  EMAIL_FROM?: string
  SITE_URL?: string
  NOTIFICATION_API_URL?: string
  COMMENTS_ENABLED?: string
  MODERATION_MODE?: string
  RATE_LIMIT_ENABLED?: string
  WRITE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>
  }
}
export interface Identity {
  id: string
  status: 'active' | 'blocked'
  kind: 'visitor' | 'admin'
}
export interface Page {
  id: number
  path: string
  title: string | null
  comments_enabled: number
}
export interface CommentRow {
  seq: number
  id: string
  page_id: number
  author_id: string
  root_id: string | null
  reply_to_id: string | null
  client_request_id: string
  request_hash: string
  nick: string
  email: string | null
  website: string | null
  content_md: string | null
  ua: string | null
  notify: number
  moderation_status: ModerationStatus
  deleted_at: string | null
  is_pinned: number
  first_published_at: string | null
  created_at: string
  updated_at: string
}
