# 首次部署与备份恢复

项目尚未上线，当前结构按新系统设计，不提供旧代码或历史数据兼容。下面的生产命令需要在确认目标数据库后手动执行；本轮检查只使用隔离的本地数据库。

## 首次部署

1. 在 `apps/server` 下运行 `pnpm exec wrangler d1 create hitalk`，将返回的 ID 填入 `wrangler.jsonc` 的唯一 `DB` 绑定。仓库原有数据库 ID 已保留，其他部署者须替换。
2. 设置两个不同的随机密钥：

   ```sh
   pnpm --filter @hitalk/server exec wrangler secret put ADMIN_TOKEN
   pnpm --filter @hitalk/server exec wrangler secret put IP_HASH_SALT
   ```

3. 执行验证：

   ```sh
   pnpm check
   pnpm --filter @hitalk/server build
   pnpm test:worker
   ```

4. 初始化生产库：`pnpm --filter @hitalk/server db:migrate:remote`。
5. 部署 API：`pnpm --filter @hitalk/server deploy`。
6. 托管本次构建的 SDK JS/CSS，在博客验证提交、回复、点赞、分页、管理删除与移动端。
7. 公网试运行前配置入口防滥用策略。需要邮件时设置 `RESEND_API_KEY / EMAIL_FROM / SITE_URL / ADMIN_EMAIL`，验证邮件域名及投递。

本地命令默认不连接生产库。Worker 打包检查使用 `deploy --dry-run`，不会发布。`test:worker` 使用临时数据库、测试令牌和空的邮件配置。

## 数据规则与以后修改结构

只保存 Markdown 正文；HTML 在输出时生成。邮箱用于通知，不采集评论 UA/IP。点赞单独保存 keyed IP 摘要，`IP_HASH_SALT` 必须稳定；更换它会改变去重身份，已有访客可能再次点赞。

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
