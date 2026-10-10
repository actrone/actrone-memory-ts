# P6-A Edge Authorization — Cluster Rollout Runbook

> **Audience:** Matt (platform operator).
> **Scope:** the steps that **cannot** be done from the code repo and need a human at a
> kubeconfig with AWS + cluster admin. Everything in the orchestrator/ and infra/ repos
> (the Go `ext_authz` brain, the opt-in fail-closed orchestrator verify, the Helm charts,
> the Terraform mesh swap, the cert-manager trust-chain manifests, the validation script)
> is **already built and offline-validated**. This document is the remaining "what needs you".
>
> **Last updated:** 2026-06-21 · **Owner:** Matt · **Status:** code+charts shipped, cluster rollout pending
>
> **Status refreshed 2026-07-13 (code-verified):** still accurate — the `ext-authz` brain
> (`backend/orchestrator/cmd/extauthz`, `internal/{extauthz,gatewaytrust}`) and the
> `infra/helm/actrone/charts/{ext-authz,gateway,linkerd}` charts are present and code-complete; the
> cluster rollout (§2 Steps A–I) is **still pending** (`infra/docs/Actrone_Deployment_Runbook.md`
> 2026-07-12 reports all P6-A cluster steps as not-done; no `.tfstate` in the checkout).
> **One §4 follow-up is now stale (over-claim):** the `gateway_trust_secret` **dual-secret rotation
> window is already BUILT**, not open — `config.go` carries `GatewayTrustSecret` +
> `GatewayTrustSecretNext` (`gateway_trust_secret`/`_next`), `gatewaytrust.NewVerifier(primary, next…)`
> accepts a signature under either, and `gatewaytrust/rotation_test.go` proves the widen→roll→narrow
> flow — exactly the §2 "Zero-downtime rotation" procedure. Corrected inline in §4. The ext-authz
> `/metrics` follow-up and the ALB↔Envoy fronting reconciliation remain genuinely open.

---

## 0. What's already done vs. what this runbook covers

| Already in the repo (no action needed) | This runbook (needs you + a cluster) |
| --- | --- |
| Go `ext-authz` brain (`backend/orchestrator/cmd/extauthz`) | Install local tooling (helm/terraform/kubectl/linkerd/kubeconform) |
| Orchestrator opt-in verify (`gatewaytrust.Verifier`, default OFF) | Install cert-manager + trust-manager |
| Helm charts: `ext-authz`, `gateway`, `linkerd` | Bootstrap the Linkerd trust chain (`kubectl apply -k`) |
| Terraform: Linkerd + Envoy Gateway controllers | Wire the trust anchor PEM into Terraform, then `terraform apply` |
| cert-manager trust-chain manifests (`infra/k8s/cert-manager`) | Generate + seal the shared `gateway_trust_secret` into **two** Secrets |
| Offline validation script (`infra/scripts/validate-manifests.sh`) | `helm upgrade` the umbrella chart, run server-side dry-run, smoke-test |
| Anti-spoof header strip, fail-closed `SecurityPolicy` | Flip the orchestrator verify ON (cutover) |

**The single security invariant to preserve throughout:** the shared HMAC secret must be the
**same ≥32-byte value** in `ext-authz-secrets.EXTAUTHZ_GATEWAY_TRUST_SECRET` (edge, signs) and
`orchestrator-secrets.ORCHESTRATOR_AUTH_GATEWAY_TRUST_SECRET` (orchestrator, verifies). If they
drift, the edge signs identities the orchestrator rejects → fail-closed 401s. That is the whole
contract.

---

## 1. Local tooling (Windows / PowerShell — one-time)

```powershell
winget install Hashicorp.Terraform
winget install Helm.Helm
winget install Kubernetes.kubectl
choco install kubeconform          # offline CRD-aware schema validation (or scoop install kubeconform)
# Linkerd CLI — no winget package; download the linkerd2 release .exe matching the
# control-plane chart version (1.16.x) and put it on PATH:
#   https://github.com/linkerd/linkerd2/releases
```

Plus the AWS CLI configured for the target account, and a kubeconfig for the EKS cluster:

```powershell
aws eks update-kubeconfig --name <cluster-name> --region <region>
kubectl cluster-info        # confirm reachability before proceeding
```

---

## 2. Rollout — ordered (each step gates the next)

### Step A — Install cert-manager + trust-manager

cert-manager mints and auto-rotates the Linkerd identity material; trust-manager distributes the
trust roots. Both live in the `cert-manager` namespace.

```powershell
helm repo add jetstack https://charts.jetstack.io; helm repo update
helm upgrade --install cert-manager jetstack/cert-manager `
  --namespace cert-manager --create-namespace `
  --set crds.enabled=true
helm upgrade --install trust-manager jetstack/trust-manager `
  --namespace cert-manager
kubectl rollout status deploy/cert-manager -n cert-manager
```

### Step B — Bootstrap the Linkerd trust chain

This applies the manifests already in the repo (self-signed bootstrap → root trust anchor →
CA ClusterIssuer → 48h auto-rotating identity issuer → trust-roots Bundle).

```powershell
kubectl apply -k infra/k8s/cert-manager
# Wait for the chain to go Ready (the identity issuer is briefly NotReady on first apply):
kubectl get certificate -A -l app.kubernetes.io/part-of=actrone-mesh -w
```

All three (`linkerd-trust-anchor` in `cert-manager`, `linkerd-identity-issuer` in `linkerd`)
must report `READY=True` before continuing.

### Step C — Wire the trust anchor PEM into Terraform (the one Terraform addition)

Linkerd's `externalCA` mode needs the **public** trust anchor cert handed to the control plane at
install time. It is a public cert (not a secret), so reading it is safe. Extract it:

```powershell
kubectl get secret linkerd-trust-anchor -n cert-manager `
  -o jsonpath='{.data.ca\.crt}' | %{ [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_)) } `
  > linkerd-anchor.crt
```

Then add the value to the `linkerd_control_plane` release in
`infra/terraform/modules/eks/main.tf` (alongside the existing `identity.externalCA` set blocks).
**Do not paste the PEM inline in version control** — pass it as a Terraform variable / `-var-file`:

```hcl
set {
  name  = "identityTrustAnchorsPEM"
  value = var.linkerd_trust_anchor_pem   # supplied via tfvars / CI secret, not committed
}
```

> If you adopt the trust-manager Bundle (Step B installed it), the proxies also pick up the roots
> from the `linkerd-identity-trust-roots` ConfigMap automatically; `identityTrustAnchorsPEM` is
> still required for the control plane's own bootstrap. Keep both.

### Step D — `terraform apply` (installs the mesh + gateway controllers)

```powershell
terraform -chdir=infra/terraform/envs/dev init
terraform -chdir=infra/terraform/envs/dev plan -var-file=dev.tfvars      # review the diff
terraform -chdir=infra/terraform/envs/dev apply -var-file=dev.tfvars
```

This installs `linkerd-crds`, `linkerd-control-plane` (consuming the cert-manager issuer), and the
`envoy-gateway` controller, and applies the meshed/default-deny annotations to `actrone-core`.
Verify the mesh is healthy:

```powershell
linkerd check
kubectl get pods -n envoy-gateway-system
```

### Step E — Generate + seal the shared `gateway_trust_secret`

Generate once, install into **both** Secrets as the **same value**:

```powershell
# 48 random bytes, base64 → comfortably ≥32 bytes after the brain decodes it.
$secret = [Convert]::ToBase64String((1..48 | %{ Get-Random -Max 256 }))

# Edge brain:
kubectl create secret generic ext-authz-secrets -n actrone-core `
  --from-literal=EXTAUTHZ_GATEWAY_TRUST_SECRET="$secret" `
  --dry-run=client -o yaml | kubectl apply -f -

# Orchestrator — SAME value:
kubectl create secret generic orchestrator-secrets -n actrone-core `
  --from-literal=ORCHESTRATOR_AUTH_GATEWAY_TRUST_SECRET="$secret" `
  --dry-run=client -o yaml | kubectl apply -f -
```

> **Production:** do not `kubectl create secret` by hand — route both through your
> External Secrets / Sealed Secrets pipeline so the value is sealed at rest and rotatable.
> The two Secrets above already exist for other keys (DSN, Redis, JWKS); you are **adding**
> this key, not replacing the Secret. Patch, don't overwrite.

#### Zero-downtime rotation of `gateway_trust_secret`

The orchestrator verifier accepts a signature valid under **either** its primary
secret (`ORCHESTRATOR_AUTH_GATEWAY_TRUST_SECRET`) or an optional rotation secret
(`ORCHESTRATOR_AUTH_GATEWAY_TRUST_SECRET_NEXT`). Because the edge signs with a
single secret at a time, rotate by widening the verifier's accepted set, rolling
the edge onto the new value, then narrowing it — no window rejects a legitimately
signed request. Generate `$new` (as in Step E), then:

```powershell
# 1. Add NEW as the orchestrator's rotation secret; roll it. Verifier now
#    accepts {old, new}. The edge still signs with old — nothing breaks.
kubectl patch secret orchestrator-secrets -n actrone-core --type merge `
  -p (@{ stringData = @{ ORCHESTRATOR_AUTH_GATEWAY_TRUST_SECRET_NEXT = $new } } | ConvertTo-Json)
kubectl rollout restart deploy/orchestrator -n actrone-core; kubectl rollout status deploy/orchestrator -n actrone-core

# 2. Point the edge at NEW; roll it. Every edge pod now signs with NEW, which
#    the orchestrator already accepts. Rolling pods mid-flight are covered.
kubectl patch secret ext-authz-secrets -n actrone-core --type merge `
  -p (@{ stringData = @{ EXTAUTHZ_GATEWAY_TRUST_SECRET = $new } } | ConvertTo-Json)
kubectl rollout restart deploy/ext-authz -n actrone-core; kubectl rollout status deploy/ext-authz -n actrone-core

# 3. Promote NEW to primary and drop the rotation secret; roll the orchestrator.
#    The old secret is now fully retired.
kubectl patch secret orchestrator-secrets -n actrone-core --type merge `
  -p (@{ stringData = @{ ORCHESTRATOR_AUTH_GATEWAY_TRUST_SECRET = $new; ORCHESTRATOR_AUTH_GATEWAY_TRUST_SECRET_NEXT = "" } } | ConvertTo-Json)
kubectl rollout restart deploy/orchestrator -n actrone-core; kubectl rollout status deploy/orchestrator -n actrone-core
```

> On startup the orchestrator logs `auth.gateway_trust.enabled` with
> `rotation_window=true` while `_NEXT` is set — a quick check that step 1/3 took
> effect. In production, drive the same three steps through External Secrets
> (patch the upstream secret store), not raw `kubectl patch`.

### Step F — Deploy the umbrella chart

The `ext-authz`, `gateway`, and `linkerd` subcharts are toggled `enabled: true` in
`infra/helm/actrone/values.yaml`. Run the offline validation ladder first, then deploy:

```powershell
bash infra/scripts/validate-manifests.sh --values infra/helm/actrone/values.yaml
helm upgrade --install actrone infra/helm/actrone -n actrone-core --create-namespace `
  -f infra/helm/actrone/values.yaml
```

### Step G — Server-side dry-run + readiness

This is the **only** validation that catches "a field in our `SecurityPolicy` doesn't exist in the
installed Envoy Gateway version" — it checks the CRs against the cluster's actual CRDs + webhooks:

```powershell
bash infra/scripts/validate-manifests.sh --dry-run server
kubectl get gateway,httproute,securitypolicy -n actrone-core
kubectl get server,authorizationpolicy -n actrone-core
kubectl rollout status deploy/actrone-ext-authz -n actrone-core
```

### Step H — Smoke tests (prove the edge actually authorizes)

```powershell
$API = "https://api.actrone.com"

# 1. Public path — no auth, must pass:
curl -i "$API/health/ready"                       # → 200

# 2. Protected path, no bearer — must be denied at the edge:
curl -i "$API/v1/agents"                           # → 401

# 3. SPOOFED identity header — the gateway MUST strip it (anti-spoof):
curl -i "$API/v1/agents" -H "X-Actrone-User-Id: attacker"   # → 401, header never reaches orchestrator

# 4. Valid Clerk JWT — must pass and arrive at the orchestrator with a SIGNED identity header:
curl -i "$API/v1/agents" -H "Authorization: Bearer <valid-clerk-jwt>"   # → 200
```

### Step H2 — gRPC edge (SDK gRPC terminates at Envoy, like REST)

The gateway now exposes the SDK gRPC endpoint at `grpc.actrone.com` on its own HTTPS/h2
listener, routed (GRPCRoute) to the orchestrator's gRPC port (50051) behind the **same**
ext_authz. Three cluster-only prerequisites:

```powershell
# 1. DNS — point grpc.actrone.com at the SAME gateway load balancer as api/app:
#    (the wildcard *.actrone.com TLS cert already covers grpc.actrone.com — no new cert).

# 2. Server-side dry-run the new listener + route + the h2c Service port:
kubectl apply --dry-run=server -k infra/helm/actrone   # or the rendered umbrella template
#    Confirm: Gateway listener `grpc` Accepted (the *.actrone.com vs grpc.actrone.com
#    same-port overlap resolves to the most-specific SNI — an Envoy Gateway-supported
#    pattern); GRPCRoute `orchestrator-grpc` Accepted + ResolvedRefs; SecurityPolicy
#    `edge-authz` now lists the GRPCRoute in its targets.

# 3. Smoke-test gRPC admission (grpcurl):
grpcurl grpc.actrone.com:443 list                                   # → reflection/health, edge reachable
grpcurl grpc.actrone.com:443 actrone.v1.OrchestratorService/...     # → Unauthenticated without a bearer
grpcurl -H "authorization: Bearer <valid-clerk-jwt>" grpc.actrone.com:443 actrone.v1.OrchestratorService/...   # → OK
```

The orchestrator Service exposes port 50051 with `appProtocol: kubernetes.io/h2c` so Envoy
speaks cleartext HTTP/2 to the pod (the gRPC server binds plaintext; Linkerd mTLS-wraps the
hop). The orchestrator NetworkPolicy now admits `envoy-gateway-system` to 50051. The gRPC
interceptor chain still authenticates each call (defense in depth alongside the edge brain).

**Symmetric fast path (DONE):** the gRPC auth interceptor now shares the HTTP boundary's
`middleware.AuthConfig` — including `GatewayTrust`. When the edge ext_authz forwards the
signed identity as gRPC metadata, `authFromMetadata` lifts the trust headers into an
`http.Header`, calls `middleware.AuthenticateGatewayIdentity` (POST + the gRPC `FullMethod`,
matching the `:method`/`:path` the edge signed over), and skips the JWKS crypto exactly like
the REST path. A present-but-invalid signature fails closed (`codes.Unauthenticated`); absent
⇒ normal Bearer/JWT auth. So flipping the verify ON in Step I covers gRPC *and* HTTP together.

### Step I — Cutover: turn the orchestrator verify ON

Until this step the orchestrator ignores the gateway header (verify is OFF by default — zero
behavior change). The cutover is simply: the orchestrator now has
`ORCHESTRATOR_AUTH_GATEWAY_TRUST_SECRET` set (done in Step E), so on its next rollout it will
**verify** the signed header and skip redundant JWKS when the signature is valid.

```powershell
kubectl rollout restart deploy/actrone-orchestrator -n actrone-core
kubectl logs -n actrone-core deploy/actrone-orchestrator | Select-String "auth.gateway_trust.enabled"
```

Confirm the log line `auth.gateway_trust.enabled` appears. Re-run Step H #4 — it should still
return 200, now via the trusted-header fast path. If anything misbehaves, **unset** the
orchestrator secret key and restart: it falls back to direct JWKS verification with no downtime
(fail-safe by design).

---

## 3. Rollback

| To undo | Action |
| --- | --- |
| Orchestrator verify (Step I) | Remove `ORCHESTRATOR_AUTH_GATEWAY_TRUST_SECRET` from `orchestrator-secrets`, `kubectl rollout restart`. Verify reverts to OFF; JWKS path resumes. |
| Edge enforcement (Steps F–H) | `helm upgrade` with `ext-authz.enabled=false gateway.enabled=false`; traffic returns to the prior ALB→orchestrator path. |
| Mesh (Step D) | `terraform apply` the previous module revision; or `linkerd uninstall`. Note: removing default-deny requires removing the namespace annotations first. |

---

## 4. Open follow-ups (tracked, not blocking rollout)

- **ext-authz `/metrics` endpoint** — the brain currently exposes none (CLAUDE.md §6.3 gap);
  request-level metrics come from the Envoy Gateway in front of it. Add a Prometheus endpoint and
  flip `ext-authz.serviceMonitor.enabled=true` when it grows one.
- ~~**`gateway_trust_secret` rotation** — implement a dual-secret acceptance window in the
  orchestrator verifier so the HMAC key can rotate without a hard cutover.~~ **DONE (verified
  2026-07-13):** the dual-secret window is built — `config.GatewayTrustSecret` +
  `GatewayTrustSecretNext` feed `gatewaytrust.NewVerifier`, which accepts a signature under either
  secret (`gatewaytrust/rotation_test.go`), and the §2 "Zero-downtime rotation" steps drive it. No
  longer an open item.
- **ALB ↔ Envoy Gateway fronting** — the existing `ingress` (ALB) and the new `gateway` both
  target the same hosts; decide whether the ALB fronts Envoy Gateway or is retired, and reconcile
  `values.yaml` `ingress` vs `gateway` so they don't both claim `api.actrone.com`.

---

## 5. The "what needs you" checklist

- [ ] Install local tooling (helm, terraform, kubectl, linkerd, kubeconform) — §1
- [ ] Install cert-manager + trust-manager — §2.A
- [ ] `kubectl apply -k infra/k8s/cert-manager`; trust chain Ready — §2.B
- [ ] Extract anchor PEM, wire `identityTrustAnchorsPEM` via tfvars (not committed) — §2.C
- [ ] `terraform apply`; `linkerd check` green — §2.D
- [ ] Generate `gateway_trust_secret`; seal SAME value into both Secrets — §2.E
- [ ] Validate offline, then `helm upgrade --install actrone` — §2.F
- [ ] Server-side dry-run + CRs present + ext-authz ready — §2.G
- [ ] Smoke tests: public/401/spoof-stripped/valid-JWT — §2.H
- [ ] Cutover: confirm `auth.gateway_trust.enabled`, re-verify — §2.I
