# PageSpeed Insights, Lighthouse and CrUX

Page experience is a ranking input, and it decides whether a developer who clicks through stays. Three free Google tools measure it:

- **Lighthouse**: a lab test that loads a page in a controlled environment and scores performance, accessibility, best practices and SEO
- **Chrome UX Report (CrUX)**: field data collected from real Chrome users over a rolling 28 days
- **PageSpeed Insights**: runs Lighthouse and shows CrUX data for the same URL on one page

Lab data is available on day one. Field data needs real traffic, so it appears weeks after launch.

## The targets

Google assesses Core Web Vitals at the 75th percentile of real visits. These match the targets in the project's `CLAUDE.md`:

| Metric | Measures | Good |
| --- | --- | --- |
| Largest Contentful Paint (LCP) | loading | 2.5 s or less |
| Interaction to Next Paint (INP) | responsiveness | 200 ms or less |
| Cumulative Layout Shift (CLS) | visual stability | 0.1 or less |

INP needs real interactions, so lab tools report Total Blocking Time (TBT) as a stand-in. Keep TBT under 200 ms.

## PageSpeed Insights

1. Open [PageSpeed Insights](https://pagespeed.web.dev/) and enter a URL.
2. Read the **Mobile** tab first; Google indexes the mobile version of pages.
3. The top section, "Discover what your real users are experiencing", is CrUX field data. When it reads "no data", the page doesn't have enough traffic yet.
4. The lower section is the Lighthouse lab run. Its **Diagnostics** list names the specific resources causing a slow score.

Test these URLs, since they carry the most launch traffic:

- `https://actrone.com/` (the heaviest page: the launch video, animated sections and the memory ledger)
- `https://actrone.com/docs/getting-started/quickstart`
- `https://actrone.com/docs/memory/integrations` (the longest docs page)

Lab scores vary by a few points between runs. Run each URL 3 times and use the median.

## Lighthouse in Chrome DevTools

For testing a fix before you deploy it:

1. Build and start the site locally with `npm run build && npm run start` in `frontend/apps/marketing`. Don't measure `next dev`; development mode is unoptimised.
2. Open the page in a Chrome window with no extensions, such as a guest profile.
3. Open DevTools, select the **Lighthouse** panel, choose **Mobile** and **Navigation**, and run it.

## Lighthouse CI in GitHub Actions

Lighthouse CI runs Lighthouse on every pull request and fails the check when scores regress. This workflow tests the production build of the marketing app:

```yaml
name: lighthouse
on:
  pull_request:
    paths: ['apps/marketing/**', 'packages/ui/**']
jobs:
  lighthouse:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
        working-directory: apps/marketing
        env:
          NEXT_PUBLIC_LAUNCH_MODE: oss
      - run: npx --yes @lhci/cli@0.15.1 autorun
        working-directory: apps/marketing
```

The workflow assumes it lives in the `frontend` repository. Per the repository's CI rules, pin `actions/checkout` and `actions/setup-node` to full commit SHAs rather than tags. Save the Lighthouse CI configuration as `apps/marketing/lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "npm run start",
      "url": [
        "http://localhost:3000/",
        "http://localhost:3000/docs/getting-started/quickstart"
      ],
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:seo": ["error", { "minScore": 1 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }]
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

`temporary-public-storage` uploads each report to a public URL that expires after a few days and prints the link in the job log. Reports contain only public page content.

A local build has no `NEXT_PUBLIC_SITE_URL`, so the pages are indexable and the Lighthouse SEO category can reach 100. On a preview origin, the SEO score drops because of the intentional `noindex`.

## CrUX field data over time

Once traffic builds, [CrUX Vis](https://cruxvis.withgoogle.com/) charts field data for an origin or a URL week by week. Use it to confirm that a deployed fix moved the 75th percentile, which PageSpeed Insights' single 28-day snapshot can't show.

## Routine

- **Pre-launch**: PageSpeed Insights on the 3 key URLs, with every lab metric in Good
- **Every pull request**: Lighthouse CI
- **Monthly, after traffic arrives**: the Core Web Vitals report in Search Console, with CrUX Vis for trends
