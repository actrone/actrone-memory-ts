// src/adapters.ts
function formatContext(ctx) {
  const sections = [];
  if (ctx.episodicMemories.length > 0) {
    const facts = ctx.episodicMemories.map((m) => `- ${m.content}`).join("\n");
    sections.push(`Relevant long-term memory:
${facts}`);
  }
  if (ctx.recentTurns.length > 0) {
    const turns = ctx.recentTurns.map((t) => `User: ${t.userMessage}
Assistant: ${t.assistantMessage}`).join("\n");
    sections.push(`Recent conversation:
${turns}`);
  }
  return sections.join("\n\n");
}
async function recall(mm, opts) {
  const context = await mm.retrieveContext(
    opts.agentId,
    opts.sessionId,
    opts.query,
    opts.tokenBudget
  );
  return { systemPrompt: formatContext(context), context };
}
async function remember(mm, opts) {
  return mm.storeTurn(opts.agentId, opts.sessionId, opts.userMessage, opts.assistantMessage);
}
function memoryFor(mm, agentId, sessionId) {
  return {
    recall: (query, tokenBudget = 4096) => recall(mm, { agentId, sessionId, query, tokenBudget }),
    remember: (userMessage, assistantMessage) => remember(mm, { agentId, sessionId, userMessage, assistantMessage }),
    search: (query, limit) => mm.searchMemories(agentId, query, limit),
    inject: (content, importance) => mm.injectMemory(agentId, content, importance)
  };
}
async function vercelMemory(mm, opts) {
  const { systemPrompt, context } = await recall(mm, {
    agentId: opts.agentId,
    sessionId: opts.sessionId,
    query: opts.query,
    tokenBudget: opts.tokenBudget ?? 4096
  });
  return {
    system: systemPrompt,
    context,
    onFinish: (userMessage) => async (event) => {
      await remember(mm, {
        agentId: opts.agentId,
        sessionId: opts.sessionId,
        userMessage,
        assistantMessage: event.text
      });
    }
  };
}
function langchainMemory(mm, ref) {
  const helper = memoryFor(mm, ref.agentId, ref.sessionId);
  return {
    loadContext: async (query, tokenBudget) => (await helper.recall(query, tokenBudget)).systemPrompt,
    saveTurn: (userMessage, assistantMessage) => helper.remember(userMessage, assistantMessage)
  };
}
function langgraphMemory(mm, ref) {
  const helper = memoryFor(mm, ref.agentId, ref.sessionId);
  return {
    loadMemories: async (query, tokenBudget) => {
      const { systemPrompt } = await helper.recall(query, tokenBudget);
      return systemPrompt ? { role: "system", content: systemPrompt } : null;
    },
    saveTurn: (userMessage, assistantMessage) => helper.remember(userMessage, assistantMessage)
  };
}
function mastraMemory(mm, ref) {
  const helper = memoryFor(mm, ref.agentId, ref.sessionId);
  return {
    getSystemContext: async (query, tokenBudget) => (await helper.recall(query, tokenBudget)).systemPrompt,
    remember: (userMessage, assistantMessage) => helper.remember(userMessage, assistantMessage)
  };
}

export { formatContext, langchainMemory, langgraphMemory, mastraMemory, memoryFor, recall, remember, vercelMemory };
//# sourceMappingURL=chunk-W242LSH6.js.map
//# sourceMappingURL=chunk-W242LSH6.js.map