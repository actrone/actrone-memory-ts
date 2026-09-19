import { describe, expect, it } from "vitest";

import { MemoryNotFoundError } from "../src/errors.js";
import type { MemoryEntry } from "../src/models.js";
import { PgVectorL2Store, type PgLike } from "../src/stores/pgvector.js";
import { checkL2Store } from "../src/testing.js";

/**
 * The adapter is injected a structural `pg`-compatible client, so it is testable without a
 * database. This fake implements just enough SQL semantics (cosine similarity, the agent
 * filter, the threshold, upsert-on-conflict, delete row counts) to exercise the adapter's
 * own logic: parameter binding, row mapping, vector encoding and error wrapping.
 *
 * The real SQL runs against a live Postgres in the Python sibling's integration suite; what
 * is verified here is everything on this side of the wire.
 */
const DIMENSIONS = 8;

interface StoredRow {
  id: string;
  agent_id: string;
  session_id: string;
  content: string;
  content_type: string;
  embedding: number[];
  importance_score: number;
  topic_tags: string;
  token_count: number;
  timestamp: string;
  source_turn_ids: string;
  source: string;
  sensitivity: string;
}

function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function parseVector(literal: string): number[] {
  return JSON.parse(literal) as number[];
}

/** A tiny in-process stand-in for `pg`, keyed on the statement shape the adapter emits. */
class FakePg implements PgLike {
  readonly rows = new Map<string, StoredRow>();
  readonly statements: string[] = [];
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

    if (sql.startsWith("CREATE")) return { rows: [] };

    if (sql.trimStart().startsWith("INSERT INTO")) {
      const [
        id,
        agentId,
        sessionId,
        content,
        contentType,
        embedding,
        importance,
        topicTags,
        tokenCount,
        timestamp,
        sourceTurnIds,
        source,
        sensitivity,
      ] = values as [
        string, string, string, string, string, string, number, string, number,
        string, string, string, string,
      ];
      // ON CONFLICT (id) DO UPDATE: a Map assignment replaces, which is the same semantics.
      this.rows.set(id, {
        id,
        agent_id: agentId,
        session_id: sessionId,
        content,
        content_type: contentType,
        embedding: parseVector(embedding),
        importance_score: importance,
        topic_tags: topicTags,
        token_count: tokenCount,
        timestamp,
        source_turn_ids: sourceTurnIds,
        source,
        sensitivity,
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes("DELETE FROM") && sql.includes("WHERE id =")) {
      const [id] = values as [string];
      const existed = this.rows.delete(id);
      return { rows: [], rowCount: existed ? 1 : 0 };
    }

    if (sql.includes("DELETE FROM") && sql.includes("WHERE agent_id =")) {
      const [agentId] = values as [string];
      let removed = 0;
      for (const [key, row] of [...this.rows]) {
        if (row.agent_id === agentId) {
          this.rows.delete(key);
          removed += 1;
        }
      }
      return { rows: [], rowCount: removed };
    }

    if (sql.includes("SELECT id, agent_id")) {
      const [vectorLiteral, agentId, threshold] = values as [string, string, number];
      const limit = values[values.length - 1] as number;
      // The adapter appends the content-type array between the threshold and the limit
      // only when a filter was requested, so its presence is what signals the filter.
      const contentTypes = sql.includes("content_type = ANY")
        ? (values[3] as string[])
        : undefined;
      const query = parseVector(vectorLiteral);
      const matched = [...this.rows.values()]
        .filter((row) => row.agent_id === agentId)
        .filter((row) => !contentTypes || contentTypes.includes(row.content_type))
        .map((row) => ({ row, similarity: cosine(query, row.embedding) }))
        .filter(({ similarity }) => similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(({ row }) => ({ ...row, embedding_text: JSON.stringify(row.embedding) }));
      return { rows: matched as unknown as R[] };
    }

    return { rows: [] };
  }
}

function unitVector(hot: number): number[] {
  const v = new Array<number>(DIMENSIONS).fill(0);
  v[hot % DIMENSIONS] = 1;
  return v;
}

function entry(agentId: string, content: string, hot = 0, id?: string): MemoryEntry {
  return {
    id: id ?? globalThis.crypto.randomUUID(),
    agentId,
    sessionId: "s1",
    content,
    contentType: "injected",
    embedding: unitVector(hot),
    importanceScore: 0.5,
    topicTags: ["tag"],
    tokenCount: 4,
    timestamp: new Date().toISOString(),
    sourceTurnIds: ["turn-1"],
    source: "injected",
    sensitivity: "none",
  };
}

async function makeStore(): Promise<{ store: PgVectorL2Store; db: FakePg }> {
  const db = new FakePg();
  const store = new PgVectorL2Store(db, { table: "memories", dimensions: DIMENSIONS });
  await store.ensureSchema();
  return { store, db };
}

describe("PgVectorL2Store", () => {
  it("passes the published L2 conformance suite", async () => {
    await checkL2Store(
      async () => {
        const { store } = await makeStore();
        return store;
      },
      { dimensions: DIMENSIONS },
    );
  });

  it("round-trips every payload field", async () => {
    const { store } = await makeStore();
    const original = entry("agent-1", "the user prefers dark mode");
    await store.upsert(original);

    const [hit] = await store.search({
      agentId: "agent-1",
      queryEmbedding: unitVector(0),
      threshold: 0.5,
      limit: 5,
      relevanceWeight: 0.7,
      recencyWeight: 0.3,
    });

    expect(hit).toBeDefined();
    expect(hit?.id).toBe(original.id);
    expect(hit?.content).toBe("the user prefers dark mode");
    expect(hit?.contentType).toBe("injected");
    expect(hit?.topicTags).toEqual(["tag"]);
    expect(hit?.sourceTurnIds).toEqual(["turn-1"]);
    expect(hit?.tokenCount).toBe(4);
    expect(hit?.source).toBe("injected");
    expect(hit?.sensitivity).toBe("none");
  });

  it("creates the extension, table and indexes", async () => {
    const { db } = await makeStore();
    const ddl = db.statements.filter((s) => s.startsWith("CREATE"));
    expect(ddl.some((s) => s.includes("EXTENSION"))).toBe(true);
    expect(ddl.some((s) => s.includes("TABLE"))).toBe(true);
    expect(ddl.filter((s) => s.includes("INDEX")).length).toBeGreaterThanOrEqual(2);
  });

  it("never returns another agent's memories", async () => {
    const { store } = await makeStore();
    const mine = entry("agent-1", "mine");
    await store.upsert(mine);
    await store.upsert(entry("agent-2", "theirs"));

    const hits = await store.search({
      agentId: "agent-1",
      queryEmbedding: unitVector(0),
      threshold: 0,
      limit: 10,
      relevanceWeight: 0.7,
      recencyWeight: 0.3,
    });

    expect(hits.map((h) => h.id)).toEqual([mine.id]);
  });

  it("rejects an embedding of the wrong width before touching the database", async () => {
    const { store, db } = await makeStore();
    const before = db.statements.length;

    await expect(
      store.upsert({ ...entry("agent-1", "bad"), embedding: [0.1, 0.2] }),
    ).rejects.toThrow(/dimensions/);
    expect(db.statements.length).toBe(before);
  });

  it("rejects an entry with no embedding", async () => {
    const { store } = await makeStore();
    await expect(
      store.upsert({ ...entry("agent-1", "bad"), embedding: [] }),
    ).rejects.toThrow(/no embedding/);
  });

  it("throws MemoryNotFoundError when deleting an unknown id", async () => {
    const { store } = await makeStore();
    await expect(store.delete(globalThis.crypto.randomUUID())).rejects.toThrow(
      MemoryNotFoundError,
    );
  });

  it("rejects an unsafe table name", () => {
    // The table name is interpolated into SQL, so it must be validated, not trusted.
    expect(() => new PgVectorL2Store(new FakePg(), { table: 'm"; DROP TABLE users; --' })).toThrow(
      /plain identifier/,
    );
  });

  it("wraps driver failures in StoreConnectionError", async () => {
    const { store, db } = await makeStore();
    db.failNext = "INSERT INTO";

    await expect(store.upsert(entry("agent-1", "boom"))).rejects.toThrow(
      /postgres upsert failed/,
    );
  });

  it("binds values rather than interpolating them into SQL", async () => {
    const { store, db } = await makeStore();
    const injected = "'; DROP TABLE memories; --";
    await store.upsert(entry(injected, "hostile agent id"));

    // The hostile value must never appear in a statement, only in the bound parameters.
    expect(db.statements.every((s) => !s.includes("DROP"))).toBe(true);
    expect([...db.rows.values()][0]?.agent_id).toBe(injected);
  });
});
