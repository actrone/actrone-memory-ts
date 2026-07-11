import { beforeEach, describe, expect, it } from "vitest";

import { MemoryManager } from "../src/index.js";
import {
  formatContext,
  genkitMemory,
  langchainChatHistory,
  langchainMemory,
  langgraphMemory,
  llamaindexChatMemory,
  llamaindexMemory,
  loadMessages,
  mastraMemory,
  memoryFor,
  openaiAgentsMemory,
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

  it("llamaindexMemory exposes getSystemPrompt + saveTurn", async () => {
    const li = llamaindexMemory(mm, { agentId: agent, sessionId: session });
    await mm.injectMemory(agent, "Index rebuilds nightly at 2am.", 0.9);
    const sys = await li.getSystemPrompt("index rebuild");
    expect(sys).toContain("rebuilds");
    await li.saveTurn("q", "a");
    expect((await mm.getSessionMetadata(agent, session))?.turnCount).toBe(1);
  });

  it("openaiAgentsMemory prepends memory to base instructions (and returns base when empty)", async () => {
    const oa = openaiAgentsMemory(mm, { agentId: agent, sessionId: session });
    // No memory yet ⇒ the base instructions come back unchanged.
    expect(await oa.withMemory("You are a helpful agent.", "nothing here")).toBe("You are a helpful agent.");

    await mm.injectMemory(agent, "The customer is on the Enterprise plan.", 0.9);
    const merged = await oa.withMemory("You are a helpful agent.", "enterprise plan");
    expect(merged).toContain("Enterprise");
    expect(merged).toContain("You are a helpful agent.");
    expect(merged.indexOf("Enterprise")).toBeLessThan(merged.indexOf("You are a helpful agent."));

    await oa.remember("q", "a");
    expect((await mm.getSessionMetadata(agent, session))?.turnCount).toBe(1);
  });

  it("genkitMemory exposes getSystem + remember", async () => {
    const gk = genkitMemory(mm, { agentId: agent, sessionId: session });
    await mm.injectMemory(agent, "Deployments require two approvals.", 0.9);
    const sys = await gk.getSystem("deploy approvals");
    expect(sys).toContain("approvals");
    await gk.remember("q", "a");
    expect((await mm.getSessionMetadata(agent, session))?.turnCount).toBe(1);
  });

  // ── Deep integrations (structured messages + real framework memory contracts) ──

  it("loadMessages returns a system memory message + turns as role-tagged messages", async () => {
    await mm.storeTurn(agent, session, "hi", "hello");
    await mm.injectMemory(agent, "The user prefers dark mode.", 0.9);
    const msgs = await loadMessages(mm, { agentId: agent, sessionId: session, query: "user prefers dark mode" });
    expect(msgs[0]?.role).toBe("system");
    expect(msgs[0]?.content).toContain("dark mode");
    expect(msgs.some((m) => m.role === "user" && m.content === "hi")).toBe(true);
    expect(msgs.some((m) => m.role === "assistant" && m.content === "hello")).toBe(true);
  });

  it("langchainChatHistory implements the BaseChatMessageHistory contract", async () => {
    const history = langchainChatHistory(mm, { agentId: agent, sessionId: session });
    // addMessage pairs a human then the following ai into one governed turn.
    await history.addMessage({ _getType: () => "human", content: "what is my plan?" });
    await history.addMessage({ _getType: () => "ai", content: "Enterprise." });
    expect((await mm.getSessionMetadata(agent, session))?.turnCount).toBe(1);

    const messages = await history.getMessages();
    expect(messages.map((m) => m._getType())).toEqual(["human", "ai"]);
    expect(messages[0]?.content).toBe("what is my plan?");
    expect(messages[1]?.content).toBe("Enterprise.");

    await history.clear();
    expect(await mm.getSessionMetadata(agent, session)).toBeNull();
  });

  it("langchainChatHistory emits real message-class instances when provided", async () => {
    class Human {
      constructor(public content: string) {}
      _getType() {
        return "human";
      }
    }
    class Ai {
      constructor(public content: string) {}
      _getType() {
        return "ai";
      }
    }
    const history = langchainChatHistory(
      mm,
      { agentId: agent, sessionId: session },
      { messageClasses: { human: Human, ai: Ai } },
    );
    await history.addMessages([
      { _getType: () => "human", content: "q" },
      { _getType: () => "ai", content: "a" },
    ]);
    const messages = await history.getMessages();
    expect(messages[0]).toBeInstanceOf(Human);
    expect(messages[1]).toBeInstanceOf(Ai);
  });

  it("llamaindexChatMemory implements the current Memory add/get/clear contract", async () => {
    const memory = llamaindexChatMemory(mm, { agentId: agent, sessionId: session });
    await memory.add({ role: "user", content: "hello" });
    await memory.add({ role: "assistant", content: "hi there" });
    expect((await mm.getSessionMetadata(agent, session))?.turnCount).toBe(1);

    const messages = await memory.get();
    expect(messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
    expect(await memory.getAll()).toEqual(messages);

    await memory.clear();
    expect(await mm.getSessionMetadata(agent, session)).toBeNull();
  });
});
