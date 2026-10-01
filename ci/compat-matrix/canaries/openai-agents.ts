/**
 * OpenAI Agents JS: TYPED-CALL-SITE compat canary. Imports the REAL `@openai/agents` and asserts that
 * the instructions `openaiAgentsMemory().withMemory()` returns are accepted by `new Agent({ instructions })`,
 * the wiring the docs show before `run(agent, userInput)`.
 *
 * Run ONLY by the version matrix (ci/compat-matrix), which installs the peer first.
 */
import { Agent } from "@openai/agents";

import { MemoryManager } from "actrone-memory";
import { openaiAgentsMemory } from "actrone-memory/adapters";

const mm = await MemoryManager.create();
const memory = openaiAgentsMemory(mm, { agentId: "support-bot", sessionId: "session-1" });
const instructions = await memory.withMemory("You are a helpful agent.", "the customer plan");

const agent = new Agent({ name: "support", instructions });
await memory.remember("what plan is the customer on?", "Enterprise");

export const _openaiAgentsCanary = agent.name.length;
