# Actrone — Microsoft Teams approvals

> Status: **step-up (notify + review-in-app) SHIPPED**; **inline-tap (Bot Framework)
> DESIGNED, not built.** This doc records what Teams does today and the concrete plan
> for full inline approvals. Owner: Matt.

> **Status refreshed 2026-07-13 (code-verified): both halves of this doc's own status line still
> hold exactly as stated.** `internal/channels/teams.go` confirmed to implement only the broadcast
> `Send` path (webhook POST + Adaptive Card + host-allowlist SSRF guard); `VerifyInbound`/
> `ParseInbound` confirmed inert. A repo-wide search found no `teams_installs` table, no Bot Framework
> JWT validation, and no `conversationUpdate` handling anywhere in `internal/channels/` — §2's
> inline-tap bot is still genuinely unbuilt, not merely undocumented. No corrections needed.

The governance spine is the constraint that shapes everything here: a Tier-3 approval
may only be resolved by a caller whose Actrone role is **re-checked at decision time**,
and every decision goes through the one governed path (resolve row → signal the paused
Temporal workflow → audit). Any Teams design must preserve that.

---

## 1. What ships today — step-up (notify + review in-app)

Teams is a **broadcast, outbound-only** channel. It notifies a Teams channel and
drives the human into the SSO-authenticated Control Tower to actually decide — so the
role check + audit happen in-app, unchanged. No inbound taps, no per-user linking.

**Setup (Settings → Channels → Microsoft Teams):** paste a Teams **Incoming Webhook**
or **Power Automate "Workflows"** URL. It is sealed in `channel_configs`
(`provider = 'teams'`, the URL stored as the token). OFF until configured.

**End-to-end, exactly what happens:**

1. A DPE Tier-3 escalation is created. The activity service calls the channel notifier
   → `channels.Service.NotifyEscalation(tenant, env, card)`.
2. Teams is a `Broadcaster`, so the notifier sends **once** (no per-user fan-out):
   `TeamsChannel.Send(creds, "", card)`.
3. `Send` **validates the webhook URL** — https + a Microsoft host allowlist
   (`*.webhook.office.com`, `*.logic.azure.com[.us]`, `outlook.office[365].com`;
   suffix-spoofing rejected). This is an SSRF / data-egress guard: an approval card
   (deep link + summary) must never be POSTable to an attacker URL.
4. It builds an Adaptive Card in the `{type:"message", attachments:[…adaptive…]}`
   envelope: optional **org brand header** + the **MAL-safe summary** (`renderCardPlain`:
   "Approval needed", agent, reason, rule id — never raw PII) + **one**
   `Action.OpenUrl` **"Review & approve"** button pointing at the escalations page in
   Control Tower (`card.ReviewURL`, else `card.DeepLink`).
5. It POSTs the card to the webhook. Teams renders it in the channel.
6. A reviewer clicks **Review & approve** → lands in the **SSO-authenticated** Control
   Tower → approves/denies there → the normal governed resolver runs (role re-check →
   resolve → signal workflow → audit).

Inbound is deliberately inert: `VerifyInbound` returns `false`, `ParseInbound` returns
`nil`. Teams today is a *doorway to the governed decision*, not a place a decision is
made. That is what keeps it secure without a bot.

**Files:** `internal/channels/teams.go` (adapter + SSRF guard + card builder),
`internal/channels/types.go` (`ProviderTeams`, `Broadcaster`),
`internal/channels/service.go` (broadcast send path), migration
`00077_channels_teams.sql`; frontend `settings/channels` (webhook-URL card).

**Limitation (why this doc exists):** the reviewer takes ~2 clicks and a context
switch into the app. Approving *inside Teams* needs an authenticated tapper identity,
which incoming-webhook cards cannot provide. That requires a bot — §2.

---

## 2. What full inline-tap Teams requires — Bot Framework

### 2.1 Why a bot, specifically

When a user taps an Adaptive Card button in Teams, only the **Bot Framework** delivers
an *authenticated* result: Teams sends the bot an **invoke activity** signed with a
Bot-Framework-issued JWT, carrying `from.aadObjectId` (the tapper's Entra object id).
That signed identity is the missing piece — it lets us map the tapper to an Actrone
user and re-check their role, keeping the spine intact. (Incoming-webhook `Action.Http`
and Power Automate "wait for a response" do **not** give us a governed, authenticated
callback into our resolver — see §4.)

### 2.2 External prerequisites (ops — the "registered app" part)

These are deployment/tenant artifacts, not code:

- **Entra ID (Azure AD) app registration**, multi-tenant → Microsoft App ID + secret
  (or a federated credential). This is the bot's identity.
- **Azure Bot** resource bound to that app, Teams channel enabled, messaging endpoint
  set to `https://<orchestrator>/v1/channels/teams/messages`.
- **Teams app package** (`manifest.json` + colour/outline icons, zipped) declaring the
  bot and scopes (team / groupchat / personal). Each customer's M365 admin installs it
  (org app catalog / sideload; the public Teams Store additionally needs Microsoft
  review).

> No Microsoft Bot SDK is needed. The SDK is C#/JS/Python only; we implement the Bot
> Connector protocol directly in Go — it is JWT validation + JWKS + REST, the same
> primitives we already use for Clerk, LiveKit, and OAuth.

### 2.3 How it maps onto the existing model

The adapter framework (`channels.Channel` + `Service.HandleInbound` + the escalation
resolver) already fits; Teams-bot becomes a bidirectional adapter:

| Concern | Today (webhook) | Full bot |
| --- | --- | --- |
| **Send** | POST card to webhook URL | Connector `POST {serviceUrl}/v3/conversations/{id}/activities` using a stored *conversation reference* + an app-only AAD token |
| **Buttons** | one `Action.OpenUrl` | `Action.Execute` Approve/Deny whose `data` reuses `EncodeCallback("a\|{escalationID}")` — plus OpenUrl for step-up escalations |
| **Inbound endpoint** | none | **single fixed** `POST /v1/channels/teams/messages` (one bot serves all tenants) |
| **Tenant resolution** | per-tenant `route_token` | from `activity.channelData.tenant.id` (M365 tenant) via a stored install record |
| **VerifyInbound** | n/a | validate the Bot Framework JWT (issuer `api.botframework.com`, audience = App ID, signature vs Bot Framework JWKS, cached) — stronger than Slack's HMAC |
| **ParseInbound** | n/a | invoke activity → `InboundAction{ChannelUserID: aadObjectId, EscalationID, Approve, DedupeKey: activity.id}` |
| **Resolve** | in-app | **unchanged** — `applyApproval` maps channel user → Actrone user, **re-checks role**, resolves through the one governed path |
| **Identity link** | none | reuse the existing `channel_links` handshake (user DMs the bot a one-time token → link `channel_user_id = aadObjectId`) |

Step-up escalations still render the OpenUrl-to-app card even under the bot (an inline
tap cannot satisfy SSO step-up), so the adapter supports both modes — exactly like the
Slack adapter does today.

### 2.4 Schema changes

- New `teams_installs`: Actrone `tenant_id` ↔ M365 tenant id ↔ conversation reference
  (`service_url`, `conversation_id`) ↔ `installed_by`. Populated from the
  `conversationUpdate` activity when the bot is added to a team/chat; replaces the
  pasted webhook URL for the bot path and provides the target for proactive `Send`.
- `channel_links` already allows `teams` (migration 00077) — linking works as-is.

### 2.5 Security specifics

- **Inbound auth** = Bot Framework JWT validation (OIDC), not a shared secret. Cache
  the JWKS; verify issuer, audience (= our App ID), signature, expiry; apply the Teams
  channel-id check.
- **Authorisation is still ours.** The JWT proves the request is genuinely from Teams
  and *who* tapped; whether they may approve is still the Actrone role re-check.
- **Idempotency:** dedupe on `activity.id` (Teams retries invokes).
- **Least privilege:** the bot needs only messaging + the install scope; no Graph
  mailbox/user-read permissions for the core approval loop.

---

## 3. Effort & verifiability

- **Code (a few focused days):** JWKS-validated inbound, app-token minting, Connector
  send, install capture from `conversationUpdate`, invoke parsing. Fully unit-testable
  with httptest + a fake JWKS — same posture as the Slack OAuth tests.
- **Integration-gated (not sandbox-verifiable):** the end-to-end tap needs a real M365
  tenant + the installed app, like the live voice vendors.
- **The real gating cost is the external setup** (Entra app, Azure Bot, Teams
  manifest, per-customer install), not the Go.

---

## 4. Rejected alternative

Power Automate's "post an Adaptive Card and wait for a response" captures the responder,
but the flow runs **inside the customer's** Power Automate tenant — it cannot call back
into our governed resolver with our role model, and the identity it captures is not one
we can trust or map. It does not satisfy the spine. The bot is the correct path for
authenticated inbound.

---

## 5. Recommended path

Keep **two tiers**:

- **Lite (shipped):** paste-a-webhook, step-up review-in-app. Zero external setup;
  works for any org today.
- **Full (this design):** the Bot Framework app for inline Approve/Deny in Teams.

Phase it: (1) build the code side against the documented Connector contract, gated OFF
until configured (same as the voice runtime); (2) stand up the Entra app + Azure Bot +
manifest; (3) integration-test in a real tenant; (4) offer the org-catalog install.
