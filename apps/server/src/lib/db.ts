/**
 * 数据库操作封装
 */

import { nanoid } from 'nanoid'
import type { Comment, Page } from '@hitalk/shared'

// D1 types are provided by @cloudflare/workers-types
// No need to redefine them here

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
 * 根据 ID 获取单条评论
 */
export async function getCommentById(
  db: D1Database,
  id: string
): Promise<Comment | null> {
  const comment = await db
    .prepare('SELECT * FROM comments WHERE id = ?')
    .bind(id)
    .first<Comment>()

  if (comment) {
    comment.created_at = formatTimestamp(comment.created_at)
    comment.updated_at = formatTimestamp(comment.updated_at)
  }

  return comment
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
      'SELECT * FROM comments WHERE page_id = ? ORDER BY is_pinned DESC, created_at DESC'
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
 * 获取所有评论(管理员用)
 */
export async function getAllComments(
  db: D1Database,
  limit: number = 50,
  offset: number = 0
): Promise<Comment[]> {
  const result = await db
    .prepare(
      `SELECT c.*, p.path as page_path
       FROM comments c
       JOIN pages p ON c.page_id = p.id
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(limit, offset)
    .all<Comment & { page_path: string }>()

  return result.results.map(c => ({
    ...c,
    created_at: formatTimestamp(c.created_at),
    updated_at: formatTimestamp(c.updated_at),
  }))
}

/**
 * 构建评论 tree (两级扁平化结构)
 * 所有深层嵌套的回复都会被平铺在根评论的 children 中
 */
export function buildCommentTree(comments: Comment[]): Comment[] {
  const commentMap = new Map<string, Comment>()
  const rootComments: Comment[] = []

  // 1. 初始化所有评论，并按 ID 索引
  comments.forEach(comment => {
    commentMap.set(comment.id, { ...comment, children: [] })
  })

  // 2. 第一遍：找根评论
  comments.forEach(comment => {
    if (!comment.parent_id) {
      rootComments.push(commentMap.get(comment.id)!)
    }
  })

  // 3. 第二遍：将所有回复分配给其所属的根评论
  comments.forEach(comment => {
    if (comment.parent_id) {
      // 溯源：找到这笔评论所属的根评论
      let currentParentId = comment.parent_id
      let root: Comment | undefined

      while (currentParentId) {
        const parent = commentMap.get(currentParentId)
        if (!parent) break
        if (!parent.parent_id) {
          root = parent
          break
        }
        currentParentId = parent.parent_id
      }

      if (root) {
        root.children = root.children || []
        root.children.push(commentMap.get(comment.id)!)
      } else {
        // 如果找不到根(理论上不应该发生)，则作为根评论
        rootComments.push(commentMap.get(comment.id)!)
      }
    }
  })

  // 4. 对 children 按时间升序排序(回复通常按时间正序排列)
  rootComments.forEach(root => {
    if (root.children) {
      root.children.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
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
  } catch {
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
 * 删除评论
 */
export async function deleteComment(
  db: D1Database,
  id: string
): Promise<{ success: boolean }> {
  // 先获取评论信息以更新 page_id 计数
  const comment = await db
    .prepare('SELECT page_id FROM comments WHERE id = ?')
    .bind(id)
    .first<{ page_id: number }>()

  if (!comment) {
    return { success: false }
  }

  // 删除评论 (级联删除会自动处理子评论和点赞记录)
  await db.prepare('DELETE FROM comments WHERE id = ?').bind(id).run()

  // 更新 page 的评论计数 (仅减少一条，如果是批量删除子评论，这里逻辑可能需要优化)
  // 但目前这种删除单条的方式是符合预期的
  await db
    .prepare(
      'UPDATE pages SET comment_count = MAX(0, comment_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    )
    .bind(comment.page_id)
    .run()

  return { success: true }
}

/**
 * 置顶/取消置顶评论
 */
export async function pinComment(
  db: D1Database,
  id: string,
  is_pinned: boolean
): Promise<{ success: boolean; is_pinned: boolean }> {
  await db
    .prepare(
      'UPDATE comments SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    )
    .bind(is_pinned ? 1 : 0, id)
    .run()

  return { success: true, is_pinned }
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
