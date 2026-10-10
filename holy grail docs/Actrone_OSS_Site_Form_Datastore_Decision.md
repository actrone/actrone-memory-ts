# Actrone OSS site: replacing Airtable for the waitlist and contact forms

Status: **decided and implemented on 2026-09-21. The forms and the counter run on Baserow Cloud Free.**
Scope: the two forms on the OSS marketing site (Founding 500 waitlist, contact) and the live signup
counter shown on the site.
Companion docs: `Actrone_OSS_Site_Services_Setup_Runbook.md` (account, notification and operations),
`frontend/apps/marketing/docs/founding-500-baserow-setup.md` (tables and database token).

## Outcome

Baserow was chosen over Neon for the reason given in section 4: the forms keep working the way they
did, with a grid to read and export the list and a built-in automation to announce contact messages.
What shipped, all in `frontend/apps/marketing`:

- `src/lib/baserow/client.ts`: a server-only client with an 8 second timeout and up to 3 attempts with
  exponential backoff and full jitter. Reads retry on network errors and on 429, 502, 503 and 504;
  writes retry only on 429 and 503, where Baserow has not applied the row, so a retry can never store
  a sign-up twice. Errors carry Baserow's code and never the token.
- `src/lib/baserow/schema.ts`: the one copy of the column names the code writes.
- The waitlist is **idempotent by email**: a sign-up first checks for the address and writes nothing
  if it is already listed. Addresses are lower-cased, so capitalisation cannot create a duplicate.
- The counter is **one request of one row** with an `Email is not empty` filter, reading Baserow's
  `count`. Placeholder or note rows typed into the table by hand never count as sign-ups. It refreshes
  at most every 5 minutes, and immediately after a sign-up on the instance that took it.
- Environment: `BASEROW_DATABASE_TOKEN`, `BASEROW_WAITLIST_TABLE_ID` (`1211992`),
  `BASEROW_CONTACT_TABLE_ID`, and `BASEROW_API_URL` only for a self-hosted Baserow. All server-only.
- The privacy policy names Baserow, hosted in Germany, as the form store.

Sections 1 to 6 below are the analysis as written before the decision. Where section 5 names
different variables or a 15 minute counter interval, the list above is what shipped.

---

## 1. Why Airtable has to go

Airtable's Free plan allows **1,000 API calls per workspace per month**, shared across every base in
that workspace. That is a hard ceiling, not a throttle: once it is reached, calls are rejected until
the month rolls over.

The site's read path is the problem. Airtable has no count endpoint, so `getFoundingCount()` pages
through the waitlist table to count rows. Each refresh costs one call per 100 rows.

| Counter refresh interval | Refreshes per month | Calls per month, empty table | Calls per month, 500 rows |
| --- | --- | --- | --- |
| 60 seconds (original) | 43,200 | 43,200 | 216,000 |
| 15 minutes (current) | 2,880 | 2,880 | 14,400 |

Those figures are **per running instance**, and they exclude writes. Shortening the refresh interval
to 15 minutes cut the bill by 15x, which is why that change was made, but it does not rescue the Free
plan: the floor is still 2,880 calls against a 1,000 call allowance. Airtable Free dies in roughly the
first ten days of every month, and when it does, **sign-up writes fail too**, because the quota is
shared. The form breaks, not just the counter.

The cheapest Airtable plan that clears this is Team at roughly $20 per seat per month, which buys
100,000 calls. Paying a per-seat subscription to hold at most 500 email addresses for a launch is the
wrong shape of cost.

---

## 2. What the site actually needs

Derived from the three server functions that exist today. Any replacement has to satisfy all of these.

1. **Append a row** from a Server Action and from a JSON API route (`submitWaitlistSignup`,
   `submitContactMessage`).
2. **Count rows cheaply**, on a schedule, for the live counter (`getFoundingCount`).
3. **No monthly call ceiling** that a cached read path can exhaust.
4. **Free at this scale**, and honest about what happens past it. The waitlist is capped at 500 rows;
   contact volume at launch is low.
5. **EU data location**, because the privacy policy commits to it and the rows are personal data
   (name, email, company, message).
6. **A way for a human to read and export the rows.** The Founding 500 list gets emailed at launch.
7. **A way to notice a contact message** without watching a dashboard.
8. **An exit.** Whatever holds user PII must be exportable and, ideally, self-hostable.

Requirements 6 and 7 are the ones a raw database does not answer by itself. That is the real
trade-off below, not price.

---

## 3. Shortlist

| | Airtable Free | **Baserow Cloud Free** | Neon Free | Teable Free |
| --- | --- | --- | --- | --- |
| Monthly API call cap | **1,000** | **none** | **none** | none stated |
| Rate limit | 5 req/s | 10 concurrent, fair use | connection-based | 10 req/s |
| Rows | 1,000 per base | 3,000 per workspace | storage-bound (0.5 GB) | 1,000 per space |
| Counting rows | pages the table | single call | `select count(*)` | pages the table |
| Data location | US | **Germany** | **EU regions selectable** | not stated |
| Spreadsheet UI | yes | yes | no | yes |
| Built-in forms and automations | yes | yes | no | yes |
| Self-host escape hatch | no | **yes, open source** | Postgres, portable | yes, open source |
| First paid tier | ~$20/seat/mo | $10/user/mo yearly | usage-based | $13/seat/mo yearly |

### Rejected, and why

- **NocoDB Free**: caps at **1,000 API calls per month**. Identical failure mode to Airtable. Out.
- **Grist Free**: caps at **3,000 API calls per month**, shared across the site's documents. Better
  than Airtable, still below the read path's floor once writes and traffic are included. Out.
- **Supabase Free**: unlimited API requests and an EU region, but **free projects pause after one week
  of inactivity**. A quiet pre-launch marketing site is exactly the traffic pattern that triggers it,
  and a paused project means the form returns an error until someone restores it by hand. Out on
  operational risk, not on limits.
- **Google Sheets or Notion**: per-minute request limits, US hosting, and neither is a datastore with
  a schema. Out.

---

## 4. Recommendation

### Primary: Baserow Cloud, Free plan

It is the like-for-like Airtable replacement and it removes the one thing that breaks the site.

- **No monthly call ceiling.** The limit is 10 concurrent requests under a fair use policy, which a
  cached counter and a handful of form posts will never approach.
- **Counting is one call.** The list endpoint is page-based (`page`, `size`, default 100, maximum
  200). Request `size=1` and read the total from the response rather than paging the table, so the
  counter costs a single call per refresh regardless of how full the waitlist is.
- **Data is stored in Germany**, inside the EU, which matches what the privacy policy already says.
- **Same working shape as Airtable**: a grid UI to read and export rows, built-in forms, and 2,000
  monthly automation credits, which covers an email notification on each new contact message
  (requirement 7).
- **Open source.** If the hosted free tier ever changes, the same API can be pointed at a self-hosted
  instance with no limits and no code change beyond the base URL.
- **Headroom**: 3,000 rows per workspace and 2 GB of storage. The waitlist is capped at 500.

Two honest caveats:

1. **Compliance certifications are gated to paid tiers.** Baserow lists SOC 2, ISO and HIPAA
   commitments on Advanced and Enterprise. The Free plan gives EU hosting and GDPR applicability, but
   no certification you could show a buyer. For a pre-launch waitlist of 500 addresses that is
   proportionate. It would not be for customer data later.
2. **It is still a third-party processor holding PII.** It has to be named in the privacy policy and
   in the sub-processor list, exactly as Airtable is today.

### Alternative, if you would rather own the data: Neon Postgres, Free plan

Worth stating because it is the option that matches what Actrone sells. Governance and data ownership
are the product's argument; holding launch sign-ups in someone else's spreadsheet is a small
contradiction, and a reviewer on Hacker News may be the one to notice it.

- 0.5 GB storage and 100 compute-hours per month, free, with EU regions (Frankfurt, London).
- Scale-to-zero after five minutes idle with **automatic resume in a few hundred milliseconds**, so
  unlike Supabase there is nothing to restore by hand.
- Compute budget at a one-hour counter cache: roughly 24 wakes per day at the five-minute minimum, so
  about 60 hours per month at 0.25 CU, which is around 15 of the 100 compute-hours. Comfortable.
- Counting is `select count(*)`, and the schema is yours.

What you take on: there is **no UI and no automation**. Reading the waitlist means the Neon SQL editor
or a small admin page, and noticing a contact message means sending an email from the server action.
Resend is already the site's email provider and is already named in the privacy policy, so that part
is a few lines rather than a new vendor.

**Pick Baserow if the forms should keep working the way they work today. Pick Neon if you would rather
spend an extra half-day now and have no vendor holding sign-up PII at all.** Baserow is the lower-risk
launch decision; Neon is the one more consistent with the pitch.

---

## 5. Migration effort

Small and well isolated, because the Airtable calls are already behind server-only modules with tests.
Three functions change, and nothing that imports them does.

| File | Change |
| --- | --- |
| `src/lib/waitlist/signup.ts` | Swap the Airtable POST for the Baserow POST. Same validation, same `updateTag`. |
| `src/lib/founding.ts` | Replace the paging loop with one `size=1` request and read the total. Removes the loop entirely. |
| `src/lib/contact/submit.ts` | Swap the Airtable POST for the Baserow POST. |
| env | `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE` become `BASEROW_TOKEN`, `BASEROW_WAITLIST_TABLE_ID`, `BASEROW_CONTACT_TABLE_ID`, plus an optional `BASEROW_URL` for self-hosting. All server-only, never `NEXT_PUBLIC_`. |
| `src/test/*` | Update the fetch mocks to the Baserow request and response shape. |
| privacy and cookie policy | Replace Airtable with Baserow in the sub-processor list, and note the German hosting location. |
| `Actrone_OSS_Site_Services_Setup_Runbook.md` | Section 1 (Airtable setup) is rewritten for Baserow. Sections 2 to 7 (PostHog, Sentry, Docker, go-live) are unaffected. |

Auth is a header swap: `Authorization: Bearer <airtable_key>` becomes
`Authorization: Token <baserow_token>`. Row creation is `POST /api/database/rows/table/{table_id}/`
with `user_field_names=true` so the JSON keys stay the human field names the code already uses.

The counter's `cacheLife({ stale: 300, revalidate: 900, expire: 3600 })` can stay as it is. Once the
monthly ceiling is gone the interval is a freshness choice rather than a budget, and 15 minutes with
immediate `updateTag` expiry after each sign-up is already the right behaviour.

---

## 6. Recommended next step

Create a free Baserow workspace, rebuild the two tables with the same field names the code uses today
(`Email`, `Name`, `Company`, `Use case`, `Consent`, `Source`, `Signed up`; and `Email`, `Name`,
`Subject`, `Message`, `Source`, `Submitted`), and confirm with one `curl` that the list response
carries a total count at `size=1`. That single check is what the counter rewrite depends on. Everything
else in the migration is a mechanical swap.
