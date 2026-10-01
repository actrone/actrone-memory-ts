/**
 * LangChain.js: TYPED-CALL-SITE compat canary. Imports the REAL `@langchain/core` and asserts that the
 * context `langchainMemory().loadContext()` returns is what a LangChain system message accepts, the way
 * the docs prepend it to a prompt. It imports a subpath on purpose: `@langchain/core` exports no package
 * root in 0.2.x, only subpaths such as `/messages`.
 *
 * Run ONLY by the version matrix (ci/compat-matrix), which installs the peer first; deliberately NOT
 * under examples/ (that tree is type-checked with no framework peers installed).
 */
import { SystemMessage } from "@langchain/core/messages";

import { MemoryManager } from "actrone-memory";
import { langchainMemory } from "actrone-memory/adapters";

const mm = await MemoryManager.create();
const memory = langchainMemory(mm, { agentId: "support-bot", sessionId: "session-1" });
const context = await memory.loadContext("account standing");

// The docs prepend the context to the prompt as its system message.
const system = new SystemMessage(context);
await memory.saveTurn("what is my account standing?", "in good standing");

export const _langchainCanary = system.content.length;
