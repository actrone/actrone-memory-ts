# Actrone Self-Hosting Plan — Enterprise / On-Prem / Air-Gapped

> **Status refreshed 2026-07-13 (code-verified):** The "Status: PLAN (not yet built)" banner below
> is now substantially stale — most of P0/P1/P2/P4 are BUILT. Verified directly against code:
> - **P0 — BUILT.** `internal/licensing/{license.go,guard.go,source.go}` (Ed25519 sign/verify, tier
>   + feature-override claims, grace-period degrade); `infra/helm/actrone/values-selfhost.yaml`
>   (138 lines); `billing/usage_offcloud.go` implements `UsageReportClient` (connected mode).
> - **P1 — BUILT.** The same `usage_offcloud.go` also implements the air-gapped
>   `UsageExportClient` (signed, optionally AES-256-GCM-encrypted append-only export file) —
>   contrary to this doc's phase table implying it was still to build.
> - **P2 — MOSTLY BUILT, one sub-item genuinely differs from plan.** Generic OIDC verifier is real
>   (`internal/oidc/verifier.go`). **The frontend de-Clerk item is DONE, not pending** — this
>   directly corrects §1/§2 below, which still describe a live Clerk coupling: Clerk was fully
>   removed 2026-07-09 (WorkOS Auth Switch Plan). Verified 2026-07-13: zero `@clerk` references in
>   any `package.json`, zero `clerk`/`Clerk` string anywhere in `backend/`, `frontend/`,
>   `actrone-py/`, `actrone-ts/`, `actrone-cli/`, or `infra/` (case-insensitive grep, excluding
>   `node_modules`/`.venv`). `middleware/auth.go` now authenticates WorkOS-managed AuthKit tokens
>   **or** a generic OIDC issuer through the same JWKS verifier — i.e. the self-host path this
>   plan needed is exactly what shipped. **SCIM is BUILT and wired**: `internal/scim/{filter.go,
>   resource.go,store.go}` + `handler/http/scim.go`, mounted at `/scim/v2` (ServiceProviderConfig +
>   full Users CRUD) gated by `cfg.SelfHost.SCIMToken`/`SCIMTenantID` (`main.go` ~2236-2254) — this
>   also pre-empties the P4 "SCIM sync" row below. **Not done:** bundling Keycloak specifically —
>   the shipped design is BYO-OIDC (customer brings any IdP) rather than a bundled default IdP,
>   which arguably satisfies the underlying need differently than planned, not less.
> - **P3 — PACKAGING AUTHORED (correction 2026-07-13, orchestrator re-verified).** An earlier grep
>   missed `infra/kots/` — it **exists** with `kots-app.yaml`, `kots-config.yaml`,
>   `kots-embedded-cluster.yaml` and `kots-helmchart.yaml`, i.e. the Replicated/KOTS + Embedded-Cluster
>   **packaging manifests are written**. So P3 is *not* "confirmed absent"; what genuinely remains is
>   **publishing an actual Replicated release + admin-console config + testing the guided/air-gap
>   embedded-cluster install** — a publish/turn-up task, not a from-scratch build. (Support-bundle
>   policy + a formal compatibility matrix are still unverified.)
> - **P4 — MOSTLY BUILT.** `infra/helm/actrone/values-selfhost-ha.yaml` is explicitly headed "P4:
>   HA Temporal profile + sizing" (5-replica loop, 3-replica Temporal frontend/history/matching,
>   PDBs, autoscaler headroom) — built. `infra/docs/Actrone_Self_Hosting_DR_Runbook.md` exists —
>   built. SCIM sync — built (see P2 above). **A real, non-stub license admin UI also ships**:
>   `frontend/apps/control-tower/src/components/features/license/LicenseAdmin.tsx` +
>   `.../settings/license/page.tsx` (loading/error/empty states, token install without redeploy) —
>   this was not called out anywhere in the plan below and closes the "license UI" gap some prior
>   notes flagged as pending. Single-tenant defaults predate this plan per §1. Not verified in this
>   pass: long-term-support channel policy, formal compatibility matrix.
>
> **Net (corrected 2026-07-13):** all five phases now have real in-repo code/artifacts — P0, P1,
> P2 (mostly), P4, **and P3's KOTS/Embedded-Cluster packaging manifests (`infra/kots/`)**. Self-hosting
> is effectively **code/artifact-complete; the residual is publish + deploy + turn-up** (publish the
> Replicated release, apply the values-selfhost profiles, air-gap export testing), not "build P3." The
> version banner and phase table immediately below are historical intent, not current status.
>
> **Version 0.1 — July 2026 · Owner: Matt · Status: PLAN (not yet built)**

> **Goal.** Ship self-hosting as a **first-class Enterprise product**, not a repurposing of
> our internal dev/ops tooling. A customer must be able to stand up Actrone on **any Kubernetes
> (EKS/GKE/AKS/OpenShift/k3s), a single on-prem VM, or a fully air-gapped datacentre**, and get
> the **complete platform** — governance, metered billing, entitlements, observability, the lot —
> that is scalable, secure, resilient, efficient, and seamless to install and upgrade.
>
> This plan is grounded in a direct read of the codebase (§1–§2), then designs the missing pieces
> (§3 onward). It supersedes the loose "self-hosting docs" that describe a story the code doesn't
> yet ship as an installable artifact.

---

## 0. Framing: what "self-host" is and isn't for Actrone

Actrone's moat is **governed, metered, billed** agent execution. Self-host must **preserve** that,
not undercut it. So self-host is not "the open dev stack" — it is a **licensed Enterprise SKU** in
which the *same* governance and metering run on the customer's infrastructure, and value is
captured through a **cryptographic license + usage reporting** rather than a live Stripe webhook.

Three deployment realities we must serve, all carrying the full platform:

| Mode | Who | Connectivity | Billing capture |
|---|---|---|---|
| **Connected self-host** | Regulated cloud / data-sovereignty customers on their own cloud account | Outbound HTTPS to Actrone allowed | Local ledger → periodic **signed usage report** phoned home |
| **Air-gapped** | Defense/gov/finance, zero egress | None | Local ledger → **signed usage export bundle** carried out on media; prepaid caps enforced locally |
| **Flat-licensed** | Enterprises wanting no telemetry at all | Optional | **Entitlement-only license**, annual contract, unlimited-within-tier, no usage export |

The distinction from our own infra tooling (which is **not** the product): `backend/docker-compose.yml`
is our **dev inner-loop**; `infra/terraform/*` is **our** AWS/EKS estate (hardwired to Actrone's
accounts, OIDC, state buckets); `infra/helm/actrone` is **our** production deploy chart (ghcr images,
ESO/Vault secrets, mesh-on). Self-host needs its **own** packaging derived from — but distinct from —
the Helm chart.

---

## 1. What is ALREADY self-host-ready (verified in code)

The architecture is far more portable than it first appears. Confirmed by direct inspection:

- **Metering is offline-capable and pluggable.** `billing.Recorder` buffers usage off the request
  path and batch-writes to the **`usage_events` Postgres ledger** (works with zero external
  connectivity). Emission to Stripe is a **swappable `billing.MeterClient`**: the default
  `NoopMeterClient` records to the ledger + powers the in-product usage dashboard **and sends
  nothing outward**; `StripeMeterClient` flushes **closed-hour, pre-aggregated buckets** with a
  **deterministic idempotent `Identifier`** only when `Billing.Enabled`. → *This is the seam that
  makes "metered billing everywhere" real: the ledger always meters; only the flush **target**
  changes.*
- **Tier is DB-authoritative**, not identity-provider-bound. The server resolves entitlements from
  `tenant_billing.tier` (`Repository.TierForTenant` / `BillingIdentity`); the Stripe webhook merely
  *writes* that column via `UpsertTenantBilling`. → *A license can set the tier instead of a webhook,
  with no change to the enforcement path (`enforcement.go`, `Entitlements`, `featureMinTier`).*
- **Entitlements/governance are self-contained Go.** `billing.Entitlements` + the `featureMinTier`
  matrix (free < pro < scale < enterprise), the `RequireEntitlement` route gates, task-quota caps,
  reasoning-effort ceilings, and **all** governance (manifest-hash enforcement, DPE, MAL
  tokenization, MediaGuard, audit ledger, certification/trust evidence) run identically off-cloud.
- **A Clerk-free auth path already exists — and Clerk itself is now gone (corrected 2026-07-13).**
  `middleware/auth.go` authenticates **either** a WorkOS-managed AuthKit JWT / generic-OIDC JWT
  **or** a DB-backed **SHA-256 API key** (`APIKeyRepository`). This bullet originally described a
  Clerk-vs-API-key split as an aspiration; as of the WorkOS Auth Switch (shipped 2026-07-09), Clerk
  is fully removed from the codebase — SDK/programmatic access AND interactive console login are
  both IdP-independent through the same generic **JWKS/RS256** seam (WorkOS or any OIDC issuer).
- **The tenant model is internal.** Identity → tenant is an indirection: `org_id` claim →
  `OrganizationRepository.GetTenantID()` → internal **tenant UUID**. The IdP is just an external key
  supplier; swapping it means mapping a different issuer's org/group claim to the same UUID.
- **Several "SaaS" dependencies are already self-hostable by design:** e-sign via **self-hosted
  Documenso** (`agreements/documenso.go`), errors via the **self-hosted Sentry Relay** subchart,
  **MediaGuard** ships as a self-hostable `backend/mediaguard` service, and **BYO container registry**
  landed in T3.14 (`internal/registrybinding`). Backing DBs are already **external-by-DSN** (this
  cleanup shipped 2026-07-03) and reachable in-cluster.
- **Residency + single-tenant primitives exist.** `single_tenant` is already an Enterprise feature;
  the residency engine + regional-data-plane module give us the data-locality vocabulary.

---

## 2. What is genuinely coupled to our cloud (the gaps to close)

| Coupling | Depth | Self-host resolution |
|---|---|---|
| ~~**Clerk** (interactive login, org UI)~~ **RESOLVED 2026-07-13** | Was: backend 1 verifier + claim→tenant map; frontend ~52 files used `@clerk/nextjs`/`useAuth`/`auth()`. Clerk is now fully removed (WorkOS Auth Switch, shipped 2026-07-09) — zero `@clerk` references anywhere in the repo. | Shipped as WorkOS-managed (cloud tier) + generic-OIDC (self-host, `internal/oidc`) on the same JWKS verifier — the frontend auth abstraction landed as part of the WorkOS switch, not as a self-hosting-specific effort. No bundled IdP (Keycloak) was built; self-host is BYO-OIDC instead. |
| **Stripe** (billing flush target) | Already optional (`NoopMeterClient`) | License token sets tier; **UsageReport** MeterClient + air-gap export (§5) |
| **Container registry** (for `kind: code` builds + hosted agents) | ECR in our cloud | BYO registry (T3.14 done) → Harbor/any OCI; make optional if builds unused |
| **LLM providers** | Always external | Unchanged: managed keys, BYOK, or **self-hosted OpenAI-compatible** (vLLM/TGI) via the generic provider — already supported |
| **Our infra tooling** (Terraform/our Helm defaults) | N/A — not shipped | New `values-selfhost.yaml` + packaging (§7) |

---

## 3. Editions & topology (one platform, three install shapes)

All three run the identical binaries and carry the full governance + metering. They differ only in
**how Kubernetes and the backing services are provided**.

1. **Portable Helm (BYO cluster)** — for K8s-native customers on EKS/GKE/AKS/OpenShift/k3s. They
   already have a cluster; we ship a hardened chart + a private-registry image bundle. *Primary path.*
2. **Embedded single-node/cluster (no K8s expertise)** — a guided installer that brings its **own**
   Kubernetes (k0s/k3s single binary) onto bare VMs, with an admin console. For on-prem customers who
   don't run Kubernetes. *Delivered via Replicated Embedded Cluster (see §7).*
3. **Air-gapped** — either of the above with an **offline image + chart bundle** and the air-gapped
   licensing/metering mode (§5). No egress, ever.

**Recommendation:** support **(1) portable Helm** and **(3) air-gapped** from day one (they share
90% of the work); add **(2) Embedded** once there's a customer who needs it — it's the biggest
packaging lift and lowest initial ROI.

---

## 4. Backing services in self-host

The app connects to Postgres, Redis/Valkey, Qdrant, Temporal, and NATS purely by **DSN** (from the
`orchestrator-secrets` Secret). Two supported provisioning styles, both first-class:

- **BYO managed** (recommended on a cloud): point DSNs at RDS/Cloud SQL/ElastiCache/Memorystore, a
  managed Qdrant, and **Temporal Cloud** (or their own Temporal). Zero in-cluster stateful workloads.
- **In-cluster operators** (recommended on-prem/air-gap): bundle *optional* operator installs —
  **CloudNativePG** (Postgres HA/backups/PITR), **Valkey**, **Qdrant**, **Temporal** (Helm), and the
  existing **NATS** subchart. Each togg#led in `values-selfhost.yaml`, off unless chosen.

**Temporal is the heaviest dependency** and the one most likely to surprise a self-hoster (it needs
its own datastore + several services; `temporalio/auto-setup` is dev-only, not HA). Ship a
production Temporal profile + sizing guidance, and support Temporal Cloud for connected customers.

---

## 5. Licensing & metered billing off-cloud (the crux)

This is what lets self-host **carry metered billing everywhere** without a live Stripe webhook. Two
cooperating mechanisms: a **license token** (entitlements) and a **usage channel** (metering).

### 5.1 License token — Ed25519-signed, offline-verifiable

A signed license file the customer installs (env/secret). Verified **locally** against a
**pre-distributed Actrone public key** — no network, deterministic, audit-friendly (the 2026
industry standard for air-gapped licensing; Keygen/LicenseSpring model). Payload:

```
tenant / org name, license_id
tier (free|pro|scale|enterprise)      → sets tenant_billing.tier (replaces the Stripe webhook)
entitlement overrides (feature flags, seat counts, region grants)
mode (connected | airgapped | flat)
issued_at, not_before, expires_at, grace_period
usage_caps (optional prepaid credits per meter, for air-gapped prepay)
signature (Ed25519)
```

- New `internal/licensing` package: `Verify(token, pubkey) (License, error)` (pure, offline), a
  `LicenseSource` that feeds `tenant_billing.tier` and the entitlement layer, and a fail-**soft**
  posture: an expired/missing license **warns + enters grace**, then degrades to read-only — it must
  **never** hard-kill a governed production workload without warning (enterprise resilience).
- Reuses the existing entitlement enforcement unchanged — the license is just a *new writer* of tier
  + feature overrides.

### 5.2 Usage channel — three modes over the existing ledger

The `usage_events` ledger already accumulates every meter locally. Add pluggable flush targets:

- **Connected → `UsageReportClient` (new `MeterClient`).** Periodically POSTs **signed, aggregated,
  closed-bucket** usage to an Actrone metering endpoint (`usage.actrone.com`), reusing the exact
  offline-buffer + deterministic-idempotency guarantees the Stripe path already has. Actrone bills
  from the reports. mTLS + Ed25519-signed bodies; retry/backoff; drops nothing (idempotent replay).
- **Air-gapped → `UsageExportBundle`.** A scheduled job seals the closed buckets into an Ed25519-
  signed (AES-256-GCM-encrypted) **export file** written to a mounted volume. The customer transfers
  it out (USB/approved channel); Actrone ingests it for billing. Prepaid `usage_caps` from the
  license are enforced **locally** so overage can't run unbilled.
- **Flat → Noop.** No export; entitlement-only license; annual true-up by contract.

### 5.3 What Actrone operates to receive this

A small **metering-ingest service** in our cloud: authenticated report/bundle intake →
dedupe by identifier → the *same* Stripe Billing Meter Events pipeline we already run. Self-host
customers become Stripe customers billed from **their** reported usage. (Design stub only here; it's
a cloud-side companion, out of the orchestrator repo.)

---

## 6. Auth for self-host

- **Generalize the verifier** from Clerk-specific to **any OIDC issuer**: configurable issuer +
  JWKS URL + claim mapping (`sub`, org/group claim → tenant, role claim → scoped RBAC). The existing
  `JWKSVerifier` is 80% of the way there. Keep the **API-key path** untouched (already IdP-free).
- **Bundle a batteries-included IdP: Keycloak** (Apache-2, mature air-gap story, OIDC + **SAML** +
  **SCIM** for enterprise directory sync). But treat it as **default, not lock-in** — the generic
  OIDC contract means a customer can point at their own Okta/Entra/Ping/Auth0/Zitadel instead.
- **Frontend:** introduce an auth abstraction so the console isn't hard-wired to `@clerk/nextjs`
  (the ~52 touch-points funnel through `useAuth()`/`auth()`, so a shim + an Auth.js/oidc-client
  provider swap is the bulk of it). This is the **largest single work item** and gates the
  interactive console; the SDK/API surface works self-hosted before it lands.
- Provision org→tenant on first login (map IdP org/group → new tenant UUID) — replaces Clerk's org UI.

---

## 7. Packaging & distribution

- **`values-selfhost.yaml` profile** on the existing umbrella: public **pinned** release images,
  mesh charts (`linkerd`/`gateway`/`ext-authz`) **off** by default (edge-trust is opt-in; domain
  authz still runs), secrets via **plain K8s Secret or Vault** (not our ESO/AWS path), in-cluster
  datastore operators **optional-on**, license + OIDC config surfaced as first-class values.
- **Image bundle + mirroring:** publish the full image set to a public registry, plus an **air-gap
  tarball** (`docker save` set + chart) and a documented `helm --set image.registry=<private>` mirror
  flow, so every image ref is overridable (enterprise-Helm requirement for restricted registries).
- **2026-standard packaged/embedded path: Replicated** (KOTS + **Embedded Cluster**). It is the de
  facto tool for ISVs shipping self-hosted + air-gapped software: air-gapped Helm installs, an admin
  console, embedded k0s for no-cluster customers, a compatibility matrix, and support-bundle
  collection. Adopt it for editions **(2)** and **(3)**; portable Helm **(1)** needs none of it.
- **Supply-chain:** keep SLSA provenance + **cosign** signatures on every image (already our build
  posture); ship an offline **CVE-scan** step and an SBOM per release for regulated buyers.

---

## 8. Security, isolation & resilience in self-host

- **Single-tenant by default** (the `single_tenant` Enterprise feature) — a self-hosted install is
  usually one org; keep multi-tenant optional.
- **Secrets:** Vault or sealed K8s Secrets; the app already reads everything via `envFrom` — no code
  change. Never bake secrets into images (existing rule).
- **Network:** mesh/mTLS (Linkerd) is *available* but off by default for install simplicity; document
  turning it on for zero-trust environments. NetworkPolicies ship default-deny.
- **Resilience:** graceful shutdown, idempotent writes, backwards-compatible migrations, and HA
  guidance (≥2 replicas, PDBs, the Redis single-flight leader guard already present for the billing
  flush/reconcile loops) all carry over unchanged.
- **Governance parity is the headline:** manifest-hash enforcement, DPE simulate-then-commit, MAL
  tokenization, MediaGuard, the signed audit ledger, and the **trust-center sealed evidence** all run
  offline — a self-hosted install can produce its **own** SOC2/ISO evidence package locally.

---

## 9. Observability

Self-contained stack already exists (`infra/observability`): Prometheus, Grafana, Jaeger/OTel,
Alertmanager, postgres/redis exporters. Errors route through the **self-hosted Sentry Relay** (PII
scrubbed) or nowhere. No mandatory external observability dependency. Ship a self-host Grafana
dashboard set + the canonical multi-window burn-rate alert rules.

---

## 10. Upgrades & lifecycle

- **Versioned releases** on an **enterprise channel** (slower, longer-supported than cloud); every
  migration backwards-compatible + reversible (existing rule) so rolling upgrades are safe.
- **Preflight checks** (K8s version, resources, DB reachability, license validity) before install/
  upgrade; **support-bundle** collection for diagnosis (native if we adopt Replicated).
- Documented **rollback** and a tested restore runbook (DB + Qdrant snapshots).

---

## 11. Phased delivery

| Phase | Scope | Unlocks |
|---|---|---|
| **P0 — Portable Helm + License + Connected metering** ✅ BUILT | `values-selfhost.yaml`; `internal/licensing` (Ed25519 verify → tier/entitlements, grace); `UsageReportClient` MeterClient + cloud metering-ingest stub; image bundle + mirror docs | A K8s-native customer runs fully-governed, license-gated, usage-reported Actrone on their own cloud |
| **P1 — Air-gapped** ✅ BUILT | Offline image/chart tarball; `UsageExportBundle` (signed/encrypted) + local prepaid-cap enforcement; offline CVE scan + SBOM; in-cluster datastore operators (CNPG/Valkey/Qdrant/Temporal) profile | Zero-egress datacentre install with local metering + prepaid caps |
| **P2 — Generic OIDC + bundled IdP** 🟡 MOSTLY BUILT (verified 2026-07-13) | Generalize JWKS verifier + claim→tenant mapping ✅; frontend auth abstraction (de-Clerk the console) ✅ shipped via WorkOS switch; SCIM ✅ built + wired at `/scim/v2`; bundle Keycloak ❌ not done (shipped BYO-OIDC instead — customer supplies any IdP, no bundled default) | Interactive console without Clerk ✅ achieved; SCIM for enterprise directories ✅ achieved |
| **P3 — Embedded (no-K8s) + Replicated** 🟡 PACKAGING AUTHORED (corrected 2026-07-13) — `infra/kots/` has KOTS app/config/embedded-cluster/helmchart manifests; residual = publish the Replicated release + admin-console config + guided/air-gap install testing + support bundles + compatibility matrix | Adopt KOTS + Embedded Cluster; admin console; guided/air-gap installer; support bundles; compatibility matrix | On-prem customers with no Kubernetes team install in one guided flow |
| **P4 — Enterprise hardening** 🟡 MOSTLY BUILT (verified 2026-07-13) | HA Temporal profile + sizing ✅ `values-selfhost-ha.yaml`; DR/restore runbooks ✅ `infra/docs/Actrone_Self_Hosting_DR_Runbook.md`; SCIM sync ✅ (see P2); single-tenant defaults ✅ predates this plan; SLA + long-term-support channel — not verified in this pass | Production-grade, contractable Enterprise SKU |

**Sequencing rationale:** P0 delivers the *money path* (governed + licensed + billed) on the widest
substrate for the least work, reusing the metering seam that already exists. P1 is a small delta on
P0 (same license, different flush target). P2 (de-Clerk the frontend) is the largest engineering
item and shouldn't block a design-partner who can use the SDK/API + their own IdP-fronted proxy in
the interim. P3 is packaging polish for a specific buyer profile. P4 is contract-readiness.

---

## 12. Open decisions (need a call before P0)

1. **Billing model per edition:** usage-reported (true metered) vs flat annual entitlement vs prepaid
   credits — which do we lead with commercially? (Recommendation: **connected usage-reported** as the
   default; flat + prepaid as air-gap options.)
2. **Hard vs soft license enforcement:** confirm **soft/grace** (warn → read-only) as the production
   default; hard caps only for prepaid air-gap credits. (Recommendation: soft.)
3. **Bundled IdP choice:** Keycloak (safe, ubiquitous) vs Zitadel (modern, Go, org-native). Generic
   OIDC either way. (Recommendation: **Keycloak default**, generic OIDC contract.)
4. **Distribution tooling:** adopt **Replicated** for embedded/air-gap, or hand-roll? (Recommendation:
   adopt Replicated for P1/P3; plain Helm for P0.)
5. **Minimum supported footprint** we'll certify (single-node dev-size vs HA-only). Affects sizing +
   Temporal profile.
6. **Marketplace + payouts in self-host:** the marketplace/Stripe-Connect economics are cloud-only;
   self-host likely ships marketplace **consume-only** (install agents) without publisher payouts.

---

## 13. Effort & risk (rough)

- **Lower risk / high leverage:** `values-selfhost.yaml`, license token (`internal/licensing`),
  `UsageReportClient` — all additive, reuse existing seams, no behaviour change to cloud.
- **Medium:** air-gap bundle + export; in-cluster datastore operator profiles; generic-OIDC backend.
- **Higher risk / most work:** frontend de-Clerking (~52 touch-points); Embedded Cluster packaging;
  HA Temporal. Stage these behind design-partner demand.
- **Biggest external unknown resolved:** offline metered billing is *tractable* because the ledger
  already meters locally and the flush target is already an interface — this is the piece that
  usually kills self-host metering, and Actrone is architecturally ahead here.

---

_Last updated: 2026-07-03 | Owner: Matt | Related: `internal/billing`, `internal/licensing` (new),
`middleware/auth.go`, `infra/helm/actrone`, Data Residency Plan, GAL Strategy._
