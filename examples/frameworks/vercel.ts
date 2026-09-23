/** Vercel AI SDK recipe, CI-typechecked against the current actrone-memory adapter API. */
// #region vercel
import { MemoryManager } from 'actrone-memory'
import { vercelMemory } from 'actrone-memory/adapters'

const mm = await MemoryManager.create()
const prompt = 'summarise the account status'
const mem = await vercelMemory(mm, { agentId: 'support-bot', sessionId: 'session-1', query: prompt })

// `mem.system` feeds `system`; `mem.onFinish` is streamText's onFinish (fires when the stream completes).
// generateText has no onFinish. The ci/compat-matrix canary type-checks this against the real `ai`.
// const res = streamText({ model, prompt, system: mem.system, onFinish: mem.onFinish(prompt) })
await mem.onFinish(prompt)({ text: 'the generated answer' })
// #endregion vercel

export const _vercelExport = mem.system.length
