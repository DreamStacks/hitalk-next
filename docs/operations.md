# 开发、部署与维护

## 数据库

当前 migrations/0001_initial.sql 是全新结构，只用于新数据库。Wrangler 本地绑定使用 hitalk-fresh 和独立数据库 ID；原来的本地文件不会被删除。生产绑定使用独立的新库 hitalk-next-v3，旧库 hitalk-next 保留。其他部署环境应先创建空库并填写自己的绑定 ID。不要将这份初始化结构直接应用到旧库。

本地：

```sh
pnpm dev:setup
pnpm db:seed
pnpm dev
```

当前部署使用已配置的生产绑定和 secrets；新部署环境先创建空库、修改绑定和域名，再设置 secrets。`pnpm deploy:server` 自动先运行 `db:migrate:remote`，再发布 Worker。仓库检查仅 dry-run，不自动部署；不删除已有数据库。

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

当前生产配置 EMAIL_ENABLED=true；Resend 密钥、发件人、通知邮箱和站点名称通过 Worker secrets 配置，与本地私有邮件配置一致。SITE_URL 指向博客 https://blog.ihoey.com，NOTIFICATION_API_URL 指向生产 Worker。新部署须先配置自己的邮件凭据再启用。本地 .dev.vars 已包含邮件配置，EMAIL_ENABLED 默认保持 false，避免开发操作发送真实通知。

Cloudflare secrets 无法读回原值。当前 ADMIN_TOKEN 与本地 apps/server/.env、apps/server/.dev.vars 一致；从私有文件复制其值登录管理页。若遗失全部副本，使用 `pnpm --filter @hitalk/server exec wrangler secret put ADMIN_TOKEN --env production` 交互式重设，并同步更新本地私有文件；旧 token 随即失效。不要将 token 提交到 Git 或放入 URL。

启用邮件但投递配置暂缺时保留待处理任务；从管理接口查看 pending/sending/sent/failed/cancelled。sent 仅代表服务商接受。未验证访客邮箱不能当作身份凭据。退订入口为邮件中的随机能力链接，GET 只展示确认表单，POST 写入抑制列表。

## 静态前端

```sh
VITE_API_URL=https://comments.example.com/api VITE_PAGE_PATH=/ pnpm build:web
pnpm preview:web
```

当前前端为 https://hitalk-next.ihoey.com，API 为 https://hitalk-next-api.ihoey.com/api。GitHub Pages 工作流读取仓库变量 HITALK_API_URL，缺失时构建步骤拒绝发布。API 和前端可分开托管。用户负责视觉验收。

## 检查与备份

```sh
pnpm check
pnpm check:ci
```

test:worker 在临时目录应用迁移两次、启动本地 Wrangler，验证 HTTP、并发幂等和点赞、删除保留回复，然后导出 SQL 并恢复到临时 SQLite。结束后清理测试进程和临时目录。

从根目录使用 `pnpm db:backup --output /absolute/path/local.sql` / `pnpm db:backup:remote --output /absolute/path/production.sql` 导出 SQL，并通过 `pnpm db:verify-backup /absolute/path/to/backup.sql` 验证。校验包括 SQLite 完整性、外键、同页同串/顺序关系、可见性视图和约束触发器。包含邮箱及身份凭证摘要的备份应作为私有数据保存。

生产上线后若未来再更改结构，使用新的增量迁移；本次重置初始化结构的前提是项目尚未上线。当前不提供旧库导入器、旧 API 或双版本字段兼容。

## 命令入口

以下命令都在仓库根目录执行。workspace 保留所属工具的具体命令，根目录负责组合，不需要记住 filter 参数。

| 命令                                                      | 用途                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm dev`                                                | 初始化本地环境，启动 Worker 和 Vite，任一退出时关闭另一进程                   |
| `pnpm dev:setup`                                          | 只生成缺失的本地 secrets，并应用本地迁移；不覆盖已有 secrets                  |
| `pnpm dev:server` / `pnpm dev:web`                        | 单独启动后端 / 前端；首次使用先执行 dev:setup                                 |
| `pnpm dev:sdk`                                            | 监听并构建 SDK 发布产物；示例页联调使用 dev，无需额外启动它                   |
| `pnpm build`                                              | 构建 SDK、Worker 和静态前端                                                   |
| `pnpm build:sdk` / `pnpm build:server` / `pnpm build:web` | 单独构建；Worker build 为 dry-run                                             |
| `pnpm preview:web`                                        | 预览已生成的前端，127.0.0.1:4173；不会自动构建                                |
| `pnpm test`                                               | 先构建 SDK，再运行常规测试；可追加测试文件名等 Vitest 参数                    |
| `pnpm test:watch`                                         | 先构建 SDK，再监听测试；发布产物有变化时重新执行 test                         |
| `pnpm test:coverage`                                      | 复用 test 入口并启用覆盖率检查                                                |
| `pnpm test:worker`                                        | 独立 Wrangler + 临时 D1 的真实 HTTP 集成测试                                  |
| `pnpm lint` / `pnpm lint:fix`                             | 类型感知 lint / 自动修复                                                      |
| `pnpm format` / `pnpm format:check`                       | 格式化 / 只检查格式                                                           |
| `pnpm typecheck`                                          | 服务端、SDK、示例及工具的 TypeScript 检查                                     |
| `pnpm check`                                              | 日常检查：lint、格式、类型、测试和覆盖率                                      |
| `pnpm check:ci`                                           | 完整检查：check、Worker 集成测试、Worker 和前端构建                           |
| `pnpm run deploy`                                         | check:ci → 生产迁移 → Worker 发布 → 触发 Pages 工作流                         |
| `pnpm deploy:server`                                      | 生产迁移和 Worker 发布，不重复执行测试                                        |
| `pnpm deploy:web`                                         | 触发远端 main 的 Pages 工作流；工作流自行检查和构建                           |
| `pnpm logs:server`                                        | 订阅生产 Worker 实时日志，Ctrl+C 退出                                         |
| `pnpm db:migrate` / `pnpm db:migrate:remote`              | 应用本地 / 生产迁移                                                           |
| `pnpm db:seed`                                            | 准备本地环境并写入可重复执行的虚构演示数据，仅本地                            |
| `pnpm db:backup` / `pnpm db:backup:remote`                | 导出本地 / 生产 SQL，追加 `--output` 指定绝对路径                             |
| `pnpm db:verify-backup <文件>`                            | 在临时内存库恢复备份并校验                                                    |
| `pnpm clean`                                              | 删除 dist、SDK/Worker dist 和 coverage；保留 .wrangler 数据库、secrets 和依赖 |

`prepare` 是安装依赖时启用 Husky 的生命周期脚本，无需手动执行。已移除重复的 `db:init` 和未使用的 `cf-typegen`；服务端绑定类型由 src/types.ts 维护。

## 发布流程

先完成提交并推送到 main，再执行：

```sh
pnpm run deploy
```

需要 Wrangler 已登录 Cloudflare、`gh` 已登录目标 GitHub 仓库，且 Pages 设置为 GitHub Actions 来源，仓库变量 HITALK_API_URL 已配置。Worker 发布本地代码，Pages 发布远端 main，因此部署前必须保证两者为同一提交。部署脚本不会自动提交或推送。

必须保留 `run`：`pnpm deploy` 是 pnpm 自带的部署目录命令，与项目脚本不是一回事。`deploy:web` 触发后返回工作流链接，前端是否发布成功以该工作流结果为准，可用 `gh run watch <运行 ID> --exit-status` 等待；失败时不会把触发成功当成发布成功。

`preview:web` 没有开发代理。预览构建时应设置 VITE_API_URL；Pages 工作流始终使用 HITALK_API_URL。只改前端可执行 deploy:web，只改 Worker 可执行 deploy:server；这两个快捷入口不运行本地 check:ci。
