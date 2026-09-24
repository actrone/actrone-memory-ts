/**
 * Use case: a coding assistant (actrone.com/use-cases/coding-assistants).
 *
 * CI type-checks this file against the current source, and `test/use-cases.test.ts` runs it and
 * asserts what the page claims: conventions stay with their repository and the recalled context
 * never exceeds the budget. The `#region` block is what the page shows.
 */
// #region memory-ts-use-case-coding
import { MemoryManager } from "actrone-memory";

// One scope per repository, so one codebase's conventions never leak into another's.
const scopeFor = (repo: string) => `repo:${repo}`;

// Record a convention once, when the developer or a code review states it.
export async function learnConvention(memory: MemoryManager, repo: string, convention: string) {
  return memory.injectMemory(scopeFor(repo), convention, 0.9, "conventions", ["convention"], "user");
}

// Before each request, recall this task's conventions within a token budget.
export async function conventionsFor(
  memory: MemoryManager,
  repo: string,
  sessionId: string,
  task: string,
) {
  const context = await memory.retrieveContext(scopeFor(repo), sessionId, task, 800);
  return {
    conventions: context.episodicMemories.map((m) => m.content),
    tokensUsed: context.totalTokensUsed,
  };
}

// Keep the exchange, so the next request in this session sees it.
export async function recordExchange(
  memory: MemoryManager,
  repo: string,
  sessionId: string,
  request: string,
  answer: string,
) {
  await memory.storeTurn(scopeFor(repo), sessionId, request, answer);
}
// #endregion memory-ts-use-case-coding
