# OSS site services setup runbook: Baserow, PostHog and Sentry

Follow this runbook to set up the three services behind the OSS marketing site. Baserow stores Founding 500 sign-ups and contact messages, PostHog measures consented visitors, and Sentry reports errors. Each section is a numbered walkthrough, ending with a check that proves it works. The last sections cover wiring the values into the production build, the privacy policy changes these services require, a go-live checklist and troubleshooting.

**Owner**: whoever runs the launch. **Time needed**: about 2 hours the first time.

## What happens without each service

| Service | What it does on the OSS site | If you skip it |
| --- | --- | --- |
| Baserow | Stores waitlist sign-ups (homepage form and footer) and contact messages. Also supplies the live "spots claimed" counter. | The waitlist says "not available right now", the contact form asks visitors to email `hello@actrone.com` instead, and nothing is saved. The counter disappears. |
| PostHog | Page views, web performance and docs feedback, only after a visitor accepts cookies. | The site works normally, and you have no traffic data. |
| Sentry | Reports uncaught errors from the browser and the server, with readable stack traces. | The site works normally, and you learn about errors only when a visitor emails you. |

Baserow is the one you cannot skip. Both forms depend on it.

The forms used Airtable until 2026-09-21. Airtable's Free plan allows 1,000 API calls a month, which the counter alone exceeds, so the site moved to Baserow Cloud Free. The reasoning is in [`Actrone_OSS_Site_Form_Datastore_Decision.md`](Actrone_OSS_Site_Form_Datastore_Decision.md).

## State as of 2026-09-21

| Item | State |
| --- | --- |
| Baserow | **Tables done 2026-09-22**, verified through the MCP: **Founding 500** (`1211992`) and **Contact** (`1212860`) have every column the code writes, with exact names, and zero rows. `Name` is the primary field in both, and `Email` is a text field. **Token created and live-tested**: it can read Founding 500, create in both tables, and nothing else (read on Contact, update and delete all return 401). An end-to-end run through the site stored a sign-up, de-duplicated a repeat, neutralised a formula, stored a contact message and updated the counter at once; the test rows were then deleted. |
| `.env.local` | `NEXT_PUBLIC_LAUNCH_MODE`, the PostHog key and all three Baserow values are set. Sentry values are empty. Vercel still needs the same Baserow values (deployment runbook, section 2). |
| `/ingest` (PostHog proxy) | Works. PostHog's CDN answers through it, and the trailing slash on `/ingest/e/` is preserved. |
| `/monitoring` (Sentry tunnel) | Works. It forwards only to this site's own Sentry project, so it cannot be used as an open relay. |
| Marketing deploy pipeline | **Vercel.** The OSS site deploys from `actrone/actrone-frontend` with Root Directory `apps/marketing`; see [`Actrone_OSS_Site_Vercel_Deployment_Runbook.md`](Actrone_OSS_Site_Vercel_Deployment_Runbook.md). |
| Marketing Docker build | Wired for container deployments such as the hosted platform. Not used by the OSS launch. |

## Order of operations

1. [Baserow](#1-baserow), because the forms cannot work without it.
2. [PostHog](#2-posthog).
3. [Sentry](#3-sentry).
4. [Privacy policy updates](#6-update-the-privacy-and-cookie-policies). Do this before you switch analytics on for the public.
5. [Wire the values into the build](#5-wire-the-values-into-the-build), deploy, then run the [go-live checklist](#7-go-live-checklist).

Sections 1 to 3 are independent, so you can do them in parallel.

## Which values are public

Two of the variables start with `NEXT_PUBLIC_`, which puts them in the browser bundle where anyone can read them. That is correct for both.

| Value | Public? | Why | Protect it by |
| --- | --- | --- | --- |
| PostHog project API key (`phc_...`, in `NEXT_PUBLIC_POSTHOG_KEY`) | Yes, by design | It can only send events. It cannot read any data. | Never using the personal API key (`phx_...`), which grants admin access. Resetting the project key if it is abused. |
| Sentry DSN (`NEXT_PUBLIC_SENTRY_DSN`) | Yes, by design | Sentry's docs: DSNs "are safe to keep public because they only allow submission of new events and related event data; they do not allow read access to any information." | Per-key rate limits, inbound filters, IP blocking, and rotating the DSN if it is abused. |
| Baserow database token (`BASEROW_DATABASE_TOKEN`) | **No** | It can read the Founding 500 list and add rows to both tables. | Keeping it server-only: it has no `NEXT_PUBLIC_` prefix, and only server modules read it. Giving it no update or delete permission, so a leak cannot alter or erase the list. |
| `SENTRY_AUTH_TOKEN` | **No** | It can upload artifacts to your Sentry organization. | Setting it only as a build secret. |

A leaked public key lets someone send junk events into your quota. It never exposes stored data. The `/ingest` and `/monitoring` proxies keep vendor hostnames away from ad blockers. They do not hide the keys, and they don't need to.

## 1. Baserow

The column-by-column setup lives with the code, in `frontend/apps/marketing/docs/founding-500-baserow-setup.md`, because the column names are a contract with `src/lib/baserow/schema.ts`. Follow that guide for the tables and the token. This section wraps it with the plan limits, the contact notification, testing, privacy and operations.

### 1.1 The Free plan is enough

| Limit on Baserow Cloud Free | Allowance | What the site uses |
| --- | --- | --- |
| API requests | No monthly allowance; fair use, up to 10 concurrent requests | One counter read at most every 5 minutes per instance, plus two requests per sign-up and one per contact message |
| Rows | 3,000 per workspace, shared by both tables | At most 500 sign-ups, plus contact messages |
| Storage | 2 GB per workspace | Text only |
| Automation | 2,000 credits a month per workspace | One notification per contact message (1.4) |
| Data location | Germany | |

The counter costs one request per refresh however full the list is: it asks for one row and reads the total Baserow reports. A sign-up costs two: a duplicate check by email, then the write. The first paid plan is Premium at $10 per user a month, billed yearly, and nothing on the site needs it.

### 1.2 Account hygiene

The **Actrone** database already exists. Before launch, check two things in its workspace:

1. The account that owns the workspace uses a shared address such as `hello@actrone.com`, not a personal one. A database token belongs to the user who creates it, so a departing person would break the forms.
2. A second person is a workspace admin, so the sign-up list is never locked to one account.

### 1.3 Build the tables and the token

Follow sections 1 to 5 of `founding-500-baserow-setup.md`. What matters most:

- **Column names are exact**, including capitals and spaces: `Use case` and `Signed up` each contain a space. A mismatch fails every write with `ERROR_REQUEST_BODY_VALIDATION`.
- **Delete the three placeholder rows** in Founding 500. The counter counts only rows with an email, so they would not show as sign-ups, but they have no place in the list you export.
- **The token gets least privilege**: create on both tables, read on Founding 500 only, and no update or delete. Read powers the counter and the duplicate check; without it sign-ups still save, but the counter disappears and a repeat sign-up is stored twice.

Baserow's MCP server cannot create tables or columns, only rows, so this step is done in the Baserow interface.

### 1.4 Get notified about contact messages

The contact page promises a reply "within 1 business day". Baserow does not email anyone by default, so messages would sit unread. Add a workflow automation:

1. In the workspace sidebar, select **+ Add new**, then **Automation**, and name it `Contact notifications`.
2. Add the trigger **Rows are created**, with the **Actrone** database and the **Contact** table.
3. Add the action **Send an email**. It needs an SMTP integration: host, port, username and password. Use the provider that sends `actrone.com` mail. With Resend, which the privacy policy already names, that is host `smtp.resend.com`, port `465`, username `resend`, and a Resend API key limited to sending as the password.
4. Set **From email** to an address on a verified sending domain, such as `notifications@actrone.com`, and **To emails** to whoever owns replies. Build the subject and body from the trigger row's **Subject**, **Name**, **Email** and **Message**.
5. Select **Publish** in the top right. A workflow does nothing while it is a draft.
6. Send a test message through `/contact` and confirm the email arrives.

Each run spends credits from the workspace's 2,000 a month. Check the usage after the first week of launch traffic.

### 1.5 Set the environment variables

These are read by the server at runtime and are all server-only. On Vercel, set them as described in the deployment runbook's section 2, and mark the token **Sensitive**.

| Variable | Value |
| --- | --- |
| `BASEROW_DATABASE_TOKEN` | The token from 1.3 |
| `BASEROW_WAITLIST_TABLE_ID` | `1211992` |
| `BASEROW_CONTACT_TABLE_ID` | `1212860` |
| `BASEROW_API_URL` | Leave unset. Set it only for a self-hosted Baserow. |
| `FOUNDING_CAP` | `500` (the default, so optional) |

For local testing, `frontend/apps/marketing/.env.local` already has this block with the waitlist table id filled in. Add the token and the contact table id there. That file is gitignored.

### 1.6 Test it

With the values set, start the site (`npm run dev` in `frontend/apps/marketing`). Check the counter first, because it proves the token can read:

```bash
curl -s http://localhost:3000/api/waitlist/count
```

Expected: `{"available":true,"count":0,...}`. Then submit a sign-up:

```bash
curl -s -X POST http://localhost:3000/api/waitlist \
  -H 'content-type: application/json' \
  -d '{"email":"test@example.com","name":"Test","consent":true}'
```

Expected: `{"ok":true}`, a new row in **Founding 500**, and the counter reading 1. Posting the same address again also returns `{"ok":true}` and adds no second row. Then send a message through the contact form and confirm it lands in **Contact** and the notification email arrives.

**Delete every test row before launch.** The counter counts them. The site's token cannot delete, so do it in the Baserow interface.

### 1.7 Privacy and operations

- Baserow stores personal data (names, emails, free-text messages). The privacy policy names it as the form store, hosted in Germany.
- Accept Baserow's data processing agreement for the workspace and record it with the other processor agreements.
- To honor a deletion request, search both tables for the person's email and delete their rows in the Baserow interface.
- Export both tables to CSV monthly as a backup: open the table, then the view menu, then **Export view**. Stored free text has spreadsheet formulas neutralised, so the export opens safely in Excel or Google Sheets.
- Give previews and staging their own tables and token, or leave the variables unset there, so test traffic never reaches the real Founding 500 list.

## 2. PostHog

The site works with either PostHog Cloud region. The Actrone project is in **Cloud US**, so the build sets `NEXT_PUBLIC_POSTHOG_REGION=us`, and the `/ingest` proxy then sends events to `us.i.posthog.com`. A key only works against its own region, and a key sent to the other region is dropped without any error, so the build refuses a key without a region.

### 2.1 Create the account and project

1. Sign in at [us.posthog.com](https://us.posthog.com). The address bar reads `us.posthog.com` for a US project, or `eu.posthog.com` for an EU one; set `NEXT_PUBLIC_POSTHOG_REGION` to match (`us` or `eu`).
2. Turn on two-factor authentication and invite a second administrator.
3. Create an organization named `Actrone`.
4. Create a project named `Actrone site (production)`.
5. Create a second project, `Actrone site (development)`, for local and preview builds. The key is baked in at build time, so a preview build with the production key would pollute production data.

### 2.2 Copy the project API key

In the production project, open **Settings**, then **Project**, and copy the **Project API key**. It starts with `phc_`. Never copy the personal API key (`phx_`).

Set it as `NEXT_PUBLIC_POSTHOG_KEY` in the build environment, together with `NEXT_PUBLIC_POSTHOG_REGION` = `us`. See [section 5](#5-wire-the-values-into-the-build).

### 2.3 Configure the project settings

Use the settings search box if a label has moved.

1. **Web vitals autocapture**: open the autocapture settings and choose **Enable**. The site asks for web vitals, but PostHog ignores them until this switch is on.
2. **Discard client IP data**: turn it on. This drops visitors' IP addresses from events, and it matches the cookie policy's "privacy-preserving" wording. The trade-off is that you lose country-level geography.
3. **Session replay**: decide deliberately. The site always masks text typed into inputs, so the contact message and docs feedback notes are not recorded. Recording still captures page content and clicks. If you turn on **Record user sessions**, set a sampling rate (for example 20%) and tell visitors in the [privacy policy](#6-update-the-privacy-and-cookie-policies). If you leave it off, nothing else changes.
4. **Exception autocapture**: leave it off. Sentry reports errors, and the site sets `capture_exceptions: false`.
5. **Filter out internal and test users**: add a filter for localhost so your own testing does not count.
6. **Data processing addendum**: PostHog Cloud US stores data in the United States, and PostHog acts as your data processor. Sign its addendum, described in [PostHog's GDPR guide](https://posthog.com/docs/privacy/gdpr-compliance). For visitors in the EU and UK that is an international transfer; the privacy policy's section on international transfers covers it with Standard Contractual Clauses, which PostHog's addendum includes.

### 2.4 What the site sends

PostHog loads only after a visitor selects **Accept all** in the cookie banner. A visitor who declines, or never answers, downloads no analytics code. The site sends:

| Event | When | Properties |
| --- | --- | --- |
| `$pageview` and `$pageleave` | Each navigation | Standard page properties |
| `$web_vitals` | Page load | Core Web Vitals |
| `$autocapture` | Clicks and form submissions | Element details, never input values |
| `docs_feedback` | A vote on "Was this helpful?" | `path`, `helpful` |
| `docs_feedback_note` | A written note after a "no" vote | `path`, `helpful`, `note` |

The `note` is free text that visitors type, so treat it as personal data.

PostHog's default `person_profiles` is `identified_only`, and the site never identifies visitors, so no person profiles are created. Visitors stay anonymous.

The site records no event for waitlist or contact submissions, because those are handled on the server and stored in Baserow. Use the Founding 500 row count as your sign-up number.

### 2.5 Create the insights

In the production project, create one dashboard called `OSS launch` with:

1. **Traffic**: unique visitors by day, with page views by path.
2. **Docs funnel**: `$pageview` on `/`, then on `/docs/getting-started/quickstart`, then on `/docs/memory/integrations`.
3. **Web vitals**: LCP, INP and CLS at the 75th percentile, by path. Targets: LCP under 2.5 s, INP under 200 ms, CLS under 0.1.
4. **Docs feedback**: `docs_feedback` broken down by `helpful` and `path`.

### 2.6 Test it

1. Open your production or preview site in a private window with the network tab open.
2. Before touching the cookie banner, confirm there are **no** requests to `/ingest`.
3. Choose **Accept all**. Requests to `/ingest/` should start and return 200.
4. In PostHog, open **Activity**, then **Live events**. A `$pageview` should arrive within a minute.
5. Choose **Decline** in a second private window and confirm no `/ingest` request ever appears.

## 3. Sentry

### 3.1 Create the account, organization and project

1. Sign up at [sentry.io/signup](https://sentry.io/signup). When asked where to store data, choose the **EU** region if GDPR matters to you. You cannot change it later.
2. Create the organization, or use one you already have. The build does not need its slug: the organization token in section 3.3 carries it. Set `SENTRY_ORG` only if you upload with a personal token instead.
3. Turn on two-factor authentication and invite a second owner.
4. Create a project: platform **Next.js**, name and slug `actrone-frontend`. The build config defaults to this project slug (`SENTRY_PROJECT`). If you choose another slug, set `SENTRY_PROJECT` to match.
5. Skip the setup wizard's code changes. The site is already instrumented. Copy the **DSN** it shows. It looks like `https://key@o123.ingest.de.sentry.io/456`.

Set it as `NEXT_PUBLIC_SENTRY_DSN` in the build environment.

### 3.2 Set the environment name

On Cloudflare Workers Builds and on Vercel, errors are tagged `production` or `preview` automatically: a build of `main` is production and any other branch is a preview (`src/lib/deployment.ts`). Leave `NEXT_PUBLIC_SENTRY_ENVIRONMENT` unset there. Only a build no host identifies (Docker, a laptop) needs it: every build runs with `NODE_ENV=production`, so set it to `production` for the live build and `staging` for a test build, so events are separated in Sentry.

### 3.3 Create the source map token

Source maps turn minified stack traces into readable ones. The build uploads them, and then deletes them so they are never served to visitors.

1. In Sentry, open **Settings**, **Developer Settings**, **Organization Tokens**, and choose **Create New Token**.
2. Name it `github-actions-marketing-sourcemaps`. Organization tokens have one fixed scope (`org:ci`: source map upload and release creation), so there are no permissions to choose, and the token also tells the build which organization to upload to.
3. Copy the token. Store it as a build secret named `SENTRY_AUTH_TOKEN`. **Never** put it in a `NEXT_PUBLIC_` variable, in an image, or in the repo.

### 3.4 Configure the project

1. **Inbound Filters** (**Project Settings**): turn on the filters for browser extensions, legacy browsers, localhost and web crawlers. Filtered events do not use your quota.
2. **Client Keys (DSN)**: choose **Configure** on the key and set a rate limit (for example 60 events a minute). This is your protection if the public DSN is ever abused.
3. **IP addresses**: in the organization's security and privacy settings, turn on the setting that prevents storing IP addresses.
4. **Alerts**: confirm the project has an issue alert that emails the team when a **new issue** appears. Sentry creates a default rule, and you should check that it points at a real inbox.
5. **Quota**: open **Settings**, **Subscription** and check the error and performance quotas. The site samples 10% of transactions to protect them.

### 3.5 How the site uses Sentry

- The server side loads through `instrumentation.ts`, and Next reports every unhandled request error to Sentry, except on Cloudflare Workers. There the server side stays off: with Sentry's Node.js SDK running, a request for an unknown `/og/<name>.png` hung until Cloudflare cancelled it, where the same build without it answered 404 (tested 2026-09-24). On Workers, server errors appear in the Worker's **Observability** tab, with stack traces, and browser errors still reach Sentry.
- The browser side loads lazily from `instrumentation-client.ts`, only when a DSN exists, so it never delays the first render.
- Browser reports go to `/monitoring` on your own domain, which forwards them to Sentry. Ad blockers do not drop them.
- Sentry is off in `next dev`, and off when the DSN is empty.
- Every event passes through a scrubber that removes tokens, emails and other personal data before it leaves the process.
- Error reporting runs on legitimate interest, not consent. A visitor who declines analytics cookies still generates error reports. The privacy policy says so.

### 3.6 Test it

1. Deploy a build with `NEXT_PUBLIC_SENTRY_DSN` set. Open the live site in a normal window.
2. In the network tab, confirm the site loads a separate Sentry chunk after page load.
3. Open the browser console and run:

   ```js
   setTimeout(() => { throw new Error('sentry-test-from-console') })
   ```

4. In the network tab, a `POST` to `/monitoring?o=...&p=...` should return 200.
5. In Sentry, open **Issues**. The `sentry-test-from-console` error should appear within a minute, with the environment you expect.
6. Resolve or delete that test issue.
7. After a build that had `SENTRY_AUTH_TOKEN`, open **Releases** and confirm the release has uploaded artifacts. Then confirm the maps are not public: `curl -sI https://actrone.com/_next/static/chunks/<any chunk>.js.map` should return 404.

The site has no built-in route that throws a server error, so this test covers the browser path. On Cloudflare Workers, server errors go to the Worker's **Observability** tab instead of Sentry (see 3.5).

## 4. Environment variable reference

| Variable | Set at | Secret? | Value for the OSS site |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_LAUNCH_MODE` | Build | No | `oss`. A Vercel build fails without it, and any build fails on a misspelled value. |
| `NEXT_PUBLIC_SITE_URL` | Build | No | Leave unset. Production defaults to `https://actrone.com`, and Vercel previews are detected automatically. |
| `NEXT_PUBLIC_POSTHOG_KEY` | Build | No | The `phc_...` key from 2.2 |
| `NEXT_PUBLIC_POSTHOG_REGION` | Build | No | `us`, the region of the key's project. Required when the key is set. |
| `NEXT_PUBLIC_SENTRY_DSN` | Build | No | The DSN from 3.1 |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Build | No | Leave unset on Vercel. Elsewhere, `production` or `staging`. |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Build | No | Leave both unset: the organization token carries the org, and the project defaults to `actrone-frontend` |
| `SENTRY_AUTH_TOKEN` | Build | **Yes** | The token from 3.3, as a build secret |
| `BASEROW_DATABASE_TOKEN` | Runtime | **Yes** | The token from 1.3 |
| `BASEROW_WAITLIST_TABLE_ID` | Runtime | No | `1211992` |
| `BASEROW_CONTACT_TABLE_ID` | Runtime | No | `1212860` |
| `BASEROW_API_URL` | Runtime | No | Leave unset for Baserow Cloud |
| `FOUNDING_CAP` | Runtime | No | `500` (the default) |

**Build-time** variables are baked into the JavaScript when the site is built. Changing one means rebuilding and redeploying. **Runtime** variables are read by the server; on Vercel a change to them also takes effect only after a redeploy.

An empty value counts as unset for the site URL and the Sentry environment, so an empty Docker build argument is safe.

## 5. Wire the values into the build

> **The OSS site deploys on Vercel.** Enter these values as Vercel environment variables by following
> [`Actrone_OSS_Site_Vercel_Deployment_Runbook.md`](Actrone_OSS_Site_Vercel_Deployment_Runbook.md), which also
> covers the domain, the firewall rate limit and the go-live checks. The Docker path below applies only to container
> deployments such as the hosted platform.

**This section is already applied.** `apps/marketing/Dockerfile` declares every build argument below, and `frontend/.dockerignore` keeps a developer's `.env.local` out of a container build, so it can never be inlined into a production bundle. It is kept as a record of what changed and why.

Next inlines every `NEXT_PUBLIC_*` value into the JavaScript at build time, so a value missing during the build is missing from the deployed site. Before this change the Dockerfile declared only `NEXT_PUBLIC_ORCHESTRATOR_URL`, so a container build produced the **full platform site** with no PostHog, no Sentry and no source maps, whatever the deploy environment said.

### 5.1 Docker builds

The build stage of `frontend/apps/marketing/Dockerfile` reads:

```dockerfile
# Build-time public env. These are inlined into the JavaScript, so they must be present here.
ARG NEXT_PUBLIC_ORCHESTRATOR_URL=http://localhost:8080
ARG NEXT_PUBLIC_LAUNCH_MODE=full
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ARG SENTRY_ORG
ARG SENTRY_PROJECT=actrone-frontend
ARG SENTRY_RELEASE
ENV NEXT_PUBLIC_ORCHESTRATOR_URL=${NEXT_PUBLIC_ORCHESTRATOR_URL} \
    NEXT_PUBLIC_LAUNCH_MODE=${NEXT_PUBLIC_LAUNCH_MODE} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT} \
    SENTRY_RELEASE=${SENTRY_RELEASE}

COPY packages/ui ./packages/ui
COPY apps/marketing ./apps/marketing

ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_BUILD=1
# The Sentry token is a BuildKit secret, so it never lands in an image layer or `docker history`.
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    npm run build --workspace apps/marketing
```

Verified behaviour of that block, checked with a throwaway image and a production build:

- Passing the arguments puts `oss`, the PostHog key and the Sentry DSN into the build environment, and each one ends up inlined in a client chunk.
- Passing none of them yields `full` mode with empty values, which the code treats as switched off.
- The Sentry token is readable during the build but does **not** appear in `docker history`.
- Omitting the secret does not fail the build, so local builds work without a Sentry token.
- No `.map` files are served from `.next/static`, so source maps never reach the public.
- An unset argument arrives as an **empty string**, not as undefined. `SITE_URL` and the Sentry environment therefore treat empty as unset (`||`, not `??`); with `??` an empty `NEXT_PUBLIC_SITE_URL` reached `new URL('')` and crashed the build.

Build the production image with:

```bash
docker build -f apps/marketing/Dockerfile \
  --build-arg NEXT_PUBLIC_LAUNCH_MODE=oss \
  --build-arg NEXT_PUBLIC_POSTHOG_KEY=your_posthog_project_key_here \
  --build-arg NEXT_PUBLIC_POSTHOG_REGION=us \
  --build-arg NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn_here \
  --secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
  -t actrone-marketing:oss .
```

Run it with the runtime values:

```bash
docker run -p 3000:3000 \
  -e BASEROW_DATABASE_TOKEN=your_baserow_database_token_here \
  -e BASEROW_WAITLIST_TABLE_ID=1211992 \
  -e BASEROW_CONTACT_TABLE_ID=your_contact_table_id_here \
  actrone-marketing:oss
```

`NEXT_PUBLIC_ORCHESTRATOR_URL` defaults to `http://localhost:8080`, so in a container each contact submission also tries that address and logs a harmless `contact.orchestrator.exception`. The message is still saved in Baserow. Set the argument to a real backend URL when one exists.

### 5.2 Other hosts

Set the build-time variables from section 4 in the host's **build** environment, and the runtime variables in its **runtime** environment. On Vercel that is **Project settings**, **Environment Variables**, followed by a redeploy; the deployment runbook lists which environments each one belongs to.

## 6. Update the privacy and cookie policies

Do this before you switch analytics on. These findings come from the current text of `legal/privacy` and `legal/cookies`. They are facts to fix, not legal advice, so have counsel review the final wording.

**Status on 2026-09-21.** Items 1, 3 and 4 are done in the policy text, and the legal pages name Apocalypse Technologies as the company and data controller. The privacy policy lists Vercel, Baserow (hosted in Germany), PostHog and Sentry, and adds waitlist sign-ups to the data collected. The cookie policy names PostHog, describes its identifier, page views and masked session replay, and lists what the site itself stores. Item 5 is covered by the existing legitimate-interest basis for security and abuse detection. Still open, and yours to decide: a retention period for waitlist and contact data (item 2), signing the processor agreements (item 6), the registered entity suffix and address, and counsel review.

1. **Name the processors.** Done: **Baserow** (waitlist and contact submissions), **PostHog** (analytics, US region), **Sentry** (error monitoring) and **Cloudflare** (hosting). If the contact notification in 1.4 sends through Resend, Resend is already named.
2. **Describe what is stored.** Waitlist sign-ups and contact messages: name, email, company, use case, message text and a consent record. State how long you keep them and how to request deletion.
3. **Fix the analytics claim.** Done. The cookie policy describes the anonymous identifier, page views, clicks and optional masked session replay.
4. **Remove hosted-platform text that does not apply.** Done.
5. **State the Sentry basis.** Error reporting continues after a visitor declines analytics cookies, because it runs on legitimate interest.
6. **Sign the data processing agreements** with Baserow, PostHog and Sentry, and record each one. Baserow and PostHog both store this site's data in Germany; record the transfer mechanism for any processor that stores it outside the EU.

## 7. Go-live checklist

Run this against the production origin after deploying.

| Check | How | Expected |
| --- | --- | --- |
| OSS mode is on | Open `/pricing` | Redirects to `/` |
| Counter reads Baserow | `curl -s https://actrone.com/api/waitlist/count` | `"available":true` |
| Waitlist works | Submit the homepage form with a real address | Success message, and a row in `Founding 500` |
| Contact works | Submit the contact form | Success message, a row in `Contact`, and the notification email arrives |
| Counter updates | Reload the homepage after a sign-up | "N of 500 spots claimed" |
| No analytics before consent | Private window, network tab, no clicks | No `/ingest` requests |
| Analytics after consent | Select **Accept all** | `/ingest/` requests return 200, and a live event appears in PostHog |
| Sentry receives errors | The console test in 3.6 | The issue appears in Sentry |
| Source maps are private | `curl -sI` on a `.js.map` URL | 404 |
| SEO gate | `npm run seo:smoke -- https://actrone.com` | `SEO smoke passed` |
| Brand gate | `npm run brand:check -- https://actrone.com` | `brand check passed` |
| Test data removed | Open both Baserow tables | No test or placeholder rows |

## 8. Ongoing operations

- **Weekly, first month**: read new Sentry issues, check the Baserow workspace's row count against the 3,000-row limit and its automation credits against the 2,000 a month, and review the PostHog dashboard.
- **Monthly**: export both Baserow tables to CSV, review PostHog and Sentry quotas, and confirm the contact notification still runs.
- **On suspected exposure**: regenerate the Baserow database token, update `BASEROW_DATABASE_TOKEN` and redeploy; reset the PostHog project key; or rotate the Sentry DSN. The two public keys are baked into the build, so redeploy after changing them too.
- **On a deletion request**: delete the person's rows in both Baserow tables, then delete their data in PostHog if they accepted analytics.

## 9. Troubleshooting

Every Baserow failure is logged as one JSON line with `failure` (`rejected`, or `unavailable` after bounded retries), the HTTP `status` and Baserow's error `code`. The token never appears in logs.

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| The waitlist says "not available right now", or the contact form says "could not be sent right now" | `BASEROW_DATABASE_TOKEN` is missing, or a table id is missing or not a number. The log shows `waitlist.baserow.unconfigured` or `contact.baserow.unconfigured`. | Set the variables in the runtime environment and redeploy. |
| The waitlist says "could not be saved", or the contact form says "could not be sent right now" | Baserow refused the write. The log shows `waitlist.baserow.write_failed` or `contact.baserow.write_failed`. | By `code`: `ERROR_TOKEN_DOES_NOT_EXIST` means the token is mistyped or was regenerated; `ERROR_NO_PERMISSION_TO_TABLE` means it lacks create on that table; `ERROR_TABLE_DOES_NOT_EXIST` means a wrong table id; `ERROR_REQUEST_BODY_VALIDATION` means a column name or type does not match the setup guide. `failure: unavailable` means Baserow was busy or down; try again. |
| The log shows `contact.both_channels_failed` | The Baserow write failed and there is no platform backend to fall back to. | Fix the Baserow cause from the rows above. The visitor was asked to email `hello@actrone.com` directly, so nothing was silently lost; check that inbox. |
| Counter never appears | The log shows `founding.baserow.count_failed`. Usually the token lacks read on Founding 500. | Grant read on Founding 500 to the token. |
| The same address appears twice in Founding 500 | The duplicate check could not read the table, and the sign-up was written anyway rather than lost. The log shows `waitlist.baserow.dedupe_failed`. | Grant read on Founding 500, then delete the duplicate row. |
| Counter lags after a sign-up | Cache lifetime. Only the instance that took the sign-up refreshes at once. | Expected. Other instances catch up within 5 minutes. |
| No contact notification email | The workflow is still a draft, or its SMTP details are wrong. | Open the automation, check the SMTP integration, and select **Publish**. |
| No events in PostHog | The key was empty at build time, the visitor has not accepted cookies, an ad blocker interferes, or `NEXT_PUBLIC_POSTHOG_REGION` does not match the key's project. | Check the network tab for `/ingest/`. Rebuild with the key set. Confirm the region matches the address bar of the project the key came from (`us.posthog.com` means `us`). |
| PostHog has page views but no web vitals | Web vitals autocapture is off in project settings. | Enable it (2.3, step 1). |
| No events in Sentry | The DSN was empty at build time, or the events are filtered as localhost or extensions. | Rebuild with the DSN. Check **Stats** for filtered events. |
| Sentry stack traces are minified | `SENTRY_AUTH_TOKEN` was missing at build, or the org or project slug does not match. | Rebuild with the secret, and check the build output for upload lines. |
| Build fails with a launch mode error | `NEXT_PUBLIC_LAUNCH_MODE` is missing or misspelled. This is deliberate: the fallback would publish the full platform site. | Set it to `oss` and redeploy. |

## References

- [PostHog: is it OK to expose the project API key](https://posthog.com/questions/is-it-ok-to-expose-the-posthog-project-api-key-to-the-public)
- [PostHog GDPR compliance](https://posthog.com/docs/privacy/gdpr-compliance)
- [PostHog web vitals](https://posthog.com/docs/web-analytics/web-vitals)
- [Sentry DSN explainer](https://docs.sentry.io/concepts/key-terms/dsn-explainer/)
- [Sentry auth tokens](https://docs.sentry.io/account/auth-tokens/)
- [Sentry inbound filters](https://docs.sentry.io/concepts/data-management/filtering/)
- [Baserow pricing](https://baserow.io/pricing)
- [Baserow workflow automation](https://baserow.io/user-docs/workflow-automation), [triggers](https://baserow.io/user-docs/automation-triggers) and [actions](https://baserow.io/user-docs/automation-actions)
- Code: `src/lib/baserow/`, `src/lib/waitlist/signup.ts`, `src/lib/contact/submit.ts`, `src/lib/founding.ts`, `src/lib/analytics/analytics.ts`, `src/lib/observability/`, `src/instrumentation.ts`, `src/instrumentation-client.ts` and `next.config.ts`, all under `frontend/apps/marketing`. Table setup: `docs/founding-500-baserow-setup.md` in the same app.
