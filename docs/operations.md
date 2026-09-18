# 开发、部署与维护

## 数据库

当前 migrations/0001_initial.sql 是全新结构，只用于新数据库。Wrangler 本地绑定使用 hitalk-fresh 和独立数据库 ID；原来的本地文件不会被删除。生产绑定使用独立的新库 hitalk-next-v3，旧库 hitalk-next 保留。其他部署环境应先创建空库并填写自己的绑定 ID。不要将这份初始化结构直接应用到旧库。

本地：

```sh
pnpm dev:setup
pnpm db:seed
pnpm dev
```

远端部署由维护者选择时机执行：先创建空库并配置生产绑定，设置生产 secrets，再运行 db:migrate:remote 和 deploy。仓库检查仅 dry-run，不自动部署。数据库为空或独立重建不表示可以自动删除已有数据。

## 配置

| 配置                 | 用途                                                                |
| -------------------- | ------------------------------------------------------------------- |
| ADMIN_TOKEN          | 独立随机管理密钥，仅管理页内存使用                                  |
| IP_HASH_SALT         | 独立随机 IP 摘要盐，不与管理密钥共用                                |
| RATE_LIMIT_ENABLED   | 默认 true；本地隔离测试显式 false                                   |
| WRITE_LIMITER        | Wrangler 已配置 30 次/60 秒；按身份/IP 分别调用                     |
| COMMENTS_ENABLED     | false 关闭全站新评论，读取继续可用                                  |
| MODERATION_MODE      | post 直接发布；pre 先审后发                                         |
| EMAIL_ENABLED        | 只有 true 才创建/处理邮件任务，默认关闭                             |
| RESEND_API_KEY       | 邮件服务凭据                                                        |
| EMAIL_FROM           | 已验证的发件人                                                      |
| ADMIN_EMAIL          | 可选博主通知邮箱                                                    |
| EMAIL_NAME           | 邮件主题中的站点名称                                                |
| SITE_URL             | 博客源站 URL，用于文章链接                                          |
| NOTIFICATION_API_URL | Worker 公开 origin，例如 https://comments.example.com，用于退订链接 |

敏感值通过本地 .dev.vars 或生产 secrets 管理，不提交仓库。测试环境使用假令牌和测试限流策略，不加载开发邮件设置。

匿名频控按 Cloudflare 位置执行、最终一致，属于防滥用保护。IP 只以带盐摘要参与频控，不存入评论表；token 本身不能证明真人。限流依赖缺失时写入返回 503，不静默失效。

当前生产配置 EMAIL_ENABLED=false；配置 Resend 发件凭据和已验证发件人，并用受控收件人验证真实投递后再启用。启用邮件但投递配置暂缺时保留待处理任务；从管理接口查看 pending/sending/sent/failed/cancelled。sent 仅代表服务商接受。未验证访客邮箱不能当作身份凭据。退订入口为邮件中的随机能力链接，GET 只展示确认表单，POST 写入抑制列表。

## 静态前端

```sh
VITE_API_URL=https://comments.example.com/api VITE_PAGE_PATH=/ pnpm build:web
pnpm preview:web
```

当前前端为 https://hitalk-next.ihoey.com，API 为 https://hitalk-next-api.ihoey.com/api。GitHub Pages 工作流读取仓库变量 HITALK_API_URL，缺失时构建步骤拒绝发布。API 和前端可分开托管。用户负责视觉验收。

## 检查与备份

```sh
pnpm check
pnpm test:worker
pnpm --filter @hitalk/server build
pnpm build:web
```

test:worker 在临时目录应用迁移两次、启动本地 Wrangler，验证 HTTP、并发幂等和点赞、删除保留回复，然后导出 SQL 并恢复到临时 SQLite。结束后清理测试进程和临时目录。

使用后端 db:backup:local / db:backup:remote 脚本导出 SQL，并通过 `pnpm db:verify-backup /absolute/path/to/backup.sql` 验证。校验包括 SQLite 完整性、外键、同页同串/顺序关系、可见性视图和约束触发器。包含邮箱及身份凭证摘要的备份应作为私有数据保存。

生产上线后若未来再更改结构，使用新的增量迁移；本次重置初始化结构的前提是项目尚未上线。当前不提供旧库导入器、旧 API 或双版本字段兼容。
