import { MemoryNotFoundError, StoreConnectionError } from "../errors.js";
import type { ContentType, MemoryEntry, MemorySource, Sensitivity } from "../models.js";
import { hybridRank } from "../retrieval.js";
import type { L2SearchParams, L2Store } from "../store.js";

/**
 * Minimal structural interface for a Postgres client (`pg` Pool/Client compatible).
 *
 * Injected, like the Redis and Qdrant adapters, so `@actrone/memory` needs no hard `pg`
 * dependency and the store is unit-testable without a database. Anything exposing this
 * `query` shape works, including a `pg.Pool`, a `pg.Client`, or a pooled wrapper.
 */
export interface PgLike {
  query<R = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: R[]; rowCount?: number | null }>;
}

export interface PgVectorL2Options {
  /** Table name. Must be a plain identifier. Default "agent_memories". */
  readonly table?: string;
  /** Embedding width. Fixed by pgvector at table-creation time. Default 1536. */
  readonly dimensions?: number;
}

// Identifiers cannot be bind parameters, so the table name is interpolated into SQL.
// Restrict it to a conservative charset instead of trusting the caller.
const SAFE_IDENTIFIER = /^[A-Za-z0-9_]+$/;

function validateIdentifier(name: string, field: string): string {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(
      `${field} must be a plain identifier (letters, digits, underscore), got ${JSON.stringify(name)}`,
    );
  }
  return name;
}

/** pgvector accepts its text form, `[1,2,3]`, which avoids registering a type parser. */
function toVectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.map((v) => String(Number(v))).join(",")}]`;
}

interface MemoryRow {
  id: string;
  agent_id: string;
  session_id: string;
  content: string;
  content_type: string;
  embedding_text: string;
  importance_score: number | string;
  topic_tags: unknown;
  token_count: number | string;
  timestamp: Date | string;
  source_turn_ids: unknown;
  source: string;
  sensitivity: string;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Postgres + pgvector cold semantic store (L2).
 *
 * The point of this adapter is "no new infrastructure": most teams already run Postgres, so
 * the durable long-term tier becomes a migration rather than a new service to operate.
 * Requires the [pgvector](https://github.com/pgvector/pgvector) extension.
 *
 * Ranking reuses the same {@link hybridRank} fusion as the in-memory and Qdrant stores, so
 * recall ordering is identical across all three backends given the same candidates: Postgres
 * returns the threshold-admitted rows and the shared fusion re-ranks them, rather than
 * reimplementing BM25 in SQL and drifting from the others.
 *
 * Mirrors the Python `actrone_memory.l2.pgvector_store.PgVectorStore` and passes the same
 * published conformance suite (`@actrone/memory/testing`).
 */
export class PgVectorL2Store implements L2Store {
  private readonly db: PgLike;
  private readonly table: string;
  private readonly dimensions: number;

  constructor(db: PgLike, opts: PgVectorL2Options = {}) {
    this.db = db;
    this.table = validateIdentifier(opts.table ?? "agent_memories", "table");
    this.dimensions = opts.dimensions ?? 1536;
  }

  /**
   * Create the extension, table and indexes if they do not exist.
   *
   * Call once at startup. Indexes: HNSW on the vector for cosine distance, plus a btree on
   * `agent_id`, since every read filters by it and would otherwise scan the whole table.
   */
  async ensureSchema(): Promise<void> {
    try {
      await this.db.query("CREATE EXTENSION IF NOT EXISTS vector");
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS ${this.table} (
          id               uuid PRIMARY KEY,
          agent_id         text        NOT NULL,
          session_id       text        NOT NULL,
          content          text        NOT NULL,
          content_type     text        NOT NULL,
          embedding        vector(${this.dimensions}) NOT NULL,
          importance_score double precision NOT NULL DEFAULT 0.5,
          topic_tags       jsonb       NOT NULL DEFAULT '[]'::jsonb,
          token_count      integer     NOT NULL DEFAULT 0,
          timestamp        timestamptz NOT NULL DEFAULT now(),
          source_turn_ids  jsonb       NOT NULL DEFAULT '[]'::jsonb,
          source           text        NOT NULL DEFAULT 'unknown',
          sensitivity      text        NOT NULL DEFAULT 'none'
        )
      `);
      await this.db.query(
        `CREATE INDEX IF NOT EXISTS ${this.table}_agent_id_idx ON ${this.table} (agent_id)`,
      );
      try {
        await this.db.query(
          `CREATE INDEX IF NOT EXISTS ${this.table}_embedding_idx
             ON ${this.table} USING hnsw (embedding vector_cosine_ops)`,
        );
      } catch {
        // HNSW needs pgvector >= 0.5. Correctness does not depend on the index, so fall
        // back to a sequential scan rather than failing startup on an older build.
      }
    } catch (err) {
      throw new StoreConnectionError("postgres ensureSchema failed", { cause: String(err) });
    }
  }

  async upsert(entry: MemoryEntry): Promise<void> {
    if (!entry.embedding || entry.embedding.length === 0) {
      throw new Error(`MemoryEntry ${entry.id} has no embedding, embed before upserting.`);
    }
    if (entry.embedding.length !== this.dimensions) {
      throw new Error(
        `MemoryEntry ${entry.id} has ${entry.embedding.length} dimensions, but this store was ` +
          `created for ${this.dimensions}. Recreate the table or use the embedder it was sized for.`,
      );
    }

    try {
      await this.db.query(
        `INSERT INTO ${this.table} (
           id, agent_id, session_id, content, content_type, embedding,
           importance_score, topic_tags, token_count, timestamp,
           source_turn_ids, source, sensitivity
         ) VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8::jsonb, $9, $10, $11::jsonb, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           agent_id         = EXCLUDED.agent_id,
           session_id       = EXCLUDED.session_id,
           content          = EXCLUDED.content,
           content_type     = EXCLUDED.content_type,
           embedding        = EXCLUDED.embedding,
           importance_score = EXCLUDED.importance_score,
           topic_tags       = EXCLUDED.topic_tags,
           token_count      = EXCLUDED.token_count,
           timestamp        = EXCLUDED.timestamp,
           source_turn_ids  = EXCLUDED.source_turn_ids,
           source           = EXCLUDED.source,
           sensitivity      = EXCLUDED.sensitivity`,
        [
          entry.id,
          entry.agentId,
          entry.sessionId,
          entry.content,
          entry.contentType,
          toVectorLiteral(entry.embedding),
          entry.importanceScore,
          JSON.stringify(entry.topicTags ?? []),
          entry.tokenCount,
          entry.timestamp,
          JSON.stringify(entry.sourceTurnIds ?? []),
          entry.source ?? "unknown",
          entry.sensitivity ?? "none",
        ],
      );
    } catch (err) {
      throw new StoreConnectionError("postgres upsert failed", { cause: String(err) });
    }
  }

  async search(params: L2SearchParams): Promise<MemoryEntry[]> {
    // `1 - (embedding <=> query)` is cosine similarity, since <=> is cosine distance.
    const values: unknown[] = [
      toVectorLiteral(params.queryEmbedding),
      params.agentId,
      params.threshold,
    ];
    let sql = `
      SELECT id, agent_id, session_id, content, content_type, importance_score,
             topic_tags, token_count, timestamp, source_turn_ids, source, sensitivity,
             embedding::text AS embedding_text
      FROM ${this.table}
      WHERE agent_id = $2
        AND 1 - (embedding <=> $1::vector) >= $3
    `;
    if (params.contentTypes && params.contentTypes.length > 0) {
      values.push([...params.contentTypes]);
      sql += ` AND content_type = ANY($${values.length}::text[])`;
    }
    // Over-fetch so the fusion can reorder rather than being handed a truncated set.
    values.push(Math.max(params.limit * 3, params.limit));
    sql += ` ORDER BY embedding <=> $1::vector LIMIT $${values.length}`;

    let rows: MemoryRow[];
    try {
      ({ rows } = await this.db.query<MemoryRow>(sql, values));
    } catch (err) {
      throw new StoreConnectionError("postgres search failed", { cause: String(err) });
    }

    const entries = rows.map((row) => this.rowToEntry(row));
    if (entries.length === 0) return [];

    return hybridRank({
      entries,
      queryEmbedding: params.queryEmbedding,
      queryText: params.queryText,
      threshold: params.threshold,
      relevanceWeight: params.relevanceWeight,
      recencyWeight: params.recencyWeight,
      limit: params.limit,
    });
  }

  private rowToEntry(row: MemoryRow): MemoryEntry {
    const timestamp =
      row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp);
    return {
      id: String(row.id),
      agentId: row.agent_id,
      sessionId: row.session_id,
      content: row.content,
      contentType: row.content_type as ContentType,
      // The fusion recomputes cosine locally, so the vector has to come back with the row.
      embedding: JSON.parse(row.embedding_text) as number[],
      importanceScore: Number(row.importance_score),
      topicTags: asStringArray(row.topic_tags),
      tokenCount: Number(row.token_count),
      timestamp,
      sourceTurnIds: asStringArray(row.source_turn_ids),
      source: row.source as MemorySource,
      sensitivity: row.sensitivity as Sensitivity,
    };
  }

  async delete(memoryId: string): Promise<void> {
    let rowCount: number | null | undefined;
    try {
      ({ rowCount } = await this.db.query(`DELETE FROM ${this.table} WHERE id = $1`, [memoryId]));
    } catch (err) {
      throw new StoreConnectionError("postgres delete failed", { cause: String(err) });
    }
    // `pg` reports affected rows, so an unknown id is detectable rather than silent.
    if (rowCount === 0) throw new MemoryNotFoundError(memoryId);
  }

  async deleteAgentMemories(agentId: string): Promise<void> {
    try {
      await this.db.query(`DELETE FROM ${this.table} WHERE agent_id = $1`, [agentId]);
    } catch (err) {
      throw new StoreConnectionError("postgres deleteAgentMemories failed", {
        cause: String(err),
      });
    }
  }
}
