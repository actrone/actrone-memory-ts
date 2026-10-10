# Social card debuggers

A launch spreads through shared links, and each platform renders a card from the page's Open Graph and X tags. A missing image or wrong title cuts clicks, and platforms cache what they see first. Check every key URL before launch and re-scrape after any change.

## What actrone.com sends

Every page registered in `lib/seo/pages.ts` emits:

- `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name` and `og:locale`
- `og:image` pointing at `https://actrone.com/og/<page-key>.png`, a 1200×630 PNG with width, height and alt text
- `twitter:card` set to `summary_large_image`, with `twitter:site` and `twitter:creator` set to `@useactrone`

The images are prerendered at build time from the same registry, so each page's card carries its own headline.

## The tools

| Platform | Tool | Can re-scrape |
| --- | --- | --- |
| Any | [OpenGraph.xyz](https://www.opengraph.xyz/) | Not applicable, it fetches live |
| LinkedIn | [Post Inspector](https://www.linkedin.com/post-inspector/) | Yes |
| Facebook, Threads | [Sharing Debugger](https://developers.facebook.com/tools/debug/) | Yes, with **Scrape Again** |
| X | No public validator since 2022 | No |
| Slack, Discord | No tool | No |

### OpenGraph.xyz

Enter a URL to see previews for several platforms at once, with warnings for missing tags. Use it first for a fast overview.

### LinkedIn Post Inspector

1. Sign in to LinkedIn and open the [Post Inspector](https://www.linkedin.com/post-inspector/).
2. Enter the URL and select **Inspect**.
3. Check the preview image, title and description. Inspecting also refreshes LinkedIn's cache for that URL.

### Facebook Sharing Debugger

1. Open the [Sharing Debugger](https://developers.facebook.com/tools/debug/) while signed in to Facebook.
2. Enter the URL and select **Debug**.
3. Read **Warnings That Should Be Fixed**. A missing `fb:app_id` warning is safe to ignore.
4. Select **Scrape Again** after deploying a change.

### X, Slack and Discord

These platforms have no validator:

- **X**: paste the link into the post composer and look at the preview without posting.
- **Slack**: send the link to yourself in a direct message.
- **Discord**: post the link in a private test channel.

All three cache previews by URL for days. If a stale card appears after you changed an image, bust the cache as described below.

## Pre-launch check

Run OpenGraph.xyz and the LinkedIn Post Inspector on each URL you plan to share:

1. `https://actrone.com/`
2. `https://actrone.com/docs`
3. `https://actrone.com/docs/getting-started/quickstart`
4. `https://actrone.com/docs/memory/integrations`
5. `https://actrone.com/founding-500` (redirects to the homepage waitlist section, so it shows the homepage card)

Pass condition: each shows the Actrone card with the page's own headline, and the title and description match the registry.

## Bust a cached card

Platforms that can't re-scrape key their cache on the image URL. After changing a card's design or copy:

1. In `frontend/apps/marketing/src/lib/seo/metadata.ts`, add a version query to the image URL in `ogImageUrl()`, for example `/og/${key}.png?v=2`.
2. Deploy.
3. Re-scrape in LinkedIn and Facebook. X, Slack and Discord pick up the new URL the next time someone shares the link.

## Change a card's copy

Card text comes from the `og` object in each registry entry: `eyebrow` (top right), `headline` and `detail`. Keep the headline under about 60 characters so it fits on 2 lines at the card's type size, and don't use em or en dashes, which the SEO tests reject. The card design lives in `lib/seo/og-image.tsx` and follows the brand lock: Geist only, monochrome, 1px borders, no gradients.
