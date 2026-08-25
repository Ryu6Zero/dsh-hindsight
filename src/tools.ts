import type { ToolRuntime, JsonValue } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { HindsightConfig } from './hindsight.ts'
import { HindsightClient } from './hindsight.ts'

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

function toInsightJson(item: { id: string; text: string; category?: string; score?: number; createdAt?: string }): JsonObj {
  return {
    id: item.id,
    text: bound(item.text, 900),
    ...(item.category === undefined ? {} : { category: item.category }),
    ...(item.score === undefined ? {} : { score: item.score }),
    ...(item.createdAt === undefined ? {} : { createdAt: item.createdAt }),
  }
}

export function registerHindsightTools(ctxTools: ToolRuntime, resolve: () => HindsightConfig): void {
  ctxTools.register(defineTool({
    name: 'hindsight_status',
    description: 'Check Hindsight memory-server health and current bank statistics. Use only when a memory operation fails or the user asks about memory health; do not call it to route recall.',
    parameters: {},
    output: { schema: JSON_OUTPUT, render: renderText },
    async execute(_args: unknown, exec): Promise<JsonObj> {
      const client = new HindsightClient(resolve())
      const alive = await client.health()
      if (!alive) {
        return { healthy: false, endpoint: resolve().endpoint, error: 'Hindsight server unreachable' }
      }
      let stats: JsonValue
      try {
        stats = (await client.stats(exec.signal)) as JsonValue
      } catch (err) {
        stats = { error: err instanceof Error ? err.message : String(err) } as JsonValue
      }
      return { healthy: true, endpoint: resolve().endpoint, bankId: resolve().bankId, stats }
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
    description: 'Commit content to Hindsight for asynchronous structured memory extraction (stored as world/experience/observation with entities). Use when the user explicitly asks to remember something durable.',
    parameters: {
      content: { type: 'string', required: true, description: 'The fact to commit.' },
      context: { type: 'string', description: 'Optional context/source label, e.g. "user-preference".' },
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
}