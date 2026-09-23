/** OpenAI Agents JS recipe, CI-typechecked against the current actrone-memory adapter API. */
// #region openai-agents
import { MemoryManager } from 'actrone-memory'
import { openaiAgentsMemory } from 'actrone-memory/adapters'

const mm = await MemoryManager.create()
const memory = openaiAgentsMemory(mm, { agentId: 'support-bot', sessionId: 'session-1' })

const instructions = await memory.withMemory('You are a helpful agent.', 'the customer plan')
// ...run(new Agent({ instructions }), userInput)...
await memory.remember('what plan is the customer on?', 'Enterprise')
// #endregion openai-agents

export const _openaiAgentsExport = instructions.length
