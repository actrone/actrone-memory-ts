# EMAOP Integration Plan — Actrone Platform
## Hyperscale Architecture, 10x Agent Superiority & Monetization Expansion
**Version 1.1 — June 2026**
**Classification: Confidential**

---

## 0. Review Addendum — Frontend + Backend Reconciliation (2026-06-09)

> This addendum supersedes any conflicting detail below. The body (§1–§11) is retained
> for the full design rationale, but the items here reflect the **actual current codebase**
> after a frontend + backend review.

> **AUDIT 2026-07-04 — ~90% shipped; TWO genuine gaps remain (net-new code, NOT deployment-gated):**
> The bulk is real and wired (MAL, DPE, HMAC audit spine, ERP/HRIS connectors, onboarding, Agent Studio,
> Rules Workbench, and a real-time Control Tower with `PauseAgent`/`PauseAll` + `internal/controlevents/hub.go`).
> The two things still **unbuilt**:
> 1. **Browser Capability Framework runtime (§4/§5.3)** — governance logic exists (`internal/browser/
>    {service,tiers,mal_interceptor}.go`: tier enforcement, domain allowlist, MAL interception) but
>    `SessionManager` is an interface with only a `fakeSessionManager` in tests, and `browser.NewService`
>    is **not wired into `main.go`** → no real Playwright/K8s-Job browsing. Needs a production `SessionManager`.
> 2. **Inter-agent trust delegation (§4.2) not enforced** — `internal/trust/delegation.go` exists but
>    `internal/a2a` has **zero** references to `VerifyDelegationToken`/`ERR_TRUST_VIOLATION`; cross-agent
>    `Execute()` is gated only by provenance/agent-card identity, not by delegation tokens. Needs wiring
>    `trust.VerifyDelegationToken` into the a2a dispatch path.

> **Status refreshed 2026-07-13 (code-verified), scoped to SDKs/channels/voice (this pass did not
> re-audit the browser/trust-delegation gaps above — unverified 2026-07-13 whether they're still
> open):** §9's "Voice capability | — | — | ✅ (v2)" and §7's "Voice capability v2 ...
> Phase 4" / "voice toggle (grayed with 'v2 — coming soon')" framing are now MAJOR-STALE. Voice is
> code-complete well beyond v2, including **outbound calling and campaigns** (`internal/voiceoutbound/`,
> `internal/voicecampaign/`) that this doc doesn't mention at all, plus a distributable embeddable
> orb (`internal/voiceembed/`, `frontend/apps/control-tower/src/orb/orb.ts`) and voice methods in both
> client SDKs. See `Actrone_Voice_Runtime_Bringup.md` (accurate, code-verified) for current status —
> only deployment bring-up (secrets, live vendors) remains, not a "coming soon" toggle. Channels
> (Telegram/WhatsApp/Slack/Teams-broadcast/email) referenced in passing are also all real and shipped
> — see `Actrone_Teams_Approvals.md` and `Actrone_WhatsApp_Channel_Setup.md`.

### 0.0 Framing — EMAOP is not a product, it is Actrone

"EMAOP" is the internal **codename for Actrone's next enterprise wave**, not a separate
platform, SKU, or surface. There is no "EMAOP product." Every component below is an
**additive layer on the existing Actrone monorepo** — same orchestrator, same Control
Tower, same design system, same entitlements. User-facing copy must never say "EMAOP";
it says "Actrone." New UI lands inside the existing `(app)` Control Tower using the
shipped primitives; new backend lands inside `backend/orchestrator/internal/`. The
guiding principle ("extend, don't rebuild") is now a hard rule: **reuse the seams listed
in §0.3/§0.4 — do not stand up parallel systems.**

### 0.1 Backend reality — several "gaps" are already shipped

The original §2 gap analysis understates the backend. Verified present in
`backend/orchestrator/internal/`:

| Plan claim | Reality | Action |
|---|---|---|
| "Semantic cache (pending)" | **Shipped** — `semcache/semcache.go` (+test) | Drop from scope; integrate, don't build |
| Distillation flywheel = Phase 4 future | **Shipped** — full `distill/` package (dataset, eligibility, promotion, resolver, serving, failover, hyperscale) | Phase 4 distillation is ~done; only the scheduler trigger remains |
| Hallucination/groundedness scorer = to build | **Shipped** — `eval/groundedness.go`, `eval/judge.go`, `eval/gate.go`, `eval/breaker.go` | Reuse as the DPE confidence/Tier-3 signal |
| Model routing = partial | **Shipped** — `optimizer/` (budgeter, cascade, predictive) + `00026_route_policy.sql` | Reuse for token-budget enforcement |
| "Audit log — not tamper-evident" | Two systems exist: `governance/violation_ledger.go` (SHA-256 chain) **and** `governance/audit_engine.go` (meta-LLM reasoning reviewer whose `AuditInput` already captures the 6-step reasoning chain) | EMAOP Audit Spine = add HMAC chaining + SIEM on top; `reasoning_trace.go` largely overlaps `audit_engine.go` — extend it, don't duplicate |
| "A2A unauthenticated — any agent can impersonate any other" | **Overstated** — `a2a/` already has `provenance.go`, `agentcard.go` (ed25519 agent-card pinning), governance + poisoning scans (`00019_a2a_governance`, `00021_a2a_provenance`) | Trust protocol (Ed25519 *delegation tokens*) is still a genuine add, but build it **on top of** the existing identity/provenance layer |
| Compliance packs = new revenue line only | Policy packs already exist: `governance/policies/{eu-ai-act,fca-mifid-ii,fda-21-cfr-11,fsca,financial-services}.yaml` | GDPR/HIPAA packs extend an existing, shipped policy-pack system |

**Genuinely new backend packages (confirmed absent — build these):** `mal/`, `trust/`,
`dpe/`, `browser/`, `connector/`, `onboarding/`, `voice/`. Reuse anchors confirmed present:
`mcphub/{vault,tier,security,service}.go`, `wazero v1.7.3` already in `go.mod` (ONNX runtime
for MAL Stage 2). Vault (`hashicorp/vault-client-go`) and Playwright are **not** present —
genuinely new deps.

### 0.2 ⚠ Migration numbers collide — renumber EMAOP migrations to 00029+

The existing tree already uses `00026_route_policy.sql`, `00027_memory_facts.sql`,
`00028_distill.sql`. **Every migration number in §4/§5/§8 is wrong.** Canonical renumber:

| Plan (wrong) | Use | Contents |
|---|---|---|
| 00026_mal_tokens | **00029_mal_tokens** | field_classifications, schema_versions |
| 00027_dpe_rules | **00030_dpe_rules** | dpe_rules, escalation_queue, rule_sandbox_results |
| 00028_trust_identities | **00031_trust_identities** | agent_identities |
| 00029_audit_spine | **00032_audit_spine** | audit_events |
| 00030_browser_sessions | **00033_browser_sessions** | browser_sessions |
| 00031_onboarding | **00034_onboarding** | onboarding_states |
| 00032_connector_contracts | **00035_connector_contracts** | connector contracts |

### 0.3 Frontend reality — reuse the shipped premium layer (do NOT rebuild)

The Control Tower frontend already received a full Geist-benchmarked premium revamp.
EMAOP's §6.4 must consume these seams rather than parallel them:

| EMAOP §6.4 intent | Already shipped — reuse | Note |
|---|---|---|
| Per-feature plan gating, upgrade CTAs | `lib/entitlements.ts` (`FEATURE_MATRIX`, `can()`, `TIER_META`), `components/features/{FeatureGate,UpgradeModal,UpsellCard}.tsx`, `hooks/useEntitlements.ts`, env `NEXT_PUBLIC_ENTITLEMENTS_ENFORCED` (dormant master switch) | **Extend `FEATURE_MATRIX`** with EMAOP capability ids (`mal`, `dpe_tier1`, `dpe_tier23`, `browser_read_only/authenticated/form_submit/autonomous`, `enterprise_connectors`, `siem`, `regulator_export`). Wrap new premium surfaces in `<FeatureGate>`. Flip the env flag when billing assigns tiers. |
| Filter/sort/date/export on tables | `hooks/useDataView.ts` + `components/ui/DataToolbar.tsx` (+ `DataPagination`, `lib/csv.ts`) | Audit Viewer, Integration Hub, Usage all use this. |
| Onboarding wizard + Layer-3 checklist | `components/onboarding/{OnboardingFlow,DashboardOnboarding}.tsx`, `TipCard`, `TutorialsDrawer` | **Reconcile personas:** shipped model is solo/startup/enterprise; EMAOP wants HR/Finance/IT/Procurement **verticals**. Decision needed — recommend layering *account-type × vertical* and reusing `DashboardOnboarding` as the Layer-3 checklist. |
| Org switcher / multi-tenant admin (§7) | `components/layout/OrgBar.tsx` (org switcher + notifications + 3-dot menu) | Already done. |
| Dashboard "System health" | `components/features/SystemHealthPanel.tsx` | EMAOP real-time WS version extends it. |
| Audit Viewer (`audit/page.tsx`) | **Seed now built:** `(app)/governance/audit/page.tsx` + `AuditLogBrowser.tsx` (ledger integrity banner, facets, CSV) | Reasoning-trace drill-down + HMAC indicator layer onto this surface. Reconcile route: sidebar uses `/governance/audit`; pick one of `/governance/audit` vs `/audit`. |
| Agent detail | **Now built:** `(app)/agents/[id]/page.tsx` (manifest, stats, tasks, governance) | Agent Studio adds `agents/new` + `agents/[id]/edit` on top. |

**Naming + plumbing corrections:**
- **Tier names — pick ONE.** Three exist today: marketing `/pricing` = Core/Pro/**Scale**/Enterprise; `entitlements.ts` = free/pro/team(label "Scale")/enterprise; EMAOP §9 = Free/Pro/**Business**/Enterprise. Recommend standardizing the paid mid-tier as **"Scale"** (already live on the marketing site + OrgBar badge) and updating §9 accordingly.
- **`cost/`→`usage/` and `mcp/`→`integrations/` are *replacements*, not new pages** — extend/alias in place; do not ship both.
- **Middleware is `frontend/src/proxy.ts`, not `middleware.ts`** — add RBAC route guards there.
- **RBAC roles are orthogonal to plan tiers.** Add `useCurrentUserRole()` (Clerk `actrone_role` claim) alongside `useEntitlements()` (plan tier) — never conflate role (permission) with tier (plan).
- Reuse the design system: `PageHeader` (section `eyebrow`), `Breadcrumb`, the 16 Radix-backed primitives in `components/ui/`, materials/elevation tokens, `.btn-red` for hero CTAs.

### 0.4 Net scope delta after review

- **Removed/de-scoped** (already shipped): semantic cache, distillation flywheel core,
  groundedness/hallucination scoring, model routing, base policy-pack system, org switcher.
- **Reframed as extensions** (seed exists): Audit Spine (extends `audit_engine`+`violation_ledger`),
  Trust protocol (extends a2a provenance/agent-card identity), DPE (extends `governance/rules_engine`+`eval`),
  Context Window Manager (extends `workflow/activities`), onboarding UI (extends shipped onboarding).
- **Genuinely net-new** (build from scratch): MAL, browser framework, enterprise connectors
  (SAP/Workday/Oracle), HMAC audit chaining + SIEM, Ed25519 delegation tokens, voice, and the
  new admin UIs (Agent Studio, Rules Workbench, Integration Hub).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Gap Analysis — What Exists vs What EMAOP Adds](#2-gap-analysis)
3. [10x Competitive Advantage](#3-10x-competitive-advantage)
4. [Phase 1 — Security Infrastructure (v1.0, Weeks 1–6)](#4-phase-1)
5. [Phase 2 — Full DPE + Enterprise Manifest (v1.0→1.5, Weeks 7–12)](#5-phase-2)
6. [Phase 3 — Connectors, Onboarding & Admin Console (v2.0, Weeks 13–20)](#6-phase-3)
7. [Phase 4 — Hyperscale + Advanced Features (v3.0, Weeks 21–28)](#7-phase-4)
8. [Critical Files — Modify vs Create](#8-critical-files)
9. [Monetization Tier Mapping](#9-monetization-tier-mapping)
10. [Hyperscale Architecture Notes](#10-hyperscale-architecture-notes)
11. [Verification & Testing](#11-verification--testing)

---

## 1. Executive Summary

EMAOP (Enterprise Multi-Agent Orchestration Platform, v1.1) defines a production-grade enterprise agent system with components that either don't exist in Actrone or exist only partially. This plan integrates them to:

1. **Make Actrone agents categorically better** — not marginally — than every competitor
2. **Unlock regulated-industry enterprise markets** that no other agent platform can legally serve
3. **Expand ARPU at every pricing tier** through new capability gates and compliance features

The existing monetization strategy (governed task runs, savings dividend, marketplace 20% fee, distillation flywheel) is sound. EMAOP adds premium capabilities that justify $5k–$100k/month enterprise contracts.

### Guiding principle: extend, don't rebuild

The existing orchestrator IS the Cognitive Kernel. The existing MCPHub IS the connector framework seed. The existing governance engine IS the DPE seed. Every EMAOP component is an additive layer on top of what Actrone already has.

---

## 2. Gap Analysis

### What Actrone already has

| Component | Location | Status |
|-----------|----------|--------|
| Cognitive Kernel | `backend/orchestrator/` (Go, Temporal) | Complete |
| Partial DPE | `internal/governance/` (6 output evaluators, Merkle violation ledger) | Partial |
| Memory | `actrone-memory/` (Redis L1 + Qdrant L2) | Complete |
| Partial connector framework | `internal/mcphub/` (OAuth 2.1 + PKCE + AES-256-GCM vault) | Partial |
| A2A registry | `internal/a2a/registry.go` (unauthenticated cross-agent routing) | Partial |
| Audit log | `ViolationLedger` SHA-256 Merkle chain | Partial — not tamper-evident |
| Cost optimization | savings spine, quality gate (`eval/`), **semantic cache (`semcache/` — shipped)**, model routing (`optimizer/` + `00026_route_policy`) | Mostly complete (see §0.1) |
| Distillation flywheel | `distill/` (dataset, eligibility, promotion, resolver, serving, failover) | Shipped — only scheduler trigger remains (was misfiled as Phase 4) |
| Reasoning audit | `governance/audit_engine.go` (meta-LLM reviewer, captures full reasoning chain) + `violation_ledger.go` (SHA-256 chain) | Partial — needs HMAC chaining + SIEM (see §0.1) |
| Compliance policy packs | `governance/policies/{eu-ai-act,fca-mifid-ii,fda-21-cfr-11,fsca,financial-services}.yaml` | Shipped — GDPR/HIPAA extend this |
| Marketplace | `backend/marketplace/` (Stripe + Payoneer) | Complete |
| Frontend | Next.js 16.2 Control Tower — **premium Geist-benchmarked revamp shipped** (design system, OrgBar, entitlements+`FeatureGate`, `useDataView`/`DataToolbar`, onboarding, audit + agent-detail pages) | See §0.3 — reuse, don't rebuild |

### What EMAOP adds (the 11 gaps)

| # | Gap | Impact |
|---|-----|--------|
| 1 | **MAL** — zero PII tokenisation exists; raw data reaches LLM today | Security-critical; blocks enterprise regulated-industry sales |
| 2 | **Full 3-tier DPE** — no pre-execution hard blocks, no threshold rules, no escalation queue | Compliance-critical |
| 3 | **Enterprise Agent Manifest** — no capability enforcement flags, browser tiers, token budget, manifest hash | Required for enterprise agent governance |
| 4 | **Agent Studio** — no agent creation wizard; `/agents` is fleet view only | PLG-critical; users cannot create agents without code |
| 5 | **Context Window Manager** — MAL not integrated into context assembly | Security gap; PII can slip through in context |
| 6 | **Inter-Agent Trust Protocol** — A2A calls are unauthenticated; any agent can impersonate any other | Security-critical in multi-agent deployments |
| 7 | **Browser Capability Framework** — no browser access of any kind | Feature gap vs competitors |
| 8 | **Tamper-Evident Audit Spine** — no HMAC-chained events, no SIEM integration, no reasoning trace | Compliance-critical for HIPAA/SOC2 |
| 9 | **Seamless Onboarding** — no sandbox demo, no guided wizard, no starter templates | PLG conversion-critical |
| 10 | **Enterprise Connectors** — only SaaS via MCP; no SAP, Workday, Oracle, ADP | Enterprise market entry blocker |
| 11 | **RBAC (5-role model)** — no role differentiation beyond basic Clerk org roles | Enterprise access control requirement |

---

## 3. 10x Competitive Advantage

The five structural differentiators that make Actrone **categorically** different from OpenClaw, OpenAI Agents SDK, LangChain, AutoGen, CrewAI, and every agent gateway (Portkey, LiteLLM, Helicone):

### 3.1 MAL — the PII guarantee

Every competitor (OpenAI Agents SDK, LangChain, AutoGen, CrewAI) passes raw enterprise data to the LLM. When their agent connects to Workday, the employee's `$52,500` salary appears verbatim in the model context.

With Actrone's MAL: `$52,500` → `FINANCIAL_SALARY_a3f9b2c1` before any LLM inference. HashiCorp Vault holds the mapping with a task-scoped TTL. The same salary gets a different token in every task. **This is not a filter — it is a mathematical guarantee**. No raw PII value can traverse the LLM boundary.

### 3.2 DPE pre-execution — blocked before the LLM call

Competitor guardrails (LangGuard, LlamaGuard, output filters) run **post-generation**. By the time they fire, the LLM has already processed PII, spent tokens, and generated the blocked output.

Actrone's DPE Tier 1 operates at task admission — the Temporal workflow never starts for a hard-blocked task. Cost and latency of a blocked task = 30ms instead of 2-30 seconds. Tier 2 threshold rules run before the LLM inference activity.

### 3.3 Inter-agent trust — cryptographic, not assumed

When CrewAI's HR agent asks its Finance agent to look up a salary, there is no authentication. Any agent can impersonate any other.

Actrone's Ed25519 delegation tokens make this impossible: the Finance agent's DPE verifies the signature of the HR agent's request before executing any action. A compromised sub-agent cannot escalate its own privileges.

### 3.4 Browser + MAL — the only compliance-safe browser agent

OpenAI's CUA (Computer Use Agent) passes raw screenshots and HTML directly to the model. A vendor portal page containing salary data or contract values enters the LLM context as-is.

Actrone's `browser_read_only` tier intercepts every HTTP response through the MAL classifier before it becomes a tool result. For `browser_authenticated`, credentials never leave Vault — the browser container injects them directly. For `browser_form_submit`, a human must approve every form submission via the escalation queue. **No raw web content ever reaches the LLM.** This is structural, not configurable.

### 3.5 Tamper-evident Audit Spine — the compliance moat

LangSmith, LangFuse, and other observability tools record traces, but their chains are mutable. An operator can delete log entries. A regulator cannot rely on them.

Actrone's Audit Spine uses HMAC chaining: `HMAC(event_n)` includes `event_{n-1}.id`. Any deletion or modification breaks the chain in a way that is **mathematically detectable**. A regulator with read-only Audit Spine access can verify chain integrity independently. This is required for HIPAA BAA, SOC2 Type II, and FCA MiFID II. No current agent framework can satisfy these requirements.

### Combined effect — the compliance moat

An enterprise in a regulated industry (financial services, healthcare, HR) cannot use OpenAI Agents SDK or LangChain in production — those platforms cannot make the governance guarantees required to pass a compliance audit. Actrone with EMAOP is the **only** platform that can. This creates a premium pricing tier (2-5x over competitors) that is justified and sustainable.

---

## 4. Phase 1 — Security Infrastructure (Weeks 1–6) · v1.0 Foundation

**Build MAL first. Everything else in EMAOP touches the LLM boundary and requires MAL to be operational before it is safe to deploy.**

### 4.1 MAL Core — `backend/orchestrator/internal/mal/`

**`classifier.go`** — 3-stage field classification pipeline
- Stage 1 (static): per-connector `mal_schema.yaml` declares field classifications: `PII_HIGH | PII_LOW | FINANCIAL | SENSITIVE | PUBLIC`
- Stage 2 (dynamic): regex + entropy scoring for credit cards, national IDs, bank accounts; lightweight ONNX model (loaded via `tetratelabs/wazero`, already in go.mod) for free-text PII detection
- Stage 3 (audit): every classification decision written to `field_classifications` table: `(field_path, classification, confidence, stage, tenant_id, task_id, created_at)`
- P95 target: < 25ms per task (DEK cached 5 minutes; token generation is in-process O(n_pii_fields))

**`tokeniser.go`** — per-task PII substitution
- On task admission: scan all fields classified PII/FINANCIAL/SENSITIVE; generate per-task tokens: `PII_FNAME_<uuidv4>`
- Token-to-value mappings stored in HashiCorp Vault transit engine at `secret/tokens/<tenant_id>/<task_id>/<token_id>` with task-scoped TTL
- On task completion: MAL detokenises the **final output only** — intermediate LLM turns stay tokenised throughout

**`vault_client.go`** — HashiCorp Vault integration
- Envelope encryption: per-tenant DEK (AES-256) wrapped by KEK in Vault transit engine; 90-day rotation cron in `main.go`
- DEK in-memory cache: 5-minute TTL → Vault call rate ≈ 1 per 5 minutes per tenant regardless of task throughput
- Add `github.com/hashicorp/vault-client-go` to `go.mod`

**`schema_version.go`** — schema drift detection
- On every connector response: compute `SHA-256(field_names)` against pinned version in `schema_versions` table
- Drift detected → emit `SchemaVersionDrift` event to Audit Spine; affected agent tasks enter `schema_drift_hold` status

**Wire into Temporal workflow** (`internal/workflow/task_workflow.go`):
- Insert `MALTokeniseInput` as **Activity 0** (before ValidateAgentFile)
- Insert `MALDetokeniseOutput` as **Activity N+2** (last, before returning result)
- `AgentTaskInput` carries `TokenContextID string`

**Migration `00026_mal_tokens.sql`:**
```sql
CREATE TABLE field_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL, task_id UUID NOT NULL,
  field_path TEXT NOT NULL, classification TEXT NOT NULL,
  confidence NUMERIC(4,3), stage SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE schema_versions (
  id UUID PRIMARY KEY, connector_id TEXT NOT NULL,
  tenant_id UUID NOT NULL, schema_hash TEXT NOT NULL,
  version INT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.2 Inter-Agent Trust Protocol — `backend/orchestrator/internal/trust/`

**`identity_registry.go`**: `agent_identities` table (agent_id, public_key_ed25519, tenant_id, revoked_at). Populated at agent registration — each agent gets an Ed25519 keypair; private key stored in Vault at `secret/agent-keys/<agent_id>/private`.

**`delegation.go`**:
- `GenerateDelegationToken(ctx, requestingAgentID, targetAgentID, scope[], taskContextHash)` — signs EdDSA JWT, 5-minute TTL
- `VerifyDelegationToken(ctx, token, targetAgentID)` — loads requesting agent's public key from registry; verifies signature, expiry, and target match

**Modify `internal/a2a/registry.go`** `Execute()`: call `trust.VerifyDelegationToken` before any cross-agent dispatch; block with `ERR_TRUST_VIOLATION` if absent/invalid.

**Migration `00028_trust_identities.sql`:**
```sql
CREATE TABLE agent_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE, tenant_id UUID NOT NULL,
  public_key_ed25519 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
```

### 4.3 Tamper-Evident Audit Spine — `backend/orchestrator/internal/audit/`

**`spine.go`** — HMAC-chained event log
- `AuditEvent` struct: `{event_id UUIDv7, tenant_id, agent_id, task_id, event_type, payload jsonb, reasoning_trace jsonb, hmac_signature, prev_event_id, created_at}`
- HMAC: `HMAC-SHA256(event_id + tenant_id + payload + prev_event_id, vault_tenant_key)`
- Synchronous PostgreSQL write using `pgx/v5 CopyFrom` (COPY protocol for batch throughput — not INSERT row-by-row)
- Async NATS JetStream publish (already in infra; handles 10k events/second without additional infra)
- Buffered channel (100k capacity) + 100ms flush interval + 1k-event batch = ≤ 10 DB writes/second at full platform load

**`reasoning_trace.go`** — 6-step decision chain assembler
1. Trigger received (type, source, timestamp)
2. Context assembled (memory chunks with cosine scores, token counts)
3. MAL tokenisation applied (fields tokenised vs passed-through per classification tier)
4. Inference call (model name, prompt hash, token usage, latency)
5. DPE evaluation (rules evaluated, tier reached, verdict, rule ID matched)
6. Action executed or escalated (outcome, system affected, response received)

**`siem.go`** — SIEM integration (Enterprise plan gate)
- Interface: `SIEMConnector { Send(ctx, events []AuditEvent) error }`
- Implementations: `SplunkHECConnector`, `DatadogLogsConnector`, `SentinelConnector`
- Plan gate: check org plan via existing `PlanResolver` pattern (`mcphub/tier.go`) before forwarding

**Migration `00029_audit_spine.sql`:**
```sql
CREATE TABLE audit_events (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL,
  agent_id UUID, task_id UUID, event_type TEXT NOT NULL,
  payload JSONB, reasoning_trace JSONB,
  hmac_signature TEXT NOT NULL, prev_event_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_events_tenant_created ON audit_events (tenant_id, created_at DESC);
```

---

## 5. Phase 2 — Full DPE + Enterprise Manifest (Weeks 7–12) · v1.0→v1.5

**Requires Phase 1 MAL to be complete — DPE pre-execution runs on MAL-tokenised inputs.**

### 5.1 Full 3-Tier DPE — `backend/orchestrator/internal/dpe/`

**`engine.go`**
- **Tier 1 — HardBlock**: Evaluated synchronously at task admission. Checks agent capability flags. If `browser_autonomous: false` and task proposes a browser autonomous tool call → immediate `ERR_GOVERNANCE_BLOCK`. Temporal workflow never starts. LLM spend = $0.
- **Tier 2 — ThresholdEval**: Before LLM inference. Evaluates enterprise-configured condition-action rules from `dpe_rules` table (60-second in-memory cache). Example: `IF SAP_transaction_amount > $50,000 AND approver_not_assigned THEN block`.
- **Tier 3 — HumanEscalation**: When LLM output confidence < configured threshold OR rule fires escalation. Creates `escalation_queue` entry with SLA countdown. Task enters `pending_escalation` status in Temporal. On approval → `workflow.Signal("escalation_approved")`. On SLA breach → escalation chain policy (notify primary → secondary → auto-deny).

**`rule_loader.go`**: versioned rule set management with 60-second cache. `ValidateRuleSet(rules)` prevents invalid rules reaching production.

**`sandbox_replay.go`**: 30-day historical replay engine for Rules Workbench. Runs as Temporal activity; result stored in `rule_sandbox_results` for frontend polling.

**Extend `internal/governance/rules_engine.go`**:
- `EvaluateSync` → add `dpe.Engine.EvaluateTier2()` call after existing 6 evaluators
- Add `EvaluateWithEscalation()` routing to Tier 3 when confidence below threshold

**Insert** `DPEPreExecution` as **Activity 1.5** in `task_workflow.go` (after MALTokeniseInput, before first LLM call).

**New HTTP endpoints** in `internal/handler/http/dpe.go`:
```
POST   /v1/governance/rules                     — create new rule set version
GET    /v1/governance/rules                     — list versions
POST   /v1/governance/rules/{ver}/sandbox       — trigger 30-day replay (async)
GET    /v1/governance/rules/{ver}/sandbox/{id}  — poll sandbox results
GET    /v1/governance/escalations               — list pending approvals with SLA
POST   /v1/governance/escalations/{id}/approve
POST   /v1/governance/escalations/{id}/deny
```

**Migrations `00027_dpe_rules.sql`:**
```sql
CREATE TABLE dpe_rules (id UUID PK, tenant_id UUID, version INT, rules JSONB, created_at, activated_at, created_by UUID);
CREATE TABLE escalation_queue (id UUID PK, task_id UUID, tenant_id UUID, agent_id UUID, dpe_rule_id UUID, tier SMALLINT, confidence_score NUMERIC, sla_deadline TIMESTAMPTZ, approver_id UUID, status TEXT, created_at, resolved_at);
CREATE TABLE rule_sandbox_results (id UUID PK, tenant_id UUID, rule_version INT, status TEXT, results JSONB, created_at);
```

### 5.2 Enterprise Agent Manifest

**Extend `internal/domain/agent.go`** — add to `AgentSpec`:
```go
Capabilities    AgentCapabilities   // enforced at Kernel level; LLM cannot exceed these
TokenBudget     TokenBudgetSpec     // monthly_limit_usd, on_exhaustion: pause|notify|hard_stop
Schedule        ScheduleSpec        // timezone, active_days, active_from/until, trigger_modes
EscalationChain EscalationSpec      // primary_approver, sla_hours, sla_breach_policy
ManifestHash    string              // SHA-256(yaml bytes) — loaded and verified on every instantiation
```

```go
type AgentCapabilities struct {
    SendEmail           bool
    ScheduleMeetings    bool
    MakeVoiceCalls      bool
    GenerateReports     bool
    PostToMessaging     bool
    WebSearch           bool
    CreateTickets       bool
    ChairMeetings       bool
    BrowserReadOnly     bool
    BrowserAuthenticated bool
    BrowserFormSubmit   bool
    BrowserAutonomous   bool
    DatabaseWriteAccess bool
    ExternalAPIAccess   bool
}
```

**Extend `internal/agent/parser.go`** — `validate()`:
- Compute `SHA-256(yamlBytes)` and verify against stored `ManifestHash` on re-loads (detects tampering)
- Validate capability flags against tenant plan tier using existing `mcphub.PlanAllows()` pattern (`browser_autonomous` → Enterprise only; `browser_form_submit` → Business+)

### 5.3 Browser Capability Framework — `backend/orchestrator/internal/browser/`

**The single most differentiated capability in the platform. Build it carefully.**

**`service.go`** — browser session lifecycle
- `CreateSession(ctx, agentID, tenantID, tier BrowserTier)` — spins Playwright container via Kubernetes Job API
- Pre-warm idle pool: 2 containers/tenant (Business), 5 (Enterprise)
- Session TTL = task lifetime; container destroyed on task close; all cookies/credentials purged

**`mal_interceptor.go`** — MAL content interception
- Every HTTP response intercepted via Playwright's `page.route()` hook
- Content piped through `mal.Classifier.ClassifyContent(ctx, content)` before delivery to tool handler
- PII in web content tokenised using task's `TokenContextID`
- **`ToolResult.Output` only ever contains tokenised content — guaranteed by architecture**

**`tiers.go`** — 4-tier enforcement

| Tier | Flag | DPE Gate | Vault | Audit |
|------|------|----------|-------|-------|
| Read-only | `browser_read_only` | Domain allowlist check | None | URL + MAL decisions |
| Authenticated | `browser_authenticated` | DPE Tier 2 approval | Credential injection | + credential usage |
| Form Submit | `browser_form_submit` | Mandatory Tier 3 human review | Scoped creds | + form content screenshot |
| Autonomous | `browser_autonomous` | Confidence threshold + human review queue | Full Vault | Full session recording |

**Register browser tool handlers** in `internal/tool/supervisor.go`: `browser_navigate`, `browser_click`, `browser_screenshot`, `browser_fill_form`, `browser_submit`. These route through `browser.Service`. Step 1 (allowed_tools check) validates capability tier; Step 6 (budget check) attributes browser cost to the agent's token budget.

**New migration `00030_browser_sessions.sql`:**
```sql
CREATE TABLE browser_sessions (
  id UUID PK, task_id UUID, agent_id UUID, tenant_id UUID,
  tier TEXT NOT NULL, domain_allowlist JSONB,
  created_at TIMESTAMPTZ, closed_at TIMESTAMPTZ,
  screenshot_count INT DEFAULT 0, mal_intercept_count INT DEFAULT 0
);
```

---

## 6. Phase 3 — Connectors, Onboarding & Admin Console (Weeks 13–20) · v2.0

### 6.1 Connector Contract Registry — `backend/orchestrator/internal/connector/`

**`registry.go`**: contract = `{connector_id, version, schema_hash, field_classifications, required_scopes[], approved_at}`. On each connector poll: hash field names → compare against approved contract → drift → `SchemaVersionDrift` event → agent tasks enter `schema_drift_hold` until admin re-approves.

**`erp.go`**: SAP S/4HANA (OData/BAPI over HTTPS) + Oracle NetSuite (REST/SOAP) adapters. Credentials in Vault (extend existing `mcphub/vault.go` pattern). All responses wrapped in `ConnectorResponse{raw, classified_fields, schema_version}` before MAL.

**`hris.go`**: Workday, BambooHR, ADP adapters. All HRIS fields default to `PII_HIGH` in MAL without any configuration required.

**`scope_minimizer.go`**: `MinimizeScopes(agentCapabilities, connectorScopeCatalog) []string` — only request OAuth scopes the agent's declared capabilities actually require.

**Modify `internal/mcphub/service.go`** `ResolveForAgent()`: also resolve enterprise connector bindings; add `ScopeMinimizer` dependency; call scope minimisation before OAuth flows; add drift check during `List()`.

**Migration `00032_connector_contracts.sql`.**

### 6.2 Context Window Manager

**Extend `internal/workflow/activities.go`** — activity `AssembleContext`:
- Retrieves episodic memory chunks from Qdrant (cosine similarity ≥ 0.78, from existing `SearchMemory`)
- Retrieves MAL-tokenised data from connected systems using `mal.TokenContextID` from Activity 0
- Assembles: task description + episodic memory (embeddings only, not raw data) + role policy package + MAL-tokenised connector data + sliding conversation history window
- Enforces token budget (truncates oldest history first on overflow)
- Before ANY assembled data enters the context: verify through `TokenContextID` lookup that no raw PII slipped through from a connector response
- Writes context assembly summary to Audit Spine reasoning trace (Step 2 of the 6-step trace)

### 6.3 Seamless Onboarding — `backend/orchestrator/internal/onboarding/`

**`sandbox.go`**: per-vertical synthetic datasets (HR: fake org charts + salary bands; Finance: fake invoices + GL; IT Support: fake ticket queues; Procurement: fake POs). `CreateSandboxSession(userID, vertical)` clones into ephemeral Postgres schema with 24-hour TTL.

**`flow.go`**: guided flow state machine. States: `SIGNED_UP → SANDBOX_RUNNING → FIRST_CONNECTOR → FIRST_AGENT → FIRST_TASK → GRADUATED`. Transitions trigger contextual notifications via `internal/notify/`.

**`templates.go`**: starter template catalog. Each = complete AgentFile YAML + governance policy + connector list + sample tasks.
Templates: `hr-leave-processor`, `finance-invoice-approver`, `it-ticket-triage`, `procurement-po-validator`.

**New HTTP endpoints** in `internal/handler/http/onboarding.go`:
```
POST /v1/onboarding/start       — create sandbox, deploy first agent
GET  /v1/onboarding/state       — current state
GET  /v1/onboarding/templates   — list vertical templates
POST /v1/onboarding/connect     — Layer 2: initiate first real connector OAuth
```

**Onboarding SLO targets (from EMAOP §13.4):**

| Milestone | Target |
|-----------|--------|
| Signup → first agent running in sandbox | < 5 minutes |
| Signup → first real system connected | < 30 minutes |
| Signup → first production action confirmed | < 2 hours (self-serve) |
| Layer 1 → Layer 2 conversion | > 60% |
| Layer 2 → Layer 3 conversion | > 40% |

### 6.4 Admin Console — New & Extended Frontend Routes

All routes in `frontend/src/app/(app)/`.

---

#### Agent Studio — `agents/new/page.tsx`

**The single most critical missing UI feature.** Currently `/agents` is a fleet view. No creation wizard exists. Agent Studio is a 5-step multi-page wizard that produces and deploys a complete EMAOP-format Agent Manifest.

**Step 1 — Template Selection**
Grid of vertical cards: HR, Finance, IT Support, Procurement, Blank. Selecting a template pre-fills Steps 2–5. Live "estimated setup time" indicator.

**Step 2 — Persona**
Fields: agent name, role_category, tone (professional_concise / warm_collaborative / technical_precise), language selector, avatar icon (Lucide icon picker), avatar color. Live preview panel shows agent card as it will appear in Control Tower.

**Step 3 — Capabilities**
Toggle grid for all `AgentCapabilities` flags. Per-toggle:
- What this enables (tooltip)
- Which plan tier is required (grayed + upgrade CTA if not on eligible plan)
- Which DPE rules are auto-applied on activation

Browser tiers shown as a 4-step progression bar (Read-only → Authenticated → Form Submit → Autonomous) with per-tier unlock status and plan requirement.

**Step 4 — Integrations**
Searchable connector catalog grouped by: SaaS / ERP / HRIS / Legacy / Custom. Per-connector:
- One-click OAuth initiation (Vault-secured OAuth flow)
- Connected status with last sync timestamp
- Requested scopes (scope minimisation applied; scope list shown for admin review)
- MAL field classification preview — which fields from this connector are PII_HIGH/FINANCIAL/etc.
- "Test connection" button verifies read access before proceeding

**Step 5 — Rules & Deployment**
- Token budget: monthly limit ($USD) + on_exhaustion policy
- Active schedule: timezone + day/hour range + trigger mode (scheduled / event_driven / webhook_inbound)
- Escalation chain: primary approver (user picker) + SLA hours + SLA breach policy
- Pre-populated Tier 1 hard-block rules from capability flags in Step 3 (shown read-only)
- Inline Tier 2 rule builder for simple threshold rules (link to Rules Workbench for advanced rules)
- **"Validate in sandbox"** button: deploys manifest against the synthetic sandbox dataset; shows live reasoning trace in real time
- **"Deploy agent"** button: `POST /v1/agents` with full manifest; redirects to Control Tower with new agent highlighted

Backend: extend `POST /v1/agents` to accept and validate the full EMAOP manifest schema. Store `ManifestHash = SHA-256(json.Marshal(manifest))` on creation.

Component breakdown:
```
frontend/src/components/features/agent-studio/
  TemplateSelector.tsx
  PersonaConfig.tsx
  CapabilityToggles.tsx
  IntegrationSelector.tsx
  RulesDeployment.tsx
  ManifestPreview.tsx
  SandboxValidation.tsx
```

---

#### Rules Workbench — `rules/page.tsx`

Visual no-code DPE rule builder — the governance configuration surface for enterprise admins.

- Drag-and-drop rule builder (React DnD Kit)
- Rule type palette: Threshold (slider + numeric input), Schedule (calendar picker), Access Control (role/system selector), Confidence (gauge), Sequence (ordered list), Escalation Chain (user/group picker with SLA input)
- Plain-English rule preview: "If expense amount exceeds $500 and no manager approval is set → escalate to finance.lead@acme.com within 4 hours"
- **"Test this ruleset"** button → `POST /v1/governance/rules/{ver}/sandbox`; progress bar with estimated time; results table showing:
  - How many historical tasks would have been approved / blocked / escalated
  - Diff vs current active rule set (which tasks changed outcome)
  - Specific task examples for each changed outcome
- Rule version history panel: all versions, activation timestamps, active indicator, one-click rollback, diff viewer between versions
- Promote button: moves sandbox-validated version to production

Component breakdown:
```
frontend/src/components/features/rules-workbench/
  RuleBuilder.tsx
  RuleTypePalette.tsx
  RulePlainEnglishPreview.tsx
  SandboxResults.tsx
  VersionHistory.tsx
  VersionDiff.tsx
```

---

#### Integration Hub — `integrations/page.tsx`

Replaces `(app)/mcp/`. Full connector lifecycle management including enterprise ERP/HRIS systems.

- Connector catalog grouped by: SaaS / ERP / HRIS / Legacy / Custom REST
- Per-connector card: OAuth button (or API key form), connection status, last synced, schema version, schema drift alert badge (amber/red)
- **Field classification panel** (drawer): per-field table showing name, type, inferred classification (PII_HIGH / PII_LOW / FINANCIAL / SENSITIVE / PUBLIC), MAL handling instruction (tokenise / pass-through / block), override control with audit trail
- **Contract approval workflow**: "Schema changed — 3 new fields detected. Review field classifications and approve to resume 2 affected agents."
- **Scope minimisation panel**: shows exact OAuth scopes being requested grouped by which agent capability requires each scope — admin approves scope list before OAuth flow begins
- **Custom connector builder** (no-code REST API):
  1. Define base URL + auth method (API key / Bearer / OAuth 2.0)
  2. Map endpoints to action types (read / write / event)
  3. Define field schema + MAL classification per field
  4. Test connection in sandbox
  5. Activate

---

#### Audit Viewer — `audit/page.tsx`

Full audit log with compliance export. The Auditor role sees only this page.

- Filters: time range, event type (action_proposed / dpe_verdict / action_executed / escalation_raised), agent, DPE tier, severity, outcome
- Per-event row: event type chip, agent name, task ID, timestamp, DPE verdict badge (approved / blocked / escalated), outcome
- **Reasoning trace drill-down** (accordion): click any event → full 6-step chain
  1. Trigger (type, source)
  2. Context assembled (memory chunks with cosine scores, token counts by type)
  3. MAL tokenisation (fields tokenised vs passed-through, counts per classification tier)
  4. Inference (model name, prompt hash, token usage, latency)
  5. DPE evaluation (rules evaluated, tier reached, matched rule ID, verdict)
  6. Action (outcome, system affected, connector response code)
- **HMAC integrity indicator**: green checkmark if chain is intact; red warning if any tampering detected
- **Export**: GDPR/HIPAA/SOC2 formatted signed PDF report
- **Regulator link** (Enterprise only): scoped read-only JWT; generates shareable URL for external auditor access

---

#### Enhanced Control Tower — extend `dashboard/page.tsx`

Current dashboard has basic metrics. EMAOP Control Tower requires real-time operational controls not yet present.

- **Emergency controls bar** (sticky, top of page, always visible):
  - Per-agent: "Pause" button → `POST /v1/agents/{id}/pause` (queues tasks, no action taken, visible immediately in agent tile)
  - "Emergency Stop All" → confirmation modal → `POST /v1/agents/pause-all` (tenant-wide)
  - "Force Escalate All Pending" → `POST /v1/tasks/force-escalate-all`
  - Per-connector "Revoke Access" → `DELETE /v1/connectors/{id}/access`

- **Real-time agent state grid** (WebSocket subscription `ws://orchestrator/v1/control-tower/stream`):
  - Per-agent tile: current task count, queue depth, last action summary, last heartbeat, DPE verdict ratio mini-chart
  - Status chip: Active / Paused / Schema Drift Hold / Budget Exhausted / Degraded

- **Escalation panel** (right sidebar): SLA countdown timers (amber < 2 hours, red < 30 minutes), approve/deny inline

- **System health** (bottom bar): connector status (green/amber/red), MAL throughput (ops/sec), Kernel P95 latency, DPE verdict ratio donut

- **Token budget gauge** per agent: real-time usage vs monthly limit bar; amber at 80%, red at 95%

New backend: `GET /v1/control-tower/stream` WebSocket that pushes `ControlTowerEvent` structs.

```
frontend/src/components/features/control-tower/
  EmergencyControls.tsx
  AgentStateGrid.tsx
  AgentStateTile.tsx
  EscalationPanel.tsx
  SystemHealth.tsx
  TokenBudgetGauge.tsx
```

---

#### Usage & Governance — `usage/page.tsx` (replaces/extends `cost/`)

Unified token consumption, cost allocation, and performance dashboard.

- Token consumption: per-agent bar chart (monthly actuals vs budget), platform total
- Cost allocation: breakdown by agent → department/team label (label in agent manifest)
- Performance: request latency P50/P95/P99 per agent, error rate, throughput
- Burn-rate graph: 30-day rolling with projection line to monthly budget
- DPE verdict breakdown: per-agent pie chart (approved/blocked/escalated/pending)
- Cost Monitor (existing `cost/` content): savings attribution, routing dividend, batch mode savings — integrated as a tab

---

#### Team & Roles — extend `settings/team/page.tsx`

Implement the 5 EMAOP RBAC roles using Clerk Organizations as the tenant boundary.

| Role | Access |
|------|--------|
| Agent Operator | Trigger, pause, view tasks; read audit |
| Agent Admin | Create/edit/deploy agents and rules; all Operator access |
| Integration Admin | Manage connections, credentials, MAL field config; no agent admin |
| Auditor | Read-only audit spine and reasoning traces; no action rights |
| Super Admin | All permissions + user management + billing |

**Implementation:**
- Invite flow with role dropdown; pending invitations panel
- Role-based route guards via `frontend/src/middleware.ts` using `actrone_role` Clerk custom claim
- Role-based feature gating: `useCurrentUserRole()` hook hides/disables controls per role
- Backend: add `RequireRole(roles ...string)` middleware to `internal/middleware/auth.go`; validates `actrone_role` claim from Clerk JWT
- SSO/SAML role mapping (Enterprise): map IdP group → Actrone role in Settings → SSO Configuration

---

#### Onboarding Wizard — `onboarding/page.tsx`

**Layer 1 (< 5 minutes — no credit card, no real connections):**
1. SSO sign-in (Google/Microsoft — already Clerk; redirect to onboarding post-login)
2. Vertical picker: HR / Finance / IT Support / Procurement with description cards
3. "Your Finance agent is starting..." — live reasoning trace card showing the synthetic agent completing a real task against synthetic data (actual task execution, not an animation)
4. "Try it yourself" — single interaction prompt; shows result

**Layer 2 (< 30 minutes — first real connection):**
- "Your agent is ready for real data. Connect Microsoft 365 to go live."
- Two-click OAuth approval (minimal scopes, shown to user)
- First real action as a **confirmation prompt** (not automatic): "I detected an invoice awaiting approval and drafted this email to the vendor. Send it?"
- This moment simultaneously demonstrates the platform's intelligence AND its governance model

**Layer 3 — in-product completion checklist** (persisted in `onboarding_states`):
```
[ ] Persona defined
[ ] Rules configured
[ ] Sandbox tested
[ ] Real connection live
[ ] First production action confirmed
```

---

## 7. Phase 4 — Hyperscale + Advanced Features (Weeks 21–28) · v3.0

- **`browser_autonomous` completion**: confidence threshold pipeline + human review queue UI in `audit/page.tsx` escalation panel; full session recording playback in Audit Viewer

- **SIEM integration completion**: `internal/audit/siem.go` connectors (Splunk HEC, Datadog Logs API, Microsoft Sentinel); SIEM config in `internal/config/config.go`; SIEM settings UI in `settings/organization/page.tsx` (Enterprise plan gate)

- **Voice capability v2** — `backend/orchestrator/internal/voice/`:
  - `pipeline.go`: WebRTC audio pipeline (sub-250ms latency); Whisper/Deepgram STT; ElevenLabs/OpenAI TTS
  - `meeting_bot.go`: meeting participant bot that ingests transcript → triggers agent task on action items
  - `capability.go`: `make_voice_calls` manifest flag enforcement (same pattern as browser tiers)
  - Agent Studio Step 3: voice toggle (grayed with "v2 — coming soon" until shipped)
  - Control Tower: voice task tiles show call duration, transcript snippet, actions generated

- **Distillation flywheel completion**: `internal/governance/distillation_scheduler.go` — when tenant's approved corrections exceed the configured threshold, auto-create fine-tuning job (extends existing `feedback_loop.go` + `corrections` table). This is Wave 4 of the existing cost-leadership roadmap.

- **Multi-tenant admin**: org switcher for users with multiple tenants; deployment model selection UI (Cloud SaaS / Single-tenant / Self-hosted) for Enterprise onboarding Layer 4

- **Custom connector builder backend**: `connector/custom_builder.go` handling no-code REST API connector creation flow defined in the Integration Hub UI

---

## 8. Critical Files — Modify vs Create

### Files to Modify

| File | Change |
|------|--------|
| `backend/orchestrator/internal/domain/agent.go` | Add `AgentCapabilities`, `TokenBudgetSpec`, `ScheduleSpec`, `EscalationSpec`, `ManifestHash` to `AgentSpec` |
| `backend/orchestrator/internal/agent/parser.go` | Extend `validate()`: manifest hash check, capability-vs-plan validation, escalation chain validation |
| `backend/orchestrator/internal/workflow/task_workflow.go` | Insert Activities 0, 1.5, N+1, N+2 (MAL tokenise, DPE pre-check, Audit Spine write, MAL detokenise) |
| `backend/orchestrator/internal/workflow/activities.go` | Add `AssembleContext` MAL integration; add 4 new activity signatures |
| `backend/orchestrator/internal/service/activity_service.go` | Implement 4 new activities; extend `ActivityServiceConfig` with `MALService`, `DPEEngine`, `AuditSpine`, `BrowserService` |
| `backend/orchestrator/internal/governance/rules_engine.go` | Add `dpe.Engine.EvaluateTier2()` in `EvaluateSync`; add `EvaluateWithEscalation()` |
| `backend/orchestrator/internal/a2a/registry.go` | Add `trust.VerifyDelegationToken()` in `Execute()` before cross-agent dispatch |
| `backend/orchestrator/internal/tool/supervisor.go` | Insert MAL pre-tool-call check as Step 0; register browser tool handlers |
| `backend/orchestrator/internal/mcphub/service.go` | Wire `connector.Registry`, `ScopeMinimizer`, contract drift check |
| `backend/orchestrator/internal/config/config.go` | Add `MALConfig`, `DPEConfig`, `BrowserConfig`, `SIEMConfig`, `OnboardingConfig`, `VoiceConfig` |
| `backend/orchestrator/cmd/orchestrator/main.go` | Bootstrap: MAL, DPE, AuditSpine, BrowserService, TrustRegistry, ConnectorRegistry |
| `backend/orchestrator/internal/handler/http/governance.go` | Add DPE rule endpoints, escalation queue endpoints, regulator export endpoint |
| `backend/orchestrator/internal/middleware/auth.go` | Add `RequireRole(roles ...string)` middleware using Clerk JWT `actrone_role` custom claim |
| `frontend/src/app/(app)/governance/page.tsx` | Add escalation panel, DPE verdict charts, reasoning trace drill-down |
| `frontend/src/app/(app)/dashboard/page.tsx` | Add emergency controls bar, real-time agent state grid, system health sidebar (WebSocket) |
| `frontend/src/app/(app)/cost/page.tsx` | Rename to `usage/`; add token budget gauges, cost allocation, latency panels, DPE verdict donuts |
| `frontend/src/app/(app)/settings/team/page.tsx` | Implement 5 EMAOP RBAC roles, role assignment UI, SSO/SAML mapping |
| `frontend/src/middleware.ts` | Add role-based route guards using `actrone_role` Clerk custom claim |

### New Packages to Create

```
backend/orchestrator/internal/mal/
  classifier.go, tokeniser.go, vault_client.go, schema_version.go

backend/orchestrator/internal/trust/
  identity_registry.go, delegation.go

backend/orchestrator/internal/audit/
  spine.go, reasoning_trace.go, siem.go

backend/orchestrator/internal/dpe/
  engine.go, rule_loader.go, sandbox_replay.go

backend/orchestrator/internal/browser/
  service.go, mal_interceptor.go, tiers.go

backend/orchestrator/internal/connector/
  registry.go, erp.go, hris.go, scope_minimizer.go, custom_builder.go

backend/orchestrator/internal/onboarding/
  sandbox.go, flow.go, templates.go

backend/orchestrator/internal/voice/             (Phase 4)
  pipeline.go, meeting_bot.go, capability.go

backend/orchestrator/internal/handler/http/
  dpe.go, browser.go, onboarding.go, control_tower.go

backend/orchestrator/migrations/   # renumbered — 00026–00028 already exist (see §0.2)
  00029_mal_tokens.sql
  00030_dpe_rules.sql
  00031_trust_identities.sql
  00032_audit_spine.sql
  00033_browser_sessions.sql
  00034_onboarding.sql
  00035_connector_contracts.sql

frontend/src/app/(app)/agents/new/page.tsx           — Agent Studio wizard
frontend/src/app/(app)/agents/[id]/edit/page.tsx     — Edit agent manifest
frontend/src/app/(app)/rules/page.tsx                — Rules Workbench
frontend/src/app/(app)/integrations/page.tsx         — Integration Hub
frontend/src/app/(app)/audit/page.tsx                — Full Audit Viewer
frontend/src/app/(app)/browser/page.tsx              — Browser session monitoring
frontend/src/app/(app)/onboarding/page.tsx           — Guided onboarding
frontend/src/app/(app)/usage/page.tsx                — Usage & Governance

frontend/src/components/features/agent-studio/
  TemplateSelector.tsx, PersonaConfig.tsx, CapabilityToggles.tsx
  IntegrationSelector.tsx, RulesDeployment.tsx, ManifestPreview.tsx, SandboxValidation.tsx

frontend/src/components/features/control-tower/
  EmergencyControls.tsx, AgentStateGrid.tsx, AgentStateTile.tsx
  EscalationPanel.tsx, SystemHealth.tsx, TokenBudgetGauge.tsx

frontend/src/components/features/rules-workbench/
  RuleBuilder.tsx, RuleTypePalette.tsx, RulePlainEnglishPreview.tsx
  SandboxResults.tsx, VersionHistory.tsx, VersionDiff.tsx
```

### Existing Code to Reuse (Don't Rebuild)

| Existing | How it's reused |
|----------|-----------------|
| `internal/governance/violation_ledger.go` | Becomes consumer of AuditSpine; violations write through HMAC chain |
| `internal/mcphub/vault.go` | Pattern extended to HashiCorp Vault for enterprise connector credentials |
| `internal/mcphub/tier.go` `PlanAllows()` | Reused for browser tier enforcement and SIEM Enterprise gate |
| `internal/savings/service.go` buffered channel | Reused as AuditSpine write buffer (same 100ms flush + batch size pattern) |
| `internal/notify/` | Reused for escalation SLA breach notifications and onboarding transitions |
| `internal/governance/feedback_loop.go` | Extended by `distillation_scheduler.go` in Phase 4 |
| `internal/floors/` | Extended for per-tenant concurrent browser session limits |
| NATS JetStream | Reused as AuditSpine event bus (3-region replication) |
| `internal/mcphub/security.go` RugPullDiff | Identical hash-comparison pattern reused for schema drift detection |

---

## 9. Monetization Tier Mapping

### Feature gates by tier

| Capability | Free | Pro ($99-199/seat) | Business ($2k-5k/mo) | Enterprise ($15k-100k/mo) |
|---|---|---|---|---|
| MAL (static classification) | — | ✅ shared Vault | ✅ per-tenant DEK/KEK | ✅ customer-managed keys |
| DPE Tier 1 (hard blocks) | — | ✅ | ✅ | ✅ |
| DPE Tier 2+3 (threshold + escalation) | — | — | ✅ | ✅ |
| Rules Workbench | — | — | ✅ | ✅ |
| `browser_read_only` | — | ✅ | ✅ | ✅ |
| `browser_authenticated` + `browser_form_submit` | — | — | ✅ | ✅ |
| `browser_autonomous` | — | — | — | ✅ |
| SaaS connectors (M365, Jira, Slack) | — | ✅ | ✅ | ✅ |
| Enterprise connectors (SAP, Workday, Oracle) | — | — | ✅ | ✅ |
| Vertical agent packs (HR/Finance/IT/Procurement) | Free templates | Full packs | Full packs | Custom packs |
| GDPR/POPIA compliance pack | — | — | ✅ | ✅ |
| HIPAA BAA + PHI controls | — | — | — | ✅ |
| SIEM integration (Splunk/Datadog/Sentinel) | — | — | — | ✅ |
| Regulator audit export (read-only shareable) | — | — | — | ✅ |
| Single-tenant / self-hosted | — | — | — | ✅ |
| On-premise / air-gapped | — | — | — | ✅ (premium add-on) |
| Voice capability | — | — | ✅ (v2) | ✅ (v2) |
| SSO/SAML + SCIM | — | — | ✅ | ✅ |
| Professional services (Layer 4) | — | — | — | ✅ add-on |

### New revenue lines from EMAOP

| Revenue Line | Structure | ASP |
|---|---|---|
| **Vertical agent packs** | $299/vertical/month (HR, Finance, IT, Procurement) | $1.2k/year per vertical |
| **Compliance packs** | $199/month each (GDPR, SOC2, HIPAA) | $2.4k/year per compliance module |
| **Browser capability upsell** | Natural Pro → Business pull (authenticated portals) → Enterprise (autonomous) | Drives tier migration |
| **Professional services** | Layer 4: custom connectors, SSO, compliance setup, training | $20k–$200k/engagement |
| **Marketplace premium agents** | Healthcare compliance, legal research, financial modeling at $500–$2k/month; 20% platform fee | $100–$400/installed agent/month |
| **Dedicated single-tenant** | 2-3x premium over shared Business pricing | $6k–$15k/month |
| **On-premise license** | One-time license + annual support | $50k–$500k |

### Why this expands ARPU

The Business tier is where regulated enterprises land. SAP/Workday connectors + DPE Tier 3 escalation + `browser_form_submit` + GDPR compliance pack is worth **$5k–$15k/month** to a 200-person finance team. That is a 10-50x ARPU uplift vs. Pro.

The Enterprise tier adds the one thing that compliance-critical industries require: a tamper-evident audit trail that satisfies a regulator, a HIPAA BAA, and a SOC2 Type II audit. No competitor can offer this. The ASP premium is defensible.

---

## 10. Hyperscale Architecture Notes

### Meeting EMAOP SLOs at scale

**Scale target: 50 agents × 500 tasks/hour = 7 tasks/second per tenant (Enterprise)**

**MAL at this rate:**
- DEK in-memory cache (5-minute TTL) → 1 Vault call per 5 minutes per tenant regardless of task rate
- Token generation: pure in-process UUID (O(n_pii_fields)) — negligible load
- P95 target 25ms is dominated by DB write to `field_classifications` — use buffered async write pattern from `savings.Service`

**DPE at this rate:**
- Tier 1 hard blocks: pure in-memory capability flag check — sub-microsecond; zero DB access
- Tier 2 threshold rules: loaded from cache (60-second TTL) — sub-millisecond
- Tier 3 escalation creation: DB write → use buffered async write; rare in well-configured deployments (< 1% of tasks)

**Audit Spine at 10k events/second (platform-wide):**
- Buffered channel (100k capacity) + 100ms flush + 1k-event batch → 10 DB writes/second
- `pgx/v5 CopyFrom` (COPY protocol) for batch inserts — not INSERT row-by-row
- NATS JetStream async publish — non-blocking; handles millions of messages/second on existing infra
- SIEM: connection pooling with keep-alive; `errgroup` for parallel batch sends to multiple connectors

**Browser sessions at scale:**
- Kubernetes HPA on browser-service deployment
- Pre-warm idle container pool: 2/tenant (Business), 5/tenant (Enterprise)
- Container network namespace: egress-only to DPE domain allowlist; destroyed on task close

**Database connection pools:**
- AuditSpine uses a **dedicated** connection pool (prevents audit write starvation of task writes)
- PgBouncer pool_mode = `transaction` (not `session`) to maximise throughput
- `MaxOpenConns` per pod (dynamic, not static global)

**Multi-tenancy isolation:**
- Network: dedicated namespace per tier-1 Enterprise; shared namespace with network policies for Standard/Business
- Data: `tenant_id` as partition key at every data store — cross-tenant queries are structurally impossible
- Inference: per-task context windows assembled fresh — no cross-tenant context sharing
- Audit: per-tenant HMAC keys in Vault; tenant-controlled export keys

---

## 11. Verification & Testing

1. **Unit tests** (≥ 80% business logic per CLAUDE.md §7):
   - `mal/tokeniser_test.go`: same input value → different tokens across tasks; detokenisation round-trip; verify `AgentTaskResult.Output` contains zero raw PII
   - `dpe/engine_test.go`: table-driven tests for all 3 tiers; Tier 1 blocks before workflow start; Tier 3 creates escalation entry
   - `trust/delegation_test.go`: invalid signature → `ERR_TRUST_VIOLATION`; expired token rejected; scope mismatch rejected

2. **Integration tests** (testcontainers per CLAUDE.md §7):
   - E2E task with MAL + DPE: submit task with PII field → verify LLM received tokenised value → verify final output detokenised
   - Browser Tier 1: `browser_read_only=true` on allowlisted domain → verify MAL intercepts response; non-allowlisted domain → DPE hard block
   - Audit Spine chain integrity: append 100 events → simulate deletion of event 50 → verify chain break detected

3. **Contract tests**: `POST /v1/governance/rules` with invalid rule schema → 400; `POST /v1/onboarding/start` with unsupported vertical → 400; all 5 RBAC roles tested against every endpoint

4. **Agent Studio E2E** (Playwright): complete all 5 steps → deploy → verify agent in Control Tower → verify manifest hash stored → attempt `browser_autonomous` tool call on agent with flag=false → confirm DPE Tier 1 hard block

5. **Onboarding smoke test**: sign up with sandbox tenant → `POST /v1/onboarding/start?vertical=finance` → verify `finance-invoice-approver` deployed and running against synthetic data within 5 minutes

6. **Control Tower emergency controls**: deploy agent → send task → "Pause Agent" → verify task enters `pending_hold` within 30 seconds; "Resume" → verify task resumes

7. **RBAC tests**: create Auditor user → verify access to `/audit` only; verify `POST /v1/agents` returns 403 with auditor JWT; verify Super Admin can access all endpoints

8. **Performance test**: 50 concurrent Temporal workflows per tenant with MAL + DPE enabled; verify P95 end-to-end task trigger to action < 5 seconds (EMAOP SLO §19.2); verify MAL P95 < 25ms; verify DPE P95 < 15ms

---

*Document owner: Matt*
*Last updated: 2026-06-09 — v1.1 reconciled against the live frontend + backend (see §0)*
*Next review: September 2026 (align with EMAOP v1.2)*
*Classification: Confidential — authorized recipients only*
*Reminder: "EMAOP" is an internal codename. It ships as Actrone — one product, one codebase.*
