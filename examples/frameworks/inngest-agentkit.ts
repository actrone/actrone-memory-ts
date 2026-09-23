/** Inngest AgentKit recipe, CI-typechecked against the current actrone-memory adapter API. */
// #region inngest-agentkit
import { MemoryManager } from 'actrone-memory'
import { inngestAgentKitMemory } from 'actrone-memory/adapters'

const mm = await MemoryManager.create()
const memory = inngestAgentKitMemory(mm, { agentId: 'support-bot', sessionId: 'session-1' })

const system = await memory.withSystem('You are a support agent.', 'deployment approvals')
// ...createAgent({ name: 'support', system, model })...
await memory.remember('how many approvals for a deploy?', 'two')
// #endregion inngest-agentkit

export const _inngestAgentKitExport = system.length
