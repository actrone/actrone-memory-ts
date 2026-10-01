import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  type ChatCompleterLike,
  ConfigurationError,
  EXTRACTION_RESPONSE_SCHEMA,
  EXTRACTION_SPEC_VERSION,
  EXTRACTION_SYSTEM_PROMPT,
  type ExtractedFact,
  type FactExtractor,
  MemoryManager,
  OpenAIFactExtractor,
  formatExtractionInput,
  parseFacts,
} from "../src/index.js";

const ONE_FACT =
  '{"facts": [{"content": "The user\'s name is Alex.", "sensitivity": "pii", "topic_tags": ["identity"], "importance": 0.8}]}';

/** What the openai SDK throws when a server refuses a request (a 4xx status). */
class Rejected extends Error {
  constructor(readonly status: number) {
    super(`status ${status}`);
  }
}

type Request = Parameters<ChatCompleterLike["chat"]["completions"]["create"]>[0];

/** A fake OpenAI-compatible client that replays scripted replies and records every request. */
function fakeClient(replies: Array<string | Error>): { client: ChatCompleterLike; requests: Request[] } {
  const requests: Request[] = [];
  const client: ChatCompleterLike = {
    chat: {
      completions: {
        async create(args) {
          requests.push(args);
          const reply = replies.shift();
          if (reply instanceof Error) throw reply;
          return { choices: [{ message: { content: reply ?? "{}" } }] };
        },
      },
    },
  };
  return { client, requests };
}

describe("OpenAIFactExtractor (any OpenAI-compatible client)", () => {
  it("frames the conversation per the spec", () => {
    const framed = formatExtractionInput("User: hi\nAssistant: hello");
    expect(framed.startsWith("Conversation:\n\nUser: hi\nAssistant: hello")).toBe(true);
    expect(framed.endsWith("Extract the durable facts from this conversation.")).toBe(true);
  });

  it("sends the spec request with a JSON schema", async () => {
    const { client, requests } = fakeClient([ONE_FACT]);
    const facts = await new OpenAIFactExtractor(client, "small-local-model").extract("User: I'm Alex.\nAssistant: Hi Alex!");

    expect(facts.map((f) => [f.content, f.sensitivity])).toEqual([["The user's name is Alex.", "pii"]]);
    const request = requests[0]!;
    expect(request.model).toBe("small-local-model");
    expect(request.messages[0]).toEqual({ role: "system", content: EXTRACTION_SYSTEM_PROMPT });
    expect(request.messages[1]?.content).toBe(formatExtractionInput("User: I'm Alex.\nAssistant: Hi Alex!"));
    expect(request.response_format?.type).toBe("json_schema");
    expect(request.response_format?.type === "json_schema" && request.response_format.json_schema.schema).toBe(
      EXTRACTION_RESPONSE_SCHEMA,
    );
  });

  it("falls back to JSON mode for good when a server rejects the schema", async () => {
    const { client, requests } = fakeClient([new Rejected(400), ONE_FACT, ONE_FACT]);
    const extractor = new OpenAIFactExtractor(client, "m");

    expect(await extractor.extract("User: I'm Alex.")).toHaveLength(1);
    expect(await extractor.extract("User: I'm Alex.")).toHaveLength(1);
    expect(requests.map((r) => r.response_format?.type)).toEqual(["json_schema", "json_object", "json_object"]);
  });

  it("keeps the schema after a transient error", async () => {
    const { client, requests } = fakeClient([new Rejected(503), ONE_FACT]);
    const extractor = new OpenAIFactExtractor(client, "m");

    expect(await extractor.extract("User: I'm Alex.")).toEqual([]);
    expect(await extractor.extract("User: I'm Alex.")).toHaveLength(1);
    expect(requests.map((r) => r.response_format?.type)).toEqual(["json_schema", "json_schema"]);
  });

  it("returns nothing when both formats fail", async () => {
    const { client } = fakeClient([new Rejected(400), new Rejected(400)]);
    expect(await new OpenAIFactExtractor(client, "m").extract("User: I'm Alex.")).toEqual([]);
  });
});

/** Deterministic extractor for tests: no LLM. */
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
    expect(EXTRACTION_SPEC_VERSION).toBe("1.1");
  });

  it("uses the shared spec's prompt, byte for byte", () => {
    // The same hash is pinned in actrone-memory-py and in the spec doc (extraction.v1.md), so a prompt
    // edit in one library fails here until the other library and the spec catch up.
    const digest = createHash("sha256").update(EXTRACTION_SYSTEM_PROMPT, "utf8").digest("hex");
    expect(digest).toBe("c25f946a45428b327a6983f8d5e7f8052a06736ac6cb1795824fb3e564593b09");
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
