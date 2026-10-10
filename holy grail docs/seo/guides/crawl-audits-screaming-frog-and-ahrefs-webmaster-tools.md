# Crawl audits with Screaming Frog and Ahrefs Webmaster Tools

A crawl audit follows every link on the site the way a search engine does, and reports broken links, redirect chains, missing tags and duplicate content in one pass. Two free tools cover it, and they complement each other:

- **Screaming Frog SEO Spider (free version)**: a desktop crawler you run on demand, including against a local build before deploying
- **Ahrefs Webmaster Tools**: a hosted service for verified sites that runs scheduled site audits and shows which other sites link to you

The `npm run seo:smoke` check only covers URLs in the sitemap. A crawl also finds pages that are linked but missing from the sitemap, and links that point somewhere broken.

## Screaming Frog SEO Spider

### Install the SEO Spider

1. Download the [SEO Spider](https://www.screamingfrog.co.uk/seo-spider/) for your operating system and install it. The free version needs no licence.
2. The free version crawls up to 500 URLs per crawl. The OSS site itself has fewer than 20 pages, but the generated Python API reference includes a page per module plus source listings and can push a crawl past the limit. If it does, exclude the references under **Configuration**, **Exclude** with the pattern `.*/reference/.*` and crawl them separately. Some features, such as JavaScript rendering and saving crawl configurations, need a paid licence. The OSS site's content, links and metadata are server-rendered, so JavaScript rendering isn't required.

### Crawl the production site

1. Enter `https://actrone.com` in the URL bar and select **Start**.
2. When the crawl finishes, work through these tabs:

- **Response Codes, Client Error (4xx)**: must be empty. Select a row, then the **Inlinks** tab at the bottom, to see which page links to the broken URL.
- **Response Codes, Redirection (3xx)**: expected entries are `/founding-500`, `/reference/<bundle>` and any hidden route an old link points at. Update internal links so they point at the final URL.
- **Page Titles**: filter for **Missing**, **Duplicate** and **Over 60 Characters**. The site pages should be clean; the generated API reference pages are exempt.
- **Meta Description**: filter for **Missing** and **Duplicate**. Same exemption.
- **Canonicals**: filter for **Non-Indexable Canonical** and **Canonicalised**. Both must be empty for site pages.
- **Directives**: filter for **Noindex**. Only `/legal/dpa` and `/legal/sla` should appear.
- **H1**: filter for **Missing** and **Multiple**.

### Crawl a local build before deploying

1. Build and start the site in `frontend/apps/marketing` with `npm run build && npm run start`.
2. Crawl `http://localhost:3000`.

Canonicals on a local build point at `https://actrone.com`, so the **Canonicals** tab reports every page as canonicalised to another URL. That's expected locally; use this crawl for broken links and missing tags only.

### Export for tracking

Choose **Reports**, then **Crawl Overview**, and save it with the date. Comparing quarterly exports shows whether issues are trending up.

## Ahrefs Webmaster Tools

### Connect Ahrefs to the site

1. Create a free account at [Ahrefs Webmaster Tools](https://ahrefs.com/webmaster-tools).
2. Add `actrone.com` and choose **Import from Google Search Console**, which verifies ownership without a separate DNS record.
3. Accept the default weekly schedule for **Site Audit**.

### Site Audit

Site Audit crawls on a schedule and groups issues by severity. After each run:

- Fix every **Error** before the next scheduled crawl.
- Review **Warnings** and fix the ones on site pages. Warnings on generated API reference pages, such as missing meta descriptions, are low priority.
- Use **Compare crawls** to confirm fixes landed and nothing new regressed.

### Site Explorer

Site Explorer shows backlinks, referring domains and the organic keywords Ahrefs estimates you rank for. For a launch:

- **Referring domains, sorted by first seen**: confirms launch coverage links were found
- **Broken backlinks**: other sites linking to URLs on actrone.com that don't resolve. Add a redirect in `next.config.ts`, or contact the linking site with the correct URL.
- **Organic keywords**: a second opinion to Search Console's query data. Ahrefs' figures are estimates; Search Console's are measured.

## Routine

- **Pre-launch**: Screaming Frog on production, with 4xx, canonical and noindex checks clean
- **Weekly (automatic)**: Ahrefs Site Audit, with emailed issues triaged within the week
- **Launch week and month one**: Ahrefs referring domains, weekly
- **Quarterly**: a full Screaming Frog crawl with an exported report
