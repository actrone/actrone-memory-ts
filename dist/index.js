export { formatContext, langchainMemory, memoryFor, recall, remember, vercelMemory } from './chunk-W242LSH6.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

// src/tokens.ts
var heuristicTokenCounter = (text) => {
  if (text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
};

// src/config.ts
var DEFAULT_CONFIG = {
  budgetFractionEpisodic: 0.25,
  budgetFractionSession: 0.35,
  relevanceThreshold: 0.7,
  maxEpisodicMemories: 10,
  relevanceWeight: 0.7,
  recencyWeight: 0.3,
  maxSessionTurns: 50,
  autoSummarise: false,
  summariseAfterTurns: 20,
  tokenCounter: heuristicTokenCounter
};
function resolveConfig(overrides = {}) {
  return { ...DEFAULT_CONFIG, ...overrides };
}

// src/embedder.ts
var LocalEmbedder = class {
  dimensions;
  constructor(dimensions = 256) {
    if (dimensions <= 0) throw new Error("dimensions must be > 0");
    this.dimensions = dimensions;
  }
  async embed(text) {
    const vec = new Array(this.dimensions).fill(0);
    const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const word of words) {
      const bucket = hash32(word) % this.dimensions;
      vec[bucket] = (vec[bucket] ?? 0) + 1;
    }
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm === 0) return vec;
    for (let i = 0; i < vec.length; i++) vec[i] = (vec[i] ?? 0) / norm;
    return vec;
  }
};
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function cosineSimilarity(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// src/errors.ts
var MemoryError = class extends Error {
  /** Machine-readable error class. */
  code;
  /** Structured contextual fields. */
  details;
  constructor(message, code, details = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var ValidationError = class extends MemoryError {
  constructor(field, reason) {
    super(`${field} ${reason}`, "ERR_VALIDATION", { field, reason });
  }
};
var TokenBudgetError = class extends MemoryError {
  constructor(message, details = {}) {
    super(message, "ERR_TOKEN_BUDGET", details);
  }
};
var ConfigurationError = class extends MemoryError {
  constructor(message, details = {}) {
    super(message, "ERR_CONFIGURATION", details);
  }
};
var MemoryNotFoundError = class extends MemoryError {
  constructor(memoryId) {
    super(`memory not found: ${memoryId}`, "ERR_MEMORY_NOT_FOUND", { memoryId });
  }
};
var StoreConnectionError = class extends MemoryError {
  constructor(message, details = {}) {
    super(message, "ERR_STORE_CONNECTION", details);
  }
};

// src/store.ts
function sessionKey(agentId, sessionId) {
  return `${agentId}::${sessionId}`;
}
var InMemoryStore = class {
  turns = /* @__PURE__ */ new Map();
  sessionCreatedAt = /* @__PURE__ */ new Map();
  memories = /* @__PURE__ */ new Map();
  // keyed by agentId
  maxSessionTurns;
  constructor(maxSessionTurns = 50) {
    this.maxSessionTurns = maxSessionTurns;
  }
  // ── L1 ────────────────────────────────────────────────────────────────────
  async appendTurn(agentId, sessionId, turn) {
    const key = sessionKey(agentId, sessionId);
    const list = this.turns.get(key) ?? [];
    if (list.length === 0) this.sessionCreatedAt.set(key, turn.timestamp);
    list.push(turn);
    if (list.length > this.maxSessionTurns) list.splice(0, list.length - this.maxSessionTurns);
    this.turns.set(key, list);
  }
  async getRecentTurns(agentId, sessionId, n) {
    const list = this.turns.get(sessionKey(agentId, sessionId)) ?? [];
    if (n === void 0 || n >= list.length) return [...list];
    return list.slice(list.length - n);
  }
  async turnCount(agentId, sessionId) {
    return this.turns.get(sessionKey(agentId, sessionId))?.length ?? 0;
  }
  async clearSession(agentId, sessionId) {
    const key = sessionKey(agentId, sessionId);
    this.turns.delete(key);
    this.sessionCreatedAt.delete(key);
  }
  async getSessionMetadata(agentId, sessionId) {
    const key = sessionKey(agentId, sessionId);
    const list = this.turns.get(key);
    if (!list || list.length === 0) return null;
    const createdAt = this.sessionCreatedAt.get(key);
    const lastActive = list[list.length - 1]?.timestamp;
    return {
      agentId,
      sessionId,
      turnCount: list.length,
      ...createdAt !== void 0 ? { createdAt } : {},
      ...lastActive !== void 0 ? { lastActive } : {}
    };
  }
  // ── L2 ────────────────────────────────────────────────────────────────────
  async upsert(entry) {
    const list = this.memories.get(entry.agentId) ?? [];
    const idx = list.findIndex((m) => m.id === entry.id);
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    this.memories.set(entry.agentId, list);
  }
  async search(params) {
    const list = this.memories.get(params.agentId) ?? [];
    if (list.length === 0) return [];
    const now = Date.now();
    const recencyWindowMs = 30 * 24 * 60 * 60 * 1e3;
    const scored = [];
    for (const entry of list) {
      const sim = entry.embedding ? cosineSimilarity(params.queryEmbedding, entry.embedding) : 0;
      if (sim < params.threshold) continue;
      const ageMs = Math.max(0, now - Date.parse(entry.timestamp));
      const recency = Math.max(0, 1 - ageMs / recencyWindowMs);
      const score = params.relevanceWeight * sim + params.recencyWeight * recency;
      scored.push({ entry, score, sim });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, params.limit).map(({ entry, sim }) => ({ ...entry, relevanceScore: sim }));
  }
  async delete(memoryId) {
    for (const [agentId, list] of this.memories) {
      const idx = list.findIndex((m) => m.id === memoryId);
      if (idx >= 0) {
        list.splice(idx, 1);
        this.memories.set(agentId, list);
        return;
      }
    }
    throw new MemoryNotFoundError(memoryId);
  }
};

// src/manager.ts
var MAX_ID_LEN = 256;
var MAX_MESSAGE_LEN = 1e5;
var MAX_CONTENT_LEN = 1e5;
var MAX_QUERY_LEN = 1e4;
var MAX_TAGS = 50;
function validateId(value, field) {
  if (!value || value.trim().length === 0) throw new ValidationError(field, "must not be empty");
  if (value.length > MAX_ID_LEN) throw new ValidationError(field, `must be \u2264 ${MAX_ID_LEN} characters`);
}
function validateText(value, field, maxLen) {
  if (value.length > maxLen) throw new ValidationError(field, `must be \u2264 ${maxLen} characters`);
}
var MemoryManager = class _MemoryManager {
  l1;
  l2;
  embedder;
  cfg;
  constructor(parts) {
    this.l1 = parts.l1;
    this.l2 = parts.l2;
    this.embedder = parts.embedder;
    this.cfg = parts.config;
  }
  /**
   * Build a ready manager. With no arguments it uses the in-memory store + the
   * dependency-free local embedder — the zero-config on-ramp. Pass stores /
   * embedder to back it with Redis + Qdrant + a real embedding model.
   */
  static async create(options = {}) {
    const config = resolveConfig(options.config);
    const shared = new InMemoryStore(config.maxSessionTurns);
    return new _MemoryManager({
      l1: options.l1 ?? shared,
      l2: options.l2 ?? shared,
      embedder: options.embedder ?? new LocalEmbedder(),
      config
    });
  }
  // ── Public API ──────────────────────────────────────────────────────────────
  /** Persist a conversation turn to the hot session tier. Returns the turn id. */
  async storeTurn(agentId, sessionId, userMessage, assistantMessage, toolResults) {
    validateId(agentId, "agentId");
    validateId(sessionId, "sessionId");
    validateText(userMessage, "userMessage", MAX_MESSAGE_LEN);
    validateText(assistantMessage, "assistantMessage", MAX_MESSAGE_LEN);
    const tokenCount = this.cfg.tokenCounter(`${userMessage}
${assistantMessage}`);
    const turn = {
      id: randomUUID(),
      sessionId,
      userMessage,
      assistantMessage,
      toolResults: toolResults ?? [],
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      tokenCount
    };
    await this.l1.appendTurn(agentId, sessionId, turn);
    return turn.id;
  }
  /**
   * Assemble context for the next LLM call using the 4-phase pipeline:
   * parallel L1/L2 fetch → budget allocation → relevance ranking → priority
   * pruning. The system-prompt + current-turn budget is never consumed here.
   */
  async retrieveContext(agentId, sessionId, query, tokenBudget) {
    validateId(agentId, "agentId");
    validateId(sessionId, "sessionId");
    validateText(query, "query", MAX_QUERY_LEN);
    if (tokenBudget <= 0) {
      throw new TokenBudgetError(`tokenBudget must be > 0, got ${tokenBudget}`, { tokenBudget });
    }
    const start = performance.now();
    const [queryEmbedding, recentTurns] = await Promise.all([
      this.embedder.embed(query),
      this.l1.getRecentTurns(agentId, sessionId)
    ]);
    const episodicMemories = await this.l2.search({
      agentId,
      queryEmbedding,
      threshold: this.cfg.relevanceThreshold,
      limit: this.cfg.maxEpisodicMemories,
      relevanceWeight: this.cfg.relevanceWeight,
      recencyWeight: this.cfg.recencyWeight
    });
    const episodicBudget = Math.floor(tokenBudget * this.cfg.budgetFractionEpisodic);
    const sessionBudget = Math.floor(tokenBudget * this.cfg.budgetFractionSession);
    const prunedTurns = this.pruneTurns(recentTurns, sessionBudget);
    const prunedMemories = this.pruneMemories(episodicMemories, episodicBudget);
    const totalTokensUsed = prunedTurns.reduce((s, t) => s + t.tokenCount, 0) + prunedMemories.reduce((s, m) => s + m.tokenCount, 0);
    return {
      recentTurns: prunedTurns,
      episodicMemories: prunedMemories,
      totalTokensUsed,
      tokenBudget,
      retrievalDurationMs: performance.now() - start
    };
  }
  /** Write a fact directly into long-term memory. Returns the memory id. */
  async injectMemory(agentId, content, importance = 0.8, sessionId = "injected", topicTags) {
    validateId(agentId, "agentId");
    validateText(content, "content", MAX_CONTENT_LEN);
    if (content.trim().length === 0) throw new ValidationError("content", "must not be blank");
    if (importance < 0 || importance > 1) {
      throw new ValidationError("importance", "must be between 0.0 and 1.0");
    }
    const tags = topicTags ?? [];
    if (tags.length > MAX_TAGS) throw new ValidationError("topicTags", `must contain \u2264 ${MAX_TAGS} tags`);
    const embedding = await this.embedder.embed(content);
    const entry = {
      id: randomUUID(),
      agentId,
      sessionId,
      content,
      contentType: "injected",
      embedding,
      importanceScore: importance,
      topicTags: tags,
      tokenCount: this.cfg.tokenCounter(content),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      sourceTurnIds: []
    };
    await this.l2.upsert(entry);
    return entry.id;
  }
  /** Permanently remove a memory by id. */
  async deleteMemory(agentId, memoryId) {
    validateId(agentId, "agentId");
    validateId(memoryId, "memoryId");
    await this.l2.delete(memoryId);
  }
  /** Delete all hot-tier turns for a session. Long-term memories persist. */
  async clearSession(agentId, sessionId) {
    validateId(agentId, "agentId");
    validateId(sessionId, "sessionId");
    await this.l1.clearSession(agentId, sessionId);
  }
  /** Semantic search over long-term memory, ranked by relevance + recency. */
  async searchMemories(agentId, query, limit = 10) {
    validateId(agentId, "agentId");
    validateText(query, "query", MAX_QUERY_LEN);
    if (limit < 1) throw new ValidationError("limit", "must be \u2265 1");
    const embedding = await this.embedder.embed(query);
    return this.l2.search({
      agentId,
      queryEmbedding: embedding,
      threshold: this.cfg.relevanceThreshold,
      limit,
      relevanceWeight: this.cfg.relevanceWeight,
      recencyWeight: this.cfg.recencyWeight
    });
  }
  /** Session stats, or null when the session does not exist / has expired. */
  async getSessionMetadata(agentId, sessionId) {
    validateId(agentId, "agentId");
    validateId(sessionId, "sessionId");
    return this.l1.getSessionMetadata(agentId, sessionId);
  }
  /** Release any resources. In-memory mode is a no-op; adapters override the stores. */
  async close() {
  }
  // ── Internal pruning ────────────────────────────────────────────────────────
  /** Admit newest → oldest while each turn fits; stop on the first overflow.
   * Returns chronological order (oldest first). O(n). */
  pruneTurns(turns, budget) {
    const result = [];
    let remaining = budget;
    for (let i = turns.length - 1; i >= 0; i--) {
      const turn = turns[i];
      if (turn && turn.tokenCount <= remaining) {
        result.push(turn);
        remaining -= turn.tokenCount;
      } else {
        break;
      }
    }
    result.reverse();
    return result;
  }
  /** Admit highest-ranked → lowest, skipping individual overflows (input is
   * pre-sorted by relevance, so skipping one oversized memory to fit several
   * smaller ones is the right trade-off). O(n). */
  pruneMemories(memories, budget) {
    const result = [];
    let remaining = budget;
    for (const mem of memories) {
      if (mem.tokenCount <= remaining) {
        result.push(mem);
        remaining -= mem.tokenCount;
      }
    }
    return result;
  }
};

// src/stores/redis.ts
var RedisL1Store = class {
  client;
  ttlSeconds;
  maxTurns;
  prefix;
  constructor(client, opts = {}) {
    this.client = client;
    this.ttlSeconds = opts.ttlSeconds ?? 24 * 60 * 60;
    this.maxTurns = opts.maxTurns ?? 50;
    this.prefix = opts.keyPrefix ?? "actrone:mem";
  }
  key(agentId, sessionId) {
    return `${this.prefix}:turns:${agentId}:${sessionId}`;
  }
  async appendTurn(agentId, sessionId, turn) {
    const key = this.key(agentId, sessionId);
    try {
      await this.client.rpush(key, JSON.stringify(turn));
      await this.client.ltrim(key, -this.maxTurns, -1);
      await this.client.expire(key, this.ttlSeconds);
    } catch (err) {
      throw new StoreConnectionError("redis append failed", { cause: String(err) });
    }
  }
  async getRecentTurns(agentId, sessionId, n) {
    const key = this.key(agentId, sessionId);
    const start = n === void 0 ? 0 : -n;
    let raw;
    try {
      raw = await this.client.lrange(key, start, -1);
    } catch (err) {
      throw new StoreConnectionError("redis lrange failed", { cause: String(err) });
    }
    return raw.map((s) => JSON.parse(s));
  }
  async turnCount(agentId, sessionId) {
    try {
      return await this.client.llen(this.key(agentId, sessionId));
    } catch (err) {
      throw new StoreConnectionError("redis llen failed", { cause: String(err) });
    }
  }
  async clearSession(agentId, sessionId) {
    try {
      await this.client.del(this.key(agentId, sessionId));
    } catch (err) {
      throw new StoreConnectionError("redis del failed", { cause: String(err) });
    }
  }
  async getSessionMetadata(agentId, sessionId) {
    const key = this.key(agentId, sessionId);
    const count = await this.client.llen(key);
    if (count === 0) return null;
    const [firstRaw, lastRaw] = await Promise.all([
      this.client.lindex(key, 0),
      this.client.lindex(key, -1)
    ]);
    const first = firstRaw ? JSON.parse(firstRaw) : void 0;
    const last = lastRaw ? JSON.parse(lastRaw) : void 0;
    return {
      agentId,
      sessionId,
      turnCount: count,
      ...first ? { createdAt: first.timestamp } : {},
      ...last ? { lastActive: last.timestamp } : {}
    };
  }
};

// src/stores/qdrant.ts
var QdrantL2Store = class {
  client;
  collection;
  relevanceWeight;
  recencyWeight;
  constructor(client, opts = {}) {
    this.client = client;
    this.collection = opts.collection ?? "actrone_memory";
    this.relevanceWeight = opts.relevanceWeight ?? 0.7;
    this.recencyWeight = opts.recencyWeight ?? 0.3;
  }
  async upsert(entry) {
    try {
      await this.client.upsert(this.collection, {
        points: [
          {
            id: entry.id,
            vector: [...entry.embedding ?? []],
            payload: {
              agentId: entry.agentId,
              sessionId: entry.sessionId,
              content: entry.content,
              contentType: entry.contentType,
              importanceScore: entry.importanceScore,
              topicTags: [...entry.topicTags],
              tokenCount: entry.tokenCount,
              timestamp: entry.timestamp,
              sourceTurnIds: [...entry.sourceTurnIds]
            }
          }
        ]
      });
    } catch (err) {
      throw new StoreConnectionError("qdrant upsert failed", { cause: String(err) });
    }
  }
  async search(params) {
    let hits;
    try {
      hits = await this.client.search(this.collection, {
        vector: [...params.queryEmbedding],
        // Over-fetch a little so the recency re-rank has candidates to reorder.
        limit: Math.max(params.limit * 2, params.limit),
        score_threshold: params.threshold,
        with_payload: true,
        filter: {
          must: [{ key: "agentId", match: { value: params.agentId } }]
        }
      });
    } catch (err) {
      throw new StoreConnectionError("qdrant search failed", { cause: String(err) });
    }
    const now = Date.now();
    const recencyWindowMs = 30 * 24 * 60 * 60 * 1e3;
    const scored = hits.map((h) => {
      const entry = payloadToEntry(String(h.id), h.payload ?? {}, h.score);
      const ageMs = Math.max(0, now - Date.parse(entry.timestamp));
      const recency = Math.max(0, 1 - ageMs / recencyWindowMs);
      const blended = this.relevanceWeight * h.score + this.recencyWeight * recency;
      return { entry, blended };
    });
    scored.sort((a, b) => b.blended - a.blended);
    return scored.slice(0, params.limit).map((s) => s.entry);
  }
  async delete(memoryId) {
    try {
      await this.client.delete(this.collection, { points: [memoryId] });
    } catch (err) {
      throw new StoreConnectionError("qdrant delete failed", { cause: String(err) });
    }
  }
};
function payloadToEntry(id, payload, score) {
  const str = (k, d = "") => typeof payload[k] === "string" ? payload[k] : d;
  const num = (k, d = 0) => typeof payload[k] === "number" ? payload[k] : d;
  const arr = (k) => Array.isArray(payload[k]) ? payload[k].map(String) : [];
  return {
    id,
    agentId: str("agentId"),
    sessionId: str("sessionId"),
    content: str("content"),
    contentType: str("contentType", "injected"),
    importanceScore: num("importanceScore", 0.5),
    topicTags: arr("topicTags"),
    tokenCount: num("tokenCount"),
    timestamp: str("timestamp", (/* @__PURE__ */ new Date(0)).toISOString()),
    sourceTurnIds: arr("sourceTurnIds"),
    relevanceScore: score
  };
}
var toolResultSchema = z.object({
  toolName: z.string(),
  params: z.record(z.string(), z.unknown()),
  result: z.unknown(),
  success: z.boolean(),
  durationMs: z.number().int().nonnegative().optional()
});
function budgetUtilisation(ctx) {
  return ctx.tokenBudget === 0 ? 0 : ctx.totalTokensUsed / ctx.tokenBudget;
}

export { ConfigurationError, DEFAULT_CONFIG, InMemoryStore, LocalEmbedder, MemoryError, MemoryManager, MemoryNotFoundError, QdrantL2Store, RedisL1Store, StoreConnectionError, TokenBudgetError, ValidationError, budgetUtilisation, cosineSimilarity, heuristicTokenCounter, resolveConfig, toolResultSchema };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map