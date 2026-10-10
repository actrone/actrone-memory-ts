# Actrone Per-Tenant Registry Secrets Plan

> **Status refreshed 2026-07-13 (code-verified):** Re-confirmed ACCURATE, no correction needed.
> Directly verified: `internal/registrybinding/{binding.go,binding_test.go,store.go}` exist and are
> non-trivial (binding.go 3.4 KB, store.go 4.5 KB); `infra/k8s/build/10-eso-ecr-push-secret.example.yaml`
> + `11-eso-ecr-pull-secret.example.yaml` exist; migration `00088_registry_bindings.sql` exists;
> `main.go` wires `registrybinding.NewStore(db.Pool(), rv)` behind a vault-availability check
> (~line 1735-1736). The "remaining is deployment-gated only" framing still holds.
>
> **Status:** 🟡 CODE BUILT / apply-gated (verified by code audit 2026-07-04 — the old "not built" header was
> STALE). Built: `internal/registrybinding/{binding.go,store.go}` (BYO registry credential, vault-sealed
> dockerconfigjson), `internal/ecr/resolver.go` (managed per-tenant ECR digest resolver via IRSA/SigV4),
> `domain/registrybinding.go` (`PullSecretName`/`PushSecretName`), migration `00088_registry_bindings`, wired in
> `main.go`; infra ESO templates present (`infra/k8s/build/10-11-eso-ecr-*.example.yaml`). **Remaining is
> deployment-gated only:** apply ESO + IRSA on a live cluster to activate reconciliation. **Owner:** Matt. **Scope:** how every tenant's harness pods (and
> build pods) authenticate to a container registry to **pull and push only their own images**, using
> short-lived, auto-refreshed, per-tenant credentials with no long-lived secrets — replacing today's
> single optional platform-wide pull credential.
> **Depends on / pairs with:** P6-C data plane (`harness-pool` `image.pullSecret`) + the
> [Code-Bundle Build Plan](./Actrone_Code_Bundle_Build_Infrastructure_Plan.md) (push side).
> **Last updated:** 2026-06-21.

---

## 1. Goal & why now

A hosted agent's pod must pull its container image. Today the orchestrator carries **one optional
platform-wide credential** (`DeployConfig.RegistryUsername/Password` → `registry.Credential`), and
the `harness-pool` chart exposes an `image.pullSecret` value with **no per-tenant provisioning
behind it**. That is fine for public base images and a single shared private registry, but it
fails the multi-tenant bar:

- **Isolation:** a shared credential that can pull *any* image is a cross-tenant blast radius — one
  leaked secret reads every tenant's code.
- **Lifecycle:** long-lived registry passwords in `Secret`s are a rotation and audit liability
  (CLAUDE.md §5.3 wants short-lived, manager-issued secrets).
- **BYO registry:** enterprises want their agents pulled from *their* registry with *their*
  credential, scoped and revocable.

The goal: **each tenant pulls only its own images, with credentials that auto-expire and
auto-refresh, that no human ever copies, and that can be revoked per tenant in one action.**

---

## 2. Two registry topologies (both must be first-class)

| Topology | Who uses it | Image location | Credential source |
| --- | --- | --- | --- |
| **Actrone-managed per-tenant ECR** (default) | `kind: code` builds + managed image hosting | a per-tenant ECR repo namespace `actrone/<tenant_id>/<agent_id>` | ESO **ECRAuthorizationToken generator** (12 h, auto-refresh), IAM-scoped to the tenant's repos |
| **Bring-your-own registry** | enterprise `kind: image` (GHCR/ECR/Artifactory/…) | the tenant's own registry | the tenant's credential stored in **Vault** per-tenant, synced to a `dockerconfigjson` Secret by ESO/VSO |

Both converge on the same runtime contract: a `kubernetes.io/dockerconfigjson` **Secret in the
tenant's pool namespace**, referenced by `harness-pool` `image.pullSecret` (and the build pod's push
secret). The *source* of that Secret differs; the *consumption* is identical.

---

## 3. Mechanism: External Secrets Operator (+ Vault) — decision

**Decision: adopt External Secrets Operator (ESO) as the sync engine, with two providers.** ESO is
the 2026-standard Kubernetes secret-sync controller and has exactly the generators we need:

### 3.1 Managed ECR — the `ECRAuthorizationToken` generator
ECR's `GetAuthorizationToken` issues a **12-hour** token; ESO's `ECRAuthorizationToken` generator
calls it and **refreshes the Secret before expiry**, so the pull secret is always valid and never
stored long-term. ESO authenticates to AWS via **IRSA** (a dedicated, least-privilege role), and
**per-tenant scoping is enforced by IAM/repo policy** — the role/token can only `ecr:GetDownloadUrl`
+ `BatchGetImage` on `actrone/<tenant_id>/*`, never another tenant's prefix.

```
ExternalSecret (tenant ns) ──uses──► ECRAuthorizationToken generator ──IRSA──► ECR GetAuthorizationToken
        │ refreshInterval: 6h (well inside the 12h validity)
        ▼
  Secret  type=kubernetes.io/dockerconfigjson   (auto-rotated, scoped to this tenant's repos)
        ▲
  harness-pool image.pullSecret   /   build pod push secret
```

### 3.2 BYO registry — Vault per-tenant path
The tenant's registry credential (or a token) is stored at a **per-tenant Vault path**
(`secret/tenants/<tenant_id>/registry`), and ESO's Vault provider (or the **Vault Secrets
Operator**) syncs it into a `dockerconfigjson` Secret in the tenant namespace. Vault's
**dynamic-secrets** engines (AWS, etc.) let even BYO-AWS registries issue short-lived creds; static
BYO tokens are stored sealed and rotated on the tenant's cadence.

> **Why ESO over hand-rolled refresh:** a "renew the ECR token every N hours" cron in the
> orchestrator is exactly the undifferentiated, error-prone secret plumbing ESO exists to remove.
> ESO is declarative, battle-tested, multi-namespace-aware (`ClusterExternalSecret`), and keeps the
> credential lifecycle *out* of application code (CLAUDE.md §5.3). The orchestrator declares the
> *binding*; ESO runs the *refresh*.

---

## 4. Per-tenant isolation — the guarantees, end to end

1. **Pull scope (managed ECR):** the IAM policy behind the ESO role grants pull only on
   `arn:aws:ecr:…:repository/actrone/<tenant_id>/*`. Tenant A's pull token **cannot** read tenant
   B's repo — enforced at AWS IAM, not just by Secret placement.
2. **Repo policy:** each tenant ECR repo additionally carries a repository policy pinning access to
   the Actrone account principals — defence in depth.
3. **Secret placement:** the `dockerconfigjson` Secret lives in the tenant's pool namespace (or is
   named per-tenant in `actrone-harness` with RBAC restricting cross-pool reads). A pool can mount
   only its own pull secret.
4. **Push vs. pull separation:** the **build pod** gets a *push* token scoped to the single repo it
   is building into; the **harness pod** gets a *pull* token. Distinct least-privilege grants — a
   compromised running agent cannot push a poisoned image.
5. **Image provenance check still applies:** even with a valid pull secret, the bundle `Verifier`
   confirms the digest + (per the build plan) the Actrone signature before a pool runs it — so a
   stolen pull token alone cannot inject an unsigned image.

---

## 5. Orchestrator's role (control-plane wiring)

The orchestrator owns the **binding**, ESO owns the **refresh**. On the relevant lifecycle events:

- **Tenant onboarding (or first hosted deploy):**
  - *Managed path:* provision the per-tenant ECR repo namespace (Terraform-managed prefix + repo
    policy, or an idempotent control-plane call) and create the `ExternalSecret` (ECR generator) in
    the tenant's pool namespace.
  - *BYO path:* accept the tenant's registry credential over an authenticated, SSRF-screened flow,
    write it to the per-tenant Vault path (never to the DB, never logged), and create the Vault
    `ExternalSecret`.
- **Pool render (existing `dataplane` reconciler):** set `harness-pool` `image.pullSecret` to the
  tenant's Secret name. The Argo CD Application already carries per-tenant values — this is one more.
- **Revocation / offboarding:** delete the `ExternalSecret` (Secret disappears within a refresh
  cycle) and revoke the IAM/Vault policy → the tenant can no longer pull, in one action, auditable.
- **Rotation:** automatic for managed ECR (ESO, 6 h refresh); for BYO, a Vault path update
  propagates on the next sync — no pod restart needed (kubelet re-reads the pull secret).

A typed `internal/registrybinding` (or extend `internal/dataplane`) seam models
`tenant → {topology, repo ARN | vault path, pull-secret name}` so the renderer and the build push
side resolve the same binding (single source of truth, the gatewaytrust/`HarnessTaskQueue`
discipline).

---

## 6. Security posture

- **No long-lived registry secrets** anywhere in git, the DB, or app config. Managed ECR tokens are
  12 h and auto-refreshed; BYO creds live only in Vault, sealed.
- **Least privilege per tenant** at the IAM layer, not just by convention — the strongest isolation
  boundary AWS offers.
- **IRSA, not node credentials:** ESO assumes a dedicated role via IRSA; we do **not** put broad ECR
  pull on the node instance role (which would let *any* pod on the node pull *any* repo — the
  anti-pattern this plan exists to avoid).
- **Never logged:** registry creds and tokens are scrubbed from logs/audit (CLAUDE.md §5.2); the
  audit spine records the *binding event* (tenant, repo, actor), not the secret.
- **BYO intake is SSRF-screened** (reuse `mcp.SafeHTTPClient`) — a tenant-supplied registry URL is
  untrusted input.

---

## 7. The moat angle

- **"Your images never commingle"** is a concrete, IAM-enforced, sellable multi-tenancy guarantee —
  not a policy assertion. It pairs with the per-tenant pool + egress-lock (P6-C/P6-D-P2) and the
  signed-build provenance (build plan §7) into a single story: *isolated build, isolated registry,
  isolated runtime, cryptographic provenance end to end.*
- **BYO-registry federation** is an enterprise wedge: keep your images in *your* Artifactory/ECR
  under *your* compliance regime, and Actrone runs them governed — without you handing over a
  standing credential (short-lived, Vault-brokered, revocable).
- **Zero-standing-secret operations** (Vault dynamic + ESO refresh) is exactly what security
  reviewers in regulated buyers look for; it shortens enterprise procurement.

---

## 8. Phased rollout

| Phase | Deliverable |
| --- | --- |
| **S1 — managed ECR, per tenant** | Install ESO; dedicated IRSA role; per-tenant ECR repo namespacing + IAM scoping; `ExternalSecret` (ECR generator) per pool; wire `harness-pool image.pullSecret`; orchestrator binding model + provisioning on first hosted deploy. |
| **S2 — build push side** | Scoped single-repo push token for build pods (pairs with the build plan); push/pull privilege separation. |
| **S3 — BYO registry** | Vault per-tenant paths + ESO Vault provider (or VSO); authenticated SSRF-screened BYO-cred intake; rotation/revocation flows; **enterprise-premium Control-Tower "connect a registry" UX** (see below). |
| **S4 — hardening** | `ClusterExternalSecret` where shared; offboarding teardown; per-tenant IAM policy tests; audit of every binding/rotation. |

---

## 8A. Connect-a-registry UI/UX — enterprise-premium

The BYO-registry intake (S3) is a security-sensitive form, so it must feel **enterprise-premium and
trustworthy**, built on the shared design system (the
[VCS plan §6A](./Actrone_VCS_Connected_Deploy_Plan.md) vocabulary — Geist-benchmarked, 100%
token-driven, responsive 375/768/1280/1920 px, light+dark, WCAG-AA):

- **Registry-type chooser** (`/settings/integrations` → "Registry") — cards for ECR / GHCR /
  Artifactory / generic OCI via the SVG brand-mark system (**never emoji**); managed-ECR shows as the
  zero-config default ("Actrone-managed, nothing to do").
- **Credential intake** — a focused Radix `Dialog`: registry URL (validated on blur, **SSRF-screened
  server-side**), credential fields rendered as **write-only secret inputs** (masked, never echoed
  back, paste-friendly), with an explainer `TipCard` stating the credential is brokered to **Vault,
  never stored in our DB or logs**. A **"Test connection"** action runs a scoped, read-only probe and
  returns a designed success/error state (clear, non-leaky error copy — never a raw provider stack).
- **Connected state** — registry, scope, **last-rotated** relative time, and a **rotate/revoke**
  control (revoke = one auditable action, per §5). Status pill is token-driven (`StatusDot`).
- **States are mandatory:** skeleton while probing, empty state ("No custom registry — using
  Actrone-managed ECR"), designed error state on probe/rotation failure. Constant-time, no-leak copy;
  visible focus rings; `aria-label`s on icon-only rotate/revoke buttons; contrast ≥ 4.5:1 both themes.

---

## 9. Alternatives considered & rejected

- **Single shared platform pull secret (status quo).** Rejected for multi-tenant — no isolation,
  long-lived, manual rotation. Kept only for the public base image.
- **Static per-tenant `imagePullSecrets` (hand-managed dockerconfigjson).** Rejected — long-lived,
  manual rotation, drifts, and a leaked Secret is valid indefinitely.
- **Node-level ECR access via the node instance role / `ecr-credential-helper`.** Rejected — grants
  *every* pod on the node registry access (node-wide, not per-tenant); the opposite of isolation.
- **Orchestrator-managed token refresh cron.** Rejected — reinvents ESO, puts secret lifecycle in
  app code, and is a reliability/security footgun.

---

## 10. Resolved decisions

> Decided 2026-06-21. Theme: stay AWS-native and managed; defer Vault until a dynamic-secret need
> pulls it in.

1. **Vault now, or later? → Later. AWS Secrets Manager (via ESO) for BYO storage at S3; Vault only
   when dynamic secrets are needed.** We are already all-in on EKS/IRSA/KMS. ASM-via-ESO gives
   per-tenant paths, KMS encryption, IAM-scoped access, and **ESO speaks it natively** — without
   Vault's operational tax (HA, unseal/recovery, audit device, upgrade treadmill). Vault earns its
   place later for one specific capability: **dynamic-secrets engines** (e.g. issuing short-lived
   creds for a BYO-*AWS* registry, or brokering an on-prem source — see the VCS plan's Edge
   Connector). The same answer governs VCS App private keys: **ASM now, Vault later.** This collapses
   S3 from "stand up Vault" to "add the ASM provider to ESO."
2. **ECR namespacing → repo-per-agent under a per-tenant prefix (`actrone/<tenant_id>/<agent_id>`).**
   Repo count is effectively free — ECR bills storage + transfer, not repos; the only ceiling is the
   ~10k-repos-per-region soft quota (raisable; request proactively). Per-agent buys per-agent
   lifecycle (delete agent → delete repo → all its images gone), per-agent repo policy, and tighter
   blast radius — while **IAM isolation stays at the tenant prefix** (`actrone/<tenant_id>/*`), so the
   security boundary is unchanged. A lifecycle policy (keep last *N* digests) bounds storage growth.
3. **Cross-region pull → region-pinned by default; replication opt-in for HA, forbidden for
   residency-locked tenants.** Residency means data must *not* leave the region, so residency-locked
   tenants get **no replication** — region-pinned ECR repo + per-region ESO IRSA role; build, push,
   and pull all in-region. Cross-region replication becomes an **opt-in HA feature** for tenants who
   explicitly want it. Region is a property of the tenant/agent binding, driven by the
   [Data Residency Plan](./Actrone_Data_Residency_Plan.md) regional data plane.
4. **Refresh vs. ECR rate limits → ~8 h refresh + jitter/stagger, `ClusterExternalSecret` templating,
   monitor and raise the quota.** The auth token is registry-wide but **scoped by the calling IAM
   identity** at pull time, so per-tenant-role tokens are still required (isolation holds). To avoid a
   `GetAuthorizationToken` storm: lengthen refresh to ~8 h (still well inside the 12 h validity, ~⅓
   fewer calls), **jitter/stagger** so refreshes don't align, template via `ClusterExternalSecret`,
   and watch the API-call rate. Escape hatch if it bites at scale: a single broker role using
   `AssumeRole` + per-tenant session policies instead of thousands of standing roles — **build that
   only when the metrics demand it**, not pre-emptively.

---

## Sources (2026 research)

- [ESO — AWS ECR `ECRAuthorizationToken` generator (12 h tokens, auto-refresh)](https://external-secrets.io/v0.8.1/api/generator/ecr/) ·
  [ESO PushSecret & Generators](https://www.wasilzafar.com/pages/series/distributed-systems-k8s/external-secrets-part02-pushsecret-generators.html)
- [HashiCorp Vault Secrets Operator (dynamic secrets → K8s Secrets)](https://github.com/hashicorp/vault-secrets-operator) ·
  [Vault Secrets Operator docs](https://developer.hashicorp.com/vault/docs/deploy/kubernetes/vso/sources/vault)
- [ESO with HashiCorp Vault backend (2026)](https://oneuptime.com/blog/post/2026-02-09-external-secrets-operator-hashicorp-vault/view) ·
  [Docker registry image pull secrets in Kubernetes (2026)](https://oneuptime.com/blog/post/2026-02-08-how-to-use-docker-registry-with-kubernetes-image-pull-secrets/view)
