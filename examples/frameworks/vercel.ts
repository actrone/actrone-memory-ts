/** Vercel AI SDK recipe — CI-typechecked against the current @actrone/memory adapter API. */
// #region vercel
import { MemoryManager } from '@actrone/memory'
import { vercelMemory } from '@actrone/memory/adapters'

const mm = await MemoryManager.create()
const prompt = 'summarise the account status'
const mem = await vercelMemory(mm, { agentId: 'support-bot', sessionId: 'session-1', query: prompt })

// const res = await generateText({ model, prompt, system: mem.system, onFinish: mem.onFinish(prompt) })
await mem.onFinish(prompt)({ text: 'the generated answer' })
// #endregion vercel

export const _vercelExport = mem.system.length
