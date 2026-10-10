# Infrastructure & Environments Plan

**Version 1.0 — June 2026 · 🟡 PARTIALLY SHIPPED — §3 dev/staging/prod environments shipped as Master-Plan P3; §1–§2 mesh + API-gateway extraction shipped as code + Helm charts (P6-A: `ext_authz` brain, Envoy Gateway + Linkerd charts), **cluster rollout pending**. This doc captures the original analysis; authoritative status: [Platform Evolution §0a](./Actrone_Platform_Evolution_Master_Plan.md#0a-implementation-status-verified-2026-06-24).**

> **Status refreshed 2026-07-13 (code-verified):** the §1/§2/§4 decisions all still match what's in the
> infra repo. Confirmed present: `infra/helm/actrone/charts/{gateway,ext-authz,linkerd,harness-pool}`
> (each with `Chart.yaml`/`values.yaml`/`templates/`, all CODE-COMPLETE), and the Terraform in
> `infra/terraform/modules/eks/{main,karpenter,harness-dataplane,build-dataplane,build-source-store,
> platform-controllers}.tf`. **Cluster rollout is still 100% pending** — `infra/docs/
> Actrone_Deployment_Runbook.md` (dated 2026-07-12) self-reports every cluster/platform-controller/
> mesh/gateway checkbox as **not done**, and no `.tfstate` exists anywhere in this checkout (consistent
> with the remote S3 backend, but there is no positive evidence of any `terraform apply` having run
> against a live account). Nothing in §1–§6 needed correction; this note exists to reconfirm the
> code-complete/cluster-pending split hasn't drifted. See the P6-A/B/C runbooks and the Platform
> Controllers Bootstrap Runbook for the per-component rollout detail.

> Answers three architecture questions: (1) is Istio + SPIRE the right mTLS call,
> or is there a simpler-but-secure option? (2) should the API Gateway be its own
> independently-scaling service? (3) how to add dev/staging/prod environments.

---

## 1. Service mesh & mTLS — recommendation

### 1.1 Hard constraint first: AWS App Mesh is dead
**AWS App Mesh reaches end-of-support on 2026‑09‑30** ([AWS App Mesh roadmap](https://github.com/aws/aws-app-mesh-roadmap), [migration guide](https://dev.to/kseniyaseliverstava/aws-app-mesh-deprecated-escaping-app-mesh-before-september-2026-1l7m)); new onboarding has been closed since 2024. AWS's own replacements are ECS Service Connect / VPC Lattice / direct ALB — none of which is a full Kubernetes mesh with workload-identity mTLS. **Do not adopt App Mesh.**

### 1.2 The real choice: Istio+SPIRE vs Linkerd vs Cilium
From current comparisons ([Reintech 2026](https://reintech.io/blog/kubernetes-service-mesh-comparison-2026-istio-linkerd-cilium), [LiveWyer](https://livewyer.io/blog/service-meshes-decoded-istio-vs-linkerd-vs-cilium/), [Buoyant](https://www.buoyant.io/linkerd-vs-istio)):

| | **Linkerd** | **Istio (+ SPIRE)** | **Cilium** |
|---|---|---|---|
| mTLS | **Automatic, zero-config**, own CA | Flexible, SPIFFE/SPIRE, external CAs, trust domains | Kernel (WireGuard/IPsec) + Envoy mTLS — defense in depth |
| Perf overhead | **Lowest (~5–10%)**, Rust micro-proxy | Highest (~25–35%) | ~20–40% |
| Complexity | **Lowest** | Highest (control plane + SPIRE) | Medium (eBPF expertise) |
| Best when | You want secure + simple now | Need external SPIFFE federation, advanced traffic policy, multi-cluster, enterprise CA interop | Already eBPF-native networking |

### 1.3 Recommendation
**Adopt Linkerd as the primary mesh.** It gives automatic, zero-config mTLS with its own CA (no SPIRE to operate), the lowest latency/memory overhead, and by far the simplest operations — exactly your "secure but not complex" requirement. It satisfies the same security posture Istio+SPIRE provides for *internal* east-west mTLS, without the control-plane + SPIRE burden.

**Keep Istio + SPIRE on the table only if/when** a concrete enterprise requirement appears:
- A customer (or your own zero-trust program) requires **SPIFFE identity federation** with *external* systems / their own SPIRE.
- You need **advanced L7 traffic policy**, multi-cluster mesh federation, or pluggable external CAs.

In that case, Istio's SPIFFE/SPIRE flexibility is worth its weight. Until then, **SPIRE is operational complexity you don't need** — Linkerd's built-in identity covers in-cluster mTLS.

**If you're already going eBPF** for networking/observability, **Cilium** is the unify-everything option (CNI + mesh + network policy in-kernel) — pick it *instead of* Linkerd only if the platform team is committed to eBPF; otherwise Linkerd's simplicity wins.

**Net:** App Mesh ❌ · **Linkerd ✅ (default)** · Istio+SPIRE = escalate-when-required · Cilium = if eBPF-native.

### 1.4 Where mTLS sits vs the gateway
- **Service mesh (Linkerd) = east-west** (service ↔ service inside the cluster): automatic mTLS, retries, traffic shifting, golden metrics.
- **API Gateway = north-south** (internet ↔ platform): TLS termination, auth, rate-limit, WAF (see §2).
The two are complementary, not competing.

---

## 2. Separate API Gateway service — recommendation

### 2.1 Verdict: **Yes — extract it.**
A dedicated edge gateway that scales independently of the orchestrator is the right hyperscale pattern:
- **Separation of concerns** — the orchestrator focuses on durable workflow execution; the gateway owns edge concerns.
- **Independent scaling** — edge traffic (auth checks, rate-limit, light proxying) scales on a very different curve than Temporal workflow workers; decoupling lets each scale + fail independently.
- **Blast-radius isolation** — a flood of bad requests is absorbed/shed at the edge before touching the orchestrator.
- **Cleaner security boundary** — WAF, IP allow/deny, request-size limits, global quotas live in one hardened place.

### 2.2 What moves to the gateway (north-south concerns)
- TLS termination (+ HSTS/security headers — CLAUDE.md §5.4).
- Global + per-IP + per-tenant **rate limiting** and quotas (today partly in the orchestrator's `RateLimitConfig` — move the coarse layer out).
- **WAF / abuse protection**, request-size caps, slow-loris/timeout shedding.
- **Routing** to backend services (orchestrator, marketplace, future services) + canary/blue-green.
- Optional **JWT validation** (Clerk JWKS) at the edge, passing verified claims downstream.

### 2.3 What stays in the orchestrator
- **Domain authorization** (tenant resolution, scoped RBAC) — the service is the authority (CLAUDE.md §5.2: authz in the service, not just the gateway).
- Business logic, workflow submission, governance.

### 2.4 Build vs adopt — DECISION: adopt Envoy, build the brain behind it
**Decided (June 2026): adopt Envoy Gateway (or Kong) for the data plane; do NOT rebuild the proxy. Put Actrone's custom hyperscale logic in a thin Go `ext_authz`/`ext_proc` service behind it.**

Why not build a bespoke gateway (even in Go):
- **Envoy is the hyperscale answer** — it runs Google/Stripe/Lyft and is the data plane under most service meshes (C++ event-loop, millions of RPS per fleet). You will not out-engineer it.
- Rebuilding means re-implementing TLS/HTTP2-3, connection pooling, backpressure, rate-limit, circuit-breaking, WAF, retries, hot config reload, OTel — months to parity, then forever to maintain + patch CVEs on your most-exposed surface.
- **Performance counter-intuition:** a Go `net/http` edge proxy is likely *slower* than Envoy at the raw-proxy layer — Go's GC + goroutine-per-connection adds tail latency under extreme fan-in, exactly where the edge is hammered. "Build it in Go for hyperscale" tends to *lose* at this layer.
- CLAUDE.md §0.2/§0.5: adopting the proven proxy **is** the 10× choice; rebuilding it can't earn its place.

**The custom-logic answer (the important part):** keep Envoy/Kong for commodity L7, and express Actrone's domain decisions — scoped-RBAC, entitlements, per-tenant model routing, BYOK key resolution, governed-task metering — as an **`ext_authz` / `ext_proc` gRPC callout to a thin Go service**. You own only the small, high-value brain; Envoy owns TLS/ratelimit/WAF. Domain authz still also lives in the orchestrator (defense in depth). A fully custom gateway is justified only if a concrete requirement genuinely can't be met by Envoy filters + the callout — rare, and discovered from a real blocker, not assumed upfront.

- **Pairing:** north-south **Envoy Gateway** (Kubernetes Gateway API) + east-west **Linkerd** mTLS (§1) — complementary.
- **Phasing:** Phase 1 — Envoy does TLS + rate-limit + WAF + routing; auth stays in the service. Phase 2 — add the Go `ext_authz` callout (JWKS JWT validation + scoped-RBAC/entitlement pre-checks at the edge), forward signed claims downstream. Phase 3 — `ext_proc` for richer per-tenant routing/metering; multi-service routing as new services (marketplace, EMAOP control plane) split out.

> **Built (2026-06-21) — Phase 2 brain + charts.** The Go `ext_authz` brain ships
> (`internal/gatewaytrust`, `internal/extauthz`, `cmd/extauthz`, `Dockerfile.extauthz`).
> **Transport decision:** **HTTP ext_authz**, not gRPC — Envoy Gateway's
> `SecurityPolicy.extAuth.http` backend lets the brain be a plain `net/http` server
> reusing the existing Clerk JWKS verifier, with **no** `go-control-plane`/proto
> dependency (CLAUDE.md §0.5 — dependencies must earn their place). The plan text's
> "gRPC callout" was a preference, not a constraint. **Mesh decision (the open §1.3
> call) resolved → Linkerd + Envoy Gateway**, retiring the as-built `istio`+`spire`
> charts; the east-west PeerAuthentication-STRICT posture is reproduced with
> Linkerd default-deny + Server/AuthorizationPolicy (`charts/linkerd`). Per §2.5,
> the brain is the JWT-validation home and signs a per-request HMAC over the
> forwarded identity (method+path+identity+timestamp bound, replay-windowed); the
> orchestrator verifies it **opt-in and fail-closed** (default OFF) and **keeps the
> authoritative domain authz**. The gateway strips inbound client-supplied
> `X-Actrone-*` trust headers so identity can never be spoofed. Charts: `ext-authz`,
> `gateway`, `linkerd`; Terraform mesh install swapped. **Not buildable here:** the
> live-cluster controller installs + trust-anchor/secret provisioning + server-side
> CRD dry-run.

### 2.5 Caution
Don't **duplicate** auth awkwardly (gateway + service both half-verifying). Pick one JWT-validation home per phase — the **Go `ext_authz` service** is the recommended home once Phase 2 lands — and pass a trusted, signed internal header (or rely on mesh mTLS identity) downstream. The orchestrator keeps the authoritative domain authz check.

---

## 3. Environments (dev / staging / prod)

### 3.1 Goal
A first-class **environment** dimension per org, with a top-right switcher (see [Master Plan](./Actrone_Platform_Evolution_Master_Plan.md) §2.5) — instantly communicating "you are on Production" and giving an enterprise, Vercel/Clerk-grade feel.

### 3.2 Data model
Add `environment_id` (or an `env` enum `development|staging|production`) as a **scoping key on every tenant-owned resource**: agents, tasks, connections/credentials, API keys, rules, audit events, cost. Two implementation options:

| Option | Description | Trade-off |
|---|---|---|
| **A. Env column** (recommended to start) | `env` column on each table, partition key alongside `tenant_id` | Simplest; strong query isolation; one DB |
| **B. Env as sub-tenant** | Each env is its own `tenant_id` under an org | Strongest isolation (reuses all tenant scoping incl. audit HMAC keys, vault paths) but more plumbing |

**Recommendation:** start with **A** for speed, design the API so a later move to **B** (true isolation per env) is possible. Production-grade isolation (separate vault paths, separate audit chains, separate rate buckets) argues for **B** at enterprise tier — make it the Enterprise differentiator.

### 3.3 Isolation guarantees (the point of environments)
- **Credentials/connections are per-env** — connecting Salesforce in Dev never exposes prod creds.
- **API keys are per-env** (see §3.5) — a dev key can't touch prod.
- **Agents/tasks/data are per-env** — no cross-env leakage; the env is part of every query's WHERE.
- **Audit + governance per-env** — separate chains so a prod compliance export isn't polluted by dev noise.

### 3.4 UX
- Top-right **environment switcher** pill: `Development` (neutral), `Staging` (amber), `Production` (brand-red). Switching re-scopes the entire Control Tower.
- A subtle persistent banner/border tint in non-prod (so no one fat-fingers a prod action thinking it's dev).
- Default new orgs get all three; the switcher is hidden if an org only uses one.

### 3.5 API keys per environment (ties to Master Plan §2.4)
- Keys are **bound to an environment**; the SDK authenticates into a specific env.
- Generate/copy from the **top-right quick action** (reveal-once) **and** the full **Settings → API Keys** page (list masked, create named+env-scoped, rotate, revoke, last-used). Backend `APIKeyRepository` exists; add `env` scoping + the management UI.

### 3.6 Mesh/gateway interplay
- The gateway can route by env (host/header) and apply per-env rate buckets.
- The mesh identity can encode env for east-west policy if you later isolate workloads per env.

---

## 4. Hosted-agent worker pools — compute provisioning (EKS vs Fargate vs ECS)

> Answers "how do we provision the pods/worker pools for BYOF-hosted + `actrone_sdk`-hosted agents,
> and how do we know what's best to scale?" Backs [BYOF Design §6.3/§7](./Actrone_BYOF_Worker_Harness_Design.md)
> (P6-C). Only **hosted code** agents get a pod — manifest/native agents run on the shared Go kernel
> ([taxonomy](./Actrone_BYOF_Worker_Harness_Design.md)), so this section is about the harness pods only.

### 4.1 Substrate: stay on EKS — do NOT introduce ECS

The control plane already runs on **EKS** (Helm, Linkerd mesh, the infra repo). Harness pods run on
the **same EKS cluster**, not a separate orchestrator. **ECS / ECS-Fargate is rejected** — adopting a
second orchestrator would fork the deploy tooling, mesh (Linkerd is K8s-native), NetworkPolicy egress
model, secrets, and observability for zero benefit. The choice is therefore *within* EKS: **EC2
nodes (via Karpenter) vs EKS-on-Fargate**, picked per workload.

### 4.2 The key insight: harness pods are CPU/memory, not GPU

A hosted agent's pod runs the **framework loop only** — its model calls go out to the **governed
gateway** (inference happens provider-side, not in the pod). So the pod is a modest CPU/memory
workload; **it needs no GPU.** That makes **EKS-on-Fargate viable for the bulk of harness pods**
(per-pod microVM isolation — ideal for untrusted customer code — and clean per-pod billing that maps
1:1 onto the §15.8 GB-second meter). (Only a *self-hosted in-pod model* would need GPU → EC2; that is
a separate "BYO inference endpoint" path, not the harness.)

**The concrete sizes.** Harness pods come in four **named sizes, each a valid Fargate task config**
so a size provisions exactly one microVM (no round-up; this 1:1 is what makes the §15.8 GB-s/vCPU-s
attribution clean). The catalogue is the single source of truth in
`internal/domain/podsize.go` and is consumed by the deploy renderer, the tier gate, and the meter:

| Size | vCPU | Memory | Fargate task | Tier ceiling |
|---|---|---|---|---|
| `small` | 0.5 | 1 GiB | 0.5 vCPU / 1 GB | Scale+ |
| `medium` (default) | 1 | 2 GiB | 1 vCPU / 2 GB | Scale+ |
| `large` | 2 | 4 GiB | 2 vCPU / 4 GB | Scale (max) |
| `xl` | 4 | 8 GiB | 4 vCPU / 8 GB | Enterprise (max) |

Hosting is a **Scale/Enterprise** capability (§15.8) — Free/Pro provision no harness pod. Fargate
reserves ~256 MiB/pod for the kubelet/containerd it injects; the deploy renderer subtracts that
(`domain.FargatePodOverheadMiB`) from the container memory request so the pod lands on the intended
task size, not the next one up. Needs beyond `xl` are served by the dedicated Karpenter pools below,
billed as reserved capacity — not the per-task GB-second meter.

### 4.3 Decision: Fargate-default, Karpenter for warm/scale, sandboxed runtime for isolation

| Workload shape | Compute | Why |
|---|---|---|
| **Default per-task hosted run** (spiky, long-tail, untrusted) | **EKS-on-Fargate** | microVM isolation per pod (strongest blast-radius containment for arbitrary code), zero node ops, scale-to-zero, per-pod cost = clean GB-s attribution |
| **Reserved warm pools** (zero-cold-start, steady high-volume tenants) | **EC2 + Karpenter** | warm capacity, bin-packing + Spot for cost, faster start than Fargate cold start; backs the §15.8 reserved-pool line |
| **Dedicated single-tenant (Enterprise)** | **Karpenter node pool** pinned to the tenant (taints/affinity) | hardware-level isolation, residency, predictable capacity |

- **Isolation hardening on EC2 nodes:** where untrusted pods land on EC2 (warm pools), run them under
  a **sandboxed runtime — gVisor (runsc) or Kata Containers** — so EC2-hosted customer code gets
  microVM/syscall-filtered isolation comparable to Fargate. Plus the §7 baseline (distroless/rootless,
  read-only FS, seccomp, NetworkPolicy egress-allowlist).
- **Autoscaling signal = Temporal task-queue depth, via KEDA.** Each tenant's harness `Deployment`
  scales on the backlog of its Temporal task queue (KEDA Temporal scaler) — pods spin up on pending
  hosted tasks and back to zero when idle; **Karpenter** provisions/deprovisions the underlying nodes
  to match. This is the concrete "how do agents scale" answer: queue-depth-driven, not CPU-driven
  (CPU is a poor proxy for an I/O-bound loop waiting on gateway calls).
- **How we pick per agent/tenant:** decision inputs are (a) isolation requirement (untrusted ⇒
  Fargate/sandboxed), (b) latency/cold-start tolerance (zero-cold-start ⇒ warm EC2 pool), (c) steady
  volume vs spiky (steady ⇒ EC2 bin-pack + Spot; spiky/long-tail ⇒ Fargate), (d) tier (dedicated ⇒
  Enterprise node pool). Default new tenants to **Fargate**; promote heavy/latency-sensitive ones to
  **warm EC2 pools**. GPU is never a harness input (see §4.2).

### 4.4 Built (2026-06-21) — data-plane chart + substrate

The §4 decision is now realised in the infra repo (code + offline-validated; cluster bring-up is
the [P6-C Cluster Rollout Runbook](./Actrone_P6C_Cluster_Rollout_Runbook.md)):

- **`charts/harness-pool`** — the per-tenant pool, one release per `(tenant × env × hosted agent)`.
  A KEDA-autoscaled Temporal **activity** worker (`run_framework_step`) that scales to zero on
  queue depth, is egress-locked (deny-all ingress; egress only to gateway/Temporal/DNS + the
  manifest allowlist, never the metadata IP), runs a digest-pinned image non-root/read-only with
  all caps dropped, and isolates via Fargate microVM (default) or `runtimeClassName: gvisor` on
  EC2. Values mirror `internal/domain/podsize.go` (the size→Fargate-task→billing-basis catalogue).
- **`infra/k8s/harness/`** — `actrone-harness` namespace (meshed, default-deny inbound), the gVisor
  `RuntimeClass`, and Karpenter warm + dedicated-Enterprise NodePools/EC2NodeClasses (runsc
  bootstrap in userData, IMDSv2-only, tenant-pinned taints).
- **`harness-dataplane.tf`** — Fargate pod-execution role + the `actrone-harness` Fargate profile
  (the default substrate) + the KEDA `helm_release`. Karpenter's controller IAM/SQS is a runbook
  step (environment-specific, can't be validated without a live account).

**Egress enforcement on both data planes — closed by P6-D-P2 (2026-06-21).** The VPC CNI
NetworkPolicy controller does not enforce on Fargate, so the harness-pool NetworkPolicy alone
would leave a Fargate gap. Closed with **security-groups-for-pods**: the `vpc-cni` addon now sets
`enableNetworkPolicy=true` (EC2 enforcement) and `ENABLE_POD_ENI=true` (pod SGs); Terraform creates
a deny-by-default `harness-egress` SG (gateway/Temporal/DNS only) + the cluster-role
`AmazonEKSVPCResourceController` attachment; a `SecurityGroupPolicy`
(`infra/k8s/harness/40-securitygrouppolicy.yaml`, namespace-wide baseline) + the per-tenant
override in the chart bind harness pods to that SG, enforced at the ENI on **both** Fargate and EC2.
Per-tenant `egress.allow` hosts get an additional per-tenant SG (SecurityGroupPolicies are additive).

## 5. Recommended sequencing (infra)

1. **Environments (Option A)** + per-env API keys + switcher — high product value, mostly app-layer.
2. **API Gateway extraction** (Envoy Gateway / Kong): TLS + rate-limit + WAF + routing; keep auth in-service.
3. **Linkerd** rollout for east-west mTLS (replace/avoid App Mesh; defer Istio+SPIRE unless a SPIFFE-federation requirement lands).
4. **Enterprise-tier env isolation (Option B)** + edge JWT validation + per-env vault paths/audit chains.

---

## 6. Summary of recommendations

- **Hosted-agent compute:** stay on **EKS** (reject ECS); **Fargate-default** for per-task hosted runs (microVM isolation for untrusted code + clean per-pod GB-s billing), **EC2+Karpenter** for warm/reserved pools and dedicated Enterprise nodes, **gVisor/Kata** to harden untrusted pods on EC2, **KEDA on Temporal queue-depth** for scaling. Harness pods are CPU/memory (inference goes to the gateway) ⇒ **no GPU**.
- **mTLS/mesh:** **Linkerd** (simple + secure + fast). **Not** App Mesh (EOL 2026‑09‑30). Istio+SPIRE only when external SPIFFE federation / advanced policy is actually required. Cilium if going eBPF-native.
- **API Gateway:** **DECIDED — adopt Envoy Gateway/Kong** for the data plane (don't rebuild the proxy — a custom Go gateway would be slower at the edge and a maintenance/CVE liability); put Actrone's custom hyperscale logic in a thin **Go `ext_authz`/`ext_proc` service behind it**; keep authoritative domain authz in the orchestrator.
- **Environments:** add a first-class env dimension (start with an `env` column, evolve to true per-env isolation at Enterprise tier), per-env API keys, a top-right switcher with a prod safety tint.

---

*Sources: [AWS App Mesh roadmap](https://github.com/aws/aws-app-mesh-roadmap) · [App Mesh EOL migration](https://dev.to/kseniyaseliverstava/aws-app-mesh-deprecated-escaping-app-mesh-before-september-2026-1l7m) · [Service mesh comparison 2026](https://reintech.io/blog/kubernetes-service-mesh-comparison-2026-istio-linkerd-cilium) · [Linkerd vs Istio](https://www.buoyant.io/linkerd-vs-istio) · [LiveWyer mesh comparison](https://livewyer.io/blog/service-meshes-decoded-istio-vs-linkerd-vs-cilium/)*

*Last updated: 2026-06-10 · Planning only.*
