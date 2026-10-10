# Actrone — Python SDK Repo Extraction Plan

> **Goal:** move the Python SDK out of the backend and into its **own top-level repository**
> (`actrone-py/`), exactly as the TS SDK (`actrone-ts/`) and Go SDK (`actrone-go/`) already are — with
> **git history preserved**, the **`actrone` package/import path unchanged**, and the **BYOF worker
> harness** (which lives inside the package) carried along cleanly.
>
> Status: PLAN. Owner: Matt. Created: 2026-07-05. Inherits `CLAUDE.md`. This closes the standing
> "Python SDK is NOT a top-level dir" foot-gun recorded in [[sdk-locations]].

> **Status refreshed 2026-07-13 (code-verified): DONE, not "Status: PLAN."** Verified directly:
> `actrone-py/` exists top-level (sibling of `actrone-ts/`) with `src/actrone/`, `pyproject.toml`
> (package `actrone`, version `1.0.0`), `tests/`, `Dockerfile`, `CHANGELOG.md`; `backend/src/actrone`
> and `backend/pyproject.toml` **do not exist** (Phase 3.1's hard gate is met — confirmed via
> filesystem check); a full grep for `from actrone\.`/`import actrone`/`src/actrone` under `backend/`
> returns only one hit, a historical comment in `backend/.github/workflows/ci-backend.yml` ("It used
> to live at `backend/src/actrone`") — not a live reference. `actrone-py/pyproject.toml` depends on
> `actrone-memory` via a local editable path (`{ path = "../actrone-memory-py", editable = true }`),
> matching the Phase-0 decision exactly (the local dir is `actrone-memory-py/`, sibling top-level, per
> the repo-wide rename — package name unchanged). One correction to §0's own count: the SDK's
> `integrations/` (D1/D2/D3 framework bindings) now has **16** adapters, not the "11" this doc's §0
> line 19 states (agno, autogen, aws_strands, claude_agent_sdk, crewai, dspy, google_adk, haystack,
> langchain, langgraph, llamaindex, microsoft_agent_framework, openai_agents, pydantic_ai,
> semantic_kernel, smolagents) — growth after the move, not a discrepancy in the move itself. The
> harness worker lives at `actrone-py/Dockerfile` + `actrone-py/src/actrone/harness/` as planned. This
> plan's remaining value is historical (how the move was sequenced); no further action needed.

---

## 0. Current state (grounded)

- **Package:** `actrone`, at `backend/src/actrone/` (pyproject at **`backend/pyproject.toml`**), imported
  as `from actrone.client import ActroneClient`.
- **Tests:** `backend/tests/**` (respx-mocked; `pytest` with the 80%-coverage addopts).
- **Contains:** the async HTTP client (`client.py`) **+** the BYOF **worker harness** (`harness/`) **+**
  the framework **integrations** (`integrations/`, 11 adapters) **+** `memory.py` (a drop-in for the
  separate `actrone-memory` lib).
- **Dependency coupling:** the SDK **depends on `actrone-memory`** (top-level lib `actrone-memory/`;
  hard dep in `backend/pyproject.toml`; `memory.py` imports `actrone_memory.MemoryManager`).
- **Deployment coupling:** the harness runs as a **worker** (the `harness-pool` chart; a worker image
  installs `actrone[harness]`). So the package is *both* an SDK *and* a deployed platform component.
- **Good news:** **no other backend service imports `actrone`** (verified — orchestrator is Go;
  mediaguard/browserpool are separate Python packages). So the extraction has no in-backend code
  consumers to rewire — only the SDK's own build/deploy/publish and the doc/memory references.

`backend/` is itself a nested git repo holding several things (orchestrator = Go, mediaguard,
browserpool, **and** the `actrone` SDK). This plan removes only the `actrone` SDK slice.

---

## Phase 0 — Decisions to lock first

> **In-development, NOT published.** Everything is pre-prod; there is **no PyPI publish and no
> deprecation** step anywhere in this plan. The extraction is a **clean move** — after it, the SDK
> **exists only in `actrone-py/` and is fully removed from `backend/`** (git rm, no copy, no residue).

- **Repo name:** `actrone-py/` (top-level sibling of `actrone-ts/`). Package name stays **`actrone`**
  (do NOT rename — import stability is the whole point; no consumer code changes).
- **`actrone-memory` dependency:** use a **local path dependency** to the sibling `actrone-memory/`
  (exactly like the CLI's `replace github.com/actrone/actrone-go => ../actrone-go`). In `pyproject`,
  point the dep at the local path (uv/pip supports a path/editable source), so a fresh checkout of
  `actrone-py/` resolves `actrone-memory` from the workspace with **no registry**. (A git dependency is
  an equivalent fallback if the two repos aren't checked out side-by-side.) No PyPI publish of
  `actrone-memory` is required for this move.
- **Harness worker image ownership:** the harness worker Dockerfile + entrypoint **move to `actrone-py/`**
  (the harness is part of the `actrone` package). The `harness-pool` Helm chart references the worker
  image built from `actrone-py/` (built + loaded/tagged locally — no registry publish needed while
  in-dev). Rejected alternative: keeping the worker image in backend installing `actrone[harness]` —
  that splits the package from its runtime and re-creates the coupling.

---

## Phase 1 — Extract with history preserved

- **1.1 —** Use `git filter-repo` (preferred) or `git subtree split` to carve the SDK slice into a new
  repo **keeping history**. The slice = `backend/src/actrone/` → `src/actrone/`, `backend/tests/` →
  `tests/`, `backend/pyproject.toml` → `pyproject.toml`, plus the SDK's `conftest.py`, README, and any
  `docs/` pages that are SDK-specific (e.g. `backend/docs/09-migration-from-actrone-memory.md`,
  `11-publishing.md`).
  - **Caution:** `backend/tests/` and `backend/pyproject.toml` belong to the SDK, but confirm no
    mediaguard/browserpool file is swept (they have their **own** `pyproject.toml`/`tests` under
    `backend/mediaguard/` and `backend/browserpool/` — exclude those paths from the filter).
- **1.2 —** Initialise `actrone-py/` from the filtered history; verify `git log` shows the real history
  of `client.py`, `harness/`, etc.
- **1.3 —** Path fix-ups in the new repo: `pyproject.toml` `packages`/`src` layout already targets
  `src/actrone` (unchanged); update any path-relative references (coverage omit globs, mypy paths,
  `docs/` links).

---

## Phase 2 — Make the new repo self-standing

- **2.1 — Dependencies:** point `actrone-memory` at the local path (Phase-0 decision); `uv lock` a
  fresh lockfile. No registry needed.
- **2.2 — Toolchain parity with the other SDK repos:** `pyproject` stays the source of truth; keep
  `mypy --strict`, `ruff`, `pytest` (+ the 80%-coverage gate and the framework-module omit/ignore lists
  moved over verbatim). Add a `Makefile`/`justfile` mirroring `actrone-ts`'s scripts.
- **2.3 — CI:** new `actrone-py/.github/workflows/ci.yml` (lint + `mypy --strict` + `pytest` unit +
  the framework `importorskip` integration matrix). Lift the Python-SDK jobs **out of** the backend's
  `ci-backend.yml`. **No publish/release workflow** while in-dev — build to a wheel/editable install
  for local use only.
- **2.4 — Harness worker image:** move the harness worker `Dockerfile` + entrypoint into `actrone-py/`
  (multi-stage, installs `.[harness]`, runs the `temporalio` activity worker). Built + tagged locally
  (no registry publish while in-dev); the `harness-pool` chart's image source points at that tag.
- **2.5 — Verify:** in a clean checkout of `actrone-py/`, `mypy src/actrone/... && pytest tests/...`
  green; `pip install -e ".[harness]"` builds; the harness worker image builds.

---

## Phase 3 — Remove from the backend & rewire

- **3.1 — Remove it from the old location entirely (a move, not a copy).**
  `git rm -r backend/src/actrone backend/tests backend/pyproject.toml` (+ the SDK conftest, the SDK
  `.venv`, and any SDK-only docs moved in 1.1). **Hard gate:** after this, `backend/src/actrone` and
  `backend/pyproject.toml` must **not exist**, and `grep -rn "src/actrone\|from actrone\|import actrone"
  backend/` returns nothing outside the other projects' own vendored code. Confirm `backend/`'s other
  projects (orchestrator/mediaguard/browserpool) still have their own build files (they do) and build
  green without the removed SDK.
- **3.2 — Backend CI:** remove the Python-SDK jobs from `ci-backend.yml`; if the harness worker image
  was built by a backend workflow, remove/redirect it to the new repo.
- **3.3 — Deployment:** update the `harness-pool` chart + any deploy workflow to consume the worker
  image now built by `actrone-py/` (infra `values.images.yaml` entry if applicable).

---

## Phase 4 — Update the authoritative references

- **4.1 — `CLAUDE.md` §0.1 (workspace + backend):** change the Python-SDK row from
  "`backend/src/actrone/` (INSIDE the backend)" to "**`actrone-py/` (top-level)**"; the "easy to miss —
  NOT a top-level dir" caveat is now obsolete — replace it with the new location. Update the parity
  verify-commands table (Python commands now run in `actrone-py/`). Remove the "*(Planned: may move to
  its own repo)*" note — it's done.
- **4.2 — Memory:** rewrite [[sdk-locations]] (the Python row + the "trips up every session" warning →
  now top-level `actrone-py/`), and update [[repo-topology-and-deploy]], [[platform-evolution-plans]],
  [[execution-authoring-taxonomy]] (which references `backend/src/actrone/integrations`).
- **4.3 — Docs & marketing:** any path reference to `backend/src/actrone` (install docs, quickstarts,
  the framework-integration docs, the loop-engineering plan's SDK section) → `actrone-py/` /
  `pip install actrone`.
- **4.4 — This plan's siblings:** the stepwise-expansion plan and the Go-removal plan reference
  `backend/src/actrone/...` paths — update them to `actrone-py/...` once the move lands.

---

## Phase 5 — Verify & cut over (no publish — in-dev)

- **5.1 —** `actrone-py/` CI green (lint, mypy, unit, integration matrix); package builds to a wheel
  locally (no registry publish).
- **5.2 —** `pip install -e .` from `actrone-py/` in a clean venv → `from actrone.client import
  ActroneClient` works; `import actrone.harness.frameworks.crewai` works.
- **5.3 —** Harness worker image builds from `actrone-py/` and runs a `run_framework_step` end-to-end
  against a local orchestrator contract mock.
- **5.4 —** Full-workspace grep: **no** `backend/src/actrone` path references and **no** `backend/`
  copy of the SDK remain (the move is complete — old location is empty).

---

## Risks & mitigations

- **Import-path breakage (highest impact):** any accidental package rename breaks every consumer. →
  Keep the package **`actrone`**; add an import smoke test in CI (`from actrone.client import
  ActroneClient`).
- **`actrone-memory` resolution:** if it isn't on an index, a fresh `pip install actrone` fails. →
  Publish `actrone-memory` first (Phase 0/2.1), or ship the git-dep transitional form and swap.
- **Harness deploy regression:** the worker image is a live platform component. → Move the image build
  atomically with the package (2.4) and verify end-to-end (5.3) **before** deleting from backend (Phase
  3); keep the old backend worker build until the new one is green.
- **History loss:** a botched filter drops history. → Use `git filter-repo` on a **clone**, verify
  `git log --follow` on key files before pushing; never filter in place on the only copy.
- **Coverage/CI drift:** the 80% gate + framework omit lists must travel. → Move `pyproject`
  `[tool.coverage]`/`[tool.mypy]` verbatim (2.2) and confirm the number holds in the new CI.

---

## Sequencing & relationship to the other plans

- **Order:** Phase 0 (decisions) → 1 (extract w/ history) → 2 (self-standing build + worker image)
  → **3 (remove from backend — only after 2 is green)** → 4 (references) → 5 (verify/cut over). Do not
  delete from backend until the new repo **builds green and the worker image runs** — then the removal
  is atomic and the SDK exists only at `actrone-py/`.
- **Independent of** the Go-SDK removal and the stepwise-expansion plans, but **coordinate the doc/memory
  edits**: all three touch `CLAUDE.md` §0.1 and [[sdk-locations]] — land them so the SDK matrix ends up
  correct in one consistent state (post-changes: **TS (`actrone-ts`) + Python (`actrone-py`)**, Go
  removed, both client-parity; Python additionally the BYOF host).
- **Do this move *before or after* the stepwise-expansion Wave A, not during** — Wave A adds many files
  under `backend/src/actrone/harness/frameworks/`; extracting mid-wave multiplies merge pain. Prefer:
  finish Wave A, then extract (or extract first, then do Wave A in the new repo).
