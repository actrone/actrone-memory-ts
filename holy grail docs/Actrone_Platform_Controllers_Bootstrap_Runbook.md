# Actrone Platform Controllers — Bootstrap Runbook

> **Status:** install automation SHIPPED (2026-06-24); apply is a live-cluster operation.
> **Owner:** Matt. **Scope:** install the third-party controllers that P6-A (edge authz),
> P6-C (hosted deploy/build), and P6-D (harness pools) depend on, and wire the GitOps loop.
> **Companion runbooks:** [P6-A](./Actrone_P6A_Cluster_Rollout_Runbook.md) ·
> [P6-B build](./Actrone_P6B_Build_Rollout_Runbook.md) · [P6-C cluster](./Actrone_P6C_Cluster_Rollout_Runbook.md).
>
> **Status refreshed 2026-07-13 (code-verified):** the install **automation** is all present —
> `infra/terraform/modules/eks/{platform-controllers,karpenter}.tf` (cert-manager · External Secrets
> Operator · Argo CD · Karpenter `helm_release`s), `infra/argocd/*`, and `infra/scripts/
> bootstrap-platform.sh`. The apply itself is **still un-run against any live cluster**
> (`infra/docs/Actrone_Deployment_Runbook.md` 2026-07-12 reports the controller install +
> GitOps wiring as not-done; no `.tfstate` in the checkout). §8 (EU data-plane) and §9
> (observability keystone) remain operator/apply-gated as written. No inline corrections needed —
> this note reconfirms "automation is code; apply is live-cluster and still pending."

---

## 0. What was missing, and what this delivers

The orchestrator code (`internal/{extauthz,gatewaytrust,bundle,registry,build,buildflow,ecr,objectstore,codeintake,dataplane}`),
the Helm charts (`infra/helm/actrone/charts/{ext-authz,gateway,linkerd,harness-pool}`), and
the k8s manifests (`infra/k8s/{cert-manager,harness,build}`) are **all built and green**.
They depend on a set of **third-party controllers** that were documented as "cluster-only
rollout steps" but never installed. KEDA, Linkerd (crds + control-plane), and Envoy
Gateway were already in Terraform; the gap was **cert-manager, External Secrets Operator,
Karpenter, and Argo CD**, plus the GitOps wiring the orchestrator's reconciler targets.

This runbook + the new automation close that gap:

| Artifact | Purpose |
|---|---|
| `terraform/modules/eks/platform-controllers.tf` | cert-manager · External Secrets Operator · Argo CD `helm_release`s |
| `terraform/modules/eks/karpenter.tf` | Karpenter controller IRSA + canonical v1 policy + interruption SQS/EventBridge + subnet/SG discovery tags + `helm_release` |
| `terraform/envs/*/main.tf` | re-exported data-plane outputs (SG ids, IRSA role ARNs) the manifests interpolate |
| `argocd/{projects,orchestrator-rbac,root-app}.yaml` + `argocd/apps/*` | AppProjects, the orchestrator's `applications.argoproj.io` write-RBAC, and the App-of-Apps |
| `scripts/bootstrap-platform.sh` | one-command, idempotent, ordered install + verification |

Everything is declarative and idempotent. **This document does not run anything** — the
cluster is private and these are live operations; run the script from inside the VPC.

---

## 1. Prerequisites

- The EKS cluster already exists (`terraform apply` of the env created the VPC + cluster +
  the data-plane Fargate/IRSA/S3 from `harness-dataplane.tf` / `build-dataplane.tf` /
  `build-source-store.tf`). This runbook installs the **controllers** onto it.
- `terraform`, `kubectl`, `helm`, and the `aws` CLI on PATH; AWS creds for the account.
- **Network reachability to the EKS API server** — it is `endpoint_public_access = false`,
  so run from a bastion / VPN / in-VPC CI runner. `aws eks update-kubeconfig --name <cluster>`.
- The VPC CNI add-on already has `ENABLE_POD_ENI=true` + `enableNetworkPolicy=true`
  (set in `main.tf` `aws_eks_addon.this`) — required for the SecurityGroupPolicies.

---

## 2. One-command bootstrap

```bash
cd infra
ACTRONE_ENV=dev scripts/bootstrap-platform.sh
```

The script runs six ordered phases (each re-runnable):

1. **cert-manager** — targeted `terraform apply` of `helm_release.cert_manager`. It must
   precede the Linkerd control plane, whose identity issuer reads a `kubernetes.io/tls`
   Secret cert-manager mints.
2. **Trust anchor + identity issuer** — `kubectl apply -k k8s/cert-manager` creates the
   `linkerd-trust-anchor` + `linkerd-identity-issuer` Certificates; the script waits for the
   `linkerd-identity-issuer` Secret in the `linkerd` namespace.
3. **Full `terraform apply`** — converges everything else: External Secrets Operator, Argo CD,
   Karpenter (IAM + SQS + controller), and the pre-existing Linkerd control plane + Envoy
   Gateway + KEDA (the issuer Secret now exists, so Linkerd installs cleanly).
4. **Data-plane manifests** — applies the harness/build namespace bases, then renders the
   placeholder-bearing manifests from `terraform output` (Karpenter warm pool ←`cluster`,
   the baseline SecurityGroupPolicies ←`*_egress_security_group_id`, the build/ESO service
   accounts ←IRSA role ARNs) and applies them. The optional EC2 build-burst pool is gated by
   `ACTRONE_BUILD_EC2_POOL=true` (Fargate microVM is the default for builds).
5. **GitOps wiring** — `argocd/projects.yaml` (AppProjects `actrone-platform` +
   `actrone-harness`), `argocd/orchestrator-rbac.yaml` (the orchestrator's namespaced
   write-RBAC on `applications.argoproj.io` in `argocd`), and `argocd/root-app.yaml`
   (App-of-Apps → `argocd/apps/`).
6. **Verification** — asserts every controller Deployment, the Karpenter NodePool, the
   AppProject, the orchestrator RBAC, and the App-of-Apps are present.

Re-run any time: `scripts/bootstrap-platform.sh --verify-only` (checks only) or
`--skip-terraform` (re-apply just the k8s + GitOps layers).

---

## 3. Manual / phased path (for review-before-apply shops)

```bash
cd infra/terraform/envs/dev
terraform init

# Phase 1 — cert-manager first (review the plan)
terraform plan  -target=module.eks.helm_release.cert_manager
terraform apply -target=module.eks.helm_release.cert_manager

# Phase 2 — mint the Linkerd identity issuer
kubectl apply -k ../../../k8s/cert-manager
kubectl -n linkerd get secret linkerd-identity-issuer   # wait until present

# Phase 3 — everything else (REVIEW the Karpenter IAM in this plan)
terraform plan      # scrutinise aws_iam_role_policy.karpenter_controller
terraform apply

# Phases 4–5 — data plane + GitOps (or just: scripts/bootstrap-platform.sh --skip-terraform)
```

> **Review the Karpenter controller IAM** (`data.aws_iam_policy_document.karpenter_controller`)
> against your account before the first apply. It mirrors the upstream Karpenter v1
> getting-started policy; the scoping conditions confine it to this cluster's tagged
> resources and the single node role it may pass to EC2.

---

## 4. Design notes & decisions

- **Node authorization, the cheap way.** Karpenter reuses the existing `<cluster>-node-role`
  (the EC2NodeClass `role:` field), which the managed node group already authorized to join
  the cluster. So **no `authentication_mode` change and no new access entry** — the
  lowest-risk wiring. Karpenter manages the instance profile for that role itself (the
  scoped `iam:*InstanceProfile` actions are in the controller policy).
- **Provider inheritance.** The new `helm_release`/`kubernetes_*` resources inherit the
  default `helm`/`kubernetes` providers — identical to the existing keda/linkerd/envoy
  releases — which resolve to the operator's current kubeconfig context. No new provider
  blocks; run `aws eks update-kubeconfig` first.
- **GitOps boundary.** The **static** platform (the umbrella chart) is GitOps-managed by the
  App-of-Apps. The **dynamic** per-tenant harness pools are NOT in that tree — the
  orchestrator's `dataplane` reconciler writes one `Application` per pool under the
  `actrone-harness` project, so a pool teardown is never fought by App-of-Apps self-heal.
- **Least-privilege RBAC.** The orchestrator gets a namespaced `Role` in `argocd` on
  `applications.argoproj.io` only. Set `orchestrator.serviceAccount.name: actrone-orchestrator`
  in the umbrella values so the SA matches the RoleBinding subject (or edit the subject).

### 4.1 The `gateway_trust_secret` (P6-A edge ↔ orchestrator trust)

The ext-authz brain signs the trusted internal identity header with a shared HMAC key
(`internal/gatewaytrust`); the orchestrator verifies it (`AuthConfig.GatewayTrust`,
`ORCHESTRATOR_AUTH_GATEWAY_TRUST_SECRET`, **default OFF / fail-closed**). Provision the
shared secret **once**, available to BOTH the `ext-authz` and `orchestrator` deployments —
never log it, never bake it into an image (CLAUDE.md §5.3):

```bash
# Generate a 256-bit key and store it in the secret manager ESO reads (preferred), e.g.:
openssl rand -base64 32 | \
  aws secretsmanager create-secret --name actrone/<env>/gateway-trust-secret --secret-string file:///dev/stdin
```

Then add an `ExternalSecret` (in `actrone-core`) that materialises it as a Kubernetes
Secret, and reference it from both charts: `extAuthz.gatewayTrust.secretName` and
`orchestrator.env.ORCHESTRATOR_AUTH_GATEWAY_TRUST_SECRET` (valueFrom secretKeyRef). Flip
`AuthConfig.GatewayTrust.Enabled` on **only after** both sides carry the same key —
until then the orchestrator keeps doing full JWKS validation (no trust shortcut), so
enabling the edge is non-breaking. Rotate by writing a new version and rolling both
deployments.

---

## 5. Verification

```bash
scripts/bootstrap-platform.sh --verify-only
# or, individually:
kubectl -n cert-manager      get deploy cert-manager
kubectl -n external-secrets  get deploy external-secrets
kubectl -n kube-system       get deploy karpenter
kubectl -n argocd            get deploy argocd-server
kubectl -n linkerd           get deploy linkerd-destination
kubectl -n envoy-gateway-system get deploy envoy-gateway
kubectl get nodepool harness-warm
kubectl -n argocd get appproject actrone-harness
kubectl -n argocd get application actrone-root
```

A green pool end-to-end: promote a hosted agent → the orchestrator writes a
`harness-<env>-<tenant>-<agent>` Application into `argocd` → Argo CD syncs the harness-pool
chart into `actrone-harness` → KEDA scales it on the tenant's Temporal queue depth →
Karpenter provisions a node if needed → the pod is egress-locked by the baseline
SecurityGroupPolicy. Verify the Application reaches `Synced/Healthy`.

---

## 6. Rollback

Each layer is independently reversible:

- **GitOps:** `kubectl -n argocd delete application actrone-root` (App-of-Apps) — leaves the
  running platform; remove individual apps to converge them away.
- **Karpenter:** `terraform destroy -target=module.eks.helm_release.karpenter` stops new
  provisioning; existing Karpenter nodes drain via the NodePool `disruption` policy or
  `kubectl delete nodeclaim --all`.
- **A controller:** `terraform destroy -target=module.eks.helm_release.<name>`; cert-manager
  last (the Linkerd issuer depends on it).
- All controller installs are `atomic = true`, so a failed `helm` upgrade rolls itself back.

---

## 7. Helm umbrella chart — render/deploy notes (2026-06-24)

The umbrella chart (`infra/helm/actrone`) now renders and lints cleanly. Four pre-existing
blockers were fixed so `helm template` / `helm lint` work end-to-end:

- **`charts/nats` completed.** Was a dangling `conf/` with no `Chart.yaml` (helm auto-discovers
  every dir under `charts/` and failed to unpack it). Now a proper subchart — the
  `nats-server.conf` renders to a ConfigMap (NKey + cluster-route namespace interpolated) and
  a 3-node JetStream StatefulSet + headless Service + PDB mount it. **`nats.enabled: false`**
  by default (BYO managed NATS via `terraform/modules/nats`; enable for an in-cluster cluster,
  and set `nats.orchestratorNKeyPublic`).
- **`charts/sentry-relay` completed.** Same defect (no `Chart.yaml`). Now a Deployment +
  Service + ConfigMap (the PII-scrubbing Relay config) + PDB. **`sentry-relay.enabled: false`**
  by default; enable to route Sentry through the in-cluster Relay and point `SENTRY_DSN` at
  `http://sentry-relay:3000/api/<project>/…`.
- **Dead `secret.yaml` checksum removed** from the orchestrator Deployment — it included a
  template that never existed (the orchestrator's secrets come from a pre-existing
  `orchestrator-secrets` Secret via External Secrets, so there is nothing chart-local to
  checksum). Rotation-driven rollout is an External-Secrets / reloader concern.
- **`mcp-runner` + `harness-pool` gated off.** These are per-instance RUNTIME template charts
  (empty `image.repository` + `required` guards — the orchestrator renders them on demand per
  MCP-server / per BYOF pool), not umbrella components. Declared with `condition: <name>.enabled`
  default **false** so the umbrella skips them.

**Before `helm template`/`install`/`lint` of the umbrella:** run `helm dependency build
infra/helm/actrone` to vendor the external Bitnami `postgresql`/`redis` charts. Both are
`condition`-gated **off** by default (prod uses external RDS/ElastiCache — `postgresql.enabled`
and `redis.enabled` stay false), but helm still needs the dependency present to load the chart.
Bitnami's public `charts.bitnami.com/bitnami` index is being deprecated upstream; if the fetch
fails, mirror the charts (or the bitnamicharts OCI registry) and update the `repository` in
`Chart.yaml`. CI's `helm lint` step (see infra `README.md`) must run `helm dependency build`
first for the same reason.

---

## 8. Data residency (P2) — EU data-plane operator rollout

The **app-layer** residency enforcement and the **IaC** are shipped and verified
(`internal/residency`, the model-endpoint gate, the `RequireRegion` guard, `terraform/envs/prod-eu`,
`helm/actrone/values-eu.yaml`). What remains is **operator/infra-apply only** — the orchestrator
keeps EU dormant and non-claimable until these run, so there is no false EU residency claim in
the interim (honest-labelling rule, Data Residency Plan §3).

1. **Bootstrap the EU state backend** (now CODIFIED in `terraform/bootstrap`): the `aws.eu`
   provider creates the `actrone-terraform-state-prod-eu` bucket + `actrone-terraform-locks-eu`
   table + `alias/actrone-terraform-state-prod-eu` KMS key in `eu-west-1`, so re-applying the
   bootstrap root provisions them alongside the us backends (single-account topology; a separate
   EU account runs a second bootstrap under EU creds). Then stand up the plane:

   ```bash
   cd terraform/bootstrap && terraform apply        # now also creates the eu-west-1 state backend
   cd ../envs/prod-eu && terraform init && terraform apply   # VPC + EKS + Aurora + Redis, eu-west-1
   ```

   `prod-eu` is now a thin caller of `modules/regional-data-plane` (sizing `standard`); a NEW
   region is a sibling root that changes only region/CIDR/sizing — see the module README. Aurora
   keeps backups in-region (no cross-region snapshot copy) — EU customer data never leaves
   eu-west-1. (`make plan ENV=prod-eu` / `make apply ENV=prod-eu` mirror these.)
2. **Install controllers on the EU cluster:** `ACTRONE_ENV=prod-eu scripts/bootstrap-platform.sh`
   (§2), after `aws eks update-kubeconfig --name actrone-prod-eu`.
3. **Provision `orchestrator-secrets-eu`** via External Secrets in the EU cluster — apply
   `k8s/orchestrator/10-eso-orchestrator-secrets-eu.example.yaml` (substitute the release
   namespace). Its `ClusterSecretStore` reads AWS Secrets Manager in `eu-west-1` (credential
   material stays in-region) and materialises the Secret from the EU Aurora/Redis/Temporal DSNs
   (`terraform output` from prod-eu); extend the key list to match the full us `orchestrator-secrets`.
4. **(Optional) wire the EU CI pipeline** so prod-eu plans/applies through GitHub Actions like
   the us envs (single-account only): populate `eu_environments` in `terraform/cicd` (from
   `cd terraform/envs/prod-eu && terraform output vpc_id private_subnet_ids
   eks_cluster_security_group_id`), `make cicd-apply`, authorise the new **eu-west-1** GitHub
   connection in the console, set repo Variables `TF_PLAN_ROLE_PROD_EU`/`TF_APPLY_ROLE_PROD_EU`/
   `RUNNER_PROJECT_PROD_EU` from the `eu_*` outputs, and create a GitHub Environment **prod-eu**
   with required reviewers. The `terraform-plan`/`terraform-apply` workflows already carry a
   guarded prod-eu job that activates once those Variables exist. Skip this step if EU is applied
   from a bastion with EU credentials.
5. **Deploy the umbrella with the EU overlay:**

   ```bash
   helm dependency build helm/actrone
   helm upgrade --install actrone-eu helm/actrone -f helm/actrone/values.yaml -f helm/actrone/values-eu.yaml
   ```

   `values-eu.yaml` pins `orchestrator.residency.homeRegion=eu` (the `RequireRegion` guard now
   admits only EU tenants), `availableRegions=eu` (EU becomes claimable), the `regionEndpoints`
   map, and `eu.api`/`eu.app` hosts.
6. **Edge routing (DNS + public TLS):** set `hosted_zone_id` on the prod-eu root → it creates the
   `regional-edge-dns` IRSA roles (`external_dns_role_arn`, `cert_manager_role_arn` outputs). Apply
   `k8s/edge/` (annotate the cert-manager SA + external-dns SA with those roles): cert-manager
   issues `actrone-tls` via ACME Route53 DNS-01, and external-dns publishes `eu.api`/`eu.app`/
   `eu.grpc` to Route53 from the gateway routes — no manual record edits. The **global→regional**
   apex policy (`api.actrone.com` → nearest plane, via Route53 latency/geo + health checks) is a
   ≥2-planes decision and stays uncodified (`k8s/edge/README.md`); the orchestrator `RequireRegion`
   guard (421 + correct-endpoint redirect) is the in-service backstop, not the primary router.
7. **Flip EU live (last):** with the plane serving traffic, EU is already claimable on the EU
   deployment via `availableRegions=eu`; keep the `regionEndpoints` map identical across planes.
   Do **not** mark EU available on any deployment whose data plane is not actually EU-resident.

**Still platform-engineering work (not operator), tracked in
[the Data Residency Plan](./Actrone_Data_Residency_Plan.md) (P2/P3):** managed-pool regional routing
(region-pin Actrone's own model pool per region); region-bound-backup / no-cross-region-failover
policy + alerting. The residency **attestation** report shipped 2026-06-25
(`GET /v1/privacy/residency/attestation` — its `in_region_data_plane` control reads `pass` only
once an EU-pinned org is served by this EU plane, so completing this rollout is what turns that
attestation green). The reverse-direction endpoint re-validation (re-check existing model endpoints
when a tenant tightens residency later) is a minor follow-up — both an endpoint's region and a
committed residency region are immutable, so the window is small.

## 9. Observability stack — Prometheus Operator + managed-service metrics

The Helm charts have always shipped `ServiceMonitor`s (`orchestrator`, `marketplace` —
`serviceMonitor.enabled: true`), but **no operator was installed to scrape them**, so they were
inert. This wires the prod observability path end to end.

1. **Install the monitoring stack (the keystone).** `argocd/apps/monitoring.yaml` installs
   **kube-prometheus-stack** (Prometheus Operator + Prometheus + Alertmanager + Grafana) into the
   `monitoring` namespace via the App-of-Apps — it lands automatically once the file is on the
   tracked branch (`root-app.yaml` recurses `argocd/apps/`). Its values set
   `serviceMonitorSelectorNilUsesHelmValues=false`, so the operator discovers ServiceMonitors in
   **every** namespace — activating the orchestrator + marketplace monitors at the same time. The
   `actrone-platform` AppProject was widened to allow the `prometheus-community` Helm repo as a
   source and the `monitoring` namespace as a destination (still least-privilege).

2. **Managed DB/cache metrics (Aurora + ElastiCache) via CloudWatch.** There is no pod to attach a
   `postgres_exporter`/`redis_exporter` sidecar to in prod (those are the dev compose stack's path),
   so an in-cluster **cloudwatch-exporter (YACE)** bridges CloudWatch → Prometheus:
   - `terraform apply` the env root → the `cloudwatch-metrics` module emits
     `cloudwatch_exporter_role_arn` (prod: `module.cloudwatch_metrics`; prod-eu and future regions:
     forwarded from `module.plane`). The role is read-only (CloudWatch metric reads + `tag:GetResources`).
   - Apply `k8s/observability/` into `monitoring`: substitute the role ARN in `00-` and the plane's
     region in `10-`, then `00-`→`40-`. The `40-` ServiceMonitor is scraped by the operator from step 1.
   - Self-host/dev parity: the `postgres-exporter` + `redis-exporter` services now ship in
     `backend/docker-compose.yml` and the `infra/observability/` overlay, with the matching
     Prometheus scrape jobs (`postgres`, `redis`) enabled.

   Cost discipline (per `k8s/observability/README.md`): single replica, 5-minute `GetMetricData`
   period — do not scale replicas or tighten the period without intent, both multiply CloudWatch spend.

---

*Last updated: 2026-06-25 · The install automation is code; the apply is a live-cluster
operation run from inside the VPC. Per-phase status: [Platform Evolution §0a](./Actrone_Platform_Evolution_Master_Plan.md#0a-implementation-status-verified-2026-06-24).*
