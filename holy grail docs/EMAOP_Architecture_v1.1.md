# Enterprise Multi-Agent Orchestration Platform (EMAOP)
## Production-Grade System Architecture & Design Document
**Version 1.1 — June 2026**
**Classification: Confidential**

> **v1.1 Changes:** Added Browser Capability Framework (Section 9.5), Seamless Onboarding Architecture (Section 13.4), updated Agent Manifest schema (Section 6.1), updated Capability Enforcement (Section 6.3), updated Roadmap (Section 20).

> **Status refreshed 2026-07-13 (code-verified), scoped to §9.4 Voice (this pass did not re-audit the
> rest of this foundational architecture doc):** §9.4 "Voice (v2 — planned)" is MAJOR-STALE. Voice is
> code-complete, not planned, and its scope is wider than §9.4 states: real-time STT/TTS on phone
> calls (Twilio) and browser (LiveKit) both ship (`internal/voice/`, `backend/voiceagent/`), the LLM
> "Responder" that lets an agent actually speak is wired end-to-end
> (`internal/handler/http/responder.go`), and — contradicting §9.4's "outbound dialling in v3" line —
> **outbound calling and durable Temporal-style campaigns are already built**
> (`internal/voiceoutbound/`, `internal/voicecampaign/`), along with a distributable embeddable voice
> widget (`internal/voiceembed/`, `frontend/apps/control-tower/src/orb/orb.ts`) and voice methods in
> both client SDKs (`actrone-ts`, `actrone-py`). See `Actrone_Voice_Runtime_Bringup.md` for the
> current, accurate status (code-complete; only deployment bring-up remains).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Principles](#2-design-principles)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Cognitive Kernel](#4-cognitive-kernel)
5. [Metadata Abstraction Layer (MAL) & Security](#5-metadata-abstraction-layer-mal--security)
6. [Agent Persona Engine](#6-agent-persona-engine)
7. [Deterministic Policy Engine (DPE)](#7-deterministic-policy-engine-dpe)
8. [Integration & Connector Framework](#8-integration--connector-framework)
9. [Communication Modalities](#9-communication-modalities)
10. [Audit Spine & Observability](#10-audit-spine--observability)
11. [Resilience & Disaster Recovery](#11-resilience--disaster-recovery)
12. [Scalability Architecture](#12-scalability-architecture)
13. [Admin Console & UX Architecture](#13-admin-console--ux-architecture)
14. [Data Architecture](#14-data-architecture)
15. [Security Architecture](#15-security-architecture)
16. [Deployment Architecture](#16-deployment-architecture)
17. [API Design](#17-api-design)
18. [Technology Stack](#18-technology-stack)
19. [Performance Targets (SLOs)](#19-performance-targets-slos)
20. [Roadmap](#20-roadmap)

---

## 1. Executive Summary

The **Enterprise Multi-Agent Orchestration Platform (EMAOP)** is a production-grade, cloud-native infrastructure platform that deploys specialized AI agents as first-class operational colleagues within enterprise environments. Unlike chatbot layers or prompt wrappers, EMAOP agents **own outcomes** — they hold tasks from trigger to resolution, taking autonomous action within enterprise-defined policy boundaries.

### Core Value Proposition

EMAOP delivers four compounding advantages that are architecturally difficult to replicate:

1. **Outcome ownership, not conversation.** An agent does not respond to queries — it manages a task queue. It sends emails, creates tickets, matches invoices, schedules meetings, and escalates to humans only when a policy threshold demands it.

2. **Zero-PII exposure by design.** The Metadata Abstraction Layer (MAL) ensures no large language model ever processes raw sensitive data. Agents operate on status tokens and anonymised identifiers. Security is structural, not procedural.

3. **Enterprise-defined policy, not vendor-defined guardrails.** The Deterministic Policy Engine (DPE) executes rules authored by the enterprise via a no-code workbench. Every action is validated against those rules before execution. The AI proposes; the DPE decides.

4. **Operational flywheel.** Every agent decision produces a structured reasoning trace. These traces feed a continuously improving operational knowledge base specific to each enterprise — a digital asset that becomes more valuable over time.

---

## 2. Design Principles

These ten principles govern every architectural decision in the platform.

| # | Principle | Implication |
|---|-----------|-------------|
| 1 | **Security is structural** | PII never reaches an LLM. MAL is not optional. |
| 2 | **Policy before intelligence** | The DPE always runs. The AI cannot override it. |
| 3 | **One kernel, many personas** | A single agent runtime loads role policy packages. No duplicated security logic. |
| 4 | **Auditability is a product feature** | Every action, rationale, and escalation is tamper-evident and regulator-exportable. |
| 5 | **Human override is always available** | Any agent can be paused by any authorised user in under 30 seconds. |
| 6 | **Fail safe, not fail open** | Any error or ambiguity defaults to escalation, never to unilateral action. |
| 7 | **Zero rip-and-replace** | Connectors adapt to enterprise systems. Enterprise systems do not adapt to EMAOP. |
| 8 | **Config is code** | Agent manifests are versioned, diffable, and deployable via API or CLI. |
| 9 | **Multi-tenancy with hard isolation** | Each enterprise tenant is cryptographically isolated at the data, network, and inference layers. |
| 10 | **Graceful degradation** | Every subsystem has a defined fallback. Partial failure does not cause total failure. |

---

## 3. System Architecture Overview

EMAOP is composed of six architectural tiers, each with a clearly defined responsibility boundary. No tier communicates directly with a non-adjacent tier.

```
┌─────────────────────────────────────────────────────────┐
│  TIER 6: Admin Console & UX Layer                       │
│  Agent Studio · Rules Workbench · Integration Hub       │
│  Control Tower · Audit Viewer · Usage Dashboard         │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / WebSocket
┌────────────────────────▼────────────────────────────────┐
│  TIER 5: API Gateway & Auth                             │
│  Rate limiting · JWT/OAuth2 · Tenant routing            │
└────────────────────────┬────────────────────────────────┘
                         │ gRPC / mTLS
┌────────────────────────▼────────────────────────────────┐
│  TIER 4: Cognitive Kernel                               │
│  Global Orchestrator · DPE · Reasoning Engine           │
│  Agent Persona Engine · Task Queue · Memory Manager     │
└────────────────────────┬────────────────────────────────┘
                         │ gRPC / mTLS
┌────────────────────────▼────────────────────────────────┐
│  TIER 3: Metadata Abstraction Layer (MAL)               │
│  PII Tokeniser · Field Classifier · Vault Interface     │
│  Connector Contract Registry · Schema Version Manager  │
└────────────────────────┬────────────────────────────────┘
                         │ Encrypted channels only
┌────────────────────────▼────────────────────────────────┐
│  TIER 2: Connector Framework (MCP)                      │
│  OAuth Manager · Credential Vault · Adapter Library    │
│  Webhook Engine · Schema Normaliser                     │
└────────────────────────┬────────────────────────────────┘
                         │ API / OAuth2 / SAML / Webhooks
┌────────────────────────▼────────────────────────────────┐
│  TIER 1: Enterprise Systems                             │
│  ERP · HRIS · CRM · Ticketing · M365 · Custom Apps     │
└─────────────────────────────────────────────────────────┘

         ◄──── AUDIT SPINE (cross-cuts all tiers) ────►
```

### Tier Responsibilities

**Tier 1 — Enterprise Systems.** Existing customer infrastructure. EMAOP never requires changes to these systems — connectors adapt to them.

**Tier 2 — Connector Framework.** Handles all authentication, credential storage, schema normalisation, and protocol translation. All secrets live here and only here.

**Tier 3 — Metadata Abstraction Layer.** The security gateway between enterprise data and AI inference. Classifies fields, replaces PII with non-persistent tokens, enforces field-level access policies. The most security-critical component in the platform.

**Tier 4 — Cognitive Kernel.** The agent runtime. Manages task orchestration, LLM inference, memory, context windows, inter-agent communication, and the DPE policy engine.

**Tier 5 — API Gateway.** Handles all inbound traffic — UI requests, webhook ingestion, third-party integrations, and CLI access. Enforces rate limits, authentication, and tenant routing before any request reaches the Kernel.

**Tier 6 — Admin Console.** The no-code enterprise management surface: Agent Studio, Rules Workbench, Integration Hub, Control Tower, Audit Viewer, and Usage Dashboard.

**Audit Spine.** A cross-cutting concern that receives structured events from every tier. Tamper-evident, append-only, and independently queryable.

---

## 4. Cognitive Kernel

The Cognitive Kernel is the core agent runtime. All role-specific personas are policy packages loaded on top of this single runtime — there is no separate codebase per agent type.

### 4.1 Global Orchestrator

The Orchestrator receives all inbound triggers (email ingestion, webhook events, scheduled cron jobs, API calls, voice events) and routes them to the correct agent instance via the Task Graph.

**Trigger types:**
- Inbound email matching subject/sender patterns
- Webhook events from connected systems (e.g., new invoice created in SAP)
- Scheduled cron expressions (e.g., generate headcount report every Monday 07:00)
- Manual triggers from the Control Tower UI
- Inter-agent requests (agent A delegating a subtask to agent B)
- Voice call transcription events

**Task Graph:** Each trigger instantiates a Task — a persistent, stateful unit of work with a unique ID, owner agent, status, deadline, escalation chain, and reasoning trace. Tasks persist in the Task Store (Redis + PostgreSQL) and survive service restarts.

### 4.2 Memory Manager

The Memory Manager provides each agent with a three-tier memory architecture:

| Tier | Store | Scope | TTL |
|------|-------|-------|-----|
| Working memory | Redis (in-process) | Current task only | Task lifetime |
| Episodic memory | Qdrant (vector) | Tenant-wide, per agent | Configurable (default 90 days) |
| Procedural memory | PostgreSQL (structured) | Reasoning traces, resolved tasks | Permanent (audit) |

Working memory is **volatile by design** — sensitive metadata is purged the moment a task closes. Episodic memory stores embeddings of task outcomes (not raw data) to power the operational flywheel. Procedural memory is the audit trail.

### 4.3 Context Window Manager

Manages LLM context construction for each inference call. The context window is assembled from:
- Task description and current state
- Relevant episodic memory chunks (cosine similarity threshold: 0.78)
- Role policy package (agent rules, persona, capabilities)
- MAL-tokenised data from connected systems
- Conversation history (sliding window, configurable token budget)

The Context Window Manager **never** includes raw PII in assembled context. All data references pass through the MAL before being included.

### 4.4 Reasoning Engine

Wraps LLM inference with:
- Structured output enforcement (JSON schema validation on all model responses)
- Chain-of-thought capture (every reasoning step is logged to the trace)
- Retry logic with exponential backoff on model errors
- Fallback routing to secondary model endpoint on primary failure
- Token budget enforcement (hard stop before context overflow)

### 4.5 Inter-Agent Trust Protocol

When one agent needs to request work from another (e.g., HR agent requesting financial data from the Finance agent), the following protocol is enforced:

1. Requesting agent generates a signed task delegation token (Ed25519, 5-minute TTL)
2. Token includes: requesting agent ID, target agent ID, requested action scope, task context hash
3. Target agent verifies signature against the Kernel's agent identity registry
4. DPE on the target agent validates the requested action against its own policy
5. Response is returned only if both signature verification and DPE validation pass

No agent trusts another agent's claim at face value. This prevents a compromised or misconfigured agent from escalating its own privileges by impersonating another.

---

## 5. Metadata Abstraction Layer (MAL) & Security

The MAL is the most critical security component. It sits between the Connector Framework and the Cognitive Kernel and guarantees that no LLM ever processes raw sensitive data.

### 5.1 Field Classification Pipeline

Every data field retrieved from a connected system passes through a three-stage classification pipeline:

**Stage 1 — Static classification.** Enterprise administrators configure field-level handling in the Integration Hub (tokenise / pass through / block entirely). This configuration is stored in the Connector Contract Registry as a versioned schema.

**Stage 2 — Dynamic classification.** A lightweight classifier model scans field values at runtime for PII patterns not covered by static config (regex patterns, entropy scoring, format matching for credit card numbers, national IDs, bank accounts, etc.). Any field triggering a dynamic match is tokenised regardless of static config.

**Stage 3 — Audit.** Every classification decision (field name, source system, classification outcome, token assigned if applicable) is written to the Audit Spine.

### 5.2 Tokenisation

Sensitive fields are replaced with non-persistent UUIDs before data leaves the MAL:
- Tokens are generated fresh for each task — the same salary figure gets a different token in every task context
- Token-to-value mappings are stored in an isolated Vault (HashiCorp Vault or cloud KMS equivalent) that the Cognitive Kernel cannot access directly
- If an agent action requires writing a value back to a source system (e.g., updating a status field), the MAL resolves the token to the original value at the boundary, outside the Kernel's context

### 5.3 Envelope Encryption

All data in transit between tiers uses envelope encryption:
- A per-tenant Data Encryption Key (DEK) encrypts the payload
- The DEK is wrapped with a tenant-specific Key Encryption Key (KEK) stored in the Vault
- The KEK is rotated on a configurable schedule (default: 90 days)
- All inter-service communication uses mTLS with certificate rotation

### 5.4 Schema Version Management

Enterprise system schemas evolve. When a connected system's API changes, the Connector Contract Registry detects the drift (via schema hash comparison on each connector poll) and:
1. Flags the affected connector as "schema drift detected"
2. Pauses affected agent tasks (queues, does not drop)
3. Notifies the enterprise admin via the Control Tower
4. Resumes only after the admin reviews and approves the updated connector contract

This prevents silent breakage caused by upstream system changes.

---

## 6. Agent Persona Engine

### 6.1 Agent Manifest

Every agent is defined by an Agent Manifest — a versioned JSON document that specifies the complete configuration of one agent instance. The Manifest is produced by the Agent Studio wizard and can be exported, version-controlled, and deployed via the API.

**Manifest schema (abbreviated):**

```json
{
  "manifest_version": "1.0",
  "agent_id": "uuid",
  "tenant_id": "uuid",
  "name": "Finance & AP Agent",
  "role_category": "finance_procurement",
  "persona": {
    "tone": "professional_concise",
    "language": "en-US",
    "avatar_icon": "report-money",
    "avatar_color": "teal"
  },
  "capabilities": {
    "send_email": true,
    "schedule_meetings": true,
    "make_voice_calls": false,
    "generate_reports": true,
    "post_to_messaging": true,
    "web_search": false,
    "create_tickets": true,
    "chair_meetings": false,
    "browser_read_only": false,
    "browser_authenticated": false,
    "browser_form_submit": false,
    "browser_autonomous": false
  },
  "schedule": {
    "active_days": ["MON","TUE","WED","THU","FRI"],
    "active_from": "07:00",
    "active_until": "20:00",
    "timezone": "America/Toronto",
    "trigger_modes": ["scheduled","event_driven","webhook_inbound"]
  },
  "escalation": {
    "primary_approver": "finance.lead@acme.com",
    "sla_hours": 4,
    "on_sla_breach": "re_notify_and_log"
  },
  "token_budget": {
    "monthly_limit": 2000000,
    "on_exhaustion": "notify_and_pause"
  },
  "connected_systems": ["m365", "sap_erp", "jira"],
  "rules_version": "3",
  "manifest_hash": "sha256:..."
}
```

### 6.2 Persona Loading

On agent instantiation, the Kernel:
1. Fetches the Manifest from the Manifest Store
2. Validates the manifest hash (detects tampering)
3. Loads the matching rule set from the DPE config store
4. Fetches connector credentials from the Vault (read-only, scoped to this agent)
5. Initialises the Memory Manager with tenant and agent context
6. Registers the agent instance in the Agent Registry

### 6.3 Capability Enforcement

The capability flags in the Manifest are enforced at the Kernel level — they are not LLM-visible preferences. If `make_voice_calls` is false, the voice call capability is not initialised for that agent instance. The LLM cannot propose a voice call action that the Kernel will honour for an agent without that capability.

Browser capabilities follow the same enforcement model with an additional escalation gate: all four browser tiers (`browser_read_only`, `browser_authenticated`, `browser_form_submit`, `browser_autonomous`) are independently toggled. Any data retrieved via browser passes through the MAL before entering the agent's context — browser output is never injected raw into the LLM. This is a structural compliance guarantee that general-purpose browser agents cannot offer. See Section 9.5 for the full Browser Capability Framework.

---

## 7. Deterministic Policy Engine (DPE)

The DPE is the policy enforcement point for all agent actions. It runs after the Reasoning Engine proposes an action and before any action is executed. The LLM proposes; the DPE decides.

### 7.1 Three-Tier Decision Model

Every proposed action passes through three tiers in sequence:

**Tier 1 — Hard block.** Actions that are categorically prohibited regardless of context. Examples: any write to a system not listed in the agent's connected systems; any action outside the agent's capability set; any attempt to access another agent's credential scope. Hard blocks are immediate and cannot be overridden by the LLM or the enterprise admin via runtime configuration (they require a manifest change + re-deployment).

**Tier 2 — Threshold evaluation.** Actions that are conditionally permitted based on enterprise-configured rules. Examples: approve expense if amount < $500; auto-reply to vendor if PO match confidence > 95%; send email outside business hours if urgency flag is set. Threshold rules are authored in the Rules Workbench and versioned in the DPE config store.

**Tier 3 — Human-in-the-loop escalation.** Actions where the confidence score is below a configured threshold, or where rules are ambiguous, or where the action has no matching rule. The proposed action is placed in the human review queue with full reasoning trace. No action is taken until the approver responds or the SLA expires (at which point the action is re-queued, not abandoned).

### 7.2 Rule Authoring

Rules are authored via the Rules Workbench UI as condition-action pairs. The underlying rule format is a structured JSON schema that the DPE evaluates deterministically (no inference involved at rule evaluation time).

**Rule types supported:**
- Threshold (numeric comparisons on field values)
- Schedule (time-based conditions)
- Access control (field and system access scopes)
- Confidence (LLM output confidence score gates)
- Sequence (multi-step action prerequisites)
- Escalation chain (who gets notified, in what order, with what SLA)

**Rule versioning:** All rule sets are versioned. When rules are changed in the Workbench, the previous version remains active until the new version passes sandbox validation and is explicitly promoted. Rollback to any prior version is one-click.

### 7.3 Sandbox Validation

Before any rule set version goes live, it must pass sandbox validation. The sandbox replays the last 30 days of real audit events against the new rules and shows the enterprise admin exactly which outcomes would have changed. This prevents unintended regressions.

---

## 8. Integration & Connector Framework

### 8.1 Connector Architecture

Each connector is a versioned adapter that translates between a source system's API and EMAOP's internal data model. Connectors are stateless — all state (credentials, schema versions, sync cursors) is stored externally.

**Connector types:**

| Type | Auth method | Examples |
|------|-------------|---------|
| SaaS standard | OAuth 2.0 | M365, Google Workspace, Salesforce, Jira, Slack |
| ERP | SAP connector / proprietary SDK | SAP S/4HANA, Oracle NetSuite |
| HRIS | OAuth 2.0 / API key | Workday, BambooHR, ADP |
| Custom REST | API key / Bearer token | Internal apps, custom APIs |
| Webhook | HMAC signature | Any system that emits events |
| Legacy | SFTP / database connector | On-premise systems without APIs |

### 8.2 OAuth 2.0 Flow

For OAuth-connected systems, EMAOP acts as a confidential OAuth client:
1. Enterprise admin initiates connection in Integration Hub
2. EMAOP redirects to the source system's authorization endpoint with minimal requested scopes
3. Admin approves in the source system
4. Authorization code is exchanged for access + refresh tokens
5. Tokens are encrypted and stored in the Vault (never in application databases)
6. Token refresh is handled automatically by the Connector Framework; the Kernel never holds tokens directly

**Scope minimisation:** EMAOP requests only the scopes required for the agent's configured capabilities. Scopes are surfaced to the admin for review before the OAuth flow begins.

### 8.3 Connector Contract Registry

Every connector has a registered contract: the set of fields it exposes, their data types, their PII classification, and the MAL handling instruction for each field. Contracts are versioned and schema-hashed. Schema drift detection (described in section 5.4) monitors contracts on every connector poll.

### 8.4 Custom Connector Builder

Enterprises can register custom REST API connectors via the Integration Hub without writing code:
- Define base URL, authentication method, and credential fields
- Map API endpoints to EMAOP action types (read, write, event)
- Define field schema and MAL classification per field
- Test connection and field mapping in the sandbox before activating

---

## 9. Communication Modalities

### 9.1 Email (v1)

Agents compose and send email via connected M365 / Google Workspace accounts. Key capabilities:
- Full thread management (read, reply, compose, forward)
- Template library with persona-consistent tone enforcement
- Attachment handling (read only by default; write requires explicit capability)
- Out-of-hours queueing (configurable per agent schedule)
- Reply detection and thread state tracking

### 9.2 Enterprise Messaging (v1)

Slack and Microsoft Teams integration via their respective bot/connector APIs:
- Post messages to configured channels or DMs
- React to mentions and direct messages
- Deliver escalation notifications and report summaries
- Thread tracking for async conversations

### 9.3 Calendar & Meetings (v1)

Via M365 / Google Workspace calendar APIs:
- Schedule meetings with internal and external participants
- Send meeting invites with agenda templates
- Attend meetings as a participant (via transcript ingestion for post-meeting action items)
- Chair meetings via a meeting bot that moderates agenda and captures action items

### 9.4 Voice (v2 — planned)

Real-time voice participation in phone calls and meetings:
- WebRTC-based audio pipeline with sub-250ms latency target
- Speech-to-text transcription (real-time, streamed)
- Agent response generation with text-to-speech synthesis
- Scope limited to inbound call handling and meeting bots (outbound dialling in v3)

### 9.5 Browser Capability Framework

Browser access is a licensed capability toggle in the Agent Manifest — not a core architectural feature. Enterprises enable it per agent based on role need. All browser-retrieved data passes through the MAL before entering agent context. This is the critical compliance distinction from general-purpose browser agents: no raw web content ever reaches the LLM directly.

Browser capability is tiered across four levels, each with independent DPE enforcement:

| Tier | Manifest flag | Use case | DPE gate | Version |
|------|--------------|----------|----------|---------|
| Read-only web fetch | `browser_read_only` | Exchange rates, public vendor info, documentation lookup, compliance databases | Allowlist of approved domains | v1.5 |
| Authenticated portal access | `browser_authenticated` | Vendor portals, government compliance portals, partner systems | Scoped credentials in Vault + DPE approval | v2.0 |
| Form submission | `browser_form_submit` | Filing reports to external systems, submitting regulatory returns | Mandatory human-in-loop DPE gate — no autonomous submission | v2.0 |
| Full autonomous browsing | `browser_autonomous` | Open-ended research, multi-step web tasks | Full audit trail + confidence threshold + human review queue | v3.0 |

**Architecture — Browser Service:**

The Browser Service is an isolated, sandboxed component running outside the Cognitive Kernel boundary. Each browser session runs in its own container with:
- Network egress restricted to DPE-approved domain allowlist
- Session lifetime bounded to the task lifetime
- All retrieved content classified by the MAL field pipeline before delivery to the Kernel
- Full session recording written to the Audit Spine (URL visited, content retrieved, MAL classification applied)
- No session state persisted after task close — cookies, credentials, and session tokens are purged

```
Agent proposes browser action
        ↓
DPE validates: domain allowlisted? capability enabled? confidence threshold met?
        ↓
Browser Service opens isolated container session
        ↓
Content retrieved → MAL classifies and tokenises sensitive fields
        ↓
MAL-sanitised content delivered to Cognitive Kernel context
        ↓
Session terminated, container destroyed, audit event written
```

**Why this beats a general-purpose browser agent for enterprise:** Any competitor offering browser capability injects raw web content directly into the LLM context. A vendor portal page containing salary data, contract values, or customer PII would be processed as-is. In EMAOP, the MAL intercepts that content before it reaches the Kernel. The browser is compliance-safe by default, not by configuration.

---

## 10. Audit Spine & Observability

### 10.1 Audit Spine Architecture

The Audit Spine is an append-only, tamper-evident event log that receives structured events from every tier. It is architecturally independent — a compromise of the Cognitive Kernel does not compromise the Audit Spine.

**Event schema:**

```json
{
  "event_id": "uuid",
  "timestamp": "ISO8601",
  "tenant_id": "uuid",
  "agent_id": "uuid",
  "task_id": "uuid",
  "tier": "cognitive_kernel | mal | dpe | connector | gateway",
  "event_type": "action_proposed | dpe_verdict | action_executed | escalation_raised | token_used | ...",
  "actor": "agent | human | system",
  "action": { ... },
  "dpe_verdict": "approved | blocked | escalated",
  "dpe_rule_matched": "rule_id or null",
  "reasoning_trace": "structured chain of thought",
  "outcome": "success | failure | pending",
  "metadata": { ... }
}
```

Every event is signed with a per-tenant HMAC key (stored in the Vault). The signature chain allows detection of any tampering or deletion. Regulators and auditors receive read-only export access to a filtered view of the Audit Spine.

### 10.2 Reasoning Trace

The Reasoning Trace is a structured capture of the full decision chain for every agent action:

1. Trigger received (type, source, timestamp)
2. Context assembled (memory chunks retrieved, cosine scores, token counts)
3. MAL tokenisation applied (fields tokenised, fields passed through)
4. Inference call (model, prompt hash, response summary)
5. DPE evaluation (rules evaluated, tier reached, verdict)
6. Action executed or escalated (outcome, system affected, response received)

The Trace viewer in the Admin Console allows drill-down from any audit event to the full trace, giving enterprise admins complete visibility into why an agent made every decision.

### 10.3 Observability Stack

| Layer | Tooling |
|-------|---------|
| Metrics | Prometheus + Grafana |
| Tracing | OpenTelemetry (distributed traces across all tiers) |
| Logging | Structured JSON logs → centralised log aggregation |
| Alerting | PagerDuty / OpsGenie integration |
| Audit export | SIEM integration (Splunk, Datadog, Microsoft Sentinel) |

### 10.4 Control Tower

Real-time operational dashboard showing:
- All active agent instances and their current task states
- Live task queue depth per agent
- Escalations pending human review (with SLA countdown)
- Token consumption vs budget (real-time)
- DPE verdict breakdown (approved / blocked / escalated ratios)
- System health (connector status, MAL throughput, Kernel latency)

Emergency controls available from the Control Tower:
- Pause individual agent (queues tasks, no action taken)
- Pause all agents (tenant-wide emergency stop)
- Force-escalate all pending tasks to human review
- Revoke a connector's access immediately

---

## 11. Resilience & Disaster Recovery

### 11.1 Failure Modes & Responses

| Failure | Detection | Response |
|---------|-----------|----------|
| LLM endpoint unavailable | Health check + timeout | Route to secondary endpoint; if both fail, escalate all pending tasks |
| Connector timeout | Per-request timeout (5s default) | Retry with backoff (3x); queue task with "connector unavailable" status |
| MAL unavailable | Liveness probe | Hard block all agent actions; no data reaches Kernel without MAL |
| DPE unavailable | Liveness probe | Hard block all agent actions; fail safe |
| Task Store unavailable | Replication health check | Failover to replica; RPO < 1 minute |
| Audit Spine unavailable | Write failure detection | Buffer events in durable queue; replay on recovery |

**The fail-safe principle:** Any core security component (MAL, DPE) becoming unavailable results in a hard stop on agent actions. The platform is designed to fail safe, not fail open.

### 11.2 Data Redundancy

| Data type | Storage | Replication | RPO | RTO |
|-----------|---------|-------------|-----|-----|
| Task state | PostgreSQL (primary + 2 read replicas) | Synchronous | < 1 min | < 5 min |
| Agent manifests | PostgreSQL + object storage backup | Synchronous | 0 | < 2 min |
| Audit events | Append-only log (3-region replication) | Asynchronous | < 30 sec | < 10 min |
| Credentials | HashiCorp Vault (HA cluster) | Synchronous | 0 | < 2 min |
| Episodic memory | Qdrant (replicated cluster) | Asynchronous | < 5 min | < 15 min |

### 11.3 Multi-Region Architecture

Production deployments run across three availability zones within a primary region, with a warm standby region for disaster recovery. Traffic is load-balanced across availability zones. Regional failover is automated with a target RTO of under 15 minutes.

### 11.4 Graceful Degradation

If a non-critical subsystem (e.g., episodic memory, web search capability) becomes unavailable, affected agents continue operating without that capability — they do not halt. The Control Tower displays degraded capability warnings. Agents operating in degraded mode annotate their task traces accordingly.

---

## 12. Scalability Architecture

### 12.1 Horizontal Scaling

Every tier is stateless and horizontally scalable:

- **API Gateway:** Auto-scaled Kubernetes pods behind a load balancer. Scales on request rate (target: 70% CPU utilisation).
- **Cognitive Kernel:** Each agent instance is an independent pod. New instances spin up in under 10 seconds. Scales on task queue depth.
- **MAL:** Stateless per-request processing. Scales with Kernel instance count.
- **Connector Framework:** Scaled independently per connector type. High-volume connectors (e.g., email ingestion) scale separately from low-volume ones (e.g., ERP batch).

### 12.2 Multi-Tenancy Isolation

Each enterprise tenant is isolated at multiple layers:

- **Network:** Dedicated VPC or namespace per tier-1 enterprise customer; shared namespace with network policies for standard tier
- **Data:** Tenant ID is a partition key at every data store layer. Cross-tenant queries are structurally impossible.
- **Inference:** Shared LLM endpoint with per-tenant context isolation. No cross-tenant prompt leakage (context windows are assembled per-task, never shared).
- **Audit:** Per-tenant Audit Spine partitions with tenant-controlled export keys.

### 12.3 Performance Targets

| Operation | P50 | P95 | P99 |
|-----------|-----|-----|-----|
| API gateway response | 50ms | 120ms | 200ms |
| MAL field classification | 8ms | 25ms | 50ms |
| DPE rule evaluation | 5ms | 15ms | 30ms |
| LLM inference (action proposal) | 800ms | 2s | 4s |
| End-to-end task trigger to action | 2s | 5s | 10s |
| Audit event write | 10ms | 30ms | 60ms |

### 12.4 Rate Limiting

Rate limits are enforced at multiple layers:
- Per-tenant: configurable monthly token budget and per-minute action rate
- Per-agent: configurable in the Agent Manifest
- Platform-wide: hard limits prevent any single tenant from starving others
- LLM API: request queuing with priority lanes (urgent escalations get priority)

---

## 13. Admin Console & UX Architecture

### 13.1 Architecture

The Admin Console is a single-page application (React) served via a global CDN. It communicates exclusively with the API Gateway over HTTPS — it has no direct access to any backend service.

**Key screens:**

| Screen | Purpose |
|--------|---------|
| Agent Studio | 5-step wizard for creating and configuring agents |
| Rules Workbench | Visual rule builder with sandbox validation |
| Integration Hub | OAuth connections, credential management, MAL field config |
| Control Tower | Real-time operational dashboard |
| Audit Viewer | Full audit log with filter, search, and export |
| Usage & Governance | Token consumption, cost allocation, performance metrics |
| Team & Roles | User management, RBAC, SSO configuration |

### 13.2 Role-Based Access Control (RBAC)

| Role | Access |
|------|--------|
| Agent operator | Can trigger, pause, and view agent tasks |
| Agent admin | Can create, edit, and deploy agents and rules |
| Integration admin | Can manage connections and credentials |
| Auditor | Read-only access to audit spine and reasoning traces |
| Super admin | All permissions including user management and billing |

### 13.3 UX Design Principles

- **No-code first.** Every enterprise configuration should be achievable without writing code or YAML. The underlying manifest is always accessible for power users, but never required.
- **Confidence before action.** The sandbox and validation gates are designed to create appropriate friction before deploying changes. Enterprises should trust the system because it showed them exactly what it would do before doing it.
- **Progressive disclosure.** Simple views for operators, deep views for admins, raw manifest access for engineers. The same underlying system serves all three personas.
- **Immediate feedback.** The Control Tower is a live view — task states, escalations, and system health update in real time via WebSocket. No page refreshes required.

### 13.4 Seamless Onboarding Architecture

Onboarding is not a feature — it is the first product experience. A prospect must reach their first working agent before they lose interest, before a credit card is required, and without needing a sales call. The onboarding architecture follows Stripe's model: fully self-serve from a single developer to a global enterprise, with no hard wall that forces contact with sales.

Onboarding is structured as four progressive layers. Each layer delivers real value independently, and each naturally pulls the user into the next.

**Layer 1 — Instant Start (target: under 5 minutes)**

- Sign up via Google or Microsoft SSO — no form, no email verification loop
- Select a pre-built agent template: HR Starter, Finance Starter, IT Support Starter, or Procurement Starter
- Template arrives pre-loaded with: default rules, a curated sandbox dataset (synthetic but realistic), and mock integrations already wired
- Agent runs immediately against the sandbox data — no real connections required, no credit card required
- The prospect sees their agent completing tasks (drafting a meeting invite from an attendance anomaly, matching a mock invoice to a PO) before they have configured anything
- A live progress indicator in the UI shows the agent's reasoning trace in real time — not a loading spinner, but the actual decision chain

**Layer 2 — First Real Connection (target: under 30 minutes)**

- A guided "connect your first system" flow surfaces after the sandbox demo, with M365 as the default first option (highest enterprise penetration, familiar OAuth flow)
- Two-click OAuth approval — EMAOP requests minimal scopes, the enterprise admin approves in M365, the agent immediately reads real calendar and email data
- The first real action is surfaced as a confirmation prompt — not executed automatically: "Your HR agent detected an attendance anomaly and drafted this meeting invite. Send it?" — one moment of real value, one human confirmation
- This confirmation interaction is the platform demonstrating both its intelligence and its governance model simultaneously

**Layer 3 — Full Configuration (self-serve, hours to days)**

- Access to the full Agent Studio, Rules Workbench, and Integration Hub
- Contextual guidance throughout: each screen surfaces relevant templates, rule examples, and best-practice warnings
- In-product checklist tracks configuration completeness: persona defined → rules configured → sandbox tested → real connection live → first production action confirmed
- The user reaches this layer already convinced — Layer 1 and 2 established trust before full configuration began

**Layer 4 — Enterprise Implementation (white-glove, paid engagement)**

- Available for large deployments requiring: custom connector development, SSO/SAML integration, compliance review and audit setup, staff training, and SLA agreements
- Sold as an implementation package; by this stage the technical champion inside the enterprise has already validated the platform through Layers 1–3 and is the internal advocate
- Implementation team uses the same Agent Manifest CLI and API that power the self-serve product — no separate toolchain

**Onboarding completion metrics (target SLOs):**

| Milestone | Target |
|-----------|--------|
| Time from signup to first agent running in sandbox | < 5 minutes |
| Time from signup to first real system connected | < 30 minutes |
| Time from signup to first production action confirmed | < 2 hours (self-serve) |
| Layer 1 → Layer 2 conversion rate | > 60% |
| Layer 2 → Layer 3 conversion rate | > 40% |

---

## 14. Data Architecture

### 14.1 Data Stores

| Store | Technology | Data | Access |
|-------|------------|------|--------|
| Task store | PostgreSQL | Task state, history, metadata | Kernel (read/write), Console (read) |
| Agent manifests | PostgreSQL | Versioned manifest configs | Admin Console (read/write), Kernel (read) |
| Episodic memory | Qdrant | Vector embeddings of task outcomes | Memory Manager |
| Working memory | Redis | In-flight task context | Kernel (volatile, per-task) |
| Audit spine | Append-only log (S3 + Kafka) | All audit events | Audit Viewer (read), SIEM export |
| Credential vault | HashiCorp Vault | OAuth tokens, API keys, DEKs | Connector Framework only |
| Connector contracts | PostgreSQL | Field schemas, MAL config, version history | MAL, Integration Hub |
| Rule config | PostgreSQL | DPE rule sets with version history | DPE, Rules Workbench |

### 14.2 Data Classification

All data processed by EMAOP is classified at ingestion:

- **Public:** Non-sensitive operational data (ticket numbers, status fields, public email addresses)
- **Internal:** Business-sensitive data (financial summaries, project codes)
- **Confidential:** Restricted business data (salary bands, contract values, HR case details)
- **Restricted:** Regulated PII (bank account numbers, national IDs, health data)

Confidential and Restricted data is always tokenised by the MAL. Public and Internal data can be configured to pass through (enterprise decision, logged to audit).

### 14.3 Data Retention

| Data type | Default retention | Configurable |
|-----------|------------------|--------------|
| Audit events | 7 years | Yes (min: 2 years for regulated industries) |
| Task state (active) | Indefinite | N/A |
| Task state (closed) | 2 years | Yes |
| Episodic memory | 90 days | Yes |
| Working memory | Task lifetime | No (by design) |
| Credential tokens | Until revoked | N/A |

---

## 15. Security Architecture

### 15.1 Security Layers

EMAOP implements defence in depth across seven security layers:

1. **Network layer.** WAF, DDoS protection, IP allowlisting for enterprise admin access, private networking between tiers.
2. **Authentication.** OAuth 2.0 / OIDC for the Admin Console. SSO (SAML 2.0) integration for enterprise identity providers. MFA enforced for all admin roles.
3. **Authorisation.** RBAC enforced at the API Gateway. Scope-limited service accounts for inter-tier communication. Zero standing access — all service permissions are just-in-time.
4. **Data in transit.** TLS 1.3 for all external traffic. mTLS for all internal service-to-service communication. Certificate rotation automated via cert-manager.
5. **Data at rest.** AES-256 encryption for all data stores. Envelope encryption with per-tenant keys. Key rotation on configurable schedule.
6. **Application layer.** MAL as a structural PII firewall. DPE as a structural action firewall. Agent manifest hash validation on every load. Input validation and output schema enforcement on all LLM responses.
7. **Audit and detection.** All access to production systems is logged. Anomaly detection on agent action patterns (sudden volume spikes, unusual system access patterns). Security incident response runbooks integrated with Control Tower alerts.

### 15.2 Compliance Posture

EMAOP is designed to support compliance with:

- **GDPR / POPIA / NDPR:** Data residency configuration, right-to-erasure support (token invalidation removes value without touching the audit record), DPO audit export access
- **SOC 2 Type II:** Audit trail, access control, change management, availability monitoring
- **ISO 27001:** Information security management system alignment
- **HIPAA (US healthcare tenants):** BAA support, additional PHI tokenisation controls
- **PIPEDA (Canadian clients):** Data residency, consent tracking, access request support

### 15.3 Vulnerability Management

- Dependency scanning on every CI build (SBOM generation)
- Container image scanning before deployment
- Penetration testing on a biannual schedule
- Responsible disclosure programme
- CVE monitoring with automated patch PRs for critical vulnerabilities

---

## 16. Deployment Architecture

### 16.1 Deployment Models

| Model | Description | Target customer |
|-------|-------------|-----------------|
| Cloud SaaS (multi-tenant) | Shared infrastructure, tenant-isolated | SME to mid-market |
| Cloud SaaS (single-tenant) | Dedicated infrastructure per tenant | Enterprise |
| Cloud self-hosted | Customer's cloud account, EMAOP-managed | Enterprise with data residency requirements |
| On-premise / air-gapped | Customer's own hardware, no external calls | Government, highly regulated industries |

### 16.2 Kubernetes Architecture

All services run on Kubernetes with the following principles:
- Every service is a separate Deployment with independently configured scaling
- Pod disruption budgets ensure zero-downtime rolling upgrades
- Resource requests and limits defined for every pod (no unbounded resource consumption)
- Namespaces per tenant (enterprise tier) or namespace with network policies (standard tier)
- Secrets never stored in Kubernetes secrets — always fetched from Vault at runtime

### 16.3 CI/CD Pipeline

```
Code commit → Static analysis → Unit tests → Integration tests
→ Security scan (SAST + dependency audit) → Container build
→ Container scan → Staging deploy → E2E tests → Canary deploy (5%)
→ Progressive rollout (25% → 50% → 100%) → Post-deploy validation
```

Rollback is automated: if error rate exceeds 0.5% during progressive rollout, the deployment is automatically reverted and the release is flagged for investigation.

---

## 17. API Design

### 17.1 API Principles

- REST for synchronous resource operations (agent CRUD, rule management, user management)
- WebSocket for real-time Control Tower updates (task state, escalations, system health)
- Webhook for inbound event ingestion
- All endpoints versioned under `/v1/` — breaking changes require a new version
- OpenAPI 3.1 specification maintained as the authoritative API contract

### 17.2 Core Endpoints

**Agent management:**
```
GET    /v1/agents                    List all agents for tenant
POST   /v1/agents                    Create agent from manifest
GET    /v1/agents/{id}               Get agent details and current state
PUT    /v1/agents/{id}               Update agent manifest (creates new version)
POST   /v1/agents/{id}/pause         Pause agent
POST   /v1/agents/{id}/resume        Resume agent
DELETE /v1/agents/{id}               Deactivate agent

GET    /v1/agents/{id}/tasks         List tasks for agent
GET    /v1/agents/{id}/tasks/{tid}   Get task detail and reasoning trace
POST   /v1/agents/{id}/tasks/{tid}/escalate  Force-escalate task
```

**Rules & policy:**
```
GET    /v1/rules/{agent_id}          Get active rule set
POST   /v1/rules/{agent_id}          Create new rule set version
GET    /v1/rules/{agent_id}/versions List all versions
POST   /v1/rules/{agent_id}/sandbox  Run sandbox test against rule set
PUT    /v1/rules/{agent_id}/promote  Promote rule version to active
POST   /v1/rules/{agent_id}/rollback Rollback to previous version
```

**Audit:**
```
GET    /v1/audit                     Query audit events (filters: agent, type, date range)
GET    /v1/audit/{event_id}          Get full event with reasoning trace
POST   /v1/audit/export              Request compliance export (async, returns job ID)
```

### 17.3 Authentication

All API requests require a Bearer token (JWT) issued by the EMAOP identity service. Tokens are scoped to tenant and role. Machine-to-machine access (CLI, CI/CD) uses client credential flow with short-lived tokens.

---

## 18. Technology Stack

### 18.1 Core Services

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Cognitive Kernel | Go | Performance, low latency, strong concurrency primitives |
| Agent Persona Engine | Python | LLM SDK ecosystem, rapid iteration |
| Workflow orchestration | Temporal | Durable task execution, retry logic, long-running workflows |
| MAL | Go | Performance-critical path; must not be a bottleneck |
| API Gateway | Kong / custom Go | Rate limiting, auth, routing |
| Admin Console | React + TypeScript | Component ecosystem, real-time via WebSocket |

### 18.2 Data Infrastructure

| Store | Technology | Purpose |
|-------|------------|---------|
| Primary database | PostgreSQL 16 | Tasks, manifests, rules, contracts |
| Cache / working memory | Redis 7 (cluster mode) | In-flight task context, rate limiting |
| Vector store | Qdrant | Episodic memory, similarity search |
| Object storage | S3-compatible | Audit log archival, manifest backups |
| Event streaming | Apache Kafka | Audit event ingestion, connector event bus |
| Secret management | HashiCorp Vault | Credentials, DEKs, certificates |

### 18.3 Infrastructure

| Layer | Technology |
|-------|------------|
| Container orchestration | Kubernetes (EKS / GKE / AKS) |
| Service mesh | Istio (mTLS, traffic management) |
| Observability | Prometheus + Grafana + OpenTelemetry |
| CI/CD | GitHub Actions + ArgoCD |
| IaC | Terraform |
| CDN | Cloudflare (Admin Console static assets) |

---

## 19. Performance Targets (SLOs)

### 19.1 Availability

| Tier | Target | Measurement |
|------|--------|-------------|
| API Gateway | 99.95% | 30-day rolling window |
| Cognitive Kernel | 99.9% | 30-day rolling window |
| MAL | 99.99% | 30-day rolling window (security-critical) |
| Admin Console | 99.9% | 30-day rolling window |
| Audit Spine | 99.99% | 30-day rolling window (compliance-critical) |

### 19.2 Latency Targets

| Operation | Target (P95) |
|-----------|-------------|
| Agent action end-to-end | < 5 seconds |
| MAL field classification | < 25ms |
| DPE rule evaluation | < 15ms |
| Audit event write | < 30ms |
| Control Tower real-time update | < 500ms |
| Admin Console API response | < 200ms |

### 19.3 Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent agent instances per tenant | Up to 50 (configurable) |
| Tasks per agent per hour | Up to 500 |
| Audit events per second (platform-wide) | 10,000 |
| Connector API calls per minute | 1,000 per connector instance |

---

## 20. Roadmap

### v1.0 — Foundation (Months 1–6)

- Cognitive Kernel with Go Orchestrator and Python Agent SDK
- MAL with static field classification and tokenisation
- DPE with threshold, schedule, and access control rule types
- Connector Framework with OAuth 2.0 support
- First-party connectors: Microsoft 365, Google Workspace, Salesforce, Jira, Slack
- Four built-in agent personas: HR, Finance, IT Support, Procurement
- Admin Console: Agent Studio, Rules Workbench, Integration Hub
- Audit Spine with tamper-evident event log
- Cloud SaaS deployment (multi-tenant)
- **Seamless onboarding: Layer 1 (instant sandbox start) and Layer 2 (first real connection guided flow)**
- **Pre-built agent starter templates with synthetic sandbox datasets**

### v1.5 — Enterprise Hardening (Months 7–9)

- SSO (SAML 2.0) and advanced RBAC
- Single-tenant SaaS deployment model
- SIEM integration (Splunk, Datadog, Microsoft Sentinel)
- Sandbox rule testing with historical replay
- Schema drift detection and connector contract versioning
- Agent Manifest CLI and API (GitOps-compatible)
- Control Tower real-time dashboard
- **Browser Tier 1: Read-only web fetch with MAL-gated content and DPE domain allowlist**

### v2.0 — Intelligence Layer (Months 10–15)

- Episodic memory and operational flywheel (reasoning trace → embedding → retrieval)
- Dynamic MAL field classification (ML-assisted PII detection)
- Voice integration (inbound call handling and meeting bots)
- On-premise / air-gapped deployment model
- Custom connector builder (no-code REST API integration)
- Confidence-based DPE tier (LLM output confidence scoring)
- Inter-agent task delegation with signed attestation
- **Browser Tier 2: Authenticated portal access with Vault-scoped credentials and DPE approval gate**
- **Browser Tier 3: Form submission with mandatory human-in-loop DPE gate**

### v3.0 — Platform Expansion (Months 16–24)

- Agent Marketplace (enterprise-contributed persona packages)
- Fine-tuning pipeline (tenant-specific model fine-tuning on reasoning traces)
- Outbound voice (automated dialling with compliance controls)
- Wasm sandbox for custom rule logic
- Partner connector ecosystem (third-party connector certification)
- Edge deployment for ultra-low-latency requirements
- **Browser Tier 4: Full autonomous browsing with complete Audit Spine session recording, confidence threshold enforcement, and human review queue**

---

*Document maintained by the EMAOP Platform Engineering team.*
*Next review date: September 2026.*
*Version 1.1 — updated June 2026: Browser Capability Framework, Seamless Onboarding Architecture.*
*Classification: Confidential — for authorized recipients only.*
