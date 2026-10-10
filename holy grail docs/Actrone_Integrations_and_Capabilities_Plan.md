# Integrations, Capabilities & Avatars Plan

**Version 1.0 — June 2026 · ✅ SHIPPED as Master-Plan P2 (`IntegrationIcon` catalog, Connect→real MCP OAuth, custom capabilities + Rules Workbench, DiceBear avatars). This doc captures the original analysis; authoritative status: [Platform Evolution §0a](./Actrone_Platform_Evolution_Master_Plan.md#0a-implementation-status-verified-2026-06-24).**

> **Status refreshed 2026-07-13 (code-verified) — §1's table has a MAJOR over-taken claim: the ERP/HRIS
> "framework only, no concrete adapters" row is now false.** `backend/orchestrator/internal/connector/
> erp.go` (SAP S/4HANA, Oracle NetSuite, Oracle Fusion ERP Cloud) and `hris.go` (Workday, BambooHR, ADP
> Workforce Now, SAP SuccessFactors, UKG Pro) both exist with real read **and write** actions
> (`ActionWrite` entries like `create_business_partner`, `create_sales_order`, `create_invoice`,
> `update_worker_contact`, `request_time_off`) — these are not "catalogued in the UI, not yet
> executable" as this doc states; they execute through the generic `CustomRESTAdapter`. The connector
> package also now has `oauth_refresh_test.go`, `pagination_test.go`, `field_schemas.go`, and
> `preset_writes_test.go` — see `Actrone_Connector_Integration_Depth_Plan.md`'s 2026-07-13 status note
> for the full picture (OAuth+refresh, authored writes, pagination, and pinned field schemas are all
> now built, not just planned). The MCP Hub row and the "Agent Studio integration step is UI only, no
> live OAuth from that screen" claim are **(unverified 2026-07-13)** — the OAuth-connect wiring exists
> at `frontend/apps/control-tower/src/lib/api/integrations.ts` (calls `mcp/connections` /
> `oauth/start`), but whether it is reachable from the Agent Studio step specifically (vs. only the
> Integration Hub) was not re-verified in this pass.

> Covers: official brand SVG icons, the "Connect" / OAuth flow, exactly how an
> agent ends up able to *do* an integration's capabilities end-to-end, what is
> real vs framework today, user-defined custom capabilities & rules, the persona
> avatar library, and a researched 2026 integration catalog.

---

## 1. Honest status: real vs framework

| Layer | Status today |
|---|---|
| **MCP Hub** (`internal/mcphub`) | **Real.** OAuth 2.1 + PKCE, AES-256-GCM credential vault, rug-pull/health checks, per-tenant connections. This is the working integration substrate for SaaS via MCP servers. |
| **Connector framework** (`internal/connector`) | **Framework only.** Registry, schema-drift contracts, scope minimisation, MAL field classification — but **no concrete ERP/HRIS adapters** (`erp.go`/`hris.go` not built). SAP/Workday/Oracle are *catalogued in the UI, not yet executable.* |
| **A2A** (`internal/a2a`) | **Real.** Agent-to-agent with provenance + agent-card pinning. |
| **Agent Studio integration step** | **UI only.** Selecting a connector adds it to the manifest; there is no live OAuth from that screen yet. |

**Implication:** the Integration Hub / Agent Studio must distinguish **Connected** (a real, vaulted credential exists) from **Available** (catalogued, connect to enable) — which the current UI already models — and the "Connect" button must drive a *real* OAuth flow (via MCP Hub) for supported connectors, and a "coming soon / contact us" path for enterprise connectors still in the framework stage.

---

## 2. Official brand SVG icons

**Use `simple-icons`** — already a dependency (`simple-icons` in `package.json`). It ships 3000+ official brand SVGs with official brand colours, MIT-friendly, tree-shakable.

- Build a single `<IntegrationIcon slug="slack" />` component that resolves a connector → Simple Icons slug, renders the SVG, and applies the brand colour (with a monochrome fallback for dark/light surfaces).
- A `connector.iconSlug` field maps each catalog entry to its Simple Icons slug; brands not in Simple Icons (e.g. SAP S/4HANA specifics) fall back to a sourced official asset stored in `public/integrations/`.
- **Where to apply official icons across the Control Tower** (audit done):
  - **Agent Studio → Integrations** step (each connector card).
  - **Integration Hub** (`/integrations`) cards + field drawer.
  - **MCP Hub** (`/mcp`) — already has `ServerLogo`; unify it onto `IntegrationIcon`.
  - **Model/provider logos** — OpenAI, Anthropic, DeepSeek, Google, etc. in Cost Monitor, routing, Agent Studio model pickers.
  - **Marketplace** — publisher/integration badges.
  - **Chat tool-call timeline** — each tool shows its integration icon.
  - **Framework badges (BYOF)** — LangGraph, CrewAI, LangChain, AutoGen logos on `byof` agents. The full BYOF **framework-adapter** strategy (OpenAI Agents SDK, Cursor SDK, OpenClaw, + the OpenAI-compatible gateway bind) lives in [EMAOP — Models/Extensibility/Channels Plan §3](./Actrone_EMAOP_Models_Extensibility_Channels_Plan.md).

This single change makes the platform feel dramatically more "real" and premium.

---

## 3. The "Connect" flow (OAuth) — UX + how it works

### 3.1 UX
On any **Available** connector (Integration Hub or Agent Studio):

```
[ Salesforce ]                         [ Connect ]
   ↓ click Connect
1. Show the minimised OAuth scopes (only what the agent's capabilities need).
2. "Connect Salesforce" → opens the provider OAuth in a popup/redirect.
3. User authorises on Salesforce.
4. Callback → Actrone stores the credential in the vault (never shown to user/LLM).
5. Card flips to "Connected ✓ · synced just now · schema v#".
6. The connection is now selectable in any agent's manifest.
```

For **per-environment** correctness, a connection is scoped to the active environment (dev/staging/prod) — connecting in Production does not expose creds to Development.

### 3.2 How it works (reuse the MCP Hub)
The MCP Hub already implements this exact pattern: `POST /v1/mcp/connections` → `oauth/start` → `authorize_url` → provider consent → `/mcp/oauth/callback` → vaulted connection → `approve`. The Integration Hub / Agent Studio "Connect" button **reuses the MCP Hub OAuth machinery** for any connector that is an MCP server, plus the scope-minimiser (`connector.MinimizeScopes`) to request least privilege. Enterprise connectors (SAP/Workday) follow the same shape once their adapters + OAuth providers are built.

### 3.3 How an agent then *does* the integration's capabilities (end-to-end)
This is the key mental model to make explicit:

```
1. CONNECT (once)      User OAuths an integration → credential sealed in the vault,
                       a "connection" row created (tenant + environment scoped).

2. BIND (per agent)    The agent's manifest references the connection. At task start
                       the orchestrator resolves the agent's connections into callable
                       TOOLS (mcphub.ResolveForAgent → MCP server tools; a2a for agents).
                       Tool names look like  "salesforce-mcp/create_lead".

3. PLAN (LLM)          The LLM, given those tools + the agent's capabilities + persona,
                       decides to call a tool with arguments.

4. GOVERN (supervisor) The Tool-Call Supervisor (8-step) validates the call: capability
                       hard-block (DPE Tier-1), allowlist, injection scan, schema heal,
                       rate/spend caps, MAL on any sensitive args.

5. EXECUTE             The connector executes against the real system with the vaulted
                       credential injected at the edge — the credential NEVER reaches the
                       LLM. Responses pass through MAL (PII tokenised) before becoming a
                       tool result.

6. AUDIT               The call + verdict + reasoning trace land in the tamper-evident
                       audit spine.
```

So "selecting an integration" in Agent Studio is step 2 (BIND). The **Connect** button is step 1. The capability flags (Agent Studio Step 3) gate *which* tools the agent may call. This whole flow already has its pieces (mcphub, supervisor, MAL, DPE, audit) — the gap is wiring the Agent Studio "Connect" button to the MCP Hub OAuth and building the enterprise adapters.

---

## 4. Researched 2026 integration catalog

Grounded in current research (Composio's 500+ MCP catalog; Slack/Salesforce/Linear/GitHub/Jira top the enterprise list; Gartner: ~40% of enterprise apps agent-integrated by end of 2026). Organised by the audiences you named (developer / startup / enterprise — most span all three). **Recommendation: ship via MCP servers where they exist (fastest, governed), and consider a managed catalog partnership (Composio/Arcade-style) to avoid building 500 OAuth flows by hand.**

**Communication & collaboration:** Slack, Microsoft Teams, Discord, Zoom, Google Meet.
**Productivity & docs:** Google Workspace (Gmail, Drive, Docs, Sheets, Calendar), Microsoft 365 (Outlook, OneDrive, Excel), Notion, Confluence, Coda.
**Project & issue tracking:** Linear, Jira, Asana, ClickUp, Monday.com, Trello, GitHub Issues, Height.
**Dev & DevOps:** GitHub, GitLab, Bitbucket, Vercel, Netlify, AWS, GCP, Azure, Docker Hub, Sentry, Datadog, Grafana, PagerDuty, Opsgenie, CircleCI, Terraform Cloud.
**CRM & sales:** Salesforce, HubSpot, Pipedrive, Apollo, Outreach, Gong.
**Support / ITSM:** Zendesk, Intercom, ServiceNow, Freshdesk, Front.
**Data & analytics:** Snowflake, BigQuery, Databricks, Postgres, MySQL, MongoDB, Redshift, Looker, Metabase, dbt, Airbyte, Fivetran.
**AI / vector / ML:** Pinecone, Qdrant, Weaviate, Hugging Face, OpenAI, Anthropic, Cohere, Replicate.
**Finance & ops:** Stripe, QuickBooks, Xero, NetSuite, SAP S/4HANA, Brex, Ramp, Bill.com.
**HR & people:** Workday, BambooHR, Rippling, Gusto, ADP, Deel.
**Storage & files:** Google Drive, Dropbox, Box, OneDrive, AWS S3, SharePoint.
**Email & messaging infra:** SendGrid, Resend, Postmark, Twilio (SMS/voice), Mailgun.
**Marketing:** Mailchimp, Customer.io, Segment, Braze, Google Analytics, Webflow.
**E-commerce:** Shopify, Stripe, WooCommerce.
**Automation / iPaaS (meta):** Zapier, Make, n8n, Composio, Pipedream — let agents trigger existing automations.

**Tiering by audience (suggested catalog tiers):**
- **Developer/solo (free/pro):** GitHub, Slack, Linear, Sentry, Vercel, Notion, Postgres, OpenAI/Anthropic, Stripe.
- **Startup (scale):** + HubSpot/Salesforce, Jira, Zendesk, Google/M365 Workspace, Snowflake/BigQuery, Twilio, PagerDuty.
- **Enterprise:** + SAP, Workday, Oracle NetSuite, ServiceNow, Databricks, ADP, SharePoint, Okta/SSO — gated by the `enterprise_connectors` entitlement.

A living `INTEGRATION_CATALOG` (frontend + backend) keyed by id, with: name, category, audience tiers, `iconSlug`, auth type (OAuth/API key/MCP), entitlement gate, and the MAL default classification per field.

---

## 5. Custom capabilities & custom rules in Agent Studio

> Let users define their own capabilities and rules in the Agent Studio UI.

### 5.1 Custom capabilities
Add a **"Custom capability"** builder to Agent Studio Step 3:
- Fields: id (snake_case), label, description, the **tool(s)/MCP/connector** it maps to, required OAuth scopes, the **DPE rules auto-applied** when enabled, and the **plan tier** it requires (so custom enterprise capabilities can gate).
- Stored per-tenant in a `custom_capabilities` table; merged with the built-in `CAPABILITIES` catalog at render + enforced at the kernel exactly like built-ins (the manifest `AgentCapabilities` becomes extensible).
- Backend: capability → tool/connector binding resolved by the supervisor; the kernel still hard-blocks anything not granted.

### 5.2 Custom rules (already partly here)
The **Rules Workbench** (`/rules`) already builds DPE rules that mirror the Go engine. Plan:
- Embed a **lightweight inline rule builder** in Agent Studio Step 5 (reuse the `RulesWorkbench` rule-card components) for simple per-agent threshold rules, with "Open Rules Workbench" for advanced/org-wide rules.
- Wire the Rules Workbench to the **real DPE API** already built (`POST /v1/governance/rules`, `/versions`, `/promote`) — today it's client-side simulation.

---

## 6. Persona avatar library

**Recommendation: DiceBear** (researched) — open-source (MIT), 30+ avatar styles, deterministic seeds, SVG, self-hostable HTTP API *and* an npm core (so avatars can be generated on Actrone's own infra — privacy-safe, no third-party calls). Pair it with:
- **DiceBear style picker** — pick a collection (e.g. "bottts", "shapes", "identicon", "thumbs") + a seed; great for agent personalities.
- **Lucide icon picker** — for a clean iconographic avatar (already a dep) + a brand colour swatch.
- **Upload** — a custom image (org-branded agents).
- **Boring Avatars** as an optional gradient style.

The persona avatar is set in Agent Studio (Step 2) and the chat header, and is the same model used by BYOF/native agents (a profile screen). Store `avatar: { kind: 'dicebear'|'lucide'|'upload', value, color }`.

---

## 7. Build order

1. **`IntegrationIcon` (simple-icons)** everywhere + the `INTEGRATION_CATALOG` with tiers/gates — instant premium lift, low risk.
2. **Wire Agent Studio/Integration Hub "Connect" → MCP Hub OAuth** (real connections for MCP-backed SaaS) + per-environment scoping.
3. **Rules Workbench → real DPE API**; inline rule builder in Agent Studio.
4. **DiceBear avatar picker** in Agent Studio + chat.
5. **Custom capabilities** builder + `custom_capabilities` backend.
6. **Enterprise connector adapters** (SAP/Workday/Oracle/ADP) — real `erp.go`/`hris.go`, the largest effort; gate behind `enterprise_connectors`.
7. **Managed catalog** evaluation (Composio/Arcade) to scale to hundreds of integrations without hand-building each OAuth.

---

*Last updated: 2026-06-10 · Planning only.*
