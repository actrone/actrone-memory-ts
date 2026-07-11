import { describe, expect, it } from "vitest";

import { DEFAULT_DATASET, MemoryManager, runEval } from "../src/index.js";

/**
 * Memory-quality regression gate. Measured recall@5 ≈ 0.93 with the default local
 * embedder; floors sit below with margin so genuine ranking regressions fail CI
 * while noise does not. Mirrors the Python `test_benchmark.py` gate.
 */
const MIN_RECALL_AT_5 = 0.85;
const MIN_MRR = 0.8;

describe("memory quality benchmark", () => {
  it("meets the recall/MRR floor on the default dataset", async () => {
    const report = await runEval();
    const expectedQueries = DEFAULT_DATASET.reduce((s, c) => s + c.queries.length, 0);
    expect(report.nQueries).toBe(expectedQueries);
    expect(report.recallAtK, report.formatTable()).toBeGreaterThanOrEqual(MIN_RECALL_AT_5);
    expect(report.mrr, report.formatTable()).toBeGreaterThanOrEqual(MIN_MRR);
    expect(report.precisionAtK).toBeGreaterThanOrEqual(0);
    expect(report.precisionAtK).toBeLessThanOrEqual(1);
  });

  it("accepts a provided manager and reports a formatted table", async () => {
    const mm = await MemoryManager.create({ config: { relevanceThreshold: 0.05 } });
    const report = await runEval({ manager: mm });
    expect(report.nQueries).toBeGreaterThan(0);
    expect(report.formatTable()).toContain("recall@5");
  });

  it("scores a perfect single-case run at recall/MRR = 1", async () => {
    const report = await runEval({
      cases: [
        {
          name: "hit",
          agentId: "ag",
          memories: [{ id: "m1", content: "the sky is blue today" }],
          queries: [{ text: "the sky is blue today", relevantIds: ["m1"] }],
        },
      ],
    });
    expect(report.recallAtK).toBe(1);
    expect(report.mrr).toBe(1);
  });
});
