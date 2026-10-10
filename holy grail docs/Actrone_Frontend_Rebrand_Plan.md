# Actrone Frontend Rebrand & Revamp Plan

> Source of truth: `docs/branding.md` (Black & Apple-Silver identity) + `docs/design prompt.md`
> (Design System v1.1). Scope: **100% of the frontend** — every surface, route, component, and state.
> Standard: CLAUDE.md §8 (Premium UI/UX). Status: PLAN — no code written yet. No commits.
>
> **Status refreshed 2026-07-13 (code-verified) — this plan is SHIPPED, not "no code written yet":**
> the header above is stale (last true as of the 2026-06-30 decision log in §2). A fresh code audit
> this pass confirms Phases 0–7 are live across all three apps (`frontend/apps/{control-tower,
> marketing,marketplace}`) and `frontend/packages/ui`: `--gradient-red`/`.btn-red`/red-as-brand-color
> are gone (red only in `--color-error #EF4444`), `globals.css` in all three apps carries the comment
> "Geist everywhere — display, body, mono. Space Grotesk removed in the rebrand" (grep-verified, no
> live Space Grotesk usage anywhere), canvas/border/radius tokens match §3's dark block exactly,
> `Button`'s `primary` variant is white-on-black with `hover:shadow-glow` (no gradient), lucide
> `strokeWidth: 1.5` is enforced globally via one `:where(svg.lucide){stroke-width:1.5}` CSS rule
> (`globals.css`, "143 call sites" per its own comment) rather than per-instance props, and
> `IntegrationIcon`/`BrandMark` exist as described in §2. **One thing that moved past this plan
> entirely and should be read as current, not as a §2 decision:** status dots were **retired outright**
> 2026-07-12 (`packages/ui/src/ui/Badge.tsx`: "no leading dot (status dots were retired from the
> brand, 2026-07-12)") — text + semantic colour now carry state; the §4 "silver pulsing dot" and
> `StatusDot` component described here (and in branding.md §3.1/§4.4) no longer reflects the shipped
> design — the one exception is a single **static** (non-pulsing) green dot in `DashboardHero.tsx`
> ("Static green status dot — operational reads calm, not an alarming pulse"). **§7 Phase 6 Auth is
> stale**: `ClerkThemed` and "Update Clerk `appearance`" no longer apply — auth is headless WorkOS
> AuthKit + generic OIDC (`docs/Actrone_WorkOS_Auth_Switch_Plan.md`); the real components are
> `WorkosSignIn`/`OidcSignIn`/`AppAuthProvider`/`RootAuthProvider` (see `docs/guides/07-frontend.md`).
> **§9's route/component counts are a pre-rebrand-era snapshot**, now stale as a byproduct of ordinary
> feature growth, not the rebrand itself: a 2026-07-13 recount shows control-tower alone at 60
> `page.tsx` routes / 155 components, marketing at 75 routes / 40 components, marketplace at 10
> routes / 17 components, plus 43 shared primitives in `packages/ui` — roughly 145 routes / 255
> components total, well past "133 routes / 175 components." Marketing homepage hero verified to carry
> the exact locked category-noun copy from §6.1 ("the governed control plane for AI agents —
> governed, self-hosted, any model") in both the page `<h1>`/lead and the route's `metadata.description`.

---

## 0. The central reframe — this is a *rebrand*, not a rebuild

The frontend is **already mature and already revamped once**. The previous "Total Frontend Revamp"
(the plan file under `.claude/plans/`) is substantially shipped:

- Radix primitive layer present: `dropdown-menu, popover, dialog, sheet, tooltip, tabs, select,
  avatar, separator, scroll-area, command (cmdk), switch, checkbox, progress, breadcrumb,
  accordion, sonner` — 18 primitives in `components/ui/`.
- Cross-cutting features built: `NotificationsPanel`, `FeatureGate`, `UpgradeModal`, `UpsellCard`,
  `DataToolbar`, `TipCard`, `TutorialsDrawer`, `OnboardingGate`, entitlements.
- Foundation: Tailwind v4 `@theme` token layer, `materials-*` elevation utilities,
  `text-label/copy/eyebrow` roles, light+dark+system theming, framer-motion v12, shiki v4,
  geist, lucide.
- Inventory: **175 component files, 133 route `page.tsx` files** across five surfaces
  (Control Tower `(app)`, Marketing `(marketing)`, Docs, Marketplace, Auth).

So the structural work — primitives, navigation chrome, entitlements, data tooling, onboarding —
**exists**. What the two new docs demand is a **total visual rebrand**: the current identity is
**warm-grey `#ADA8A2` + iOS-red `#FF3B30` CTAs + red gradients + Space Grotesk + box-shadow lift**.
The target identity is **monochrome Black & Apple Silver: white-on-black primaries, zero gradients,
1px borders only, Geist display, sentence-case, red reserved exclusively for errors.**

These are in **direct conflict**. The rebrand is mostly a token-layer replacement plus a mechanical
re-skin of every component — high-volume, low-architectural-risk. The net of it: **swap the brand
DNA, keep the bones.**

---

## 1. Conflict matrix — current identity → target identity

Every row below is a thing the codebase does *today* that the new docs **forbid**, and must be
changed everywhere it appears.

| # | Dimension | Current (shipped) | Target (branding.md + design prompt) |
|---|-----------|-------------------|--------------------------------------|
| 1 | **Primary CTA** | `--gradient-red` light-red gradient (`.btn-red`, Button `primary`) | **White `#F5F5F7` on black**, text black, 6px radius, hover inner-glow. No gradient. |
| 2 | **Brand accent** | Warm grey `#ADA8A2` (`--color-accent`) drives links, focus, highlights | **Silver** `#F5F5F7`/`#E5E5E7`. Colour is *status only*, never decoration. |
| 3 | **Red** | Brand/CTA colour: `--gradient-red`, `gradient-text-red`, `pulse-red`, `badge-live`, `--color-red*` | **`#EF4444`, errors/destructive ONLY.** Strip red from all non-error UI. |
| 4 | **Gradients** | `--gradient-bg` body auras, `hero-glow`, `gradient-border`, `gradient-text-*`, `card-lift` shadow | **Banned.** Flat surfaces, depth from 1px borders + alternating section fills only. |
| 5 | **Elevation** | `box-shadow` `card-lift`, `--shadow-glow`, shadow scale on panels | **1px border only** for in-flow panels. Shadows kept *only* on true floating overlays (menu/modal/popover) where off-canvas depth is needed. |
| 6 | **Display font** | Space Grotesk (`--font-display`, loaded in `layout.tsx`) | **Geist** for display too, weights 500–600. Drop Space Grotesk. |
| 7 | **Font weight** | `h*` weight 600; docs prose uses 700 | Cap at **600**. Never 700/800; never ≤300. |
| 8 | **Casing** | `text-eyebrow` = `text-transform: uppercase`; Title-Case table headers | **Sentence case everywhere.** No ALL CAPS, no Title Case for UI labels. |
| 9 | **Canvas** | `--color-bg #09090b` | App `#030303`, marketing hero `#000`, cards `#111111`, elevated `#121214`. |
| 10 | **Radius** | md 8 / lg 12 / xl 16; `rounded-full` used decoratively | sm 4 / md 6 / lg 8. `rounded-full` only on avatars + status dots. |
| 11 | **Code blocks** | shiki present, themed warm | **Monochrome shiki theme** `actrone-dark` (brightness only, zero hue). |
| 12 | **Icons** | lucide, mixed stroke widths | lucide **strokeWidth 1.5 always**; 16 nav / 14 inline / 20 feature. |
| 13 | **Counters** | animated count-ups in app dashboards | **No** animated value changes in Control Tower/Marketplace data. Marketing stat counters allowed once-on-enter. |

**The one decision this matrix forces (see §2): does red truly leave the brand?** branding.md is
explicit that it does. This also means the *global* `CLAUDE.md` §8.2 reference to a "brand-red
gradient primary" becomes stale and should be updated to the white-primary rule (flagged, owner's call).

---

## 2. Decisions — LOCKED (2026-06-30)

1. **Light mode — KEPT, re-skinned as an Apple-silver "paper" variant** (white canvas, `#F5F5F7`
   surfaces, ink text, same silver/mono discipline), **including on docs**. Both themes ship across
   every surface; `ThemeToggle` + system theming retained. The docs don't *spec* light, so we design
   a faithful light counterpart that obeys the same rules (colour = status only, 1px borders, no
   gradients).
2. **Token strategy — keep existing `@theme` names, remap values.** Only change values + add the
   missing semantic tokens (`--glow-interactive`, `--text-dim`, `--border-hover/focus/strong`,
   `--btn-primary-*`). No mass className rewrite.
3. **Red retirement — full.** `#EF4444` for error/destructive/critical ONLY. Primary CTA → white on
   black. `badge-live` becomes a silver pulsing dot (branding §3.1 "Operational Activity"). The red
   gradient/glow machinery is deleted.
4. **`framer-motion` v12 stays** (newer, API-compatible superset of the doc's `^11`). No new deps —
   every library the docs name is already installed.

**CLAUDE.md updated** (both `Actrone/CLAUDE.md` and the workspace `CLAUDE.md`): new §8.1.1 "Actrone
brand system — LOCKED" encodes this identity so all future output complies.

---

## 3. Phase 0 — Token foundation (the linchpin; everything inherits this)

Single file does ~70% of the visual rebrand: **`frontend/src/app/globals.css`** `@theme` block +
the premium-visual-system section. Replace values, delete the red/gradient machinery, add the
Vercel inner-glow + dim/placeholder/border-state tokens. Canonical **dark** block:

```css
@theme {
  /* Canvas & surfaces (flat — no gradients) */
  --color-bg:             #030303;  /* app canvas */
  --color-bg-hero:        #000000;  /* marketing hero only */
  --color-surface:        #111111;  /* cards / panels */
  --color-surface-raised: #121214;  /* modals, dropdowns, popovers */
  --color-surface-input:  #0d0d0d;  /* inputs */

  /* Borders (1px discipline) */
  --color-border:         #262629;
  --color-border-hover:   #3a3a3e;
  --color-border-focus:   #525255;
  --color-border-strong:  #404044;

  /* Typography — silver ramp */
  --color-text-primary:   #F5F5F7;  /* headings, active */
  --color-text-secondary: #E5E5E7;  /* body */
  --color-text-muted:     #A1A1AA;  /* supporting */
  --color-text-dim:       #71717A;  /* timestamps, captions */
  --color-text-placeholder:#52525B;

  /* Accent = silver. Colour is status, never decoration. */
  --color-accent:         #F5F5F7;
  --color-accent-hover:   #FFFFFF;
  --color-accent-subtle:  rgba(245,245,247,0.06);
  --color-on-accent:      #000000;

  /* Primary button = white on black */
  --btn-primary-bg:       #F5F5F7;
  --btn-primary-text:     #000000;

  /* Inner glow (Vercel signature) — the ONLY allowed "shadow" on in-flow elements */
  --glow-interactive:     0 0 0 1px rgba(255,255,255,0.08);
  --glow-focused:         0 0 0 1px rgba(255,255,255,0.14);

  /* Semantic — colour reserved for state */
  --color-error:          #EF4444;   /* == destructive == critical */
  --color-success:        #22C55E;
  --color-warning:        #F59E0B;
  --color-info:           #3B82F6;   /* links/info only */
  --color-destructive:    #EF4444;

  /* Severity (branding §3): running=silver, policy-pause=muted, breach=red */
  --color-critical: #EF4444; --color-high: #F59E0B;
  --color-medium:   #A1A1AA; --color-low:  #22C55E;

  /* Fonts — Geist everywhere; Space Grotesk removed */
  --font-sans:    var(--font-geist-sans), system-ui, sans-serif;
  --font-mono:    var(--font-geist-mono), 'JetBrains Mono', monospace;
  --font-display: var(--font-geist-sans), system-ui, sans-serif;

  /* Radius — tighter */
  --radius-sm: 4px; --radius-md: 6px; --radius-lg: 8px; --radius-full: 9999px;

  /* Floating-overlay shadow ONLY (menus/modals need off-canvas depth) */
  --shadow-overlay: 0 8px 30px rgba(0,0,0,0.6);
}
```

**Deletions in Phase 0:** `--gradient-bg` + `body::before` auras, `--gradient-red`, `.btn-red`,
`.gradient-text-red`, `.pulse-red`/`red-pulse`, `.hero-glow`, `.gradient-border`, `--shadow-glow`,
`.card-lift`'s shadow (border-only hover instead). Add: monochrome `actrone-dark` shiki theme
(design prompt §8); marketing-only `body.marketing-noise::before` 2.5% SVG noise (§7); the
reduced-motion global block (§17). `h*` weight 600 cap; `text-eyebrow` loses `uppercase`.

Also Phase 0: `layout.tsx` — remove the `Space_Grotesk` import + `--font-space-grotesk` variable;
keep Geist sans/mono. `viewport.themeColor` → `#030303`.

---

## 4. Phase 1 — Primitive & shared-component re-skin

Re-skin every `components/ui/` primitive to the new vocabulary, **preserving props and call-sites**
(value-level changes only). Highlights:

- **Button** — rewrite `variantStyles`: `primary` = `bg-[--btn-primary-bg] text-[--btn-primary-text]`
  + `hover:shadow-[--glow-interactive]`; `secondary` = transparent + 1px border, ghost-hover bg;
  `destructive` = `#EF4444` solid (confirm-delete only); add `link`/`text` variant. Heights 36px
  (md), radius 6px. Strip the red gradient.
- **Card** — flat `#111111`, 1px border, radius 8px, hover = border-hover + inner-glow (no lift
  shadow). **Badge** — 22px, 11px, tinted-transparent semantic variants only. **StatusDot** —
  silver pulsing 6px for running; hollow muted circle for policy-pause; red solid for breach
  (branding §3.1). **Table/TableSort** — sentence-case headers, `tabular-nums`, 1px row dividers,
  EmptyState outside `<tbody>`. **Inputs** — `#0d0d0d`, border-focus + `--glow-focused`.
- **Radix layer** (dropdown/popover/dialog/sheet/tooltip/select/command/…) — repoint surfaces to
  `surface-raised`, borders to `--color-border`, overlays use `--shadow-overlay` (allowed), radius
  6–8px. **sonner** toasts re-skinned. **CodeBlock** (ui + docs) → monochrome shiki theme.
- Re-skin `PageHeader, EmptyState, ErrorState, Spinner, Skeleton, AnimatedSection, ScrollReveal3D,
  DataToolbar, GitHubStarsButton, ThemeToggle`. **brand/Wordmark + BrandMark** verified against the
  Apple-silver mark.

Deliverable: a re-skinned design system that every surface inherits for free.

---

## 5. Phase 2 — Control Tower `(app)` (the densest surface)

Apply design prompt §"Control Tower" to all ~45 app routes. High-density telemetry aesthetic:
220px sidebar, `grid-cols-12 gap-0` panels divided by 1px borders, 36px log rows with mono
timestamps in `--text-dim`, silver running-dot, **alert = panel border → `#EF4444`, held (no
flash)**, sidebar active item = framer `layoutId` sliding pill.

- **Shell**: `layout/Sidebar` + `OrgBar` + `NotificationsPanel` + `CommandPalette` re-skinned;
  sentence-case nav, lucide@1.5, active sliding pill.
- **Routes** (each: re-skin + loading skeleton + designed empty + designed error, responsive
  375/768/1280/1920): `dashboard, tasks (+TasksBrowser/TraceViewer/TaskCostPanel/RiskScorePanel),
  agents, coordination, a2a, memory, tools, mcp, integrations, cost, usage, governance (+/audit),
  compliance, alerts, marketplace/{my-agents,publish,publish/[id]/edit,earnings,analytics/[id],
  settings}, settings/{profile,organization,team,notifications}`.
- **features/**: `DashboardMetrics, RecentTasks, SystemHealthPanel` restyled; `charts/Charts`
  (Recharts) → monochrome silver series, no rainbow, no animated counters; `UpgradeModal/
  FeatureGate/UpsellCard/TipCard/TutorialsDrawer/OnboardingGate` re-skinned to mono.

---

## 6. Phase 3 — Marketing `(marketing)`: visual re-skin **+ full copy/content rewrite**

This phase is two jobs at once: re-skin the marketing surface to the monochrome system **and rewrite
every page's copy and content** so the site actually sells the product — its moats, USPs, and
benefits — and grabs and holds attention. The current site under-sells a platform that is, per the
internal review, near code-complete across P1–P7 with a genuine compounding moat; the risk is
distribution, not engineering. The marketing site is the distribution surface. Treat copy as a
first-class deliverable, not lorem filler.

### 6.1 Positioning & core narrative

- **Category:** *the governed control plane for AI agents — self-hosted, any model* (locked
  headline noun; "governed runtime/OS" is descriptive color only) — "cognitive infrastructure," not
  "another agent framework."
- **The villain (name it):** **ungoverned autonomy.** Agents are now powerful enough to act in
  production — and almost nothing stops them from leaking data, violating policy, burning budget, or
  taking a hallucinated action. Most frameworks help you build a *demo*; none of them pass a security
  review.
- **The resolution (the promise):** **autonomy you can actually put in production.** Every agent
  action passes through governance — *deterministically, before it runs* — and lands in an append-only
  audit trail. You ship power without shipping risk.
- **One-liner (hero candidates, pick 1, A/B the rest):**
  1. "Autonomy you can put in production."
  2. "Govern every decision your agents make — before they make it."
  3. "Agents, governed. Build fast, ship safe, prove it."
- **The 3 audiences, one ladder:** solo dev ("ship a governed agent today, no platform team") →
  startup ("scale agents without hiring a compliance team") → enterprise ("procurement-ready,
  certified, auditable on day one"). Progressive commitment: Sandbox → Quickstart → Deploy → Enterprise.

### 6.2 Messaging pillars — moats translated to benefit language

Each pillar = a real, built capability → the benefit a buyer feels. These drive the home page
sections, the nav mega-structure, and dedicated deep-dive sections.

| Pillar | The proof (built) | The benefit headline |
|--------|-------------------|----------------------|
| **Governed by construction** | MAL → DPE → append-only Audit on *every* action; deterministic, fail-closed policy | "Pass the security review. Sleep at night." |
| **Memory that compounds** | never-forget memory, 7 adapters, governed retrieval, **distillation flywheel** | "Your agents get cheaper and sharper the more they run." |
| **Build in hours, run in the kernel** | EMAOP no-code builder + manifest runtime (agentic loop in the kernel; pods isolate custom code) | "Idea to governed production agent — no platform team." |
| **Open, no lock-in** | OpenAI-compat lingua franca, BYO/self-hosted models, Go/Python/TS SDKs, framework adapters, MACP + A2A mesh | "Bring your models, your stack, your agents. We govern them." |
| **Certified & compliant** | SOC2 / ISO 27001 / 27701 / 27018, live sealed-evidence trust center, per-tenant DPA/BAA, data residency, MediaGuard PII | "Enterprise-ready on day one — not after a 9-month audit." |
| **Optimizes on outcomes** | outcome-gated routing/cost optimizer + governance-correction flywheel | "Spend less, deliver more — automatically, gated on real results." |

**The compounding-moat story (the closer):** distillation + governance-correction + outcome-gating
are flywheels — *the platform gets better the more it's used.* This is the line that separates Actrone
from a framework: "Most tools are the same on day 365. Actrone is better — because your usage makes it
better." Use once, prominently, late on the home page and on `/about`.

### 6.3 Psychological levers (and where each is applied)

- **Loss aversion / fear → relief.** Lead sections with the stakes ("one ungoverned tool call is one
  breach"), resolve with the mechanism. Hero, governance section, enterprise page.
- **Cognitive fluency = trust.** The calm monochrome *is* the argument: this looks like infrastructure
  you can rely on. The brand carries the "serious/reliable" message before a word is read.
- **Specificity = credibility.** Name real architecture (MAL, DPE, append-only ledger, manifest
  runtime) and real certs. Ban vague hype ("revolutionary," "unleash," "next-gen"). Numbers only if
  real — **no fabricated testimonials or metrics** (consistent with the earlier testimonial removal).
- **Show, don't tell.** Dramatize claims with live effects (§6.5): the Agent Trace Visualiser *shows*
  governance happening; the Governance Score Ring *shows* a compliance number forming. A working
  Sandbox beats any adjective.
- **Status / identity.** "Infrastructure for teams who ship agents into production, not demos." Let the
  reader self-select as serious.
- **Authority.** Deterministic (not probabilistic) policy, append-only audit, the public trust center,
  open SDKs, real GitHub presence — proof a skeptical engineer respects.
- **Progressive disclosure.** Solo-friendly entry up top; enterprise depth (compliance, residency,
  mesh) below the fold and on dedicated pages — each audience finds its altitude without clutter.

### 6.4 Per-page content blueprint

Every page: re-skinned to mono **and** rewritten. Hero = headline (≤8 words) + one-sentence
subhead + primary (white) CTA + secondary (ghost). Sentence case, confident, concrete.

- **`/` Home** — the full narrative arc:
  1. **Hero:** villain→promise headline + Terminal Typewriter cycling 3 value props; primary
     "Start building" (magnetic), secondary "Read the docs"; Cognitive Grid bg + one Beam Scan.
  2. **Logo/trust strip** (real: certs, GitHub, supported model providers — no fake customer logos).
  3. **"The problem" band:** ungoverned autonomy, stated plainly with the stakes.
  4. **"How it works" pinned scroll (4 steps):** Build → Govern → Run → Audit, with the Agent Trace
     Visualiser morphing through the MAL→DPE→Audit chain.
  5. **Six pillar sections** (§6.2), each: benefit headline + 2–3 sentence body + a real product
     visual (Diagrams/mockup, tilt on hover) + deep-link to docs.
  6. **Governance spotlight:** Governance Score Ring + "deterministic, not hopeful" copy.
  7. **Compounding-moat closer** (§6.2) + **persona ladder** (Solo / Startup / Enterprise cards).
  8. **Final CTA band:** "Ship an agent you can trust — today." + Sandbox link.
- **`/enterprise`** — procurement lens: governance, certifications, data residency, DPA/BAA, SSO/RBAC,
  self-host, mesh (A2A). Stakes-first copy; "talk to us" + trust-center link. Governance Score Ring.
- **`/pricing`** — mirror the new entitlements tier matrix (Free/Solo→Startup→Enterprise). Benefit-led
  rows, not feature dumps; honest limits; "what compounds as you scale." FAQ addresses lock-in, BYO
  models, self-host, compliance.
- **`/trust`** — the credibility keystone. Live trust posture (real sealed-evidence trust center),
  framework badges (SOC2/ISO), sub-processors, residency. Mono, restrained, authoritative.
- **`/sandbox`** — "try a governed agent in 60 seconds." Lowest-friction proof; the show-don't-tell page.
- **`/calculator`** — cost/savings framing around the outcome-gated optimizer + distillation ("what it
  costs vs. what it saves as usage compounds").
- **`/benchmarks`** — real numbers only (latency, governance overhead, routing savings). Specificity = trust.
- **`/about`** — the thesis: why governed autonomy is the category, the compounding-moat story, the team.
- **`/blog` (+`[slug]`), `/changelog`** — editorial template (max-docs width, reading-progress bar),
  ship-velocity proof.
- **`/partners`, `/registry`** — ecosystem credibility (adapters, model providers, integrations).
- **`/careers`, `/contact`** — on-brand, concise, real.
- **`/legal/*`** via `LegalPage` — re-skin only; copy is legal-owned (don't rewrite substance).

### 6.5 Visual effects → claim mapping (marketing only, all reduced-motion safe)

Effects exist to *dramatize a specific claim*, never as decoration (design prompt §16/§19):

- **Cognitive Grid** (hero bg, mouse-reactive) → "an intelligent surface responding to attention" =
  the brand feeling. Mobile: slow auto-pulse.
- **Beam Scan** (once on load) → "system initialising / scanning" = AI reading & understanding.
- **Terminal Typewriter** (hero subhead) → cycles the 3 core value props in mono.
- **Agent Trace Visualiser** → the **Governed-by-construction** pillar: shows MAL→DPE→Audit forming live.
- **Governance Score Ring** → the **Certified/compliant** pillar: a compliance score draws to value.
- **Pinned scroll narrative** (max 2/page) → "How it works" (Build→Govern→Run→Audit) and Problem→Solution.
- **Magnetic CTA** (hero primary only) → tactile, physical, Apple-grade.
- **Staggered reveals / word-by-word headline / line-draw dividers** → editorial rhythm on every section.
- **Counter-on-enter** → **real** platform metrics only; omit if not truthful.
- **Depth card tilt** → product mockups/feature cards only (≤4°); **never** on nav/tables.
- **Parallax** (≤3 layers, ≤60px) + **CSS scroll-driven** progress/fade → hero depth + perf-cheap reveals.

Reuse/extend existing `Diagrams`, `CursorGlow`, `ScrollReveal3D`. Re-skin `marketing/TopNav`
(frosted `rgba(0,0,0,0.7)` blur 12px, 60px, sentence-case links, layoutId active pill) + `Footer`;
alternate section fills `#000`/`#0a0a0a` for depth-without-gradient; marketing-only noise texture.

### 6.6 Voice & tone (apply to all marketing copy)

Sentence case. Short declaratives. Concrete over clever. Lead with what it does and what it prevents.
Developer-respecting and code-forward. Ban hype adjectives and fake proof. Every claim traceable to a
built capability or a real number. When in doubt, show the trace, the cert, or the code — don't assert.

---

## 7. Phase 4 — Docs · Phase 5 — Marketplace · Phase 6 — Auth

- **Docs (~55 pages, 11 sections):** re-skin `DocsLayoutClient, DocsSidebar` (240px, mono→silver
  active), `DocsSearch`→cmdk, `DocsTableOfContents` (180px), `DocsAIPanel, Callout, CodeBlock`
  (monochrome shiki), `DocActions, DocFeedback, DocsNavPagination, DocPage`. Rework `.docs-content`
  prose: weight 600 cap, silver ramp, sentence case, mono inline-code, CSS reading-progress bar.
- **Marketplace (public + `(app)` publisher):** re-skin `AgentCard(+Compact), FilterPanel`
  (→ shared DataToolbar), `SearchBar, PublishWizard, PublisherProfile, InstallButton,
  VersionSelector, StarButton` (star stays `#F59E0B` warning-amber per spec), `TrustBadge`
  (OFFICIAL silver / VERIFIED green / COMMUNITY dim), `CompatibilityScore, GovernanceStats,
  RewardBadge`; all routes + richer empty/loading/error. Light card-grid stagger reveal only.
- **Auth:** re-skin `sign-in, sign-up, sso-callback` + `AuthCard, AuthInput, AuthButton,
  AuthDivider, AuthError, SocialButton, PasskeyButton, ClerkThemed` — premium split-screen,
  white-primary, mono. Update Clerk `appearance` to the new tokens.

---

## 8. Phase 7 — Global states, a11y, verification

- Redesign every `error.tsx` (root + 12 app routes + global-error), `loading.tsx`,
  `not-found.tsx`, `coming-soon` to the new EmptyState/ErrorState language (mono, border-only).
- **A11y sweep (CLAUDE.md §8.2):** focus rings visible, keyboard nav, ARIA roles, ≥4.5:1 contrast
  (verify silver-on-black ramps; `--text-dim` on `#030303` must pass for non-decorative text),
  `prefers-reduced-motion` honoured by every effect (§17), meaningful `alt`.
- **Verification gates:** `npm run typecheck` + `npm run lint` clean (do not regress known lint
  debt), `npm run build` green, `npm run test` (re-skin shouldn't break logic tests), `npm run
  e2e:a11y` (axe) zero violations on revamped routes; manual walk of all 5 surfaces at
  375/768/1280/1920 in dark (and light, if kept); visual spot-check vs Geist references.

---

## 9. Scope ledger & sequencing

| Phase | Surface | Files (approx) |
|-------|---------|----------------|
| 0 | Token foundation | `globals.css`, `layout.tsx` (2) |
| 1 | Primitives + shared | ~40 `components/ui` + `features` |
| 2 | Control Tower | ~45 routes + `layout`/`features`/`charts` |
| 3 | Marketing + effects | ~22 routes + `marketing/*` + new effects |
| 4 | Docs | ~55 pages + 10 `docs/*` |
| 5 | Marketplace | ~12 routes + 13 `marketplace/*` |
| 6 | Auth | 3 routes + 8 `auth/*` |
| 7 | Global states + a11y | error/loading/not-found + sweep |

**Total: 175 components, 133 routes — all touched.** Build order:
**0 → 1 → 2 → 3 → 4 → 5 → 6 → 7.** Phase 0+1 unblock everything; do them first and verify before
fanning out. Each phase ends green (typecheck/lint/build) before the next starts.

## 10. CLAUDE.md compliance

No colour/spacing outside the token layer (§8.4); loading+error+empty on every async view (§8.2);
full a11y on every interactive element (§8.2); Server Components keep `server.ts`, client keeps
`client.ts`+`useAuth()`; TS strict, no `any` without `// UNSAFE:`; deps pinned; Conventional
Commits, atomic, buildable. **Note:** the global `CLAUDE.md` §8.2 "brand-red gradient primary"
guidance is now superseded by branding.md's white-primary rule and should be updated by the owner.
```
