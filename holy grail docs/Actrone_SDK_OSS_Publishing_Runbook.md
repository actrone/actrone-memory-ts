# Actrone SDK and OSS publishing runbook

Everything that must be done **externally** (GitHub, npm, PyPI, Homebrew, Scoop) to publish the
Actrone client SDKs and open-source libraries, plus the per-release procedure. The **in-repo release
automation is already wired** (see the table); this runbook is the one-time external setup and the
recurring "cut a release" steps.

For the OSS launch itself (`actrone-memory` on PyPI and npm), follow the step-by-step
`Actrone_OSS_Package_Publishing_Runbook.md`. This document is the wider reference that also covers the
hosted SDKs and the CLI.

> **Status refreshed 2026-09-21.** Nothing is published: `actrone-memory` (PyPI and npm), `actrone`
> (PyPI) and `@actrone/sdk` (npm) all return 404. Every workflow is gated on a `v*` git tag, so nothing
> publishes until you push one, and completing the setup below is safe.
>
> **npm account:** the npm **user** is named `actrone`. Users and organizations share one namespace,
> which is why an `actrone` organization could not be created, and no organization is needed: the
> `@actrone` scope is that user's own scope. The TypeScript memory library was renamed from
> `@actrone/memory` to the unscoped `actrone-memory`, the same name it has on PyPI. The hosted SDK keeps
> `@actrone/sdk`, published from the same user (§2.2).

Commands in this runbook run in Windows PowerShell 5.1, PowerShell 7 and bash. They avoid `&&`, which
Windows PowerShell 5.1 rejects, so run them one line at a time.

---

## 0. The five publishable artifacts

| Artifact | Repo | Registry | Publish workflow (wired) | Trigger | Current version |
| --- | --- | --- | --- | --- | --- |
| `@actrone/sdk` | `actrone-ts` | **npm** | `.github/workflows/publish.yml` | push tag `v*` | `0.1.0` |
| `actrone-memory` | `actrone-memory-ts` | **npm** | `.github/workflows/publish.yml` | push tag `v*` | `0.1.0` |
| `actrone` | `actrone-py` | **PyPI** | `.github/workflows/publish.yml` | push tag `v*` | `1.0.0` |
| `actrone-memory` | `actrone-memory-py` | **PyPI** | `.github/workflows/publish.yml` | push tag `v*` | `0.2.0` |
| `actrone` (CLI) | `actrone-cli` | **GitHub Releases + Homebrew + Scoop** | `.github/workflows/release-cli.yml` (goreleaser) | push tag `v*` | from tag |

Each repo also has a `ci.yml` (type-check, lint and test on every PR). The publish workflows re-run the
same gate before shipping (`prepublishOnly` for npm, ruff, mypy and pytest for PyPI), so a broken build
can never publish.

### Dependency and publish-order constraints

- **`actrone` (PyPI) depends on `actrone-memory>=0.1.0`**, so `pip install actrone` needs
  `actrone-memory` to already be on PyPI. **Publish `actrone-memory` before `actrone`.** (The build
  itself does not need it: the local `[tool.uv.sources]` path override is dev-only and is **not** baked
  into the wheel metadata. End users simply cannot install `actrone` until `actrone-memory` is on PyPI.)
- The two **npm** packages are independent (no cross-dependency), so publish in any order.
- The CLI is standalone.

---

## 1. GitHub: one-time setup (per repo)

### 1.1 Repository visibility

- **npm provenance** (used by both TS publish workflows via `--provenance` and `id-token: write`)
  **requires a public repository.** If `actrone-ts` or `actrone-memory-ts` is private, make it public
  before releasing, or remove `--provenance` from its `publish.yml`.
- The **cross-repo checkout** in `actrone-py/publish.yml` (it checks out the sibling
  `actrone-memory-py` for the pre-publish test) uses `GITHUB_TOKEN`, which can read a **public** repo.
  If `actrone-memory-py` is private, replace that token with a PAT or App token that can read it (add a
  secret, for example `MEMORY_REPO_TOKEN`, and reference it in the checkout step).

### 1.2 Secrets (Settings, Secrets and variables, Actions)

| Repo | Secret | What it is |
| --- | --- | --- |
| `actrone-cli` | `TAP_GITHUB_TOKEN` | PAT that can push to `actrone/homebrew-tap` **and** `actrone/scoop-bucket`. Fine-grained PAT with **Contents: Read and write** on both repos, or a classic PAT with the `repo` scope. |
| `actrone-ts` | none | The workflow uses npm **OIDC trusted publishing** (no token). |
| `actrone-memory-ts` | none | Same (OIDC trusted publishing). |
| `actrone-py` | none | PyPI trusted publishing is token-free. Needs the `pypi` environment (below), plus `MEMORY_REPO_TOKEN` if the sibling repo is private. |
| `actrone-memory-py` | none | Trusted publishing, plus the `pypi` environment. |

> **Zero long-lived publish secrets by design.** Only `TAP_GITHUB_TOKEN` remains, and it only writes
> formula and manifest files to two dedicated repos. Every registry publish (npm and PyPI, two each)
> authenticates with short-lived GitHub OIDC credentials; see §7 for why that matters.

### 1.3 Environments (Settings, Environments)

- Create an environment named **`pypi`** in **both** `actrone-py` and `actrone-memory-py` (the
  workflows declare `environment: pypi`). Add a required-reviewer protection rule so a human approves
  each PyPI publish.

### 1.4 Tap repos (CLI): already created ✅

- `github.com/actrone/homebrew-tap` and `github.com/actrone/scoop-bucket` exist. goreleaser **writes to
  them remotely** on release using `TAP_GITHUB_TOKEN`, so no local clone is ever needed. They can start
  empty; goreleaser creates the cask and manifest files.

---

## 2. npm: one-time setup

The workflows use **npm OIDC trusted publishing**, with no `NPM_TOKEN`. GitHub's OIDC identity
authenticates the publish with short-lived, workflow-scoped credentials, and provenance (a
Sigstore-signed attestation in npm's public transparency log) is attached automatically. This needs npm
CLI 11.5.1 or later (the workflows pin npm 11.19.1), a public repo, and `id-token: write` (set).

A trusted publisher can only be configured on a package that already exists, so each new package needs
a one-time placeholder publish first. No npm organization is involved: both packages are published by
the `actrone` npm user, which owns the `@actrone` scope. Run `npm whoami` before any manual publish; it
must print `actrone`.

### 2.1 `actrone-memory`

Follow `Actrone_OSS_Package_Publishing_Runbook.md`, section 3. In short:

1. Publish a one-file `actrone-memory@0.0.0` placeholder from an empty folder **outside every
   repository**, created with `npm init -y` and `npm pkg set` (never `echo ... >`, which writes UTF-16
   in Windows PowerShell 5.1). Confirm `npm pack --dry-run` reports `total files: 1` before publishing,
   because `npm publish` uploads everything in the folder, `.env` files included.
2. Deprecate the placeholder.
3. Configure the trusted publisher: GitHub owner `actrone`, repository `actrone-memory-ts`, workflow
   `publish.yml`, no environment, and **direct `npm publish`** allowed.
4. Add a second maintainer with `npm owner add <their-npm-username> actrone-memory`.

### 2.2 The hosted TypeScript SDK (`@actrone/sdk`)

Publish it from the `actrone` user when the hosted platform launches, the same way as §2.1, with two
differences:

1. The placeholder is scoped, so set `name=@actrone/sdk` and publish it with `npm publish --access public`.
   Scoped packages default to private, which a free account cannot publish.
2. The trusted publisher's repository is `actrone-ts`. Its workflow already passes `--access public`,
   and `package.json` sets `publishConfig.access` to `public`.

**Verify after release:** `npm view actrone-memory version`, and the npm page shows the green
**Provenance** badge (it links to the signed attestation).

---

## 3. PyPI: one-time setup (`actrone`, `actrone-memory`)

Both use **trusted publishing (OIDC)**, with no API token. For each of the two projects:

1. Log in to **pypi.org**, then *Your account*, **Publishing**, **Add a pending publisher** (this sets
   up the trust relationship *before* the project exists):
   - **PyPI project name:** `actrone` (for `actrone-py`) or `actrone-memory` (for `actrone-memory-py`)
   - **Owner:** `actrone`
   - **Repository name:** `actrone-py` or `actrone-memory-py`
   - **Workflow name:** `publish.yml`
   - **Environment name:** `pypi`
2. Make sure the matching **`pypi` GitHub environment** exists (§1.3).
3. On the first tag push, the pending publisher becomes a real trusted publisher and the project is
   created automatically. A pending publisher does not reserve the name until then, so release soon
   after adding it.
4. **Order:** publish **`actrone-memory` first**, then `actrone` (§0).

> **PEP 740 digital attestations come for free.** `pypa/gh-action-pypi-publish` (used by both
> workflows) attaches signed provenance attestations by default when publishing via trusted
> publishing, with nothing to configure. Each release then shows a verifiable Sigstore attestation on
> its PyPI files page.

**Verify after release:** the pypi.org project page shows the new version and the attestation on the
file details, and `uvx --from actrone==<version> python -c "import actrone"` resolves, pulling
`actrone-memory` from PyPI.

> Optional rehearsal: repeat the pending-publisher setup on **test.pypi.org** and add a
> `repository-url: https://test.pypi.org/legacy/` input to a throwaway run, to rehearse without
> touching production PyPI.

---

## 4. Homebrew and Scoop (CLI): setup mostly done ✅

- The tap repos exist (§1.4). Set `TAP_GITHUB_TOKEN` (§1.2). That is the whole external setup.
- On a `v*` tag, `release-cli.yml` runs goreleaser, which builds the static `actrone` binary for macOS,
  Linux and Windows on each architecture, creates the **GitHub Release** with checksums and SBOMs,
  **cosign keyless-signs** the artifacts (Sigstore OIDC, `id-token: write`), and commits the **Homebrew
  cask** to `homebrew-tap` and the **Scoop manifest** to `scoop-bucket`.

**End users install:**

```sh
# Homebrew (macOS and Linux)
brew install actrone/homebrew-tap/actrone

# Scoop (Windows)
scoop bucket add actrone https://github.com/actrone/scoop-bucket
scoop install actrone
```

---

## 5. Cutting a release (recurring, per package)

Every workflow triggers on a **`v*` tag whose version must match the manifest version**. npm and PyPI
reject a duplicate version, and the workflows reject a mismatched one, so a mistake fails the run loudly
instead of publishing the wrong thing.

**npm packages (`actrone-ts`, `actrone-memory-ts`):**

```sh
# in the repo, on main, with a clean tree
npm version patch          # bumps package.json and creates the version commit and v-tag
git push
git push --tags
# publish.yml runs prepublishOnly (typecheck, test, build), then `npm publish --provenance`
```

**PyPI packages (`actrone-py`, `actrone-memory-py`):**

```sh
# bump `version` in pyproject.toml, update CHANGELOG.md, and commit
git tag vX.Y.Z
git push origin main --tags
# publish.yml runs the gate (ruff, mypy, pytest), then `uv build` and the trusted publish
```

**CLI (`actrone-cli`):**

```sh
git tag vX.Y.Z
git push origin --tags
# release-cli.yml runs goreleaser: GitHub Release, cosign, Homebrew tap and Scoop bucket
```

> Keep the tag version equal to the manifest version. For the CLI, goreleaser derives the version from
> the tag, so there is nothing to bump in the repo.

---

## 6. External-setup checklist (tick before the first release)

### GitHub

- [ ] `actrone-ts` and `actrone-memory-ts` are **public** (for npm provenance), or `--provenance` removed
- [ ] `actrone-cli` secret `TAP_GITHUB_TOKEN` set (write access to homebrew-tap and scoop-bucket)
- [ ] `pypi` environment created in `actrone-py` **and** `actrone-memory-py`
- [ ] if `actrone-memory-py` is private: `actrone-py` has a PAT secret that can read it, wired into the checkout step

### npm

- [ ] `actrone-memory` placeholder published and deprecated; trusted publisher configured (§2.1)
- [ ] `@actrone/sdk` placeholder published with `--access public`; trusted publisher configured (§2.2)

### PyPI

- [ ] pending trusted publisher added for `actrone-memory` (owner, repo, `publish.yml`, `pypi`)
- [ ] pending trusted publisher added for `actrone` (owner, repo, `publish.yml`, `pypi`)

### Homebrew and Scoop

- [x] `homebrew-tap` and `scoop-bucket` repos exist
- [ ] `TAP_GITHUB_TOKEN` set (same as the GitHub list)

### Licensing: resolved

- [x] **`actrone` (Python SDK) uses Apache-2.0**, aligned with the TypeScript SDK (both client SDKs
      Apache-2.0; both memory libraries MIT). `actrone-py` ships an Apache-2.0 `LICENSE` and declares it
      in PEP 639 SPDX form (`license = "Apache-2.0"` plus `license-files`); a `uv build` confirms
      `License-Expression: Apache-2.0`. Rationale: a client SDK is a thin wrapper over the commercial
      hosted API, so permissive licensing maximises adoption while the moat (platform, API, governance
      engine) stays commercial.

### First release order

1. [ ] `actrone-memory` (PyPI), then verify it installs
2. [ ] `actrone-memory` (npm)
3. [ ] `actrone` (PyPI), once the hosted platform launches
4. [ ] `@actrone/sdk` (npm), once the hosted platform launches
5. [ ] `actrone` CLI (tag, then Homebrew and Scoop)

---

## 7. What makes this best-in-class (and the small backlog)

### 7.1 Package quality: done for all libraries

Each published library carries what reviewers and registries reward:

- A **README** that renders on the registry page (npm and PyPI) with install steps and a runnable
  quickstart, including `actrone-py`, whose README was once a single line. Links to repo files are
  absolute, because PyPI does not rewrite relative links.
- A **CHANGELOG.md** (Keep a Changelog and SemVer) and a **LICENSE** file in every library (the SDKs
  Apache-2.0, both memory libraries MIT).
- **Rich metadata:** keywords (npm search and PyPI), `bugs`/`Issues`, `Changelog` and `Documentation`
  project URLs (PyPI renders these as sidebar links **with icons** for well-known labels), a correct
  `repository`, `engines`/`requires-python`, `sideEffects: false` (TS tree-shaking), and typed entry
  points (`exports`/`types`).

### 7.2 The differentiator: a signed, token-free supply chain across every artifact

Very few SDK families sign their whole distribution surface. Actrone signs **all of it**, with **zero
long-lived publish secrets**:

| Artifact | Auth | Signed provenance |
| --- | --- | --- |
| `actrone-memory` and the hosted TS SDK (npm) | OIDC **trusted publishing** (no token) | **npm provenance** (Sigstore, public transparency log) |
| `actrone`, `actrone-memory` (PyPI) | OIDC **trusted publishing** (no token) | **PEP 740 attestations** (Sigstore) |
| `actrone` CLI (binaries) | GitHub OIDC | **cosign keyless signatures**, checksums and **SBOMs** |

Every install is therefore cryptographically traceable to *this repo, this commit, this workflow*,
verifiable with `npm audit signatures`, PyPI's attestation viewer or `pypi-attestations`, and
`cosign verify-blob`. The only remaining secret anywhere is `TAP_GITHUB_TOKEN`, which only writes
formula files to two dedicated repos.

**Ideas nobody else bundles (optional, future polish):**

- A one-command **`actrone verify`** in the CLI that checks the provenance or attestation of whichever
  SDK the user has installed: "prove your Actrone install is genuine" as a first-class experience.
- Publish an **SBOM alongside the npm and PyPI artifacts** too (not just the CLI), and link it from each
  release.
- **Sub-path exports are already in place** for the TS packages (`/adapters`, `/harness`,
  `/memory/adapters`), so tree-shaking and `import type` keep install size minimal.

### 7.3 Hardening backlog (non-blocking)

- **Action pinning.** `actrone-memory-ts` and `actrone-memory-py` pin every action to a commit SHA.
  `actrone-ts`, `actrone-py` and `actrone-cli` still use tag refs (`actions/checkout@v4`,
  `pypa/gh-action-pypi-publish@release/v1`, `goreleaser/goreleaser-action@v6` and others). Repin them to
  commit SHAs before their first release.
- **Version single-sourcing.** Consider a release script so the git tag and the manifest version can
  never drift (today a drift fails the run rather than publishing the wrong version).
