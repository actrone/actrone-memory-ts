/** Firebase Genkit recipe, CI-typechecked against the current @actrone/memory adapter API. */
// #region genkit
import { MemoryManager } from '@actrone/memory'
import { genkitMemory } from '@actrone/memory/adapters'

const mm = await MemoryManager.create()
const memory = genkitMemory(mm, { agentId: 'support-bot', sessionId: 'session-1' })

const system = await memory.getSystem('deployment approvals')
// ...ai.generate({ system, prompt: userInput })...
await memory.remember('how many approvals for a deploy?', 'two')
// #endregion genkit

export const _genkitExport = system.length
