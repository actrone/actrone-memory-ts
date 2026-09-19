/** Mastra recipe, CI-typechecked against the current @actrone/memory adapter API. */
// #region mastra
import { MemoryManager } from '@actrone/memory'
import { mastraMemory } from '@actrone/memory/adapters'

const mm = await MemoryManager.create()
const memory = mastraMemory(mm, { agentId: 'support-bot', sessionId: 'session-1' })

const system = await memory.getSystemContext('ticket SLA')
// ...agent.generate({ ...context, system })...
await memory.remember('what is the ticket SLA?', '24 hours')
// #endregion mastra

export const _mastraExport = system.length
