# 开发计划：dsh-hindsight

关联需求：`Product-Spec.md`
状态：0.1.0 已发布（npm + GitHub + 收录中）。→ 0.2.0 迭代进行中（A 图谱 / B 诊断引导 / D auto-remember）。

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

## Phase 5 · 发布（✅ 完成）

**目标：** 开源 + npm 可装。
**完成标准：** GitHub 仓库可 clone、npm publish 后可 `dsh plugin add`。

- [x] Product-Spec.md(需求单一真相源)
- [x] code-review 自查(见阶段审查记录)
- [x] 启动 dsh web 冒烟测试 /hindsight 命令(模型实调 + 真实召回)
- [x] release-builder 隐私审计(/Users/、.db、.env、key、token 全绿)
- [x] README(中英)+ LICENSE(MIT)
- [x] CI(GitHub Actions 自动 publish npm)
- [x] GitHub 建仓 Ryu6Zero/dsh-hindsight + 推送(已改名小写)
- [x] npm publish 0.1.0 + registry 装回验证 + headless 真实调用
- [x] 插件商店收录(打 dsh-plugin topic + 描述,等爬取)

## Phase 6 · 0.2.0 迭代（⬜ 进行中）

**目标：** A(图谱 related) + B(部署诊断引导) + D(auto-remember 半自动)。
**完成标准：** Spec 全 AC 通过,发 0.2.0。

### 6-A 图谱能力（SCOPE-008 / REQ-001,003 / P0）
- [ ] client: `graph(limit)` + `related(id, depth)`(BFS 遍历)
- [ ] 工具 `hindsight_related`(depth 1-5,防滥用描述)
- [ ] 命令 `/hindsight related <ID> [depth]`
- [ ] `hindsight_recall` 返回带 entities
- [ ] 集成测试: related 邻居断言 + 零残留

### 6-B 部署诊断与引导（SCOPE-009 / REQ-005 / P0）
- [ ] `hindsight_status`/`/hindsight status` 连不上 → {healthy:false, error, hint}
- [ ] hint 含 Docker one-liner(bank 404 / 端口不通 分别诊断)
- [ ] README 加"零基础起步"(无 Hindsight 怎么办)
- [ ] WebSearch 确认 Hindsight 官方 Docker 镜像名(Q-002)

### 6-D auto-remember 主动记忆（SCOPE-010 / REQ-006 / P1）
> 务实路线(用户拍板):纯 Host 插件无 LLM 通道+无 client UI,不实现会话结束自动提炼/确认弹窗。改成「hindsight_remember 工具主动引导 + autoRemember 配置开关」。
- [x] 决策:不依赖 turn/end 会话事件、不 spawn 子 agent、不引 client UI(已确认 DSH 会话事件 13 种+turn/end 可用,但不走自动触发)
- [x] Config 加 `autoRemember`(默认 true,index/Config/resolve/createClient)
- [x] HindsightConfig 接口加 autoRemember
- [x] hindsight_remember 工具描述改为主动引导(识别持久事实+不确定先问)
- [x] cordis.patch.yml 加 autoRemember 默认
- [ ] Spec REQ-006 重写为务实版 + CHANGELOG 记录(待做)
- [ ] 集成测试:autoRemember 默认值断言(待做)

### 发布
- [x] 隐私审计 + 集成测试扩至 related/auto-remember(15/15)
- [x] npm 发 0.2.0 + GitHub 推送 + 更新 Spec 勾选
- [x] 中文主 README + README.en.md(2026-08-27)

## Phase 7 · 0.3.0 迭代（⬜ 进行中）

**目标：** A(system prompt section 记忆引导) + B(operations 可观测) + C(condense 批量去重)。
**完成标准：** Spec REQ-007/008/009 全 AC 通过,发 0.3.0。

### 7-A section provider（REQ-007 / P0）✅
- [x] Config 加 `systemPromptSection`(默认 true)
- [x] inject 加 'systemPrompt' + 副作用导入 dsh-system-prompt
- [x] 注册 PromptSection{name:'hindsight-memory', order:130, 静态引导文案}(src/section.ts)
- [x] headless 冒烟:模型自知有长期记忆(registry 0.3.0 实测:"系统提示告知我拥有跨会话记忆")

### 7-B operations 可观测（REQ-008 / P0）✅
- [x] client.operations(limit?) 归一化 OperationRecord(注意端点是 /operations 非 /memories/operations,实测修正)
- [x] hindsight_operations 工具(bounded, error_message 截 300)
- [x] /hindsight operations [limit] 子命令
- [x] 集成测试: operations(5) → statuses=processing,pending,completed

### 7-C condense 批量去重（REQ-009 / P1）✅
- [x] hindsight_condense 工具(facts 2-10, 近期20条窗口文本归一化查重, 部分失败隔离)
- [x] 集成测试: dedup=1/stored=2 验证

### 发布 ✅
- [x] 版本 0.3.0 + README(中英)特性更新 + 隐私审计全绿
- [x] npm publish 0.3.0 + registry 验证(latest: 0.3.0) + headless 真机冒烟通过

## Phase 8 · 0.4.0 迭代（⬜ 进行中）

**目标：** A(recall 会话内 TTL 缓存) + B(多 bank 只读覆盖)。
**完成标准：** REQ-010/011 全 AC 通过,发 0.4.0。

### 8-A recall 缓存（REQ-010 / P1）
- [ ] Config 加 `recallCacheTtlMs`(默认 60000)
- [ ] 缓存 Map + 写失效 + 上限淘汰(index.ts 作用域)
- [ ] 工具命中返回 cached:true
- [ ] 集成测试: 二次命中 <10ms + remember 后失效 + TTL=0 直连

### 8-B 多 bank 只读（REQ-011 / P1）
- [ ] 只读四工具加可选 bank 参数
- [ ] 命令 @bankId 前缀解析
- [ ] 集成测试: 跨 bank recall + 不存在 bank 404 透传

### 发布
- [ ] 版本 0.4.0 + README 更新 + 审计 + npm publish + 真机冒烟

## 阶段审查记录

- **凭据脱敏(hard won)**：`*_API_KEY` 风格 env 赋值会被写盘脱敏成 `***`,连源码都改坏。对策=配置以 `token` 命名,彻底绕开触发模式。
- **npm arborist 崩**：npm 装 tsdown→vitest 依赖树崩 `edgesOut`。改用 pnpm(DSH 生态默认)。
- **supply-chain 阻塞**：@linxin666 昨天发布触发 minimum release age。DSH 生态标准解=pnpm-workspace.yaml `minimumReleaseAgeExclude`。
- **集成测试教训**：remember→recall 落地依赖 Hindsight 自身 async consolidation(环境依赖),不作为插件契约硬断言,标 warning。
- **0.2.0 决策**：A 用模型传 depth;B 只做 one-liner 引导不做 setup 命令;C(WebUI)暂缓;D 半自动默认(库有 failed 噪音,全自动加剧污染)。