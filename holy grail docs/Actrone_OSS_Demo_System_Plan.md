# Actrone OSS Demo & Test System — Plan

> **Status:** PLAN. One premium, video-ready system that **proves** and **tests** the open-source memory
> libraries — `actrone-memory` (TS) + `actrone-memory` (Python). It is **both a demo and an acceptance/e2e
> test harness**: the scenarios you show on screen are the scenarios that run as assertions. Scope is the
> **OSS memory libs only** (no SDK, no hosted platform — those are Month 4).
>
> **Design intent:** *simple but rich.* One relatable scenario, one screen, deep substance — but it exercises
> the full configuration surface (in-memory → Redis + Qdrant + real embedder) and every capability toggle.
> Brand-locked (Black & Apple-Silver). Honest — it demonstrates **capability**, never "beats Mem0/Zep."
>
> Companion docs: `Actrone_Marketing_Strategy_OSS.md`, `Actrone_Phased_Launch_GTM_Plan.md`, `launch/oss-launch-copy.md`.

---

## 0. Core decision — one system, two backends, one shared scenario spec

The two libraries are the **same memory library in two languages**, at parity on the core. So:

**Build ONE system:**
- **one scenario** ("the AI that actually remembers you"),
- **one premium UI** (shared, brand-locked),
- **two thin backends** — `backend-ts` (Node + `actrone-memory`) and `backend-py` (FastAPI + `actrone-memory`) — behind an **identical HTTP contract**,
- a live **`TypeScript ⇄ Python` toggle** that repoints the UI at the other backend.

Because it's also the **test harness**, the shared scenario definitions become the **shared test spec**: both
backends must pass the *same* assertions on the *same* scenarios → **parity is tested, not just claimed.** That
answers "two systems or what?" — it's **one**, and the two-language nature becomes a verified feature.

---

## 1. What it must prove (honest USPs → demo moments)

Grounded in the real library capabilities. Leads on the honest moats — DX, zero-service local-first,
governance-adjacency, pluggable-to-production — **never** "smarter memory."

| USP (the honest moat) | Library capability | On-screen moment |
|---|---|---|
| **Memory that survives** | two-tier store (L1 session + L2 semantic), persistence | Restart the process → the agent still knows you |
| **Governance-adjacent memory** *(unique)* | opt-in extraction with **sensitivity: none / low / pii / sensitive** | Each fact shows a **tag**; a "redact PII" toggle masks pii/sensitive ones |
| **Zero-service, local-first** *(the wedge)* | `LocalEmbedder` (no key) + in-memory stores (no Redis/Qdrant) | The **"No API key · No database · Local"** badge (Profile A) |
| **Scales to production, no lock-in** | pluggable stores → Redis (L1) + Qdrant (L2) + real embedder | Flip to **Profile C** → same conversation, same recall, now backed by Redis + Qdrant |
| **Real retrieval, not keyword match** | hybrid dense + BM25 + recency fused with **RRF**, budget-aware | The Memory panel shows recalled memories + dense/lexical/recency → RRF + a token-budget bar |
| **Framework-agnostic, both languages** | TS + Python parity, framework adapters | The **`TS ⇄ Python`** toggle + the framework-recipe tabs (§5) |
| **A clean path to governed** *(the seed)* | API-compatible with hosted `ActroneMemoryManager` | One quiet line: *"→ one import to governed, hosted memory."* Not a pitch. |

The hero idea: memory is invisible, so **make it visible** — the live **Memory Inspector** beside the chat.

---

## 2. Configuration profiles — the scenarios to demo AND test

The single most important addition: the system must demonstrate the **whole configuration spectrum**, not just
the zero-service path. Same scenario, same UI — a **profile switcher** swaps what's behind it:

| Profile | Stores | Embedder | Extraction / rerank | Needs | Proves |
|---|---|---|---|---|---|
| **A — Local-first** | in-memory (or local file) | built-in `LocalEmbedder` (hashing) | off (or deterministic) | **nothing** — no key, no services | "runs on literally anything" (the wedge / emerging-market) |
| **B — Semantic local** | in-memory / file | **Ollama `nomic-embed-text`** | LLM extraction via Ollama | Ollama only (local, no cloud key) | real semantic recall + PII tagging, still no cloud |
| **C — Production** | **Redis** (L1 hot) + **Qdrant** (L2 semantic) | Ollama or cloud embedder | extraction + **rerank** + summarisation on | `docker compose up` (Redis + Qdrant) | pluggable-store architecture is **real**, scales, no lock-in |

- **A is truly zero-dependency** (keeps the "no strings" story honest). **C is one command** — the demo repo
  ships a `docker-compose.yml` (Redis + Qdrant); the backend auto-detects them and enables Profile C.
- The **profile switch is a demo beat *and* a test dimension**: the same assertions run against A/B/C, so we
  prove the library behaves consistently across backends (and catch a store adapter that drifts).
- Each capability is an independent toggle for testing: **extraction** on/off, **rerank** on/off,
  **summarisation** on/off, **token budget** (slider), **sensitivity classification** on/off.

---

## 3. The scenario (the video story) — five beats, run across profiles

Demo/system name **"Actrone OSS."** One user, one short conversation:

1. **Teach it (session 1).** *"I'm Alex, a Python dev. I prefer concise answers. On-call rotates weekly. My
   email is alex@acme.com. I've been anxious about the launch."* → the Inspector extracts durable facts,
   each **tagged**: `python dev` (none), `prefers concise` (low), `alex@acme.com` (**pii**), `launch anxiety`
   (**sensitive**).
2. **Prove persistence (restart).** **New session** → *"what do you know about me?"* → it recalls; the
   Inspector shows the hybrid retrieval + scores.
3. **Governance moment.** **Redact PII** toggle → pii/sensitive mask; the email is withheld.
4. **Scale + parity reveal.** Flip **Profile A → C** (now on Redis + Qdrant) → identical behaviour, badge
   updates to show the backing services. Flip **`TS ⇄ Python`** → same again on the other language.
5. **The seed.** *"When you go to production, it's one import to governed, hosted memory."* Fade.

Every beat maps to a §1 USP and is a passing assertion in §6.

---

## 4. Architecture — thin, honest, reproducible

```
        ┌──────────────────────────────────────────────────────────────┐
        │  UI  (one shared, brand-locked web app)                       │
        │  Chat  |  Memory Inspector (facts+tags, recall+RRF, budget)   │
        │  badges: No API key · No DB · Local   (updates per profile)   │
        │  switches: [Profile A|B|C]  [Redact PII]  [TypeScript ⇄ Python]│
        │  tabs: Core demo  |  Framework recipes (§5)  |  Test runner    │
        └───────────────┬──────────────────────────────┬───────────────┘
              same HTTP contract                same HTTP contract
                        ▼                                ▼
        ┌───────────────────────────┐   ┌───────────────────────────┐
        │ backend-ts (Node)         │   │ backend-py (FastAPI)       │
        │ actrone-memory           │   │ actrone-memory             │
        │  profile → store+embedder │   │  profile → store+embedder  │
        └───────────┬───────────────┘   └───────────┬───────────────┘
                    ▼  (Profile C only)              ▼  (Profile C only)
             docker compose:  Redis (L1)  +  Qdrant (L2)
```

- **Shared contract (5 tiny endpoints):** `POST /chat`, `GET /memory` (facts + tags + last-recall trace),
  `POST /reset`, `POST /profile` (switch A/B/C + toggles), `GET /health` (language + lib version + active
  profile). Identical JSON both sides — it's the contract the parity tests assert.
- **Backends stay thin** (~200–300 lines): construct `MemoryManager` per the selected profile, wrap
  `storeTurn` / extraction / `retrieveContext(budget)`. The demo shows **real** operations; only the model's
  prose may be scripted.
- **LLM (zero-cloud by default):** Ollama. Chat + extraction default **`qwen2.5:3b`** (best small-model
  extraction, multilingual), upgrade **`qwen2.5:7b`**; embedder **`nomic-embed-text`** (Profile B/C),
  multilingual upgrade **`bge-m3`**. Use **Ollama structured outputs (JSON schema)** for extraction so the
  sensitivity tagging is reliable. Profile A needs **no model at all** (deterministic) → the video path.

---

## 5. Framework adapters — build the core **agnostic**, prove the adapters in **recipes**

> Direct answer to "shouldn't we build it *on* one of our framework adapters?": **not the core — yes as a
> secondary layer.**

**Core demo = framework-agnostic** (a thin `LLM + memory` loop). Why not build it on LangChain/Vercel/etc.:
- The OSS's star is the **memory**; a framework's own agent loop would bury it and add weight (breaks "simple").
- Building on **one** framework picks a favourite and couples the demo to it; the TS and Python adapter sets
  target **different** frameworks at different depth, so "same demo, both languages" gets harder.
- Memory value shows *most clearly* with nothing else in the way.

**But the adapters are a headline USP**, so prove them in a dedicated **"Framework recipes" tab**: small,
self-contained panels each showing the **same** memory working *inside* a real framework via its adapter —
Vercel AI, LangChain, LangGraph, LlamaIndex, Mastra (TS); LangChain, CrewAI, AutoGen (Py); etc. These:
- **Reuse the existing `examples/frameworks/*` files** (already type-checked) — the demo/test harness
  **executes** them against Ollama + the memory lib, turning type-only examples into **run + tested + shown**.
- **Double as adapter e2e tests** (does the adapter actually drive a live turn end-to-end), complementing the
  CI **compat-matrix** (which checks *typed-call-site* fit across framework versions — a different layer, §6).

Net: the core proves *memory*; the recipes prove *framework-agnostic*. Both, without complexity in either.

---

## 6. Testing — the scenario spec **is** the test spec

Because this is also the acceptance/e2e harness:

- **Parity tests.** Every scenario runs against `backend-ts` **and** `backend-py` through the shared contract;
  assertions must match → **TS↔Python parity is verified**, not asserted in prose.
- **Config-matrix tests.** The same scenarios run across **Profiles A/B/C** and the capability toggles
  (extraction/rerank/summarisation/budget) → proves the pluggable stores + features behave consistently.
- **Assertions (examples):** recall@k on the seeded facts, correct **sensitivity tag** per fact, PII actually
  withheld when redaction is on, **token budget respected** (assembled context ≤ budget), persistence across
  `reset`, latency within a ceiling per profile.
- **Framework-recipe e2e** (§5): each adapter drives one live turn and recalls correctly.
- **CI:** Profile A/B in plain CI (Ollama or the deterministic path); Profile C via **compose services**
  (Redis + Qdrant) like testcontainers. This is **distinct from** the existing `ci/compat-matrix/` (drift-gate
  + version-matrix + typed-call-site canaries) — that guards *type fit across framework versions*; this guards
  *runtime behaviour across stores/languages*. Both belong to the OSS quality story.
- Keep it lean: it's **one scenario spec** expressed once, parameterised by profile/toggle/language — not a
  sprawling suite. Reuse over breadth.

---

## 7. Agentic scope — what it is / isn't (so the demo can't overclaim)

- **It is** a genuinely live, interactive agent: a real LLM loop (Ollama) with real memory, recall across
  sessions, memory-driven personalisation, and memory verbs (remember / recall / forget / summarise).
- **It is *not*** a tool/action-executing agent. The OSS is a memory **layer** — no tools, no orchestration,
  no governed execution. Web search, code exec, "do a task," and governed **action** are the **hosted platform
  / SDK (Month 4)**. Building them here would demo the demo's own glue code, overclaim what `pip install` gets,
  and step on the platform's actual moat.
- The path to real agentic **action** is the single "→ one import to governed, hosted" seed — a tease, not a
  build. If a tool call is wanted for feel, the only honest one reads/writes **memory** — but the
  restart-and-it-remembers moment is the stronger proof.

---

## 8. Premium design (brand-locked, restrained)

Per the locked identity: **Black & Apple-Silver**, **Geist** (sans + mono), sentence case, `lucide-react` @
`strokeWidth 1.5`, radii 4/6/8, **no gradients, no shadows** (depth = 1px `#262629` borders), colour only as a
status vector.

- **Layout:** Chat left, **Memory Inspector** right (the star). Generous whitespace.
- **Sensitivity tags** use the status ramp *only*: `none` muted · `low` info-blue · `pii` warning-amber ·
  `sensitive` error-red — the one place chroma appears, and it *means* something.
- **Retrieval + profile viz:** honest score bars (dense/lexical/recency → RRF), mono numerals, instant updates
  (no animated counters — brand rule). The active profile's backing services shown as quiet chips.
- **Motion:** one tasteful staggered reveal on store; honour `prefers-reduced-motion`.

Premium by **restraint + substance**, not decoration.

---

## 9. Simplicity guardrails — what stays OUT

- ❌ No hosted platform, SDK, gateway, governance dashboards, auth, accounts, or pricing (Month 4).
- ❌ No multi-agent orchestration, tools, or action execution — one agent, one memory (§7).
- ❌ No "beats Mem0/Zep" claim; the reproducible benchmark lives separately (Gate E gated).
- ❌ No feature the lib lacks (no knowledge graph, no self-editing blocks — those are hosted). Inspector shows
  **only real** operations.
- ❌ Profile C is **opt-in** (Docker); Profile A must always run with zero dependencies.
- ✅ Richness comes from **profiles + toggles + recipes + the Inspector**, all config-driven — not new subsystems.

---

## 10. Video demo plan (the 90-second cut)

> **Superseded by the film that actually shipped.** This section planned a 90s screen capture of the
> demo UI. What was built instead is rendered natively with Remotion from `actrone-memory-demo/video/`,
> driven by the same `spec/scenario.json` the tests use. Current deliverables: **59s hero**, **41s
> short cut**, **11s loop GIF**, plus a composed cover image at three sizes. Beats are Hook, Problem,
> Title, Teach, Tags, Restart, Recall, Redact, Parity, Eval, CTA. The "Scale (Profile A → C)" beat
> below was never built and is not in the film. See `actrone-memory-demo/video/README.md`.
>
> Kept because the beat intent below is still the honest content spec, and the honesty guardrails
> still bind in any medium.

| t | Beat | On screen |
|---|---|---|
| 0:00 | Hook | *"Your agent forgets everything between sessions."* — a blank Inspector |
| 0:10 | Teach | facts appear, **tagged** by sensitivity |
| 0:30 | Restart | **New session** → recall + retrieval scores |
| 0:45 | Governance | **Redact PII** → pii/sensitive mask |
| 1:00 | Scale | **Profile A → C** → same recall, now on Redis + Qdrant |
| 1:12 | Parity | **`TS ⇄ Python`** flip → identical |
| 1:22 | Seed + CTA | *"one import to governed hosted"* → `npm i actrone-memory` / `pip install actrone-memory` → star |

Deliverables: 90s hero cut, 30s social cut (teach→restart→recall), 15s GIF (tag + recall).

---

## 11. Build phases (MVP first, each shippable)

- **P0 — Spec.** Lock the 5 beats, the 5-endpoint contract, the profiles/toggles, the scripted-tour transcript,
  and the assertion list (spec = demo = test).
- **P1 — Backends.** `backend-ts` + `backend-py` against the contract; Profiles A + B (Ollama); the scenario
  spec runnable as assertions on both. **Exit:** identical JSON + green parity tests on A/B.
- **P2 — UI.** Chat + Memory Inspector + tags + retrieval viz + badges + profile/PII toggles, brand-locked.
  **Exit:** the guided tour plays end-to-end, premium, offline (Profile A).
- **P3 — Profile C + parity toggle.** `docker-compose` (Redis + Qdrant), Profile C auto-detect, the
  `TS ⇄ Python` switch, config-matrix tests green (A/B/C). **Exit:** all 5 beats + full matrix.
- **P4 — Framework recipes.** Wire `examples/frameworks/*` as executed, shown, e2e-tested recipe tabs.
- **P5 — Polish + record.** Motion, reduced-motion, WCAG-AA, loading/empty/error states, README (`git clone`
  → Profile A runs in <5 min, no key), video cuts.

MVP = **P1 + P2** (guided tour, Profile A/B, one language) — already demo-worthy. P3 is the differentiator;
P4 proves the adapters.

---

## 12. Distribution & reuse

- Ships as its **own public repo** `actrone-memory-demo` (sibling of the libs). `git clone && (npm|make) demo`
  runs Profile A locally, no key. A hosted live version links from the READMEs + marketing site.
- **It's the "5-minute quickstart, filmed"** the marketing plan calls for, the richer sibling of
  `create-actrone-app`, the **live sales demo** (flip to the customer's language on the call), **and** the OSS
  acceptance/e2e + parity test harness.

---

## 13. Honesty guardrails

- Inspector shows **only real** memory ops (store, hybrid recall, sensitivity tags); the **model** output may
  be scripted for a reproducible video — the **memory** is never faked.
- "No cloud key" is said only where the active profile truly needs none (A always; B/C use local Ollama, no
  cloud key unless a cloud embedder is chosen).
- Lead on **DX + local-first + governance-adjacency + pluggable-to-production**, never "smarter/best recall."
- The one platform mention (the seed) is a single non-clickable line — the platform is Month 4.

---

## 14. Locked decisions (2026-07-16)

1. **UI stack** — ✅ **Vite + React** static app (framework-agnostic; embeds anywhere; the OSS is memory-only,
   so no Next needed).
2. **Default LLM** — ✅ Ollama `qwen2.5:3b` (chat + extraction) + `nomic-embed-text` (embedder); upgrades
   `qwen2.5:7b` + `bge-m3`; Profile A needs no model (deterministic tour = the video path).
3. **Framework recipes (P4)** — ✅ first wave **Vercel AI + LangChain (TS)** and **LangChain + CrewAI (Py)**,
   expand after. Each reuses `examples/frameworks/*` and runs as an adapter e2e test.
4. **Name** — ✅ **"Actrone OSS"** — collision-free and brand-aligned (deliberately sidesteps recall.ai and
   Windows Recall). The demo/system is titled "Actrone OSS"; the agent within stays a generic assistant (no
   persona name needed). Repo stays `actrone-memory-demo` (#5).
5. **Repo** — ✅ its own public repo **`actrone-memory-demo`** (sibling of the libs), MIT, its own CI (mirrors
   `create-actrone-app`'s setup). Runs Profile A with `git clone && npm run demo`, no key.

---

*Plan v1.1 — one demo **and** test harness, two backends, one screen, three profiles (in-memory →
Redis+Qdrant+embedder). Core is framework-agnostic so memory stays the star; framework adapters are proven in
executed, e2e-tested recipes. The scenario spec is the test spec → TS↔Python parity is verified. Leads on the
honest moats — local-first, governance-adjacency, pluggable-to-production, DX — not "smarter memory."*
