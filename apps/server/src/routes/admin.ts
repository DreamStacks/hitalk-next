import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getAllComments } from '../lib/db'
import { isAdmin } from '../lib/auth'
import { positiveInteger } from '../lib/validation'
import type { Bindings } from '../types'
import { adminPage } from '../ui/admin-page'

const app = new Hono<{ Bindings: Bindings }>()
app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  c.header('Referrer-Policy', 'no-referrer')
  await next()
})
app.get('/api/comments', async c => {
  if (!isAdmin(c)) throw new HTTPException(401, { message: '管理权限验证失败' })
  const page = positiveInteger(c.req.query('page'), 1, 100000)
  const size = positiveInteger(c.req.query('pageSize'), 50, 50)
  const rows = await getAllComments(c.env.DB, size + 1, (page - 1) * size)
  return c.json({ comments: rows.slice(0, size), has_more: rows.length > size })
})
// The login shell is public; all data and mutations require an Authorization header.
app.get('/', c => c.html(adminPage))
export default app
