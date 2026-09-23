/**
 * Conformance suite for custom {@link L1Store} / {@link L2Store} implementations.
 *
 * `MemoryManager` depends on two interfaces rather than on Redis and Qdrant, so any backend
 * can be plugged in (pgvector, Weaviate, Valkey, Postgres, and so on). TypeScript only checks
 * the *shape* of those interfaces, though: the type system cannot express that recent turns
 * come back oldest-first, or that a search must never return another agent's memories. This
 * module encodes those behavioural requirements as runnable checks, so a third-party adapter
 * can prove it satisfies the same contract the built-in stores do.
 *
 * It ships in the package (not the test suite) precisely so you can run it against your own
 * store without vendoring anything:
 *
 * ```ts
 * import { checkL1Store, checkL2Store } from "actrone-memory/testing";
 *
 * await checkL1Store(() => new MyRedisLikeStore(client));
 * await checkL2Store(() => new MyPgVectorStore(pool), { dimensions: 8 });
 * ```
 *
 * Each check throws {@link ConformanceError} naming the violated requirement. Pass a
 * *factory* rather than an instance: several checks need a pristine store, and a factory lets
 * the suite isolate them. No test runner required, and it mirrors the Python
 * `actrone_memory.testing` suite so both libraries hold adapters to the same contract.
 */

import type { MemoryEntry, Turn } from "./models.js";
import type { L1Store, L2Store } from "./store.js";

/** Thrown when a store violates a documented behavioural requirement. */
export class ConformanceError extends Error {
  readonly code = "ERR_STORE_CONFORMANCE";
  readonly requirement: string;

  constructor(requirement: string, detail: string) {
    super(`${requirement}: ${detail}`);
    this.name = "ConformanceError";
    this.requirement = requirement;
  }
}

function require_(condition: boolean, requirement: string, detail: string): void {
  if (!condition) throw new ConformanceError(requirement, detail);
}

/** A factory returning a fresh, empty store. May be async. */
export type StoreFactory<T> = () => T | Promise<T>;

function turn(sessionId: string, userMessage: string, assistantMessage: string): Turn {
  return {
    id: globalThis.crypto.randomUUID(),
    sessionId,
    userMessage,
    assistantMessage,
    toolResults: [],
    timestamp: new Date().toISOString(),
    tokenCount: 4,
  };
}

function entry(
  agentId: string,
  content: string,
  embedding: readonly number[],
  opts: { id?: string; contentType?: MemoryEntry["contentType"] } = {},
): MemoryEntry {
  return {
    id: opts.id ?? globalThis.crypto.randomUUID(),
    agentId,
    sessionId: "s1",
    content,
    contentType: opts.contentType ?? "injected",
    embedding: [...embedding],
    importanceScore: 0.5,
    topicTags: [],
    tokenCount: Math.max(1, Math.floor(content.length / 4)),
    timestamp: new Date().toISOString(),
    sourceTurnIds: [],
    source: "injected",
    sensitivity: "none",
  };
}

/** A one-hot vector, so cosine similarity between two of them is exactly 0 or 1. */
function unitVector(dimensions: number, hotIndex: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  vector[hotIndex % dimensions] = 1;
  return vector;
}

async function make<T>(factory: StoreFactory<T>): Promise<T> {
  return await factory();
}

async function close(store: unknown): Promise<void> {
  const closer = (store as { close?: () => unknown }).close;
  if (typeof closer === "function") {
    await closer.call(store);
  }
}

/**
 * Verify an {@link L1Store} implementation against the hot-tier contract.
 *
 * Requirements checked:
 * - an appended turn is readable back
 * - turns are returned oldest first, which is the order prompts are assembled in
 * - `n` returns the *most recent* `n` turns, not the first `n`
 * - `turnCount` agrees with what is readable
 * - sessions and agents are isolated from each other
 * - `clearSession` empties only the session it was given
 * - `getSessionMetadata` returns `null` for an unknown session
 *
 * @throws {ConformanceError} on the first violated requirement.
 */
export async function checkL1Store(factory: StoreFactory<L1Store>): Promise<void> {
  const store = await make(factory);
  try {
    await store.appendTurn("agent-a", "s1", turn("s1", "first", "reply-1"));
    let turns = await store.getRecentTurns("agent-a", "s1");
    require_(
      turns.length === 1 && turns[0]?.userMessage === "first",
      "appendTurn/getRecentTurns round-trip",
      `expected the appended turn back, got ${JSON.stringify(turns)}`,
    );

    // Chronological order: the manager renders turns in this order into the prompt.
    await store.appendTurn("agent-a", "s1", turn("s1", "second", "reply-2"));
    await store.appendTurn("agent-a", "s1", turn("s1", "third", "reply-3"));
    turns = await store.getRecentTurns("agent-a", "s1");
    require_(
      JSON.stringify(turns.map((t) => t.userMessage)) ===
        JSON.stringify(["first", "second", "third"]),
      "getRecentTurns ordering",
      `turns must come back oldest first, got ${JSON.stringify(turns.map((t) => t.userMessage))}`,
    );

    // `n` must window from the END, otherwise recall silently returns stale context.
    const recent = await store.getRecentTurns("agent-a", "s1", 2);
    require_(
      JSON.stringify(recent.map((t) => t.userMessage)) === JSON.stringify(["second", "third"]),
      "getRecentTurns(n) windowing",
      `n=2 must return the 2 most recent turns oldest-first, got ${JSON.stringify(
        recent.map((t) => t.userMessage),
      )}`,
    );

    const count = await store.turnCount("agent-a", "s1");
    require_(count === 3, "turnCount accuracy", `expected 3 turns, got ${count}`);

    // Session isolation.
    await store.appendTurn("agent-a", "s2", turn("s2", "other-session", "reply"));
    require_(
      (await store.getRecentTurns("agent-a", "s1")).length === 3,
      "session isolation",
      "writing to another session changed this one",
    );

    // Agent isolation: the governance property that matters most.
    await store.appendTurn("agent-b", "s1", turn("s1", "other-agent", "reply"));
    const aTurns = await store.getRecentTurns("agent-a", "s1");
    require_(
      aTurns.every((t) => t.userMessage !== "other-agent"),
      "agent isolation",
      "another agent's turn leaked into this agent's session",
    );

    const meta = await store.getSessionMetadata("agent-a", "s1");
    require_(
      meta !== null && meta.turnCount === 3,
      "getSessionMetadata turnCount",
      `expected metadata reporting 3 turns, got ${JSON.stringify(meta)}`,
    );
    const missing = await store.getSessionMetadata("agent-a", "no-such-session");
    require_(
      missing === null,
      "getSessionMetadata for an unknown session",
      `must return null, got ${JSON.stringify(missing)}`,
    );

    // clearSession must be scoped.
    await store.clearSession("agent-a", "s1");
    require_(
      (await store.getRecentTurns("agent-a", "s1")).length === 0,
      "clearSession empties the session",
      "expected no turns after clearSession",
    );
    require_(
      (await store.getRecentTurns("agent-a", "s2")).length === 1,
      "clearSession scope",
      "clearing one session must not clear another",
    );

    // Optional, but if implemented it must admit exactly one holder per window: a lock that
    // always grants is worse than no lock, because it looks like mutual exclusion.
    if (store.tryAcquireSummaryLock) {
      const first = await store.tryAcquireSummaryLock("agent-a", "s3", 60);
      const second = await store.tryAcquireSummaryLock("agent-a", "s3", 60);
      require_(
        first === true,
        "tryAcquireSummaryLock admits the first caller",
        `expected true on an unheld lock, got ${String(first)}`,
      );
      require_(
        second === false,
        "tryAcquireSummaryLock excludes the second caller",
        `expected false while the lock is held, got ${String(second)}`,
      );
    }
  } finally {
    await close(store);
  }
}

/**
 * Verify an {@link L2Store} implementation against the long-term-tier contract.
 *
 * `dimensions` must match the vector width the store was configured with.
 *
 * Requirements checked:
 * - an upserted memory is findable by a matching vector
 * - an upsert with an existing id replaces rather than duplicates
 * - search never returns another agent's memories
 * - search honours `threshold` and `limit`
 * - passing `queryText` is accepted (hybrid ranking is optional)
 * - `delete` removes one memory; deleting an unknown id must not corrupt the store
 * - `deleteAgentMemories` removes one agent's memories and only that agent's
 *
 * @throws {ConformanceError} on the first violated requirement.
 */
export async function checkL2Store(
  factory: StoreFactory<L2Store>,
  opts: { dimensions?: number } = {},
): Promise<void> {
  const dimensions = opts.dimensions ?? 8;
  require_(
    dimensions >= 2,
    "checkL2Store arguments",
    `dimensions must be at least 2 to build distinguishable vectors, got ${dimensions}`,
  );

  const store = await make(factory);
  try {
    const near = unitVector(dimensions, 0);
    const far = unitVector(dimensions, 1);
    const base = {
      agentId: "agent-a",
      relevanceWeight: 0.7,
      recencyWeight: 0.3,
    } as const;

    const first = entry("agent-a", "the user prefers dark mode", near);
    await store.upsert(first);

    let hits = await store.search({ ...base, queryEmbedding: near, threshold: 0.5, limit: 10 });
    require_(
      hits.some((m) => m.id === first.id),
      "upsert/search round-trip",
      "a memory matching the query vector was not returned",
    );

    // Re-upserting the same id must replace, not duplicate.
    await store.upsert(entry("agent-a", "the user prefers light mode", near, { id: first.id }));
    hits = await store.search({ ...base, queryEmbedding: near, threshold: 0.5, limit: 10 });
    const sameId = hits.filter((m) => m.id === first.id);
    require_(
      sameId.length === 1,
      "upsert idempotency",
      `re-upserting an id must replace it, found ${sameId.length} copies`,
    );
    require_(
      sameId[0]?.content === "the user prefers light mode",
      "upsert replaces content",
      `expected the updated content, got ${String(sameId[0]?.content)}`,
    );

    // Agent isolation: the single most important property of this tier.
    const other = entry("agent-b", "another agent's secret", near);
    await store.upsert(other);
    hits = await store.search({ ...base, queryEmbedding: near, threshold: 0.5, limit: 10 });
    require_(
      hits.every((m) => m.id !== other.id),
      "search agent isolation",
      "another agent's memory leaked into this agent's results",
    );
    require_(
      hits.every((m) => m.agentId === "agent-a"),
      "search agentId fidelity",
      "every hit must belong to the queried agent",
    );

    // Threshold: an orthogonal vector scores 0 and must be excluded.
    const farHits = await store.search({
      ...base,
      queryEmbedding: far,
      threshold: 0.5,
      limit: 10,
    });
    require_(
      farHits.every((m) => m.id !== first.id),
      "search honours threshold",
      "a memory below the similarity threshold was returned",
    );

    // Limit.
    for (let i = 0; i < 4; i++) {
      await store.upsert(entry("agent-a", `memory ${i}`, near));
    }
    const limited = await store.search({
      ...base,
      queryEmbedding: near,
      threshold: 0,
      limit: 2,
    });
    require_(
      limited.length <= 2,
      "search honours limit",
      `limit=2 returned ${limited.length} results`,
    );

    // queryText must be accepted. Fusing it into the ranking is optional.
    const hybrid = await store.search({
      ...base,
      queryEmbedding: near,
      threshold: 0,
      limit: 10,
      queryText: "dark mode",
    });
    require_(
      Array.isArray(hybrid),
      "search accepts queryText",
      "expected an array when queryText is supplied",
    );

    // contentTypes filters when supplied. Everything stored above is "injected", so asking
    // for summaries must come back empty rather than ignoring the filter.
    const typed = await store.search({
      ...base,
      queryEmbedding: near,
      threshold: 0,
      limit: 10,
      contentTypes: ["summary"],
    });
    require_(
      typed.every((m) => m.contentType === "summary"),
      "search honours contentTypes",
      `expected only 'summary' entries, got ${JSON.stringify([
        ...new Set(typed.map((m) => m.contentType)),
      ])}`,
    );

    // Delete one.
    await store.delete(first.id);
    const after = await store.search({ ...base, queryEmbedding: near, threshold: 0, limit: 10 });
    require_(
      after.every((m) => m.id !== first.id),
      "delete removes the memory",
      "the deleted memory was still returned by search",
    );

    // Deleting an unknown id may throw MemoryNotFoundError or be a no-op, but must leave the
    // store usable either way. The built-in stores differ here: Qdrant treats it as success,
    // InMemoryStore throws.
    try {
      await store.delete("00000000-0000-0000-0000-000000000000");
    } catch {
      // Either behaviour is conformant.
    }
    require_(
      (await store.search({ ...base, queryEmbedding: near, threshold: 0, limit: 10 })).length >= 1,
      "delete of an unknown id is harmless",
      "deleting a missing id must not remove other memories",
    );

    // Erase one agent, leave the other intact.
    await store.deleteAgentMemories("agent-a");
    require_(
      (await store.search({ ...base, queryEmbedding: near, threshold: 0, limit: 10 })).length === 0,
      "deleteAgentMemories erases the agent",
      "expected no memories for the erased agent",
    );
    require_(
      (
        await store.search({
          ...base,
          agentId: "agent-b",
          queryEmbedding: near,
          threshold: 0,
          limit: 10,
        })
      ).length === 1,
      "deleteAgentMemories scope",
      "erasing one agent must not touch another agent's memories",
    );
  } finally {
    await close(store);
  }
}
