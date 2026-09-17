# 技术栈与依赖决策

核查日期：2026-09-17。版本来自 npm 发布元数据、包的 peerDependencies 和官方文档；以 pnpm-lock.yaml 的实际锁定结果为准。

目标是轻量、可嵌入的自托管博客评论系统。维持 Hono + Cloudflare Workers/D1 + TypeScript + lit-html SDK：目前没有需要 React、SSR 框架、ORM 或额外状态库才能解决的问题。新工具应降低维护成本或补足可验证性。

## 本轮采用

| 层次            | 选择                                                      | 原因                                                                |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| 类型检查        | TypeScript 7.0.2                                          | 使用原生编译器，移除 baseUrl；构建和消费方声明均实际编译验证        |
| SDK 构建        | tsdown 0.23.0 / Rolldown / Oxc                            | 替换 Rollup 及多项插件；统一产出 ESM、IIFE、独立类型声明            |
| DOM 渲染        | lit-html 3.3.3                                            | 模板绑定、按 ID 复用节点、声明式事件；不绑定宿主框架                |
| CSS             | @tsdown/css 0.23.0 + Lightning CSS 1.33.0                 | 集成提取和压缩，替换 PostCSS 构建插件链                             |
| 代码检查        | Oxlint 1.83.0 + oxlint-tsgolint 7.0.2001                  | 开启类型感知规则，包括未处理 Promise；实际探针验证规则能阻止错误    |
| 格式化          | Oxfmt 0.68.0                                              | 统一格式，加入 check/CI                                             |
| 测试            | Vitest 4.1.11 + @cloudflare/vitest-plugin 1.1.11          | 统一运行 Node/jsdom 与真实 workerd/D1 测试                          |
| 测试转换        | Vite 8.3.0                                                | 配套 Vitest 与开发示例热更新，按需转换 TypeScript；不增加生产运行时 |
| 覆盖率          | @vitest/coverage-istanbul 4.1.11                          | Node 与 Workers 共用报告，设置可执行覆盖率门槛                      |
| 输入契约        | Valibot 1.5.0                                             | 模块化 schema；前后端共用邮箱/网址校验，后端验证完整请求            |
| HTTP 与平台工具 | Hono 4.13.8、Wrangler 4.133.0、Workers types 5.20260917.1 | 升级当前版本，并验证 Worker 打包及本地 D1 行为                      |
| Markdown        | markdown-it 15.0.2、markdown-it-emoji 3.1.0               | 保留适合 Workers 的纯 JS 引擎，升级并补危险协议/HTML 用例           |
| Git 提交检查    | lint-staged 17.5.1、Husky 9.1.7                           | 沿用现有流程，升级工具                                              |

[tsdown 声明生成](https://tsdown.dev/options/dts)、[CSS 集成](https://tsdown.dev/options/css)、[Oxc 类型感知检查](https://oxc.rs/docs/guide/usage/linter/type-aware.html)、[Valibot 设计](https://valibot.dev/guides/introduction/)。

Vitest 的 npm 最新版本为 5.0.1，但当前 Cloudflare 官方插件的 peerDependencies 要求 ^4.1.0，因此测试与覆盖率包精确固定在 4.1.11。升级时应将插件和 Vitest 一起验证，不能只改主版本。参见 [Cloudflare 官方入门](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/)。

tsdown 的 TypeScript 7 声明生成适配仍会输出 experimental API 提示。这里使用其 tsgo CLI 路径，不依赖旧 TypeScript 编译器 API，并通过独立临时目录中的消费方编译检查兜底；不需要同时安装 TypeScript 6。声明生成配置放在仓库根目录，以包含 SDK 与 shared 两个包。

markdown-it 15 已自带类型，但 markdown-it-emoji 的社区类型仍引用 14。已移除这两项旧 @types，并仅为实际使用的 full(md) 插件入口声明 15 版本类型；插件行为通过真实 Workers 测试验证。未来插件自带类型后删除这份小声明。

移除 nanoid，使用 Workers 原生 crypto.randomUUID()。移除 tsx 直接依赖、Rollup 及其 resolve/commonjs/typescript/dts/postcss 插件和 tslib。Vitest 的可选工具依赖可能仍在锁文件中出现，不等于项目继续依赖旧构建流程。SDK 不再输出 CommonJS/UMD。

## User-Agent

采用 [Bowser](https://github.com/bowser-js/bowser) 2.14.1，在 Workers 侧解析 UA 的浏览器和系统信息。它不进入 SDK 构建；公开接口只返回解析后的标签。保留原始 UA，方便旧评论导入后使用相同的解析规则。

## 开发环境

Vite 直接运行 examples/playground 中的 SDK 源码示例，CSS 原生热更新；TS 通过 [HMR dispose/data](https://vite.dev/guide/api-hmr) 清理旧实例并在内存中保留输入草稿。开发适配不进入 SDK 发布产物。统一 pnpm dev 先初始化缺失配置并应用本地迁移，再由 [concurrently](https://github.com/open-cli-tools/concurrently) 管理 Vite/Wrangler 进程，任一退出时结束其余进程。

## DOM 渲染与测试组织

采用独立的 [lit-html](https://lit.dev/docs/libraries/standalone-templates/)，无需 LitElement 或 Web Components。评论使用 [repeat](https://lit.dev/docs/templates/lists/#the-repeat-directive) 按 ID 保留 DOM 身份，编辑器独立持有草稿。用户文本使用模板绑定，只有可信 API 输出的已净化 Markdown 使用 unsafeHTML。

lit-html 和指令均内联进 ESM/IIFE，不要求 Vue、React 或 Hexo 消费方加载额外渲染运行时。当前 IIFE gzip 约 12.7 kB，相比迁移前约 7.7 kB 增加 5 kB；CSS gzip 约 2.3 kB。体积增加换取模板与事件维护、局部更新和节点复用，暂不引入状态管理库。

所有自动化测试由 Vitest 运行：SDK 源码使用 jsdom 环境；管理页、发布产物和备份校验独立分组；后端使用 workerd/D1。原 scripts/check-worker.mjs 已迁为 tests/worker.integration.test.mjs，独立配置通过 pnpm test:worker 执行，进程与临时数据库由生命周期钩子清理。scripts/verify-backup.mjs 是运维 CLI，继续保留，其核心校验由测试直接调用。

## Sätteri 的决定

研究的是用户指定的 [bruits/satteri](https://github.com/bruits/satteri)，npm 版本 0.10.5。

对该版本发布物的检查结果：默认入口通过原生 N-API 绑定运行；浏览器入口转到 @bruits/satteri-wasm32-wasi。其加载器使用 WASI、共享 WebAssembly.Memory、fetch 加载 WASM，并创建 4 个 Web Worker。构建目标为 wasm32-wasip1-threads。这不是可以直接替换进当前 Cloudflare Worker 的通用 WASM 模块。

本轮不加入生产依赖。这个结论来自入口和加载器检查，**没有在真实 Cloudflare 部署中运行 Sätteri，也没有对两种引擎做性能基准**。当前评论最多 20,000 字符，尚无解析器成为瓶颈的测量证据；为短评论引入额外 WASI/线程适配成本暂不合适。若上游提供明确支持 Workers 的无线程入口，或后续有大文档构建需求，再建立独立性能/安全对照测试。

相关源码：[包配置](https://github.com/bruits/satteri/blob/main/packages/satteri/package.json)、[浏览器绑定](https://github.com/bruits/satteri/blob/main/packages/satteri/src/binding.browser.ts)。保留现有 xss 白名单净化层；解析速度不能替代输出安全校验。

## 验证与后续边界

- pnpm check：格式、类型感知 lint、TypeScript、构建、Vitest、覆盖率门槛。
- pnpm test:watch：开发交互测试。命令会先构建一次；涉及发布产物变化时重新执行 pnpm test。
- pnpm test:worker：临时 Wrangler + D1，迁移重复执行、真实 HTTP、SQL 导出与恢复。
- pnpm --filter @hitalk/server build：部署前 dry-run，仅打包。
- pnpm audit --prod --registry=https://registry.npmjs.org：本次报告生产依赖已知漏洞为 0；默认镜像未提供审计接口，因此显式使用官方源。

真实 D1 测试发现 Node SQLite 无法复现的深链级联删除失败。当前最大链长为 8（含根评论），测试包含底层点赞、根评论删除、整页删除和超深回复拒绝。测试使用假令牌与本地 D1，不读取开发邮件凭据。

SDK 自动化测试使用 jsdom；本轮另在真实浏览器中检查 ESM 产物的点赞、重排、回复目标消失和草稿保留，并修复按钮样式覆盖 hidden 的问题。这不代表完整跨浏览器兼容性或视觉验收，下一步应结合实际博客页面补验收；有持续跨浏览器回归需求时再加入 Playwright。当前无需仅为技术栈完整而新增 UI 框架、ORM、数据库服务或测试库。
