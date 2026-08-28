import type { Context } from '@deepseek-ai/cordis'

/**
 * System-prompt section (REQ-007, 0.3.0): the "section provider" half of the
 * official memory-plugin shape (`Memory = section provider + tool`). Registers
 * a static guidance block in the tool-guidance order band (100–199) so the
 * model knows from turn one that it has cross-session memory, when to recall,
 * when to proactively save, and how to trace connections.
 */
export function registerMemorySection(ctx: Context, bankId: () => string): void {
  ctx.systemPrompt.section({
    name: 'hindsight-memory',
    order: 130,
    text: [
      '## Long-term memory (Hindsight)',
      '',
      `You have cross-session long-term memory backed by Hindsight (bank: ${bankId()}).`,
      '',
      '- When the task involves past decisions, user preferences, project history, or anything that predates this conversation, call `hindsight_recall` with a focused natural-language query BEFORE answering from guesses.',
      '- When the conversation surfaces a durable fact the user will rely on later (preferences, decisions, constraints, IDs, endpoints, versions), proactively call `hindsight_remember`. If unsure whether it is durable enough, ask the user first ("记住这个吗?").',
      '- To trace how a memory connects to related decisions or entities, use `hindsight_related` with its id.',
      '- To check whether an async save landed, use `hindsight_operations`.',
      '',
      'Memory tools are cheap; recalling beats confabulating.',
    ].join('\n'),
  })
}
