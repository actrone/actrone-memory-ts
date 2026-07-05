import { beforeEach, describe, expect, it } from "vitest";

import {
  budgetUtilisation,
  MemoryManager,
  MemoryNotFoundError,
  TokenBudgetError,
  ValidationError,
} from "../src/index.js";

/**
 * The M1 memory contract, exercised against the in-memory MemoryManager. The
 * hosted drop-in (`@actrone/sdk` `ActroneMemoryManager`) is held to the same
 * behavioural contract in its own test, so the one-import swap is safe.
 */
describe("MemoryManager (contract)", () => {
  let mm: MemoryManager;
  const agent = "support-bot";
  const session = "sess-1";

  beforeEach(async () => {
    // A low relevance threshold makes the deterministic local embedder's
    // word-overlap similarity reliably admit related text in tests.
    mm = await MemoryManager.create({ config: { relevanceThreshold: 0.05 } });
  });

  it("stores a turn and retrieves it as recent context", async () => {
    const turnId = await mm.storeTurn(agent, session, "what is the capital of France?", "Paris.");
    expect(turnId).toBeTruthy();

    const ctx = await mm.retrieveContext(agent, session, "capital of France", 4096);
    expect(ctx.recentTurns).toHaveLength(1);
    expect(ctx.recentTurns[0]?.assistantMessage).toBe("Paris.");
    expect(ctx.totalTokensUsed).toBeGreaterThan(0);
    expect(ctx.tokenBudget).toBe(4096);
    expect(budgetUtilisation(ctx)).toBeGreaterThan(0);
  });

  it("prunes session turns to the session budget (newest kept)", async () => {
    // ~25 tokens each ("aaaa..." 100 chars → ceil(100/4)=25 → x2 messages ≈ 50).
    for (let i = 0; i < 10; i++) {
      await mm.storeTurn(agent, session, `q${i} ${"a".repeat(100)}`, `r${i} ${"b".repeat(100)}`);
    }
    // sessionBudget = 200 * 0.35 = 70 tokens → only the newest turn(s) fit.
    const ctx = await mm.retrieveContext(agent, session, "hello", 200);
    expect(ctx.recentTurns.length).toBeGreaterThanOrEqual(1);
    expect(ctx.recentTurns.length).toBeLessThan(10);
    // The most recent turn must be present (chronological order → last element).
    expect(ctx.recentTurns[ctx.recentTurns.length - 1]?.userMessage).toContain("q9");
  });

  it("injects a memory, finds it by semantic search, then deletes it", async () => {
    const memId = await mm.injectMemory(agent, "The user prefers dark mode and concise answers.", 0.9);
    expect(memId).toBeTruthy();

    const hits = await mm.searchMemories(agent, "user preference dark mode", 5);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.content).toContain("dark mode");
    expect(hits[0]?.relevanceScore).toBeGreaterThan(0);

    await mm.deleteMemory(agent, memId);
    const after = await mm.searchMemories(agent, "user preference dark mode", 5);
    expect(after).toHaveLength(0);
  });

  it("surfaces injected memories in retrieveContext episodic slot", async () => {
    await mm.injectMemory(agent, "Company policy: refunds are processed within 5 business days.", 0.9);
    const ctx = await mm.retrieveContext(agent, session, "refund policy business days", 4096);
    expect(ctx.episodicMemories.length).toBeGreaterThanOrEqual(1);
    expect(ctx.episodicMemories[0]?.content).toContain("refunds");
  });

  it("clearSession removes turns but keeps injected long-term memories", async () => {
    await mm.storeTurn(agent, session, "hi", "hello");
    await mm.injectMemory(agent, "Durable fact about the account holder.", 0.9);

    await mm.clearSession(agent, session);

    expect(await mm.getSessionMetadata(agent, session)).toBeNull();
    const hits = await mm.searchMemories(agent, "durable fact account holder", 5);
    expect(hits.length).toBeGreaterThanOrEqual(1); // long-term memory survived
  });

  it("reports session metadata (null before any turn, populated after)", async () => {
    expect(await mm.getSessionMetadata(agent, "empty")).toBeNull();
    await mm.storeTurn(agent, session, "a", "b");
    await mm.storeTurn(agent, session, "c", "d");
    const meta = await mm.getSessionMetadata(agent, session);
    expect(meta).not.toBeNull();
    expect(meta?.turnCount).toBe(2);
    expect(meta?.createdAt).toBeTruthy();
    expect(meta?.lastActive).toBeTruthy();
  });

  // ── Error paths ────────────────────────────────────────────────────────────

  it("rejects an empty agent id", async () => {
    await expect(mm.storeTurn("", session, "u", "a")).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a non-positive token budget", async () => {
    await mm.storeTurn(agent, session, "u", "a");
    await expect(mm.retrieveContext(agent, session, "q", 0)).rejects.toBeInstanceOf(TokenBudgetError);
    await expect(mm.retrieveContext(agent, session, "q", -5)).rejects.toBeInstanceOf(TokenBudgetError);
  });

  it("rejects out-of-range importance and non-positive search limit", async () => {
    await expect(mm.injectMemory(agent, "x", 1.5)).rejects.toBeInstanceOf(ValidationError);
    await expect(mm.injectMemory(agent, "   ")).rejects.toBeInstanceOf(ValidationError);
    await expect(mm.searchMemories(agent, "q", 0)).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws MemoryNotFoundError when deleting an unknown memory", async () => {
    await expect(mm.deleteMemory(agent, "does-not-exist")).rejects.toBeInstanceOf(MemoryNotFoundError);
  });

  it("isolates memories by agent", async () => {
    await mm.injectMemory("agent-a", "secret alpha content here", 0.9);
    const other = await mm.searchMemories("agent-b", "secret alpha content", 5);
    expect(other).toHaveLength(0);
  });
});
