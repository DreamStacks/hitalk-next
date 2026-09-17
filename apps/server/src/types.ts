export interface Bindings {
  DB: D1Database
  ADMIN_TOKEN?: string
  IP_HASH_SALT?: string
  RESEND_API_KEY?: string
  ADMIN_EMAIL?: string
  EMAIL_NAME?: string
  EMAIL_FROM?: string
  SITE_URL?: string
}

export interface Page {
  id: number
  path: string
  title: string | null
  comment_count: number
  created_at: string
  updated_at: string
}

/** Raw SQLite values. Never return this type from a public route. */
export interface CommentRow {
  id: string
  page_id: number
  parent_id: string | null
  nick: string
  email: string | null
  website: string | null
  content_md: string
  ua: string | null
  like_count: number
  is_pinned: number
  is_admin: number
  created_at: string
  updated_at: string
}

export interface PluginContext {
  env: Bindings
  db: D1Database
}
export interface HitalkPlugin {
  name: string
  version?: string
  onCommentCreated?: (
    ctx: PluginContext,
    comment: CommentRow,
    page: Page,
    parent?: CommentRow
  ) => Promise<void> | void
}
