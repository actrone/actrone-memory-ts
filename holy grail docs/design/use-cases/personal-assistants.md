# Use case: personal assistants

Route: `/use-cases/personal-assistants`. Shared rules and template: [README](README.md).

## Goal and reader

A developer building a personal assistant should leave knowing how to keep what the assistant learns about a user across conversations, and how sensitivity tags let them decide what reaches a hosted model.

## Key message

Remember the person, not just the chat: one scope per user, conversations as sessions inside it, and every fact tagged.

## Search and social

| Field | Value |
| --- | --- |
| Title | Memory for personal AI assistants |
| Description | Give a personal assistant memory of each user across conversations, with every fact tagged by sensitivity so you decide what the model sees. |
| Social card | "Remember the person, not just the chat." Scoped per user · Survives the conversation · Tagged facts |

## Content

- **Hero:** "Personal assistants that remember the person, not just the chat". The lede: preferences and personal details survive the end of a conversation, and each fact comes back tagged `none`, `low`, `pii` or `sensitive`.
- **The problem** ("Every conversation starts cold"): users repeat themselves; replaying history is expensive; personal details need handling.
- **How it works** ("Four steps, one scope per user"): scope rule `user:<id>`, with conversations as sessions inside it, then:

| Step | TypeScript | Python |
| --- | --- | --- |
| Remember what the user tells you, with a sensitivity (a language preference is `low`, an allergy is `sensitive`) | `injectMemory` | `inject_memory` |
| Keep each conversation | `storeTurn` | `store_turn` |
| Close the conversation, keep the person | `clearSession` | `clear_session` |
| Recall with tags attached | `retrieveContext` | `retrieve_context` |

- **The code:** `assistant.ts` and `assistant.py` (`rememberAboutUser`, `recordTurn`, `recallFor` returning facts with their tags, `endConversation`).

## Claims and their proof

| Claim on the page | Test (both packages) |
| --- | --- |
| A preference outlives the conversation that taught it | remembers after the conversation ends: the preference returns in a new conversation, and its turns are gone |
| The allergy comes back tagged `sensitive` | returns each fact with its sensitivity |
| One user never sees another's facts | keeps users apart |

## Limits shown

1. It does not decide what is sensitive; tags come from you or a model you configure.
2. It does not resolve contradictions: both facts stay until you delete the old one with `deleteMemory`.
3. Recall matches shared words until a local model is installed.
4. In-process until you add a store.
5. It runs where your code runs: Node.js 22 or newer, or Python 3.11 or newer. A mobile or browser assistant needs a backend.

## Deliberately excluded

Claims about emotional or companion features, on-device mobile support, and any statement that the library protects personal data by itself. It tags; the handling is the developer's.
