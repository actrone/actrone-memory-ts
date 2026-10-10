# OSS package publishing runbook

Follow this runbook to publish `actrone-memory`, which has one name on both registries: PyPI for Python and npm for TypeScript. It covers the accounts, the one-time registry setup, the release commands and the checks afterwards. Both repos contain working `publish.yml` workflows that use trusted publishing, so no long-lived tokens are needed.

**Owner**: whoever runs the launch. **Time needed**: about 1 hour the first time, then about 10 minutes per release.

**Shells.** Every command here runs unchanged in Windows PowerShell 5.1, PowerShell 7 and bash. Run them one line at a time. The runbook deliberately avoids two things that break in Windows PowerShell 5.1: `&&`, which is a parse error there, and writing files with `echo ... >`, which produces UTF-16 that npm cannot read.

## State as of 2026-09-22

| Item | State |
| --- | --- |
| PyPI name `actrone-memory` | Free (returns 404, re-checked 2026-09-22) |
| npm name `actrone-memory` | Free (returns 404). No existing package differs from it only by punctuation (`actronememory`, `actrone_memory` and `actrone.memory` all return 404), so npm's similar-name rule will not block it. |
| npm account | Your npm **user** is named `actrone`. npm users and organizations share one namespace, which is why an `actrone` organization could not be created. No organization is needed: `actrone-memory` is unscoped, matching PyPI, and is published from the `actrone` user. An unused `actrone-memory` organization also exists; nothing depends on it. |
| GitHub org `actrone` | Exists |
| GitHub repos `actrone-memory-py`, `actrone-memory-ts`, `create-actrone-app` | **Public since 2026-09-24**, with the protections in [section 6](#6-lock-down-publishing) already applied: `main` and `v*` tag rulesets, and the `pypi` and `npm` environments restricted to `v*` tags with you as required reviewer. Registries re-checked 2026-09-24: nothing published yet, no tags. |
| Local repos | On `main`, no tags, remotes set to the GitHub URLs above. **Both have uncommitted launch changes**: commit them before pushing, so the tagged commit is the one that was tested. |
| Python artifacts | Rebuilt from the current tree on 2026-09-22: 0.2.0 source archive 115.0 kB, wheel 125.5 kB. `twine check` passes on both. A bare `pip install actrone-memory` pulls 11 packages and makes no network calls at runtime. |
| npm tarball | `actrone-memory@0.1.0`: 21 files, 108.6 kB packed (422.9 kB unpacked), CLI shebang present. `npm publish --dry-run` runs the full `prepublishOnly` gate and reports no warnings. |
| Dry runs (2026-09-22) | Both libraries installed from their built artifacts and exercised end to end, including against real Redis 7.4 and Qdrant 1.13. `create-actrone-app` scaffolds, typechecks and runs a project from its packed tarball. The demo (`actrone-memory-demo`) passes its scenario, parity, live-store and UI suites against the current sources. |
| Versions and changelogs | Python 0.2.0 under `## [0.2.0] - 2026-09-21`; TypeScript 0.1.0 under `## [0.1.0] - 2026-09-21`. |

Re-check the registry and GitHub rows before starting. They change the moment you create accounts or repos.

## How publishing works

Pushing a version tag (`v*`) triggers `publish.yml` in each repo. The workflow:

1. Requires the `ci.yml` run for that exact commit to have concluded green.
2. Requires the tag to match the version in `pyproject.toml` or `package.json`.
3. Re-runs a subset of checks, builds, validates and publishes.
4. Creates a GitHub Release with generated notes.

Authentication uses OIDC trusted publishing, so GitHub proves its identity to the registry with short-lived credentials. Registries accept the publish only if the repo, workflow file and environment match what you configured on the registry side. Most first-release failures are a mismatch in one of those fields.

**Versions are permanent.** Neither registry lets you upload the same version number twice, even after deleting it.

## Order of operations

1. [Pre-flight checks](#pre-flight-checks).
2. [Prepare GitHub](#1-prepare-github).
3. [Set up PyPI](#2-set-up-pypi) and [set up npm](#3-set-up-npm). These are independent, so do them in parallel.
4. [Tag and release](#4-tag-and-release).
5. [Verify](#5-verify).
6. [Lock down publishing](#6-lock-down-publishing).

## Pre-flight checks

The packaging review on 2026-09-21 found five problems. All are fixed in the working trees:

- **Python source archive trimmed.** `pyproject.toml` excludes `/media`, `/uv.lock`, `/.github` and `/ci` from the sdist, which took it from 36 MB to 110.7 kB. The wheel is built from the trimmed archive, which proves nothing it needs was dropped.
- **README links are absolute.** PyPI does not rewrite relative links, so links to `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` and `CHANGELOG.md` now point at `https://github.com/actrone/<repo>/blob/main/<file>`. They resolve once the repos are public.
- **Version, tag and changelog agree.** Python has a single `[0.2.0]` section and TypeScript a single `[0.1.0]` section, both dated 2026-09-21.
- **The npm package is renamed** from `@actrone/memory` to `actrone-memory` in the package, its docs, the website, the demo and the API reference.
- **The publish workflow pins npm** to 11.19.1 instead of `latest`, which has moved to npm 12.

The dry runs on 2026-09-22 found more, all fixed in the working trees. Each would have failed a release or misled a first user:

- **Python CI's lint job would have gone red** on the first push: it installed a hand-picked dependency list, so mypy lacked the store extras, and bandit flagged 10 false positives on the identifier-validated SQL. CI and `publish.yml` now install `.[dev,redis,qdrant,pgvector]`, and each SQL string carries a `nosec` marker with the reason.
- **Recall was near zero out of the box.** One relevance threshold (0.7 in TypeScript, 0.72 in Python) was applied to every embedder; measured recall was 4% for the keyword embedder. Each built-in embedder now declares a calibrated threshold (keyword 0.3, bge-small 0.63, MiniLM 0.4), and TypeScript's `MemoryManager.create()` uses fastembed automatically when it is installed.
- **The TypeScript Qdrant store failed against the current Qdrant client**, which removed `search` in favour of `query`. The store now uses `query` and still accepts older clients.
- **Python made a network call on first use**: `tiktoken` downloads its encoding file. It is now an opt-in `[tiktoken]` extra, and the default counter needs no network.
- **Python logged every debug line to stdout** when the host app had not configured structlog. The library now routes through standard logging in that case, so it is quiet by default.
- **`npm pkg fix` normalised the manifests** (the `bin` path and the repository URL) in `actrone-memory` and `create-actrone-app`, which removed the publish warnings.

If you release on a later day, change the date in both changelog headings first. Then rebuild and check from each repo root:

```bash
# actrone-memory-py
uv build
uvx twine check dist/*

# actrone-memory-ts
npm ci
npm pack --dry-run
```

## 1. Prepare GitHub

The repos must be public before you publish. npm provenance requires a public repo, and the publish workflows read CI results through the GitHub API.

1. Create `actrone/actrone-memory-py` and `actrone/actrone-memory-ts` and make both public.
2. In each local repo, commit the launch changes and push `main`. Both `ci.yml` files run on pushes to `main`.
3. Wait for `ci.yml` to finish green in both repos. If it goes red, fix it before continuing, because the publish workflow refuses to run against a commit whose CI did not succeed.
4. In `actrone-memory-py`, open **Settings**, **Environments**, **New environment**, and create one named `pypi`. In `actrone-memory-ts`, create one named `npm`. In each, add yourself as a required reviewer. The publish job then waits for your approval before it can publish.

## 2. Set up PyPI

PyPI supports trusted publishing before the project exists, so no placeholder release is needed.

1. Register at [pypi.org/account/register](https://pypi.org/account/register/) and verify your email address.
2. Enable two-factor authentication. PyPI requires it. Use an authenticator app or a passkey, and store the recovery codes somewhere safe.
3. Open [pypi.org/manage/account/publishing](https://pypi.org/manage/account/publishing/) and add a **pending publisher** on the GitHub tab:

   | Field | Value |
   | --- | --- |
   | PyPI project name | `actrone-memory` |
   | Owner | `actrone` |
   | Repository name | `actrone-memory-py` |
   | Workflow name | `publish.yml` |
   | Environment name | `pypi` |

A pending publisher does **not** reserve the project name until its first use. Release soon after configuring it so nobody else claims `actrone-memory` in between.

The environment name must match the workflow. `publish.yml` declares `environment: pypi`, so the value above must be exactly `pypi`.

## 3. Set up npm

npm needs one extra step. A trusted publisher can only be configured on a package that already exists on the registry, and `actrone-memory` does not exist yet. So you publish a one-file placeholder by hand first, and the real `0.1.0` still ships from CI with a provenance attestation.

1. Sign up at [npmjs.com/signup](https://www.npmjs.com/signup) and verify your email address.
2. Enable two-factor authentication under **Account**, **Two-Factor Authentication**, with the mode **Authorization and publishing**. Store the recovery codes.
3. No organization is needed, just as PyPI needs none. `actrone-memory` is unscoped, so it belongs to the npm user that publishes it (`actrone`) and is public by default. Log in as `actrone` in the next steps.
4. Create the placeholder in a new, empty folder **outside every repository and outside the workspace**, starting from your home folder:

   ```bash
   cd ~
   mkdir actrone-npm-bootstrap
   cd actrone-npm-bootstrap
   npm init -y
   npm pkg set name=actrone-memory version=0.0.0 license=MIT "description=Placeholder while trusted publishing is configured."
   npm pkg delete main scripts keywords author type
   npm pack --dry-run
   ```

   **Stop unless the last command reports `total files: 1` and lists only `package.json`.** `npm publish` uploads everything in the current folder that is not ignored, and npm does not ignore `.env` files. Run from a repository or the workspace root, it would publish source code and secrets to a public registry, permanently.

5. Publish the placeholder and mark it deprecated:

   ```bash
   npm login
   npm whoami
   npm publish
   npm deprecate actrone-memory@0.0.0 "Placeholder. Use 0.1.0 or later."
   ```

   `npm whoami` must print `actrone` before you publish.

   Each command that writes to the registry prompts for a one-time code from your authenticator app. Do not unpublish the placeholder later: it is harmless once deprecated, and unpublishing a package's only version blocks the name for 24 hours.

6. Remove the bootstrap folder:

   ```bash
   cd ~
   rm -r actrone-npm-bootstrap
   ```

7. On npmjs.com, open the `actrone-memory` package, choose **Settings**, then **Trusted Publisher**, then **GitHub Actions**:

   | Field | Value |
   | --- | --- |
   | Organization or user | `actrone`, the GitHub organization that owns the repo (not an npm organization) |
   | Repository | `actrone-memory-ts` |
   | Workflow filename | `publish.yml` |
   | Environment | `npm`. It must match `environment: npm` in `publish.yml`, or the publish is rejected. |
   | Allowed actions | Enable **direct `npm publish`** |

8. Add a second maintainer, so the package does not depend on one person: `npm owner add <their-npm-username> actrone-memory`.

Since 3 September 2026, new trusted publishers default to `npm stage publish` only. The workflow runs `npm publish --provenance`, which needs the direct-publish permission. If you leave it off, the publish step is rejected.

Trusted publishing requires npm CLI 11.5.1 or later and Node 22.14 or later. The workflow installs npm 11.19.1 and uses Node 22.

## 4. Tag and release

Release `actrone-memory` for TypeScript before `create-actrone-app`: the scaffolded project installs `actrone-memory@^0.1.0` from npm, so a scaffold released first would generate projects that cannot install.

Run these from each repo root, on the commit whose CI is green:

```bash
# actrone-memory-py: the tag must match pyproject.toml
git tag v0.2.0
git push origin v0.2.0

# actrone-memory-ts: the tag must match package.json
git tag v0.1.0
git push origin v0.1.0
```

Then:

1. Open the **Actions** tab and watch the **Publish** workflow.
2. Approve the run when it shows **Waiting for review**: open the run, select **Review deployments**, tick `pypi` or `npm`, and select **Approve and deploy**. GitHub also notifies you on github.com and by email, and through the GitHub Mobile app if you use it, depending on your notification settings.
3. Wait for the workflow to finish. It creates the GitHub Release itself.

If a step fails before the upload (usually trusted-publisher settings that do not match), fix the setting and choose **Re-run failed jobs**. A failed publish uploads nothing, so the version number is not consumed. If the workflow fails on the version check, delete the tag, correct the version, and push a new tag:

```bash
git tag -d v0.2.0
git push --delete origin v0.2.0
```

## 5. Verify

Run these from any folder outside the repos:

```bash
# Python, in a throwaway environment
uvx --from actrone-memory==0.2.0 actrone-memory --help

# npm
npm view actrone-memory version
npx --yes actrone-memory@0.1.0 --help
```

Then check the package pages:

- **PyPI** (`pypi.org/project/actrone-memory`): the README renders, every link works, and the sidebar shows the Repository, Documentation, Issues and Changelog links.
- **npm** (`npmjs.com/package/actrone-memory`): the README renders, the page shows the **Provenance** badge, and version 0.0.0 is marked deprecated.
- **GitHub**: each repo has a Release for the tag.

## 6. Lock down publishing

No token exists, so the remaining risk is anyone with write access to a repository: they could push a tag or edit `publish.yml`. These settings close that off. Do them once, in `actrone-memory-py`, `actrone-memory-ts` and `create-actrone-app`.

1. **Limit each environment to version tags.** Open **Settings**, **Environments**, then `pypi` or `npm`. Under **Deployment branches and tags**, choose **Selected branches and tags** and add the tag rule `v*`. A run from a branch can then never use the environment.
2. **Protect the version tags.** Open **Settings**, **Rules**, **Rulesets**, **New ruleset**, **New tag ruleset**. Target tags matching `v*`, enable **Restrict creations**, **Restrict updates** and **Restrict deletions**, and add yourself to the bypass list. Only you can then create or move a release tag.
3. **Disallow npm tokens,** after the first successful npm publish of each package. On npmjs.com, open the package, then **Settings**, **Publishing access**, and choose **Require two-factor authentication and disallow tokens**. A leaked npm password or token can then no longer publish; only the trusted publisher can.
4. **Never create a PyPI API token.** The trusted publisher replaces it, and an unused token is only something to leak.
5. **Keep write access small.** Everyone with write access to these repositories should have 2FA enabled on GitHub.

The workflows already do their part: each publish job waits for the environment's required reviewer, every third-party action is pinned to a commit SHA, and npm and `uv` are pinned to exact versions.

## After publishing

- Update the SEO runbook gates for public repos and published packages: `Actrone_OSS_Launch_SEO_Runbook.md`, Phase 0, steps 5 and 6.
- Set the GitHub About panel, topics and social preview image, and refine package keywords, using `seo/guides/github-pypi-npm-discoverability.md`. Package metadata is frozen per release, so keyword changes ship with the next version.
- When the hosted SDK is ready, publish `@actrone/sdk` from the same `actrone` user: `@actrone` is that user's own scope, so no organization is needed there either. A scoped package needs `--access public`, which its workflow already passes. On PyPI, reserve `actrone` with a pending publisher.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `The token '&&' is not a valid statement separator` | Windows PowerShell 5.1 has no `&&` | Run the commands one per line, as written in this runbook. |
| `npm publish` fails with `EJSONPARSE` or an unexpected character | `package.json` was written with `echo ... >` in Windows PowerShell 5.1, which produces UTF-16 | Delete it and recreate it with `npm init -y` and `npm pkg set`, as in step 3.4. |
| `npm pack --dry-run` lists more than `package.json` | You are not in the empty bootstrap folder | Do not publish. Go back to step 3.4. |
| npm returns 404 "Scope not found", or 403, for a scoped name | A scoped name slipped into `package.json`, or you are logged in as a different npm user | The package name is `actrone-memory`, with no scope. Check `name` in `package.json`, and `npm whoami` should print `actrone`. |
| A TypeScript build fails with `Unexpected "\xff" in JSON` in `../package.json` | A UTF-16 `package.json` was left in a parent folder, often the workspace root after a bootstrap attempt | Delete that stray file. Builds read `package.json` files in parent folders. |
| Workflow fails at "Require CI to have passed" | CI has not finished or went red on that commit | Wait for green on `main`, or tag a commit whose CI passed. |
| Workflow fails at "Verify tag matches" | Tag differs from `pyproject.toml` or `package.json` | Delete the tag, fix the version, and re-tag. |
| PyPI publish returns `invalid-publisher` | Owner, repo, workflow or environment on PyPI does not match | Compare each field against `publish.yml`, especially the environment name `pypi`. |
| npm publish returns 404 or "not authorized" from CI | No trusted publisher yet, or direct publish is not enabled | Complete step 3.7 and enable direct `npm publish`. |
| npm publish fails on provenance | Repo is private, or `id-token: write` is missing | Make the repo public, and keep the workflow's `permissions` block. |
| `npm publish` says the version already exists | That version was already published, including the placeholder | Bump the version and re-tag. |
| Package page shows dead README links | The repo is still private, or a relative link was added | Make the repo public; use absolute GitHub URLs and release a patch version. |

## References

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm unpublish policy](https://docs.npmjs.com/policies/unpublish)
- [PyPI: creating a project through a pending publisher](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/)
- [PyPI trusted publishers overview](https://docs.pypi.org/trusted-publishers/)
- Workflows: `actrone-memory-py/.github/workflows/publish.yml` and `actrone-memory-ts/.github/workflows/publish.yml`
