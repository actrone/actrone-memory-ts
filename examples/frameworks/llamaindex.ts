/** LlamaIndex.TS recipe — CI-typechecked against the current @actrone/memory adapter API. */
// #region llamaindex
import { MemoryManager } from '@actrone/memory'
import { llamaindexMemory } from '@actrone/memory/adapters'

const mm = await MemoryManager.create()
const memory = llamaindexMemory(mm, { agentId: 'support-bot', sessionId: 'session-1' })

const systemPrompt = await memory.getSystemPrompt('index rebuild schedule')
// ...agent.chat({ message: userInput, systemPrompt })...
await memory.saveTurn('when does the index rebuild?', 'nightly at 2am')
// #endregion llamaindex

export const _llamaindexExport = systemPrompt.length
