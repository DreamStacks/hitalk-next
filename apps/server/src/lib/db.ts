import type {
  Comment,
  CommentListResponse,
  ReplyListResponse,
} from '@hitalk/shared'
import type { CommentRow, Identity, Page } from '../types'
import { avatarHash } from './avatar'
import { renderMarkdown } from './markdown'
import { clientInfo } from './user-agent'
import { decodeCursor, encodeCursor } from './cursor'
import { fail } from './errors'

const marks = (ids: unknown[]) => ids.map(() => '?').join(',')
const timestamp = (value: string) =>
  value.includes('T') ? value : value.replace(' ', 'T') + 'Z'
export function getPage(db: D1Database, path: string) {
  return db.prepare('SELECT * FROM pages WHERE path=?').bind(path).first<Page>()
}
export function getCommentById(db: D1Database, id: string) {
  return db
    .prepare('SELECT * FROM comments WHERE id=?')
    .bind(id)
    .first<CommentRow>()
}
const rootsWhere = `c.root_id IS NULL AND c.moderation_status='published' AND
  (c.deleted_at IS NULL OR EXISTS(SELECT 1 FROM visible_comments v WHERE v.root_id=c.id))`
async function maximum(db: D1Database) {
  return (await db
    .prepare('SELECT COALESCE(MAX(seq),0) AS n FROM comments')
    .first<{ n: number }>())!.n
}

/** Enrich a bounded set in one batch, never expose private columns. */
export async function publicComments(
  db: D1Database,
  rows: CommentRow[],
  actor: Identity | null
): Promise<Comment[]> {
  if (!rows.length) return []
  const ids = rows.map(row => row.id)
  const parents = [
    ...new Set(rows.flatMap(row => (row.reply_to_id ? [row.reply_to_id] : []))),
  ]
  const [likes, targets, counts] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT comment_id,COUNT(*) AS n,MAX(identity_id=?) AS liked FROM comment_likes WHERE comment_id IN (${marks(ids)}) GROUP BY comment_id`
      )
      .bind(actor?.id || '', ...ids),
    db
      .prepare(
        `SELECT id,nick FROM visible_comments WHERE id IN (${marks(parents.length ? parents : [''])})`
      )
      .bind(...(parents.length ? parents : [''])),
    db
      .prepare(
        `SELECT root_id,COUNT(*) AS n FROM visible_comments WHERE root_id IN (${marks(ids)}) GROUP BY root_id`
      )
      .bind(...ids),
  ])
  const likeMap = new Map(
    likes.results.map(row => [
      row.comment_id,
      { n: Number(row.n), liked: Boolean(row.liked) },
    ])
  )
  const targetMap = new Map(
    targets.results.map(row => [row.id, String(row.nick)])
  )
  const countMap = new Map(
    counts.results.map(row => [row.root_id, Number(row.n)])
  )
  return rows.map(row => {
    const deleted = row.deleted_at !== null
    return {
      sequence: row.seq,
      id: row.id,
      root_id: row.root_id,
      reply_to: row.reply_to_id
        ? {
            id: row.reply_to_id,
            nick: targetMap.get(row.reply_to_id) || '评论不可用',
            available: targetMap.has(row.reply_to_id),
          }
        : null,
      nick: deleted ? '评论已删除' : row.nick,
      website: deleted ? undefined : row.website || undefined,
      avatar_hash: deleted
        ? ''
        : avatarHash(row.email?.trim().toLowerCase() || row.nick),
      content_html: deleted ? '' : renderMarkdown(row.content_md || ''),
      deleted,
      status: row.moderation_status,
      like_count: deleted ? 0 : likeMap.get(row.id)?.n || 0,
      liked: !deleted && (likeMap.get(row.id)?.liked || false),
      can_delete:
        !deleted &&
        actor?.status === 'active' &&
        (actor.id === row.author_id || actor.kind === 'admin'),
      can_reply: !deleted && row.moderation_status === 'published',
      is_pinned: Boolean(row.is_pinned),
      is_admin: row.author_id === 'site-owner',
      created_at: timestamp(row.created_at),
      updated_at: timestamp(row.updated_at),
      client: deleted ? undefined : clientInfo(row.ua),
      ...(row.root_id === null
        ? { reply_count: countMap.get(row.id) || 0 }
        : {}),
    }
  })
}
async function withPreviews(
  db: D1Database,
  rows: CommentRow[],
  actor: Identity | null,
  snapshot: number
): Promise<Comment[]> {
  if (!rows.length) return []
  const ids = rows.map(row => row.id)
  const preview = await db
    .prepare(`SELECT * FROM (SELECT c.*,ROW_NUMBER() OVER(PARTITION BY root_id ORDER BY seq) AS rn
    FROM visible_comments c WHERE root_id IN (${marks(ids)}) AND seq<=?) WHERE rn<=4 ORDER BY seq`)
    .bind(...ids, snapshot)
    .all<CommentRow>()
  const [roots, replies] = await Promise.all([
    publicComments(db, rows, actor),
    publicComments(db, preview.results, actor),
  ])
  const byId = new Map(replies.map(row => [row.id, row]))
  return roots.map(root => {
    const thread = preview.results.filter(row => row.root_id === root.id)
    return {
      ...root,
      replies: thread.slice(0, 3).map(row => byId.get(row.id)!),
      reply_cursor:
        thread.length > 3
          ? encodeCursor({
              scope: `replies:${root.id}`,
              snapshot,
              after: thread[2].seq,
            })
          : null,
    }
  })
}
export async function listComments(
  db: D1Database,
  path: string,
  limit: number,
  cursor: string | undefined,
  actor: Identity | null
): Promise<CommentListResponse> {
  const decoded = decodeCursor(cursor, `page:${path}`)
  const page = await getPage(db, path)
  if (!page)
    return {
      comments: [],
      pinned: [],
      total: 0,
      next_cursor: null,
      comments_enabled: true,
    }
  const snapshot = decoded?.snapshot ?? (await maximum(db))
  const [result, pins, total] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT c.* FROM comments c WHERE c.page_id=? AND ${rootsWhere} AND c.seq<=? AND c.seq<? ORDER BY c.seq DESC LIMIT ?`
      )
      .bind(page.id, snapshot, decoded?.after ?? snapshot + 1, limit + 1),
    db
      .prepare(
        `SELECT c.* FROM comments c WHERE c.page_id=? AND ${rootsWhere} AND c.is_pinned=1 AND c.seq<=? ORDER BY c.seq DESC LIMIT 5`
      )
      .bind(page.id, snapshot),
    db
      .prepare('SELECT COUNT(*) AS n FROM visible_comments WHERE page_id=?')
      .bind(page.id),
  ])
  const rows = result.results as unknown as CommentRow[]
  const all = [
    ...new Map(
      [
        ...rows.slice(0, limit),
        ...(pins.results as unknown as CommentRow[]),
      ].map(row => [row.id, row])
    ).values(),
  ]
  const decorated = new Map(
    (await withPreviews(db, all, actor, snapshot)).map(row => [row.id, row])
  )
  return {
    comments: rows.slice(0, limit).map(row => decorated.get(row.id)!),
    pinned: pins.results.map(row => decorated.get(String(row.id))!),
    total: Number(total.results[0].n),
    next_cursor:
      rows.length > limit
        ? encodeCursor({
            scope: `page:${path}`,
            snapshot,
            after: rows[limit - 1].seq,
          })
        : null,
    comments_enabled: Boolean(page.comments_enabled),
  }
}
export async function listReplies(
  db: D1Database,
  rootId: string,
  limit: number,
  cursor: string | undefined,
  actor: Identity | null
): Promise<ReplyListResponse> {
  const root = await getCommentById(db, rootId)
  if (!root || root.root_id || root.moderation_status !== 'published')
    fail(404, 'COMMENT_UNAVAILABLE', '讨论串不可用')
  const decoded = decodeCursor(cursor, `replies:${rootId}`)
  const snapshot = decoded?.snapshot ?? (await maximum(db))
  const rows = await db
    .prepare(
      'SELECT * FROM visible_comments WHERE root_id=? AND seq<=? AND seq>? ORDER BY seq LIMIT ?'
    )
    .bind(rootId, snapshot, decoded?.after ?? 0, limit + 1)
    .all<CommentRow>()
  return {
    comments: await publicComments(db, rows.results.slice(0, limit), actor),
    next_cursor:
      rows.results.length > limit
        ? encodeCursor({
            scope: `replies:${rootId}`,
            snapshot,
            after: rows.results[limit - 1].seq,
          })
        : null,
  }
}
export async function commentContext(
  db: D1Database,
  id: string,
  actor: Identity | null
) {
  const row = await db
    .prepare('SELECT * FROM visible_comments WHERE id=?')
    .bind(id)
    .first<CommentRow>()
  if (!row) fail(404, 'COMMENT_UNAVAILABLE', '评论不可用')
  const root = row.root_id ? (await getCommentById(db, row.root_id))! : row
  const result = (await withPreviews(db, [root], actor, await maximum(db)))[0]
  if (row.root_id && !result.replies!.some(comment => comment.id === row.id)) {
    result.replies!.push((await publicComments(db, [row], actor))[0])
    result.replies!.sort((a, b) => a.sequence - b.sequence)
  }
  return { root: result, target_id: id }
}
export async function getCommentCounts(
  db: D1Database,
  paths: string[]
): Promise<Record<string, number>> {
  const rows = await db
    .prepare(
      `SELECT p.path,COUNT(c.id) AS n FROM pages p LEFT JOIN visible_comments c ON c.page_id=p.id WHERE p.path IN (${marks(paths)}) GROUP BY p.id`
    )
    .bind(...paths)
    .all<{ path: string; n: number }>()
  const counts = new Map(rows.results.map(row => [row.path, row.n]))
  return Object.fromEntries(paths.map(path => [path, counts.get(path) || 0]))
}
