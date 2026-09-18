import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import type { Bindings } from './types'
import comments from './routes/comments'
import admin from './routes/admin'
import { adminPage } from './ui/admin-page'
import { APIError } from './lib/errors'
import { processNotifications } from './services/notifications'
export const app = new Hono<{
  Bindings: Bindings
  Variables: { requestId: string }
}>()
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID())
  c.header('X-Request-Id', c.get('requestId'))
  c.header('Cache-Control', 'no-store')
  c.header('Referrer-Policy', 'no-referrer')
  await next()
})
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Retry-After', 'X-Request-Id'],
    maxAge: 86400,
  })
)
app.use(
  '*',
  bodyLimit({
    maxSize: 128 * 1024,
    onError: c =>
      c.json(
        {
          code: 'PAYLOAD_TOO_LARGE',
          message: '请求内容过大',
          request_id: c.get('requestId'),
        },
        413
      ),
  })
)
app.get('/', c => c.json({ name: 'Hitalk', status: 'running' }))
app.get('/admin', c => c.html(adminPage))
app.route('/api/admin', admin)
app.route('/api', comments)
app.notFound(c =>
  c.json(
    {
      code: 'NOT_FOUND',
      message: '接口不存在',
      request_id: c.get('requestId'),
    },
    404
  )
)
app.onError((error, c) => {
  let failure: APIError
  if (error instanceof APIError) failure = error
  else if (/invalid_parent|FOREIGN KEY|CHECK constraint/.test(error.message))
    failure = new APIError(400, 'INVALID_PARENT', '回复对象无效或请求不合法')
  else if (/identity_blocked/.test(error.message))
    failure = new APIError(403, 'IDENTITY_BLOCKED', '此身份已被停用')
  else if (/comments_closed/.test(error.message))
    failure = new APIError(403, 'COMMENTS_CLOSED', '评论已关闭')
  else if (/comment_unavailable/.test(error.message))
    failure = new APIError(404, 'COMMENT_UNAVAILABLE', '评论不可用')
  else if (/pin_limit/.test(error.message))
    failure = new APIError(409, 'PIN_LIMIT', '每页最多置顶 5 条评论')
  else if (error instanceof HTTPException && error.status === 413)
    failure = new APIError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大')
  else {
    console.error(
      JSON.stringify({
        event: 'request_failed',
        request_id: c.get('requestId'),
      })
    )
    return c.json(
      {
        code: 'INTERNAL_ERROR',
        message: '服务暂时不可用',
        request_id: c.get('requestId'),
      },
      500
    )
  }
  return c.json(
    {
      code: failure.code,
      message: failure.message,
      request_id: c.get('requestId'),
    },
    failure.status
  )
})
export default {
  fetch: app.fetch,
  scheduled: (
    _event: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext
  ) => ctx.waitUntil(processNotifications(env)),
}
