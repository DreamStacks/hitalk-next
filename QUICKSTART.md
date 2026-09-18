# 本地快速开始

需要 Node.js 22.22.2+（22 LTS）和 pnpm 10.28.2。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

首次启动自动生成 `apps/server/.dev.vars` 中的随机本地令牌与 IP 盐，已有配置保留；应用本地 D1 迁移后同时启动 Vite 和 Wrangler。新配置默认不启用邮件。

- 示例页面：[http://127.0.0.1:5173](http://127.0.0.1:5173)，源码在 `examples/playground/`
- 管理页面：[http://127.0.0.1:8787/admin](http://127.0.0.1:8787/admin)，使用 `.dev.vars` 中的 `ADMIN_TOKEN` 登录
- API 健康检查：[http://127.0.0.1:8787](http://127.0.0.1:8787)

保存 CSS 即时更新；修改 SDK TypeScript 后自动重新挂载并保留未提交的输入，回复目标和分页会重置。修改示例 HTML 会整页刷新。后端代码修改由 Wrangler 自动重载。当前示例固定连接线上 API 并读取 `/`，页面提交和点赞会作用于线上数据；本地后端改动需要将 `examples/playground/main.ts` 的 `server` 切到 `/api` 后才能在页面验证。Ctrl+C 同时停止两个服务。

开发时可另开终端运行 `pnpm test:watch`。仅启动前端/后端可使用 `pnpm dev:web` / `pnpm dev:server`，首次单独启动前执行 `pnpm dev:setup`。

发布产物使用 `pnpm build` 构建，浏览器入口是 `Hitalk.mount()`，CSS 需要单独引入。SPA 卸载时调用返回实例的 `destroy()`。

需要演示数据时，在根目录执行：

```sh
pnpm db:seed
```

向本地 `/playground` 导入 12 条根评论、4 条回复和 10 条点赞，包含置顶、Markdown、表情、长文与分页场景。数据均为虚构；重复执行不会重复插入或覆盖已有评论。该命令只操作本地 D1，不会发送邮件。数据源为 `examples/playground/seed.sql`。当前示例连接线上 API 且读取 `/`，刷新不会显示这些本地数据；查看 seed 需将示例 `server` 切到 `/api`，`path` 设为 `/playground`。

验证当前代码：

```sh
pnpm check
pnpm --filter @hitalk/server build
pnpm test:worker
```

部署前请阅读 [运维与迁移说明](docs/operations.md)。迁移和 seed 命令默认只操作本地 D1；当前示例页面仍连接生产 API，需区分这两类数据来源。
