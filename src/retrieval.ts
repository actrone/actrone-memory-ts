/**
 * Hybrid retrieval: dense + lexical + recency fused with Reciprocal Rank Fusion.
 *
 * A single ranking channel (embedding cosine) under-recalls with a weak default embedder and misses
 * exact-keyword matches even with a strong one. Reciprocal Rank Fusion (RRF) combines several
 * rankings without needing their scores on the same scale, the standard, parameter-light way to do
 * hybrid (dense + lexical) retrieval. Pure and dependency-free (BM25 implemented here, no external
 * index), and re-ranks *within* the dense-threshold-admitted set, so the "only sufficiently-relevant
 * memories are returned" contract is unchanged. Mirrors the Python `actrone_memory.retrieval`.
 */

import { cosineSimilarity } from "./embedder.js";
import type { MemoryEntry } from "./models.js";

/** RRF constant: the canonical default (Cormack et al., 2009). Larger k → flatter decay. */
export const DEFAULT_RRF_K = 60;
const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Lowercase alphanumeric word tokens: the shared tokenisation for lexical scoring. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * Okapi BM25 relevance of `query` against each document, keyed by document id. Dependency-free,
 * computed over the (bounded) candidate set only. A document sharing no query term scores 0.
 */
export function bm25Scores(
  query: string,
  documents: Map<string, string>,
  { k1 = 1.5, b = 0.75 }: { k1?: number; b?: number } = {},
): Map<string, number> {
  const scores = new Map<string, number>();
  const qTerms = new Set(tokenize(query));
  if (qTerms.size === 0 || documents.size === 0) {
    for (const id of documents.keys()) scores.set(id, 0);
    return scores;
  }

  const docTokens = new Map<string, string[]>();
  let totalLen = 0;
  for (const [id, text] of documents) {
    const toks = tokenize(text);
    docTokens.set(id, toks);
    totalLen += toks.length;
  }
  const nDocs = documents.size;
  const avgdl = totalLen / nDocs;

  // Document frequency per query term.
  const df = new Map<string, number>();
  for (const toks of docTokens.values()) {
    const present = new Set(toks);
    for (const term of qTerms) if (present.has(term)) df.set(term, (df.get(term) ?? 0) + 1);
  }

  for (const [id, toks] of docTokens) {
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    const length = toks.length;
    let score = 0;
    for (const term of qTerms) {
      const freq = tf.get(term);
      if (freq === undefined) continue;
      const nqi = df.get(term) ?? 0;
      const idf = Math.log(1 + (nDocs - nqi + 0.5) / (nqi + 0.5));
      const denom = freq + k1 * (1 - b + b * (avgdl ? length / avgdl : 0));
      if (denom) score += (idf * (freq * (k1 + 1))) / denom;
    }
    scores.set(id, score);
  }
  return scores;
}

/**
 * Weighted Reciprocal Rank Fusion. `score(d) = Σ_channel weight · 1 / (k + rank)` with 1-based rank;
 * an id absent from a channel contributes nothing there. Weights default to 1.0 each.
 */
export function reciprocalRankFusion(
  rankings: ReadonlyArray<ReadonlyArray<string>>,
  { weights, k = DEFAULT_RRF_K }: { weights?: readonly number[]; k?: number } = {},
): Map<string, number> {
  const w = weights ?? rankings.map(() => 1);
  if (w.length !== rankings.length) throw new Error("weights length must match rankings length");
  const fused = new Map<string, number>();
  rankings.forEach((ranking, ci) => {
    const weight = w[ci] ?? 1;
    ranking.forEach((id, i) => {
      fused.set(id, (fused.get(id) ?? 0) + weight / (k + i + 1));
    });
  });
  return fused;
}

function byDescending(scores: Map<string, number>): (a: string, b: string) => number {
  return (a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0);
}

/**
 * RRF-fuse a dense ranking with lexical (BM25) and recency rankings over the same id set. Returns
 * the fused id ordering, or `null` when there is no lexical signal (blank query / no shared terms)
 * so the caller falls back to its classic dense+recency blend.
 */
export function fuseChannels(params: {
  readonly ids: readonly string[];
  readonly denseRanking: readonly string[];
  readonly documents: Map<string, string>;
  readonly recency: Map<string, number>;
  readonly queryText: string | undefined;
  readonly relevanceWeight: number;
  readonly recencyWeight: number;
  readonly rrfK?: number;
}): string[] | null {
  const { ids, denseRanking, documents, recency, queryText, relevanceWeight, recencyWeight } = params;
  if (!queryText || queryText.trim() === "") return null;
  const bm = bm25Scores(queryText, documents);
  const lexicalRanking = [...bm.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  if (lexicalRanking.length === 0) return null;
  const recencyRanking = [...recency.keys()].sort(byDescending(recency));
  const fused = reciprocalRankFusion([denseRanking, lexicalRanking, recencyRanking], {
    weights: [relevanceWeight, relevanceWeight, recencyWeight],
    k: params.rrfK ?? DEFAULT_RRF_K,
  });
  return [...ids].sort(byDescending(fused));
}

/**
 * Rank the dense-threshold-admitted memories by fusing dense + lexical + recency channels. Admission
 * (cosine ≥ threshold) is unchanged; without a lexical signal it degrades to the classic
 * `relevance·cosine + recency·recency` blend. Returns entries stamped with `relevanceScore` = cosine.
 */
export function hybridRank(params: {
  readonly entries: readonly MemoryEntry[];
  readonly queryEmbedding: readonly number[];
  readonly queryText: string | undefined;
  readonly threshold: number;
  readonly relevanceWeight: number;
  readonly recencyWeight: number;
  readonly limit: number;
  readonly rrfK?: number;
}): MemoryEntry[] {
  const now = Date.now();
  const sim = new Map<string, number>();
  const recency = new Map<string, number>();
  const documents = new Map<string, string>();
  const byId = new Map<string, MemoryEntry>();

  for (const entry of params.entries) {
    if (!entry.embedding) continue;
    const s = cosineSimilarity(params.queryEmbedding, entry.embedding);
    if (s < params.threshold) continue;
    sim.set(entry.id, s);
    const ageMs = Math.max(0, now - Date.parse(entry.timestamp));
    recency.set(entry.id, Math.max(0, 1 - ageMs / RECENCY_WINDOW_MS));
    documents.set(entry.id, entry.content);
    byId.set(entry.id, entry);
  }
  if (byId.size === 0) return [];

  const denseRanking = [...sim.keys()].sort(byDescending(sim));
  const fusedOrder = fuseChannels({
    ids: [...byId.keys()],
    denseRanking,
    documents,
    recency,
    queryText: params.queryText,
    relevanceWeight: params.relevanceWeight,
    recencyWeight: params.recencyWeight,
    ...(params.rrfK !== undefined ? { rrfK: params.rrfK } : {}),
  });

  const stamp = (id: string): MemoryEntry => {
    const e = byId.get(id) as MemoryEntry;
    return { ...e, relevanceScore: sim.get(id) ?? 0 };
  };

  if (fusedOrder === null) {
    // Classic dense+recency blend (backward-compatible with the pre-hybrid ranking).
    const blended = [...byId.keys()].sort((a, b) => {
      const scoreA = params.relevanceWeight * (sim.get(a) ?? 0) + params.recencyWeight * (recency.get(a) ?? 0);
      const scoreB = params.relevanceWeight * (sim.get(b) ?? 0) + params.recencyWeight * (recency.get(b) ?? 0);
      return scoreB - scoreA;
    });
    return blended.slice(0, params.limit).map(stamp);
  }
  return fusedOrder.slice(0, params.limit).map(stamp);
}
