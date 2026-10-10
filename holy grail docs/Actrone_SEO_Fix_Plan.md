# Actrone — SEO & Analytics Fix Plan

**Status:** PLAN. Actionable, code-grounded remediation for the SEO + PostHog gaps found across the three
Next.js apps (`marketing`, `marketplace`, `control-tower`). Companion reference: **[SEO & Analytics Master
Guide](./Actrone_SEO_And_Analytics_Master_Guide.md)**. Inherits the workspace `CLAUDE.md` (TypeScript/Next
stack, tokens, a11y, no secrets committed, CI gates).

> **Launch context.** OSS + the **marketing site** ship first; `marketplace` and the public parts of
> `control-tower` come later. So **P0–P2 (marketing) are the launch-blocking work**; **P4 (marketplace) is
> deferred until that app deploys** but is specified here so nothing is forgotten and the shared layer
> (P3) makes it a drop-in.

---

## 1. Findings (code-verified)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F1 | **Bug (breaks analytics)** | `marketing` sets PostHog `api_host: '/ingest'` but its `next.config.ts` has **no `rewrites()`** — the `/ingest/*` reverse proxy only exists in `control-tower`. Marketing analytics events POST to an unproxied path. | `apps/marketing/src/lib/analytics/posthog.tsx:31` vs `apps/marketing/next.config.ts` (no rewrites) vs `apps/control-tower/next.config.ts:78-91` |
| F2 | **Region lock-in** | PostHog region is **hardcoded to EU** in both apps (`eu.i.posthog.com`, `ui_host: eu.posthog.com`). No way to deploy against US. | `posthog.tsx:31-32`, `control-tower/next.config.ts:82-90` |
| F3 | High (SEO) | `marketplace` has **no `robots.ts`, no `sitemap.ts`**, and its layout metadata is a bare `title`+`description` — **no `metadataBase`, OpenGraph, Twitter, or robots directive**. | `apps/marketplace/src/app/layout.tsx:9-11`; no `robots.ts`/`sitemap.ts` |
| F4 | Medium (SEO) | `marketplace` has **no PostHog** at all → that traffic is invisible. | no `posthog` import under `apps/marketplace/src` |
| F5 | Low (SEO) | `marketing/sitemap.ts` **hardcodes** `BASE='https://actrone.com'` while `robots.ts` + `metadataBase` use env-overridable `NEXT_PUBLIC_SITE_URL` → preview/staging sitemaps point at prod. | `apps/marketing/src/app/sitemap.ts:4` |
| F6 | Low (maintainability) | **No shared SEO layer** — metadata/robots/sitemap are duplicated per app; `packages/` has no `@actrone/seo`. Marketing is comprehensive; marketplace was never given the treatment. | no `@actrone/seo` in `packages/` |
| F7 | Low (setup) | No search-engine **verification** codes, no `llms.txt`, no submitted sitemaps (see Master Guide for setup). | `marketing/layout.tsx` has no `verification`; no `public/llms.txt` |

**What's already good (keep):** marketing has `metadataBase`, title template, canonical, `openGraph`/`twitter`,
a dynamic `opengraph-image.tsx`, a rich `sitemap.ts`, and JSON-LD (`Organization`, `SoftwareApplication`,
breadcrumbs, article schema). `control-tower/robots.ts` correctly keeps the app out of the index while
explicitly welcoming AI crawlers. Do not regress these.

---

## 2. Phase P0 — Fix marketing analytics + make PostHog region-configurable (US + EU)

Launch-blocking. Fixes F1/F2 and delivers the **US PostHog logic** requested.

### 2.1 Region model

PostHog Cloud has exactly two regions — **US** (`us.i.posthog.com`) and **EU** (`eu.i.posthog.com`) — each a
separate data store with its own project + API key (data does not move between them). Pick **one home
region per deployment**; drive it from env so the same code runs in US or EU. ("Other locations" / stricter
residency = self-host PostHog — see the Master Guide; same env switch, different hosts.)

Add a tiny region resolver so every app agrees:

```ts
// packages/seo/src/posthog-region.ts  (or apps/*/src/lib/analytics/posthog-region.ts if not sharing yet)
export type PostHogRegion = 'us' | 'eu'

export function posthogRegion(): PostHogRegion {
  // Server- and client-readable (NEXT_PUBLIC_*). Default EU only because that is today's project;
  // set NEXT_PUBLIC_POSTHOG_REGION=us for a US project.
  return (process.env.NEXT_PUBLIC_POSTHOG_REGION as PostHogRegion) === 'us' ? 'us' : 'eu'
}

/** Ingestion + assets + UI hosts per region (note the `.i.` ingestion hosts). */
export const POSTHOG_HOSTS = {
  us: { ingest: 'https://us.i.posthog.com', assets: 'https://us-assets.i.posthog.com', ui: 'https://us.posthog.com' },
  eu: { ingest: 'https://eu.i.posthog.com', assets: 'https://eu-assets.i.posthog.com', ui: 'https://eu.posthog.com' },
} as const
```

### 2.2 Add the `/ingest` reverse proxy to marketing (fixes F1) — region-aware (fixes F2)

Mirror the working `control-tower` rewrites, but resolve hosts from the region. Add to
`apps/marketing/next.config.ts`:

```ts
import { POSTHOG_HOSTS, posthogRegion } from './src/lib/analytics/posthog-region'
// ...
const ph = POSTHOG_HOSTS[posthogRegion()]
const nextConfig: NextConfig = {
  // ...existing config...
  // POST /ingest/flags must not 308-redirect on the trailing slash — keep skipTrailingSlashRedirect.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: `${ph.assets}/static/:path*` },
      { source: '/ingest/array/:path*',  destination: `${ph.assets}/array/:path*`  },
      { source: '/ingest/:path*',        destination: `${ph.ingest}/:path*`        },
    ]
  },
}
```

### 2.3 Make `posthog.tsx` region-aware (both apps)

```ts
import { POSTHOG_HOSTS, posthogRegion } from './posthog-region'
const ph = POSTHOG_HOSTS[posthogRegion()]
posthog.init(key, {
  api_host: '/ingest',        // same-origin proxy (rewrite chooses the regional host)
  ui_host: ph.ui,             // region-correct toolbar UI (was hardcoded eu.posthog.com)
  // ...unchanged: capture_pageview 'history_change', consent gating, session masking...
})
```

### 2.4 Env + config

Add to **`.env.example`** for `marketing` and `control-tower` (no secrets committed):

```bash
# PostHog — pick the region your PROJECT lives in. US project ⇒ us, EU project ⇒ eu (default).
NEXT_PUBLIC_POSTHOG_REGION=us
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx        # the PROJECT key for that region (public, safe in the browser)
# Optional: NEXT_PUBLIC_POSTHOG_UI_HOST override for self-hosted PostHog
```

> **US launch config (what you'll actually set):** `NEXT_PUBLIC_POSTHOG_REGION=us` +
> `NEXT_PUBLIC_POSTHOG_KEY` from your **US** PostHog project. The rewrites then proxy to
> `us.i.posthog.com` / `us-assets.i.posthog.com`, and `ui_host` becomes `us.posthog.com`. Nothing else
> changes. Backend flags (`ORCHESTRATOR_POSTHOG_*`) must point at the **same region's** host too — align
> `ORCHESTRATOR_POSTHOG_ENDPOINT=https://us.i.posthog.com` (see `internal/analytics/flags.go`).

### 2.5 Checklist / tests (P0)

- [ ] `curl -i https://<preview>/ingest/decide` (or `/flags`) returns PostHog, not a 404/308.
- [ ] Network tab shows capture POSTs to `/ingest/*` succeeding; PostHog **US** project receives events.
- [ ] Consent gating unchanged (no events before accept); session-replay input masking intact.
- [ ] `NEXT_PUBLIC_POSTHOG_REGION` unset ⇒ EU (back-compat); `=us` ⇒ US hosts everywhere (unit test the resolver).
- [ ] `skipTrailingSlashRedirect` present so `POST /ingest/flags` isn't turned into a 308.

---

## 3. Phase P1 — Marketing SEO polish (launch)

Small, high-value (fixes F5/F7, hardens F-nothing-broken).

- **F5 — sitemap BASE:** change `apps/marketing/src/app/sitemap.ts` `const BASE = 'https://actrone.com'`
  → `const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://actrone.com'` (match `robots.ts`).
- **Verification (F7):** once Google Search Console + Bing are set up, add to root `metadata`:
  ```ts
  verification: { google: process.env.NEXT_PUBLIC_GSC_VERIFICATION, other: { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_VERIFICATION } }
  ```
  (DNS-TXT verification is preferred — see Master Guide — in which case this is belt-and-suspenders.)
- **`llms.txt` (F7, AI-answer visibility):** add `apps/marketing/public/llms.txt` (and `/llms-full.txt`)
  listing your key docs/product URLs — you already welcome AI crawlers, so lean in.
- **Sitemap drift:** generate the `/docs/*` routes from the docs source of truth instead of the hand-kept
  list (prevents new/renamed doc pages from silently missing the sitemap). Low priority; do it when docs
  routing stabilises.
- **Audit pass:** run the Master Guide's on-page checklist (unique title/description per route, one `<h1>`,
  canonical correctness, OG image renders in the Rich Results / social debuggers).

**Checklist (P1):** sitemap resolves the right host in preview; `/robots.txt`, `/sitemap.xml`,
`/opengraph-image`, `/llms.txt` all 200; Rich Results Test passes for `Organization` +
`SoftwareApplication`; Lighthouse SEO ≥ 95 on `/`, `/pricing`, a docs page.

---

## 4. Phase P2 — Shared `@actrone/seo` package (recommended, DRY — fixes F6)

Optional for launch, but it makes marketplace/control-tower SEO trivial later and removes duplication.

```
packages/seo/src/
  metadata.ts       # buildMetadata({ title, description, path, image? }) → Next Metadata w/ metadataBase, OG, twitter, canonical
  jsonld.ts         # organization(), softwareApplication(), breadcrumb(items), product(agent) builders
  posthog-region.ts # the resolver from §2.1 (single source of truth for all apps)
  robots.ts         # buildRobots({ base, disallow, aiCrawlers })
```

Each app keeps its own `sitemap.ts` (route data is app-specific) but consumes shared `buildMetadata` +
JSON-LD builders. Add a parity/unit test. `transpilePackages: ['@actrone/ui', '@actrone/seo']`.

---

## 5. Phase P3 — Marketplace SEO + analytics (DEFERRED until marketplace deploys — fixes F3/F4)

Full spec so it's a drop-in when the marketplace launches. Marketplace = a content farm of
`publisher × agent` landing pages → the single biggest organic-growth surface, so this matters when it ships.

1. **`apps/marketplace/src/app/layout.tsx` metadata:** add `metadataBase: new URL(NEXT_PUBLIC_MARKETPLACE_URL)`,
   `title` template, `openGraph`, `twitter`, `robots: { index: true, follow: true }` (via shared `buildMetadata`).
2. **`apps/marketplace/src/app/robots.ts`:** allow `/`, disallow `/api/`, `/ingest/`, star/fork action
   routes; welcome AI crawlers (mirror `control-tower/robots.ts`); advertise the marketplace sitemap.
3. **Dynamic `apps/marketplace/src/app/sitemap.ts`:** fetch the package list via the BFF
   (`marketplaceApi.search`/list — `apps/marketplace/src/lib/api/marketplace.ts`) and emit one entry per
   `/{publisher}/{agent}` with `lastModified = updated_at`. Paginate/cap for large catalogs; ISR-cache.
4. **Per-agent `generateMetadata`** on `[publisher]/[agent]/page.tsx`: canonical, title, description, OG
   image (per-agent), keep the existing `SoftwareApplication` JSON-LD; add `aggregateRating` from ratings.
5. **PostHog (F4):** add the same region-aware `/ingest` rewrites + `PostHogProviderWrapper` +
   `.env.example` entries as marketing (reuse `posthog-region.ts`).

**Checklist (P3):** `/robots.txt` + `/sitemap.xml` 200 and enumerate real agents; a sample agent page
passes Rich Results with `SoftwareApplication`; PostHog US project receives marketplace pageviews; no
customer PII in OG/metadata.

---

## 6. Sequencing & effort

| Phase | Blocks launch? | Effort | Ships |
|---|---|---|---|
| **P0** — /ingest fix + US/EU region config | **Yes** (analytics broken today) | S (0.5–1 d) | with marketing |
| **P1** — marketing SEO polish + verification + llms.txt | **Yes** (cheap, high value) | S (0.5 d) | with marketing |
| **P2** — shared `@actrone/seo` | No | M (1–2 d) | anytime; do before P3 |
| **P3** — marketplace SEO + PostHog | No (deferred) | M (2–3 d) | when marketplace launches |

Do **P0 + P1** now (they're the marketing launch). Do **P2** before P3. **P3** rides the marketplace launch.

---

## 7. Pre-ship checklist (per `CLAUDE.md`)

- [ ] No secrets committed; only `NEXT_PUBLIC_*` public keys + `.env.example` entries.
- [ ] Region resolver defaults to EU (back-compat) and is unit-tested for `us`/`eu`.
- [ ] `/ingest` proxy verified live (no 404/308); consent gating + replay masking preserved.
- [ ] `robots.txt`, `sitemap.xml`, `opengraph-image`, `llms.txt` return 200 in preview against the correct host.
- [ ] Structured data validates (Rich Results Test); Lighthouse SEO ≥ 95 on key routes.
- [ ] Backend PostHog region (`ORCHESTRATOR_POSTHOG_ENDPOINT`) matches the frontend region.
- [ ] No hardcoded prod host where an env var exists (`NEXT_PUBLIC_SITE_URL` / `_MARKETPLACE_URL`).

---

*Plan v1.0 — Actrone Engineering. Pair with the SEO & Analytics Master Guide for tool setup + PostHog
operations. Nothing herein is implemented yet.*
