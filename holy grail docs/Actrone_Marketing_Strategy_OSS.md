# Actrone — Marketing Strategy & Plan: OPEN SOURCE (the wedge)

> Part of the strategy set: [Distribution & GTM](./Actrone_Distribution_And_GTM_Strategy.md) (the
> spine) · [Positioning & Moats](./Actrone_Positioning_And_Competitive_Moats.md) · [Product Review](./Actrone_Product_Review_and_Financial_Model.md)
> (the honest, code-grounded truth) · sibling: [Marketing — Hosted](./Actrone_Marketing_Strategy_Hosted.md).
>
> **Scope:** the developer-led growth marketing for the free, MIT open-source **memory** libraries —
> `actrone-memory` (Python) + `actrone-memory` (TS), plus their memory CLI and the `create-actrone-app`
> scaffold. This is **Wave 0 (months 1–4), global, developer-first.** It is *top-of-funnel growth*, not
> revenue — the sales conversion lives in [Sales — OSS](./Actrone_Sales_Strategy_OSS.md).
>
> **Scope decision (2026-07-15):** the **client SDKs (`@actrone/sdk`, `actrone`) are NOT part of the OSS wave** —
> they are hosted-platform clients and ship **with the platform at Month 4** (see
> [Phased Launch & GTM Plan](./Actrone_Phased_Launch_GTM_Plan.md)). OSS = memory libraries only. This keeps the
> Phase-1 message pure (open, free, no account) and avoids marketing an SDK whose only purpose is to call the
> not-yet-public platform.
>
> _Last updated: 2026-07-12 · Owner: Matt_
>
> **2026-07-12 update (Additions wave).** The 26-item wave was **hosted/platform-focused** — data-law
> frameworks, feature packs, two-way channel chat, one-click templates, an MCP catalog expansion, and
> an **SEO/category-vocabulary pass** (which helps the §4 SEO backbone). **What it did NOT do matters
> more for this doc.** *(Correction, verified 2026-07-13: `create-actrone-app` — a `v0.1.0` scaffold
> CLI — and the **Mem0/Zep benchmark harness** now **exist in-repo**; they are no longer missing. The
> §5 month-1 prerequisites still genuinely OPEN are the **README overhaul, the Python zero-service
> default, the cookbook, and — for the two that now exist — publishing + running them** (npm publish;
> a public benchmark repo with real numbers). So the OSS wedge is further along than the pre-Additions
> reviews said.)* The honesty constraints below are unchanged.

---

## 0. The job of OSS marketing (be honest about it)

OSS marketing has **one job: manufacture a large, warm, instrumented developer install base** that
(a) becomes the demand into which the hosted platform launches in each geo (Wave 1+), and (b) feeds
the trace-capture funnel. It does **not** need to make money. Judge it on *installs, weekly-active
repos, and funnel signal* — not MRR.

**The honest constraints marketing must respect (from the deep code sweep):**
- The memory lib stores/retrieves *turns* — it lacks the extraction/consolidation/graph depth of
  Mem0/Zep. **Lead on governance-adjacency, framework-agnosticism, and DX — never on "smarter memory."**
- **TS adapters are structural (shallow) vs Python's deep integrations.** Don't market "7 adapters" as
  equal across languages; be precise.
- **`create-actrone-app` and the Mem0/Zep benchmark harness now exist in-repo** (verified 2026-07-13)
  — but a *benchmark result* is only a claim once the harness has been **run and published** with real
  numbers. Don't cite recall/latency figures until then (see §5).
- **Radical honesty is a brand trait — use it as a weapon.** Developers reward candor. Publishing the
  honest gaps *builds* trust in a category full of overclaim.

---

## 1. Positioning for developers (the OSS one-liner)

> **`actrone-memory` — production-shaped agent memory, free and framework-agnostic. Two-tier (fast +
> semantic), budget-aware, runs local. One import away from governed, hosted memory when you're ready.**

- **Front door for devs:** *the memory your agent framework is missing — free, no lock-in, works with
  what you already use.*
- **The quiet hook (don't oversell it):** it's also the on-ramp to a governed control plane. The
  upgrade is literally one import swap. Plant the seed; don't lead with the upsell.
- **Never say:** "smarter memory," "beats Mem0/Zep on recall quality," "production-grade" without the
  caveat, or "7 adapters" without noting the TS depth difference.

---

## 2. The audience + where they are

| Segment | What they want | Where to reach them |
| --- | --- | --- |
| **Framework users** (LangChain/LangGraph/CrewAI/LlamaIndex/Vercel AI/Mastra) | drop-in memory for their stack | framework docs/directories, their Discords, framework-tutorial SEO |
| **Indie AI builders / agent hackers** | fast, free, no infra to run | HN, r/LocalLLaMA, X AI-dev, dev newsletters, YouTube/streams |
| **Platform/infra engineers inside companies** | something they can self-host + trust | the wedge that later becomes the hosted intro inside the account |
| **Emerging-market devs (Africa/India)** — the differentiated bet | free, local-embedding (no paid API needed), works offline | regional dev communities, universities, local AI meetups |

> The **local-embedding / zero-service** path (TS default; Python `local` extra) is the emerging-market
> unlock: memory with **no OpenAI key and no cloud**. Most competitors can't say that. Lean into it.

---

## 3. The 10x plays (what makes this OSS launch different)

1. **Governance-adjacent memory, not "memory."** Every other memory lib competes on recall. We compete
   on *"the memory that graduates to governed."* The content angle no one else can run: **"what
   happens to your agent's memory in production — PII, audit, residency"** — which only we answer.
2. **Benchmark-led, honesty-first.** Publish a *real, reproducible* benchmark vs Mem0/Zep — and where
   we lose (memory-intelligence depth), **say so**. A benchmark that admits its weaknesses is more
   credible and more shared than one that doesn't. This is the radical-honesty brand trait as a growth
   loop. *(The benchmark harness is built — §5; it just needs to be run and published with real numbers.)*
3. **The 3-line, zero-service quickstart as the hero.** `npm i actrone-memory` → memory in ~3 lines,
   no Redis/Qdrant. The lowest-friction free option in the category. The whole launch leads with *time-
   to-first-value*, filmed.
4. **Framework-adjacency land-grab.** Be *in* every framework's memory/integration directory with a
   real adapter. Distribution-by-adjacency: meet devs where they already are instead of pulling them out.
5. **The interpreter demo as the cross-over viral asset.** Even though it's a hosted feature, the
   *governed real-time interpreter* demos in 60s and is the most shareable thing we have — use it as
   the "and when you're ready, this is what governed looks like" bridge in dev content.
6. **The Africa/emerging-market wedge** (differentiated, most competitors ignore): local-embedding +
   free + governed-when-you-scale is a leapfrog story for regulated fintech dev ecosystems.

---

## 4. Channels & tactics (Wave 0, months 1–4, global)

- **Owned content + SEO (the backbone):** the OSS-flavored content pillars from the
  [Content Calendar](./Actrone_Content_Calendar.md) — memory deep-dives, framework tutorials,
  "governed vs ungoverned agent," "what breaks in production." Rank on *"open-source agent memory,"
  "LangGraph memory," "self-hosted AI agent memory."*
- **Launch moments:** Show HN, Product Hunt, r/LocalLLaMA + r/MachineLearning (value-first), X AI-dev
  threads (founder voice), and the dev newsletters (TLDR AI, etc.). Lead with the quickstart + the
  benchmark + the interpreter GIF.
- **Framework ecosystems:** adapters listed + documented in LangChain/LlamaIndex/Vercel/MCP
  directories; guest tutorials on framework blogs; be a first-class MCP client.
- **GitHub as a growth surface:** a killer README (quickstart above the fold, honest capability table,
  the benchmark, the import-swap upgrade), `good-first-issue` labels, fast issue response, a
  `create-actrone-app` scaffold, and a visible ROADMAP + SECURITY.md (the honesty signal).
- **DevRel motion:** live-coding streams, a cookbook of real examples per framework, conference
  lightning talks, and *showing up* in the framework Discords as a helpful contributor, not a marketer.
- **Repurpose everything:** each piece → blog + newsletter + X/LinkedIn + community + <60s video/GIF.
  One artifact, five surfaces (per-piece checklist in the Content Calendar).

---

## 5. Month-1 prerequisites (finish these before the launch push)

Status refreshed 2026-07-13 — two of these are now built and just need publishing/running:

- [x] **`create-actrone-app`** scaffold — BUILT (`create-actrone-app` `v0.1.0`, local-first, zero
      services, no API key). Residual: **publish to npm** + a filmed time-to-first-value walkthrough.
- [~] **The Mem0/Zep benchmark** — the **harness** is BUILT (`actrone-memory-py/.../benchmark/`:
      `compare/competitors/dataset/harness` + README). Residual: **run it and publish a public repo
      with real numbers, honest about where we lose.** Still the single most important launch artifact —
      but now a *run+publish*, not a *build*.
- [ ] **README overhaul** to the front-door line + honest capability table + the import-swap upgrade.
- [ ] **Give Python memory a zero-service/local default** (parity with TS) to kill the two-datastore
      first-run friction — or at minimum a one-command `docker compose` for Redis+Qdrant.
- [ ] **A cookbook** (≥1 real example per framework) — the current examples are too thin for a
      "5-minute quickstart" campaign.

---

## 6. Metrics (instrument before launch — see GTM §6)

| Metric | Why | Illustrative target (replace with real data) |
| --- | --- | --- |
| Weekly OSS installs (pip + npm) | the top-of-funnel volume | growth WoW |
| GitHub stars + weekly-active repos | mindshare + real usage | rising WAU repos |
| Quickstart completion (install → first retrieval) | DX health | ≥40% |
| Framework-directory referral traffic | adjacency working | rising share |
| **OSS → hosted-signup rate** (the funnel handoff) | the whole point of the wedge | measured, then optimized |
| Benchmark repo stars / forks | the honesty-led asset's reach | — |

**North star for OSS:** *weekly-active OSS repos* (real usage), with *OSS→hosted-signup rate* as the
coupling metric that proves the wedge is feeding the position.

---

## 7. Guardrails (what OSS marketing must NOT do)

- **Don't overclaim memory intelligence.** Lead on governance-adjacency + DX + framework-agnostic.
- **Don't market TS + Python as equal-depth.** Be precise about the structural-vs-deep adapter split.
- **Don't promise what isn't *published/run*** — `create-actrone-app` + the benchmark harness are built
  (§5), but promise `npm i create-actrone-app` only once it's on npm, and cite benchmark numbers only
  once the harness has been run and the results published.
- **Don't hard-sell the hosted upgrade in dev channels.** Plant it (the import swap); let usage pull.
- **Don't market voice-on-live-calls or the new auth as proven.** The interpreter *demo* is fine; a
  live-call promise is not (Product Review §2.2).
- **Keep it on-brand:** Black & Apple-Silver, Geist, sentence case, lucide icons, the signature effects
  for hero visuals — no gradients, no hype adjectives. Restraint *is* the brand (see [Ad Campaign](./Actrone_Ad_Campaign.md)).

---

## 8. The one line

> **Give developers the best free, no-lock-in agent memory in either language, be brutally honest about
> what it is and isn't, meet them inside their framework, and let the "one import to governed" seed do
> the quiet work — so that when hosted opens in their region, the demand is already warm.**
