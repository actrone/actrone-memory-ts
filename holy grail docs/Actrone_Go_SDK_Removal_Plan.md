# Actrone — Go SDK Removal Plan

> **Goal:** delete the Go client SDK (`actrone-go/`) **entirely** and drop Go from the SDK matrix,
> leaving **TypeScript + Python** as the two supported client SDKs.
>
> **The one hard blocker:** the **CLI (`actrone-cli/`) hard-depends on the Go SDK** — 6 command files
> import `github.com/actrone/actrone-go`, `go.mod` has `replace … => ../actrone-go`, and
> `internal/client/client.go` wraps the SDK for **all** REST transport. Deleting the SDK without
> handling the CLI breaks the CLI. This plan's critical path is therefore **migrate the CLI off the
> SDK first, then delete the SDK.** The CLI itself is kept (it is a valued tool, not the SDK).
>
> Status: PLAN. Owner: Matt. Created: 2026-07-05. Inherits `CLAUDE.md`. This is a *conscious
> strategic cut* (see rationale) — record it, don't let it become drift.

> **Status refreshed 2026-07-13 (code-verified): ALL FOUR PHASES ARE DONE — this plan is fully
> executed, not "Status: PLAN."** Verified directly: (1) `actrone-go/` does not exist anywhere in the
> repo (no directory, confirmed by filesystem search); (2) a full-repo grep for `actrone-go` /
> `github.com/actrone/actrone-go` returns zero hits outside this plan doc and
> `Actrone_SDKs_and_Adapters_Plan.md` (both historical); (3) `actrone-cli/go.mod` has no `replace`/
> `require` for the Go SDK and `actrone-cli/internal/client/` (`client.go`, `config.go`,
> `endpoints.go`, `errors.go`, `transport.go`, `types.go`) is a real, self-contained REST client; (4)
> `actrone-cli/README.md` documents exactly the Phase-1.6 distribution matrix (Homebrew, Scoop,
> `curl | sh`, `go install`, cosign-verified direct download); (5) `actrone-cli/.goreleaser.yaml` +
> `actrone-cli/.github/workflows/release-cli.yml` (tag-triggered `v*`, goreleaser + cosign) exist and
> match §Phase-1.6's spec exactly. `CLAUDE.md` §0.1 already reflects the 2-SDK matrix (TS + Python)
> — Phase 3.1 landed. No further action needed on this plan; kept for historical rationale.

---

## 0. Rationale & scope check (decide before executing)

**Why cut Go:** three-SDK client parity is a real tax — every client-facing endpoint change must land
in Go + TS + Python with contract tests. If there is **no demand signal** for a Go *client* SDK, that
tax buys nothing. (Note the honest counter, for the record: the Go SDK is not "for building agents in
Go" — it's for a Go *backend service* to call Actrone as a governed action layer; Go dominates
backend/infra, and Actrone's own orchestrator + CLI are Go. If a concrete enterprise-Go-backend
prospect appears, revisit. This plan assumes the cut is confirmed.)

**In scope:** delete `actrone-go/` (the client SDK module), remove it from the SDK matrix, migrate the
CLI to a self-contained client, and scrub all references.
**Explicitly NOT in scope:** the **CLI** (`actrone-cli/`, kept — migrated), the **Go orchestrator**
(`backend/orchestrator`, the platform itself), any other Go service. Only the *client SDK* is removed.

---

## Phase 0 — Discovery sweep (build the exact removal set)

Before touching anything, enumerate every reference so nothing is orphaned:

```
grep -rniE "actrone-go|github.com/actrone/actrone-go" . \
  --include=*.go --include=*.md --include=*.yml --include=*.yaml --include=*.ts --include=*.py
```

Known references today (verify + extend at execution):
- **CLI (the blocker):** `actrone-cli/go.mod` (`replace` + `require`), `actrone-cli/cmd/{deploy,
  deployments,models,promote,root,tasks}.go`, `actrone-cli/internal/client/client.go`.
- **Docs:** `backend/docs/{11-publishing.md, actrone-sysdesign-v3.md, development-plan.md,
  guides/08-observability.md}`.
- **Parity/comment mentions:** `actrone-ts/src/{client.ts, adapters/otel.ts, adapters/tools.ts,
  types/tools.ts}`, `backend/orchestrator/internal/handler/http/tool_call.go`,
  `backend/src/actrone/{client.py, harness/frameworks/autogen.py}`.
- **Governance docs:** `CLAUDE.md` §0.1 (the SDK map + the "parity = all THREE SDKs" rule).
- **CI:** any `actrone-go` build/test/release workflow (check `.github/workflows/` in the repo(s) that
  build it), and any release/tag automation for the Go module.
- **Memory:** `[[sdk-locations]]`, `[[platform-evolution-plans]]`, `[[repo-topology-and-deploy]]`.

Output of Phase 0: a checklist of files, split into **CLI-migration** (Phase 1) and **scrub** (Phase 3).

---

## Phase 1 — Migrate the CLI off the Go SDK *(the critical path — must precede deletion)*

The CLI uses the SDK only as a typed REST client. It already hand-rolls the WebSocket task-stream
attach (`internal/client/client.go` notes the SDK doesn't expose it). Fold the REST calls it needs
into that same internal client so the CLI is self-contained.

- **1.1 — Enumerate the CLI's actual SDK surface.** From the 6 `cmd/*.go` files, list every SDK
  method/type the CLI calls (tasks submit/get/cancel/stream, deployments, models, promote, deploy).
  This is a *small subset* of the SDK's 54 methods — only what the CLI commands use.
- **1.2 — Build `actrone-cli/internal/client` into a full client.** Implement the needed endpoints
  directly (stdlib `net/http` + the CLI's existing config/auth), carrying over the SDK's transport
  hygiene the CLI relied on: timeout, retry (backoff + jitter), circuit breaker, `X-Request-Id`
  (CLAUDE.md §4.4/§5). Reuse/port the relevant request/response structs (copy the DTOs the CLI uses
  into `internal/client/types.go` — the CLI now owns them).
- **1.3 — Rewrite the 6 `cmd/*.go`** to call `internal/client` instead of `actrone`.
- **1.4 — Drop the SDK from `actrone-cli/go.mod`:** remove the `replace` directive and the `require`
  line; `go mod tidy`.
- **1.5 — Tests + gates:** `cd actrone-cli && go build ./... && go test ./... -race && go vet ./...`;
  add/keep tests for the new client methods (happy + error paths, per CLAUDE.md §7). The CLI must be
  green **with no reference to `actrone-go`** before Phase 2.

- **1.6 — Ship the CLI as a standalone binary (goreleaser + installers).** With the SDK dependency
  gone, the CLI is a fully self-contained static binary — package it for users so nobody builds from
  source. (Today `actrone-cli/` has **no** distribution: no README, no goreleaser, no release
  workflow.) The CLI is `main.go` → binary `actrone` (cobra, module `github.com/actrone/actrone-cli`,
  already carrying a `version` var stamped into `root.go` `Version`). Add:
  - **`.goreleaser.yaml`** — build matrix `{linux, darwin, windows} × {amd64, arm64}`, `CGO_ENABLED=0`
    static builds, `ldflags -s -w -X …/cmd.version={{.Version}}` to stamp the version, `archives`,
    `checksums`, SBOM + provenance, and a GitHub Releases target.
  - **`.github/workflows/release-cli.yml`** — tag-triggered (`cli-v*`), runs `goreleaser release`,
    SHA-pinned actions, `id-token` for keyless cosign signing of the archives (optional but preferred).
  - **Installers (via goreleaser):** a **Homebrew tap** (`brews:` → `brew install actrone/tap/actrone`),
    a **Scoop** manifest (`scoops:`, Windows), and a hosted **`curl -fsSL https://get.actrone.com | sh`**
    install script (detects OS/arch, downloads + verifies the checksum, drops `actrone` on PATH). Keep
    `go install github.com/actrone/actrone-cli@latest` working for Go devs.
  - **`actrone-cli/README.md`** — the install matrix (brew / curl / scoop / go install / direct
    download), `actrone login` + `--env`/`--json` basics.
  - **Verify:** `goreleaser release --snapshot --clean` builds all archives + installers locally; a
    dry-run tag produces a draft GitHub Release with every OS/arch artifact + checksums.
  - **Note:** the distribution pipeline is *not* gated on the SDK deletion (Phase 2) — it only needs a
    building CLI — but it is the natural payoff of the 1.1–1.5 migration and should land in the same
    workstream so the "universal single-binary CLI" is real, not aspirational.

**Done-when:** `grep -r "actrone-go" actrone-cli/` returns nothing; the CLI builds/tests green; and
`goreleaser release --snapshot --clean` produces the full cross-platform binary + installer set.

---

## Phase 2 — Delete the Go SDK

- **2.1 —** `git rm -r actrone-go/` (the module + all 26 `.go` files, tests, `go.mod`/`go.sum`,
  README, any Go SDK CI workflow).
- **2.2 —** Remove any Go SDK entry from repo-level tooling: release automation, `go.work` (none
  today — confirm), CODEOWNERS, dependabot/renovate config, contract-test matrices.
- **2.3 —** Build sanity: nothing else in the repo imports `github.com/actrone/actrone-go`
  (Phase 0 sweep + a final `grep`); the orchestrator and CLI build.

**In-development, NOT published — clean delete.** The Go SDK is pre-prod and unpublished, so there is
**no module-proxy retraction and no deprecation notice** to author. "Delete entirely" is literally
`git rm -r actrone-go/` plus the reference scrub below — after which `actrone-go/` **does not exist**
anywhere in the workspace.

---

## Phase 3 — Scrub references & update the SDK matrix

- **3.1 — `CLAUDE.md` §0.1:** remove the Go SDK row; change the **parity rule** from "all THREE SDKs
  (Go + TS + Python)" to "**both** SDKs (TS + Python)"; update the verify-commands table. This is the
  authoritative change — every future client feature now lands 2×, not 3×.
- **3.2 — Docs:** update `backend/docs/{11-publishing.md, actrone-sysdesign-v3.md, development-plan.md,
  guides/08-observability.md}` and any positioning/README that lists a Go SDK. Where a doc example
  showed Go client usage, replace with TS or Python (or drop).
- **3.3 — Comment mentions:** the TS/Python/orchestrator files that merely *reference* Go for parity
  (e.g. `harness/frameworks/autogen.py`, `client.py`, `tool_call.go`, TS adapters) — update the
  comments so they no longer imply a Go SDK.
- **3.4 — Memory:** update `[[sdk-locations]]` (drop Go; note the cut + date + rationale),
  `[[platform-evolution-plans]]`, `[[repo-topology-and-deploy]]`.
- **3.5 — Marketing/site/docs surfaces:** any "SDKs: Go, TS, Python" list (docs site, pricing,
  enterprise page) → "TS, Python". Search the frontend too.

---

## Phase 4 — Verify & communicate

- **4.1 — Full-repo grep** for `actrone-go` / `actrone/actrone-go` returns **zero** (outside this
  plan doc). `actrone-go/` no longer exists.
- **4.2 — Builds green:** CLI, orchestrator, TS SDK, Python SDK.
- **4.3 — Internal note only** (no external users while in-dev): record in `progress.md` that the Go
  SDK was removed and the matrix is now TS + Python, and that the CLI is unaffected (self-contained
  client). No changelog/deprecation announcement is needed.

---

## Risks & mitigations

- **CLI regression (highest):** the CLI loses the SDK's battle-tested transport. → Port the transport
  hygiene explicitly in 1.2; keep `go test -race` green; do 1.x fully before any deletion.
- **Hidden consumer:** an internal script or service imports the Go SDK unnoticed. → Phase 0 sweep +
  the Phase 4 zero-grep gate.
- **Reversibility:** since nothing is published, deletion is just a `git rm` — fully reversible via
  `git revert` while the history exists. Still a *conscious* cut (Prime Directive: don't guess on
  expensive-to-reverse product decisions); confirm the strategic call before Phase 2, and keep the
  deletion in an isolated commit so a revert is clean if a Go-backend prospect materialises.
- **Parity-rule drift:** future work re-adds Go by habit. → The `CLAUDE.md` §0.1 change is the guard;
  the memory note records *why*.

## Sequencing

Phase 0 (sweep) → **Phase 1 (CLI migration 1.1–1.5 — the gate) + CLI packaging (1.6)** → Phase 2
(delete) → Phase 3 (scrub) → Phase 4 (verify). Phase 1 is the bulk of the work and the only risky
part; Phases 2–4 are mechanical once the CLI is decoupled. Do **not** reorder — deleting before the
CLI is migrated breaks `main`. Step 1.6 (goreleaser + installers) only needs a building CLI, so it can
run in parallel with 2–4, but land it in this workstream so the CLI ships as a real single-binary,
installable tool the moment it's SDK-free.
