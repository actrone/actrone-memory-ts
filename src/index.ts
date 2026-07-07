/**
 * `@actrone/memory` — two-tier persistent agent memory for TypeScript/JS.
 *
 * The dependency-free, self-hosted on-ramp: short-term session turns + long-term
 * semantic recall over a pluggable store (in-memory by default; Redis/Qdrant
 * adapters implement the same {@link L1Store}/{@link L2Store} seams). When you
 * outgrow self-hosting, swap `MemoryManager` for `@actrone/sdk`'s
 * `ActroneMemoryManager` — same API, backed by the governed hosted Orchestrator.
 */

export { MemoryManager, type MemoryManagerParts } from "./manager.js";
export {
  type MemoryConfig,
  DEFAULT_CONFIG,
  resolveConfig,
} from "./config.js";
export {
  type Embedder,
  LocalEmbedder,
  cosineSimilarity,
} from "./embedder.js";
export {
  type L1Store,
  type L2Store,
  type L2SearchParams,
  InMemoryStore,
} from "./store.js";
export {
  RedisL1Store,
  type RedisLike,
  type RedisL1Options,
} from "./stores/redis.js";
export {
  QdrantL2Store,
  type QdrantLike,
  type QdrantHit,
  type QdrantL2Options,
} from "./stores/qdrant.js";
export { type TokenCounter, heuristicTokenCounter } from "./tokens.js";
export {
  type ContentType,
  type ToolResult,
  type MemoryEntry,
  type Turn,
  type RetrievedContext,
  type SessionMetadata,
  toolResultSchema,
  budgetUtilisation,
} from "./models.js";
export {
  MemoryError,
  ValidationError,
  TokenBudgetError,
  ConfigurationError,
  MemoryNotFoundError,
  StoreConnectionError,
} from "./errors.js";
export {
  formatContext,
  recall,
  remember,
  memoryFor,
  vercelMemory,
  langchainMemory,
  langgraphMemory,
  mastraMemory,
  llamaindexMemory,
  openaiAgentsMemory,
  genkitMemory,
  type ConversationRef,
  type Recalled,
  type MemoryHelper,
  type LcLikeMessage,
  type LangGraphSystemMessage,
} from "./adapters.js";
