# Actrone AgentSpec DX and entry-point decomposition plan

> **Status:** plan, not built. Two independent workstreams that can run in parallel.
> **Owner:** Matt · **Created:** 2026-09-08
> **Related:** `backend/orchestrator/docs/ARCHITECTURE.md`,
> `Actrone_Governed_Data_Layer_Differentiation_Plan.md`, `Actrone_Loop_Engineering_Plan.md`

## Why this exists

Two findings from the 2026-09 codebase review, both about the surfaces a newcomer hits first.

**WS1, AgentSpec.** `AgentSpec` has 18 top-level sections. The runtime already does
progressive disclosure correctly (every zero value reproduces prior behaviour), so this is a
**presentation problem, not an architecture problem**, and therefore cheap to fix. Two
specific defects make the first run harder than it needs to be: `routing_strategy` is
required with no default, and **six separate mechanisms control spend**.

**WS2, entry points.** `cmd/orchestrator/main.go` is 4,820 lines holding 262 route
registrations, and `internal/service/activity_service.go` is 2,990 lines holding every
activity implementation. Both violate the "entry points stay thin" rule in `CLAUDE.md`. They
are also the strongest available argument that the bus-factor risk is unaddressed.

A framing note that shapes the whole of WS2: **the code is legible, the map was missing.**
The full activity sequence was reconstructed from source in about twenty minutes with no
tribal knowledge, because the comment discipline is genuinely good. That means file length is
a symptom, not the disease. `ARCHITECTURE.md` (already written) does more for onboarding than
the refactor below, and it shipped first for that reason.

---

# Workstream 1: AgentSpec developer experience

## 1.1 Current state (verified)

**Required fields.** Six, from struct tags and `internal/agent/parser.go`:

| Field | Comment |
| --- | --- |
| `metadata.name` | Reasonable |
| `metadata.version` | Could default to `0.1.0` |
| `metadata.owner` | Could default to the authenticated principal |
| `spec.personality.system_prompt` | Reasonable, this is the agent |
| `spec.model.primary` | Reasonable |
| `spec.model.routing_strategy` | **Should not be required.** Hard-validated at `parser.go:85` with no default |

**Spend controls.** Six, at four different scopes, with no single place stating precedence:

| Control | Scope | Location |
| --- | --- | --- |
| `TokenBudgetSpec` | Monthly | `agent.go:366` |
| `ToolSpec.DailyBudgetUSD` | Per tool, daily | `agent.go:577` |
| `LimitsSpec.MaxDailyCostUSD` | Per agent, daily | `agent.go:609` |
| `LimitsSpec.MaxTaskCostUSD` | Per task | `agent.go:610` |
| `LoopPolicySpec` cost SLO | Per turn, soft downshift | `spec.loop` |
| `AgentTaskInput.MaxTaskCostUSD` | Per request override | `task_workflow.go` |

Each is individually justified. Collectively no user can answer "what stops my bill," which
is the single question every buyer asks about autonomous agents.

## 1.2 Design

### S1. Default `routing_strategy` to `primary_with_fallback`

Smallest change, largest first-run effect. A first-time author should not have to choose a
model routing strategy before running anything.

- Apply the default in the parser before validation, not in the struct tag, so both YAML and
  Studio-compiled manifests get it.
- Keep the `oneof` validation for explicitly-set values.
- **Manifest-hash note:** defaulting happens before canonicalisation, so a manifest that
  previously failed to parse now produces a hash. No existing hash changes, because those
  manifests all carried an explicit strategy. Add a test asserting exactly that.

Consider the same treatment for `metadata.version` (default `0.1.0`) and `metadata.owner`
(default to the authenticated principal). That takes the required set from six to three.

### S2. Consolidate spend into one block

Introduce a single `spec.spend` section that is the one place a user looks:

```yaml
spec:
  spend:
    monthly_usd: 500          # was token_budget
    daily_usd: 50             # was limits.max_daily_cost_usd
    per_task_usd: 2           # was limits.max_task_cost_usd
    on_exhaustion: block      # was token_budget's exhaustion policy
```

Rules:

- Per-tool daily budgets stay on `ToolSpec` (they are genuinely per-tool) but the docs for
  `spec.spend` must link to them so the set is discoverable from one place.
- The `spec.loop` cost SLO stays where it is. It is a *soft* control (it downshifts the model
  tier) and conflating it with hard caps would be wrong. Document the distinction explicitly:
  **`spec.spend` stops the run, `spec.loop` makes it cheaper.**
- **Precedence must be stated once, in one comment, and tested**: the effective per-task
  ceiling is the tightest of the agent cap and any per-request cap. That rule already exists
  in `AgentTaskInput.MaxTaskCostUSD`. Lift it into the `spec.spend` doc comment.

**Migration.** Accept both shapes at parse time, canonicalise to the new one, and keep the old
keys working indefinitely. Do **not** hard-cut: `ManifestHash` is SHA-256 over canonical bytes,
so a key rename rewrites every stored hash. Emit a deprecation warning in the parse result,
surfaced by the CLI and Studio, not an error.

### S3. Governance profiles

One line instead of forty:

```yaml
spec:
  governance_profile: regulated    # sandbox | standard | regulated
```

Expands at parse time to a full governance, limits, capabilities and escalation set. This is
the `tsconfig extends` pattern, and it maps directly onto the governance-first feature-pack
sequencing: the pack becomes one field rather than a chapter.

Requirements:

- Explicit fields **always** override the profile. Never the reverse.
- The expansion is visible, not magic. `explain` (S4) shows what the profile set and Studio
  renders it as pre-filled, editable values.
- Profiles are versioned. `regulated@v1` must keep expanding to the same thing forever, or
  manifest hashes become unstable across releases. **This is the sharpest edge in S3.** Pin
  the version in the canonical manifest at parse time, so `governance_profile: regulated`
  canonicalises to `regulated@v1`.

### S4. `actrone agent explain`

Given a manifest, print the **effective** configuration, including every inherited default
and where it came from:

```
spec.model.routing_strategy   primary_with_fallback   (default)
spec.spend.per_task_usd       2.00                    (explicit)
spec.spend.daily_usd          50.00                   (profile: regulated@v1)
spec.governance.escalation    tier_3                  (profile: regulated@v1)
spec.loop                     <disabled>              (default)
```

This is the highest-leverage documentation you can ship, because it converts 18 sections from
intimidating into discoverable, and it costs little: the defaults are already deterministic.
Ship it in the CLI first, then as a Studio panel and an API endpoint.

### S5. Group the authoring surface, not the wire format

Present three buckets in Studio, docs, and `explain` output:

| Bucket | Sections |
| --- | --- |
| **Identity** (what it is) | `model`, `personality`, `tools`, `mcp_servers`, `memory` |
| **Governance** (what it may not do) | `spend`, `governance`, `safety`, `capabilities`, `escalation`, `output_schema` |
| **Runtime** (how and where it runs) | `runtime`, `loop`, `graph`, `schedule`, `coordination` |

**Do not rename the YAML keys.** The grouping is a presentation layer. Renaming keys is a
hashing and versioning problem with no user-visible benefit that the grouping does not already
deliver.

### S6. Parser errors as primary documentation

With this many fields, error messages are the most-read docs in the product. Every parse and
validation error must carry:

- the full field path (`spec.model.routing_strategy`, not `routing_strategy`),
- the allowed values or constraint,
- what the default would be if the field were omitted,
- a stable doc anchor.

Audit `internal/agent/parser.go` against that standard as a single pass.

### S7. Retire or merge overlapping concepts

Once S2 lands, do a deliberate pass for the remaining overlaps. Candidates:

- `capabilities` vs `tools` vs `safety`. All three constrain what the agent may do, at
  different layers. The layering is real, but it is not explained anywhere a user will find.
  At minimum, write the one paragraph that distinguishes them. See `ARCHITECTURE.md` §4.5 for
  what `capabilities` actually enforces, which is narrower than the name suggests.
- `coordination` vs `graph`. Both describe multi-step structure.

The output of this pass may be documentation rather than code, and that is an acceptable
result. Do not merge concepts that are genuinely distinct just to reduce the section count.

## 1.3 Sequencing

| Phase | Scope | Why this order |
| --- | --- | --- |
| P1 | S1 defaults, S6 error audit | Days of work, immediate first-run improvement, zero risk |
| P2 | S4 `explain` | Makes everything else discoverable. Unblocks honest docs |
| P3 | S2 spend consolidation | The real conceptual fix. Needs the dual-parse migration |
| P4 | S3 profiles | Highest value for the governance pack, highest versioning risk |
| P5 | S5 grouping, S7 overlap pass | Presentation and docs, once the shape has settled |

## 1.4 Test obligations

- A three-field manifest (`name`, `system_prompt`, `model.primary`) parses and runs.
- Defaulting `routing_strategy` does not change the hash of any manifest that set it explicitly.
- Old and new spend keys both parse to the identical canonical spec, with a deprecation warning
  on the old shape.
- An explicit field overrides its profile value, in both directions, for every profile.
- `regulated@v1` expands identically across releases. Golden-file test.
- `explain` output attributes every value to `explicit`, `default`, or a named profile version.

---

# Workstream 2: entry-point decomposition

## 2.1 Principle

**Do not rewrite. Extract by seam, incrementally, with behaviour frozen.** A big-bang refactor
of the file that wires the entire service is the single highest-risk change available in this
repo, and it buys nothing a staged extraction does not.

Order matters below: each step is independently shippable and independently revertable.

## 2.2 Steps

### E0. Fix the middleware ordering bug first

Unrelated to file size, found in the same read, and genuinely a correctness issue.

`chimiddleware.Recoverer` is registered at `main.go:2349`, after `Auth` (2325),
`NewRateLimiter` (2337) and `Audit` (2340). Chi runs middleware in registration order, so a
panic in any of those three is **not** recovered: it reaches `net/http`, which closes the
connection with no response body and no correlation id. The auth middleware is exactly where a
malformed token is most likely to panic.

Move `Recoverer` to immediately after `RequestID` so it wraps everything that follows while
still having a correlation id to log. Add a test that panics from a middleware and asserts a
500 with a correlation id.

### E1. Split `activity_service.go` by activity family

**Do this first. It is free.** Same type, multiple files, no logic moves, no behaviour change.
Go makes this a pure file split.

```
activity_service.go          construction, shared helpers, the type   (~400)
activity_service_llm.go      StreamLLMResponse and the loop turn      (~700)
activity_service_tools.go    ExecuteGovernedTool, caching, supervisor (~700)
activity_service_memory.go   RetrieveContext, WriteBack               (~500)
activity_service_media.go    MediaGuard, MAL tokenise/detokenise      (~350)
activity_service_audit.go    AuditAppend, AuditGovernance, Metrics    (~350)
```

Acceptance: `git diff --stat` shows only moves, `go build ./...` clean, full test suite passes
unchanged. If any test needed editing, something moved that should not have.

### E2. Move route registration next to the handlers

There are 104 handler files and 262 route registrations sitting in `main.go`. Give each
handler a `Routes(r chi.Router)` method and let `main` mount it:

```go
// internal/handler/http/dpe.go
func (h *DPEHandler) Routes(r chi.Router) {
    r.Get("/governance/rules", h.GetActive)
    r.With(middleware.RequireScopeRole(middleware.ScopeEMAOP, middleware.RoleAgentAdmin)).
        Post("/governance/rules", h.CreateVersion)
    // ...
}
```

This puts the routing table next to the code it points at, which is where a contributor looks
first. Migrate one handler at a time, in separate commits. The in-repo precedent is
`internal/gateway/wire.go`.

**Constraint:** scope-role guards must move with their routes, verbatim. An authorisation
regression here is severe. Before and after, dump the full route tree
(`chi.Walk`) and diff it. Automate that as a test: **the route tree must be byte-identical
across the whole of E2.**

### E3. Extract per-domain wiring constructors

With routes gone, `main.go` is still constructing every dependency. Extract per-domain
constructors that return a mounted sub-router:

```go
func wireGovernance(deps Deps) http.Handler
func wireAgents(deps Deps) http.Handler
func wireMarketplace(deps Deps) http.Handler
```

`main` becomes: load config, build shared infrastructure (db, redis, temporal, logger),
call the `wireX` functions, mount, serve, shut down gracefully. Target roughly 200 to 300 lines.

### E4. Guard against regression

Add a CI check on file length. Lint already gates at zero warnings, so the mechanism exists.
Suggested thresholds, with an explicit allowlist for anything grandfathered:

- 1,200 lines for a non-test Go file,
- 400 lines for `main.go`.

A threshold nobody can breach without a deliberate allowlist entry is what makes E1 to E3
stick.

### E5. Close the documentation gap

`ARCHITECTURE.md` is written. Two follow-ups:

- **Fix `backend/CONTRIBUTING.md`.** It still describes `src/actrone/` as an in-repo Python
  SDK. That directory no longer exists; the SDK moved to the top-level `actrone-py/` repo. A
  contributor following it today fails at step three.
- **Link `ARCHITECTURE.md` from `CONTRIBUTING.md` and the repo README**, as the required read
  before a first change.

## 2.3 Sequencing

| Phase | Scope | Risk | Shippable alone |
| --- | --- | --- | --- |
| P1 | E0 middleware fix, E5 docs | Low | Yes |
| P2 | E1 activity split | None, pure move | Yes |
| P3 | E2 route migration, handler by handler | Medium, authorisation | Yes, per handler |
| P4 | E3 wiring extraction | Medium | Yes, per domain |
| P5 | E4 CI guard | None | Yes |

## 2.4 Risks

| Risk | Mitigation |
| --- | --- |
| A scope-role guard is dropped during E2 | Route-tree diff test, mandatory and automated |
| Init ordering breaks during E3 | Extract in dependency order, leaf domains first |
| The refactor stalls half-done | Each phase is independently shippable, so a pause leaves a working tree |
| Churn hides a real bug in review | E1 must be a pure move. Never mix a behaviour change into a move commit |

---

## Open questions

1. Should `metadata.owner` default to the authenticated principal, or stay explicit for audit
   clarity? Defaulting is better DX; explicit is better provenance.
2. Do governance profiles belong in the manifest (`governance_profile:`) or as an org-level
   policy the manifest inherits without naming? The second is stronger governance (the agent
   author cannot pick a weaker profile) but a worse authoring experience.
3. Is the per-tool daily budget worth keeping separate from `spec.spend`, or should it move
   under it as `spend.per_tool`?
4. Should E4's file-length gate apply to test files? Table-driven tests legitimately grow long.
