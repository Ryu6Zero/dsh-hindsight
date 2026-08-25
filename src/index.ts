import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Side-effect imports register `ctx.settings` / `ctx.tools` / `ctx.commands`
// on the @deepseek-ai/cordis Context via their `declare module` blocks.
import type {} from '@deepseek-ai/dsh-settings'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-commands'
import { HindsightClient, type HindsightConfig } from './hindsight.ts'
import { registerCommands } from './commands.ts'
import { registerHindsightTools } from './tools.ts'

/**
 * Plugin configuration. The bundle patch (cordis.patch.yml) injects defaults;
 * users may override any field through profile user settings. Credentials are
 * kept out of checked-in config and out of *_API_KEY style env vars; set `token`
 * only when the Hindsight server requires one (remote deployments).
 */
export interface HindsightPluginConfig {
  endpoint?: string
  /** Token for remote servers; leave '' for local open servers. */
  token?: string
  bankId?: string
  defaultRecallLimit?: number
  requestTimeoutMs?: number
  healthTimeoutMs?: number
}

export const Config = z.object({
  endpoint: z.string().default('http://localhost:8888'),
  token: z.string().default(''),
  bankId: z.string().default('hermes'),
  defaultRecallLimit: z.number().default(10),
  requestTimeoutMs: z.number().default(15_000),
  healthTimeoutMs: z.number().default(5_000),
})

export const name = 'dsh-hindsight'
export const inject = ['tools', 'settings', 'commands'] as const

/** Build a client from resolved settings plus a runtime override bank/token. */
export function createClient(config: HindsightPluginConfig, bankId?: string, token?: string, endpoint?: string): HindsightClient {
  return new HindsightClient({
    endpoint: endpoint ?? config.endpoint ?? 'http://localhost:8888',
    token: token ?? config.token ?? '',
    bankId: bankId ?? config.bankId ?? 'hermes',
    defaultRecallLimit: config.defaultRecallLimit ?? 10,
    requestTimeoutMs: config.requestTimeoutMs ?? 15_000,
    healthTimeoutMs: config.healthTimeoutMs ?? 5_000,
  })
}

export function apply(rawContext: unknown, baseConfig: HindsightPluginConfig = {}): void {
  const ctx = rawContext as unknown as Context

  // Settings namespace. `applies: 'live'` lets the SDK re-read config on change
  // without restarting the profile.
  const settings = ctx.settings.register(settingsNamespace('hindsight'), Config, {
    base: baseConfig,
    applies: 'live',
  })

  const resolve = (): HindsightConfig => {
    const value = settings.get() ?? {}
    return {
      endpoint: value.endpoint ?? 'http://localhost:8888',
      token: value.token ?? '',
      bankId: value.bankId ?? 'hermes',
      defaultRecallLimit: value.defaultRecallLimit ?? 10,
      requestTimeoutMs: value.requestTimeoutMs ?? 15_000,
      healthTimeoutMs: value.healthTimeoutMs ?? 5_000,
    }
  }

  // Slash commands owned by the conversation surface.
  registerCommands(ctx, () => resolve())

  // Model tools callable in the next agent step.
  registerHindsightTools(ctx.tools, () => resolve())
}