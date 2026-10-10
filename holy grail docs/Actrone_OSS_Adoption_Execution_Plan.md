# Actrone OSS Adoption — 4-Month Execution Plan & Launch-Readiness Review

> **Goal.** Drive mass adoption of the two open-source governed agent-memory libraries — Python
> `actrone-memory` (pip) and TypeScript `actrone-memory` (npm) — to **1,000+ GitHub stars in a
> 4-month window (months 1–4)**, land a parallel pipeline of **hosted-platform design partners**, and
> come out of month 4 **raise-ready** for a seed round, with the **hosted platform launching in month 5**.
>
> **Scope note (locked).** "OSS" = **the two memory packages ONLY** (`actrone-memory` on PyPI and npm).
> The client SDKs (`actrone`, `@actrone/sdk`) are **NOT** part of the OSS wave — they ship with the hosted
> platform in month 5. Any SDK-versioning/parity item is out of scope for this plan. The **OSS-only
> marketing site + Founding-500 waitlist are already BUILT** (`frontend/apps/marketing`: `WaitlistForm`,
> `FoundingWaitlist`, `api/waitlist/*`, `lib/founding.ts`) — not a launch dependency; only content/QA
> remain.
>
> **This doc is the single spine** that ties together the ~20 existing GTM/marketing/sales/launch docs.
> It is grounded in a four-track read-only review of every one of them plus the actual repos
> (2026-07-19). The individual docs are **honest and high-quality**; the weakness is **integration** —
> no single launch runbook, no star/VC ladder, a few un-reconciled contradictions, and a set of
> already-built assets that simply haven't shipped. Owner: Matt.

---

## 0. The one-paragraph truth

**The hard, credibility-defining things are already right.** The killer demo is fully built. The
npm/PyPI publishing runbook is best-in-class (OIDC trusted publishing, provenance, SBOM/cosign). The
benchmark harness exists. `create-actrone-app` exists. The READMEs are honest — **no unsubstantiated
"beats Mem0/Zep/Letta" claim anywhere in the shipping surface**, and the TS-vs-Python adapter-parity gap
is disclosed truthfully. **What's missing is execution + integration, not engineering:** the packages
aren't published, the demo has no captured video or hosted URL, the benchmark hasn't been run, and the
GTM docs don't yet agree on the star target, the hosted-launch month, the tier names, or the
benchmark posture — and no doc owns the launch-day runbook or the 1,000-star ladder. This plan closes
exactly those gaps. **Nothing here is a rebuild; it is ~1–2 weeks of "ship what's built + fix ~5
credibility cracks + reconcile the docs," then a 16-week distribution engine.**

---

## 1. Readiness review — verdict on the existing docs

| Doc | Verdict | Required action |
|---|---|---|
| `Actrone_Marketing_Strategy_OSS.md` | **Fresh, mis-fit** | Adopt an explicit 1,000-star target + ladder (it currently refuses one); fix the "Month 4 hosted" line → Month 5; add channel/launch-day specifics. |
| `Actrone_Ad_Campaign.md` | **Fresh** | Keep W0 mostly-organic; add the organic star-asset formats (README hero, quickstart GIF, benchmark chart); quantify the small retargeting budget. |
| `Actrone_Content_Calendar.md` | **Fresh facts, mis-aimed** | **Invert pillar weighting** (dev/OSS leads, not CISO); extend 12→16 weeks; fold per-channel cadence + star milestones into each week. |
| `Actrone_SEO_And_Analytics_Master_Guide.md` | **Fresh** | Keep as the ops manual; add an OSS keyword cluster to own ("agent memory", "governed memory", "LangChain memory", "local-first memory"). Slow compounder — not the launch driver. |
| `Actrone_Distribution_And_GTM_Strategy.md` | **Fresh** | Replace "stars = growth WoW, not absolute" with the committed ladder; add month-4 plan (it stops at 90 days). |
| `Actrone_OSS_Launch_Marketing_Gate_Plan.md` | **Built; label stale** | The OSS-only site mode + Founding-500 waitlist are **BUILT** (`frontend/apps/marketing`) — flip the doc's "build not started" status to BUILT; only content/QA remain. Reconcile Founding-500 with Lighthouse. |
| `Actrone_Phased_Launch_GTM_Plan.md` | **Needs-update** | **Reconcile: star gate 3k→1k floor; hosted Month 4→5; tier names; and retire the "beats Mem0/Zep/Letta/Cognee" table language** to the "ships its own reproducible eval" posture the rest already use. |
| `Actrone_Sales_Strategy_OSS.md` | **Needs-update** | Single-source the tier taxonomy + the `$499 Scale` number (conflicts with Phased-GTM). It's a month-5+ conversion doc — fine, but wire it to the Founding-500 → Lighthouse funnel. |
| `Actrone_Lighthouse_Outreach_Playbook.md` | **Fresh** | Make the OSS-window sequencing explicit: months 0–4 = source/qualify/private-preview; deploy references at month-5 hosted GA. Reconcile with Founding-500. |
| `docs/launch/oss-launch-copy.md` | **Fresh, incomplete** | Fill placeholders (`{{REPO_HUB}}`, `{{BENCHMARK_URL}}`, `{{WAITLIST_URL}}`); add **Reddit (r/LocalLLaMA)** + **dev-newsletter** copy; add a timing/owner header that points at §6 here. |
| `Actrone_OSS_Demo_System_Plan.md` | **Stale label** | Flip "Status: PLAN" → **BUILT** (the demo is done, P0–P5 green); track the remaining capture/host/publish tasks. |
| `Actrone_SDK_OSS_Publishing_Runbook.md` | **Fresh, UN-EXECUTED** | Execute it. Align version asymmetry (Python SDK `actrone` 1.0.0 vs TS `@actrone/sdk` 0.1.0); pin GH actions to commit SHAs first. |
| `Actrone_Pitch_Deck_Draft.md` | **Fresh scaffold** | After the star number exists: fill Part B (team, sourced TAM/SAM/SOM, ask, use-of-funds, milestones), add a **traction/funnel slide framed on the OSS-star wedge**, build the PDF. |
| `Actrone_Product_Review_and_Financial_Model.md` | **Needs-update** | Fix the two stale Go-SDK refs (§4.1/§4.5 contradict its own §7); fix "Python needs Redis+Qdrant" → local-first default; **re-base the model to the real clock** (months 1–4 = OSS, revenue from month 5) + add the OSS-traction layer; wire funnel analytics (§8.6). |
| `Actrone_Memory_Strategy_And_Roadmap.md` | **Needs-update** | Fix the internal contradiction (Python local-first shipped vs "needs Redis+Qdrant"); soften "Moats A–F all shipped" to match the unrun-benchmark reality in its own §5/§7. |

**Net:** 6 fresh, 5 fresh-but-mis-fit/incomplete, 5 needs-update, **0 fundamentally wrong**. No stale
Go/Clerk leaks in the shipping surface. The staleness that exists is **fit, integration, and a handful
of factual contradictions** — not direction.

---

## 2. Decisions to LOCK (reconcile the contradictions)

These are the single-source-of-truth calls that resolve every cross-doc conflict the review found.
Update the affected docs to match.

1. **Star target = 1,000 stars committed by end of month 4; 3,000 = stretch.** Kills the "refuse an
   absolute number" hedge and the Phased-GTM "≥3k gate." Ladder in §5.
2. **Hosted platform GA = Month 5.** Every "Month 4 hosted" reference (Marketing-OSS, Phased-GTM) is
   wrong. Months 1–4 are **OSS-only**.
3. **OSS-wave north star = weekly-active installs + repos using the lib** (a `MemoryManager.create()`
   telemetry ping is already designed) — NOT "weekly governed tasks," which needs the hosted platform.
   Governed-tasks becomes the north star at month 5.
4. **Benchmark posture = no "beats X" until Gate E is run AND published as a reproducible repo.** Until
   then, lead on the axes we can honestly own **now** — **local-first / zero-service, latency, cost,
   PII-safe-on-local-models, and governance** — and frame the eval as "we ship our own reproducible
   benchmark; run it yourself." Retire the Phased-GTM "beats Mem0/Zep/Letta/Cognee" language.
5. **One tier taxonomy** (single-source in the Sales doc): **Free (OSS + hosted free-cap) · Pro · Team ·
   Enterprise.** Retire the parallel "Core/Pro/Scale $499" naming. *(Exact prices are the owner's call —
   but the names and the free-cap number must exist in exactly one place.)*
6. **Two design-partner funnels reconciled:** **Founding-500** = the broad top-of-funnel waitlist
   (anyone wanting hosted early access). **Lighthouse** = the qualified subset — 3–5 named,
   regulated-vertical design partners sourced *from* the waitlist + stargazers + install telemetry.
   Months 0–4 = source / qualify / private-preview only; **deployed references start at month-5 GA.**
7. **VC-readiness gate (defined, §11):** raise-ready = **1,000+ stars + 3–5 signed hosted design
   partners + a Founding-500 waitlist with real depth + ≥1 design partner deployed (month 5)** — and the
   pitch/financials re-based to this clock.

---

## 3. Gating prerequisites — "ship what's already built" (P0, weeks 1–2, launch cannot happen without these)

Every one of these is a *built* asset that isn't *shipped*. This is the critical path.

- [ ] **Publish both memory packages at one aligned version.** They're a parity pair launched together,
      so ship them on the **same version**. Today they're mismatched: `actrone-memory` = `0.2.0` (with an
      internal 0.1.0/0.2.0 changelog history; the flagship **local-first is still under `[Unreleased]`**),
      `actrone-memory` = `0.1.0` (unreleased). **Decision: both = `0.1.0` as the first *public* release**
      — nothing is on PyPI/npm yet, and `0.x` honestly signals "early, API not frozen" (do NOT launch at
      `1.0.0`). Cleanup: collapse Python's `0.1.0`/`0.2.0`/`[Unreleased]` changelog into a single
      `0.1.0 — first public release` (incl. local-first) and set `pyproject.toml` back to `0.1.0`.
      **Verify neither package was ever pushed to a public registry first** — if `actrone-memory 0.2.0`
      was ever public, go *forward* (`0.3.0`) and align TS up instead. Until published, every install
      instruction is a dead end. *(This is the memory-package OSS scope ONLY — the client SDKs `actrone`
      / `@actrone/sdk` publish separately with the platform in month 5 and are NOT part of this plan.)*
- [ ] **Run Gate E + publish the benchmark repo.** The harness exists
      (`actrone-memory-py/.../benchmark/`). Run it against Mem0/Zep/Letta (their libs + API keys + the
      documented thin adapter), publish a **public, reproducible** `actrone-memory-benchmark` repo, and
      *then* upgrade the language from "capability" to "measured win **on the axes we actually win**"
      (latency/cost/local-first) — being explicit where we don't (raw semantic-recall depth).
- [ ] **Capture + host the demo.** Record the **30–60s GIF** and the 90/30/15s video (shotlist ready),
      stand up a **hosted live / StackBlitz** instance, publish the public `actrone-memory-demo` repo,
      and **embed the GIF at the top of all three memory READMEs.** This is the **single highest-leverage
      star lever** — an impressive asset that is currently invisible.
- [x] **OSS-only marketing site + Founding-500 waitlist — already BUILT** (`frontend/apps/marketing`:
      `WaitlistForm`, `FoundingWaitlist`, `api/waitlist/*`, `lib/{founding,flags}.ts`). This is the
      conversion + design-partner top-of-funnel. **Remaining: content/QA only** — fill the OSS homepage
      copy, verify the waitlist capture + count endpoints end-to-end, and flip the gate-plan doc's status
      to BUILT. Not a launch dependency.

---

## 4. Repo publish-readiness fixes (the ~5 credibility cracks)

First impressions decide stars. These are small and decisive.

**P0 — before any Show HN / Product Hunt:**
- [ ] **`actrone-memory-py` README badge URLs** point at `actrone/actrone-memory`; the repo is
      `actrone/actrone-memory-py` → the CI badge renders as a permanent 404. Fix the URLs.
- [ ] **`actrone-memory-py` Configuration table (README:270-271)** still says
      `ACTRONE_OPENAI_API_KEY *(required)*` / `ACTRONE_EMBEDDING_PROVIDER openai` — the **exact opposite**
      of the local-first hero pitch (real defaults: `backend="memory"`, `embedding_provider="local"`).
      Fix it; it's a trust-puncture on the most-scrutinised page.
- [ ] **`actrone-memory` README has zero badges** → reads as unofficial in the 3-second scan. Add the
      row (npm version, CI, license, downloads).
- [ ] Replace `actrone-memory-py`'s **hardcoded `coverage-95%` badge** with a CI-generated one (or drop).

**P1 — before broad promotion:**
- [ ] Add `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` to the **TS** repo (it's materially
      thinner than Python); add `CODE_OF_CONDUCT.md` + issue/PR templates to **both**.
- [ ] Set each repo's **GitHub description + topics** (`ai-agents`, `memory`, `llm`, `rag`, `langchain`,
      `typescript`, `python`, `local-first`) — decisive for discovery/search.
- [ ] Add a factual **"how it compares" capability table** (no benchmark claim) once Gate E lands.

---

## 5. The star-milestone ladder (what each unlocks)

| Milestone | When (target) | What it unlocks / proves |
|---|---|---|
| **First 50** | launch day, hour 0–6 | Show HN + PH seeding; proves the demo GIF converts. |
| **100** | end of launch week (W3) | validates the wedge; first "trending" eligibility on GitHub topics. |
| **300** | end of Month 1 | benchmark repo + framework-tutorial wave; first newsletter pickups. |
| **500** | end of Month 2 | DevRel/creator collabs justified; begin qualifying Founding-500 → Lighthouse. |
| **750** | end of Month 3 | design-partner conversations warm; pitch traction slide starts to fill. |
| **1,000+** | end of Month 4 | **VC-readiness gate**; hosted-launch (month 5) has a real audience; raise-ready. |

Instrument stars daily (a simple GitHub-API cron into PostHog) so the curve is visible and each launch
moment can be timed against it.

---

## 6. The Launch-Week Runbook (the missing operational spine)

A single owner-and-time sequence. **Launch = week 3** (after P0 + repo fixes land in weeks 1–2).

**Day −7 → −2 (final prep):**
- P0 checklist (§3) all green: packages live (verify `pip install` / `npm i` on a clean box), demo GIF
  in all READMEs, hosted demo URL live, benchmark repo public, waitlist site live, placeholders filled.
- Line up the **Product Hunt hunter** + gallery assets (GIF thumbnail, 3–5 screenshots, tagline).
- Pre-write + peer-review the Show HN post (honest title + first comment that names what we *don't* win),
  PH tagline/description/maker-comment, r/LocalLLaMA value-first post, X/LinkedIn threads, dev.to
  cross-post. Fill `oss-launch-copy.md` placeholders.
- Warm the network: 15–30 people who'll authentically engage in the first hour (no vote-manipulation —
  genuine "we're live" heads-up).

**Day 0 (launch — a Tuesday–Thursday):**
- **00:01 PT** — Product Hunt goes live (auto or hunter-scheduled). Maker comment posted immediately.
- **~06:00–08:00 PT** — **Show HN** posted (best HN window). First comment (the honest one) within 2 min.
- **Then, staggered (not simultaneous):** X thread → LinkedIn → r/LocalLLaMA → relevant Discords/Slacks
  (LangChain, AI-eng communities) → dev.to article.
- **All day:** the reply/engagement bank from `oss-launch-copy.md`; an **issue-triage on-call** (respond
  to every issue/PR within an hour — responsiveness converts drive-bys to stargazers); monitor for a
  challenged claim → the **rollback line** (link the reproducible benchmark; concede honestly).
- **Owner:** one DRI runs the day; do not context-switch to code.

**Day +1 → +7 (sustain):**
- Post the **benchmark repo** as its own moment mid-week (second spike).
- Thank-you + "what's next" post; triage the issue backlog; publish the first framework tutorial (§7 W3).
- Capture emails via the demo/README → Founding-500. Start sourcing Lighthouse candidates from
  stargazers + install telemetry.
- Retro: what converted, which channel drove stars, update the ladder.

---

## 7. The 16-week execution calendar (content + channel + milestone) — dev-weighted

Invert the old CISO-weighted calendar: **OSS/dev content leads; governance/buyer content is the
month-4 bridge to the hosted launch.** One "moment" per week; sustain content between.

| Wk | Theme / key asset | Channel action | Star target |
|---|---|---|---|
| **1** | Ship: publish packages, run Gate E, fix repo cracks | (internal) verify installs on clean boxes | — |
| **2** | Capture: demo GIF + hosted demo + waitlist site live; launch copy finalised | soft-launch to 20–30 friendlies; seed Discords | ~30 |
| **3** | **LAUNCH** (demo + libs) | **Show HN + Product Hunt + Reddit + X/LinkedIn** (Runbook §6) | **100** |
| **4** | **Benchmark repo** ("run it yourself") | HN "Show HN: reproducible agent-memory benchmark"; dev.to writeup; first newsletter pitches (TLDR AI, Ben's Bites, Latent Space, Rundown AI) | 200 |
| **5** | Tutorial: "Give your LangChain agent real memory in 5 min" | r/LangChain, LangChain Discord, dev.to, YouTube short | 260 |
| **6** | Tutorial: Vercel AI SDK + `actrone-memory` (TS wedge) | r/nextjs, X, dev.to; ship a StackBlitz | 320 |
| **7** | Deep-dive: "How local-first agent memory works (no service, no key)" | HN blog post, r/LocalLLaMA, newsletter | 400 |
| **8** | Creator/DevRel collab #1 (framework-adjacent YouTuber) | sponsored/organic video; cross-post | **500** |
| **9** | Tutorial: CrewAI / LlamaIndex memory recipe | respective communities + dev.to | 560 |
| **10** | "Bitemporal / self-editing memory" internals post (a differentiator, honestly scoped) | HN, X, newsletter | 640 |
| **11** | Comparison-of-approaches (factual, post-benchmark) + case-y snippet | r/MachineLearning, LinkedIn | 720 |
| **12** | Creator/DevRel collab #2 + community AMA | Discord AMA, YouTube | **750** |
| **13** | **Hosted teaser**: "governed memory graduates" — Founding-500 push | X/LinkedIn, waitlist CTA everywhere; email the list | 820 |
| **14** | Governance bridge content (the buyer wedge begins) | LinkedIn, one buyer newsletter | 880 |
| **15** | Design-partner spotlight / private-preview drumbeat | LinkedIn, targeted outreach | 940 |
| **16** | **Sustain + pre-launch**: recap thread, "1,000 stars" moment, month-5 launch trailer | all channels; PH "coming soon" for hosted | **1,000+** |

Between moments: 2–3 sustain touches/week (a tip, a snippet, an issue-highlight, a reply in a
community). Every piece follows the one-piece-five-surfaces distribution checklist with UTM tags.

---

## 8. Channels & tactics (the specifics the docs lacked)

- **Show HN** — honest title ("Show HN: Open-source governed memory for AI agents (local-first, TS +
  Python)"); first comment names what we *don't* win; be present all day. Two HN moments (launch +
  benchmark). Never ask for upvotes.
- **Product Hunt** — hunter lined up; GIF thumbnail; maker comment at 00:01 PT; rally genuine network.
- **Reddit** — value-first, not promo: r/LocalLLaMA (local-first angle), r/LangChain, r/AI_Agents,
  r/LlamaIndex, r/MachineLearning (benchmark). Lead with the problem, link last.
- **Dev newsletters** — pitch TLDR AI, Ben's Bites, Latent Space, Rundown AI, The Rundown; a small
  **sponsored-slot budget** (§12) is the fastest paid lever for stars.
- **dev.to / Hashnode** — cross-post every tutorial with canonical tags (`ai`, `python`, `typescript`,
  `langchain`, `machinelearning`).
- **YouTube / DevRel** — 2 framework-adjacent creator collabs (weeks 8, 12); short-form clips of the demo.
- **X / LinkedIn** — X for dev reach (threads, demo clips); LinkedIn for the month-4 buyer/design-partner
  bridge.
- **Discords/Slacks** — LangChain, LlamaIndex, AI-engineering communities: be a helpful member first.
- **SEO (slow compounder)** — own the "agent memory / governed memory / local-first memory / LangChain
  memory" cluster via the tutorials; `llms.txt` + AI-crawler-friendly docs for answer-engine citations.

---

## 9. The demo → star → hosted-conversion funnel (+ instrumentation)

The funnel is designed in pieces across docs but **nobody owns it end-to-end or measures it.** Own it here:

`hosted demo / GIF → repo star + install → (telemetry ping) → Founding-500 waitlist → hosted signup
(month 5) → first governed task → paid`.

- **Instrument now** (the review flagged analytics "still needs wiring", Product Review §8.6): the
  `MemoryManager.create()` telemetry ping (installs/WAU), stars-cron → PostHog, waitlist conversion, and
  UTM on every content link. Without this the star curve and the VC traction slide are guesses.
- **The one-import upgrade seed** (`from actrone_memory` → `@actrone/sdk`'s `ActroneMemoryManager`) is the
  conversion mechanic — make sure it's front-and-centre in READMEs + demo end-screen.

---

## 10. Design-partner motion (parallel to the star push)

- **Months 1–4 = source / qualify / private-preview**, NOT deployed references (self-host/BYOC deploys
  need the hosted platform → month 5). Source from: Founding-500 waitlist, stargazers, install telemetry,
  and warm outbound in **one regulated vertical** (per the Lighthouse playbook's ICP scorecard).
- **Target: 3–5 qualified design partners** in the pipeline by end of month 4, with private-preview
  access + a signed intent. Use the ready outreach copy (champion + security buyer + follow-up).
- **Month 5 = land 1 → prove 1 → publish 1** (deploy the first reference at hosted GA).
- Keep Founding-500 (breadth) and Lighthouse (depth) as **one funnel, two tiers** — don't run them as
  disconnected lists.

---

## 11. VC-readiness gate + pitch/financials fixes

**Raise-ready (end month 4 → raise in month 5):** `1,000+ stars + measurable install/WAU curve + 3–5
signed design partners + a real Founding-500 list + (month 5) ≥1 partner deployed`.

What to fix so the raise can go out (do the numbers *after* the star curve exists):
- **Financial model** — re-base to the real clock: months 1–4 = OSS (stars/installs/signups, **no hosted
  revenue**), revenue from **month 5**; add the OSS-traction → conversion layer; wire the funnel (§9).
  Fix the two stale Go refs + the Redis/Qdrant contradiction (diligence hygiene).
- **Pitch deck** — fill Part B (team, sourced TAM/SAM/SOM, the ask, use-of-funds, milestone N/M/$),
  **add a traction/funnel slide framed on the OSS-star wedge**, build the PDF (DocSend). Keep the
  "do-not-say" honesty list (it protects diligence). The **moat narrative + model shape are already
  seed-ready**; traction, market-sizing, team, and the ask are the placeholders the 4-month push fills.

---

## 12. Budget & owners

- **DRI:** one named owner for the launch + the calendar (DevRel-style). Non-negotiable — a stars sprint
  dies without a single driver.
- **Budget (organic-first, but not $0):** a small **sponsored dev-newsletter** allocation (the fastest
  paid star lever) + **2 creator collabs** (weeks 8, 12) + PH assets + a token retargeting spend on the
  two dev creatives (A1 quickstart, A2 honest-benchmark). Quantify it in `Ad_Campaign.md` §5's W0 row —
  it's currently unpriced. Everything else is time.

---

## 13. Doc-update worklist (single-sourcing the decisions from §2)

1. **`Actrone_Phased_Launch_GTM_Plan.md`** — star gate 3k→1k floor; hosted Month 4→5; retire "beats
   Mem0/Zep/Letta/Cognee" → reproducible-eval posture; fix tier names.
2. **`Actrone_Sales_Strategy_OSS.md`** — single-source the tier taxonomy + free-cap/price numbers.
3. **`Actrone_Marketing_Strategy_OSS.md` + `Actrone_Distribution_And_GTM_Strategy.md`** — adopt the
   1,000-star ladder (§5) as north star; fix the Month-4 hosted line; add month-4 plan.
4. **`Actrone_Content_Calendar.md`** — replace with the §7 16-week, dev-weighted, channel+milestone grid.
5. **`docs/launch/oss-launch-copy.md`** — fill placeholders; add Reddit + newsletter copy; header → §6.
6. **`Actrone_OSS_Demo_System_Plan.md`** — flip PLAN→BUILT; track capture/host/publish.
7. **`Actrone_Product_Review_and_Financial_Model.md`** + **`Actrone_Memory_Strategy_And_Roadmap.md`** —
   fix Go refs, Redis/Qdrant contradiction, "Moats A–F shipped" softening; re-base the model.
8. **`Actrone_Lighthouse_Outreach_Playbook.md` + `Actrone_OSS_Launch_Marketing_Gate_Plan.md`** — reconcile
   Founding-500 ⟷ Lighthouse; make OSS-window sequencing explicit.

---

## 14. Risks & the honesty guardrails (keep these — they're the moat's credibility)

- **Never claim "beats Mem0/Zep/Letta" until Gate E is run + published.** Lead on the axes we win; concede
  where we don't. This discipline is already in the docs — protect it; it *is* the trust that earns stars
  in a skeptical dev audience.
- **The flagship feature must be in the *released* version**, not `[Unreleased]` — verify the published
  package actually has local-first before pointing anyone at it.
- **Responsiveness > reach** in week 1: an unanswered issue on launch day loses more stars than a missed
  channel gains.
- **Two clocks risk:** keep the financial model, the GTM calendar, and the demo funnel on the *same*
  clock (4-mo OSS → month-5 hosted). The current mismatch is the top diligence smell.
- **Don't let the hosted/governance story cannibalise the OSS wedge** in months 1–4 — dev-weighted until
  the month-4 bridge.

---

Last updated: 2026-07-19 | Owner: Matt | Spine for the OSS GTM doc suite (see §1). Companion to
`Actrone_Distribution_And_GTM_Strategy.md`, `Actrone_Marketing_Strategy_OSS.md`, `Actrone_Phased_Launch_GTM_Plan.md`.
