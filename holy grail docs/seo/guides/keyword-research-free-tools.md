# Free keyword research

Keyword research finds the words developers type when they have the problem actrone-memory solves. For a new library, those are rarely "agent memory library". They're framework-specific questions such as "langgraph long term memory" or "crewai memory not persisting". This guide builds a keyword map with free tools only and turns it into docs pages.

## Before launch: seed the list

With no traffic yet, start from how developers describe the problem.

### Google autocomplete and "People also ask"

1. In a private browser window, type a seed phrase slowly: `langgraph memory`, `crewai memory`, `llm long term memory`, `vercel ai sdk memory`.
2. Record each autocomplete suggestion.
3. Search the phrase and expand the **People also ask** questions. Each expansion loads more.
4. Note the page types that rank: docs pages, GitHub issues, blog tutorials or Stack Overflow answers. That shows the format Google rewards for the query.

### Google Trends

[Google Trends](https://trends.google.com/) shows relative interest over time, not volumes. Use it to choose between phrasings:

1. Compare up to 5 terms, for example `agent memory`, `llm memory`, `ai memory` and `langchain memory`.
2. Set the range to the past 12 months, **Worldwide**, and switch the category to **Computers & Electronics** to filter out unrelated meanings of "memory".
3. Prefer the rising phrasing when two terms mean the same thing.

### Google Keyword Planner

[Keyword Planner](https://ads.google.com/home/tools/keyword-planner/) is free with a Google Ads account, and no campaign spend is needed. Without spend it shows volume ranges, such as 1K to 10K, rather than exact figures. That's enough to rank ideas.

1. Choose **Discover new keywords** and enter 3 to 5 seeds.
2. Set the location to the launch markets and the language to English.
3. Export the results to a spreadsheet.

### Bing Keyword Research

In [Bing Webmaster Tools](bing-webmaster-tools-and-indexnow.md), **Keyword Research** shows Bing query counts for a term and related queries, with country and date filters. The counts are real Bing numbers, which makes them a useful cross-check on Keyword Planner's ranges.

### Where developers ask

- **GitHub**: search issues across LangChain, LangGraph, CrewAI, LlamaIndex, Mastra and the Vercel AI SDK for `memory`. Issue titles are real problem statements.
- **Stack Overflow**: the `langchain`, `langgraph` and `openai-api` tags, searched for `memory` and `history`
- **Reddit**: r/LocalLLaMA, r/LangChain and r/AI_Agents threads asking how to persist agent memory
- **Framework docs**: the official memory pages of each framework show the vocabulary their users learn

## After launch: use your own data

After 2 to 4 weeks, [Search Console](google-search-console.md) is the best keyword source, because it lists queries that already show your pages:

1. Open **Performance**, set the range to the last 28 days, and open the **Queries** tab.
2. Sort by **Impressions**.
3. Flag queries with many impressions and a position between 8 and 30. You're already relevant; a dedicated section or page can move them onto page one.
4. Flag queries whose matching page is wrong, such as an integrations query landing on the homepage. Those need their own page.

## Build the keyword map

Keep one spreadsheet with a row per keyword cluster:

| Cluster | Example queries | Intent | Target page | Status |
| --- | --- | --- | --- | --- |
| LangGraph memory | langgraph long term memory, langgraph checkpointer redis | How-to | `/docs/memory/integrations`, LangGraph section | Exists |
| Budget-aware context | llm context window token budget | Conceptual | `/docs/memory/retrieval` | Exists |
| Memory with PII | agent memory pii redaction | How-to | New guide | Planned |

Rules for the map:

- **One primary page per cluster.** Two pages targeting the same query compete with each other.
- **Match intent to format.** How-to queries need runnable steps, conceptual queries need explanation with a diagram, and comparison queries need an honest table.
- **Write the registry title for the query.** The page's title in `lib/seo/pages.ts` should contain the cluster's main phrase near the start.

## Comparison and alternative queries

Queries such as "mem0 alternative" or "zep vs letta" have strong commercial intent, and pages that answer them honestly rank. Two constraints apply to actrone.com:

- **No performance claims against named competitors** until the head-to-head benchmark has run. State design differences that are verifiable from public docs, such as language support, storage backends and license.
- **Cite the library's own benchmark with its caveat.** The bundled eval measures recall@5 of 0.929 with the hashing embedder, which reflects keyword overlap rather than semantic depth, on a LongMemEval-style dataset that isn't LongMemEval itself.

## Routine

- **Pre-launch**: seed the map with 10 to 20 clusters and assign each to an existing page or a planned one
- **Monthly**: add rising queries from Search Console and review positions for mapped clusters
- **Quarterly**: pick the next 3 planned pages to write, highest impressions first
