# Deploy the Actrone OSS site on Cloudflare Workers

> **Superseded on 2026-09-25: the site deploys on Vercel** (`Actrone_OSS_Site_Vercel_Deployment_Runbook.md`). On Workers, a page built with Next.js Cache Components cannot be re-rendered after deploy: Next.js warns that it "cannot guarantee that Cache Components will run as expected due to the current runtime's implementation of `setTimeout()`", and with Next.js 16.3.6 and OpenNext 1.20.6 every runtime re-render hung ("The Workers runtime canceled this request because it detected that your Worker's code had hung"). Every page carries an expiry (the footer's copyright year is cached for a day, the homepage's Founding 500 count for five minutes), so pages hung once expired, and the homepage within an hour of each deploy or at once after a sign-up. Reproduced locally and in production.
>
> The configuration here still builds and passes every functional check at deploy time. Moving back would first need every prerendered page to lose its expiry (a build-time year, a request-time count and star count without `use cache`) and a CI check that fails any build whose prerender manifest contains an expiring route.

This runbook takes the OSS marketing site (`apps/marketing` in the `actrone/actrone-frontend` repository) to a verified production launch on `actrone.com`, served by Cloudflare Workers and built by Cloudflare Workers Builds from `main`. Follow the sections in order. Section 7 is the go-live check; do not announce the launch until it passes.

It replaces `Actrone_OSS_Site_Vercel_Deployment_Runbook.md`. The site moved because Vercel's Hobby plan is for non-commercial use only, and a company site that advertises a discount on a future paid product counts as commercial under Vercel's own definition.

Companion docs:

- `Actrone_OSS_Launch_Environment_Variables_Runbook.md`: where each value comes from, and the GitHub star count token step by step
- `Actrone_OSS_Site_Services_Setup_Runbook.md`: setting up Baserow, PostHog and Sentry
- `apps/marketing/docs/founding-500-baserow-setup.md` (frontend repo): the Baserow tables and database token the forms write to

**Shells.** Every command runs in Windows PowerShell 5.1 from `apps/marketing`. It uses `curl.exe`, because plain `curl` is an alias for a different command in PowerShell 5.1.

## How the site runs on Cloudflare

OpenNext (`@opennextjs/cloudflare`) turns the app's normal Next.js build into a Worker. The pieces, all configured in `apps/marketing/wrangler.jsonc` and `apps/marketing/open-next.config.ts`:

- **Worker `actrone-frontend`**: renders pages and runs the API routes and Server Actions
- **Static assets**: `/_next/static`, fonts, images and the API reference pages, served free and without counting as Worker requests
- **KV namespace**: the page cache, with each Cloudflare location's own cache in front of it to cut reads
- **D1 database `actrone-frontend-tag-cache`**: which cache tags were expired when, so a new sign-up refreshes the Founding 500 count everywhere at once
- **Durable Object `DOQueueHandler`**: refreshes stale pages in the background, once per page
- **Rate limit `FORM_RATE_LIMITER`**: 5 form submissions per minute per client IP, counted across instances

## 1. Choose the plan: Free or Paid

Everything above works on the Free plan, which needs no payment method. Its limits that matter here:

| Limit | Workers Free | Workers Paid ($5 per month minimum) |
| --- | --- | --- |
| CPU time per request | 10 ms, with some tolerance for occasional overruns | 30 seconds by default |
| Worker requests | 100,000 per day | 10 million per month included, then $0.30 per million |
| KV reads and writes | 100,000 reads and 1,000 writes per day | 10 million reads and 1 million writes per month included |
| Static asset requests | Free and unlimited | Free and unlimited |

On Free, a Worker that runs over 10 ms of CPU consistently has those requests cut off, and a KV operation over the daily quota fails. Each deploy writes about 112 cache entries to KV, so about eight deploys a day fit in Free's write quota.

Decide with real numbers from the test deploy in section 8. If page requests stay under 10 ms of CPU, stay on Free. If they don't, or for launch week when traffic peaks, upgrade under **Workers & Pages**, **Plans**. Nothing in the code or configuration changes between plans.

## 2. Create the cache resources (one time)

Sign in once. A browser window opens to approve Wrangler:

```powershell
npx wrangler login
```

Create the KV namespace and the D1 database:

```powershell
npx wrangler kv namespace create NEXT_INC_CACHE_KV
npx wrangler d1 create actrone-frontend-tag-cache
```

Or create both in the dashboard under **Storage & databases**: a Workers KV namespace named `actrone-frontend-cache`, and a D1 database named `actrone-frontend-tag-cache`.

Either way you get two IDs. Put the KV ID in `wrangler.jsonc` as `"id"` on the `NEXT_INC_CACHE_KV` entry, and the D1 ID as `"database_id"` on the `NEXT_TAG_CACHE_D1` entry, then commit the change. These IDs are not secrets. The Durable Object and the rate limit need no setup: the first deploy creates them.

## 3. Connect the repository to Workers Builds

1. In the Cloudflare dashboard, open **Workers & Pages** and select the `actrone-frontend` Worker. If it does not exist yet, select **Create**, **Import a repository**, and pick `actrone/actrone-frontend`.
2. Open **Settings**, **Build**, and connect `actrone/actrone-frontend` if it is not connected. Install the Cloudflare GitHub app on the `actrone` organization when asked, limited to that repository.
3. Set the build configuration:

   | Setting | Value |
   | --- | --- |
   | Production branch | `main` |
   | Root directory | `apps/marketing` |
   | Build command | `cd ../.. && npm ci --no-audit --no-fund && cd apps/marketing && npm run cf:build` |
   | Deploy command | `npm run cf:deploy` |

4. Under **Build watch paths**, set the include paths to `apps/marketing/*, packages/ui/*, package.json, package-lock.json`. A change to the other apps then no longer rebuilds the site.
5. Under **Branch control**, leave **Enable Preview Builds** off. A preview would share production's page cache and database token. Every non-`main` build is served `noindex` anyway, so turning previews on later is safe for search.
6. Give the build's API token access to D1. The token Workers Builds creates can edit Workers scripts, KV and R2, but not D1, and every deploy creates the tag cache's table in D1. Note the token's name under **API token** on the same **Build** page. Open `https://dash.cloudflare.com/profile/api-tokens` (if the token is not listed there, it is an account token: **Manage Account**, **Account API Tokens**). Open the token's **⋯** menu, select **Edit**, add the permission **Account**, **D1**, **Edit**, then **Continue to summary** and **Update token**. Without this, the deploy fails at "Creating D1 table". If a build then fails with "The build token selected for this build has been deleted or rolled", select the token again under **API token**, or create a new one with the permissions listed in [Build token permissions](#build-token-permissions) and select that.

### Build token permissions

A token for this build needs exactly these permissions, all on this account only:

| Scope | Permission | Access |
| --- | --- | --- |
| Account | Account Settings | Read |
| Account | Workers Scripts | Edit |
| Account | Workers KV Storage | Edit |
| Account | D1 | Edit |
| User | User Details | Read |
| User | Memberships | Read |

The token Cloudflare generates also has R2 edit and Workers Routes edit, which this site does not use.

Why the build command installs from the workspace root: the site builds against the shared `packages/ui` package, and the only lockfile is at the root. `npm ci` installs exactly that lockfile and fails if it is out of date. The Node.js version comes from `apps/marketing/.node-version` (24, the same major CI uses).

`npm run cf:deploy` first runs `scripts/assert-worker-env-clean.mjs`, which refuses to deploy if any `.env` value was compiled into the Worker. Then it fills the remote page cache, creates the D1 table if needed, and deploys.

## 4. Set the variables

Cloudflare keeps build-time and runtime values in two separate places, and each value must be in the right one.

**Build variables**: **Settings**, **Build**, **Variables and secrets**. Read while building, so every `NEXT_PUBLIC_` value belongs here.

| Variable | Type | Value and notes |
| --- | --- | --- |
| `SKIP_DEPENDENCY_INSTALL` | Text | `1`. The build command runs `npm ci` itself, from the workspace root. |
| `NEXT_PUBLIC_LAUNCH_MODE` | Text | `oss`. **Required.** The build fails if it is missing or misspelled, because the fallback would publish the full platform site. |
| `NEXT_PUBLIC_POSTHOG_KEY` | Text | The PostHog project key (`phc_...`). Public by design. |
| `NEXT_PUBLIC_POSTHOG_REGION` | Text | `us`, the region of the key's project. Required when the key is set: the build fails without it, because a key sent to the other region is dropped silently. |
| `NEXT_PUBLIC_SENTRY_DSN` | Text | Public by design. Errors are tagged `production` automatically. |
| `SENTRY_AUTH_TOKEN` | Secret | Uploads source maps during the build. The maps are deleted from the output afterwards and never served. |
| `SENTRY_ORG` | Text | Your Sentry organization slug. |
| `SENTRY_PROJECT` | Text | `actrone-frontend` |
| `GITHUB_TOKEN` | Secret | Optional. The star count is first fetched during the build; with the token that fetch never hits GitHub's anonymous limit. |

**Runtime secrets**: **Settings**, **Variables and secrets**, type **Secret**. Read on each request.

| Secret | Value and notes |
| --- | --- |
| `BASEROW_DATABASE_TOKEN` | Baserow database token: create on both tables, read on Founding 500 only, no update or delete. |
| `GITHUB_TOKEN` | Optional, the same token as above. Used by the hourly star count refresh. |

Do not add plain runtime variables in the dashboard: every deploy replaces them with the `vars` in `wrangler.jsonc`, which already holds `BASEROW_WAITLIST_TABLE_ID`, `BASEROW_CONTACT_TABLE_ID` and `FOUNDING_CAP`. Secrets are kept across deploys.

Do not set these anywhere, and delete them if they came across from a local `.env` file:

- `NEXT_PUBLIC_SANDBOX_API_KEY` and `NEXT_PUBLIC_SANDBOX_AGENT_ID`: they would ship a key in a public JavaScript file
- `NEXT_PUBLIC_ORCHESTRATOR_URL`: the OSS launch has no platform API behind it
- `NEXT_PUBLIC_SITE_URL`: it defaults to `https://actrone.com`; set it only for the test deploy in section 8
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT`: the environment comes from the build automatically
- any `NEXT_PUBLIC_FEATURE_*` flag: OSS mode decides which features exist
- `BASEROW_API_URL`: only for a self-hosted Baserow

## 5. Connect the domain

`actrone.com` is registered at Cloudflare, so its DNS is already there.

1. In **Websites**, open `actrone.com`, then **DNS**, **Records**. Delete any existing `A`, `AAAA` or `CNAME` record for `actrone.com` itself; a custom domain cannot be added over one.
2. Open the Worker, then **Settings**, **Domains & Routes**, **Add**, **Custom domain**, and enter `actrone.com`. Cloudflare creates the DNS record and the certificate.
3. Redirect `www` to the apex. In **DNS**, add an `AAAA` record for `www` with the value `100::`, proxied. Then under **Rules**, **Redirect Rules**, create a rule named `www to apex` that matches the hostname `www.actrone.com` and redirects dynamically to `concat("https://actrone.com", http.request.uri.path)` with status 301, preserving the query string.
4. Under **SSL/TLS**, set the encryption mode to **Full (strict)**, then under **Edge Certificates** turn on **Always Use HTTPS** and set **Minimum TLS Version** to 1.2. The site itself sends HSTS.

The apex is the canonical host. Canonical URLs, the sitemap and the indexing check all expect `actrone.com`.

Leave **Bot Fight Mode** off unless the site comes under attack. It sets a `__cf_bm` cookie, which the cookie policy would then have to list.

## 6. Rate limiting and observability

The forms need no firewall rule. The `FORM_RATE_LIMITER` binding in `wrangler.jsonc` limits the waitlist and contact form, including their Server Actions, to 5 submissions per minute per client IP. The app reads the client IP from `cf-connecting-ip`, which Cloudflare sets; a client-supplied `x-forwarded-for` cannot change it.

Workers Logs and traces are on (`observability` in `wrangler.jsonc`). Open the Worker, then **Observability**, to see every request's CPU time, errors and the site's structured log lines. Every request is logged, and 10% are traced.

Log events and trace spans share one quota: 200,000 events a day kept for 3 days on Free, or 20 million a month kept for 7 days on Paid (then $0.60 per million). Traces are free during their beta; from 2026-10-01 each span counts as one event, and one page request emits several spans, which is why only 10% are traced. Change the rates in `wrangler.jsonc`, not in the dashboard: each deploy replaces the dashboard settings with the file's.

## 7. Deploy and verify

Push to `main`, or open **Deployments** and select **Deploy** on the latest build. Then run these checks against production before announcing the launch:

```powershell
$site = "https://actrone.com"

# Security headers: expect DENY, frame-ancestors 'none', HSTS, nosniff
curl.exe -sI "$site/" | Select-String -Pattern "x-frame-options|content-security-policy|strict-transport|x-content-type"

# OSS gate: a hosted-only page redirects home (307); a hidden API is gone (404)
curl.exe -s -o NUL -w "%{http_code}`n" "$site/pricing"
curl.exe -s -o NUL -w "%{http_code}`n" "$site/api/revalidate"

# API reference pages ship with the site (200)
curl.exe -s -o NUL -w "%{http_code}`n" "$site/reference/memory-py/index.html"
curl.exe -s -o NUL -w "%{http_code}`n" "$site/reference/memory-ts/index.html"

# Cross-site form posts are refused (415)
curl.exe -s -o NUL -w "%{http_code}`n" -X POST "$site/api/waitlist" -H "content-type: text/plain" -d "{}"

# The counter reads Baserow: expect "available":true
curl.exe -s "$site/api/waitlist/count"

# Search: production allows crawling and names the sitemap
curl.exe -s "$site/robots.txt"
```

Check that a forged IP header cannot dodge the rate limit. These requests fail validation, so nothing is written to Baserow. Expect `400` five times, then `429`:

```powershell
1..7 | ForEach-Object { curl.exe -s -o NUL -w "%{http_code}`n" -X POST "$site/api/waitlist" -H "content-type: application/json" -H "x-forwarded-for: 198.51.100.$_" -d '{\"email\":\"not-an-email\"}' }
```

Then check in a browser:

1. The top navigation's **Docs** link opens the docs. It must be a link, not a "coming soon" dialog.
2. Join the Founding 500 with a real address. The counter updates, and the row appears in Baserow's **Founding 500** table.
3. Send a contact message. It appears in the **Contact** table.
4. Delete both test rows in Baserow, so the counter starts from real sign-ups.
5. Accept analytics in the cookie banner, browse two pages, and confirm the page views appear in PostHog.
6. Open the latest build's log in **Deployments** and confirm Sentry reports uploaded source maps.

Run the repository's own gates against production as well:

```powershell
npm run seo:smoke -- https://actrone.com
npm run brand:check -- https://actrone.com
```

## 8. Test deploy on workers.dev (before the domain)

Use this to measure real CPU time before choosing a plan, or before the domain is connected.

**Through Workers Builds (simplest, once section 3 is done):** add the build variable `NEXT_PUBLIC_SITE_URL` = `https://actrone-frontend.mnyirenda.workers.dev` and push to `main`. Every page is then served `noindex`, because the origin is not `actrone.com`. Delete that build variable when you connect the domain in section 5, then retry the build.

**From your machine:** this deploys from your working copy, so it must not carry your `.env.local`.

1. Build from a clean copy of the repository without any `.env` file, for example a fresh `git clone`. OpenNext compiles `.env` files into the Worker, and `npm run cf:deploy` refuses a bundle that contains their values.
2. Build with a non-production origin, so every page is served `noindex`:

   ```powershell
   $env:NEXT_PUBLIC_LAUNCH_MODE = "oss"
   $env:NEXT_PUBLIC_SITE_URL = "https://actrone-frontend.mnyirenda.workers.dev"
   npm run cf:build
   npm run cf:deploy
   ```

3. Open the `workers.dev` address Wrangler prints, browse the pages in section 7, then open the Worker's **Observability** tab and read the CPU time of the page requests.
4. Clear the origin in that PowerShell window with `Remove-Item Env:NEXT_PUBLIC_SITE_URL`. Production deploys come from Workers Builds, which never sets it.

The forms on a test deploy report "not available" unless you add `BASEROW_DATABASE_TOKEN`, which keeps test sign-ups out of the real list.

## 9. What changed in the code for this deployment

For reviewers of the move from Vercel:

- **Cloudflare build**: `wrangler.jsonc`, `open-next.config.ts` and the `cf:build`, `cf:preview` and `cf:deploy` scripts. OpenNext builds from the app's own Turbopack build, the same one the Docker image uses.
- **No secrets in the bundle**: `scripts/assert-worker-env-clean.mjs` fails a deploy whose bundle carries `.env` values, and CI runs it on every pull request.
- **Client IP on Cloudflare**: the rate limiter now reads `cf-connecting-ip` on Workers. It used to take the first `x-forwarded-for` entry, which on Cloudflare the client controls, so one client could have posed as a new one on each request.
- **Cross-instance rate limit**: the `FORM_RATE_LIMITER` binding replaces the Vercel firewall rule, and it covers Server Actions, which a Free-plan WAF rule cannot match.
- **Host-neutral deployment detection**: `src/lib/deployment.ts` recognises production and previews on Workers Builds (`WORKERS_CI`, `WORKERS_CI_BRANCH`) and on Vercel. `next.config.ts` inlines the result, so indexing and the Sentry environment are decided at build time, and the fail-closed launch mode applies on either host.
- **API reference pages**: served exactly as named (`html_handling: "none"`), so relative links in the Sphinx and TypeDoc pages keep working.
- **CI**: a `worker` job builds the Worker, runs the `.env` guard and a dry-run deploy, which validates the bundle against Cloudflare's limits without credentials.
- **Privacy policy**: names Cloudflare as the website host, and PostHog's US cloud.
- **Sentry on Workers**: browser only. The server side of `@sentry/nextjs` stays off on Workers (`src/instrumentation.ts`), because with it running a request for an unknown `/og/<name>.png` hung until Cloudflare cancelled it. Server errors are in the Worker's **Observability** tab. The `/monitoring` tunnel needs no server SDK and was tested forwarding to Sentry on Workers.
- **PostHog region**: `NEXT_PUBLIC_POSTHOG_REGION` (`us` or `eu`) chooses where `/ingest` proxies to, and the build fails when a key is set without it.
