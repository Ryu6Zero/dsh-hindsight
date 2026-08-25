/**
 * Thin, dependency-free Hindsight (vectorize-io) HTTP client.
 *
 * Talks to the same REST API that Hindsight exposes at /v1/default/banks/...,
 * which Hermes drives today. This module owns no DSH internals so it can be
 * unit-tested and reused outside the plugin.
 */

export interface HindsightConfig {
  /** Base URL of the Hindsight server, e.g. http://localhost:8888 */
  endpoint: string
  /** Optional token (Bearer) for remote servers; empty for open local servers. */
  token?: string
  /** Hindsight "memory bank" id, e.g. `hermes`. */
  bankId: string
  /** Max items returned by /recall. */
  defaultRecallLimit?: number
  /** Request timeout for data-plane calls (ms). */
  requestTimeoutMs?: number
  /** Timeout for cheap health probes (ms). */
  healthTimeoutMs?: number
}

/** One recall result normalized from Hindsight's variable response shapes. */
export interface Insight {
  id: string
  text: string
  category?: string
  score?: number
  createdAt?: string
  entities?: string[]
  tags?: string[]
}

export interface RecallResult {
  results: Insight[]
}

/** Hindsight bank list entry. */
export interface BankSummary {
  id: string
  name: string
  mission?: string
  factCount?: number
}

export interface BankStats {
  totalNodes?: number
  totalLinks?: number
  totalDocuments?: number
  byFactType?: Record<string, number>
  operationsByStatus?: Record<string, number>
}

export interface ForgetReceipt {
  action: 'invalidated' | 'not-found'
  id: string
}

/**
 * Seconds-bounded query runner that coerces buffer/timeout into an
 * AbortSignal, so callers get a single small API regardless of environment.
 */
function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const incoming = options.signal
  if (incoming != null) {
    if (incoming.aborted) controller.abort()
    else incoming.addEventListener('abort', () => controller.abort(), { once: true })
  }
  const { signal: _signal, ...rest } = options
  return fetch(url, { ...rest, signal: controller.signal }).finally(() => clearTimeout(timer))
}

function jsonText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function jsonNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/** Normalize one recall entry from Hindsight's flexible field names. */
export function normalizeInsight(item: unknown): Insight | undefined {
  const rec = asRecord(item)
  if (rec === undefined) return undefined
  const id = jsonText(rec.id)
  const text = jsonText(rec.text) ?? jsonText(rec.content) ?? jsonText(rec.label)
  if (id === undefined || text === undefined) return undefined
  const scores = asRecord(rec.scores)
  const score = jsonNumber(scores?.final) ?? jsonNumber(rec.score)
  const category = jsonText(rec.type) ?? jsonText(rec.fact_type) ?? jsonText(rec.category)
  const createdAt =
    jsonText(rec.mentioned_at) ?? jsonText(rec.date) ?? jsonText(rec.occurred_start)
  return {
    id,
    text,
    ...(category === undefined ? {} : { category }),
    ...(score === undefined ? {} : { score }),
    ...(createdAt === undefined ? {} : { createdAt }),
  }
}

export class HindsightClient {
  private readonly config: Required<
    Pick<HindsightConfig, 'endpoint' | 'bankId' | 'requestTimeoutMs' | 'healthTimeoutMs'>
  > &
    HindsightConfig

  static normalize(config: HindsightConfig): HindsightConfig {
    return {
      ...config,
      endpoint: config.endpoint.replace(/\/+$/u, ''),
      defaultRecallLimit: config.defaultRecallLimit ?? 10,
      requestTimeoutMs: config.requestTimeoutMs ?? 15_000,
      healthTimeoutMs: config.healthTimeoutMs ?? 5_000,
    }
  }

  constructor(config: HindsightConfig) {
    this.config = HindsightClient.normalize(config) as HindsightClient['config']
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = (this.config.token ?? '').replace(/^Bearer\s+/iu, '').trim()
    if (token !== '') out['Authorization'] = `Bearer ${token}`
    if (extra != null) Object.assign(out, extra)
    return out
  }

  private get bankPath(): string {
    return `${this.config.endpoint}/v1/default/banks/${encodeURIComponent(this.config.bankId)}`
  }

  /** Cheap liveness probe; never throws on unhealthy servers. */
  async health(): Promise<boolean> {
    try {
      const res = await fetchWithTimeout(
        `${this.config.endpoint}/health`,
        { method: 'GET', signal: undefined },
        this.config.healthTimeoutMs,
      )
      return res.ok
    } catch {
      return false
    }
  }

  /** Enumerate all memory banks visible to this server. */
  async listBanks(signal?: AbortSignal): Promise<BankSummary[]> {
    const res = await fetchWithTimeout(
      `${this.config.endpoint}/v1/default/banks`,
      { method: 'GET', headers: this.headers(), signal },
      this.config.requestTimeoutMs,
    )
    if (!res.ok) throw new Error(`Hindsight listBanks failed: HTTP ${res.status}`)
    const payload = asRecord(await res.json()) ?? {}
    const entries = Array.isArray(payload.banks) ? payload.banks : []
    return entries.flatMap((value) => {
      const rec = asRecord(value)
      if (rec === undefined) return []
      const id = jsonText(rec.bank_id) ?? jsonText(rec.id)
      if (id === undefined) return []
      return [{
        id,
        name: jsonText(rec.name) ?? id,
        mission: jsonText(rec.mission) ?? jsonText(rec.description),
        factCount: jsonNumber(rec.fact_count),
      }]
    })
  }

  /** Semantic recall. */
  async recall(query: string, signal?: AbortSignal, limit?: number): Promise<RecallResult> {
    const res = await fetchWithTimeout(
      `${this.bankPath}/memories/recall`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          query,
          budget: 'mid',
          max_tokens: Math.min(Math.max((limit ?? this.config.defaultRecallLimit ?? 10) * 400, 400), 8_000),
          types: ['world', 'experience', 'observation'],
          prefer_observations: true,
        }),
        signal,
      },
      this.config.requestTimeoutMs,
    )
    if (!res.ok) throw new Error(`Hindsight recall failed: HTTP ${res.status}`)
    const payload = asRecord(await res.json()) ?? {}
    const items = Array.isArray(payload.results) ? payload.results : Array.isArray(payload.items) ? payload.items : []
    return { results: items.map(normalizeInsight).filter((item): item is Insight => item !== undefined).slice(0, limit ?? this.config.defaultRecallLimit ?? 10) }
  }

  /** List stored memories, optionally filtered by query and state. */
  async list(signal?: AbortSignal, limit = 50, query?: string, state: 'valid' | 'invalidated' | 'all' = 'valid'): Promise<Insight[]> {
    const params = new URLSearchParams({
      limit: String(Math.max(1, Math.min(limit, 1000))),
      offset: '0',
      state: state === 'all' ? 'valid' : state,
    })
    if (query !== undefined && query.trim() !== '') params.set('q', query.trim())
    const res = await fetchWithTimeout(
      `${this.bankPath}/memories/list?${params}`,
      { method: 'GET', headers: this.headers(), signal },
      this.config.requestTimeoutMs,
    )
    if (!res.ok) throw new Error(`Hindsight list failed: HTTP ${res.status}`)
    const payload = asRecord(await res.json()) ?? {}
    const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.results) ? payload.results : []
    return items.map(normalizeInsight).filter((item): item is Insight => item !== undefined)
  }

  /** Latest bank statistics. */
  async stats(signal?: AbortSignal): Promise<BankStats> {
    const res = await fetchWithTimeout(
      `${this.bankPath}/stats`,
      { method: 'GET', headers: this.headers(), signal },
      this.config.requestTimeoutMs,
    )
    if (!res.ok) throw new Error(`Hindsight stats failed: HTTP ${res.status}`)
    const payload = asRecord(await res.json()) ?? {}
    const byFactType: Record<string, number> = {}
    const rawByFactType = asRecord(payload.nodes_by_fact_type)
    if (rawByFactType !== undefined) {
      for (const [key, value] of Object.entries(rawByFactType)) {
        const n = jsonNumber(value)
        if (n !== undefined) byFactType[key] = n
      }
    }
    const operationsByStatus: Record<string, number> = {}
    const rawOps = asRecord(payload.operations_by_status)
    if (rawOps !== undefined) {
      for (const [key, value] of Object.entries(rawOps)) {
        const n = jsonNumber(value)
        if (n !== undefined) operationsByStatus[key] = n
      }
    }
    return {
      totalNodes: jsonNumber(payload.total_nodes),
      totalLinks: jsonNumber(payload.total_links),
      totalDocuments: jsonNumber(payload.total_documents),
      byFactType,
      operationsByStatus,
    }
  }

  /**
   * Queue content for asynchronous structured memory extraction. Requires a
   * live Hindsight LLM/extraction channel; returns an operation receipt.
   */
  async remember(content: string, context?: string, signal?: AbortSignal): Promise<{ action: 'stored'; operationId: string }> {
    const operationId = crypto.randomUUID()
    const res = await fetchWithTimeout(
      `${this.bankPath}/memories`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          items: [{ content, context: context ?? 'dsh-hindsight', metadata: { source: 'dsh-hindsight' } }],
          async: true,
          operation_id: operationId,
        }),
        signal,
      },
      this.config.requestTimeoutMs,
    )
    if (!res.ok) throw new Error(`Hindsight remember failed: HTTP ${res.status}`)
    const payload = asRecord(await res.json()) ?? {}
    return {
      action: 'stored' as const,
      operationId: jsonText(payload.operation_id) ?? operationId,
    }
  }

  /** Soft-delete (invalidate) one memory by exact id. */
  async forget(id: string, signal?: AbortSignal): Promise<ForgetReceipt> {
    const res = await fetchWithTimeout(
      `${this.bankPath}/memories/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify({ state: 'invalidated', reason: 'Forgotten from dsh-hindsight' }),
        signal,
      },
      this.config.requestTimeoutMs,
    )
    if (res.status === 404) return { action: 'not-found', id }
    if (!res.ok) throw new Error(`Hindsight forget failed: HTTP ${res.status}`)
    return { action: 'invalidated', id }
  }
}