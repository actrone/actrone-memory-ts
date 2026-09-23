import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_RELEVANCE_THRESHOLD, resolveConfig, resolveRelevanceThreshold } from "../src/config.js";
import {
  type Embedder,
  LEXICAL_FALLBACK_WARNING_CODE,
  LEXICAL_RELEVANCE_THRESHOLD,
  LocalEmbedder,
  buildLocalEmbedder,
  resetLexicalFallbackWarningForTests,
} from "../src/embedder.js";
import { MemoryManager } from "../src/manager.js";

/** A custom embedder that reuses the lexical vectors, with or without a declared threshold. */
function customEmbedder(relevanceThreshold?: number): Embedder {
  const inner = new LocalEmbedder();
  return {
    dimensions: inner.dimensions,
    ...(relevanceThreshold !== undefined ? { relevanceThreshold } : {}),
    embed: (text) => inner.embed(text),
  };
}

describe("resolveRelevanceThreshold", () => {
  it.each([
    ["an explicit config value wins over the embedder", 0.5, 0.63, 0.5],
    ["the embedder's calibrated value applies when config is unset", undefined, 0.63, 0.63],
    ["the library default applies when neither is set", undefined, undefined, DEFAULT_RELEVANCE_THRESHOLD],
    ["an explicit 0 is honoured, not treated as unset", 0, 0.63, 0],
  ])("%s", (_label, configured, declared, expected) => {
    const config = resolveConfig(configured === undefined ? {} : { relevanceThreshold: configured });
    const embedder = declared === undefined ? {} : { relevanceThreshold: declared };
    expect(resolveRelevanceThreshold(config, embedder)).toBe(expected);
  });

  it("leaves relevanceThreshold unset by default and accepts an explicit undefined", () => {
    expect(resolveConfig().relevanceThreshold).toBeUndefined();
    expect(resolveConfig({ relevanceThreshold: undefined }).relevanceThreshold).toBeUndefined();
  });
});

describe("MemoryManager.relevanceThreshold", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetLexicalFallbackWarningForTests();
    warn = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it("uses the lexical calibration when fastembed is not installed", async () => {
    const mm = await MemoryManager.create();
    expect(mm.relevanceThreshold).toBe(LEXICAL_RELEVANCE_THRESHOLD);
  });

  it("uses an explicit config value over the embedder's", async () => {
    const mm = await MemoryManager.create({ config: { relevanceThreshold: 0.55 } });
    expect(mm.relevanceThreshold).toBe(0.55);
  });

  it("uses a custom embedder's declared threshold", async () => {
    const mm = await MemoryManager.create({ embedder: customEmbedder(0.42) });
    expect(mm.relevanceThreshold).toBe(0.42);
  });

  it("falls back to the library default for a custom embedder that declares none", async () => {
    const mm = await MemoryManager.create({ embedder: customEmbedder() });
    expect(mm.relevanceThreshold).toBe(DEFAULT_RELEVANCE_THRESHOLD);
  });
});

describe("buildLocalEmbedder without fastembed", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetLexicalFallbackWarningForTests();
    warn = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it("falls back to the lexical embedder and says why, once per process", async () => {
    const first = await buildLocalEmbedder();
    const second = await buildLocalEmbedder();
    expect(first).toBeInstanceOf(LocalEmbedder);
    expect(second).toBeInstanceOf(LocalEmbedder);
    expect(warn).toHaveBeenCalledTimes(1);
    const [message, options] = warn.mock.calls[0] as [string, { code: string }];
    expect(options.code).toBe(LEXICAL_FALLBACK_WARNING_CODE);
    expect(message).toMatch(/shared keywords only/);
    expect(message).toMatch(/npm install fastembed/);
  });

  it("does not warn when the caller chooses the lexical embedder explicitly", async () => {
    await MemoryManager.create({ embedder: new LocalEmbedder() });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("README quickstart", () => {
  // The exact calls the README shows. If the README changes, this must change with it.
  const QUERY = "Which plan is the customer on?";

  beforeEach(() => resetLexicalFallbackWarningForTests());

  it("still shows the calls this test runs", () => {
    const readme = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");
    expect(readme).toContain(`mm.retrieveContext("support-bot", "sess-1", "${QUERY}", 4096)`);
    expect(readme).toContain(`mm.injectMemory("support-bot", "The customer is on the Enterprise plan.", 0.9)`);
  });

  it("recalls the injected fact with the zero-install default, as its comments claim", async () => {
    const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
    try {
      const mm = await MemoryManager.create();
      await mm.storeTurn("support-bot", "sess-1", "What's your refund policy?", "Within 5 days.");
      await mm.injectMemory("support-bot", "The customer is on the Enterprise plan.", 0.9);

      const ctx = await mm.retrieveContext("support-bot", "sess-1", QUERY, 4096);
      expect(ctx.recentTurns).toHaveLength(1);
      expect(ctx.episodicMemories.map((m) => m.content)).toEqual(["The customer is on the Enterprise plan."]);

      // And an unrelated question does not drag the fact in.
      const unrelated = await mm.retrieveContext("support-bot", "sess-1", "How long is shipping to Kenya?", 4096);
      expect(unrelated.episodicMemories).toHaveLength(0);
    } finally {
      warn.mockRestore();
    }
  });
});
