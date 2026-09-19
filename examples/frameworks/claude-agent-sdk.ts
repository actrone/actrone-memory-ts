/** Claude Agent SDK recipe, CI-typechecked against the current @actrone/memory adapter API. */
// #region claude-agent-sdk
import { MemoryManager } from '@actrone/memory'
import { claudeAgentMemory } from '@actrone/memory/adapters'

const mm = await MemoryManager.create()
const memory = claudeAgentMemory(mm, { agentId: 'support-bot', sessionId: 'session-1' })

const systemPrompt = await memory.appendToSystemPrompt('You are a support agent.', 'deployment approvals')
// ...query({ prompt: userInput, options: { systemPrompt } })...
await memory.remember('how many approvals for a deploy?', 'two')
// #endregion claude-agent-sdk

export const _claudeAgentSdkExport = systemPrompt.length
