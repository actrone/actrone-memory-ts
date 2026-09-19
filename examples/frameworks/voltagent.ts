/** VoltAgent recipe, CI-typechecked against the current @actrone/memory adapter API. */
// #region voltagent
import { MemoryManager } from '@actrone/memory'
import { voltagentMemory } from '@actrone/memory/adapters'

const mm = await MemoryManager.create()
const memory = voltagentMemory(mm, { agentId: 'support-bot', sessionId: 'session-1' })

const instructions = await memory.withInstructions('You are a support agent.', 'deployment approvals')
// ...new Agent({ instructions }).generateText(userInput)...
await memory.remember('how many approvals for a deploy?', 'two')
// #endregion voltagent

export const _voltagentExport = instructions.length
