/** LangChain.js recipe, CI-typechecked against the current @actrone/memory adapter API. */
// #region langchain
import { MemoryManager } from '@actrone/memory'
import { langchainMemory } from '@actrone/memory/adapters'

const mm = await MemoryManager.create()
const memory = langchainMemory(mm, { agentId: 'support-bot', sessionId: 'session-1' })

const context = await memory.loadContext('account standing') // prepend to your prompt
await memory.saveTurn('what is my account standing?', 'in good standing')
// #endregion langchain

export const _langchainExport = context.length
