/**
 * Framework-agnostic core recipe — CI-typechecked against the current @actrone/memory adapter
 * API. The `#region` block is extracted into the docs/CLI snippets, so a break here fails CI.
 */
// #region core
import { MemoryManager } from '@actrone/memory'
import { memoryFor } from '@actrone/memory/adapters'

const mm = await MemoryManager.create() // zero services, local by default
const memory = memoryFor(mm, 'support-bot', 'session-1')

const { systemPrompt } = await memory.recall('what does the user prefer?')
// ...call your LLM with systemPrompt prepended...
await memory.remember('what does the user prefer?', 'dark mode and concise answers')
// #endregion core

export const _coreExport = systemPrompt.length
