# Actrone Code-Bundle Build Infrastructure Plan (`kind: code`)

> **Status:** 🟡 B1 + B2 BUILT / dormant (verified by code audit 2026-07-04 — the old "not built" header was
> STALE). Built + flag-gated (`NoopBuilder` default, fail-closed OFF): `internal/build/` (`builder.go`,
> `k8s_builder.go` real BuildKit-over-K8s pod, `plan.go`, `detect.go`, `dockerfile.go`), `internal/buildflow`
> (durable `BuildAgentImageWorkflow`), `internal/codeintake`, `domain/bundle.go`(+`buildsize.go`), `infra/k8s/build/`.
> B2 supply-chain fields (`ProvenanceRef`/`SBOMRef`/`BuilderIdentity`, SLSA/SPDX predicates) scaffolded.
> **Remaining:** live-cluster BuildKit run (deploy-gated), CodeArtifact pull-through mirror, **B4** (TS/Node
> harness builds + Buildpacks tier) unbuilt. **Owner:** Matt. **Scope:** the build pipeline that turns a
> developer's *source* (`spec.runtime.bundle.kind: code`) into a signed, attested, scanned container
> image the harness data plane can run — the "push source, we build it" (Vercel-grade) path.
> **Depends on:** P6-C data plane (harness pools, Fargate/gVisor isolation, KEDA) + the shipped
> bundle control plane (`internal/bundle`, `internal/registry`) + [Per-Tenant Registry Secrets Plan](./Actrone_Per_Tenant_Registry_Secrets_Plan.md).
> **Last updated:** 2026-06-21.
>
> **Status refreshed 2026-07-13 (code-verified):** the 2026-07-04 header still holds; two updates.
> (1) **CodeArtifact pull-through mirror now EXISTS** — `infra/terraform/modules/eks/
> build-dependency-mirror.tf` is present (Decision §10.1's B2 swap), so "CodeArtifact pull-through
> mirror" should no longer read as fully un-built; the wiring/turn-up remains deploy-gated. (2) The
> live-cluster BuildKit run is **still pending** (`infra/docs/Actrone_Deployment_Runbook.md`
> 2026-07-12), and **B4** (TS/Node harness builds + Buildpacks) is **still unbuilt** — confirmed.
> The B3 git-connect front-end this plan defers to the VCS plan has since shipped in code (see that
> plan's 2026-07-13 note). Package inventory reconfirmed: `internal/{build,buildflow,codeintake}`
> all present.

---

## 1. Goal & the one-sentence thesis

Let a developer ship a hosted agent **without writing a Dockerfile or running CI**: push source
(`actrone deploy` with a code bundle, or git-connect), and Actrone **builds it on the published
harness base image, generates an SBOM, signs it keylessly, emits SLSA build provenance, scans it,
and pins the digest** — then it flows into the *exact same* `verify → scan → ready → promote`
machinery that `kind: image` already uses. The output is indistinguishable from a customer-built
image except that **Actrone is the builder of record**, which is precisely the moat (§7).

Today `kind: code` is **rejected at validation** (`validateRuntime`, mirroring how `strategy:
stepwise` was gated) — deliberately, so it never enters a path that fails later at deploy. This
plan is what un-gates it.

---

## 2. Why this was deferred, and what changed

`kind: image` needs **zero** build infra on our side: the customer's CI builds `FROM` the Actrone
harness base image and we only verify+scan the pinned digest. That is the enterprise-credible path
and it shipped first. `kind: code` is deferred because it requires us to **run a build of untrusted
source** — which is a security and supply-chain surface, not a convenience feature. Two things now
make it tractable:

1. **The P6-C data plane already isolates untrusted compute** (Fargate microVM / gVisor on EC2,
   deny-by-default egress, KEDA scale-to-zero). A build pod is just another untrusted, ephemeral,
   egress-locked workload — the same substrate, a different image.
2. **The 2026 toolchain is ready.** Google **archived Kaniko in June 2025**; **rootless BuildKit**
   is the actively-developed standard (richer caching, multi-arch, build secrets, no privileged
   pod), and **Sigstore (cosign keyless + Fulcio + Rekor) + SLSA provenance** are mature enough to
   make "every hosted agent image is signed and has verifiable provenance" a product feature, not a
   research project.

---

## 3. Build-tool decision: rootless BuildKit (Kaniko rejected, Buildpacks optional)

| Option | Verdict | Why |
| --- | --- | --- |
| **Rootless BuildKit** (`buildkitd` rootless, or `buildctl` one-shot) | **CHOSEN** | Actively maintained; rootless + no privileged pod; best-in-class caching (registry + inline); native multi-arch; first-class build secrets (never baked into layers); native SLSA provenance + SBOM attestation output (`--provenance`, `--sbom`). |
| **Kaniko** | **Rejected** | **Archived by Google, June 2025** (read-only; Chainguard fork is security-patch-only, no features). Building new infra on an archived tool is a CLAUDE.md §0.5 violation (dependencies must be actively maintained). |
| **Buildah / Podman** | Fallback | Viable rootless/daemonless; kept as a contingency if a BuildKit constraint emerges, but no daemon-caching story as clean as BuildKit's. |
| **Cloud Native Buildpacks** | Optional layer | A future "no Dockerfile, no base-image knowledge at all" tier for pure-Python/Node agents (auto-detect → build). Sits *on top of* the same pipeline; not the v1 mechanism. |

**Build engine runs rootless, daemonless-per-build:** one `buildkit` build per source bundle in an
ephemeral pod (no shared long-lived `buildkitd` across tenants — a shared daemon is a cross-tenant
cache-poisoning and blast-radius risk). Caching is via the **registry** (per-tenant ECR repo,
inline cache), not a shared local volume.

---

## 4. Architecture — the build runs on the harness data plane

A code build is an **untrusted, ephemeral, network-isolated job** — the same threat model as a
harness pod, so it reuses the same isolation primitives rather than inventing new ones.

```
actrone deploy (source) ──► POST /v1/agents/{id}/bundles  (kind=code)
        │ tarball                    │
        ▼                            ▼
  source object store         bundle row: status=pending
  (per-tenant prefix,         ────────────────────────────
   SSE-KMS, TTL'd)                   │ enqueue BuildAgentImageWorkflow (Temporal)
                                     ▼
                        ┌─────────────────────────────────────────┐
                        │  BUILD POD (ephemeral, KEDA-scaled)      │
                        │  Fargate microVM / gVisor on EC2         │
                        │  non-root, read-only rootfs, no SA token │
                        │  egress: ONLY source store + ECR + DNS   │
                        │  ───────────────────────────────────────│
                        │ 1. fetch source tarball (verified hash)  │
                        │ 2. detect framework → render Dockerfile  │
                        │    FROM ghcr.io/actrone/harness-base:X   │
                        │ 3. rootless BuildKit build               │
                        │    + --sbom + --provenance (SLSA)        │
                        │ 4. cosign sign (keyless, Actrone OIDC)   │
                        │ 5. push image+attestations → tenant ECR  │
                        └─────────────────────────────────────────┘
                                     │ digest + provenance ref
                                     ▼
              bundle row: status=verifying → scanning → ready
              (the EXISTING internal/bundle state machine continues)
                                     │ promote (P5-B gate)
                                     ▼
              dataplane.EnsurePool → Argo CD → harness pool runs it
```

### 4.1 Where the build pod runs
A dedicated `actrone-build` namespace (sibling to `actrone-harness`), Fargate-default with the
same gVisor option on EC2. Build pods are **larger and CPU-bound** (compilation, dependency
resolution) vs. harness pods (I/O-bound), so they get their **own pod-size catalogue**
(`build-small/medium/large`) and their **own Karpenter pool** — a build burst must never starve
running agents.

### 4.2 Scaling & durability
- **Durable orchestration:** a Temporal `BuildAgentImageWorkflow` (the build is long-running and
  must survive an orchestrator restart — exactly the durability the bundle plan flagged as the
  point where synchronous verify→scan moves into a workflow). Heartbeated activity, bounded
  attempts, idempotency-keyed by `(bundle_id)`.
- **Autoscaling:** KEDA on the build task-queue depth (same pattern as harness pools).
- **Caching:** registry inline cache keyed per agent so re-deploys of the same agent reuse layers;
  base-image layers are always warm.

### 4.3 The build steps, concretely
1. **Source intake** — `actrone deploy` uploads a tarball to a per-tenant object-store prefix
   (SSE-KMS, lifecycle-expired in 24 h). The bundle row records the source SHA-256; the build pod
   verifies it before building (tamper-evident).
2. **Framework detection** — `requirements.txt` / `pyproject.toml` (Python) or `package.json`
   (TS, future) → choose the base-image variant + dependency-install recipe. No customer Dockerfile
   needed; we **generate** a minimal, hardened one `FROM` the pinned harness base.
3. **Build** — rootless BuildKit, `--provenance=mode=max --sbom=true`, no network during the build
   except the dependency index (locked-down egress allowlist: PyPI/npm mirror only), build secrets
   mounted via BuildKit secrets (never layer-baked).
4. **Sign + attest** — `cosign sign` keyless against an **Actrone Fulcio/OIDC identity** (the build
   workflow's workload identity), pushing the signature + the SLSA provenance + SBOM as OCI
   referrers alongside the image.
5. **Push** — to the **per-tenant ECR repo** with short-lived scoped credentials (see the
   [Secrets Plan](./Actrone_Per_Tenant_Registry_Secrets_Plan.md)).
6. **Hand off** — emit the resulting **digest** onto the bundle; the existing `Verifier` confirms
   reachability + signature, the existing `Scanner` runs Trivy/SBOM, and the bundle reaches `ready`
   — converging the two ingestion paths into one.

---

## 5. Data-model, API & CLI changes

- **`BundleSpec.Kind = "code"`** un-gated in `validateRuntime` *only when the build feature flag is
  on*; `ref` becomes the **source object key** (not an image digest) on intake, and is replaced by
  the built digest on completion.
- **`domain.Bundle`** gains: `SourceObjectKey`, `SourceSHA256`, `BuildStatus`
  (`queued → building → built → build_failed`), `ProvenanceRef`, `SBOMRef`, `BuilderIdentity`.
  A new pipeline stage **`building`** precedes `verifying` for code bundles (image bundles skip it).
- **Build pod-size catalogue** — `internal/domain/buildsize.go` (mirrors `podsize.go`): tier-gated
  `build-small/medium/large`, distinct from harness pod sizes, billed as build-minutes.
- **API:** `POST /v1/agents/{id}/bundles` accepts a `multipart/form-data` source upload (or a
  pre-signed-URL handshake) when `kind=code`; `GET …/bundles/{id}` surfaces build logs (streamed
  from the build pod via the orchestrator, scrubbed) + provenance/SBOM links.
- **CLI:** `actrone deploy` detects no local image → tarballs the working dir (respecting
  `.actroneignore`) → uploads → polls the build. One verb, two kinds, unchanged UX.
- **Frontend (enterprise-premium):** the Deployments surface (the
  [VCS plan §6A](./Actrone_VCS_Connected_Deploy_Plan.md) spec, shared design system — Geist-benchmarked,
  100% token-driven, responsive 375/768/1280/1920 px, light+dark, WCAG-AA) gains a **Build** step in
  the pipeline stepper (`Building → Validating → Live`, vs. image's `Validating → Live`). A premium
  **live build-log viewer**: monospace (Geist Mono), virtualized/auto-scrolling with a pause-on-scroll
  affordance, ANSI-aware, a **skeleton** while the stream connects, a designed **error state** (failing
  step highlighted, "Retry"/"View logs") — never a raw dump or blank panel. On success, an animated
  **provenance/"Verified Build" badge** (SLSA L3 · signed · scanned) opens a popover with the
  SBOM, cosign certificate, and Rekor entry. All async states (loading/empty/error) designed;
  `prefers-reduced-motion` respected on the stepper/badge animation.

---

## 6. Security posture (running a build of untrusted source)

- **Isolation:** build pod = microVM (Fargate) or gVisor (EC2); non-root, read-only rootfs, all
  caps dropped, no service-account token, seccomp `RuntimeDefault`. **Rootless BuildKit** so even
  inside the sandbox the build is unprivileged.
- **Network:** deny-by-default egress (NetworkPolicy + security-groups-for-pods, per P6-D-P2) —
  ONLY the source store, the per-tenant ECR, the dependency mirror, and DNS. No metadata endpoint,
  no other tenant, no arbitrary internet. A malicious `setup.py`/post-install script has nowhere
  to exfiltrate to.
- **No ambient credentials:** the build pod never holds long-lived registry creds; it receives a
  **short-lived, single-repo push token** (ECR 12 h token scoped to the tenant repo) — see the
  Secrets Plan. The cosign keyless identity is the *workflow's* OIDC identity, not a stored key.
- **Resource caps:** CPU/memory/time bounded per build size; a runaway build is killed (Temporal
  activity timeout) and billed.
- **Supply-chain integrity:** dependency installs pinned where lockfiles exist; SBOM generated for
  *every* build; HIGH/CRITICAL scan gate reused unchanged; mutable base tags forbidden.

---

## 7. The moat — a governed software factory, not just "we build it"

Convenience ("push source, get a running agent") is table stakes and easily copied. The durable
moat is that **every hosted agent image carries Actrone-issued, verifiable supply-chain
provenance**, and the *runtime governs on it*:

1. **SLSA Build L3 by construction.** The build runs on isolated, Actrone-controlled infrastructure
   with the signing identity isolated from user-controlled build steps — the SLSA L3 bar. We emit
   provenance for *every* hosted agent, including `kind: image` (we attest "this digest was
   verified + scanned by Actrone on <date>"). Competitors who only run the loop cannot make that
   claim.
2. **Keyless signing tied to identity (Sigstore).** cosign + Fulcio + Rekor: no long-lived keys,
   every signature transparency-logged. The gateway can then enforce **"this pool may only run an
   image whose provenance Actrone signed"** — closing the loop with the P6-A/edge governance and the
   harness egress-lock. Governance becomes *cryptographically* unbypassable, not just
   policy-asserted.
3. **The compliance artifact enterprises actually need.** Per-deploy SBOM + provenance + scan +
   audit-spine entry = an exportable, regulator-ready supply-chain record per agent. This is the
   wedge into regulated buyers (finance, health, gov) and the basis for a future **"Actrone Verified
   Build"** marketplace badge that a BYO-registry image can never earn.
4. **Reproducibility & residency.** Deterministic, region-pinned builds (source never leaves the
   region) extend the [Data Residency Plan](./Actrone_Data_Residency_Plan.md) to the *build* step —
   a differentiator for sovereignty-sensitive buyers.

In short: image-only made us a safe *runtime*; the build factory makes us the *system of record for
how every agent was produced* — a far stickier position.

---

## 8. Phased rollout

| Phase | Deliverable |
| --- | --- |
| **B1 — build core** | `actrone-build` namespace + Karpenter pool + build-size catalogue; `BuildAgentImageWorkflow`; rootless BuildKit build pod; Python framework detection + generated Dockerfile; push to per-tenant ECR. Output flows into the existing verify→scan→ready. |
| **B2 — supply chain** | SBOM (syft) + SLSA `--provenance` + cosign keyless signing + Rekor; provenance/SBOM surfaced in Deployments; gateway "signed-by-Actrone" enforcement flag. |
| **B3 — DX polish** | streamed build logs, registry inline cache, `.actroneignore`; **git-connect auto-build (branch→env), PR preview builds — designed separately in the [VCS-Connected Deploy Plan](./Actrone_VCS_Connected_Deploy_Plan.md)** (GitHub/GitLab/Bitbucket, the ingestion front-end to this pipeline). |
| **B4 — reach** | TS/Node harness builds; Cloud Native Buildpacks "no-Dockerfile-at-all" tier; reproducible/region-pinned builds for residency. |

---

## 9. Alternatives considered & rejected

- **Build in the customer's CI only (status quo, image-only forever).** Rejected as the *sole*
  path: it forecloses the Vercel-grade DX and the "Actrone is builder of record" moat. Kept as a
  first-class *parallel* path (enterprises that must own their build pipeline).
- **Kaniko.** Rejected — archived June 2025 (§3).
- **A shared, long-lived `buildkitd`.** Rejected — cross-tenant cache poisoning + blast radius; we
  use ephemeral per-build pods with registry caching instead.
- **Privileged Docker-in-Docker.** Rejected outright — a privileged pod running untrusted source is
  a non-starter under CLAUDE.md §5.

---

## 10. Resolved decisions

> Decided 2026-06-21. Theme: managed AWS-native inputs + Fargate microVM isolation; defer
> gVisor-on-EC2 builds until a need forces them.

1. **Dependency mirror → pull-through cache (AWS CodeArtifact, PyPI + npm upstreams); allowlisted
   egress only as the B1 bootstrap.** CodeArtifact is a managed pull-through cache, in-region
   (residency-friendly), and makes us the **system of record for dependencies too** —
   quarantine/scan/pin/audit what entered a build, extending the supply-chain moat past the image into
   its inputs. Build pods then egress **only** to CodeArtifact + ECR + source store, no raw upstream
   internet. Ship allowlisted egress in B1 to unblock; swap to CodeArtifact in B2. Self-hosted
   Artifactory/Nexus is the enterprise BYO option later.
2. **Build-minute pricing/caps → meter build-minutes (activity-duration × build-size multiplier),
   tier the caps, keep abuse controls tier-independent.** Free: `build-small` only, ~100 build-min/mo,
   concurrency 1, ≤10 builds/hr. Startup: `build-medium`, higher cap, concurrency 3. Enterprise:
   `build-large`, high/overage, concurrency *N*, region pinning. **Abuse controls (all tiers):**
   per-tenant concurrent-build semaphore, builds-per-hour rate limit, **dedup identical source SHA**
   (don't rebuild the same commit — return the cached digest, free), exponential backoff on repeated
   failures. Cache hits bill little or nothing. Wired as a usage line in monetization §15.8.
3. **Base-image cadence → weekly rev + out-of-band on CRITICAL; tenant rebuild is severity × tier
   gated, governed promote either way.** The generated Dockerfile pins the base **by digest**
   (reproducible). For CRITICAL/HIGH base CVEs: **auto-rebuild + auto-redeploy through the governed
   promote path** for code-bundle tenants on "managed base updates" (default ON — we own their
   Dockerfile); governance still gates it because a base rev = new build = normal verify→scan→promote.
   Lower severity: notify + one-click rebuild. **BYO `kind: image` tenants are notified, never
   auto-rebuilt** (we don't own their Dockerfile). Because the bundle records the base ref /
   `BuilderIdentity`, "who is on the vulnerable base" is a query, not a guess; enterprises can pin a
   base for a longer support window.
4. **gVisor + BuildKit on EC2 → pin builds to Fargate microVM for v1; gVisor-on-EC2 builds are a
   later, validated optimization.** Rootless BuildKit leans on user namespaces + fuse-overlayfs + a
   wide mount/clone syscall surface, and fuse-overlayfs under `runsc` is the known friction point.
   Fargate's Firecracker microVM gives a real kernel boundary with full syscall support — the cleaner
   isolation story for untrusted builds anyway. **B1 builds run on Fargate microVM, full stop.**
   Pursue gVisor-on-EC2 builds only if cost/instance-type needs force it, behind a validation spike
   (BuildKit under `runsc`; confirm fuse-overlayfs or fall back to the `native` snapshotter). This is
   **builds only** — harness *runtime* pods keep the gVisor-on-EC2 option (P6-C).

---

## Sources (2026 research)

- [The end of Kaniko (archived June 2025)](https://biru.sh/en/blog/the-end-of-kaniko/) ·
  [Chainguard fork](https://www.chainguard.dev/unchained/fork-yeah-were-bringing-kaniko-back) ·
  [Kaniko archived issue #3348](https://github.com/GoogleContainerTools/kaniko/issues/3348)
- [Rootless container builds on Kubernetes (CERN, 2025)](https://kubernetes.web.cern.ch/blog/2025/06/19/rootless-container-builds-on-kubernetes/) ·
  [Buildah vs Kaniko 2026](https://lucaberton.com/blog/buildah-vs-kaniko-2026/)
- [SLSA Framework Guide 2026](https://www.practical-devsecops.com/slsa-framework-guide-software-supply-chain-security/) ·
  [Supply-chain security beyond SBOMs: Sigstore, SLSA, provenance](https://aquilax.ai/blog/supply-chain-artifact-signing-slsa) ·
  [Implementing SLSA L3 build provenance for Kubernetes images](https://oneuptime.com/blog/post/2026-02-09-slsa-level3-build-provenance/view)
