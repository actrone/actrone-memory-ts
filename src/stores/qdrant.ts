import { StoreConnectionError } from "../errors.js";
import type { ContentType, MemoryEntry, MemorySource, Sensitivity } from "../models.js";
import { fuseChannels } from "../retrieval.js";
import type { L2SearchParams, L2Store } from "../store.js";

/** A single scored hit from a vector search. */
export interface QdrantHit {
  readonly id: string | number;
  readonly score: number;
  readonly payload?: Record<string, unknown> | null;
}

/** The payload filter this store sends: every condition must match a value, or any of a list. */
export interface QdrantFilter {
  must: Array<{ key: string; match: { value: string } | { any: string[] } }>;
}

/** The search options both Qdrant search calls take. */
export interface QdrantSearchOptions {
  limit: number;
  score_threshold?: number;
  filter?: QdrantFilter;
  with_payload?: boolean;
}

export interface QdrantWriteClient {
  upsert(
    collection: string,
    args: { points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> },
  ): Promise<unknown>;
  delete(
    collection: string,
    args: { points: string[] } | { filter: QdrantFilter },
  ): Promise<unknown>;
}

/** The Query API: `@qdrant/js-client-rest` 1.10 and later, and the only search call from 1.16. */
export interface QdrantQueryClient extends QdrantWriteClient {
  query(
    collection: string,
    args: QdrantSearchOptions & { query: number[] },
  ): Promise<{ points: QdrantHit[] }>;
}

/** The legacy search call of clients older than 1.10 (and simple test fakes). */
export interface QdrantSearchClient extends QdrantWriteClient {
  search(collection: string, args: QdrantSearchOptions & { vector: number[] }): Promise<QdrantHit[]>;
}

/**
 * Minimal structural interface for a Qdrant client: a current `@qdrant/js-client-rest`
 * (which searches with `query`) or an older one (`search`). Injected so `actrone-memory` needs
 * no hard Qdrant dependency and the store is unit-testable with an in-memory fake.
 *
 * The store does not create its collection: create it first, with a vector size equal to the
 * embedder's `dimensions` and cosine distance.
 */
export type QdrantLike = QdrantQueryClient | QdrantSearchClient;

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
    const vector = [...params.queryEmbedding];
    const options: QdrantSearchOptions = {
      // Over-fetch a little so the recency re-rank has candidates to reorder.
      limit: Math.max(params.limit * 2, params.limit),
      score_threshold: params.threshold,
      with_payload: true,
      filter: {
        must: [
          { key: "agentId", match: { value: params.agentId } },
          // Filter server-side rather than after the fact, so `limit` still returns a
          // full page when most of the collection is a different content type.
          ...(params.contentTypes && params.contentTypes.length > 0
            ? [{ key: "contentType", match: { any: [...params.contentTypes] } }]
            : []),
        ],
      },
    };
    try {
      hits =
        "query" in this.client
          ? (await this.client.query(this.collection, { ...options, query: vector })).points
          : await this.client.search(this.collection, { ...options, vector });
    } catch (err) {
      throw new StoreConnectionError("qdrant search failed", { cause: String(err) });
    }

    const now = Date.now();
    const recencyWindowMs = 30 * 24 * 60 * 60 * 1000;
    const entries = new Map<string, MemoryEntry>();
    const documents = new Map<string, string>();
    const recency = new Map<string, number>();
    const denseScore = new Map<string, number>();
    for (const h of hits) {
      const id = String(h.id);
      const entry = payloadToEntry(id, h.payload ?? {}, h.score);
      const ageMs = Math.max(0, now - Date.parse(entry.timestamp));
      entries.set(id, entry);
      documents.set(id, entry.content);
      recency.set(id, Math.max(0, 1 - ageMs / recencyWindowMs));
      denseScore.set(id, h.score);
    }
    if (entries.size === 0) return [];

    const denseRanking = [...denseScore.keys()].sort(
      (a, b) => (denseScore.get(b) ?? 0) - (denseScore.get(a) ?? 0),
    );
    // Hybrid RRF fuses the server cosine with BM25 + recency when query text is provided.
    const fusedOrder = fuseChannels({
      ids: [...entries.keys()],
      denseRanking,
      documents,
      recency,
      queryText: params.queryText,
      relevanceWeight: this.relevanceWeight,
      recencyWeight: this.recencyWeight,
    });
    const order =
      fusedOrder ??
      [...entries.keys()].sort((a, b) => {
        const sa = this.relevanceWeight * (denseScore.get(a) ?? 0) + this.recencyWeight * (recency.get(a) ?? 0);
        const sb = this.relevanceWeight * (denseScore.get(b) ?? 0) + this.recencyWeight * (recency.get(b) ?? 0);
        return sb - sa;
      });
    return order.slice(0, params.limit).map((id) => entries.get(id) as MemoryEntry);
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
