import type { ToolRuntime, JsonValue } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { HindsightConfig, Insight } from './hindsight.ts'
import { HindsightClient, HINDSIGHT_SETUP_HINT } from './hindsight.ts'

const JSON_OUTPUT = { type: 'object', additionalProperties: true } as const

/** Canonical tool result must be a JSON object. */
type JsonObj = Record<string, JsonValue>

function renderText(_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> {
  return [{
    type: 'text',
    text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  }]
}

function bound(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

function toInsightJson(item: { id: string; text: string; category?: string; score?: number; createdAt?: string; entities?: string[] }): JsonObj {
  return {
    id: item.id,
    text: bound(item.text, 900),
    ...(item.category === undefined ? {} : { category: item.category }),
    ...(item.score === undefined ? {} : { score: item.score }),
    ...(item.createdAt === undefined ? {} : { createdAt: item.createdAt }),
    ...(item.entities === undefined || item.entities.length === 0 ? {} : { entities: item.entities as JsonValue }),
  }
}

export function registerHindsightTools(ctxTools: ToolRuntime, resolve: () => HindsightConfig): void {
  ctxTools.register(defineTool({
    name: 'hindsight_status',
    description: 'Check Hindsight memory-server health, bank statistics, or diagnose a broken setup. When the server is unreachable, returns a setup hint with the Docker one-liner. Use when a memory operation fails or the user asks about memory health.',
    parameters: {},
    output: { schema: JSON_OUTPUT, render: renderText },
    async execute(_args: unknown, exec): Promise<JsonObj> {
      const client = new HindsightClient(resolve())
      const dx = await client.diagnose()
      if (!dx.reachable) {
        return {
          healthy: false,
          reachable: false,
          endpoint: resolve().endpoint,
          error: dx.error ?? 'Hindsight server unreachable',
          hint: HINDSIGHT_SETUP_HINT,
        }
      }
      if (!dx.bankExists) {
        return {
          healthy: false,
          reachable: true,
          endpoint: resolve().endpoint,
          bankId: resolve().bankId,
          error: dx.error ?? `bank ${resolve().bankId} missing`,
          hint: `bank「${resolve().bankId}」不存在。Hindsight 启动后需先在控制面板(/9999)创建该内存库。`,
        }
      }
      let stats: JsonValue
      try {
        stats = (await client.stats(exec.signal)) as JsonValue
      } catch (err) {
        stats = { error: err instanceof Error ? err.message : String(err) } as JsonValue
      }
      return { healthy: true, reachable: true, endpoint: resolve().endpoint, bankId: resolve().bankId, stats }
    },
  }))

  ctxTools.register(defineTool({
    name: 'hindsight_recall',
    description: 'Recall bounded semantic evidence from the configured Hindsight bank when the current task needs project or session history. Use focused natural-language queries; results are ranked by relevance and capped.',
    parameters: {
      query: {
        type: 'string', required: true,
        description: 'Focused natural-language memory query.',
      },
      limit: {
        type: 'integer',
        description: 'Maximum number of results (1-10, default 5).',
      },
    },
    output: { schema: JSON_OUTPUT, render: renderText },
    async execute(args: { query: string; limit?: number }, exec) {
      const client = new HindsightClient(resolve())
      const limit = args.limit == null ? 5 : Math.max(1, Math.min(10, Math.trunc(args.limit)))
      const result = await client.recall(args.query, exec.signal, limit)
      return {
        query: args.query,
        total: result.results.length,
        results: result.results.map(toInsightJson),
        hint: 'Results are bounded evidence. Answer from them; run one more focused recall only if exact history is still missing.',
      } satisfies JsonObj
    },
  }))

  ctxTools.register(defineTool({
    name: 'hindsight_list',
    description: 'List stored Hindsight memories, optionally filtered by keyword and state. Useful to browse what was retained or find an exact memory id before forgetting.',
    parameters: {
      query: { type: 'string', description: 'Optional keyword filter; empty lists recent memories.' },
      limit: { type: 'integer', description: 'Maximum results (1-200, default 20).' },
      state: { type: 'string', enum: ['valid', 'invalidated'], description: 'Memory lifecycle state (default valid).' },
    },
    output: { schema: JSON_OUTPUT, render: renderText },
    async execute(args: { query?: string; limit?: number; state?: 'valid' | 'invalidated' }, exec) {
      const client = new HindsightClient(resolve())
      const result = await client.list(
        exec.signal,
        args.limit == null ? 20 : Math.max(1, Math.min(200, Math.trunc(args.limit))),
        args.query ?? '',
        args.state ?? 'valid',
      )
      return {
        query: args.query ?? '',
        total: result.length,
        results: result.map(toInsightJson),
        hint: 'Use a returned id with hindsight_forget to invalidate an exact memory.',
      } satisfies JsonObj
    },
  }))

  ctxTools.register(defineTool({
    name: 'hindsight_remember',
    description: 'Commit a durable, reusable fact to Hindsight for asynchronous structured memory extraction (stored as world/experience/observation with entities). Call it proactively whenever the conversation surfaces something the user will want to rely on later — key preferences, project decisions, recurring constraints, an ID/endpoint/version. It is not for ephemeral or transient content. When in doubt whether it is durable enough, ask the user a one-line "记住这个吗?" instead of auto-committing.',
    parameters: {
      content: { type: 'string', required: true, description: 'The durable fact to commit (a complete statement, not a fragment).' },
      context: { type: 'string', description: 'Optional context/source label, e.g. "user-preference" or "project-decision".' },
    },
    output: { schema: JSON_OUTPUT, render: renderText },
    async execute(args: { content: string; context?: string }, exec) {
      const client = new HindsightClient(resolve())
      const receipt = await client.remember(args.content, args.context ?? 'dsh-hindsight', exec.signal)
      return {
        action: 'stored',
        operationId: receipt.operationId,
        summary: 'Hindsight queued the content for structured memory extraction.',
        bankId: resolve().bankId,
      } satisfies JsonObj
    },
  }))

  ctxTools.register(defineTool({
    name: 'hindsight_forget',
    description: 'Soft-delete (invalidate) one Hindsight memory by exact id. Use only on explicit user request or when content is wrong or obsolete.',
    parameters: {
      id: { type: 'string', required: true, description: 'Exact memory id returned by hindsight_recall or hindsight_list.' },
    },
    output: { schema: JSON_OUTPUT, render: renderText },
    async execute(args: { id: string }, exec) {
      const client = new HindsightClient(resolve())
      const receipt = await client.forget(args.id, exec.signal)
      return {
        action: receipt.action,
        id: args.id,
        summary: receipt.action === 'not-found' ? 'No memory with that id.' : 'Memory invalidated (soft delete).',
      } satisfies JsonObj
    },
  }))

  ctxTools.register(defineTool({
    name: 'hindsight_related',
    description: 'Traverse Hindsight knowledge-graph neighbors of one memory id returned by hindsight_recall or hindsight_list. Use it ONLY after a recall hit when the graph connections matter (e.g. tracing related decisions/entities); each traversal fetches the graph, so do not call it preemptively.',
    parameters: {
      id: { type: 'string', required: true, description: 'Exact memory id from hindsight_recall/hindsight_list.' },
      depth: { type: 'integer', description: 'Traversal depth (1-5, default 2).' },
    },
    output: { schema: JSON_OUTPUT, render: renderText },
    async execute(args: { id: string; depth?: number }, exec) {
      const client = new HindsightClient(resolve())
      const depth = args.depth == null ? 2 : Math.max(1, Math.min(5, Math.trunc(args.depth)))
      const nodes = await client.related(args.id, depth, exec.signal)
      return {
        id: args.id,
        depth,
        total: nodes.length,
        results: nodes.map(toInsightJson),
        hint: 'These are graph neighbors of the memory. Use when connection/entity context is needed; answer from them without re-traversing this turn.',
      } satisfies JsonObj
    },
  }))

  ctxTools.register(defineTool({
    name: 'hindsight_operations',
    description: 'List recent Hindsight async operations (memory extraction/consolidation queue) with status, progress and errors. Use it to answer "did what I just saved actually land?" or to diagnose memory-write issues.',
    parameters: {
      limit: { type: 'integer', description: 'Maximum operations to list (1-100, default 20).' },
    },
    output: { schema: JSON_OUTPUT, render: renderText },
    async execute(args: { limit?: number }, exec) {
      const client = new HindsightClient(resolve())
      const limit = args.limit == null ? 20 : Math.max(1, Math.min(100, Math.trunc(args.limit)))
      const operations = await client.operations(exec.signal, limit)
      return {
        bankId: resolve().bankId,
        total: operations.length,
        operations: operations.map((op): JsonObj => ({
          id: op.id,
          taskType: op.taskType,
          status: op.status,
          ...(op.itemsCount === undefined ? {} : { itemsCount: op.itemsCount }),
          ...(op.progress === undefined ? {} : { progress: op.progress }),
          ...(op.retryCount === undefined ? {} : { retryCount: op.retryCount }),
          ...(op.errorMessage === undefined ? {} : { errorMessage: op.errorMessage }),
          ...(op.updatedAt === undefined ? {} : { updatedAt: op.updatedAt }),
        })),
        hint: 'status: queued/processing means still extracting; completed means landed; failed shows errorMessage.',
      } satisfies JsonObj
    },
  }))

  ctxTools.register(defineTool({
    name: 'hindsight_condense',
    description: 'Batch-commit 2-10 durable facts to Hindsight with automatic duplicate skipping (normalized-text match against existing memories). Use when a conversation produced several distinct durable facts at once; for a single fact use hindsight_remember. Decide relevance yourself first — the dedup here is conservative text matching, not semantic.',
    parameters: {
      facts: {
        type: 'array',
        required: true,
        description: '2-10 complete durable fact statements to commit.',
      },
    },
    output: { schema: JSON_OUTPUT, render: renderText },
    async execute(args: { facts: string[] }, exec): Promise<JsonObj> {
      const facts = Array.isArray(args.facts) ? args.facts.filter((f): f is string => typeof f === 'string' && f.trim() !== '') : []
      if (facts.length < 2) {
        return {
          action: 'rejected',
          reason: 'hindsight_condense needs 2-10 facts; use hindsight_remember for a single fact.',
        }
      }
      const client = new HindsightClient(resolve())
      const capped = facts.slice(0, 10)
      const normalize = (s: string): string => s.replace(/\s+/gu, '').replace(/[！!？?，,。.:：;；"“”'']/gu, '').toLowerCase()
      // Dedup against the most recent memories only: condense handles facts
      // produced in the current conversation, so overlaps live in the recent
      // window. Text-normalized containment match; semantics stay the model's job.
      let recent: Insight[] = []
      try {
        recent = await client.list(exec.signal, 20, undefined, 'valid')
      } catch { recent = [] }
      const recentNorms = recent.map((m) => normalize(m.text))
      const stored: Array<JsonObj> = []
      const duplicates: string[] = []
      const failed: Array<JsonObj> = []
      for (const fact of capped) {
        const norm = normalize(fact)
        const isDup = recentNorms.some((mn) => mn === norm || mn.includes(norm) || norm.includes(mn))
        if (isDup) {
          duplicates.push(fact)
          continue
        }
        try {
          const receipt = await client.remember(fact, 'dsh-hindsight-condense', exec.signal)
          stored.push({ content: fact, operationId: receipt.operationId })
          recentNorms.push(norm)
        } catch (err) {
          failed.push({ content: fact, error: err instanceof Error ? err.message : String(err) })
        }
      }
      const result: JsonObj = {
        submitted: capped.length,
        stored,
        duplicates,
      }
      if (failed.length > 0) result.failed = failed
      result.hint = 'stored entries are queued for async extraction — check hindsight_operations to confirm landing.'
      return result
    },
  }))
}