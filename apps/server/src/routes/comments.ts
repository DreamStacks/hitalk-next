import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { bodyLimit } from 'hono/body-limit'
import type { CommentListResponse } from '@hitalk/shared'
import type { Bindings } from '../types'
import { isAdmin } from '../lib/auth'
import {
  badRequest,
  commentInput,
  pagePath,
  positiveInteger,
} from '../lib/validation'
import {
  getPage,
  getOrCreatePage,
  getComments,
  rootCount,
  createComment,
  getCommentById,
  publicComment,
  hashIP,
  likeComment,
  getCommentCounts,
  pinComment,
  deleteComment,
} from '../lib/db'
import { pluginManager } from '../lib/plugin-manager'

const app = new Hono<{ Bindings: Bindings }>()
app.use(
  '*',
  bodyLimit({
    maxSize: 128 * 1024,
    onError: c =>
      c.json({ error: 'Payload Too Large', message: '请求内容过大' }, 413),
  })
)

async function jsonBody(request: { json: () => Promise<unknown> }) {
  try {
    return await request.json()
  } catch (error) {
    if (error instanceof HTTPException) throw error
    if (error instanceof Error && error.name === 'BodyLimitError')
      throw new HTTPException(413, { message: '请求内容过大' })
    badRequest('JSON 格式不正确')
  }
}

app.get('/', async c => {
  const path = pagePath(c.req.query('path'))
  const pageNumber = positiveInteger(c.req.query('page'), 1, 100000)
  const size = positiveInteger(c.req.query('pageSize'), 10, 50)
  const page = await getPage(c.env.DB, path)
  const [comments, roots] = page
    ? await Promise.all([
        getComments(c.env.DB, page.id, size, (pageNumber - 1) * size),
        rootCount(c.env.DB, page.id),
      ])
    : [[], 0]
  const response: CommentListResponse = {
    comments,
    total: page?.comment_count || 0,
    page_info: {
      path,
      title: page?.title || undefined,
      comment_count: page?.comment_count || 0,
    },
    pagination: {
      page: pageNumber,
      page_size: size,
      has_more: pageNumber * size < roots,
    },
  }
  return c.json(response)
})

app.post('/', async c => {
  const input = commentInput(await jsonBody(c.req))
  const db = c.env.DB
  const parent = input.parent_id
    ? await getCommentById(db, input.parent_id)
    : null
  if (input.parent_id) {
    const existingPage = await getPage(db, input.path)
    if (!parent || parent.page_id !== existingPage?.id)
      badRequest('回复目标不存在或不属于当前页面')
  }
  const page = await getOrCreatePage(db, input.path, input.title)
  let row
  try {
    row = await createComment(db, page.id, input, isAdmin(c))
  } catch (error) {
    if (
      error instanceof Error &&
      /invalid_parent|reply_depth_exceeded|FOREIGN KEY/.test(error.message)
    )
      badRequest('回复目标已失效或回复层级过深')
    throw error
  }
  c.executionCtx.waitUntil(
    pluginManager.commentCreated(
      { env: c.env, db },
      row,
      page,
      parent || undefined
    )
  )
  return c.json(publicComment(row), 201)
})

app.get('/count', async c => {
  const paths = c.req.queries('paths[]') || []
  if (paths.length < 1 || paths.length > 50)
    badRequest('每次查询需要 1–50 个页面路径')
  return c.json(
    await getCommentCounts(c.env.DB, [...new Set(paths.map(pagePath))])
  )
})

app.post('/:id/like', async c => {
  if (!c.env.IP_HASH_SALT)
    throw new HTTPException(503, { message: '服务尚未配置 IP_HASH_SALT' })
  const result = await likeComment(
    c.env.DB,
    c.req.param('id'),
    await hashIP(
      c.req.header('cf-connecting-ip') || 'unknown',
      c.env.IP_HASH_SALT
    )
  )
  if (!result) throw new HTTPException(404, { message: '评论不存在' })
  return c.json(result)
})

app.put('/:id/pin', async c => {
  if (!isAdmin(c)) throw new HTTPException(401, { message: '管理权限验证失败' })
  const body = await jsonBody(c.req)
  if (
    !body ||
    typeof body !== 'object' ||
    !('is_pinned' in body) ||
    typeof body.is_pinned !== 'boolean'
  )
    badRequest('is_pinned 必须是布尔值')
  if (!(await pinComment(c.env.DB, c.req.param('id'), body.is_pinned)))
    throw new HTTPException(404, { message: '评论不存在' })
  return c.json({ success: true, is_pinned: body.is_pinned })
})

app.delete('/:id', async c => {
  if (!isAdmin(c)) throw new HTTPException(401, { message: '管理权限验证失败' })
  if (!(await deleteComment(c.env.DB, c.req.param('id'))))
    throw new HTTPException(404, { message: '评论不存在' })
  return c.json({ success: true })
})

export default app
