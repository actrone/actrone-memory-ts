import { z } from 'zod';

/**
 * Token counting seam. The default is a dependency-free heuristic (~4 characters
 * per token, the well-known rough GPT ratio). Callers that need exact counts can
 * pass a real tokenizer (e.g. `js-tiktoken`) via {@link MemoryConfig.tokenCounter}.
 */
type TokenCounter = (text: string) => number;
/** Estimate token count as ceil(length / 4). Never returns less than 1 for
 * non-empty text so a turn/memory always consumes some budget. */
declare const heuristicTokenCounter: TokenCounter;

/**
 * Configuration for a {@link MemoryManager}, mirroring the Python
 * `actrone_memory.MemoryConfig`. All fields have safe defaults, so
 * `MemoryManager.create()` needs no arguments for the in-memory on-ramp.
 */
interface MemoryConfig {
    /** Fraction of the token budget reserved for episodic (L2) memories. */
    readonly budgetFractionEpisodic: number;
    /** Fraction of the token budget reserved for recent session (L1) turns. */
    readonly budgetFractionSession: number;
    /** Minimum cosine similarity for an L2 memory to be admitted (0–1). */
    readonly relevanceThreshold: number;
    /** Maximum episodic memories to pull from L2 before budget pruning. */
    readonly maxEpisodicMemories: number;
    /** Weight on cosine similarity in the blended rank score. */
    readonly relevanceWeight: number;
    /** Weight on recency in the blended rank score. */
    readonly recencyWeight: number;
    /** Cap on retained turns per session in L1. */
    readonly maxSessionTurns: number;
    /** Whether to auto-summarise a session to L2 once it grows large. */
    readonly autoSummarise: boolean;
    /** Turn count at which auto-summarisation triggers. */
    readonly summariseAfterTurns: number;
    /** How token counts are computed. Defaults to a dependency-free heuristic. */
    readonly tokenCounter: TokenCounter;
}
/** Production-safe defaults. The budget fractions match the roadmap's context
 * assembler (episodic 25% / session 35%); the remainder is reserved for the
 * system prompt + current turn, which `retrieveContext` never consumes. */
declare const DEFAULT_CONFIG: MemoryConfig;
/** Merge partial overrides over the defaults into a complete config. */
declare function resolveConfig(overrides?: Partial<MemoryConfig>): MemoryConfig;

/**
 * Embedding seam. The default {@link LocalEmbedder} is dependency-free and
 * deterministic: it hashes words into a fixed-dimension bag-of-words vector and
 * L2-normalises it, so cosine similarity reflects word overlap. That is enough
 * for the self-hosted on-ramp and makes the whole test suite run offline.
 *
 * For production semantic quality, pass an {@link Embedder} backed by a real
 * model (e.g. OpenAI `text-embedding-3-small`) when constructing a MemoryManager.
 */
interface Embedder {
    /** The dimensionality of vectors this embedder produces. */
    readonly dimensions: number;
    /** Embed a single text into a dense vector. */
    embed(text: string): Promise<number[]>;
}
/** Deterministic, dependency-free hashing embedder (a "hashing vectorizer"). */
declare class LocalEmbedder implements Embedder {
    readonly dimensions: number;
    constructor(dimensions?: number);
    embed(text: string): Promise<number[]>;
}
/** Cosine similarity of two equal-length vectors (assumes finite numbers). */
declare function cosineSimilarity(a: readonly number[], b: readonly number[]): number;

/**
 * Domain models for `@actrone/memory`, mirroring the Python `actrone_memory`
 * models with idiomatic TypeScript (camelCase) field names. Timestamps are ISO
 * 8601 strings so entries are trivially JSON-serialisable and align with the
 * hosted Orchestrator's wire format.
 */
/** The kind of content a long-term memory entry holds. */
type ContentType = "turn" | "summary" | "tool_result" | "injected";
/** The outcome of a single tool call recorded on a conversation turn. */
declare const toolResultSchema: z.ZodObject<{
    toolName: z.ZodString;
    params: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    result: z.ZodUnknown;
    success: z.ZodBoolean;
    durationMs: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type ToolResult = z.infer<typeof toolResultSchema>;
/** A single long-term memory entry (the L2 semantic tier). */
interface MemoryEntry {
    readonly id: string;
    readonly agentId: string;
    readonly sessionId: string;
    readonly content: string;
    readonly contentType: ContentType;
    /** The embedding vector, when the entry has been embedded. */
    readonly embedding?: readonly number[];
    /** Importance 0.0–1.0; higher surfaces more readily. */
    readonly importanceScore: number;
    readonly topicTags: readonly string[];
    readonly tokenCount: number;
    /** ISO-8601 creation timestamp. */
    readonly timestamp: string;
    /** Turn IDs this entry was summarised from, when applicable. */
    readonly sourceTurnIds: readonly string[];
    /** Relevance score attached by a search (0–1); absent outside search results. */
    readonly relevanceScore?: number;
}
/** A single conversation turn (the L1 hot session tier). */
interface Turn {
    readonly id: string;
    readonly sessionId: string;
    readonly userMessage: string;
    readonly assistantMessage: string;
    readonly toolResults: readonly ToolResult[];
    /** ISO-8601 creation timestamp. */
    readonly timestamp: string;
    readonly tokenCount: number;
}
/** The assembled output of {@link MemoryManager.retrieveContext}. */
interface RetrievedContext {
    readonly recentTurns: readonly Turn[];
    readonly episodicMemories: readonly MemoryEntry[];
    readonly totalTokensUsed: number;
    readonly tokenBudget: number;
    readonly retrievalDurationMs: number;
}
/** Fraction of the budget actually consumed (0 when the budget is 0). */
declare function budgetUtilisation(ctx: RetrievedContext): number;
/** Basic stats about a session. */
interface SessionMetadata {
    readonly agentId: string;
    readonly sessionId: string;
    readonly turnCount: number;
    /** ISO-8601 timestamps, when the session exists. */
    readonly createdAt?: string;
    readonly lastActive?: string;
}

/**
 * Store seams. L1 is the hot session tier (recent turns); L2 is the cold
 * semantic tier (long-term memories). {@link InMemoryStore} implements both with
 * plain Maps — the zero-dependency default. Redis (L1) and Qdrant (L2) adapters
 * implement these same interfaces without touching the manager.
 */
/** Hot session store (recent conversation turns). */
interface L1Store {
    appendTurn(agentId: string, sessionId: string, turn: Turn): Promise<void>;
    /** Recent turns, oldest → newest, capped at `n` (defaults to all retained). */
    getRecentTurns(agentId: string, sessionId: string, n?: number): Promise<Turn[]>;
    turnCount(agentId: string, sessionId: string): Promise<number>;
    clearSession(agentId: string, sessionId: string): Promise<void>;
    getSessionMetadata(agentId: string, sessionId: string): Promise<SessionMetadata | null>;
}
/** A ranked search hit: the entry plus its blended relevance score. */
interface L2SearchParams {
    readonly agentId: string;
    readonly queryEmbedding: readonly number[];
    readonly threshold: number;
    readonly limit: number;
    /** Blend weights for `relevanceWeight·sim + recencyWeight·recency`. */
    readonly relevanceWeight: number;
    readonly recencyWeight: number;
}
/** Cold semantic store (long-term memories). */
interface L2Store {
    upsert(entry: MemoryEntry): Promise<void>;
    search(params: L2SearchParams): Promise<MemoryEntry[]>;
    delete(memoryId: string): Promise<void>;
}
/**
 * Default in-process store implementing both tiers. Data lives for the lifetime
 * of the process; it is the on-ramp for local development, testing, and small
 * single-instance agents. Swap in Redis/Qdrant adapters for durability + scale.
 */
declare class InMemoryStore implements L1Store, L2Store {
    private readonly turns;
    private readonly sessionCreatedAt;
    private readonly memories;
    private readonly maxSessionTurns;
    constructor(maxSessionTurns?: number);
    appendTurn(agentId: string, sessionId: string, turn: Turn): Promise<void>;
    getRecentTurns(agentId: string, sessionId: string, n?: number): Promise<Turn[]>;
    turnCount(agentId: string, sessionId: string): Promise<number>;
    clearSession(agentId: string, sessionId: string): Promise<void>;
    getSessionMetadata(agentId: string, sessionId: string): Promise<SessionMetadata | null>;
    upsert(entry: MemoryEntry): Promise<void>;
    search(params: L2SearchParams): Promise<MemoryEntry[]>;
    delete(memoryId: string): Promise<void>;
}

/** Options for constructing a {@link MemoryManager} directly (advanced use). */
interface MemoryManagerParts {
    readonly l1: L1Store;
    readonly l2: L2Store;
    readonly embedder: Embedder;
    readonly config: MemoryConfig;
}
/**
 * Two-tier persistent agent memory: a hot session tier (recent turns) + a cold
 * semantic tier (long-term recall). API-compatible with the hosted drop-in
 * `ActroneMemoryManager` from `@actrone/sdk`, so migrating from self-hosted to
 * governed hosted memory is a one-import change.
 *
 * @example
 * ```ts
 * const mm = await MemoryManager.create();
 * await mm.storeTurn("support-bot", "sess-1", "hi", "hello!");
 * const ctx = await mm.retrieveContext("support-bot", "sess-1", "hi", 4096);
 * ```
 */
declare class MemoryManager {
    private readonly l1;
    private readonly l2;
    private readonly embedder;
    private readonly cfg;
    constructor(parts: MemoryManagerParts);
    /**
     * Build a ready manager. With no arguments it uses the in-memory store + the
     * dependency-free local embedder — the zero-config on-ramp. Pass stores /
     * embedder to back it with Redis + Qdrant + a real embedding model.
     */
    static create(options?: {
        config?: Partial<MemoryConfig>;
        l1?: L1Store;
        l2?: L2Store;
        embedder?: Embedder;
    }): Promise<MemoryManager>;
    /** Persist a conversation turn to the hot session tier. Returns the turn id. */
    storeTurn(agentId: string, sessionId: string, userMessage: string, assistantMessage: string, toolResults?: readonly ToolResult[]): Promise<string>;
    /**
     * Assemble context for the next LLM call using the 4-phase pipeline:
     * parallel L1/L2 fetch → budget allocation → relevance ranking → priority
     * pruning. The system-prompt + current-turn budget is never consumed here.
     */
    retrieveContext(agentId: string, sessionId: string, query: string, tokenBudget: number): Promise<RetrievedContext>;
    /** Write a fact directly into long-term memory. Returns the memory id. */
    injectMemory(agentId: string, content: string, importance?: number, sessionId?: string, topicTags?: readonly string[]): Promise<string>;
    /** Permanently remove a memory by id. */
    deleteMemory(agentId: string, memoryId: string): Promise<void>;
    /** Delete all hot-tier turns for a session. Long-term memories persist. */
    clearSession(agentId: string, sessionId: string): Promise<void>;
    /** Semantic search over long-term memory, ranked by relevance + recency. */
    searchMemories(agentId: string, query: string, limit?: number): Promise<MemoryEntry[]>;
    /** Session stats, or null when the session does not exist / has expired. */
    getSessionMetadata(agentId: string, sessionId: string): Promise<SessionMetadata | null>;
    /** Release any resources. In-memory mode is a no-op; adapters override the stores. */
    close(): Promise<void>;
    /** Admit newest → oldest while each turn fits; stop on the first overflow.
     * Returns chronological order (oldest first). O(n). */
    private pruneTurns;
    /** Admit highest-ranked → lowest, skipping individual overflows (input is
     * pre-sorted by relevance, so skipping one oversized memory to fit several
     * smaller ones is the right trade-off). O(n). */
    private pruneMemories;
}

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

/** Render a retrieved context into a compact, prompt-ready block. Recent turns
 * come first (chronological), then the most relevant long-term memories. Returns
 * "" when there is nothing to inject, so callers can conditionally prepend it. */
declare function formatContext(ctx: RetrievedContext): string;
/** Options identifying a single conversation. */
interface ConversationRef {
    readonly agentId: string;
    readonly sessionId: string;
}
/** Result of a recall: the ready-to-prepend context string plus the raw context. */
interface Recalled {
    readonly systemPrompt: string;
    readonly context: RetrievedContext;
}
/** Retrieve context for `query` and format it for prompt injection. */
declare function recall(mm: MemoryManager, opts: ConversationRef & {
    query: string;
    tokenBudget: number;
}): Promise<Recalled>;
/** Persist a completed turn. Returns the turn id. */
declare function remember(mm: MemoryManager, opts: ConversationRef & {
    userMessage: string;
    assistantMessage: string;
}): Promise<string>;
/** A conversation-scoped helper: `recall`/`remember` without repeating the ids. */
interface MemoryHelper {
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
declare function memoryFor(mm: MemoryManager, agentId: string, sessionId: string): MemoryHelper;
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
declare function vercelMemory(mm: MemoryManager, opts: ConversationRef & {
    query: string;
    tokenBudget?: number;
}): Promise<{
    system: string;
    context: RetrievedContext;
    onFinish: (userMessage: string) => (event: {
        text: string;
    }) => Promise<void>;
}>;
/** The minimal shape a LangChain.js `BaseMessage` exposes (structural — no import). */
interface LcLikeMessage {
    readonly _getType?: () => string;
    readonly content: unknown;
}
/**
 * LangChain.js: a chat-history-style memory backed by the governed store. Returns
 * `loadContext` (retrieve → system string) and `saveTurn` (persist), which slot
 * into an LCEL chain or a custom `BaseChatMemory`. Structural typing keeps
 * `@langchain/core` an optional peer dependency.
 */
declare function langchainMemory(mm: MemoryManager, ref: ConversationRef): {
    loadContext: (query: string, tokenBudget?: number) => Promise<string>;
    saveTurn: (userMessage: string, assistantMessage: string) => Promise<string>;
};
/** A minimal LangGraph.js system message (structural — no `@langchain/langgraph` import). */
interface LangGraphSystemMessage {
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
declare function langgraphMemory(mm: MemoryManager, ref: ConversationRef): {
    loadMemories: (query: string, tokenBudget?: number) => Promise<LangGraphSystemMessage | null>;
    saveTurn: (userMessage: string, assistantMessage: string) => Promise<string>;
};
/**
 * Mastra: a dedicated memory helper (rather than piggybacking the Vercel model path).
 * `getSystemContext` returns the instruction string to prepend to a Mastra agent's context for the
 * turn, and `remember` persists the completed turn — call them around `agent.generate(...)`.
 * Structural, so `@mastra/core` stays an optional peer dependency.
 */
declare function mastraMemory(mm: MemoryManager, ref: ConversationRef): {
    getSystemContext: (query: string, tokenBudget?: number) => Promise<string>;
    remember: (userMessage: string, assistantMessage: string) => Promise<string>;
};

export { type ContentType as C, DEFAULT_CONFIG as D, type Embedder as E, InMemoryStore as I, type L1Store as L, type MemoryEntry as M, type Recalled as R, type SessionMetadata as S, type Turn as T, type L2Store as a, type L2SearchParams as b, type ConversationRef as c, type LcLikeMessage as d, LocalEmbedder as e, type MemoryConfig as f, type MemoryHelper as g, MemoryManager as h, type MemoryManagerParts as i, type RetrievedContext as j, type TokenCounter as k, type ToolResult as l, budgetUtilisation as m, cosineSimilarity as n, formatContext as o, heuristicTokenCounter as p, langchainMemory as q, memoryFor as r, recall as s, remember as t, resolveConfig as u, toolResultSchema as v, vercelMemory as w, type LangGraphSystemMessage as x, langgraphMemory as y, mastraMemory as z };
