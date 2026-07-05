/**
 * Token counting seam. The default is a dependency-free heuristic (~4 characters
 * per token, the well-known rough GPT ratio). Callers that need exact counts can
 * pass a real tokenizer (e.g. `js-tiktoken`) via {@link MemoryConfig.tokenCounter}.
 */
export type TokenCounter = (text: string) => number;

/** Estimate token count as ceil(length / 4). Never returns less than 1 for
 * non-empty text so a turn/memory always consumes some budget. */
export const heuristicTokenCounter: TokenCounter = (text: string): number => {
  if (text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
};
