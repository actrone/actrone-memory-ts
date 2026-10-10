# Use case: customer support agents

Route: `/use-cases/customer-support`. Shared rules and template: [README](README.md).

## Goal and reader

A developer building a support agent should leave knowing how to give it memory of each customer, keep personal data out of prompts, and honour a deletion request, and should be able to copy working code for all three.

## Key message

Remember the customer, not just the ticket: one scope per customer, sensitivity tags on every fact, and erasure in one call.

## Search and social

| Field | Value |
| --- | --- |
| Title | Memory for customer support agents |
| Description | Give a support agent memory of each customer across tickets, keep personal data out of the prompt, and erase a customer in one call. |
| Social card | "Remember the customer, not just the ticket." Scoped per customer · Sensitivity tags · One-call erasure |

## Content

- **Hero:** "Support agents that remember the customer, not just the ticket". The lede promises storing facts once, recall per ticket, keeping personal data out of the prompt, and erasure, with no services to run while building.
- **The problem** ("Every ticket starts from zero"): customers explain themselves again; personal data rides along in every prompt; deletion requests mean a search.
- **How it works** ("Five steps, one scope per customer"): scope rule `customer:<id>`, then the five steps below.

| Step | TypeScript | Python |
| --- | --- | --- |
| Import what you already know, with source `import:crm` and a sensitivity tag | `injectMemory` | `inject_memory` |
| Recall for each ticket, within a token budget | `retrieveContext` | `retrieve_context` |
| Filter before the model (your code, on `m.sensitivity`) | field | field |
| Keep the conversation | `storeTurn` | `store_turn` |
| Erase on request | `eraseAgentMemories` | `erase_agent_memories` |

- **The code:** `support.ts` and `support.py` (`import_account`, `answer_ticket` with an injected `callModel`, `forget_customer`).

## Claims and their proof

| Claim on the page | Test (both packages) |
| --- | --- |
| The answer draws on the customer's own facts | answers from own facts: the plan fact reaches the model |
| The email never reaches the model | the same test: no `@` in the facts passed to the model |
| Customers stay apart | keeps customers apart: customer c-2 recalls nothing of c-1 |
| One call erases the customer and the ticket's turns | erases in one call: no facts, no turns afterwards |

## Limits shown

1. Tags come from you or from your extractor, and a hosted extraction model sees the raw text.
2. It returns tags; it does not redact.
3. Erasure covers the configured stores, not copies in logs, analytics or a provider's retention. Turns on other tickets stay until cleared, or until they expire in Redis.
4. Recall matches shared words until a local model is installed.
5. A library, not a helpdesk: no Zendesk, Intercom or Freshdesk connector.
6. It does not make a support process compliant; it provides scoped storage, tags and an erase call.

## Deliberately excluded

Compliance claims (GDPR, POPIA, SOC 2), ticket-deflection percentages, customer logos, and any statement that the library redacts or tokenises personal data. Tokenising before inference is a hosted-platform feature and is not claimed here.
