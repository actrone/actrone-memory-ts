# Memory Spec: Fact Extraction v1.1

> Language-neutral reference for turns → durable facts. Part of the shared memory
> spec (see [Memory Strategy & Roadmap](../Actrone_Memory_Strategy_And_Roadmap.md) §1:
> *one spec + one eval, two implementations*). Both OSS libs (`actrone-memory-py`,
> `actrone-memory-ts`) and the hosted engine conform to **this** contract, so
> "improve once" = update this spec + the eval, and every implementation follows.
>
> **Spec version:** `1.1` (exposed as `EXTRACTION_SPEC_VERSION` in each lib). Bump on
> any change to the prompt, the input framing or the output schema; keep the two libs in
> lockstep. Both libs pin the prompt's SHA-256 in a unit test:
> `c25f946a45428b327a6983f8d5e7f8052a06736ac6cb1795824fb3e564593b09`. Update the hash here
> and in both test suites together.
>
> **What changed in 1.1 (2026-10-01).** Under 1.0, `qwen2.5:3b` on Ollama returned `{}` on
> 12 of 15 real exchanges (user line plus the assistant's reply), because small models read
> the reply as part of what to mine. 1.1 adds the input framing, says whose facts to record,
> sends the output as a JSON-schema structured output, and gives two worked examples (one with
> facts, one where the answer is none). On the same model it found 14 of 14 expected facts and
> returned nothing for a thank-you. Known limits on a 3B model: it still records "the user asked
> about X" for a general question, and it under-tags preferences (`low`) and feelings
> (`sensitive`). Larger models follow the rules.
>
> **Status refreshed 2026-07-13 (code-verified):** the hosted engine's storage mapping (§"Storage
> mapping" below) is confirmed live: `memorydepth.Service.Ingest` (Go) redacts, classifies
> sensitivity, and persists facts consumed by a confirmed-live `Retrieve` path (see
> `Actrone_Memory_Strategy_And_Roadmap.md`'s refresh note for the full call chain).
>
> **Lockstep, 2026-10-01:** the Python and TypeScript libraries' prompt, framing, schema and
> version were compared byte for byte and match this document, and both now pin the prompt hash
> above in a test. The hosted engine's prompt was not compared in this pass.

---

## Purpose

Extract **durable, atomic facts** from a conversation so an agent can remember them
across sessions: stable user attributes, preferences, decisions, commitments, and
key entities. Ignore small talk, transient state, and anything already obvious.

Extraction is **best-effort enrichment**: a failure or an empty result must never
break the write path. It is **LLM-gated and opt-in** (it costs a model call).

## System prompt (canonical)

Each line below is one line of the prompt (the libraries join them with `\n`); long lines are
not wrapped, so copy them exactly. The SHA-256 above is of this text.

```text
You extract durable, atomic facts from a conversation so an AI agent can remember them across sessions. Return ONLY facts worth remembering long term: stable user attributes, preferences, decisions, commitments, and key entities. Ignore small talk, transient state, and anything already obvious.
For each fact, classify its sensitivity: 'none' (non-personal), 'low' (mild preference), 'pii' (personally identifiable, names, emails, phone, address, account numbers), or 'sensitive' (health, financial, credentials, special category). Assign an importance from 0.0 to 1.0.
Respond with strict JSON of the form {"facts": [{"content": "...", "sensitivity": "none", "topic_tags": ["..."], "importance": 0.7}]}. Write each fact as a self-contained sentence. Return an empty list if there is nothing durable to remember.
The conversation is between a user and an AI assistant. Extract facts about the user and their world from what the user says; use the assistant's replies only as context, never as a source of facts.
Write one fact per piece of information: a name and a job are two facts. Classify each fact by the most sensitive detail it contains: a person's name, email address, phone number or postal address is 'pii'; health, emotions or mental state, money and credentials are 'sensitive'; a preference is 'low'; everything else is 'none'.
Only record facts the user states about themselves, their work or their world. Never record facts about the conversation itself (such as what the user asked), about the assistant, or general knowledge from the assistant's answers. If the user only makes small talk, thanks the assistant, or asks a general question, return {"facts": []}.
Example, not part of the conversation you are given:
User: I'm Sam, a nurse, and I've been struggling with insomnia. Email me at sam@example.org. I like short replies.
Assistant: Thanks Sam, noted.
Output: {"facts": [{"content": "The user's name is Sam.", "sensitivity": "pii", "topic_tags": ["identity"], "importance": 0.8}, {"content": "The user works as a nurse.", "sensitivity": "none", "topic_tags": ["role"], "importance": 0.6}, {"content": "The user has been struggling with insomnia.", "sensitivity": "sensitive", "topic_tags": ["health"], "importance": 0.7}, {"content": "The user's email address is sam@example.org.", "sensitivity": "pii", "topic_tags": ["contact"], "importance": 0.8}, {"content": "The user prefers short replies.", "sensitivity": "low", "topic_tags": ["preference"], "importance": 0.5}]}
Second example, also not part of the conversation:
User: Thanks, that helps!
Assistant: Glad to help. The Moon is about 384,000 km away, by the way.
Output: {"facts": []}
```

## Input framing (1.1)

The extractor's user message is the conversation (`User: ...` and `Assistant: ...` lines, one
pair per turn) framed as:

```text
Conversation:

<the conversation>

Extract the durable facts from this conversation.
```

Both libraries export the framing (`format_extraction_input` / `formatExtractionInput`) so a
custom extractor sends the same request.

## Structured output (1.1)

The request asks for a JSON-schema structured output (`response_format` of type
`json_schema`, name `extracted_facts`, `strict: true`) with the schema each library exports as
`EXTRACTION_RESPONSE_SCHEMA`: an object with a required `facts` array whose items require
`content`, `sensitivity` (the enum below), `topic_tags` and `importance`, with no extra
properties. A server that rejects the schema (HTTP 400 or 422) gets plain JSON mode
(`{"type": "json_object"}`) for that call and every later one. Any other failure (a timeout, a
5xx) keeps the schema and the call returns no facts.

## Output schema

The model returns a JSON object with a `facts` array. Each fact:

| Field | Type | Rules |
| --- | --- | --- |
| `content` | string | Required, non-empty, self-contained sentence. Clamp to 2 000 chars. |
| `sensitivity` | enum | One of `none` \| `low` \| `pii` \| `sensitive`. Default `none`. |
| `topic_tags` | string[] | Optional. Cap 20 tags. |
| `importance` | number | 0.0 to 1.0. Default 0.6. |

## Parser rules (both libs implement identically)

- Accept a `{"facts": [...]}` envelope **or** a bare `[...]` array.
- Skip any entry that is not an object or has no non-empty string `content`.
- Skip (do not fail the batch) an entry with an out-of-range `importance` or an
  invalid `sensitivity` enum.
- Bound the batch to **20 facts**; clamp `content` to **2 000 chars**.
- Unparseable JSON → empty list (never raise).

## Storage mapping

Each extracted fact is stored as a first-class memory:

- `content_type = "fact"`
- `source = "extracted"`
- `sensitivity` = the classified value (provenance-typing v1)
- `source_turn_ids` = the turns the extraction ran over
- `importance_score` = the fact's `importance`
