# AI search visibility

Developers increasingly ask an AI assistant or read an AI Overview before they open search results. When the question is "how do I give my LangGraph agent long-term memory", being cited in that answer is the new first-page ranking. This guide covers how to measure citations with free tools and what actually influences them.

## How AI answers find sources

Most AI search features retrieve pages from a conventional search index, then summarise them. That means:

- **Google AI Overviews and AI Mode** draw on Google's index. A page that isn't indexed can't be cited.
- **Microsoft Copilot and Bing AI answers** draw on Bing's index.
- **Assistants with web browsing** use their own crawlers or a search partner's index.

Classic SEO is the foundation for AI visibility, not a separate discipline. Indexed, well-structured, factually precise pages get cited.

## Measure it

### Google Search Console

Search Console's generative AI performance reports, announced in June 2026, show impressions inside AI Overviews and AI Mode ([announcement](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports)). Review them monthly in the same session as the Performance report. See the [Search Console guide](google-search-console.md).

### Bing Webmaster Tools

The AI Performance report shows how often pages are cited in Copilot and Bing AI answers, which URLs are cited, and the grounding queries that retrieved them ([announcement](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview)). Grounding queries are the searches the AI runs internally, and they're a direct view of the phrasing to target. See the [Bing guide](bing-webmaster-tools-and-indexnow.md).

### A fixed prompt panel

No tool covers every assistant, so run the same prompts by hand each month and log the results. Keep the prompt set fixed so the months are comparable:

1. How do I add long-term memory to a LangGraph agent in Python?
2. What's a good open-source memory library for AI agents in TypeScript?
3. How do I persist CrewAI agent memory in Redis?
4. How do I keep an LLM agent's context within a token budget?
5. Which agent memory libraries support both Python and TypeScript?

Run each prompt in ChatGPT, Claude, Perplexity, Microsoft Copilot and Google (AI Mode) with web search enabled. Use a signed-out or fresh session where possible, because personalisation skews results. Record in a spreadsheet:

| Month | Assistant | Prompt | actrone cited | Cited URL | Other sources cited |
| --- | --- | --- | --- | --- | --- |

The "Other sources cited" column matters as much as your own: it shows which pages assistants trust for the topic, and what format they're in.

## What improves citations

- **Get indexed first.** Everything in the [runbook](../Actrone_OSS_Launch_SEO_Runbook.md) comes before this list.
- **Answer the question in the first paragraph.** Retrieval systems favour passages that state the answer directly. Open each docs section with a sentence that works when quoted on its own.
- **Be precise and verifiable.** Specific numbers, version requirements and exact API names get quoted; vague adjectives don't. The docs already state Python 3.11+, Node.js 22+, 16 Python adapters and 11 TypeScript adapters. Keep those figures current.
- **Keep code complete.** Assistants reuse runnable snippets. Every docs sample should run as written. The quickstart already renders CI-type-checked snippets through `scripts/sync-snippets.mjs`; extend that to other pages.
- **Be present where assistants look.** GitHub READMEs, framework integration pages and well-answered community threads are heavily cited. See the [discoverability guide](github-pypi-npm-discoverability.md).
- **Stay honest.** An assistant that cites an overstated claim, and a developer who checks it, costs more trust than no citation. Follow the benchmark caveats in the [keyword research guide](keyword-research-free-tools.md#comparison-and-alternative-queries).

## Crawler access

`robots.txt` on actrone.com allows every crawler, including AI crawlers such as GPTBot, ClaudeBot, PerplexityBot and Google-Extended. For an open-source launch, being readable by AI systems is distribution. If that decision changes, add per-crawler rules in `frontend/apps/marketing/src/app/robots.ts`. Blocking an assistant's crawler can remove the site from that assistant's answers. Google-Extended is the exception to check carefully: it governs use in Gemini models and apps, not Google Search or AI Overviews, which run on Googlebot.

## `llms.txt`

The site serves [`/llms.txt`](https://actrone.com/llms.txt), a markdown index of the docs generated from the SEO registry, following the [llms.txt proposal](https://llmstxt.org/). Be clear about what it does:

- **Google Search doesn't use it.** Google has stated that these files aren't needed for Search and don't affect ranking ([Search Central updates](https://developers.google.com/search/updates)).
- **Some assistant tools and agent frameworks read it** when pointed at a site, which helps developers who ask their coding assistant to read the docs.

It costs nothing to maintain because the registry generates it, so keep it. Don't expect it to move any metric in the reports above.

## Routine

- **Monthly**: Search Console generative AI reports, Bing AI Performance, and the prompt panel
- **Quarterly**: compare citation logs quarter over quarter, and rewrite the opening paragraphs of pages that get impressions but no citations
