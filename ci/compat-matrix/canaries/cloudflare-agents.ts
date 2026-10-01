/**
 * Cloudflare Agents: compat canary. Imports the REAL `agents` package (Cloudflare's, from 0.0.37; the npm
 * name belonged to an unrelated package before that) and checks its `Agent` base class still resolves,
 * which is what a Cloudflare agent built with our memory extends. The memory itself is plain text passed
 * to the model call inside the agent (`generateText({ model, system, prompt })`), which the `vercel`
 * canary type-checks against the AI SDK.
 *
 * Run ONLY by the version matrix (ci/compat-matrix), which installs the peer first.
 */
import { Agent } from "agents";

import { MemoryManager } from "actrone-memory";
import { cloudflareAgentsMemory } from "actrone-memory/adapters";

const mm = await MemoryManager.create();
const memory = cloudflareAgentsMemory(mm, { agentId: "support-bot", sessionId: "session-1" });
const system = await memory.getSystem("deployment approvals");
await memory.remember("how many approvals for a deploy?", "two");

// The class a Cloudflare agent extends; `typeof` keeps this a type-level check, nothing runs.
type CloudflareAgentClass = typeof Agent;
const _agentClass: CloudflareAgentClass = Agent;
void _agentClass;

export const _cloudflareAgentsCanary = system.length;
