# OSS SEO action plan

Everything left to do for search visibility of actrone.com and the three open-source packages, in order, from the state on 2026-10-02. Work top to bottom and tick each box. Every step says where to do it and how to know it worked.

This is the one list to follow. The [launch SEO runbook](Actrone_OSS_Launch_SEO_Runbook.md) and the [tool guides](README.md#free-tool-guides) hold the detail behind each step, and are linked where they help.

Commands are written for Windows PowerShell: run each one on its own line.

## Already done (don't redo)

Checked on the live site on 2026-10-02:

- `actrone.com` serves the site. `www.actrone.com`, `actrone-marketing.vercel.app` and `http://` all redirect permanently to it.
- Every page declares `https://actrone.com/...` as its canonical and is indexable. The sitemap lists 26 URLs (21 pages, 3 blog posts and 2 API reference indexes), and `robots.txt` points to it.
- Unknown pages return a real 404. So do blog posts written for the hosted platform, which the open-source site doesn't serve.
- Structured data (organization, website, the free MIT-licensed library, both repositories), share cards, `llms.txt` and the logo are live and correct. The X handle `@useactrone` is in the share tags, footer and structured data.
- The blog and changelog are live (since 2026-10-01). Each post has its own share card, article structured data with the author linked to LinkedIn, and a breadcrumb from the blog to the post. Both pages have an RSS feed.
- The IndexNow key file is live, and every deploy runs an SEO check on the live site.
- The metadata releases are out: `actrone-memory` 0.1.3 and `create-actrone-app` 0.1.1 on npm, and `actrone-memory` 0.2.1 on PyPI, each with the new description and keywords.
- All three GitHub repositories have a description, website link and topics. The package READMEs render on npm and PyPI.
- Email for `hello@actrone.com` works (Zoho).

- Search titles for the blog and changelog that say what they cover ("Blog: building open-source memory for AI agents", "Changelog and release notes for actrone-memory"), and links from the docs to the posts and the changelog (deployed 2026-10-02).
- Automatic IndexNow after every deploy (first run 2026-10-02). The deploy saves the sitemap before it deploys, compares it with the new one afterwards and submits only the URLs that were added, removed or re-dated. A page's date is its content date, so a deploy that changes no content submits nothing.

Built on 2026-10-02 and waiting for your commit (section 1):

- The footer's Legal column links the cookie, acceptable use and security policies. Two of them were in the sitemap with no link from any page, which tells search engines they don't matter.
- Each package README (on GitHub, npm and PyPI) opens with links to the docs, quickstart, integrations and changelog. Before, the two memory READMEs linked to actrone.com once, in their last paragraph, and create-actrone-app's not at all; those pages are where search engines first meet a new project.

## 1. Ship what's waiting

- [ ] **Commit and push the `frontend` repository** (the footer). CI frontend runs, then "Deploy marketing site (Vercel)" deploys.
  - Pass: in GitHub **Actions**, the deploy run is green. Its last two steps are **SEO smoke check on the live site** and **Notify IndexNow of changed pages**, which prints `nothing to submit` because no page's date changed.
- [ ] **Commit and push `actrone-memory-py`, `actrone-memory-ts` and `create-actrone-app`** (the README links). GitHub shows them at once; npm and PyPI show them with each package's next release.
- [x] **Submit the site to IndexNow.** Done on 2026-10-02: all 26 sitemap URLs, accepted with HTTP 200, because Bing had none of them. Later deploys submit their own changes.
- [ ] **Tell Google and Bing about the site.** A week after launch neither engine had a single page, and Search Console showed "URL is unknown to Google" with no referring sitemap. Nothing on the site blocks them; follow the [runbook playbook, item 6](Actrone_OSS_Launch_SEO_Runbook.md#a-page-is-not-indexed): check the sitemap in both consoles, test the homepage live, then request indexing for the homepage first.
- [ ] **Commit and push the `infra` repository** (these docs).

## 2. Connect the search engines

Do these before any announcement, so the engines know the site before links start arriving.

### Google Search Console

Guide: [google-search-console.md](guides/google-search-console.md).

- [ ] Open [Search Console](https://search.google.com/search-console), choose **Add property**, **Domain**, and enter `actrone.com`.
- [ ] Add the verification record. If Google offers to do it through Cloudflare, accept. Otherwise:
  1. In Cloudflare, open `actrone.com`, **DNS**, **Records**, **Add record**.
  2. **Type** `TXT`, **Name** `@`, **Content** the full `google-site-verification=...` value, **TTL** Auto, then **Save**.
  3. Leave the existing Zoho TXT records alone; they keep email working.
- [ ] Back in Search Console, select **Verify**.
  - Pass: the property opens. If it fails, wait a few minutes and retry.
- [ ] Open **Sitemaps**, enter the full URL `https://actrone.com/sitemap.xml` and **Submit**. A Domain property rejects the bare `sitemap.xml` as "Invalid sitemap address".
  - Pass: status **Success**, and the discovered count matches the live sitemap (26 URLs on 2026-10-02). You never need to resubmit it: Google rereads it on its own schedule.
- [ ] Under **Settings**, **Users and permissions**, add a second owner.
- [ ] Keep the TXT record in Cloudflare permanently. Removing it unverifies the site.

### Bing Webmaster Tools

Covers Bing, Copilot, DuckDuckGo and Yahoo. Guide: [bing-webmaster-tools-and-indexnow.md](guides/bing-webmaster-tools-and-indexnow.md).

- [ ] Open [Bing Webmaster Tools](https://www.bing.com/webmasters) and sign in.
- [ ] Choose **Import** from Google Search Console, sign in with the Google account that owns the property, select `actrone.com` and **Import**.
  - Pass: `actrone.com` is listed and **Sitemaps** shows `https://actrone.com/sitemap.xml`.
- [ ] If the import isn't offered, add the site manually with DNS verification. Bing gives a CNAME record: add it in Cloudflare with **Name** the code Bing shows, **Target** `verify.bing.com` and **Proxy status** DNS only. Then **Verify**, and submit the sitemap by hand.
- [ ] Under **Settings**, **Users**, add a second owner.

### Ahrefs Webmaster Tools (optional, free)

Gives a site audit and backlink tracking. Guide: [crawl-audits-screaming-frog-and-ahrefs-webmaster-tools.md](guides/crawl-audits-screaming-frog-and-ahrefs-webmaster-tools.md).

- [ ] Sign up at [ahrefs.com/webmaster-tools](https://ahrefs.com/webmaster-tools) and import the site from Search Console.
- [ ] Run the first **Site Audit**.
  - Pass: no errors. Warnings about the redirects listed in "Already done" are expected.

## 3. Check the pages the way Google sees them

- [ ] **Speed.** In [PageSpeed Insights](https://pagespeed.web.dev), test **Mobile** for:
  - `https://actrone.com/`
  - `https://actrone.com/docs/getting-started/quickstart`
  - `https://actrone.com/docs/memory/integrations`

  Pass: LCP under 2.5 s, CLS under 0.1 and TBT under 200 ms in the lab data. Note the scores. If a page fails, record which metric and ask for a fix; don't guess. Guide: [pagespeed-insights-lighthouse-crux.md](guides/pagespeed-insights-lighthouse-crux.md).
- [ ] **Structured data.** In the [Rich Results Test](https://search.google.com/test/rich-results), test `https://actrone.com/`, `https://actrone.com/docs/memory/configuration` and `https://actrone.com/blog/introducing-actrone-memory`.
  - Pass: no errors on any of them, **Breadcrumbs** detected on the docs page, and **Article** and **Breadcrumbs** detected on the post. Guide: [rich-results-and-schema-validation.md](guides/rich-results-and-schema-validation.md).
- [ ] **Share cards.** Paste `https://actrone.com/`, `https://actrone.com/docs/getting-started/quickstart` and `https://actrone.com/blog/introducing-actrone-memory` into [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) and the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/). X has no validator, so start a draft post with the link and look at the card, then discard the draft.
  - Pass: the Actrone card image, the page title and the description appear. Guide: [social-card-debuggers.md](guides/social-card-debuggers.md).

## 4. Finish the repository pages

### GitHub social preview images

Guide: [github-pypi-npm-discoverability.md](guides/github-pypi-npm-discoverability.md#social-preview-image). The images are in [`github-social-previews/`](github-social-previews/).

- [ ] `actrone/actrone-memory-py`: **Settings**, **General**, **Social preview**, **Edit**, **Upload an image**, pick `actrone-memory-py.png`.
- [ ] `actrone/actrone-memory-ts`: the same, with `actrone-memory-ts.png`.
- [ ] `actrone/create-actrone-app`: the same, with `create-actrone-app.png`.
  - Pass: each settings page shows the new card.

## 5. Launch day

In this order, before posting anything:

- [ ] **Google.** In Search Console, paste each URL into the search bar at the top (URL Inspection), then **Request indexing**:
  1. `https://actrone.com/`
  2. `https://actrone.com/docs`
  3. `https://actrone.com/docs/getting-started/quickstart`
  4. `https://actrone.com/docs/memory/integrations`
  5. `https://actrone.com/docs/memory/overview`
  6. `https://actrone.com/blog/introducing-actrone-memory`

  The daily quota is small, so don't spend it on legal pages.
- [x] **Bing and the other IndexNow engines.** Nothing to do: every page was submitted on 2026-10-02 and each deploy submits its own changes.
- [ ] **Announce with links to actrone.com**, to the homepage or the quickstart, not only to GitHub. A link to your own domain builds its authority; a link to GitHub builds GitHub's.
- [ ] **That evening**, search Google for `site:actrone.com`. A few results on day one is normal; none after 48 hours means something is wrong ([runbook playbook](Actrone_OSS_Launch_SEO_Runbook.md#a-page-is-not-indexed)).

## 6. First week (daily, a few minutes)

- [ ] **Search Console, Pages**: pages move from "Discovered" to "Indexed". Expected, and fine: the `noindex` DPA and SLA pages, the redirects listed in "Already done", and 404s for URLs that never existed. Investigate anything else.
- [ ] **Brand search**: search `actrone memory` on Google and Bing. The site or the GitHub repository should rank first; the site usually overtakes GitHub within 2 to 4 weeks.
- [ ] **Shared links**: when a large account shares a link, check the card. Re-scrape in the debuggers if it's stale.
- [ ] **Changed pages**: every deploy submits its own changes to IndexNow. Check that the deploy's **Notify IndexNow of changed pages** step lists the pages you expected, and request indexing in Search Console for new or materially changed pages, since Google doesn't use IndexNow.

## 7. Weeks two to four (weekly)

- [ ] **Search Console, Performance**, last 7 days: record clicks, impressions and the top 20 queries in a sheet.
- [ ] **Low click-through pages**: a query in positions 1 to 10 with a click-through rate under 2% usually needs a better title or description. Edit that page's entry in `frontend/apps/marketing/src/lib/seo/pages.ts`, deploy, then request indexing.
- [ ] **Content gaps**: queries with impressions but no matching page (for example "langgraph long term memory") are candidates for a new docs guide ([keyword research guide](guides/keyword-research-free-tools.md)).
- [ ] **Backlinks**: open pull requests to add actrone-memory to the integration pages of the frameworks it supports, and to relevant awesome lists; answer "how do I persist agent memory" questions with a snippet and a link to the exact docs section.

## 8. Ongoing

### Monthly (about an hour)

- [ ] Search Console: Performance over 3 months, Pages, Core Web Vitals (fills in once there's real traffic), Enhancements and the generative AI reports.
- [ ] Bing Webmaster Tools: Search Performance and AI Performance (Copilot citations).
- [ ] Ahrefs Webmaster Tools: re-run Site Audit, review new and lost backlinks.
- [ ] Run the fixed prompt set in the [AI search visibility guide](guides/ai-search-visibility.md) and log which sources the assistants cite.
- [ ] When a page's content changed materially, update its `updated` date in `lib/seo/pages.ts`. Don't bump dates without a content change. The date is also what the deploy's IndexNow step compares, so the next deploy submits the page.

### Quarterly (about half a day)

- [ ] Full crawl with Screaming Frog; fix broken links, redirect chains and missing tags.
- [ ] Refresh the keyword map and plan the next docs guides.
- [ ] Review the GitHub topics and the npm and PyPI keywords against new integrations, and ship them with the next release.
- [ ] Re-validate structured data after any change to `lib/seo/structured-data.ts`.

## When you add a page to the OSS site

1. Allow the route in `lib/flags.ts`. A page that should stay hidden goes on `OSS_HIDDEN_PREFIXES` in the same file instead; the tests fail otherwise. A hidden page is not built into the open-source site at all: the deploy deletes it from its throwaway checkout before building (`scripts/prune-hosted-pages.mjs`), and fails if any hosted route or hosted page path is left (`scripts/check-oss-build.mjs`). So its folder must hold only its `page.tsx`, and code the open-source site uses must not name it.
2. Add its entry to `lib/seo/pages.ts`: title, description, `updated` date and share-card copy.
3. In the page, export `metadata = pageMetadata('<key>')`.
4. Run `npx vitest run src/test/seo.test.ts src/test/oss-gate.test.ts` in `frontend/apps/marketing`.
5. After the deploy, check that its **Notify IndexNow of changed pages** step lists the new URL, then request indexing in Search Console.

## When you publish a blog post

1. Add `frontend/apps/marketing/content/blog/<slug>.md` with its front matter: title, a description of 70 to 160 characters, published date, category, author and `audience: oss` (a post with `audience: platform` stays hidden on the open-source site).
2. From `frontend\apps\marketing`, run `npm run sync:blog`, then commit the post together with the regenerated `src/generated/blog-*.json` files. CI fails if they don't match.
3. After the deploy, the post is in the sitemap, `llms.txt` and the RSS feed with its own share card, and the IndexNow step submits it along with `/blog`. Request indexing for the post in Search Console.
4. Before you share it, paste its URL into [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) to check the card.

To revise a post, set `revised`, `revision` and `notice` together. The new date re-dates the post in the sitemap, so the next deploy resubmits it.

## When you release a package

1. Release the package as usual: the release gets its dated section in the package's `CHANGELOG.md`, then the tag publishes it.
2. From `frontend\apps\marketing`, run `npm run sync:changelog` and commit `src/generated/changelog.json`. CI fails if it doesn't match the packages' changelogs.
3. After the deploy, `/changelog` carries the new release date, so the IndexNow step submits it.

## Housekeeping that affects search

- [ ] **Retire the old Cloudflare Worker** at `actrone-frontend.mnyirenda.workers.dev`, with its KV namespace and D1 database. It currently returns errors, but it is a second public copy of the site. Steps: [Vercel runbook, section 5](../Actrone_OSS_Site_Vercel_Deployment_Runbook.md).
- [ ] **Before the hosted launch**, not now: `docs.actrone.com` doesn't exist, but hosted-platform code still refers to it (audit, "Needs a person", item 6).
