import type { Comment, CommentCreateRequest } from '@hitalk/shared'
import type { CommentRow, Page } from '../types'
import { avatarHash } from './avatar'
import { renderMarkdown } from './markdown'
import { clientInfo, MAX_UA_LENGTH } from './user-agent'

function timestamp(value: string): string {
  return value.includes('T') ? value : value.replace(' ', 'T') + 'Z'
}

/** Explicit allowlist: adding a database column must never change the public API. */
export function publicComment(row: CommentRow): Comment {
  let website: string | undefined
  try {
    const url = new URL(row.website || '')
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      website = url.href
  } catch {
    /* Keep public URLs limited to web links. */
  }
  return {
    id: row.id,
    parent_id: row.parent_id,
    nick: row.nick,
    website,
    avatar_hash: avatarHash(row.email || row.nick),
    // Markdown is the only persisted content; rendering always uses current safety rules.
    content_html: renderMarkdown(row.content_md),
    like_count: row.like_count,
    is_pinned: Boolean(row.is_pinned),
    is_admin: Boolean(row.is_admin),
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
    client: clientInfo(row.ua),
  }
}

export function getPage(db: D1Database, path: string): Promise<Page | null> {
  return db
    .prepare('SELECT * FROM pages WHERE path = ?')
    .bind(path)
    .first<Page>()
}

export async function getOrCreatePage(
  db: D1Database,
  path: string,
  title?: string
): Promise<Page> {
  const page = await db
    .prepare(`INSERT INTO pages (path, title) VALUES (?, ?)
    ON CONFLICT(path) DO UPDATE SET title = COALESCE(pages.title, excluded.title)
    RETURNING *`)
    .bind(path, title || null)
    .first<Page>()
  if (!page) throw new Error('Page creation failed')
  return page
}

export async function createComment(
  db: D1Database,
  pageId: number,
  input: CommentCreateRequest,
  isAdmin: boolean,
  userAgent?: string
): Promise<CommentRow> {
  const row = await db
    .prepare(`INSERT INTO comments (
    id, page_id, parent_id, nick, email, website, content_md, is_admin, ua
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
    .bind(
      crypto.randomUUID(),
      pageId,
      input.parent_id || null,
      input.nick,
      input.email || null,
      input.website || null,
      input.content,
      isAdmin ? 1 : 0,
      userAgent?.trim().slice(0, MAX_UA_LENGTH) || null
    )
    .first<CommentRow>()
  if (!row) throw new Error('Comment creation failed')
  return row
}

export function getCommentById(
  db: D1Database,
  id: string
): Promise<CommentRow | null> {
  return db
    .prepare('SELECT * FROM comments WHERE id = ?')
    .bind(id)
    .first<CommentRow>()
}

/** Page by roots, returning each selected root's complete reply tree. */
export async function getComments(
  db: D1Database,
  pageId: number,
  limit: number,
  offset: number
): Promise<Comment[]> {
  const result = await db
    .prepare(`WITH RECURSIVE roots AS (
    SELECT * FROM comments WHERE page_id = ? AND parent_id IS NULL
    ORDER BY is_pinned DESC, created_at DESC, id DESC LIMIT ? OFFSET ?
  ), thread AS (
    SELECT * FROM roots
    UNION ALL
    SELECT c.* FROM comments c JOIN thread t ON c.parent_id = t.id WHERE c.page_id = ?
  ) SELECT * FROM thread ORDER BY is_pinned DESC, created_at DESC, id DESC`)
    .bind(pageId, limit, offset, pageId)
    .all<CommentRow>()
  return buildCommentTree(result.results.map(publicComment))
}

export async function rootCount(
  db: D1Database,
  pageId: number
): Promise<number> {
  const row = await db
    .prepare(
      'SELECT COUNT(*) AS total FROM comments WHERE page_id = ? AND parent_id IS NULL'
    )
    .bind(pageId)
    .first<{ total: number }>()
  return row?.total || 0
}

export async function getAllComments(db: D1Database, limit = 50, offset = 0) {
  const result = await db
    .prepare(`SELECT c.*, p.path AS page_path FROM comments c
    JOIN pages p ON c.page_id = p.id ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`)
    .bind(limit, offset)
    .all<CommentRow & { page_path: string }>()
  return result.results.map(row => ({
    ...row,
    created_at: timestamp(row.created_at),
  }))
}

export function buildCommentTree(comments: Comment[]): Comment[] {
  const map = new Map(
    comments.map(comment => [
      comment.id,
      { ...comment, children: [] as Comment[] },
    ])
  )
  const roots: Comment[] = []
  for (const comment of comments) {
    const node = map.get(comment.id)!
    let parent = node
    const seen = new Set([node.id])
    while (parent.parent_id) {
      const next = map.get(parent.parent_id)
      if (!next || seen.has(next.id)) break
      seen.add(next.id)
      parent = next
    }
    if (parent !== node && !parent.parent_id) parent.children.push(node)
    else roots.push(node)
  }
  for (const root of roots) {
    root.children?.sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
    )
  }
  return roots
}

export async function likeComment(
  db: D1Database,
  commentId: string,
  ipHash: string
) {
  // Unique constraint makes repeated/concurrent likes idempotent; the trigger owns the count.
  const results = await db.batch([
    db
      .prepare(`INSERT INTO comment_likes (comment_id, ip_hash)
      SELECT id, ? FROM comments WHERE id = ? ON CONFLICT(comment_id, ip_hash) DO NOTHING`)
      .bind(ipHash, commentId),
    db.prepare('SELECT like_count FROM comments WHERE id = ?').bind(commentId),
  ])
  const comment = results[1].results[0] as { like_count: number } | undefined
  return comment
    ? { success: results[0].meta.changes > 0, like_count: comment.like_count }
    : null
}

export async function getCommentCounts(
  db: D1Database,
  paths: string[]
): Promise<Record<string, number>> {
  const rows = await db
    .prepare(
      `SELECT path, comment_count FROM pages WHERE path IN (${paths.map(() => '?').join(',')})`
    )
    .bind(...paths)
    .all<{ path: string; comment_count: number }>()
  return Object.fromEntries(
    paths.map(path => [
      path,
      rows.results.find(row => row.path === path)?.comment_count || 0,
    ])
  )
}

export async function deleteComment(
  db: D1Database,
  id: string
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM comments WHERE id = ?')
    .bind(id)
    .run()
  return result.meta.changes > 0
}

export async function pinComment(
  db: D1Database,
  id: string,
  pinned: boolean
): Promise<boolean> {
  const result = await db
    .prepare(
      'UPDATE comments SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    )
    .bind(pinned ? 1 : 0, id)
    .run()
  return result.meta.changes > 0
}

export async function hashIP(ip: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(salt),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const hash = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(ip)
  )
  return Array.from(new Uint8Array(hash), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}
