import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, resolveConfig } from "../src/config.js";
import { ConfigurationError } from "../src/errors.js";
import { MemoryManager } from "../src/manager.js";

describe("resolveConfig", () => {
  it("returns the defaults when given no overrides", () => {
    expect(resolveConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("merges partial overrides over the defaults", () => {
    const config = resolveConfig({ relevanceThreshold: 0.5, maxEpisodicMemories: 3 });
    expect(config.relevanceThreshold).toBe(0.5);
    expect(config.maxEpisodicMemories).toBe(3);
    expect(config.maxSessionTurns).toBe(DEFAULT_CONFIG.maxSessionTurns);
  });

  it.each([
    ["relevanceThreshold above 1 would recall nothing", { relevanceThreshold: 5 }],
    ["negative relevanceThreshold", { relevanceThreshold: -0.1 }],
    ["negative budget fraction", { budgetFractionSession: -1 }],
    ["relevanceWeight above 1", { relevanceWeight: 1.5 }],
    ["recencyWeight above 1", { recencyWeight: 2 }],
    ["zero maxEpisodicMemories", { maxEpisodicMemories: 0 }],
    ["zero maxSessionTurns", { maxSessionTurns: 0 }],
    ["zero rerankTopK", { rerankTopK: 0 }],
    ["fractional maxSessionTurns", { maxSessionTurns: 1.5 }],
    ["NaN threshold", { relevanceThreshold: Number.NaN }],
    ["Infinity threshold", { relevanceThreshold: Number.POSITIVE_INFINITY }],
  ])("rejects %s", (_label, override) => {
    expect(() => resolveConfig(override)).toThrow(ConfigurationError);
  });

  it("rejects budget fractions that together exceed the whole budget", () => {
    expect(() =>
      resolveConfig({ budgetFractionEpisodic: 0.7, budgetFractionSession: 0.6 }),
    ).toThrow(ConfigurationError);
  });

  it("allows budget fractions that exactly consume the budget", () => {
    const config = resolveConfig({ budgetFractionEpisodic: 0.5, budgetFractionSession: 0.5 });
    expect(config.budgetFractionEpisodic + config.budgetFractionSession).toBe(1);
  });

  it("rejects a non-function tokenCounter", () => {
    expect(() =>
      resolveConfig({ tokenCounter: "nope" as unknown as typeof DEFAULT_CONFIG.tokenCounter }),
    ).toThrow(ConfigurationError);
  });

  it("surfaces an invalid config from MemoryManager.create", async () => {
    await expect(MemoryManager.create({ config: { relevanceThreshold: 9 } })).rejects.toThrow(
      ConfigurationError,
    );
  });
});
