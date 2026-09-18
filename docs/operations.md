# 部署与备份恢复

当前前端、API 和独立 D1 已部署；旧系统评论已完成一次性导入，不维护旧 API/SDK 兼容层。生产命令需要在确认目标数据库后执行；自动化集成测试只使用隔离的本地数据库。

## GitHub Pages 前端

前端构建入口是 `examples/playground`，输出目录为 `dist/web`，不会包含后端配置、本地数据库或 `.dev.vars`。GitHub Pages 只托管静态页面，评论数据始终由 Cloudflare API 提供。

1. 检查仓库是否支持 Pages。GitHub Free 组织只支持公开仓库；私有仓库需要 Team/Enterprise 等适用计划。不要为了启用 Pages 自动公开源码，须由仓库所有者决定。参见 [GitHub Pages 可用范围](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)。
2. 在仓库 Settings → Pages 中将 Source 设置为 GitHub Actions。
3. 在 Actions 中选择 `Deploy frontend to GitHub Pages`，选择 `main`，点击 Run workflow。工作流执行完整检查、构建和部署；普通 push 只做 CI 检查，不自动发布。
4. 当前前端域名为 `https://hitalk-next.ihoey.com/`，默认项目地址 `https://dreamstacks.github.io/hitalk-next/` 会跳转到新域名。前端使用相对资源路径，绑定自定义域名不需要修改资源前缀。

域名在仓库 Settings → Pages → Custom domain 中绑定为 `hitalk-next.ihoey.com`。Cloudflare DNS 使用 `CNAME hitalk-next → dreamstacks.github.io`，代理状态为「仅 DNS」，TTL 自动；GitHub 签发证书后启用 Enforce HTTPS。此仓库使用自定义 Actions 工作流，域名由 Pages 设置维护，无需向构建产物添加 `CNAME` 文件，参见 [GitHub 自定义域名文档](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)。

本地先运行 `pnpm build:web` 和 `pnpm preview:web` 预览生产构建。当前 API 固定为 `https://hitalk-next-api.ihoey.com`，页面标识为 `/`。`main.ts` 暂时注释了 `VITE_API_URL` 读取逻辑，Pages 工作流设置的同名变量因此不生效；修改 API 地址目前需改示例配置。恢复环境变量切换列在路线图中。

API 自定义域名由 Cloudflare 控制台管理，当前 Wrangler 不声明 `routes`，避免覆盖已有绑定。Worker 的根路径健康检查成功并不代表数据库已可用；还需确认 `/comments?path=/` 与 `/comments/count?paths[]=/` 返回 200，再验证前端读取和跨域请求。不要通过重置现有数据库来排查部署问题。

## 首次部署到新的环境

1. 在 `apps/server` 下创建生产 D1 数据库，将 ID 填入 `wrangler.jsonc` 的 `env.production.d1_databases`，绑定名必须为 `DB`。本项目生产库为 `hitalk-next`；默认配置用于本地开发，保留原有本地数据标识。其他部署者须替换生产数据库 ID。
2. 设置两个不同的随机密钥：

   ```sh
   pnpm --filter @hitalk/server exec wrangler secret put ADMIN_TOKEN --env production
   pnpm --filter @hitalk/server exec wrangler secret put IP_HASH_SALT --env production
   ```

3. 执行验证：

   ```sh
   pnpm check
   pnpm --filter @hitalk/server build
   pnpm test:worker
   ```

4. 初始化生产库：`pnpm --filter @hitalk/server db:migrate:remote`。
5. 部署 API：`pnpm --filter @hitalk/server run deploy`（必须保留 `run`，避免调用 pnpm 自带的同名命令）。
6. 托管本次构建的 SDK JS/CSS，在博客验证提交、回复、点赞、分页、管理删除与移动端。
7. 公网试运行前配置入口防滥用策略。需要邮件时设置 `RESEND_API_KEY / EMAIL_FROM / SITE_URL / ADMIN_EMAIL`，验证邮件域名及投递。

本地 Worker、迁移和 seed 命令默认只操作本地库；当前示例页面固定连接生产 API，页面写操作会作用于线上数据。Worker 打包检查使用 `deploy --dry-run`，不会发布。`test:worker` 使用临时数据库、测试令牌和空的邮件配置。

2026-09-17 部署时，原远程 `hitalk` 库的三张业务表均为空，但仍采用旧结构；该库已备份并保留。新版创建独立的 `hitalk-next` 库，执行 `0001` / `0002` 迁移，不对旧库重建或删除。生产 Worker 仍名为 `hitalk-server`，使用 `production` 环境配置，域名保持 `hitalk-next-api.ihoey.com`。

首次远程迁移发现 D1 对触发器内 `CASE … END` 的解析与本地执行不同，初始迁移在成功应用前已改为等价的 `SELECT RAISE(...) WHERE ...`。远程迁移及本地约束测试均已通过；此后冻结这两份已执行的迁移，后续结构变更必须新增迁移文件。

## 已完成的历史导入

2026-09-17 已将旧 LeanCloud 导出的 717 条评论、28 个页面及评论 UA 导入生产 D1，保留 251 条有效回复关系。旧用户记录仅私下归档，未导入登录账号。原始导出、SQL 备份、一次性导入脚本和核验记录保存在仓库外的私有迁移目录，不应提交到公开仓库。

2026-09-18 修复了无邮箱评论的头像计算：邮箱去首尾空格并转小写，昵称保持原样。hash 在 API 输出时生成，不需要重新导入数据库。以上为已完成的操作记录，不是可重复执行的导入步骤。

## 数据规则与以后修改结构

只保存 Markdown 正文；HTML 在输出时生成。邮箱用于通知，原始 UA 用于解析浏览器与操作系统展示，不采集评论 IP。点赞单独保存 keyed IP 摘要，`IP_HASH_SALT` 必须稳定；更换它会改变去重身份，已有访客可能再次点赞。

`migrations/0001_initial.sql` 是当前新数据库的初始结构，包含外键、回复归属/深度约束和计数触发器。首次上线后冻结已执行的迁移，后续改动添加新文件，并在改动前备份和演练。计数由触发器维护，业务代码不得重复加减。

## 备份

建议在结构修改前备份，并按能接受的数据损失窗口定期导出。仓库提供命令，没有安排生产定时任务。SQL 包含邮箱等私有信息，应限制访问、保存在仓库外并设定保留期限。

```sh
# 本地数据库
pnpm --filter @hitalk/server db:backup:local --output=/absolute/private/path/local.sql

# 生产数据库
pnpm --filter @hitalk/server db:backup:remote --output=/absolute/private/path/backup.sql

# 在一次性内存数据库恢复并校验，不覆盖现有数据
pnpm db:verify-backup /absolute/private/path/backup.sql
```

校验器检查 SQLite 完整性、外键、计数、回复归属、环和必要触发器。校验成功说明导出文件可以恢复且满足这些约束，不代表真实博客集成已验收。

## 恢复到 D1

1. 创建一个新的空 D1 数据库。
2. 创建独立 `wrangler.restore.jsonc`，其 `DB` 绑定指向新库。检查数据库 ID，避免操作已有库。
3. 导入全量 SQL；不要先初始化迁移，否则表定义会冲突。

   ```sh
   pnpm --filter @hitalk/server exec wrangler d1 execute DB --remote \
     --config=/absolute/path/wrangler.restore.jsonc \
     --file=/absolute/private/path/backup.sql
   ```

4. 让测试 Worker 连接恢复库，核对记录并测试新增/删除，确认触发器行为。
5. 实际故障恢复时，先保留当前数据库并暂停写入，核对备份之后的数据，再决定是否切换正式 Worker 绑定。

`pnpm test:worker` 提供无需账号的本地迁移、真实请求、SQL 导出及临时恢复校验演练。它不会切换正式绑定。
