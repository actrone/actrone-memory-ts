/**
 * Firebase Genkit: TYPED-CALL-SITE compat canary. Imports the REAL `genkit` and asserts that the system
 * text `genkitMemory().getSystem()` returns fits `ai.generate({ system, prompt })`, the wiring the docs
 * show. `satisfies Partial<...>` checks only those fields, so no model or plugin is needed.
 *
 * Run ONLY by the version matrix (ci/compat-matrix), which installs the peer first.
 */
import type { GenerateOptions } from "genkit";

import { MemoryManager } from "actrone-memory";
import { genkitMemory } from "actrone-memory/adapters";

const mm = await MemoryManager.create();
const memory = genkitMemory(mm, { agentId: "support-bot", sessionId: "session-1" });
const system = await memory.getSystem("deployment approvals");

const _options = { system, prompt: "how many approvals for a deploy?" } satisfies Partial<GenerateOptions>;
void _options;
await memory.remember("how many approvals for a deploy?", "two");

export const _genkitCanary = system.length;
