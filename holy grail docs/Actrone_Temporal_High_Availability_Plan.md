# Actrone Temporal High-Availability & Reliability Plan (Production-Grade)

> Closes a critical, verified infrastructure gap: while Postgres (`modules/rds` Aurora Multi-AZ) and
> Redis (`modules/elasticache` clustered) have confirmed, codified high-availability configurations in
> Terraform, and Qdrant has an authored KubeBlocks HA plan (`Actrone_Qdrant_High_Availability_Plan.md`),
> **Temporal currently has no Terraform module, no dedicated production persistence cluster, and no
> codified multi-replica deployment in the repository.**
>
> This plan codifies the complete production-grade Temporal deployment for Actrone, fulfilling the
> requirements mandated in `infra/helm/actrone/values-selfhost-ha.yaml:77-91` and
> `infra/docs/Actrone_Deployment_Runbook.md:89-90`.

---

## 0. TL;DR

1. **Temporal is the mission-critical durable execution spine of Actrone.** Every native agent loop,
   BYOF harness activity, model distillation pipeline, voice session, and background reconciliation job
   depends on Temporal workflows. An outage or split-brain in Temporal halts all agent task execution.
2. **Current state: Temporal is unmanaged / dev-grade in-cluster.** `infra/docs/Actrone_Deployment_Runbook.md:89`
   references `modules/temporal` as an unchecked (`☐`) step, but the directory **does not exist** in
   `infra/terraform/modules/`. In local dev, `docker-compose.yml` runs `temporalio/auto-setup:1.24.2`
   (a single-node image explicitly banned for production in `values-selfhost-ha.yaml:78`).
3. **Temporal HA cannot be solved by KubeBlocks directly.** KubeBlocks is designed for databases and
   message brokers, not the Temporal server engine. Temporal HA is achieved via the official,
   battle-tested **`temporalio/temporal` Helm chart**, running independently scalable roles
   (`frontend`, `history`, `matching`, `worker`).
4. **Temporal requires its own dedicated, isolated persistence layer.** Sharing the primary customer
   Aurora database with Temporal risks cross-tenant IOPS contention during high task-throughput bursts.
   This plan provisions a dedicated Aurora PostgreSQL database cluster (or isolated schema/cluster)
   with continuous WAL archiving and automated failover.
5. **History shard count must be fixed at 512 at creation.** Temporal shard counts are immutable after
   namespace initialization. Sizing for enterprise scale from Day 1 is mandatory to prevent impossible
   live migration re-sharding down the line.

---

## 1. Motivation & Production Requirements

- **Zero Tolerance for Workflow State Loss:** Actrone promises durable execution, SAGA compensating
  transactions (GAL rollbacks), and Merkle-anchored audit ledgers. If Temporal loses history state or
  experiences split-brain, long-running agent workflows are corrupted.
- **KEDA Event-Driven Autoscaling Dependency:** Actrone’s BYOF worker harness pools
  (`infra/k8s/harness/scaledobject.yaml`) scale via KEDA directly on **Temporal Task Queue Depth**.
  If Temporal frontend or matching services experience latency or degradation, worker scaling breaks.
- **Strict Compliance & Zero-Egress Boundary:** Regulated buyers (fintech, healthcare) require
  in-cluster, mTLS-secured communication between the orchestrator, harness workers, and Temporal
  frontend.
- **Symmetric Architecture:** Self-hosted enterprise customers (`values-selfhost-ha.yaml`) and managed
  cloud (`prod`, `prod-eu`) must share the exact same deployment profile, differing only in who owns
  the underlying cloud infrastructure.

---

## 2. Current State vs. Target State (Verified from Code)

| Component | Current State (Codebase Audit) | Target Production State (This Plan) |
|---|---|---|
| **Terraform IaC** | `modules/temporal` referenced in runbook but missing | `infra/terraform/modules/temporal/` (dedicated Aurora DB + IAM/S3/KMS) |
| **Server Engine** | Single-node / ephemeral `auto-setup` container | Official `temporalio/temporal` Helm release with 4 distinct services |
| **Frontend Service** | 1 replica (Single Point of Failure) | **3 replicas** behind in-cluster headless Service + mTLS |
| **History Service** | 1 replica, default shards (4) | **3 replicas, 512 shards** (enterprise growth ready) |
| **Matching Service** | 1 replica | **3 replicas** with Raft task dispatch |
| **Internal Worker** | Embedded | **2 dedicated system worker replicas** |
| **Persistence Store** | Embedded SQLite or shared DB | **Dedicated Aurora PostgreSQL cluster** (`temporal_default` + `temporal_visibility`) |
| **Advanced Visibility** | Standard / basic | PostgreSQL-backed Advanced Visibility enabled |
| **Autoscaling** | None on server components | Horizontal Pod Autoscaling (HPA) on Frontend & Matching based on CPU/Memory/gRPC RPS |
| **Disruption Budgets** | None | `PodDisruptionBudget` (`minAvailable: 2`) on all roles |

---

## 3. Architecture & Topology

### 3.1 Role Sizing & Topology (Managed Cloud & Enterprise Self-Host)

```
                              ┌────────────────────────┐
                              │  Orchestrator / SDKs   │
                              │  BYOF Harness Workers  │
                              └───────────┬────────────┘
                                          │ gRPC (Port 7233, mTLS)
                                          ▼
                      ┌────────────────────────────────────────┐
                      │    temporal-frontend (3 Replicas)      │
                      │    - TLS / IAM / JWT Validation        │
                      │    - Rate Limiting & API Routing       │
                      └───────┬────────────────────────┬───────┘
                              │                        │
                              ▼                        ▼
        ┌───────────────────────────┐    ┌───────────────────────────┐
        │ temporal-history (3 Reps) │    │ temporal-matching (3 Reps)│
        │ - 512 Shards              │    │ - Task Queue Dispatch     │
        │ - State Machine Engine    │    │ - Scaled with KEDA        │
        └─────────────┬─────────────┘    └─────────────┬─────────────┘
                      │                                │
                      │   ┌────────────────────────┐   │
                      └──►│ temporal-worker (2 Rep)│◄──┘
                          │ - System Workflows     │
                          │ - Archival / Cleanup   │
                          └───────────┬────────────┘
                                      │
                                      ▼
             ┌───────────────────────────────────────────────────┐
             │       Dedicated Aurora PostgreSQL Cluster         │
             │   - temporal_default (Execution / History)        │
             │   - temporal_visibility (Advanced Search / Audit) │
             │   - Multi-AZ Writer + Reader (db.r8g.large)       │
             └───────────────────────────────────────────────────┘
```

### 3.2 Key Role Configuration Details

1. **`temporal-frontend` (3 Replicas):**
   - Handles inbound gRPC requests on `:7233` from Orchestrator and BYOF harness workers.
   - Resource allocation: `requests: {cpu: "500m", memory: "1Gi"}`, `limits: {cpu: "2", memory: "2Gi"}`.
   - HPA target: 70% CPU or 1,000 active gRPC connections.

2. **`temporal-history` (3 Replicas):**
   - Owns workflow state transitions and shard ownership.
   - **`numHistoryShards: 512`** explicitly configured during schema setup.
   - Resource allocation: `requests: {cpu: "1", memory: "2Gi"}`, `limits: {cpu: "4", memory: "4Gi"}`.

3. **`temporal-matching` (3 Replicas):**
   - Matches workflow tasks and activities with polling workers.
   - In-memory dispatch buffers; scales horizontally with task queue depth.
   - Resource allocation: `requests: {cpu: "500m", memory: "1Gi"}`, `limits: {cpu: "2", memory: "2Gi"}`.

4. **`temporal-worker` (2 Replicas):**
   - Runs internal system workflows (batch operations, retention enforcement, history archival).
   - Resource allocation: `requests: {cpu: "250m", memory: "512Mi"}`, `limits: {cpu: "1", memory: "1Gi"}`.

---

## 4. Persistence & Storage Architecture

### 4.1 Dedicated Aurora PostgreSQL Cluster
Temporal’s write patterns (high-frequency row updates on history shards and visibility indexes) must
not compete for IOPS with the core Actrone application database.

- **Engine:** Aurora PostgreSQL 16.x (Multi-AZ)
- **Instance Sizing:** `db.r8g.large` (2 vCPU / 16 GB RAM) writer + reader in production
- **Databases Provisioned:**
  1. `temporal` (Primary execution & history state)
  2. `temporal_visibility` (Advanced Visibility schema for indexed workflow search)
- **Encryption:** AWS KMS CMK envelope encryption (`aws_kms_key.temporal_rds`)
- **Automated Backup:** 30-day continuous backup window with Point-In-Time-Recovery (PITR)

### 4.2 History Archival to S3
For compliance and audit retention (SOC 2, ISO 27001), completed workflow histories exceeding the
standard active retention period (30 days in production) are automatically archived:
- **Bucket:** `actrone-temporal-archival-${data.aws_caller_identity.current.account_id}`
- **Lifecycle:** Tiered to S3 Glacier Flexible Retrieval after 90 days; deleted after 365 days (or retained indefinitely for Enterprise tenants).

---

## 5. Security & Network Policies

1. **mTLS via Linkerd / Native TLS:**
   - Communication between Orchestrator, BYOF harness pods, and Temporal frontend is encrypted via
     Linkerd mTLS or native TLS certificates managed by `cert-manager`.
2. **NetworkPolicy Egress/Ingress Isolation:**
   - `temporal-frontend` admits ingress **only** from pods tagged `app.kubernetes.io/name: orchestrator`
     or `actrone.com/component: harness-worker`.
   - `temporal-history`, `matching`, and `worker` have **zero public ingress** and communicate solely
     within the `temporal` namespace and with the database.
3. **RBAC & Namespace Isolation:**
   - Actrone uses multi-tenant namespaces (`default` for core runtime, isolated per-tenant namespaces for
     Enterprise single-tenant tiers).

---

## 6. Observability & Alerting

- **Prometheus Metrics:** Temporal server exports native Prometheus metrics on `:9090/metrics` across
  all four roles.
- **ServiceMonitor:** `infra/observability/prometheus/` deploys a `ServiceMonitor` targeting
  `app.kubernetes.io/part-of: temporal`.
- **Golden Signal Alerts:**
  - `TemporalFrontendLatencyHigh`: P99 request latency > 200ms for 5m (Paging alert)
  - `TemporalHistoryShardDrop`: Active shard count drops below 512 (Critical / P0)
  - `TemporalMatchingTaskBacklogHigh`: Task schedule-to-start latency > 2s (Warning)
  - `TemporalPersistenceErrorRate`: Database transaction failure rate > 0.1% (Critical)
  - `TemporalWorkflowExecutionFailureSpike`: Workflow failure rate > 5% over 15m window

---

## 7. Phased Implementation Plan

```
Phase 0: Architecture & Schema Spec
  │  Confirm 512 shards, Aurora r8g sizing, and temporalio/temporal chart v0.40+ compatibility.
  ▼
Phase 1: Terraform Module & Persistence
  │  Create `infra/terraform/modules/temporal/` (RDS Aurora + KMS + S3 archival + IAM).
  │  Apply to `dev` environment.
  ▼
Phase 2: Helm Release & GitOps in Dev
  │  Deploy `temporalio/temporal` via ArgoCD (`infra/argocd/apps/temporal.yaml`).
  │  Run schema migration jobs (`temporal-sql-tool`).
  │  Validate KEDA autoscaling and Orchestrator task execution.
  ▼
Phase 3: Production & Prod-EU Deployment
  │  Apply Terraform in `prod` and `prod-eu`.
  │  Run full multi-replica HA failover tests (node drain, pod termination, DB failover).
  ▼
Phase 4: Runbook & Documentation
  │  Update `infra/docs/Actrone_Deployment_Runbook.md` (check off Step 3.5).
  │  Update `Actrone_Self_Hosting_DR_Runbook.md` with Temporal backup & restore procedures.
```

---

## 8. Definition of Done

- [ ] `infra/terraform/modules/temporal/` exists, passes `terraform validate` and `tflint`.
- [ ] Dedicated Aurora PostgreSQL cluster created and KMS encrypted for Temporal.
- [ ] Temporal server deployed with 4 independent roles (`frontend: 3`, `history: 3 (512 shards)`, `matching: 3`, `worker: 2`).
- [ ] Advanced Visibility enabled and backed by SQL/PostgreSQL schema.
- [ ] PodDisruptionBudgets (`minAvailable: 2`) configured for all frontend, history, and matching pods.
- [ ] Prometheus metrics scraped via ServiceMonitor and Grafana dashboard live in `infra/observability/`.
- [ ] Failover test passes: terminating 1 history node and 1 frontend node during an active agent workflow run causes zero workflow failures or data corruption.
- [ ] KEDA task queue depth scaler successfully triggers worker scaling from the live Temporal frontend.
- [ ] `infra/docs/Actrone_Deployment_Runbook.md` updated and verified against `prod`.

---

*Owner: Matt | Engineering Standards: `CLAUDE.md` | Precedence: `values-selfhost-ha.yaml` §externalTemporal*
