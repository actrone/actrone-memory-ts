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
  FastEmbedEmbedder,
  buildLocalEmbedder,
  cosineSimilarity,
} from "./embedder.js";
export {
  tokenize,
  bm25Scores,
  reciprocalRankFusion,
  fuseChannels,
  hybridRank,
  DEFAULT_RRF_K,
} from "./retrieval.js";
export { type Reranker, applyReranker } from "./rerank.js";
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
  type ExtractedFact,
  type FactExtractor,
  type ChatCompleterLike,
  OpenAIFactExtractor,
  parseFacts,
  EXTRACTION_SPEC_VERSION,
  EXTRACTION_SYSTEM_PROMPT,
} from "./extraction.js";
export {
  type MemoryItem,
  type EvalQuery,
  type EvalCase,
  type EvalReport,
  DEFAULT_DATASET,
  runEval,
} from "./benchmark.js";
export {
  type Recipe,
  RECIPES,
  HOSTED_UPGRADE_HINT,
  listFrameworks,
  getRecipe,
  renderRecipe,
  renderStandaloneFile,
} from "./recipes.js";
export {
  type ContentType,
  type MemorySource,
  type Sensitivity,
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
  voltagentMemory,
  claudeAgentMemory,
  cloudflareAgentsMemory,
  inngestAgentKitMemory,
  loadMessages,
  langchainChatHistory,
  llamaindexChatMemory,
  type ConversationRef,
  type Recalled,
  type MemoryHelper,
  type LcLikeMessage,
  type LangGraphSystemMessage,
  type ChatRole,
  type ChatMessage,
  type LcChatMessage,
  type LcMessageClasses,
  type LiChatMessage,
} from "./adapters.js";
