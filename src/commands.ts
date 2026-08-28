import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { HindsightConfig } from './hindsight.ts'
import { HindsightClient, HINDSIGHT_SETUP_HINT } from './hindsight.ts'
import type { RecallCache } from './cache.ts'

const USAGE = '用法：/hindsight [status|recall [@库] <查询>|related [@库] <ID> [depth]|list [@库] [查询]|operations [@库] [数量]|remember <内容>|forget <ID>]'

function error(text: string): CommandResult {
  return { kind: 'error', text: `${text}\n${USAGE}` }
}

function clip(value: string, max = 600): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

function insightLine(insight: { id: string; text: string; category?: string; score?: number; createdAt?: string }, index: number): string {
  const meta = [
    insight.category === undefined ? undefined : insight.category,
    insight.score === undefined ? undefined : `score=${insight.score.toFixed(3)}`,
    insight.createdAt === undefined ? undefined : insight.createdAt,
  ].filter((value): value is string => value !== undefined).join(' · ')
  return `${index + 1}. ${clip(insight.text)}\n   ID: ${insight.id}${meta === '' ? '' : ` · ${meta}`}`
}

function splitInput(rawInput: string): { verb: string; argument: string } {
  const input = rawInput.trim()
  if (input === '') return { verb: 'status', argument: '' }
  const separator = input.search(/\s/u)
  return separator < 0
    ? { verb: input.toLowerCase(), argument: '' }
    : { verb: input.slice(0, separator).toLowerCase(), argument: input.slice(separator).trim() }
}

export function registerCommands(ctx: Context, resolve: () => HindsightConfig, cache?: RecallCache): void {
  // REQ-011: read-only subcommands accept a `@bankId` prefix on their argument.
  const parseArg = (raw: string): { bank?: string; argument: string } => {
    if (raw.startsWith('@')) {
      const sp = raw.indexOf(' ')
      if (sp > 1) return { bank: raw.slice(1, sp), argument: raw.slice(sp + 1).trim() }
      return { bank: raw.slice(1), argument: '' }
    }
    return { argument: raw }
  }
  const clientForRead = (bank?: string): HindsightClient => {
    const cfg = resolve()
    return bank === undefined ? new HindsightClient(cfg) : new HindsightClient({ ...cfg, bankId: bank })
  }
  const cachedRecall = async (query: string, signal?: AbortSignal, bank?: string) => {
    const cfg = resolve()
    const bankId = bank ?? cfg.bankId
    const client = clientForRead(bank)
    const limit = cfg.defaultRecallLimit ?? 10
    if (cache !== undefined) {
      const hit = cache.get(bankId, query, limit)
      if (hit !== undefined) return hit.result
    }
    const result = await client.recall(query, signal, limit)
    if (cache !== undefined) cache.set(bankId, query, limit, result)
    return result
  }
  ctx.commands.register({
    name: 'hindsight',
    description: 'Query or write Hindsight memory. Subcommands: status, recall <query>, related <ID> [depth], list [query], operations [limit], remember <content>, forget <ID>.',
    input: { hint: 'recall 用户偏好的开发语言' },
    async handler(invocation: CommandInvocation): Promise<CommandResult> {
      const { verb, argument } = splitInput(invocation.rawInput)
      const client = new HindsightClient(resolve())
      switch (verb) {
        case 'status': {
          if (argument !== '') return error('status 不接受额外参数。')
          const dx = await client.diagnose()
          if (!dx.reachable) {
            return { kind: 'error', text: `${dx.error ?? 'Hindsight 不可用'}。\n\n${HINDSIGHT_SETUP_HINT}` }
          }
          if (!dx.bankExists) {
            return { kind: 'error', text: `${dx.error ?? `bank ${resolve().bankId} 缺失`}。Hindsight 控制面板(/9999)创建该内存库后再试。` }
          }
          const stats = await client.stats(invocation.signal)
          return {
            kind: 'success',
            text: [
              `Hindsight · bank=${resolve().bankId}`,
              `端点: ${resolve().endpoint}`,
              `有效记忆: ${stats.totalNodes ?? 0} · 连接: ${stats.totalLinks ?? 0} · 文档: ${stats.totalDocuments ?? 0}`,
              ...(stats.byFactType !== undefined && Object.keys(stats.byFactType).length > 0
                ? [`分类: ${Object.entries(stats.byFactType).map(([k, v]) => `${k}=${v}`).join(' · ')}`]
                : []),
            ].join('\n'),
          }
        }
        case 'recall': {
          const { bank, argument: q } = parseArg(argument)
          if (q === '') return error('recall 需要一个明确查询(可用 @库 前缀指定 bank)。')
          const result = await cachedRecall(q, invocation.signal, bank)
          if (result.results.length === 0) return { kind: 'success', text: `没有找到与“${q}”相关的记忆。` }
          return { kind: 'success', text: `召回 ${result.results.length} 条：\n\n${result.results.map(insightLine).join('\n\n')}` }
        }
        case 'related': {
          const { bank, argument: arg1 } = parseArg(argument)
          if (arg1 === '') return error('related 需要 recall/list 返回的完整记忆 ID。')
          const space = arg1.indexOf(' ')
          const id = space < 0 ? arg1 : arg1.slice(0, space)
          const depthRaw = space < 0 ? undefined : arg1.slice(space + 1).trim()
          if (depthRaw !== undefined) {
            const n = Number(depthRaw)
            if (!Number.isInteger(n) || n < 1 || n > 5) return error('depth 需为 1-5 的整数。')
          }
          const nodes = await clientForRead(bank).related(id, depthRaw === undefined ? 2 : Number(depthRaw), invocation.signal)
          if (nodes.length === 0) return { kind: 'success', text: `ID ${id} 的 ${depthRaw === undefined ? 2 : Number(depthRaw)} 跳内没有关联记忆。` }
          return { kind: 'success', text: `关联记忆 ${nodes.length} 条（depth=${depthRaw === undefined ? 2 : Number(depthRaw)}）：\n\n${nodes.map(insightLine).join('\n\n')}` }
        }
        case 'list': {
          const { bank, argument: q } = parseArg(argument)
          const result = await clientForRead(bank).list(invocation.signal, 20, q, 'valid')
          if (result.length === 0) return { kind: 'success', text: q === '' ? '当前没有有效记忆。' : `没有匹配“${q}”的记忆。` }
          return { kind: 'success', text: `记忆 ${result.length} 条：\n\n${result.map(insightLine).join('\n\n')}` }
        }
        case 'operations': {
          const { bank, argument: arg1 } = parseArg(argument)
          const n = arg1 === '' ? 20 : Number(arg1)
          if (!Number.isInteger(n) || n < 1 || n > 100) return error('operations 的数量需为 1-100 的整数。')
          const ops = await clientForRead(bank).operations(invocation.signal, n)
          if (ops.length === 0) return { kind: 'success', text: '最近没有异步操作。' }
          const lines = ops.map((op, i) => {
            const meta = [
              op.progress === undefined ? undefined : `progress=${op.progress}`,
              op.retryCount === undefined ? undefined : `retry=${op.retryCount}`,
              op.updatedAt === undefined ? undefined : op.updatedAt,
            ].filter((v): v is string => v !== undefined).join(' · ')
            const err = op.errorMessage === undefined ? '' : `\n   错误: ${op.errorMessage}`
            return `${i + 1}. [${op.status}] ${op.taskType} · ${op.id}${meta === '' ? '' : `\n   ${meta}`}${err}`
          })
          const failedCount = ops.filter((op) => op.status === 'failed').length
          const summary = failedCount > 0 ? `（其中 ${failedCount} 条 failed）` : ''
          return { kind: 'success', text: `最近异步操作 ${ops.length} 条${summary}：\n\n${lines.join('\n')}` }
        }
        case 'remember': {
          if (argument === '') return error('remember 需要要记住的内容。')
          const receipt = await client.remember(argument, 'dsh-hindsight', invocation.signal)
          return { kind: 'success', text: `已提交记忆(${receipt.operationId})，等待 Hindsight 异步结构化提取。` }
        }
        case 'forget': {
          if (argument === '') return error('forget 需要 recall 或 list 返回的完整记忆 ID。')
          if (argument.includes(' ')) return error('forget 只接受一个不含空格的 ID。')
          const receipt = await client.forget(argument, invocation.signal)
          if (receipt.action === 'not-found') return { kind: 'error', text: `未找到 ID ${argument} 的记忆。` }
          return { kind: 'success', text: `已作废记忆 ${argument}（软删除，invalidated）。` }
        }
        default:
          return error(`未知子命令“${verb}”。`)
      }
    },
  })
}