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

保存 CSS 即时更新；修改 SDK TypeScript 后自动重新挂载并保留未提交的输入，回复目标和分页会重置。修改示例 HTML 会整页刷新。后端代码修改由 Wrangler 自动重载。Ctrl+C 同时停止两个服务。

开发时可另开终端运行 `pnpm test:watch`。仅启动前端/后端可使用 `pnpm dev:web` / `pnpm dev:server`，首次单独启动前执行 `pnpm dev:setup`。

发布产物使用 `pnpm build` 构建，浏览器入口是 `Hitalk.mount()`，CSS 需要单独引入。SPA 卸载时调用返回实例的 `destroy()`。

验证当前代码：

```sh
pnpm check
pnpm --filter @hitalk/server build
pnpm test:worker
```

部署前请阅读 [运维与迁移说明](docs/operations.md)。命令默认不会修改生产数据库；不要将本地测试环境当成已部署环境。
