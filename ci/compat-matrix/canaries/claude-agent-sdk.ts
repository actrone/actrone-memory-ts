/**
 * Claude Agent SDK: TYPED-CALL-SITE compat canary. Imports the REAL `@anthropic-ai/claude-agent-sdk`
 * and asserts that the system prompt `claudeAgentMemory().appendToSystemPrompt()` returns fits
 * `query({ prompt, options: { systemPrompt } })`, the wiring the docs show. Only types are checked:
 * `query` itself starts the Claude Code CLI.
 *
 * Run ONLY by the version matrix (ci/compat-matrix), which installs the peer first.
 */
import type { query } from "@anthropic-ai/claude-agent-sdk";

import { MemoryManager } from "actrone-memory";
import { claudeAgentMemory } from "actrone-memory/adapters";

const mm = await MemoryManager.create();
const memory = claudeAgentMemory(mm, { agentId: "support-bot", sessionId: "session-1" });
const systemPrompt = await memory.appendToSystemPrompt("You are a support agent.", "deployment approvals");

type QueryParams = Parameters<typeof query>[0];
const _call = { prompt: "how many approvals for a deploy?", options: { systemPrompt } } satisfies QueryParams;
void _call;
await memory.remember("how many approvals for a deploy?", "two");

export const _claudeAgentSdkCanary = systemPrompt.length;
