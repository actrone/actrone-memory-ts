# Guide 01 — Architecture Overview

> **Status refreshed 2026-07-13 (code-verified):** Auth is WorkOS AuthKit (managed) + generic OIDC
> (self-hosted) via the provider-neutral `internal/oidc.Verifier`, not Clerk — Clerk JWKS verification
> was removed in the WorkOS auth switch (`docs/Actrone_WorkOS_Auth_Switch_Plan.md`). `identity_service.go`
> syncs from IdP webhooks generically (`OnUserCreated`, etc. — `external_user_id`/`external_org_id`
> columns, confirmed in `internal/repository/identity.go` and `internal/service/identity_service.go`),
> fed by `POST /webhooks/workos` (HMAC-verified, `internal/handler/http/workos_webhooks.go`) rather
> than a Clerk+Svix webhook. Also removed a stray `</content></invoke>` transcript-artifact fragment
> that had been accidentally pasted at the end of this file. Everything else below (Temporal/NATS
> flow, Agent-File schema, the three isolation barriers) matches the current `internal/service` and
> `internal/workflow` code structure at a spot-check level and was not re-verified line-by-line.

## The Two-Runtime Model

Every request in Actrone falls into one of two distinct runtime paths. Understanding which path a given operation takes is the most important mental model for working on this codebase.

```
REQUEST TYPE         PATH                         GUARANTEE
─────────────────────────────────────────────────────────────────────────
Config reads         REST/gRPC → DB               < 5 ms, synchronous
Task submission      REST/gRPC → Temporal enqueue Returns task ID immediately
Agent execution      Temporal → Activities         Durable, survives pod crash
MACP coordination    Temporal → NATS JetStream     At-least-once, ordered per tenant
Event streaming      NATS → WebSocket              < 2 ms cross-pod fan-out
Analytics            NATS → PostHog bridge         Async, best-effort
```

---

## Layer 1 — Edge: HTTP & gRPC

```
                  ┌─────────────────────────────────────────┐
                  │            Incoming Request              │
                  └────────────────────┬────────────────────┘
                                       │
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
   ┌──────────▼──────────┐  ┌──────────▼──────────┐  ┌────────▼────────┐
   │    REST :8080        │  │    gRPC :50051       │  │  WebSocket      │
   │    chi v5 router     │  │    SDK clients       │  │  /v1/tasks/     │
   │                      │  │    Protobuf binary   │  │  {id}/stream    │
   └──────────┬───────────┘  └──────────┬───────────┘  └────────┬────────┘
              │                         │                        │
   ┌──────────▼─────────────────────────▼────────────────────────▼────────┐
   │                    Auth Middleware Chain                              │
   │                                                                       │
   │  1. WorkOS/OIDC JWKS verify (RS256/384/512, ES256/384/512; local,     │
   │     zero network calls after warm-up — internal/oidc.Verifier)        │
   │     ↓ on success: resolve org_id → tenant_id via OrganizationRepo     │
   │  2. SHA-256 API key fallback (SDK programmatic access)                │
   │     ↓ on success: tenant from api_keys table                          │
   │  3. Inject: tenantKey, principalKey, orgRoleKey into context          │
   │                                                                       │
   │  RBAC guards:                                                         │
   │  RequireOrgAdmin → DELETE /v1/agents, POST /v1/auth/api-keys          │
   │  RequireOrg      → team-only features, denied for personal workspaces │
   └───────────────────────────────────────────────────────────────────────┘
```

---

## Layer 2 — Business Logic: Service Layer

```
backend/orchestrator/internal/service/

  activity_service.go     ← Implements all Temporal activities
  ├── ValidateAgentFile    ← Parse YAML + Barrier 2 ownership check
  ├── RetrieveContext      ← 4-phase memory retrieval (Redis L1 + Qdrant L2)
  ├── RouteModel           ← LLM provider selection (circuit breaker)
  ├── StreamLLMResponse    ← Token streaming + tool-call handling
  ├── WriteBack            ← Async memory persistence
  ├── AuditGovernance      ← Rules engine + violation ledger
  └── RecordMetrics        ← Prometheus counters + histograms

  context_manager.go       ← 4-phase retrieval pipeline
  identity_service.go      ← WorkOS/OIDC webhook → DB mirror + emails
  trace_analyzer.go        ← Risk scoring from Temporal history
  data_retention_service.go← GDPR Art. 5 storage limitation
  batch_service.go         ← Async batch task processing
```

---

## Layer 3 — Durable Execution: Temporal Workflows

```
                POST /v1/tasks
                      │
                      ▼
           ┌──────────────────────┐
           │  tasks.Create (DB)   │  ← idempotency_key prevents duplicates
           └──────────┬───────────┘
                      │ ExecuteWorkflow
                      ▼
     ┌────────────────────────────────────────────────────────┐
     │              AgentTaskWorkflow (Temporal)               │
     │                                                        │
     │  Activity 1: ValidateAgentFile                         │
     │  ├── Parse Agent-File YAML                             │
     │  └── Barrier 2: verify agent_sessions.org_id          │
     │                                                        │
     │  Activity 2: RetrieveContext                           │
     │  ├── Redis L1: recent turns (< 1 ms)                  │
     │  └── Qdrant L2: semantic search (< 10 ms)             │
     │                                                        │
     │  Activity 3: RouteModel                                │
     │  └── primary → fallback (circuit breaker per provider) │
     │                                                        │
     │  Activity 4: StreamLLMResponse                         │
     │  ├── Token streaming → ws.Broker → NATS               │
     │  └── Tool calls → Tool-Call Supervisor (8 steps)      │
     │                                                        │
     │  Activity 5: WriteBack (async, non-fatal)             │
     │  └── Redis L1 append + Qdrant L2 upsert               │
     │                                                        │
     │  Activity 6: AuditGovernance (async)                  │
     │  └── Rules engine → Violation Ledger (Merkle chain)   │
     │                                                        │
     │  Activity 7: RecordMetrics                             │
     │  └── Prometheus counters                               │
     └────────────────────────────────────────────────────────┘

  RESILIENCE: If the worker pod crashes during Activity 4, Temporal
  replays the entire history on any available worker. The LLM call
  is retried from the beginning of Activity 4, not from Activity 1.
  Idempotency key prevents duplicate task creation.
```

---

## Layer 4 — Event Fabric: NATS JetStream

```
SUBJECT LAYOUT (all scoped to tenantID to prevent cross-tenant delivery):

  macp.{tenantID}.spawn                → Agent spawn requests
  macp.{tenantID}.agent.{agentID}      → Direct agent messages
  macp.{tenantID}.crew.{crewID}        → Crew-wide broadcast
  tenant.{tenantID}.agent.{agentID}.telemetry → LLM token telemetry
  tenant.{tenantID}.task.{taskID}.events      → WebSocket cross-pod fan-out

STREAM: "ACTRONE"
  Subjects:  ["macp.>", "tenant.>"]
  Retention: 24h WorkQueuePolicy
  Storage:   FileStorage
  Replicas:  3 (HA cluster)

CONSUMERS:
  Name               Durable   Purpose
  ──────────────────────────────────────────────────────
  analytics-bridge   ✓         NATS → PostHog LLM Analytics
  websocket-{podID}  ✗         Ephemeral, per WebSocket connection
```

---

## Data Flow: Task Submission → Browser

```
Browser                 Next.js              Orchestrator Go           External
  │                        │                       │
  │──POST /v1/tasks──────►│                       │
  │                        │──── API call ────────►│
  │                        │                       │──Enqueue Temporal──►[Temporal]
  │                        │◄── {task_id} ─────────│
  │◄──── {task_id} ────────│
  │                        │
  │──GET /v1/tasks/        │
  │  {id}/stream ─────────►│
  │  (WebSocket upgrade)   │──── Subscribe ────────►│
  │                        │                       │
  │                        │          [Temporal Activity fires]
  │                        │                       │
  │                        │                       │──Publish──►[NATS]
  │                        │◄──EventToken ──────────│◄──────────[NATS sub]
  │◄──EventToken ──────────│
  │                        │
  │◄──EventComplete ────────── (same path) ─────────┤
  │ (WebSocket closes)     │
```

---

## Multi-Tenant Isolation — Three Barriers

```
BARRIER 1: JWT / API Key at the HTTP layer
  Every request → Auth middleware resolves tenant_id from a WorkOS/OIDC session JWT (org_id claim)
  or SHA-256 API key hash. All subsequent SQL queries are scoped: WHERE tenant_id = $1.

BARRIER 2: DB-state isolation in Temporal (agent_sessions table)
  At workflow start → agent_sessions.create(workflow_id, org_id)
  In ValidateAgentFile activity → verify agent's tenant == session's org tenant
  Prevents compromised workflows from executing agents in other tenants.

BARRIER 3: NATS subject prefix
  All NATS subjects include tenantID: macp.{tenantID}.>
  NATS NKey account auth enforces this server-side.
  Even with cluster network access, messages cannot cross tenant boundaries.
```

---

## Agent-File: The Contract

Every registered agent is defined by a YAML Agent-File stored as JSONB in PostgreSQL. This is the central config that drives routing, tool access, memory, governance, and MACP coordination.

```yaml
# Example Agent-File (simplified)
metadata:
  name: research-agent
  version: "1.0.0"
  owner: "org_2abc"

spec:
  personality:
    system_prompt: "You are a research assistant..."

  model:
    primary: { provider: anthropic, model: claude-sonnet-4-6 }
    fallback: { provider: openai, model: gpt-4o-mini }
    strategy: primary_with_fallback
    max_daily_cost_usd: 10.00

  tools:
    allowed: [web_search, code_interpreter]
    mcp_servers:
      - name: github-mcp
        url: https://mcp.github.com
        auth: { type: bearer, token_env: GITHUB_TOKEN }

  memory:
    max_turns: 50
    summarise_after_turns: 20

  governance:
    policy: general-enterprise
    citation_required: true

  coordination:
    process: sequential
    capabilities: [web_research, data_analysis]
```