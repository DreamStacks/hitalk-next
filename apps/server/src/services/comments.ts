import type {
  Comment,
  CommentCreateRequest,
  ModerationStatus,
} from '@hitalk/shared'
import type { Bindings, CommentRow, Identity } from '../types'
import { digest, identity, identityInsert, requireActive } from '../lib/auth'
import { publicComments, getCommentById } from '../lib/db'
import { MAX_UA_LENGTH } from '../lib/user-agent'
import { fail } from '../lib/errors'
import { notificationStatements } from './notifications'

export async function createComment(
  env: Bindings,
  hash: string | null,
  input: CommentCreateRequest,
  ua: string | undefined,
  admin = false
): Promise<Comment> {
  const db = env.DB
  const actor = admin
    ? { id: 'site-owner', status: 'active' as const, kind: 'admin' as const }
    : await identity(db, hash)
  requireActive(actor)
  const fingerprint = await digest(
    JSON.stringify([
      input.path,
      input.title || '',
      input.nick,
      input.email?.toLowerCase() || '',
      input.website || '',
      input.content,
      input.reply_to_id || '',
      Boolean(input.notify),
    ])
  )
  const previous = async () => {
    const current = actor || (await identity(db, hash))
    if (!current) return null
    const existing = await db
      .prepare(
        'SELECT * FROM comments WHERE author_id=? AND client_request_id=?'
      )
      .bind(current.id, input.client_request_id)
      .first<CommentRow>()
    if (!existing) return null
    if (existing.request_hash !== fingerprint)
      fail(409, 'IDEMPOTENCY_CONFLICT', '同一请求标识不能提交不同内容')
    return (await publicComments(db, [existing], current))[0]
  }
  const replay = await previous()
  if (replay) return replay
  if (env.COMMENTS_ENABLED === 'false')
    fail(403, 'COMMENTS_CLOSED', '评论已关闭')
  const id = crypto.randomUUID()
  const status =
    admin || env.MODERATION_MODE !== 'pre' ? 'published' : 'pending'
  const author = admin
    ? "'site-owner'"
    : '(SELECT id FROM identities WHERE token_hash=?)'
  const statements = [
    ...(!admin ? [identityInsert(db, hash!)] : []),
    db
      .prepare(
        'INSERT INTO pages(path,title) VALUES(?,?) ON CONFLICT(path) DO NOTHING'
      )
      .bind(input.path, input.title || null),
    db
      .prepare(`INSERT INTO comments(id,page_id,author_id,root_id,reply_to_id,client_request_id,request_hash,nick,email,website,content_md,ua,notify,moderation_status,first_published_at)
      VALUES(?,(SELECT id FROM pages WHERE path=?),${author},(SELECT COALESCE(root_id,id) FROM comments WHERE id=?),?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(
        id,
        input.path,
        ...(!admin ? [hash] : []),
        input.reply_to_id || null,
        input.reply_to_id || null,
        input.client_request_id,
        fingerprint,
        input.nick,
        input.email?.toLowerCase() || null,
        input.website || null,
        input.content,
        ua?.trim().slice(0, MAX_UA_LENGTH) || null,
        input.notify ? 1 : 0,
        status,
        status === 'published' ? new Date().toISOString() : null
      ),
    ...notificationStatements(db, id, env),
  ]
  try {
    await db.batch(statements)
  } catch (error) {
    if (error instanceof Error && /UNIQUE/.test(error.message)) {
      const existing = await previous()
      if (existing) return existing
    }
    throw error
  }
  return (
    await publicComments(
      db,
      [(await getCommentById(db, id))!],
      actor || (await identity(db, hash))
    )
  )[0]
}
export async function likeComment(
  db: D1Database,
  id: string,
  hash: string,
  liked: boolean
) {
  const actor = await identity(db, hash)
  requireActive(actor)
  const rows = await db.batch<Record<string, unknown>>([
    ...(liked
      ? [
          identityInsert(db, hash),
          db
            .prepare(
              'INSERT INTO comment_likes(comment_id,identity_id) VALUES(?,(SELECT id FROM identities WHERE token_hash=?)) ON CONFLICT DO NOTHING'
            )
            .bind(id, hash),
        ]
      : [
          db
            .prepare(
              'DELETE FROM comment_likes WHERE comment_id=? AND identity_id=(SELECT id FROM identities WHERE token_hash=?)'
            )
            .bind(id, hash),
        ]),
    db
      .prepare('SELECT COUNT(*) AS n FROM comment_likes WHERE comment_id=?')
      .bind(id),
  ])
  return { liked, like_count: Number(rows.at(-1)!.results[0].n) }
}
export async function deleteComment(
  db: D1Database,
  id: string,
  actor: Identity
) {
  const row = await getCommentById(db, id)
  if (!row) fail(404, 'COMMENT_UNAVAILABLE', '评论不存在')
  if (actor.kind !== 'admin' && row.author_id !== actor.id)
    fail(403, 'NOT_AUTHOR', '只能删除自己的评论')
  await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `UPDATE comments SET content_md=NULL,nick='',email=NULL,website=NULL,ua=NULL,notify=0,is_pinned=0,deleted_at=COALESCE(deleted_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?`
      )
      .bind(id),
    db.prepare('DELETE FROM comment_likes WHERE comment_id=?').bind(id),
    db
      .prepare(
        "UPDATE notification_jobs SET status=CASE WHEN status='sent' THEN 'sent' ELSE 'cancelled' END,recipient=NULL,payload_json=NULL,lease_token=NULL WHERE comment_id=? OR (kind='reply' AND comment_id IN (SELECT id FROM comments WHERE reply_to_id=?))"
      )
      .bind(id, id),
  ])
}
export async function moderate(
  env: Bindings,
  id: string,
  status: ModerationStatus
) {
  const row = await getCommentById(env.DB, id)
  if (!row || row.deleted_at) fail(404, 'COMMENT_UNAVAILABLE', '评论不可用')
  const statements = [
    env.DB.prepare(
      `UPDATE comments SET moderation_status=?,is_pinned=CASE WHEN ?='published' THEN is_pinned ELSE 0 END,first_published_at=CASE WHEN ?='published' THEN COALESCE(first_published_at,CURRENT_TIMESTAMP) ELSE first_published_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(status, status, status, id),
    env.DB.prepare(
      'INSERT INTO moderation_actions(subject_id,action) VALUES(?,?)'
    ).bind(id, status),
  ]
  if (status === 'published' && !row.first_published_at)
    statements.push(...notificationStatements(env.DB, id, env))
  if (status !== 'published')
    statements.push(
      env.DB.prepare(
        `UPDATE notification_jobs SET status='cancelled',lease_token=NULL,payload_json=NULL WHERE status IN ('pending','sending') AND comment_id IN (SELECT id FROM comments WHERE id=? OR root_id=?)`
      ).bind(id, row.root_id ? '' : id)
    )
  await env.DB.batch(statements)
}
