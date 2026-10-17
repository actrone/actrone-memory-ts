import { describe, expect, it } from "vitest";

import {
  ConfigurationError,
  type Embedder,
  type MemoryEntry,
  MemoryManager,
  redactedContent,
  type Sensitivity,
  SENSITIVITIES,
  ValidationError,
} from "../src/index.js";
import { redactMemories, resolveRedaction } from "../src/redaction.js";

/** Every text gets the same vector, so every memory is admitted whatever the query says. */
const constantEmbedder: Embedder = {
  dimensions: 4,
  embed: async () => [0.1, 0.2, 0.3, 0.4],
  embedBatch: async (texts: readonly string[]) => texts.map(() => [0.1, 0.2, 0.3, 0.4]),
} as Embedder;

function entry(content: string, sensitivity: Sensitivity): MemoryEntry {
  return {
    id: `id-${content}`,
    agentId: "a1",
    sessionId: "s1",
    content,
    contentType: "fact",
    embedding: [0.1, 0.2],
    importanceScore: 0.5,
    topicTags: [],
    tokenCount: 99,
    timestamp: new Date(0).toISOString(),
    sourceTurnIds: [],
    source: "injected",
    sensitivity,
  };
}

const count = (text: string): number => text.length;

describe("resolveRedaction", () => {
  it.each([
    [[], []],
    [["pii"], ["pii"]],
    [["pii", "sensitive", "pii"], ["pii", "sensitive"]],
    [[...SENSITIVITIES], [...SENSITIVITIES]],
  ])("accepts %j", (given, expected) => {
    expect([...resolveRedaction(given)].sort()).toEqual([...expected].sort());
  });

  it.each([
    [["PII"], "unknown sensitivity 'PII'"],
    [["pii", "secret"], "unknown sensitivity 'secret'"],
  ])("rejects %j", (given, message) => {
    expect(() => resolveRedaction(given)).toThrow(message);
  });

  it("rejects a single string", () => {
    expect(() => resolveRedaction("pii" as unknown as string[])).toThrow(ValidationError);
  });
});

describe("redactMemories", () => {
  const entries = [
    entry("plain fact", "none"),
    entry("jane@example.com", "pii"),
    entry("has asthma", "sensitive"),
  ];

  it.each([
    [[], ["plain fact", "jane@example.com", "has asthma"]],
    [["pii"], ["plain fact", "[redacted: pii]", "has asthma"]],
    [["pii", "sensitive"], ["plain fact", "[redacted: pii]", "[redacted: sensitive]"]],
  ] as const)("with %j masks only those classes", (classes, contents) => {
    const masked = redactMemories(entries, new Set<Sensitivity>(classes), count);
    expect(masked.map((m) => m.content)).toEqual(contents);
  });

  it("keeps a masked memory's identity, drops its vector and leaves the original alone", () => {
    const original = entry("jane@example.com", "pii");
    const [masked] = redactMemories([original], new Set<Sensitivity>(["pii"]), count);

    expect(masked?.id).toBe(original.id);
    expect(masked?.sensitivity).toBe("pii");
    expect(masked?.source).toBe(original.source);
    expect(masked && "embedding" in masked).toBe(false);
    expect(masked?.tokenCount).toBe(redactedContent("pii").length);
    expect(original.content).toBe("jane@example.com");
    expect(original.embedding).toEqual([0.1, 0.2]);
  });

  it("returns the same array when there is nothing to mask", () => {
    expect(redactMemories(entries, new Set(), count)).toBe(entries);
  });
});

async function manager(redactSensitivities?: readonly Sensitivity[]): Promise<MemoryManager> {
  const mm = await MemoryManager.create({
    embedder: constantEmbedder,
    config: {
      relevanceThreshold: 0.01,
      ...(redactSensitivities ? { redactSensitivities } : {}),
    },
  });
  await mm.storeTurn("a1", "s1", "my email is jane@example.com", "noted");
  await mm.injectMemory("a1", "prefers concise answers", 0.8, "injected", [], "injected", "low");
  await mm.injectMemory("a1", "email is jane@example.com", 0.8, "injected", [], "injected", "pii");
  await mm.injectMemory("a1", "has a peanut allergy", 0.8, "injected", [], "injected", "sensitive");
  return mm;
}

const contents = (memories: readonly MemoryEntry[]): Set<string> =>
  new Set(memories.map((m) => m.content));

describe("MemoryManager redaction on read", () => {
  it("redacts retrieveContext on request and never masks turns", async () => {
    const mm = await manager();
    const ctx = await mm.retrieveContext("a1", "s1", "email", 4000, {
      redact: ["pii", "sensitive"],
    });

    expect(contents(ctx.episodicMemories)).toEqual(
      new Set(["prefers concise answers", "[redacted: pii]", "[redacted: sensitive]"]),
    );
    expect(ctx.recentTurns[0]?.userMessage).toContain("jane@example.com");
    await mm.close();
  });

  it("applies the config default to both read paths", async () => {
    const mm = await manager(["pii"]);
    const ctx = await mm.retrieveContext("a1", "s1", "email", 4000);
    const found = await mm.searchMemories("a1", "email");

    for (const memories of [ctx.episodicMemories, found]) {
      expect(contents(memories).has("[redacted: pii]")).toBe(true);
      expect(contents(memories).has("email is jane@example.com")).toBe(false);
      expect(contents(memories).has("has a peanut allergy")).toBe(true);
    }
    await mm.close();
  });

  it("turns redaction off for one call with an empty array", async () => {
    const mm = await manager(["pii", "sensitive"]);
    const found = await mm.searchMemories("a1", "email", 10, { redact: [] });

    expect(contents(found).has("email is jane@example.com")).toBe(true);
    await mm.close();
  });

  it("never changes what is stored", async () => {
    const mm = await manager();
    await mm.retrieveContext("a1", "s1", "email", 4000, { redact: ["pii"] });
    const found = await mm.searchMemories("a1", "email");

    expect(contents(found).has("email is jane@example.com")).toBe(true);
    await mm.close();
  });

  it("rejects an unknown class before any read", async () => {
    const mm = await manager();
    const bad = { redact: ["PII"] as unknown as Sensitivity[] };

    await expect(mm.retrieveContext("a1", "s1", "email", 4000, bad)).rejects.toThrow(
      "unknown sensitivity 'PII'",
    );
    await expect(mm.searchMemories("a1", "email", 10, bad)).rejects.toThrow(
      "unknown sensitivity 'PII'",
    );
    await mm.close();
  });

  it("rejects an unknown class in the config", async () => {
    await expect(
      MemoryManager.create({
        config: { redactSensitivities: ["secret"] as unknown as Sensitivity[] },
      }),
    ).rejects.toThrow(ConfigurationError);
  });
});

describe("adapters inherit the redaction default", () => {
  it("masks tagged memories in the recall() prompt string", async () => {
    const { recall } = await import("../src/adapters.js");
    const mm = await MemoryManager.create({
      embedder: constantEmbedder,
      config: { relevanceThreshold: 0.01, redactSensitivities: ["pii"] },
    });
    await mm.storeTurn("a1", "s1", "what is on file?", "let me check");
    await mm.injectMemory("a1", "email is jane@example.com", 0.8, "injected", [], "injected", "pii");

    const { systemPrompt } = await recall(mm, {
      agentId: "a1",
      sessionId: "s1",
      query: "email",
      tokenBudget: 4000,
    });

    expect(systemPrompt).toContain("[redacted: pii]");
    expect(systemPrompt).not.toContain("jane@example.com");
    await mm.close();
  });
});
