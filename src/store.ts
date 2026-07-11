import { cosineSimilarity } from "./embedder.js";
import { MemoryNotFoundError } from "./errors.js";
import type { MemoryEntry, SessionMetadata, Turn } from "./models.js";

/**
 * Store seams. L1 is the hot session tier (recent turns); L2 is the cold
 * semantic tier (long-term memories). {@link InMemoryStore} implements both with
 * plain Maps — the zero-dependency default. Redis (L1) and Qdrant (L2) adapters
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
}

/** Cold semantic store (long-term memories). */
export interface L2Store {
  upsert(entry: MemoryEntry): Promise<void>;
  search(params: L2SearchParams): Promise<MemoryEntry[]>;
  delete(memoryId: string): Promise<void>;
  /** Delete every memory for an agent (local right-to-erasure). */
  deleteAgentMemories(agentId: string): Promise<void>;
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

  // ── L2 ────────────────────────────────────────────────────────────────────

  async upsert(entry: MemoryEntry): Promise<void> {
    const list = this.memories.get(entry.agentId) ?? [];
    const idx = list.findIndex((m) => m.id === entry.id);
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    this.memories.set(entry.agentId, list);
  }

  async search(params: L2SearchParams): Promise<MemoryEntry[]> {
    const list = this.memories.get(params.agentId) ?? [];
    if (list.length === 0) return [];

    const now = Date.now();
    // Recency normalisation window: 30 days. Newer → closer to 1.
    const recencyWindowMs = 30 * 24 * 60 * 60 * 1000;

    const scored: Array<{ entry: MemoryEntry; score: number; sim: number }> = [];
    for (const entry of list) {
      const sim = entry.embedding ? cosineSimilarity(params.queryEmbedding, entry.embedding) : 0;
      if (sim < params.threshold) continue;
      const ageMs = Math.max(0, now - Date.parse(entry.timestamp));
      const recency = Math.max(0, 1 - ageMs / recencyWindowMs);
      const score = params.relevanceWeight * sim + params.recencyWeight * recency;
      scored.push({ entry, score, sim });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored
      .slice(0, params.limit)
      .map(({ entry, sim }) => ({ ...entry, relevanceScore: sim }));
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
