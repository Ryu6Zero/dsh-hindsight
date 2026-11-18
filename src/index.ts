import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Side-effect imports register `ctx.tools` / `ctx.commands` / `ctx.systemPrompt`
// on the @deepseek-ai/cordis Context via their `declare module` blocks.
//
// dsh-settings is intentionally NOT imported: since DSH 0.2.x the settings
// service is a form over Loader entries and no longer exposes
// `register()`/`get()`. Configuration reaches `apply()` as its second argument
// (validated by the exported `Config` schema) and the Settings UI edits that
// schema directly, so this plugin needs no runtime call into the service.
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { HindsightClient, HINDSIGHT_SETUP_HINT, type HindsightConfig } from './hindsight.ts'
import { registerCommands } from './commands.ts'
import { registerHindsightTools } from './tools.ts'
import { registerMemorySection } from './section.ts'
import { RecallCache } from './cache.ts'

// Re-export useful pieces for consumers/tests.
export { HindsightClient, HINDSIGHT_SETUP_HINT } from './hindsight.ts'
export { RecallCache } from './cache.ts'
export type { HindsightConfig } from './hindsight.ts'

/**
 * Plugin configuration. The bundle patch (cordis.patch.yml) injects defaults;
 * the Loader validates them against `Config` and hands the merged value to
 * `apply()` as its second argument, so the Settings UI can edit any field and
 * the change is applied on the next plugin reload. Credentials are kept out of
 * checked-in config and out of *_API_KEY style env vars; set `token` only when
 * the Hindsight server requires one (remote deployments).
 */
export interface HindsightPluginConfig {
  endpoint?: string
  /** Token for remote servers; leave '' for local open servers. */
  token?: string
  bankId?: string
  defaultRecallLimit?: number
  requestTimeoutMs?: number
  healthTimeoutMs?: number
  /** Whether hindsight_remember actively prompts the model to save durable facts (default true). */
  autoRemember?: boolean
  /** Register a system-prompt section so the model knows it has memory from turn one (default true). */
  systemPromptSection?: boolean
  /** In-process recall cache TTL in ms (default 60000; 0 disables caching). */
  recallCacheTtlMs?: number
}

export const Config = z.object({
  endpoint: z.string().default('http://localhost:8888'),
  token: z.string().default(''),
  bankId: z.string().default('hermes'),
  defaultRecallLimit: z.number().default(10),
  requestTimeoutMs: z.number().default(15_000),
  healthTimeoutMs: z.number().default(5_000),
  autoRemember: z.boolean().default(true),
  systemPromptSection: z.boolean().default(true),
  recallCacheTtlMs: z.number().default(60_000),
})

export const name = 'dsh-hindsight'
/** Runtime dependencies: the settings form is driven by the exported `Config`. */
export const inject = ['tools', 'commands', 'systemPrompt'] as const

/** Build a client from resolved settings plus a runtime override bank/token. */
export function createClient(config: HindsightPluginConfig, bankId?: string, token?: string, endpoint?: string): HindsightClient {
  return new HindsightClient({
    endpoint: endpoint ?? config.endpoint ?? 'http://localhost:8888',
    token: token ?? config.token ?? '',
    bankId: bankId ?? config.bankId ?? 'hermes',
    defaultRecallLimit: config.defaultRecallLimit ?? 10,
    requestTimeoutMs: config.requestTimeoutMs ?? 15_000,
    healthTimeoutMs: config.healthTimeoutMs ?? 5_000,
    autoRemember: config.autoRemember ?? true,
  })
}

export function apply(rawContext: unknown, baseConfig: HindsightPluginConfig = {}): void {
  const ctx = rawContext as unknown as Context

  // Configuration is resolved by the Loader (`Config` + the bundle patch +
  // the profile's overrides) and passed in here. No registration step exists:
  // the Settings UI reads the exported `Config` schema of this active entry,
  // and saving a field restarts the entry so `apply()` sees the new value.
  const config: HindsightPluginConfig = baseConfig ?? {}

  const resolve = (): HindsightConfig => {
    return {
      endpoint: config.endpoint ?? 'http://localhost:8888',
      token: config.token ?? '',
      bankId: config.bankId ?? 'hermes',
      defaultRecallLimit: config.defaultRecallLimit ?? 10,
      requestTimeoutMs: config.requestTimeoutMs ?? 15_000,
      healthTimeoutMs: config.healthTimeoutMs ?? 5_000,
      autoRemember: config.autoRemember ?? true,
    }
  }

  // In-process recall cache (REQ-010). TTL=0 makes every get/set a no-op
  // (0.3.0 behavior). A TTL change takes effect on the next plugin reload.
  const cache = new RecallCache(() => config.recallCacheTtlMs ?? 60_000)

  // Slash commands owned by the conversation surface.
  registerCommands(ctx, () => resolve(), cache)

  // System-prompt section: the model knows it has memory from turn one.
  // The section follows the plugin fiber lifecycle via its disposer, so
  // flipping the toggle takes effect on the next plugin reload.
  if (config.systemPromptSection ?? true) {
    registerMemorySection(ctx, () => resolve().bankId)
  }

  // Model tools callable in the next agent step.
  registerHindsightTools(ctx.tools, { resolve, cache })
}