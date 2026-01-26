Hitalk v2 评论系统方案文档

面向 Hitalk v1（LeanCloud + marked）的重写设计文档
目标：可维护、可迁移、可自托管、可持续演进

⸻

1. 项目背景

1.1 现状问题
• 后端依赖 LeanCloud（即将停止对外服务），存在不可控风险
• 前后端强耦合，业务逻辑分散在前端
• 评论内容直接存储 HTML，存在：
• 安全风险（XSS）
• 二次渲染 / 迁移困难
• 项目结构历史包袱重，维护成本高

1.2 重写目标
• 完全移除 LeanCloud 依赖
• 前后端彻底解耦
• 数据结构清晰、可演进
• 保持与旧 Hitalk 使用方式高度兼容
• 支持自托管，长期可维护

⸻

2. 设计原则
   1. 数据优先：数据结构先行，避免技术绑定
   2. 最小可用：先覆盖现有能力，不盲目扩展
   3. 前后端解耦：通过稳定 API 通信
   4. 安全默认：Markdown → HTML 统一在服务端完成并清洗
   5. 渐进迁移：支持旧数据无感迁移

⸻

3. 系统整体架构

┌────────────────────┐
│ Hitalk Frontend │
│ (JS SDK / UI) │
└─────────┬──────────┘
│ REST API
┌─────────▼──────────┐
│ Hitalk API Server │
│ (Worker / Node) │
└─────────┬──────────┘
│
┌─────────▼──────────┐
│ Database │
│ (SQLite / PG) │
└────────────────────┘

⸻

4. 数据模型设计

4.1 Comment 表（核心）

comments (
id TEXT PRIMARY KEY,
page_path TEXT, -- 页面路径（原 url）
parent_id TEXT, -- 回复父评论（原 rid）
nick TEXT,
email TEXT,
website TEXT,
content_md TEXT, -- Markdown 原文（新增）
content_html TEXT, -- 渲染后的 HTML
ua TEXT,
ip_hash TEXT, -- 防刷
like_count INTEGER DEFAULT 0,
is_pinned BOOLEAN DEFAULT false,
created_at DATETIME,
updated_at DATETIME,
is_admin BOOLEAN DEFAULT false,
mail_notified BOOLEAN DEFAULT false
)

4.2 与 v1 数据结构对照

v1 字段 v2 字段
url page_path
rid parent_id
comment content_html
❌ content_md
like like_count
pin is_pinned

关键改进点：HTML 与 Markdown 分离，降低技术债

⸻

5. API 设计

5.1 获取评论列表

GET /comments?path=/posts/xxx

返回示例（树形）：

[
{
"id": "c1",
"nick": "Dizent",
"content_html": "<p>...</p>",
"like": 0,
"created_at": "2025-03-18",
"children": []
}
]

⸻

5.2 新增评论

POST /comments

{
"path": "/posts/xxx",
"nick": "Dizent",
"email": "master@dizent.cn",
"website": "http://www.dizent.cn",
"content": "这个评论框可以配置在 next 主题中吗？",
"parent_id": ""
}

服务端处理流程：1. Markdown → HTML 2. DOMPurify 安全清洗 3. 同时存储 content_md / content_html

⸻

5.3 点赞评论

POST /comments/:id/like

    •	可通过 IP / Cookie 做简单频控

⸻

5.4 管理接口（私有）

POST /admin/comments/:id/pin
DELETE /admin/comments/:id

⸻

6. Markdown 与表情方案

6.1 兼容旧数据
• 允许白名单 <img class="biaoqing">
• 仅允许指定 CDN 域名

6.2 新推荐方案
• Markdown + 表情语法：

这个评论 :hehe:

    •	渲染阶段统一替换为 <img>

⸻

7. 前端 SDK 设计

7.1 初始化方式（兼容 v1）

new Hitalk({
el: '#comment',
server: 'https://comment.example.com',
path: location.pathname,
placeholder: 'just go go',
avatar: 'mm'
})

7.2 前端结构建议

hitalk/
├── api.ts // API 封装
├── store.ts // 状态管理
├── renderer.ts // Markdown / HTML 处理
├── ui/
│ ├── Editor
│ ├── CommentList
│ └── CommentItem
└── index.ts

⸻

8. 数据迁移方案（LeanCloud → v2）
   1. LeanCloud 导出 JSON
   2. 字段映射：
      • url → page_path
      • rid → parent_id
      • comment → content_html
   3. 可选：使用 html-to-md 生成 content_md
   4. 写一次性导入脚本导入新数据库

即便 Markdown 无法完全还原，也不影响展示

⸻

9. 后续可扩展能力（非本期）
   • 评论审核（is_approved）
   • 邮件通知
   • 垃圾评论识别
   • 管理后台
   • 统计分析

⸻

10. 结语

Hitalk v2 的核心不是“重写 UI”，而是 建立一个干净、可持续的评论基础设施。
在此方案下，前端、后端、存储均可独立演进，避免再次被平台锁死。

⸻

本文档可直接作为仓库 README / 技术设计文档使用

⸻

11. Hitalk v2 重写执行计划（Implementation Plan）

本计划假设：
• 不做兼容，允许清洗/重导入历史数据
• v2 作为全新系统设计
• 目标是「可长期维护 + 可开源」

⸻

Phase 0：设计冻结（Day 0）

目标：避免边写边改，先统一认知
• 确认核心原则（不兼容、Markdown 为唯一真相）
• 确认是否需要 pages 表（✅ 强烈建议）
• 决定部署平台（建议：Cloudflare Worker + D1）
• 确认是否需要 Auth（v2 不需要）

产出：
• 本方案文档定版
• 不再新增 v2 核心需求

⸻

Phase 1：后端最小可用 API（Day 1–2）

目标：先跑起来，不追求完整

1.1 项目初始化
• 新建仓库 hitalk-server
• 选择运行时 Hono（Worker / Node）
• 基础路由 + JSON 响应

1.2 数据库 Schema
• 建立 pages 表
• 建立 comments 表
• 编写初始化 SQL / migration

1.3 核心接口
• POST /comments
• 自动创建 page
• Markdown → HTML 渲染
• DOMPurify 清洗
• GET /comments?path=xxx
• page_path → page_id
• 返回树形结构

验收标准：
• curl 可直接发评论
• 数据可正确入库
• XSS 不可注入

⸻

Phase 2：内容渲染与安全（Day 3）

目标：彻底解决历史最大隐患
• Markdown-it 配置
• Emoji 插件接入
• HTML 白名单策略
• 禁止原始 HTML 输入
• 单元测试：XSS 样例

验收标准：
• <script>、onerror 等全部被清除
• Emoji 正常渲染

⸻

Phase 3：前端 SDK v2（Day 4–5）

目标：提供一个干净的前端入口

3.1 SDK API 设计

Hitalk.mount('#comment', {
server: 'https://comment.example.com',
page: {
path: location.pathname,
title: document.title
}
})

    •	不使用 new
    •	无全局副作用

3.2 SDK 内部结构
• api.ts（fetch）
• store.ts（状态）
• renderer.ts（只处理展示）
• ui 组件拆分

验收标准：
• 一个 div 即可挂载评论
• 后端替换不影响 SDK

⸻

Phase 4：评论功能补齐（Day 6）

目标：补齐 v1 已有但被忽略的能力
• 评论回复（parent_id）
• 评论树构建
• 点赞接口 + 前端交互
• 置顶逻辑（后端字段）

⸻

Phase 5：数据清洗 & 重导入（可选，Day 7）

目标：不是迁移，是“重生”
• 导出 LeanCloud 数据
• HTML → Markdown（可不完美）
• 丢弃非标准表情 / HTML
• 重导入 v2 数据库

验收标准：
• 老评论可读即可
• 无历史技术债

⸻

Phase 6：部署 & 稳定性（Day 8）
• Worker 部署
• 数据库备份策略
• 基础限流（IP / UA）
• 错误日志

⸻

Phase 7：开源准备（Day 9）
• README（架构 + 用法）
• 示例站点
• License
• Roadmap（v2.1 / v3）

⸻

12. 推荐 Roadmap（不纳入 v2 核心）
    • 管理后台
    • 邮件通知
    • 评论审核
    • 登录系统
    • 插件机制

v2 只做一件事：把评论这件事，做干净

⸻

13. 最终目标状态
    • 评论系统不再是博客负担
    • 后端 100% 可控
    • 数据结构 5 年不动
    • 可随时换前端 / 换部署平台

到这一步，Hitalk 才算真正“完成一次工程意义上的重写”
