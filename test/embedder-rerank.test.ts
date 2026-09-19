import { describe, expect, it } from "vitest";

import type { MemoryEntry, Reranker } from "../src/index.js";
import {
  applyReranker,
  buildLocalEmbedder,
  LocalEmbedder,
  MemoryManager,
} from "../src/index.js";

function entry(id: string, content: string): MemoryEntry {
  return {
    id,
    agentId: "agent-1",
    sessionId: "s1",
    content,
    contentType: "summary",
    importanceScore: 0.5,
    topicTags: [],
    tokenCount: content.split(" ").length,
    timestamp: new Date().toISOString(),
    sourceTurnIds: [],
    source: "unknown",
    sensitivity: "none",
  };
}

describe("buildLocalEmbedder (A2 graceful chain)", () => {
  it("degrades to the hashing embedder when the fastembed peer is absent", async () => {
    // `fastembed` is not installed in the test env → FastEmbedEmbedder.create() throws → hashing.
    const emb = await buildLocalEmbedder();
    expect(emb).toBeInstanceOf(LocalEmbedder);
    expect(emb.dimensions).toBe(256);
    expect((await emb.embed("hello world")).length).toBe(256);
  });

  it("honours the hashing dimension override on fallback", async () => {
    const emb = await buildLocalEmbedder({ hashingDimensions: 128 });
    expect(emb.dimensions).toBe(128);
  });
});

describe("applyReranker", () => {
  const reverse: Reranker = {
    rerank: async (_query, entries) => [...entries].reverse(),
  };

  it("is a no-op when no reranker is configured", async () => {
    const entries = [entry("A", "a"), entry("B", "b")];
    expect(await applyReranker(undefined, "q", entries, 20)).toBe(entries);
  });

  it("is a no-op for empty entries or a blank query", async () => {
    expect(await applyReranker(reverse, "q", [], 20)).toEqual([]);
    const entries = [entry("A", "a")];
    expect(await applyReranker(reverse, "   ", entries, 20)).toBe(entries);
  });

  it("applies the reranker over the candidates", async () => {
    const entries = [entry("A", "a"), entry("B", "b")];
    const out = await applyReranker(reverse, "q", entries, 20);
    expect(out.map((e) => e.id)).toEqual(["B", "A"]);
  });
});

describe("MemoryManager reranker wiring", () => {
  it("routes search through the injected reranker", async () => {
    const reverse: Reranker = { rerank: async (_q, entries) => [...entries].reverse() };
    const mm = await MemoryManager.create({
      config: { relevanceThreshold: 0.01 },
      reranker: reverse,
    });
    await mm.injectMemory("agent-1", "France Paris capital city", 0.9);
    await mm.injectMemory("agent-1", "France Lyon riverside town", 0.9);
    const results = await mm.searchMemories("agent-1", "France", 2);
    expect(results.length).toBe(2);

    const mmPlain = await MemoryManager.create({ config: { relevanceThreshold: 0.01 } });
    await mmPlain.injectMemory("agent-1", "France Paris capital city", 0.9);
    await mmPlain.injectMemory("agent-1", "France Lyon riverside town", 0.9);
    const baseline = await mmPlain.searchMemories("agent-1", "France", 2);

    // IDs differ across managers (random per inject); the reranker reverses the retrieval order,
    // so the reranked contents equal the baseline contents reversed.
    expect(results.map((e) => e.content)).toEqual(
      [...baseline].reverse().map((e) => e.content),
    );
  });
});
