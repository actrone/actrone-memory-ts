# Hosted SDK package naming plan

**Status:** plan only. No code or package has been changed. Decide before the first hosted SDK
publish: a published name is permanent, and moving later means deprecating one package and starting
another.

**Scope:** the two hosted client SDKs, `actrone-ts` (TypeScript) and `actrone-py` (Python). The OSS
memory libraries are settled as `actrone-memory` on both npm and PyPI and are not part of this plan.

## The question

The TypeScript SDK is named `@actrone/sdk`. PyPI has no scopes, so the Python SDK cannot use that
form. Today it is named `actrone`. Should the two SDKs keep different names, or share one name the way
the memory libraries share `actrone-memory`?

## Facts (checked 2026-09-22)

| Item | State |
| --- | --- |
| TypeScript SDK | `actrone-ts/package.json` name `@actrone/sdk`, version 0.1.0 |
| Python SDK | `actrone-py/pyproject.toml` name `actrone`, version 1.0.0, imported as `import actrone` |
| npm `@actrone/sdk`, `actrone-sdk`, `actrone` | All free (404) |
| PyPI `actrone`, `actrone-sdk` | Both free (404) |
| npm scope `@actrone` | Yours: it is the scope of your npm user `actrone`, so no organization is needed |
| Precedent | The memory libraries use one name, `actrone-memory`, on both registries |
| CLI | Named `actrone`, distributed through Homebrew and Scoop, not npm or PyPI, so it does not collide |

## Options

| | A: keep as is | **B: `actrone-sdk` on both** | C: mixed |
| --- | --- | --- | --- |
| npm | `npm install @actrone/sdk` | `npm install actrone-sdk` | `npm install @actrone/sdk` |
| PyPI | `pip install actrone` | `pip install actrone-sdk` | `pip install actrone-sdk` |
| TS import | `from "@actrone/sdk"` | `from "actrone-sdk"` | `from "@actrone/sdk"` |
| Python import | `import actrone` | `import actrone` (unchanged) | `import actrone` (unchanged) |
| Names to remember | two | **one**, like `actrone-memory` | two |
| Change needed | none | about 350 references, mostly docs | about 110 Python references |

**A** has the shortest Python install and costs nothing, but the product has two names, and it breaks
the one-name pattern the memory libraries set.

**B** gives each product one name everywhere: `actrone-memory` for memory and `actrone-sdk` for the
platform. Docs, marketing and support answers say one thing for both languages. npm needs no scope.

**C** combines the costs of A and B without the benefit of either.

## Recommendation: option B

Name both SDKs `actrone-sdk`, and keep the Python import name `actrone`. A distribution name and an
import name are allowed to differ, as with `pip install scikit-learn` and `import sklearn`. Keeping
`import actrone` means no Python code changes, only the distribution name. The trade-off: a Python user
installs `actrone-sdk` but imports `actrone`, which the README states on its first line.

Also **reserve `actrone` on both registries** once `actrone-sdk` is published, so nobody else can take
the obvious name. Publish a minimal `actrone` package on each registry that depends on `actrone-sdk`
and says so in its description. `pip install actrone` then still works rather than reaching a stranger's
package.

## Blast radius (counted 2026-09-22, excluding lockfiles, builds and generated references)

| Reference | Count | Where |
| --- | --- | --- |
| `@actrone/sdk` | about 240 | `actrone-ts` 125, `infra` docs 44, `frontend` 39, `progress.md` 11, `actrone-memory-ts` 7, `actrone-cli` 4, `create-actrone-app` 3, `actrone-py` 3, `backend` 2, `CLAUDE.md` 1 |
| `pip install actrone` and `uv add actrone` | about 110 | `actrone-py` 53, `frontend` 45, `infra` docs 7, `backend` 2, `progress.md` 1 |
| Python dependency strings (`"actrone>=`) | 2 | `actrone-cli` templates |

Unlike the memory rename, `@actrone/sdk` is unambiguous, so a direct replacement is safe for it. The
Python side is not: `actrone` is also the import name, the CLI name and the product name. It must be
changed only in install commands, dependency strings and `pyproject.toml`.

## Implementation steps (when approved)

1. **TypeScript:** set `name` to `actrone-sdk` in `actrone-ts/package.json`. Drop `publishConfig.access`
   and `--access public` from `publish.yml` (unscoped packages are public by default). Replace
   `@actrone/sdk` with `actrone-sdk` everywhere, then regenerate the lockfiles that reference it.
2. **Python:** set `name = "actrone-sdk"` in `actrone-py/pyproject.toml`. Change `pip install actrone`,
   `uv add actrone` and extras such as `actrone[strands]` to `actrone-sdk`, and update the
   `actrone-cli` dependency templates. Leave every `import actrone` as it is.
3. **Frontend:** install snippets, docs pages, `llms.txt`, the control tower's code samples, and the
   TypeDoc `name` for the SDK reference. Then re-vendor the references.
4. **Registries:** a pending PyPI publisher for `actrone-sdk`, and an npm placeholder plus trusted
   publisher for `actrone-sdk`, as in `Actrone_SDK_OSS_Publishing_Runbook.md` section 2. Then publish the
   two `actrone` reservation packages.
5. **Docs:** `CLAUDE.md` section 0.1, both publishing runbooks, and this plan's status.
6. **Verify:** `actrone-ts` typecheck, tests and `npm pack`; `actrone-py` mypy, pytest and `uv build`;
   all four frontend apps' gates; `brand:check` and `seo:smoke`. A final search for `@actrone/sdk` and
   `pip install actrone` (without `-sdk` or `-memory`) should return nothing outside history files.

**Timing:** after the OSS launch, before the hosted platform launches. None of this affects the OSS
launch: the memory libraries do not depend on either SDK.
