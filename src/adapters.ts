/**
 * Framework adapters: wire `actrone-memory` into a JS agent in a few lines.
 *
 * The core here is framework-agnostic and dependency-free: `recall` assembles a
 * context string to prepend to a prompt, and `remember` persists a completed
 * turn. `memoryFor(mm, agentId, sessionId)` binds those to one conversation for
 * ergonomic use. Thin framework wrappers build on this same core and inject the
 * framework's own primitives, so nothing is imported at runtime, every framework
 * stays an optional peer dependency. Covered: Vercel AI SDK, LangChain.js,
 * LangGraph.js, Mastra, LlamaIndex.TS, OpenAI Agents JS, Firebase Genkit,
 * VoltAgent, Claude Agent SDK, Cloudflare Agents, and Inngest AgentKit.
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

// ── Framework wrappers (optional peer deps: nothing imported at runtime) ──────

/**
 * Vercel AI SDK: produce the `system` string to pass to `generateText`/`streamText`,
 * and an `onFinish` callback that persists the turn. Frameworks stay optional,
 * this returns plain values you spread into the SDK call.
 *
 * `onFinish` is a `streamText` option; `generateText` has none, so call the callback yourself
 * with the result, or the turn is never saved.
 *
 * ```ts
 * const mem = await vercelMemory(mm, { agentId, sessionId, query: prompt });
 * const stream = streamText({ model, system: mem.system, prompt, onFinish: mem.onFinish(prompt) });
 * // or, with generateText:
 * const res = await generateText({ model, system: mem.system, prompt });
 * await mem.onFinish(prompt)({ text: res.text });
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

/** The minimal shape a LangChain.js `BaseMessage` exposes (structural, no import). */
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

/** A minimal LangGraph.js system message (structural, no `@langchain/langgraph` import). */
export interface LangGraphSystemMessage {
  readonly role: "system";
  readonly content: string;
}

/**
 * LangGraph.js: memory for a graph whose state carries a `messages` array (e.g. `MessagesState`).
 * `loadMemories` returns a system message to MERGE into the graph state before the model node (or
 * `null` when there is nothing relevant), and `saveTurn` persists a completed turn, typically
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
 * turn, and `remember` persists the completed turn, call them around `agent.generate(...)`.
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

/**
 * LlamaIndex.TS: memory for a `llamaindex` agent / chat engine. `getSystemPrompt` returns the
 * governed context to pass as the agent's `systemPrompt` (or prepend to it) for the turn, and
 * `saveTurn` persists the completed exchange: call them around `agent.chat({ message })`.
 * Structural, so `llamaindex` stays an optional peer dependency.
 */
export function llamaindexMemory(mm: MemoryManager, ref: ConversationRef): {
  getSystemPrompt: (query: string, tokenBudget?: number) => Promise<string>;
  saveTurn: (userMessage: string, assistantMessage: string) => Promise<string>;
} {
  const helper = memoryFor(mm, ref.agentId, ref.sessionId);
  return {
    getSystemPrompt: async (query, tokenBudget) => (await helper.recall(query, tokenBudget)).systemPrompt,
    saveTurn: (userMessage, assistantMessage) => helper.remember(userMessage, assistantMessage),
  };
}

/**
 * OpenAI Agents JS (`@openai/agents`): an Agent's `instructions` carry its system context.
 * `withMemory(baseInstructions, query)` returns the instructions to give the Agent for the turn,
 * the governed memory context prepended to the developer's base instructions (or just the memory
 * when there are no base instructions), and `remember` persists the turn after `run(agent, …)`.
 * Structural, so `@openai/agents` stays an optional peer dependency.
 */
export function openaiAgentsMemory(mm: MemoryManager, ref: ConversationRef): {
  withMemory: (baseInstructions: string, query: string, tokenBudget?: number) => Promise<string>;
  remember: (userMessage: string, assistantMessage: string) => Promise<string>;
} {
  const helper = memoryFor(mm, ref.agentId, ref.sessionId);
  return {
    withMemory: async (baseInstructions, query, tokenBudget) => {
      const { systemPrompt } = await helper.recall(query, tokenBudget);
      if (!systemPrompt) return baseInstructions;
      return baseInstructions ? `${systemPrompt}\n\n${baseInstructions}` : systemPrompt;
    },
    remember: (userMessage, assistantMessage) => helper.remember(userMessage, assistantMessage),
  };
}

/**
 * Firebase Genkit (`genkit`): `ai.generate({ system, prompt })` accepts a system string, like the
 * Vercel path, `getSystem` returns the governed context to pass as `system` for the turn, and
 * `remember` persists the completed turn. Structural, so `genkit` stays an optional peer dependency.
 */
export function genkitMemory(mm: MemoryManager, ref: ConversationRef): {
  getSystem: (query: string, tokenBudget?: number) => Promise<string>;
  remember: (userMessage: string, assistantMessage: string) => Promise<string>;
} {
  const helper = memoryFor(mm, ref.agentId, ref.sessionId);
  return {
    getSystem: async (query, tokenBudget) => (await helper.recall(query, tokenBudget)).systemPrompt,
    remember: (userMessage, assistantMessage) => helper.remember(userMessage, assistantMessage),
  };
}

/**
 * VoltAgent (`@voltagent/core`): an `Agent`'s `instructions` carry its system context.
 * `withInstructions(baseInstructions, query)` returns the instructions to give the Agent for the turn,
 * the governed memory context prepended to the developer's base instructions (or just the memory when
 * there are none), and `remember` persists the turn after `agent.generateText(...)`. VoltAgent's own
 * `Memory` is a storage subsystem rather than a simple injectable interface, so the system-instructions
 * path is the idiomatic Tier-1 integration (§2.1). Structural, so `@voltagent/core` stays an optional
 * peer dependency.
 */
export function voltagentMemory(mm: MemoryManager, ref: ConversationRef): {
  withInstructions: (baseInstructions: string, query: string, tokenBudget?: number) => Promise<string>;
  remember: (userMessage: string, assistantMessage: string) => Promise<string>;
} {
  const helper = memoryFor(mm, ref.agentId, ref.sessionId);
  return {
    withInstructions: async (baseInstructions, query, tokenBudget) => {
      const { systemPrompt } = await helper.recall(query, tokenBudget);
      if (!systemPrompt) return baseInstructions;
      return baseInstructions ? `${systemPrompt}\n\n${baseInstructions}` : systemPrompt;
    },
    remember: (userMessage, assistantMessage) => helper.remember(userMessage, assistantMessage),
  };
}

/**
 * Cloudflare Agents (`agents`): an Agent typically calls the AI SDK's `generateText({ system, ... })`
 * on Workers. `getSystem` returns the governed context to pass as `system` for the turn, and
 * `remember` persists the completed turn. Structural, so `agents` stays an optional peer dependency
 * and this runs on the Workers runtime (the in-memory store needs no Node APIs).
 */
export function cloudflareAgentsMemory(mm: MemoryManager, ref: ConversationRef): {
  getSystem: (query: string, tokenBudget?: number) => Promise<string>;
  remember: (userMessage: string, assistantMessage: string) => Promise<string>;
} {
  const helper = memoryFor(mm, ref.agentId, ref.sessionId);
  return {
    getSystem: async (query, tokenBudget) => (await helper.recall(query, tokenBudget)).systemPrompt,
    remember: (userMessage, assistantMessage) => helper.remember(userMessage, assistantMessage),
  };
}

/**
 * Inngest AgentKit (`@inngest/agent-kit`): `createAgent({ system, model })` takes a `system` string
 * (or function). `withSystem(baseSystem, query)` returns the `system` to give the agent for the turn,
 * the developer's base system with governed memory appended (or just the memory when there is no
 * base), and `remember` persists the turn. Structural, so `@inngest/agent-kit` stays an optional
 * peer dependency.
 */
export function inngestAgentKitMemory(mm: MemoryManager, ref: ConversationRef): {
  withSystem: (baseSystem: string, query: string, tokenBudget?: number) => Promise<string>;
  remember: (userMessage: string, assistantMessage: string) => Promise<string>;
} {
  const helper = memoryFor(mm, ref.agentId, ref.sessionId);
  return {
    withSystem: async (baseSystem, query, tokenBudget) => {
      const { systemPrompt } = await helper.recall(query, tokenBudget);
      if (!systemPrompt) return baseSystem;
      return baseSystem ? `${baseSystem}\n\n${systemPrompt}` : systemPrompt;
    },
    remember: (userMessage, assistantMessage) => helper.remember(userMessage, assistantMessage),
  };
}

/**
 * Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`): `query({ prompt, options: { systemPrompt } })`
 * accepts a system prompt. `appendToSystemPrompt(baseSystemPrompt, query)` returns the system prompt to
 * pass for the turn: the developer's base system prompt with governed memory context appended (or just
 * the memory when there is no base), and `remember` persists the turn after the `query(...)` completes.
 * The Claude Agent SDK has no formal memory interface, so the system-prompt path is the idiomatic Tier-1
 * integration (§2.1). Structural, so `@anthropic-ai/claude-agent-sdk` stays an optional peer dependency.
 */
export function claudeAgentMemory(mm: MemoryManager, ref: ConversationRef): {
  appendToSystemPrompt: (baseSystemPrompt: string, query: string, tokenBudget?: number) => Promise<string>;
  remember: (userMessage: string, assistantMessage: string) => Promise<string>;
} {
  const helper = memoryFor(mm, ref.agentId, ref.sessionId);
  return {
    appendToSystemPrompt: async (baseSystemPrompt, query, tokenBudget) => {
      const { systemPrompt } = await helper.recall(query, tokenBudget);
      if (!systemPrompt) return baseSystemPrompt;
      return baseSystemPrompt ? `${baseSystemPrompt}\n\n${systemPrompt}` : systemPrompt;
    },
    remember: (userMessage, assistantMessage) => helper.remember(userMessage, assistantMessage),
  };
}

// ── Deep integrations: structured messages + real framework memory contracts ──
// The wrappers above return prompt *strings* (great for `system`-string frameworks).
// These go deeper: a structured message view plus classes that implement a
// framework's actual memory interface, reaching parity with the Python adapters
// that implement `BaseChatMessageHistory` / `BaseMemory` etc.

/** A role-tagged chat message: the structured counterpart of a prompt string. */
export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string;
}

/**
 * Structured recall: relevant long-term memory as a leading `system` message
 * (omitted when empty), followed by the recent turns as `user`/`assistant`
 * messages. This is what every framework memory interface actually needs, rather
 * than a pre-formatted string.
 */
export async function loadMessages(
  mm: MemoryManager,
  opts: ConversationRef & { query: string; tokenBudget?: number },
): Promise<ChatMessage[]> {
  const { context } = await recall(mm, {
    agentId: opts.agentId,
    sessionId: opts.sessionId,
    query: opts.query,
    tokenBudget: opts.tokenBudget ?? 4096,
  });
  const messages: ChatMessage[] = [];
  if (context.episodicMemories.length > 0) {
    const facts = context.episodicMemories.map((m: MemoryEntry) => `- ${m.content}`).join("\n");
    messages.push({ role: "system", content: `Relevant long-term memory:\n${facts}` });
  }
  for (const t of context.recentTurns) {
    messages.push({ role: "user", content: t.userMessage });
    messages.push({ role: "assistant", content: t.assistantMessage });
  }
  return messages;
}

/** A LangChain.js-style message (`_getType()` + `content`), structural, no import. */
export interface LcChatMessage {
  _getType(): string;
  readonly content: string;
}

/** Optional real message-class constructors so the adapter emits genuine LangChain
 * instances (`new HumanMessage(content)`) instead of structural stand-ins. */
export interface LcMessageClasses {
  readonly human: new (content: string) => LcChatMessage;
  readonly ai: new (content: string) => LcChatMessage;
  readonly system?: new (content: string) => LcChatMessage;
}

/**
 * LangChain.js: a governed **`BaseListChatMessageHistory`** implementation. Drop it
 * in anywhere LangChain persists chat history (e.g. `RunnableWithMessageHistory`),
 * `getMessages` reads the recent turns, and `addMessage(s)` pairs a human message
 * with the following AI message into one governed turn (`clear` clears the session).
 * Pass `messageClasses` to emit real `HumanMessage`/`AIMessage` instances (recommended for
 * consumers that call `BaseMessage` methods); without it, structural `{ _getType, content }`
 * messages are returned (fine for reads). This returns a plain object that duck-types the
 * interface: it is not a `BaseListChatMessageHistory` subclass, so passing it to APIs typed
 * to `BaseChatMessageHistory` (e.g. `RunnableWithMessageHistory`) needs a cast:
 * `langchainChatHistory(...) as unknown as BaseChatMessageHistory`.
 *
 * ```ts
 * import { HumanMessage, AIMessage } from "@langchain/core/messages";
 * const history = langchainChatHistory(mm, { agentId, sessionId }, { human: HumanMessage, ai: AIMessage });
 * ```
 */
export function langchainChatHistory(
  mm: MemoryManager,
  ref: ConversationRef,
  opts: { messageClasses?: LcMessageClasses } = {},
): {
  getMessages(): Promise<LcChatMessage[]>;
  addMessage(message: LcChatMessage): Promise<void>;
  addMessages(messages: LcChatMessage[]): Promise<void>;
  clear(): Promise<void>;
} {
  // A human message with no paired AI reply yet: flushed on the next AI message.
  let pendingHuman: string | null = null;

  const toStruct = (role: "human" | "ai", content: string): LcChatMessage => {
    const cls = role === "human" ? opts.messageClasses?.human : opts.messageClasses?.ai;
    if (cls) return new cls(content);
    return { _getType: () => role, content };
  };

  const roleOf = (m: LcChatMessage): string => {
    try {
      return m._getType();
    } catch {
      return "unknown";
    }
  };

  const addOne = async (message: LcChatMessage): Promise<void> => {
    const type = roleOf(message);
    const content = String(message.content ?? "");
    if (type === "human") {
      // If a human is already pending (two humans in a row), flush it solo.
      if (pendingHuman !== null) {
        await mm.storeTurn(ref.agentId, ref.sessionId, pendingHuman, "");
      }
      pendingHuman = content;
    } else if (type === "ai") {
      await mm.storeTurn(ref.agentId, ref.sessionId, pendingHuman ?? "", content);
      pendingHuman = null;
    }
    // Other message types (system/tool) are not persisted as turns.
  };

  return {
    async getMessages(): Promise<LcChatMessage[]> {
      const turns = await mm.getRecentTurns(ref.agentId, ref.sessionId);
      const messages: LcChatMessage[] = [];
      for (const t of turns) {
        messages.push(toStruct("human", t.userMessage));
        if (t.assistantMessage) messages.push(toStruct("ai", t.assistantMessage));
      }
      return messages;
    },
    addMessage: addOne,
    async addMessages(messages: LcChatMessage[]): Promise<void> {
      for (const m of messages) await addOne(m);
    },
    async clear(): Promise<void> {
      pendingHuman = null;
      await mm.clearSession(ref.agentId, ref.sessionId);
    },
  };
}

/** A LlamaIndex.TS-style chat message (`role` + `content`), structural, no import. */
export interface LiChatMessage {
  readonly role: string;
  readonly content: string;
}

/**
 * LlamaIndex.TS: a governed chat-memory store whose method names track the **current**
 * LlamaIndex.TS `Memory` API (`createMemory()` → a `Memory` with `add()` / `get()` /
 * `clear()`), not the removed legacy `BaseMemory` (`put`/`get`/`reset`). Use it to back or
 * mirror an agent's memory with the governed store: `add(message)` buffers a user message
 * then persists it with the following assistant reply as one governed turn, `get()`/`getAll()`
 * return the recent turns as messages, and `clear()` clears the session. Structural, so
 * `llamaindex` stays an optional peer dependency.
 */
export function llamaindexChatMemory(
  mm: MemoryManager,
  ref: ConversationRef,
): {
  get(): Promise<LiChatMessage[]>;
  getAll(): Promise<LiChatMessage[]>;
  add(message: LiChatMessage): Promise<void>;
  clear(): Promise<void>;
} {
  let pendingUser: string | null = null;

  const readAll = async (): Promise<LiChatMessage[]> => {
    const turns = await mm.getRecentTurns(ref.agentId, ref.sessionId);
    const messages: LiChatMessage[] = [];
    for (const t of turns) {
      messages.push({ role: "user", content: t.userMessage });
      if (t.assistantMessage) messages.push({ role: "assistant", content: t.assistantMessage });
    }
    return messages;
  };

  return {
    get: readAll,
    getAll: readAll,
    async add(message: LiChatMessage): Promise<void> {
      const role = message.role;
      const content = String(message.content ?? "");
      if (role === "user") {
        if (pendingUser !== null) await mm.storeTurn(ref.agentId, ref.sessionId, pendingUser, "");
        pendingUser = content;
      } else if (role === "assistant") {
        await mm.storeTurn(ref.agentId, ref.sessionId, pendingUser ?? "", content);
        pendingUser = null;
      }
    },
    async clear(): Promise<void> {
      pendingUser = null;
      await mm.clearSession(ref.agentId, ref.sessionId);
    },
  };
}
