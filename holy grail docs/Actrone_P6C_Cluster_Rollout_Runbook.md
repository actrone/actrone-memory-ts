# P6-C Hosted-Agent Data Plane — Cluster Rollout Runbook

> **Audience:** Matt (platform operator).
> **Scope:** the cluster-bound steps to stand up the per-tenant BYOF-hosted agent
> **data plane** — Fargate-default worker pools, KEDA queue-depth autoscaling, and
> the EC2 + Karpenter + gVisor path for warm/dedicated pools. The control plane
> (`actrone deploy` → bundle digest-verify + scan → governed promote) is already
> **shipped**; this is the compute the verified image runs on.
>
> **Last updated:** 2026-06-21 · **Owner:** Matt · **Status:** chart + substrate built, cluster rollout pending
>
> **Status refreshed 2026-07-13 (code-verified):** still accurate. Confirmed present and
> code-complete: `infra/helm/actrone/charts/harness-pool`, `infra/terraform/modules/eks/
> {harness-dataplane,karpenter}.tf`, the pod-size catalogue `internal/domain/podsize.go`, and the
> §5 promote→pool reconciler `internal/dataplane` (default OFF, `ORCHESTRATOR_DATAPLANE_ENABLED`).
> The cluster steps (§2–§5: `terraform apply`, KEDA/Karpenter install, gVisor RuntimeClass,
> SecurityGroupPolicy, Argo CD wiring) are **still pending** — `infra/docs/
> Actrone_Deployment_Runbook.md` (2026-07-12) reports all of them not-done. No corrections needed to
> the body; this note reconfirms the code-complete/cluster-pending split holds.

---

## 0. What's already built vs. what this runbook covers

| Already in the repo (no action needed) | This runbook (needs you + a cluster) |
| --- | --- |
| `charts/harness-pool` — the per-tenant pool (Deployment + KEDA ScaledObject + NetworkPolicy + SA + PDB) | Install KEDA + create the Fargate profile (Terraform — review & apply) |
| Pod-size catalogue (`internal/domain/podsize.go`) — single source of truth | Install the Karpenter controller (IRSA role + node pass-role + interruption SQS) |
| `infra/k8s/harness/` — namespace, gVisor RuntimeClass, Karpenter pool manifests | Fill cluster-specific selectors in the Karpenter pools and `kubectl apply` |
| `harness-dataplane.tf` — Fargate exec role + profile + KEDA `helm_release` | Validate NetworkPolicy enforcement on Fargate (see the caveat in §4) |
| Hardened pod spec, egress allowlist, digest-pinned image, scale-to-zero | Wire the orchestrator to render/install a pool per promote (follow-up §5) |

**Security invariant to preserve:** the harness pod runs **arbitrary customer code**. Its only
permitted egress is the governed gateway + Temporal + DNS + the manifest's explicit allowlist;
the cloud metadata endpoint (169.254.169.254) is never reachable. Anything that weakens that
(disabling the NetworkPolicy, running without the sandboxed runtime on EC2) breaks the
"we can safely run your loop" guarantee. Fail closed.

---

## 1. Local tooling

Same as the [P6-A runbook §1](./Actrone_P6A_Cluster_Rollout_Runbook.md) (helm, terraform,
kubectl, kubeconform) plus an authenticated kubeconfig. No new tools.

---

## 2. Fargate-default substrate + KEDA (Terraform)

`infra/terraform/modules/eks/harness-dataplane.tf` provisions the Fargate pod-execution role, the
`actrone-harness` Fargate profile, and the KEDA control plane. Review and apply:

```powershell
terraform -chdir=infra/terraform/envs/dev plan  -var-file=dev.tfvars
terraform -chdir=infra/terraform/envs/dev apply -var-file=dev.tfvars
kubectl get fargateprofile -A
kubectl rollout status deploy/keda-operator -n keda
```

Then bootstrap the namespace + gVisor RuntimeClass (concrete, no placeholders):

```powershell
kubectl apply -k infra/k8s/harness
kubectl get ns actrone-harness -o yaml | findstr default-inbound-policy   # confirm default-deny
```

> **Why Fargate is the default:** harness pods are CPU/memory (model inference goes to the
> gateway, not the pod — Infra §4.2), so they need no GPU, and Fargate gives one microVM per pod
> (strong isolation for untrusted code) with clean per-pod GB-second billing. Free/Pro tenants
> provision no pod at all — hosting is a Scale/Enterprise capability (`TierMaxPodSize`).

---

## 3. Karpenter (EC2 warm/dedicated pools) — the deferred-from-Terraform step

The EC2 path (zero-cold-start warm pools and dedicated Enterprise nodes) needs the Karpenter
controller. Its IAM is environment-specific (a controller IRSA role, pass-role to the existing
`${cluster}-node-role`, and an EC2 spot-interruption SQS queue), which is why it is a runbook step
rather than unvalidated Terraform. Use the upstream-recommended install:

```powershell
# 1. Controller IAM + interruption queue — the documented Karpenter CloudFormation
#    stack (replace the cluster name); creates the controller role + node instance
#    profile binding + SQS queue + EventBridge rules.
$CLUSTER = "<cluster-name>"
curl -fsSL https://raw.githubusercontent.com/aws/karpenter-provider-aws/v1.0.6/website/content/en/preview/getting-started/getting-started-with-karpenter/cloudformation.yaml `
  -o karpenter-cfn.yaml
aws cloudformation deploy --stack-name "Karpenter-$CLUSTER" --template-file karpenter-cfn.yaml `
  --capabilities CAPABILITY_NAMED_IAM --parameter-overrides "ClusterName=$CLUSTER"

# 2. Tag the cluster subnets + node security group so the EC2NodeClass selectors resolve:
#    karpenter.sh/discovery = <cluster-name>   (on private subnets + node SG)

# 3. Install the controller (IRSA service account annotated with the role from step 1):
helm registry login public.ecr.aws
helm upgrade --install karpenter oci://public.ecr.aws/karpenter/karpenter --version 1.0.6 `
  --namespace karpenter --create-namespace `
  --set "settings.clusterName=$CLUSTER" `
  --set "settings.interruptionQueue=Karpenter-$CLUSTER" `
  --wait
```

Then fill the `<cluster-name>` discovery tags in `infra/k8s/harness/20-karpenter-warm-pool.yaml`
and apply (the kustomization deliberately excludes it until substituted):

```powershell
kubectl apply -f infra/k8s/harness/20-karpenter-warm-pool.yaml
```

> **gVisor:** the warm-pool `EC2NodeClass.userData` installs `runsc` + registers the containerd
> handler and labels the node `actrone.com/sandboxed-runtime=gvisor`, which the `gvisor`
> RuntimeClass nodeSelector requires. **Validate the `RUNSC_VER` against your pinned AL2023 AMI**
> before production — a node that fails to register `runsc` leaves gVisor pods `Pending`
> (fail-closed: they never run unsandboxed). For dedicated Enterprise pools, copy
> `30-karpenter-dedicated-pool.example.yaml`, substitute `<tenant-id>`, and apply.

---

## 4. Egress enforcement on both data planes (P6-D-P2 — now built)

The per-pool `NetworkPolicy` (deny-all ingress, egress allowlist) is one half; **enforcement
differs by data plane**, and both paths are now wired:

- **EC2 nodes** — the VPC CNI NetworkPolicy controller enforces the NetworkPolicy. The `vpc-cni`
  addon is configured with `enableNetworkPolicy=true` (`harness-dataplane`/`main.tf`), so this is on.
- **Fargate** — the CNI NetworkPolicy controller does **not** run there, so egress is enforced via
  **security-groups-for-pods** instead: the addon enables `ENABLE_POD_ENI=true`, Terraform creates a
  deny-by-default `harness-egress` SG (allows only gateway/Temporal/DNS) and attaches
  `AmazonEKSVPCResourceController` to the cluster role, and a `SecurityGroupPolicy` binds every
  harness pod to that SG. This holds on Fargate **and** EC2 (enforced at the ENI).

Apply the baseline SecurityGroupPolicy with the SG id from Terraform:

```powershell
$SG = terraform -chdir=infra/terraform/envs/dev output -raw harness_egress_security_group_id
(Get-Content infra/k8s/harness/40-securitygrouppolicy.yaml) -replace '<harness-egress-sg-id>', $SG |
  kubectl apply -f -
```

Tenants whose manifest declares extra `egress.allow` hosts get an **additional** per-tenant SG
(the renderer provisions it and sets `securityGroupPolicy.enabled=true` +
`securityGroupPolicy.securityGroupIds` on the harness-pool release); SecurityGroupPolicies are
additive, so the pool keeps the deny-by-default baseline plus only its allowlisted destinations.

Test enforcement:

```powershell
# From a harness pod, the metadata service and arbitrary egress must FAIL:
kubectl exec -n actrone-harness <pod> -- curl -m3 http://169.254.169.254/latest/meta-data/   # must time out
kubectl exec -n actrone-harness <pod> -- curl -m3 https://example.com                         # must time out
```

---

## 5. Validate end-to-end + the orchestrator wiring follow-up

**Manual pool smoke test** (proves the chart + KEDA + Fargate path):

```powershell
helm template t infra/helm/actrone/charts/harness-pool --namespace actrone-harness `
  --set tenantId=org_demo --set agentId=agt_demo --set env=dev `
  --set taskQueue=harness.org_demo.dev `
  --set image.repository=public.ecr.aws/actrone/harness-base --set image.tag=demo | kubectl apply -f -
# With 0 pending tasks the Deployment sits at 0 replicas (scale-to-zero):
kubectl get deploy,scaledobject -n actrone-harness
# Enqueue a hosted task for that queue, then watch KEDA scale 0→N and back:
kubectl get hpa -n actrone-harness -w
```

**Promote → pool reconciliation (built, opt-in via Argo CD).** On a governed **promote** of a
hosted bundle, the orchestrator now renders this chart with the agent's resolved pod size + tenant
task queue and writes an **Argo CD `Application`** (server-side apply via the K8s API); Argo CD
syncs the pool. It is **opt-in and fail-safe**: default OFF (pools created with the `helm` command
above), and when ON a reconcile failure never fails the already-committed promote — it degrades to a
`PoolWarning` and the pool converges on the next sync. Enable it with:

```bash
ORCHESTRATOR_DATAPLANE_ENABLED=true
ORCHESTRATOR_DATAPLANE_REPO_URL=git@github.com:actrone/infra.git   # required when enabled
ORCHESTRATOR_DATAPLANE_TARGET_REVISION=main                        # default: main
ORCHESTRATOR_DATAPLANE_ARGO_NAMESPACE=argocd                       # default: argocd
ORCHESTRATOR_DATAPLANE_PROJECT=actrone-harness                     # default: actrone-harness
# Chart path, dest server/namespace, Temporal host:port, gateway URL all default sanely.
```

Prerequisites for the ON path: Argo CD installed; the orchestrator's ServiceAccount granted RBAC to
`create/patch` `applications.argoproj.io` in the Argo namespace; the `actrone-harness` AppProject
permitting the harness-pool chart's source repo + the `actrone-harness` destination. The
`harness.<env>.<tenantId>.<agentId>` task queue is derived by `domain.HarnessTaskQueue` — the
HostedAgentWorkflow scheduler **must** set `ActivityOptions.TaskQueue` from the same function so the
KEDA-scaled pool polls the exact queue the orchestrator dispatches to.

---

## 6. The "what needs you" checklist

- [ ] `terraform apply` — Fargate profile + exec role + KEDA — §2
- [ ] `kubectl apply -k infra/k8s/harness` — namespace + gVisor RuntimeClass — §2
- [ ] Install Karpenter controller (CFN IAM + SQS + helm) — §3
- [ ] Tag subnets/SG `karpenter.sh/discovery`, fill pool placeholders, apply warm pool — §3
- [ ] Validate `RUNSC_VER` against the pinned AL2023 AMI — §3
- [ ] Apply the baseline `SecurityGroupPolicy` with the Terraform SG id — §4
- [ ] Verify metadata/arbitrary egress is blocked from a harness pod (Fargate + EC2) — §4
- [ ] Smoke-test a pool: scale 0→N→0 on Temporal queue depth — §5
- [ ] (Argo path) install Argo CD, grant orchestrator RBAC on `applications.argoproj.io`, set `ORCHESTRATOR_DATAPLANE_*`, verify a promote writes an Application — §5
