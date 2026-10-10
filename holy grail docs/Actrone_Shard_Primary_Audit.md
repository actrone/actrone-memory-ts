# Cross-Shard `Primary()` Correctness Audit (Tier-2 P0.3)

> **Why this exists.** Under tenant-sharding, a tenant's rows live on **their shard**, not the
> primary. Any data access via the tenant-router escape hatch `router.Primary()` therefore bypasses
> shard routing and is a **latent cross-shard bug** the moment a tenant is moved to a shard. This
> matrix classifies every such call site; the CI guard (`internal/shardguard`,
> `TestNoUnauditedPrimaryUses`) fails a new un-audited `Primary()` use, and each site carries an
> inline `// shard-ok: <class>` annotation.
>
> **Status today:** sharding is dormant (no shard DSNs) ⇒ `Primary()` is the only pool ⇒ every site
> below is correct as-is. The "resolution" column is what must change **when sharding turns on**.

## Classification vocabulary

| Class (`shard-ok:` tag) | Meaning | Resolution when sharding turns on |
| --- | --- | --- |
| `control-plane` | Keyed by a **non-tenant identifier** (route token, agent id, workflow id, connector id) where the tenant is unknown at the call site. | A control-plane index resolves `key → tenant → shard` (the same directory pattern as `tenant_shard_assignments`), or the caller threads the now-known tenant and routes via `ForTenant`. These lookups must NOT scatter-gather on the hot path. |
| `route-by-tenant-todo` | Keyed by a tenant-owned row id where **the caller already knows the tenant** (e.g. a Temporal activity carrying `AgentTaskInput.TenantID`) but the current code routes on the primary. | Thread the tenant id and route via `router.ForTenant(ctx, tenantID)`. A mechanical, low-risk change gated on turn-up. |
| `cross-tenant-sweep` | Legitimately enumerates rows **across all tenants** (batch queue, retention sweep). | **Done (P4):** both sites now fan out via `router.AllPools()` + `regionpool.Scatter` and merge in Go. Never a live cross-shard JOIN, never on the OLTP hot path. |

## The call sites

| # | Call site | Key | Class | Resolution |
| --- | --- | --- | --- | --- |
| 1 | `repository/tasks.go` `UpdateStatus` | task id | `route-by-tenant-todo` | activity knows tenant → `ForTenant` |
| 2 | `repository/tasks.go` `SetOutput` | task id | `route-by-tenant-todo` | activity knows tenant → `ForTenant` |
| 3 | `repository/tasks.go` `RecordReasoningSpend` | task id | `route-by-tenant-todo` | activity knows tenant → `ForTenant` |
| 4 | `repository/tasks.go` `SetBatchJob` | task id | `route-by-tenant-todo` | batch service knows tenant → `ForTenant` |
| 5 | `repository/tasks.go` `ListBatchQueued` | — (all) | `cross-tenant-sweep` | **RESOLVED (P4)** — scatters across `router.AllPools()`, merges oldest-first, dedupes by task id, truncates to `limit`. Best-effort: a failing pool is skipped (a `batch_queued` row is durable and is picked up next tick) and counted as `shard_scatter_total{result="partial"}`. |
| 6 | `repository/agents.go` `GetAgentFile` | agent id | `control-plane` | agent→tenant→shard index |
| 7 | `repository/agents.go` `ListTenantIDs` | — (all) | `cross-tenant-sweep` | **RESOLVED (P4)** — scatters across `router.AllPools()`, dedupes and sorts. Completeness is MANDATORY (a missed tenant is a tenant whose expired data is never deleted), so a partial sweep is a hard error and the retention run retries. |
| 8 | `repository/identity.go` `GetByWorkflowID` | workflow id | `control-plane` | workflow→tenant index |
| 9 | `channels/store.go` `ResolveInbound` | route token | `control-plane` | route→tenant index (webhook, tenant unknown) |
| 10 | `channels/store.go` `VerifyLink` | verify token | `control-plane` | link→tenant index |
| 11 | `connector/store.go` `MarkNeedsReauth` | connector id | `control-plane` | connector→tenant index / thread tenant |
| 12 | `repository/sandbox.go` (provision/teardown + session CRUD) | user id / schema name | `control-plane` | The onboarding sandbox is an ephemeral SCHEMA on the primary seeded with SYNTHETIC data (TTL-reaped); `sandbox_sessions` tracks it and the reaper sweeps it cross-user. Never a tenant's sharded data plane, so it stays on the primary by design. |

## Global control-plane data (never sharded)

Separate from the escape-hatch sites above: several stores are constructed directly on `db.Pool()`
(the primary) because their data is **inherently global control-plane** and must live in the
unsharded control DB — not a tenant shard. These are correct by design and are NOT flagged by the
guard (they do not call `router.Primary()`; they never route by tenant):

- the tenant→shard **directory itself** (`tenant_shard_assignments`), plan/entitlement catalog,
  platform-admin tables, marketplace cross-org listings, A2A / action-fabric cross-org trust, the
  organizations/tenants identity mirror.

Missing one of these (putting genuinely-global data on a shard) is a correctness bug — hence the
directory-first invariant (P0.1) keeps the control plane on the primary.

## The guard

`internal/shardguard` scans `internal/` + `cmd/` (excluding `_test.go`) for `.Primary()` call sites
and fails any lacking a `shard-ok:` annotation (inline or on the preceding line).
`TestScanViolations_Logic` unit-tests the scanner; `TestNoUnauditedPrimaryUses` enforces it on the
tree. To add a legitimate new `Primary()` use: classify it here, annotate the call site, done.

---

Last updated: 2026-07-22 | Tier-2 build plan P0.3 | Companion to
`Actrone_Postgres_Write_Scaling_Tier2_Buildout.md`.
