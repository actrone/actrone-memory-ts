# Actrone — Super Admin Dashboard: Implementation Plan

**Status:** PLAN (nothing in this plan is built yet). This is the prod-grade build plan for the design
in [`super-admin-dashboard-sysdesign.md`](./super-admin-dashboard-sysdesign.md) (the "SAD" — the internal,
system-wide operations & security control plane for Actrone staff, distinct from the customer-facing
Control Tower and its org-scoped EMAOP `super_admin` role).

**Owner:** Matt · **Scope:** platform operators only · **Governs:** a new isolated app + service + schema
· **Standards:** inherits the workspace `CLAUDE.md` (Go + TypeScript stacks, append-only audit, idempotency,
fail-fast config, contract-first, CI gates, Black & Apple-Silver brand).

> **Read this first.** The sysdesign doc is a *maximalist* security spec. This plan is deliberately
> **pragmatic and reuse-first**: the Actrone codebase already ships several load-bearing primitives the
> design assumed had to be built from scratch (a tamper-evident audit spine, an emergency-stop/control
> signalling pattern, WorkOS auth + JWKS verification, Stripe billing + metering, a compliance/evidence
> engine, a Prometheus/OTel observability stack, and a cross-tenant region router). We build the SAD *on
> top of those*, and we make a small number of explicit, reasoned deviations from the design where a
> dependency does not earn its place (§2). Every deviation is called out so the design-vs-build line
> stays honest.

---

## 1. What already exists (reuse map — code-verified)

The single most important finding of the codebase analysis: **the hardest, most security-critical
primitive the design specifies — a tamper-evident, verifiable, append-only audit log — already exists and
is production-grade.** We reuse its pattern rather than inventing a Merkle library.

| SAD design requirement | Existing primitive (reuse) | Location | Reuse verdict |
|---|---|---|---|
| §8 Immutable, tamper-evident, verifiable audit log | **Audit Spine** — HMAC-SHA256 hash chain (`event_n` includes `event_{n-1}.id`), append-only Pg store, `VerifyChain`, per-tenant `HMACKeyProvider`, SIEM forwarder | `internal/audit/{spine,pgstore,siem}.go` | **Reuse pattern verbatim** for a new platform `admin_audit_log` chain |
| §8.4 External SIEM stream | `SIEMForwarder` + `SIEMConnector` iface (plan-gated) | `internal/audit/siem.go` | Reuse; add an admin-project connector |
| §9 Kill switches (halt agents/tasks/tools) | **Control/emergency-stop** — `ControlAction`, `SetPaused`, `PauseAll` (tenant-wide), Temporal workflow signal fan-out | `internal/domain/control.go`, `internal/handler/http/control.go` | **Extend the pattern to platform scope** (currently tenant-scoped only) |
| §4 Auth (WorkOS AuthKit, JWT, JWKS) | WorkOS JWT verification, org/role claims, `RequireRole`/`RequireScopeRole`, webhooks | `internal/middleware/auth.go`, `internal/handler/http/workos_webhooks.go` | Reuse verifier; point at an **isolated admin WorkOS project** |
| §9 Billing module (MRR, refunds, subscriptions) | Stripe checkout/portal, Billing Meters, entitlements, `usage_events` | `internal/billing/*` | Reuse client + meters; add **cross-tenant aggregation** |
| §9 Feature flags | PostHog `FlagEvaluator` (tenant-scoped) + env-var flags | `internal/analytics/flags.go`, `internal/config/config.go` | Reuse read path; add a **platform write/override** surface |
| §9 Compliance reports / governance violations | Compliance catalog, sealed evidence, ISMS, trust posture | `internal/compliance/*` | Reuse evidence engine; add cross-tenant view |
| §9 System health / alerts | `/health/live`, `/health/ready`, `/metrics` (Prometheus); Grafana/OTel/Alertmanager stack | `cmd/orchestrator/main.go`, `infra/observability/*` | Reuse; SAD reads/embeds |
| Cross-tenant reads (orgs/users/agents across the platform) | Region router `Primary()` / `ForTenant()` holds every tenant | `internal/repository/region_router.go` | Reuse for **admin aggregation repos** |
| Data residency (regional planes) | `regionpool` router + Tier A/B/C routing | `internal/repository/region_router.go` | Admin reads must fan out across regions |
| Infra (IaC, GitOps, cluster bootstrap) | Terraform (`bootstrap/cicd/envs/modules`), Helm, ArgoCD, KOTS | `infra/*` | Reuse to provision **dedicated admin infra** |
| DB migrations | goose, ~133 migrations, PG16 | `backend/orchestrator/migrations/` | Reuse; new `admin_*` migrations continue the chain |
| Secrets seam (Vault-backed) | Vault references across packages; `HMACKeyProvider` master-secret derivation | multiple | Reuse; admin secrets in an isolated Vault path |

**Explicitly NOT the SAD (do not confuse):** the customer-facing **Control Tower** (`frontend/apps/control-tower`),
its org-scoped EMAOP roles (`agent_operator … super_admin`), `RequireOrgAdmin`, and `WorkosAdminPortal`
(the customer's *own* org self-service). The SAD is a **new, fourth app** for Actrone staff operating
*across all tenants*.

---

## 2. Guiding decisions (deviations from the maximalist design, with rationale)

These are conscious `CLAUDE.md`-driven choices. Each keeps the design's security *intent* while avoiding
cost/complexity that doesn't pay for itself. All are pluggable so a later enterprise/contractual
requirement can restore the maximalist option.

| # | Design says | We build | Rationale (CLAUDE.md) |
|---|---|---|---|
| **D1** | Bespoke SHA-256 **Merkle chain** for `admin_audit_log` | **Reuse the Audit Spine HMAC hash-chain** pattern (same tamper-evidence: any edit/delete breaks the chain, independently verifiable) + periodic **Merkle-root checkpoints** for external anchoring | "Dependencies must earn their place"; the spine is proven, stdlib-crypto, already regulator-grade. Don't fork a second crypto path. |
| **D2** | External anchoring to **Hedera Hashgraph** | Anchor Merkle roots to **AWS S3 Object Lock (WORM, compliance mode)** + stream identity events to **WorkOS Audit Logs**; keep a pluggable `RootAnchor` interface | Hedera is an external crypto-ledger dependency with cost/ops overhead for a guarantee S3 Object Lock (a regulator-recognised WORM store in a locked-down account) + an independent WorkOS-sourced log already deliver. Interface preserves the option. |
| **D3** | Fully **separate WorkOS project** (`actrone-superadmin`) | **Separate WorkOS project** (honour the design — it is cheap and the blast-radius isolation is real) + a JWKS-agnostic verifier so staging can use an isolated *organization* if a second project is unavailable | Blast-radius isolation is a genuine security win at near-zero code cost. |
| **D4** | Dedicated **`admin-api`** Go microservice, separate repo | New **`cmd/admin-api` binary inside the orchestrator Go module** with its own `internal/admin/*` packages, config, private bind, and **dedicated deployment/cluster/network** | Go `internal/` visibility means a separate module *cannot* import the spine/billing/compliance/repos — reuse would be lost. Same module + separate binary/deploy/network gives the isolation that matters (process, blast radius, secrets, ingress) with full library reuse. Trade-off (shared dependency tree) documented & mitigated. |
| **D5** | Role definitions **as code**, deny-by-default, immutable via UI | Same: a Go **permission registry** (`resource:action`, 7 roles) mirrored to the FE (`lib/rbac.ts`), role→permission map immutable-via-deploy; only **assignments** live in the DB | Matches the design's "roles as code" principle and the existing EMAOP `lib/roles.ts` pattern. |
| **D6** | Zero-trust **7-layer** network stack up front | Deliver **L5–L7 (WorkOS + app RBAC + audit gate) + an app-level IP allowlist** first (fully secure at the app layer), then **L1–L4 (private DNS, WireGuard, WAF, IP SG)** as an infra hardening phase (P8) | Ship a secure, useful dashboard early without blocking on VPN/DNS infra; network layers are additive defence-in-depth, not a functional prerequisite. |
| **D7** | Break-glass via **Telegram bot** + physical envelope | Physical sealed-credential envelope (unchanged) + out-of-band alert via the **existing channels/notification system** (Slack/Telegram already integrated) | Reuse the shipped channels stack instead of a bespoke bot. |

---

## 3. Gap inventory (what must be built)

Grounded against the codebase; nothing below currently exists.

1. **Platform-operator identity & RBAC** — no "Actrone staff" concept exists. Need: isolated WorkOS admin
   project, the 7-role model (Owner, Super Admin, Infra Admin, Security Admin, Billing Admin, Support
   Engineer, Read Only), a `resource:action` permission registry (deny-by-default), and DB-stored
   assignments. *(The in-product `super_admin` EMAOP role is unrelated and org-scoped.)*
2. **`super-admin` frontend app** — `frontend/apps/` has exactly three apps; no isolated admin app.
3. **`admin-api` service** — no platform admin backend; all current endpoints are tenant-scoped.
4. **Platform `admin_audit_log`** — the spine is *per-tenant*; admin *actions* need their own platform
   chain (reusing the spine pattern) + the audit gate (write-before-respond, block-on-write-failure).
5. **Cross-tenant aggregation** — no "list all orgs", platform MRR, cross-tenant search, or platform
   metrics rollups.
6. **Platform-wide kill switches + dual approval** — current pause is tenant-scoped and single-actor.
7. **Support impersonation, DSAR retrieval, right-to-erasure (data purge)** — none exist.
8. **Access reviews, break-glass, offboarding automation, forced-logout triggers** — none exist.
9. **Zero-trust network** (private DNS, WireGuard, IP allowlist, WAF) + dedicated admin infra — none.
10. **External root anchoring** (S3 Object Lock WORM + WorkOS Audit Logs stream) — none.

---

## 4. Target architecture

```
                         ┌──────────────────────────────────────────────┐
  Actrone staff  ──VPN── │  admin.actrone.com  (private ingress)         │
  (FIDO2/TOTP)           │  frontend/apps/super-admin  (Next.js, WorkOS) │
                         │   • L5 AuthKit  • L6 RBAC middleware           │
                         │   • L7 audit gate  • masking/CSP-nonce         │
                         └───────────────┬──────────────────────────────┘
                                         │  mTLS, private ALB
                                         ▼
                         ┌──────────────────────────────────────────────┐
                         │  cmd/admin-api  (Go, private bind)            │
                         │   internal/admin/{rbac,audit,killswitch,      │
                         │     orgs,users,billing,dsar,accessreview}     │
                         │   • verifies admin-project WorkOS JWTs (JWKS) │
                         │   • deny-by-default permission checks         │
                         │   • writes admin_audit_log BEFORE responding  │
                         └───────┬───────────────────────┬──────────────┘
             reuse (same module) │                       │ read-only, region-fanned
                                 ▼                       ▼
   internal/audit (spine pattern)          internal/repository (region router Primary/ForTenant)
   internal/billing · internal/compliance  → orgs · users · agents · usage · governance (all tenants)
   internal/analytics/flags
                                 │
                                 ▼  durable, cached on hot path
                      kill_switch_state  ──read──► orchestrator gates
                      (task submit / tool call / model call / writes)
```

Isolation properties: separate app, separate binary, separate deployment + cluster/namespace, separate
WorkOS project, separate DB schema (`admin`) + connection pool, private ingress. Blast radius of a SAD
compromise is bounded away from customer request paths.

---

## 5. Platform RBAC & permission model (D5)

- **Permission notation:** `resource:action` over resources `{platform, orgs, users, agents, billing,
  marketplace, services, databases, flags, rbac, audit, keys, ip, governance, violations, kill_switch,
  data_purge}` × actions `{read, write, delete, execute, export}`; `*` = all actions; `*:*` = Owner only.
- **Registry (code):** `internal/admin/rbac/registry.go` defines `Permission`, `Role`, and the immutable
  `role → []Permission` map exactly matching sysdesign §6.2. Mirrored to `frontend/apps/super-admin/lib/rbac.ts`
  with a parity test (the same discipline as the shipped EMAOP `lib/roles.ts` ↔ backend constants).
- **Deny-by-default:** an operator with no assignment resolves to zero permissions. A route with no
  registered permission is unreachable.
- **Assignments (DB):** `admin_role_assignments(admin_user_id, role, assigned_by, expires_at)`; role→perm
  map is *not* editable via UI (immutable-via-deploy per §5.1). `rbac:write` (assign roles) is Owner-only.
- **Separation of duties (§5.1):** Security Admin can `audit:read` but not `kill_switch:execute`; Infra
  Admin cannot touch customer PII/billing; enforced by the registry matrix + per-route checks.
- **Enforcement (3 levels, all must allow):** (1) Next.js middleware route guard → 404 on fail; (2)
  admin-api handler `RequirePermission(...)`; (3) Postgres RLS on the most sensitive `admin_*` tables as
  defence-in-depth.
- **Fail response:** every authz failure returns a **generic 404** (design §3.1) — never 401/403 — so the
  surface's existence is not confirmable.

---

## 6. Admin audit chain (reuse the Spine — D1)

- **`admin_audit_log`** table mirrors sysdesign §8.2 but the tamper-evidence is the **spine's HMAC
  hash-chain**: `hmac_signature` over `(event_id | actor_id | action | resource_id | result | created_at |
  prev_event_id)`, `prev_event_id` linking the previous admin event. One platform-wide chain (not
  per-tenant), keyed from an isolated admin master secret via `HMACKeyProvider`.
- **Append-only enforcement:** goose migration adds the table + `RULE`s (`DO INSTEAD NOTHING` on
  UPDATE/DELETE) + `REVOKE DELETE … FROM PUBLIC` (design §8.2). Writes go through a batched, append-only
  store (reuse `pgstore` shape).
- **The audit gate (Layer 7):** `internal/admin/audit.Gate` middleware writes the event **before** the
  handler runs; if the write fails, the request is blocked (design §3.1/§11). Reads of the audit log are
  themselves audited (§8.6). `resource_before/after` captured for mutations (encrypted at rest).
- **Verification:** reuse `VerifyChain`; a **nightly job** (already an ops pattern) verifies and alerts on
  break. Every 1,000 entries, compute a Merkle root and hand it to the `RootAnchor` (D2: S3 Object Lock
  WORM + WorkOS Audit Logs; Hedera behind the same interface if ever required).
- **Second, independent record:** WorkOS Audit Logs streams identity events (sign-in, MFA, session
  revoke, role change) for the admin project — corroborating evidence that survives an admin-api compromise.

---

## 7. Kill switches & dual approval (extend Control — D6)

- **Registry:** the 10 named switches from sysdesign §9 (`halt_all_agents`, `halt_new_tasks`,
  `halt_tool_calls`, `halt_model_calls`, `halt_org_{id}`, `read_only_mode`, `maintenance_mode`,
  `block_marketplace`, `halt_governance`, `freeze_billing`) as code with effect + scope + impact metadata.
- **State store:** `kill_switch_state` (durable, high-read) — the orchestrator reads it on the hot path
  (task submit, tool-call authorize, model-call, write endpoints) via a small **cached** gate (single-flight,
  short TTL, fail-safe default = *not* halted so a store outage never black-holes the platform). This
  extends the existing `control.SetPaused` + Temporal-signal fan-out from tenant scope to platform scope.
- **Dual approval (two-phase, durable — sysdesign §11.2):** `POST /admin/kill-switch/propose`
  (`kill_switch_requested`, 15-min expiry, notify eligible approvers via the **channels stack**) →
  `POST /admin/kill-switch/approve` by a *different* Super Admin/Owner (self-approval rejected →
  `suspicious_self_approval` audit + Security Admin alert) → automatic execute (`kill_switch_executed`).
  Idempotent via a proposal id (reuse the shipped idempotency-key + promotion-SoD patterns). Every phase
  audited; typed confirmation phrase + reason code required.
- **`data_purge:execute`** uses the same dual-approval machine plus a durable outbox for the erasure
  side-effects (append-only audit of exactly what was deleted, when, by whom — §14.1 right-to-erasure).

---

## 8. Dashboard modules → data sources (sysdesign §9.1)

Every module maps to an admin-api endpoint set + a reused data source. All reads are region-fanned and
masked; all writes are permission-gated, typed-confirmed, and audited.

| Module (route) | Min permission | Data source (reuse) | New work |
|---|---|---|---|
| System overview `/` | `services:read` | `/metrics`, billing rollups, `admin_audit_log` tail | Aggregation endpoint |
| System health `/health` · Alerts `/alerts` | `services:read` | Prometheus/Alertmanager (`infra/observability`) | Read-through proxy |
| Orgs `/orgs`, `/orgs/:id` | `orgs:read` | region-router cross-tenant org/agent/user repos | Aggregation repos; suspend/tier writes |
| Users `/users`, `/users/:id` | `users:read` | identity repos + WorkOS | Cross-tenant user search; suspend; impersonate (audited) |
| Agents `/agents` | `agents:read` | `agents` repo (cross-tenant) | Read view |
| Marketplace `/marketplace` | `marketplace:read` | `internal/repository/marketplace.go` | Moderation writes (unlist/verify) |
| Billing `/billing`, `/billing/:orgId` | `billing:read` | `internal/billing` + `usage_events` | Platform MRR rollup; refunds/subscriptions (write) |
| Services `/services` · Databases `/databases` | `services:read`/`databases:read` | health + read-replica introspection | Read-only ops views |
| Feature flags `/flags` | `flags:read` | `internal/analytics/flags` | Platform override write store |
| RBAC `/rbac` · Access reviews `/access-reviews` | `rbac:read` | `admin_role_assignments` | Owner-only writes, re-auth, session invalidation |
| Audit `/audit` | `audit:read` | `admin_audit_log` + `VerifyChain` | Viewer + Merkle-proof + signed export |
| API keys `/keys` | `keys:read` | Vault seam | Rotate/revoke (write, audited) |
| IP allowlist `/ip` | `ip:read` | infra config store | Read + write (P8) |
| Governance `/governance` · Compliance `/compliance` | `governance:read` | `internal/compliance` + violation ledger | Cross-tenant views; report gen |
| Kill switches `/kill-switches` · Data purge `/data-purge` | `kill_switch:execute`/`data_purge:execute` | §7 machine | Full build |
| Maintenance `/maintenance` | `services:write` | kill-switch `maintenance_mode` | Toggle |

---

## 9. Data model / migrations (goose, PG16, continues the chain)

New `admin` schema (dedicated pool). All migrations PG16-validated (goose Up + Down), additive, and
**do not touch any existing customer table**.

- `admin_users` — mirror of WorkOS admin-project users (id, email, status, mfa_method, created/suspended).
- `admin_role_assignments` — `(admin_user_id, role, assigned_by, expires_at, created_at)`; role vocab
  allowlisted; Owner-only writes.
- `admin_audit_log` — §6 schema + append-only RULEs + `REVOKE DELETE` + HMAC chain columns.
- `admin_audit_anchors` — `(checkpoint_seq, merkle_root, anchored_at, anchor_ref)` for external anchoring.
- `kill_switch_state` — `(switch_id PK, enabled, scope_ref, enabled_by, reason_code, updated_at)`.
- `kill_switch_proposals` — two-phase: `(id, switch_id, proposer, reason_code, confirmation_phrase_hash,
  status, expires_at, approver, decided_at)`; partial-unique one-open-proposal per switch.
- `admin_access_reviews` — `(id, role, subject, reviewer, decision, reviewed_at, due_at)`.
- `admin_break_glass_events` — append-only record of seal-break + 30-min read-only grant.
- `dsar_requests` — `(id, subject_ref, requested_by, status, artifact_ref, created_at)` (right-to-access).
- `data_purge_requests` — dual-approval + outbox for right-to-erasure, append-only.

---

## 10. Phased delivery

Each phase is **independently shippable**, additive, and behind the isolated app (zero customer impact
until an operator opts a switch on). Every phase carries the **pre-ship checklist** (§12).

- **P0 — Identity isolation & skeleton.** Isolated WorkOS admin project; `cmd/admin-api` (chi, private
  bind, `/health/{live,ready}`, `/metrics`, JWKS verify against the admin project, fail-fast typed config);
  permission registry (§5) + parity test; Next.js middleware 404-on-fail + app-level IP allowlist;
  `admin_users` + `admin_role_assignments` migrations. **Exit:** an authorised Owner reaches an empty
  authenticated shell; everyone else gets a 404. No customer data yet.
- **P1 — Admin audit chain + gate (foundation for all writes).** `admin_audit_log` (append-only, HMAC
  chain, RULEs/REVOKE) + audit gate middleware (write-before-respond, block-on-fail) + `VerifyChain`
  nightly job + SIEM/WorkOS Audit Logs stream + S3-Object-Lock anchor (`RootAnchor` iface). **Exit:** every
  admin request is provably logged; audit reads are themselves audited.
- **P2 — `super-admin` app + read-only modules.** The isolated Next.js app (AuthKit, CSP nonces, security
  headers, masking + reveal-audited, no-store on sensitive responses); System Overview, System Health,
  Alerts, and the Audit Log viewer (+ Merkle-proof + signed export). Brand-locked (Black & Apple-Silver,
  Geist, lucide @1.5, tokens, sentence case), WCAG-AA, loading/error/empty states. **Exit:** operators can
  observe the platform, read the audit log, and verify chain integrity — all read-only.
- **P3 — Org / user / agent management (cross-tenant reads + first gated writes).** Region-fanned
  aggregation repos (list orgs, org detail, users, agents, platform metrics); masking; suspend-org /
  change-tier writes (typed-confirm, audited); support **impersonation** (time-boxed, read-scoped,
  loudly audited). **Exit:** support & ops workflows on real cross-tenant data.
- **P4 — Billing, marketplace moderation, feature flags (write surfaces).** Platform MRR/usage rollups;
  refunds & subscription changes (Stripe, idempotent, audited); marketplace moderation (unlist/verify);
  platform flag override store + toggle. **Exit:** finance & trust-and-safety operations.
- **P5 — Kill switches & dual approval (destructive ops).** §7 registry + durable state + cached hot-path
  gates in the orchestrator + two-phase propose/approve/execute + self-approval rejection. **Exit:** an
  operator pair can halt platform surfaces safely and reversibly, fully audited.
- **P6 — Governance/compliance + DSAR + right-to-erasure.** Cross-tenant governance-violation views;
  compliance report generation (reuse evidence engine); DSAR retrieval; data-purge via dual approval +
  durable outbox. **Exit:** regulatory-request workflows (§14).
- **P7 — Access governance.** RBAC management UI (Owner-only, re-auth to apply, immediate session
  invalidation on role change — §7.5); access reviews with due dates; break-glass (sealed credential +
  out-of-band alert + 30-min read-only); offboarding automation (suspend + session revoke + key rotation
  review). **Exit:** the design's identity-governance lifecycle.
- **P8 — Zero-trust network hardening (infra).** Private Route53 zone; WireGuard gateway (dedicated VPC,
  cert-only) or interim mTLS+IP-allowlist; WAF rate-limit + bot challenge; dedicated admin cluster/namespace
  + private ALB + Vault dynamic secrets; admin-app CI security gates (npm audit, Trivy, Semgrep). **Exit:**
  the full seven-layer stack; app remained app-layer-secure throughout P0–P7.

Sequencing rationale: identity + audit (P0–P1) are prerequisites for *everything* (no admin action exists
without a log). Read-only value ships at P2. Writes escalate in blast radius (P3 → P4 → P5/P6), each gated
by the audit + dual-approval machinery already in place. Network hardening (P8) is additive and can be
pulled forward as infra readiness allows without blocking application delivery.

---

## 11. The seven-layer access stack — in-app vs infra split

| Layer | Owner | Delivered in |
|---|---|---|
| L1 Private DNS (NXDOMAIN publicly) | Infra (Route53 private zone) | P8 |
| L2 WireGuard VPN (cert-only) | Infra (dedicated VPC gateway) | P8 (interim: mTLS + IP allowlist earlier) |
| L3 IP allowlist (CIDR) | Infra (WAF + SG) **+ app middleware** (defence-in-depth) | app check P0; infra P8 |
| L4 WAF (rate-limit, bot, anomaly) | Infra (Cloudflare/ALB) | P8 |
| L5 WorkOS AuthKit (password + FIDO2/TOTP, Radar) | App | P0/P2 |
| L6 App RBAC (registry, deny-by-default, 404-on-fail) | App | P0 |
| L7 Audit gate (write-before-respond) | App | P1 |

The app is **fully secure at layers 5–7 (plus an app-level IP allowlist) from P0**, so the network layers
are hardening, not a functional gate — consistent with D6.

---

## 12. Pre-ship checklist (every phase, per `CLAUDE.md`)

- [ ] Deny-by-default authz; every route maps to a registered permission; failures return generic 404.
- [ ] Every admin action writes `admin_audit_log` **before** side effects; write-failure blocks the request.
- [ ] Destructive actions (kill switch, data purge, tier change, refunds) require typed confirmation +
      reason code; kill switch & purge require **dual approval** (self-approval rejected + alerted).
- [ ] Cross-tenant reads are **region-fanned** and **masked** by default; reveal is audited + auto-re-masks.
- [ ] No customer PII/keys in client state, localStorage, or caches; `Cache-Control: no-store` on sensitive
      responses; CSP nonces, no `unsafe-inline`.
- [ ] Migrations additive, PG16-validated (Up + Down), touch no existing customer table; audit tables
      append-only (RULEs + REVOKE DELETE).
- [ ] Contract-first: admin-api endpoints in an **admin OpenAPI** (separate from the public spec); FE typed
      client generated/validated against it; RBAC registry parity test (Go ↔ `lib/rbac.ts`) green.
- [ ] Idempotency on all writes (proposal ids, Stripe idempotency keys); outbox for must-not-lose effects.
- [ ] Fail-fast startup config validation; secrets from Vault/env only (isolated admin path); no secrets
      committed; secret-scanning in CI.
- [ ] Structured logs (service, request_id, actor, action, result) — never secrets/PII; metrics for admin
      request/error/latency + kill-switch state + audit-write failures.
- [ ] Tests: unit (registry, chain, dual-approval state machine, masking), integration (append-only +
      `VerifyChain` on real PG16, region-fanned reads), contract (admin OpenAPI), a thin E2E on login →
      audited read → gated write.
- [ ] Brand-locked FE (Black & Apple-Silver, Geist, lucide @1.5, tokens, sentence case), WCAG-AA, mandatory
      loading/error/empty states.
- [ ] CI security gates for the admin app: `npm audit`/`govulncheck` (block HIGH/CRITICAL), Trivy image
      scan, Semgrep SAST.

---

## 13. Non-goals / explicitly deferred

- **Hedera Hashgraph anchoring** — replaced by S3 Object Lock WORM + WorkOS Audit Logs (D2); reinstatable
  behind the `RootAnchor` interface if a contract demands a public-ledger anchor.
- **Fully air-gapped separate VPC with zero peering + PrivateLink for every call** — P8 delivers a private,
  IP-allowlisted, VPN-fronted deployment; full air-gap is a later hardening step once traffic patterns are
  known (documented as such, not silently dropped).
- **Bespoke break-glass Telegram bot** — reuse the shipped channels/notification stack (D7).
- **Editing role→permission maps via UI** — immutable-via-deploy by design (§5.1); only assignments are
  mutable, Owner-only.

---

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Shared Go module (D4) couples admin-api to the orchestrator's dependency tree | Separate binary/deploy/network/secrets; admin-api imports only read repos + spine/billing/compliance; no admin code in the customer request path; dependency review on bumps |
| Kill-switch state store outage black-holes the platform | Hot-path gate is **cached + fail-safe default = not halted**; store is high-durability; switch flips are rare and audited |
| Cross-tenant admin reads become a PII exfiltration vector | Masking-by-default + reveal-audited + download-volume anomaly detection (design §2.3); purpose-limitation policy; every read logged |
| A compromised admin session | L5–L7 + IP allowlist from P0; short-lived JWTs + IP/UA binding + forced-logout triggers (P7); network layers (P8) |
| Audit write on the hot path adds latency | Batched append (reuse `pgstore` CopyFrom); the gate awaits only the durable write for *mutations*, not every read (reads log async-but-guaranteed via outbox) |
| Design-vs-build drift | This plan is the single source; update the sysdesign banner as phases land (keep the honest line) |

---

*Plan v1.0 — Actrone Engineering — RESTRICTED. Builds `super-admin-dashboard-sysdesign.md`. Inherits the
workspace `CLAUDE.md`. Nothing herein is implemented yet; update per-phase status as work lands.*
