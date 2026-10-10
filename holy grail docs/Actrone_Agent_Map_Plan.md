# Agent map: see everything an agent did, live and after the fact

Status: plan, not built. Decisions locked 2026-09-14. Owner: Matt. Audience: Actrone engineers and founder. Design spec: [docs/design/agent-map/README.md](design/agent-map/README.md), with a rendered mockup at [agent-map.html](design/agent-map/agent-map.html).

This plan proposes the agent map, a live and historical graph of every step an agent takes: model calls, prompts, tool calls, memory hits, sub-agent handoffs, policy decisions, approvals and governed writes. It records what exists today (verified against the code on 2026-09-14), scopes history replay end to end, lists every problem found during the review with the phase that fixes it, and sets out the capture, storage, delivery, UI, security and rollout needed to ship at production grade.

## Recommendation

Build it as the governed run record, not as another trace viewer. Langfuse, LangSmith, Arize Phoenix and AgentOps already draw span trees well, so a plain trace graph wins no deals. The part they can't draw is Actrone's governance layer: the Decision and Policy Engine (DPE) verdict on each tool call, the signed Governed Action Layer (GAL) receipt on each write, the Context Ledger showing why each item was in the prompt, MediaGuard redactions and the per-run attestation. An agent map that overlays those on the execution graph, and that an auditor can verify, fits the existing moat.

Two scopes share one data spine:

- **Run map**: the causal graph of one task, live while it runs and replayable afterwards, with a waterfall, a playback bar and a "fork from here" action
- **Fleet map**: an aggregate graph for an org over a time window (agents, tools, connectors, peer agents), with edges weighted by calls, errors, blocks and cost

## Decisions (locked 2026-09-14)

The owner accepted every recommendation on 2026-09-14:

1. **Content capture default**: `redacted` for every tier, set per agent in the agent spec; `none` and `full` stay available within tier limits
2. **Retention**: 14 days free, 90 days team, 1 year enterprise, custom for self-host
3. **Audit grade**: yes. Each run's event log is sealed into its Ed25519 attestation, which makes gap handling a compliance statement
4. **Transport**: Server-Sent Events (SSE) for the map; the WebSocket stays for chat tokens
5. **Build versus embed**: build on the platform with OpenTelemetry (OTel) export; no embedded Langfuse or other third-party trace UI

## What exists today

The platform has several durable records of agent behaviour, but none of them can rebuild a full run, and the live stream keeps no history.

| Surface | What it does | Gap for an agent map |
| --- | --- | --- |
| WebSocket stream `GET /v1/tasks/{id}/stream` ([stream.go](../backend/orchestrator/internal/handler/ws/stream.go)) | Pushes 9 event types (`token`, `thinking`, `tool_call`, `tool_result`, `memory_hit`, `agent_spawn`, `agent_spawn_error`, `complete`, `error`) from the local broker and NATS | Live only. The envelope `{event, data}` has no sequence number, event id, timestamp or parent link. A finished task gets one terminal event. Late joiners miss earlier events, and the code accepts duplicates |
| `ToolCallData` / `ToolResultData` ([events.go](../backend/orchestrator/internal/handler/ws/events.go)) | Tool name and params, then status | No call id, so a call pairs with its result by tool name only, which breaks on parallel calls |
| `GET /v1/tasks/{id}/activities` ([tasks.go:911](../backend/orchestrator/internal/handler/http/tasks.go#L911)) | Folds Temporal workflow history into activity records plus loop telemetry | Read live from Temporal, whose dev namespace retention is 7 days ([docker-compose.yml:145](../backend/docker-compose.yml#L145)). Activity granularity only |
| [TraceViewer.tsx](../frontend/apps/control-tower/src/components/features/TraceViewer.tsx) | Event list plus an "activity graph" that is a vertical list, polled every 3s | "Replay from here" posts to `/api/tasks/{id}/replay?from_activity=`, which exists nowhere. Brand and accessibility findings below |
| [TaskReplayConsole.tsx](../frontend/apps/control-tower/src/components/features/replay/TaskReplayConsole.tsx) at `/replay` | Step scrubber over the activities endpoint | Same 7 day limit and activity-only granularity |
| `POST /v1/tasks/{id}/replay-edit`, counterfactual, speculative | Governed fork and re-run (Reliability Substrate Plan 2, L3) | Re-executes; it's the target for "fork from here", not playback |
| `tool_audit_log` ([00003_tool_audit.sql](../backend/orchestrator/migrations/00003_tool_audit.sql)) | Append-only tool calls with params, result, status, cost, duration | No turn, span or parent linkage |
| `audit_events` ([00032_audit_spine.sql](../backend/orchestrator/migrations/00032_audit_spine.sql)) | Hash-based Message Authentication Code (HMAC) chained audit log | About 10 event types written. Not a step log |
| `action_ledger` ([00089_action_ledger.sql](../backend/orchestrator/migrations/00089_action_ledger.sql)) | Ed25519 signed, hash-chained receipt per governed write | The map links to it, never copies it |
| OTel | `initTracer` in the orchestrator `main.go`, a collector with tail sampling, export to Jaeger | Apart from the A2A package, no code in `internal/` creates a span. Tail sampling drops traces by design |
| `/coordination` page | Polls active agent nodes and crew edges | Current topology only, no history; layout clips nodes past the fourth row |

## History replay, built and wired end to end

Yes, the plan fully builds history replay. It covers three separate capabilities, and the run map wires all three into one surface:

| Capability | What it does | Today | After this plan |
| --- | --- | --- | --- |
| Playback | Redraws a past or running run event by event, with prompts, tool calls, governance and timing | Doesn't exist | Built in M1 and M2 from the run event log |
| Step inspection | Moves through a run's steps and shows each one's detail | `/replay`, activities only, 7 day limit | `/replay` rebuilt on the run log, span granularity, no expiry within retention |
| Fork and re-run | Re-executes a task from a chosen step under current policy | `replay-edit` API exists; the only UI button is dead | "Fork from here" in the drawer, confirmed, calling `replay-edit` and linking the child run |

### Playback behaviour

Playback reads only from the run log; nothing re-executes. The design spec defines the controls in full; the behaviour contract is:

- **Controls**: play, pause, previous and next span start, speeds of 1x, 2x, 5x and 10x, and "skip idle", which compresses gaps over 2s and labels them
- **Governance notches**: redactions, approval holds, signed commits and blocks sit on the ruler as buttons that jump the playhead to that moment
- **State at time T**: every node, edge and waterfall bar shows its state as of the playhead; spans that hadn't started are dimmed, running spans show a held ink border, and approvals in progress show "held"
- **Deep links**: `?span=<span_id>&t=<seq>&view=graph|tree` reproduces the exact frame, so a link in an incident channel opens on the moment that matters
- **Live runs**: the playhead follows the newest event, dragging back pauses following, and "Return to live" resumes it
- **Integrity**: when playback reaches the end of a sealed run, the folded snapshot's hash is compared with the attestation root; a mismatch shows an error-bordered banner and blocks "Verify attestation" from passing

### Wiring into existing surfaces

Every surface that shows run history today moves onto the run log in M2:

1. `/tasks/[taskId]`: the trace tab becomes the run map (graph, waterfall, playback, drawer); the event list survives as the tree view
2. `/replay`: becomes the run map in playback mode, with a searchable, paginated task picker instead of the latest 50 tasks
3. Chat `ToolCallTimeline`: each turn gets an "Open in agent map" link to that turn's span
4. TraceViewer "Replay from here": removed in M0 and replaced by "Fork from here" in the drawer, with confirmation
5. `GET /v1/tasks/{id}/activities`: kept for backward compatibility with a deprecation header; no Control Tower surface depends on it after M2
6. The task WebSocket: kept for chat token streaming only

### Runs recorded before the run log

Runs that finished before M1 have no run events and can't be backfilled with prompts or model calls, because that content was never stored. A one-off backfill job builds reconstructed run events from `tool_audit_log`, `audit_events`, `action_ledger` and Temporal history where it still exists, flagged `source = 'reconstructed'`. The map shows a "reconstructed" chip and states what's missing, so an auditor never mistakes a partial record for a full one.

### SDK parity

Both SDKs (`actrone-ts`, `actrone-py`) get the replay surface against one contract, each with contract tests:

- `runs.map(runId)`: folded snapshot
- `runs.events(runId, { afterSeq })`: async iterator over SSE with automatic resume
- `runs.span(runId, spanId)`: span detail
- `runs.fork(runId, spanId)`: wraps `replay-edit` with the span's step

### Replay acceptance tests

- A run older than Temporal's retention plays back fully, and its folded snapshot hash equals the sealed attestation root
- Playback of a completed run matches what a viewer saw live, event for event
- Disconnecting mid-playback and reconnecting produces no duplicate or missing events
- A deep link with `span` and `t` opens on the same frame in a new session
- "Fork from here" creates exactly one `replay-edit` run (idempotency key per confirmation) and the map links it as a child
- A pre-M1 run renders with the "reconstructed" chip and no prompt content

## Problems found and where each is fixed

The review found these problems. Every one is in scope, and the phase column says which milestone fixes it. File and line findings for the frontend come from the `web-design-guidelines` audit in the [design spec](design/agent-map/README.md#audit-of-existing-surfaces).

### Backend and data

| # | Problem | Where | Fix | Phase |
| --- | --- | --- | --- | --- |
| 1 | "Replay from here" calls a route that doesn't exist | [TraceViewer.tsx:140](../frontend/apps/control-tower/src/components/features/TraceViewer.tsx#L140) | Remove the button; M2 adds "Fork from here" wired to `replay-edit` | M0, M2 |
| 2 | Stream events have no sequence, id, timestamp or parent; duplicates accepted; late joiners miss history | [stream.go](../backend/orchestrator/internal/handler/ws/stream.go), [events.go](../backend/orchestrator/internal/handler/ws/events.go) | Add `seq`, `event_id`, `ts`, `span_id` to the envelope and dedupe by `seq`; SSE snapshot plus tail for history | M0, M2 |
| 3 | Tool calls have no call id | `ToolCallData`, `ToolResultData` | Add `tool_call_id` end to end | M0 |
| 4 | WebSocket upgrader accepts any origin | [stream.go:23](../backend/orchestrator/internal/handler/ws/stream.go#L23) | Restrict `CheckOrigin` to configured frontend origins | M0 |
| 5 | Run history expires with Temporal retention | `tasks.go:911`, `/replay` | Run event log with tier retention; `/replay` rebuilt on it | M1, M2 |
| 6 | No agent spans are created; Jaeger samples | `internal/`, collector config | Emitter at 11 instrumentation points with OTel GenAI spans; run log is the record, Jaeger stays optional | M1 |
| 7 | Fetch errors swallowed | TraceViewer.tsx:119, coordination page.tsx:26 | Designed error states with request id and retry | M0 |

### Frontend brand and accessibility

| # | Problem | Where | Fix | Phase |
| --- | --- | --- | --- | --- |
| 8 | Pulsing live dot | TraceViewer.tsx:203-207 | Text label "streaming" | M0 |
| 9 | Infinite SVG pulse ring that ignores reduced motion | coordination page.tsx:257-262 | Remove; running state becomes a held border | M0 |
| 10 | Status dots and `rounded-full` state circles | TraceViewer.tsx:232-242, ToolCallTimeline.tsx:106, :120-125 | Icon plus text tag in a 4 px radius well | M0 |
| 11 | Em dashes in UI text and comments | TraceViewer.tsx:445, TaskReplayConsole.tsx:46, :48, :209, :213, ToolCallTimeline.tsx:4, :14 | Rewrite; empty values read "not recorded" | M0 |
| 12 | Title Case labels | TraceViewer.tsx:198, coordination page.tsx:46, :60, :110, :357-363 | Sentence case | M0 |
| 13 | Hardcoded glyphs | TraceViewer.tsx:541 (`▾`), coordination page.tsx:343 (`✕`) | lucide `ChevronDown` and `X` | M0 |
| 14 | lucide icons without `strokeWidth={1.5}` | TraceViewer.tsx:245, :248, TaskReplayConsole.tsx:78, :138, :158, :177, ToolCallTimeline.tsx:126-128, :169 | Add the stroke width | M0 |
| 15 | Tabs without tab semantics or focus ring | TraceViewer.tsx:187-199 | `tablist` pattern with `focus-visible` | M0 |
| 16 | `div` content inside a `button` | TraceViewer.tsx:441-447 | Restructure the memory row | M0 |
| 17 | Coordination graph clips nodes past row four, has no list alternative, and its SVG buttons ignore Space and show no focus | coordination page.tsx:171-184, :191, :246-255 | Interim viewBox and keyboard fix in M0; replaced by the fleet map in M5 | M0, M5 |
| 18 | `transition-all duration-500` animating width on `rounded-full` bars | coordination page.tsx:139, :143 | Transform-based fill, 4 px radius | M0 |
| 19 | Polling every 3s while hidden | TraceViewer.tsx:126, coordination page.tsx:39 | SSE for the run map (M2) and fleet map (M5); pause polling on hidden tabs in M0 | M0, M2, M5 |
| 20 | Staggered entrance on every data row | TraceViewer.tsx:404-405 | 120 ms mount fade, no stagger | M0 |
| 21 | Selection and step not in the URL | TaskReplayConsole.tsx:106, :114 | URL state per the design spec | M2 |
| 22 | Status badge text fails WCAG AA in the light theme (2.15:1 to 3.76:1 on white) | [Badge.tsx:8-11](../frontend/packages/ui/src/ui/Badge.tsx#L8-L11) | New `--color-*-ink` tokens (5.02:1 to 6.70:1), used by `Badge` app-wide | M0 |
| 23 | Graph edge colour `--color-border-strong` measures 1.83:1, below the 3:1 floor for meaningful graphics | Map design | `--map-edge` maps to `--color-text-dim` (5.09:1 dark, 5.28:1 light) | M2 |
| 24 | Locale-unaware date and number formatting | TaskReplayConsole.tsx:100, :209, :213, coordination page.tsx:364, ToolCallTimeline.tsx:55 | `Intl.DateTimeFormat` and `Intl.NumberFormat` helpers | M0 |

## Why not build on Jaeger or a hosted trace tool

Jaeger with tail sampling keeps a subset of traces, has no tenant isolation or residency routing, and can't store policy decisions as first-class fields. Embedding Langfuse would add a second product with its own auth, storage (ClickHouse plus Postgres) and data model beside the platform.

OTel stays as an export format. Each instrumentation point writes one canonical event and also emits an OTel GenAI span, so customers who already run Datadog, Langfuse or Phoenix still get standard traces.

## Event model

A single run event contract is the source of truth for the map, the SDKs and the OTel export. Span names follow the OTel GenAI semantic conventions (`invoke_agent`, `chat`, `execute_tool`), which are still marked Development as of July 2026, so one normalizer module owns the mapping and pins the convention version.

Each event is one span lifecycle transition (`start` or `end`), which lets the live map show running nodes:

| Field | Purpose |
| --- | --- |
| `event_id` | UUIDv7, derived deterministically (see idempotency) |
| `tenant_id`, `run_id` (task id), `agent_id` | Scoping and authorisation |
| `seq` | Per-run monotonic sequence, assigned by the emitter |
| `trace_id`, `span_id`, `parent_span_id` | Tree structure. `trace_id` matches the W3C `traceparent` |
| `phase` | `start` or `end` |
| `kind` | `agent`, `chat`, `tool`, `memory`, `context`, `policy`, `approval`, `action`, `handoff`, `a2a`, `mediaguard` |
| `name`, `status` | For example `execute_tool:crm.update_contact`, `ok` / `error` / `blocked` / `pending_approval` |
| `ts` | Server timestamp |
| `usage` | Input, output and reasoning tokens, `cost_usd`, model id |
| `attrs` | Small typed attribute map, capped at 8 KB |
| `content_ref`, `content_hash`, `content_class` | Pointer to the prompt or payload blob, its SHA-256, and `none` / `redacted` / `full` |
| `links` | Ids in other ledgers: `action_ledger.hash`, `audit_events.id`, memory ids, approval id, child run id, `tool_call_id` |
| `source` | `live` or `reconstructed` |

Causal edges in the map come from `links.tool_call_id` as well as `parent_span_id`: a tool span is drawn under the chat turn that requested it, while OTel export keeps it under `invoke_agent`.

Content never goes inline. Prompts, completions, tool params and tool results live in object storage, so a metadata query never reads personally identifiable information (PII), and erasure can delete a blob without breaking the sealed hash chain.

The contract lives in one schema file with Go, TypeScript and Python types generated from it (CLAUDE.md §2).

```go
// Emitter is the one place instrumentation writes run events.
type Emitter interface {
	Start(ctx context.Context, s SpanStart) (SpanHandle, error)
}

type SpanHandle interface {
	// End records the terminal status, usage and links for the span.
	End(ctx context.Context, e SpanEnd) error
}
```

## Capture: where events come from

Instrumentation sits where the orchestrator already makes decisions, so each point emits once. The initial set is these 11 points:

1. Run start and end (workflow entry and completion)
2. Each model call inside `StreamLLMResponse`, including escalation and cache hit
3. Context assembly, with a summary of Context Ledger admitted and dropped items
4. Memory retrieval (L1 and L2 hits with ids and scores)
5. DPE policy evaluation per tool call (verdict, policy version, reason)
6. Tool execution, with a real `tool_call_id`
7. Approval requested and resolved
8. GAL governed write (links the signed receipt)
9. Multi-Agent Coordination Protocol (MACP) sub-agent spawn and completion (links the child run)
10. Agent-to-Agent (A2A) cross-org call (links the peer's attested card, never the peer's internals)
11. MediaGuard scan and redaction counts

Framework runs (bring your own framework and the SDK harness) already emit OTel spans through their frameworks. They send OTLP (the OTel wire protocol) to a tenant-authenticated ingest endpoint, and the normalizer maps OTel GenAI and OpenInference attributes into run events. Model calls routed through the Actrone gateway get emitted server-side regardless of framework.

### Idempotency under Temporal retries

Temporal retries activities, so a naive emitter writes duplicate spans. The emitter derives `event_id` as UUIDv5 over `(run_id, activity_id, attempt, step_index, phase)`, and the store inserts with `ON CONFLICT DO NOTHING`. The map shows retries as attempts on one node, not as sibling nodes.

### Delivery guarantees

Emitting never blocks or fails an agent turn. The emitter publishes to NATS JetStream with a synchronous ack, a 2s timeout and 3 attempts with exponential backoff and jitter. On persistent failure it increments `runtrace_events_dropped_total` and records a gap marker when the connection recovers.

Events the business depends on stay durable through their own ledgers: GAL receipts, approvals and audit spine entries are transactional today. The map links to them, so a telemetry gap never loses a governed decision. When `seq` numbers are missing, the UI labels the gap instead of drawing a silently incomplete graph, and because the map is audit grade, the attestation records the gap too.

## Storage

Postgres is the first store because the platform already runs it with residency routing and tenant sharding; ClickHouse is a measured later step. Langfuse moved to ClickHouse once Postgres fell behind on analytical scans over billions of spans, and the same trigger applies here.

### Phase 1: partitioned Postgres

A batching ingester consumes a durable JetStream consumer on `run.{tenant}.{run}`. It writes with `COPY` in batches of 500 rows or every 200 ms, acks after commit, and sends poison messages to `run.deadletter`. It drains and flushes on `SIGTERM`.

```sql
CREATE TABLE run_events (
    tenant_id      UUID        NOT NULL,
    run_id         UUID        NOT NULL,
    seq            BIGINT      NOT NULL,
    event_id       UUID        NOT NULL,
    span_id        TEXT        NOT NULL,
    parent_span_id TEXT        NOT NULL DEFAULT '',
    phase          TEXT        NOT NULL,
    kind           TEXT        NOT NULL,
    name           TEXT        NOT NULL,
    status         TEXT        NOT NULL,
    source         TEXT        NOT NULL DEFAULT 'live',
    ts             TIMESTAMPTZ NOT NULL,
    usage          JSONB,
    attrs          JSONB,
    content_ref    TEXT,
    content_hash   TEXT,
    links          JSONB,
    PRIMARY KEY (tenant_id, run_id, seq, ts)
) PARTITION BY RANGE (ts);
```

Monthly partitions make retention a partition drop instead of a `DELETE`; the locked retention tiers apply per tenant through a nightly job that deletes expired runs from partitions still holding other tenants' data. Indexes cover `(tenant_id, run_id, seq)` for the run map, `(tenant_id, agent_id, ts DESC)` for agent history, and a Block Range INdex (BRIN) on `ts`. A unique index on `(tenant_id, event_id, ts)` backs deduplication. Repositories route through `regionpool`, so data residency and tenant sharding apply with no new routing work.

A rollup job builds `fleet_edges_5m` (tenant, window, source node, target node, calls, errors, blocks, cost, p95 latency) for the fleet map, so the fleet view never scans raw events.

### Phase 3 trigger: ClickHouse

Move raw events and rollups to ClickHouse when either threshold holds for 7 days: sustained ingest above 2,000 events per second per region, or run map snapshot p95 above 300 ms at the target partition size. Postgres keeps the run index. ClickHouse stays optional for self-host, which keeps a Postgres-only install possible for regulated buyers.

### Tamper evidence

When a run ends, the ingester computes a hash chain over the run's ordered `(seq, event_id, content_hash)` and seals the root into the existing per-run Ed25519 attestation. An auditor can verify that the historical map matches the signed record. Because the seal covers `content_hash` and not the content, erasing a prompt blob for a General Data Protection Regulation (GDPR) request leaves verification intact.

## Live delivery: snapshot plus tail

A late viewer must see the whole run, and a reconnecting viewer must not lose or double events. The run map uses the snapshot plus tail pattern:

1. The client calls `GET /v1/runs/{id}/map` and gets folded spans up to `seq = S`
2. The client opens `GET /v1/runs/{id}/events?after_seq=S` over SSE
3. The server replays events after `S` from the store, then switches to the live JetStream subscription, discarding any `seq <= last_sent`
4. On reconnect the browser sends `Last-Event-ID`, and the server resumes from that `seq`
5. If the client sees a `seq` gap, it refetches the snapshot

Token deltas don't become map events; the map receives token counts coalesced every 500 ms on the open `chat` span. An Agent-User Interaction (AG-UI) protocol adapter is worth adding later for customers embedding agents in their own frontends, but AG-UI targets interaction, not audit, so it isn't the map's internal format.

## API surface

The endpoints follow existing tenant, role-based access control (RBAC) and error conventions, with rate limits on SSE connections per principal:

| Endpoint | Returns | Access |
| --- | --- | --- |
| `GET /v1/runs/{id}/map` | Folded span tree, edges, governance overlays, collapsed loop groups. Paginated by depth | Tenant member with task read |
| `GET /v1/runs/{id}/events` | SSE tail with resume | Same |
| `GET /v1/runs/{id}/spans/{span_id}` | Span detail with content previews when permitted | Same. Full content uses the auditor-gated reveal flow from L3, and each reveal writes an audit event |
| `GET /v1/fleet/map` | Aggregate graph for `from`, `to`, `agent`, `tool` filters | Org admin or observer role |
| `GET /v1/runs/{id}/map/export` | OTLP JSON, content excluded unless revealed | Same as map |
| `POST /v1/tasks/{id}/replay-edit` (exists) | Governed fork from a chosen span, with an idempotency key | Existing EMAOP agent admin scope |

## UI

The [design spec](design/agent-map/README.md) is authoritative for the look, motion and behaviour, and the [mockup](design/agent-map/agent-map.html) renders it in both themes. The frontend skills required by CLAUDE.md §0.2.1 were run to produce it. In summary:

- **Graph**: React Flow (`@xyflow/react`) with `elkjs` layered layout in a Web Worker, loaded with `next/dynamic`; nodes are 196 by 56 px DOM panels with lucide icons, so they take tokens, focus rings and screen reader labels
- **Waterfall and playback**: one time scale shared by the ruler and the span rows, governance notches on the ruler, playhead state applied to every node
- **Drawer**: governance first, then receipt, call or hidden content, context ledger, usage, trace ids and actions
- **Tree view**: the accessible equivalent of the graph and the default below 768 px
- **Brand**: colour marks state only and always with an icon and text, running is a held ink border, no dots, pulses or animated counters, and new `--color-*-ink` tokens fix light-theme status contrast
- **Fleet map**: React Flow first with edge width buckets for volume and a required table view; Sigma.js only past 2,000 visible nodes

[AgentPrism](https://github.com/evilmartians/agent-prism) (Evil Martians, React components for OTel agent traces) is worth a spike for its tree patterns. Check its licence and maintenance first, pin the version, and restyle it to the brand before adopting any of it.

## Privacy and security

Prompts and tool payloads routinely contain PII, so capturing content is the riskiest part of this plan. The controls:

- **Capture policy per agent**: `redacted` by default (locked decision 1), `none` or `full` within tier limits, set in the agent spec so capture is a governed setting and not an environment variable
- **Redact before persistence**: payloads pass through the MediaGuard text seam before the blob write; the OTel export path adds the collector redaction processor in allowlist mode as a second layer
- **Storage**: blobs sit in residency-routed object storage, encrypted per tenant, with the locked retention tiers. Erasure requests cascade to run blobs and keep a tombstone with the hash
- **Isolation**: JetStream subjects are tenant-scoped, every endpoint checks tenant ownership before streaming, and cross-org A2A spans show only what the peer attests

## Observability of the map itself

The pipeline gets the standard service signals so its own failures are visible:

- Metrics: emitter publish latency and failures, `runtrace_events_dropped_total`, ingest lag (JetStream pending), batch size, dedupe count, dead-letter depth, open SSE connections, snapshot latency p50/p95/p99
- Service level objectives (SLOs): 99.9% of emitted events persisted within 5s; run map snapshot p95 under 300 ms for runs up to 5,000 events. Alerts use the existing multi-window burn-rate rules
- Health: the ingester reports readiness only when both JetStream and Postgres are reachable

## Rollout

Each phase ships on its own and is useful without the next one.

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| M0: fix what's broken | Problems 1 to 4, 7 to 20, 22 and 24: dead button removed, stream `seq`/`event_id`/`ts`/`tool_call_id`, WebSocket origin check, error states, brand and accessibility fixes across TraceViewer, TaskReplayConsole, ToolCallTimeline and coordination, status ink tokens in `Badge` | Parallel tool calls pair correctly; no dead buttons; `web-design-guidelines` re-audit passes on the four files; light-theme badges measure at least 4.5:1 |
| M1: capture spine | Contract, emitter at the 11 points, OTel GenAI spans, JetStream stream, ingester, partitioned table, retention job, per-run seal, reconstructed backfill for pre-M1 runs | A run older than Temporal retention rebuilds fully; an injected retry produces no duplicate spans; a pre-M1 run reads as reconstructed |
| M2: run map and history replay | Snapshot and SSE tail, graph, waterfall, playback, drawer, tree view, URL state, "Fork from here", `/tasks/[taskId]` and `/replay` rewired, chat links, TS and Python SDK readers with contract tests | All replay acceptance tests pass; axe audit passes; verified at 375, 768, 1280 and 1920 px in both themes against the design spec |
| M3: content and privacy | Capture policy, redaction, blob store, auditor-gated reveal, erasure | Erasure test passes with the attestation still verifying |
| M4: framework ingest | OTLP ingest endpoint, normalizer, harness emit | A LangGraph run and a Vercel AI SDK run each render a correct map |
| M5: fleet map | Rollups, aggregate graph, table view, anomaly overlays, `/coordination` replaced | Fleet query p95 under 500 ms over 30 days for the largest test tenant |
| M6: scale-out | ClickHouse behind the storage interface when the trigger fires; run-to-run diff | Only started once the trigger metrics are met |

## Risks

The main risks are volume, instability of the conventions, and readability:

- OTel GenAI conventions are still Development, so attribute names will change; the single normalizer limits the blast radius to one module
- Long autonomous loops can emit thousands of spans; loop folding, the 8 KB attribute cap and blob offload keep row size and UI load bounded
- Content capture creates a PII store; redaction before persistence, per-tenant encryption and the reveal audit keep it governed, and `none` stays available for customers who won't accept any capture
- Audit grade raises the bar on gaps; the SLO and the attested gap record make that failure visible instead of silent

## Sources

- [OpenTelemetry GenAI conventions status in 2026](https://dev.to/azena-ai/opentelemetrys-genai-semantic-conventions-are-not-stable-yet-heres-what-actually-shipped-in-2026-3mke)
- [OTel for AI systems (Uptrace)](https://uptrace.dev/blog/opentelemetry-ai-systems)
- [How Langfuse runs ClickHouse at agent scale](https://langfuse.com/resources/engineering/clickhouse-at-agent-scale)
- [Self-hosting LLMOps: Postgres and ClickHouse tradeoffs](https://futureagi.com/blog/llm-observability-self-hosting-guide-2026/)
- [Agent observability platform comparison 2026](https://www.digitalapplied.com/blog/agent-observability-platforms-langsmith-langfuse-arize-2026)
- [AgentPrism](https://github.com/evilmartians/agent-prism)
- [React Flow performance](https://reactflow.dev/learn/advanced-use/performance) and [elkjs layout](https://reactflow.dev/examples/layout/elkjs)
- [Sigma.js](https://www.sigmajs.org/)
- [AG-UI protocol](https://docs.ag-ui.com/introduction)
- [Redacting prompts in GenAI OTel traces](https://oneuptime.com/blog/post/2026-02-06-redact-sensitive-prompts-genai-opentelemetry-traces/view)
