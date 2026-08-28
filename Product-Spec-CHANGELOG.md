# Product-Spec 变更记录

本文档记录 dsh-hindsight 需求规范的每次迭代变更。格式：日期 · 变更 · 涉及范围。

---

## 0.3.0 (2026-08-28)

**方向**：A(system prompt section 记忆引导) + B(operations 异步可观测) + C(condense 批量去重写入)。

**新增范围**
- REQ-007(A)：官方记忆形态补全——`ctx.systemPrompt.section()` 注入记忆引导段(order 130, 工具引导约定段),配置 `systemPromptSection`(默认 true)。API 已验证:PromptSection{name, order, text}, 副作用导入 `@deepseek-ai/dsh-system-prompt`。
- REQ-008(B)：异步黑盒可观测——client.operations() + `hindsight_operations` 工具 + `/hindsight operations` 子命令。端点实测 200:`GET /memories/operations` 返回 status/error_message/progress。
- REQ-009(C)：批量去重写入——`hindsight_condense(facts[])`,保守文本归一化查重(语义判断留给模型),逐条独立 remember,部分失败不整体 throw。

**决策记录**
- section 用静态文案而非动态 provider:bankId 变化靠 `applies:'live'` 重载插件生效,无需每次 assembly 求值。
- operations/condense 是纯 HTTP 增量,不动 0.2.0 任何现有行为。
- 去重明确为文本归一化保守策略,拒绝做语义相似度——那是模型的职责(工具描述引导模型先自查)。

## 0.2.0 (2026-08-26)

**方向**：A(图谱 related) + B(部署诊断与引导) + D(auto-remember 半自动)。北极星从"给已有 Hindsight 用户加工具"转为"给想用记忆的 DSH 用户一个带护城河的记忆插件"。

**新增/扩展范围**
- SCOPE-008(A)：图谱能力 —— client.related(id, depth)/graph()、`hindsight_related` 工具、`/hindsight related` 命令、recall 带 entities。护城河(竞品 dsh-mnemosyne 只有向量检索,无实体关系)。
- SCOPE-009(B)：status 诊断增强 + 无 Hindsight 时 Docker one-liner 引导。破门槛(扩用户)。
- SCOPE-010(D)：auto-remember 半自动(会话钩子 + 候选确认 + autoRemember 配置)。留存。

**需求变更**
- REQ-001：新增 `graph(limit)`、`related(id, depth)`；新增 AC-006(related 邻居)。
- REQ-002：命令新增 `related <ID> [depth]` 子命令；新增 AC-005/006。
- REQ-003：工具 5→6 个(新增 hindsight_related);recall 带 entities;status 返回 {healthy,error,hint} 带引导;新增 AC-001/002/004。
- REQ-004：Config 新增 `autoRemember`(默认 true,半自动);新增 AC-004。
- REQ-005(新)：部署诊断与引导(B)。AC:端口不通 hint 含 docker run / bank 404 提示。
- REQ-006(新)：auto-remember 会话钩子(D)。AC:半自动候选确认 / 确认后入队 / 关闭不触发。

**决策记录**
- A：related 让模型传 depth(1-5),工具描述加防滥用护栏。
- B：先做轻量 Docker one-liner 引导(X 方案),不做 `hindsight_setup` 自动部署命令(Y 方案暂缓,OUT-006)。
- D：~~半自动默认(写完问确认)~~ → **务实路线修正(用户拍板 2026-08-26)**：排查发现纯 Host 插件无 LLM 通道自动提炼、无 client UI 做半自动确认弹窗。收敛为「`hindsight_remember` 工具描述主动引导(识别持久事实+不确定先问) + `autoRemember` 配置开关(默认 true)」,不依赖 turn/end 会话事件、不 spawn 子 agent。替代原 Spec 的计划 1:自动提炼+确认。现有 3892 已含 failed 噪音,故保留「不确定先问用户」的护栏防脏数据。

**待确认**
- Q-002：Hindsight 官方 Docker 镜像准确名称 —— **已解决**(WebSearch 核对官方安装文档,镜像 `ghcr.io/vectorize-io/hindsight:latest`,已用于 HINDSIGHT_SETUP_HINT 与 README)。

---

## 0.1.0 (2026-08-26)

**初始版本**：MVP 发布。范围 SCOPE-001..007,REQ-001..004。npm 发布 + GitHub 开源 + 插件商店收录。