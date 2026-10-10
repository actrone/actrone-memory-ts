# OSS launch SEO runbook

Follow this runbook in order to take actrone.com from undeployed to indexed, then keep it healthy. Each step names the tool, the command or report, and the pass condition. Tool setup details live in the [guides](README.md#free-tool-guides); this page is the sequence.

**Owner**: whoever runs the launch. **Time needed**: about 3 hours before launch, 1 hour on launch day, 30 minutes a week for the first month, then 1 hour a month.

## Phase 0: pre-launch gates (T minus 7 days)

Don't announce until every gate passes. A launch post that sends traffic to dead links or unindexable pages wastes the one spike you get.

### Infrastructure

1. **Point DNS at the deployment.** Add the apex record for `actrone.com` and a `www` record. Configure a 301 redirect from `https://www.actrone.com/*` to `https://actrone.com/*`. Pass condition: `curl -sI https://www.actrone.com/docs` returns `301` with `location: https://actrone.com/docs`.
2. **Serve HTTPS only.** Redirect HTTP to HTTPS with a 301 and send `Strict-Transport-Security`. Pass condition: `curl -sI http://actrone.com` returns `301` to the HTTPS URL.
3. **Build with the right environment.** In production, set `NEXT_PUBLIC_LAUNCH_MODE=oss` and leave `NEXT_PUBLIC_SITE_URL` unset or set it to `https://actrone.com`. Both are inlined at build time, so a rebuild is needed after any change. The marketing Dockerfile does not pass `NEXT_PUBLIC_LAUNCH_MODE` today, so a container build ships the full platform site: apply the Dockerfile change in section 5 of `../Actrone_OSS_Site_Services_Setup_Runbook.md` first. On previews and staging, set `NEXT_PUBLIC_SITE_URL` to that environment's origin, which makes the build `noindex`.
4. **Vendor the API references.** Generate the Sphinx and TypeDoc output in `actrone-memory-py` and `actrone-memory-ts` before building the site. Pass condition: `npm run check:sdk-reference` in `frontend/apps/marketing` prints `present memory-py ✓` and `present memory-ts ✓`. (That check also requires the hosted SDK bundles; in OSS mode only the two memory bundles are served.)

### Content that must exist before crawlers arrive

5. **Make the repositories public.** `github.com/actrone/actrone-memory-py` and `actrone-memory-ts` must return 200. The homepage JSON-LD, the footer and `llms.txt` link to both.
6. **Publish the packages.** `pip install actrone-memory` and `npm install actrone-memory` must work, because every docs page tells readers to run them.
7. **Set the repository metadata.** Follow the [GitHub, PyPI and npm guide](guides/github-pypi-npm-discoverability.md): About description, website, topics and social preview image.
8. **Resolve the audit's owner items.** The X account is `@useactrone`, confirmed owned 2026-09-25 ([audit, item 7](Actrone_OSS_SEO_Audit_2026-09.md#needs-a-person)). The unverified About page claims were already removed.

### Verification on the production origin

9. **Run the SEO smoke check.** From `frontend/apps/marketing`:

   ```bash
   npm run seo:smoke -- https://actrone.com
   ```

   Pass condition: `SEO smoke passed`. Run the same check against staging with `--expect-noindex`, which must also pass. Then run `npm run brand:check -- https://actrone.com`; pass condition: `brand check passed`.

10. **Validate structured data.** Run the homepage and `/docs/memory/configuration` through the [Rich Results Test](guides/rich-results-and-schema-validation.md). Pass condition: Breadcrumbs detected with no errors on the docs page, and no errors on the homepage.
11. **Check performance.** Run [PageSpeed Insights](guides/pagespeed-insights-lighthouse-crux.md) on mobile for `/` and `/docs/getting-started/quickstart`. Pass condition: LCP under 2.5 s, CLS under 0.1 and TBT under 200 ms in the lab data.
12. **Preview the share cards.** Paste the homepage and quickstart URLs into the [social card debuggers](guides/social-card-debuggers.md). Pass condition: the right image, title and description on LinkedIn and Facebook.

### Search engine accounts

13. **Verify Google Search Console** as a Domain property through DNS, then submit `https://actrone.com/sitemap.xml` ([guide](guides/google-search-console.md)).
14. **Verify Bing Webmaster Tools** by importing from Search Console, then submit the sitemap and set up IndexNow ([guide](guides/bing-webmaster-tools-and-indexnow.md)).
15. **Verify Ahrefs Webmaster Tools** and run the first Site Audit ([guide](guides/crawl-audits-screaming-frog-and-ahrefs-webmaster-tools.md)). Fix any errors it finds before launch.

## Phase 1: launch day

Timing matters: request indexing before the announcement, so Google has usually crawled the key pages by the time links start appearing.

1. **Morning, before the announcement**, use URL Inspection in Search Console, then **Request indexing** for these pages, in order: `/`, `/docs`, `/docs/getting-started/quickstart`, `/docs/memory/integrations`, `/docs/memory/overview`. Each request uses daily quota, so don't spend it on legal pages.
2. **Submit the same URLs through IndexNow** with the command in the [Bing guide](guides/bing-webmaster-tools-and-indexnow.md#submit-urls). This covers Bing, Copilot and the other IndexNow engines in one call.
3. **Post the announcement** with links to the homepage or quickstart, not to GitHub alone. A link to your own domain builds its authority; a link to GitHub builds GitHub's.
4. **Evening**: search `site:actrone.com` on Google. Early results are normal on day one, but zero after 48 hours means something is wrong; see [A page is not indexed](#a-page-is-not-indexed).

## Phase 2: week one

Check these daily for 7 days. Each takes a few minutes.

- **Search Console, Page indexing**: pages move from "Discovered" to "Indexed". Investigate anything under "Why pages aren't indexed" other than the expected `noindex` legal pages and redirects.
- **Search Console, URL Inspection** on any page you changed that day, then request indexing.
- **Backlinks**: in Ahrefs Webmaster Tools, confirm launch coverage links (Hacker News, Reddit, newsletters, awesome lists) are being picked up.
- **Brand query**: search for `actrone memory` on Google and Bing. The homepage or docs should rank first. If the GitHub repository outranks the site for the brand name, that's expected in week one and should flip within 2 to 4 weeks as links accumulate.
- **Share previews**: when a large account shares a link, open the post and check the card. Re-scrape through the debuggers if a stale card appears.

## Phase 3: weeks two to four

Check these weekly:

1. **Performance report**: in Search Console, filter to the last 7 days. Record impressions, clicks and the top 20 queries in a tracking sheet.
2. **Low-CTR pages**: queries where a page ranks in positions 1 to 10 with a click-through rate under 2% usually need a better title or description. Edit the registry entry in `lib/seo/pages.ts`, deploy, then request indexing.
3. **Content gaps**: queries with impressions but no matching page, for example "langgraph long term memory", are candidates for a docs guide. See the [keyword research guide](guides/keyword-research-free-tools.md).
4. **Core Web Vitals**: field data appears once enough real traffic accumulates. Fix any URL group marked Poor.

## Phase 4: steady state

### Monthly (1 hour)

- **Search Console**: review Performance (clicks, impressions, CTR, position over 3 months), Page indexing, Core Web Vitals and Enhancements. Check the generative AI performance reports for AI Overview and AI Mode impressions.
- **Bing Webmaster Tools**: review Search Performance and AI Performance (Copilot citations).
- **Ahrefs Webmaster Tools**: re-run Site Audit and fix new errors. Review new and lost backlinks.
- **AI assistant panel**: run the fixed prompt set from the [AI search guide](guides/ai-search-visibility.md) and log which sources get cited.
- **Registry dates**: when a page's content changed materially that month, update its `updated` date in `lib/seo/pages.ts`. Don't bump dates without a content change.

### Quarterly (half a day)

- **Full crawl**: crawl the site with [Screaming Frog](guides/crawl-audits-screaming-frog-and-ahrefs-webmaster-tools.md) and fix broken links, redirect chains and missing tags.
- **Keywords**: refresh the keyword map and plan the next quarter's docs guides.
- **Package pages**: review the GitHub, PyPI and npm metadata against the current feature set.
- **Structured data**: re-validate after any change to `lib/seo/structured-data.ts`.

## Adding a page to the OSS site

1. Add the route to the OSS allowlist in `lib/flags.ts`. A page that should stay hidden in OSS mode goes on `OSS_HIDDEN_PREFIXES` in the same file instead; otherwise `oss-gate.test.ts` fails, because an unlisted path is passed to Next as a 404 and a real page there would render ungated. The OSS deploy leaves hidden pages out of the build entirely and fails if one gets in (see `scripts/prune-hosted-pages.mjs` and `scripts/check-oss-build.mjs`).
2. Add a registry entry in `lib/seo/pages.ts` with a title, description, `updated` date, group and OG copy. Docs pages also get a `section`.
3. In the page, export `metadata = pageMetadata('<key>')`, and on docs pages render `<DocsBreadcrumbs page="<key>" />`.
4. Run `npx vitest run src/test/seo.test.ts` and fix any copy-rule failures.
5. After deploy, check that the deploy workflow's SEO smoke step passed (it runs `seo:smoke` against `https://actrone.com` after every deploy), and that the **Notify IndexNow of changed pages** step after it listed the new URL (the deploy submits every URL it added, removed or re-dated). Then request indexing for the new URL in Search Console, which IndexNow doesn't reach.

## Incident playbooks

### A page is not indexed

1. Run URL Inspection in Search Console and read **Page indexing** for that URL.
2. **"Excluded by 'noindex' tag"** on a page that should rank: check its registry entry's `indexable` value, and confirm the production build doesn't set `NEXT_PUBLIC_SITE_URL` to a non-production origin.
3. **"Duplicate, Google chose different canonical than user"**: view the page source and confirm the canonical is the page's own URL. If it is, the content is too similar to another page; make it distinct.
4. **"Crawled, currently not indexed"**: the page is thin or not yet trusted. Add depth (examples, a comparison table), link to it from the homepage or docs index, and wait 2 weeks before requesting indexing again.
5. **"Page with redirect"**: the URL in your link or sitemap isn't the final URL. Update the link to the destination.
6. **"URL is unknown to Google"** with **"No referring sitemaps detected"** and **"Referring page: None detected"**: Google has not read the sitemap and hasn't crawled any page that links here. Nothing on the page is wrong, so don't change it. Instead:
   1. Open **Sitemaps**. If `https://actrone.com/sitemap.xml` isn't listed, submit it (the full URL). If it says **Couldn't fetch**, remove it and submit it again; on a new property that status usually means Google hasn't tried yet rather than that it failed.
   2. Run URL Inspection on `https://actrone.com/` and choose **Test live URL**. "URL is available to Google" proves Googlebot can fetch the site. Then **Request indexing** for the homepage first: every other page is linked from it.
   3. Request indexing for the pages you most want found, a few a day within the quota.
   4. In Bing Webmaster Tools, check **Sitemaps** lists the sitemap, and use **URL Submission** for the same pages. IndexNow covers the rest.
   5. Wait. A domain with no links from other sites often takes 1 to 4 weeks for its first pages to be crawled, and links from GitHub, npm, PyPI and posts that name the site shorten it.

   Diagnosed on 2026-10-02, a week after launch, when no page of actrone.com was in Google or Bing: every sitemap URL answered 200 to Googlebot and Bingbot with `index, follow`, its own canonical and no `X-Robots-Tag`; robots.txt, DNS, TLS and the Vercel firewall blocked nothing. The cause was discovery, not the site.

### Search traffic dropped sharply

1. In Search Console, compare the last 7 days with the previous 7, grouped by page, to see whether one page or the whole site dropped.
2. **Whole site**: check robots.txt (`curl https://actrone.com/robots.txt`) for an accidental `Disallow: /`, which is what a staging-configured build serves. Then run the smoke check.
3. **One page**: run URL Inspection on it and check for a changed canonical, a `noindex` tag or a redirect.
4. Check the [Google Search Status Dashboard](https://status.search.google.com/) for a core update in the same window. If one ran, don't change anything for 2 weeks; ranking movement during an update is noisy.

### A share card shows the wrong image or text

1. Run the URL through the [social card debuggers](guides/social-card-debuggers.md) to see what the platform cached.
2. If the page's tags are correct, re-scrape in the LinkedIn Post Inspector or the Facebook Sharing Debugger.
3. Platforms that offer no re-scrape (X, Slack, Discord) cache by URL. After changing a card image, add a version query to `ogImageUrl()` in `lib/seo/metadata.ts`, for example `?v=2`, and redeploy.

### Search shows the wrong title or description

Google rewrites titles and snippets when it judges them a poor match for the query. Make the registry copy match the page's `<h1>` and opening paragraph more closely, keep the title under 60 characters, deploy, and request indexing. Allow 1 to 2 weeks.
