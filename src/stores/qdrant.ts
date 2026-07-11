import { StoreConnectionError } from "../errors.js";
import type { ContentType, MemoryEntry, MemorySource, Sensitivity } from "../models.js";
import type { L2SearchParams, L2Store } from "../store.js";

/** A single scored hit from a vector search. */
export interface QdrantHit {
  readonly id: string | number;
  readonly score: number;
  readonly payload?: Record<string, unknown> | null;
}

/**
 * Minimal structural interface for a Qdrant client (`@qdrant/js-client-rest`
 * compatible). Injected so `@actrone/memory` needs no hard Qdrant dependency and
 * the store is unit-testable with an in-memory fake.
 */
export interface QdrantLike {
  upsert(
    collection: string,
    args: { points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> },
  ): Promise<unknown>;
  search(
    collection: string,
    args: {
      vector: number[];
      limit: number;
      score_threshold?: number;
      filter?: unknown;
      with_payload?: boolean;
    },
  ): Promise<QdrantHit[]>;
  delete(
    collection: string,
    args: { points: string[] } | { filter: unknown },
  ): Promise<unknown>;
}

export interface QdrantL2Options {
  /** Collection name. Default "actrone_memory". */
  readonly collection?: string;
  /** Blend weights for `relevanceWeight·score + recencyWeight·recency` on re-rank. */
  readonly relevanceWeight?: number;
  readonly recencyWeight?: number;
}

/**
 * Qdrant-backed cold semantic store (L2). Memories are points keyed by id with the
 * embedding as the vector and the entry fields as payload; search filters by
 * `agentId` for tenant/agent isolation and re-ranks the raw similarity with a
 * recency blend (mirroring the Python `actrone_memory` QdrantStore).
 */
export class QdrantL2Store implements L2Store {
  private readonly client: QdrantLike;
  private readonly collection: string;
  private readonly relevanceWeight: number;
  private readonly recencyWeight: number;

  constructor(client: QdrantLike, opts: QdrantL2Options = {}) {
    this.client = client;
    this.collection = opts.collection ?? "actrone_memory";
    this.relevanceWeight = opts.relevanceWeight ?? 0.7;
    this.recencyWeight = opts.recencyWeight ?? 0.3;
  }

  async upsert(entry: MemoryEntry): Promise<void> {
    try {
      await this.client.upsert(this.collection, {
        points: [
          {
            id: entry.id,
            vector: [...(entry.embedding ?? [])],
            payload: {
              agentId: entry.agentId,
              sessionId: entry.sessionId,
              content: entry.content,
              contentType: entry.contentType,
              importanceScore: entry.importanceScore,
              topicTags: [...entry.topicTags],
              tokenCount: entry.tokenCount,
              timestamp: entry.timestamp,
              sourceTurnIds: [...entry.sourceTurnIds],
              source: entry.source,
              sensitivity: entry.sensitivity,
            },
          },
        ],
      });
    } catch (err) {
      throw new StoreConnectionError("qdrant upsert failed", { cause: String(err) });
    }
  }

  async search(params: L2SearchParams): Promise<MemoryEntry[]> {
    let hits: QdrantHit[];
    try {
      hits = await this.client.search(this.collection, {
        vector: [...params.queryEmbedding],
        // Over-fetch a little so the recency re-rank has candidates to reorder.
        limit: Math.max(params.limit * 2, params.limit),
        score_threshold: params.threshold,
        with_payload: true,
        filter: {
          must: [{ key: "agentId", match: { value: params.agentId } }],
        },
      });
    } catch (err) {
      throw new StoreConnectionError("qdrant search failed", { cause: String(err) });
    }

    const now = Date.now();
    const recencyWindowMs = 30 * 24 * 60 * 60 * 1000;
    const scored = hits.map((h) => {
      const entry = payloadToEntry(String(h.id), h.payload ?? {}, h.score);
      const ageMs = Math.max(0, now - Date.parse(entry.timestamp));
      const recency = Math.max(0, 1 - ageMs / recencyWindowMs);
      const blended = this.relevanceWeight * h.score + this.recencyWeight * recency;
      return { entry, blended };
    });
    scored.sort((a, b) => b.blended - a.blended);
    return scored.slice(0, params.limit).map((s) => s.entry);
  }

  async delete(memoryId: string): Promise<void> {
    try {
      await this.client.delete(this.collection, { points: [memoryId] });
    } catch (err) {
      throw new StoreConnectionError("qdrant delete failed", { cause: String(err) });
    }
  }

  async deleteAgentMemories(agentId: string): Promise<void> {
    try {
      await this.client.delete(this.collection, {
        filter: { must: [{ key: "agentId", match: { value: agentId } }] },
      });
    } catch (err) {
      throw new StoreConnectionError("qdrant deleteAgentMemories failed", { cause: String(err) });
    }
  }
}

function payloadToEntry(
  id: string,
  payload: Record<string, unknown>,
  score: number,
): MemoryEntry {
  const str = (k: string, d = ""): string => (typeof payload[k] === "string" ? (payload[k] as string) : d);
  const num = (k: string, d = 0): number => (typeof payload[k] === "number" ? (payload[k] as number) : d);
  const arr = (k: string): string[] =>
    Array.isArray(payload[k]) ? (payload[k] as unknown[]).map(String) : [];
  return {
    id,
    agentId: str("agentId"),
    sessionId: str("sessionId"),
    content: str("content"),
    contentType: (str("contentType", "injected") as ContentType),
    importanceScore: num("importanceScore", 0.5),
    topicTags: arr("topicTags"),
    tokenCount: num("tokenCount"),
    timestamp: str("timestamp", new Date(0).toISOString()),
    sourceTurnIds: arr("sourceTurnIds"),
    source: str("source", "unknown") as MemorySource,
    sensitivity: str("sensitivity", "none") as Sensitivity,
    relevanceScore: score,
  };
}
