# Hitalk API

Hono + Cloudflare Workers + D1。数据库唯一绑定是 `DB`。`wrangler.jsonc` 保留仓库原有的实际数据库 ID，其他部署者应替换为自己的 D1 ID；本地开发没有远程绑定。

## 环境变量

| 变量             | 用途                                                                |
| ---------------- | ------------------------------------------------------------------- |
| `ADMIN_TOKEN`    | 管理令牌；缺失或空值会禁用管理访问                                  |
| `IP_HASH_SALT`   | 点赞所需的独立随机密钥，用 HMAC-SHA256 生成 IP 标识；缺失返回 503   |
| `RESEND_API_KEY` | 可选，未配置则不发送邮件                                            |
| `EMAIL_FROM`     | 邮件发件人，如 `My Blog <comments@example.com>`，需在邮件服务商验证 |
| `ADMIN_EMAIL`    | 接收新评论通知的管理员邮箱                                          |
| `EMAIL_NAME`     | 邮件标题中的站点名，默认 Hitalk                                     |
| `SITE_URL`       | 博客 HTTP/HTTPS 地址，用于通知链接                                  |

本地从 `.dev.vars.example` 复制 `.dev.vars`；后者已忽略提交。生产密钥用 `wrangler secret put` 配置。邮件需同时配置有效 `RESEND_API_KEY / EMAIL_FROM / SITE_URL`，不再硬编码个人发件域名。密钥不要放入 URL。

## 命令

```sh
pnpm dev                 # 本地 Worker
pnpm typecheck
pnpm build               # deploy --dry-run，仅打包
pnpm db:init             # 应用全部本地迁移
pnpm db:migrate          # 应用未执行的本地迁移
pnpm db:migrate:remote   # 应用未执行的生产迁移
pnpm db:backup:local --output=/absolute/path/backup.sql
pnpm db:backup:remote --output=/absolute/path/backup.sql
pnpm deploy              # 真正部署，须先完成数据库升级与配置
```

结构只通过 `migrations/*.sql` 演进。已经执行的迁移不可修改；新改动新增文件。计数由触发器维护，业务代码不得重复增减计数。具体部署和恢复步骤见 [运维说明](../../docs/operations.md)。
