import { describe, expect, it } from "vitest";

import type { MemoryEntry } from "../src/index.js";
import {
  bm25Scores,
  hybridRank,
  reciprocalRankFusion,
  tokenize,
} from "../src/index.js";

function entry(id: string, content: string, embedding: number[]): MemoryEntry {
  return {
    id,
    agentId: "agent-1",
    sessionId: "s1",
    content,
    contentType: "summary",
    embedding,
    importanceScore: 0.5,
    topicTags: [],
    tokenCount: content.split(" ").length,
    timestamp: new Date().toISOString(),
    sourceTurnIds: [],
    source: "unknown",
    sensitivity: "none",
  };
}

describe("tokenize", () => {
  it("lowercases alphanumeric word tokens", () => {
    expect(tokenize("The Quick, brown FOX-42!")).toEqual(["the", "quick", "brown", "fox", "42"]);
  });
});

describe("bm25Scores", () => {
  it("ranks a term match above a non-match", () => {
    const docs = new Map([
      ["a", "the capital of France is Paris"],
      ["b", "bananas are a yellow fruit"],
      ["c", "France shares a border with Spain"],
    ]);
    const scores = bm25Scores("France", docs);
    expect(scores.get("a")).toBeGreaterThan(0);
    expect(scores.get("c")).toBeGreaterThan(0);
    expect(scores.get("b")).toBe(0);
  });

  it("returns zeros for an empty query", () => {
    const scores = bm25Scores("", new Map([["a", "hello"]]));
    expect(scores.get("a")).toBe(0);
  });
});

describe("reciprocalRankFusion", () => {
  it("combines channels", () => {
    const fused = reciprocalRankFusion([
      ["x", "y", "z"],
      ["z", "x", "y"],
    ]);
    const ranked = [...fused.keys()].sort((a, b) => (fused.get(b) ?? 0) - (fused.get(a) ?? 0));
    expect(ranked[0]).toBe("x");
    expect(ranked[ranked.length - 1]).toBe("y");
  });

  it("validates weights length", () => {
    expect(() => reciprocalRankFusion([["a"], ["b"]], { weights: [1] })).toThrow(/weights length/);
  });
});

describe("hybridRank", () => {
  const queryEmbedding = [1, 0, 0];

  it("lexical channel rescues a keyword match the embedder under-ranks", () => {
    const a = entry("A", "bananas are a yellow fruit", [0.99, 0.14, 0]); // high cosine, no keyword
    const b = entry("B", "the capital of France is Paris", [0.72, 0.69, 0]); // lower cosine, keyword
    const ranked = hybridRank({
      entries: [a, b],
      queryEmbedding,
      queryText: "France",
      threshold: 0.5,
      relevanceWeight: 0.7,
      recencyWeight: 0.3,
      limit: 10,
    });
    expect(new Set(ranked.map((e) => e.id))).toEqual(new Set(["A", "B"]));
    expect(ranked[0]?.id).toBe("B");
  });

  it("respects threshold admission", () => {
    const near = entry("near", "France Paris", [0.99, 0.14, 0]);
    const far = entry("far", "France Paris", [0, 1, 0]); // cosine 0, below threshold
    const ranked = hybridRank({
      entries: [near, far],
      queryEmbedding,
      queryText: "France",
      threshold: 0.5,
      relevanceWeight: 0.7,
      recencyWeight: 0.3,
      limit: 10,
    });
    expect(ranked.map((e) => e.id)).toEqual(["near"]);
  });

  it("without query text falls back to the classic dense blend", () => {
    const a = entry("A", "alpha", [0.99, 0.14, 0]);
    const b = entry("B", "beta", [0.72, 0.69, 0]);
    const ranked = hybridRank({
      entries: [a, b],
      queryEmbedding,
      queryText: undefined,
      threshold: 0.5,
      relevanceWeight: 0.7,
      recencyWeight: 0.3,
      limit: 10,
    });
    expect(ranked.map((e) => e.id)).toEqual(["A", "B"]);
    expect(ranked[0]?.relevanceScore).toBeGreaterThan(0);
  });
});
