/**
 * Compiled, type-checked docs examples for @actrone/memory (rendered in the docs by id). CI type-checks this file against the CURRENT package source, so an API change that breaks
 * a documented snippet fails the build. The marked `#region` blocks are extracted verbatim into the
 * docs by `scripts/extract-snippets.mjs`, the guide never hand-types these, so they cannot drift.
 *
 * The import path resolves to the package source via the examples tsconfig `paths` mapping, so the
 * snippet reads exactly as a consumer would write it (`@actrone/memory`) while type-checking against
 * the local source.
 */
// #region memory-ts-quickstart
import { MemoryManager } from '@actrone/memory'

// In-memory + local embedder by default: no Redis/Qdrant required to start
const memory = await MemoryManager.create()

await memory.storeTurn(
  'research-agent',
  'session-42',
  'Summarise Q4 earnings for AAPL',
  'Apple reported revenue of $119.6B in Q4 2024, up 6% YoY...',
)

const context = await memory.retrieveContext(
  'research-agent',
  'session-42',
  'Apple revenue Q4',
  2000,
)

// context.recentTurns          : recent session turns (L1)
// context.episodicMemories     : semantically relevant long-term memories (L2)
// context.totalTokensUsed      : tokens consumed across both tiers
// context.retrievalDurationMs  : retrieval latency in milliseconds
// #endregion memory-ts-quickstart

// Keep the compiler honest that the retrieved context is actually consumed.
export const recentTurnCount = context.recentTurns.length
