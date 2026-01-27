/**
 * 评论核心接口路由
 */

import { Hono } from 'hono'
import type {
  CommentCreateRequest,
  CommentListResponse,
  LikeResponse,
  ErrorResponse,
} from '@hitalk/shared'
import { renderMarkdown } from '../lib/markdown'
import {
  getOrCreatePage,
  createComment,
  getComments,
  buildCommentTree,
  likeComment,
  getCommentCounts,
  hashIP,
} from '../lib/db'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

/**
 * GET /comments?path=/posts/xxx
 * 获取指定页面的评论列表(树形结构)
 */
app.get('/', async c => {
  const path = c.req.query('path')

  if (!path) {
    return c.json<ErrorResponse>(
      { error: 'Bad Request', message: '缺少 path 参数' },
      400
    )
  }

  try {
    const db = c.env.DB
    const page = await getOrCreatePage(db, path)
    const comments = await getComments(db, page.id)
    const tree = buildCommentTree(comments)

    const response: CommentListResponse = {
      comments: tree,
      total: page.comment_count,
      page_info: {
        path: page.path,
        title: page.title,
        comment_count: page.comment_count,
      },
    }

    return c.json(response)
  } catch (error) {
    console.error('获取评论失败:', error)
    return c.json<ErrorResponse>(
      { error: 'Internal Server Error', message: '获取评论失败' },
      500
    )
  }
})

/**
 * POST /comments
 * 提交新评论
 */
app.post('/', async c => {
  try {
    const body = await c.req.json<CommentCreateRequest>()

    // 验证必需字段
    if (!body.path || !body.content || !body.nick) {
      return c.json<ErrorResponse>(
        {
          error: 'Bad Request',
          message: '缺少必需字段: path, content, nick',
        },
        400
      )
    }

    const db = c.env.DB

    // 获取或创建 page
    const page = await getOrCreatePage(db, body.path, body.title)

    // 渲染 Markdown
    const content_html = renderMarkdown(body.content)

    // 获取客户端 IP
    const ip =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for') ||
      'unknown'
    const ip_hash = hashIP(ip)

    // 获取 UA
    const ua = c.req.header('user-agent') || ''

    // 创建评论
    const comment = await createComment(db, {
      page_id: page.id,
      parent_id: body.parent_id,
      nick: body.nick,
      email: body.email,
      website: body.website,
      content_md: body.content,
      content_html,
      ua,
      ip_hash,
    })

    return c.json(comment, 201)
  } catch (error) {
    console.error('创建评论失败:', error)
    return c.json<ErrorResponse>(
      { error: 'Internal Server Error', message: '创建评论失败' },
      500
    )
  }
})

/**
 * POST /comments/:id/like
 * 点赞评论
 */
app.post('/:id/like', async c => {
  const id = c.req.param('id')

  try {
    const db = c.env.DB

    // 获取客户端 IP
    const ip =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for') ||
      'unknown'
    const ip_hash = hashIP(ip)

    const result = await likeComment(db, id, ip_hash)

    const response: LikeResponse = {
      success: result.success,
      like_count: result.like_count,
    }

    return c.json(response)
  } catch (error) {
    console.error('点赞失败:', error)
    return c.json<ErrorResponse>(
      { error: 'Internal Server Error', message: '点赞失败' },
      500
    )
  }
})

/**
 * GET /comments/count?paths[]=/posts/a&paths[]=/posts/b
 * 批量获取评论数
 */
app.get('/count', async c => {
  const paths = c.req.queries('paths[]') || []

  if (paths.length === 0) {
    return c.json<ErrorResponse>(
      { error: 'Bad Request', message: '缺少 paths[] 参数' },
      400
    )
  }

  try {
    const db = c.env.DB
    const counts = await getCommentCounts(db, paths)
    return c.json(counts)
  } catch (error) {
    console.error('获取评论数失败:', error)
    return c.json<ErrorResponse>(
      { error: 'Internal Server Error', message: '获取评论数失败' },
      500
    )
  }
})

export default app
