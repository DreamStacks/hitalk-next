# Hitalk

面向单个博客的轻量评论系统。Hono + Cloudflare Workers + D1 服务端，框架无关的 TypeScript + lit-html 嵌入式 SDK。

当前采用全新数据库结构和单一 `/api` 协议，不提供旧字段、旧接口或旧库迁移兼容。匿名身份自动建立，无注册表单、无验证码。视觉验收由项目维护者完成，自动化测试覆盖身份、权限、并发、生命周期和数据完整性。

## 本地开发

Node.js 22.22.2+，pnpm 10.28.2：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

自动生成缺失的本地管理令牌和 IP 盐，应用本地迁移，启动：

- 示例：`http://127.0.0.1:5173`。
- API：`http://127.0.0.1:8787/api`。
- 管理：`http://127.0.0.1:8787/admin`，令牌取自本地 `apps/server/.dev.vars`。

示例默认通过 Vite `/api` 代理访问本地 Worker，评论路径为 `/playground`。`pnpm db:seed` 加载虚构演示数据，可重复执行。新配置使用独立的 `hitalk-fresh` 本地数据库标识，不删除或读取原本的本地数据库。邮件默认关闭。

前端可用 `VITE_API_URL`、`VITE_PAGE_PATH` 配置。API 地址必须包含 `/api`，例如 `https://comments.example.com/api`；远端必须 HTTPS。本地无需配置这些变量。静态部署前显式指定 API 地址，GitHub Pages 工作流读取仓库变量 `HITALK_API_URL`。

## 嵌入

```html
<link rel="stylesheet" href="/assets/hitalk.css" />
<div id="comments"></div>
<script src="/assets/hitalk.js"></script>
<script>
  const comments = Hitalk.mount('#comments', {
    server: 'https://comments.example.com/api',
    path: location.pathname,
    title: document.title,
    pageSize: 10,
    guestFields: ['nick', 'email', 'website'],
  })
  // SPA 离开页面时 comments.destroy()
  // 同一页面重新读取：await comments.refresh()
</script>
```

```ts
import { mount } from '@hitalk/sdk'
import '@hitalk/sdk/hitalk.css'
```

SDK 同时构建 ESM、IIFE、独立 CSS 和类型声明。ESM 可在 SSR 环境导入，mount 在浏览器运行；不提供服务端渲染。宿主只管理挂载容器，组件内部由 SDK 管理。支持当前具备 Web Crypto、Web Locks 的现代浏览器；部署使用 HTTPS。

`pageSize` 为根评论数，默认 10、最大 20；每根先展示 3 条回复，再独立分页加载。根评论和回复保留真实回复对象，未加载目标通过定位接口获取。置顶不改变普通评论的分页顺序。

`guestFields` 控制字段显示与顺序，`[]` 隐藏全部访客字段并使用 Guest 昵称。隐藏字段不从缓存补交。支持 Markdown、表情、头像和浏览器/系统展示；Markdown 由服务端清洗，原始 HTML 不执行。

## 匿名身份与作者权限

第一次发表评论或点赞前，SDK 用 Web Crypto 生成 32 字节随机 token，先写入 localStorage，再发送请求；服务端只保存 SHA-256 摘要，在有效写入的同一事务内创建身份。多标签页通过 Web Locks 避免首次初始化竞争。仅阅读不创建身份。

同一浏览器、同一宿主 origin、同一 API 地址下复用身份，可删除自己的评论、点赞和取消点赞。清除浏览器数据、更换浏览器或改变域名后是新身份；昵称、邮箱和 IP 均不能用于认领原来的评论。没有账户恢复或跨设备同步。

localStorage 凭证可以被宿主脚本读取，因此宿主必须可信；它仅拥有访客权限，绝不能保存管理令牌。浏览器不能持久保存凭证时，写入会被阻止并保留草稿。

作者删除清空该条正文和个人信息，保留引用及幂等标识。其他人的回复仍在；空讨论串不再展示，仍有回复的根评论显示删除占位。删除占位不计入公开评论数。

## 提交、审核和分页

每次新提交带随机 `client_request_id`，数据库按作者和请求 ID 去重。超时重试沿用同一请求，改变正文或回复目标会生成新请求。相同请求 ID、不同内容返回 409。已删除评论保留去重记录，不会因旧请求重放而重新出现。

草稿与未确认提交保存在会话存储；成功后清理。发送成功直接合并到当前讨论串，不跳回第一页。列表同步失败与发表失败分别提示。昵称等选填资料使用独立本地缓存。

默认直接发布；`MODERATION_MODE=pre` 开启先审后发。作者可以在当前页面看到最近 20 条自己的待审核回执；其他访客看不到。管理员可发布、隐藏、标记垃圾、置顶、封禁身份和关闭单页评论。隐藏根评论隐藏整串；隐藏某条回复只隐藏该条，其他回复保留并将引用显示为不可用。

根列表按单调 sequence 倒序，回复按 sequence 正序；游标绑定页面或讨论串，并带创建水位。新发布内容刷新后进入当前分页，删除和审核状态仍会实时变化，不是完整历史快照。

## API

| 接口                                                    | 行为                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| GET /api/config                                         | 公开配置                                                     |
| GET /api/comments?path=/post&limit=10&cursor=…          | 根评论、置顶、回复预览、公开总数                             |
| GET /api/threads/:rootId/replies?cursor=…&limit=20      | 回复分页，最大 50 条                                         |
| GET /api/comments/:id/context                           | 首屏回复预览加定位目标，保持后续回复可加载                   |
| POST /api/comments                                      | 创建评论或回复，必须提供匿名 Bearer 凭证和 client_request_id |
| PUT /api/comments/:id/like                              | 确保已点赞                                                   |
| DELETE /api/comments/:id/like                           | 确保已取消点赞                                               |
| DELETE /api/comments/:id                                | 删除自己的内容                                               |
| GET /api/comments/count?paths[]=/a&paths[]=/b           | 最多 50 个路径的公开计数                                     |
| GET /api/me                                             | 当前匿名身份状态                                             |
| GET /api/me/comments?path=/post&status=pending&before=… | 当前作者的私有列表                                           |
| GET /api/admin/comments                                 | 管理列表，支持 path/status/before                            |
| POST /api/admin/comments                                | 管理员发表或回复，作者由服务端确定                           |
| PATCH /api/admin/comments/:id                           | 审核状态或置顶                                               |
| DELETE /api/admin/comments/:id                          | 管理员删除单条内容                                           |
| PATCH /api/admin/identities/:id                         | active/blocked                                               |
| PATCH /api/admin/pages                                  | 页面评论开关                                                 |
| GET /api/admin/notifications                            | 通知任务状态                                                 |

公开 API 不暴露邮箱、UA 原文、作者数据库 ID、token 摘要、请求摘要和 Markdown 原文。管理接口只接受管理 Bearer 令牌，管理页仅在内存保存。所有响应默认 no-store，防止带访问者权限的响应被共享缓存。

路径以 `/` 开头，不含查询参数、片段、反斜杠和空白；末尾 index.html/index.htm 统一移除，其他尾斜杠、大小写不自动合并。输入限制：昵称 80、标题 200、正文 20,000、邮箱 254、网址 2,048、路径 1,024 字符；请求体 128 KiB。

## 文章列表计数

```html
<span class="hitalk-comment-count" data-xid="/posts/hello/">—</span>
<script>
  Hitalk.fillCommentCounts({
    server: 'https://comments.example.com/api',
  }).catch(console.error)
</script>
```

独立计数 API 不创建编辑器，自动合并路径并按 50 个分批查询；失败保留原文本。也可使用 `getCommentCounts` 和 `normalizePagePath`。

## 检查与维护

```sh
pnpm dev          # 前后端联调，自动准备本地环境
pnpm build        # SDK、Worker dry-run、前端全部构建
pnpm test         # 常规自动化测试，先构建 SDK 发布产物
pnpm check        # lint、格式、类型、测试和覆盖率
pnpm check:ci     # 完整检查，追加 Worker 集成测试及前后端构建
pnpm run deploy   # 完整检查、生产迁移、Worker 部署、触发 Pages 发布
```

常规测试包括真实 workerd/D1、SDK jsdom、管理页、IIFE/ESM/声明、seed 和备份恢复。独立 Worker 测试在临时目录启动 Wrangler 并导出/恢复备份，不读取现有数据库或邮件凭据。视觉与布局验收由用户完成。

部署前先提交并推送到 main，Pages 发布的是远端 main；`pnpm deploy` 是 pnpm 内置命令，项目部署必须写 `pnpm run deploy`。单项命令与部署配置、邮件和备份见 [运维说明](docs/operations.md)，模块职责和数据不变量见 [架构说明](docs/architecture.md)，实现范围见 [路线图](docs/roadmap.md)。
