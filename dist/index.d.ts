import { L as L1Store, T as Turn, S as SessionMetadata, a as L2Store, M as MemoryEntry, b as L2SearchParams } from './adapters-DUQHduRk.js';
export { C as ContentType, c as ConversationRef, D as DEFAULT_CONFIG, E as Embedder, I as InMemoryStore, d as LcLikeMessage, e as LocalEmbedder, f as MemoryConfig, g as MemoryHelper, h as MemoryManager, i as MemoryManagerParts, R as Recalled, j as RetrievedContext, k as TokenCounter, l as ToolResult, m as budgetUtilisation, n as cosineSimilarity, o as formatContext, p as heuristicTokenCounter, q as langchainMemory, r as memoryFor, s as recall, t as remember, u as resolveConfig, v as toolResultSchema, w as vercelMemory } from './adapters-DUQHduRk.js';
import 'zod';

/**
 * Minimal structural interface for a Redis client (ioredis / node-redis compatible).
 * Injecting the client keeps `@actrone/memory` free of a hard `ioredis` dependency
 * and makes the store unit-testable with an in-memory fake.
 */
interface RedisLike {
    rpush(key: string, value: string): Promise<number>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    ltrim(key: string, start: number, stop: number): Promise<unknown>;
    llen(key: string): Promise<number>;
    del(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    lindex(key: string, index: number): Promise<string | null>;
}
interface RedisL1Options {
    /** Session TTL in seconds (refreshed on every write). Default 24h. */
    readonly ttlSeconds?: number;
    /** Max turns retained per session (oldest trimmed). Default 50. */
    readonly maxTurns?: number;
    /** Key namespace. Default "actrone:mem". */
    readonly keyPrefix?: string;
}
/**
 * Redis-backed hot session store (L1). Turns are stored as a per-session list with
 * a sliding TTL and a capped length, mirroring the Python `actrone_memory` RedisStore.
 */
declare class RedisL1Store implements L1Store {
    private readonly client;
    private readonly ttlSeconds;
    private readonly maxTurns;
    private readonly prefix;
    constructor(client: RedisLike, opts?: RedisL1Options);
    private key;
    appendTurn(agentId: string, sessionId: string, turn: Turn): Promise<void>;
    getRecentTurns(agentId: string, sessionId: string, n?: number): Promise<Turn[]>;
    turnCount(agentId: string, sessionId: string): Promise<number>;
    clearSession(agentId: string, sessionId: string): Promise<void>;
    getSessionMetadata(agentId: string, sessionId: string): Promise<SessionMetadata | null>;
}

/** A single scored hit from a vector search. */
interface QdrantHit {
    readonly id: string | number;
    readonly score: number;
    readonly payload?: Record<string, unknown> | null;
}
/**
 * Minimal structural interface for a Qdrant client (`@qdrant/js-client-rest`
 * compatible). Injected so `@actrone/memory` needs no hard Qdrant dependency and
 * the store is unit-testable with an in-memory fake.
 */
interface QdrantLike {
    upsert(collection: string, args: {
        points: Array<{
            id: string;
            vector: number[];
            payload: Record<string, unknown>;
        }>;
    }): Promise<unknown>;
    search(collection: string, args: {
        vector: number[];
        limit: number;
        score_threshold?: number;
        filter?: unknown;
        with_payload?: boolean;
    }): Promise<QdrantHit[]>;
    delete(collection: string, args: {
        points: string[];
    }): Promise<unknown>;
}
interface QdrantL2Options {
    /** Collection name. Default "actrone_memory". */
    readonly collection?: string;
    /** Blend weights for `relevanceWeight·score + recencyWeight·recency` on re-rank. */
    readonly relevanceWeight?: number;
    readonly recencyWeight?: number;
}
/**
 * Qdrant-backed cold semantic store (L2). Memories are points keyed by id with the
 * embedding as the vector and the entry fields as payload; search filters by
 * `agentId` for tenant/agent isolation and re-ranks the raw similarity with a
 * recency blend (mirroring the Python `actrone_memory` QdrantStore).
 */
declare class QdrantL2Store implements L2Store {
    private readonly client;
    private readonly collection;
    private readonly relevanceWeight;
    private readonly recencyWeight;
    constructor(client: QdrantLike, opts?: QdrantL2Options);
    upsert(entry: MemoryEntry): Promise<void>;
    search(params: L2SearchParams): Promise<MemoryEntry[]>;
    delete(memoryId: string): Promise<void>;
}

/**
 * Structured error hierarchy for `@actrone/memory`, mirroring the Python
 * `actrone_memory.exceptions` contract so cross-language docs and behaviour
 * line up. Every error carries a machine-readable {@link MemoryError.code}.
 */
/** Base class for every error thrown by the library. */
declare class MemoryError extends Error {
    /** Machine-readable error class. */
    readonly code: string;
    /** Structured contextual fields. */
    readonly details: Readonly<Record<string, unknown>>;
    constructor(message: string, code: string, details?: Record<string, unknown>);
}
/** An input argument failed length/format/range validation at the boundary. */
declare class ValidationError extends MemoryError {
    constructor(field: string, reason: string);
}
/** The requested token budget was 0 or negative. */
declare class TokenBudgetError extends MemoryError {
    constructor(message: string, details?: Record<string, unknown>);
}
/** Required configuration was missing or invalid. */
declare class ConfigurationError extends MemoryError {
    constructor(message: string, details?: Record<string, unknown>);
}
/** A memory id was not found in the long-term store. */
declare class MemoryNotFoundError extends MemoryError {
    constructor(memoryId: string);
}
/** A backing store (L1/L2) could not be reached. */
declare class StoreConnectionError extends MemoryError {
    constructor(message: string, details?: Record<string, unknown>);
}

export { ConfigurationError, L1Store, L2SearchParams, L2Store, MemoryEntry, MemoryError, MemoryNotFoundError, type QdrantHit, type QdrantL2Options, QdrantL2Store, type QdrantLike, type RedisL1Options, RedisL1Store, type RedisLike, SessionMetadata, StoreConnectionError, TokenBudgetError, Turn, ValidationError };
