/**
 * Use case: a personal assistant (actrone.com/use-cases/personal-assistants).
 *
 * CI type-checks this file against the current source, and `test/use-cases.test.ts` runs it and
 * asserts what the page claims: preferences outlive the conversation that produced them, and each
 * one arrives tagged with its sensitivity. The `#region` block is what the page shows.
 */
// #region memory-ts-use-case-assistant
import { MemoryManager, type Sensitivity } from "actrone-memory";

// One scope per user: everything below is recalled for this user only.
const scopeFor = (userId: string) => `user:${userId}`;

// Keep something the user told you, with the sensitivity you judge it to have.
export async function rememberAboutUser(
  memory: MemoryManager,
  userId: string,
  fact: string,
  sensitivity: Sensitivity = "low",
) {
  return memory.injectMemory(scopeFor(userId), fact, 0.9, "profile", [], "user", sensitivity);
}

// Each conversation is a session: its turns feed the next reply in the same conversation.
export async function recordTurn(
  memory: MemoryManager,
  userId: string,
  conversationId: string,
  userMessage: string,
  reply: string,
) {
  await memory.storeTurn(scopeFor(userId), conversationId, userMessage, reply);
}

// Recall for a new message; each fact keeps its tag, so you decide what the model sees.
export async function recallFor(
  memory: MemoryManager,
  userId: string,
  conversationId: string,
  message: string,
) {
  const context = await memory.retrieveContext(scopeFor(userId), conversationId, message, 1500);
  return {
    facts: context.episodicMemories.map((m) => ({ content: m.content, sensitivity: m.sensitivity })),
    recentTurns: context.recentTurns.length,
  };
}

// Closing a conversation drops its turns. What you remembered about the user stays.
export async function endConversation(memory: MemoryManager, userId: string, conversationId: string) {
  await memory.clearSession(scopeFor(userId), conversationId);
}
// #endregion memory-ts-use-case-assistant
