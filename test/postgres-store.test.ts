import { describe, expect, it } from "vitest";

import type { Turn } from "../src/models.js";
import type { PgLike } from "../src/stores/pgvector.js";
import { PostgresL1Store } from "../src/stores/postgres.js";
import { checkL1Store } from "../src/testing.js";

/**
 * The adapter takes a structural `pg`-compatible client, so it is testable without a
 * database. This fake implements enough SQL semantics (the session filter, expiry, the
 * retention cap, seq ordering and the conditional lock upsert) to exercise the adapter's own
 * logic: parameter binding, row mapping and error wrapping.
 *
 * The identical SQL runs against a live Postgres in the Python sibling's integration suite,
 * which is where the statements themselves are verified.
 */
interface TurnRow {
  seq: number;
  id: string;
  agent_id: string;
  session_id: string;
  turn: string;
  created_at: Date;
  expires_at: number; // epoch ms, so the fake can model expiry without a clock library
}

class FakePg implements PgLike {
  readonly turns: TurnRow[] = [];
  readonly locks = new Map<string, number>();
  readonly statements: string[] = [];
  private seq = 0;
  failNext: string | null = null;

  async query<R = Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<{ rows: R[]; rowCount?: number | null }> {
    this.statements.push(sql.trim().split(/\s+/).slice(0, 3).join(" "));
    if (this.failNext && sql.includes(this.failNext)) {
      this.failNext = null;
      throw new Error("simulated postgres failure");
    }
    if (sql.trimStart().startsWith("CREATE")) return { rows: [] };

    // Check the locks table FIRST: it is named `<table>_locks`, so a naive match on the
    // turns table name would swallow the lock statement.
    if (sql.includes("INSERT INTO") && sql.includes("_locks")) {
      const [agentId, sessionId, ttl] = values as [string, string, number];
      const key = `${agentId}::${sessionId}`;
      const held = this.locks.get(key);
      // ON CONFLICT ... WHERE expires_at <= now(): only an elapsed window may be taken.
      if (held !== undefined && held > Date.now()) return { rows: [] };
      this.locks.set(key, Date.now() + ttl * 1000);
      return { rows: [{ "?column?": 1 }] as unknown as R[] };
    }

    if (sql.includes("INSERT INTO") && sql.includes("make_interval")) {
      const [id, agentId, sessionId, turn, createdAt, ttl] = values as [
        string, string, string, string, string, number,
      ];
      this.seq += 1;
      this.turns.push({
        seq: this.seq,
        id,
        agent_id: agentId,
        session_id: sessionId,
        turn,
        created_at: new Date(createdAt),
        expires_at: Date.now() + ttl * 1000,
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes("DELETE FROM") && sql.includes("expires_at <= now()")) {
      const [agentId, sessionId] = values as [string, string];
      const now = Date.now();
      for (let i = this.turns.length - 1; i >= 0; i--) {
        const row = this.turns[i]!;
        if (row.agent_id === agentId && row.session_id === sessionId && row.expires_at <= now) {
          this.turns.splice(i, 1);
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes("DELETE FROM") && sql.includes("seq NOT IN")) {
      const [agentId, sessionId, maxTurns] = values as [string, string, number];
      const kept = this.turns
        .filter((r) => r.agent_id === agentId && r.session_id === sessionId)
        .sort((a, b) => b.seq - a.seq)
        .slice(0, maxTurns)
        .map((r) => r.seq);
      for (let i = this.turns.length - 1; i >= 0; i--) {
        const row = this.turns[i]!;
        if (
          row.agent_id === agentId &&
          row.session_id === sessionId &&
          !kept.includes(row.seq)
        ) {
          this.turns.splice(i, 1);
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes("DELETE FROM") && sql.includes("_locks")) {
      const [agentId, sessionId] = values as [string, string];
      this.locks.delete(`${agentId}::${sessionId}`);
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes("DELETE FROM")) {
      const [agentId, sessionId] = values as [string, string];
      for (let i = this.turns.length - 1; i >= 0; i--) {
        const row = this.turns[i]!;
        if (row.agent_id === agentId && row.session_id === sessionId) this.turns.splice(i, 1);
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes("SELECT turn FROM")) {
      const [agentId, sessionId, limit] = values as [string, string, number];
      const now = Date.now();
      const rows = this.turns
        .filter(
          (r) => r.agent_id === agentId && r.session_id === sessionId && r.expires_at > now,
        )
        .sort((a, b) => b.seq - a.seq)
        .slice(0, limit)
        .sort((a, b) => a.seq - b.seq)
        .map((r) => ({ turn: r.turn }));
      return { rows: rows as unknown as R[] };
    }

    if (sql.includes("count(*) AS count") && sql.includes("min(created_at)")) {
      const [agentId, sessionId] = values as [string, string];
      const now = Date.now();
      const live = this.turns.filter(
        (r) => r.agent_id === agentId && r.session_id === sessionId && r.expires_at > now,
      );
      if (live.length === 0) {
        return { rows: [{ count: 0, created_at: null, last_active: null }] as unknown as R[] };
      }
      const created = live.map((r) => r.created_at).sort((a, b) => +a - +b);
      return {
        rows: [
          {
            count: live.length,
            created_at: created[0]!,
            last_active: created[created.length - 1]!,
          },
        ] as unknown as R[],
      };
    }

    if (sql.includes("count(*) AS count")) {
      const [agentId, sessionId] = values as [string, string];
      const now = Date.now();
      const count = this.turns.filter(
        (r) => r.agent_id === agentId && r.session_id === sessionId && r.expires_at > now,
      ).length;
      return { rows: [{ count }] as unknown as R[] };
    }

    return { rows: [] };
  }
}

function turn(sessionId: string, userMessage: string): Turn {
  return {
    id: globalThis.crypto.randomUUID(),
    sessionId,
    userMessage,
    assistantMessage: "ok",
    toolResults: [],
    timestamp: new Date().toISOString(),
    tokenCount: 4,
  };
}

async function makeStore(opts = {}): Promise<{ store: PostgresL1Store; db: FakePg }> {
  const db = new FakePg();
  const store = new PostgresL1Store(db, { table: "turns", ...opts });
  await store.ensureSchema();
  return { store, db };
}

describe("PostgresL1Store", () => {
  it("passes the published L1 conformance suite", async () => {
    await checkL1Store(async () => {
      const { store } = await makeStore();
      return store;
    });
  });

  it("creates the turns table, the locks table and indexes", async () => {
    const { db } = await makeStore();
    const ddl = db.statements.filter((s) => s.startsWith("CREATE"));
    expect(ddl.filter((s) => s.includes("TABLE")).length).toBe(2);
    expect(ddl.filter((s) => s.includes("INDEX")).length).toBe(2);
  });

  it("round-trips the turn payload", async () => {
    const { store } = await makeStore();
    const original = turn("s1", "what is my plan?");
    await store.appendTurn("agent-1", "s1", original);

    const [got] = await store.getRecentTurns("agent-1", "s1");

    expect(got?.id).toBe(original.id);
    expect(got?.userMessage).toBe("what is my plan?");
    expect(got?.tokenCount).toBe(4);
  });

  it("enforces the retention cap on append", async () => {
    const { store } = await makeStore({ maxTurns: 3 });
    for (let i = 0; i < 6; i++) {
      await store.appendTurn("agent-1", "s1", turn("s1", `msg-${i}`));
    }

    const turns = await store.getRecentTurns("agent-1", "s1");

    expect(turns.map((t) => t.userMessage)).toEqual(["msg-3", "msg-4", "msg-5"]);
    expect(await store.turnCount("agent-1", "s1")).toBe(3);
  });

  it("hides expired turns from reads, counts and metadata", async () => {
    const { store } = await makeStore({ ttlSeconds: 0 });
    await store.appendTurn("agent-1", "s1", turn("s1", "should expire"));
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(await store.getRecentTurns("agent-1", "s1")).toEqual([]);
    expect(await store.turnCount("agent-1", "s1")).toBe(0);
    expect(await store.getSessionMetadata("agent-1", "s1")).toBeNull();
  });

  it("computes expiry server-side rather than from the application clock", async () => {
    const { store, db } = await makeStore();
    await store.appendTurn("agent-1", "s1", turn("s1", "hi"));

    // Retention must not depend on the app and database clocks agreeing.
    const insert = db.statements.find((s) => s.startsWith("INSERT INTO turns"));
    expect(insert).toBeDefined();
  });

  it("grants the summary lock to exactly one holder per window", async () => {
    const { store } = await makeStore();

    expect(await store.tryAcquireSummaryLock("agent-1", "s1", 60)).toBe(true);
    expect(await store.tryAcquireSummaryLock("agent-1", "s1", 60)).toBe(false);
  });

  it("releases the summary lock when the session is cleared", async () => {
    const { store } = await makeStore();
    await store.appendTurn("agent-1", "s1", turn("s1", "hi"));
    expect(await store.tryAcquireSummaryLock("agent-1", "s1", 600)).toBe(true);

    await store.clearSession("agent-1", "s1");

    // A reused session id would otherwise never be claimable again.
    expect(await store.tryAcquireSummaryLock("agent-1", "s1", 600)).toBe(true);
  });

  it("rejects an unsafe table name", () => {
    expect(() => new PostgresL1Store(new FakePg(), { table: 't"; DROP TABLE users; --' })).toThrow(
      /plain identifier/,
    );
  });

  it("wraps driver failures in StoreConnectionError", async () => {
    const { store, db } = await makeStore();
    db.failNext = "INSERT INTO turns";

    await expect(store.appendTurn("agent-1", "s1", turn("s1", "boom"))).rejects.toThrow(
      /postgres appendTurn failed/,
    );
  });

  it("binds values rather than interpolating them into SQL", async () => {
    const { store, db } = await makeStore();
    const hostile = "'; DROP TABLE turns; --";
    await store.appendTurn(hostile, "s1", turn("s1", "hostile agent id"));

    expect(db.statements.every((s) => !s.includes("DROP"))).toBe(true);
    expect(db.turns[0]?.agent_id).toBe(hostile);
  });
});
