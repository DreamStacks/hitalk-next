import { Hono } from 'hono'
import { cors } from 'hono/cors'
import comments from './routes/comments'
import admin from './routes/admin'

type Bindings = {
  DB: D1Database
  ADMIN_TOKEN: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS 配置
app.use(
  '*',
  cors({
    origin: '*', // 生产环境应配置具体域名
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
)

// 健康检查
app.get('/', c => {
  return c.json({
    name: 'Hitalk v2 API',
    version: '2.0.0',
    status: 'running',
  })
})

// 注册路由
app.route('/comments', comments)
app.route('/admin', admin)

export default app
