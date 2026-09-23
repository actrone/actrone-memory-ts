/**
 * Vercel AI SDK: TYPED-CALL-SITE compat canary. Unlike examples/frameworks/vercel.ts (which only
 * exercises our adapter API), this imports the REAL `ai` package and asserts that actrone-memory's
 * `vercelMemory()` output still fits `generateText`'s option types (`system` + `onFinish`) at the
 * installed version. A future `ai` release that changes those shapes fails HERE, not for a user.
 *
 * Run ONLY by the version matrix (ci/compat-matrix), which installs `ai` first, it is deliberately NOT
 * under examples/ (that tree is type-checked with no framework peers installed).
 */
import { generateText, streamText } from "ai";

import { MemoryManager } from "actrone-memory";
import { vercelMemory } from "actrone-memory/adapters";

const mm = await MemoryManager.create();
const prompt = "summarise the account status";
const mem = await vercelMemory(mm, { agentId: "support-bot", sessionId: "session-1", query: prompt });

// `system` is a plain (non-streaming) option: it must stay assignable to generateText's `system`.
type GenerateTextOptions = Parameters<typeof generateText>[0];
const _system = { system: mem.system } satisfies Partial<GenerateTextOptions>;
void _system;

// `onFinish` is a STREAMING callback (generateText has none), assert our `onFinish(prompt)` still fits
// streamText's `onFinish` type. `Parameters<...>[0]` extracts the real options; `satisfies Partial<...>`
// checks only that field, no live `model` needed. A future `ai` release that changes it fails HERE.
type StreamTextOptions = Parameters<typeof streamText>[0];
const _onFinish = { onFinish: mem.onFinish(prompt) } satisfies Partial<StreamTextOptions>;
void _onFinish;

export const _vercelCanary = mem.system.length;
