/**
 * Inngest AgentKit: TYPED-CALL-SITE compat canary. Imports the REAL `@inngest/agent-kit` and asserts that
 * the system prompt `inngestAgentKitMemory().withSystem()` returns fits `createAgent({ name, system })`,
 * the wiring the docs show. `satisfies Partial<...>` checks only those fields, so no model is needed.
 *
 * Run ONLY by the version matrix (ci/compat-matrix), which installs the peer first.
 */
import type { createAgent } from "@inngest/agent-kit";

import { MemoryManager } from "actrone-memory";
import { inngestAgentKitMemory } from "actrone-memory/adapters";

const mm = await MemoryManager.create();
const memory = inngestAgentKitMemory(mm, { agentId: "support-bot", sessionId: "session-1" });
const system = await memory.withSystem("You are a support agent.", "deployment approvals");

type CreateAgentOptions = Parameters<typeof createAgent>[0];
const _options = { name: "support", system } satisfies Partial<CreateAgentOptions>;
void _options;
await memory.remember("how many approvals for a deploy?", "two");

export const _inngestAgentKitCanary = system.length;
