import { Hono } from 'hono'
import type { Bindings } from '../types'
import type { ModerationStatus } from '@hitalk/shared'
import { requireAdmin } from '../lib/auth'
import {
  badRequest,
  commentInput,
  pagePath,
  positiveInteger,
} from '../lib/validation'
import { createComment, deleteComment, moderate } from '../services/comments'
import { fail } from '../lib/errors'
import { jsonBody } from './comments'
const app = new Hono<{ Bindings: Bindings }>()
app.use('*', async (c, next) => {
  requireAdmin(c)
  await next()
})
app.get('/comments', async c => {
  const before = positiveInteger(
    c.req.query('before'),
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER
  )
  const status = c.req.query('status') || ''
  const path = c.req.query('path') || ''
  const rows = await c.env.DB.prepare(
    `SELECT c.*,p.path AS page_path,i.status AS author_status FROM comments c JOIN pages p ON p.id=c.page_id JOIN identities i ON i.id=c.author_id WHERE c.seq<? AND (?='' OR c.moderation_status=?) AND (?='' OR p.path=?) ORDER BY c.seq DESC LIMIT 51`
  )
    .bind(before, status, status, path, path)
    .all()
  // Credentials and request fingerprints are never part of admin presentation either.
  const comments = rows.results
    .slice(0, 50)
    .map(({ request_hash: _hash, client_request_id: _key, ...row }) => row)
  return c.json({
    comments,
    next: rows.results.length > 50 ? rows.results[49].seq : null,
  })
})
app.post('/comments', async c =>
  c.json(
    await createComment(
      c.env,
      null,
      commentInput(await jsonBody(c.req)),
      c.req.header('user-agent'),
      true
    ),
    201
  )
)
app.delete('/comments/:id', async c => {
  await deleteComment(c.env.DB, c.req.param('id'), {
    id: 'site-owner',
    kind: 'admin',
    status: 'active',
  })
  return c.json({ success: true })
})
app.patch('/comments/:id', async c => {
  const body = await jsonBody(c.req)
  if (!body || typeof body !== 'object') badRequest('操作不合法')
  if (
    'status' in body &&
    typeof body.status === 'string' &&
    ['published', 'pending', 'hidden', 'spam'].includes(body.status)
  ) {
    await moderate(c.env, c.req.param('id'), body.status as ModerationStatus)
  } else if ('is_pinned' in body && typeof body.is_pinned === 'boolean') {
    const row = await c.env.DB.prepare(
      "UPDATE comments SET is_pinned=? WHERE id=? AND root_id IS NULL AND deleted_at IS NULL AND moderation_status='published'"
    )
      .bind(body.is_pinned ? 1 : 0, c.req.param('id'))
      .run()
    if (!row.meta.changes)
      fail(404, 'COMMENT_UNAVAILABLE', '只能置顶可见的根评论')
  } else badRequest('操作不合法')
  return c.json({ success: true })
})
app.patch('/identities/:id', async c => {
  const body = await jsonBody(c.req)
  if (
    !body ||
    typeof body !== 'object' ||
    !('status' in body) ||
    !['active', 'blocked'].includes(String(body.status))
  )
    badRequest('身份状态不合法')
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE identities SET status=? WHERE id=? AND kind='visitor'"
    ).bind(String(body.status), c.req.param('id')),
    c.env.DB.prepare(
      'INSERT INTO moderation_actions(subject_id,action) VALUES(?,?)'
    ).bind(c.req.param('id'), `identity:${String(body.status)}`),
  ])
  if (!result[0].meta.changes) fail(404, 'NOT_FOUND', '身份不存在')
  return c.json({ success: true })
})
app.patch('/pages', async c => {
  const body = await jsonBody(c.req)
  if (
    !body ||
    typeof body !== 'object' ||
    !('path' in body) ||
    !('comments_enabled' in body) ||
    typeof body.comments_enabled !== 'boolean'
  )
    badRequest('页面配置不合法')
  await c.env.DB.prepare(
    'INSERT INTO pages(path,comments_enabled) VALUES(?,?) ON CONFLICT(path) DO UPDATE SET comments_enabled=excluded.comments_enabled'
  )
    .bind(pagePath(body.path), body.comments_enabled ? 1 : 0)
    .run()
  return c.json({ success: true })
})
app.get('/notifications', async c =>
  c.json({
    jobs: (
      await c.env.DB.prepare(
        'SELECT id,comment_id,kind,status,attempts,last_error,created_at FROM notification_jobs ORDER BY created_at DESC LIMIT 50'
      ).all()
    ).results,
  })
)
export default app
