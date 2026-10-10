# Actrone — Governed Agent-to-Agent (A2A) Control Plane

> **Status refreshed 2026-07-13 (code-verified):** The "Status: proposed" line below is
> significantly stale — this design has since been substantially implemented. `internal/a2a/`
> contains a large, real package: `agentcard.go`, `bridge.go`, `client.go`, `connection.go`,
> `inbound.go`, `metrics.go`, `partstore.go`, `provenance.go`, `push.go`, `registry.go`,
> `repository.go`, `service.go`, `spec.go` (each with a matching `_test.go`). It is fully wired
> in `backend/orchestrator/cmd/orchestrator/main.go`: `a2a.NewService`/`NewRegistry`/
> `NewSignedPartStore` are constructed, and `A2AHandler` mounts a wide route set —
> `/.well-known/agent-card.json`, `/a2a/parts/{id}`, `/a2a/rpc`, `/a2a/agent-card`,
> `/a2a/profiles` (list/create/delete), `/a2a/connections` (list/create/approve/disable/
> healthcheck/delete — the `established→active→quarantined` lifecycle this doc describes),
> `/a2a/connections/{id}/dispatch`, `/a2a/provenance/{contextID}`, and `/a2a/connections/{id}/push`
> (get/set). This confirms the core thesis (§1) — A2A as a governed source alongside native tools
> and MCP — is real, not aspirational. **What this pass did NOT do**: verify every specific
> design claim in §3 onward (protocol compliance details, exact reuse of MCP Hub primitives like
> the SSRF guard/circuit breakers/spend caps against A2A specifically, the durable-execution
> session-freeze claim in §4.3, context-optimisation in §5.5) line-by-line against the
> implementation — treat those sections as "very likely implemented given the scale of
> `internal/a2a`" but **(unverified 2026-07-13)** in their specifics. The doc's own status line and
> "Owner: platform" placeholder should be updated by whoever owns the next full pass; this note
> only corrects the top-level "proposed" framing, which is no longer true.
>
> Engineering design document. Scope: extend Actrone's control plane to the
> Agent-to-Agent (A2A) protocol as a **third governed source** alongside native
> tools and the MCP Hub — interoperable, verifiable, and built by reusing the
> primitives that already ship in the codebase.
>
> Status: proposed · Owner: platform · Conforms to the workspace `CLAUDE.md`.

---

## 1. Thesis & moat

The open [A2A protocol](https://a2a-protocol.org/latest/specification/) (JSON-RPC 2.0
over HTTP + SSE, Agent Cards for discovery; an Apache-2.0 Linux Foundation project
with 150+ supporting organisations) standardises *how* agents from different
frameworks discover and delegate to each other. It deliberately says nothing about
**runtime security, multi-tenancy, cost containment, provenance, or injection
defence**. Every framework that adopts A2A pushes those concerns back into
application code.

**Actrone's moat is that it already governs the other half of the problem.** The
MCP Hub gives us a credential vault, an SSRF/dial-time guard, tool-poisoning
scanning, hash-pinning, per-server circuit breakers, tier gating, spend caps, and a
tamper-evident Merkle audit ledger — all behind one Tool-Call Supervisor. A2A is
not a new platform; it is the **same control plane pointed at agents instead of
tools**:

```
            Native tools  ┐
            MCP servers   ├──►  Tool-Call Supervisor  ──►  unified audit + spend caps
            A2A agents    ┘      (schema · authz · rate
                                 limit · cap · SSRF · scan
                                 · execute · validate · audit)
```

One governance surface for **tools (MCP) and agents (A2A)** is something no
framework-level SDK can offer. That unification — plus verifiable cross-agent
provenance (§5.2) — is the groundbreaking part. Everything else is reuse.

### Non-goals

- We do **not** fork or extend the A2A wire protocol. External interop uses the
  canonical spec verbatim; governance is applied internally.
- We do **not** silently rewrite or lossily compress another agent's payload on the
  wire (correctness + trust hazard). Context optimisation is lossless and opt-in (§5.5).
- We do **not** hand-roll process-memory freeze/restore. Session durability rides
  the existing durable-execution layer (§4.3).

---

## 2. Design principles

1. **Spec-compliant at the edge.** External agents talk to us in unmodified A2A;
   if a LangGraph/CrewAI/ADK agent can't connect without custom code, we've failed.
2. **Reuse, don't reinvent.** `internal/a2a` is a sibling of `internal/mcphub` and
   depends on the same primitives (§4.1). No second vault, no second SSRF guard, no
   second ledger.
3. **One supervisor, one audit trail.** Every A2A call is a supervised call and
   lands in the same append-only ledger as native + MCP calls.
4. **Untrusted remotes by default.** A remote agent is treated exactly like an
   untrusted MCP server: screened, pinned, scanned, rate-limited, broken-circuited.
5. **Identity from the token, never the client.** Tenant/role derive from the
   validated principal, not a client-supplied header.
6. **Explicit over clever** (CLAUDE.md §0.4). Components are named for what they do.

---

## 3. A2A protocol compliance (the external contract)

We implement the canonical surface so we interoperate out of the box.

### 3.1 Discovery — the Agent Card

- **`GET /.well-known/agent-card.json`** → the public Agent Card.
- **`agent/getAuthenticatedExtendedCard`** (JSON-RPC) → a **per-caller** card: the
  intersection of advertised capabilities and the authenticated caller's authz tier
  (§5.3). Two callers can legitimately see two different cards, enforced server-side.

The card is **generated**, not hand-authored: a compiler reads the org's enabled
agents/skills, their input/output schemas, declared `securitySchemes`, and the
caller's RBAC, then emits a spec-shaped `AgentCard` (`name`, `description`, `url`,
`version`, `capabilities{streaming,pushNotifications,stateTransitionHistory}`,
`defaultInputModes`/`defaultOutputModes`, `skills[]`, `securitySchemes`, `provider`).

### 3.2 Messaging & tasks — JSON-RPC 2.0

A single JSON-RPC endpoint (e.g. `POST /a2a/rpc`) dispatches the canonical methods:

| Method | Purpose |
| --- | --- |
| `message/send` | Send a message; receive the resulting `Task`/`Message`. Idempotency-keyed. |
| `message/stream` | Same, streamed as SSE (`Task`, `TaskStatusUpdateEvent`, `TaskArtifactUpdateEvent`). |
| `tasks/get` | Poll a task's status, artifacts, and history. |
| `tasks/cancel` | Cancel a running task. |
| `tasks/resubscribe` | Re-attach an SSE stream to an existing task. |
| `tasks/pushNotificationConfig/set` · `/get` | Register/read a webhook for long-running task updates. |

We honour the spec's **Task state machine**: `submitted → working →
input-required → completed | failed | canceled | rejected | auth-required`. Internal
execution state (workers, cells) is **never** exposed — responses carry only opaque
`id` + `contextId`.

### 3.3 Transport

HTTP + JSON-RPC 2.0 for unary; **SSE** for streaming, per spec. WebSockets are used
only internally (Control Tower live view), never on the A2A wire.

---

## 4. Architecture

### 4.1 Package layout (sibling of `internal/mcphub`, reusing its primitives)

```
/internal/a2a/
  service.go        — use-case layer: dispatch, session lifecycle, card compilation
  agentcard.go      — per-caller AgentCard compiler (capability ∩ authz)
  client.go         — outbound A2A client (spec methods) over the hardened transport
  server.go         — inbound JSON-RPC + SSE handlers (spec methods)
  repository.go     — tenant-scoped persistence (profiles, connections)
  provenance.go     — cross-agent Merkle DAG (signed hop chaining)
  tier.go           — exposure/plan gating (reuses mcphub plan resolver)
```

**Reused as-is — no new copies:**

| Concern | Reused primitive |
| --- | --- |
| Credential isolation | `mcphub.CredentialVault` (AES-256-GCM) |
| Egress / SSRF + DNS-rebinding | `mcphub.ValidateServerURL` + `internal/netguard` + `mcp.SafeHTTPClient` |
| Per-remote circuit breaking | `mcp.BreakerGroup` (keyed by remote agent URL) |
| Response injection defence | `mcphub.ScanForPoisoning` (extended to A2A artifacts) |
| Anti "agent rug-pull" | `mcphub.ComputeToolHash`-style pin over the remote Agent Card |
| Authz / tenancy | `middleware.TenantIDFromContext` / `OrgRoleFromContext` / `RequireOrgAdmin` |
| Supervision + audit + caps | the existing Tool-Call Supervisor + audit ledger |
| Errors | `domain.DomainError` (code/message/details/request_id) |
| Migrations | goose, embedded via `go:embed` (the prod fix we already shipped) |

### 4.2 Request path

1. **Inbound auth** — validate the caller's token; resolve tenant + role. Reject
   any client-supplied tenant header.
2. **Capability check** — the requested skill must be in the caller's per-caller
   card (authz tier + connection allowlist).
3. **Supervisor** — schema validation → permission → rate limit → spend cap → SSRF
   (for any callback/file URIs) → execute → response validation → audit. Same
   pipeline as native/MCP.
4. **Dispatch** — run as a durable session (§4.3); to call a *remote* agent, the
   outbound client uses the vault credential, the hardened transport, and the
   per-remote breaker.
5. **Provenance** — every hop is hashed and chained into the unified ledger keyed by
   A2A `contextId` (§5.2), with `traceparent` propagated downstream.

### 4.3 Session durability (no bespoke memory freezing)

An A2A task is modelled as a **durable workflow** on stateless, autoscaled workers.
It survives process restarts by design and is idempotent by `contextId` +
idempotency key — giving scale-to-zero economics without snapshotting live memory.
Long-running tasks use the spec's **push-notification config** (webhook) so callers
need not hold a connection open; the webhook fires from the durable workflow.

---

## 5. Capabilities (what makes this groundbreaking)

### 5.1 Unified tool + agent control plane
A2A agents are a third callable source behind the same Supervisor, audit ledger,
and spend caps as native tools and MCP. One policy surface for tools *and* agents.

### 5.2 Verifiable cross-agent provenance
Each A2A hop is recorded as a signed node in a **Merkle DAG** keyed by `contextId`,
and W3C `traceparent` is propagated to every downstream agent. Outcome: a task that
crossed five vendors' agents yields **one cryptographically verifiable,
end-to-end provenance graph + distributed trace** — an enterprise/compliance first.
This folds into the existing audit ledger; we do **not** create a separate one.

### 5.3 Per-caller dynamic Agent Cards
The card a caller receives is `advertised_capabilities ∩ caller_authz`. Built on the
spec's `agent/getAuthenticatedExtendedCard`. Server-enforced, so capability hiding
is real, not cosmetic.

### 5.4 Untrusted-remote treatment (remote agents == untrusted MCP servers)
- **Egress + SSRF/DNS-rebinding guard** on every outbound endpoint (reuse).
- **Agent-Card hash-pinning** — pin the remote card at approval; a silent change
  ("agent rug-pull") quarantines the connection until re-approved.
- **Response poisoning scan** — run the poisoning scanner over remote
  artifacts/messages (cross-agent prompt injection is the new attack surface).
- **Per-remote circuit breaker** + timeout + retry-with-jitter (reuse).

### 5.5 Lossless context optimisation (replaces the "semantic compactor")
No silent on-wire rewriting. Instead: pass large `File`/`Data` Parts **by reference**
(spec `FilePart.uri` / artifact handles), dedup repeated context across turns, and
use provider prompt-caching. Savings are **measured per task**, opt-in, and never
alter task semantics. (CLAUDE.md §3.1: profile before optimising; no fabricated ratios.)

### 5.6 A2A ⇄ MCP bridge
Expose any governed MCP server as an A2A skill, and any A2A agent as an MCP tool —
since both already flow through the Supervisor. Unique two-way interop.

---

## 6. Data model

Goose migration. `TIMESTAMPTZ` + `now()`, FK indexes, tenant-scoped, idempotent
writes. The audit chain lives in the **unified** ledger — no separate A2A ledger —
and spend is **derived** from append-only entries (CLAUDE.md §6.4: never `UPDATE`
financial records; the running counter below is an enforcement cache, not the source
of truth).

```sql
-- +goose Up
-- Governed A2A: agent profiles a tenant exposes, and connections to remote agents.
CREATE TYPE a2a_exposure_tier AS ENUM ('private', 'organization', 'public');
CREATE TYPE a2a_session_state AS ENUM ('established', 'active', 'completed', 'failed', 'terminated');

CREATE TABLE a2a_profiles (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL,
    agent_name       TEXT NOT NULL,
    version          TEXT NOT NULL DEFAULT '1.0.0',
    exposure         a2a_exposure_tier NOT NULL DEFAULT 'organization',
    -- Declarative skills/input schemas the card compiler reads.
    agent_card_spec  JSONB NOT NULL,
    is_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    min_tier         TEXT NOT NULL DEFAULT 'sme',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, agent_name, version)
);
CREATE INDEX idx_a2a_profiles_tenant ON a2a_profiles (tenant_id);

CREATE TABLE a2a_connections (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL,
    profile_id           UUID REFERENCES a2a_profiles(id) ON DELETE SET NULL,
    remote_endpoint_url  TEXT NOT NULL,                 -- SSRF-screened at create + dial time
    -- AES-256-GCM ciphertext of the outbound credential (never plaintext).
    encrypted_credential TEXT NOT NULL DEFAULT '',
    -- SHA-256 of the approved remote Agent Card (anti "agent rug-pull").
    card_pin             TEXT NOT NULL DEFAULT '',
    allowed_skills       TEXT[] NOT NULL DEFAULT '{}',  -- least-privilege allowlist
    session_state        a2a_session_state NOT NULL DEFAULT 'established',
    spend_limit_usd      NUMERIC(12,4) NOT NULL DEFAULT 50.0000,
    spend_used_usd       NUMERIC(12,4) NOT NULL DEFAULT 0.0000,  -- enforcement cache; ledger is source of truth
    status_reason        TEXT NOT NULL DEFAULT '',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, remote_endpoint_url)
);
CREATE INDEX idx_a2a_connections_tenant ON a2a_connections (tenant_id);
CREATE INDEX idx_a2a_connections_active ON a2a_connections (tenant_id, session_state)
    WHERE session_state = 'active';

-- Idempotency for message/send: same key => same task, never a duplicate.
CREATE TABLE a2a_idempotency (
    tenant_id     UUID NOT NULL,
    idem_key      TEXT NOT NULL,
    context_id    TEXT NOT NULL,
    task_id       TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, idem_key)
);

-- +goose Down
DROP TABLE IF EXISTS a2a_idempotency;
DROP INDEX IF EXISTS idx_a2a_connections_active;
DROP INDEX IF EXISTS idx_a2a_connections_tenant;
DROP TABLE IF EXISTS a2a_connections;
DROP INDEX IF EXISTS idx_a2a_profiles_tenant;
DROP TABLE IF EXISTS a2a_profiles;
DROP TYPE IF EXISTS a2a_session_state;
DROP TYPE IF EXISTS a2a_exposure_tier;
```

Provenance hops reuse the existing audit-ledger table (one chain per `contextId`),
so there is a single tamper-evident trail across native, MCP, and A2A activity.

---

## 7. API specification

### 7.1 External (spec-compliant — for interop)
- `GET /.well-known/agent-card.json` — public Agent Card.
- `POST /a2a/rpc` — JSON-RPC 2.0: `message/send`, `message/stream` (SSE),
  `tasks/get`, `tasks/cancel`, `tasks/resubscribe`,
  `tasks/pushNotificationConfig/set|get`, `agent/getAuthenticatedExtendedCard`.
- Auth + tenant resolution from the validated token; `message/send` requires an
  idempotency key. Responses expose only `id` + `contextId` (no internal infra).

### 7.2 Internal management (Actrone API — for operators)
Under `/v1/a2a/*`, behind Clerk auth; writes gated by `RequireOrgAdmin`:
- `GET/POST /v1/a2a/profiles` · `…/{id}` — exposed-agent CRUD.
- `GET/POST /v1/a2a/connections` · `POST …/{id}/approve` · `…/disable` ·
  `DELETE …/{id}` — remote-agent connections (mirrors the MCP connection lifecycle:
  create → screen URL → pin card → approve skills → active).

---

## 8. Security model (CLAUDE.md §5)

- **Inbound auth:** verify caller JWT/API key; tenant + role from the principal,
  never a header. Per-skill authorisation in the service, not just the gateway.
- **Outbound auth:** vault-sealed credentials; the remote agent's token never
  reaches the calling model. Declared `securitySchemes` honoured per the card.
- **Egress:** SSRF + DNS-rebinding screen on every remote endpoint and callback URI.
- **Injection:** poisoning scan on remote responses/artifacts; card hash-pinning to
  catch silent capability changes.
- **Least privilege:** explicit `allowed_skills` allowlist per connection; nothing on
  by default.
- **Secrets:** env/secret-manager only; pre-commit `gitleaks`; no secret in source.
- **Transport:** TLS 1.3 outbound; mTLS internally via the platform network layer.

---

## 9. Resilience (CLAUDE.md §4.4 / §6)
- Mandatory timeout + retry (exponential backoff + jitter, ≤3 attempts) + per-remote
  circuit breaker on every outbound hop.
- Idempotency keys on all writes (`message/send`, management mutations).
- Graceful shutdown: stop accepting new sessions, drain in-flight, persist durable
  state, flush logs, exit 0.
- Durable sessions resume after restart; push-notification webhooks are retried.

---

## 10. Observability (CLAUDE.md §6.3)
- Structured JSON logs with `service`, `request_id`, `trace_id`, `event`
  (e.g. `a2a.task.dispatched`), `tenant_id`, `context_id`.
- W3C `traceparent` propagated to every downstream agent — end-to-end distributed
  trace across vendors.
- Prometheus metrics: request/error rate, hop latency p50/p95/p99, breaker state,
  tokens + cost per task, card-pin mismatches, poisoning hits.

---

## 11. Control Tower UI (CLAUDE.md §8)
The A2A view lives in the existing Control Tower and uses **design tokens only** —
no hardcoded colours, no bespoke palette. It is **system-theme aware** (we removed
forced dark). Surfaces: registered/exposed agents, remote connections with
pin/health status, the live provenance graph per `contextId`, token/cost meters,
and per-skill allowlist toggles. Loading, empty, and error states for every async
view; WCAG-AA contrast; keyboard-navigable. (The plan's emerald-on-black mock is
explicitly out — it violates the brand and §8.4.)

---

## 12. Testing (CLAUDE.md §7)
- **Unit:** card compiler (capability ∩ authz), provenance chaining, SSRF/pin/scan
  reuse, idempotency.
- **Contract:** validate inbound/outbound payloads against the **A2A JSON schema**
  (interop is a contract) + buf-style breaking checks on our management API.
- **Integration (testcontainers):** durable session lifecycle, remote dispatch
  against a fake A2A server, breaker trip/recover, card-rug-pull quarantine.
- **E2E:** one cross-framework journey (Actrone ⇄ a reference A2A agent).
- Deterministic; error paths tested as rigorously as happy paths.

---

## 13. Roadmap

**Phase 1 — Spec-compliant interop.** Agent Card (`/.well-known/agent-card.json`),
JSON-RPC `message/send` + `tasks/get` + `message/stream` (SSE), outbound client over
the hardened transport, profiles/connections schema + repository. Reuse vault, SSRF,
breaker. *Exit:* a reference A2A agent connects with zero custom code.

**Phase 2 — Governance.** Route through the Tool-Call Supervisor; unified audit +
spend caps; response poisoning scan; Agent-Card pinning + rug-pull quarantine;
per-caller cards (`getAuthenticatedExtendedCard`); idempotency.

**Phase 3 — Verifiable provenance.** Cross-agent Merkle DAG keyed by `contextId`;
`traceparent` propagation; push-notification (durable webhook) support; metrics.

**Phase 4 — Surface & scale.** Control Tower view (tokens, theme-aware, full
states); lossless context-by-reference optimisation; A2A ⇄ MCP bridge; SSO/SCIM +
multi-tenant rate/billing limits; end-to-end load tests.

---

## References
- A2A specification (latest): https://a2a-protocol.org/latest/specification/
- A2A specification v0.3.0: https://a2a-protocol.org/v0.3.0/specification/
- A2A project (Linux Foundation, Apache-2.0): https://github.com/a2aproject/A2A
- Workspace engineering standards: `CLAUDE.md`
- Reused primitives: `internal/mcphub`, `internal/mcp`, `internal/netguard`
