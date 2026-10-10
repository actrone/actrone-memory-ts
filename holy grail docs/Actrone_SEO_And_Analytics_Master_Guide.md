# Actrone — SEO & Analytics Master Guide

**Purpose:** the single reference for how Actrone does SEO and product/web analytics — every tool, how to
set it up, how to use it, and how to run **PostHog across US, EU, and other regions**. Companion:
**[SEO & Analytics Fix Plan](./Actrone_SEO_Fix_Plan.md)** (the concrete code changes). Audience: anyone
shipping the marketing site, docs, or marketplace.

---

## 1. What SEO actually helps with (and what it doesn't)

**SEO = being found, for free, by people (and AI answer engines) at the moment they're looking for what you
do.** For a developer-infrastructure / OSS product like Actrone, it is one of the highest-leverage,
lowest-cost growth channels — but it compounds slowly.

**What it helps with:**
- **Durable, compounding, zero-marginal-cost traffic.** Unlike ads, a page that ranks keeps bringing
  visitors for months/years without per-click spend → lowers customer acquisition cost.
- **High-intent capture.** You appear when someone searches their *problem* ("self-hosted AI agent
  platform", "AI agent governance", "MCP orchestration", "agent memory API") — warm demand, not interruption.
- **Docs-driven adoption (huge for OSS/dev tools).** Developers search "how to do X" and land on your docs.
  Great docs SEO ranks for **hundreds of long-tail queries** and is often the #1 acquisition path for
  infra products. Your docs already live under `actrone.com/docs` — treat them as SEO real estate.
- **AI-answer visibility (2025–2026 shift).** ChatGPT, Perplexity, Claude, and Google AI Overviews now
  answer a large share of technical queries by *citing sources*. Being crawlable + well-structured gets you
  **cited** — often more valuable than a classic #1 blue link. (Your `control-tower/robots.ts` already
  welcomes GPTBot/ClaudeBot/PerplexityBot — keep that everywhere public.)
- **Credibility & brand defense.** Ranking for your own name + comparison terms ("Actrone vs …") controls
  your narrative.

**What it does *not* do:**
- **Not instant.** New pages take weeks–months to rank; treat it as a compounding asset, not a launch lever.
- **Not a distribution substitute.** For an OSS launch, GitHub/HN/Reddit/Show-and-tell/dev communities drive
  the *initial* spike; SEO captures the *long tail* that follows.
- **Not analytics.** SEO tools tell you rankings/impressions/crawl health; **PostHog** (§9) tells you what
  visitors *do* once they arrive. You need both.

**One-line mental model:** *SEO gets the right people to the door; PostHog tells you what they do inside.*

---

## 2. The tool stack (all free) — at a glance

| Tool | Category | Cost | Use it for |
|---|---|---|---|
| **Google Search Console** | Search performance | Free | The source of truth: queries, impressions, clicks, position, index coverage, crawl errors, Core Web Vitals, sitemap submission. **Start here.** |
| **Bing Webmaster Tools** | Search performance | Free | Bing + ChatGPT-search visibility; 1-click import from GSC. |
| **PageSpeed Insights / Lighthouse** | Performance/CWV | Free | Core Web Vitals + on-page SEO audit; wire Lighthouse-CI later. |
| **Rich Results Test + Schema Validator** | Structured data | Free | Verify your JSON-LD produces rich results. |
| **Ahrefs Webmaster Tools (AWT)** | Site audit + backlinks | Free (verified site) | Automated crawl/audit + your own backlink profile. |
| **Screaming Frog SEO Spider** | Crawler | Free ≤500 URLs | Deep desktop crawl: broken links, dupes, missing meta, redirects. |
| **IndexNow** (Bing/Yandex) | Instant indexing | Free | Ping search engines the moment content changes. |
| **PostHog** | Product + web analytics | Free tier | Visitors, funnels, replay, flags. *(Analytics, not SEO — §9.)* |

You do **not** need paid tools (Ahrefs/Semrush full suites) to launch. Add them only if/when you invest in
a dedicated content/keyword program.

---

## 3. Google Search Console (GSC) — setup & use

**Setup (once, ~15 min):**
1. Go to `search.google.com/search-console` → **Add property** → choose **Domain** (covers all
   subdomains + http/https) over URL-prefix when you can.
2. Verify via **DNS TXT record** (add the `google-site-verification=…` TXT to the `actrone.com` DNS zone).
   DNS verification is best — it covers `www`, `app.`, `marketplace.` under one property and doesn't depend
   on app code. *(Alternative: the `verification.google` metadata field — see Fix Plan P1 — but DNS is
   preferred and app-independent.)*
3. **Submit sitemaps:** Sitemaps → add `https://actrone.com/sitemap.xml` (and later
   `https://marketplace.actrone.com/sitemap.xml`).
4. If you have URL-prefix properties per subdomain, add them too so per-app reports are clean.

**Use it (weekly):**
- **Performance** → the queries you rank for, impressions, clicks, CTR, average position. Filter by page to
  find your winners; find "striking distance" queries (position 5–15) to improve.
- **Pages / Indexing** → which URLs are indexed vs excluded and *why* (crawled-not-indexed, redirects,
  canonicals). Fix anything important that's excluded.
- **Sitemaps** → submitted vs discovered counts (catches sitemap bugs like the hardcoded-host issue).
- **Core Web Vitals** + **Mobile Usability** → field data; fix reds.
- **Manual actions / Security** → make sure it's empty.
- **URL Inspection** → test any single URL's index status; "Request indexing" for new/updated pages.

---

## 4. Bing Webmaster Tools

- `bing.com/webmasters` → **Import from Google Search Console** (one click) or verify via DNS/`msvalidate.01`
  meta. Submit the same sitemap. Bing powers ChatGPT-search and DuckDuckGo, so it's worth the 5 minutes.
- Use the **Site Explorer** + **SEO Reports** for on-page issues Bing flags.

---

## 5. Performance & structured-data validators

- **PageSpeed Insights** (`pagespeed.web.dev`): paste a URL → lab + field Core Web Vitals (LCP < 2.5s,
  CLS < 0.1, INP < 200ms — the `CLAUDE.md` §8.3 targets) + a Lighthouse SEO score. Run on `/`, `/pricing`,
  a docs page, and (later) an agent page. **Automate:** add Lighthouse-CI to the frontend CI to block
  regressions.
- **Rich Results Test** (`search.google.com/test/rich-results`) + **Schema Markup Validator**
  (`validator.schema.org`): paste a URL or JSON-LD → confirm `Organization`, `SoftwareApplication`,
  `BreadcrumbList`, `Article`, `Product` render as rich results. Run after any JSON-LD change.
- **Social debuggers:** LinkedIn Post Inspector, X/Twitter card validator, and the OpenGraph preview in
  Slack/Discord — confirm `opengraph-image` + OG tags render.

---

## 6. Crawl audits (find what's broken at scale)

- **Ahrefs Webmaster Tools** (free for a verified site): scheduled **Site Audit** (broken links, redirect
  chains, missing/duplicate titles+descriptions, orphan pages, slow pages) + your **backlink** profile +
  which keywords you already rank for. The best free "is my site healthy?" dashboard.
- **Screaming Frog** (free ≤500 URLs, desktop): crawl the site like Googlebot → export every page's status
  code, title, meta description, canonical, `h1`, word count, and inlinks. Ideal pre-launch sweep of the
  marketing + docs surface.

---

## 7. Instant indexing & AI-answer visibility

- **IndexNow** (Bing/Yandex): submit changed URLs on publish for near-instant crawl. A tiny POST with an
  API key hosted at `/{key}.txt`; wire it into the content-publish flow (blog/changelog/docs).
- **`llms.txt`** (emerging convention): a Markdown index at `/llms.txt` (+ `/llms-full.txt`) that points AI
  crawlers at your best docs/product pages. Cheap, and you already welcome AI crawlers.
- **Keep welcoming AI crawlers** in every public `robots.ts` (GPTBot, ClaudeBot, PerplexityBot, Applebot,
  Googlebot) — for an AI-infra product, an AI citation beats a blue link.
- **Structured, answerable content:** clear H1/H2s, FAQ sections, definition-style intros, code blocks —
  the shape LLMs quote. Add `FAQPage` JSON-LD to key pages.

---

## 8. On-page SEO checklist (per public page)

- One unique, descriptive `<title>` (≤ ~60 chars) and `meta description` (≤ ~155 chars) — no duplicates.
- Exactly one `<h1>`; logical H2/H3 outline.
- Canonical URL correct (Next `alternates.canonical`), no accidental cross-domain canonicals.
- OpenGraph + Twitter tags + a real OG image (1200×630).
- Descriptive, keyword-relevant slug; internal links to/from related pages (docs cross-links especially).
- `alt` text on images; lazy-load; modern formats (`next/image`).
- Meets Core Web Vitals; no layout shift.
- In `sitemap.xml`; not blocked by `robots.txt`; returns 200 (no soft-404s).
- Structured data where it fits (`SoftwareApplication` for product/agent, `Article` for blog, `BreadcrumbList`
  for docs, `FAQPage` for FAQs).

---

## 9. PostHog — analytics across US, EU, and other regions

PostHog is Actrone's product + web analytics (visitors, pageviews, funnels, retention, session replay,
heatmaps) **and** the feature-flag engine the backend already uses. It is **not** an SEO tool — it measures
behaviour *after* arrival.

### 9.1 Regions: how PostHog Cloud works

- PostHog Cloud runs in **two regions only: US (`us.i.posthog.com`)** and **EU (`eu.i.posthog.com`,
  Frankfurt)**. Each is a **separate data store** with its **own project + API key**. **Data never moves
  between US and EU**, and you can't merge them.
- **You pick ONE home region per product**, based on where you want customer analytics stored / your
  compliance posture (EU/GDPR → EU; US-centric / US contracts → US). You do **not** split one product's
  events across both.
- **"Other locations" / stricter data residency** (e.g. must stay in-country beyond US/EU): **self-host
  PostHog** (Docker/K8s) and point the same env switch at your own ingestion host. Same code path.
- Multi-region *routing* (send different users to different PostHog projects) is technically possible but
  rarely worth the complexity for one product — avoid unless a contract forces it.

**Choosing for Actrone:** launching US-first → use a **US** project now. If you later need EU customer-data
residency, stand up an EU project and flip the region env for the EU deployment. The code is already
region-parameterised (Fix Plan §2), so this is a config change, not a rewrite.

### 9.2 Region configuration (the mechanism)

One env var drives everything; the `/ingest` reverse proxy (same-origin, beats ad-blockers) resolves the
regional hosts at build/deploy time.

```bash
# US project (launch)
NEXT_PUBLIC_POSTHOG_REGION=us
NEXT_PUBLIC_POSTHOG_KEY=phc_<us_project_key>

# EU project (if/when EU residency needed)
NEXT_PUBLIC_POSTHOG_REGION=eu
NEXT_PUBLIC_POSTHOG_KEY=phc_<eu_project_key>

# Self-hosted (other locations) — set region=eu shape but override hosts in the resolver
# NEXT_PUBLIC_POSTHOG_UI_HOST / proxy destinations → your own https://ph.yourco.com
```

| Region | Ingestion host | Assets host | UI host |
|---|---|---|---|
| **US** | `https://us.i.posthog.com` | `https://us-assets.i.posthog.com` | `https://us.posthog.com` |
| **EU** | `https://eu.i.posthog.com` | `https://eu-assets.i.posthog.com` | `https://eu.posthog.com` |
| **Self-host** | your ingestion host | your assets host | your UI host |

The Fix Plan (§2) implements the resolver + rewrites. **Rules that must hold:** use the `.i.` *ingestion*
hosts (not the UI host) for the proxy; keep `skipTrailingSlashRedirect` so `POST /ingest/flags` isn't
308-redirected; the **backend** flag client (`ORCHESTRATOR_POSTHOG_ENDPOINT` in `internal/analytics/flags.go`)
must point at the **same region** as the frontend, using the **same project**.

### 9.3 Setup (per region/project)

1. Create the PostHog project in the chosen region (`us`/`eu` app). Copy the **Project API key**
   (`phc_…`, public — safe in the browser) into `NEXT_PUBLIC_POSTHOG_KEY`.
2. Set `NEXT_PUBLIC_POSTHOG_REGION` accordingly. Deploy.
3. Enable **Web Analytics** in PostHog (auto from pageview events), and **Session Replay** (respect the
   input-masking already configured).
4. Point the backend flags client at the same region's host + project.
5. Verify: browser Network tab shows successful `/ingest/*` POSTs; the project's **Activity/Live events**
   show your pageviews.

### 9.4 GDPR / consent (already implemented — keep it)

- Events are **opt-out-by-default** until the cookie banner is accepted (`opt_out_capturing_by_default`);
  no capture before consent. Session replay masks all inputs + `.ph-mask` elements.
- EU project = data in Frankfurt (a GDPR advantage). US project = data in the US — fine for US-first, but if
  you sign EU customers with residency requirements, move that deployment to an EU project.
- Keep the `/ingest` reverse proxy: it keeps analytics working past ad-blockers **and** keeps requests
  same-origin (a privacy/keep-it-first-party plus).

### 9.5 What to actually watch in PostHog

- **Web analytics:** unique visitors, pageviews, sessions, top pages, **referrers/UTMs** (see which
  channel — HN, GitHub, search, X — drives traffic), geography, device.
- **Conversion funnels:** landing → docs → sign-up → activated; pricing → contact/checkout.
- **Retention & paths:** where people drop; which docs pages precede sign-ups.
- **Session replay:** watch real sessions on key pages to find friction (use sparingly, inputs masked).
- **Feature flags / experiments:** the same PostHog project powers the backend flags; run A/Bs on
  marketing copy/CTAs.
- **Identify in-app:** on the **control-tower** side, bind the WorkOS user/org to PostHog
  (`posthog.identify(userId, { org })`) so authenticated product usage ties to the anonymous marketing
  journey. The marketing site stays anonymous (no PII) by design.

### 9.6 SEO ↔ PostHog: use them together

GSC tells you *which queries and pages* bring people in; PostHog tells you *what those people do*. Cross them:
find high-impression/low-CTR pages in GSC (title/description work) and high-traffic/low-conversion pages in
PostHog (page/UX work). That loop is where SEO turns into signups.

---

## 10. Ongoing cadence

| Cadence | Do |
|---|---|
| **On publish** | Ping IndexNow; check the page in Rich Results Test; ensure it's in the sitemap. |
| **Weekly** | GSC Performance (winners + striking-distance queries) + Indexing (fix exclusions); PostHog traffic + funnels. |
| **Monthly** | Ahrefs/Screaming-Frog crawl audit (broken links, dupes, orphans); Core Web Vitals; refresh top pages. |
| **Quarterly** | Content/keyword review; backlink check; prune/redirect dead pages; re-run Lighthouse on key routes. |

---

## 11. Quick-start (do this order for the marketing launch)

1. **Fix Plan P0** — repair `/ingest` proxy + set `NEXT_PUBLIC_POSTHOG_REGION=us` + US project key (analytics
   works again, in the US region).
2. **Fix Plan P1** — sitemap host env fix + `llms.txt` + verification fields.
3. **GSC** (Domain property, DNS verify) + **Bing** (import) → **submit `actrone.com/sitemap.xml`**.
4. **PageSpeed + Rich Results** on `/`, `/pricing`, a docs page → fix any red.
5. **Ahrefs Webmaster Tools** (free) → schedule a site audit.
6. Deferred: **Fix Plan P3** (marketplace SEO + PostHog) when the marketplace app deploys.

---

*Guide v1.0 — Actrone Engineering. Pair with the SEO & Analytics Fix Plan for the code changes.*
