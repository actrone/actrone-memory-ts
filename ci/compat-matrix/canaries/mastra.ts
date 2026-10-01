/**
 * Mastra: TYPED-CALL-SITE compat canary. Imports the REAL `@mastra/core` and asserts that the context
 * `mastraMemory().getSystemContext()` returns fits `agent.generate(input, { context })` as a system
 * message, the wiring the docs show. `context` adds messages for one call; `instructions` would replace
 * the agent's own, which is why the memory goes in `context`.
 *
 * Run ONLY by the version matrix (ci/compat-matrix), which installs the peer first.
 */
import type { Agent } from "@mastra/core/agent";

import { MemoryManager } from "actrone-memory";
import { mastraMemory } from "actrone-memory/adapters";

const mm = await MemoryManager.create();
const memory = mastraMemory(mm, { agentId: "support-bot", sessionId: "session-1" });
const system = await memory.getSystemContext("ticket SLA");

// A real call, type-checked but never run (nothing invokes the arrow), so TypeScript resolves
// generate()'s overloads the way a user's call does; from 1.x `Parameters<>` would only see the last,
// messages-only overload.
declare const agent: Agent;
const _call = () => agent.generate("what is the ticket SLA?", { context: [{ role: "system", content: system }] });
void _call;
await memory.remember("what is the ticket SLA?", "24 hours");

export const _mastraCanary = system.length;
