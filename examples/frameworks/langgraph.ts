/** LangGraph.js recipe, CI-typechecked against the current @actrone/memory adapter API. */
// #region langgraph
import { MemoryManager } from '@actrone/memory'
import { langgraphMemory } from '@actrone/memory/adapters'

const mm = await MemoryManager.create()
const memory = langgraphMemory(mm, { agentId: 'support-bot', sessionId: 'session-1' })

// pre-model node: merge recalled memory into state.messages
const sys = await memory.loadMemories('what does the customer prefer?')
// post-model node: persist the completed turn
await memory.saveTurn('what does the customer prefer?', 'email over phone')
// #endregion langgraph

export const _langgraphExport = sys?.content.length ?? 0
