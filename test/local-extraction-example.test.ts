/**
 * Runs examples/local-extraction.ts (what the docs page shows) against a stand-in OpenAI-compatible
 * server, the API Ollama, vLLM and LM Studio serve, and asserts what the page claims: a session's turns
 * become stored facts, extracted with the shared spec's request. Mirrors the Python library's
 * tests/unit/test_local_extraction_example.py.
 *
 * Runs with the default keyword embedder (test/setup.ts pins fastembed as absent).
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EXTRACTION_RESPONSE_SCHEMA, formatExtractionInput } from "../src/index.js";
import { learnFromSession, memoryWithLocalExtraction } from "../examples/local-extraction.js";

const FACT = "The escalation codeword for the payments team is PELICAN-42.";

interface Recorded {
  path: string | undefined;
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    response_format: { type: string; json_schema?: { schema: unknown } };
  };
}

describe("docs example: fact extraction on a local model", () => {
  let server: Server;
  let baseURL: string;
  const requests: Recorded[] = [];

  beforeEach(async () => {
    requests.length = 0;
    // Answers every POST like an OpenAI-compatible chat-completions endpoint.
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk: Buffer) => (raw += chunk.toString()));
      req.on("end", () => {
        requests.push({ path: req.url, body: JSON.parse(raw) as Recorded["body"] });
        const facts = { facts: [{ content: FACT, sensitivity: "none", topic_tags: [], importance: 0.8 }] };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "c1",
            object: "chat.completion",
            created: 0,
            model: "m",
            choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(facts) } }],
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("turns a session into stored facts through the configured server", async () => {
    const user = "Please remember: the escalation codeword for the payments team is PELICAN-42.";
    const memory = await memoryWithLocalExtraction(baseURL);
    await memory.storeTurn("support-bot", "s1", user, "Noted.");

    const stored = await learnFromSession(memory, "support-bot", "s1");

    expect(stored).toHaveLength(1);
    const found = await memory.searchMemories("support-bot", "payments escalation codeword");
    expect(found.some((m) => m.content === FACT && m.source === "extracted")).toBe(true);

    // One request, to the configured server, carrying the shared extraction spec.
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.path).toBe("/v1/chat/completions");
    expect(request?.body.model).toBe("qwen2.5:3b");
    expect(request?.body.messages[1]?.content).toBe(formatExtractionInput(`User: ${user}\nAssistant: Noted.`));
    expect(request?.body.response_format.json_schema?.schema).toEqual(EXTRACTION_RESPONSE_SCHEMA);
    await memory.close();
  });
});
