# P6-B `kind: code` Build Data Plane — Cluster Rollout Runbook

> **Audience:** Matt (platform operator).
> **Scope:** the cluster + cloud steps to turn on **source builds** — a developer uploads a
> project tarball and Actrone builds, signs, and pushes a per-tenant image with rootless
> BuildKit on an isolated Fargate microVM data plane. The whole control + data path is
> **already built and offline-validated** in `backend/orchestrator` (intake → durable
> `BuildAgentImageWorkflow` → digest resolve → verify→scan→ready) and `infra/`; this is the
> remaining "what needs you + a cluster".
>
> **Last updated:** 2026-06-21 · **Owner:** Matt · **Status:** code + charts + terraform built, cluster rollout pending
>
> **Status refreshed 2026-07-13 (code-verified):** the control/data path is still fully present and
> code-complete — `internal/{codeintake,objectstore,buildflow,ecr,build}`, the durable
> `BuildAgentImageWorkflow`, and `infra/terraform/modules/eks/{build-dataplane,build-source-store,
> build-dependency-mirror}.tf` (note: the CodeArtifact pull-through mirror the §2 lockdown paragraph
> anticipates now exists as `build-dependency-mirror.tf`). The live BuildKit run + ESO/Karpenter
> install are **still cluster-pending** (`infra/docs/Actrone_Deployment_Runbook.md` 2026-07-12).
> **§8 "VCS V1" is now understated (under-claim):** VCS-connected deploy has since shipped V1–V4 for
> **all three providers** — GitHub App per-tenant installation-token minting **and** GitLab/Bitbucket
> vault-stored repo-scoped tokens (`internal/vcs` + `internal/vcsconnect.MintingTokenSource`), plus
> per-host GHES App registration. The §8 note's "today a single platform-wide token / GitHub-only"
> caveat is stale — corrected inline. See the VCS-Connected Deploy Plan for the authoritative status.

---

## 0. What's already built vs. what this runbook covers

| Already in the repo (no action needed) | This runbook (needs you + a cluster) |
| --- | --- |
| Intake API + service (`internal/codeintake`), SSE-KMS object store (`internal/objectstore`), tar inspector (`internal/buildflow`) | `terraform apply` the build data plane (Fargate profile, source bucket+KMS, IRSA roles, egress SG) |
| ECR digest resolver (`internal/ecr`), durable `BuildAgentImageWorkflow` + BuildKit Job renderer (`internal/build`) | Install External Secrets Operator (ESO) + (optional) Karpenter build-burst pool |
| B2 supply chain: BuildKit SLSA provenance + SBOM, cosign keyless signing | Apply the `actrone-build` namespace + ServiceAccounts + egress SecurityGroupPolicy |
| Helm: orchestrator SA (IRSA) + `build.*` config wiring | Publish the digest-pinned harness-base / builder / fetch / cosign images |
| Terraform: `build-dataplane.tf` (Fargate + ESO ECR roles) + `build-source-store.tf` (bucket/KMS/IRSA/egress) | Set orchestrator `serviceAccount.roleArn` + `build.*` values, then `helm upgrade` and flip `build.enabled` |

**Security invariant to preserve:** a build pod runs **untrusted customer source** through
rootless BuildKit. It may reach only the staged-source bucket, the per-tenant ECR, the
dependency source, DNS, and (for signing) Sigstore — never the metadata endpoint, other
tenants, or arbitrary internal hosts. The source SHA is computed by the orchestrator and
**re-verified inside the sandbox before the build runs**; the authoritative image digest is
read back from ECR by the control plane, never trusted from the pod. Fail closed: the engine
validates every image is digest-pinned at startup and refuses to run otherwise.

---

## 1. Local tooling

Same as the [P6-A runbook §1](./Actrone_P6A_Cluster_Rollout_Runbook.md) (helm, terraform,
kubectl, kubeconform) plus an authenticated kubeconfig and AWS admin. No new tools.

---

## 2. Build data plane (Terraform)

`terraform apply` in your env (`infra/terraform/envs/<env>`). The EKS module already contains
both build files; review the plan, then apply. New resources:

- **`build-dataplane.tf`** (B1): Fargate profile for `actrone-build`; ESO IRSA roles
  `*-eso-ecr-push` (build pods) and `*-eso-ecr-pull` (harness pods), scoped to `actrone/*`.
- **`build-source-store.tf`** (the seams): a KMS CMK + SSE-KMS S3 source bucket
  (`<cluster>-actrone-build-sources-<account>`, TLS-only, public-access blocked, lifecycle
  expiry `build_source_retention_days` = 7d); the `actrone-build` pod IRSA role (S3 read
  `sources/*` + KMS decrypt); the `orchestrator-build-control` managed policy (ECR
  DescribeImages + S3 stage/inspect + KMS); and a deny-by-default `*-build-egress` SG.

**Lockdown decision (variable `build_allow_public_egress`, default `true`):** a source build
fetches dependencies (PyPI/npm) and signs via public Sigstore over 443. For the locked-down
enterprise mode, set it `false` and provide `build_vpc_endpoints_security_group_id` — deps
then come from a CodeArtifact mirror and signing from a private Sigstore, with no internet
egress (source/ECR/KMS/STS stay reachable in-VPC).

Capture the outputs (you'll wire them in §6):

```
terraform output build_source_bucket
terraform output build_source_kms_key_arn
terraform output build_pod_role_arn
terraform output eso_ecr_push_role_arn
terraform output orchestrator_build_control_policy_arn
terraform output build_egress_security_group_id
```

Attach `orchestrator_build_control_policy_arn` to the orchestrator's IRSA role (the role you
set as `serviceAccount.roleArn` in §6).

---

## 3. External Secrets Operator + (optional) Karpenter build pool

1. **Install ESO** (cluster-only; pin the chart version) so the `ECRAuthorizationToken`
   generator and `ExternalSecret` CRDs exist. The orchestrator renders one push
   `ExternalSecret` per agent at deploy time (template
   `infra/k8s/build/10-eso-ecr-push-secret.example.yaml`); the harness pull secret is the
   sibling `11-…`.
2. **(Optional) Karpenter build-burst pool** — only if builds outgrow Fargate's per-task
   limits. Substitute `<cluster-name>` discovery tags in
   `infra/k8s/build/20-karpenter-build-pool.example.yaml` and apply. Builds default to
   Fargate microVMs (no action), so this is an opt-in escape hatch.

---

## 4. Namespace, ServiceAccounts, egress (kubectl)

```
kubectl apply -k infra/k8s/build          # the actrone-build namespace
```

Then substitute the terraform ARNs/IDs into the placeholder manifests and apply each:

| File | Placeholder → terraform output |
| --- | --- |
| `01-serviceaccounts.example.yaml` | `<build-pod-role-arn>` → `build_pod_role_arn`; `<eso-ecr-push-role-arn>` → `eso_ecr_push_role_arn` |
| `30-build-egress-securitygrouppolicy.example.yaml` | `<build-egress-sg-id>` → `build_egress_security_group_id` |

The `actrone-build` SA is the build pod identity (its fetch container reads the encrypted
source); the egress SecurityGroupPolicy binds every build pod to the deny-by-default SG at the
ENI (the enforcement that holds on Fargate, where a NetworkPolicy does not).

---

## 5. Publish the digest-pinned build images

The engine **fails fast** at startup unless every build image is digest-pinned. Publish and
record the digests:

- **harness-base** (`harnessBaseImage`) — the published runtime the generated Dockerfile builds
  `FROM`; owns the entrypoint (`run_framework_step`) and the non-root user.
- **builder** (`builderImage`) — rootless BuildKit, e.g. `moby/buildkit:rootless@sha256:…`.
- **fetch** (`fetchImage`) — an image with `aws` + `tar` + `sha256sum`, e.g.
  `amazon/aws-cli@sha256:…`.
- **cosign** (`cosignImage`, only if `cosign: true`) — `ghcr.io/sigstore/cosign@sha256:…`.

---

## 6. Wire the orchestrator + flip on

In your env values for the orchestrator subchart:

```yaml
serviceAccount:
  roleArn: "<orchestrator IRSA role — has orchestrator_build_control_policy attached>"
build:
  enabled: true
  harnessBaseImage: "ghcr.io/actrone/harness-base@sha256:…"
  ecrRegistryHost: "<account>.dkr.ecr.<region>.amazonaws.com"
  builderImage: "moby/buildkit:rootless@sha256:…"
  fetchImage: "amazon/aws-cli@sha256:…"
  sourceBucket: "<terraform build_source_bucket>"
  sourceKmsKeyId: "<terraform build_source_kms_key_arn>"
  sourceRegion: "<region>"
  attestations: true            # SLSA provenance + SBOM
  cosign: true                  # keyless signing — "builder of record"
  cosignImage: "ghcr.io/sigstore/cosign@sha256:…"
  builderIdentity: "https://<cluster-oidc>/…/actrone-build"  # expected keyless subject
```

```
helm upgrade actrone ./infra/helm/actrone -n actrone -f <env-values>.yaml
kubectl -n actrone logs deploy/actrone-orchestrator | grep build.engine.enabled
```

A clean startup logs `build.engine.enabled` with the source bucket. A misconfiguration
(unpinned image, missing bucket/KMS, cosign without identity) **fails the pod at boot** — that
is the intended fail-closed behaviour, not a regression.

---

## 7. Smoke test

```
# A byof_hosted, kind:code agent must already exist (register it first).
curl -sS -X POST https://api.actrone.com/v1/agents/$AGENT_ID/code-bundles \
  -H "Authorization: Bearer $ACTRONE_API_KEY" \
  -F manifest=@agent.json \
  -F build_size=build-medium \
  -F source=@project.tar.gz            # files at the archive ROOT (tar -C dir -czf - .)
# → 202 {"bundle":{… status:"building" build_status:"queued" …}}

# Poll the bundle; it converges building → verifying → scanning → ready.
curl -sS https://api.actrone.com/v1/agents/$AGENT_ID/bundles/$BUNDLE_ID \
  -H "Authorization: Bearer $ACTRONE_API_KEY"
```

Verify in-cluster: a `build-<bundleID>` Job appears in `actrone-build`, runs fetch → buildkit
(→ cosign if enabled), and completes; the image lands at `actrone/<tenant>/<agent>:bundle-<id>`
in ECR; the bundle's `image_ref` pins the resolved `@sha256:` digest; with `cosign: true`,
`cosign verify --certificate-identity <builderIdentity> …` succeeds.

**Rollback:** set `build.enabled: false` and `helm upgrade`. Nothing build-related registers and
`kind: code` deploys are rejected at registration again — existing image-bundle deploys are
unaffected throughout.

---

## 8. Still open (tracked, not blocking this rollout)

- **B2 referrer-digest surfacing:** the bundle currently records the attestation *predicate
  types* (SLSA provenance / SPDX SBOM) + the cosign builder identity; the artifacts travel in
  the image index + Rekor. Resolving the exact OCI referrer digests is a follow-up.
- **VCS V1 (built):** GitHub source intake is now implemented — `POST
  /v1/agents/{id}/code-bundles/vcs` fetches a repo at a ref via the host tarball API
  (`internal/vcs` + `internal/vcsintake`), repacks it to the archive-root contract, and
  feeds the SAME staging + `BuildAgentImageWorkflow` as a tarball upload. Enable with
  `build.vcs.enabled: true` (requires `build.enabled`); optional credential
  `ORCHESTRATOR_BUILD_VCS_TOKEN` via the orchestrator-secrets Secret (anonymous ⇒ public
  repos). GitHub Enterprise Server via `build.vcs.githubApiBase` +
  `build.vcs.allowPrivateHosts`. The fetch uses the SSRF/DNS-rebinding-screened client.
  Smoke test:
  `curl -X POST …/code-bundles/vcs -d '{"provider":"github","owner":"acme","repo":"agent","ref":"main","manifest":{…}}'` → 202,
  then poll the bundle exactly as the upload path. ~~*Open follow-up:* per-tenant GitHub App
  installation tokens (today a single platform-wide token), and webhook auto-build on push.~~
  **DONE (verified 2026-07-13):** per-tenant GitHub App installation-token minting
  (`internal/vcs/token_github_app.go` + `internal/vcsconnect`), GitLab/Bitbucket vault-stored
  repo-scoped tokens, and HMAC-verified webhook auto-build on push all shipped for **all three
  providers** (VCS-Connected Deploy Plan V1–V4). The single-platform-token line is superseded.
- **Per-tenant token scoping (S4):** session-policy-scoped ECR tokens per tenant (the baseline
  isolates push/pull roles + constrains both to `actrone/*`).
