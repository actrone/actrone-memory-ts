import type { Sensitivity } from "./models.js";

/**
 * Turns → durable facts, conforming to the shared extraction spec v1. Kept in lockstep with the
 * Python `actrone_memory.extraction` module: "improve once" means updating the prompt/schema and
 * the eval together in both libraries.
 *
 * Extraction is best-effort, LLM-gated enrichment: a failure yields no facts and
 * never breaks the write path.
 */

/**
 * Spec version: bump on any prompt/schema change; keep the two libs aligned.
 *
 * 1.1: small models (a 3B model on Ollama, measured) returned "{}" for nearly every real exchange
 * under 1.0, because they read the assistant's reply as part of what to mine. 1.1 frames the
 * conversation, says whose facts to record, sends a JSON schema, and gives two worked examples: one
 * with facts and one where the right answer is none.
 */
export const EXTRACTION_SPEC_VERSION = "1.1";

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
  "nothing durable to remember.\n" +
  "The conversation is between a user and an AI assistant. Extract facts about the user " +
  "and their world from what the user says; use the assistant's replies only as context, " +
  "never as a source of facts.\n" +
  "Write one fact per piece of information: a name and a job are two facts. Classify each " +
  "fact by the most sensitive detail it contains: a person's name, email address, phone " +
  "number or postal address is 'pii'; health, emotions or mental state, money and " +
  "credentials are 'sensitive'; a preference is 'low'; everything else is 'none'.\n" +
  "Only record facts the user states about themselves, their work or their world. Never " +
  "record facts about the conversation itself (such as what the user asked), about the " +
  "assistant, or general knowledge from the assistant's answers. If the user only makes " +
  "small talk, thanks the assistant, " +
  'or asks a general question, return {"facts": []}.\n' +
  "Example, not part of the conversation you are given:\n" +
  "User: I'm Sam, a nurse, and I've been struggling with insomnia. Email me at " +
  "sam@example.org. I like short replies.\n" +
  "Assistant: Thanks Sam, noted.\n" +
  'Output: {"facts": [' +
  '{"content": "The user\'s name is Sam.", "sensitivity": "pii", "topic_tags": ["identity"], "importance": 0.8}, ' +
  '{"content": "The user works as a nurse.", "sensitivity": "none", "topic_tags": ["role"], "importance": 0.6}, ' +
  '{"content": "The user has been struggling with insomnia.", "sensitivity": "sensitive", "topic_tags": ["health"], "importance": 0.7}, ' +
  '{"content": "The user\'s email address is sam@example.org.", "sensitivity": "pii", "topic_tags": ["contact"], "importance": 0.8}, ' +
  '{"content": "The user prefers short replies.", "sensitivity": "low", "topic_tags": ["preference"], "importance": 0.5}]}\n' +
  "Second example, also not part of the conversation:\n" +
  "User: Thanks, that helps!\n" +
  "Assistant: Glad to help. The Moon is about 384,000 km away, by the way.\n" +
  'Output: {"facts": []}';

/**
 * JSON schema for the extraction output, sent as a structured-output `response_format` so
 * constrained decoding keeps even a small model on the contract. Strict-mode shaped (every property
 * required, no extra properties) so OpenAI accepts it with `strict`.
 */
export const EXTRACTION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          content: { type: "string" },
          sensitivity: { type: "string", enum: ["none", "low", "pii", "sensitive"] },
          topic_tags: { type: "array", items: { type: "string" } },
          importance: { type: "number" },
        },
        required: ["content", "sensitivity", "topic_tags", "importance"],
        additionalProperties: false,
      },
    },
  },
  required: ["facts"],
  additionalProperties: false,
} as const;

/**
 * Frame a conversation (`User: ...` / `Assistant: ...` lines) as the extraction request's user
 * message, per the shared spec. Custom `FactExtractor`s that call a model should send this rather
 * than the raw conversation.
 */
export function formatExtractionInput(conversation: string): string {
  return `Conversation:\n\n${conversation}\n\nExtract the durable facts from this conversation.`;
}

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
 * Minimal structural interface for an OpenAI-compatible chat client (an `openai`
 * SDK `OpenAI` instance satisfies it, as examples/local-extraction.ts type-checks),
 * injected so `actrone-memory` needs no hard `openai` dependency. The roles are
 * the literal ones the extractor sends: the SDK's message types reject a plain
 * `string` role, which made a real client fail to compile here.
 */
export interface ChatCompleterLike {
  readonly chat: {
    readonly completions: {
      create(args: {
        model: string;
        messages: Array<{ role: "system" | "user"; content: string }>;
        response_format?: ExtractionResponseFormat;
        max_tokens?: number;
        temperature?: number;
      }): Promise<{ choices: Array<{ message: { content: string | null } }> }>;
    };
  };
}

/** The structured-output formats the extractor asks for: a JSON schema, or plain JSON mode. */
export type ExtractionResponseFormat =
  | { type: "json_schema"; json_schema: { name: string; strict: boolean; schema: typeof EXTRACTION_RESPONSE_SCHEMA } }
  | { type: "json_object" };

const SCHEMA_FORMAT: ExtractionResponseFormat = {
  type: "json_schema",
  json_schema: { name: "extracted_facts", strict: true, schema: EXTRACTION_RESPONSE_SCHEMA },
};
const JSON_FORMAT: ExtractionResponseFormat = { type: "json_object" };

/** A server refusing the request itself (400/422), as opposed to a transient failure. */
function isRejection(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 400 || status === 422;
}

/**
 * LLM fact extractor for any OpenAI-compatible chat client, conforming to the spec. Works with
 * OpenAI itself and with local or self-hosted servers that speak the same API (Ollama, vLLM, LM
 * Studio): pass an `openai` client built with their `baseURL`. It asks for a JSON-schema structured
 * output and, if a server rejects that, falls back to plain JSON mode for the rest of its life.
 */
export class OpenAIFactExtractor implements FactExtractor {
  private readonly client: ChatCompleterLike;
  private readonly model: string;
  private useSchema = true;

  constructor(client: ChatCompleterLike, model = "gpt-4o-mini") {
    this.client = client;
    this.model = model;
  }

  async extract(text: string): Promise<ExtractedFact[]> {
    try {
      if (!this.useSchema) return await this.complete(text, JSON_FORMAT);
      try {
        return await this.complete(text, SCHEMA_FORMAT);
      } catch (error) {
        // Only a server that rejects the request lacks json_schema support; anything else
        // (timeouts, 5xx) is not a reason to give up the schema.
        if (!isRejection(error)) throw error;
      }
      const facts = await this.complete(text, JSON_FORMAT);
      this.useSchema = false;
      return facts;
    } catch {
      // Best-effort: never break the caller.
      return [];
    }
  }

  private async complete(text: string, responseFormat: ExtractionResponseFormat): Promise<ExtractedFact[]> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: formatExtractionInput(text) },
      ],
      response_format: responseFormat,
      max_tokens: 800,
      temperature: 0.1,
    });
    return parseFacts(res.choices[0]?.message.content ?? "{}");
  }
}
