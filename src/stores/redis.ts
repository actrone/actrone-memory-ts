import { StoreConnectionError } from "../errors.js";
import type { SessionMetadata, Turn } from "../models.js";
import type { L1Store } from "../store.js";

/**
 * Minimal structural interface for a Redis client (ioredis / node-redis compatible).
 * Injecting the client keeps `@actrone/memory` free of a hard `ioredis` dependency
 * and makes the store unit-testable with an in-memory fake.
 */
export interface RedisLike {
  rpush(key: string, value: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  llen(key: string): Promise<number>;
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  lindex(key: string, index: number): Promise<string | null>;
  /**
   * `SET key value NX EX seconds`, used for the summary lock. Optional so an existing
   * client shim keeps working; without it, `tryAcquireSummaryLock` is unavailable rather
   * than silently unsafe. ioredis spells the variadic form `set(key, val, "EX", n, "NX")`
   * and node-redis `set(key, val, { EX: n, NX: true })`, so both shapes are accepted.
   */
  set?(
    key: string,
    value: string,
    ...args: readonly unknown[]
  ): Promise<string | null>;
}

export interface RedisL1Options {
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
export class RedisL1Store implements L1Store {
  private readonly client: RedisLike;
  private readonly ttlSeconds: number;
  private readonly maxTurns: number;
  private readonly prefix: string;

  constructor(client: RedisLike, opts: RedisL1Options = {}) {
    this.client = client;
    this.ttlSeconds = opts.ttlSeconds ?? 24 * 60 * 60;
    this.maxTurns = opts.maxTurns ?? 50;
    this.prefix = opts.keyPrefix ?? "actrone:mem";
  }

  private key(agentId: string, sessionId: string): string {
    return `${this.prefix}:turns:${agentId}:${sessionId}`;
  }

  private lockKey(agentId: string, sessionId: string): string {
    return `${this.prefix}:summary_lock:${agentId}:${sessionId}`;
  }

  /**
   * Claim the right to summarise this session, fleet-wide, via `SET key NX EX ttl`.
   *
   * One atomic command, so the check and the claim cannot interleave across processes.
   * The TTL is never released early, which makes it double as a re-summarisation cooldown.
   * Throws if the injected client exposes no `set`, rather than pretending to hold a lock.
   */
  async tryAcquireSummaryLock(
    agentId: string,
    sessionId: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (typeof this.client.set !== "function") {
      throw new StoreConnectionError(
        "redis client exposes no set(), so the summary lock cannot be acquired atomically",
        { cause: "missing SET NX EX support" },
      );
    }
    try {
      // ioredis positional form; node-redis accepts an options object, so try it second.
      const result = await this.client.set(
        this.lockKey(agentId, sessionId),
        "1",
        "EX",
        ttlSeconds,
        "NX",
      );
      return result !== null && result !== undefined;
    } catch {
      const result = await this.client.set(this.lockKey(agentId, sessionId), "1", {
        EX: ttlSeconds,
        NX: true,
      });
      return result !== null && result !== undefined;
    }
  }

  async appendTurn(agentId: string, sessionId: string, turn: Turn): Promise<void> {
    const key = this.key(agentId, sessionId);
    try {
      await this.client.rpush(key, JSON.stringify(turn));
      // Keep only the most recent maxTurns entries; refresh the TTL.
      await this.client.ltrim(key, -this.maxTurns, -1);
      await this.client.expire(key, this.ttlSeconds);
    } catch (err) {
      throw new StoreConnectionError("redis append failed", { cause: String(err) });
    }
  }

  async getRecentTurns(agentId: string, sessionId: string, n?: number): Promise<Turn[]> {
    const key = this.key(agentId, sessionId);
    const start = n === undefined ? 0 : -n;
    let raw: string[];
    try {
      raw = await this.client.lrange(key, start, -1);
    } catch (err) {
      throw new StoreConnectionError("redis lrange failed", { cause: String(err) });
    }
    return raw.map((s) => JSON.parse(s) as Turn);
  }

  async turnCount(agentId: string, sessionId: string): Promise<number> {
    try {
      return await this.client.llen(this.key(agentId, sessionId));
    } catch (err) {
      throw new StoreConnectionError("redis llen failed", { cause: String(err) });
    }
  }

  async clearSession(agentId: string, sessionId: string): Promise<void> {
    try {
      await this.client.del(this.key(agentId, sessionId));
      // Release the lock too: a reused session id could otherwise never be claimed again.
      await this.client.del(this.lockKey(agentId, sessionId));
    } catch (err) {
      throw new StoreConnectionError("redis del failed", { cause: String(err) });
    }
  }

  async getSessionMetadata(
    agentId: string,
    sessionId: string,
  ): Promise<SessionMetadata | null> {
    const key = this.key(agentId, sessionId);
    let count: number;
    let firstRaw: string | null;
    let lastRaw: string | null;
    try {
      count = await this.client.llen(key);
      if (count === 0) return null;
      [firstRaw, lastRaw] = await Promise.all([
        this.client.lindex(key, 0),
        this.client.lindex(key, -1),
      ]);
    } catch (err) {
      throw new StoreConnectionError("redis session metadata read failed", {
        cause: String(err),
      });
    }
    const first = firstRaw ? (JSON.parse(firstRaw) as Turn) : undefined;
    const last = lastRaw ? (JSON.parse(lastRaw) as Turn) : undefined;
    return {
      agentId,
      sessionId,
      turnCount: count,
      ...(first ? { createdAt: first.timestamp } : {}),
      ...(last ? { lastActive: last.timestamp } : {}),
    };
  }
}
