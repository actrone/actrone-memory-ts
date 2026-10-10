# Bing Webmaster Tools and IndexNow

Bing Webmaster Tools is Microsoft's free counterpart to Google Search Console. Bing's index supplies Bing search, Microsoft Copilot answers and several partner search engines, so it reaches developers who never use Google. IndexNow is an open protocol that tells participating search engines about a new or changed URL immediately, instead of waiting for a crawl.

## Set up

Importing from Google Search Console avoids a second DNS verification, so set up [Search Console](google-search-console.md) first:

1. Open [Bing Webmaster Tools](https://www.bing.com/webmasters) and sign in with a Microsoft, Google or Facebook account. Use one someone will keep access to.
2. Choose **Import** from Google Search Console and sign in with the Google account that owns the Search Console property.
3. Select the `actrone.com` property and **Import**. Bing imports verification and the submitted sitemap.

If the import isn't available, add the site manually:

1. Choose **Add manually** and enter `https://actrone.com/`.
2. Pick the **DNS** verification option. Bing shows a CNAME record: a name made of random characters, pointing to `verify.bing.com`.
3. In Cloudflare, open `actrone.com`, **DNS**, **Records**, **Add record**: **Type** `CNAME`, **Name** the random characters Bing gave, **Target** `verify.bing.com`, **Proxy status** DNS only (grey cloud), **TTL** Auto. A proxied record can't be verified.
4. **Save**, return to Bing and select **Verify**. Keep the record afterwards; removing it unverifies the site.
5. Open **Sitemaps**, **Submit sitemap**, and enter `https://actrone.com/sitemap.xml`.

Under **Settings**, **Users**, add a second owner so access doesn't depend on one account.

After setup, open **Sitemaps** and confirm `https://actrone.com/sitemap.xml` is listed with a recent crawl date.

## Reports that matter

- **Search Performance**: clicks, impressions, CTR and position by query and page, like the Google report. Developer queries often rank differently on Bing, so check both.
- **AI Performance**: released in public preview in February 2026, this report shows how often actrone.com pages are cited in Microsoft Copilot and Bing AI-generated answers, and which URLs are cited ([announcement](https://blogs.bing.com/webmaster/February-2026/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview)). Since June 2026 it also groups citations by intent and topic and shows citation share ([update](https://blogs.bing.com/search/June-2026/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare)).
- **URL Inspection**: Bing's indexed view of one URL
- **Site Scan**: a free on-demand crawl audit that lists broken links, missing titles and descriptions, and redirect problems. Run it before launch and quarterly.
- **Keyword Research**: Bing query volumes for a keyword and related terms. See the [keyword research guide](keyword-research-free-tools.md).
- **Backlinks**: sites linking to actrone.com

## IndexNow

With IndexNow, one request notifies every participating engine (Bing, Yandex, Naver, Seznam and others). Google doesn't participate, so keep using Search Console's Request indexing for Google.

### The key

The site already hosts its key (added 2026-09-25): `frontend/apps/marketing/public/74b589ae87de9551dee2c47c294667f9.txt`, served at `https://actrone.com/74b589ae87de9551dee2c47c294667f9.txt`. The OSS proxy doesn't gate `.txt` files, so no allowlist change was needed.

The key isn't a secret; anyone can read the file. It only has to match what you submit. To rotate it, delete that file, add a new `public/<key>.txt` containing only the new key (8 to 128 letters, digits or dashes; `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` makes one), and deploy. The submit script refuses to run if there is more than one key file.

### Automatic submission on every deploy

Since 2026-10-02, every production deploy submits its own changes. The deploy workflow (`frontend/.github/workflows/deploy-marketing.yml`) saves the live sitemap before it deploys. After the SEO smoke check passes, its **Notify IndexNow of changed pages** step compares that copy with the new sitemap and submits every URL that was added, removed or re-dated. The step's log lists the URLs it sent.

A sitemap date is the page's content date (from `lib/seo/pages.ts`, or a post's front matter), never the build date. So a deploy that only changes code or styling submits nothing, and IndexNow never sees the same unchanged pages again and again. A failed submission doesn't fail the deploy, which is already live. Resubmit by hand with the command below.

### Submit URLs by hand

From `frontend/apps/marketing`, after the deploy that changed the pages is live:

```bash
# Only these pages (launch day: the key pages)
npm run indexnow -- https://actrone.com / /docs /docs/getting-started/quickstart /docs/memory/integrations /docs/memory/overview

# Every URL in the live sitemap (only after a site-wide change)
npm run indexnow -- https://actrone.com

# Only what changed since an earlier copy of the sitemap (what the deploy runs)
npm run indexnow -- https://actrone.com --changed-since sitemap-before.xml
```

Add `--dry-run` to any of them to print the URLs without submitting anything.

The script (`scripts/indexnow-submit.mjs`) reads the key from `public/`, confirms the live site serves it, and sends one request to `api.indexnow.org`. It prints the URLs it submitted. A `403` means the key file wasn't found or doesn't match, and a `422` means a URL doesn't belong to the host; the script reports both and exits 1.

One request can carry up to 10,000 URLs. Submit only URLs that changed; resubmitting unchanged pages repeatedly can get submissions ignored.

## Routine

- **Launch day**: IndexNow submission for the key pages
- **After each content deploy**: automatic; check that the deploy's IndexNow step listed the pages you changed
- **Monthly**: Search Performance and AI Performance
- **Quarterly**: Site Scan
