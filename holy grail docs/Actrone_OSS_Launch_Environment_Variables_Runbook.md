# OSS launch: environment variables and the GitHub star count

This runbook says where every value for the OSS launch goes, which variables to set, and how to get the GitHub star count showing on the site.

The short answer: set the site's variables in its **Vercel project**. The three packages publish through trusted publishing, so no registry token exists anywhere. GitHub holds secrets for one purpose only: the site's deploy workflow (`VERCEL_TOKEN` and friends, section 2).

The one crossover is the star count. Its optional token is created on GitHub but stored in Vercel.

**Shells.** Every command runs in Windows PowerShell 5.1. It uses `curl.exe`, which ships with Windows 10 and later; in PowerShell 5.1, plain `curl` is an alias for a different command.

Companion runbooks, in this folder:

- `Actrone_OSS_Site_Vercel_Deployment_Runbook.md`: creating the Vercel project, the GitHub Actions deploy, the domain, the firewall rule and the go-live checks
- `Actrone_OSS_Site_Services_Setup_Runbook.md`: getting the Baserow, PostHog and Sentry values used below
- `Actrone_OSS_Package_Publishing_Runbook.md`: publishing `actrone-memory` to PyPI and npm

## Where everything goes

Only the site has values to set. Everything else is a setting, or nothing at all:

| What | Where you set values | Secrets |
| --- | --- | --- |
| OSS site (`actrone.com`, `apps/marketing`) | Vercel: the project's **Settings**, **Environment Variables** (section 1) | `BASEROW_DATABASE_TOKEN`, `GITHUB_TOKEN` |
| Site deploy (`actrone/actrone-frontend`) | GitHub: **Settings**, **Secrets and variables**, **Actions** | `VERCEL_TOKEN`, `SENTRY_AUTH_TOKEN` (plus the non-secret `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) |
| `actrone-memory` on PyPI | Nothing to set. A `pypi` environment on GitHub and a trusted publisher on PyPI | None |
| `actrone-memory` on npm | Nothing to set. An `npm` environment on GitHub and a trusted publisher on npm | None |
| `create-actrone-app` on npm | Nothing to set. An `npm` environment on GitHub and a trusted publisher on npm | None |
| Frontend CI (`actrone/actrone-frontend`) | Nothing to set | None |
| Demo CI (`actrone/actrone-memory-demo`) | Nothing to set | None |

## 1. Vercel: the site's variables

The site deploys from GitHub Actions: the workflow reads the project's Production variables with `vercel pull`, builds, and uploads the result. Secret-type values cannot be pulled into that build, so the one secret the build needs, `SENTRY_AUTH_TOKEN`, is a GitHub Actions secret instead (section 2). Every other value lives in Vercel.

### Variables to set

The full table, with each value and note, is section 2 of `Actrone_OSS_Site_Vercel_Deployment_Runbook.md`. In short, all for **Production**:

| Variable | Type |
| --- | --- |
| `NEXT_PUBLIC_LAUNCH_MODE` = `oss` (**required**) | Config |
| `BASEROW_DATABASE_TOKEN` | Secret |
| `BASEROW_WAITLIST_TABLE_ID` = `1211992`, `BASEROW_CONTACT_TABLE_ID` = `1212860`, `FOUNDING_CAP` = `500` | Config |
| `NEXT_PUBLIC_POSTHOG_KEY` | Config |
| `NEXT_PUBLIC_POSTHOG_REGION` = `us` (required with the key) | Config |
| `NEXT_PUBLIC_SENTRY_DSN` (`SENTRY_ORG` and `SENTRY_PROJECT` stay unset: the token carries the org, the project defaults to `actrone-frontend`) | Config |
| `GITHUB_TOKEN` (optional, [section 3](#3-the-github-star-count-step-by-step)) | Secret |

A secret can be replaced but never read back, not even by you. Local development reads `apps/marketing/.env.local` instead.

### Variables to leave out

Delete any of these if they came across from a local `.env` file:

- `NEXT_PUBLIC_SANDBOX_API_KEY`, `NEXT_PUBLIC_SANDBOX_AGENT_ID`: they would ship a key in a public JavaScript file
- `NEXT_PUBLIC_ORCHESTRATOR_URL`: the OSS launch has no platform API behind it
- `NEXT_PUBLIC_SITE_URL`: it defaults to `https://actrone.com`
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT`: the environment comes from the build automatically
- `NEXT_PUBLIC_FEATURE_*`: OSS mode decides which features exist
- `BASEROW_API_URL`: only for a self-hosted Baserow
- `SANITY_*`, `NEXT_PUBLIC_SANITY_*`, `AIRTABLE_*`: those integrations were removed
- `ACTRONE_API_KEY`, `QDRANT_URL`, `REDIS_URL`, `DOCKER_BUILD`: nothing in the site reads them

### How to add a variable

1. In the Vercel dashboard, open the project, then **Settings**, then **Environment Variables**.
2. Enter the name and value exactly as in the table, choose **Secret** or **Config**, tick **Production** only, and **Save**.
3. When all of them are in, redeploy: open **Actions** in `actrone/actrone-frontend`, **Deploy marketing site (Vercel)**, **Run workflow**. Variables apply only to new deployments.

Then check that the site can read Baserow (expect `"available":true`):

```powershell
curl.exe -s https://actrone.com/api/waitlist/count
```

`"available":false` means the token, a table id or the token's read permission is wrong.

## 2. GitHub: settings, plus the site deploy's secrets

The package repositories hold no secrets: do not add `NPM_TOKEN`, `PYPI_TOKEN` or any other repository secret there. The publish workflows prove their identity to PyPI and npm with short-lived OpenID Connect (OIDC) credentials. A stored token would never be used, and it would add one more credential that could leak.

### The three package repositories

`actrone/actrone-memory-py`, `actrone/actrone-memory-ts` and `actrone/create-actrone-app`:

1. Make each repository **public**. Trusted publishing with provenance requires it, and the star count reads the two memory repositories.
2. Open **Settings**, **Environments**, **New environment**, and add yourself as a required reviewer. Name it `pypi` in `actrone-memory-py`, and `npm` in `actrone-memory-ts` and `create-actrone-app`. Every publish then waits for your approval.
3. In each repository, open **Settings**, then under **Security and quality** open **Advanced Security**, and enable **Secret Protection** and then **Push protection**. Push protection stops a commit containing a token before it reaches GitHub.

`actrone-memory` is covered step by step in `Actrone_OSS_Package_Publishing_Runbook.md`. `create-actrone-app` is not in that runbook but follows the same npm steps, section 3, with these values:

| Step | Value for `create-actrone-app` |
| --- | --- |
| Placeholder name (step 3.4) | `create-actrone-app` |
| Deprecation message (step 3.5) | `npm deprecate create-actrone-app@0.0.0 "Placeholder. Use 0.1.0 or later."` |
| Trusted publisher repository (step 3.7) | `create-actrone-app` |
| Workflow filename | `publish.yml` |
| Environment | `npm` (must match `environment: npm` in `publish.yml`) |
| Allowed actions | Enable **direct `npm publish`**; the workflow runs `npm publish --provenance` |
| Release tag | `v0.1.0`, pushed from the repository root on a commit whose CI passed |

### The site and demo repositories

- **`actrone/actrone-frontend`**: the deploy workflow needs the repository secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and, for source maps, `SENTRY_AUTH_TOKEN` (Vercel runbook, section 1). They are only read by the deploy job, which runs after CI passes on `main`, never for pull requests. Leave the `E2E_API_URL` variable unset: the end-to-end job needs the hosted platform and is skipped without it. The `INFRA_DISPATCH_TOKEN` and `INFRA_REPO` values belong to the super-admin deploy, which is not part of this launch.
- **`actrone/actrone-memory-demo`**: CI starts its own Redis and Qdrant and needs nothing.

### The libraries' own variables

You set none of these. `actrone-memory` reads `ACTRONE_*` variables (and, for the OpenAI embedder, `OPENAI_API_KEY`) in the applications of the people who install it, as described in the [memory configuration docs](https://actrone.com/docs/memory/configuration). Do not put them in Vercel: the site does not run the library.

## 3. The GitHub star count, step by step

The navigation button, the announcement bar and the docs header show the combined stars of `actrone-memory-py` and `actrone-memory-ts`. They read it from the site's own route, `/api/github/stars`, which asks GitHub and refreshes at most once an hour. Until the count is above zero, or whenever GitHub cannot be reached, the button reads "GitHub" with no number, so the site never shows "0 stars".

### Step 1: make both memory repositories public

While they are private, GitHub answers 404 and the site shows no number. Check each one signed out (expect `200`):

```powershell
curl.exe -s -I https://github.com/actrone/actrone-memory-py
curl.exe -s -I https://github.com/actrone/actrone-memory-ts
```

The first line of each answer is the status.

### Step 2: create a read-only GitHub token

The site works without a token, but then it shares GitHub's anonymous limit of 60 requests an hour per IP address, and Vercel's servers share addresses with other customers. When someone else uses up that limit, your count disappears until the next hourly refresh. A token raises the limit to 5,000 requests an hour, and those requests are yours alone.

1. On github.com, select your profile picture, then **Settings**.
2. At the bottom of the sidebar, select **Developer settings**, then **Personal access tokens**, then **Fine-grained tokens**, then **Generate new token**.
3. **Token name**: `actrone-site-star-count`. **Description**: `Read-only star count for actrone.com`.
4. **Resource owner**: your own account.
5. **Expiration**: one year, or the longest your organization allows. Put the expiry date in your calendar now (see step 6).
6. **Repository access**: **Public repositories**. Add no permissions. Every fine-grained token can already read public repositories, and that is all the site needs.
7. Select **Generate token** and copy it. GitHub shows it only once.

Optionally, confirm the token works before you store it. Pasting it at a prompt keeps it out of your PowerShell history:

```powershell
$token = Read-Host "Paste the token"
curl.exe -s -H "Authorization: Bearer $token" https://api.github.com/rate_limit
Remove-Variable token
```

Under `"core"`, `"limit": 5000` means the token works. `"limit": 60` means GitHub ignored it; an error message means it is wrong.

### Step 3: store it in Vercel

Add `GITHUB_TOKEN` as in [section 1](#how-to-add-a-variable), with the type **Secret**, for **Production**, and the token as the value.

### Step 4: redeploy after the repositories are public

The star route is generated during the build and then refreshed hourly. A deployment built while the repositories were still private starts with no count and only picks it up at the first hourly refresh. So once both repositories are public and the token is stored, run the deploy workflow by hand (section 1).

### Step 5: check it

```powershell
curl.exe -s https://actrone.com/api/github/stars
```

The answer looks like `{"stars":12,"repos":{"py":9,"ts":3}}`. All zeros means GitHub could not be read: go back to steps 1 and 4.

Then open the site in a browser. From the first star, the navigation button shows a star and the number. On wider screens the announcement bar also reads "Star the project · 12", and the docs header shows the same number. Each browser tab keeps the number it first saw, so open a new tab to see a newer count.

### Step 6: renew the token before it expires

An expired or revoked token is worse than none: GitHub rejects every request that carries it, so the count disappears. Before the expiry date:

1. Create a new token with the same settings (step 2).
2. In Vercel, open `GITHUB_TOKEN`, select **Edit**, paste the new value, save, and redeploy.
3. Check the site (step 5), then delete the old token on GitHub under **Fine-grained tokens**.

If you would rather not manage a token, delete `GITHUB_TOKEN` from Vercel and redeploy; the site then uses the anonymous limit. GitHub also deletes tokens that go unused for a year.

### If the count does not show

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No number anywhere, and `/api/github/stars` returns zeros | A repository is still private, or the deployment predates going public | Check step 1, then rebuild (step 4) |
| No number, but both repositories are public and starred | `GITHUB_TOKEN` expired, was revoked or was mistyped | Replace it (step 6), or delete it |
| The number is behind GitHub's | The route refreshes hourly, and each tab keeps the number it first saw | Wait for the refresh, then open a new tab |
| The number shows on some pages and not others | A deployment older than 2026-09-22, when three parts of the site kept the count in conflicting formats | Deploy the current code |
