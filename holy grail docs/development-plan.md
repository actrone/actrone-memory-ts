# Actrone — Development Plan

> **Status:** All phases complete — Phases 1–5 delivered; Privacy Proxy deferred (separate project)  
> **Last updated:** 2026-05-20  
> **Owner:** Matt  
> **Standards:** `CLAUDE.md` (all output must comply)
>
> **Status refreshed 2026-07-13 (code-verified):** this doc is a **dated historical snapshot** of the
> v0.1–v3.0 build (as of 2026-05-20) — read it as a changelog of what those five phases delivered
> *at the time*, not as a description of the platform today, which has moved substantially further
> (platform is ~99% code-complete per the ongoing plan-status-audit trail; this doc predates dozens of
> since-shipped workstreams). Three concrete corrections, since they'd send someone to the wrong
> place: **(1)** the frontend is no longer a single `frontend/src/app/` tree — it is a monorepo,
> `frontend/apps/{control-tower,marketing,marketplace}/src/app/` + `frontend/packages/ui/`, so the
> "Key Files" paths below for Control Tower / Marketing are stale. **(2)** the "Go SDK (`actrone-go/`)"
> was later **removed from the family entirely** (2026-07-05, CLAUDE.md §0.1) — the CLI now has its
> own self-contained `internal/client`, and a TypeScript SDK (`@actrone/sdk`) was added; do not build
> anything new against `actrone-go/`, it no longer exists. **(3)** Auth ("JWT RS256" with a local
> `secrets/jwt_private.pem`) was later replaced platform-wide by the WorkOS AuthKit + generic-OIDC
> switch (`docs/Actrone_WorkOS_Auth_Switch_Plan.md`, `docs/guides/03-auth.md`) — the `Run` steps'
> manual `openssl genrsa` JWT key generation and the `/auth/jwks` verify step describe the pre-WorkOS
> auth model and will not match current `.env` requirements (see `docs/guides/02-local-dev.md` for
> current local-dev auth env vars). The Python SDK also later moved out of `backend/` to a top-level
> `actrone-py/` repo (`docs/Actrone_Python_SDK_Repo_Extraction_Plan.md`) — the `src/actrone/` path
> below is pre-extraction. Everything else (Phase 1–5 feature bullets, migration numbers, file names
> within `backend/orchestrator/internal/`) is presented as-shipped-then and was not re-verified line
> by line this pass; treat feature *existence* as still true but exact line-level details as of
> 2026-05-20, not 2026-07-13.

---

## Executive Summary

Actrone is a production-grade AI agent infrastructure platform — the "OS kernel for LLMs". It provides durable execution (Temporal), two-tier memory (Redis L1 + Qdrant L2), model routing with circuit breakers, an 8-step Tool-Call Supervisor, an AI Governance Engine with Merkle-chained violation ledger, Multi-Agent Coordination Protocol (MACP) over NATS, and MCP (Model Context Protocol) integration.

**Go-to-market wedge:** `actrone-memory` open-source Python package (MIT, PyPI). Platform upside: hosted actrone.com SaaS.

---

## Phase 1 — Open Source Memory Manager · COMPLETE

### Delivered
- **`actrone-memory` Python package** (MIT, PyPI-published)
  - Redis L1 hot memory (`l1/redis_store.py`) — < 1 ms P99
  - Qdrant L2 semantic memory (`l2/qdrant_store.py`) — ~10 ms P99
  - 4-phase retrieval pipeline with relevance + recency scoring
  - OpenAI and local embedder (`l2/embedder.py`)
  - Auto-summarisation after N turns (background task)
  - `MemoryManager` public API
  - LangChain, LangGraph, CrewAI adapters
  - Full test suite: unit (≥80%), integration (testcontainers), contract
  - CI: ruff, mypy --strict, pip-audit, Docker build, PyPI publish on tag

---

## Phase 2 — Go Orchestrator + Full Platform · COMPLETE

### Backend (`backend/orchestrator/`)
- **PostgreSQL schema** (8 migrations via goose): agents, tasks, tool_audit_log, governance_violations, correction_dataset, api_keys, phase2_tables, agent_versions
- **Temporal durable workflows**: `AgentTaskWorkflow` (7 activities), `SpawnSubAgentWorkflow`
- **Real ActivityDependencies** in `ActivityService`: ValidateAgentFile (DB lookup + MCP registration), RetrieveContext (embed → Redis + Qdrant parallel), RouteModel, StreamLLMResponse (token stream → WebSocket), WriteBack (Redis + async Qdrant + session summarisation), AuditGovernance (sync CRITICAL + async), RecordMetrics (Prometheus)
- **Model Abstraction Layer**: OpenAI, Anthropic, Mistral providers; 5 routing strategies; `gobreaker` circuit breakers
- **Tool-Call Supervisor**: 8-step pipeline (schema → permission → rate-limit → spend-cap → sanitise → execute → response-validate → audit-log); MCP tool routing in step 6
- **Context Manager**: 4-phase pipeline; 0.7×relevance + 0.3×recency scoring; async summarisation trigger at turn threshold
- **AI Governance Engine**:
  - Rules Engine: pii_scanner, hallucination_scorer, citation_required, intent_classifier, consistency_checker, decision_pattern_classifier
  - Audit Engine: Claude 3.5 Sonnet meta-LLM review + auto-correction generation
  - Violation Ledger: SHA-256 Merkle chain, append-only
  - Feedback Loop: OpenAI fine-tuning job submission + eval gate (90%) + A/B router (10% / 7 days) + auto-promote/rollback
  - Signed PDF export: raw PDF 1.4, RSA-SHA256 signature over report hash
- **MCP Integration**:
  - MCP Client: HTTP JSON-RPC 2.0; `Connect()` discovers tools; `Call()` executes
  - MCP Registry: per-agent server registry; registered during `ValidateAgentFile`
  - MCP Server: `GET /mcp` (SSE) + `POST /mcp/message` (JSON-RPC) — exposes Actrone tools to external MCP clients (Claude Desktop, Cursor)
  - Supervisor step 6: MCP tools routed via registry; all 8 steps still apply
- **Agent-File version history**: `agent_versions` table; `ListVersions`, `GetVersion`, `RollbackToVersion` routes
- **Sub-agent structured errors**: `SubAgentError` type with `Retryable bool`; `EventAgentSpawnError` WebSocket event
- **REST API**: 30+ endpoints across tasks, agents, memory, governance, tools, cost, coordination, alerts, MCP
- **WebSocket streaming**: token, tool_call, tool_result, memory_hit, agent_spawn, agent_spawn_error, complete, error events
- **gRPC**: .proto definitions in `proto/`
- **Auth**: API key (SHA-256 hashed), JWT RS256, tenant isolation
- **Observability**: Structured JSON logs (zap), Prometheus metrics, OTel traces (W3C traceparent)
- **Graceful shutdown**: 30s drain on SIGTERM/SIGINT

### Python SDK (`src/actrone/`)
- Async gRPC client; typed Pydantic models; WebSocket streaming; LangGraph/CrewAI wrappers

### Go SDK (`actrone-go/`)
- Thin gRPC client; `RunAgent` streaming interface

### Control Tower UI (`frontend/`)
**App pages:**
- `/dashboard` — real-time KPI cards + activity feed
- `/tasks` — task list with live status badges
- `/tasks/[taskId]` — Trace Viewer: live Temporal activity graph (real API at `GET /v1/tasks/{id}/activities`), memory hit inspector, token stream
- `/agents` — agent fleet view; register/update/rollback Agent-File
- `/memory` — Memory Explorer with semantic search + bulk delete + embedding visualiser
- `/governance` — Violations list, 2D agent×rule heatmap, fine-tuning corrections queue, sentence-level hallucination overlay, signed PDF export
- `/tools` — Tool Registry; rate-limit config; kill-switch; call history
- `/cost` — Burn rate, stacked area chart, model breakdown, forecasting, global kill-switch
- `/coordination` — MACP Visualiser (react-flow)
- `/alerts` — Webhook + alert rule management

**Marketing site:**
- Home, pricing, about, contact, enterprise, blog, careers, sandbox, benchmarks, trust, calculator, cookbook, changelog, docs, legal pages (terms, privacy, cookies, AUP, DPA, security, SLA)
- Auth pages: sign-up, sign-in, forgot-password, reset-password, verify-email

### Infrastructure (`infra/`)
- Terraform modules: VPC, EKS, RDS (Aurora PostgreSQL 16), ElastiCache (Redis 7.2), Qdrant, NATS, Temporal
- Helm umbrella chart with sub-charts for all services
- OTel Collector, Prometheus, Grafana dashboards, Jaeger
- CI/CD: GitHub Actions (lint → test → security → build → contract → deploy)

---

## Phase 3 — Production Completeness Pass · COMPLETE (2026-05-20)

### Critical Bug Fixes (Sections A1–A4)
- **A1**: `buildMessages` was sending `input.TaskID` (a UUID) to the LLM instead of the actual user prompt. Fixed: `Input json.RawMessage` added to `StreamLLMInput` + `AgentTaskInput`; threaded from HTTP handler → workflow → activity; `buildMessages` now extracts `prompt`, `query`, or `message` fields.
- **A2**: `memory.Inject` compile error — `r.qdrant.Upsert(bgCtx, entry)` missing embedding argument. Fixed: embed content before calling `Upsert(bgCtx, entry, embedding)`. Also fixed `embed()` return type `[]float32 → []float64` to match `QdrantStore`.
- **A3**: `ExportSignedReport` ignored `from`/`to` date params. Fixed: `From *time.Time` + `To *time.Time` added to `ListViolationsParams`; date filtering applied in SQL WHERE clause.
- **A4**: `estimateComplexity` always returned 0.5. Fixed: real scoring based on input length + keyword signals (code/implement/research/analyse).

### MCP Integration (Section B)
- `internal/mcp/` package: `types.go`, `client.go`, `registry.go`, `server.go`
- `MCPServerConfig` + `MCPAuthConfig` added to `domain.AgentSpec`
- Agent-File `mcp_servers` block: name, url, auth (bearer/none), timeout_seconds
- Tool-Call Supervisor step 6 routes `server/tool` format calls via `mcp.Registry`
- MCP servers registered during `ValidateAgentFile` activity
- Routes: `GET /mcp` (SSE), `POST /mcp/message` (JSON-RPC 2.0)
- Auth: same Bearer API key as REST API

### Agent-File Version History (Section C)
- Migration `00008_agent_versions.sql`
- `AgentRepository`: `createVersion`, `ListVersions`, `GetVersion`, `RollbackToVersion`
- `PUT /v1/agents/{id}` automatically snapshots new version
- Routes: `GET /v1/agents/{id}/versions`, `GET /v1/agents/{id}/versions/{versionID}`, `POST /v1/agents/{id}/rollback/{versionID}`

### Auto-Correction Generation (Section D)
- `AuditEngine.GenerateCorrection()` calls Claude 3.5 Sonnet with a structured correction prompt
- `RulesEngine.recordViolation()` spawns goroutine to call correction generator after violation is appended
- Correction stored with `approved: false`, `reviewed_by: "meta-llm-generated"`
- Human review required before fine-tuning (via `PATCH /v1/governance/corrections/{id}`)

### Session Summarisation Trigger (Section E)
- `ActivityService.WriteBack` spawns `maybeSummariseSession` after every Redis append
- Every 20 turns: calls GPT-4o-mini to summarise, embeds result, upserts to Qdrant as `content_type: "summary"`

### Fine-Tuning A/B Pipeline (Section F)
- `governance/finetune_validator.go`: eval set runner; `RunEval()` → pass rate; `MeetsQualityGate()` (90% threshold)
- `governance/ab_router.go`: Redis key `ab_router::{agentID}` controls 10% traffic split; `FinalisABTest()` promotes or rolls back after 7 days
- `feedback_loop.go`: `awaitAndEval()` polls OpenAI job status; triggers eval gate → A/B start → finalisation timer
- Migration `00009_finetune_jobs.sql`
- `CheckThresholdAndSubmit()` called from `ReviewCorrection` handler after approval

### Signed PDF Export (Section G)
- `governance/report.go`: `BuildSignedReport()` + `RenderPDF()` using raw PDF 1.4 syntax (no external dependency)
- RSA-SHA256 signature over report content hash using JWT private key (`ORCHESTRATOR_AUTH_JWT_PRIVATE_KEY_PATH`)
- `GET /v1/governance/violations/export` returns `application/pdf` with `Content-Disposition: attachment`
- Merkle chain verification included in report

### Temporal Activity History Endpoint (Section H)
- `GET /v1/tasks/{taskID}/activities`: queries Temporal workflow history; returns per-activity name/state/attempt/timing/error
- `TraceViewer` in frontend uses this endpoint instead of WebSocket event heuristics

### Sub-Agent Structured Error Propagation (Section I)
- `SubAgentError` type: `SubAgentID`, `AgentName`, `Code`, `Message`, `Retryable bool`
- `SpawnSubAgentWorkflow`: publishes `EventAgentSpawnError` to parent's WebSocket stream via `PublishSpawnError` activity
- Parent workflow catches typed error; `Retryable` field informs retry decision

### Governance Dashboard Visualisations (Section J)
- **2D rule heatmap**: agent × rule matrix built client-side from violations; cells coloured green/amber/red by intensity; click to filter violations list
- **Sentence-level hallucination overlay**: when `evidence.sentence_scores` is present, renders each sentence highlighted by risk score (red/amber/transparent); degrades to JSON dump when not present

---

## Privacy Proxy — Explicitly Deferred

The Privacy Proxy is a separate standalone project not yet built. Actrone has zero hard dependency on it. The `privacy_proxy_enabled` flag in Agent-File defaults to `false`. No Actrone code changes are required when the proxy ships.

---

## Phase 4 — Ecosystem Expansion (v2.0) · COMPLETE

### 4.1 Framework Integrations — COMPLETE (2026-05-20)

`actrone-memory` bumped to **v0.2.0**. Four new adapters:

| Framework | Install | Interface |
|---|---|---|
| AutoGen 0.4 | `[autogen]` | `autogen_core.memory.Memory` protocol — `add/query/update_context/clear` |
| LlamaIndex | `[llamaindex]` | `BaseMemory` — `aget/aput/areset` (sync + async) |
| Haystack v2 | `[haystack]` | `ActroneRetriever` + `ActroneWriter` `@component` classes |
| DSPy | `[dspy]` | `ActroneRM` — `Retrieve`-compatible, single + multi-query |

Contract tests at `tests/contract/` — auto-skip when framework not installed.

### 4.2 Compliance (SOC 2 + GDPR) — COMPLETE (2026-05-20)

SOC 2, GDPR, POPIA, and FSCA compliance infrastructure. Key deliverables:

- Access audit log (SOC 2 CC7.2) — every authenticated API call recorded
- Data retention service — 24h background purge per tenant policy
- GDPR rights: right to erasure, data portability, 30-day DSR lifecycle
- Data residency config per tenant (region, applicable laws, retention periods)
- POPIA + FSCA governance policy packs added (6 rules each)
- Control Tower `/compliance` page — SOC 2 matrix, access log, DSR queue
- `docs/compliance/soc2-checklist.md` — evidence checklist + GDPR/POPIA status

### 4.3 Advanced MACP — COMPLETE (2026-05-20)

- `domain.CoordinationSpec` — added `Capabilities []string` + `AllowCrossTenant bool` fields
- `macp/capability_registry.go` — Redis-backed registry; `Register`, `Renew`, `Deregister`, `QueryCapability`, `QueryCapabilities`, `ListAllCapabilities`; heartbeat TTL 5 min
- `macp/crew_assembler.go` — greedy set-cover `Assemble()`; `AssemblyRequest` + `AssemblyResult` types; `MaxAgents` default 8; stable deterministic agent selection
- `macp/crew.go` — `AgentFileLookup` interface; `CrewCoordinator` cross-tenant permission check in `spawnOne`; `Crew.CrossTenant` flag
- `repository/agents.go` — `GetAgentFile()` satisfies `AgentFileLookup` for cross-tenant checks
- `service/activity_service.go` — `ValidateAgentFile` registers agent capabilities in registry; `CapabilityRegistry` field in `ActivityServiceConfig`
- `handler/http/coordination.go` — 3 new endpoints: `GET /v1/coordination/capabilities`, `GET /v1/coordination/capabilities/{capability}`, `POST /v1/coordination/assemble`
- Tests: `capability_registry_test.go`, `crew_assembler_test.go`

### 4.4 Cost Optimisation — COMPLETE (2026-05-20)

- `model/budget_predictor.go` — pre-call cost estimate; steers low-complexity (< 0.4) tasks to cheaper models without a live API call; `BudgetPredictor.Explain()` for observability
- `model/query_cache.go` — Redis-backed deterministic query cache; caches only requests with temperature ≤ 0.1 and no tools; cache key = SHA-256(model+messages+temp+max_tokens); TTL 24h; synthetic token stream on cache hit
- `model/router.go` — `RouterConfig.Predictor` field; `routeCost` uses predictor estimate when available
- `model/batch_provider.go` — OpenAI Batch API wrapper; `Submit`, `Poll`, `DownloadResults`; 50% cost reduction, 24h processing window
- `model/batch_provider_test.go`, `model/budget_predictor_test.go`, `model/query_cache_test.go`
- `service/batch_service.go` — background 30-min flush loop; collects `batch_queued` tasks, submits to OpenAI, polls every 5 min, writes results; marks tasks `completed` or `failed`
- `domain/task.go` — `TaskStatusBatchQueued`, `TaskStatusBatchProcessing` statuses; `BatchMode`, `BatchJobID`, `BatchReqID` fields
- `migrations/00012_batch_tasks.sql` — adds `batch_mode`, `batch_job_id`, `batch_req_id` columns with index
- `repository/tasks.go` — `ListBatchQueued`, `SetBatchJob`, `ArchiveOlderThan`; `Create` now passes `status` and `batch_mode` explicitly
- `handler/http/tasks.go` — `batch: true` in POST body → creates task as `batch_queued`, skips Temporal enqueue

## Phase 5 — Marketplace & Intelligence (v3.0) · COMPLETE (2026-05-20)

### 5.1 Regulatory Policy Packs — COMPLETE

Three new governance policy packs embedded in the binary (via `go:embed`):

| Pack | Key rules | Use case |
|---|---|---|
| `eu-ai-act` | Prohibited practices block (Art. 5), hallucination gate (50%), transparency, human oversight | EU high-risk AI systems (Annex III) |
| `fda-21-cfr-11` | Clinical hallucination gate (45%), GxP decision block, citation required for pharma claims | US pharma/biotech/medtech |
| `fca-mifid-ii` | Suitability gate, misleading comm block, best execution check, past-performance disclosure | UK/EU financial services |

HIPAA was already complete from Phase 2. All packs embedded in `policy.go`.

### 5.2 Agent Marketplace — COMPLETE

- **Ed25519 signing**: `internal/marketplace/signing.go` — `GenerateKeyPair`, `Sign`, `Verify`; digest = SHA-256(JSON(agentFile)); 7 tests in `signing_test.go`
- **Migration 00013**: `marketplace_agents` (full-text search GIN index, popularity sort index, unique publisher+name+version), `marketplace_ratings` (one per tenant per agent), `publisher_keys`
- **Repository**: `repository/marketplace.go` — `Publish`, `GetByID`, `List` (full-text + category + tag filters), `IncrementDownload`, `IncrementFork`, `AddRating` (atomic avg recalc in tx), `ListRatings`
- **Handler**: `handler/http/marketplace.go` — 7 routes; signature verified at both publish AND fork time
- **Routes**: `GET/POST /v1/marketplace/agents`, `GET /v1/marketplace/agents/{id}`, `POST /v1/marketplace/agents/{id}/fork`, `GET/POST /v1/marketplace/agents/{id}/ratings`, `GET /v1/marketplace/keys/generate`
- **Control Tower**: `/marketplace` page — grid with search/category/sort filters, star ratings, fork counts, verified badges, one-click fork

### 5.3 Wasm Sandbox — COMPLETE

- `go.mod`: added `github.com/tetratelabs/wazero v1.7.3` (pure Go, no CGO)
- `internal/tool/wasm_sandbox.go` — `WasmSandbox.Execute(ctx, wasmBytes, params)`: fresh wazero runtime per call (no state leakage), WASI Preview 1 (stdin/stdout, no host filesystem/network), 30 s context timeout, non-zero exit code surfaced as error
- `WasmToolHandler(wasmBytes)` returns a `ToolHandler` compatible with the 8-step Supervisor — Wasm tools go through all validation steps identically to native tools

### 5.4 Reasoning Trace ML — COMPLETE

- `domain.RiskScore` — `FailureProbability`, `CostOverrunRisk`, `HallucinationRisk`, `OverallRisk`, `Label` (low/medium/high/critical), `ExplainedFactors`
- `internal/service/trace_analyzer.go` — `TraceAnalyzer.Score(ctx, tenantID, taskID)`: reads Temporal workflow history, extracts features (retry count, failed activities, elapsed time, timeout count, governance blocks), applies calibrated heuristic weights; architecture ready for ML model replacement
- `GET /v1/tasks/{taskID}/risk` — returns structured risk score; nil scorer returns "unknown" gracefully
- `TaskHandler.WithRiskScorer(rs)` — optional injection pattern; risk endpoint available when wired

---

## Running the System

### Prerequisites
- Go 1.23+, Docker Compose, internet access for `go mod tidy`

### Local setup
```bash
# 1. Populate go.sum
cd backend/orchestrator && go mod tidy

# 2. Start dependencies
docker compose up -d postgres redis qdrant temporal

# 3. Configure environment
cp .env.example .env
# Set: ORCHESTRATOR_MODEL_OPENAI_API_KEY, ORCHESTRATOR_MODEL_ANTHROPIC_API_KEY

# 4. Generate JWT keys
mkdir -p secrets
openssl genrsa -out secrets/jwt_private.pem 4096
openssl rsa -in secrets/jwt_private.pem -pubout -out secrets/jwt_public.pem

# 5. Run
go run ./cmd/orchestrator
```

### Verify
```bash
curl http://localhost:8080/health/live   # → {"status":"ok"}
curl http://localhost:8080/health/ready  # → {"status":"ok"}
curl http://localhost:8080/auth/jwks     # → {"keys":[...]}
```

---

## Key Files

| Concern | Path |
|---|---|
| Main entry point | `backend/orchestrator/cmd/orchestrator/main.go` |
| Temporal workflows | `backend/orchestrator/internal/workflow/` |
| Activity implementation | `backend/orchestrator/internal/service/activity_service.go` |
| MCP client + server | `backend/orchestrator/internal/mcp/` |
| Governance engine | `backend/orchestrator/internal/governance/` |
| Tool-Call Supervisor | `backend/orchestrator/internal/tool/supervisor.go` |
| DB migrations | `backend/orchestrator/migrations/` |
| Control Tower UI | `frontend/apps/control-tower/src/app/(app)/` (corrected 2026-07-13 — was `frontend/src/app/(app)/`, pre-monorepo-split path) |
| Marketing site | `frontend/apps/marketing/src/app/(marketing)/` (corrected 2026-07-13 — was `frontend/src/app/(marketing)/`) |
| Helm chart | `infra/helm/actrone/` |
| Terraform | `infra/terraform/` |
