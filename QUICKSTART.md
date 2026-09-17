# 本地快速开始

需要 Node.js 22.22.2+（22 LTS）和 pnpm 10.28.2。

```sh
pnpm install --frozen-lockfile
cp apps/server/.dev.vars.example apps/server/.dev.vars
```

修改 `.dev.vars` 中的 `ADMIN_TOKEN` 和 `IP_HASH_SALT` 为两个不同的随机值。邮件配置可以留空。

```sh
pnpm --filter @hitalk/server db:init
pnpm --filter @hitalk/server dev
```

另一个终端：

```sh
pnpm build
python3 -m http.server 8080
```

- 示例页面：`http://localhost:8080/test.html`
- 管理页面：`http://localhost:8787/admin`，输入令牌登录
- API 健康检查：`http://localhost:8787/`

浏览器入口是 `Hitalk.mount()`。CSS 需要单独引入。SPA 卸载时调用返回实例的 `destroy()`。

验证当前代码：

```sh
pnpm check
pnpm --filter @hitalk/server build
pnpm test:worker
```

部署前请阅读 [运维与迁移说明](docs/operations.md)。命令默认不会修改生产数据库；不要将本地测试环境当成已部署环境。
