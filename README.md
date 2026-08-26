# dsh-hindsight

**Official-grade DeepSeek Harness memory plugin backed by [Hindsight](https://github.com/vectorize-io/hindsight).**

Give your DSH agent real cross-session memory: recall past decisions, remember new facts, inspect memory health — through a self-contained Cordis plugin. No dsh-mnemon, no orchestrator, no bundled storage engine. Just a thin HTTP client over the Hindsight REST API your server already exposes.

## Why

DSH agents are stateless by default — every session starts empty. Existing memory tooling (e.g. dsh-mnemon) is a heavyweight three-tier orchestration bundle. If you already run [Hindsight](https://hindsight.vectorize.io) (a high-quality vector memory engine with entity resolution + knowledge graph + multi-strategy retrieval), this plugin connects DSH to it directly, in a single installable package.

**Confirmed working end-to-end:** a live DSH agent calling `hindsight_recall` retrieved real memories from a Hindsight bank in a headless profile.

## Features

- **`/hindsight` slash command** — `status` / `recall <query>` / `list [query]` / `remember <content>` / `forget <ID>`
- **5 model tools** — `hindsight_status`, `hindsight_recall`, `hindsight_list`, `hindsight_remember`, `hindsight_forget` (callable by the agent in the next step)
- **Live settings** — `endpoint` / `token` / `bankId` / timeouts, applied without restart
- **Standalone client** — `HindsightClient` is a dependency-free HTTP layer (`health`, `recall`, `list`, `listBanks`, `stats`, `remember`, `forget`), reusable outside the plugin

## Install

Requires Node ≥ 20 and DeepSeek Harness ≥ 0.1.1-rc.2.

Add to the Web profile (full UI) and the Headless profile (CLI tasks) — they mount the same tools:

```sh
# npm registry (once published)
dsh plugin --profile web add dsh-hindsight
dsh plugin --profile headless add dsh-hindsight

# or a local development checkout
dsh plugin --profile web add "link:/absolute/path/to/dsh-hindsight"
dsh plugin --profile headless add "link:/absolute/path/to/dsh-hindsight"
```

Then start/restart the profile:

```sh
dsh --profile web
```

## Configure

The default points at `http://localhost:8888`, bank `hermes`. Override per profile or globally via user settings (never edit the bundle patch): the DSH settings surface shows a `hindsight` namespace with:

| Field | Default | Meaning |
|---|---|---|
| `endpoint` | `http://localhost:8888` | Hindsight server base URL |
| `token` | `''` | Bearer token for remote servers; leave empty for local open servers |
| `bankId` | `hermes` | Memory bank id |
| `defaultRecallLimit` | `10` | Max results per recall |
| `requestTimeoutMs` | `15000` | Data-plane request timeout |
| `healthTimeoutMs` | `5000` | Health probe timeout |
| `autoRemember` | `true` | Suggest durable facts to save at session end (semi-auto: asks before writing) |

Environment/user settings take precedence over the bundle defaults. Tokens are kept out of checked-in config.

## Zero-install: no Hindsight yet?

This plugin bridges DSH to an existing Hindsight server. **You don't have one?** Stand up the official Docker image in ~1 minute (needs an `OPENAI_API_KEY`):

```sh
docker run -it --pull always --name hindsight --restart unless-stopped \
  -p 8888:8888 -p 9999:9999 -e HINDSIGHT_API_LLM_API_KEY=$OPENAI_API_KEY \
  -v hindsight-data:/home/hindsight/.pg0 ghcr.io/vectorize-io/hindsight:latest
```

- API server listens on `http://localhost:8888` (what this plugin reads by default).
- Create a memory bank named `hermes` from the control panel at `http://localhost:9999`, or set `bankId` in settings to your own bank.
- `hindsight_status` reports a helpful setup hint (including the commands above) whenever the server is unreachable or the bank is missing, so a failed first run tells you exactly what to do.

Official docs: https://hindsight.vectorize.io/developer/installation

## Usage

```text
/hindsight status                 # bank stats, memory/link/doc counts
/hindsight recall 记忆架构决策     # semantic recall, shows text + ID
/hindsight related <ID> [depth]   # traverse knowledge-graph neighbors (1-5 hops)
/hindsight list                   # recent memories
/hindsight remember 记住X          # queue content for async extraction
/hindsight forget <ID>            # soft-delete (invalidate) one memory
```

The agent can do all of the above on its own in a conversation via the model tools — just ask it to "check memory" or "remember that...".

## Build & test

```sh
pnpm install
pnpm build        # tsdown: lib/index.js + index.d.ts + sourcemap
node scripts/test-client.mjs   # real integration tests against a running Hindsight
```

`scripts/test-client.mjs` hits real Hindsight endpoints (health/stats/listBanks/recall/list/remember/forget). Remember→recall visibility has a **totally valid caveat**: Hindsight extracts asynchronously through its own LLM/consolidation queue, so a freshly `remember`ed fact may take longer than the test window to appear in recall — that's an environmental dependency of Hindsight itself, not the plugin.

## Scope

This is a **lightweight standalone plugin**, deliberately not a dsh-mnemon replacement:

- ✅ In scope: Hindsight REST client + slash commands + model tools + live settings.
- ❌ Out of scope: WebUI workbench, multi-provider orchestration, bundled storage, client/browser bundle, extraction/distillation sub-agents.

## License

MIT. See [LICENSE](./LICENSE).