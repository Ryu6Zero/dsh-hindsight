import type { RecallResult } from './hindsight.ts'

/**
 * In-process TTL cache for recall results (REQ-010, 0.4.0). Pure memory,
 * per-plugin-instance, lost on restart — no cross-session pollution.
 * Write operations (remember/forget/condense) must call invalidateBank().
 */
export class RecallCache {
  private readonly entries = new Map<string, { expires: number; result: RecallResult }>()
  private readonly maxEntries = 100

  constructor(private readonly ttlMs: () => number) {}

  private key(bankId: string, query: string, limit: number): string {
    const norm = query.replace(/\s+/gu, '').toLowerCase()
    return `${bankId}\u0000${norm}\u0000${limit}`
  }

  get(bankId: string, query: string, limit: number): { result: RecallResult; cached: true } | undefined {
    if (this.ttlMs() <= 0) return undefined
    const k = this.key(bankId, query, limit)
    const hit = this.entries.get(k)
    if (hit === undefined) return undefined
    if (Date.now() > hit.expires) {
      this.entries.delete(k)
      return undefined
    }
    // Refresh insertion order (simple LRU-ish: re-insert at newest position).
    this.entries.delete(k)
    this.entries.set(k, hit)
    return { result: hit.result, cached: true }
  }

  set(bankId: string, query: string, limit: number, result: RecallResult): void {
    const ttl = this.ttlMs()
    if (ttl <= 0) return
    const k = this.key(bankId, query, limit)
    if (this.entries.size >= this.maxEntries) {
      // Evict oldest inserted (first key of the Map).
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(k, { expires: Date.now() + ttl, result })
  }

  /** Drop every cached entry for one bank (call after any successful write). */
  invalidateBank(bankId: string): void {
    const prefix = `${bankId}\u0000`
    for (const k of this.entries.keys()) {
      if (k.startsWith(prefix)) this.entries.delete(k)
    }
  }
}
