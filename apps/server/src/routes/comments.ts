import { createComment, likeComment, deleteComment } from '../services/comments'
import { Hono } from 'hono'
import type { Bindings, CommentRow } from '../types'
import { credential, identity, requireActive, limitWrite } from '../lib/auth'
import {
  commentInput,
  pagePath,
  positiveInteger,
  badRequest,
} from '../lib/validation'
import {
  listComments,
  listReplies,
  commentContext,
  getCommentCounts,
  publicComments,
} from '../lib/db'
import { processNotifications } from '../services/notifications'
import { fail } from '../lib/errors'
const app = new Hono<{ Bindings: Bindings }>()
export async function jsonBody(request: { json: () => Promise<unknown> }) {
  try {
    return await request.json()
  } catch {
    badRequest('JSON 格式不正确')
  }
}
app.get('/config', c =>
  c.json({
    comments_enabled: c.env.COMMENTS_ENABLED !== 'false',
    moderation: c.env.MODERATION_MODE === 'pre' ? 'pre' : 'post',
    max_length: 20000,
  })
)
app.get('/comments', async c => {
  const actor = await identity(c.env.DB, await credential(c))
  const result = await listComments(
    c.env.DB,
    pagePath(c.req.query('path')),
    positiveInteger(c.req.query('limit'), 10, 20),
    c.req.query('cursor'),
    actor
  )
  result.comments_enabled =
    result.comments_enabled && c.env.COMMENTS_ENABLED !== 'false'
  return c.json(result)
})
app.get('/comments/count', async c => {
  const paths = c.req.queries('paths[]') || []
  if (!paths.length || paths.length > 50)
    badRequest('每次查询需要 1–50 个页面路径')
  return c.json(
    await getCommentCounts(c.env.DB, [...new Set(paths.map(pagePath))])
  )
})
app.get('/threads/:id/replies', async c =>
  c.json(
    await listReplies(
      c.env.DB,
      c.req.param('id'),
      positiveInteger(c.req.query('limit'), 20, 50),
      c.req.query('cursor'),
      await identity(c.env.DB, await credential(c))
    )
  )
)
app.get('/comments/:id/context', async c =>
  c.json(
    await commentContext(
      c.env.DB,
      c.req.param('id'),
      await identity(c.env.DB, await credential(c))
    )
  )
)
app.post('/comments', async c => {
  const hash = (await credential(c, true))!
  await limitWrite(c, hash)
  const result = await createComment(
    c.env,
    hash,
    commentInput(await jsonBody(c.req)),
    c.req.header('user-agent')
  )
  c.executionCtx.waitUntil(processNotifications(c.env))
  return c.json(result, 201)
})
app.put('/comments/:id/like', async c => {
  const hash = (await credential(c, true))!
  await limitWrite(c, hash)
  return c.json(await likeComment(c.env.DB, c.req.param('id'), hash, true))
})
app.delete('/comments/:id/like', async c => {
  const hash = (await credential(c, true))!
  await limitWrite(c, hash)
  return c.json(await likeComment(c.env.DB, c.req.param('id'), hash, false))
})
app.delete('/comments/:id', async c => {
  const hash = (await credential(c, true))!
  await limitWrite(c, hash)
  const actor = await identity(c.env.DB, hash)
  requireActive(actor)
  if (!actor) fail(401, 'IDENTITY_REQUIRED', '身份尚未建立')
  await deleteComment(c.env.DB, c.req.param('id'), actor)
  return c.json({ success: true })
})
app.get('/me', async c => {
  const actor = await identity(c.env.DB, await credential(c, true))
  if (!actor) fail(401, 'IDENTITY_REQUIRED', '身份尚未建立')
  return c.json({ status: actor.status })
})
app.get('/me/comments', async c => {
  const actor = await identity(c.env.DB, await credential(c, true))
  if (!actor) fail(401, 'IDENTITY_REQUIRED', '身份尚未建立')
  const path = pagePath(c.req.query('path'))
  const before = positiveInteger(
    c.req.query('before'),
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER
  )
  const rows = await c.env.DB.prepare(
    "SELECT c.* FROM comments c JOIN pages p ON p.id=c.page_id WHERE p.path=? AND c.author_id=? AND c.seq<? AND (?='' OR c.moderation_status=?) AND c.deleted_at IS NULL ORDER BY c.seq DESC LIMIT 21"
  )
    .bind(
      path,
      actor.id,
      before,
      c.req.query('status') || '',
      c.req.query('status') || ''
    )
    .all<CommentRow>()
  return c.json({
    comments: await publicComments(c.env.DB, rows.results.slice(0, 20), actor),
    next: rows.results.length > 20 ? rows.results[19].seq : null,
  })
})
app.get('/notifications/unsubscribe/:id', c =>
  c.html(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>停止通知</title><form method="post"><button>停止向此邮箱发送评论通知</button></form></html>'
  )
)
app.post('/notifications/unsubscribe/:id', async c => {
  const job = await c.env.DB.prepare(
    'SELECT recipient FROM notification_jobs WHERE id=?'
  )
    .bind(c.req.param('id'))
    .first<{ recipient: string }>()
  if (!job?.recipient) fail(404, 'NOT_FOUND', '链接无效')
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO email_suppressions(recipient) VALUES(?) ON CONFLICT DO NOTHING'
    ).bind(job.recipient),
    c.env.DB.prepare(
      "UPDATE notification_jobs SET status='cancelled',lease_token=NULL,payload_json=NULL WHERE recipient=? AND status IN ('pending','sending')"
    ).bind(job.recipient),
  ])
  return c.html(
    '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><p>已停止邮件通知。</p></html>'
  )
})
export default app
