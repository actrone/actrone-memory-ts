import { StoreConnectionError } from "../errors.js";
import type { SessionMetadata, Turn } from "../models.js";
import type { L1Store } from "../store.js";
import type { PgLike } from "./pgvector.js";

export interface PostgresL1Options {
  /** Table name. Must be a plain identifier. Default "agent_turns". */
  readonly table?: string;
  /** Session TTL in seconds, refreshed per write. Default 24h. */
  readonly ttlSeconds?: number;
  /** Max turns retained per session (oldest trimmed). Default 50. */
  readonly maxTurns?: number;
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

interface TurnRow {
  turn: Turn | string;
}

function parseTurn(row: TurnRow): Turn {
  // `pg` parses jsonb into an object, but a driver configured without a type parser hands
  // back the raw string, so accept both rather than depending on driver configuration.
  return typeof row.turn === "string" ? (JSON.parse(row.turn) as Turn) : row.turn;
}

/**
 * Postgres-backed hot session store (L1).
 *
 * Pairs with {@link PgVectorL2Store} so both memory tiers live in a Postgres you already
 * run, instead of adding Redis and a vector database. Takes an injected `pg`-compatible
 * client, so this package keeps no hard `pg` dependency.
 *
 * Redis gives TTL and list trimming for free; Postgres does not, so this store implements
 * both explicitly:
 *
 * - **Expiry** is an `expires_at` column. Reads filter on it and writes opportunistically
 *   delete the session's expired rows, so an abandoned session cannot accumulate forever
 *   with no background job scheduled.
 * - **Retention** is enforced on append by deleting everything older than the newest
 *   `maxTurns` rows for that session, mirroring Redis `LTRIM`.
 *
 * Ordering uses a `bigserial` rather than the timestamp, because two turns appended in the
 * same clock tick would otherwise have no defined order, and prompt assembly depends on
 * recent turns coming back oldest-first. Expiry is computed by the server (`now() +
 * make_interval(...)`), never from the application clock, so retention does not depend on
 * two machines agreeing on the time.
 *
 * Mirrors the Python `actrone_memory.l1.postgres_store.PostgresStore` and passes the same
 * published conformance suite (`actrone-memory/testing`).
 */
export class PostgresL1Store implements L1Store {
  private readonly db: PgLike;
  private readonly table: string;
  private readonly locksTable: string;
  private readonly ttlSeconds: number;
  private readonly maxTurns: number;

  constructor(db: PgLike, opts: PostgresL1Options = {}) {
    this.db = db;
    this.table = validateIdentifier(opts.table ?? "agent_turns", "table");
    this.locksTable = `${this.table}_locks`;
    this.ttlSeconds = opts.ttlSeconds ?? 24 * 60 * 60;
    this.maxTurns = opts.maxTurns ?? 50;
  }

  /** Create the turns table, the summary-lock table and their indexes. Call once at startup. */
  async ensureSchema(): Promise<void> {
    try {
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS ${this.table} (
          seq        bigserial PRIMARY KEY,
          id         uuid        NOT NULL,
          agent_id   text        NOT NULL,
          session_id text        NOT NULL,
          turn       jsonb       NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          expires_at timestamptz NOT NULL
        )
      `);
      // Every read is (agent_id, session_id) ordered by seq, so index exactly that.
      await this.db.query(
        `CREATE INDEX IF NOT EXISTS ${this.table}_session_idx
           ON ${this.table} (agent_id, session_id, seq)`,
      );
      await this.db.query(
        `CREATE INDEX IF NOT EXISTS ${this.table}_expiry_idx ON ${this.table} (expires_at)`,
      );
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS ${this.locksTable} (
          agent_id   text        NOT NULL,
          session_id text        NOT NULL,
          expires_at timestamptz NOT NULL,
          PRIMARY KEY (agent_id, session_id)
        )
      `);
    } catch (err) {
      throw new StoreConnectionError("postgres ensureSchema failed", { cause: String(err) });
    }
  }

  async appendTurn(agentId: string, sessionId: string, turn: Turn): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO ${this.table} (id, agent_id, session_id, turn, created_at, expires_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, now() + make_interval(secs => $6))`,
        [turn.id, agentId, sessionId, JSON.stringify(turn), turn.timestamp, this.ttlSeconds],
      );
      // Opportunistic expiry, so no cron job is required for correctness.
      await this.db.query(
        `DELETE FROM ${this.table}
          WHERE agent_id = $1 AND session_id = $2 AND expires_at <= now()`,
        [agentId, sessionId],
      );
      // Retention cap, the equivalent of Redis LTRIM.
      await this.db.query(
        `DELETE FROM ${this.table}
          WHERE agent_id = $1 AND session_id = $2 AND seq NOT IN (
            SELECT seq FROM ${this.table}
             WHERE agent_id = $1 AND session_id = $2
             ORDER BY seq DESC
             LIMIT $3
          )`,
        [agentId, sessionId, this.maxTurns],
      );
    } catch (err) {
      throw new StoreConnectionError("postgres appendTurn failed", { cause: String(err) });
    }
  }

  async getRecentTurns(agentId: string, sessionId: string, n?: number): Promise<Turn[]> {
    const limit = n ?? this.maxTurns;
    try {
      // Take the newest `limit` rows, then flip to chronological order: the prompt is
      // assembled oldest-first, but "recent" has to window from the end.
      const { rows } = await this.db.query<TurnRow>(
        `SELECT turn FROM (
           SELECT turn, seq FROM ${this.table}
            WHERE agent_id = $1 AND session_id = $2 AND expires_at > now()
            ORDER BY seq DESC
            LIMIT $3
         ) AS recent
         ORDER BY seq ASC`,
        [agentId, sessionId, limit],
      );
      return rows.map(parseTurn);
    } catch (err) {
      throw new StoreConnectionError("postgres getRecentTurns failed", { cause: String(err) });
    }
  }

  async turnCount(agentId: string, sessionId: string): Promise<number> {
    try {
      const { rows } = await this.db.query<{ count: string | number }>(
        `SELECT count(*) AS count FROM ${this.table}
          WHERE agent_id = $1 AND session_id = $2 AND expires_at > now()`,
        [agentId, sessionId],
      );
      return Number(rows[0]?.count ?? 0);
    } catch (err) {
      throw new StoreConnectionError("postgres turnCount failed", { cause: String(err) });
    }
  }

  async clearSession(agentId: string, sessionId: string): Promise<void> {
    try {
      await this.db.query(
        `DELETE FROM ${this.table} WHERE agent_id = $1 AND session_id = $2`,
        [agentId, sessionId],
      );
      // Release the lock too: otherwise a reused session id could never be claimed again.
      await this.db.query(
        `DELETE FROM ${this.locksTable} WHERE agent_id = $1 AND session_id = $2`,
        [agentId, sessionId],
      );
    } catch (err) {
      throw new StoreConnectionError("postgres clearSession failed", { cause: String(err) });
    }
  }

  async getSessionMetadata(
    agentId: string,
    sessionId: string,
  ): Promise<SessionMetadata | null> {
    try {
      const { rows } = await this.db.query<{
        count: string | number;
        created_at: Date | string | null;
        last_active: Date | string | null;
      }>(
        `SELECT count(*) AS count,
                min(created_at) AS created_at,
                max(created_at) AS last_active
           FROM ${this.table}
          WHERE agent_id = $1 AND session_id = $2 AND expires_at > now()`,
        [agentId, sessionId],
      );
      const row = rows[0];
      const turnCount = Number(row?.count ?? 0);
      if (!row || turnCount === 0) return null;

      const iso = (value: Date | string | null): string | undefined => {
        if (value === null) return undefined;
        return value instanceof Date ? value.toISOString() : String(value);
      };
      const createdAt = iso(row.created_at);
      const lastActive = iso(row.last_active);
      return {
        agentId,
        sessionId,
        turnCount,
        ...(createdAt !== undefined ? { createdAt } : {}),
        ...(lastActive !== undefined ? { lastActive } : {}),
      };
    } catch (err) {
      throw new StoreConnectionError("postgres getSessionMetadata failed", {
        cause: String(err),
      });
    }
  }

  /**
   * Claim the right to summarise this session, fleet-wide.
   *
   * One statement, so the check and the claim cannot interleave between processes: the
   * upsert only overwrites a row whose window has already elapsed, and `RETURNING` is empty
   * for the losers.
   */
  async tryAcquireSummaryLock(
    agentId: string,
    sessionId: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    try {
      const { rows } = await this.db.query(
        `INSERT INTO ${this.locksTable} (agent_id, session_id, expires_at)
         VALUES ($1, $2, now() + make_interval(secs => $3))
         ON CONFLICT (agent_id, session_id) DO UPDATE
            SET expires_at = EXCLUDED.expires_at
          WHERE ${this.locksTable}.expires_at <= now()
         RETURNING 1`,
        [agentId, sessionId, ttlSeconds],
      );
      return rows.length > 0;
    } catch (err) {
      throw new StoreConnectionError("postgres tryAcquireSummaryLock failed", {
        cause: String(err),
      });
    }
  }
}
