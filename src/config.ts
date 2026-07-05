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
  /** Minimum cosine similarity for an L2 memory to be admitted (0–1). */
  readonly relevanceThreshold: number;
  /** Maximum episodic memories to pull from L2 before budget pruning. */
  readonly maxEpisodicMemories: number;
  /** Weight on cosine similarity in the blended rank score. */
  readonly relevanceWeight: number;
  /** Weight on recency in the blended rank score. */
  readonly recencyWeight: number;
  /** Cap on retained turns per session in L1. */
  readonly maxSessionTurns: number;
  /** Whether to auto-summarise a session to L2 once it grows large. */
  readonly autoSummarise: boolean;
  /** Turn count at which auto-summarisation triggers. */
  readonly summariseAfterTurns: number;
  /** How token counts are computed. Defaults to a dependency-free heuristic. */
  readonly tokenCounter: TokenCounter;
}

/** Production-safe defaults. The budget fractions match the roadmap's context
 * assembler (episodic 25% / session 35%); the remainder is reserved for the
 * system prompt + current turn, which `retrieveContext` never consumes. */
export const DEFAULT_CONFIG: MemoryConfig = {
  budgetFractionEpisodic: 0.25,
  budgetFractionSession: 0.35,
  relevanceThreshold: 0.7,
  maxEpisodicMemories: 10,
  relevanceWeight: 0.7,
  recencyWeight: 0.3,
  maxSessionTurns: 50,
  autoSummarise: false,
  summariseAfterTurns: 20,
  tokenCounter: heuristicTokenCounter,
};

/** Merge partial overrides over the defaults into a complete config. */
export function resolveConfig(overrides: Partial<MemoryConfig> = {}): MemoryConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
