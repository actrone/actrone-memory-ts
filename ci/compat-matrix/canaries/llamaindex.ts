/**
 * LlamaIndex.TS: TYPED-CALL-SITE compat canary. Imports the REAL `llamaindex` and asserts that the system
 * prompt `llamaindexMemory().getSystemPrompt()` returns fits `chatEngine.chat({ message, chatHistory })`
 * as the leading system message, the wiring the docs show. `chat()` takes no `systemPrompt` parameter.
 *
 * Run ONLY by the version matrix (ci/compat-matrix), which installs the peer first.
 */
import type { ChatMessage, SimpleChatEngine } from "llamaindex";

import { MemoryManager } from "actrone-memory";
import { llamaindexMemory } from "actrone-memory/adapters";

const mm = await MemoryManager.create();
const memory = llamaindexMemory(mm, { agentId: "support-bot", sessionId: "session-1" });
const systemPrompt = await memory.getSystemPrompt("index rebuild schedule");

const chatHistory: ChatMessage[] = [{ role: "system", content: systemPrompt }];
// A real call, type-checked but never run (nothing invokes the arrow), so TypeScript resolves chat()'s
// overloads the way a user's call does; `Parameters<>` would only see the last (streaming) overload.
declare const engine: SimpleChatEngine;
const _call = () => engine.chat({ message: "when does the index rebuild?", chatHistory });
void _call;
await memory.saveTurn("when does the index rebuild?", "nightly at 2am");

export const _llamaindexCanary = systemPrompt.length;
