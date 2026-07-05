/**
 * Framework adapters — wire `@actrone/memory` into a JS agent in a few lines.
 *
 * The core here is framework-agnostic and dependency-free: `recall` assembles a
 * context string to prepend to a prompt, and `remember` persists a completed
 * turn. `memoryFor(mm, agentId, sessionId)` binds those to one conversation for
 * ergonomic use. Thin framework wrappers (Vercel AI SDK, LangChain.js) build on
 * this same core and inject the framework's own primitives, so nothing is
 * imported at runtime — the frameworks stay optional peer dependencies.
 */

import type { MemoryManager } from "./manager.js";
import type { MemoryEntry, RetrievedContext, Turn } from "./models.js";

/** Render a retrieved context into a compact, prompt-ready block. Recent turns
 * come first (chronological), then the most relevant long-term memories. Returns
 * "" when there is nothing to inject, so callers can conditionally prepend it. */
export function formatContext(ctx: RetrievedContext): string {
  const sections: string[] = [];
  if (ctx.episodicMemories.length > 0) {
    const facts = ctx.episodicMemories.map((m: MemoryEntry) => `- ${m.content}`).join("\n");
    sections.push(`Relevant long-term memory:\n${facts}`);
  }
  if (ctx.recentTurns.length > 0) {
    const turns = ctx.recentTurns
      .map((t: Turn) => `User: ${t.userMessage}\nAssistant: ${t.assistantMessage}`)
      .join("\n");
    sections.push(`Recent conversation:\n${turns}`);
  }
  return sections.join("\n\n");
}

/** Options identifying a single conversation. */
export interface ConversationRef {
  readonly agentId: string;
  readonly sessionId: string;
}

/** Result of a recall: the ready-to-prepend context string plus the raw context. */
export interface Recalled {
  readonly systemPrompt: string;
  readonly context: RetrievedContext;
}

/** Retrieve context for `query` and format it for prompt injection. */
export async function recall(
  mm: MemoryManager,
  opts: ConversationRef & { query: string; tokenBudget: number },
): Promise<Recalled> {
  const context = await mm.retrieveContext(
    opts.agentId,
    opts.sessionId,
    opts.query,
    opts.tokenBudget,
  );
  return { systemPrompt: formatContext(context), context };
}

/** Persist a completed turn. Returns the turn id. */
export async function remember(
  mm: MemoryManager,
  opts: ConversationRef & { userMessage: string; assistantMessage: string },
): Promise<string> {
  return mm.storeTurn(opts.agentId, opts.sessionId, opts.userMessage, opts.assistantMessage);
}

/** A conversation-scoped helper: `recall`/`remember` without repeating the ids. */
export interface MemoryHelper {
  recall(query: string, tokenBudget?: number): Promise<Recalled>;
  remember(userMessage: string, assistantMessage: string): Promise<string>;
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  inject(content: string, importance?: number): Promise<string>;
}

/** Bind a MemoryManager to one agent/session for ergonomic, few-line usage:
 *
 * ```ts
 * const memory = memoryFor(mm, "support-bot", sessionId);
 * const { systemPrompt } = await memory.recall(userInput);
 * // ... call your LLM with systemPrompt prepended ...
 * await memory.remember(userInput, answer);
 * ```
 */
export function memoryFor(
  mm: MemoryManager,
  agentId: string,
  sessionId: string,
): MemoryHelper {
  return {
    recall: (query, tokenBudget = 4096) => recall(mm, { agentId, sessionId, query, tokenBudget }),
    remember: (userMessage, assistantMessage) =>
      remember(mm, { agentId, sessionId, userMessage, assistantMessage }),
    search: (query, limit) => mm.searchMemories(agentId, query, limit),
    inject: (content, importance) => mm.injectMemory(agentId, content, importance),
  };
}

// ── Framework wrappers (optional peer deps — nothing imported at runtime) ──────

/**
 * Vercel AI SDK: produce the `system` string to pass to `generateText`/`streamText`,
 * and an `onFinish` callback that persists the turn. Frameworks stay optional —
 * this returns plain values you spread into the SDK call.
 *
 * ```ts
 * const mem = await vercelMemory(mm, { agentId, sessionId, query: prompt });
 * const res = await generateText({ model, system: mem.system, prompt, onFinish: mem.onFinish(prompt) });
 * ```
 */
export async function vercelMemory(
  mm: MemoryManager,
  opts: ConversationRef & { query: string; tokenBudget?: number },
): Promise<{
  system: string;
  context: RetrievedContext;
  onFinish: (userMessage: string) => (event: { text: string }) => Promise<void>;
}> {
  const { systemPrompt, context } = await recall(mm, {
    agentId: opts.agentId,
    sessionId: opts.sessionId,
    query: opts.query,
    tokenBudget: opts.tokenBudget ?? 4096,
  });
  return {
    system: systemPrompt,
    context,
    onFinish: (userMessage: string) => async (event: { text: string }) => {
      await remember(mm, {
        agentId: opts.agentId,
        sessionId: opts.sessionId,
        userMessage,
        assistantMessage: event.text,
      });
    },
  };
}

/** The minimal shape a LangChain.js `BaseMessage` exposes (structural — no import). */
export interface LcLikeMessage {
  readonly _getType?: () => string;
  readonly content: unknown;
}

/**
 * LangChain.js: a chat-history-style memory backed by the governed store. Returns
 * `loadContext` (retrieve → system string) and `saveTurn` (persist), which slot
 * into an LCEL chain or a custom `BaseChatMemory`. Structural typing keeps
 * `@langchain/core` an optional peer dependency.
 */
export function langchainMemory(mm: MemoryManager, ref: ConversationRef): {
  loadContext: (query: string, tokenBudget?: number) => Promise<string>;
  saveTurn: (userMessage: string, assistantMessage: string) => Promise<string>;
} {
  const helper = memoryFor(mm, ref.agentId, ref.sessionId);
  return {
    loadContext: async (query, tokenBudget) => (await helper.recall(query, tokenBudget)).systemPrompt,
    saveTurn: (userMessage, assistantMessage) => helper.remember(userMessage, assistantMessage),
  };
}

/** A minimal LangGraph.js system message (structural — no `@langchain/langgraph` import). */
export interface LangGraphSystemMessage {
  readonly role: "system";
  readonly content: string;
}

/**
 * LangGraph.js: memory for a graph whose state carries a `messages` array (e.g. `MessagesState`).
 * `loadMemories` returns a system message to MERGE into the graph state before the model node (or
 * `null` when there is nothing relevant), and `saveTurn` persists a completed turn — typically
 * wired as a pre-model node + a post-model node. Structural, so `@langchain/langgraph` stays an
 * optional peer dependency.
 */
export function langgraphMemory(mm: MemoryManager, ref: ConversationRef): {
  loadMemories: (query: string, tokenBudget?: number) => Promise<LangGraphSystemMessage | null>;
  saveTurn: (userMessage: string, assistantMessage: string) => Promise<string>;
} {
  const helper = memoryFor(mm, ref.agentId, ref.sessionId);
  return {
    loadMemories: async (query, tokenBudget) => {
      const { systemPrompt } = await helper.recall(query, tokenBudget);
      return systemPrompt ? { role: "system", content: systemPrompt } : null;
    },
    saveTurn: (userMessage, assistantMessage) => helper.remember(userMessage, assistantMessage),
  };
}

/**
 * Mastra: a dedicated memory helper (rather than piggybacking the Vercel model path).
 * `getSystemContext` returns the instruction string to prepend to a Mastra agent's context for the
 * turn, and `remember` persists the completed turn — call them around `agent.generate(...)`.
 * Structural, so `@mastra/core` stays an optional peer dependency.
 */
export function mastraMemory(mm: MemoryManager, ref: ConversationRef): {
  getSystemContext: (query: string, tokenBudget?: number) => Promise<string>;
  remember: (userMessage: string, assistantMessage: string) => Promise<string>;
} {
  const helper = memoryFor(mm, ref.agentId, ref.sessionId);
  return {
    getSystemContext: async (query, tokenBudget) => (await helper.recall(query, tokenBudget)).systemPrompt,
    remember: (userMessage, assistantMessage) => helper.remember(userMessage, assistantMessage),
  };
}
