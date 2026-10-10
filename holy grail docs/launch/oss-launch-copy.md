# Actrone OSS launch, copy kit

> **Status: settled.** One post per slot. No alternatives, no A/B menu. Post what is written here.
> If a line needs to change, change it here first so every channel stays consistent.
>
> **What this launch is:** the public debut of the Actrone brand through a free, open-source memory
> library. A developer-tool launch plus a soft company reveal. It is **not** the platform launch
> (that is Month 4). The memory library is the hero; Actrone is the credible maker behind it.
>
> Every claim below was verified against the source on 2026-09-08. Read section 1 before editing a
> word, and section 2 before adding one.
>
> _Settled 2026-09-08 · Owner: Matt · Supersedes the multi-option kit of 2026-07-17_

---

## 1. What the library actually is

**`actrone-memory`, for Python and TypeScript: two-tier, budget-aware agent memory.**

| Claim | Verified against |
| --- | --- |
| Two-tier store: hot session tier plus semantic long-term tier | `MemoryManager`, both packages |
| Hybrid retrieval: dense embeddings + BM25 + recency, fused with reciprocal rank fusion | both READMEs |
| Token-budget-aware assembly, guaranteed to fit | invariant A7, `actrone-memory-demo/docs/assertions.md` |
| Opt-in fact extraction, classified `none / low / pii / sensitive` | `spec/scenario.json` |
| Local-first: dependency-free embedder, in-memory stores, no API key, no database | `actrone-memory-py/README.md` line 66 |
| **16 framework integrations in Python, 11 in TypeScript** | `pyproject.toml` extras, `compatibility.json` |
| MIT | `LICENSE`, `pyproject.toml`, `package.json` |
| One-import upgrade to the hosted governed manager | both READMEs |

**Framework counts, exactly.** Python (16): LangChain, LangGraph, CrewAI, AutoGen, LlamaIndex,
Haystack, DSPy, Agno, smolagents, Strands, OpenAI Agents, Pydantic AI, Claude Agent SDK, Semantic
Kernel, Google ADK, Microsoft Agent Framework. TypeScript (11): Vercel AI SDK, LangChain.js,
LangGraph.js, Mastra, LlamaIndex.TS, OpenAI Agents JS, Firebase Genkit, VoltAgent, Claude Agent SDK,
Cloudflare Agents, Inngest AgentKit.

**The depth caveat is mandatory whenever the counts are used.** Python's adapters are
dependency-backed optional extras. TypeScript's are structural helpers with no runtime framework
import. They are not equivalent, the compatibility matrix says so, and CI gates it for drift. Never
present the two numbers as the same kind of thing.

**It does not have** (these are hosted-platform features, never attribute them to the library): a
bitemporal knowledge graph, self-editing memory blocks, or Mem0/Zep-style extraction and
consolidation depth.

### The benchmark, stated precisely

This is the single most-misstated thing in the previous kit, in both directions. The correct
position:

**Publishable today, and it is a genuine differentiator:** the library ships its own quality eval.
It runs offline in one command, needs no services and no API key, and is regression-gated in CI so
recall cannot silently rot.

```text
recall@5      0.929
MRR           0.929
precision@5   0.186   (ceiling is 1/k with one relevant memory per query, so this is near-perfect)
latency p95   0.61 ms
queries       14, on a bundled LongMemEval-style dataset
```

CI asserts `recall@5 >= 0.85` and `MRR >= 0.80`. Against a naive recency baseline on the same
dataset: 0.929 versus 0.571.

**The caveat that must travel with the number:** those scores are the *default hashing embedder*,
which is keyword overlap, not semantic understanding. Paraphrases with no shared words score low.
The library's own README says it loses to dense-embedding systems on raw semantic recall depth. Say
that when you cite the number.

**Not publishable, do not post:** any head-to-head against Mem0, Zep, Letta or Cognee. The harness
supports it through the `MemorySystem` protocol, but competitor adapters are not bundled (they need
those libraries plus API keys) and have not been run. Also not publishable: any figure on a real
public dataset (LOCOMO, LongMemEval proper). The bundled set is LongMemEval-*style*, not the
benchmark itself. Say "our benchmark set", never "LongMemEval".

---

## 2. Guardrails

**Lead on these five, in this order:**

1. **Zero-service and local-first.** No API key, no database, runs offline. The lowest-friction free
   option in the category, and the emerging-market unlock.
2. **Governance-adjacent memory.** Every fact classified as it is written. No competitor frames
   memory this way.
3. **It ships its own eval.** Measurable quality, regression-gated. Nobody else does this.
4. **Framework-agnostic in both languages.** 16 and 11, honestly labelled.
5. **Radical honesty.** Publish where we lose. Trust is the growth loop.

**Never say:**

- "Smarter memory", "beats Mem0/Zep/Letta/Cognee", "best recall", "state of the art".
- "Bitemporal knowledge graph", "self-editing memory blocks". Not in the library.
- "Production-grade" without a caveat. "7 adapters". Any adapter count without the depth caveat.
- Any platform, hosted, SDK or pricing pitch. Any benchmark figure without the reproducible link.
- "LongMemEval" as the dataset name. It is LongMemEval-style.
- Anything implying the library is PII-safe on cloud models. See the privacy statement below.

**House style, non-negotiable (CLAUDE.md 8.1.1):** sentence case everywhere. No ALL CAPS. **No em
dashes and no en dashes as sentence punctuation**; use a comma, a colon, parentheses, or split the
sentence. **No emoji**, on any channel, including Discord and Product Hunt. Restraint is the brand,
and a launch is exactly when brands abandon it.

**Privacy statement, canonical. Use verbatim wherever PII is claimed:**

> Actrone Memory is local-first by default: a local embedder plus local or no extraction keeps
> everything on your machine. It is also cloud-capable, since you can bring any OpenAI-compatible
> model. PII protection in the open-source library holds only for local models. Point it at a cloud
> provider and the raw text, including PII-classified content, is sent there; the library does not
> tokenise it first. The hosted platform's Memory Abstraction Layer tokenises PII before any
> inference, which is a structural guarantee that makes cloud models safe.

**Links, resolved. No placeholders remain:**

| Slot | URL |
| --- | --- |
| Hub | `https://github.com/actrone` |
| Python | `https://github.com/actrone/actrone-memory-py` |
| TypeScript | `https://github.com/actrone/actrone-memory-ts` |
| Benchmark | `https://github.com/actrone/actrone-memory-py/tree/main/src/actrone_memory/benchmark` |
| Docs | `https://actrone.com/docs/memory/overview` |
| Waitlist | `https://actrone.com/#founding-500` |

**Pre-flight, all must be true before anything below is posted:**

- [ ] Both repos public, READMEs and visuals merged, quickstart verified under five minutes.
- [ ] `npm publish` and PyPI publish done, so `npm i` and `pip install` in the copy actually work.
- [ ] Every link above returns 200.
- [ ] Marketing site deployed with `NEXT_PUBLIC_LAUNCH_MODE=oss`, so `/docs/memory/overview` and
      `/#founding-500` resolve.
- [x] Self-eval reproducible and CI-gated. Publishable as written.
- [ ] Head-to-head competitor numbers: **not run, not published, not postable.**

---

## 3. X

One launch thread on day zero, then three standalone posts on a schedule. That is the whole plan.

### Day 0, launch thread

**1/**
> Your agent forgets everything between sessions.
>
> We open-sourced the memory layer that fixes it.
>
> Actrone Memory: two-tier recall, budget-aware, PII-classified. Runs locally with no API key and no
> database. TypeScript and Python, MIT.
>
> https://github.com/actrone

**2/**
> Frameworks give your agent a context window, not a memory. Restart the process and it forgets who
> you are and everything it learned.
>
> Every team rebuilds this same layer. We built it once, cleanly, and gave it away.

**3/**
> Two tiers. A hot tier for the current session's turns, a semantic tier for everything older. One
> call reads both and hands back a context that already fits the token budget you passed it.
>
> You never write the trimming logic.

**4/**
> Retrieval fuses three signals: dense embeddings, BM25 keyword overlap, and recency, combined with
> reciprocal rank fusion.
>
> An exact keyword match that a vector search under-ranks still surfaces. That is the whole point of
> fusing rather than picking one.

**5/**
> Every extracted fact is classified none / low / pii / sensitive as it is written, and the tag
> travels with the memory.
>
> Your agent's memory is privacy-aware before it reaches production, not bolted on after.

**6/**
> Local-first by default: a dependency-free embedder and in-memory stores. No API key, no Redis, no
> Qdrant, nothing leaves your machine.
>
> Swap in real stores when you scale. The manager and your calling code do not change.

**7/**
> 16 framework integrations in Python, 11 in TypeScript.
>
> They are not equivalent and we say so in the matrix: Python's are dependency-backed extras,
> TypeScript's are structural helpers. CI fails the build if that table drifts from reality.

**8/**
> It ships its own quality eval. Offline, one command, regression-gated in CI so recall cannot
> silently rot.
>
> recall@5 0.929, p95 0.61 ms on our benchmark set. The README is upfront that this is keyword
> overlap, not semantic depth.
>
> https://github.com/actrone/actrone-memory-py/tree/main/src/actrone_memory/benchmark

**9/**
> MIT, free forever, no account, nothing gated.
>
> If it is useful, a star on launch day genuinely helps.
>
> https://github.com/actrone

### Day 2, the quickstart post

> Long-term memory for your AI agent in three lines. No API key, no Redis, no Qdrant.
>
> pip install actrone-memory
> npm i actrone-memory
>
> Works with LangChain, LangGraph, CrewAI, LlamaIndex, Vercel AI SDK, Mastra and a dozen more.
>
> https://github.com/actrone

### Day 4, the eval post

> Most agent-memory libraries ask you to trust their recall.
>
> Ours ships the eval. Runs offline in one command, gated in CI, and the README states plainly where
> we lose: the default embedder is keyword overlap, so paraphrases score low.
>
> Run it yourself:
> https://github.com/actrone/actrone-memory-py/tree/main/src/actrone_memory/benchmark

### Day 7, the governance post

> Most agent-memory libraries store text in a black box.
>
> Actrone Memory classifies every fact it stores as none / low / pii / sensitive, at write time. When
> your agent reaches real data, its memory is already something you can audit and redact.
>
> Open source, local-first, TypeScript and Python.
>
> https://github.com/actrone

---

## 4. LinkedIn

One post, day zero.

> Every AI agent demo feels like magic until the session ends and it forgets who you are.
>
> Memory is the difference between a chatbot and an agent you can rely on. It is also the part every
> team quietly rebuilds from scratch. So we built it once, cleanly, and today we are giving it away.
>
> Actrone Memory is open source:
>
> - Two-tier recall: a fast tier for recent turns, a semantic tier for long-term memory
> - Hybrid retrieval: dense embeddings, keyword and recency, fused so nothing relevant slips through
> - Budget-aware: you pass a token budget and the context fits it, every time
> - PII-aware: every remembered fact is classified none / low / pii / sensitive as it is written
> - Local-first: no API key, no database, nothing leaves your machine on the defaults
> - 16 framework integrations in Python, 11 in TypeScript
>
> It also ships its own quality eval, which as far as we know no other agent-memory library does. It
> runs offline in one command and is regression-gated in CI, so quality cannot quietly rot between
> releases. The README states where we lose as clearly as where we win: the zero-dependency default
> embedder is keyword overlap, not semantic understanding, and paraphrases score low because of it.
> We would rather earn trust than win a slide.
>
> This is the first thing we are putting into the world. There is more coming. But memory belongs to
> everyone, so it is free and open, forever.
>
> MIT, TypeScript and Python: https://github.com/actrone

---

## 5. Show HN

**Title** (77 characters, factual, no hype):

> Show HN: Actrone Memory, open-source agent memory with a built-in quality eval

**First comment.** Post it immediately. HN expects the why, the how and the tradeoffs, and honesty
outscores polish here.

> Hi HN, I'm Matt, one of the makers.
>
> Actrone Memory is a small open-source library that gives an AI agent durable long-term memory. Most
> frameworks hand the agent a context window, not a memory: restart the process and it forgets what
> it learned. We kept rebuilding the same layer across projects, so we built it cleanly and open
> sourced it.
>
> How it works:
>
> - Two tiers: a hot tier for recent session turns, a semantic tier for long-term recall.
> - Hybrid retrieval: dense embeddings, BM25 (implemented in-library, no external index) and recency,
>   fused with reciprocal rank fusion, so an exact keyword match a vector search under-ranks still
>   surfaces.
> - Budget-aware: you pass a token budget and the assembled context is guaranteed to fit it.
> - Opt-in fact extraction that classifies each fact none / low / pii / sensitive.
> - Local-first: ships a dependency-free embedder and in-memory stores, so it runs with no API key and
>   no datastore. Swap in Redis or Qdrant when you scale.
> - Python (16 framework integrations) and TypeScript (11). Those are not equivalent: Python's are
>   dependency-backed extras, TypeScript's are structural helpers with no runtime framework import.
>   The compatibility matrix says so and CI fails on drift.
>
> The part I'd most like feedback on: it ships its own quality eval. `python -m
> actrone_memory.benchmark` runs offline in about a second and prints recall@5, precision@5, MRR and
> latency percentiles against a bundled ground-truth dataset. It's gated in CI at recall@5 >= 0.85, so
> a change that degrades retrieval fails the build. Current numbers are recall@5 0.929 and p95 0.61 ms.
>
> Being honest about what that number is: it's the default hashing embedder, which is keyword overlap
> rather than semantic understanding, so paraphrases with no shared vocabulary score badly. The
> harness takes any object implementing a two-method protocol, so a head-to-head against Mem0 or Zep
> is straightforward, but we have not run or published one and I'm not going to imply a result we
> don't have. This is not a Mem0 or Zep style memory-intelligence engine: there is no knowledge graph
> and no self-editing memory here, and it loses to dense-embedding systems on raw semantic recall
> depth. It's solid two-tier retrieval with good DX and no setup cost.
>
> https://github.com/actrone/actrone-memory-py
> https://github.com/actrone/actrone-memory-ts
>
> MIT. There is a larger governed-agent platform behind this that we are not launching today. This
> library stands entirely on its own and always will.
>
> Feedback, issues and PRs welcome.

**HN rules for the day:** no emoji and no superlatives anywhere. Reply to every comment within the
first two hours. When someone finds a limitation, confirm it plainly and link the code.

---

## 6. Product Hunt

**Name:** Actrone Memory

**Tagline** (42 characters):

> Open-source long-term memory for AI agents

**Description:**

> Actrone Memory gives AI agents durable long-term memory, the part every framework leaves out.
> Two-tier recall (a fast tier for recent turns, a semantic tier for long-term memory), hybrid
> retrieval fusing dense embeddings, keyword and recency, budget-aware context assembly that is
> guaranteed to fit, and sensitivity classification on every fact it stores. It ships a local
> embedder and in-memory stores, so it runs on your machine with no API key and no database. Swap in
> Redis or Qdrant when you scale. 16 framework integrations in Python, 11 in TypeScript. It also
> ships its own reproducible quality eval, offline and CI-gated, with the README honest about where
> the default embedder falls short. MIT.

**Maker's first comment:**

> Maker here.
>
> Every agent we built forgot everything between sessions, and we kept rebuilding the same memory
> layer. So we built it once, cleanly, and open sourced it.
>
> Actrone Memory does two-tier recall with hybrid retrieval, fits memory to your token budget, and
> classifies every fact it stores as none / low / pii / sensitive. It runs locally with no API key,
> and drops into the framework you already use in either language.
>
> The thing I am proudest of is the least flashy: it ships its own quality eval. One command, fully
> offline, regression-gated in CI. The README is equally clear about where the zero-dependency
> default embedder falls short, because a benchmark you can only read one way is not a benchmark.
>
> Free and open, forever. This is the first thing we are putting into the world, and the memory is
> yours to keep. Feedback and issues very welcome: https://github.com/actrone

**Topics:** Artificial Intelligence, Developer Tools, Open Source, GitHub

---

## 7. Discord, `#announcements`

> **@everyone Actrone Memory is live, and open source.**
>
> Long-term memory for any AI agent: two-tier recall, hybrid retrieval, budget-aware, PII-classified.
> Runs locally with no API key and no database. TypeScript and Python, with 11 and 16 framework
> integrations respectively.
>
> It ships its own quality eval too, offline and CI-gated, and the README is honest about where the
> default embedder falls short.
>
> **How you can help today**
>
> Star the repo: https://github.com/actrone
> Try the five-minute quickstart: https://actrone.com/docs/memory/overview
> Upvote and comment on Show HN and Product Hunt, links pinned above
> Break it and file issues, we are watching #feedback all day
>
> MIT, free forever. This is where we start, and thank you for being here on day one.

---

## 8. Reply bank

Keep all of these. They are a reply library, not options.

**"How is this different from Mem0 or Zep?"**
> Honestly, they go deeper on memory intelligence, graph and consolidation, and we do not claim to
> beat them there. Where we differ: we run fully local with no API key or database, we cover both
> TypeScript and Python, every fact is sensitivity-classified as it is stored, and we ship a quality
> eval you can run yourself. We have not published a head-to-head and will not imply one until we
> have actually run it.

**"What's the catch, what's the business model?"**
> No catch on the library. MIT, stands alone, free forever. We are building a governed-agent platform
> separately, and this memory layer stays free and open regardless.

**"Does it work with my framework?"**
> 16 integrations in Python and 11 in TypeScript, plus framework-agnostic recall and remember if
> yours is not listed. Worth knowing that Python's are dependency-backed extras and TypeScript's are
> structural helpers, so they are not equally deep. Which are you using?

**"Local only, or my own stores?"**
> Both. It ships a dependency-free embedder and in-memory stores so it runs with zero setup, and you
> can plug in Redis, Qdrant or your own implementation of the store interfaces.

**"Do you have a knowledge graph or self-editing memory?"**
> Not in the open-source library. It is two-tier retrieval done well. Those sit on the hosted
> roadmap; the library stays focused and honest about its scope.

**"Is my PII safe?"**
> On local models, yes, and that is the default: the embedder and extractor run in process and
> nothing leaves your machine. If you point extraction or embeddings at a cloud provider, the raw
> text including PII-classified content goes to that provider, because the library does not tokenise
> before inference. The hosted platform does, and that is the difference.

**"Why should I trust your benchmark?"**
> Do not trust it, run it. One command, no services, no API key, about a second. The dataset and the
> harness are both in the repo, and the README says plainly that the default embedder is keyword
> overlap rather than semantic understanding.

---

## 9. What was cut, and why

The previous kit offered six X posts, three LinkedIn posts and three Show HN titles. Recording the
calls so nobody re-litigates them on launch morning.

| Cut | Why |
| --- | --- |
| X posts A, B, C, E as standalones on day zero | Folded into the thread, which is what a launch warrants on X. B, the eval angle and the governance angle survive as the scheduled day 2, 4 and 7 posts, so nothing is lost. |
| X post D-alt, the head-to-head | Ungrounded. Competitor adapters are not bundled and have never been run. Deleted rather than deferred, so it cannot be posted by accident. |
| LinkedIn B and C | The founder story converts best on LinkedIn and absorbs both of their hooks. |
| Show HN alt titles | "Built-in quality eval" is the most specific and most verifiable of the three, and it is the claim no competitor can make. |
| Product Hunt alt taglines | The plain one is clearest at 42 characters and matches the site's own description. |
| All emoji | Guardrails already banned emoji spam, and CLAUDE.md 8.1.1 bans emoji as UI glyphs. A launch is when brands lose their nerve on restraint. |
| All em dashes | CLAUDE.md 8.1.1. |
| "adapters for LangChain, CrewAI, LlamaIndex and Vercel AI" | Undersold reality by an order of magnitude and mixed the two languages' adapters together. Replaced with the real, per-language counts and the depth caveat. |
| "recall@5 ~0.93" cited loosely | Kept, but pinned to 0.929, with the dataset described accurately as LongMemEval-*style* and the hashing-embedder caveat mandatory alongside it. |
