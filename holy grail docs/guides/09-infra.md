# Guide 09 — Infrastructure & Deployment

> **Status refreshed 2026-07-13 (code-verified) — MAJOR STALE CONTENT:** this guide predates the
> Linkerd mesh migration (Guide 05) and describes directory/module names that no longer match
> `infra/`. Verified against `infra/terraform/modules/eks/main.tf` and the actual `infra/` tree:
> **no `istio-system`/`spire` namespaces or charts exist** — real install order is
> `linkerd-crds` → `linkerd-control-plane` → `envoy-gateway` (3 `helm_release` resources, explicit
> `depends_on` chain, comment: "Linkerd over Istio+SPIRE — automatic, zero-config mTLS with its own
> CA... no SPIRE control plane to operate. East-west mTLS is Linkerd; north-south edge is Envoy
> Gateway (Gateway API), which fronts the ext-authz brain"). The OIDC provider (`aws_iam_openid_connect_provider`)
> is now for **IRSA only**, not SPIRE JWT-SVID validation. Real `infra/helm/actrone/charts/` entries:
> `browserpool, control-tower, egress-proxy, ext-authz, gateway, harness-pool, linkerd, marketplace,
> nats, orchestrator, sentry-relay, voiceagent` — no `istio/`, `spire/`, or dedicated `temporal/`
> chart directory (Temporal is presumably an external/managed dependency, not re-verified this pass).
> Real `infra/terraform/modules/`: `cloudfront-fargate-site, cloudwatch-metrics, eks, elasticache,
> media-pipeline, rds, regional-data-plane, regional-edge-dns, vpc` — no standalone `redis/` or `iam/`
> module (ElastiCache is `elasticache/`, not `redis/`). Real `infra/terraform/envs/`: `dev, prod,
> prod-eu, staging` — not `environments/staging` + `environments/production`. Also: Clerk secret refs
> (`clerk-secret-key`, `ORCHESTRATOR_AUTH_CLERK_SECRET_KEY`) are stale — see Guide 02 for the current
> `ORCHESTRATOR_AUTH_WORKOS_*` / `ORCHESTRATOR_AUTH_OIDC_*` env vars. Sections below are corrected for
> the mesh/edge architecture and directory names; exact Helm values, CI YAML, and kubectl command
> details were not re-run against a live cluster this pass (unverified 2026-07-13 unless cited above).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AWS Account                                 │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    EKS Cluster                               │   │
│  │                                                              │   │
│  │  Namespaces (corrected 2026-07-13 — no istio-system/spire):   │   │
│  │    actrone-core    ← orchestrator, nats, postgres, redis,    │   │
│  │                       qdrant, temporal, sentry-relay         │   │
│  │                       (linkerd.io/inject: enabled)           │   │
│  │    linkerd          ← linkerd-crds, linkerd-control-plane    │   │
│  │    envoy-gateway-system ← Envoy Gateway (north-south edge,   │   │
│  │                       fronts the ext-authz brain)            │   │
│  │    monitoring      ← prometheus, grafana                     │   │
│  │    kube-system     ← coredns, aws-load-balancer-controller   │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  RDS PostgreSQL 16   ← production database (Multi-AZ)              │
│  ElastiCache Redis   ← L1 memory cache                             │
│  S3                  ← agent file storage, log archives            │
│  ACM                 ← TLS certificates for ALB                    │
│  Route 53            ← DNS (api.actrone.com, app.actrone.com)        │
│  IRSA                ← Pod IAM roles (no long-lived creds)         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Repository Layout

```
infra/                          ← corrected 2026-07-13 against the actual infra/ tree
  terraform/
    modules/
      eks/                    ← EKS cluster, node groups, IRSA, OIDC provider, Linkerd + Envoy Gateway installs
      rds/                    ← PostgreSQL RDS
      elasticache/            ← ElastiCache (not "redis/")
      vpc/                    ← Networking
      cloudfront-fargate-site/, cloudwatch-metrics/, media-pipeline/,
      regional-data-plane/, regional-edge-dns/   ← other real modules; no standalone "iam/" module
    envs/                     ← "envs/", not "environments/"
      dev/  staging/  prod/  prod-eu/
    main.tf
    variables.tf
    outputs.tf

  helm/actrone/
    Chart.yaml
    values.yaml               ← Shared defaults
    values-staging.yaml       ← Staging overrides
    values-production.yaml    ← Production overrides
    charts/                   ← real entries: browserpool, control-tower, egress-proxy, ext-authz,
                                 gateway, harness-pool, linkerd, marketplace, nats, orchestrator,
                                 sentry-relay, voiceagent — no istio/ or spire/ directories
      orchestrator/           ← Go service deployment
      nats/                   ← NATS JetStream cluster
      linkerd/                ← Mesh policy: Server + AuthorizationPolicy + MeshTLSAuthentication
                                 (replaces the retired istio/ + spire/ charts — Guide 05)
      gateway/, ext-authz/    ← North-south edge: Envoy Gateway + the Go ext_authz brain (P6-A)
      sentry-relay/           ← Self-hosted PII proxy
      temporal/               ← Temporal server (uses upstream chart)
```

---

## Helm Chart Structure

### Orchestrator Chart

```
charts/orchestrator/
  Chart.yaml
  templates/
    deployment.yaml        ← Main Go service pods
    service.yaml           ← ClusterIP for internal traffic
    ingress.yaml           ← ALB for external traffic
    networkpolicy.yaml     ← Allowlist ingress/egress
    hpa.yaml               ← Horizontal Pod Autoscaler
    poddisruptionbudget.yaml ← Minimum 2 pods during upgrades
    serviceaccount.yaml    ← IRSA-annotated service account
    configmap.yaml         ← Non-secret config (log level, feature toggles)
    secret.yaml            ← References external secret (ESO or Secrets Manager)
  values.yaml
```

**Deployment values (production):**

```yaml
# values-production.yaml

orchestrator:
  replicaCount: 3
  image:
    repository: <ECR_REGISTRY>/actrone/orchestrator
    tag: ""            # injected by CI: --set orchestrator.image.tag=$GIT_SHA

  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: 2000m
      memory: 2Gi

  env:
    ORCHESTRATOR_DATABASE_DSN:
      valueFrom:
        secretKeyRef:
          name: orchestrator-secrets
          key: database-dsn
    ORCHESTRATOR_AUTH_WORKOS_CLIENT_ID:
      valueFrom:
        secretKeyRef:
          name: orchestrator-secrets
          key: workos-client-id
    ORCHESTRATOR_AUTH_WORKOS_WEBHOOK_SECRET:
      valueFrom:
        secretKeyRef:
          name: orchestrator-secrets
          key: workos-webhook-secret

  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 20
    targetCPUUtilizationPercentage: 70

  podDisruptionBudget:
    minAvailable: 2
```

---

## Terraform Modules

### EKS Module

The EKS module provisions the cluster, configures IRSA (IAM Roles for Service Accounts), and installs
the **Linkerd + Envoy Gateway** Helm charts in dependency order. *(Corrected 2026-07-13: this
previously said "installs the OIDC provider for SPIRE, and deploys the Istio + SPIRE Helm charts" —
SPIRE and Istio were retired; the OIDC provider now serves IRSA only.)*

**Helm install order** — enforced by Terraform `depends_on` chains, not run by hand. Each `helm_release`
resource in `modules/eks/main.tf` references the previous via `depends_on = [helm_release.previous]`,
so a single `terraform apply` provisions them in this order (verified against the live file):

```
1. linkerd-crds          ← policy + proxy CRDs (Server/AuthorizationPolicy/…)
2. linkerd-control-plane ← identity (CA), destination, proxy-injector
3. envoy-gateway         ← north-south API gateway controller (Gateway API), fronts the ext-authz brain
```

**Key Terraform resources** (verified in `infra/terraform/modules/eks/main.tf`):

```hcl
# infra/terraform/modules/eks/main.tf (excerpt)

# OIDC provider — enables IRSA (pod IAM roles without node instance profiles). No longer feeds a
# SPIRE JWT-SVID issuer — SPIRE was retired with Istio.
resource "aws_iam_openid_connect_provider" "this" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.cluster_oidc.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

resource "helm_release" "linkerd_control_plane" {
  name       = "linkerd-control-plane"
  repository = "https://helm.linkerd.io/stable"
  chart      = "linkerd-control-plane"
  namespace  = "linkerd"
  # Trust anchor + issuer certificate are provisioned out-of-band by cert-manager into a
  # kubernetes.io/tls Secret — PEM material is never stored in Terraform state (CLAUDE.md §5.3).
  set { name = "identity.externalCA" value = "true" }
  set { name = "identity.issuer.scheme" value = "kubernetes.io/tls" }
  depends_on = [helm_release.linkerd_crds]
}

resource "helm_release" "envoy_gateway" {
  name       = "envoy-gateway"
  repository = "oci://docker.io/envoyproxy"
  chart      = "gateway-helm"
  namespace  = "envoy-gateway-system"
  depends_on = [helm_release.linkerd_control_plane]
}

# actrone-core namespace opts into the mesh via annotations, not a separate chart:
resource "kubernetes_namespace" "actrone_core" {
  metadata {
    name = "actrone-core"
    annotations = {
      "linkerd.io/inject"                        = "enabled"
      "config.linkerd.io/default-inbound-policy" = "deny"
    }
  }
  depends_on = [helm_release.linkerd_control_plane]
}
```

---

## Deploying a New Release

### CI/CD Flow

```
Push to main branch
       │
       ▼
GitHub Actions: ci.yml
  ├── go test -race ./...
  ├── golangci-lint run
  ├── govulncheck ./...
  ├── buf lint + buf breaking (proto)
  ├── npm run type-check
  ├── npm test
  └── npm audit

       │ (all pass)
       ▼
GitHub Actions: deploy.yml
  ├── docker buildx build --platform linux/amd64,linux/arm64
  │   └── pushes to ECR: <account>.dkr.ecr.eu-west-1.amazonaws.com/actrone/orchestrator:$GIT_SHA
  │
  ├── helm upgrade --install actrone ./infra/helm/actrone \
  │     --namespace actrone-core \
  │     --values values-production.yaml \
  │     --set orchestrator.image.tag=$GIT_SHA \
  │     --atomic \      ← rolls back automatically if pods don't become Ready
  │     --timeout 5m
  │
  └── Verify: kubectl rollout status deployment/orchestrator -n actrone-core
```

### Manual Rollout (Emergency)

```bash
# Roll back to the previous release
helm rollback actrone 0 --namespace actrone-core

# Roll back to a specific revision
helm history actrone --namespace actrone-core  # list revisions
helm rollback actrone 14 --namespace actrone-core

# Check what changed between revisions
helm get values actrone --namespace actrone-core --revision 14
helm get values actrone --namespace actrone-core --revision 15
```

---

## Managing Secrets

Secrets are stored in AWS Secrets Manager and synced to Kubernetes via External Secrets Operator (ESO).

```
AWS Secrets Manager:
  actrone/production/orchestrator   ← database-dsn, workos-client-id, workos-webhook-secret, nats-nkey, etc.
  actrone/production/nats           ← orchestratorNKeyPublic (Helm value)
  actrone/staging/orchestrator      ← (same keys, staging values)
```

**Creating or rotating a secret:**

```bash
# Update a single field in Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id actrone/production/orchestrator \
  --secret-string "$(aws secretsmanager get-secret-value \
    --secret-id actrone/production/orchestrator \
    --query SecretString --output text | \
    jq '.workos_webhook_secret = "newvalue"')"

# ESO syncs within 60 seconds (configured polling interval)
# Trigger immediate sync if needed:
kubectl annotate externalsecret orchestrator-secrets \
  force-sync=$(date +%s) --overwrite \
  -n actrone-core

# Pods pick up new secret on next restart:
kubectl rollout restart deployment/orchestrator -n actrone-core
```

**Never put secrets in:**
- `values.yaml` (committed to git)
- Dockerfile ENV instructions
- ConfigMaps (these are not secret)
- Pod environment literal values

---

## NATS JetStream Operations

```bash
# Check NATS cluster health
kubectl -n actrone-core exec -it nats-0 -- nats server report jetstream

# List streams
kubectl -n actrone-core exec -it nats-0 -- nats stream list

# Check consumer lag (analytics-bridge should be near 0)
kubectl -n actrone-core exec -it nats-0 -- nats consumer info ACTRONE analytics-bridge

# Purge a stream (DANGER — deletes all unprocessed messages)
# Only use if stream is stuck and you accept message loss
kubectl -n actrone-core exec -it nats-0 -- nats stream purge ACTRONE
```

**NATS account auth** — the orchestrator's NKey is injected via Helm from Secrets Manager. If authentication fails after a key rotation:

```bash
# Verify the NKey public key in the config matches the secret
kubectl -n actrone-core exec -it nats-0 -- cat /etc/nats/nats-server.conf | grep nkey
kubectl -n actrone-core get secret orchestrator-secrets -o jsonpath='{.data.nats-nkey}' | base64 -d
```

---

## Linkerd Mesh Operations

> Rewritten 2026-07-13 (was "Istio Ambient Mode Operations" — Istio/ztunnel/SPIRE were retired,
> Guide 05). Exact kubectl invocations below are illustrative of the Linkerd equivalents and were
> not run against a live cluster this pass (unverified 2026-07-13); command syntax may need
> adjustment.

```bash
# Verify the Linkerd control plane and proxy injector are healthy
kubectl -n linkerd get pods

# Check a pod has the linkerd-proxy sidecar injected
kubectl -n actrone-core get pods -o jsonpath='{.items[*].spec.containers[*].name}' | grep linkerd-proxy

# Verify the Linkerd CLI's own health check
linkerd check

# Verify Server + AuthorizationPolicy resources are applied
kubectl -n actrone-core get server,authorizationpolicy,meshtlsauthentication

# Check linkerd-proxy mTLS/traffic metrics for a pod
kubectl -n actrone-core exec -it <orchestrator-pod> -c linkerd-proxy -- \
  curl -s localhost:4191/metrics | grep tls
```

**If a pod can't communicate after deploy:**

1. Check the Linkerd control plane (`linkerd check`) and that the pod has a `linkerd-proxy` sidecar injected
2. Check the namespace carries `linkerd.io/inject: enabled` + `config.linkerd.io/default-inbound-policy: deny`
3. Check `AuthorizationPolicy`/`MeshTLSAuthentication` allow the source workload's mesh identity (`infra/helm/actrone/charts/linkerd/`)
4. Check NetworkPolicy allows the port

---

## Scaling

### Horizontal Pod Autoscaler

The orchestrator HPA scales on CPU. At high agent run volumes, NATS consumer lag and Temporal task queue depth are better signals — configure custom metrics via the Prometheus Adapter if needed.

```yaml
# Current HPA config (charts/orchestrator/templates/hpa.yaml)
spec:
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

**When to scale up manually** (before a known load event):

```bash
kubectl -n actrone-core scale deployment/orchestrator --replicas=10
```

**NATS** scales by adding replicas to the StatefulSet (maintain odd number for Raft quorum: 3, 5, 7).

**Temporal workers** are embedded in the orchestrator pod — scaling orchestrator pods scales Temporal workers.

---

## Database Operations

### Applying Migrations in Production

Migrations run as a Kubernetes Job before the new deployment rolls out.

```bash
# migrations/job.yaml runs goose up automatically in CI/CD
# For manual execution:
kubectl -n actrone-core run goose-migrate \
  --image=<ECR>/actrone/orchestrator:$GIT_SHA \
  --restart=Never \
  --env ORCHESTRATOR_DATABASE_DSN="$DSN" \
  -- goose -dir /migrations postgres "$ORCHESTRATOR_DATABASE_DSN" up

kubectl -n actrone-core wait --for=condition=complete pod/goose-migrate --timeout=5m
kubectl -n actrone-core logs goose-migrate
kubectl -n actrone-core delete pod goose-migrate
```

### Checking Migration Status

```bash
kubectl -n actrone-core run goose-status \
  --image=<ECR>/actrone/orchestrator:$GIT_SHA \
  --restart=Never \
  --env ORCHESTRATOR_DATABASE_DSN="$DSN" \
  -- goose -dir /migrations postgres "$ORCHESTRATOR_DATABASE_DSN" status
```

---

## Terraform Workflow

```bash
cd infra/terraform/environments/production

# Plan (shows what will change — always review before apply)
terraform plan -var-file=production.tfvars -out=plan.tfplan

# Apply
terraform apply plan.tfplan

# Targeted apply (single resource, use sparingly)
# -target cannot be combined with a saved plan file; produce a fresh targeted plan:
terraform plan  -target=module.eks.aws_eks_cluster.this -var-file=production.tfvars -out=targeted.tfplan
terraform apply targeted.tfplan
```

**State is stored in S3** with DynamoDB locking. Never apply from two terminals simultaneously.

**Terraform module update checklist:**
1. `terraform plan` in staging, verify no unexpected replacements (destroyed + created)
2. Apply to staging, run smoke tests
3. `terraform plan` in production
4. Apply to production during low-traffic window

---

## Kubernetes Cheatsheet

```bash
# Namespaced pod overview
kubectl -n actrone-core get pods -o wide

# Watch pod status during rollout
kubectl -n actrone-core rollout status deployment/orchestrator -w

# Tail orchestrator logs (all pods)
kubectl -n actrone-core logs -l app=orchestrator -f --max-log-requests=10

# Exec into a running pod
kubectl -n actrone-core exec -it <pod-name> -- /bin/sh

# Check resource usage
kubectl -n actrone-core top pods

# Describe a pod (events, limits, mounts — useful for CrashLoopBackOff)
kubectl -n actrone-core describe pod <pod-name>

# Force restart all orchestrator pods (zero-downtime rolling restart)
kubectl -n actrone-core rollout restart deployment/orchestrator

# Check all events in namespace (sorted by time)
kubectl -n actrone-core get events --sort-by='.lastTimestamp'
```
