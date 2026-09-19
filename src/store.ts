import { MemoryNotFoundError } from "./errors.js";
import type { ContentType, MemoryEntry, SessionMetadata, Turn } from "./models.js";
import { hybridRank } from "./retrieval.js";

/**
 * Store seams. L1 is the hot session tier (recent turns); L2 is the cold
 * semantic tier (long-term memories). {@link InMemoryStore} implements both with
 * plain Maps: the zero-dependency default. Redis (L1) and Qdrant (L2) adapters
 * implement these same interfaces without touching the manager.
 */

/** Hot session store (recent conversation turns). */
export interface L1Store {
  appendTurn(agentId: string, sessionId: string, turn: Turn): Promise<void>;
  /** Recent turns, oldest → newest, capped at `n` (defaults to all retained). */
  getRecentTurns(agentId: string, sessionId: string, n?: number): Promise<Turn[]>;
  turnCount(agentId: string, sessionId: string): Promise<number>;
  clearSession(agentId: string, sessionId: string): Promise<void>;
  getSessionMetadata(agentId: string, sessionId: string): Promise<SessionMetadata | null>;
  /**
   * Claim the right to run a background job for this session, fleet-wide, for
   * `ttlSeconds`. Returns true for exactly one caller per window.
   *
   * Optional, and nothing in this library calls it yet: it is the primitive the Python
   * library's auto-summarisation uses to keep one holder across processes, and it is
   * declared here so an adapter written against either library implements the same
   * contract. Implement it with a single atomic operation (Redis `SET NX EX`, Postgres
   * `INSERT ... ON CONFLICT ... WHERE expires_at <= now()`), never a read-then-write.
   */
  tryAcquireSummaryLock?(
    agentId: string,
    sessionId: string,
    ttlSeconds: number,
  ): Promise<boolean>;
  /**
   * Release resources this store owns. Optional, because the built-in adapters take an
   * injected client whose lifetime the application owns, so they have nothing to close.
   * A store that opens its own connection should implement it; `MemoryManager.close()`
   * calls it when present.
   */
  close?(): Promise<void>;
}

/** A ranked search hit: the entry plus its blended relevance score. */
export interface L2SearchParams {
  readonly agentId: string;
  readonly queryEmbedding: readonly number[];
  readonly threshold: number;
  readonly limit: number;
  /** Blend weights for `relevanceWeight·sim + recencyWeight·recency`. */
  readonly relevanceWeight: number;
  readonly recencyWeight: number;
  /**
   * Raw query text for hybrid retrieval. When provided, the threshold-admitted candidates
   * are re-ranked by fusing embedding cosine with BM25 (lexical) and recency via RRF. Omit for the
   * classic single-channel dense+recency blend.
   */
  readonly queryText?: string;
  /**
   * Restrict results to these content types. Omit for no filter. Matches the Python
   * protocol's `content_types`, so one contract describes both libraries.
   */
  readonly contentTypes?: readonly ContentType[];
}

/** Cold semantic store (long-term memories). */
export interface L2Store {
  upsert(entry: MemoryEntry): Promise<void>;
  search(params: L2SearchParams): Promise<MemoryEntry[]>;
  delete(memoryId: string): Promise<void>;
  /** Delete every memory for an agent (local right-to-erasure). */
  deleteAgentMemories(agentId: string): Promise<void>;
  /**
   * Release resources this store owns. Optional, for the same reason as
   * {@link L1Store.close}: the built-in adapters take an injected client.
   */
  close?(): Promise<void>;
}

/** `${agentId}::${sessionId}` composite key for L1 buckets. */
function sessionKey(agentId: string, sessionId: string): string {
  return `${agentId}::${sessionId}`;
}

/**
 * Default in-process store implementing both tiers. Data lives for the lifetime
 * of the process; it is the on-ramp for local development, testing, and small
 * single-instance agents. Swap in Redis/Qdrant adapters for durability + scale.
 */
export class InMemoryStore implements L1Store, L2Store {
  private readonly turns = new Map<string, Turn[]>();
  private readonly sessionCreatedAt = new Map<string, string>();
  private readonly memories = new Map<string, MemoryEntry[]>(); // keyed by agentId
  private readonly summaryLocks = new Map<string, number>(); // sessionKey -> expiry ms
  private readonly maxSessionTurns: number;

  constructor(maxSessionTurns = 50) {
    this.maxSessionTurns = maxSessionTurns;
  }

  // ── L1 ────────────────────────────────────────────────────────────────────

  async appendTurn(agentId: string, sessionId: string, turn: Turn): Promise<void> {
    const key = sessionKey(agentId, sessionId);
    const list = this.turns.get(key) ?? [];
    if (list.length === 0) this.sessionCreatedAt.set(key, turn.timestamp);
    list.push(turn);
    // Cap the retained window (newest kept), mirroring the L1 TTL/trim behaviour.
    if (list.length > this.maxSessionTurns) list.splice(0, list.length - this.maxSessionTurns);
    this.turns.set(key, list);
  }

  async getRecentTurns(agentId: string, sessionId: string, n?: number): Promise<Turn[]> {
    const list = this.turns.get(sessionKey(agentId, sessionId)) ?? [];
    if (n === undefined || n >= list.length) return [...list];
    return list.slice(list.length - n);
  }

  async turnCount(agentId: string, sessionId: string): Promise<number> {
    return this.turns.get(sessionKey(agentId, sessionId))?.length ?? 0;
  }

  async clearSession(agentId: string, sessionId: string): Promise<void> {
    const key = sessionKey(agentId, sessionId);
    this.turns.delete(key);
    this.sessionCreatedAt.delete(key);
    this.summaryLocks.delete(key);
  }

  async getSessionMetadata(
    agentId: string,
    sessionId: string,
  ): Promise<SessionMetadata | null> {
    const key = sessionKey(agentId, sessionId);
    const list = this.turns.get(key);
    if (!list || list.length === 0) return null;
    const createdAt = this.sessionCreatedAt.get(key);
    const lastActive = list[list.length - 1]?.timestamp;
    return {
      agentId,
      sessionId,
      turnCount: list.length,
      ...(createdAt !== undefined ? { createdAt } : {}),
      ...(lastActive !== undefined ? { lastActive } : {}),
    };
  }

  /**
   * SET-NX-EX equivalent: true for the first caller inside a TTL window.
   *
   * Process-local, like the Python in-memory store, because an in-process backend is
   * single-instance by definition. Use the Redis or Postgres adapter for a fleet-wide lock.
   */
  async tryAcquireSummaryLock(
    agentId: string,
    sessionId: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const key = sessionKey(agentId, sessionId);
    const now = Date.now();
    const expiry = this.summaryLocks.get(key);
    if (expiry !== undefined && expiry > now) return false;
    this.summaryLocks.set(key, now + ttlSeconds * 1000);
    return true;
  }

  // ── L2 ────────────────────────────────────────────────────────────────────

  async upsert(entry: MemoryEntry): Promise<void> {
    const list = this.memories.get(entry.agentId) ?? [];
    const idx = list.findIndex((m) => m.id === entry.id);
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    this.memories.set(entry.agentId, list);
  }

  async search(params: L2SearchParams): Promise<MemoryEntry[]> {
    const all = this.memories.get(params.agentId) ?? [];
    if (all.length === 0) return [];
    const types = params.contentTypes;
    const list =
      types && types.length > 0 ? all.filter((m) => types.includes(m.contentType)) : all;
    if (list.length === 0) return [];
    return hybridRank({
      entries: list,
      queryEmbedding: params.queryEmbedding,
      queryText: params.queryText,
      threshold: params.threshold,
      relevanceWeight: params.relevanceWeight,
      recencyWeight: params.recencyWeight,
      limit: params.limit,
    });
  }

  async delete(memoryId: string): Promise<void> {
    for (const [agentId, list] of this.memories) {
      const idx = list.findIndex((m) => m.id === memoryId);
      if (idx >= 0) {
        list.splice(idx, 1);
        this.memories.set(agentId, list);
        return;
      }
    }
    throw new MemoryNotFoundError(memoryId);
  }

  async deleteAgentMemories(agentId: string): Promise<void> {
    this.memories.delete(agentId);
  }
}
