import { beforeEach, describe, expect, it } from "vitest";

import { MemoryManager } from "../src/index.js";
import {
  formatContext,
  langchainMemory,
  langgraphMemory,
  mastraMemory,
  memoryFor,
  recall,
  remember,
  vercelMemory,
} from "../src/adapters.js";

describe("memory adapters", () => {
  let mm: MemoryManager;
  const agent = "bot";
  const session = "s1";

  beforeEach(async () => {
    mm = await MemoryManager.create({ config: { relevanceThreshold: 0.05 } });
  });

  it("formatContext renders turns and memories, and is empty when nothing is present", async () => {
    const empty = await mm.retrieveContext(agent, session, "q", 4096);
    expect(formatContext(empty)).toBe("");

    await mm.storeTurn(agent, session, "hi", "hello");
    await mm.injectMemory(agent, "The user likes concise answers.", 0.9);
    const ctx = await mm.retrieveContext(agent, session, "user concise answers", 4096);
    const text = formatContext(ctx);
    expect(text).toContain("concise");
    expect(text).toContain("Recent conversation");
  });

  it("recall returns a prompt-ready system string; remember persists a turn", async () => {
    await mm.injectMemory(agent, "Refunds take five days.", 0.9);
    const { systemPrompt, context } = await recall(mm, {
      agentId: agent,
      sessionId: session,
      query: "refunds five days",
      tokenBudget: 4096,
    });
    expect(systemPrompt).toContain("Refunds");
    expect(context.episodicMemories.length).toBeGreaterThanOrEqual(1);

    const turnId = await remember(mm, {
      agentId: agent,
      sessionId: session,
      userMessage: "hi",
      assistantMessage: "hello",
    });
    expect(turnId).toBeTruthy();
    expect((await mm.getSessionMetadata(agent, session))?.turnCount).toBe(1);
  });

  it("memoryFor binds recall/remember/search/inject to one conversation", async () => {
    const memory = memoryFor(mm, agent, session);
    const memId = await memory.inject("Durable fact about billing.", 0.9);
    expect(memId).toBeTruthy();

    await memory.remember("what's my plan?", "Enterprise.");
    const { systemPrompt } = await memory.recall("billing plan");
    expect(systemPrompt).toContain("billing");

    const hits = await memory.search("billing", 5);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it("vercelMemory yields a system string and an onFinish that persists the turn", async () => {
    await mm.injectMemory(agent, "Prefer bullet points.", 0.9);
    const mem = await vercelMemory(mm, { agentId: agent, sessionId: session, query: "bullet points" });
    expect(mem.system).toContain("bullet");

    await mem.onFinish("summarise this")({ text: "• a\n• b" });
    expect((await mm.getSessionMetadata(agent, session))?.turnCount).toBe(1);
  });

  it("langchainMemory exposes loadContext + saveTurn", async () => {
    const lc = langchainMemory(mm, { agentId: agent, sessionId: session });
    await lc.saveTurn("hello", "hi there");
    await mm.injectMemory(agent, "Account is in good standing.", 0.9);
    const ctx = await lc.loadContext("account standing");
    expect(ctx).toContain("standing");
    expect((await mm.getSessionMetadata(agent, session))?.turnCount).toBe(1);
  });

  it("langgraphMemory returns a system message to merge into graph state (or null)", async () => {
    const lg = langgraphMemory(mm, { agentId: agent, sessionId: session });
    expect(await lg.loadMemories("nothing here")).toBeNull();
    await mm.injectMemory(agent, "Customer prefers email over phone.", 0.9);
    const msg = await lg.loadMemories("prefers email phone");
    expect(msg?.role).toBe("system");
    expect(msg?.content).toContain("email");
    await lg.saveTurn("q", "a");
    expect((await mm.getSessionMetadata(agent, session))?.turnCount).toBe(1);
  });

  it("mastraMemory exposes getSystemContext + remember", async () => {
    const ms = mastraMemory(mm, { agentId: agent, sessionId: session });
    await mm.injectMemory(agent, "Ticket SLA is 24 hours.", 0.9);
    const sys = await ms.getSystemContext("sla");
    expect(sys).toContain("SLA");
    await ms.remember("q", "a");
    expect((await mm.getSessionMetadata(agent, session))?.turnCount).toBe(1);
  });
});
