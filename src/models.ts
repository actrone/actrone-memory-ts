import { z } from "zod";

/**
 * Domain models for `@actrone/memory`, mirroring the Python `actrone_memory`
 * models with idiomatic TypeScript (camelCase) field names. Timestamps are ISO
 * 8601 strings so entries are trivially JSON-serialisable and align with the
 * hosted Orchestrator's wire format.
 */

/** The kind of content a long-term memory entry holds. */
export type ContentType = "turn" | "summary" | "tool_result" | "injected" | "fact";

/**
 * Provenance-typing v1 (the governance seed that graduates to hosted). Every
 * stored fact carries *where it came from* and *how sensitive it is*, so a memory
 * can be filtered, attributed, and erased by policy, even in the free library.
 * These vocabularies are the language-neutral memory spec shared with the Python
 * lib and the hosted engine; keep the two enums in lockstep.
 *
 * Origin/attribution of a memory. The typed values are the canonical set; a
 * namespaced string (e.g. `"tool:web_search"`, `"import:crm"`) is also accepted.
 */
export type MemorySource =
  | "user"
  | "assistant"
  | "tool"
  | "summary"
  | "injected"
  | "extracted"
  | "reflection"
  | "imported"
  | "unknown"
  | (string & {});

/**
 * Sensitivity classification for governance / right-to-erasure, ordered least →
 * most sensitive. Mirrors the hosted DPE tiers so handling policy is consistent
 * from the OSS wedge up to the governed platform.
 */
export type Sensitivity = "none" | "low" | "pii" | "sensitive";

/** The outcome of a single tool call recorded on a conversation turn. */
export const toolResultSchema = z.object({
  toolName: z.string(),
  params: z.record(z.string(), z.unknown()),
  result: z.unknown(),
  success: z.boolean(),
  durationMs: z.number().int().nonnegative().optional(),
});
export type ToolResult = z.infer<typeof toolResultSchema>;

/** A single long-term memory entry (the L2 semantic tier). */
export interface MemoryEntry {
  readonly id: string;
  readonly agentId: string;
  readonly sessionId: string;
  readonly content: string;
  readonly contentType: ContentType;
  /** The embedding vector, when the entry has been embedded. */
  readonly embedding?: readonly number[];
  /** Importance 0.0-1.0; higher surfaces more readily. */
  readonly importanceScore: number;
  readonly topicTags: readonly string[];
  readonly tokenCount: number;
  /** ISO-8601 creation timestamp. */
  readonly timestamp: string;
  /** Turn IDs this entry was summarised from, when applicable. */
  readonly sourceTurnIds: readonly string[];
  /** Provenance attribution: where this fact originated. Default `"unknown"`. */
  readonly source: MemorySource;
  /** PII/sensitivity classification for governance. Default `"none"`. */
  readonly sensitivity: Sensitivity;
  /** Relevance score attached by a search (0-1); absent outside search results. */
  readonly relevanceScore?: number;
}

/** A single conversation turn (the L1 hot session tier). */
export interface Turn {
  readonly id: string;
  readonly sessionId: string;
  readonly userMessage: string;
  readonly assistantMessage: string;
  readonly toolResults: readonly ToolResult[];
  /** ISO-8601 creation timestamp. */
  readonly timestamp: string;
  readonly tokenCount: number;
}

/** The assembled output of {@link MemoryManager.retrieveContext}. */
export interface RetrievedContext {
  readonly recentTurns: readonly Turn[];
  readonly episodicMemories: readonly MemoryEntry[];
  readonly totalTokensUsed: number;
  readonly tokenBudget: number;
  readonly retrievalDurationMs: number;
}

/** Fraction of the budget actually consumed (0 when the budget is 0). */
export function budgetUtilisation(ctx: RetrievedContext): number {
  return ctx.tokenBudget === 0 ? 0 : ctx.totalTokensUsed / ctx.tokenBudget;
}

/** Basic stats about a session. */
export interface SessionMetadata {
  readonly agentId: string;
  readonly sessionId: string;
  readonly turnCount: number;
  /** ISO-8601 timestamps, when the session exists. */
  readonly createdAt?: string;
  readonly lastActive?: string;
}
