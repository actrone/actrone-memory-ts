import { describe, expect, it } from "vitest";

import {
  cosineSimilarity,
  MemoryManager,
  QdrantL2Store,
  type QdrantHit,
  type QdrantLike,
  RedisL1Store,
  type RedisLike,
} from "../src/index.js";
import type { MemoryEntry } from "../src/models.js";

/** In-memory fake of the RedisLike surface (per-key string lists). */
class FakeRedis implements RedisLike {
  private readonly lists = new Map<string, string[]>();
  async rpush(key: string, value: string): Promise<number> {
    const l = this.lists.get(key) ?? [];
    l.push(value);
    this.lists.set(key, l);
    return l.length;
  }
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const l = this.lists.get(key) ?? [];
    const s = start < 0 ? Math.max(0, l.length + start) : start;
    const e = stop < 0 ? l.length + stop : stop;
    return l.slice(s, e + 1);
  }
  async ltrim(key: string, start: number, stop: number): Promise<unknown> {
    const l = this.lists.get(key) ?? [];
    const s = start < 0 ? Math.max(0, l.length + start) : start;
    const e = stop < 0 ? l.length + stop : stop;
    this.lists.set(key, l.slice(s, e + 1));
    return "OK";
  }
  async llen(key: string): Promise<number> {
    return this.lists.get(key)?.length ?? 0;
  }
  async del(key: string): Promise<number> {
    return this.lists.delete(key) ? 1 : 0;
  }
  async expire(): Promise<number> {
    return 1;
  }
  async lindex(key: string, index: number): Promise<string | null> {
    const l = this.lists.get(key) ?? [];
    const i = index < 0 ? l.length + index : index;
    return l[i] ?? null;
  }
}

/** In-memory fake of the QdrantLike surface (cosine over stored points). */
class FakeQdrant implements QdrantLike {
  private readonly points = new Map<
    string,
    { vector: number[]; payload: Record<string, unknown> }
  >();
  async upsert(
    _c: string,
    args: { points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> },
  ): Promise<unknown> {
    for (const p of args.points) this.points.set(p.id, { vector: p.vector, payload: p.payload });
    return "OK";
  }
  async search(
    _c: string,
    args: { vector: number[]; limit: number; score_threshold?: number; filter?: unknown },
  ): Promise<QdrantHit[]> {
    const agentId = (args.filter as { must?: Array<{ match?: { value?: unknown } }> } | undefined)
      ?.must?.[0]?.match?.value;
    const hits: QdrantHit[] = [];
    for (const [id, pt] of this.points) {
      if (agentId !== undefined && pt.payload["agentId"] !== agentId) continue;
      const score = cosineSimilarity(args.vector, pt.vector);
      if (args.score_threshold !== undefined && score < args.score_threshold) continue;
      hits.push({ id, score, payload: pt.payload });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, args.limit);
  }
  async delete(
    _c: string,
    args: { points: string[] } | { filter: unknown },
  ): Promise<unknown> {
    if ("points" in args) {
      for (const id of args.points) this.points.delete(id);
      return "OK";
    }
    const agentId = (args.filter as { must?: Array<{ match?: { value?: unknown } }> })
      ?.must?.[0]?.match?.value;
    for (const [id, pt] of this.points) {
      if (pt.payload["agentId"] === agentId) this.points.delete(id);
    }
    return "OK";
  }
}

describe("RedisL1Store", () => {
  it("appends, caps, reads recent, counts, clears, and reports metadata", async () => {
    const store = new RedisL1Store(new FakeRedis(), { maxTurns: 3 });
    const mk = (i: number) => ({
      id: `t${i}`,
      sessionId: "s",
      userMessage: `u${i}`,
      assistantMessage: `a${i}`,
      toolResults: [],
      timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
      tokenCount: 1,
    });
    for (let i = 0; i < 5; i++) await store.appendTurn("bot", "s", mk(i));

    expect(await store.turnCount("bot", "s")).toBe(3); // capped at maxTurns
    const recent = await store.getRecentTurns("bot", "s", 2);
    expect(recent.map((t) => t.userMessage)).toEqual(["u3", "u4"]); // newest kept

    const meta = await store.getSessionMetadata("bot", "s");
    expect(meta?.turnCount).toBe(3);
    expect(meta?.createdAt).toBeTruthy();

    await store.clearSession("bot", "s");
    expect(await store.turnCount("bot", "s")).toBe(0);
    expect(await store.getSessionMetadata("bot", "s")).toBeNull();
  });
});

describe("QdrantL2Store", () => {
  it("upserts, searches with agent isolation + threshold, and deletes", async () => {
    const store = new QdrantL2Store(new FakeQdrant());
    const embedder = { dimensions: 8, embed: async (t: string) => hashVec(t, 8) };

    const entry = (id: string, agentId: string, content: string): MemoryEntry => ({
      id,
      agentId,
      sessionId: "s",
      content,
      contentType: "injected",
      importanceScore: 0.9,
      topicTags: ["t"],
      tokenCount: 3,
      timestamp: new Date().toISOString(),
      sourceTurnIds: [],
      source: "injected",
      sensitivity: "none",
    });

    const e1 = { ...entry("m1", "bot", "refunds take five days"), embedding: await embedder.embed("refunds take five days") };
    const e2 = { ...entry("m2", "other", "refunds take five days"), embedding: await embedder.embed("refunds take five days") };
    await store.upsert(e1);
    await store.upsert(e2);

    const hits = await store.search({
      agentId: "bot",
      queryEmbedding: await embedder.embed("refunds five days"),
      threshold: 0.01,
      limit: 5,
      relevanceWeight: 0.7,
      recencyWeight: 0.3,
    });
    expect(hits).toHaveLength(1); // agent isolation excluded "other"
    expect(hits[0]?.id).toBe("m1");
    expect(hits[0]?.content).toBe("refunds take five days");
    expect(hits[0]?.relevanceScore).toBeGreaterThan(0);

    await store.delete("m1");
    const after = await store.search({
      agentId: "bot",
      queryEmbedding: await embedder.embed("refunds"),
      threshold: 0.01,
      limit: 5,
      relevanceWeight: 0.7,
      recencyWeight: 0.3,
    });
    expect(after).toHaveLength(0);
  });

  it("persists and reads back provenance (source + sensitivity)", async () => {
    const store = new QdrantL2Store(new FakeQdrant());
    const embedder = { dimensions: 8, embed: async (t: string) => hashVec(t, 8) };
    await store.upsert({
      id: "m1",
      agentId: "bot",
      sessionId: "s",
      content: "account number 12345",
      contentType: "injected",
      importanceScore: 0.9,
      topicTags: [],
      tokenCount: 3,
      timestamp: new Date().toISOString(),
      sourceTurnIds: [],
      source: "import:crm",
      sensitivity: "pii",
      embedding: await embedder.embed("account number 12345"),
    });
    const [hit] = await store.search({
      agentId: "bot",
      queryEmbedding: await embedder.embed("account number 12345"),
      threshold: 0.01,
      limit: 5,
      relevanceWeight: 0.7,
      recencyWeight: 0.3,
    });
    expect(hit?.source).toBe("import:crm");
    expect(hit?.sensitivity).toBe("pii");
  });

  it("deleteAgentMemories wipes only the target agent's points", async () => {
    const store = new QdrantL2Store(new FakeQdrant());
    const embedder = { dimensions: 8, embed: async (t: string) => hashVec(t, 8) };
    const mk = async (id: string, agentId: string): Promise<MemoryEntry & { embedding: number[] }> => ({
      id,
      agentId,
      sessionId: "s",
      content: "shared content",
      contentType: "injected",
      importanceScore: 0.9,
      topicTags: [],
      tokenCount: 3,
      timestamp: new Date().toISOString(),
      sourceTurnIds: [],
      source: "injected",
      sensitivity: "none",
      embedding: await embedder.embed("shared content"),
    });
    await store.upsert(await mk("m1", "bot"));
    await store.upsert(await mk("m2", "other"));

    await store.deleteAgentMemories("bot");

    const q = { queryEmbedding: await embedder.embed("shared content"), threshold: 0.01, limit: 5, relevanceWeight: 0.7, recencyWeight: 0.3 };
    expect(await store.search({ agentId: "bot", ...q })).toHaveLength(0);
    expect(await store.search({ agentId: "other", ...q })).toHaveLength(1);
  });
});

describe("MemoryManager with injected Redis + Qdrant stores", () => {
  it("drives the full contract through the adapter stores", async () => {
    const l1 = new RedisL1Store(new FakeRedis());
    const l2 = new QdrantL2Store(new FakeQdrant());
    const mm = await MemoryManager.create({ l1, l2, config: { relevanceThreshold: 0.01 } });

    await mm.storeTurn("bot", "s", "hi", "hello");
    await mm.injectMemory("bot", "The user prefers email over phone.", 0.9);
    const ctx = await mm.retrieveContext("bot", "s", "user email preference", 4096);
    expect(ctx.recentTurns).toHaveLength(1);
    expect(ctx.episodicMemories.length).toBeGreaterThanOrEqual(1);
  });
});

/** A tiny deterministic hashing embedder for the Qdrant fake tests. */
function hashVec(text: string, dim: number): number[] {
  const v = new Array<number>(dim).fill(0);
  for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let h = 2166136261;
    for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619);
    const b = (h >>> 0) % dim;
    v[b] = (v[b] ?? 0) + 1;
  }
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}
