# Guide 04 — Service Communication

> **Status refreshed 2026-07-13 (code-verified):** the one auth mention below (`interceptors.go`)
> is stale — Clerk is gone; the gRPC interceptor authenticates via WorkOS/OIDC session JWT or API
> key, same as the HTTP path (Guide 01/03). `interceptors.go` itself carries no provider-specific
> naming today. The rest of this guide (gRPC surface, WebSocket broker, NATS subjects, MACP, the
> 8-step tool-call pipeline) was spot-checked against `internal/handler/grpc`, `internal/handler/ws`,
> and `internal/macp` and is directionally accurate but not verified line-by-line (unverified 2026-07-13).

## The Dual-Engine Model

```
┌────────────────────────────────────────────────────────────────┐
│             SYNCHRONOUS ENGINE (< 5 ms)                        │
│                                                                │
│  REST/gRPC requests → in-process function calls → DB reads    │
│  Config lookups · CRUD operations · health checks              │
│                                                                │
│  Used for: UI interactions, SDK calls, admin operations        │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│             ASYNCHRONOUS ENGINE (seconds to hours)             │
│                                                                │
│  Temporal: durable state machine for agent execution           │
│  NATS: event streaming, MACP coordination, analytics bridge    │
│                                                                │
│  Used for: agent runs, tool execution, memory persistence,     │
│            multi-agent coordination, real-time event streaming │
└────────────────────────────────────────────────────────────────┘
```

---

## gRPC Server (SDK-Facing)

The gRPC server exposes the same capabilities as the REST API in a binary Protobuf format, optimised for SDK clients that make high-frequency programmatic calls.

```
proto/orchestrator/v1/orchestrator.proto
  └─ 9 RPCs: SubmitTask, GetTask, CancelTask, StreamTask,
             RegisterAgent, GetAgent, ListAgents,
             SearchMemory, InjectMemory

gen/orchestrator/v1/
  ├─ orchestrator.pb.go       ← Message types
  └─ orchestrator_grpc.pb.go  ← Service interface + stubs

internal/handler/grpc/
  ├─ server.go          ← Implements OrchestratorServiceServer
  │                        delegates to same repos as HTTP handlers
  ├─ interceptors.go    ← Auth (WorkOS/OIDC session JWT / API key), logging, metrics
  ├─ sentry_interceptor.go ← Error capture with tenant scope
  └─ metrics.go         ← Prometheus: grpc_requests_total, grpc_duration
```

**Key design rule:** gRPC handlers NEVER contain business logic. They validate the request, extract tenant from context (set by auth interceptor), and call the same repository or service layer that HTTP handlers use.

```go
// Correct pattern in grpc/server.go:
func (s *Server) SubmitTask(ctx context.Context, req *pb.SubmitTaskRequest) (*pb.SubmitTaskResponse, error) {
    // 1. Validate input
    if req.AgentId == "" { return nil, status.Error(codes.InvalidArgument, "...") }

    // 2. Get tenant from context (set by auth interceptor)
    tenantID, ok := middleware.TenantIDFromContext(ctx)
    if !ok { return nil, status.Error(codes.Unauthenticated, "...") }

    // 3. Call service layer (same as HTTP handler)
    task, err := s.tasks.Create(ctx, &domain.Task{TenantID: tenantID, ...})

    // 4. Return proto response
    return &pb.SubmitTaskResponse{Task: taskToProto(task)}, nil
}
```

---

## WebSocket Event Streaming

```
SINGLE-POD MODE (NATS unavailable):

  Temporal Activity → ws.Broker.Publish(tenantID, taskID, event)
                              │
                              ▼
                    in-memory channel
                              │
                    WebSocket handler → Browser

MULTI-POD MODE (NATS available):

  Pod A: Temporal Activity → ws.Broker.Publish(tenantID, taskID, event)
                              │                │
                              ▼                ▼
                    in-memory           NATS publish
                    channel             "tenant.{tid}.task.{id}.events"
                              │
                    Pod A WS ──(local channel)──► Browser A

  Pod B: WebSocket handler subscribes to NATS "tenant.{tid}.task.{id}.events"
                              │
                    Pod B WS ──(NATS channel)──► Browser B

  Result: Browser B on Pod B receives ALL events from Pod A's workflow.
          Horizontal scaling works correctly.
```

**Broker design:**
```
internal/handler/ws/broker.go

  Broker.Publish(tenantID, taskID, event StreamEvent)
    1. Fast path: send to all local subscribers (same pod, < 1 µs)
    2. Distributed path: NATS publish (cross-pod, < 2 ms, non-blocking)

  Broker.SubscribeNATS(ctx, tenantID, taskID)
    Returns a <-chan StreamEvent from the NATS subject.
    Used by the WebSocket handler to merge local + NATS events.
```

---

## NATS JetStream: Tenant-Isolated Subjects

```
ISOLATION RULE: Every subject includes the tenantID.
A subscriber on macp.org_A.> CANNOT receive messages on macp.org_B.>
at the NATS server level (account auth + subject permissions).

Subject helper functions (internal/macp/client.go):

  SubjectSpawn(tenantID)          → "macp.{tid}.spawn"
  SubjectAgent(tenantID, agentID) → "macp.{tid}.agent.{aid}"
  SubjectCrew(tenantID, crewID)   → "macp.{tid}.crew.{cid}"
  SubjectTelemetry(tenantID, agentID) → "tenant.{tid}.agent.{aid}.telemetry"
  SubjectTaskEvents(tenantID, taskID) → "tenant.{tid}.task.{tid}.events"
```

**JetStream stream config:**
```
Name: ACTRONE
Subjects: ["macp.>", "tenant.>"]  ← covers all tenants and all event types
Retention: WorkQueuePolicy         ← each message delivered to ONE consumer
MaxAge: 24h                        ← events older than 24h are discarded
Storage: FileStorage               ← survives NATS pod restart
Replicas: 3                        ← survives 1 node failure (quorum: 2/3)
```

---

## Multi-Agent Coordination Protocol (MACP)

MACP is the protocol agents use to spawn sub-agents and communicate during execution.

```
                    Parent Agent (workflow A)
                           │
                           │ macp.{tenantID}.spawn
                           ▼
                    NATS JetStream
                           │
                    Temporal worker picks up spawn request
                           │
                    SpawnSubAgentWorkflow (workflow B)
                    ├── Linked to parent via ParentWorkflowID
                    ├── Cancels if parent is cancelled
                    ├── Reads/writes to shared Qdrant namespace
                    │   (keyed by crew_id, isolated from other crews)
                    └── Results published to parent's task stream

CREW PROCESS TYPES:
  Sequential    → agents run one after another, each gets previous output
  Hierarchical  → manager agent delegates to worker agents dynamically
  Parallel      → all agents spawn simultaneously, results collected
```

**Cross-tenant guard in SpawnCrewAgents:**
```go
// internal/macp/crew.go
if crew.TenantID == "" {
    return fmt.Errorf("macp: crew %s has empty TenantID", crew.ID)
}
// Every spawn uses the crew's TenantID to scope NATS subjects.
// An agent in Org A cannot spawn an agent in Org B's namespace.
```

---

## Tool-Call Supervisor (8-Step Pipeline)

Every tool call from an LLM goes through this pipeline. ALL 8 steps must pass or the tool call is blocked.

```
LLM requests tool execution
         │
         ▼
  Step 1: ValidateSchema        ← JSON schema validation of params
         │
  Step 2: CheckPermission       ← tool in Agent-File allowed_tools list?
         │
  Step 3: CheckRateLimit        ← Redis sliding window counter
         │
  Step 4: CheckSpendCap         ← daily_spend_cap_usd from tools table
         │
  Step 5: SanitiseParams        ← prompt injection regex + SSRF domain allowlist
         │
  Step 6: ExecuteTool           ← call registered handler or MCP server
         │
  Step 7: ValidateResponse      ← response JSON schema check
         │
  Step 8: WriteAuditLog         ← append to tool_audit_log (append-only)
         │
         ▼
  Result returned to LLM
```

Steps 1–5 block the call if they fail. Step 6 can also block (e.g. SSRF domain blocked). Steps 7–8 run after execution.

---

## Adding a New Tool

```go
// 1. Register the tool in internal/tool/registry.go
registry.Register("your_tool_name", YourToolHandler{})

// 2. Implement the ToolHandler interface
type YourToolHandler struct{}

func (h YourToolHandler) Execute(ctx context.Context, params map[string]any) (any, error) {
    // Tool logic here. Context carries deadline from the activity.
    // Validate params rigorously — the schema validation in step 1
    // already checked structure, but business logic validation is here.
    return result, nil
}

func (h YourToolHandler) Schema() map[string]any {
    return map[string]any{
        "type": "object",
        "properties": map[string]any{
            "query": map[string]any{"type": "string", "maxLength": 1000},
        },
        "required": []string{"query"},
    }
}

// 3. Insert into tools table (or let the admin UI do it):
// INSERT INTO tools (name, description, schema, rate_limit, daily_spend_cap_usd, enabled)
// VALUES ('your_tool_name', '...', '{}', '100/min', 1.00, true)
```
