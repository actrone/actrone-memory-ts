/**
 * VoltAgent: TYPED-CALL-SITE compat canary. Imports the REAL `@voltagent/core` and asserts that the
 * instructions `voltagentMemory().withInstructions()` returns fit `new Agent({ name, instructions })`,
 * the wiring the docs show. `satisfies Partial<...>` checks only those fields, so no model is needed.
 *
 * Run ONLY by the version matrix (ci/compat-matrix), which installs the peer first.
 */
import type { Agent } from "@voltagent/core";

import { MemoryManager } from "actrone-memory";
import { voltagentMemory } from "actrone-memory/adapters";

const mm = await MemoryManager.create();
const memory = voltagentMemory(mm, { agentId: "support-bot", sessionId: "session-1" });
const instructions = await memory.withInstructions("You are a support agent.", "deployment approvals");

type AgentConstructorOptions = ConstructorParameters<typeof Agent>[0];
const _options = { name: "support", instructions } satisfies Partial<AgentConstructorOptions>;
void _options;
await memory.remember("how many approvals for a deploy?", "two");

export const _voltagentCanary = instructions.length;
