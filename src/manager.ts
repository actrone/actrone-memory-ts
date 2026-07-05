import { randomUUID } from "node:crypto";

import { type MemoryConfig, resolveConfig } from "./config.js";
import { type Embedder, LocalEmbedder } from "./embedder.js";
import { TokenBudgetError, ValidationError } from "./errors.js";
import type {
  MemoryEntry,
  RetrievedContext,
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

  constructor(parts: MemoryManagerParts) {
    this.l1 = parts.l1;
    this.l2 = parts.l2;
    this.embedder = parts.embedder;
    this.cfg = parts.config;
  }

  /**
   * Build a ready manager. With no arguments it uses the in-memory store + the
   * dependency-free local embedder — the zero-config on-ramp. Pass stores /
   * embedder to back it with Redis + Qdrant + a real embedding model.
   */
  static async create(options: {
    config?: Partial<MemoryConfig>;
    l1?: L1Store;
    l2?: L2Store;
    embedder?: Embedder;
  } = {}): Promise<MemoryManager> {
    const config = resolveConfig(options.config);
    // A single in-memory store backs both tiers by default; it is unused when
    // both L1 and L2 adapters are supplied.
    const shared = new InMemoryStore(config.maxSessionTurns);
    return new MemoryManager({
      l1: options.l1 ?? shared,
      l2: options.l2 ?? shared,
      embedder: options.embedder ?? new LocalEmbedder(),
      config,
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

    // Phase 1 — parallel fetch: embed the query and pull recent L1 turns concurrently.
    const [queryEmbedding, recentTurns] = await Promise.all([
      this.embedder.embed(query),
      this.l1.getRecentTurns(agentId, sessionId),
    ]);

    // Phase 3 — semantic search against L2 (needs the embedding from Phase 1).
    const episodicMemories = await this.l2.search({
      agentId,
      queryEmbedding,
      threshold: this.cfg.relevanceThreshold,
      limit: this.cfg.maxEpisodicMemories,
      relevanceWeight: this.cfg.relevanceWeight,
      recencyWeight: this.cfg.recencyWeight,
    });

    // Phase 2 — budget allocation.
    const episodicBudget = Math.floor(tokenBudget * this.cfg.budgetFractionEpisodic);
    const sessionBudget = Math.floor(tokenBudget * this.cfg.budgetFractionSession);

    // Phase 4 — priority-weighted pruning.
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

  /** Write a fact directly into long-term memory. Returns the memory id. */
  async injectMemory(
    agentId: string,
    content: string,
    importance = 0.8,
    sessionId = "injected",
    topicTags?: readonly string[],
  ): Promise<string> {
    validateId(agentId, "agentId");
    validateText(content, "content", MAX_CONTENT_LEN);
    if (content.trim().length === 0) throw new ValidationError("content", "must not be blank");
    if (importance < 0 || importance > 1) {
      throw new ValidationError("importance", "must be between 0.0 and 1.0");
    }
    const tags = topicTags ?? [];
    if (tags.length > MAX_TAGS) throw new ValidationError("topicTags", `must contain ≤ ${MAX_TAGS} tags`);

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
    return this.l2.search({
      agentId,
      queryEmbedding: embedding,
      threshold: this.cfg.relevanceThreshold,
      limit,
      relevanceWeight: this.cfg.relevanceWeight,
      recencyWeight: this.cfg.recencyWeight,
    });
  }

  /** Session stats, or null when the session does not exist / has expired. */
  async getSessionMetadata(agentId: string, sessionId: string): Promise<SessionMetadata | null> {
    validateId(agentId, "agentId");
    validateId(sessionId, "sessionId");
    return this.l1.getSessionMetadata(agentId, sessionId);
  }

  /** Release any resources. In-memory mode is a no-op; adapters override the stores. */
  async close(): Promise<void> {
    // In-memory store holds no external connections. Redis/Qdrant adapters that
    // implement a `close()` are drained by their own lifecycle wiring.
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
