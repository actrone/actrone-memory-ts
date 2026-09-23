/** Cloudflare Agents recipe, CI-typechecked against the current actrone-memory adapter API. */
// #region cloudflare-agents
import { MemoryManager } from 'actrone-memory'
import { cloudflareAgentsMemory } from 'actrone-memory/adapters'

const mm = await MemoryManager.create()
const memory = cloudflareAgentsMemory(mm, { agentId: 'support-bot', sessionId: 'session-1' })

const system = await memory.getSystem('deployment approvals')
// ...generateText({ model, system, prompt: userInput })...
await memory.remember('how many approvals for a deploy?', 'two')
// #endregion cloudflare-agents

export const _cloudflareAgentsExport = system.length
