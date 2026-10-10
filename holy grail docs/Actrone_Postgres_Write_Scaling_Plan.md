# Actrone Postgres Write-Scaling Plan

> **Purpose.** A staged plan to keep the write path scaling as Actrone grows — the datastore is where
> hyperscale is won or lost. The compute tier (stateless Go behind Envoy, Temporal, isolated harness
> pods) already scales horizontally; the ceiling is **per-plane Aurora PostgreSQL writer throughput**,
> because every write funnels to a single primary per cluster.
>
> **You already hold the hardest asset.** Scaling writes is normally blocked by a data model that
> isn't tenant-partitioned. Actrone's is: tenants are routed by [`internal/regionpool`](../backend/orchestrator/internal/regionpool),
> each service owns its store (no cross-service joins, `CLAUDE.md §2`), and the read path already uses
> a **pgxpool writer/reader split** ([`internal/repository/db.go`](../backend/orchestrator/internal/repository/db.go)
> `WithReader`). That tenant-keyed routing is exactly what makes horizontal write-sharding an
> *extension*, not a rewrite.
>
> **How to use this.** Climb the tiers only as load demands — each has an entry **trigger** (a metric
> threshold), not a calendar date. Steps are tagged **[CODE]** (in-repo artefact) / **[MANUAL]** (apply,
> console, load-test) / **[OBS]** (observability to add first, so you climb on data, not vibes).
>
> **Current state (2026-07-08):** Aurora PostgreSQL 16 cluster per plane
> ([`infra/terraform/modules/rds`](../infra/terraform/modules/rds)); pgxpool writer + optional reader
> pool; tenant/region routing via `regionpool`; declarative range-partitioning already used for the
> access-audit log ([`00010`](../backend/orchestrator/migrations/00010_access_audit_log.sql)); outbox
> pattern already used for billing ([`00063`](../backend/orchestrator/migrations/00063_billing_reconciliation.sql)).
> **Owner:** Matt.
>
> **Status refreshed 2026-07-13 (code-verified):** Tier 2's decisive lever is **further along than
> the body reads** — the `regionpool` shard dimension is BUILT, not just planned. `internal/regionpool`
> now ships `shard.go` (`NewShardRegistry`) + a `NewConsistentHashResolver(shardIDs, overrides)`, the
> explicit tenant→shard override table exists as migration **`00122_tenant_shard_assignments.sql`**,
> and `cmd/orchestrator/main.go` wires it end-to-end (`db.SetShardRegistry(...)`, logging
> `scaling.shard_routing.active`) with a **safe no-op default** (no shard pools configured ⇒ pure
> region routing). The reader/writer split (`WithReader`) is confirmed present. So Tier 2's "extend
> `regionpool` to tenant-shard" is code-complete and dormant-by-config; only multi-cluster
> provisioning + load-test-driven turn-up remain. **Migration-chain integrity is clean** — the full
> `00001…00127` range has **no duplicate-number collisions** (latest = `00127_channel_default_agent.
> sql`), and the previously-flagged `00030`/`00041` `escalation_queue` collision is **fixed**: `00030`
> no longer defines the table (comment marks `00041` the sole definer, which `DROP…IF EXISTS`-guards a
> fresh apply). The "backwards-compatible + reversible migrations" guardrail holds.

---

## Tier 0 — Instrument first (do before anything)

You cannot scale what you cannot see. Add these so each tier's trigger is measurable.

- **[OBS] Aurora writer signals** — writer CPU, `WriteThroughput`/`CommitLatency`, `WriteIOPS`, ACU (if
  Serverless v2), freeable memory, `DBLoad` (Performance Insights, top SQL by wait).
- **[OBS] Contention + WAL** — `xact_commit`/s, lock waits (`pg_stat_activity` wait events),
  `deadlocks`, checkpoint/WAL write rate, autovacuum lag + dead-tuple ratio on hot tables.
- **[OBS] Connections** — pool saturation per orchestrator instance × instance count vs Aurora
  `max_connections` (pool explosion is usually the *first* wall you hit, not raw TPS).
- **[OBS] Replica lag** — `AuroraReplicaLag` (so read-offload doesn't serve stale beyond tolerance).
- **[OBS] SLO** — p99 write latency per domain; alert on burn (ties into the multi-window burn-rate
  rules, `CLAUDE.md §6.3`).

---

## Tier 1 — Raise the single-writer ceiling (cheap; do first, in order)

> **Trigger:** writer CPU sustained > ~60–70%, or connection saturation, or p99 write latency drifting.
> Most of Tier 1 is standard hygiene worth doing proactively.

1. **[CODE+MANUAL] Put a managed transaction pooler in front of Aurora — RDS Proxy.** pgxpool pools
   *per orchestrator instance*; as pods multiply (HPA/Karpenter) their pools sum toward Aurora's
   `max_connections` → **pool explosion**, the first real wall. **RDS Proxy** (transaction pooling,
   IAM-auth, managed failover) multiplexes many app pools onto few DB connections and smooths failover.
   Point the writer DSN at the proxy; keep pgxpool bounded and short-lived (`MaxConnLifetime`).
   *(PgBouncer/pgcat is the self-managed alternative; RDS Proxy is the AWS-native fit for Aurora.)*
2. **[MANUAL] Vertical headroom on the writer.** Bigger instance class / higher Serverless-v2 ACU max,
   provisioned IOPS where needed. Cheapest runway; buys time to do the structural work below.
3. **[CODE] Partition the write-heavy tables.** Extend the existing `PARTITION BY RANGE` pattern
   ([`00010`](../backend/orchestrator/migrations/00010_access_audit_log.sql)) to the other large,
   ever-growing tables (task/run history, events, metering) — by time (and/or tenant) — to cut index
   bloat, lock contention, and vacuum pressure, and to make old-partition archival cheap. Migrations
   stay backwards-compatible + reversible (`CLAUDE.md §6.4`).
4. **[CODE] Get high-volume append data off the OLTP writer.** Metering/usage events, audit, and
   telemetry are append-only and voluminous; keep them on their own partitioned tables / a separate
   cluster / S3+Athena for analytics — so they never compete with transactional writes. (Append-only +
   never-mutate already required for financial/audit data, `CLAUDE.md §6.4`.)
5. **[CODE] Smooth spikes with the outbox + Temporal you already run.** Return the request fast; drain
   durable writes through the outbox ([`00063`](../backend/orchestrator/migrations/00063_billing_reconciliation.sql)
   pattern) / a Temporal workflow, so request latency is decoupled from writer throughput and bursts
   are rate-shaped, not dropped. Keeps must-not-lose effects durable with a dead-letter path.
6. **[CODE] Trim write amplification.** Batch/`COPY` bulk inserts over row-by-row; exploit HOT updates
   (avoid updating indexed columns, tune `fillfactor`) on hot tables; ensure no N+1 write loops.

---

## Tier 2 — Split writes across more primaries (when one writer isn't enough)

> **Trigger:** Tier 1 exhausted — writer still saturating at an acceptable instance size, or a single
> tenant/region's write volume dominates a shared cluster.

1. **[CODE] Lean into functional sharding (already partly done).** Each service owns its store, so
   different domains already write to different logical stores. Split the busiest domains onto their
   **own Aurora clusters** so their writes scale independently — a low-risk, architecture-aligned step
   before tenant sharding.
2. **[CODE] Tenant-shard *within* a region — the decisive lever, reusing `regionpool`.** `regionpool`
   already resolves **tenant → plane**; add a **shard dimension** (tenant/org → shard cluster) to that
   resolution: a shard map (consistent-hash or explicit assignment, persisted), multiple Aurora
   clusters per plane, and the router picks the tenant's shard. Because routing is already tenant-keyed
   with no cross-tenant joins, this yields **near-linear write scaling by adding shards** while
   preserving tenant isolation. Reuse the existing region-cutover machinery (the `Migrator` /
   step-executor that already moves a tenant between planes) for **shard rebalancing/tenant moves**.
   - Design notes: pick a stable shard key (org/tenant id); store assignments authoritatively (a
     control-plane table) so routing is deterministic; make moves idempotent + resumable (you already
     have the cutover primitive); keep DDL/migrations fan-out-aware (apply to all shards).
   - **▶ Production build-and-wire plan:** the routing layer is built + dormant, but the operational
     layer to safely turn it on — the tenant-**move/rebalance** engine (region-cutover is region-keyed
     only today), migration fan-out, dynamic directory refresh, the cross-shard `Primary()` audit,
     per-shard observability, and the turn-up/rollback runbook — is specified prod-grade, CLAUDE.md-
     aligned, and test-mapped in the companion
     [`Actrone_Postgres_Write_Scaling_Tier2_Buildout.md`](./Actrone_Postgres_Write_Scaling_Tier2_Buildout.md).
     **Key honest caveat surfaced there:** turning sharding *on* is reversible, but a completed tenant
     move is **not** — rollback is a reverse-move, so the kill-switch is clean only before any move.

---

## Tier 3 — Distributed Postgres (only if Tier 2 is outrun)

> **Trigger:** even tenant-sharded clusters can't keep up (a few very large tenants, or shard count
> becomes unwieldy) — you want horizontal writes *within* a logical database.

- **[CODE+MANUAL] Aurora Limitless Database (AWS-native, you're already on Aurora).** Sharded Aurora
  PostgreSQL that distributes writes across a shard group by a distribution key (tenant id) while
  presenting a single endpoint — the lowest-friction distributed-write path given the current stack.
  Validate compatibility (extensions, cross-shard txn semantics/latency) on a representative workload
  first.
- **[CODE+MANUAL] Citus** — distributed Postgres sharded by `tenant_id`; keeps Postgres semantics,
  scales writes across worker nodes. The portable alternative to Limitless if you want to stay
  cloud-agnostic.
- **[LAST RESORT] Distributed-SQL** (CockroachDB / YugabyteDB / Spanner PG dialect) — horizontal writes
  with Postgres-ish compatibility, but a real migration + operational + semantic change (cross-shard
  latency). Only if tenant-sharding + Limitless/Citus genuinely can't meet the need.

---

## Orthogonal — reduce write pressure regardless of tier

- **[CODE] CQRS / derived read models.** Keep the OLTP writer lean: build read-optimized projections
  (materialized views, search/cache) **asynchronously** from the event stream, so reads never add write
  pressure and each side scales independently.
- **[CODE] Exploit the reader pool + Aurora replicas.** The `WithReader` split already exists; route
  every read that tolerates replica lag to the reader pool (Aurora scales to **15 replicas**), so the
  writer does writes only. Guard staleness-sensitive reads (read-your-writes) explicitly.
- **[CODE] Cache-aside with TTL + single-flight** (`CLAUDE.md §3.3`) on hot read paths to keep load off
  both writer and replicas; guard against thundering-herd on miss.

---

## Recommended sequence

1. **Now (proactive):** Tier 0 instrumentation + Tier 1 items 1–5 (RDS Proxy, vertical headroom,
   partition the big tables, offload append/event data, outbox smoothing) + the orthogonal read-offload
   and CQRS wins. These are hygiene and buy large runway cheaply.
2. **On Tier-2 trigger:** functional-split the busiest domains, then **extend `regionpool` to
   tenant-shard within a region** — the primary horizontal-write answer, reusing the router + cutover
   machinery.
3. **On Tier-3 trigger:** evaluate **Aurora Limitless** first (native to the stack), Citus as the
   portable alternative; distributed-SQL only as a last resort.

Because writes are already tenant-routed with no cross-tenant joins, Tier 2 is an *extension* of
existing machinery, not a re-architecture — the reason this is a tractable staircase rather than a
rewrite.

---

## Guardrails

- **Load-test each tier's trigger** with a representative multi-tenant write workload before *and*
  after the change; never climb on guesswork (`CLAUDE.md §3.1` — profile before optimising).
- **Migrations** for partitioning/sharding stay backwards-compatible + reversible, applied via the
  migration tool, with rollback covered in integration tests (`CLAUDE.md §6.4`).
- **Fan-out awareness:** once sharded, every schema change and contract check must apply across all
  shards; the contract/migration CI gate must not assume a single cluster.
- **Keep tenant isolation invariant** through every tier — sharding must never enable a cross-tenant
  read/write path.
