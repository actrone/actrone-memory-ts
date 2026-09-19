/**
 * Optional cross-encoder reranking over the top-K candidates.
 *
 * A bi-encoder (the embedder) scores query and document independently; a cross-encoder scores the
 * pair jointly and is markedly more precise: but O(K) model calls, so it only runs over a small
 * over-fetched candidate set. **Honest constraint:** reranking lifts precision, not recall, it can
 * only reorder what retrieval already fetched.
 *
 * The concrete cross-encoder is injected (e.g. a transformers.js / onnxruntime model), keeping the
 * default install dependency-free. This mirrors the Python `actrone_memory.rerank` seam.
 */

import type { MemoryEntry } from "./models.js";

/** Reorders retrieved memories by cross-encoder relevance to a query. */
export interface Reranker {
  /**
   * Return `entries` reordered by descending relevance to `query`. Implementations should rescore
   * only the first `topK` (retrieval is assumed to have surfaced the strongest first) and append any
   * remainder in place, so the result is a same-length permutation of the input.
   */
  rerank(query: string, entries: readonly MemoryEntry[], topK?: number): Promise<MemoryEntry[]>;
}

/**
 * Apply a reranker over the top-K candidates, or return `entries` unchanged when no reranker is
 * configured or there is nothing to rerank. Shared by the manager so retrieval always yields a valid
 * ordering whether or not reranking is enabled.
 */
export async function applyReranker(
  reranker: Reranker | undefined,
  query: string,
  entries: MemoryEntry[],
  topK: number,
): Promise<MemoryEntry[]> {
  if (reranker === undefined || entries.length === 0 || query.trim() === "") return entries;
  return reranker.rerank(query, entries, topK);
}
