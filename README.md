# Hitalk v2

> 一款快速、简洁且高效的评论系统 - 完全重写版

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

## 特性

- ✅ **前后端解耦** - 标准 REST API 架构
- ✅ **自托管** - 基于 Cloudflare Worker + D1,完全可控
- ✅ **Markdown 优先** - 以 Markdown 为数据源,避免 HTML 注入风险
- ✅ **安全第一** - DOMPurify XSS 防护,HTML 白名单过滤
- ✅ **表情支持** - 兼容 v1 的 @(泡泡) 和 #(阿鲁) 表情语法
- ✅ **树形评论** - 支持回复和嵌套显示
- ✅ **点赞系统** - IP 去重防刷
- ✅ **轻量高效** - 核心代码精简,性能优化

## 快速开始

### 1. 部署后端 API

```bash
# 安装依赖
cd apps/server
pnpm install

# 创建 D1 数据库
wrangler d1 create hitalk

# 更新 wrangler.jsonc 中的 database_id

# 初始化数据库
pnpm run db:init

# 本地开发
pnpm dev

# 部署到 Cloudflare
pnpm deploy
```

### 2. 使用 SDK

在你的 HTML 页面中引入 Hitalk SDK:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>My Blog</title>
  </head>
  <body>
    <h1>文章标题</h1>
    <p>文章内容...</p>

    <!-- 评论容器 -->
    <div id="comment"></div>

    <!-- 引入 Hitalk SDK -->
    <script src="https://cdn.example.com/hitalk.js"></script>
    <script>
      Hitalk.mount('#comment', {
        server: 'https://your-worker.workers.dev',
        path: location.pathname,
        title: document.title,
        placeholder: '说点什么吧...',
        avatar: 'mm', // 'mm' | 'identicon' | 'monsterid' | 'hide'
        pageSize: 10,
      })
    </script>
  </body>
</html>
```

### 3. 批量获取评论数(文章列表页)

```html
<!-- 文章列表 -->
<ul>
  <li>
    <a href="/posts/article-1">文章标题 1</a>
    <span class="hitalk-comment-count" data-xid="/posts/article-1">0</span>
    条评论
  </li>
  <li>
    <a href="/posts/article-2">文章标题 2</a>
    <span class="hitalk-comment-count" data-xid="/posts/article-2">0</span>
    条评论
  </li>
</ul>

<script>
  // 自动获取所有评论数
  const elements = document.querySelectorAll('.hitalk-comment-count')
  const paths = Array.from(elements).map(el => el.getAttribute('data-xid'))

  fetch(
    `https://your-worker.workers.dev/comments/count?${paths.map(p => `paths[]=${p}`).join('&')}`
  )
    .then(res => res.json())
    .then(counts => {
      elements.forEach(el => {
        const path = el.getAttribute('data-xid')
        el.textContent = counts[path] || 0
      })
    })
</script>
```

## API 文档

### 获取评论列表

```
GET /comments?path=/posts/article-1
```

响应:

```json
{
  "comments": [
    {
      "id": "abc123",
      "nick": "张三",
      "content_html": "<p>这是评论内容</p>",
      "like_count": 5,
      "created_at": "2026-01-27T00:00:00Z",
      "children": []
    }
  ],
  "total": 10,
  "page_info": {
    "path": "/posts/article-1",
    "title": "文章标题",
    "comment_count": 10
  }
}
```

### 创建评论

```
POST /comments
Content-Type: application/json

{
  "path": "/posts/article-1",
  "title": "文章标题",
  "nick": "张三",
  "email": "zhang@example.com",
  "website": "https://blog.example.com",
  "content": "这是一条**评论** @(呵呵)",
  "parent_id": "parent-comment-id"  // 可选,回复时使用
}
```

### 点赞评论

```
POST /comments/:id/like
```

响应:

```json
{
  "success": true,
  "like_count": 6
}
```

### 批量获取评论数

```
GET /comments/count?paths[]=/posts/a&paths[]=/posts/b
```

响应:

```json
{
  "/posts/a": 10,
  "/posts/b": 5
}
```

## 项目结构

```
hitalk-next/
├── apps/
│   └── server/              # 后端 API (Cloudflare Worker)
│       ├── src/
│       │   ├── index.ts     # 主入口
│       │   ├── schema.sql   # 数据库结构
│       │   ├── lib/
│       │   │   ├── markdown.ts  # Markdown 渲染
│       │   │   └── db.ts        # 数据库操作
│       │   └── routes/
│       │       └── comments.ts  # 评论路由
│       └── wrangler.jsonc
├── packages/
│   ├── shared/              # 共享类型定义
│   │   └── types.ts
│   └── sdk/                 # 前端 SDK
│       └── src/
│           ├── api.ts       # API 封装
│           ├── store.ts     # 状态管理
│           ├── utils.ts     # 工具函数
│           └── index.ts     # SDK 入口
└── plan.md                  # 设计方案文档
```

## 技术栈

### 后端

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Framework**: Hono
- **Markdown**: markdown-it + markdown-it-emoji
- **Security**: isomorphic-dompurify

### 前端

- **Language**: TypeScript
- **Build**: Rollup
- **Storage**: localStorage (用户信息缓存)

## 表情支持

Hitalk v2 完全兼容 v1 的表情语法:

- `@(表情名)` - 泡泡表情
- `#(表情名)` - 阿鲁表情

示例:

```
这个评论系统真棒 @(呵呵) #(高兴)
```

表情图片由 `cdn.ihoey.com` CDN 提供。

## 与 v1 的区别

| 特性     | v1              | v2                     |
| -------- | --------------- | ---------------------- |
| 后端     | LeanCloud       | Cloudflare Worker + D1 |
| 数据存储 | HTML 直送       | Markdown → HTML        |
| 安全性   | marked sanitize | DOMPurify 白名单       |
| 架构     | 前端直连数据库  | REST API               |
| 自托管   | ❌              | ✅                     |
| 可迁移性 | ❌              | ✅                     |

## 数据迁移

如需从 v1 迁移数据,请参考 `plan.md` 中的 Phase 5 说明(数据迁移工具待开发)。

## 开发

```bash
# 安装依赖
pnpm install

# 后端开发
cd apps/server
pnpm dev

# SDK 开发
cd packages/sdk
pnpm dev

# 构建 SDK
cd packages/sdk
pnpm build
```

## TODO

- [ ] SDK UI 组件完整实现
- [ ] 邮件通知
- [ ] 评论审核
- [ ] 国际化支持
- [ ] XSS 测试用例
- [ ] 管理后台(置顶/删除评论)
- [ ] 插件机制
- [ ] 登录系统
- [ ] 性能优化(缓存、分页优化)
- [ ] 数据迁移工具

## License

MIT © [ihoey](https://blog.ihoey.com)

## 支持

如果 Hitalk 对你有帮助,欢迎赞助支持:

https://sponsor.ihoey.com/
