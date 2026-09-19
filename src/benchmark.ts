import { MemoryManager } from "./manager.js";
import type { Sensitivity } from "./models.js";

/**
 * Shipped memory-quality benchmark + eval harness, the TS counterpart of the
 * Python `actrone_memory.benchmark`, over the **same** LongMemEval-style dataset.
 * Runs offline (in-memory store + local embedder), so memory quality is a
 * measurable, CI-gated property in both libs (the "one shared eval" decision).
 *
 * Honest by construction: default scores reflect the dependency-free
 * `LocalEmbedder` (keyword overlap). Pass a real embedder via `runEval({manager})`
 * to measure semantic recall.
 */

export interface MemoryItem {
  readonly id: string;
  readonly content: string;
  readonly sensitivity?: Sensitivity;
}

export interface EvalQuery {
  readonly text: string;
  readonly relevantIds: readonly string[];
}

export interface EvalCase {
  readonly name: string;
  readonly agentId: string;
  readonly memories: readonly MemoryItem[];
  readonly queries: readonly EvalQuery[];
}

export interface EvalReport {
  readonly k: number;
  readonly nQueries: number;
  readonly recallAtK: number;
  readonly precisionAtK: number;
  readonly mrr: number;
  formatTable(): string;
}

/** The bundled dataset (mirrors the Python lib for cross-language coherence). */
export const DEFAULT_DATASET: readonly EvalCase[] = [
  {
    name: "personal_assistant",
    agentId: "assistant",
    memories: [
      { id: "a1", content: "The user's name is Alex Rivera.", sensitivity: "pii" },
      { id: "a2", content: "The user lives in Cape Town, South Africa.", sensitivity: "pii" },
      { id: "a3", content: "The user is allergic to penicillin.", sensitivity: "sensitive" },
      { id: "a4", content: "The user prefers concise answers with no preamble.", sensitivity: "low" },
      { id: "a5", content: "The user is building a crypto trading bot.", sensitivity: "low" },
      { id: "a6", content: "The user's preferred programming language is Rust.", sensitivity: "low" },
      { id: "a8", content: "The user's daughter Maya is six years old.", sensitivity: "pii" },
    ],
    queries: [
      { text: "what is the user's name", relevantIds: ["a1"] },
      { text: "where does the user live city country", relevantIds: ["a2"] },
      { text: "does the user have any drug allergies penicillin", relevantIds: ["a3"] },
      { text: "how does the user prefer answers concise", relevantIds: ["a4"] },
      { text: "what project is the user building crypto trading bot", relevantIds: ["a5"] },
      { text: "preferred programming language Rust", relevantIds: ["a6"] },
      { text: "the user's daughter Maya age", relevantIds: ["a8"] },
    ],
  },
  {
    name: "support_agent",
    agentId: "support-bot",
    memories: [
      { id: "s1", content: "Refunds are processed within five business days." },
      { id: "s2", content: "The premium plan costs ninety nine dollars per month." },
      { id: "s3", content: "Password resets are sent to the account email address." },
      { id: "s4", content: "The API rate limit is one thousand requests per minute." },
      { id: "s6", content: "Data is stored in the EU region for European customers." },
      { id: "s7", content: "The free trial lasts fourteen days with no credit card required." },
      { id: "s8", content: "Invoices can be downloaded from the billing settings page." },
    ],
    queries: [
      { text: "how long do refunds take business days", relevantIds: ["s1"] },
      { text: "premium plan price per month cost", relevantIds: ["s2"] },
      { text: "how do password resets work account email", relevantIds: ["s3"] },
      { text: "what is the API rate limit requests per minute", relevantIds: ["s4"] },
      { text: "where is data stored EU region European", relevantIds: ["s6"] },
      { text: "free trial length days credit card", relevantIds: ["s7"] },
      { text: "where to download invoices billing settings", relevantIds: ["s8"] },
    ],
  },
];

/** Run the eval and return aggregated recall@k / precision@k / MRR. */
export async function runEval(
  options: { cases?: readonly EvalCase[]; manager?: MemoryManager; k?: number } = {},
): Promise<EvalReport> {
  const cases = options.cases ?? DEFAULT_DATASET;
  const k = options.k ?? 5;
  const manager =
    options.manager ?? (await MemoryManager.create({ config: { relevanceThreshold: 0.05 } }));

  let recallSum = 0;
  let precisionSum = 0;
  let rrSum = 0;
  let nQueries = 0;

  for (const c of cases) {
    const idMap = new Map<string, string>();
    for (const m of c.memories) {
      const stored = await manager.injectMemory(
        c.agentId,
        m.content,
        0.8,
        "injected",
        [],
        "imported",
        m.sensitivity ?? "none",
      );
      idMap.set(m.id, stored);
    }
    for (const q of c.queries) {
      const relevant = new Set(q.relevantIds.map((d) => idMap.get(d)).filter((x): x is string => !!x));
      const hits = await manager.searchMemories(c.agentId, q.text, k);
      const retrieved = hits.slice(0, k).map((h) => h.id);
      const hitCount = retrieved.filter((id) => relevant.has(id)).length;
      recallSum += relevant.size > 0 ? hitCount / relevant.size : 0;
      precisionSum += k > 0 ? hitCount / k : 0;
      const rank = retrieved.findIndex((id) => relevant.has(id));
      rrSum += rank >= 0 ? 1 / (rank + 1) : 0;
      nQueries += 1;
    }
  }

  const recallAtK = nQueries ? recallSum / nQueries : 0;
  const precisionAtK = nQueries ? precisionSum / nQueries : 0;
  const mrr = nQueries ? rrSum / nQueries : 0;
  return {
    k,
    nQueries,
    recallAtK,
    precisionAtK,
    mrr,
    formatTable(): string {
      return (
        `| metric | value |\n| --- | --- |\n` +
        `| queries | ${nQueries} |\n` +
        `| recall@${k} | ${recallAtK.toFixed(3)} |\n` +
        `| precision@${k} | ${precisionAtK.toFixed(3)} |\n` +
        `| MRR | ${mrr.toFixed(3)} |`
      );
    },
  };
}
