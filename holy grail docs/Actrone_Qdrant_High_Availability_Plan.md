# Actrone Qdrant High-Availability Plan (KubeBlocks)

> Closes a real, verified gap: unlike Postgres (RDS Aurora / CloudNativePG) and Redis (ElastiCache /
> Valkey-Sentinel), Qdrant has no confirmed, codified high-availability deployment anywhere in this
> repository, in managed cloud or self-host. This plan adopts KubeBlocks' purpose-built Qdrant operator to
> close it, scoped narrowly to Qdrant, not as a platform-wide operator replacement (see §3 for why the
> already-chosen Postgres/Redis operators are correctly left alone). Related:
> `Actrone_Self_Hosting_Plan.md` (P4 HA profile), `infra/helm/actrone/values-selfhost-ha.yaml` (the
> external-HA-requirements file this plan fills a hole in), `Actrone_Data_Residency_Plan.md` (Tier B
> multi-region Qdrant routing this plan's design must compose with).

---

## 0. TL;DR

1. **Qdrant is self-hosted in-cluster on AWS, not Qdrant Cloud, confirmed directly from the code, not
   assumed.** The orchestrator's own `NetworkPolicy` (`infra/helm/actrone/charts/orchestrator/templates/networkpolicy.yaml:94-100`)
   grants egress to a `podSelector` matching `app.kubernetes.io/name: qdrant`, a podSelector only resolves
   pods inside the same cluster; an external SaaS endpoint would need an IP/CIDR or DNS-based egress rule
   instead. `infra/terraform/modules/regional-data-plane/main.tf:3` states this explicitly: *"Qdrant/object
   store deploy in-cluster."*
2. **There is no confirmed HA configuration for it anywhere, and no Terraform module even exists yet to
   check.** `infra/docs/Actrone_Deployment_Runbook.md:87` lists `Qdrant (modules/qdrant)` as an unchecked
   (`☐`) deployment step referencing a module that, verified directly, **does not exist** in
   `infra/terraform/modules/`. Contrast this with Postgres (`modules/rds`, real, referenced, RDS Aurora with
   explicit HA config) and Redis (`modules/elasticache`, real, `redis_num_clusters: 2` / `3` explicitly set
   per environment). Qdrant is the one backing store in this platform with no equivalent artifact to
   inspect, this plan is that missing artifact.
3. **Self-host has the same gap, already partially documented.** `infra/helm/actrone/values-selfhost-ha.yaml:108-113`
   states HA *requirements* for Qdrant (`replicationFactor: 2`, `nodes: 3`) but, unlike Postgres
   (`provider: "cloudnative-pg"`) and Redis (`provider: "valkey"`, Sentinel mode), names **no provider or
   mechanism** to actually meet them.
4. **KubeBlocks ships a purpose-built, production-grade Qdrant operator**, verified via its own
   documentation: per-shard Raft replication, rolling upgrades, the same `OpsRequest` API/tooling pattern it
   uses across 35+ other engines. This is the right scoped tool for exactly this one gap, it is **not**
   being proposed as a replacement for the already-correct, already-chosen CloudNativePG (Postgres) or
   Valkey/Sentinel (Redis) decisions, see §3 for why swapping those would be a step backward.
5. **This plan serves both deployment models with one design.** Managed cloud (Actrone's own AWS
   production) and self-hosted Enterprise (the P4 HA profile) both currently lack a Qdrant HA story; both
   get the same KubeBlocks-managed `QdrantCluster` shape, differing only in who operates the K8s cluster it
   runs in.

---

## 1. Motivation

- **This is a real production risk today, not a theoretical one.** Qdrant backs both L2 long-term memory
  and the semantic cache (`internal/semcache`), confirmed via `ORCHESTRATOR_QDRANT_URL`/`_API_KEY` usage
  throughout `Actrone_Deployment_Runbook.md`. A single-node Qdrant loss today is a real outage of memory
  recall and semantic caching, with no failover, because nothing in the repository defines one.
- **It's an asymmetry a careful buyer's technical diligence would catch.** Having named, credible HA
  providers for Postgres and Redis but nothing for Qdrant is exactly the kind of inconsistency a
  security-sophisticated CTO or platform engineer doing a build-vs-buy evaluation would notice and ask
  about.
- **Data residency's Tier B routing already assumes multi-region Qdrant exists and is healthy.**
  `Actrone_Deployment_Runbook.md:182` (`ORCHESTRATOR_RESIDENCY_REGION_QDRANT_URLS`) routes tenants to a
  per-region Qdrant endpoint; that routing has no value if any single region's Qdrant is a single point of
  failure within itself.
- **Self-hosted Enterprise buyers are told to bring HA Postgres and HA Redis but given no equivalent
  instruction for Qdrant**, an inconsistent ask that this plan resolves by giving both self-host and
  managed-cloud the same documented, operator-backed answer.

---

## 2. Current state, verified directly from the code

| Component | Evidence | State |
| --- | --- | --- |
| Deployment model | `networkpolicy.yaml:94-100` (podSelector egress); `regional-data-plane/main.tf:3` ("deploy in-cluster") | In-cluster on AWS EKS, **not** Qdrant Cloud. |
| Terraform module | `Actrone_Deployment_Runbook.md:87` references `modules/qdrant`; directory checked directly, **does not exist** | No IaC artifact provisions it; the runbook's own checkbox for this step is unchecked. |
| Replica/HA configuration | Searched `Chart.yaml` (no dependency), `infra/argocd/` (no Application), `infra/k8s/` (no manifest) | **None found.** Contrast with Redis's explicit `redis_num_clusters: 2`/`3` per environment and Postgres's RDS Aurora HA config, both real and inspectable. |
| Self-host HA requirements | `values-selfhost-ha.yaml:108-113` | Requirements documented (`replicationFactor: 2`, `nodes: 3`); **no provider named**, unlike Postgres (`cloudnative-pg`) and Redis (`valkey`, Sentinel). |
| Multi-region routing | `Actrone_Deployment_Runbook.md:182`, `ORCHESTRATOR_RESIDENCY_REGION_QDRANT_URLS` | Built and tested at the routing layer; presumes each region's Qdrant endpoint is itself reliable, which today it structurally cannot guarantee. |
| Voice memory / semantic cache dependents | `Actrone_Deployment_Runbook.md:196-198, 213` | Both features read/write Qdrant directly; both inherit whatever reliability Qdrant has, currently none beyond a single pod. |

---

## 3. Why KubeBlocks, and why only for Qdrant

- **Qdrant has no CNCF-standard, engine-specialized operator the way Postgres has CloudNativePG.** The
  comparison that correctly ruled out KubeBlocks for Postgres (§3 of general infra reasoning: CloudNativePG
  is CNCF-adopted and purpose-built, KubeBlocks is deliberately general-purpose across 35+ engines) does not
  apply here, there is no equivalent focused, more-adopted alternative for Qdrant specifically. KubeBlocks'
  own Qdrant operator, verified as "production-grade" with per-shard Raft replication and rolling upgrades,
  is the most credible purpose-fit option available for this one engine, and it fills a real gap rather than
  displacing an already-correct choice.
- **It reuses tooling Actrone would need anyway if it adopted KubeBlocks for anything.** Since this plan
  scopes KubeBlocks to Qdrant only, no other backing store's operator changes; if a future engine needs the
  same treatment, the `OpsRequest` pattern established here is directly reusable, but that is a future
  decision, not a reason to expand scope now.
- **The alternative, hand-rolling a bespoke Qdrant StatefulSet with manual replication wiring, is real
  effort with none of the ongoing maintenance benefit (rolling upgrade automation, backup orchestration)
  a maintained operator provides.** Building that bespoke path would be strictly more work for a worse
  long-term result than adopting the operator that already exists for exactly this engine.

---

## 4. Design

### 4.1 Topology

- **Managed cloud (per AWS region: `prod`, `prod-eu`, future regions)**: a KubeBlocks-managed `QdrantCluster`
  with `replicas: 3`, `replicationFactor: 2` (matching the requirement already documented for self-host in
  §2, applied consistently rather than inventing a separate number for managed cloud), backed by EBS-backed
  persistent volumes, one cluster per region, composing with the existing residency Tier B per-region
  routing (`ORCHESTRATOR_RESIDENCY_REGION_QDRANT_URLS`) unchanged, each region's URL now points at that
  region's KubeBlocks-managed endpoint instead of a single pod.
- **Self-hosted Enterprise (P4 HA profile)**: the same `QdrantCluster` shape, deployed by the customer's own
  cluster operator via the KubeBlocks addon, satisfying the requirements already stated in
  `values-selfhost-ha.yaml:108-113` exactly, this plan is the concrete "how" for numbers that document
  already committed to.
- **Dev/staging**: unchanged, a single-node Qdrant remains appropriate there, HA is a production and
  Enterprise-self-host concern, not a lower-environment one.

### 4.2 Backup and disaster recovery

- KubeBlocks' backup orchestration integrates with the same object-storage backend already used for
  Postgres WAL archiving (per the self-host DR runbook's PITR pattern), giving Qdrant collection snapshots a
  restore path that didn't exist before this plan, today a lost single-node Qdrant has no documented
  recovery procedure at all.
- Recovery point/time objectives for Qdrant are defined alongside the existing Postgres RPO/RTO figures in
  `Actrone_Self_Hosting_DR_Runbook.md` (updated as part of this plan, §9), not left as a silent gap in that
  document.

### 4.3 Observability

- KubeBlocks exposes Prometheus-compatible metrics per its standard addon pattern; wired into the same
  Grafana/Alertmanager stack already used for the rest of the platform (per the existing observability
  build, `observability-db-replicas` memory), not a separate monitoring path.

### 4.4 No change to application code

- The orchestrator continues reading `ORCHESTRATOR_QDRANT_URL`/`_API_KEY` exactly as today; a KubeBlocks-managed
  cluster exposes a standard Qdrant-compatible endpoint, so `internal/semcache` and the memory layer's Qdrant
  client code require zero changes. This is purely an infrastructure-layer upgrade.

---

## 5. Data model & migrations

- **No application schema changes.** This is an infrastructure change; Qdrant collection schemas are
  unaffected.
- **One real migration concern**: moving an existing single-node collection's data onto the new
  KubeBlocks-managed, replicated cluster needs a one-time snapshot-and-restore (or dual-write cutover)
  rather than an in-place conversion, sized and sequenced in §9, not assumed to be a zero-downtime flip on
  day one.

---

## 6. Backend architecture

- **New Terraform**: `infra/terraform/modules/qdrant/` (finally created, closing the gap named in §0.2 and
  §2), installing the KubeBlocks operator (if not already cluster-wide) plus a `QdrantCluster` custom
  resource per region, mirroring how `modules/rds` and `modules/elasticache` are structured today for
  consistency with the existing module conventions.
- **Self-host**: a documented addition to `infra/helm/actrone/values-selfhost-ha.yaml`'s `externalQdrant`
  block, naming KubeBlocks as the recommended provider (mirroring `provider: "cloudnative-pg"` and
  `provider: "valkey"`'s existing pattern exactly), plus install instructions in the self-host install guide.
- **No change to `internal/regionpool`, `internal/semcache`, or the memory layer's Qdrant client.** This
  plan is infrastructure-only, per §4.4.

---

## 7. Backward compatibility & rollout strategy

- **Managed cloud**: stand up the new KubeBlocks-managed cluster per region, migrate existing collection data
  onto it (§5), then cut the orchestrator's `ORCHESTRATOR_QDRANT_URL` over per region, one region at a time,
  `prod` first, `prod-eu` second, not simultaneously, so a problem in the first cutover doesn't affect both
  regions at once.
- **Self-host**: purely additive documentation and an optional install path; existing self-host installs
  running a single-node Qdrant are unaffected until an operator chooses to adopt the P4 HA profile.
- **No forced timeline on self-host customers.** Per the same discipline used in the RLS and MCP plans, this
  is a defense-in-depth and reliability upgrade, not a breaking change anyone is forced onto by a deadline.

---

## 8. Testing strategy

| Layer | Coverage |
| --- | --- |
| **Failover** | Kill one node of a three-node `QdrantCluster` under active load; assert queries continue succeeding (replication factor ≥2 means at least one other replica holds every shard) and the cluster self-heals when the node returns. |
| **Backup/restore** | A collection snapshot is taken, the cluster is destroyed and recreated, the snapshot is restored, and query results are asserted identical before/after, proving the DR path (§4.2) actually works, not just that it's configured. |
| **Multi-region routing composition** | With Tier B routing active (`ORCHESTRATOR_RESIDENCY_REGION_QDRANT_URLS` pointing at the new per-region clusters), a tenant pinned to `prod-eu` is confirmed to read/write only the EU cluster, and a node failure in `prod-eu` does not affect `prod`'s availability. |
| **Migration correctness** | The one-time snapshot-and-restore cutover (§5) is tested against a non-trivial collection (real embedding dimensionality, realistic row count) with before/after vector-search result parity asserted, not just a row-count match. |
| **Observability** | KubeBlocks' exposed metrics are confirmed visible in the existing Grafana stack and a simulated node-down condition triggers the expected alert, not a silent gap in paging. |
| **CI/infra gates** | `terraform validate`/`plan` clean for the new `modules/qdrant`; Helm chart lint clean for the self-host `values-selfhost-ha.yaml` addition. |

---

## 9. Phased delivery

- **Phase 0: Confirm the current production topology precisely.** This plan's research found no IaC
  defining Qdrant's current replica count; before building the replacement, confirm exactly what's running
  today (single node vs. some undocumented manual configuration) so the migration in Phase 2 is sized
  correctly, not assumed. *Exit:* current topology documented, closing the ambiguity §2 leaves open.
- **Phase 1: Build `modules/qdrant` + the KubeBlocks operator install, land in `dev` first.** No production
  cutover yet; prove the operator, the `QdrantCluster` CRD shape, and the backup path work correctly in a
  low-stakes environment. *Exit:* a `dev` KubeBlocks-managed Qdrant cluster passes the failover and
  backup/restore tests (§8).
- **Phase 2: Managed-cloud cutover, `prod` first, `prod-eu` second.** Snapshot-and-restore migration (§5),
  one region at a time, with the old single-node instance kept available as a rollback target until the new
  cluster is confirmed healthy under real traffic. *Exit:* both regions running on the new HA cluster; old
  single-node instances decommissioned.
- **Phase 3: Self-host documentation + install path.** Update `values-selfhost-ha.yaml`'s `externalQdrant`
  block and the self-host install guide with the KubeBlocks-based path. *Exit:* a self-host Enterprise
  install following the P4 HA profile has a concrete, named way to satisfy the Qdrant HA requirement that
  already existed on paper.
- **Phase 4: DR runbook update.** Fold Qdrant's RPO/RTO into `Actrone_Self_Hosting_DR_Runbook.md` alongside
  the existing Postgres figures (§4.2), closing the silent gap where Qdrant recovery had no documented
  procedure at all.

---

## 10. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| **The one-time data migration (single-node → replicated cluster) loses or corrupts vectors mid-cutover** | Snapshot-and-restore with the old instance kept live as a rollback target until the new cluster is verified (§7, §9 Phase 2); the migration-correctness test (§8) asserts vector-search result parity, not just a row count, before any cutover is considered complete. |
| **KubeBlocks' Qdrant addon is less battle-tested in production than CloudNativePG is for Postgres, being a newer/narrower use case** | Acknowledged directly in §3, this is a real, honest tradeoff, mitigated by starting in `dev` (Phase 1) before any production cutover, and by the failover/backup tests (§8) being required to pass before Phase 2 begins, not treated as optional validation. |
| **Adding a general-purpose multi-engine operator (KubeBlocks) to the cluster, even scoped to Qdrant only, increases the platform's operational surface** | Scope is explicitly limited to Qdrant in this plan (§3); no other engine's operator changes, so the added surface is one new controller, not a wholesale platform migration. |
| **Self-host operators ignore the new documented path and keep running unreplicated Qdrant anyway** | Same posture as RLS and MCP: this is a defense-in-depth and reliability upgrade offered and documented, not force-migrated onto existing installs (§7); it closes the gap for anyone following the P4 HA profile going forward. |
| **Phase 0 finds the current production topology is more (or less) resilient than assumed, invalidating the migration sizing in Phase 2** | Phase 0 is deliberately sequenced first and treated as a real prerequisite, not skipped, exactly because this plan's own research could not confirm the current state from the repository alone. |

---

## 11. Open decisions

1. **Exact replica count and resource sizing for managed-cloud production**, beyond the
   `replicas: 3`/`replicationFactor: 2` figure this plan reuses from the already-documented self-host
   requirement. Real production query volume and collection size should inform final sizing, not an
   assumption carried over from a different deployment context.
2. **Whether KubeBlocks is installed cluster-wide (available for future engines) or scoped narrowly to only
   the Qdrant addon at install time.** §3 deliberately scopes this plan's *usage* to Qdrant only, but the
   install-time decision of how much of KubeBlocks' surface to enable is a separate, smaller decision worth
   confirming explicitly rather than defaulting silently either way.
3. **Timing of the `prod` cutover relative to other in-flight infra work** (e.g. the Postgres write-scaling
   tenant-sharding rollout), to avoid stacking two significant data-plane changes in the same window without
   a deliberate decision to do so.

---

## 12. Definition of done

- `infra/terraform/modules/qdrant/` exists, `terraform validate`/`plan` clean, and stands up a
  KubeBlocks-managed `QdrantCluster` with the topology decided in §11.1.
- Failover test (§8) passes: a single node loss under active load causes no query failures and the cluster
  self-heals.
- Backup/restore test (§8) passes against a real, non-trivial collection, with vector-search result parity
  confirmed, not just successful restore.
- Managed cloud `prod` and `prod-eu` both cut over (§9 Phase 2), old single-node instances decommissioned,
  with the cutover done one region at a time per §7.
- `values-selfhost-ha.yaml`'s `externalQdrant` block names KubeBlocks as the recommended provider, matching
  the existing `provider:` pattern used for Postgres and Redis.
- `Actrone_Self_Hosting_DR_Runbook.md` includes Qdrant RPO/RTO alongside the existing Postgres figures.
- Multi-region residency routing (Tier B) confirmed working correctly against the new per-region clusters.
- CI/infra gates green (`terraform validate`/`plan`, Helm lint).
- `progress.md` updated; the three open decisions (§11) resolved or explicitly left open, not silently
  dropped.

---

*Last updated: 2026-08-13 | Owner: Matt | Scope: new `infra/terraform/modules/qdrant/`,
`infra/helm/actrone/values-selfhost-ha.yaml` (`externalQdrant` block), `Actrone_Self_Hosting_DR_Runbook.md`
(Qdrant RPO/RTO addition), `infra/docs/Actrone_Self_Hosting_Install.md`. No change to application code
(`internal/semcache`, memory layer Qdrant client) or `internal/regionpool` routing logic. Depends on:
`Actrone_Data_Residency_Plan.md` (Tier B routing this plan's per-region clusters serve).*

## Sources

- [The Production-Grade Qdrant Operator for Kubernetes | KubeBlocks](https://kubeblocks.io/qdrant-operator)
- [Supported Addons | KubeBlocks](https://kubeblocks.io/docs/preview/user_docs/overview/supported-addons)
