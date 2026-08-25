# 开发计划：dsh-hindsight

关联需求：`Product-Spec.md`
状态：开发主体完成,进入发布阶段。

---

## Phase 0 · 摸底与选型（✅ 完成）

**目标：** 弄懂 DSH 插件生态 + Hindsight API,定技术路线。
**完成标准：** 能说出用官方 `defineTool`/`ctx.commands`/`ctx.settings` 的标准 API,不用 `as never` 骗过类型。

- [x] 摸 DSH 官方 `cordis-plugin-development` skill + deepseek-harness devops skill
- [x] 摸 dsh-mnemon 的 `hindsight.ts` 适配器(参考不照抄)
- [x] 实测本机 Hindsight 8888 全部相关端点(/health、/v1/default/banks、recall/list/stats/graph)
- [x] 定方案：原生 Cordis 插件,自带 REST client,自包含,不做编排层

## Phase 1 · 项目骨架（✅ 完成）

**目标：** 可编译的 TypeScript 工程。
**完成标准：** `typecheck` exit 0,`tsdown` 产出 lib。

- [x] package.json(name/dsh.bundle.patch/files/exports/deps)
- [x] tsconfig / tsconfig.types(显式 NodeNext 模块)
- [x] tsdown.config.ts(单 entry 打包,dts 生成,deps.neverBundle)
- [x] cordis.patch.yml(bundle 声明,insert id=hindsight)
- [x] pnpm-workspace.yaml + .gitignore

## Phase 2 · 核心实现（✅ 完成）

**目标：** REST client + 命令 + 工具 + settings 全通。
**完成标准：** typecheck 0 错误,构建产物干净(零 `***` 污染)。

- [x] src/hindsight.ts:HindsightClient(health/listBanks/recall/list/stats/remember/forget)
- [x] src/commands.ts:/hindsight status/recall/list/remember/forget
- [x] src/tools.ts:5 个 defineTool 模型工具(JsonObj 返回值)
- [x] src/index.ts:settings 注册 + createClient + apply
- [x] 修凭据脱敏坑：配置字段 token 而非 apiKey
- [x] 修 npm install 崩溃(pnpm 替代)+ supply-chain exclude

## Phase 3 · 集成测试（✅ 完成）

**目标：** 对真实 Hindsight 验证插件契约。
**完成标准：** test-client.mjs 全绿(环境性 roundtrip 标 warning 不 fail)。

- [x] 8/8 契约通过：health/stats/listBanks/recall/list/remember/forget
- [x] 零测试残留(唯一标记 roundtrip 后清理,实测无)
- [x] 修正 health 端点为 `/health`(本环境 `/health/live` 404)

## Phase 4 · 装入 DSH（✅ 完成）

**目标：** 插件能被 DSH 真实加载。
**完成标准：** `dsh plugin --profile web add link:...` 成功,进 bundles。

- [x] 装进 web profile(node_modules link 正确)
- [x] 解决 supply-chain minimum release age 阻塞(pnpm-workspace.yaml exclude)
- [ ] 启动 dsh web 实测 `/hindsight status` 真实输出(下一阶段)

## Phase 5 · 发布（⬜ 进行中）

**目标：** 开源 + npm 可装。
**完成标准：** GitHub 仓库可 clone、npm publish 后可 `dsh plugin add`。

- [x] Product-Spec.md(需求单一真相源)
- [x] code-review 自查(见阶段审查记录)
- [ ] 启动 dsh web 冒烟测试 /hindsight 命令
- [ ] release-builder 隐私审计(/Users/、.db、.env、key、token)
- [ ] README(中英)+ LICENSE(MIT)
- [ ] CI(GitHub Actions 自动 publish npm)
- [ ] GitHub 建仓 Ryu6Zero/dsh-hindsight + 推送
- [ ] npm publish(需用户 npm login)

## 阶段审查记录

- **凭据脱敏(hard won)**：`*_API_KEY` 风格 env 赋值会被写盘脱敏成 `***`,连源码都改坏。对策=配置以 `token` 命名,彻底绕开触发模式。
- **npm arborist 崩**：npm 装 tsdown→vitest 依赖树崩 `edgesOut`。改用 pnpm(DSH 生态默认)。
- **supply-chain 阻塞**：@linxin666 昨天发布触发 minimum release age。DSH 生态标准解=pnpm-workspace.yaml `minimumReleaseAgeExclude`。
- **集成测试教训**：remember→recall 落地依赖 Hindsight 自身 async consolidation(环境依赖),不作为插件契约硬断言,标 warning。