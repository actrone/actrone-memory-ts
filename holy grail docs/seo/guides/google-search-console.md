# Google Search Console

Google Search Console is Google's free tool for site owners. It shows which pages Google has indexed and why others aren't, which queries bring impressions and clicks, how real visitors experience page speed, and whether structured data is valid. It's the only authoritative source for how Google sees actrone.com, so set it up before launch.

## Set up

Use a Domain property, which covers every subdomain and both HTTP and HTTPS in one view:

1. Open [Search Console](https://search.google.com/search-console) and choose **Add property**, then **Domain**.
2. Enter `actrone.com`.
3. Google shows a TXT record starting `google-site-verification=`. Because `actrone.com`'s DNS is at Cloudflare, Google may offer to add it for you through Cloudflare; accepting is fine. Otherwise add it by hand:
   1. In Cloudflare, open `actrone.com`, **DNS**, **Records**, **Add record**.
   2. **Type** `TXT`, **Name** `@`, **Content** the full `google-site-verification=...` value, **TTL** Auto. TXT records have no proxy setting.
   3. **Save**. Leave the existing TXT records alone: the SPF record (`v=spf1 include:zohomail.com ~all`) and the Zoho verification record keep email working, and several TXT records on `@` are normal.
4. Back in Search Console, select **Verify**. Cloudflare publishes the record within a minute or two; if verification fails, wait a few minutes and retry. You can check with `nslookup -type=TXT actrone.com 1.1.1.1`.
5. Under **Settings**, **Users and permissions**, add a second owner so access doesn't depend on one account.

Keep the TXT record in DNS permanently. Removing it unverifies the property.

## Submit the sitemap

1. Open **Sitemaps**.
2. Enter the full URL, `https://actrone.com/sitemap.xml`, and select **Submit**. A Domain property has no base URL to prefix, so the bare `sitemap.xml` is rejected as "Invalid sitemap address".
3. Confirm the status reads **Success** and the discovered page count matches the sitemap (26 URLs as of 2026-10-02: 21 pages, 3 blog posts and 2 API reference indexes).

The sitemap is generated from the SEO registry, so you never need to resubmit it after adding pages. Google re-reads it on its own schedule.

## Reports that matter for actrone.com

### URL Inspection

Enter any full URL in the search bar at the top to see Google's indexed version of that page. Use it to:

- **Confirm the canonical**: under **Page indexing**, "User-declared canonical" and "Google-selected canonical" should both be the page's own URL
- **Test the live page**: **Test live URL** fetches the current deployment, which is useful straight after a fix
- **Request indexing**: queues a recrawl. The daily quota is limited, so use it for new or materially changed pages only

### Page indexing

This report explains every URL Google knows about that it hasn't indexed. At launch, expect only these reasons:

- **Excluded by 'noindex' tag**: `/legal/dpa` and `/legal/sla`, by design in OSS mode
- **Page with redirect**: `/founding-500`, the bare `/reference/<bundle>` URLs, `www.actrone.com`, `actrone-marketing.vercel.app`, `http://` URLs, and hidden platform pages (such as `/pricing`), which redirect home in OSS mode. All by design.
- **Not found (404)**: URLs that never existed, typically from mistyped or scraped links, and blog posts written for the hosted platform (such as `/blog/llm-is-a-cpu`), which the open-source site doesn't serve. Since 2026-09-25 these return a real 404 rather than a redirect home, so this is expected and needs no action unless a URL you meant to publish appears here.

Treat anything else as a defect. "Duplicate, Google chose different canonical than user" and "Soft 404" need action; the [runbook playbook](../Actrone_OSS_Launch_SEO_Runbook.md#a-page-is-not-indexed) covers each one.

### Performance

The Performance report shows clicks, impressions, click-through rate (CTR) and average position per query and per page, for up to 16 months. The views to use:

- **Queries tab, last 28 days, sorted by impressions**: what people search for when they see you
- **Pages tab**: which pages earn traffic, and which get impressions but few clicks
- **Compare mode**: last 7 days against the previous 7, to spot drops

A query with a position between 1 and 10 and a CTR under 2% usually means the title or description doesn't match what the searcher wanted. Rewrite the registry entry for that page.

### Generative AI performance reports

Since June 2026, Search Console has dedicated reports for impressions inside Google's generative AI features, such as AI Overviews and AI Mode ([Google announcement](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports)). For a developer library, AI Overviews answering "how do I add memory to a LangGraph agent" are a major discovery surface. Review these reports monthly alongside the classic Performance report, and see the [AI search visibility guide](ai-search-visibility.md) for what to do with the data.

### Core Web Vitals

This report groups URLs by Largest Contentful Paint (LCP), Interaction to Next Paint (INP) and Cumulative Layout Shift (CLS), measured from real Chrome users. It stays empty until the site has enough traffic, often several weeks after launch. Until then, use lab data from [PageSpeed Insights](pagespeed-insights-lighthouse-crux.md).

### Enhancements

After Google crawls the docs pages, a **Breadcrumbs** report appears here. It should show valid items for all 6 docs guides and no errors.

### Links

The Links report shows the top linking sites and the most-linked pages. After launch, check that coverage links point at actrone.com pages rather than only at GitHub.

## Routine

- **Launch week, daily**: Page indexing and URL Inspection for changed pages
- **Weeks 2 to 4, weekly**: Performance, recorded in a tracking sheet
- **Monthly**: Performance over 3 months, generative AI reports, Page indexing, Core Web Vitals, Enhancements

## Email alerts

Search Console emails verified owners about new indexing issues, manual actions and security problems. Make sure the owner accounts use an inbox someone reads.
