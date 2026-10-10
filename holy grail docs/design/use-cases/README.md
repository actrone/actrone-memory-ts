# Use-case pages: shared spec

The use-case pages show developers what `actrone-memory` does inside a specific kind of agent, with code they can copy and limits they should know. They live at `/use-cases` and ship in OSS launch mode.

Status: built 2026-09-24, uncommitted. Page specs: [customer support](customer-support.md), [coding assistants](coding-assistants.md), [personal assistants](personal-assistants.md).

## Why these pages exist

Search traffic arrives with a job in mind ("memory for a support bot"), not a feature name. Competitors answer that with vertical pages; Mem0's healthcare page, for example, is a hero, three pain points, four features and compliance badges, with no code. These pages answer the same intent the way the rest of the site does: real code, proven by tests, and the limits stated on the page.

## Rules every use-case page follows

1. **Code is never written for the page.** Each page renders one `#region` snippet per language, extracted from `actrone-memory-ts/examples/use-cases/*.ts` and `actrone-memory-py/examples/use_cases/*.py`, synced into `frontend/apps/marketing/src/generated/snippets.json`. A missing snippet fails the build. The extractors keep these snippets out of the modules the packages ship for their CLIs (any id containing `-use-case-`), so the published libraries do not carry website-only code.
2. **Every behaviour the page claims is a test.** `actrone-memory-ts/test/use-cases.test.ts` and `actrone-memory-py/tests/unit/test_use_cases.py` run the examples and assert each claim, with the default keyword embedder so the runs are deterministic. If a claim stops being true, a package's CI fails before the page is republished.
3. **No claim the libraries cannot back.** No compliance badges, customer names, user counts or latency figures. Regulated verticals (healthcare, finance) wait until the hosted platform and a signed BAA exist, because a page about them would either be vague or overclaim.
4. **Limits are part of the page.** Every page has a "What this does not do" section. Two limits recur by design: recall matches shared words until a local model is installed, and the default store is in-process.
5. **Brand rules (CLAUDE.md 8.1.1) apply.** Sentence case, no em or en dashes, monochrome, Geist, lucide icons at stroke 1.5, radii 4, 6 and 8, kicker chips for section labels, no numbered section gutters.

## Page template

Built from `components/marketing/use-cases/UseCasePage.tsx`; copy lives in `lib/use-cases/content.tsx`.

| Section | Kicker | Content | Source |
| --- | --- | --- | --- |
| Hero | Breadcrumb `use cases / <name>` | H1 promise, lede, primary "Read the quickstart", secondary "See the code", install line | `hero` |
| The problem | The problem | Title, intro, three problems in one bordered frame | `problem` |
| How it works | How it works | The scoping rule, then each step with its call in both languages | `how` |
| The code | The code | TypeScript above Python, full width, then how to create the manager | `code`, snippets |
| Limits | Limits | The limits list with warning icons | `limits` |
| Next steps | Next steps | Three docs links, then the other two use cases | `NEXT_STEPS` |

The code panes stack on these pages rather than sitting side by side: the snippets have lines up to about 100 characters, and a half-width pane fits about 70.

The index page (`/use-cases`) has a hero, one card per use case (name, summary, the calls it uses) and a quickstart call to action.

## Wiring

| Concern | Where |
| --- | --- |
| Routes | `app/(marketing)/use-cases/page.tsx` and one folder per slug |
| OSS gate | `lib/flags.ts`, `OSS_USE_CASE_PATHS`, listed exactly so an invented slug redirects home |
| SEO | `lib/seo/pages.ts` keys `useCases`, `useCaseSupport`, `useCaseCoding`, `useCaseAssistant`: titles, descriptions, social cards, sitemap, `llms.txt` |
| Breadcrumbs | `useCaseBreadcrumbSchema` in `lib/seo/structured-data.ts` |
| Navigation | "Use cases" in the OSS top nav (marked `aria-current` on the section), mobile quick links and footer |
| Tests | `src/test/use-cases.test.ts` (snippets exist in both languages, every step's call appears in its snippet, SEO paths match, links are OSS routes, no dashes) and `src/test/oss-gate.test.ts` |

## Adding a use case

1. Write the example in both packages under `examples/use-cases/` and `examples/use_cases/`, with a `#region memory-ts-use-case-<id>` or `# region memory-py-use-case-<id>` block.
2. Add tests that run it and assert each claim the page will make. In TypeScript, add the id to the known list in `test/recipes-examples.test.ts`.
3. Run each package's snippet extractor, then `node scripts/sync-snippets.mjs` in the marketing app.
4. Add the entry to `USE_CASES`, the SEO registry, and `OSS_USE_CASE_PATHS`, plus a route folder.
5. Write its page spec in this folder, then run the marketing tests, `seo:smoke` and `brand:check`.

## Acceptance checks (all passing on 2026-09-24)

- Both packages' use-case tests pass (8 each), and their snippet drift checks pass.
- Marketing: typecheck, lint and all tests, including `use-cases.test.ts`.
- OSS build prerenders the four routes as static pages; `/use-cases/<unknown>` redirects home.
- `seo:smoke` passes on the sitemap, which now includes the four pages; `brand:check` passes on every sitemap page.
- No horizontal scroll at 390px, and the secondary buttons show a hover state.
