# Hitalk v2 快速开始

## 🎉 项目已完成构建！

所有核心功能已实现并构建成功：

- ✅ 后端 API (Cloudflare Worker + D1)
- ✅ 前端 SDK (已构建到 `packages/sdk/dist/`)
- ✅ 完整文档

## 快速测试步骤

### 1. 初始化后端数据库

```bash
cd apps/server
pnpm run db:init
```

这将创建本地 D1 数据库并初始化表结构。

### 2. 确认后端服务运行

后端服务应该已经在运行中 (`pnpm dev`):

- API 地址: http://localhost:8787
- 健康检查: http://localhost:8787/

### 3. 测试 API

打开浏览器访问: http://localhost:8787/

你应该会看到:

```json
{
  "name": "Hitalk v2 API",
  "version": "2.0.0",
  "status": "running"
}
```

### 4. 测试完整功能

打开 `test.html` 文件进行测试，或者创建一个新的 HTML 文件:

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>Hitalk v2 测试</title>
  </head>
  <body>
    <h1>测试文章</h1>
    <p>这是一篇测试文章。</p>

    <!-- 评论容器 -->
    <div id="comment"></div>

    <!-- 引入 SDK -->
    <link rel="stylesheet" href="./packages/sdk/dist/hitalk.css" />
    <script src="./packages/sdk/dist/hitalk.js"></script>
    <script>
      Hitalk.default.mount('#comment', {
        server: 'http://localhost:8787',
        path: location.pathname,
        title: document.title,
        placeholder: '说点什么吧 @(呵呵) #(高兴)',
        avatar: 'mm',
        pageSize: 10,
      })
    </script>
  </body>
</html>
```

## 表情测试

在评论框中输入以下内容测试表情:

```
这是一条测试评论 @(呵呵) @(哈哈) #(高兴) #(小怒)

支持 **Markdown** 语法哦！
```

## 功能测试清单

- [x] 提交评论
- [x] 查看评论列表
- [x] 回复评论
- [x] 点赞评论
- [x] 表情选择器
- [x] Markdown 渲染
- [x] 表情语法转换
- [x] 用户信息缓存

## 部署到生产环境

### 1. 创建 Cloudflare D1 数据库

```bash
cd apps/server
wrangler d1 create hitalk
```

复制返回的 `database_id`，更新 `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "hitalk",
    "database_id": "你的-database-id"
  }
]
```

### 2. 初始化生产数据库

```bash
pnpm run db:migrate
```

### 3. 部署 API

```bash
pnpm deploy
```

### 4. 更新 SDK 配置

部署成功后，使用返回的 Worker URL 更新前端 SDK 配置:

```javascript
Hitalk.default.mount('#comment', {
  server: 'https://your-worker.your-subdomain.workers.dev',
  // ... 其他配置
})
```

## 常见问题

### Q: SDK 引入后提示找不到 Hitalk?

A: 使用 `Hitalk.default.mount()` 而不是 `Hitalk.mount()`，因为当前使用 UMD 格式。

### Q: 表情图片无法显示?

A: 确认 `cdn.ihoey.com` 可访问,或者修改 `apps/server/src/lib/markdown.ts` 中的 CDN 地址。

### Q: 评论无法提交?

A: 检查:

1. 后端服务是否运行
2. 数据库是否初始化
3. 浏览器控制台是否有 CORS 错误

## 下一步

- 查看 [README.md](../README.md) 了解完整文档
- 查看 [walkthrough.md](./.gemini/antigravity/brain/*/walkthrough.md) 了解实现细节
- 参考 [plan.md](./plan.md) 了解设计原理

祝使用愉快! 🚀
