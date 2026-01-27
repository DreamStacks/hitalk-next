/**
 * 数据库操作封装
 */

import { nanoid } from 'nanoid'
import type { Comment, Page } from '@hitalk/shared'

interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>
  exec(query: string): Promise<D1ExecResult>
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  run(): Promise<D1Response>
  all<T = unknown>(): Promise<D1Result<T>>
}

interface D1Response {
  success: boolean
  meta: Record<string, unknown>
}

interface D1Result<T = unknown> {
  results: T[]
  success: boolean
  meta: Record<string, unknown>
}

interface D1ExecResult {
  count: number
  duration: number
}

/**
 * 格式化 SQLite 时间字符串为 ISO 8601 UTC
 */
function formatTimestamp(ts: string): string {
  if (!ts) return ts
  return ts.replace(' ', 'T') + 'Z'
}

/**
 * 获取或创建 Page
 */
export async function getOrCreatePage(
  db: D1Database,
  path: string,
  title?: string
): Promise<Page> {
  // 先查询是否存在
  const existing = await db
    .prepare('SELECT * FROM pages WHERE path = ?')
    .bind(path)
    .first<Page>()

  if (existing) {
    // 格式化时间
    existing.created_at = formatTimestamp(existing.created_at)
    existing.updated_at = formatTimestamp(existing.updated_at)

    // 更新 title (如果提供)
    if (title && title !== existing.title) {
      await db
        .prepare(
          'UPDATE pages SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        )
        .bind(title, existing.id)
        .run()
      existing.title = title
    }
    return existing
  }

  // 创建新 page
  const result = await db
    .prepare('INSERT INTO pages (path, title) VALUES (?, ?) RETURNING *')
    .bind(path, title || null)
    .first<Page>()

  if (result) {
    result.created_at = formatTimestamp(result.created_at)
    result.updated_at = formatTimestamp(result.updated_at)
  }

  return result!
}

/**
 * 创建评论
 */
export async function createComment(
  db: D1Database,
  data: {
    page_id: number
    parent_id?: string
    nick: string
    email?: string
    website?: string
    content_md: string
    content_html: string
    ua?: string
    ip_hash?: string
    is_admin?: boolean
  }
): Promise<Comment> {
  const id = nanoid()

  const comment = await db
    .prepare(
      `INSERT INTO comments (
        id, page_id, parent_id, nick, email, website,
        content_md, content_html, ua, ip_hash, is_admin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *`
    )
    .bind(
      id,
      data.page_id,
      data.parent_id || null,
      data.nick,
      data.email || null,
      data.website || null,
      data.content_md,
      data.content_html,
      data.ua || null,
      data.ip_hash || null,
      data.is_admin ? 1 : 0
    )
    .first<Comment>()

  // 更新 page 的评论计数
  await db
    .prepare(
      'UPDATE pages SET comment_count = comment_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    )
    .bind(data.page_id)
    .run()

  if (comment) {
    comment.created_at = formatTimestamp(comment.created_at)
    comment.updated_at = formatTimestamp(comment.updated_at)
  }

  return comment!
}

/**
 * 获取评论列表(按页面)
 */
export async function getComments(
  db: D1Database,
  page_id: number
): Promise<Comment[]> {
  const result = await db
    .prepare(
      'SELECT * FROM comments WHERE page_id = ? ORDER BY created_at DESC'
    )
    .bind(page_id)
    .all<Comment>()

  return result.results.map(c => ({
    ...c,
    created_at: formatTimestamp(c.created_at),
    updated_at: formatTimestamp(c.updated_at),
  }))
}

/**
 * 构建评论 tree
 */
export function buildCommentTree(comments: Comment[]): Comment[] {
  const commentMap = new Map<string, Comment>()
  const rootComments: Comment[] = []

  // 初始化
  comments.forEach(comment => {
    commentMap.set(comment.id, { ...comment, children: [] })
  })

  // 构建
  comments.forEach(comment => {
    const node = commentMap.get(comment.id)!

    if (comment.parent_id) {
      const parent = commentMap.get(comment.parent_id)
      if (parent) {
        parent.children = parent.children || []
        parent.children.push(node)
      } else {
        rootComments.push(node)
      }
    } else {
      rootComments.push(node)
    }
  })

  return rootComments
}

/**
 * 点赞
 */
export async function likeComment(
  db: D1Database,
  comment_id: string,
  ip_hash: string
): Promise<{ success: boolean; like_count: number }> {
  try {
    const existing = await db
      .prepare(
        'SELECT * FROM comment_likes WHERE comment_id = ? AND ip_hash = ?'
      )
      .bind(comment_id, ip_hash)
      .first()

    if (existing) {
      const comment = await db
        .prepare('SELECT like_count FROM comments WHERE id = ?')
        .bind(comment_id)
        .first<{ like_count: number }>()

      return {
        success: false,
        like_count: comment?.like_count || 0,
      }
    }

    await db
      .prepare('INSERT INTO comment_likes (comment_id, ip_hash) VALUES (?, ?)')
      .bind(comment_id, ip_hash)
      .run()

    await db
      .prepare('UPDATE comments SET like_count = like_count + 1 WHERE id = ?')
      .bind(comment_id)
      .run()

    const comment = await db
      .prepare('SELECT like_count FROM comments WHERE id = ?')
      .bind(comment_id)
      .first<{ like_count: number }>()

    return {
      success: true,
      like_count: comment?.like_count || 0,
    }
  } catch (_error) {
    throw new Error('点赞失败')
  }
}

/**
 * 批量获取评论数
 */
export async function getCommentCounts(
  db: D1Database,
  paths: string[]
): Promise<Record<string, number>> {
  const placeholders = paths.map(() => '?').join(',')
  const result = await db
    .prepare(
      `SELECT path, comment_count FROM pages WHERE path IN (${placeholders})`
    )
    .bind(...paths)
    .all<{ path: string; comment_count: number }>()

  const counts: Record<string, number> = {}
  paths.forEach(path => {
    counts[path] = 0
  })

  result.results.forEach(row => {
    counts[row.path] = row.comment_count
  })

  return counts
}

/**
 * 生成 IP Hash
 */
export function hashIP(ip: string): string {
  let hash = 0
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}
