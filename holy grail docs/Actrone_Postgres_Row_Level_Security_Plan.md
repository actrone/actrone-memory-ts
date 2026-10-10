# Actrone Postgres Row-Level Security (RLS) Plan

> Adds database-enforced, defense-in-depth tenant isolation to the core multi-tenant Postgres tables.
> Today, cross-tenant isolation is application-level only (`WHERE tenant_id` in every query); this plan
> makes the database itself refuse to return another tenant's row even if application code has a bug.
> Absorbs and generalizes the narrow, unbuilt RLS mention in `Actrone_Super_Admin_Dashboard_Implementation_Plan.md`
> (`admin_*` tables only) into one platform-wide mechanism, rather than maintaining two separate RLS
> designs. Related: `Actrone_Postgres_Write_Scaling_Tier2_Buildout.md` (tenant-shard routing this plan
> builds on top of, not around).

---

## 0. TL;DR

1. **Postgres RLS does not exist anywhere in this codebase today, confirmed by an exhaustive search.**
   No `.sql` file anywhere contains `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY`. The only mentions are
   in two Super Admin dashboard docs, as a *planned* third defense-in-depth layer for `admin_*` tables
   specifically, not built even there, and not scoped to the platform's actual tenant data at all.
2. **Today's real isolation mechanism is entirely application-level.** `docs/guides/05-security.md`'s own
   threat table labels "cross-tenant data access" mitigation as `SQL WHERE tenant_id; Barrier 2 DB check`,
   explicitly under the **Application** column, in direct contrast to the mTLS row two lines below it,
   correctly labeled **Infrastructure**. A single repository method that forgets its `WHERE tenant_id`
   clause is a real, silent cross-tenant leak today, with nothing at the database layer to catch it.
3. **There is a clean, single chokepoint to build on.** Every repository call already resolves its pool
   through `PoolRouter.ForTenant(ctx, tenantID) *pgxpool.Pool` (`internal/repository/region_router.go:98`),
   confirmed as the pattern used consistently, `tasks.go` alone has six call sites of the form
   `r.router.ForTenant(ctx, tenantID).Query(...)`. This plan's mechanism sits on top of that function, not
   around it, so tenant-shard routing (`Actrone_Postgres_Write_Scaling_Tier2_Buildout.md`) keeps working
   unmodified.
4. **The one design decision that makes or breaks this plan: the RLS session variable must be set from the
   authenticated request identity, never from a query's own explicit `tenantID` argument.** `middleware.TenantIDFromContext(ctx)`
   (`internal/middleware/auth.go:392`) already exists and is populated once, at the top of the request
   pipeline, from a verified token. If the RLS policy instead trusted the same `tenantID` parameter a buggy
   repository call already used, RLS would just re-validate the bug's own wrong value and provide **zero**
   defense-in-depth. Sourcing it from the authenticated context is what actually catches an IDOR-class bug
   where a repository call is passed the wrong tenant id.
5. **The retrofit is genuinely invasive, not a migration-only change.** Every current repository call is a
   bare `pool.Query`/`Exec`/`QueryRow`, no explicit transaction. Postgres `SET LOCAL` (the only pooling-safe
   way to set a session variable) only takes effect inside an explicit transaction block; outside one it has
   no lasting effect. Every tenant-scoped call site needs to move onto a shared transaction-wrapped helper.
   This is real, scoped work across roughly fifteen to twenty repository files, sized and phased in §9, not
   a one-migration change.
6. **Two easy-to-miss correctness requirements, confirmed against current best practice, not assumed:**
   `ENABLE ROW LEVEL SECURITY` alone does **not** protect against the table owner, table owners bypass RLS
   by default; `FORCE ROW LEVEL SECURITY` is required. And the GUC must be set with `set_config(..., true)`
   or `SET LOCAL`, never a plain `SET`, a plain `SET` on a pooled connection leaks one tenant's context into
   the next request that borrows the same backend. Both are addressed explicitly in §4 and tested in §8.
7. **Actrone has no PgBouncer layer, confirmed by checking infra.** Connection pooling is the Go
   application's own `pgxpool.Pool` only. This removes one entire risk category (PgBouncer *statement*
   pooling mode is flatly incompatible with RLS's session-variable approach); it does not remove the need
   for the transaction-wrapper discipline in §4, which matters regardless of what pools the connection.

---

## 1. Motivation

- **This is the exact question a security-sophisticated buyer asks.** Given the confirmed CISO/Security
  Engineer/CTO buyer (see the sales strategy persona table), "do you have row-level security" or "what
  happens if a query is missing its WHERE clause" is a standard diligence question for a multi-tenant SaaS
  platform, and the honest answer today is "we rely on code-review discipline, not a database-enforced
  guarantee."
- **It closes a real gap class that pure application-layer filtering structurally cannot close.** No amount
  of code review guarantees every future repository method, in every future PR, forever, includes the right
  `WHERE tenant_id`. RLS makes the failure mode "the query returns nothing" instead of "the query returns
  another tenant's row," which is the entire point of defense-in-depth.
- **Self-hosted deployments need this more, not less.** Per the self-hosting positioning, a self-hosted
  customer runs Actrone on their own infrastructure with their own operational discipline; a
  database-enforced backstop that doesn't depend on Actrone's own code review process catching every future
  regression is a stronger guarantee to hand a regulated self-host buyer than "trust our review process."
- **The codebase already has the right instinct for this class of problem, just not for this specific gap.**
  `internal/shardguard` is a real, working precedent: a CI-enforced, text-scanning guard that fails a build
  when a new, un-annotated use of the `.Primary()` tenant-routing escape hatch appears. This plan's CI-guard
  component (§4.5) is the same pattern applied to a new escape hatch: a bare pool call that bypasses the
  RLS-scoped helper.

---

## 2. Current state, verified directly against the code

| Fact | Evidence |
| --- | --- |
| No RLS anywhere in migrations | Repo-wide search for `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` across every `.sql` file: zero matches. |
| RLS mentioned only for Super Admin `admin_*` tables, as a plan, not built | `Actrone_Super_Admin_Dashboard_Implementation_Plan.md:141-144`: "(3) Postgres RLS on the most sensitive `admin_*` tables as defence-in-depth," alongside a Next.js middleware guard and an `admin-api` handler `RequirePermission` check. No migration implements it. |
| Cross-tenant isolation is application-level today | `docs/guides/05-security.md`'s threat table: `Cross-tenant data access | SQL WHERE tenant_id; Barrier 2 DB check | Application`, directly contrasted with the mTLS row labeled `Infrastructure`. |
| The tenant-to-pool chokepoint | `internal/repository/region_router.go:98`, `PoolRouter.ForTenant(ctx context.Context, tenantID uuid.UUID) *pgxpool.Pool`, shard/region-aware, already the universal entry point every repository file uses. |
| The dominant call pattern is a bare, non-transactional query | `internal/repository/tasks.go:50,72,91,131,160,305`: every call is `r.router.ForTenant(ctx, tenantID).QueryRow/Query/Exec(ctx, q, ...)` directly on the pool, no explicit `Begin`/`Commit`. The same pattern repeats across `agents.go`, `connector/store.go`, `channels/store.go`, `distill/repository.go`, `notify/repository.go`, `sandbox.go`, `identity.go`, `shard_assignment.go`, `tenant_freeze.go`, and others, roughly fifteen to twenty files by file count alone. |
| The trusted identity source already exists | `internal/middleware/auth.go:392`, `TenantIDFromContext(ctx context.Context) (uuid.UUID, bool)`, populated once per request from a verified token, before any repository call happens. |
| A precedent for CI-enforced query discipline already exists | `internal/shardguard/guard.go`: scans source text for un-annotated `.Primary()` escape-hatch call sites and fails CI on a new, un-audited one. Pure, deterministic, driven by a repo-walking test. |
| No PgBouncer in infra | Repo-wide search of `infra/` for `pgbouncer`/`pool_mode`: zero matches. Pooling is `pgxpool.Pool` only. |

---

## 3. What "done" looks like, in plain terms

A tenant's authenticated request can never see another tenant's row from a table this plan covers, **even
if every line of application-level `WHERE tenant_id` filtering were deleted from that query.** That's the
actual test this plan has to pass (§8), not "the policy exists," but "the policy is the only thing standing
between a buggy query and a cross-tenant leak, and it holds."

---

## 4. Design

### 4.1 The policy shape

For each covered table:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;  -- required: without FORCE, the table owner bypasses RLS entirely

CREATE POLICY tenant_isolation ON <table>
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

`current_setting(..., true)` (the `missing_ok` form) returns `NULL` rather than raising when the GUC isn't
set, which fails closed, an unset GUC matches no rows, rather than raising an exception that could be
mishandled into an open state somewhere up the call stack.

### 4.2 Where the session variable comes from: the authenticated context, never a query argument

The GUC is set from `middleware.TenantIDFromContext(ctx)`, the same value populated once per request from a
verified token, **not** from whatever `tenantID` a specific repository call happens to receive as a
parameter. This is the entire value proposition of this plan (§0.4): if a future repository method is ever
passed the wrong tenant id, application-level filtering fails silently, but RLS still enforces against the
*authenticated* tenant, and the query returns zero rows instead of another tenant's data.

### 4.3 The transaction-wrapped helper

A new helper, sitting directly on top of `PoolRouter.ForTenant`, becomes the required entry point for every
tenant-scoped query:

```go
// WithTenantScope resolves the tenant's pool (shard/region-aware, via ForTenant), opens an explicit
// transaction, sets the RLS session variable from the AUTHENTICATED context tenant (never a caller-supplied
// argument), runs fn, and commits or rolls back. This is the only sanctioned way to issue a query against
// an RLS-covered table; ForTenant + a bare pool.Query is the escape hatch shardguard-style CI enforcement
// (§4.5) exists to catch.
func WithTenantScope(ctx context.Context, router *PoolRouter, fn func(tx pgx.Tx) error) error {
    tenantID, ok := middleware.TenantIDFromContext(ctx)
    if !ok {
        return fmt.Errorf("repository: no authenticated tenant in context")
    }
    pool := router.ForTenant(ctx, tenantID)
    tx, err := pool.Begin(ctx)
    if err != nil {
        return fmt.Errorf("repository: begin tenant-scoped tx: %w", err)
    }
    defer tx.Rollback(ctx) // no-op after a successful Commit
    if _, err := tx.Exec(ctx, `SELECT set_config('app.tenant_id', $1, true)`, tenantID.String()); err != nil {
        return fmt.Errorf("repository: set RLS session context: %w", err)
    }
    if err := fn(tx); err != nil {
        return err
    }
    return tx.Commit(ctx)
}
```

`set_config(..., true)` with `is_local = true` is the programmatic equivalent of `SET LOCAL`, scoped to the
current transaction only, so it cannot survive into the next request that borrows the same pooled backend
(§0.7's pooling-safety requirement, tested explicitly in §8).

### 4.4 Non-tenant tables are explicitly excluded

Reference/catalog tables with no `tenant_id` column (e.g. the MCP catalog, framework/model catalogs) are
out of scope by construction, RLS only applies where a `tenant_id` column exists to policy against. No
change to those tables.

### 4.5 CI enforcement: extend the `shardguard` precedent, don't invent a new mechanism

A new guard, same shape as `shardguard`: scan for direct `pool.Query`/`Exec`/`QueryRow` calls (via
`ForTenant(...)` chained directly, bypassing `WithTenantScope`) against any table on the covered-tables
list, fail CI on a new, un-annotated one. Reuses `shardguard`'s existing `// shard-ok:`-style annotation
convention (a parallel `// rls-exempt:` annotation for the rare, deliberate exception, e.g. a
platform-internal job that legitimately needs cross-tenant read access, logged and reviewed the same way a
`Primary()` exemption is today).

### 4.6 Role separation, evaluated alongside `FORCE`

`FORCE ROW LEVEL SECURITY` (§4.1) is the mandatory floor regardless of role setup. Whether the application's
runtime Postgres role is also *not* the table-owning role (a second, independent layer, since a non-owning
role is subject to RLS even without `FORCE`) is a real hardening option, but depends on infra facts not
confirmed during this plan's research (§11, open decision). Recommended default: ship with `FORCE` as the
guaranteed floor; evaluate role separation as a follow-on, not a blocker.

---

## 5. Data model & migrations

- **No new tables.** This plan adds `ENABLE`/`FORCE ROW LEVEL SECURITY` and a `CREATE POLICY` statement per
  covered table, plus the `app.tenant_id` GUC convention. No schema shape changes.
- **Migrations are additive and reversible per table**, one migration per table or a small batch, following
  the existing `goose`-style up/reversible discipline already used elsewhere in this codebase. A table's RLS
  migration does not block another table's; this is what makes the phased rollout in §9 possible without an
  all-or-nothing cutover.
- **Self-hosted parity.** The same migrations ship in the self-host distribution path, not a managed-cloud-only
  feature; per the motivation in §1, self-hosted buyers get equal or greater benefit from this.

---

## 6. Backend architecture

- **New file**: `internal/repository/tenantscope.go` (naming to confirm), hosting `WithTenantScope` (§4.3)
  and any small query-building helpers repository files need to migrate onto it cleanly.
- **New file**: `internal/rlsguard/guard.go` (naming to confirm, mirroring `internal/shardguard/guard.go`'s
  structure exactly), the CI enforcement guard from §4.5, plus its own repo-walking enforcement test.
- **Repository files migrate incrementally**, one file (or one table) at a time, per §9's phasing, from
  `r.router.ForTenant(ctx, tenantID).Query(...)` to `repository.WithTenantScope(ctx, r.router, func(tx pgx.Tx) error { ... })`.
  No change to `PoolRouter`/`ForTenant`/shard-routing logic itself, this plan composes with it, not around it.
- **No change to `regionpool`, `shardguard`, or `shardbalance`.** Tenant-to-shard routing and this plan's
  tenant-to-row isolation are independent concerns; RLS runs identically regardless of which shard a
  tenant's data lives on, since the policy is evaluated per-connection against whichever pool `ForTenant`
  already resolved.

---

## 7. Backward compatibility & rollout strategy

- **Defense-in-depth, not a replacement.** Existing `WHERE tenant_id` filtering in application code is
  **not removed** as tables gain RLS coverage. RLS is the backstop for the case that filtering has a bug;
  removing the application-level filter would just move the single point of failure from "a missing WHERE
  clause" to "a missing or misconfigured policy," the opposite of the point.
- **Per-table, not big-bang.** A table gains RLS only once every repository call site touching it has moved
  onto `WithTenantScope` (§4.5's CI guard enforces this at the file level going forward); until then, the
  table stays exactly as it is today, no regression risk from a half-migrated table.
- **Reconciles, doesn't duplicate, the Super Admin plan.** `Actrone_Super_Admin_Dashboard_Implementation_Plan.md`'s
  `admin_*` table RLS becomes an instance of this same mechanism, not a second, independently-designed one;
  both docs get updated (§12) to point here rather than carrying divergent designs.

---

## 8. Testing strategy

| Layer | Coverage |
| --- | --- |
| **The test that actually matters: RLS alone, filtering removed.** | For every covered table, an integration test issues the table's real query with its `WHERE tenant_id` clause deliberately stripped, against a real Postgres instance, with the GUC set to tenant A, and asserts zero rows from tenant B are returned. This is what proves the policy is load-bearing, not decorative; a test that only exercises the already-correct application-filtered path proves nothing new. |
| **`FORCE` enforcement** | A test connecting as the application's actual runtime role attempts to read across tenants; asserts it is blocked exactly like any other role, confirming owner-bypass is not silently in effect. |
| **GUC leakage under pooling** | A concurrency test drives many simulated concurrent tenants through the same `pgxpool.Pool`, asserting no request ever observes a different tenant's `app.tenant_id` GUC value, the exact production race condition named in current best-practice guidance for RLS with connection pooling. |
| **`set_config` scoping** | Unit test confirms `WithTenantScope`'s `set_config(..., true)` call is transaction-scoped: the GUC is unset (or reset) on the next transaction acquired from the same pooled connection after a `Commit`/`Rollback`. |
| **Unauthenticated-context fail-closed path** | `WithTenantScope` called with no `TenantIDFromContext` value returns an error and issues no query, table-tested. |
| **CI guard (`internal/rlsguard`)** | Mirrors `shardguard_test.go`'s structure: a new, un-annotated bare pool call against a covered table fails the repo-walking enforcement test; an `// rls-exempt:`-annotated one passes. |
| **Shard/region interaction** | A tenant whose data lives on a non-primary shard (per `Actrone_Postgres_Write_Scaling_Tier2_Buildout.md`) still gets correct RLS enforcement on that shard's pool, confirming this plan composes with `ForTenant`'s existing routing rather than assuming a single pool. |
| **CI gates** | lint 0-warnings, race detector, coverage threshold, vuln scan, image build, per CLAUDE.md §7/§8, same bar as every other backend change. |

---

## 9. Phased delivery

- **Phase 0: Confirm infra facts this design assumes.** Verify the application's runtime Postgres role
  versus the migration/DDL role (§4.6, §11); confirm no other pooling layer (e.g. a future PgBouncer
  addition) is planned that would reintroduce the statement-pooling incompatibility named in §0.7. *Exit:*
  role setup documented, `FORCE ROW LEVEL SECURITY` confirmed sufficient as the floor regardless of outcome.
- **Phase 1: Build `WithTenantScope` + `internal/rlsguard`, land on zero covered tables.** No behavioural
  change yet, this phase is infrastructure only: the helper, the CI guard, and their own tests (§8's
  GUC-leakage and fail-closed cases don't need a real covered table to verify). *Exit:* the helper and guard
  exist, tested, and merged, with nothing yet depending on them.
- **Phase 2: Pilot on the two highest-consequence tables.** Vaulted-credential storage
  (`mcphub`/`vault.go`'s backing table) and the tamper-evident audit log, the two tables where a cross-tenant
  leak would be worst, get migrated first: their repository call sites move to `WithTenantScope`, then gain
  `ENABLE`/`FORCE ROW LEVEL SECURITY` + policy. *Exit:* both tables pass the "filtering removed" test (§8)
  in CI; `rlsguard` is active for these two tables going forward.
- **Phase 3: Roll out table-by-table across the remaining tenant-scoped schema.** Ordered by consequence-if-leaked,
  not by convenience, memory/context data next, then agent definitions and task history, then lower-severity
  operational tables last. Each table is its own PR, its own migration, its own passing "filtering removed"
  test, no batch cutover.
- **Phase 4: Fold the Super Admin `admin_*` table RLS into this same mechanism.** Update
  `Actrone_Super_Admin_Dashboard_Implementation_Plan.md` and `super-admin-dashboard-sysdesign.md` to
  reference this plan rather than carrying an independent design (§7, §12).
- **Phase 5: Self-host migration parity.** Confirm the self-host distribution path ships the same migrations
  in the same order; no separate managed-cloud-only branch of this feature.

---

## 10. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| **A tenant's GUC leaks into another tenant's request on a pooled connection** | `set_config(..., true)` (transaction-scoped, never a plain `SET`) is the only sanctioned path, enforced by `WithTenantScope` being the sole entry point (§4.5's CI guard); explicit concurrency test (§8) exercises this directly rather than trusting the design on paper. |
| **`ENABLE ROW LEVEL SECURITY` ships without `FORCE`, and the app's own DB role silently bypasses it** | `FORCE` is written into every table's migration in §4.1 as a non-optional pair, not a follow-up; a dedicated test (§8) connects as the actual runtime role and asserts enforcement, not just that the policy exists. |
| **The retrofit's invasiveness (fifteen-plus files moving off bare pool calls) stalls partway, leaving some tables migrated and others not, with no clear signal of which is which** | `internal/rlsguard` makes the state machine explicit and CI-visible per table (§4.5, §9); a table is either fully on `WithTenantScope` and covered, or it isn't, there's no silent partial state a developer could mistake for done. |
| **Extra `BEGIN`/`COMMIT` round trips on a high-frequency query path add latency the team didn't budget for** | Phase 2/3 ordering (§9) deliberately starts with the highest-consequence, not necessarily highest-QPS, tables, so real latency impact is measured before it's ever on a platform's hottest path; a table already inside `pgx`'s connection-pool round trip pays one extra statement, not a new network hop. |
| **A future PgBouncer addition (statement pooling mode) is introduced without anyone re-checking this plan's assumptions** | §0.7 and Phase 0 (§9) record the current no-PgBouncer fact explicitly as a load-bearing assumption; any future infra change adding a pooler must re-verify transaction (not statement) pooling mode before this plan's guarantees still hold. |
| **The Super Admin plan's independent RLS design and this plan's design drift apart if not reconciled** | Phase 4 (§9) explicitly folds one into the other rather than leaving two documents both claiming to own RLS. |

---

## 11. Open decisions

1. **Does the application's runtime Postgres role already differ from the table-owning/migration role, or
   do they coincide today?** Not confirmed during this plan's research; determines whether role separation
   is worth pursuing as an additional layer beyond `FORCE ROW LEVEL SECURITY` (§4.6). Resolved in Phase 0.
2. **Exact table-by-table priority order for Phase 3**, beyond the two Phase-2 pilots already named
   (vaulted credentials, audit log). This plan proposes consequence-if-leaked as the ordering principle
   (§9) but the specific table list needs sign-off, not assumed here.
3. **What latency budget is acceptable for the extra transaction round trip** on tables that turn out to be
   higher-QPS than expected once real measurement happens in Phase 2. Not set in advance; measured, then
   decided.

---

## 12. Definition of done

- Zero tables remain on the old bare-`pool.Query` pattern for any table on the covered list; `internal/rlsguard`
  passes with no un-annotated call sites.
- Every covered table passes the "filtering removed" test (§8): stripping a query's own `WHERE tenant_id`
  clause and re-running it against a real Postgres instance still returns zero cross-tenant rows.
- `FORCE ROW LEVEL SECURITY` is confirmed active for every covered table, verified by a test connecting as
  the actual application runtime role, not assumed from the migration text alone.
- The GUC-leakage concurrency test (§8) passes under real concurrent multi-tenant load in CI.
- `Actrone_Super_Admin_Dashboard_Implementation_Plan.md` and `super-admin-dashboard-sysdesign.md` updated to
  reference this plan rather than an independent RLS design (Phase 4).
- Self-host migration parity confirmed (Phase 5): the same RLS migrations ship in the self-host distribution
  path.
- CI gates green (lint, race, coverage, vuln scan, image build).
- `progress.md` updated; the three open decisions (§11) resolved or explicitly left open, not silently
  dropped.

---

*Last updated: 2026-08-13 | Owner: Matt | Scope: `internal/repository` (new `tenantscope.go`, migrated
call sites across `tasks.go`, `agents.go`, `connector/store.go`, `channels/store.go`, `distill/repository.go`,
`notify/repository.go`, `sandbox.go`, `identity.go`, `shard_assignment.go`, `tenant_freeze.go`, and others
on the covered-table list), new `internal/rlsguard` (mirrors `internal/shardguard`), Postgres migrations
per covered table. Depends on / composes with: `internal/repository/region_router.go` (`PoolRouter.ForTenant`,
unmodified), `Actrone_Postgres_Write_Scaling_Tier2_Buildout.md` (tenant-shard routing this plan runs on top
of). Absorbs: the RLS mention in `Actrone_Super_Admin_Dashboard_Implementation_Plan.md` §(enforcement) and
`super-admin-dashboard-sysdesign.md`.*

## Sources

- [PostgreSQL Row-Level Security: A Complete Guide](https://dev.to/geekyfox90/postgresql-row-level-security-a-complete-guide-2l4)
- [Postgres Row-Level Security for Multi-Tenancy: The Pattern and the Footguns](https://patotski.com/blog/postgres-row-level-security-multi-tenant/)
- [PgBouncer Transaction Pooling for Multi-Tenant SaaS](https://multi-tenant-saas.com/tenant-aware-data-routing-query-scoping/connection-pooling-in-multi-tenant-systems/pgbouncer-transaction-pooling-for-multi-tenant-saas/)
- [Mastering PostgreSQL Row-Level Security (RLS) for Rock-Solid Multi-Tenancy](https://ricofritzsche.me/mastering-postgresql-row-level-security-rls-for-rock-solid-multi-tenancy/)
