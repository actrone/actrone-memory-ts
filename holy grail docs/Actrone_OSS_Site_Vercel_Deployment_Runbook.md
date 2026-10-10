# Deploy the Actrone OSS site on Vercel

> **The current host, since 2026-09-25.** The site moved to Cloudflare Workers on 2026-09-24 and back the next day: on Workers, pages built with Next.js Cache Components cannot be refreshed after deploy, so expired pages hang (see the note at the top of `Actrone_OSS_Site_Cloudflare_Deployment_Runbook.md`). Vercel runs Next.js natively. The Hobby plan was chosen knowingly despite the non-commercial clause below.
>
> **Deploys run from GitHub Actions**, not Vercel's Git integration: `actrone-frontend` is a private repository owned by a GitHub organization, which a Hobby account cannot import. `.github/workflows/deploy-marketing.yml` builds the site with the Vercel CLI after "CI frontend" passes on `main`, and uploads it with `vercel deploy --prebuilt`.

This runbook takes the OSS marketing site (`apps/marketing` in the `actrone/actrone-frontend` repository) from a fresh Vercel account to a verified production launch on `actrone.com`. Follow the sections in order. Section 6 is the go-live check; do not announce the launch until it passes.

Companion docs:

- `Actrone_OSS_Site_Services_Setup_Runbook.md`: setting up Baserow, PostHog and Sentry, whose values you enter in section 2
- `apps/marketing/docs/founding-500-baserow-setup.md` (frontend repo): the Baserow tables and database token the forms write to
- `Actrone_OSS_Site_Form_Datastore_Decision.md`: why the forms moved from Airtable to Baserow

## Before you start: the Hobby plan is for non-commercial use

Vercel's fair use guidelines restrict Hobby to "non-commercial personal use only", and define commercial use as any deployment "used for the purpose of financial gain of anyone involved in any part of the production of the project", including "advertising the sale of a product or service". This site belongs to a company, Apocalypse Technologies, and collects sign-ups for a future paid hosted product, so it likely counts as commercial under that definition even though the libraries are open source. A Hobby project used commercially can be paused.

Choose one before launch:

- **Pro plan** ($20 per developer seat per month): the only option that is clearly within the terms, and it removes the Hobby usage caps below
- **Ask Vercel**: their guidelines say to contact Vercel Support if you are unsure whether a site is commercial; get the answer in writing
- **Vercel's open source sponsorship**: free for qualifying projects, but approval is not same-day

Hobby also pauses a feature until 30 days have passed once its monthly allowance is used up. For a launch that could reach a news aggregator front page, the relevant caps are 100 GB of data transfer, 1,000,000 edge requests and function invocations, 4 hours of active CPU, and 5,000 image transformations per month.

## 1. Create the Vercel project and connect GitHub Actions

Run these in PowerShell from the frontend repository root:

```powershell
cd C:\Users\mnyir\Documents\me\Actrone\frontend
npx vercel@59.26.0 login
npx vercel@59.26.0 link
```

Answer `vercel link` like this: set up the project **yes**, your own account as the scope, link to an existing project **no**, project name `actrone-marketing`, code directory `apps/marketing`. It detects Next.js; do not override the settings. `apps/marketing/vercel.json` sets the install and build commands, and `apps/marketing/package.json` pins Node `24.x`, and the project's **Node.js Version** setting should say `24.x` too.

`vercel link` writes `.vercel/project.json` (git-ignored) with an `orgId` and a `projectId`. Then:

1. In the Vercel dashboard, open the project, **Settings**, **Build and Deployment**, and confirm **Root Directory** is `apps/marketing` with **Include files outside of the Root Directory in the Build Step** on. The site builds against `packages/ui`, which sits outside `apps/marketing`.
2. Create a token: your avatar, **Account Settings**, **Tokens**, **Create**. Name it `actrone-frontend-github-actions`, set **Scope** to the team that owns the project (`apocalypse-tech`, the `orgId` starting `team_` in `.vercel/project.json`) with **All projects**, and give it an expiry you will put in your calendar. A token scoped to another account, or limited to the single project, fails at `vercel pull` with "Could not retrieve Project Settings" (both tested 2026-09-25).
3. In GitHub, open `actrone/actrone-frontend`, **Settings**, **Secrets and variables**, **Actions**, and add these repository secrets: `VERCEL_TOKEN` (the token), `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (from `.vercel/project.json`), and `SENTRY_AUTH_TOKEN` if you upload source maps.
4. Do not deploy yet. Complete section 2 first, because the build fails on purpose without the launch mode.

The workflow only deploys after "CI frontend" succeeds for a push to `main`, and it deploys the exact commit CI tested. To deploy by hand, open **Actions**, **Deploy marketing site (Vercel)**, **Run workflow**.

## 2. Set the environment variables

Set each variable in **Project settings**, **Environment Variables**, for **Production**. There are no preview deployments: the workflow deploys production only. Give every secret the **Secret** type, so it can never be read back, and everything else the **Config** type. `NEXT_PUBLIC_` values are copied into the browser bundle at build time, so they are public by design and a change needs a redeploy. `Actrone_OSS_Launch_Environment_Variables_Runbook.md` covers where each value comes from and the star count token step by step.

The build runs in GitHub Actions and reads these with `vercel pull`. A Secret-type value cannot be pulled, so a secret the **build** needs goes in GitHub instead: that is only `SENTRY_AUTH_TOKEN` (section 1). Runtime secrets stay here; Vercel gives them to the site when it runs.

| Variable | Secret | Value and notes |
| --- | --- | --- |
| `NEXT_PUBLIC_LAUNCH_MODE` | No | `oss`. **Required.** The build fails if it is missing or misspelled, because the fallback would publish the full platform site. |
| `BASEROW_DATABASE_TOKEN` | Yes | Baserow database token: create on both tables, read on Founding 500 only, no update or delete. |
| `BASEROW_WAITLIST_TABLE_ID` | No | `1211992`, the Founding 500 table. |
| `BASEROW_CONTACT_TABLE_ID` | No | `1212860`, the Contact table. |
| `FOUNDING_CAP` | No | `500` |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | The PostHog project key (`phc_...`). |
| `NEXT_PUBLIC_POSTHOG_REGION` | No | `us`, the region of the key's project. Required when the key is set: the build fails without it, because a key sent to the other region is dropped silently. |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Public by design. Errors are tagged `production` automatically. |
| `SENTRY_ORG` | No | Leave unset: an organization token (`sntrys_`) carries the org. With a personal token (`sntryu_`), set it as a GitHub Actions **variable** (not in Vercel), which the deploy workflow passes to the build. |
| `SENTRY_PROJECT` | No | Leave unset: the build defaults to `actrone-frontend`. |
| `GITHUB_TOKEN` | Yes | Optional. A fine-grained token with no permissions raises the GitHub rate limit for the star count. |

Leave `BASEROW_API_URL` unset; it exists only for a self-hosted Baserow.

Do not set these, and delete them if you copied them from a local `.env` file:

- `NEXT_PUBLIC_SANDBOX_API_KEY` and `NEXT_PUBLIC_SANDBOX_AGENT_ID`: they would ship a key in a public JavaScript file even though the sandbox page is hidden
- `NEXT_PUBLIC_ORCHESTRATOR_URL`: the OSS launch has no platform API behind it
- `NEXT_PUBLIC_SITE_URL`: it defaults to `https://actrone.com`, and previews are detected automatically
- any `NEXT_PUBLIC_FEATURE_*` flag: OSS mode decides which features exist
- any `SANITY_*` or `NEXT_PUBLIC_SANITY_*` variable: the unused CMS integration was removed from the site
- any `AIRTABLE_*` variable: the forms moved to Baserow, and nothing reads them
- `ACTRONE_API_KEY`, `QDRANT_URL`, `REDIS_URL`, `DOCKER_BUILD`: nothing in the site reads them

## 3. Connect the domain

`actrone.com` is registered at Cloudflare, so its DNS stays there; Cloudflare only answers DNS and never sees visitors' requests.

1. In the Vercel project, **Settings**, **Domains**, add `actrone.com` and make it the primary domain, then add `www.actrone.com` redirecting to it with a 308.
2. Vercel shows the DNS records to create. In Cloudflare, open `actrone.com`, **DNS**, **Records**, and create exactly those, with **Proxy status** set to **DNS only** (grey cloud). Vercel issues its own certificates and cannot while Cloudflare proxies the traffic.
3. Delete any older `A`, `AAAA` or `CNAME` record for `actrone.com` or `www` that conflicts, including anything left from the Cloudflare Worker.
4. Wait for both domains to show a valid certificate in Vercel.

The apex is the canonical host. Canonical URLs, the sitemap and the indexing check all expect `actrone.com`, and a build served only on `www` would mark every page `noindex`.

**Status (2026-09-25): live.** `actrone.com` serves the site; `www.actrone.com` and `actrone-marketing.vercel.app` redirect to it with a 308, path and query kept. The domains had first been added the other way round (apex redirecting to `www`), which left every canonical URL pointing at a redirect. Per-deployment URLs (`actrone-marketing-<hash>-apocalypse-tech.vercel.app`) cannot be removed, but Standard Protection puts them behind a Vercel login. The same domain settings from the CLI:

```
npx vercel@59.26.0 api -X PATCH /v9/projects/actrone-marketing/domains/www.actrone.com --input body.json
```

with `body.json` containing `{"redirect":"actrone.com","redirectStatusCode":308}` (and `{"redirect":null,"redirectStatusCode":null}` for the apex, changed first so the two never redirect to each other). In Git Bash, set `MSYS_NO_PATHCONV=1` first, or the API path is rewritten into a Windows path.

## 4. Rate-limit the forms in the firewall

The site's own rate limiter lives in each serverless instance's memory, so it cannot count a client spread across instances or regions. The firewall rule below is the limit that holds everywhere. Hobby allows one rate-limit rule per project, and this rule is the one to use it on.

1. In the project, open **Firewall**, select **Configure**, then **New Rule**.
2. Name it `Form submissions`.
3. Add five conditions, joined with **OR**:
   - **Server Action Name** equals the waitlist action (`joinWaitlist`, in `src/lib/waitlist/actions.ts`)
   - **Server Action Name** equals the contact action (`sendContactMessage`, in `src/lib/contact/actions.ts`)
   - **Server Action Name** equals the launch-updates action (`subscribeToLaunchUpdates`, in `src/lib/launch-updates/actions.ts`)
   - **Request Path** equals `/api/waitlist`
   - **Request Path** equals `/api/contact`

   Pick the action names from the dropdown rather than typing them: it lists the actions in the latest deployment, in the exact form the firewall matches.
4. Set **Then** to **Rate Limit**, **Fixed Window**, a 60-second window, a limit of `10` requests, keyed by **IP**, and the action **Log**.
5. Select **Save Rule**, then **Review Changes**, then **Publish**.
6. Submit one test sign-up and one contact message, and confirm both appear against the rule on the Firewall overview.
7. Edit the rule, change the action from **Log** to **Default (429)**, and publish again.

**Status (2026-09-25): configured and enforcing** (rule id `rule_form_submissions_NmZPES`). It was created from the CLI, which matches the actions with "contains" instead of picking them from the dropdown. The `subscribeToLaunchUpdates` condition was added on 2026-10-07 with `firewall rules edit` (all five conditions passed again, since `--condition` replaces the list) and published; the action and limit were unchanged. It matches once the deployment that adds the launch-updates action is live, so confirm it with one real footer subscription after that deploy. Tested: 12 invalid posts to `/api/waitlist` in Log mode logged exactly the 2 over the limit, and in enforcing mode the excess returns 429 with `X-Vercel-Mitigated: deny`. To recreate it from `frontend/` (PowerShell: run each command on one line):

```powershell
npx vercel@59.26.0 firewall rules add "Form submissions" --condition '{"type":"server_action","op":"sub","value":"joinWaitlist"}' --or --condition '{"type":"server_action","op":"sub","value":"sendContactMessage"}' --or --condition '{"type":"server_action","op":"sub","value":"subscribeToLaunchUpdates"}' --or --condition '{"type":"path","op":"eq","value":"/api/waitlist"}' --or --condition '{"type":"path","op":"eq","value":"/api/contact"}' --action rate_limit --rate-limit-algo fixed_window --rate-limit-window 60 --rate-limit-requests 10 --rate-limit-keys ip --rate-limit-action log --yes
npx vercel@59.26.0 firewall publish --yes
```

Then switch it to 429 with `firewall rules edit <rule id>`, passing all the rate-limit flags again with `--rate-limit-action rate_limit` (the flag on its own reports "No changes detected"), and publish. `firewall overview` shows the rule's hits.

Analytics (`/ingest`) and error reporting (`/monitoring`) match none of these conditions, so they are never throttled. If the site comes under attack during launch, turn on **Attack Mode** from the Firewall page; it is available on Hobby.

## 5. Retire the Cloudflare Worker

The `actrone-frontend` Worker is still connected to the repository and redeploys on every push. In Cloudflare, open **Workers & Pages**, the `actrone-frontend` Worker, **Settings**, **Build**, and disconnect the repository, or delete the Worker. Its KV namespace and D1 database can be deleted too. The Cloudflare config files stay in the repository as the documented way back.

## 6. Deploy and verify

Push to `main` (or run the workflow by hand from **Actions**), wait for **Deploy marketing site (Vercel)** to finish, then run these checks against `https://actrone.com` before announcing the launch.

```bash
SITE=https://actrone.com

# Security headers: expect DENY, frame-ancestors 'none', HSTS, nosniff
curl -sI "$SITE/" | grep -iE "x-frame-options|content-security-policy|strict-transport|x-content-type"

# OSS gate: hosted-only pages redirect home (307); the removed CMS endpoints are gone (404)
curl -s -o /dev/null -w "%{http_code}\n" "$SITE/pricing"
curl -s -o /dev/null -w "%{http_code}\n" "$SITE/api/revalidate"

# API reference pages ship with the site (200)
curl -s -o /dev/null -w "%{http_code}\n" "$SITE/reference/memory-py/index.html"
curl -s -o /dev/null -w "%{http_code}\n" "$SITE/reference/memory-ts/index.html"

# Cross-site form posts are refused (415)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$SITE/api/waitlist" -H "content-type: text/plain" -d "{}"

# The counter reads Baserow: expect "available":true. false means the token, a table id or its read permission is wrong
curl -s "$SITE/api/waitlist/count"

# Search: production allows crawling and names the sitemap
curl -s "$SITE/robots.txt"
```

Then check in a browser:

1. The top navigation's **Docs** link opens the docs. It must be a link, not a "coming soon" dialog.
2. Join the Founding 500 with a real address. The counter updates, and the row appears in Baserow's **Founding 500** table.
3. Send a contact message. It appears in the **Contact** table, and the notification email arrives.
4. Delete both test rows in Baserow, so the counter starts from real sign-ups.
5. Accept analytics in the cookie banner, browse two pages, and confirm the page views appear in PostHog.
6. Open **Deployments**, then the latest deployment's build logs, and confirm Sentry reports uploaded source maps.

Run the repository's own gates against production as well:

```bash
cd apps/marketing
npm run seo:smoke -- https://actrone.com
npm run brand:check -- https://actrone.com
```

## 7. What changed in the code for this deployment

For reviewers of the launch changes:

- **Vercel awareness**: previews are recognised from `VERCEL_ENV` and served `noindex`; Sentry tags preview errors `preview` instead of `production`.
- **Fail-closed launch mode**: a Vercel build without `NEXT_PUBLIC_LAUNCH_MODE`, or any build with a misspelled value, fails instead of publishing the full platform site.
- **Docs always on in OSS mode**: previously an unset `NEXT_PUBLIC_FEATURE_DOCS` turned every in-site docs link into a "coming soon" button.
- **API references committed**: the two OSS reference bundles are now tracked, because Vercel cannot read the sibling package repositories that used to supply them at build time.
- **Removed the unused Sanity integration**: the embedded Studio was reachable in OSS mode through an extension-suffixed URL, and its dependencies carried 7 of the 12 high-severity advisories. Your Sanity project and content are untouched; host the Studio with Sanity if you need it.
- **Forms moved from Airtable to Baserow**: Airtable's Free plan allows 1,000 API calls a month, which the counter alone exceeds. The counter is now one request whatever the list size, sign-ups are idempotent by email, and outbound calls have a timeout and bounded retries with jitter that never repeat a write Baserow may have applied.
- **Hardened forms**: JSON-only form APIs, a body cap that no request framing can bypass, a bounded per-instance limiter, and spreadsheet-formula neutralisation for stored text.
- **Pinned the Sentry tunnel** to this site's own project, so it cannot be used as an open relay.
- **Stricter framing**: `X-Frame-Options: DENY` and `frame-ancestors 'none'`.
