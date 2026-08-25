import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { HindsightConfig } from './hindsight.ts'
import { HindsightClient } from './hindsight.ts'

const USAGE = '用法：/hindsight [status|recall <查询>|list [查询]|remember <内容>|forget <ID>]'

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

export function registerCommands(ctx: Context, resolve: () => HindsightConfig): void {
  ctx.commands.register({
    name: 'hindsight',
    description: 'Query or write Hindsight memory. Subcommands: status, recall <query>, list [query], remember <content>, forget <ID>.',
    input: { hint: 'recall 用户偏好的开发语言' },
    async handler(invocation: CommandInvocation): Promise<CommandResult> {
      const { verb, argument } = splitInput(invocation.rawInput)
      const client = new HindsightClient(resolve())
      switch (verb) {
        case 'status': {
          if (argument !== '') return error('status 不接受额外参数。')
          const alive = await client.health()
          if (!alive) return { kind: 'error', text: `Hindsight 不可用（${resolve().endpoint}）。请确认服务在运行。` }
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
          if (argument === '') return error('recall 需要一个明确查询。')
          const result = await client.recall(argument, invocation.signal)
          if (result.results.length === 0) return { kind: 'success', text: `没有找到与“${argument}”相关的记忆。` }
          return { kind: 'success', text: `召回 ${result.results.length} 条：\n\n${result.results.map(insightLine).join('\n\n')}` }
        }
        case 'list': {
          const result = await client.list(invocation.signal, 20, argument, 'valid')
          if (result.length === 0) return { kind: 'success', text: argument === '' ? '当前没有有效记忆。' : `没有匹配“${argument}”的记忆。` }
          return { kind: 'success', text: `记忆 ${result.length} 条：\n\n${result.map(insightLine).join('\n\n')}` }
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