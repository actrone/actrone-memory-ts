# Actrone — Connector & Integration Depth Plan

**Version 0.1 — July 2026 · Owner: Matt · Status: ⛔ PLAN — UNBLOCKED & #1 NEXT (GAL is done)**

> **AUDIT 2026-07-04:** Part III is confirmed genuinely UNBUILT and is now the **highest-leverage next build**.
> Connector OAuth today is a pasted vault-held bearer with **no refresh token, no `expires_at`, no
> `ExchangeRefresh`, no re-auth handler** (`internal/connector/store.go` `sealedCredentials`), so OAuth
> ERP/HRIS presets silently break ~1h after connect. The reusable pattern already exists in
> `internal/mcphub/oauth.go` (`ExchangeRefresh`) and `internal/email`. Build Phase 1 first
> (authorize→callback→exchange→**refresh** + single-flight + `needs_reauth`).

> **Status refreshed 2026-07-13 (code-verified): Phases 1, 2, 3, and 4 of Part III are ALL BUILT —
> this is no longer "⛔ PLAN."** Direct evidence from `backend/orchestrator/internal/connector/`:
> - **Phase 1 (OAuth + refresh) — DONE.** `store.go` now has `RefreshToken`/`ExpiresAt` fields on the
>   sealed-credential bundle, a `NeedsReauth` flag + `MarkNeedsReauth`, and a refresh path that calls
>   `mcphub.ExchangeRefresh(...)` (reusing the MCP Hub's proven pattern exactly as this plan specifies)
>   — on `invalid_grant` it flags `needs_reauth` rather than failing silently. `oauth_refresh_test.go`
>   exists.
> - **Phase 2 (authored governed writes) — DONE.** `erp.go` (SAP S/4HANA, Oracle NetSuite, Oracle
>   Fusion ERP Cloud) and `hris.go` (Workday, BambooHR, ADP, SAP SuccessFactors, UKG Pro) now declare
>   real `ActionWrite` entries (`create_business_partner`, `create_sales_order`, `create_customer`,
>   `create_invoice`, `delete_invoice`, `update_worker_contact`, `request_time_off`, etc.) against
>   `gal.WriteActionSpec` (`internal/gal/action.go`); `write.go` implements `WriteAdapter` +
>   `DryRunAdapter` (vendor-sandbox simulation, degrading to read-back); `preset_writes_test.go` exists.
> - **Phase 3 (pagination) — DONE (cursor-based).** `pagination_test.go` proves the adapter follows an
>   RFC 5988 `Link: …; rel="next"` header across pages and reports an empty `NextCursor` on the final
>   page. Vendor-specific OData `$skiptoken` framing is not separately confirmed, but the general
>   cursor mechanism this phase calls for is real, not aspirational.
> - **Phase 4 (pinned field schemas) — DONE.** `field_schemas.go` pins per-vendor sensitive fields
>   (SSN, national id, DOB, salary/bank, etc.) to authoritative MAL classifications for HRIS/ERP
>   vendors, exactly as specified.
>
> The two things this note does **not** confirm: whether OAuth client registration is per-tenant vs.
> a shared Actrone-registered app (§Open Decisions #1 — likely still an open call), and whether
> endpoint coverage has grown beyond the "starter pair" per preset (§Phase 4's coverage-expansion
> half) — **(unverified 2026-07-13)**. Part I/II's architecture description (MCP client vs. connector
> adapter, the ~29-entry MCP catalog — up from the ~24 cited here, see `internal/mcphub/catalog.go`)
> remains accurate. Update the top status line and Part III headers to reflect Phases 1-4 shipped;
> only the two unverified items above and Phase 5 (non-REST vendors, demand-gated) remain open.

> Two things motivated this doc: (1) a question about who builds the actual per-vendor
> connection for ERP/HRIS, and (2) a request to verify that every integration where an agent
> does real work is production-grade. Part I answers the architecture question (MCP client vs
> server, the pre-built catalog). Part II is an honest maturity audit of **every** integration
> surface. Part III is the durable plan to close the one class of real *code* gaps it surfaces:
> connector **depth** — chiefly a real OAuth connect + token-refresh flow, then authored
> governed writes, pagination, and coverage. Grounded in a direct read of the code.

---

## Part I — MCP Hub: client vs server, and the pre-built catalog

**Actrone is an MCP _client_, not a server** (with two first-party exceptions, below). The
difference:

- An **MCP server** _exposes_ tools/resources over the Model Context Protocol (e.g. GitHub's
  `api.githubcopilot.com/mcp`, Stripe's `mcp.stripe.com`). The vendor builds and hosts it.
- An **MCP client** _connects to_ those servers, lists their tools, and calls them on an
  agent's behalf. That is what Actrone's `internal/mcp/client.go` does — a real JSON-RPC
  client: `initialize` handshake + protocol negotiation, `Mcp-Session-Id` replay,
  `notifications/initialized`, `tools/list`, `tools/call`, with a circuit breaker + timeouts,
  over the current **Streamable-HTTP** transport (the deprecated HTTP+SSE transport is
  deliberately not used).

**Do we have pre-built MCP servers?** We ship a **curated catalog of ~24 pre-built _client
connections_** (`internal/mcphub/catalog.go`) a tenant connects with one click — GitHub,
GitLab, Sentry, Linear, Jira, Postgres, Supabase, Snowflake, BigQuery, Slack, Notion, Google
Drive, Brave, Exa, Firecrawl, Playwright, Stripe, HubSpot, Salesforce, AWS, Cloudflare,
Kubernetes — plus a **private catalog** (`privatecatalog.go`) for org-admin-registered
internal/partner servers. Each entry declares hosting (`remote` = the vendor's hosted MCP
endpoint; `local` = we run the server as a per-tenant **mcp-runner pod**), auth
(bearer/oauth2/none + full `OAuthSpec` with PKCE), trust level, and min tier.

**The two first-party exceptions where Actrone IS an MCP server:** `actrone-memory` and
`actrone-marketplace` are Actrone endpoints exposed _as_ MCP servers so any agent (ours or a
third party's) can use our memory + marketplace as tools. Everywhere else, we are the client.

**Why this matters for the connector question:** MCP is one of **two** ways an agent reaches
an external system. The other is the **connector adapter** (ERP/HRIS/custom REST). They are
distinct tool namespaces in the loop: `connector/{id}`, `{server}/{tool}` (MCP), `a2a/{…}`
(cross-org agents). An ERP/HRIS preset does **not** go through MCP — it uses the generic REST
adapter. So "is the ERP integration MCP?" — no; MCP covers the ~24 SaaS systems above, and the
connector adapter covers REST/OData enterprise systems that don't (yet) publish an MCP server.

---

## Part II — Integration maturity audit (is the work production-grade?)

Verified by direct inspection. The consistent finding: **the code is production-grade almost
everywhere; the gaps are (a) connector _depth_ — a real code gap, this plan — and (b)
deployment/vendor bring-up (secrets, KYC, pods) — turn-up, not engineering.**

| Integration | Mechanism | Code maturity | Real gaps |
|---|---|---|---|
| **MCP Hub** (`internal/mcp`, `internal/mcphub`) | MCP **client** + curated catalog | ✅ **Most mature.** Real JSON-RPC client, 24-server catalog + private catalog, **OAuth w/ PKCE + refresh** (`ExchangeRefresh`, RFC 6749 §6; RFC 8707 resource binding), SSRF guard, security scanning, per-tenant runner pods, tiered | `local`-hosted entries need the mcp-runner pod deployed (deploy-gated) |
| **Model providers** (`internal/model`, `internal/modelkeys`) | Native + OpenAI-compat | ✅ Prod-grade. OpenAI/Anthropic/Bedrock/Azure/Vertex + generic OpenAI-compatible, thinking dialect, split-rate pricing, SSRF for self-hosted | China-model policy is aggregator-only (by design) |
| **A2A** (`internal/a2a`) | Cross-org agent↔agent | ✅ Prod-grade. Ed25519 provenance chain, signed parts, SSRF, idempotency | Cross-org **action** fabric (agent↔system) is GAL Phase 5 |
| **Channels** (`internal/channels`) | Slack/Telegram/WhatsApp/email/Teams approvals | ✅ Prod-grade w/ one known limit. Slack app-install, Telegram/WhatsApp/email inline; **Teams is broadcast-only** (a webhook can't identify the approver → can't role-check a per-user tap) | Teams **inline-tap bot** (Entra/Azure Bot) is the documented follow-up |
| **Voice V2.1** (`internal/voice`, `backend/voiceagent`) | Telephony/meeting-bots/browser | ✅ Code-complete. Twilio + 4 meeting-bot providers + LiveKit + Deepgram/libopus | Vendor secrets + verify-live (deploy-gated) |
| **VCS deploy** (`internal/vcs`) | GitHub/GitLab/Bitbucket | ✅ Prod-grade. App-model short-lived per-repo tokens, SLSA provenance | Durable Temporal workflow for long scans is deferred |
| **Email** (`internal/email`) | BYO-SMTP + OAuth senders | ✅ Prod-grade. **OAuth w/ refresh**, sealed secrets, branded `email.Render` | — |
| **Marketplace** (`internal/marketplace`, `backend/marketplace`) | Stripe Connect payouts | ✅ Prod-grade. Take-rate, publisher payouts | Live KYC/real-money verify (deploy-gated) |
| **Connectors — ERP/HRIS/REST/webhook** (`internal/connector`) | Generic `CustomRESTAdapter` + presets | ✅ **Runtime is prod-grade** (SSRF, DNS-pin, cred injection, MAL classify, bounded, Ping test, vault-sealed). **BUT feature _depth_ is incomplete** | **This plan** — see Part III |

### The connector depth gap, precisely (Part III's subject)

The generic adapter is real and tested; what's thin is **per-vendor depth**:

1. **No OAuth connect + refresh flow.** ERP/HRIS presets declare `oauth2` auth but the admin
   supplies an **already-obtained bearer token** (`CreateInput.AuthCredential`, pasted, sealed).
   Raw OAuth2 bearer tokens **expire (often ~1 h)** and there is **no refresh** — so an OAuth
   connection **silently breaks after expiry.** (API-key vendors like BambooHR are fine — the
   key is long-lived.) **This is the highest-priority gap: it makes the OAuth presets
   non-durable in production.** The fix is not novel — `internal/mcphub/oauth.go` already
   implements authorize→PKCE→exchange→**refresh** with sealed access+refresh+expiry, and
   `internal/email` does OAuth-with-refresh too. Connectors must adopt the same proven pattern.
2. **Read-only presets.** No preset declares a write action; governed writes need the GAL
   `WriteActionSpec` metadata authored per action (GAL Phase 0 built the engine; the presets
   are unauthored).
3. **Single-page reads.** `Fetch` is one bounded GET — no vendor pagination (OData
   `$skiptoken`/cursor), delta/incremental sync, or per-vendor rate-limit backoff.
4. **No pinned field schemas.** Preset `FieldSchema` is empty; classification is the dynamic
   MAL classifier + an HRIS `PII_HIGH` floor — safe, but not authoritative per known field.
5. **Curated starter coverage.** Each preset ships a couple of read endpoints (Workday = just
   `/workers`); real systems expose hundreds.

**What is _not_ a gap (design, not omission):** there is deliberately **no bespoke per-vendor
HTTP client** — REST/OData systems are all served by the one parameterized adapter. Bespoke
code would only be needed for genuinely non-REST protocols (legacy SAP RFC/BAPI, SOAP-only),
which none of the current presets are. And **authorizing access to a customer's own tenant is
inherently the customer's** — no vendor lets Actrone self-provision; the most we do is make it
a click-consent OAuth flow instead of a paste.

---

## Part III — The plan: connector integration depth (post-GAL)

Sequenced **after** GAL (Phase 0 shipped; Phase 1 provenance/purpose next). Each phase ships
standalone value; Phase 1 is the one that makes the current OAuth presets actually hold up.

### Phase 1 — OAuth connect + token refresh (HIGHEST PRIORITY)

Make "click to connect Workday/NetSuite/Salesforce-style OAuth" work end-to-end and **stay**
connected. **Reuse `internal/mcphub/oauth.go`'s proven pattern**, do not reinvent it.

- **Per-provider OAuth client registration** — extend the preset with an `OAuthSpec`
  (authorize/token URLs, scopes, PKCE) exactly like the MCP catalog. Per-tenant client
  id/secret vaulted (or a shared Actrone-registered app where the vendor permits).
- **Authorize → callback → exchange** — a connector OAuth handler (`/v1/connectors/oauth/…`)
  mirroring the MCP OAuth handler: PKCE, `state` CSRF, RFC 8707 `resource` binding where
  supported. Store **access + refresh + expiry** sealed in the connector vault (extend
  `sealedCredentials` with the refresh token + `expires_at`).
- **Refresh-on-expiry at the request edge** — before an adapter call (Fetch/Invoke), if the
  token is within a skew window of `expires_at`, call `ExchangeRefresh` and re-seal. A
  single-flight per (tenant, connector) so concurrent tool calls don't stampede the token
  endpoint (reuse the codebase's single-flight idiom).
- **Graceful re-auth** — when refresh fails (revoked/expired refresh token), mark the
  connection `needs_reauth`, surface it in the Integration Hub, and fail the tool call with an
  actionable error (never a silent 401).
- **Keep the paste path** for API-key/bearer vendors (BambooHR, etc.) — OAuth is additive.
- Tests: token-exchange + refresh (httptest), expiry-window refresh trigger, refresh-failure →
  needs_reauth, single-flight under concurrency, PKCE/state validation.

### Phase 2 — Authored governed writes on presets (lights up GAL)

- Author `WriteActionSpec` metadata (risk class, reversibility, compensating action, sim
  strategy, amount field) on the common write actions of the top ERP/HRIS systems (e.g.
  NetSuite create/update invoice, Workday time-off, Salesforce record update). This is the
  `connector.EndpointAction` GAL fields + `connectortool.AuthoredWriteSpecResolver` already
  built in GAL Phase 0 — Phase 2 is the per-vendor authoring on top.
- Pair each with its **inverse** action for compensating rollback, and mark genuinely one-way
  ops (e.g. "post to GL", "send") `irreversible` → approval-forced.
- Tests: each authored spec validates; reversible writes are auto-commit-eligible under a
  raised coverage model; irreversible ones force approval.

### Phase 3 — Pagination, incremental sync, rate-limit resilience

- Per-action **pagination** strategy (OData `$skiptoken`/`@odata.nextLink`, cursor, offset) in
  the adapter, bounded by a max-pages cap (no unbounded pulls).
- **Delta/incremental** reads where the vendor supports it (changed-since watermark) so an
  agentic workflow doesn't re-pull the world.
- **Per-vendor rate-limit** handling (429 + `Retry-After`, exponential backoff with jitter —
  the CLAUDE.md §4.4 policy) around the adapter call.

### Phase 4 — Pinned field schemas + coverage expansion

- Ship authoritative `FieldSchema` for the well-known sensitive fields of each preset (Stage-1
  MAL classification) so classification is deterministic, not heuristic, for known vendors.
- Expand each preset's endpoint set from the starter pair to the common agentic-workflow
  resources (guided by design-partner demand, cheap declarative additions).

### Phase 5 — (Optional, demand-gated) non-REST vendors

- Only if a design partner needs a legacy protocol (SAP RFC/BAPI, SOAP-only): a protocol
  adapter behind the same `connector.Adapter`/`WriteAdapter` interface, MAL-classified
  identically. This is the **only** place bespoke per-vendor code is warranted — and only on
  real demand.

---

## Sequencing & rationale

1. **Finish GAL first** (Phase 0 shipped; Phase 1 provenance/purpose is the next GAL slice).
2. **Connector Phase 1 (OAuth + refresh)** — the highest-leverage fix; without it the OAuth
   presets are demo-ware that breaks after an hour. Low risk (reuses the MCP OAuth pattern).
3. **Connector Phase 2 (authored writes)** — turns GAL from "engine built" into "governed
   writes on real ERP/HRIS actions," the moat made tangible.
4. Phases 3–4 deepen reliability + fidelity; Phase 5 only on demand.

## Open decisions

1. **Per-tenant vs shared OAuth app** per vendor — a shared Actrone-registered app is smoother
   (no client-secret handling by the tenant) but not all enterprise vendors allow it; likely a
   per-vendor capability flag (mirror how the MCP catalog handles it).
2. **Which write actions to author first** (Phase 2) — driven by the first design partners'
   workflows (finance vs HR vs CRM).
3. **How much endpoint coverage** to ship vs let admins add via the custom-connector builder
   (which already exists for arbitrary REST).

---

_Last updated: 2026-07-03 | Owner: Matt | Related: `internal/connector`, `internal/mcphub`
(OAuth pattern to reuse), `internal/email` (OAuth refresh precedent), GAL Strategy (writes),
Data Residency (region-pinned endpoints)._
