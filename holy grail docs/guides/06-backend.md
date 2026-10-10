# Guide 06 — Backend Go Service

> **Status refreshed 2026-07-13 (code-verified):** the two Clerk mentions below are stale —
> `identity_service.go` syncs from WorkOS/OIDC webhooks, and the webhook route is
> **`POST /webhooks/workos`** (`internal/handler/http/workos_webhooks.go`, registered in
> `cmd/orchestrator/main.go`), not `/webhooks/clerk`. The `principal` field's `user_2abc...` example
> was Clerk's ID format; a WorkOS user ID looks like `user_01H...` (ULID-style) — the code itself
> stores whatever the IdP subject claim contains, provider-neutral. Everything else in this guide
> (repository/service/handler layering, error-code mapping, migration workflow, structured logging)
> was spot-checked and matches current code structure; not verified line-by-line.

## Repository Pattern

Every data access operation lives in a repository. Repositories are the only layer that touches the database.

```
internal/repository/
  agents.go         ← AgentRepository: CRUD + YAML validation
  tasks.go          ← TaskRepository: idempotency-keyed inserts
  identity.go       ← UserRepository, OrganizationRepository, MembershipRepository
  memory.go         ← Redis L1 + Qdrant L2 access
  tools.go          ← ToolRepository: registry + audit log
  governance.go     ← PolicyRepository + ViolationRepository
```

**Repository constructor pattern** — every repository takes a `*pgxpool.Pool` and a `*zap.Logger`:

```go
type AgentRepository struct {
    db  *pgxpool.Pool
    log *zap.Logger
}

func NewAgentRepository(db *pgxpool.Pool, log *zap.Logger) *AgentRepository {
    return &AgentRepository{db: db, log: log}
}
```

**All SQL is parameterised:**

```go
// Correct — parameterised
const sqlGetAgent = `
    SELECT id, tenant_id, name, agent_file, created_at, updated_at
    FROM agents
    WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`

func (r *AgentRepository) GetByID(ctx context.Context, id, tenantID uuid.UUID) (*domain.Agent, error) {
    row := r.db.QueryRow(ctx, sqlGetAgent, id, tenantID)
    // ...
}
```

**Adding a new repository method:**

1. Write the SQL constant at the top of the file (not inline).
2. The method signature takes `ctx context.Context` as the first argument.
3. Wrap errors: `return nil, fmt.Errorf("agents.GetByID: %w", err)`.
4. Never log inside repositories — propagate errors up.

---

## Service Layer

Services orchestrate repositories. They contain all business logic that crosses repository boundaries.

```
internal/service/
  activity_service.go   ← All Temporal activity implementations
  identity_service.go   ← WorkOS/OIDC webhook → DB mirror + emails
  context_manager.go    ← 4-phase memory retrieval pipeline
  trace_analyzer.go     ← Risk scoring from Temporal event history
  data_retention.go     ← GDPR Art. 5 storage limitation
  batch_service.go      ← Async bulk task processing
```

**Service constructor** — services take repositories and downstream clients as interfaces:

```go
type ActivityService struct {
    agents    AgentRepository
    tasks     TaskRepository
    memory    MemoryRepository
    tools     ToolSupervisor
    orgs      OrganizationRepository
    llm       LLMRouter
    nats      MACPClient
    broker    *ws.Broker
    log       *zap.Logger
}
```

**Using interfaces, not concrete types**, lets you swap implementations in tests without mocks touching the database.

---

## Adding a New REST Endpoint

```
internal/handler/http/
  agents.go      ← /v1/agents
  tasks.go       ← /v1/tasks
  workos_webhooks.go ← /webhooks/workos
  auth.go        ← /v1/auth/api-keys
  governance.go  ← /v1/governance
  health.go      ← /health/live, /health/ready
```

**Step 1 — Write the domain type** in `internal/domain/`:

```go
// internal/domain/report.go
type Report struct {
    ID        uuid.UUID
    TenantID  uuid.UUID
    AgentID   uuid.UUID
    Summary   string
    CreatedAt time.Time
}
```

**Step 2 — Write the repository** in `internal/repository/reports.go`:

```go
func (r *ReportRepository) Create(ctx context.Context, report *domain.Report) error {
    _, err := r.db.Exec(ctx, sqlInsertReport,
        report.ID, report.TenantID, report.AgentID, report.Summary, report.CreatedAt,
    )
    if err != nil {
        return fmt.Errorf("reports.Create: %w", err)
    }
    return nil
}
```

**Step 3 — Write the handler** in `internal/handler/http/reports.go`:

```go
type ReportHandler struct {
    reports *repository.ReportRepository
    log     *zap.Logger
}

func (h *ReportHandler) Create(w http.ResponseWriter, r *http.Request) {
    // 1. Tenant from context — ALWAYS first
    tenantID, ok := middleware.TenantIDFromContext(r.Context())
    if !ok {
        writeError(w, http.StatusUnauthorized, domain.ErrCodeUnauthorised, "missing tenant")
        return
    }

    // 2. Decode + validate input
    var req CreateReportRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, http.StatusBadRequest, domain.ErrCodeValidation, "invalid JSON")
        return
    }
    if err := validate.Struct(req); err != nil {
        writeError(w, http.StatusUnprocessableEntity, domain.ErrCodeValidation, err.Error())
        return
    }

    // 3. Call repository / service
    report := &domain.Report{
        ID:       uuid.New(),
        TenantID: tenantID,
        // ...
    }
    if err := h.reports.Create(r.Context(), report); err != nil {
        h.log.Error("reports.create", zap.Error(err))
        writeError(w, http.StatusInternalServerError, domain.ErrCodeInternal, "failed to create report")
        return
    }

    // 4. Write structured response
    writeJSON(w, http.StatusCreated, reportToResponse(report))
}
```

**Step 4 — Register in `cmd/orchestrator/main.go`**:

```go
reportHandler := handler.NewReportHandler(reportRepo, log)

r.Route("/v1", func(r chi.Router) {
    // ...
    r.With(middleware.RequireOrgAdmin).Post("/reports", reportHandler.Create)
    r.Get("/reports/{id}", reportHandler.Get)
})
```

---

## Error Response Format

Domain errors live in [`internal/domain/errors.go`](../../backend/orchestrator/internal/domain/errors.go) as typed `ErrorCode` constants. All handlers use the shared `writeError` / `writeDomainError` helpers in `internal/handler/http/tasks.go`.

```go
// Existing helpers — do NOT redefine these.
func writeError(w http.ResponseWriter, status int, code domain.ErrorCode, message string)
func writeDomainError(w http.ResponseWriter, err *domain.DomainError)
```

When the service layer returns a `*domain.DomainError`, hand it to `writeDomainError` — it maps the code to the correct HTTP status automatically.

**Error code → HTTP status mapping** (from `writeDomainError` switch):

| Domain Code | HTTP Status | When to use |
|---|---|---|
| `ErrCodeValidation` | 422 (or 400 for malformed JSON) | Invalid input field or malformed body |
| `ErrCodeUnauthorised` | 401 | Missing or invalid auth |
| `ErrCodeNotFound` | 404 | Resource not found for this tenant |
| `ErrCodeAlreadyExists` | 409 | Duplicate idempotency key or unique constraint |
| `ErrCodeSpendCapExceeded` | 402 | Daily cost limit hit |
| `ErrCodeGovernanceBlock` | 422 | Rules engine blocked the action |
| `ErrCodeToolRateLimit` | 429 | Tool sliding-window exceeded |
| `ErrCodeToolNotPermitted` | 403 | Tool not in agent's allowlist |
| `ErrCodeInternal` | 500 | Never expose stack traces here |

If you need a code that isn't listed, add it to `domain/errors.go` AND the switch in `writeDomainError` in the same change.

---

## Adding a New gRPC Method

```
proto/orchestrator/v1/orchestrator.proto   ← Add RPC definition
gen/orchestrator/v1/                       ← Run: buf generate
internal/handler/grpc/server.go            ← Implement the interface method
```

**Proto definition:**

```protobuf
rpc GetReport(GetReportRequest) returns (GetReportResponse) {};

message GetReportRequest {
    string id        = 1;
    string tenant_id = 2;
}

message GetReportResponse {
    Report report = 1;
}
```

**Implementation** follows the same pattern as REST — validate, extract tenant, call service:

```go
func (s *Server) GetReport(ctx context.Context, req *pb.GetReportRequest) (*pb.GetReportResponse, error) {
    if req.Id == "" {
        return nil, status.Error(codes.InvalidArgument, "id is required")
    }
    tenantID, ok := middleware.TenantIDFromContext(ctx)
    if !ok {
        return nil, status.Error(codes.Unauthenticated, "missing tenant")
    }
    report, err := s.reports.GetByID(ctx, uuid.MustParse(req.Id), tenantID)
    if errors.Is(err, domain.ErrNotFound) {
        return nil, status.Error(codes.NotFound, "report not found")
    }
    if err != nil {
        return nil, status.Error(codes.Internal, "failed to retrieve report")
    }
    return &pb.GetReportResponse{Report: reportToProto(report)}, nil
}
```

---

## Adding a Database Migration

```bash
cd backend/orchestrator

# Create migration file (goose sequential numbering)
goose -dir ./migrations create add_reports_table sql

# This creates:
# migrations/00015_add_reports_table.sql
```

**Migration file structure** — always include a Down migration:

```sql
-- +goose Up
-- +goose StatementBegin
CREATE TABLE reports (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id  UUID        NOT NULL REFERENCES tenants(id),
    agent_id   UUID        NOT NULL REFERENCES agents(id),
    summary    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_reports_tenant_id ON reports(tenant_id);
CREATE INDEX idx_reports_agent_id  ON reports(agent_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS reports;
-- +goose StatementEnd
```

**Rules:**
- Every foreign key gets an index.
- Every table that can be "deleted" has a `deleted_at TIMESTAMPTZ` (soft delete). Never `DELETE` rows from tables with business state.
- All migrations must be backwards-compatible: add columns as nullable first, backfill, then add NOT NULL constraint in a subsequent migration.

---

## Context Propagation

Every I/O call must receive the request context so it inherits the deadline and cancellation.

```go
// Correct — context flows through
func (s *ActivityService) RetrieveContext(ctx context.Context, tenantID uuid.UUID, query string) (*domain.Context, error) {
    // Redis lookup with context
    cached, err := s.memory.GetFromRedis(ctx, tenantID, query)

    // Qdrant lookup with context
    results, err := s.memory.SearchQdrant(ctx, tenantID, query, 10)

    return &domain.Context{...}, nil
}

// Wrong — context discarded, deadline ignored
func (s *ActivityService) RetrieveContext(tenantID uuid.UUID, query string) (*domain.Context, error) {
    cached, err := s.memory.GetFromRedis(context.Background(), tenantID, query) // bug
    // ...
}
```

**Temporal activities** receive context from the framework — always pass it through:

```go
func (s *ActivityService) ValidateAgentFile(ctx context.Context, params domain.ValidateParams) error {
    // ctx has Temporal's heartbeat + cancellation — pass it to all I/O
    agent, err := s.agents.GetByID(ctx, params.AgentID, params.TenantID)
    // ...
}
```

---

## Structured Logging

Every log line must include enough context to diagnose the issue without access to the system.

```go
// Good — structured fields, no interpolation
log.Error("tasks.create.failed",
    zap.String("tenant_id", tenantID.String()),
    zap.String("agent_id", req.AgentID),
    zap.String("idempotency_key", req.IdempotencyKey),
    zap.Error(err),
)

// Bad — string interpolation loses structured search
log.Error(fmt.Sprintf("failed to create task for tenant %s: %v", tenantID, err))
```

**Standard field names** (consistent across all services):

| Field | Type | Content |
|---|---|---|
| `tenant_id` | string | UUID of the org |
| `agent_id` | string | UUID of the agent |
| `task_id` | string | UUID of the task |
| `workflow_id` | string | Temporal workflow ID |
| `request_id` | string | W3C trace-id header value |
| `principal` | string | `user_01H...` (WorkOS/OIDC subject) or `apikey:abc123...` |
| `duration_ms` | float64 | Operation duration in milliseconds |

---

## Running Tests

```bash
cd backend/orchestrator

# Unit tests — no external services required
go test -race ./internal/domain/...
go test -race ./internal/service/...
go test -race ./internal/analytics/...

# Integration tests — requires Docker services from docker compose
go test -race -tags integration ./internal/repository/...
go test -race -tags integration ./internal/handler/...

# All tests
go test -race ./...

# With coverage
go test -race -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

**Integration test pattern** — use `testcontainers-go` to spin up a real Postgres:

```go
//go:build integration

func TestAgentRepository_Create(t *testing.T) {
    ctx := context.Background()
    pool := testutil.MustStartPostgres(t, ctx)  // spins up postgres in Docker
    repo := repository.NewAgentRepository(pool, zap.NewNop())

    agent := &domain.Agent{
        ID:       uuid.New(),
        TenantID: uuid.New(),
        Name:     "test-agent",
    }
    require.NoError(t, repo.Create(ctx, agent))

    got, err := repo.GetByID(ctx, agent.ID, agent.TenantID)
    require.NoError(t, err)
    assert.Equal(t, agent.Name, got.Name)
}
```
