import type { Sensitivity } from "./models.js";

/**
 * Turns → durable facts, conforming to the shared extraction spec v1. Kept in lockstep with the
 * Python `actrone_memory.extraction` module: "improve once" means updating the prompt/schema and
 * the eval together in both libraries.
 *
 * Extraction is best-effort, LLM-gated enrichment: a failure yields no facts and
 * never breaks the write path.
 */

/** Spec version: bump on any prompt/schema change; keep the two libs aligned. */
export const EXTRACTION_SPEC_VERSION = "1.0";

/** Canonical system prompt (identical wording to the Python lib). */
export const EXTRACTION_SYSTEM_PROMPT =
  "You extract durable, atomic facts from a conversation so an AI agent can " +
  "remember them across sessions. Return ONLY facts worth remembering long term: " +
  "stable user attributes, preferences, decisions, commitments, and key entities. " +
  "Ignore small talk, transient state, and anything already obvious.\n" +
  "For each fact, classify its sensitivity: 'none' (non-personal), 'low' (mild " +
  "preference), 'pii' (personally identifiable, names, emails, phone, address, " +
  "account numbers), or 'sensitive' (health, financial, credentials, special " +
  "category). Assign an importance from 0.0 to 1.0.\n" +
  'Respond with strict JSON of the form {"facts": [{"content": "...", ' +
  '"sensitivity": "none", "topic_tags": ["..."], "importance": 0.7}]}. ' +
  "Write each fact as a self-contained sentence. Return an empty list if there is " +
  "nothing durable to remember.";

/** One atomic fact extracted from conversation. */
export interface ExtractedFact {
  readonly content: string;
  readonly sensitivity: Sensitivity;
  readonly topicTags: readonly string[];
  /** Importance 0.0-1.0. */
  readonly importance: number;
}

/** Seam for turning conversation text into durable facts. LLM-backed. */
export interface FactExtractor {
  extract(text: string): Promise<ExtractedFact[]>;
}

const MAX_FACTS = 20;
const MAX_FACT_CHARS = 2_000;
const VALID_SENSITIVITY = new Set<Sensitivity>(["none", "low", "pii", "sensitive"]);

/**
 * Parse a model's JSON response into validated facts, defensively. Tolerates a
 * bare array or a `{ facts: [...] }` envelope, skips malformed entries, clamps
 * oversize content, bounds the count, and never throws (bad JSON → `[]`).
 */
export function parseFacts(raw: string): ExtractedFact[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const items = Array.isArray(data)
    ? data
    : typeof data === "object" && data !== null && Array.isArray((data as Record<string, unknown>)["facts"])
      ? ((data as Record<string, unknown>)["facts"] as unknown[])
      : null;
  if (!items) return [];

  const facts: ExtractedFact[] = [];
  for (const item of items.slice(0, MAX_FACTS)) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const content = rec["content"];
    if (typeof content !== "string" || content.trim().length === 0) continue;

    const sensitivity = rec["sensitivity"];
    if (sensitivity !== undefined && !VALID_SENSITIVITY.has(sensitivity as Sensitivity)) continue;

    const importanceRaw = rec["importance"];
    const importance = typeof importanceRaw === "number" ? importanceRaw : 0.6;
    if (importance < 0 || importance > 1 || Number.isNaN(importance)) continue;

    const tags = Array.isArray(rec["topicTags"])
      ? rec["topicTags"]
      : Array.isArray(rec["topic_tags"])
        ? rec["topic_tags"]
        : [];

    facts.push({
      content: content.trim().slice(0, MAX_FACT_CHARS),
      sensitivity: (sensitivity as Sensitivity) ?? "none",
      topicTags: (tags as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 20),
      importance,
    });
  }
  return facts;
}

/**
 * Minimal structural interface for an OpenAI-compatible chat client (the
 * `openai` SDK's `AsyncOpenAI` satisfies it), injected so `actrone-memory` needs
 * no hard `openai` dependency.
 */
export interface ChatCompleterLike {
  readonly chat: {
    readonly completions: {
      create(args: {
        model: string;
        messages: Array<{ role: string; content: string }>;
        response_format?: { type: "json_object" };
        max_tokens?: number;
        temperature?: number;
      }): Promise<{ choices: Array<{ message: { content: string | null } }> }>;
    };
  };
}

/** LLM fact extractor over an OpenAI-compatible client, conforming to the spec. */
export class OpenAIFactExtractor implements FactExtractor {
  private readonly client: ChatCompleterLike;
  private readonly model: string;

  constructor(client: ChatCompleterLike, model = "gpt-4o-mini") {
    this.client = client;
    this.model = model;
  }

  async extract(text: string): Promise<ExtractedFact[]> {
    try {
      const res = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
        max_tokens: 800,
        temperature: 0.1,
      });
      return parseFacts(res.choices[0]?.message.content ?? "{}");
    } catch {
      // Best-effort: never break the caller.
      return [];
    }
  }
}
