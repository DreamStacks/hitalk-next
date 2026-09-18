# 快速开始

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://127.0.0.1:5173`。本地页面连接本地 `/api`，使用 `/playground` 评论区。可执行 `pnpm db:seed` 加载虚构数据。

管理页面为 `http://127.0.0.1:8787/admin`，使用 `apps/server/.dev.vars` 中自动生成的 ADMIN_TOKEN。不要把此令牌放入博客页面或 SDK。

第一次发送前浏览器自动创建并持久保存匿名身份，无需注册、无需验证码。该浏览器可删除自己的评论及取消点赞。清空浏览器数据后无法认领旧身份。

测试使用 `pnpm check` 与 `pnpm test:worker`。视觉验收由你在本地示例或真实博客页面完成。

这是全新 schema，不连接旧库运行。生产数据库 ID 保留为占位，部署前创建新库并配置，详见 [运维说明](docs/operations.md)。
