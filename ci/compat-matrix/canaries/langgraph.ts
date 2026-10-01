/**
 * LangGraph.js: TYPED-CALL-SITE compat canary. Imports the REAL `@langchain/langgraph` and asserts that
 * the system message `langgraphMemory().loadMemories()` returns can be merged into a graph's `messages`
 * state through LangGraph's own reducer (the one `MessagesAnnotation` / `MessagesState` use), which is
 * how the docs wire it as a pre-model node.
 *
 * Run ONLY by the version matrix (ci/compat-matrix), which installs the peer first.
 */
import { messagesStateReducer } from "@langchain/langgraph";

import { MemoryManager } from "actrone-memory";
import { langgraphMemory } from "actrone-memory/adapters";

const mm = await MemoryManager.create();
const memory = langgraphMemory(mm, { agentId: "support-bot", sessionId: "session-1" });
const sys = await memory.loadMemories("what does the customer prefer?");

// Pre-model node: merge the recalled memory into state.messages with LangGraph's reducer.
const merged = messagesStateReducer([], sys ? [sys] : []);
await memory.saveTurn("what does the customer prefer?", "email over phone");

export const _langgraphCanary = merged.length;
