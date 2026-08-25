# 产品需求规范：dsh-hindsight

## 0. AI 使用说明

- 本文档是 dsh-hindsight 功能、范围、行为和验收标准的事实来源。
- AI MUST 优先实现 P0。
- AI MUST NOT 实现"不在本版本范围"中明确排除的内容。
- AI MUST 根据"验收标准"判断功能是否完成。
- 如果信息不明确，AI MUST 使用"假设"中的假设；如果仍无法判断，应记录到"待确认问题"，而不是自行扩展需求。

---

## 1. 产品上下文

### 1.1 产品摘要

dsh-hindsight 是 DeepSeek Harness（DSH）的官方级记忆插件：把 Hindsight（vectorize-io）内存服务通过一组原生 Cordis 斜杠命令 + 模型工具暴露给 DSH Agent，实现跨会话的语义记忆召回与写入。自包含 REST client，不依赖 dsh-mnemon 等编排全家桶。

### 1.2 用户问题

DSH Agent 默认没有跨会话记忆——会话一断就"失忆"。已有的记忆方案（dsh-mnemon）是三层编排全家桶，体积重、绑定九个 provider；而 Hindsight 已被验证为高质量向量记忆引擎（实体解析 + 知识图谱 + 多策略检索），但 DSH 生态里缺一个**轻量、独立、直连 Hindsight** 的插件。用户要的是：装一个包就有 `hindsight_recall`，DSH 就能记住并想起。

### 1.3 目标用户

| 用户类型 | 描述 | 核心需求 |
|---|---|---|
| DSH 用户 | 跑 DeepSeek Harness,想要持久记忆 | 让 Agent 跨会话记住偏好、决策、事实 |
| Hindsight 已有用户 | 已经部署了 Hindsight 内存服务 | 让 DSH 复用现有 memory bank,不重复造轮子 |
| 自托管开发者 | 用 DSH + 本地向量库做 agent 产品 | 一个可 `dsh plugin add` 的轻量记忆桥 |

### 1.4 核心价值

DSH Agent 从"无记忆的每会话新兵"变成"有跨会话记忆的持续协作者",装一个包、配一个端点就有,不背编排全家桶。

### 1.5 成功标准

| 判断标准 | 目标 / 信号 |
|---|---|
| 一键安装 | `dsh plugin add dsh-hindsight` 成功,0 手动改 profile |
| 命令可用 | `/hindsight recall <query>` 在 DSH 对话里返回真实召回结果 |
| 模型可用 | Agent 在下一步能调用 `hindsight_recall/hindsight_remember` 工具 |
| 零污染 | 插件自身不触发凭据脱敏、不残留测试数据、不含 /Users/ 等路径 |
| 可开源 | npm 发布成功,GitHub 仓库可 clone,README 指导安装 |

---

## 2. 范围

### 2.1 本版本范围

| 编号 | 内容 | 优先级 | 备注 |
|---|---|---|---|
| SCOPE-001 | Hindsight REST client:health/recall/list/listBanks/stats/remember/forget | P0 | 纯 HTTP,零 DSH 内部依赖,可复用 |
| SCOPE-002 | DSH 斜杠命令 `/hindsight`(status/recall/list/remember/forget) | P0 | 人类操作面 |
| SCOPE-003 | 5 个模型工具(hindsight_status/recall/list/remember/forget) | P0 | Agent 操作面 |
| SCOPE-004 | Settings 注册(endpoint/token/bankId/各超时),live 生效 | P0 | 配置层 |
| SCOPE-005 | cordis.patch.yml bundle 声明,dsh plugin add 即装 | P0 | 分发机制 |
| SCOPE-006 | 集成测试 script/test-client.mjs | P1 | 对真实 Hindsight 跑 8 项契约 |
| SCOPE-007 | 中文/英文 README + MIT LICENSE + GitHub Actions CI | P1 | 开源必备 |

### 2.2 不在本版本范围

| 编号 | 内容 | 原因 |
|---|---|---|
| OUT-001 | WebUI 面板 / sidebar 工作台 | 轻量版定位,纯后台;用户明确选"无重 WebUI" |
| OUT-002 | 多 provider 抽象(dsh-mnemon 的九 provider 编排) | 我们是独立实体,不做编排层 |
| OUT-003 | 内嵌 Hindsight 引擎 / 替用户部署 Hindsight | Hindsight 是外部依赖,用户自有服务 |
| OUT-004 | Browser 客户端 / React UI | 本期纯 Host 插件,不需要 client 半 |
| OUT-005 | 记忆蒸馏 / 去重子 agent | 轻量版,靠 Hindsight 自身 async 提取 |

---

## 3. 用户任务

| 编号 | 用户任务 | 用户类型 | 优先级 |
|---|---|---|---|
| TASK-001 | 让 DSH Agent 召回过去的记忆 | DSH 用户 | P0 |
| TASK-002 | 让 DSH Agent 记住新的事实 | DSH 用户 | P0 |
| TASK-003 | 查看记忆服务健康状况与 bank 统计 | DSH 用户 | P0 |
| TASK-004 | 校验或作废一条记忆 | Hindsight 用户 | P1 |

---

## 4. 用户流程

### FLOW-001：DSH 对话中召回记忆

**关联任务：** TASK-001
**优先级：** P0
**目标：** 用户在 DSH 对话问一个需要历史记忆的问题,Agent 用工具召回相关记忆并据此回答。

**入口：**
DSH 对话中输入一个依赖历史上下文的问题。

**主路径：**
1. 用户提问(如"我们之前定的架构决策是什么")。
2. Agent 调用 `hindsight_recall(query, limit)`。
3. 插件 POST `/memories/recall` 到配置的 Hindsight bank。
4. 返回 bounded 证据,Agent 据此回答。

**分支路径：**
- 人类直接用 `/hindsight recall <query>` 查看原始召回文本。
- 服务不可达时工具返回 `{healthy:false}`,Agent 说明并建议检查端点。

**边界情况：**
- 空结果:工具/命令返回空数组,提示"没有相关记忆"。
- bank 不存在:Hindsight 返回 404,插件透传错误。
- 超时:请求挂 15s Abort,报超时。

**完成状态：**
Agent 给出基于召回记忆的回答,工具调用记录在对话里。

### FLOW-002：DSH 对话中存入记忆

**关联任务：** TASK-002
**优先级：** P0
**目标：** 用户让 Agent 记住一件事,Agent 异步提交给 Hindsight 结构化提取。

**入口：**
用户说"记住……"。

**主路径：**
1. Agent 调用 `hindsight_remember(content, context?)`。
2. 插件 POST `/memories`(async:true, 带 operation_id)。
3. 返回 operationId,提示已排队。
4. Hindsight 异步提取为 world/experience/observation + entities。

**完成状态：**
返回 action:'stored' + operationId。

---

## 5. 功能需求

### REQ-001：Hindsight REST client

**优先级：** P0
**关联任务：** TASK-001..004
**关联流程：** FLOW-001, FLOW-002

**用途：**
所有命令和工具共用的底层 HTTP 层,封装 Hindsight REST API 的规范化解析。零 DSH 依赖,可独立测试。

**行为：**
- `health()`：GET `/health`,200 即 healthy,永不抛异常。
- `listBanks()`：GET `/v1/default/banks`,返回 bank 列表。
- `recall(query, limit)`：POST `/v1/default/banks/{bank}/memories/recall`,body 含 query/budget/max_tokens/types。
- `list(limit, query, state)`：GET 同路径 `/memories/list`,支持 state=valid/invalidated。
- `stats()`：GET `/stats`,归一化 totalNodes/totalLinks/totalDocuments/byFactType。
- `remember(content, context)`：POST `/memories`,async:true,带 operation_id。
- `forget(id)`：PATCH `/memories/{id}`,state=>invalidated。

**规则：**
- MUST 端点/请求形状按实测 8888 API 对齐(dsh-mnemon 的 `/health/live` 在本环境是 404,我们实测用 `/health`)。
- MUST 所有请求可 Abort。
- MUST remember/forget 不污染用户数据(测试用唯一标记,roundtrip 后清理)。
- SHOULD 返回字段用展开模式兼容 Hindsight 的变体字段名。

**验收标准：**
- [ ] AC-001: Given Hindsight 在 http://localhost:8888 运行,when 调 `health()`,then 返回 true。
- [ ] AC-002: Given bank=hermes 有数据,when 调 `recall("用户记忆")`,then 返回 ≥1 条带 id 的结果。
- [ ] AC-003: Given 不存在的 bank,when 调 `stats()`,then 抛含 HTTP 状态的错误。
- [ ] AC-004: Given 本地无 token,when 发请求,then 不带 Authorization 头。
- [ ] AC-005: Given 测试跑完,when 扫描 bank,then 无 `dsh-hindsight-test` 残留。

### REQ-002：/hindsight 斜杠命令

**优先级：** P0
**关联任务：** TASK-001..004
**关联流程：** FLOW-001, FLOW-002

**用途：**
人类在 DSH 对话直接操作记忆。

**行为：**
`/hindsight` 一个命令,子命令:`status` | `recall <query>` | `list [query]` | `remember <content>` | `forget <id>`。空输入 = status。

**规则：**
- MUST 返回 `{kind:'success'|'error', text}`(DSH CommandResult)。
- MUST recall 最多 10 条,每条含 ID(供 forget 用)。
- MUST forget 只接受一个无空格 ID。
- MUST status 显示 endpoint/bank/有效记忆数/连接数/文档数/分类分布。

**验收标准：**
- [ ] AC-001: Given 输入 `/hindsight status`,when Hindsight healthy,then 显示 bank 统计。
- [ ] AC-002: Given 输入 `/hindsight recall X`,when 有相关记忆,then 返回匹配文本+ID。
- [ ] AC-003: Given 输入 `/hindsight forget 无效ID`,then 返回 not-found 错误。
- [ ] AC-004: Given 输入 `/hindsight 未知子命令`,then 返回 usage 提示。

### REQ-003：模型工具

**优先级：** P0
**关联任务：** TASK-001..004

**用途：**
Agent 在下一步模型调用里直接用记忆。

**行为：**
5 个工具:`hindsight_status` / `hindsight_recall` / `hindsight_list` / `hindsight_remember` / `hindsight_forget`,全部返回 JSON 对象(bounded)。

**规则：**
- MUST 用官方 `defineTool` + `ValueSchemaSpec` 声明(不用 `as never` 绕过)。
- MUST recall 结果 bound 到 900 字符/条,防止上下文污染。
- MUST 工具描述写明"仅当需历史时调用",不给模型滥用台阶。
- MUST 返回值符合 `Record<string, JsonValue>`。

**验收标准：**
- [ ] AC-001: Given 工具注册,when 调 `hindsight_recall`,then 返回 {query, total, results[], hint}。
- [ ] AC-002: Given 服务不可达,when 调 `hindsight_status`,then 返回 {healthy:false, error}。
- [ ] AC-003: Given 调 `hindsight_remember`,then 返回 {action:'stored', operationId}。

### REQ-004：Settings + bundle 分发

**优先级：** P0

**用途：**
配置注入 + `dsh plugin add` 可安装。

**行为：**
- `ctx.settings.register(settingsNamespace('hindsight'), Config, {base, applies:'live'})`。
- Config 字段:endpoint(default http://localhost:8888)、token(默认 '')、bankId(默认 hermes)、defaultRecallLimit(10)、requestTimeoutMs(15000)、healthTimeoutMs(5000)。
- package.json 声明 `dsh.bundle.patch: ./cordis.patch.yml`,bundle 层 insert 默认配置行。

**规则：**
- MUST 配置字段用 `token` 而非 `apiKey`(绕开写盘凭据脱敏,已踩过坑)。
- MUST cordis.patch.yml 用 `- insert:` + id=hindsight(与既有插件格式一致)。
- MUST 不依赖 dsh-mnemon 任何包。

**验收标准：**
- [ ] AC-001: Given `dsh plugin --profile web add link:...`,then 进 bundles、正确 link。
- [ ] AC-002: Given 构建产物,when grep `***`/`proces...`,then 零污染。
- [ ] AC-003: Given `npm pack`,then tarball 只含 lib/cordis.patch.yml/README/LICENSE。

---

## 6. 数据模型

### 6.1 核心实体

| 实体 | 描述 | 关键字段 |
|---|---|---|
| HindsightConfig | 插件配置 | endpoint, token, bankId, 各超时 |
| Insight | 一条召回/列出的记忆 | id, text, category, score, createdAt |
| BankStats | 内存服务统计 | totalNodes, totalLinks, totalDocuments, byFactType |
| ForgetReceipt | 作废结果 | action(invalidated/not-found), id |

### 6.2 实体关系

| 关系 | 描述 |
|---|---|
| Insight belongs to bank | 每条记忆属于配置的 bankId |
| Command/Tool → HindsightClient | 命令与工具共享同一 client 工厂(bankId/token 可覆盖) |

### 6.3 数据规则

- 测试数据:唯一标记 `dsh-hindsight-test-<ts>`,roundtrip 后必须 forget 清理。
- 凭据:token 空则不带 Authorization 头;绝不写死密钥。
- 记忆生命周期:remember 入队(async),forget 软删除(invalidated)。

---

## 7. 外部依赖

| 编号 | 依赖 | 用途 | 是否必需 | 备注 |
|---|---|---|---|---|
| DEP-001 | Hindsight 服务(vectorize-io / 自托管) | 记忆存储与检索 | Yes | 外部已有服务,插件不内嵌 |
| DEP-002 | @deepseek-ai/dsh(>=0.1.1-rc.2) | Cordis 宿主 | Yes | peerDependency |
| DEP-003 | @deepseek-ai/schemastery | Settings schema | Yes | 唯一 runtime 依赖 |
| DEP-004 | @deepseek-ai/cordis/dsh-tools/dsh-commands/dsh-settings | 类型与 Context 扩展 | 构建时 | devDeps,运行时宿主提供 |

---

## 8. 非功能需求

| 类别 | 要求 | 优先级 |
|---|---|---|
| 性能 | rec呼叫 ≤ Hindsight 自身延迟(实测 0.3-0.6s);插件自身无额外开销 | P1 |
| 安全 | 无硬编码密钥;token 走配置不进源码;无 shell 执行 | P0 |
| 隐私 | 发布产物 zero 个人路径(/Users/)、零密钥、零测试数据残留 | P0 |
| 兼容性 | Node ≥20,ESM,DeepSeek Harness ≥0.1.1-rc.2 | P0 |
| 可靠性 | 所有 fetch 可 Abort;health 永不抛;超时可配 | P0 |
| 可访问性 | 命令/工具描述清晰,中文 usage 提示 | P1 |

---

## 9. 完成定义

MVP 完成条件：

- [x] 所有 P0 requirements 已实现(REQ-001..004)
- [x] 所有 P0 acceptance criteria 已通过(集成测试 8/8)
- [x] 所有 P0 user flows 可以端到端完成(web profile 装入成功)
- [x] 主要错误状态、空状态、超时已处理
- [x] Product Spec 与代码实现保持一致

待发布补全：

- [ ] npm publish 成功且全局安装后可 `dsh plugin add`(需用户 npm login)

---

## 10. 假设与待确认问题

### 10.1 假设

| 编号 | 假设 | 假设依据 | 错误风险 |
|---|---|---|---|
| ASM-001 | 用户有自己的 Hindsight 服务(或打算自托管) | 本项目就是为此而生 | 若无则插件无可用后端,需文档引导部署 |
| ASM-002 | DSH 生态接受本地 link 安装 + 后续 npm 发布 | 已验证 web profile 装入 | 若 npm 名冲突需换名 |
| ASM-003 | remember 的落地延迟由 Hindsight 异步提取决定,插件不保证立即可见 | 实测 15s 内未见 + pending consolidation 卡顿 | 用户可能误以为 remember 失败,需文档说明 |

### 10.2 待确认问题

| 编号 | 问题 | 是否阻塞 | 备注 |
|---|---|---|---|
| Q-001 | npm 发布账号登录状态(当前 whoami 报 ENEEDAUTH) | Yes | 发布前需用户 npm login |
| Q-002 | Hindsight 完整 recall 端点是否对 `/health/live` 也有支持 | No | 我们实测用 `/health`,兼容更多部署加 fallback 即可 |

---

## 11. Agent 系统规格

> 本产品是 DSH 生态内的记忆插件(传统界面 + 模型工具),非独立自主 agent 系统,本节大部分不适用。仅记录工具自主性：

### 11.1 自主性与人在回路

| 动作类别 | 自主级别 | 审批 / 回滚 |
|---|---|---|
| hindsight_recall/list/status/stats | 自动(只读) | 无副作用 |
| hindsight_remember | 自动(写入) | 可 forget 回滚,软删除 |
| hindsight_forget | 需谨慎(破坏性) | 软删除 invalidated,可恢复 |

### 11.2 工具与能力集

| 工具 | 用途 | 权限级别 | 扩展机制 |
|---|---|---|---|
| hindsight_recall | 召回证据 | 读 | defineTool 注册 |
| hindsight_remember | 提交记忆 | 写 | defineTool 注册 |
| hindsight_forget | 作废记忆 | 写(破坏) | defineTool 注册 |
```