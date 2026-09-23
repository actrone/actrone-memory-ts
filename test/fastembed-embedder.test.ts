import { homedir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BGE_SMALL_RELEVANCE_THRESHOLD,
  DEFAULT_FASTEMBED_MODEL,
  FastEmbedEmbedder,
  type FastEmbedModule,
  setFastEmbedLoaderForTests,
} from "../src/embedder.js";
import { MemoryManager } from "../src/manager.js";
import { FASTEMBED_MISSING } from "./setup.js";

// A stand-in for the optional `fastembed` peer, which the test suite does not install: it records
// how the library calls it and returns a fixed vector, so the suite stays offline.
const state = {
  initCalls: [] as Array<{ model?: string; cacheDir?: string }>,
  embedded: [] as string[],
  queryEmbedCalls: 0,
};
const fakeModel = {
  async *embed(texts: string[]) {
    state.embedded.push(...texts);
    yield texts.map(() => Float32Array.from([0.6, 0.8, 0]));
  },
  // Present, like the real FlagEmbedding, so a test can prove the library does not call it.
  async queryEmbed(): Promise<number[]> {
    state.queryEmbedCalls += 1;
    return [1, 0, 0];
  },
};
const fakeFastEmbed: FastEmbedModule = {
  FlagEmbedding: {
    async init(options) {
      state.initCalls.push(options);
      return fakeModel;
    },
  },
};

describe("FastEmbedEmbedder", () => {
  const savedCachePath = process.env["FASTEMBED_CACHE_PATH"];
  beforeEach(() => {
    state.initCalls.length = 0;
    state.embedded.length = 0;
    state.queryEmbedCalls = 0;
    delete process.env["FASTEMBED_CACHE_PATH"];
    setFastEmbedLoaderForTests(async () => fakeFastEmbed);
  });
  afterEach(() => {
    setFastEmbedLoaderForTests(FASTEMBED_MISSING);
    if (savedCachePath === undefined) delete process.env["FASTEMBED_CACHE_PATH"];
    else process.env["FASTEMBED_CACHE_PATH"] = savedCachePath;
  });

  it("loads bge-small-en-v1.5 by default, the model the Python library uses", async () => {
    await FastEmbedEmbedder.create();
    expect(DEFAULT_FASTEMBED_MODEL).toBe("fast-bge-small-en-v1.5");
    expect(state.initCalls[0]?.model).toBe(DEFAULT_FASTEMBED_MODEL);
  });

  it("caches the model per user, never in the current directory", async () => {
    await FastEmbedEmbedder.create();
    expect(state.initCalls[0]?.cacheDir).toBe(join(homedir(), ".cache", "actrone-memory", "fastembed"));
  });

  it("honours FASTEMBED_CACHE_PATH, then an explicit cacheDir", async () => {
    process.env["FASTEMBED_CACHE_PATH"] = "/models/fastembed";
    await FastEmbedEmbedder.create();
    await FastEmbedEmbedder.create({ cacheDir: "/explicit" });
    expect(state.initCalls.map((call) => call.cacheDir)).toEqual(["/models/fastembed", "/explicit"]);
  });

  it("embeds text as given, without the query prefix, so scores match the Python library", async () => {
    const embedder = await FastEmbedEmbedder.create();
    const vector = await embedder.embed("The user is allergic to peanuts.");
    expect(vector).toHaveLength(3);
    expect(vector[0]).toBeCloseTo(0.6);
    expect(state.embedded).toContain("The user is allergic to peanuts.");
    expect(state.embedded.some((text) => text.startsWith("query: "))).toBe(false);
    expect(state.queryEmbedCalls).toBe(0);
  });

  it("declares the calibrated threshold for the default model only", async () => {
    expect((await FastEmbedEmbedder.create()).relevanceThreshold).toBe(BGE_SMALL_RELEVANCE_THRESHOLD);
    expect((await FastEmbedEmbedder.create({ modelName: "fast-bge-base-en-v1.5" })).relevanceThreshold).toBeUndefined();
  });

  it("is what MemoryManager.create() uses when fastembed is installed", async () => {
    const mm = await MemoryManager.create();
    expect(state.initCalls).toHaveLength(1);
    expect(mm.relevanceThreshold).toBe(BGE_SMALL_RELEVANCE_THRESHOLD);
  });
});
