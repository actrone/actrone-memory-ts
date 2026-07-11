import { describe, expect, it } from "vitest";

import {
  ConfigurationError,
  EXTRACTION_SPEC_VERSION,
  type ExtractedFact,
  type FactExtractor,
  MemoryManager,
  parseFacts,
} from "../src/index.js";

/** Deterministic extractor for tests — no LLM. */
class FakeExtractor implements FactExtractor {
  calls = 0;
  constructor(private readonly facts: ExtractedFact[]) {}
  async extract(): Promise<ExtractedFact[]> {
    this.calls += 1;
    return this.facts;
  }
}

describe("parseFacts (shared spec v1)", () => {
  it("pins the spec version", () => {
    expect(EXTRACTION_SPEC_VERSION).toBe("1.0");
  });

  it("parses a facts envelope with provenance", () => {
    const facts = parseFacts(
      '{"facts": [{"content": "User is named Alex.", "sensitivity": "pii", "importance": 0.9}]}',
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]?.content).toBe("User is named Alex.");
    expect(facts[0]?.sensitivity).toBe("pii");
    expect(facts[0]?.importance).toBe(0.9);
  });

  it("parses a bare list and applies defaults", () => {
    const facts = parseFacts('[{"content": "User prefers email."}]');
    expect(facts[0]?.sensitivity).toBe("none");
    expect(facts[0]?.importance).toBe(0.6);
  });

  it("returns [] on invalid JSON or non-list", () => {
    expect(parseFacts("not json")).toEqual([]);
    expect(parseFacts('{"facts": "oops"}')).toEqual([]);
  });

  it("skips malformed entries and bad sensitivity, keeps valid ones", () => {
    const facts = parseFacts(
      '{"facts": [{"content": ""}, "string", {"content": "bad", "sensitivity": "nope"}, {"content": "Good."}]}',
    );
    expect(facts.map((f) => f.content)).toEqual(["Good."]);
  });

  it("clamps content length and caps the count", () => {
    const long = "x".repeat(5000);
    const many = Array.from({ length: 30 }, (_, i) => `{"content": "fact ${i}"}`).join(",");
    const facts = parseFacts(`{"facts": [{"content": "${long}"}, ${many}]}`);
    expect(facts.length).toBeLessThanOrEqual(20);
    expect((facts[0]?.content.length ?? 0)).toBeLessThanOrEqual(2000);
  });

  it("accepts topic_tags (snake) and topicTags (camel)", () => {
    const snake = parseFacts('[{"content": "a", "topic_tags": ["x", 3, "y"]}]');
    expect(snake[0]?.topicTags).toEqual(["x", "y"]);
    const camel = parseFacts('[{"content": "b", "topicTags": ["z"]}]');
    expect(camel[0]?.topicTags).toEqual(["z"]);
  });
});

describe("MemoryManager.extractMemories", () => {
  it("throws when no extractor is configured", async () => {
    const mm = await MemoryManager.create({ config: { relevanceThreshold: 0.05 } });
    await expect(mm.extractMemories("a1", "s1")).rejects.toBeInstanceOf(ConfigurationError);
  });

  it("stores extracted facts with provenance and finds them", async () => {
    const extractor = new FakeExtractor([
      { content: "User email is alex@example.com.", sensitivity: "pii", topicTags: [], importance: 0.9 },
      { content: "User prefers concise answers.", sensitivity: "low", topicTags: ["style"], importance: 0.6 },
    ]);
    const mm = await MemoryManager.create({ config: { relevanceThreshold: 0.05 }, extractor });

    await mm.storeTurn("a1", "s1", "I'm Alex, email alex@example.com", "Noted.");
    const ids = await mm.extractMemories("a1", "s1");
    expect(ids).toHaveLength(2);
    expect(extractor.calls).toBe(1);

    const hits = await mm.searchMemories("a1", "user email alex example concise answers", 10);
    const facts = hits.filter((h) => h.contentType === "fact");
    expect(facts.length).toBeGreaterThanOrEqual(1);
    expect(facts.every((f) => f.source === "extracted")).toBe(true);
  });

  it("returns [] when there are no turns to mine", async () => {
    const extractor = new FakeExtractor([
      { content: "ignored", sensitivity: "none", topicTags: [], importance: 0.6 },
    ]);
    const mm = await MemoryManager.create({ config: { relevanceThreshold: 0.05 }, extractor });
    expect(await mm.extractMemories("a1", "empty")).toEqual([]);
  });
});
