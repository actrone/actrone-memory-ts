# Use case: coding assistants

Route: `/use-cases/coding-assistants`. Shared rules and template: [README](README.md).

## Goal and reader

A developer building or customising a coding assistant should leave knowing how to teach it a repository's conventions once and get the relevant ones back for each task, inside a token budget, without mixing repositories.

## Key message

Learn the conventions once: one scope per repository, recall per task, and a context that never exceeds the budget.

## Search and social

| Field | Value |
| --- | --- |
| Title | Memory for AI coding assistants |
| Description | Teach a coding assistant your repository conventions once, then recall only what each task needs, inside the token budget you set. |
| Social card | "Learn the conventions once." Scoped per repository · Token budgets · Runs in-process |

## Content

- **Hero:** "Coding assistants that learn your repository's conventions". The lede gives two concrete conventions (vitest, date-fns) and states that, with the defaults, the memory runs in-process and sends nothing anywhere.
- **The problem** ("The same rules, pasted into every prompt"): rules repeated on every request; long sessions crowd out what matters; one repository's rules leak into another.
- **How it works** ("Four steps, one scope per repository"): scope rule `repo:<name>`, then:

| Step | TypeScript | Python |
| --- | --- | --- |
| Record a convention once | `injectMemory` | `inject_memory` |
| Recall for each task | `retrieveContext` | `retrieve_context` |
| Stay inside the budget (a quarter to long-term memory, about a third to recent turns, by default) | parameter `tokenBudget` | parameter `token_budget` |
| Keep the session | `storeTurn` | `store_turn` |

- **The code:** `coding.ts` and `coding.py` (`learnConvention`, `conventionsFor` returning conventions and tokens used, `recordExchange`).

## Claims and their proof

| Claim on the page | Test (both packages) |
| --- | --- |
| A task recalls its own repository's convention | recalls the relevant convention: the zod rule for a route-handler task |
| Never another repository's | the same test: the billing service's pydantic rule is absent |
| Context stays within the 800-token budget | never exceeds the budget, after 20 recorded exchanges |

The budget split (25% long-term, 35% recent turns) is the libraries' documented default (`budgetFractionEpisodic`, `budgetFractionSession`).

## Limits shown

1. It does not read your code: no indexing, parsing or code graph.
2. It recalls conventions; it does not enforce them.
3. Recall matches shared words until a local model is installed.
4. In-process until you add a store: a restart forgets everything.
5. Token counts are estimates (about four characters per token); Python counts exactly with the `tiktoken` extra, and TypeScript accepts a custom counter.

## Deliberately excluded

Productivity figures, comparisons with specific coding assistants, and any suggestion that the library understands code. It remembers stated rules.
