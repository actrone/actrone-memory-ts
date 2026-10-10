# Actrone — Tier 2 Tenant-Sharding: Production Build-and-Wire Plan

> **Companion to** [`Actrone_Postgres_Write_Scaling_Plan.md`](./Actrone_Postgres_Write_Scaling_Plan.md)
> (the tier strategy). That doc says *when* to climb each tier and *why* Tier 2 is an extension, not a
> rewrite. **This doc operationalizes Tier 2**: everything required to take the dormant-but-built
> tenant-shard routing to a **production-grade, safe-to-turn-up** capability — build, wire, test, and
> operate — to `CLAUDE.md` standards.
>
> **Scope.** Postgres write-sharding by tenant, *within* a residency region. Out of scope: sharding the
> Qdrant / Redis / S3 planes (same seam, later), and Tier 3 (Aurora Limitless / Citus).
>
> **Owner:** Matt. **Status:** routing layer built + dormant; operational layer (this plan) NOT built.

---

## 0. Verified current state (code-grounded, 2026-07-19)

**BUILT + WIRED, dormant-by-config (turns on purely by adding shard DSNs):**

- **Routing primitive** — [`internal/regionpool/shard.go`](../backend/orchestrator/internal/regionpool/shard.go):
  `ShardRegistry[P]` (tenant → shard pool, fail-safe to default), `ConsistentHashResolver` (hash ring +
  virtual nodes + per-tenant override map). Unit-tested (`shard_test.go`).
- **Directory table** — migration [`00122_tenant_shard_assignments.sql`](../backend/orchestrator/migrations/00122_tenant_shard_assignments.sql):
  `tenant_shard_assignments(tenant_id PK, shard_id, reason, assigned_by, assigned_at, updated_at)` +
  a `shard_id` index. Overrides win over the hash; empty ⇒ pure consistent-hash.
- **Pool wiring** — [`internal/repository/db.go`](../backend/orchestrator/internal/repository/db.go):
  `shardPools`, `WithShardPools(shardDSNs)`, `ShardPools()`, `SetShardRegistry(...)`, and the PG
  `PoolRouter.ForTenant` composes **region → shard** internally, so the ~8 repos (which already call
  `router.ForTenant(ctx, tenantID)`) are untouched.
- **Bootstrap activation** — [`cmd/orchestrator/main.go`](../backend/orchestrator/cmd/orchestrator/main.go)
  (~L3151–3177): reads `cfg.Database.ShardDSNs`, opens per-shard pools, loads the override table, builds
  the resolver + registry, `db.SetShardRegistry(...)`, logs `scaling.shard_routing.active`. **No-op when
  no shard DSNs are configured** ⇒ every tenant stays on its region/primary pool.
- **The precondition holds:** every query is `WHERE tenant_id = $1`; **no cross-tenant joins**. Tenant is
  a clean shard key. Reader/writer split (`WithReader`) present.

**NOT BUILT — the operational layer this plan delivers (the actual risk surface):**

1. **Tenant-move / rebalance engine.** The region-cutover machinery
   ([`regionpool/migrator.go`](../backend/orchestrator/internal/regionpool/migrator.go),
   [`pgx_executor.go`](../backend/orchestrator/internal/regionpool/pgx_executor.go)) is **region-keyed
   only** (`grep -c shard` = 0). There is **no** move-between-shards, no Temporal move workflow, no
   rebalance. Without this, you can route new tenants to shards but can never move an existing one — so
   you can't relieve a hot shard. **This is the centerpiece of the plan (P2).**
2. **Migration fan-out across shards.** `goose` runs against one DSN; there is no shard loop. A schema
   change would reach the primary and **miss the shard clusters** → drift.
3. **Dynamic directory refresh.** Overrides load **once at bootstrap**; a live rebalance is invisible
   until every orchestrator instance restarts.
4. **Cross-shard correctness audit.** Every `router.Primary()` call and every non-tenant-scoped query is
   a latent cross-shard bug. No inventory exists.
5. **Cross-shard aggregation.** Platform-wide billing/analytics that `SUM()` one DB break once sharded.
6. **Per-shard observability + SLOs + turn-up runbook.** Tier 0 lists the signals; none are wired
   per-shard, and there is no shard-routing telemetry or move-workflow telemetry.
7. **A per-tenant quiesce primitive.** Only **per-agent** pause exists
   ([`repository/agent_control.go`](../backend/orchestrator/internal/repository/agent_control.go)); a
   safe move needs a **tenant-level write freeze**.

**The reversibility asymmetry (read this first — it reframes everything):** turning sharding *on* is
safe (inert default). But **once a tenant's data is moved to a shard, turning it *off* is NOT safe** —
routing would fall back to the primary pool where that tenant's data no longer lives. The "just remove
the shard DSNs" kill-switch is only clean **before any move**. After moves, rollback = **reverse-move**.
Every phase below is ordered so that the irreversible step (moving data) comes last and behind the most
testing.

---

## 1. Design principles / invariants (non-negotiable)

1. **Inert-by-default.** Zero shard DSNs ⇒ byte-identical to today. Every phase ships dormant first.
2. **Fail-safe routing.** A resolver error or an unregistered shard returns the *default* pool, **never a
   wrong shard**. (Already true in `ShardRegistry`; preserve it end-to-end.)
3. **Directory-first placement (policy change from the current default).** Make
   `tenant_shard_assignments` the **authoritative** placement and use consistent-hash **only for brand-new
   tenants**. Rationale: adding a shard must move **nobody** automatically — every move is a deliberate,
   audited, workflow-driven operation. (Consistent-hash-primary would reshuffle ~1/N tenants on every
   shard add, each of which is an irreversible data move — unacceptable.)
4. **Region-then-shard nesting.** Residency is the outer constraint; shard is the inner scale lever. A
   tenant's shard always lives inside their region's plane. (The directory table has no `region` column
   today — P0.4 addresses shard↔region consistency.)
5. **Tenant isolation is invariant through every step** — including mid-move (dual-location) states.
   Sharding must never open a cross-tenant read/write path.
6. **Determinism where Temporal runs it.** The move workflow must replay deterministically (version-gated
   changes; no wall-clock/rand in workflow code; all I/O in activities) — `CLAUDE.md §6` + the loop rules.
7. **Money/audit data is append-only + must-not-lose** during a move (`CLAUDE.md §6.4`): a move copies,
   verifies, then deletes source — never a lossy cut.

---

## 2. Phase P0 — Correctness foundation (no data ever moves here; fully reversible)

### P0.1 — Flip to directory-first placement
- **[CODE]** `ConsistentHashResolver.Shard`: overrides already win; make the **absence of shards** and the
  **new-tenant** path explicit. Add a startup guard: if shard pools are configured but a large fraction of
  active tenants have no directory row, **log a loud warning** (unplanned auto-placement risk).
- **CLAUDE.md:** typed config; fail-fast on a malformed override row; structured log with counts.
- **Tests:** table-driven `resolver` tests — override wins; new tenant hashes; empty set ⇒ `""`; a moved
  tenant (override present) never hashes elsewhere.

### P0.2 — Dynamic directory refresh
- **[CODE]** Replace the bootstrap-static override load with a **refreshable** source: Postgres
  `LISTEN/NOTIFY` on `tenant_shard_assignments` change (preferred — instant, no poll), with a bounded
  **fallback TTL re-read** (e.g. 30 s) so a missed notification self-heals. The `ShardRegistry`/resolver
  must accept an atomic override-map swap (mirror `Router.SetRegistry`'s atomic-pointer pattern).
- **Why it's a correctness item, not an optimisation:** after a move flips a directory row, **every**
  orchestrator instance must route the tenant to the new shard *before* the old rows are dropped, or a
  stale instance reads/writes the wrong (soon-empty) shard.
- **CLAUDE.md §4/§7:** the listener has a reconnect-with-backoff loop; a refresh failure logs + keeps the
  last-good map (fail-safe), never crashes routing.
- **Tests:** integration (real PG) — write an override, assert the resolver reflects it within the SLA;
  kill the listener, assert the TTL fallback re-reads; malformed row ⇒ last-good retained.

### P0.3 — Cross-shard correctness audit (the correctness gate)
- **[CODE/AUDIT]** Inventory **every** `router.Primary()` / `db.Primary()` call and every query not scoped
  by `tenant_id`. Classify each:
  - **Global control-plane** (the directory itself, platform admin, plan/entitlement catalog, marketplace
    cross-org, A2A/fabric cross-org trust) → must live in an **unsharded control DB**, not a shard.
  - **Legit cross-tenant aggregate** (billing rollups, platform analytics) → P4 scatter-gather / async
    rollup, never a live cross-shard `JOIN`.
  - **Bug** (a tenant-scoped query that forgot to route) → fix to `ForTenant`.
- **Deliverable:** a checked-in `docs/` matrix (call site → class → resolution) + a **lint/CI check** that
  fails a new `Primary()` use without an allowlist annotation (prevents regression).
- **Tests:** the CI guard has a unit test (allowlisted call passes; a new bare `Primary()` fails).

### P0.4 — Shard↔region consistency + shard-key stability
- **[CODE]** Add a `region` column to `tenant_shard_assignments` (migration **00134**), or enforce a shard
  id naming convention that encodes region (`eu-0`, `us-1`), so a shard can never be chosen outside the
  tenant's residency plane. Wire the region check into the composed router (reject a shard whose region ≠
  the tenant's home region → fail-safe to the region default).
- Document the **shard key is immutable** (org/tenant id); never derive it from mutable data.
- **Migration** is additive + reversible (`CLAUDE.md §6.4`); backfill existing rows to their region.
- **Tests:** a directory row pointing at a wrong-region shard is rejected (fail-safe), not honoured.

**P0 exit criteria:** all of the above merged, dormant (no shard DSNs in any env), CI guards green,
`go build ./... && go test ./internal/regionpool/... ./internal/repository/...` green.

---

## 3. Phase P1 — Schema fan-out across shards (still zero tenant data on shards)

- **[CODE]** Make the migration runner **shard-aware**: apply the `goose` chain to the primary **and every
  configured shard pool** (a loop over `db.ShardPools()` + the primary), transactionally per target, with
  a per-shard applied-version check. A partial fan-out (shard N behind) must be **detectable and
  reported**, never silent.
- **[CODE]** Extend the **contract/migration CI gate** (`CLAUDE.md §7.3`, §8) so "breaking-change" and
  "migrations apply cleanly" run against a **multi-shard** fixture (≥2 shards), not one cluster.
- **CLAUDE.md §6.4:** every migration remains backwards-compatible + reversible; rollback covered in an
  integration test **on each shard**.
- **Tests:** integration (testcontainers, 2 PG shards) — apply the full chain to both; assert identical
  `schema_migrations`; apply a new reversible migration; roll it back on one shard; assert drift is
  reported.

**P1 exit criteria:** a schema change provably reaches all shards; CI blocks a single-cluster assumption.

---

## 4. Phase P2 — The tenant-move / rebalance engine (the irreversible core)

This is the load-bearing, highest-risk build. It generalises the **region-cutover** primitive to
**shard-move** and runs it as a **durable Temporal workflow** (must-not-lose, resumable, compensating).

### P2.1 — Generalise the step executor + migrator, shard dimension
- **[CODE]** `regionpool/pgx_executor.go` already `CopyTable`/`DeleteSource` a tenant's rows between two
  pools. Add a **shard-keyed** `Migrator` path (or parameterise the existing one on *pools*, not
  *regions*): `Plan(fromShard, toShard)` + `Execute(ctx, tenantID, fromShard, toShard, idemKey, dryRun)`.
  Reuse `isResidencyTable` → generalise to "all tenant-owned tables" (a single authoritative list, drift-
  tested against the schema so a new tenant table can never be silently missed by a move).
- **CLAUDE.md §4/§6.2:** every step idempotent (keyed by `idemKey`); `CopyFrom` batched (`§3`); bounded
  concurrency; context deadlines on all I/O.

### P2.2 — Per-tenant write freeze (quiesce primitive)
- **[CODE]** Only per-agent pause exists. Add a **tenant-level freeze**: a durable `tenant_write_freeze`
  flag checked at the write boundary (task submit + governed-write commit) that returns a retryable
  `423 Locked`/`ERR_TENANT_MIGRATING` during a move window. Reuse the Control-Tower pause-gate pattern
  (`repository/agent_control.go`) at tenant granularity.
- **Tradeoff (documented):** a **brief write-freeze** (seconds–minutes for a normal tenant) is chosen over
  dual-write. Dual-write is faster-to-zero-downtime but doubles the correctness surface (two sources of
  truth, reconciliation, split-brain on failure). Freeze is simpler and *provably correct*; the freeze
  window is bounded by copy time, which the plan step measures and caps (oversized tenants → schedule /
  chunk, or accept a maintenance window). **Reads may continue** against the source until cutover.

### P2.3 — The move workflow (Temporal, SAGA)
Ordered steps, each an activity with a compensation:

1. **Plan + reserve** — compute the table/row plan; `dryRun` returns it without moving. Reject if
   `toShard` is in a different region than the tenant (P0.4).
2. **Freeze writes** (P2.2) — start the bounded window; audit-log the move start (signed ledger).
3. **Copy** — `CopyTable` every tenant-owned table `WHERE tenant_id = X` → `toShard`. Batched, resumable.
4. **Verify parity** — per-table row counts **+ checksums** (e.g. `md5(array_agg(... order by pk))` or a
   running hash) source vs destination. Any mismatch ⇒ **abort + compensate** (drop partial destination
   rows), unfreeze, leave the tenant on the source. **No cutover on unverified data.**
5. **Flip the directory** — upsert `tenant_shard_assignments(tenant_id, shard_id=toShard, reason='move')`
   in the control DB (the single authoritative switch).
6. **Propagate** — wait for the directory refresh (P0.2) to reach all instances (NOTIFY + a short barrier
   / readiness poll) so no instance still routes to the source.
7. **Backfill-verify** — re-verify parity for any rows written to the source *between* the freeze and the
   copy snapshot (belt-and-braces; with a hard freeze this is a no-op assertion).
8. **Unfreeze** — writes resume, now on `toShard`.
9. **Drain grace, then drop source** — after a safety grace period (and a final "no stale routing"
   check), `DeleteSource` the tenant's rows from `fromShard`. This is the irreversible commit; it is
   **last** and behind every verification.
10. **Seal** — append a signed move receipt to the audit spine (append-only, `CLAUDE.md §6.4`).

- **Compensation / dead-letter:** any pre-flip failure compensates cleanly (drop destination, unfreeze,
  tenant stays put). A failure *after* the flip but *before* drop-source is safe (data exists in both;
  routing points at the verified destination) and retries the drop. A dead-letter path escalates a stuck
  move to an operator (never a silent half-move). Money/audit rows are copied-then-deleted, never lost.
- **Determinism:** all DB work is in activities; the workflow body is deterministic + version-gated.

### P2.4 — Governed admin surface
- **[CODE]** Extend the residency-migration handler pattern
  ([`handler/http/residency_migration.go`](../backend/orchestrator/internal/handler/http/residency_migration.go))
  with a **shard-move** endpoint: org-admin authz (a tenant can move only its own org, or platform-admin
  for any), `dry_run` default true, idempotency key required, every action audit-logged. Never a raw SQL
  console move in prod (`CLAUDE.md §6.4`).

### P2.5 — Tests (the gate before any real turn-up)
- **Unit:** step executor (copy/verify/delete idempotent under replay); checksum equality/inequality
  detection; the tenant-table list drift test (schema vs move list).
- **Integration (testcontainers, ≥2 real PG shards):** seed a tenant on shard A across every tenant table
  → run the move workflow (Temporal test env) → assert **full parity** on B, **zero rows** on A,
  directory flipped, freeze lifted; a mid-move **injected failure** (fail after copy, before flip) →
  assert clean compensation (tenant intact on A, no orphan on B); **idempotent replay** of a completed
  move is a no-op.
- **Rollback/reverse-move test:** move A→B, then B→A, assert parity — proving the *only* real rollback
  path works.
- **Isolation test:** during a move, a **second** tenant on both shards is never read/written/frozen.

**P2 exit criteria:** the full move + compensation + reverse-move suite is green against real Postgres in
CI; the dry-run endpoint is exercised; no path can drop source before verified parity.

---

## 5. Phase P3 — Observability, SLOs, connections, turn-up runbook

- **[OBS]** Per-shard writer signals (Tier 0 list, *per shard*): CPU, commit latency, WriteIOPS,
  connections vs `max_connections`, `AuroraReplicaLag`. Dashboards grouped by shard.
- **[OBS]** Shard-routing telemetry: routes-by-shard counter, override-hit vs hash-assign ratio,
  **resolver-error/fallback-to-default counter** (a nonzero rate = a routing bug or a config gap — alert
  on it), directory-refresh lag.
- **[OBS]** Move-workflow telemetry: moves in-flight, freeze-window duration histogram, copy throughput,
  verify pass/fail, dead-lettered moves.
- **[OBS]** SLOs per shard with multi-window burn-rate alerts (`CLAUDE.md §6.3`); a per-shard p99 write
  SLO so a hot shard pages before it browns out.
- **[CODE+MANUAL]** **RDS Proxy per shard** (Tier 1 §1 applied per cluster) — connection fan-out is
  `shards × pools × replicas`; without pooling per shard you hit `max_connections` first.
- **[MANUAL] Turn-up runbook** (checked into `infra/docs`, alongside the deployment runbook): provision
  shard cluster → apply schema (P1) → register DSN (dormant, hash still empty of that shard's tenants) →
  smoke test routing to it with a **canary/test tenant** → move a **pilot tenant** (P2) → verify → ramp.
  Includes the **rollback = reverse-move** procedure and the "kill-switch only pre-move" warning.

**P3 exit criteria:** you can *see* per-shard load and routing health, and there is a written, tested
turn-up + rollback procedure. **Load-test the Tier-2 trigger with a representative multi-tenant write
workload before and after** (`CLAUDE.md §3.1`).

---

## 6. Phase P4 — Load-driven rebalancer + cross-shard aggregation

- **[CODE]** **Rebalancer:** place new tenants on the least-loaded shard (using the per-shard load signals
  from P3 + the usage/metering data already collected), and *recommend* moves of hot tenants off hot
  shards (an operator confirms; the move runs via P2). Bounded, auditable, never auto-moves without a
  policy + confirmation gate.
- **[CODE]** **Cross-shard aggregation:** platform-wide billing/analytics roll up **asynchronously** from
  the existing savings/metering ledger into the unsharded control DB (CQRS/derived read model, Tier
  "Orthogonal"); scatter-gather only where genuinely required, never a live cross-shard OLTP `JOIN`.

---

## 7. Honest caveats (fully enumerated — none of these are hand-waved)

1. **Rollback asymmetry (the big one).** On is reversible; **a completed move is not** — rollback is a
   reverse-move (P2). The inert kill-switch (drop shard DSNs) is safe **only before any tenant is moved**.
   Documented in the runbook; the reverse-move path is tested.
2. **Temporal's own datastore** scales separately (history sharding is a Temporal concern, not app code).
   At the scale where PG shards matter, budget for scaling the Temporal cluster too.
3. **Connection fan-out.** `shards × instances × pools × replicas` can exhaust `max_connections` before
   TPS — RDS Proxy per shard is mandatory (P3), not optional.
4. **Consistent-hash reshuffle** is avoided by directory-first placement (P0.1) — but that means the
   directory is now on the hot path and must be correct + refreshable (P0.2) and backed up with the
   control DB.
5. **Cross-tenant features** (marketplace cross-org, A2A/fabric cross-org trust, platform admin, plan
   catalog) genuinely do not shard — they must live in the control DB (P0.3). Missing one is a
   correctness bug, hence the CI guard.
6. **Freeze window** is real user-visible latency during a move (retryable `ERR_TENANT_MIGRATING`); it is
   bounded by copy time. Very large tenants may need a scheduled maintenance window or chunked copy — a
   known limit that points at Tier 3 (Aurora Limitless) for the few-giant-tenants case.
7. **Replication lag during a move:** verify parity against the **writer**, not a replica; guard
   read-your-writes across the cutover.
8. **Migration skew across shards** during a rollout window (P1): a schema change is not atomic across N
   clusters; keep migrations backwards-compatible so a shard briefly one version behind still serves.
9. **Backup/restore + PITR are now per shard** (plus the control DB) — the ops surface multiplies; the
   runbook and DR drills must cover N shards, and a point-in-time restore of one shard must be consistent
   with the directory (a restore that resurrects moved-away rows must be reconciled).
10. **Qdrant / Redis / S3 are not sharded** by this plan — they still route by region only. Postgres is
    the first ceiling; those follow the *same* seam later (out of scope here, called out so no one assumes
    it's done).
11. **Test cost/time:** the P2 integration suite spins ≥2 real Postgres containers + a Temporal test env
    — slower CI. Keep it in an integration lane (`CLAUDE.md §7.1`), gated but not on every unit run.
12. **The directory has no `region` column today** (00122) — P0.4 fixes shard↔region consistency; until
    then, region-then-shard is enforced by convention only.

---

## 8. Testing strategy (maps to `CLAUDE.md §7/§8`)

| Layer | What | Tooling / gate |
| --- | --- | --- |
| **Unit** | resolver (override/hash/empty/region-reject), checksum equality, tenant-table drift, `Primary()` CI guard | `go test ./internal/regionpool/...`, table-driven |
| **Integration** | schema fan-out to N shards; move workflow parity + compensation + reverse-move + idempotent replay; isolation of a bystander tenant; directory refresh under NOTIFY + TTL | testcontainers (≥2 PG) + Temporal test env, gated integration lane |
| **Contract** | migration/breaking-change gate runs on a multi-shard fixture | CI, blocks single-cluster assumption |
| **E2E** | pilot-tenant move on staging (real Aurora) via the governed endpoint, dry-run then commit, verified | staging runbook step |
| **Load** | representative multi-tenant write workload before/after Tier-2 turn-up; per-shard SLO holds | manual gate, `CLAUDE.md §3.1` |

**Determinism:** no real `sleep` for sync in tests (event/poll on the Temporal env); each test owns its
containers/state; error paths (verify-fail, mid-move crash, listener drop) tested as hard as happy paths.

---

## 9. `CLAUDE.md` pre-ship checklist (per phase)

- [ ] Inert-by-default proven (no shard DSNs ⇒ byte-identical; a golden test asserts single-cluster
      behaviour unchanged).
- [ ] Fail-safe routing: resolver error / unknown shard / wrong-region shard ⇒ default pool, never wrong
      shard (tested).
- [ ] All move steps idempotent + resumable; money/audit copied-then-deleted, never lost; dead-letter path.
- [ ] Directory refresh has reconnect+backoff, fail-safe last-good, structured logs; no crash on refresh
      failure.
- [ ] Migrations backwards-compatible + reversible; rollback tested **on each shard**; fan-out enforced in
      CI.
- [ ] Cross-shard/`Primary()` audit complete; CI guard prevents regressions; global data in the control DB.
- [ ] Per-shard metrics + shard-routing + move telemetry exposed; per-shard SLO + burn-rate alerts.
- [ ] RDS Proxy per shard; pgxpool bounded + short-lived.
- [ ] Governed move endpoint: org-admin authz, dry-run default, idempotency key, fully audited; no prod
      console moves.
- [ ] No secrets/DSNs in source; shard DSNs via env/secrets manager; no PII in logs.
- [ ] Turn-up + rollback (reverse-move) runbook checked into `infra/docs`; DR/backup covers N shards.
- [ ] Load-tested before and after turn-up.

---

## 10. Recommended sequence (each ships before the next; irreversible step last)

1. **P0** (correctness foundation — directory-first, refresh, cross-shard audit, region consistency).
   *Dormant, fully reversible.*
2. **P1** (schema fan-out + multi-shard CI). *Dormant, fully reversible.*
3. **P3 observability** (bring up per-shard + routing telemetry **before** moving anything).
4. **P2** (move engine) — build + test exhaustively against real Postgres; **still no prod tenant moved**.
5. **Turn-up** (P3 runbook): provision shard 1, register DSN, canary-route a **test** tenant, then move a
   **pilot** tenant, verify, ramp.
6. **P4** (rebalancer + cross-shard rollups) once multiple shards carry real load.

The earlier residency work already delivered the routing seam, the directory table, the pool wiring, and
the shard primitive — so this plan is **operational hardening + a move engine + observability**, not a
re-architecture. The single most important rule: **no tenant data moves until P0–P2 are merged, tested
green against real Postgres, and the reverse-move path is proven.**

---

Last updated: 2026-07-19 | Owner: Matt | Companion to `Actrone_Postgres_Write_Scaling_Plan.md`
