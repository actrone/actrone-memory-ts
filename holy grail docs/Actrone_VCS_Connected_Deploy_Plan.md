# Actrone VCS-Connected Deploy Plan (GitHub / GitLab / Bitbucket)

> **Status:** V1–V3 backend SHIPPED (2026-06-22) — GitHub App installation-token minting, GitLab
> project-token + Bitbucket repo-token fetch, HMAC-SHA256 webhook verification (all three) →
> auto-build on the existing pipeline, branch→env, connect/bind/installations API + persistence.
> **V4 partial:** ✅ commit-status feedback (pending→success/failure, all three providers) +
> ✅ monorepo path-filters + ✅ **PR-comment feedback** (idempotent upsert on GitHub PRs /
> GitLab MRs / Bitbucket PRs, marker-keyed per agent) + ✅ **PR-preview teardown** (PR/MR
> close → dataplane `RemovePool(preview-pr-<N>)`, all three providers, idempotent + deduped).
> **V4 effectively complete (2026-06-23):** ✅ GHES App registration (+ per-host minting), ✅ the
> full §6A Control-Tower frontend (all 5 surfaces), and ✅ **PR-preview auto-deploy orchestrator
> slice** (per-PR pool create on `ready` + quota + idle-sweep + teardown, flag-gated — §9A). The
> only remaining work is the **preview-URL / KEDA infra slice** (phase 2/3 of §9A), which is
> infra-repo, not orchestrator.
> **Owner:** Matt. **Scope:** let a developer **connect a Git
> provider account** (GitHub, GitLab, Bitbucket — cloud *and* self-managed) so that a push or PR
> **builds and deploys their hosted agent automatically** — the Vercel/GitHub "git-connected" feel,
> but governed and provenance-signed.
> **Pairs with:** [Code-Bundle Build Infrastructure Plan](./Actrone_Code_Bundle_Build_Infrastructure_Plan.md)
> (VCS-connect is the *ingestion front-end* to that build pipeline) and the
> [Per-Tenant Registry Secrets Plan](./Actrone_Per_Tenant_Registry_Secrets_Plan.md)
> (the same short-lived-token discipline). **Last updated:** 2026-06-21.
>
> **Status refreshed 2026-07-13 (code-verified):** the backend is confirmed present and
> code-complete. `internal/vcs/` carries `github.go`, `gitlab.go`, `bitbucket.go`, `webhook.go`
> (HMAC verify), `status.go`, `prcomment.go`, `repos_list.go`, `token_github_app.go`, and
> `ghes_app.go`; `internal/vcsconnect/` binds them (`MintingTokenSource` — GitHub mints ~1 h App
> installation tokens, GitLab/Bitbucket decrypt vault-stored repo-scoped tokens; per-host GHES App
> selection), plus `internal/vcsintake` and `internal/previewdeploy`. The §9A body already records
> the preview serving handler as shipped. **The one honest caveat:** all of this is **flag-gated and
> deploy-pending** — the webhook→build→preview loop only runs once the P6-B/P6-C data plane is
> applied to a live cluster (`build.enabled`, `build.vcs.enabled`, `build.vcs.preview.*`, and
> `dataplane.enabled` all default OFF), and that cluster apply is still outstanding
> (`infra/docs/Actrone_Deployment_Runbook.md` 2026-07-12). The §9A "fully complete end-to-end" claim
> is true **in code**; it is not yet exercised against a running cluster.

---

## 1. The answer: yes — all three, first-class

The Code-Bundle Build plan names three ingestion surfaces feeding **one** pipeline: `actrone deploy`
(CLI, the hero), **git-connected auto-deploy**, and a Control-Tower upload. This document designs the
**git-connected** surface across **GitHub, GitLab, and Bitbucket — cloud and self-managed** — because
"GitHub-only" is a competitive ceiling: enterprise and regulated shops run **GitLab self-managed** and
**Bitbucket Data Center**, and a serious agent platform must meet them there.

VCS-connect does **not** introduce a second build path. It resolves a webhook event to a
`(repo, commit SHA, ref)`, fetches the source with a **short-lived, fine-grained token**, and hands it
to the *existing* build pipeline (build pod → BuildKit → SBOM → cosign sign → SLSA provenance → scan →
digest → promote). It is a thin, secure **front door**, not a new factory.

---

## 2. Per-provider app model — decision (use the app model, not OAuth user tokens)

The single most important security decision: **integrate as a first-class provider *App* with
short-lived, per-repo tokens — never a long-lived OAuth *user* token with broad scopes.**

| Provider | Integrate as | Token model | Webhook auth |
| --- | --- | --- | --- |
| **GitHub** (+ GitHub Enterprise Server) | **GitHub App** ("Actrone") | **Installation access token** — 1 h, fine-grained per-repo permissions (Contents: read, Pull requests: write for previews, Checks: write), acts as its own identity | `X-Hub-Signature-256` HMAC-SHA256 over the body with the app webhook secret |
| **GitLab** (+ self-managed) | **GitLab Application** + **Project/Group Access Tokens** | Short-lived **project access tokens** (or a group token), scoped `read_repository` (+ `api` only where PR/MR notes are posted) | **Signing token** — HMAC-SHA256 over the payload (GitLab's 2026-recommended webhook auth); fall back to the legacy `X-Gitlab-Token` shared secret only for older self-managed instances. Constant-time compare + delivery dedup |
| **Bitbucket** (Cloud + Data Center) | **OAuth consumer / Forge app** + **Repository/Workspace Access Tokens** | Short-lived **repository access tokens**, scoped to repo read (+ PR write for previews) | `X-Hub-Signature` **HMAC-SHA256** over the raw body (Bitbucket's enhanced webhook security, 2026); IP allowlist as defence-in-depth. Verify against the **verbatim** payload bytes — never a re-serialized body |

> **GitHub token-format note (2026):** from **2026-04-27** GitHub began a staged rollout of a new
> **stateless installation-token format** (`ghs_<APPID>_<JWT>`) — do **not** assume the legacy
> 40-character length anywhere in `internal/vcs`. Treat the token as an opaque bearer string. (User
> access tokens, if ever used for the consent handshake, expire in 8 h with a 6-month refresh token —
> but the *working* credential is always the ~1 h installation token.)

**Why App-model over OAuth user tokens:** a GitHub App installation token is minted on demand, expires
in ~1 h, and is scoped to exactly the repos the user installed Actrone on — so a leak is bounded in
time *and* blast radius, and the user grants per-repo access, not "all my repos." OAuth user tokens are
long-lived, broadly scoped, and tied to a human who may leave. GitLab project access tokens and
Bitbucket repository access tokens are the equivalent least-privilege primitives. This is the same
zero-standing-credential posture as the registry-secrets plan, applied to source.

---

## 3. Architecture — two flows

### 3.1 Connect flow (one-time, per provider)
```
Control Tower → "Connect GitHub" → provider App install / OAuth consent
        │ (user picks the repos to grant — least privilege)
        ▼
Actrone stores the INSTALLATION (not a user token): installation id + provider + account
        │  (the credential to MINT short-lived tokens lives in Vault, per the secrets plan)
        ▼
Repo list surfaced → user maps repo → agent + branch→env policy
```
We persist the **installation/binding**, never a standing token. Each build mints a fresh,
repo-scoped, ~1 h token at clone time and discards it.

### 3.2 Build-on-push flow
```
push / PR  ──►  provider webhook  ──►  POST /v1/vcs/{provider}/webhook
                                            │ 1. verify signature (HMAC / shared secret), dedup delivery id
                                            │ 2. resolve (repo, commit SHA, ref, author, PR#)
                                            │ 3. map ref → environment (branch→env policy)
                                            │ 4. mint short-lived repo-scoped token
                                            ▼
                              BuildAgentImageWorkflow (Temporal)  ← same as CLI/upload path
                                            │ build pod: shallow-clone @SHA with the ephemeral token,
                                            │ then the EXISTING build → sign → scan → digest pipeline
                                            ▼
                   bundle ready → preview deploy (non-main) | promote-gated (main)
                                            │
                                            ▼
                       post status back: PR comment + commit status/check
                       ("Preview: agent X @ <sha> — Live at … | Governance: passed/gated")
```

### 3.3 Branch → environment policy (the Vercel feel, governed)
- **`main` → production** (governed promote: the **P5-B diff gate** still applies — a broadening
  change requires confirmation; a connected push does **not** bypass governance).
- **Any other branch / PR → a preview environment**, deployed under that env's policy + entitlements
  (Infra §3 per-env isolation), with a unique preview URL and a PR comment.
- **Merge/close PR → tear down** the preview pool (delete the Argo CD Application — the dataplane
  reconciler's `RemovePool`).
- Mapping is per-agent config with sane defaults; monorepos map a **path filter** → agent so one repo
  can host several agents.

---

## 4. Security posture

- **App-model, short-lived tokens only** (§2): no long-lived user OAuth tokens; tokens minted
  per-build, ~1 h, repo-scoped, discarded after clone.
- **Webhook verification is mandatory, HMAC-SHA256, and constant-time across all three:** GitHub
  `X-Hub-Signature-256`, GitLab **signing token** (`X-Gitlab-Token` legacy fallback only), Bitbucket
  `X-Hub-Signature` — each an HMAC over the **verbatim** request body (no re-serialization), compared
  with `hmac.Equal` (constant-time). **Delivery-id dedup** (idempotency) + a **timestamp/replay
  window** + per-provider IP allowlist as defence-in-depth. An unverified webhook is rejected `401`,
  never processed.
- **Untrusted source, untrusted webhook:** the webhook endpoint is rate-limited, payload-size-capped,
  and allowlist-validated (CLAUDE.md §5.1); the build runs in the isolated, egress-locked build pod
  (build plan §6) — a malicious repo cannot pivot from the webhook or the build.
- **The running agent never gets VCS access.** The pod principle: only the *build* reads the repo,
  with an ephemeral token; the deployed harness pod is egress-locked to the gateway/Temporal and has
  **no** git credential. Source access and runtime are cleanly separated.
- **Secrets brokering** reuses the registry-secrets plan: the App private key / GitLab-Bitbucket
  client secrets live in **Vault**, per-provider; the orchestrator mints tokens, never stores them.
- **Least-privilege install:** users grant Actrone to *specific repos*; we request the minimal
  permission set (Contents: read; PR/Checks: write only for the preview-feedback feature).

---

## 5. The moat

VCS-connect is where the **governed software factory** (build plan §7) becomes a developer's daily
habit — and the moat compounds three ways most agent platforms cannot match:

1. **Source-to-running-agent provenance.** Because VCS-connect feeds the signed-build pipeline, the
   **SLSA provenance records the git provider + repo + commit SHA + PR**, transparency-logged
   (Rekor). The chain is verifiable end to end: *this running agent was built by Actrone from this
   exact commit, signed, scanned, and governed.* "We deploy your repo" is common; "we can
   cryptographically prove which commit is running and that it passed your governance" is the moat.
2. **Multi-VCS parity, including self-managed.** GitHub **and** GitLab self-managed **and** Bitbucket
   Data Center as first-class — the enterprise/sovereignty surface most competitors skip. A GitLab
   self-managed shop behind its own firewall is a buyer no GitHub-only platform can serve.
3. **Governed GitOps for agents.** PR previews and `main`-promotes that **respect the governance
   policy and per-env entitlements** — a broadening change is gated at the PR, not after it ships.
   "Preview deployments that can't violate your policy" is a category competitors don't have because
   they have no governance layer to enforce.
4. **Zero-standing-credential source access.** Short-lived, per-repo, App-minted tokens, brokered via
   Vault, never stored — the posture enterprise security review demands, and a differentiator at
   procurement.

Combined with the build factory and per-tenant registry isolation, VCS-connect closes the loop:
**isolated source intake → isolated signed build → isolated registry → isolated governed runtime,
with a verifiable provenance chain from commit to pod.**

---

## 6. Data model & API

- **`internal/vcs`** (new): provider-agnostic `Provider` interface (`VerifyWebhook`, `MintRepoToken`,
  `FetchTarball`/`CloneURL`, `PostStatus`, `PostPRComment`) with `github` / `gitlab` / `bitbucket`
  implementations — the per-provider differences (token mint, webhook auth, status API) are isolated
  behind one boundary, the rest of the pipeline is provider-blind.
- **`vcs_installations`** table: `(tenant_id, provider, account, installation_id, vault_secret_ref,
  created_by)` — the binding, no token.
- **`agent_repo_bindings`** table: `(agent_id, installation_id, repo, path_filter, branch_env_map)`.
- **API:** `POST /v1/vcs/{provider}/webhook` (public, signature-verified), `POST /v1/vcs/connect`
  (start install/OAuth), `GET /v1/vcs/installations` + `…/repos` (list), `POST /v1/agents/{id}/repo`
  (bind a repo + branch→env policy). All tenant + env scoped.
- **Frontend:** see §6A for the full enterprise-premium Control Tower surface.

---

## 6A. Control Tower UI/UX — enterprise-premium

VCS-connect is the most visible developer-facing surface in this program, so it must be built to the
**enterprise-premium bar** already set by the [Total Frontend Revamp](../frontend) design system —
Geist-benchmarked but Actrone-branded, **100% token-driven** (no hardcoded colour/spacing,
CLAUDE.md §8.4), fully responsive at **375 / 768 / 1280 / 1920 px**, light + dark parity, and
WCAG-AA accessible. It reuses the shared primitives (`DataToolbar`, `useDataView`, shadcn/Radix
re-skinned to Actrone tokens, `EmptyState`/`ErrorState`/`Skeleton`, toast system) — it does **not**
invent a parallel design language. **Every async surface ships loading + empty + error states; no
exceptions.**

### Surfaces

> **Build status (2026-06-23):** Surfaces 1, 3 & 4 ✅ SHIPPED (backend + frontend green).
> **Surface 1 (Connect a Git provider):** route `/settings/source` (sidebar "Source Deploy" +
> command palette), `lib/api/vcs.ts` typed client, `SourceDeploy` provider grid (GitHub
> App-manifest popup flow + GitLab/Bitbucket `ConnectTokenDialog`, self-managed base-URL,
> `IntegrationIcon` marks) + connected-accounts list. **Surface 3 (Map repo→agent):**
> `MapRepoDialog` — installation select + owner/repo/subdir + branch→env policy editor + path
> filter + auto-deploy → `bindRepo` (the agent's Agent-File is captured as the bind manifest).
> **Surface 4 (per-agent Deployments view):** route `/agents/[id]/source` ("Source" tab on the
> agent page), `AgentSource` — current-binding card + git-connected deployment history with an
> animated **pipeline stepper** (queued→building→signing→scanning→deployed, per-step done/active/
> error) and a **provenance badge** popover (verified-from-`<sha>`, builder identity, provenance
> ref, scan verdict). Backed by NEW endpoints `GET /v1/agents/{id}/repo` (bindings) +
> `GET /v1/agents/{id}/vcs/deployments` (history = `vcs_build_sources` ⋈ `agent_bundles`
> pipeline+provenance). All async surfaces ship loading/empty/error; token-driven; tsc + scoped
> eslint clean; Go build/vet/test green. **Surface 2 (repo picker) ✅ SHIPPED:** backend
> `RepoLister` on all 3 fetchers (GitHub `/installation/repositories` via an all-repos
> installation token minted by the new `MintInstallationToken`; GitLab `/projects?membership`;
> Bitbucket `/2.0/repositories/{ws}` — bounded pagination, newest-push sort) →
> `GET /v1/vcs/installations/{id}/repos` (token source `InstallationToken`, service `ListRepos`,
> `WithRepoListers`); frontend `vcsApi.repos()` plus a **`cmdk` searchable picker** inside
> `MapRepoDialog` (private/branch icons, selecting a repo sets owner/name/default-branch, graceful
> fallback to manual entry on 404/empty). **Surface 5 (PR/preview affordances) ✅ SHIPPED:** the
> deployments query now carries the bundle's target `env`; each `AgentSource` row shows an
> **env / Preview badge**, a **governance verdict** in the same language as the PR comment
> ("Governance: passed" / "Build failed"), a clickable **SHA → commit** and **PR# → pull/merge
> request** deep-link into the provider UI (self-managed-host-aware), and a **Previews-only
> filter**. **All five §6A surfaces are now built (backend + frontend), tsc + eslint + Go
> build/test green.** The §6A program is complete; the only open VCS item is the backend
> PR-preview *auto-deploy* (the governance-sensitive create-half of ephemeral pools).

1. **Connect a Git provider** (`/settings/source` → "Source Deploy") — a refined provider grid
   (GitHub / GitLab / Bitbucket, each cloud **and** self-managed) using the SVG brand-mark system
   (`IntegrationIcon`, **never emoji**). Each card: provider mark, one-line value prop, a
   `primary` (brand-red gradient) **Connect** button, and a self-managed "Custom base URL" affordance.
   Connecting opens the provider's install/consent in a popup; on return, an inline **success toast**
   fires and the card flips to a connected state (account handle, repo count, "Manage"). `free`-tier
   providers render via `FeatureGate` → `UpgradeModal`, not a dead button.
2. **Repo picker** — a `cmdk` command-style searchable list (fuzzy filter, keyboard-first, `⌘K`),
   each row showing repo, default branch, visibility, last-push relative time. Multi-select to map
   several repos; **empty state** ("No repositories granted — adjust the installation on GitHub")
   links back to the provider to widen the grant. Skeleton rows while the installation's repos load.
3. **Map repo → agent** — a focused Radix `Dialog`: repo on the left, the **branch→env policy**
   editor on the right (`main → production (governed)`, `* / PR → preview`, monorepo **path-filter →
   agent**). Inline validation on blur, an explainer `TipCard` on what "governed promote" means, and a
   **dry-run preview** of what the next push would do before saving.
4. **Per-agent Deployments view** (`/agents/[id]/deployments`) — the centrepiece, built on the shared
   `DataToolbar` + `useDataView` (search, facet filters by **branch / env / status / provider**,
   date-range, URL-synced shareable state, CSV export). Each deployment row: commit SHA (mono,
   `tabular-nums`) + message, author avatar, branch→env badge, a **pipeline status stepper**
   (`queued → building → signing → scanning → ready → deployed`, each step with its own
   live/skeleton/error state), preview URL, and a **provenance badge** ("Verified from `<sha>` ·
   SLSA L3 · signed") that opens a popover with the cosign/Rekor details. Live updates via the
   existing event seam; a designed **empty state** for never-deployed agents with a "Connect a repo"
   CTA, and a **designed error state** (never a raw stack) on pipeline failure with the failing step
   highlighted and a "View logs" action.
5. **PR / preview affordances** — preview URL + governance verdict surfaced both in-app and as the
   PR comment/commit-check the backend posts (§3.2), kept visually consistent (same status language,
   same provenance badge) so the in-product and in-Git experiences match.

### Premium-feel details (consistent with the revamp design language)

- **Motion with purpose:** staggered reveal of deployment rows, `card-lift` on hover, an animated
  pipeline stepper that advances live — all gated behind `prefers-reduced-motion`.
- **Materials/elevation:** frosted sticky toolbar (`backdrop-blur`), `menu`/`popover`/`modal`
  elevation tokens for the provenance popover and mapping dialog.
- **Typography & numerics:** Geist Mono + `tabular-nums` for SHAs, durations, and counts; Title-Case
  noun headers; en-dash pagination copy (`21–40 of 142`).
- **A11y:** sortable headers are real `<button>`s announcing next sort state; the pipeline stepper
  exposes `aria-current`/status to AT; provider connect buttons carry action+target `aria-label`s;
  visible focus rings throughout; colour contrast ≥ 4.5:1 in both themes.

---

## 7. Phased rollout

| Phase | Deliverable |
| --- | --- |
| **V1 — GitHub App** ✅ | GitHub App installation-token minting (RS256 app-JWT → ~1h scoped token) + `X-Hub-Signature-256` HMAC webhook → build pipeline; branch→env. *(commit status + PR comment + preview-pool teardown deferred to V4.)* |
| **V2 — GitLab** ✅ | Project archive fetch + `PRIVATE-TOKEN` access tokens + `X-Gitlab-Token` / `X-Gitlab-Signature-256` (HMAC) webhook; **self-managed GitLab** (configurable base URL, SSRF-screened). |
| **V3 — Bitbucket** ✅ | Repo download fetch + Bearer repository access tokens + `X-Hub-Signature` **HMAC-SHA256** webhook; **Bitbucket Data Center** (configurable base). |
| **V4 — depth** (partial ✅) | ✅ commit-status feedback (pending→success/failure, all 3 providers) + ✅ monorepo path-filters + ✅ **PR-comment feedback** (`PostPRComment`, marker-keyed idempotent upsert: GitHub issue-comments, GitLab MR notes, Bitbucket PR comments) + ✅ **PR-preview teardown** (PR/MR close→merge detected on all 3 providers → dataplane `RemovePool(preview-pr-<N>)`, deduped + idempotent) + ✅ **GHES App registration, end-to-end incl. per-host minting** (`BuildGHESAppManifest` + `GHESAppCreateURL` + `ConvertGHESAppManifest` least-privilege manifest/create-URL/one-time-code→credentials exchange with secret-redacting result; **`POST /v1/vcs/github/manifest/start`** authed + **`GET /v1/vcs/github/manifest/callback`** public-with-state; pending-handshake + registered-App persistence (`vcs_github_apps` keyed per `(tenant, host)` + `vcs_app_registrations` TTL state); private key + webhook secret **vault-sealed**. **Per-host minter selection:** the installation records its `host` (`vcs_installations.host`, set from connect `base_url`); the token source mints with the registered per-host App's key for a GHES installation and falls back to the boot platform App for github.com / unregistered hosts — so a manifest-registered GHES App actually issues installation tokens). *Remaining:* PR-preview *auto-deploy* (create half — connected path builds bundles; deploy is on promote), provenance badge + gateway enforcement, required-checks gating, the §6A Control-Tower frontend. |

---

## 8. Alternatives considered & rejected

- **OAuth user tokens (the easy path).** Rejected as the mechanism — long-lived, broadly scoped, tied
  to a person. App-model short-lived per-repo tokens are the security bar (§2). (OAuth is still used
  for the *login/consent* handshake where a provider requires it, e.g. Bitbucket consumer; the
  *working* credential is always a short-lived scoped token.)
- **GitHub-only.** Rejected — forfeits the self-managed enterprise surface that is a core moat (§5.2).
- **Poll the repo instead of webhooks.** Rejected — latency, rate limits, and no PR-event fidelity;
  webhooks with strict verification are the standard.
- **Give the running agent a git token (so it can pull at runtime).** Rejected outright — violates the
  pod principle and the egress-lock; only the build reads source.

---

## 9. Resolved decisions

> Decided 2026-06-21. Theme: own the App identity (it's the builder-of-record); be a well-behaved
> status provider; reuse the Open-Models Edge Connector for on-prem reach.

1. **Managed-catalog reuse → own the App registration for the deploy path; the catalog covers only
   agent-facing actions.** Different trust models. The deploy path needs its *own* App identity that
   receives webhooks, mints installation tokens, writes checks/PR comments, and holds a private key we
   rotate — and that App **is** the builder-of-record in the provenance chain (§5.1). A
   Composio/Arcade-style broker is built for agent-callable, user-delegated OAuth *actions*, not for
   being a first-class webhook-receiving App, and it **cannot register an App on a customer's GHES /
   GitLab self-managed instance**. We can still surface the connect handshake through the same
   Control-Tower integrations UI for consistency, but the backend is `internal/vcs`, owned. The
   catalog stays for *agent-facing* GitHub/GitLab MCP actions (the agent calling the API), which is a
   separate concern (§7 NOTE).
2. **Preview-env quotas → cheap by design (KEDA scale-to-zero); govern with a concurrent-preview
   ceiling + idle TTL, not per-hour cost.** Idle previews cost ~0; the real spend is build-minutes
   (capped in the build plan §10.2). Add: Free = previews off or 1 concurrent, aggressive teardown (on
   PR close, or 24–72 h idle); Startup = *N* concurrent, 7-day idle TTL; Enterprise =
   many/configurable. **Dedup per `(repo, PR)`** so force-pushes update one pool instead of spawning
   many, and auto-teardown stale previews. Ties to monetization §15.8.
3. **Self-managed reachability → inbound webhooks need nothing special; outbound token-mint/clone
   against an on-prem instance reuses the Open-Models Edge Connector — no firewall holes.** This *is*
   the Open-Models self-hosted reachability problem; cross-link that matrix. Three tiers: (a) on-prem
   instance internet-reachable → direct, SSRF-screened, mTLS-preferred; (b) not reachable → **Edge
   Connector** (customer runs an outbound-only broker, reverse-tunnel, no inbound change); (c)
   air-gapped → the build runs *in* the customer's environment (later self-hosted-data-plane story).
   **V2/V3 ship tier (a); the Edge Connector is the follow-on.** All outbound clone/token-mint goes
   through the same SSRF screen + per-target allowlist.
4. **Required-checks / merge-gating → be a status provider first; hard-blocking is opt-in via the
   customer's native branch protection, never default.** V1–V3: post a commit status / check run with
   the governance verdict (pass / gated / fail) — informational; the customer can *require* it through
   **their own** branch protection (the correct primitive — it's their repo). V4: offer an opt-in
   **blocking** check + a "governed merge" mode where a broadening change needs an Actrone approver
   before the check goes green. **Ceiling:** we report and (opt-in) block through the native check
   API; we never override merge buttons or enforce outside the VCS's own mechanism. Governance teeth
   stay opt-in and customer-controlled.

---

## 9A. Decision — PR-preview auto-deploy (✅ SIGNED OFF + ORCHESTRATOR SLICE SHIPPED, 2026-06-23)

> Status: **signed off; the orchestrator slice is built, flag-gated, and green** (Go build/vet/test
> + Helm balanced). What shipped: `HarnessPoolSpec.PoolSlot` (identity, distinct from the
> governance `Env`) + `Slot()`/`IsPreview()` + `NewPreviewPoolSpec` (forces `Env=development`,
> `PoolSlot=preview-pr-<N>`, per-PR task queue); `BuildApplication` keys the Argo Application name
> on `Slot()` while keeping `Env` in values/labels (+ a `pool-slot` label). New `internal/previewdeploy`
> service: a `bundle.WithReadyHook` fires `OnBundleReady` **after** verify+scan (the governance
> gate), and for a connected PR build deploys a preview pool — quota-bounded per tenant
> (`vcs_preview_pools` tracking table; a same-PR force-push is a refresh that bypasses the quota),
> with an idle-TTL `SweepIdle` ticker + PR-close teardown that frees the quota slot. Flag-gated via
> `build.vcs.preview.enabled` (default off; a no-op without `dataplane.enabled`). **Deferred to the
> infra slice (phase 2/3):** the preview-URL routing (wildcard DNS, cert, gateway/ingress), KEDA
> scale-to-zero on the harness-pool chart, and filling the live "Live at …" URL into the PR
> comment and §6A view. The pool create/teardown lifecycle + governance posture are complete now.
>
> **Infra slice progress (2026-06-23):** ✅ **KEDA scale-to-zero already exists** — the
> harness-pool `ScaledObject` scales on Temporal **activity-queue depth** with `minReplicaCount: 0`,
> so a preview inherits scale-to-zero via its per-PR task queue (no new KEDA work needed); the
> orchestrator now additionally **caps a preview's fan-out** (`buildValues` emits
> `scaling{minReplicas:0, maxReplicas:2}` only when `spec.IsPreview()` — cost by design). ✅
> **Gateway preview-routing scaffolding** — Gateway API `preview-https` + `preview-http` listeners
> for `hosts.previewWildcard` (own wildcard cert via `tls.previewCertSecretName`) + an
> `httproute-preview` → orchestrator (same trust-header strip + security headers) + the redirect
> route extended to the preview-http listener; **all gated on `hosts.previewWildcard`, OFF by
> default**, Helm balanced, build/tests green. ✅ **Serving handler SHIPPED (2026-06-23)** —
> previews now serve traffic end-to-end:
> - **The unlock (a discovered prerequisite):** the hosted workflow dispatched every agent
>   activity to a *constant* `byof-harness` queue, so per-pool (incl. preview) routing was never
>   wired. Fixed **additively** — `AgentTaskInput.HarnessQueue` overrides the activity task queue
>   (empty ⇒ `byof-harness`, zero regression); a preview run sets it to the pool's slot queue so
>   the request lands on the preview pod.
> - **`PreviewInvokeHandler`** (`POST /v1/preview/invoke`, mounted only when preview deploy is on):
>   resolves the inbound preview Host → pool (`vcs_preview_pools.host` deterministic label +
>   `GetPreviewPoolByHost`), **tenant-isolates** (cross-tenant = 404, no oracle), then runs the
>   agent's preview bundle via `HostedAgentWorkflow` on the pool's slot queue under **development**
>   governance as a `Preview` run (no memory write-back, unbilled), **synchronously** (bounded
>   timeout) and returns the agent's output. The harness pod refreshes `last_active_at` so the idle
>   sweep never reaps an in-use preview.
> - **Gateway** `httproute-preview` now `URLRewrite`s the preview host to `/v1/preview/invoke`
>   (Host preserved for resolution). **Auth model:** team-internal — the public preview URL still
>   requires a valid Actrone session matching the owning tenant (secure default; a public
>   share-token mode is a future enhancement).
> - **Live preview URL surfaced honestly:** `domain.PreviewURL`/`PreviewHostLabel` build the
>   deterministic `https://<label>.<base-domain>`; the PR "preview ready" comment now includes
>   **Live preview: …** — but only when preview serving is enabled + a base domain is configured
>   (`build.vcs.preview.baseDomain`), so it is never a dead link.
>
> ✅ **Polish complete (2026-06-23):** **§6A inline "Open preview"** — `Deployments` annotates
> each PR build with its live `preview_url` (only when serving is enabled — deterministic, never a
> dead link); `AgentSource` renders an accent "Open preview" external link on PR rows. **Public
> share-token mode (opt-in `build.vcs.preview.publicShare`)** — **stateless**: the token is
> `domain.PreviewShareToken` = HMAC-SHA256(secret, tenant:agent:pr) (no DB column, no plaintext
> stored), recomputable for both surfacing (`PreviewURLWithToken` → `?pt=…`) and verification. The
> handler authorises by a **valid token OR a matching session** (`authorize`); the route is mounted
> **publicly** (before auth middleware) in share mode vs. **behind auth** in team-internal mode
> (default OFF). The preview route is deliberately outside the `edge-authz` ext_authz, so the
> orchestrator owns preview auth. **§9A is fully complete — VCS Connected Deploy V4 is done
> end-to-end across both repos.**

**Recommendation:** Auto-deploy a non-`main` PR build to a **per-PR, scale-to-zero preview pool**
keyed by `preview-pr-<N>` as the *pool identity* — but governed under the existing **`development`**
environment's policy / data / secret scope, **never as a new governance environment**. Gate it on
the **automated** build governance (signed + scanned + SLSA provenance) plus a **tier quota**, with
**no human promote gate**.

**Rationale (one line):** the promote gate exists to protect *production*; a preview is
definitionally not production, so it must not touch that gate — but it inherits the lowest-trust
env's automated guardrails, which already travel with every build.

### Why it fits what we built

1. **We already split pool-identity from governance-env.** `domain.PreviewEnv(n)` is a *dataplane
   pool identity, outside the promotion ladder, never passed through `NormalizeEnv`*. Keep it that way.
2. **The landmine to respect:** `NormalizeEnv` collapses any unknown env → **production** (the secure
   default). So `preview-pr-N` must stay a *pool name only*; the governance/data/secret env stays
   `development` (which is exactly what `EnvForBranch` already tags a PR build as). If `preview-pr-N`
   ever reached the governance path, a PR preview would silently get **production** data + secrets.
3. **The hooks already exist.** `ReportBuildOutcome` (success/failure) and `RemovePool(preview-pr-N)`
   (PR close) are wired. Auto-deploy is the symmetric create-half on the success path.

### The one real code change

`NewHarnessPoolSpec` / `EnsurePool` key the Argo CD Application on `env`. Today two PRs both build
under `development` and would collide on one pool. **Add an optional `PoolSlot` to
`HarnessPoolSpec`, distinct from `Env`, defaulting to `Env` (back-compat).** Previews set
`PoolSlot = preview-pr-N`, `Env = development`. This is the whole architectural change, and it keeps
`preview-pr-N` clear of `NormalizeEnv`.

### Design decisions (with picks)

- **Gate:** automated only — deploy iff the bundle reached `ready` (signed + scanned + provenance) —
  **plus a tier quota** (Free = previews off or 1 concurrent; Startup = *N* + 7-day idle TTL;
  Enterprise = configurable). **No human gate per PR push.**
- **Trigger:** extend `ReportBuildOutcome` success path — `if PRNumber > 0 && previews enabled &&
  within quota → EnsurePool(previewSpec)`. Reuses the exact hook already wired for status/comment.
- **URL:** deterministic wildcard host, e.g. `pr-<N>--<agent>--<tenant>.preview.actrone.app`, routed
  to the pool; fill the "Live at …" into the PR comment (§3.2) and the §6A deployments view (seam
  exists).
- **Teardown:** keep PR-close `RemovePool` **and add an idle-TTL reconciler sweep** so an abandoned,
  never-closed PR does not linger.

### 2026 alignment

Ephemeral per-PR environments (Vercel/Netlify model, now platform-eng table-stakes); Argo CD
**ApplicationSet PR-generator** as the canonical k8s pattern (we already write Argo Applications —
previews are just more of them; an ApplicationSet is a later refinement); **KEDA scale-to-zero** so
idle previews cost ~0; **policy-as-code, path-independent** (a preview deploys only from a
`ready`/signed/scanned bundle, and the harness pod is egress-locked to the gateway — MAL/DPE still
apply, and it cannot reach production backing services); **reduced-privilege previews** (development
secrets + data isolation + lower quota).

### Explicitly rejected

- Making `preview-pr-N` a real `Environment` — fights `NormalizeEnv`, risks production escalation,
  pollutes the ladder.
- Routing previews through the P5-B promote gate — wrong gate; forces human confirm per push.
- A parallel deploy path — duplicates the pipeline; reuse `EnsurePool`.
- Preview pods with production data/secrets — security failure; previews are development-tier isolation.

### Sequencing & effort

The **orchestrator slice is small and contained** (the `PoolSlot` split + auto-deploy-on-success
branch + quota check + idle-TTL sweep — all reusing existing hooks), shipped **behind a feature
flag**. The **heavier infra-repo work** is the preview-URL routing (wildcard DNS + cert +
gateway/ingress) and **KEDA scale-to-zero** on the harness-pool Helm chart. Order: (1) orchestrator +
spec change (pools created/torn-down correctly, flag-gated); (2) URL + KEDA infra; (3) surface the
live URL in the PR comment + §6A UI. Ties to monetization §15.8 (preview-concurrency tiering).

---

## References (verified 2026-06-21 via live search)

- **GitHub** — installation access tokens expire in **1 h**; staged rollout of the **stateless
  `ghs_<APPID>_<JWT>` token format from 2026-04-27** (do not assume 40-char length); user access
  tokens 8 h + 6-month refresh:
  [Generating an installation access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app) ·
  [Authenticating as a GitHub App installation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation) ·
  [GitHub App installation token security](https://www.systemshardening.com/articles/cicd/github-app-token-security/)
- **GitLab** — project access tokens are the least-risk CI credential; webhooks should use the
  **signing token (HMAC-SHA256)**, not the weaker plain-text `X-Gitlab-Token`:
  [GitLab token overview](https://docs.gitlab.com/security/tokens/) ·
  [Project access tokens](https://docs.gitlab.com/user/project/settings/project_access_tokens/) ·
  [Webhooks (signing token / HMAC-SHA256)](https://docs.gitlab.com/user/project/integrations/webhooks/)
- **Bitbucket** — repository/workspace access tokens (per-repo passwords, not user-tied); webhooks
  now send **`X-Hub-Signature` HMAC-SHA256** over the **verbatim** body, compared with a
  constant-time function:
  [Repository access tokens](https://support.atlassian.com/bitbucket-cloud/docs/repository-access-tokens/) ·
  [Verify webhook signature (HMAC) — Atlassian](https://support.atlassian.com/bitbucket-cloud/kb/bitbucket-cloud-python-sample-code-to-verify-webhook-signature/) ·
  [Introducing enhanced webhook security — Atlassian](https://bitbucket.org/blog/enhanced-webhook-security)
- **Build pipeline (corroborating the ingestion target)** — Kaniko archived June 2025; rootless
  **BuildKit** is the 2026 standard:
  [Why BuildKit replaces Kaniko](https://www.nabilnoh.com/posts/buildkit-kaniko-replacement/) ·
  [Build container images inside Kubernetes (2026)](https://oneuptime.com/blog/post/2026-02-09-kaniko-container-images-kubernetes/view)
- SLSA provenance & Sigstore (build → source attestation) — see the
  [Code-Bundle Build Plan](./Actrone_Code_Bundle_Build_Infrastructure_Plan.md) Sources.
