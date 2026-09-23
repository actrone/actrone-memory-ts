import { randomUUID } from "node:crypto";

import { type MemoryConfig, resolveConfig, resolveRelevanceThreshold } from "./config.js";
import { buildLocalEmbedder, type Embedder } from "./embedder.js";
import { ConfigurationError, TokenBudgetError, ValidationError } from "./errors.js";
import type { FactExtractor } from "./extraction.js";
import { applyReranker, type Reranker } from "./rerank.js";
import type {
  MemoryEntry,
  MemorySource,
  RetrievedContext,
  Sensitivity,
  SessionMetadata,
  ToolResult,
  Turn,
} from "./models.js";
import { InMemoryStore, type L1Store, type L2Store } from "./store.js";

// Input length limits enforced at the public API boundary (mirror the Python lib).
const MAX_ID_LEN = 256;
const MAX_MESSAGE_LEN = 100_000;
const MAX_CONTENT_LEN = 100_000;
const MAX_QUERY_LEN = 10_000;
const MAX_TAGS = 50;

function validateId(value: string, field: string): void {
  if (!value || value.trim().length === 0) throw new ValidationError(field, "must not be empty");
  if (value.length > MAX_ID_LEN) throw new ValidationError(field, `must be ≤ ${MAX_ID_LEN} characters`);
}

function validateText(value: string, field: string, maxLen: number): void {
  if (value.length > maxLen) throw new ValidationError(field, `must be ≤ ${maxLen} characters`);
}

/** Options for constructing a {@link MemoryManager} directly (advanced use). */
export interface MemoryManagerParts {
  readonly l1: L1Store;
  readonly l2: L2Store;
  readonly embedder: Embedder;
  readonly config: MemoryConfig;
  /** Optional LLM fact extractor (turns → durable facts). LLM-gated, opt-in. */
  readonly extractor?: FactExtractor;
  /** Optional cross-encoder reranker. Reorders the top-K of an over-fetched set. */
  readonly reranker?: Reranker;
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
export class MemoryManager {
  private readonly l1: L1Store;
  private readonly l2: L2Store;
  private readonly embedder: Embedder;
  private readonly cfg: MemoryConfig;
  private readonly extractor: FactExtractor | undefined;
  private readonly reranker: Reranker | undefined;
  private readonly threshold: number;

  constructor(parts: MemoryManagerParts) {
    this.l1 = parts.l1;
    this.l2 = parts.l2;
    this.embedder = parts.embedder;
    this.cfg = parts.config;
    this.extractor = parts.extractor;
    this.reranker = parts.reranker;
    this.threshold = resolveRelevanceThreshold(parts.config, parts.embedder);
  }

  /**
   * The admission threshold this manager applies to long-term memories: `config.relevanceThreshold`
   * when set, else the embedder's calibrated threshold, else the library default.
   */
  get relevanceThreshold(): number {
    return this.threshold;
  }

  /**
   * Build a ready manager. With no arguments it uses the in-memory store and the best local
   * embedder available ({@link buildLocalEmbedder}): bge-small-en-v1.5 through `fastembed` when that
   * package is installed (the first run downloads the model, about 130 MB), otherwise the
   * dependency-free lexical `LocalEmbedder`, with a one-time warning that recall is keyword-only.
   * Pass stores / an embedder to back it with Redis + Qdrant + a model of your choice.
   */
  static async create(options: {
    config?: Partial<MemoryConfig>;
    l1?: L1Store;
    l2?: L2Store;
    embedder?: Embedder;
    extractor?: FactExtractor;
    reranker?: Reranker;
  } = {}): Promise<MemoryManager> {
    const config = resolveConfig(options.config);
    // A single in-memory store backs both tiers by default; it is unused when
    // both L1 and L2 adapters are supplied.
    const shared = new InMemoryStore(config.maxSessionTurns);
    return new MemoryManager({
      l1: options.l1 ?? shared,
      l2: options.l2 ?? shared,
      embedder: options.embedder ?? (await buildLocalEmbedder()),
      config,
      ...(options.extractor !== undefined ? { extractor: options.extractor } : {}),
      ...(options.reranker !== undefined ? { reranker: options.reranker } : {}),
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Persist a conversation turn to the hot session tier. Returns the turn id. */
  async storeTurn(
    agentId: string,
    sessionId: string,
    userMessage: string,
    assistantMessage: string,
    toolResults?: readonly ToolResult[],
  ): Promise<string> {
    validateId(agentId, "agentId");
    validateId(sessionId, "sessionId");
    validateText(userMessage, "userMessage", MAX_MESSAGE_LEN);
    validateText(assistantMessage, "assistantMessage", MAX_MESSAGE_LEN);

    const tokenCount = this.cfg.tokenCounter(`${userMessage}\n${assistantMessage}`);
    const turn: Turn = {
      id: randomUUID(),
      sessionId,
      userMessage,
      assistantMessage,
      toolResults: toolResults ?? [],
      timestamp: new Date().toISOString(),
      tokenCount,
    };
    await this.l1.appendTurn(agentId, sessionId, turn);
    return turn.id;
  }

  /**
   * Assemble context for the next LLM call using the 4-phase pipeline:
   * parallel L1/L2 fetch → budget allocation → relevance ranking → priority
   * pruning. The system-prompt + current-turn budget is never consumed here.
   */
  async retrieveContext(
    agentId: string,
    sessionId: string,
    query: string,
    tokenBudget: number,
  ): Promise<RetrievedContext> {
    validateId(agentId, "agentId");
    validateId(sessionId, "sessionId");
    validateText(query, "query", MAX_QUERY_LEN);
    if (tokenBudget <= 0) {
      throw new TokenBudgetError(`tokenBudget must be > 0, got ${tokenBudget}`, { tokenBudget });
    }

    const start = performance.now();

    // Phase 1: parallel fetch: embed the query and pull recent L1 turns concurrently.
    const [queryEmbedding, recentTurns] = await Promise.all([
      this.embedder.embed(query),
      this.l1.getRecentTurns(agentId, sessionId),
    ]);

    // Phase 3: semantic search against L2 (needs the embedding from Phase 1). Hybrid RRF
    // fuses the query text's lexical signal when enabled.
    const episodicCandidates = await this.l2.search({
      agentId,
      queryEmbedding,
      threshold: this.threshold,
      limit: this.cfg.maxEpisodicMemories,
      relevanceWeight: this.cfg.relevanceWeight,
      recencyWeight: this.cfg.recencyWeight,
      ...(this.cfg.hybridRetrieval ? { queryText: query } : {}),
    });
    // Phase 3b: optional cross-encoder rerank over the top-K (precision lift; A4).
    const episodicMemories = await applyReranker(
      this.reranker,
      query,
      episodicCandidates,
      this.cfg.rerankTopK,
    );

    // Phase 2: budget allocation.
    const episodicBudget = Math.floor(tokenBudget * this.cfg.budgetFractionEpisodic);
    const sessionBudget = Math.floor(tokenBudget * this.cfg.budgetFractionSession);

    // Phase 4: priority-weighted pruning.
    const prunedTurns = this.pruneTurns(recentTurns, sessionBudget);
    const prunedMemories = this.pruneMemories(episodicMemories, episodicBudget);

    const totalTokensUsed =
      prunedTurns.reduce((s, t) => s + t.tokenCount, 0) +
      prunedMemories.reduce((s, m) => s + m.tokenCount, 0);

    return {
      recentTurns: prunedTurns,
      episodicMemories: prunedMemories,
      totalTokensUsed,
      tokenBudget,
      retrievalDurationMs: performance.now() - start,
    };
  }

  /**
   * Write a fact directly into long-term memory. Returns the memory id.
   *
   * `source` and `sensitivity` are provenance-typing v1: they record where the
   * fact came from and how sensitive it is, so it can be attributed, filtered,
   * and erased by policy (the governance seed that graduates to hosted memory).
   */
  async injectMemory(
    agentId: string,
    content: string,
    importance = 0.8,
    sessionId = "injected",
    topicTags?: readonly string[],
    source: MemorySource = "injected",
    sensitivity: Sensitivity = "none",
  ): Promise<string> {
    validateId(agentId, "agentId");
    validateText(content, "content", MAX_CONTENT_LEN);
    if (content.trim().length === 0) throw new ValidationError("content", "must not be blank");
    if (importance < 0 || importance > 1) {
      throw new ValidationError("importance", "must be between 0.0 and 1.0");
    }
    const tags = topicTags ?? [];
    if (tags.length > MAX_TAGS) throw new ValidationError("topicTags", `must contain ≤ ${MAX_TAGS} tags`);
    validateText(source, "source", MAX_ID_LEN);

    const embedding = await this.embedder.embed(content);
    const entry: MemoryEntry = {
      id: randomUUID(),
      agentId,
      sessionId,
      content,
      contentType: "injected",
      embedding,
      importanceScore: importance,
      topicTags: tags,
      tokenCount: this.cfg.tokenCounter(content),
      timestamp: new Date().toISOString(),
      sourceTurnIds: [],
      source,
      sensitivity,
    };
    await this.l2.upsert(entry);
    return entry.id;
  }

  /** Permanently remove a memory by id. */
  async deleteMemory(agentId: string, memoryId: string): Promise<void> {
    validateId(agentId, "agentId");
    validateId(memoryId, "memoryId");
    await this.l2.delete(memoryId);
  }

  /**
   * Local right-to-erasure: irreversibly delete an agent's long-term memories.
   * The governance seed that graduates to hosted *provable* erasure. When
   * `sessionId` is given, the session's hot-tier turns are cleared too; otherwise
   * only the durable L2 store is wiped (hot-tier turns are ephemeral).
   */
  async eraseAgentMemories(agentId: string, sessionId?: string): Promise<void> {
    validateId(agentId, "agentId");
    await this.l2.deleteAgentMemories(agentId);
    if (sessionId !== undefined) {
      validateId(sessionId, "sessionId");
      await this.l1.clearSession(agentId, sessionId);
    }
  }

  /** Delete all hot-tier turns for a session. Long-term memories persist. */
  async clearSession(agentId: string, sessionId: string): Promise<void> {
    validateId(agentId, "agentId");
    validateId(sessionId, "sessionId");
    await this.l1.clearSession(agentId, sessionId);
  }

  /** Semantic search over long-term memory, ranked by relevance + recency. */
  async searchMemories(agentId: string, query: string, limit = 10): Promise<MemoryEntry[]> {
    validateId(agentId, "agentId");
    validateText(query, "query", MAX_QUERY_LEN);
    if (limit < 1) throw new ValidationError("limit", "must be ≥ 1");

    const embedding = await this.embedder.embed(query);
    // Over-fetch when reranking so the cross-encoder has a candidate pool to reorder.
    const fetchLimit = this.reranker ? Math.max(limit, this.cfg.rerankTopK) : limit;
    const candidates = await this.l2.search({
      agentId,
      queryEmbedding: embedding,
      threshold: this.threshold,
      limit: fetchLimit,
      relevanceWeight: this.cfg.relevanceWeight,
      recencyWeight: this.cfg.recencyWeight,
      ...(this.cfg.hybridRetrieval ? { queryText: query } : {}),
    });
    const reranked = await applyReranker(this.reranker, query, candidates, this.cfg.rerankTopK);
    return reranked.slice(0, limit);
  }

  /** Session stats, or null when the session does not exist / has expired. */
  async getSessionMetadata(agentId: string, sessionId: string): Promise<SessionMetadata | null> {
    validateId(agentId, "agentId");
    validateId(sessionId, "sessionId");
    return this.l1.getSessionMetadata(agentId, sessionId);
  }

  /**
   * Recent session turns, oldest → newest, capped at `n` (defaults to all
   * retained). This is the raw history read that framework memory adapters (e.g.
   * a LangChain `BaseChatMessageHistory` or a LlamaIndex `BaseMemory`) build on.
   */
  async getRecentTurns(agentId: string, sessionId: string, n?: number): Promise<Turn[]> {
    validateId(agentId, "agentId");
    validateId(sessionId, "sessionId");
    return this.l1.getRecentTurns(agentId, sessionId, n);
  }

  /**
   * Extract durable facts from a session's recent turns and store them as
   * first-class memories (`contentType: "fact"`, `source: "extracted"`, with an
   * LLM-classified sensitivity). LLM-gated: a {@link FactExtractor} must have been
   * supplied to `create()` / the constructor, else a `ConfigurationError` is thrown.
   * Returns the stored memory ids (empty when nothing durable is found).
   */
  async extractMemories(agentId: string, sessionId: string, n?: number): Promise<string[]> {
    validateId(agentId, "agentId");
    validateId(sessionId, "sessionId");
    if (this.extractor === undefined) {
      throw new ConfigurationError(
        "Fact extraction is not enabled: pass an `extractor` to MemoryManager.create().",
      );
    }
    const turns = await this.l1.getRecentTurns(agentId, sessionId, n);
    return this.storeExtractedFacts(agentId, sessionId, turns);
  }

  private async storeExtractedFacts(
    agentId: string,
    sessionId: string,
    turns: readonly Turn[],
  ): Promise<string[]> {
    if (this.extractor === undefined || turns.length === 0) return [];

    const combined = turns
      .map((t) => `User: ${t.userMessage}\nAssistant: ${t.assistantMessage}`)
      .join("\n");
    const facts = await this.extractor.extract(combined);
    if (facts.length === 0) return [];

    const sourceTurnIds = turns.map((t) => t.id);
    const ids: string[] = [];
    for (const fact of facts) {
      const embedding = await this.embedder.embed(fact.content);
      const entry: MemoryEntry = {
        id: randomUUID(),
        agentId,
        sessionId,
        content: fact.content,
        contentType: "fact",
        embedding,
        importanceScore: fact.importance,
        topicTags: fact.topicTags,
        tokenCount: this.cfg.tokenCounter(fact.content),
        timestamp: new Date().toISOString(),
        sourceTurnIds,
        source: "extracted",
        sensitivity: fact.sensitivity,
      };
      await this.l2.upsert(entry);
      ids.push(entry.id);
    }
    return ids;
  }

  /**
   * Release resources the stores own, by calling their optional `close()`.
   *
   * The built-in adapters take an already-connected client the caller constructed, so they
   * do not implement `close()` and nothing is torn down here: disconnecting an injected
   * client stays the application's job. A custom store that opens its own connection should
   * implement `close()`, and this is what calls it. Mirrors the Python manager, which closes
   * both tiers on shutdown.
   */
  async close(): Promise<void> {
    await this.l1.close?.();
    // Guard against the common case of one object serving both tiers (InMemoryStore does),
    // which would otherwise be closed twice.
    if (this.l2 !== (this.l1 as unknown as L2Store)) {
      await this.l2.close?.();
    }
  }

  // ── Internal pruning ────────────────────────────────────────────────────────

  /** Admit newest → oldest while each turn fits; stop on the first overflow.
   * Returns chronological order (oldest first). O(n). */
  private pruneTurns(turns: readonly Turn[], budget: number): Turn[] {
    const result: Turn[] = [];
    let remaining = budget;
    for (let i = turns.length - 1; i >= 0; i--) {
      const turn = turns[i];
      if (turn && turn.tokenCount <= remaining) {
        result.push(turn);
        remaining -= turn.tokenCount;
      } else {
        break;
      }
    }
    result.reverse();
    return result;
  }

  /** Admit highest-ranked → lowest, skipping individual overflows (input is
   * pre-sorted by relevance, so skipping one oversized memory to fit several
   * smaller ones is the right trade-off). O(n). */
  private pruneMemories(memories: readonly MemoryEntry[], budget: number): MemoryEntry[] {
    const result: MemoryEntry[] = [];
    let remaining = budget;
    for (const mem of memories) {
      if (mem.tokenCount <= remaining) {
        result.push(mem);
        remaining -= mem.tokenCount;
      }
    }
    return result;
  }
}
