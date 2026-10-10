# Actrone OSS launch: marketing site gate and Founding 500 plan

> **Status:** BUILT as of 2026-09-21; Founding 500 storage moved to Baserow (see §6.2 and §9).
>
> Put the **marketing site** (`frontend/apps/marketing`) into an
> **OSS-only launch mode**: everything that isn't about the open-source memory libraries (`actrone-memory`
> TS + `actrone-memory` Python) is **completely hidden** (not gated-to-coming-soon, *absent*) until each
> hosted feature-pack launches. Add (a) a homepage **OSS section** and (b) a **Founding 500** waitlist that
> collects sign-ups into a free third-party SaaS.
>
> Brand is **LOCKED** (Black & Apple-Silver, Geist, sentence case): layout/craft only. Copy must match the
> **honest** OSS positioning already written (`docs/launch/oss-launch-copy.md`, `docs/Actrone_Marketing_Strategy_OSS.md`):
> two-tier hybrid recall, budget-aware, PII/sensitivity-aware, local-first, framework-agnostic, and **never**
> "beats Mem0/Zep", no knowledge graph, no self-editing memory.

---

## 0. Key finding (read first)

The existing flag system (`src/lib/flags.ts`) is solid: `NEXT_PUBLIC_FEATURE_*` env flags, fail-safe OFF,
`GatedLink` + a coming-soon modal, and `gatedFeatureForHref()`. **But** its own docstring claims the security
boundary is enforced in `src/proxy.ts` (edge middleware), **and that file does not exist.** There is **no
`middleware.ts`** in the app. So today gating is **client-side only**: hidden nav links + a modal. A visitor
who types `/pricing`, `/enterprise`, `/marketplace`, or any platform docs URL **still gets the page.**

→ "Completely disabled to not even appear" therefore requires **building the missing route boundary** (an
allowlist middleware), not just hiding links. That is the load-bearing part of this plan.

---

## 1. The core decision: one master "OSS-only" mode

Add a single master flag on top of the existing per-feature flags:

```
NEXT_PUBLIC_LAUNCH_MODE = "oss"        # "oss" | "full" (default "full" so nothing changes until flipped)
```

When `LAUNCH_MODE === "oss"`, the site collapses to an **allowlist**. Everything else is removed from nav,
footer, homepage, and routing. This composes with the current flags (the per-feature flags still exist for
the eventual staged unlock of each feature-pack).

**The OSS allowlist, what stays visible:**

| Surface | Kept in OSS mode |
| --- | --- |
| Routes | `/` (home) · OSS docs (see §5) · `/legal/*` (privacy/terms, needed for the waitlist) · `/founding-500` (or homepage anchor) · `/api/waitlist` |
| External | GitHub repos (`actrone-memory-ts`, `actrone-memory-py`), npm/PyPI: all external, always fine |
| Homepage sections | OSS-focused hero · the new **OSS section** (§4) · the **Founding 500** section (§6) · footer |
| Everything else | **Hidden**: features, pricing, sandbox, changelog, blog, enterprise, marketplace, registry, partners, benchmarks, calculator, careers, about, trust, contact, control-tower docs, governance/orchestrator/tools/multi-agent/marketplace/self-hosting docs, sign-in/sign-up |

---

## 2. Mechanism: build on `flags.ts`, add the missing boundary

### 2.1 Flag + allowlist (`src/lib/flags.ts`)
- Add `LAUNCH_MODE` + `export const OSS_ONLY = LAUNCH_MODE === 'oss'`.
- Add `OSS_ALLOWED_PREFIXES: string[]` (the allowlist above) and `isRouteAllowedInOss(pathname): boolean`
  (exact match or `startsWith(prefix + '/')`, plus the OSS-docs sub-allowlist from §5).
- Keep everything backwards-compatible: when `OSS_ONLY` is false the site is unchanged.

### 2.2 The route boundary: **new `src/middleware.ts`** (the "not even appear" enforcement)
- Next.js edge middleware. When `OSS_ONLY`:
  - **Allowed** path → continue.
  - **Disallowed** page → **redirect to `/`** (friendly; a stray link lands on the OSS homepage) **or 404**
    (stricter "doesn't exist"). *Recommend redirect-to-home* for launch UX; make it a one-line switch.
  - **Disallowed API route** (e.g. anything but `/api/waitlist`, `/api/health`) → `404`.
- This is also the honest home for the boundary `flags.ts` already advertises; it retires the fictional
  `proxy.ts` reference.
- Matcher excludes `_next`, static assets, and the allowlisted API.

### 2.3 Nav + footer: OSS-only link sets
- **`TopNav.tsx`**: when `OSS_ONLY`, swap `NAV_LINKS` for an OSS set, e.g. `Open source`, `Docs` (OSS),
  `GitHub`, and a `Founding 500` CTA. Replace the `Sign in` / `Get started` CTAs with **`Join Founding 500`**
  + the GitHub-stars button. (The component already maps over a link array, so gate the array, not the JSX.)
- **`Footer.tsx`**: OSS-only columns, namely Open source (memory TS + Python, GitHub, npm, PyPI), Docs (OSS),
  Founding 500, Legal (privacy/terms). Drop product/platform/company columns.
- Both keep using `GatedLink`, but in OSS mode the *arrays themselves* are the allowlist, so nothing gated
  even renders.

### 2.4 Homepage composition (`src/app/(marketing)/page.tsx`)
- The homepage is one big platform narrative (Hero → Problem → Architecture → … → Cta). In OSS mode render a
  **different composition**:
  - **Hero**: reuse the existing hero but OSS-first: it already has the `HeroCodeSwitcher` with the real
    `actrone-memory` quickstarts. Default it to the OSS tab; trim hosted-only proof
    stats to OSS ones (MIT, local-first, both languages, budget-aware).
  - **OSS section** (§4): the new capabilities/benefits/workflow showcase.
  - **Founding 500** (§6).
  - Footer.
  - Hide: Problem, Architecture, HowItWorks, PlatformBento, Governance, Open (platform), Ship, Marketplace,
    Moat, Persona, PricingTeaser, Cta, MemoryIntroModal.
- Implement as `OSS_ONLY ? <OssHome/> : <FullHome/>` so the platform homepage stays intact for later.

---

## 3. Honesty guardrails (non-negotiable)

The OSS section + Founding 500 copy must reflect what the libraries **actually do** (the earlier honest
repositioning). **Do say:** two-tier persistent memory (L1 session + L2 semantic), hybrid recall (dense +
BM25 + recency via RRF), token-budget-aware assembly, PII/sensitivity-classified extraction, local-first
(no API key, no datastore), framework-agnostic (TS + Python), one-import-to-governed-hosted, MIT.
**Do NOT say:** "smarter/best memory", "beats Mem0/Zep/Letta", knowledge graph, self-editing memory (those
are hosted-only or untrue). Mirror `docs/launch/oss-launch-copy.md`'s do/do-not lists.

---

## 4. Homepage: the OSS section (capabilities, benefits, workflows, visuals)

A single, rich, brand-locked section that markets **both** libraries. Reuse the existing primitives
(`Diagrams.tsx`, `AnimatedSection`, `CodeBlock`, `SectionHeader`, the effects). No new visual language.

**Blocks:**
1. **Header**: "Open-source memory for AI agents. TypeScript and Python." + one honest line.
2. **Dual-language quickstart**: the `HeroCodeSwitcher` pattern: `npm i actrone-memory` / `pip install
   actrone-memory`, each with a real `MemoryManager` snippet (already written in the hero constants).
3. **Capability grid (bento)**: 5 to 6 cells, each honest + a small monochrome visual:
   - *Two-tier memory*: a hot L1 / semantic L2 diagram (reuse the bento's tier bars).
   - *Hybrid recall*: dense + lexical + recency → RRF (a small fusion diagram).
   - *Budget-aware*: a token-budget bar (mirror the demo's BudgetBar).
   - *PII-aware*: sensitivity tags `none/low/pii/sensitive` (chroma only here, as the status vector).
   - *Local-first*: "no API key · no database" badge.
   - *Framework-agnostic*: Vercel AI / LangChain / CrewAI / LlamaIndex marks (reuse `BrandMark`).
4. **Workflow strip**: store turn → extract facts (tagged) → hybrid recall within budget → (one line)
   "→ one import to governed, hosted memory."
5. **Live proof (optional, strong)**: link/embed **`actrone-memory-demo`** (the demo/test system just
   built): "see it live: memory, made visible." Turns the section from claims into a runnable demo.
6. **CTA**: GitHub stars + `Join the Founding 500`.

*Aesthetics:* 1px borders, alternating `--color-section` fills, mono readouts, instant (no animated
counters) per brand; honour `prefers-reduced-motion`.

---

## 5. OSS docs: allowlist only the memory docs

On-site docs today are gated by the single `docs` flag (currently coming-soon, pointing to the repo). For
the OSS launch, either:
- **(Recommended) Turn on only the OSS memory docs on-site**: allowlist `docs/memory/**` (+ an OSS
  `getting-started/quickstart` written for the library, not the hosted SDK). Hide `control-tower/**`,
  `governance/**`, `orchestrator/**`, `tools/**`, `multi-agent/**`, `marketplace/**`, `self-hosting/**`, and
  the hosted-SDK getting-started. The middleware (§2.2) enforces the docs sub-allowlist; the docs sidebar
  (`DocsNavPagination` + its nav source) filters to the allowlisted tree.
- **(Simplest) Keep docs pointing at GitHub**: the libs are fully documented in-repo; OSS mode links "Docs"
  to the repos and hides the on-site docs entirely. Less work, but on-site docs are better for SEO/adoption.

*Decision needed (§9).* Either way, **no platform docs page resolves** in OSS mode.

---

## 6. Founding 500: the waitlist section + data capture

A homepage section (and/or `/founding-500`) inviting visitors to join the **Founding 500** for launch-day
discounts + early access to the hosted platform.

### 6.1 UX (brand-locked)
- Eyebrow "Founding 500", headline, honest benefits (e.g. *launch discount · priority onboarding · shape the
  roadmap*), a live-ish "spots claimed" counter (from the SaaS count, or a static cap), and a compact form.
- **Fields:** email (required), name, company (optional), role/use-case (optional select), **consent
  checkbox** (required: "email me about launch + the Founding 500", links to privacy/terms).
- **States (all designed):** idle → submitting → success ("you're in, position #N / check your inbox") →
  error. No raw errors.

### 6.2 Storage: free third-party SaaS (recommendation)
Custom on-brand form → **Next.js Route Handler `/api/waitlist`** (server-side, holds the SaaS key, never in
the client bundle) → forwards to the SaaS. This keeps the premium branded UI while the SaaS does collection
+ storage.

| Option | Why | Notes |
| --- | --- | --- |
| **getwaitlist.com** *(recommend for "Founding 500")* | Purpose-built waitlist: positions, referrals, launch emails; matches the "Founding N + benefits" mechanic exactly | Free tier; hosted data; simple API |
| **Airtable** *(recommend if you want to own the data)* | Free tier, structured base + API + CSV export; easy to run discount codes off | You hold the base; server route uses a scoped token |
| **Tally** | Zero-backend forms, unlimited free submissions, webhooks → Sheets/Notion/Airtable | Fastest to stand up; embed or API |
| **Loops.so** | Email-first (free tier), best if the point is notify-at-launch + campaigns | Doubles as the launch email tool |

*Recommendation:* **getwaitlist.com** for the referral/position FOMO the "Founding 500" wants, **or**
**Airtable** if you'd rather own+export the data for discount-code issuance. Both are free-tier + a single
server route.

*Outcome:* Airtable was chosen in §9, then replaced by **Baserow** on 2026-09-21. Airtable's free tier turned
out to cap API calls at 1,000 a month, which the live counter alone exceeds; Baserow Cloud Free has no
monthly call ceiling, stores data in Germany and keeps the same grid, export and automation workflow.

### 6.3 Security & privacy (first-wave EU + Africa → GDPR)
- Validate with **zod** at the route boundary; length caps; reject on invalid email.
- **Consent required + logged** (timestamp, IP optional-hashed); link privacy/terms (why `/legal/*` stays
  allowlisted).
- **Anti-spam:** honeypot field + a lightweight check (Cloudflare Turnstile free, or rate-limit per IP).
- **Secret hygiene:** SaaS token in server env only; never `NEXT_PUBLIC_`.
- Structured error envelope + `X-Request-Id` (match the platform's API conventions).
- Double opt-in if the SaaS supports it (cleaner for GDPR).

---

## 7. Build phases

- **P1: Flag + boundary.** `LAUNCH_MODE`/`OSS_ONLY` + allowlist in `flags.ts`; **build `middleware.ts`**;
  verify every non-allowlisted route redirects/404s (the core requirement). Retire the `proxy.ts` reference.
- **P2: Nav/footer/homepage OSS mode.** OSS `NAV_LINKS`/footer arrays; `OSS_ONLY ? <OssHome/> : <FullHome/>`.
- **P3: OSS section** (§4) with visuals + the live-demo link.
- **P4: Founding 500** section + `/api/waitlist` route + SaaS wiring + consent/anti-spam.
- **P5: Docs allowlist** (§5) + polish, a11y, SEO (`robots.ts` already present; ensure hidden routes drop
  from the sitemap in OSS mode), and tests: middleware allowlist unit tests + a waitlist route test (mock SaaS).

---

## 8. Testing / acceptance
- Middleware: table-driven test: allowlisted paths pass; every hidden route (pricing, enterprise,
  marketplace, platform docs, sign-in) redirects/404s.
- Nav/footer render only OSS links in OSS mode; full set when off.
- Homepage renders `OssHome` (OSS section + Founding 500) in OSS mode.
- Waitlist route: valid submit → SaaS called + success; invalid/no-consent → 400; honeypot filled → silently
  dropped.
- Sitemap/robots exclude hidden routes in OSS mode.

---

## 9. Decisions: LOCKED (2026-07-16)
1. **Hidden routes →** ✅ **redirect-to-home** (friendlier launch UX).
2. **OSS docs →** ✅ **on-site**: allowlist `docs/memory/**` (+ an OSS quickstart); hide all platform docs.
3. **Waitlist store →** ✅ **Baserow**: own and export the data; run discount codes off the table. Airtable
   was chosen first and replaced on 2026-09-21, because its Free plan allows 1,000 API calls a month and
   the live counter alone needs more (`Actrone_OSS_Site_Form_Datastore_Decision.md`). The `joinWaitlist`
   Server Action and `/api/waitlist` hold a least-privilege Baserow database token (server env only).
4. **"Founding 500" mechanics →** open; default to a live "spots claimed" counter from the Baserow count of
   rows with an email, soft-capped (not a hard 500 block) unless you say otherwise.
5. **Scope →** ✅ **marketing site only** (`frontend/apps/marketing`); `apps/marketplace` untouched.

---

*Plan v1.0: one master `OSS_ONLY` mode + a real middleware boundary (the missing piece) collapse the
marketing site to the OSS allowlist; a new honest OSS homepage section markets both libraries with
brand-locked visuals; a Founding 500 waitlist captures sign-ups into a free SaaS via a server route. Built as of 2026-09-21,
with the Founding 500 stored in Baserow.*
