# Hitalk API

Hono + Cloudflare Workers + D1。数据库绑定统一为 `DB`。`wrangler.jsonc` 的默认配置保留原有 ID，供本地开发使用；`env.production` 使用独立的 `hitalk-next` 数据库。生产部署、迁移、备份脚本显式选择 production，本地开发不连接远程库。其他部署者应替换为自己的 D1 ID。

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

本地从 `.dev.vars.example` 复制 `.dev.vars`；所有 `.dev.vars*` 和 `.env*` 私有配置由根 `.gitignore` 统一排除，仅保留 `.dev.vars.example` / `.env.example` 模板。生产密钥用 `wrangler secret put NAME --env production` 配置。邮件需同时配置有效 `RESEND_API_KEY / EMAIL_FROM / SITE_URL`，不再硬编码个人发件域名。密钥不要放入 URL。

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
pnpm run deploy          # 真正部署；run 避免调用 pnpm 自带的 deploy 命令
```

结构只通过 `migrations/*.sql` 演进。已经执行的迁移不可修改；新改动新增文件。计数由触发器维护，业务代码不得重复增减计数。具体部署和恢复步骤见 [运维说明](../../docs/operations.md)。
