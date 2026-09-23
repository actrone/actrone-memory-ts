import { ConfigurationError } from "./errors.js";
import { heuristicTokenCounter, type TokenCounter } from "./tokens.js";

/**
 * Configuration for a {@link MemoryManager}, mirroring the Python
 * `actrone_memory.MemoryConfig`. All fields have safe defaults, so
 * `MemoryManager.create()` needs no arguments for the in-memory on-ramp.
 */
export interface MemoryConfig {
  /** Fraction of the token budget reserved for episodic (L2) memories. */
  readonly budgetFractionEpisodic: number;
  /** Fraction of the token budget reserved for recent session (L1) turns. */
  readonly budgetFractionSession: number;
  /**
   * Minimum cosine similarity for an L2 memory to be admitted (0-1). Leave it unset to use the
   * threshold the embedder was calibrated for ({@link Embedder.relevanceThreshold}), falling back to
   * {@link DEFAULT_RELEVANCE_THRESHOLD} for an embedder that declares none. Similarity scales differ
   * by model, so one fixed number cannot suit them all: the lexical `LocalEmbedder` scores relevant
   * text near 0.24, while bge-small scores unrelated text near 0.48.
   */
  readonly relevanceThreshold?: number | undefined;
  /** Maximum episodic memories to pull from L2 before budget pruning. */
  readonly maxEpisodicMemories: number;
  /** Weight on cosine similarity in the blended rank score. */
  readonly relevanceWeight: number;
  /** Weight on recency in the blended rank score. */
  readonly recencyWeight: number;
  /**
   * Hybrid retrieval: among the threshold-admitted candidates, fuse the embedding (dense)
   * ranking with a BM25 (lexical) ranking and recency via Reciprocal Rank Fusion, so an exact-keyword
   * match the embedder under-ranks still surfaces. Admission (cosine ≥ threshold) is unchanged. Set
   * false for the classic single-channel dense+recency blend.
   */
  readonly hybridRetrieval: boolean;
  /**
   * Cross-encoder rerank window: how many of the over-fetched candidates a configured
   * {@link Reranker} rescores. Only takes effect when a reranker is passed to the manager.
   */
  readonly rerankTopK: number;
  /** Cap on retained turns per session in L1. */
  readonly maxSessionTurns: number;
  /** How token counts are computed. Defaults to a dependency-free heuristic. */
  readonly tokenCounter: TokenCounter;
}

/** Production-safe defaults. The budget fractions match the roadmap's context
 * assembler (episodic 25% / session 35%); the remainder is reserved for the
 * system prompt + current turn, which `retrieveContext` never consumes. */
export const DEFAULT_CONFIG: MemoryConfig = {
  budgetFractionEpisodic: 0.25,
  budgetFractionSession: 0.35,
  maxEpisodicMemories: 10,
  relevanceWeight: 0.7,
  recencyWeight: 0.3,
  hybridRetrieval: true,
  rerankTopK: 20,
  maxSessionTurns: 50,
  tokenCounter: heuristicTokenCounter,
};

/**
 * Admission threshold for an embedder that declares no calibrated
 * {@link Embedder.relevanceThreshold}, such as a custom or hosted model you pass in yourself.
 */
export const DEFAULT_RELEVANCE_THRESHOLD = 0.7;

/**
 * The admission threshold a manager applies: the configured value when set, else the embedder's
 * calibrated value, else {@link DEFAULT_RELEVANCE_THRESHOLD}.
 */
export function resolveRelevanceThreshold(
  config: MemoryConfig,
  embedder: { readonly relevanceThreshold?: number | undefined },
): number {
  return config.relevanceThreshold ?? embedder.relevanceThreshold ?? DEFAULT_RELEVANCE_THRESHOLD;
}

/** Bounds for the numeric knobs, checked when a config is resolved. Unset optional knobs are skipped. */
const RANGES: ReadonlyArray<
  readonly [keyof MemoryConfig, number, number, "fraction" | "positive-int"]
> = [
  ["budgetFractionEpisodic", 0, 1, "fraction"],
  ["budgetFractionSession", 0, 1, "fraction"],
  ["relevanceThreshold", 0, 1, "fraction"],
  ["relevanceWeight", 0, 1, "fraction"],
  ["recencyWeight", 0, 1, "fraction"],
  ["maxEpisodicMemories", 1, Number.MAX_SAFE_INTEGER, "positive-int"],
  ["maxSessionTurns", 1, Number.MAX_SAFE_INTEGER, "positive-int"],
  ["rerankTopK", 1, Number.MAX_SAFE_INTEGER, "positive-int"],
];

/**
 * Merge partial overrides over the defaults into a complete config.
 *
 * Out-of-range values are rejected here rather than silently producing a manager
 * that never recalls anything (a threshold above 1) or prunes every memory (a
 * negative budget fraction). Mirrors the Python library's startup validation.
 *
 * @throws {ConfigurationError} When a knob is outside its documented range, or
 * the episodic + session budget fractions together exceed the whole budget.
 */
export function resolveConfig(overrides: Partial<MemoryConfig> = {}): MemoryConfig {
  const config: MemoryConfig = { ...DEFAULT_CONFIG, ...overrides };

  for (const [key, min, max, kind] of RANGES) {
    if (key === "relevanceThreshold" && config.relevanceThreshold === undefined) continue;
    const value = config[key] as number;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new ConfigurationError(`${key} must be a finite number, got ${String(value)}`);
    }
    if (kind === "positive-int" && !Number.isInteger(value)) {
      throw new ConfigurationError(`${key} must be an integer, got ${value}`);
    }
    if (value < min || value > max) {
      throw new ConfigurationError(`${key} must be between ${min} and ${max}, got ${value}`);
    }
  }

  const allocated = config.budgetFractionEpisodic + config.budgetFractionSession;
  if (allocated > 1) {
    throw new ConfigurationError(
      "budgetFractionEpisodic + budgetFractionSession must not exceed 1.0, got " +
        `${allocated.toFixed(4)}. The remainder is reserved for the system prompt ` +
        "and the current turn.",
    );
  }

  if (typeof config.tokenCounter !== "function") {
    throw new ConfigurationError("tokenCounter must be a function");
  }

  return config;
}
