# Hitalk v2

面向单个博客的轻量、自托管评论系统。后端使用 Cloudflare Workers + D1，前端是可嵌入页面的 TypeScript SDK。

目前支持评论、两级显示的回复树、点赞、置顶/删除、邮件通知、表情和明暗主题。当前开发重点是稳定性；登录系统、更多插件和复杂管理后台暂缓。

## 本地开发

使用 Node.js 22.22.2+（22 LTS）和 pnpm 10.28.2。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 自动创建缺失的 `apps/server/.dev.vars`（随机本地管理员令牌与 IP 盐，默认关闭邮件），保留已有配置，并应用本地 D1 迁移，然后同时启动：

- 开发示例：[http://127.0.0.1:5173](http://127.0.0.1:5173)，入口为 `examples/playground/index.html`。
- Worker API：[http://127.0.0.1:8787](http://127.0.0.1:8787)。管理页为 `/admin`，令牌从本地 `.dev.vars` 的 `ADMIN_TOKEN` 读取。

前端直接加载 SDK 源码，无需先构建：CSS 保存后即时更新；TS 保存后自动销毁并重新挂载评论组件，保留未提交的昵称、邮箱、网址和正文。重新挂载会重置回复目标和分页；HTML 修改触发整页刷新。后端由 Wrangler 自动重载，请求经前端 `/api` 代理到本地 Worker；后端修改后重新触发请求即可看到结果。

按 Ctrl+C 一起停止服务；任一服务退出会结束另一服务。前端端口固定为 5173，避免端口被占用时悄悄切换。开发数据保留在本地 D1，下次启动不会清空。

也可分开运行 `pnpm dev:server`、`pnpm dev:web`；首次单独启动前执行 `pnpm dev:setup`。SDK 发布产物仍使用 `pnpm build`，若需持续构建产物则执行 `pnpm --filter @hitalk/sdk dev`。自动化测试监听使用 `pnpm test:watch`。

需要演示数据时，在根目录执行：

```sh
pnpm db:seed
```

向本地 `/playground` 导入 12 条根评论、4 条回复和 10 条点赞，包含置顶、Markdown、表情、长文与分页场景。数据均为虚构；重复执行不会重复插入或覆盖已有评论。该命令只操作本地 D1，不会发送邮件。刷新示例页即可看到结果；数据源为 `examples/playground/seed.sql`。

## 嵌入 SDK

同时托管构建生成的 `hitalk.js` 和 `hitalk.css`：

```html
<link rel="stylesheet" href="/assets/hitalk.css" />
<div id="comments"></div>
<script src="/assets/hitalk.js"></script>
<script>
  const comments = Hitalk.mount('#comments', {
    server: 'https://your-worker.workers.dev',
    path: location.pathname,
    title: document.title,
    pageSize: 10,
    avatar: 'mm',
    guestFields: ['nick', 'email', 'website'],
  })
  // SPA 页面卸载前调用 comments.destroy()
  // 重新读取第一页调用 await comments.refresh()
</script>
```

`pageSize` 为每页根评论数（1–50），每个根评论携带全部回复。SDK 提供“加载更多”。回复显示“回复 @昵称”，点击可定位并展开实际被回复的评论；多层回复仍平铺为第二层，定位不会清空草稿。

`guestFields` 默认显示昵称、邮箱、网址，可按数组顺序选择，例如 `['nick', 'email']` 隐藏网址，`[]` 隐藏全部访客字段。隐藏字段不会从缓存提交；隐藏昵称时使用 `Guest`。这是界面配置，服务端仍按统一规则校验请求。

`path` 应是以 `/` 开头的页面路径，不包含查询参数、片段或空白；同一个 Worker 对应一个站点。SDK 的显式/默认路径、服务端读取/提交/计数都将末尾 `/index.html`、`/index.htm` 归一化为 `/`，例如 `/posts/index.html` 与 `/posts/` 共用评论。`/posts` 与 `/posts/` 仍是不同路径，大小写和编码不自动改写。

SDK 同时产出 ESM、可直接通过 script 加载的 IIFE 和独立类型声明。npm 消费方式：

```ts
import { mount } from '@hitalk/sdk'
import '@hitalk/sdk/hitalk.css'
```

SDK 使用 lit-html 管理模板与局部 DOM 更新，渲染器已包含在 ESM/IIFE 产物中，无需宿主单独加载。接入 React 时在 effect 中挂载并在清理函数中销毁；Vue 使用 onMounted/onBeforeUnmount；Hexo 等静态站点使用上面的 script 方式。宿主框架只管理挂载容器，不渲染容器内部内容。

ESM 可在没有 DOM 的服务端环境导入，但 mount 只能在浏览器执行；SDK 不提供服务端评论渲染或 hydration。SPA 切换文章路径时销毁并重新挂载，refresh 只刷新当前路径。

构建产物可打包，但本仓库的构建和检查命令不会发布 npm 包。

### 文章列表评论数

无需挂载评论编辑器。给文章计数元素设置路径，在列表渲染完成后调用（需先加载 SDK 脚本）：

```html
<span class="hitalk-comment-count" data-xid="/posts/hello/index.html">—</span>
<script>
  Hitalk.fillCommentCounts({ server: 'https://your-worker.workers.dev' }).catch(
    console.error
  )
</script>
```

`fillCommentCounts` 自动扫描并填充计数，默认扫描 document，也可传入 `root` 限定列表容器。自动合并重复路径，每批最多查询 50 个路径；全部请求成功后更新文本，失败时保留原文并拒绝 Promise。SPA 列表切换后重新调用，未查询到评论的页面显示 `0`。若只需要数据：

```ts
import {
  getCommentCounts,
  fillCommentCounts,
  normalizePagePath,
} from '@hitalk/sdk'

const counts = await getCommentCounts('https://your-worker.workers.dev', [
  '/posts/hello/index.html',
])
console.log(counts['/posts/hello/']) // 返回值使用归一化后的路径作为键
await fillCommentCounts({
  server: 'https://your-worker.workers.dev',
  root: document.querySelector('#articles')!,
})
normalizePagePath('/posts/hello/index.htm') // /posts/hello/
```

`normalizePagePath` 也可供未来导入工具使用。含查询参数或片段的路径会抛错，导入前应显式确认其归属；本次规则不会自动合并数据库里已经存在的页面。

### 评论正文

支持 Markdown 表格（含列对齐）、分隔线、有序列表起始序号、代码、引用、图片及表情。表格在窄屏内横向滚动。正文网页链接（包括相对路径）在新标签页打开并带 `nofollow noopener noreferrer`；`#片段` 保留页内跳转，邮件链接保留原行为。所有正文仍经过服务端清洗，不支持直接输入 HTML。

## API 契约

| 接口                                          | 行为                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /comments?path=/post&page=1&pageSize=10` | 根评论分页、完整回复、总评论数及 `pagination.has_more`；读取不会创建页面               |
| `POST /comments`                              | 创建评论；请求包含 `path / nick / content`，可选 `title / email / website / parent_id` |
| `POST /comments/:id/like`                     | 同一 IP 标识重复点赞返回 `success: false`，不增加计数                                  |
| `GET /comments/count?paths[]=/a&paths[]=/b`   | 批量计数，每次 1–50 个路径                                                             |
| `PUT /comments/:id/pin`                       | 管理员置顶，JSON 为 `{ "is_pinned": true }`                                            |
| `DELETE /comments/:id`                        | 管理员删除评论及全部后代回复，同时维护计数                                             |
| `GET /admin/api/comments?page=1&pageSize=50`  | 管理员分页查询，返回 `{ comments, has_more }`                                          |

管理接口仅接受 `Authorization: Bearer <ADMIN_TOKEN>`。未配置令牌时拒绝管理访问；URL 中的 token 不再支持。

公开响应只含展示字段；不返回邮箱、原始 UA、IP 标识、Markdown 原文或数据库页面 ID。头像使用服务端生成的 `avatar_hash`；昵称不再链接到邮箱。邮箱仍保存在数据库，用于可选的回复通知；保存请求头中的 UA（最多 2,048 字符），用于展示浏览器与操作系统；不存储评论 IP 或 HTML 副本。公开的可选 `client` 字段包含 `browser` 与 `os` 展示文本；UA 缺失或未知时不展示，UA 不能作为可信身份或精确设备信息。头像摘要不是匿名化保证，Gravatar/CDN 仍是第三方服务。

输入限制：昵称 80 字符、标题 200、正文 20,000、邮箱 254、网址 2,048、路径 1,024；请求体最多 128 KiB。网址仅允许无用户名/密码的 HTTP/HTTPS 地址。回复必须属于同一页面，最大链长 8 条（含根评论，为 D1 级联删除保留触发器深度余量）。

## 检查与交付

```sh
pnpm check                         # 类型感知 Lint、格式、类型检查、构建、测试及覆盖率
pnpm --filter @hitalk/server build # Worker 打包检查，不部署
pnpm test:worker                   # 隔离的真实 Worker/D1 集成与备份恢复演练
```

CI 执行上述三项。`test:worker` 创建临时配置和本地数据库，使用测试令牌，不访问现有数据库、不发送邮件，结束后清理临时文件。

Vitest 统一运行测试：后端在 workerd + 本地 D1 中执行，前端在 jsdom 中验证源码交互与 IIFE 产物，备份在 Node SQLite 中独立恢复。测试覆盖鉴权、字段泄漏、输入校验、计数、回复归属、XSS、SDK 状态/销毁及发布包类型。`test:worker` 使用独立的 Vitest 集成测试配置，验证完整 Wrangler 启动、迁移和备份导出链路，并在测试结束或失败时清理进程与临时目录。

`pnpm test:watch` 进入交互测试；`pnpm test:coverage` 生成 `coverage/index.html`。覆盖率门槛为行 85%、语句/函数 80%、分支 60%。测试只使用固定假令牌和临时本地数据，不读取开发邮件密钥。

## 部署与维护

开发示例可单独构建为静态前端，由 GitHub Pages 托管，后端继续运行在 Cloudflare Workers + D1：

```sh
pnpm build:web    # 输出 dist/web
pnpm preview:web # 本地预览生产构建 http://127.0.0.1:4173
```

开发模式默认通过 `/api` 访问本地 Worker；生产构建默认直连 `https://hitalk-next-api.ihoey.com`。构建时可用 `VITE_API_URL` 覆盖公开的 API 地址，不要将管理令牌或其他密钥放入 `VITE_` 环境变量。资源使用相对路径，同时适用于 GitHub 项目子路径与独立域名；评论页面标识保持 `/playground`。

仓库包含手动触发的 `Deploy frontend to GitHub Pages` 工作流，检查通过后仅上传 `dist/web`。启用 Pages 的 GitHub Actions 发布源后，从 Actions 选择 `main` 运行该工作流。当前仓库为私有仓库，组织使用 Free 计划，需先解决 Pages 套餐/仓库可见性限制；完整步骤见 [运维说明](docs/operations.md#github-pages-前端)。

首次部署和备份恢复请阅读 [运维说明](docs/operations.md)。项目尚未上线，不提供旧 API、旧 SDK 或历史数据兼容。

配置说明见 [后端 README](apps/server/README.md)。本地迁移默认使用 `--local`，生产变更使用明确带 `:remote` 的命令。

## 架构与范围

```text
apps/server/src/routes/    请求校验、鉴权与响应
apps/server/src/lib/       数据访问、公开字段映射、Markdown、插件调用
apps/server/src/plugins/   可选邮件通知
apps/server/migrations/    版本化数据库结构、约束和计数触发器
packages/shared/          公开 API 类型与 Valibot 输入校验
packages/sdk/src/         请求、状态、渲染与组件生命周期
examples/playground/      Vite 开发示例、热更新入口
tests/                    Vitest：SDK、发布产物、后端、备份和真实 CLI 集成
scripts/                  本地开发初始化与备份恢复校验 CLI
```

技术栈版本与取舍见 [依赖决策](docs/dependencies.md)，架构与剩余限制见 [维护说明](docs/architecture.md)。邮件为尽力发送，尚无持久队列、自动重试或投递状态；匿名提交尚无限流、验证码与审核，开放到公网前应配置入口防滥用。分页限制根评论数，不限制单个讨论串的回复数量。Markdown 是唯一持久化的评论内容。
