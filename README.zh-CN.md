# dsh-hindsight

**官方级 DeepSeek Harness 记忆插件,后端接 [Hindsight](https://github.com/vectorize-io/hindsight)。**

给 DSH Agent 真正的跨会话记忆:召回过去的决策、记住新事实、查看记忆健康状况——通过一个自包含的 Cordis 插件完成。没有 dsh-mnemon、没有编排层、没有捆绑存储引擎。就是一层对接 Hindsight REST API 的轻薄 HTTP client。

## 为什么

DSH Agent 默认无状态——每次会话都从零开始。已有的记忆方案(如 dsh-mnemon)是重型的"三层编排全家桶"。如果你本就部署了 [Hindsight](https://hindsight.vectorize.io)(高质量向量记忆引擎,带实体解析 + 知识图谱 + 多策略检索),这个插件把 DSH 直接接上去,一个可安装的包就够。

**已实测端到端跑通**:一个真实 DSH Agent 调用 `hindsight_recall`,在 headless profile 里从 Hindsight bank 召回真实记忆。

## 特性

- **`/hindsight` 斜杠命令** — `status` / `recall <查询>` / `list [查询]` / `remember <内容>` / `forget <ID>`
- **5 个模型工具** — `hindsight_status` `hindsight_recall` `hindsight_list` `hindsight_remember` `hindsight_forget`(Agent 下一步可直接调用)
- **热配置** — `endpoint` / `token` / `bankId` / 超时,改完即时生效,无需重启
- **独立 client** — `HindsightClient` 是零依赖 HTTP 层(`health` `recall` `list` `listBanks` `stats` `remember` `forget`),插件之外也能复用

## 安装

要求 Node ≥ 20,DeepSeek Harness ≥ 0.1.1-rc.2。

装到 Web profile(完整 UI)和 Headless profile(命令行任务)——两者挂载同一套工具:

```sh
# npm registry(发布后)
dsh plugin --profile web add dsh-hindsight
dsh plugin --profile headless add dsh-hindsight

# 或本地开发目录
dsh plugin --profile web add "link:/绝对/路径/dsh-hindsight"
dsh plugin --profile headless add "link:/绝对/路径/dsh-hindsight"
```

然后启动/重启 profile:

```sh
dsh --profile web
```

## 配置

默认指向 `http://localhost:8888`、bank `hermes`。在 DSH 设置界面的 `hindsight` 命名空间里覆盖(别改 bundle patch):

| 字段 | 默认 | 含义 |
|---|---|---|
| `endpoint` | `http://localhost:8888` | Hindsight 服务地址 |
| `token` | `''` | 远程服务的 Bearer token;本地开放服务留空 |
| `bankId` | `hermes` | 记忆 bank id |
| `defaultRecallLimit` | `10` | 每次召回上限 |
| `requestTimeoutMs` | `15000` | 数据面请求超时 |
| `healthTimeoutMs` | `5000` | 健康探测超时 |

环境变量/用户设置优先于 bundle 默认值。token 不写进提交的配置。

## 用法

```text
/hindsight status               # bank 统计、记忆/连接/文档数
/hindsight recall 记忆架构决策   # 语义召回,显示文本 + ID
/hindsight list                 # 最近记忆
/hindsight remember 记住X        # 入队异步结构化提取
/hindsight forget <ID>          # 软删除(作废)一条记忆
```

在对话里直接让 Agent 做这些也行——它通过模型工具「查一下记忆」「记住这个」即可自己完成。

## 构建与测试

```sh
pnpm install
pnpm build        # tsdown:lib/index.js + index.d.ts + sourcemap
node scripts/test-client.mjs   # 对运行中的 Hindsight 做真实集成测试
```

`scripts/test-client.mjs` 命中真实 Hindsight 端点(health/stats/listBanks/recall/list/remember/forget)。**remember→recall 可见性有个要说明的坑**:Hindsight 通过自己的 LLM/consolidation 队列异步提取,刚 `remember` 的事实可能要超过测试窗口才出现在召回里——这是 Hindsight 自身的环境性依赖,不是插件问题。

## 范围

这是**轻量独立插件**,特意不是 dsh-mnemon 的替代:

- ✅ 范围內:Hindsight REST client + 斜杠命令 + 模型工具 + 热配置。
- ❌ 范围外:WebUI 工作台、多 provider 编排、捆绑存储、client/浏览器 bundle、提取/蒸馏子 Agent。

## License

MIT。见 [LICENSE](./LICENSE)。