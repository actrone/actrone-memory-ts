/**
 * Fact extraction on a local model (actrone.com/docs/memory/overview, "Fact extraction"). CI type-checks
 * this file against the current package source, and test/local-extraction-example.test.ts runs it
 * against a stand-in OpenAI-compatible server. The `#region` block is what the page shows; the live demo
 * suite runs the same wiring on Ollama.
 */
// #region memory-ts-local-extraction
import { MemoryManager, OpenAIFactExtractor } from 'actrone-memory'
import OpenAI from 'openai'

/** Extract facts with a model on any OpenAI-compatible server. */
export async function memoryWithLocalExtraction(
  baseURL = 'http://localhost:11434/v1',
): Promise<MemoryManager> {
  // Ollama ignores the key; the client needs one
  const client = new OpenAI({ baseURL, apiKey: 'ollama' })
  const extractor = new OpenAIFactExtractor(client, 'qwen2.5:3b')
  return MemoryManager.create({ extractor })
}

/** Turn the session's recent turns into stored facts. */
export async function learnFromSession(
  memory: MemoryManager,
  agentId: string,
  sessionId: string,
): Promise<string[]> {
  return memory.extractMemories(agentId, sessionId)
}
// #endregion memory-ts-local-extraction
