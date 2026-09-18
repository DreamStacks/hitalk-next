# Hitalk Server

Hono + Cloudflare Workers + D1。唯一接口前缀 /api；管理页 /admin。路由、业务事务、查询和通知分层组织，详见 ../../docs/architecture.md。

从仓库根目录运行 pnpm dev，会初始化独立的本地数据库并启动前后端。pnpm build:server 仅进行 dry-run，不部署。

必要设置：ADMIN_TOKEN、IP_HASH_SALT、WRITE_LIMITER。仓库 wrangler.jsonc 已声明限流绑定。当前生产绑定为独立的 hitalk-next-v3。其他环境先创建空库并修改 production 绑定与域名。根目录 `pnpm deploy:server` 会先应用生产迁移，再发布 Worker；`pnpm logs:server` 查看实时日志。

匿名客户端使用 ht_ 前缀的 32 字节随机凭证；服务端只存 SHA-256 摘要。管理令牌独立，永远不交给 SDK。删除保留线程关系，不级联删除回复。

EMAIL_ENABLED 默认关闭。开启邮件时配置 RESEND_API_KEY、EMAIL_FROM、SITE_URL、NOTIFICATION_API_URL；ADMIN_EMAIL 为可选博主通知。邮件使用 D1 任务表和 scheduled 处理器，不依赖 waitUntil 保证可靠性。完整配置见 ../../docs/operations.md。
