# OSS site SEO audit, September 2026

This audit covers the marketing site in OSS launch mode on 2026-09-16: every indexable route, the sitemap, robots.txt, social cards, structured data and the generated API references. It found 9 defects in code, all fixed and verified, and 8 items that need an owner decision or live infrastructure. The launch blockers are in [Needs a person](#needs-a-person).

## How it was checked

Findings come from the rendered site, not from reading source alone:

1. A dev server in OSS mode was crawled route by route, recording status, redirects, `<title>`, meta description, canonical, robots meta, Open Graph and X tags, `<h1>` and JSON-LD types.
2. Suspect URLs (`/opengraph-image`, `/logo.png`, `/reference/*`, `/founding-500`) were requested directly.
3. After the fixes, `next build` ran and `npm run seo:smoke` checked all 17 sitemap URLs against the production build.
4. Live DNS and the public GitHub, PyPI and npm registries were queried for the launch-state checks.

## Defects found and fixed

Severity reflects impact on search visibility or share previews at launch.

| Severity | Defect | Evidence | Fix |
| --- | --- | --- | --- |
| Critical | 11 of 17 sitemap pages declared the homepage as their canonical | The root layout set `alternates.canonical: '/'`, which every page without its own canonical inherited: 4 memory docs pages, contact and all 7 legal pages. Google treats those pages as duplicates of the homepage and drops them. The same pages also showed the homepage description. | Removed the site-wide canonical. Every OSS page now calls `pageMetadata()`, which emits a self-referencing canonical. A test fails if any non-home canonical is the homepage. |
| Critical | No page had a working X card image | The layout hardcoded `twitter:image` to `/opengraph-image`, which returns 404 because Next serves file-convention OG images at a hashed path | Replaced with prerendered cards at stable URLs, `/og/<key>.png` |
| High | Docs pages shared with no image | A page-level `openGraph: { url }` replaced the layout's whole `openGraph` object, dropping the image, type and site name. Next merges metadata shallowly. | `pageMetadata()` always returns complete Open Graph and X objects with a per-page card |
| High | The generated API references redirected home | `/reference/memory-py/` and `/reference/memory-ts/` were not on the OSS allowlist, so the proxy sent them to `/`. Independently of mode, Next strips the trailing slash and does not serve a directory's `index.html`, which also breaks the relative links in Sphinx and TypeDoc output. | Allow-listed the two OSS reference trees, linked to `index.html` directly, redirected bare directory URLs to it, added the references to the sitemap, and configured Sphinx `html_baseurl` and TypeDoc `hostedBaseUrl` so reference pages declare canonicals on the next regeneration |
| High | BreadcrumbList JSON-LD was never emitted | `BreadcrumbSchema` read an `x-pathname` header that nothing set. Its fallback path skipped rendering, and the `headers()` call forced every docs page into dynamic rendering. | Breadcrumbs now render per page from the registry (Docs, section, page) with real URLs, and all docs pages prerender as static |
| Medium | Organization logo pointed at a missing file | `https://actrone.com/logo.png` returned 404 | Points at `/brand/actrone-brandmark-512.png`, and a test asserts the file ships |
| Medium | `/founding-500` returned a hard 404 | Allow-listed in the proxy with no page behind it | Redirects to `/#founding-500`, giving launch posts a shareable URL |
| Medium | Sitemap and robots disagreed about the origin, and previews were indexable | `sitemap.ts` hardcoded production URLs while `robots.ts` read `NEXT_PUBLIC_SITE_URL`. No build ever emitted `noindex`. | One origin in `lib/seo/site.ts`. Any origin other than `actrone.com` gets `noindex` and a disallow-all robots.txt. |
| Low | Off-brand, off-message social card and search copy | The OG image used `system-ui` instead of Geist, a letter "A" instead of the brandmark, a radial gradient, a pill radius and a headline that didn't match the homepage. Titles were in Title Case, several ran past 60 characters, and descriptions ran up to 290 characters with em dashes. The About description pitched the unlaunched platform. | Geist-only monochrome cards that follow the brand lock, sentence-case titles within 60 characters, descriptions of 70 to 160 characters, and OSS-accurate About copy. All of it is enforced by `src/test/seo.test.ts`. |

## Also improved

These weren't defects, but they close gaps that launch-grade developer-tool sites usually cover:

- **Structured data**: added `WebSite` (it feeds the site name Google shows above results) and one `SoftwareSourceCode` entry per library, linking each repository and license. Product schemas moved to the homepage instead of repeating on every legal page.
- **Hosted-only legal pages**: the DPA and SLA describe plans that aren't on sale, so they're `noindex` and left out of the sitemap in OSS mode. They become indexable automatically when the launch mode changes.
- **`llms.txt`**: generated from the registry for LLM tools. Google states this file is not a Search signal, so it is insurance for assistant discovery, not ranking.
- **Sitemap dates**: `lastmod` values are real content dates instead of placeholders, and `priority` and `changefreq` were dropped because Google ignores both.
- **robots.txt**: removed the Yandex-only `Host` line and disallowed the embedded Sanity Studio.
- **Reference bundles**: the vendoring script no longer copies Sphinx `.doctrees` and `.buildinfo` into the public folder.
- **Docs links in the libraries**: `actrone-memory` (PyPI `Documentation` URL and CLI recipe output), `actrone-memory` (recipe output) and `create-actrone-app` pointed at `docs.actrone.com`, which doesn't resolve. They now point at `https://actrone.com/docs/memory/overview`. This matters most for PyPI, because project URLs are frozen into each release.
- **Post-deploy gate**: `npm run seo:smoke -- <origin>` checks status, canonical, title, description, robots meta and OG image for every sitemap URL.

## Needs a person

These can't be fixed in code, or they are decisions for the owner. Items 1 to 3 block launch.

1. **The site isn't deployed.** `actrone.com` has no A or AAAA record, and `www.actrone.com` doesn't resolve. Point the apex at the deployment and 301-redirect `www` to the apex. The code treats the apex as the only indexable host; if you choose `www` as canonical instead, change `PRODUCTION_HOST` in `lib/seo/site.ts`.
2. **The repositories and packages aren't public.** `github.com/actrone/actrone-memory-py` and `actrone-memory-ts` return 404, and neither package is on PyPI or npm. The homepage JSON-LD, the footer and `llms.txt` all link to those repositories. Publish them before the announcement, or every early visitor and crawler hits dead links.
3. **Search Console and Bing Webmaster Tools aren't set up.** Follow the runbook's pre-launch section. Verification needs DNS access.
4. **About page timeline claims (resolved 2026-09-17).** The unverifiable claims ("500 GitHub stars in the first week", "1,000+ daily active sessions in financial services production") and the rest of the dated timeline were removed. The OSS About page now describes only what a visitor can check: what is available today, how the team works and what comes next.
5. **Unknown URLs redirect home instead of returning 404 (resolved 2026-09-25).** Paths that never existed now get the real 404 page with a 404 status; only pages that exist but are hidden in OSS mode still redirect home (`ossGateDecision` in `lib/flags.ts`). `oss-gate.test.ts` fails if any page or public file would reach Next ungated, and `seo:smoke` checks that an unknown page answers 404.
6. **`docs.actrone.com` is still referenced elsewhere.** `actrone-py/pyproject.toml` (hosted SDK), `backend/orchestrator/internal/handler/http/scim.go` and `docs/branding.md` still use it. Either stand up the subdomain with a 301 to `actrone.com/docs`, or update those references before the hosted launch.
7. **The X handle (resolved 2026-09-25).** The owned account is `@useactrone`. `TWITTER_HANDLE` in `lib/seo/site.ts` sets it, and the footer link and the Organization `sameAs` use `X_PROFILE_URL`, derived from the handle, so the three can't drift apart again.
8. **Brand rule violations on indexed pages (resolved 2026-09-17).** Legal page headings and Terms section headings are sentence case, em dashes are gone from the legal pages and diagrams, and `npm run brand:check` now fails the build gate on any regression.

## Files changed

In `frontend/apps/marketing`:

- **Added**: `src/lib/seo/{site,pages,metadata,structured-data,og-image,llms}.ts(x)`, `src/app/og/[image]/route.tsx`, `src/app/llms.txt/route.ts`, `src/app/(marketing)/contact/layout.tsx`, `src/components/docs/DocsBreadcrumbs.tsx`, `src/test/seo.test.ts`, `scripts/seo-smoke.mjs`, and the vendored Geist TTF files with their OFL license in `src/assets/fonts/`
- **Removed**: `src/app/(marketing)/opengraph-image.tsx` and `src/app/(marketing)/docs/BreadcrumbSchema.tsx`
- **Updated**: the root and marketing layouts, the homepage, the docs index and docs layout, the 6 OSS docs pages, About, the 7 legal pages, `sitemap.ts`, `robots.ts`, `lib/flags.ts`, `next.config.ts`, `package.json`, `scripts/build-sdk-reference.mjs`, `src/test/oss-gate.test.ts`, and the reference links on the SDK docs pages

Outside the app: `actrone-memory-py/pyproject.toml`, `actrone-memory-py/docs/conf.py`, `actrone-memory-py/src/actrone_memory/recipes.py`, `actrone-memory-ts/typedoc.json`, `actrone-memory-ts/src/recipes.ts` and `create-actrone-app/lib/scaffold.mjs`.

Verification: `tsc --noEmit` clean, ESLint clean on every changed TypeScript file, 94 of 94 Vitest tests passing, `next build` succeeding, and `seo:smoke` passing 17 of 17 URLs against the production build.
