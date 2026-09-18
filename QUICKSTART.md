# 快速开始

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开 `http://127.0.0.1:5173`。本地页面连接本地 `/api`，使用 `/playground` 评论区。可执行 `pnpm db:seed` 加载虚构数据。

管理页面为 `http://127.0.0.1:8787/admin`，使用 `apps/server/.dev.vars` 中自动生成的 ADMIN_TOKEN。不要把此令牌放入博客页面或 SDK。

第一次发送前浏览器自动创建并持久保存匿名身份，无需注册、无需验证码。该浏览器可删除自己的评论及取消点赞。清空浏览器数据后无法认领旧身份。

日常检查使用 `pnpm check`，完整验证使用 `pnpm check:ci`，全部构建使用 `pnpm build`。视觉验收由你在本地示例或真实博客页面完成。

提交并推送到 main 后，使用 `pnpm run deploy` 发布。需要已登录的 Wrangler、GitHub CLI，以及已配置的 Pages 仓库变量。当前生产使用独立的 hitalk-next-v3 数据库，旧库保留；其他环境使用自己的空库和域名。完整命令见 [运维说明](docs/operations.md)。
