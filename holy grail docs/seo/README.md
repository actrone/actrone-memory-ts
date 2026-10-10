# SEO for the OSS launch

This folder is the SEO playbook for actrone.com in OSS launch mode (`NEXT_PUBLIC_LAUNCH_MODE="oss"`): what was audited and fixed, the runbook to follow from pre-launch through steady state, and one guide per free tool. Start with the action plan.

## What is here

- **[Audit, September 2026](Actrone_OSS_SEO_Audit_2026-09.md)**: every defect found on the OSS site, how it was verified, what was fixed in code, and what still needs a person.
- **[SEO action plan](Actrone_OSS_SEO_Action_Plan.md)**: start here. The one ordered checklist of everything left to do, from the state on 2026-09-25, with pass conditions for each step.
- **[Launch SEO runbook](Actrone_OSS_Launch_SEO_Runbook.md)**: the ordered checklist for pre-launch gates, launch day, week one, and the monthly and quarterly routines, plus playbooks for common SEO incidents.

## Free tool guides

Each guide covers setup, the reports that matter for a developer-tools site, and a routine:

- **[Google Search Console](guides/google-search-console.md)**: indexing, canonicals, queries, Core Web Vitals field data and the generative AI performance reports
- **[Bing Webmaster Tools and IndexNow](guides/bing-webmaster-tools-and-indexnow.md)**: Bing and Copilot visibility, instant URL submission, Site Scan
- **[PageSpeed Insights, Lighthouse and CrUX](guides/pagespeed-insights-lighthouse-crux.md)**: lab and field performance, and Lighthouse CI in GitHub Actions
- **[Rich Results Test and Schema Markup Validator](guides/rich-results-and-schema-validation.md)**: checking the JSON-LD the site emits
- **[Social card debuggers](guides/social-card-debuggers.md)**: previewing and re-scraping share cards on LinkedIn, Facebook, X, Slack and Discord
- **[Screaming Frog and Ahrefs Webmaster Tools](guides/crawl-audits-screaming-frog-and-ahrefs-webmaster-tools.md)**: full-site crawls and backlink monitoring
- **[Free keyword research](guides/keyword-research-free-tools.md)**: finding the queries developers actually type, without a paid suite
- **[GitHub, PyPI and npm discoverability](guides/github-pypi-npm-discoverability.md)**: the package and repository pages that usually outrank the website for library names
- **[AI search visibility](guides/ai-search-visibility.md)**: being cited by AI Overviews, Copilot and assistant tools, and what `llms.txt` does and does not do

## How the site's SEO is wired

Page-level SEO has one source of truth, the registry in `frontend/apps/marketing/src/lib/seo/pages.ts`. Every OSS page calls `pageMetadata('<key>')`, which produces the title, description, canonical, robots rule, Open Graph and X card for that page. The same registry drives:

- `/sitemap.xml` (indexable pages with real `lastmod` dates, plus the generated API references)
- `/og/<key>.png` (a prerendered 1200×630 social card per page)
- `/llms.txt` (a markdown map for LLM tools)
- BreadcrumbList JSON-LD on docs pages

To add or change a page's search copy, edit the registry entry. `src/test/seo.test.ts` fails the build if a title runs over 60 characters, a description falls outside 70 to 160 characters, copy uses an em or en dash, or a canonical points anywhere but the page itself. After any deploy, run the smoke check:

```bash
npm run seo:smoke -- https://actrone.com
```

Beyond status, canonical, title, description, robots meta and OG image, it fails any page whose `<h1>` only arrives in a hidden streamed segment. That happens when a route `loading.tsx` or a `<Suspense>` boundary wraps a prerendered page: the server HTML then shows the loading fallback, and crawlers that skip JavaScript never see the content. The docs pages had this until 2026-10-07.
