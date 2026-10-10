# Actrone — Gap-Closure Tracker

> **✅ Status refreshed 2026-07-13 (code-verified, full 5-agent re-audit).** Nearly every Tier-1…5 gap
> this tracker was built to close is now **BUILT + WIRED** — framework-adapter enum-sync, connector
> OAuth-refresh/ERP-HRIS writes, cross-org fabric agent-tool, residency-plane routing, self-hosting
> (incl. KOTS packaging + SCIM + license UI), voice code-completeness, and the memory benchmark +
> `create-actrone-app` all verified present in-repo. The authoritative consolidated status now lives in
> **`Actrone_Master_Implementation_Plan.md` → "CONSOLIDATED REAL STATUS (2026-07-13)"**. The only
> genuinely-open *code* items: super-admin dashboard (unbuilt design), ISMS frontend UI, Ghana GPA
> data-law, and 3 verified defects (inert `eval.Breaker`; A2A trust-delegation not enforced in dispatch;
> migration `00067` edited-in-place). Everything else is turn-up/deploy/publish + proof + legal sign-off,
> tracked as deployment-gated below (and in `infra/docs/Actrone_Deployment_Runbook.md`). The single
> biggest dormancy: `cfg.EMAOP.Enabled=false` leaves the governance pipeline off in a fresh deploy.
>
> Living checklist from the 2026-07-01 seven-agent plan-vs-code audit. Each item is a
> genuine gap between a written plan and the actual code. We work top-down (Tier 1 →
> Tier 5). **Definition of done for every item:** code shipped + tests (happy + error +
> edge) + `go build`/`vet`/`gofmt` (backend) or `tsc`/`lint`/`vitest` (frontend) green,
> and this tracker updated. No item is "done" until verified in-repo. Deployment/
> integration-gated items are tracked separately and are NOT counted as code gaps.
> Owner: Matt. All work UNCOMMITTED (user commits).

Legend: ☐ not started · ◐ in progress · ☑ done (verified) · ⏸ deployment-gated

---

## Tier 1 — Believed done/active, actually inert (HIGHEST PRIORITY)

- ☑ **T1.1 — Wire manifest-hash enforcement.** DONE 2026-07-01. `agent/service.go` now
  `stampManifestHash(af)` on all create/update paths (Register/RegisterJSON/
  RegisterManifest/Update, after `validate()`), and `ValidateForTask` fail-closes via the
  pure `manifestTampered()` predicate before re-validation. New `ErrCodeManifestTampered`
  (→ HTTP 500). Back-compat: empty hash = legacy, allowed; only a present-but-divergent
  hash blocks. Tests `agent/manifest_enforcement_test.go` (stamp→verify, JSON round-trip
  stability, re-validate idempotency, field/model-binding tamper detection, legacy
  empty-hash allow, stamp idempotency) — build/vet/test green. DB path of ValidateForTask
  is integration-gated (concrete pgx repo); the enforcement decision is fully unit-covered.

- ☑ **T1.2 — Wire the gateway QueryCache (gateway side).** DONE 2026-07-01. Added an
  optional `ResponseCache` (`*semcache.SemanticCache` satisfies it) to `gateway.Service`;
  `Complete` + `Stream` consult it **after** governance (Prepare/DPE) and **before** the
  model, store the final detokenised answer on miss, and record `SourceCacheHit` savings
  on hit. Agent-isolated key from the ORIGINAL prompt; tool-call requests + missing agent
  id bypass; fails open. New `completeFromCache`/`streamFromCache`; tests
  `gateway_cache_test.go` (hit/miss/bypass × streaming+non-streaming) green; build/vet
  green. Docs D.4 corrected (exec-model plan's false "DONE"). The production Qdrant store +
  embedder + main.go construction **shipped as T2.1** (below); `Cache` is nil unless
  `SEMCACHE_ENABLED`, so behaviour is unchanged until turned on.

---

## Tier 2 — Cost/distillation "moat": tested libraries, never invoked

> **SEQUENCING (updated 2026-07-03):** the cascade cluster was un-paused and shipped —
> T2.1, T2.2 (eval-gate), T2.3/T2.3b/T2.3c (predictive routing + cascade + budgeter),
> T2.4b (distillation fine-tune flywheel), T2.5 (memory-depth), T2.6 (compress) are all
> DONE, flag-OFF by default. **The one honest remainder is T2.4** (◑): the distillation
> *serving* hook is wired, but the fine-tune *workflow* is intentionally not built — it
> needs a concrete external `FineTuner`/`ServingProvider` (no-retention terms) that does
> not exist yet; a stub would violate §0.1. All behaviour-changing integration is live-model-
> gated at flip time, not code-gated.

- ☑ **T2.1 — Semantic-cache production store.** DONE 2026-07-01. New `internal/semcachestore`
  = Qdrant-backed `semcache.VectorStore` (own `semantic_cache` collection, agent_id-scoped
  search = tenant isolation, read-time TTL via `expires_at` range filter + `PurgeExpired`
  sweep) with httptest coverage (ensure-collection, hit/miss, agent+TTL filter asserted,
  store point shape, purge). `semcacheEmbedder` reuses `MemoryRepository.EmbedQuery`
  (text-embedding-3-small — shared vector space). PII gate = `mal` cacheability
  (cache only when prompt AND response classify PUBLIC). Constructed in `main.go` behind
  `SEMCACHE_ENABLED` (plus Qdrant, OpenAI, and MAL present), passed as `gateway.Config.Cache`,
  attributed via `savings` recorder (moved above the gateway). Config `SemCacheConfig`
  (SEMCACHE_*, off by default). Fixed the misleading main.go comment (queryCache wraps
  only the managed route; the semantic cache covers BOTH managed + BYOF). build/vet/gofmt
  + config/gateway/semcachestore tests green. Serving real traffic is integration-gated
  (needs live Qdrant + OpenAI embeddings); OFF by default so behaviour is unchanged.
  **→ The semantic-cache lever (T1.2 + T2.1) is now complete and wired end-to-end.**
- ☑ **T2.2 — Wire the eval `Gate` into a live lever.** DONE 2026-07-01. `eval.Gate.Check`
  is now called in the task path: `EnableEvalGate(log, floorResolver)` builds the
  floors-aware `eval.Gate`, and `runGroundednessCheck` drives the quality **breaker** off
  the gate's verdict (max-quality mode short-circuits with no judge call; else the agent's
  per-agent groundedness/quality floors apply) — replacing the fixed-threshold measure.
  Wired in `main.go` with `floors.NewRepository`. Design-consistent: serving is unchanged
  on this path (observational); **acting on an escalate/abstain verdict (re-route to
  frontier) is T2.3 — the cascade is the Gate's enforcing consumer** (`optimizer.Cascade`
  already `Check`s the Gate). Tests: gate wired w/ resolver, verifier-only fallback w/o,
  no-context skip, live max-quality gate path (no router needed). build/vet/test green.
- ☑ **T2.3 — Wire predictive routing** (`internal/optimizer`); emit `cost_route` savings.
  DONE 2026-07-02, flag-OFF by default (`cost_opt.predictive_routing`). Full flywheel wired
  end-to-end: (a) `RouteModel` now selects the cheapest model that historically met the agent's
  floors for the task cluster via `PredictiveRouter.Select` (fail-safe → primary on any
  uncertainty; the eval gate is the safety net); (b) the learning signal — `runGroundednessCheck`
  records each governed eval outcome to `eval_results` with `detail{model, cluster_id}` (new
  `recordEvalOutcome`), keyed by a deterministic `optimizer.ClusterID(complexity)` bucket derived
  identically at route- and answer-time; (c) a bounded background job rebuilds `route_policy`
  from the trailing eval window (`PolicyRepository.Refresh`, run-once-then-ticker); (d)
  `cost_route` savings attributed post-completion in `StreamLLMResponse` (baseline = same tokens
  at the primary's rate) via `BaselineModel` threaded RouteModel→StreamLLM. Config
  `CostOptConfig` + defaults; constructed in `main.go` (needs `EnableEvalGate` for the signal —
  warns if off). Tests: `ClusterID` table, RouteModel downgrade/thin-evidence/no-optimizer.
  build/vet/gofmt + service/optimizer/config/workflow tests green.
- ☑ **T2.3b — Wire the cascade** (`optimizer.Cascade`). DONE 2026-07-02, flag-OFF
  (`cost_opt.cascade` + `cost_opt.cascade_cheap_model`, default gpt-5.4-mini). New
  `service/cascade.go`: `tryCascade` is an early branch in `StreamLLMResponse` that, for a
  **cost**-strategy agent's simple grounded turn (triple-gated: flag on + eval gate wired +
  `RoutingStrategy=="cost"`, and only when NOT tool-advertising / structured-output / mid-loop /
  context-less / cheap==primary), runs `optimizer.NewCascade(cheap, frontier, evalGate, recorder,
  primary)`: the cheap model answers, the eval gate verifies it against the agent's floors, and
  it serves only on a pass — else escalates to the primary. Buffered `cascadeCaller`/
  `completeBuffered` reuse the activity's routing + cost accounting (real usage else estimate);
  output published as a block + persisted + metered via the new shared `meterTaskRun` helper
  (extracted from the streaming path so billing can't diverge). `SourceCascade` saving recorded
  by the library on accept. Quality is the hard constraint (a wrong cheap answer escalates, never
  a breach). Tests: 7-case gating fall-through table + `joinMessages`. build/vet/gofmt +
  service/config/optimizer green.
- ☑ **T2.3c — Budgeter/memory_budget BUILT** 2026-07-02 (was "no batch path"; built the path). New
  `ActivityService.DelegateBatch` (`service/delegate.go`): a coordinator submits a batch of worker
  calls (role + prompt); `optimizer.Budgeter.Allocate` assigns a model per role AND collapses
  exact-duplicate (model, prompt) calls; the distinct calls run bounded-parallel (`errgroup`, limit
  8) via the managed router (`completePrompt` + a shared `drainToBuffer` extracted from the cascade);
  a duplicate reuses its canonical result at zero cost and the avoided spend is attributed to
  `SourceMemoryBudget`. Results returned in the coordinator's original order. Reachable via `POST
  /v1/coordination/delegate` (new `CoordinationHandler.DelegateBatch` — tenant from auth ctx, ≤64
  calls, coordination-graph entitlement) → `activitySvc` behind a narrow `BatchDelegator` interface.
  Testing seam (`delegateWith(complete func)`) → unit tests: dedup ⇒ exactly one saving priced at
  the canonical cost, order preserved, role-tier model assignment, empty no-op. build/vet/gofmt +
  service/optimizer/http green. **TIER 2 COMPLETE** — every lever (semcache, eval gate, predictive
  routing, cascade, distillation train+eval+promote+serve-hook, memory-depth, compress, budgeter) is
  now built + wired; real savings gate on live enablement + (for distilled serving only) the managed
  router must be able to reach the fine-tune handle (operator config, noted under T2.4b).
- ☑ **T2.4b — Distillation fine-tune flywheel BUILT END-TO-END** 2026-07-02 (was blocked on
  "external provider"; built it). New real provider clients: `distill.OpenAICompatibleTuner`
  (FineTuner — multipart file upload → create job → poll, OpenAI-compatible/Together, status
  vocab normalised) + `distill.OpenAICompatibleServer` (ServingProvider — chat completions to
  run the student at eval). `distill.Repository` extended: `AcceptedSamples` (tasks ⋈
  eval_results.passed — the accepted governed traffic, which T2.3 now populates), `ScanCandidates`
  /`CandidateStats` (eligibility signals incl. a repetition-based tightness proxy), job + model
  writes (`CreateJob` idem-keyed, `SetJobRef`, `RunningJobs`, `HasActiveJob`, `InsertShadowModel`,
  transactional `PromoteModel`). `distill.Orchestrator` provides discrete step methods
  (EligibleCandidates / Submit / Poll / Evaluate): submit=Assemble→Tuner.Submit; poll=Tuner.Poll;
  evaluate=run the student over the held-out eval split, score each vs the accepted teacher output
  via the SAME Wave-2 groundedness verifier, `DecidePromotion` against the agent's real floors →
  InsertShadow + gated Promote. Fixed a real bug (MaxEvalSamples default < DecidePromotion
  MinEvalSamples ⇒ nothing could ever promote). **DRIVEN BY A DURABLE TEMPORAL WORKFLOW**
  (`internal/distillflow`, converted 2026-07-02 from the first-cut DB-backed loop): `DistillAgent
  Workflow` = submit → wait-on-durable-timers-while-polling (5m cadence, 6h ceiling; a worker
  restart resumes the wait exactly) → evaluate; activities carry exponential-backoff retries. A
  `Scanner` starts one workflow per eligible agent with a **deterministic `distill-{agent}-
  {yyyymmdd}` workflow id**, so Temporal dedups concurrent starts to a single execution — the
  scanner is safe on every replica (the DB-loop's multi-replica double-submit race is gone).
  Registered on the orchestrator worker behind `cost_opt.distillation` + a fine-tune key
  (`ORCHESTRATOR_MODEL_TOGETHER_API_KEY`); scanner launched post-`worker.Start`. Store interface
  → fake-driven Evaluate/Poll tests (promote / shadow-below-floors / failed / empty-handle) +
  `testsuite.WorkflowTestSuite` tests of the workflow orchestration (submit→poll-loop→evaluate /
  skip-no-data / job-failed) + tuner/server httptest + pure-helper tests. build/vet/gofmt +
  distill/distillflow green. **Serving loop CLOSED IN CODE 2026-07-02** (corrected an earlier "config-only" claim that
  was wrong): the managed router routes by strategy across a fixed Primary+Fallbacks set, so it
  can't resolve a Together fine-tune handle. Fix: `ActivityService.distillRouter` = a single-provider
  router over `NewOpenAICompatibleProvider(BaseURL=fine-tune endpoint, key)` (the openai_compatible
  client passes the handle through as the model id); `routeCompletion` routes an `input.Distilled`
  turn through it FIRST (before BYO/managed). Constructed in main.go inside the flywheel block
  (needs the fine-tune key). Now genuinely end-to-end: train→eval→promote→**serve**. Only true
  remaining dependency is a live fine-tune provider key + $ to validate against real jobs.
- ☑ **T2.4 — Distillation flywheel** (`internal/distill`). **SUPERSEDED BY T2.4b — DONE END-TO-END**
  (this row's original 2026-07-01 "fine-tune WORKFLOW intentionally NOT built / no external provider
  exists" note was corrected the next day; Together AI was settled as the provider and the concrete
  clients + durable workflow shipped). **Serving hook** (2026-07-02, flag-OFF `cost_opt.distillation`):
  `distill.Repository` (`AdapterStore` over `distilled_models`, tenant-scoped promoted-model lookup) +
  `AdapterResolver` (single-flight TTL, fails open) wired into `RouteModel` — a promoted per-agent
  distilled model serves in place of the primary and takes precedence over predictive routing; avoided
  cost attributed as a `distill` saving (`Distilled` flag threaded RouteModel→StreamLLM). **Fine-tune
  workflow + concrete provider clients: see T2.4b** (`OpenAICompatibleTuner`/`OpenAICompatibleServer`
  against Together AI, durable `internal/distillflow` workflow, wired in `main.go` behind
  `ORCHESTRATOR_MODEL_TOGETHER_API_KEY`). Only turn-up (live Together key + spend to run a real job
  against accepted traffic) is gated.
- ☑ **T2.5 — Wire memory-depth** (`internal/memorydepth`) into the loop. DONE 2026-07-02,
  flag-OFF (`cost_opt.memory_depth`): built the missing concrete LLM `Extractor`
  (`memoryFactExtractor` — managed-router judge call → tolerant `ParseFacts`, JSON-array-sniffed)
  and a post-final-turn ingest hook in `StreamLLMResponse` (`extractMemoryFacts`) that extracts
  durable subject-predicate-object facts and consolidates them into the agent's governed
  structured memory via `memorydepth.Service.Ingest` (PII-redacted by `RegexRedactor`,
  temporally consolidated). Best-effort + off the served answer + skipped for previews.
  Constructed in `main.go`. Tests: `extractJSONArray`, `lastUserContent`. build/vet/gofmt +
  memorydepth/service tests green.
- ☑ **T2.6 — Build `internal/compress` + wire it.** DONE 2026-07-02. New pure package
  `internal/compress` (dedupe + per-item cap w/ ellipsis + whitespace collapse; deterministic,
  no LLM call so it can only reduce tokens). Wired into `StreamLLMResponse` via
  `compressContext` (episodic memories deduped; recent turns capped-only to preserve dialogue)
  before prompt assembly; avoided prompt tokens attributed to `SourceCompress`
  (`compressSavings`, best-effort, skipped for previews). Tests: dedupe/truncate/whitespace/
  empties/order/no-op/dialogue-preserve. build/vet/test green.

---

## Tier 3 — Genuinely unbuilt code

> **Note on numbering:** the `T3.x` IDs are stable identifiers assigned in rough
> VALUE order — they are NOT the build order. **Execution order is the grouping below**
> (decided 2026-07-01): do the independent, fully-sandbox-verifiable gaps first (3A), then
> the large / externally- or infra-gated / coupled efforts as deliberate work (3B). Tier-5
> brand fixes are also quick independent wins and may be interleaved.

### 3A — Independent + fully verifiable in-sandbox (DO FIRST)

Build order: **T3.10 ✓ → T3.16 ✓ → T3.15 ✓ → T3.13 ✓ → T3.18 ✓ → T3.17 ✓(Connect→3B) → T3.12 ✓. — 3A COMPLETE.**

- ☑ **T3.10 — Custom-capabilities backend.** DONE 2026-07-01. New `internal/capability`
  Store (pgx, per-tenant CRUD, `Input.Normalize` = trim/dedupe/bound + duplicate-label 409)
  + migration `00078_custom_capabilities.sql` (text[] scopes/dpe_rules, unique (tenant,label)).
  Handler `capabilities.go`: `GET /v1/capabilities/custom` (members), `POST` + `DELETE/{id}`
  (agent_admin), wired in main.go. Frontend: `customCapabilitiesApi.available` flipped to
  true with `list/create/remove`; the Agent Studio builder now saves authored capabilities
  to the org library (best-effort) + updated note. `min_tier` kept a bounded free-form
  string (frontend `free/pro/scale/enterprise` ≠ a fixed backend enum). Tests: store
  Normalize (valid/rejects/empty-tier) + handler (list/create/unknown-field-400/422/dup-409/
  delete-404/401). Backend build/vet/test + FE tsc/lint green. **Follow-on DONE 2026-07-01:**
  reuse-from-library picker built (`CapabilityToggles` loads the org library, `addFromLibrary`
  adds an existing capability to an agent, dedup by id+label). Remaining (optional, not the
  gap): a dedicated runtime supervisor binding for custom capabilities — the underlying
  tool/DPE already governs the binding today.
- ☑ **T3.16 — Chat Phase-3 rich content.** DONE 2026-07-01. `MarkdownRenderer` gained
  **KaTeX** (remark-math + rehype-katex, `trust:false`/`output:'html'`; runs AFTER the
  sanitiser on the preserved `math` text spans, so KaTeX's trusted output needs no
  re-sanitise — safe because `rehype-raw` is off, so all spans come from trusted plugins),
  **Mermaid** (new `MermaidDiagram.tsx` — code-split dynamic import, `securityLevel:'strict'`,
  fallback-to-source on parse error/streaming), and **citation chips** (GFM footnote/in-page
  `#` anchors render as compact chips, never new-tab links). Deps pinned (katex 0.16.11,
  mermaid 11.4.1, remark-math 6.0.0, rehype-katex 7.0.1); katex CSS imported in the renderer.
  Tests `MarkdownRenderer.test.tsx` (math renders/no-delimiter-leak, footnote chip is in-page,
  mermaid fence → diagram not code block, ordinary code unaffected, external links safe).
  tsc/lint/build + full FE suite 78/78 green. **Follow-on DONE 2026-07-01:** Mermaid is now
  theme-aware (`useTheme` → `dark` in dark mode / `neutral` in the Apple-silver light mode,
  re-renders on theme change). Remaining (backend-blocked, not actionable): data-driven RAG
  citations from the turn `citations` field once the backend populates it.
- ☑ **T3.15 — A2A Control Tower UI.** ALREADY BUILT (verified 2026-07-01, no work needed) —
  the audit agent missed the file. `frontend/src/app/(app)/a2a/page.tsx` is a full 3-tab
  Control Tower: **Connections** (connect/SSRF-screened, approve with remote-card preview +
  least-privilege skill selection, dispatch, healthcheck, disable, delete), **Exposed agents**
  (profiles: expose/remove), and **Provenance** (contextId → tamper-evident Merkle hop chain
  with per-hop status/findings/trace). Backed by the complete `a2aApi` (list/create/preview/
  approve/dispatch/healthcheck/disable/remove/profiles/provenance) + sidebar nav "A2A Gateway"
  + `a2a_gateway` FeatureGate. Compiles in the passing full build. **Lesson: the audit's
  frontend-absence claims are unreliable (out of that agent's scope) — verify existence
  before building.**
- ☑ **T3.13 — Rules Workbench frontend.** DONE 2026-07-01. On inspection the audit's
  "2 of 6 components" overstated it: the workbench already had the rule builder, an inline
  version-history panel (activate/rollback), a client-side sandbox preview, AND plain-English
  rule rendering (`formatRule` shown in `RuleCard`). The one genuinely-missing capability was
  **version inspection/diff**, now built: backend `PgRuleStore.GetVersion` + `ErrVersionNotFound`
  + `GET /v1/governance/rules/versions/{version}` (DPEHandler refactored to an interface for
  testability; handler tests: 200/404/422/401); frontend `dpeRulesApi.getVersion`, a pure
  `diffRules()` helper (added/removed/changed/unchanged by id, order-independent; unit-tested),
  and a **VersionInspector** modal (View per version → its rules in plain English, diffed vs
  the active set, + "Load into editor" to restore for rollback-with-edits). Backend build/vet/
  test + FE tsc/lint/test green. **Follow-on DONE 2026-07-01:** `RuleTypePalette` guided
  "Add rule" — `RULE_TEMPLATES` (blank + high-spend/missing-approver/sensitive-data/
  external-recipient presets) + a palette dialog; unit-tested (fresh unique ids, valid actions).
- ☑ **T3.18 — Scoped-RBAC enforcement.** DONE 2026-07-02. Flipped the canonical governance +
  marketplace write routes from the coarse global `RequireRole` to scope-aware
  `RequireScopeRole`: escalation **approve/deny** + DPE **rules create/promote** →
  `RequireScopeRole(ScopeEMAOP, RoleAgentAdmin)` (emaop is in the legacy back-compat
  projection, so admins/legacy roles keep access); marketplace **publish** →
  `RequireScopeRole(ScopeMarketplace, "publisher")` (marketplace is NOT back-compat-projected
  by design → requires an explicit `marketplace:publisher` grant, the intended finer control;
  the Team editor + `team.go` allowlist + frontend `SCOPE_ROLES` all already support granting
  it). Lockout is a non-issue pre-launch (user confirmed). Tests: `RequireScopeRole` for emaop
  (back-compat/admin/operator/explicit/api-key) + marketplace (explicit-grant-required matrix).
  Backend build/vet + middleware tests green. Optional polish: `RoleGate` the publish button so
  the UI reflects the gate instead of a 403 toast.
- ◑ **T3.17 — hosted-runtime GB-s/build-minute meters = ALREADY BUILT + WIRED** (verified
  2026-07-02; the audit's "not evidenced" was a grep artifact). `RecordBuildMinutes` via
  `buildflow.SetMeter` (main.go); `RecordHostedGBSeconds` emitted at `activity_service.go:1737`
  from the workflow-computed `AgentTaskResult.HostedGBSeconds` (pod GiB × elapsed). **Marketplace
  Stripe Connect take-rate → moved to 3B** (large, live-Connect-gated payments: Express
  onboarding + application fees + payouts/KYC — not a clean in-sandbox win). See 3B.
- ☑ **T3.12 — DPE sandbox replay.** DONE 2026-07-02. Built the persistence + replay end to
  end: `dpe_eval_contexts` table (migration 00079) + `PgEvalContextStore`
  (Record/ListRecent/PurgeOlderThan); each Tier-2 eval is recorded best-effort from the
  `DPEPreCheck` activity (`SetDPEContextRecorder`, never fails a task); pure `ReplayRuleSet`
  (mirrors EvaluateTier2's first-match semantics; tallies verdicts + diffs vs the recorded
  baseline); handler `POST /v1/governance/rules/sandbox` (`WithReplay`, emaop-scoped) backtests
  the posted candidate rules over the last 30 days. Frontend: `dpeRulesApi.sandbox` + the
  workbench "Test ruleset" now runs the **real backtest** (`ServerSandboxResults`: N real
  evals, changed from→to per task) and falls back to the local synthetic preview when there's
  no history / replay is off. Tests: replay unit (first-match/tally/diff/empty/no-baseline) +
  handler (replay-200/not-configured-500/invalid-422). Backend build/vet/test + FE tsc/lint green.
  Live accumulation of contexts is deployment-gated (needs real task traffic); the code path is
  fully wired + unit-covered. **→ 3A COMPLETE.**

### 3B — Large / externally- or infra-gated / coupled (deliberate efforts, LATER)

- ☑ **T3.1 — Enhanced Control Tower real-time ops. COMPLETE** 2026-07-02 (backend control
  plane + live event stream + frontend surface — the "pause any agent < 30s" safety principle
  shipped end-to-end). **Frontend control-tower surface DONE:** SSE-over-fetch (the stream
  handler was converted WS→SSE so the browser authenticates with the normal `Authorization:
  Bearer` header — browsers can't set headers on WebSocket/EventSource and the API auth is
  header-only; `fetch` streaming can); `controlApi` (pause/resume/pause-all/resume-all/task-
  control/list-paused) + `streamControlEvents` fetch-SSE reader (auto-reconnect w/ backoff) in
  the client; `/control-tower` page (`ControlTowerClient`) = emergency stop (confirm dialog) +
  live paused-agents list w/ one-click resume + live activity feed (severity-coloured, capped
  200, aria-live) + connection badge; sidebar nav entry (Governance ▸ Control tower, `Siren`).
  tsc/lint/build green; backend build/vet/test green. Backend recap below:
  **Backend control plane** (the "pause any agent < 30s" safety core). Built: (1) durable `agent_control`
  table (migration 00080) + `AgentControlRepository` (SetPaused/IsPaused/ListPaused +
  tenant-wide PauseAll/ResumeAll) — durability matters for a safety pause, so a table not a
  cache; (2) `domain/control.go` — `SignalAgentControl` Temporal signal + `AgentControl`
  {action,by,reason} + pause/resume/cancel/escalate actions + `TaskWorkflowID` helper; (3)
  **in-flight control in `runAgenticLoop`** — at every turn boundary the loop drains operator
  control signals (`applyLoopControl`/`awaitResume`): pause blocks on a durable
  selector+24h-safety-timer until resume/cancel, cancel ends with ERR_TASK_CANCELLED, force-
  escalate injects the Tier-3 human-review pause (reusing `awaitEscalationDecision`) — all
  `workflow.GetVersion("agent-control")`-gated so pre-existing histories replay byte-identical;
  (4) `ControlHandler` — `POST /v1/tasks/{id}/control`, `/v1/agents/{id}/pause|resume`,
  `/v1/agents/pause-all|resume-all` (emergency stop: sets flags + fans the pause signal to all
  in-flight tasks), `GET /v1/agents/paused`; agent-admin RBAC; (5) **new-task gate** — a paused
  agent refuses submissions on BOTH the HTTP (`423 Locked`) and gRPC (`FailedPrecondition`)
  paths, fail-open on a control-store blip. Tests: testsuite pause→resume + operator-cancel on
  the real loop + handler signal-targeting/validation/auth; build/vet/gofmt + workflow/http/grpc/
  repository/domain green. **Tenant-wide live event stream ALSO DONE** 2026-07-02: new
  `internal/controlevents` `Hub` (tenant-keyed dual-path pub/sub mirroring `ws.Broker` — local
  fast path + NATS cross-pod via new `macp.Client.Publish/SubscribeControlEvents` on subject
  `tenant.{id}.control.events`, covered by the existing `tenant.>` JetStream) + `Event`
  {type,severity,tenant,agent,task,actor,message,detail}; producers wired at the high-signal
  points — `ControlHandler` (task/agent pause/resume/cancel/escalate + emergency stop) and
  `ActivityService` (governance_block from DPEPreCheck, task_escalated from CreateEscalation,
  task_completed at the terminal turn); consumer = `GET /v1/control/stream` (`ControlStreamHandler`
  WebSocket, tenant-scoped, local+NATS merge, 30s ping, 2h ceiling). Tests: hub local pub/sub +
  tenant-isolation + slow-subscriber-nonblock + unsubscribe, handler feed-emission. build/vet/
  gofmt + controlevents/macp/handler/service green. **Frontend surface SHIPPED** 2026-07-02:
  `/control-tower` page (`ControlTowerClient`) — emergency stop + live paused-agents list + live
  activity feed off `streamControlEvents` — with `controlApi` in the client and the sidebar nav
  entry. Backend + frontend both complete; nothing outstanding on T3.1.
- ☑ **T3.2 — Enterprise ERP/HRIS connectors. DONE** 2026-07-02. Built as **curated vendor presets**
  on the single tested, SSRF-guarded, MAL-classifying `CustomRESTAdapter` — NOT bespoke per-vendor
  HTTP clients (which couldn't be validated vs live systems and would be guesswork). `presets.go`:
  `VendorPreset` (id/display/category/auth/read-actions/scopes/classification policy) + `BuildSpec
  (baseURL)` → validated `CustomConnectorSpec` + `NewVendorAdapter` + `Presets()`/`PresetByID`.
  `erp.go`: SAP S/4HANA, Oracle NetSuite, Oracle Fusion ERP Cloud, Microsoft Dynamics 365 F&O
  (OAuth2; canonical read endpoints; no blanket floor — ERP has legitimately public fields).
  `hris.go`: Workday, BambooHR, ADP, SAP SuccessFactors, UKG Pro — each with
  **`DefaultClassification = PII_HIGH`** so every field defaults to personal data (EMAOP §6.1 safe
  default made real, not just documented). Framework additions: (1) `CustomConnectorSpec.
  DefaultClassification` — a safe-default **floor** applied in `buildClassifiedResponse` that RAISES
  any field the classifier judged Public up to the default, never downgrading a detected
  PII/Financial (so HRIS unknown fields are PII_HIGH while salary still classifies FINANCIAL by
  value); (2) `AuthBasic` auth kind (BambooHR uses API-key-as-Basic-username). Surfaced via new
  **`GET /v1/connectors/presets`** catalog endpoint (`ConnectorsHandler.Presets`, tenant-gated) so
  the Integration Hub can render "Connect <vendor>" + pre-fill the create form; base URL + credential
  supplied by the admin at connect time (vault-sealed). `adapter.go` comment corrected (**closes
  D.3**). Tests: preset catalog validity + HRIS-defaults-PII_HIGH invariant, `PresetByID`, BuildSpec
  base-URL required, HRIS PII_HIGH floor end-to-end (benign→PII_HIGH, email→PII_HIGH, salary→FINANCIAL),
  ERP no-floor (status→PUBLIC), BambooHR Basic-auth header, presets handler 200/401. go build/vet/
  gofmt + connector/http green. **Honest:** live auth handshakes + exact response schemas per tenant
  verify on connect against real systems (deployment-gated); the endpoint paths are vendor-canonical
  but per-tenant API versions/hosts are supplied at connect time.
  **CONNECTOR→AGENT-TOOL RUNTIME WIRING SHIPPED 2026-07-02** (closed the follow-up `store.go` flagged
  — connectors were configured/governed but not yet callable by an agent mid-workflow). Now an agent
  calls a connected system as the governed tool **`connector/{connector_id}`**, flowing through the
  Tool-Call Supervisor like MCP/A2A: new `tool.ConnectorToolRouter` seam (routed + advertised BEFORE
  MCP, same single-slash reason as A2A) + `internal/connectortool.Router` that resolves the tenant's
  stored connection (per env), runs the SSRF-guarded MAL-classified `Fetch`, and — the boundary —
  **MAL-tokenises the classified result** (sensitive fields incl. the HRIS PII_HIGH floor become
  task-scoped tokens; no raw enterprise value reaches the model; detokenised with the task's final
  output). Token-context id + env are threaded workflow → `ExecuteGovernedTool` → ctx → router
  (`tool.WithTokenContextID`/`WithEnv`), wired for BOTH the native durable loop (`runAgenticLoop`) and
  BYOF-hosted (`hostedToolBoundary`). One Supervisor ⇒ **native, EMAOP no-code, and BYOF** agents
  uniformly; `allowed_tools` still governs which agent may call which connector. Wired in main.go
  (`toolSupervisor.WithConnectorRouter`). Tests: router advertise + PII-tokenised/public-passthrough
  end-to-end + unknown-connector error; ctx carriers + `isConnectorToolName`. go build/vet/gofmt +
  connectortool/tool/workflow/service/connector green. **Per-action advertise SHIPPED 2026-07-03:**
  `Router.Advertise` now surfaces a built-in preset connector's **real read actions as an `enum`** in
  the tool schema (from the preset catalog, no I/O) so the model calls a valid action first-time
  instead of guessing; custom connectors keep the free-form action string (their actions are
  per-tenant). Test: preset advertises `workers` enum, custom carries none. **GAL PHASE 0 (governed
  WRITES) CORE BUILT + TESTED 2026-07-03** (go-ahead given; was "held pending"): new `internal/gal` —
  the enterprise write path built *as* the governed primitive (mechanisms 3–5 minimal), pure-first +
  fail-closed + table-tested. `WriteActionSpec` (risk-class read/write/money/irreversible ·
  reversibility · sim-strategy · money amount-field · compensation TTL) + `Validate`; `ComputeDiff`
  (+ deterministic hash); the explainable commit `Evaluate` gate = coverage-as-governance
  (irreversible/unverified-sim/approve-all → require_approval; money over hard-limit or unparseable →
  block; within-bounds verified → auto_commit; fails closed at every fork); `DetokeniseArgs` (MAL
  reverse at the egress boundary, refuses to egress an unresolved/leaked token, revealed-set →
  `ProvenanceHash`); `DeriveCompensation` (pure inverse invocation — restore pre-image + carry id
  fields — + optional TTL deadline); `Receipt` = **Ed25519-signed + SHA-256 hash-chained** action
  ledger record (`Seal`/`Verify`/`VerifyReceiptChain`, tamper-evident, same idiom as
  `a2a.VerifyChain`); `Service.ExecuteWrite` composes detokenise→simulate→gate→(commit|hold|block)→
  derive-compensation→seal+append-signed-receipt fail-closed over injected seams (`Committer`,
  `ReceiptSink`, `Detokeniser`), ALWAYS emitting a receipt (incl. block/approval/failed). Executable
  edge: `connector.WriteAdapter` + `CustomRESTAdapter.Invoke` (SSRF-guarded real HTTP write, JSON
  body, httptest-covered: success/non-write-reject/upstream-error/204) + `connectortool.GALCommitter`
  (bridges connector→`gal.Committer`: read-back verified simulate w/ graceful predicted degrade +
  commit; refuses a read-only adapter). go build/vet/gofmt + gal/connector/connectortool tests green.
  **WIRING SHIPPED 2026-07-03 (same pass):** (a) **durable ledger** — migration `00089_action_ledger`
  (append-only, `UNIQUE(tenant_id, prev_hash)` makes the per-tenant chain physically linear) +
  `gal.PgReceiptSink` (`PrevHash`/`Append`/`Chain`, unique-violation → typed `ErrChainConflict` the
  durable activity retries); (b) **agent-loop write routing** — `connectortool.Router` now routes a
  declared WRITE action through `gal.Service` (detokenise→simulate→gate→commit→compensation→signed
  receipt), advertises governed writes in the tool schema when GAL is wired, and returns the governed
  OUTCOME (decision/outcome/reversible/action_id) to the model — an approval-hold/block is a normal
  result, not an error; a write with GAL off falls through and is refused (fail-closed); tested
  end-to-end (default write→approval, connector untouched, receipt recorded; GAL-off→refused);
  (c) **policy** — `gal.PolicyResolver` seam + safe `DefaultCommitPolicy` (money→approval,
  unverified→approval, verified-reversible-non-money→auto) + `DefaultWriteSpecResolver` (every write
  →RiskWrite+not-reversible⇒approval-forced until a connector authors real metadata); (d) **main.go +
  config gate** — `cfg.GAL.Enabled` + vault-held Ed25519 seed (`gal.SigningKeyFromSeed`, fail-closed
  on missing/bad key), OFF by default (connectors read-only, byte-identical to today). go build ./...
  + vet + gofmt + gal/connector/connectortool tests all green. **PHASE 0 COMPLETED 2026-07-03 (final
  slices):** (e) **approval flow (deferred-commit)** — because a write is a synchronous mid-loop tool
  call, GAL does not block the loop: on `require_approval` it seals the real (detokenised) args into a
  resumable **pending action** (migration `00091_gal_pending_action`, vault-sealed args, purged on
  resolution) + returns "queued for approval" to the model; `gal.ApprovalService.Approve` rebuilds the
  connector committer out-of-band (`connectortool.GALCommitterFactory`), commits, derives the
  compensation, and appends a signed `committed` receipt naming the approver; `Deny` appends a signed
  `blocked` receipt; both purge the pending row. HTTP surface `GET /v1/gal/actions` · `GET /v1/gal/
  ledger` · `POST /v1/gal/actions/{id}/{approve,deny}` (approve/deny = agent_admin, like Tier-3
  escalations). Tested: enqueue-on-approval, approve→commit+purge+approver-receipt+unsealed-args,
  deny→block+purge, not-found, constructor validation. (f) **authoring** — GAL metadata on
  `connector.EndpointAction` (plain types, no connector→gal dep) + `AuthoredWriteSpecResolver` (authored
  risk/reversibility/sim/inverse → auto-commit-eligible; unauthored → conservative default) — tested.
  (g) **per-tenant coverage model** — migration `00090_gal_commit_policy` + `gal.PgPolicyResolver`
  (fail-SAFE to `DefaultCommitPolicy` on any error). (h) main.go wires all of it behind `cfg.GAL.Enabled`
  + vault-sealer (`galVaultSealer` over the shared `CredentialVault`); OFF by default. go build ./... +
  vet + gofmt + gal/connector/connectortool tests green. **Only Phase 2 + deploy remain:**
  compensating-action *firing* (durable Temporal saga + TTL auto-revert = GAL Phase 2, a distinct
  phase); live apply of `00089`/`00090`/`00091`. **DB-integration tests WRITTEN 2026-07-03** (DSN-gated
  `//go:build integration`, the repo's idiom — no testcontainers dep added): `internal/gal/*_integration_test.go`
  cover the three pg stores — `PgReceiptSink` (append→PrevHash→Chain round-trip + `VerifyReceiptChain`
  on re-read + fork→`ErrChainConflict`), `PgPendingStore` (save/idempotent/get/list-hides-sealed-args/
  delete/not-found + tenant isolation), `PgPolicyResolver` (default-when-absent / reads-authored-model /
  fail-safe-on-bad-tenant). Compile clean under `-tags=integration` + skip without a DSN; run in CI
  against the provisioned Postgres. Fixed a real durability bug found writing them: receipt timestamps
  are now microsecond-truncated at seal time so a Chain-read receipt still `Verify`s (Postgres
  TIMESTAMPTZ has µs precision; a ns timestamp would break the recomputed hash). Reads shipped.
- ☑ **T3.3 — Voice consent/disclosure engine (§5.1). DONE** 2026-07-02 (replaced the binary
  `consent_recorded` flag with a real governance engine). New `internal/voiceconsent`: a PURE,
  deterministic `Evaluate(Request, Policy) Decision` enforcing **TCPA prior-express-consent for
  marketing, the 8am–9pm callee-local-time calling window, do-not-call/suppression, and
  all-party (two-party) recording-consent states**, and emitting the **required spoken
  disclosures** (AI-identity always; call-recording per always/two-party-only mode). Every
  external fact is an input, so it's fully unit-tested (9 table-driven cases + Locator +
  two-party). `Locator` resolves E.164 → US state → IANA timezone (complete two-party set +
  state→tz; seeded/extensible area-code→state map). Durable data model: migration 00081
  (`voice_consent_records` append-only w/ revoke + `voice_dnc`) + `Repository`
  (HasActiveConsent/IsSuppressed + record/revoke consent + add/remove/list DNC). `Service`
  composes Locator+Repository+engine into the reusable `Decide` gate (fail-closed on a store
  error). API: `VoiceConsentHandler` → `POST /v1/voice/consent{,/revoke}`, `/v1/voice/dnc{,/remove}`,
  `GET /v1/voice/dnc` (agent-admin for mutations), `POST /v1/voice/consent/check` (dry-run
  decision + disclosures for the UI). Wired in main.go. build/vet/gofmt + voiceconsent/http green.
  **Remaining (deployment/behaviour-gated, not code):** the live TTS actually *speaking* the
  engine's disclosures + an outbound-dial path calling `Service.Decide` before ringing (no
  outbound-call endpoint is built yet — inbound/meeting paths use their own attestation) + a
  national-DNC feed behind the same `IsSuppressed` seam.
- ☑ **T3.4 — Voice-clone consent vault (§5.2). DONE** 2026-07-02 *[Voice moat]*. Using a cloned/custom
  voice is legally gated (2026 voice-cloning law / BIPA voiceprints): it needs the cloned person's
  documented, use-case-scoped consent. New `internal/voiceclone` (mirrors `voiceconsent`): pure
  `Evaluate(rec, requestedUseCase, now) Decision` — nil record ⇒ standard voice (allowed); a
  revoked / expired / out-of-scope record ⇒ **blocked** (10 table cases). `ConsentRecord` ties a
  synth `voice_id` → named subject + `artifact_ref` (pointer to the stored signed consent) + use-case
  scope + optional expiry. Migration 00084 (`voice_clone_consents`, append-only: revoke sets
  revoked_at, re-consent inserts a new row; latest-row-per-voice index). `Repository`
  (Register/Revoke/GetLatest[latest row, active-or-revoked]/List[DISTINCT ON voice_id]) + `Service.
  Gate(tenant, voice_id, useCase)` = the reusable choke point, **fail-closed** on a store error.
  **Enforcement**: `VoiceHandler.WithCloneGate` + the gate runs inside `applyPersona` — the ONE point
  every dispatch path (meeting / telephony / browser) resolves a persona voice — so a persona
  resolving to a cloned voice without valid consent is refused (403; 503 fail-closed on lookup error).
  API: `VoiceCloneHandler` → `GET /v1/voice/clone-consents`, `POST /v1/voice/clone-consents/check`
  (dry-run gate), `POST /v1/voice/clone-consents{,/revoke}` (agent-admin). Wired main.go. Tests:
  engine table + applyPersona block/allow/fail-closed. go build/vet/gofmt + voiceclone/http green.
  **Honest scope:** enforcement covers voices the tenant *registered* as clones (creating a consent
  record marks a voice_id as a gated clone) + the persona path; an *undeclared* cloned voice can't be
  distinguished from a stock voice by id alone (no provider clone-detection API), and a non-persona
  tenant-default voice is gated at the persona choke point only — both are honest follow-ups. The
  signed consent document itself lives in object storage (artifact_ref points to it).
- ☑ **T3.5 — Voice spend ceilings (§5.5). DONE** 2026-07-02. New `internal/voicespend`: pure
  `Evaluate(monthToDateUSD, Ceilings) Decision` — refuses a new call once the **monthly** cap is
  reached and derives **BudgetedSeconds** (max call length before the tighter of the **per-call**
  and remaining-monthly budget is hit, at the blended **per-minute** rate) so enforcement is a
  hard duration cap, no live polling. `EstimateCost` + `Ceilings` (0 ⇒ unlimited; default rate
  $0.12/min). Ledger: migration 00082 (`voice_spend`, append-only per CLAUDE.md §6.4) +
  `Repository` (MonthToDateUSD, RecordCallSpend) + `Service` (PreCall gate, Record, StatusFor,
  BudgetedRunFor). Wired: `VoiceConfig.Spend` (OFF by default) → `voicespend.Service`; **pre-call
  monthly gate** in `DispatchMeeting` (402 quota-exceeded, fail-closed on ledger error) +
  **spend recorded on finalize** via a `SpendRecorder` seam on the shared `ArtifactService`
  (adapter in cmd; covers meeting + telephony) + `GET /v1/voice/spend` status (mtd + ceilings +
  remaining + next-call budget). Engine table-tested (monthly-block / per-call-budget /
  tighter-of / unlimited / cost-estimate); build/vet/gofmt + voicespend/voice/http/config green.
  *Per-call/monthly enforcement is live at the gate; a live outbound-dial timer using
  BudgetedRunFor + true per-provider rates are deployment-gated refinements.*
- ☑ **T3.6 — VoicePersona spec + org Persona Library (§4). DONE** 2026-07-02. New
  `internal/voicepersona`: the `Persona` spec (TTS voice mapping — synth_kind/voice_id/model_id
  + language; spoken `Style`; `Greeting`; and consent-`AIIdentityDisclosure`/`RecordingDisclosure`
  overrides that feed the §5.1 engine) + pure `Input.Normalize` (trim, lower-case kind/lang,
  name required+bounded, known synth kind, voice_id required when a kind is set, all text
  length-bounded) — unit-tested. Org library: migration 00083 (`voice_personas`, unique
  (tenant,name)) + `Repository` (Create/Get/List/Update/Delete, tenant-scoped, `IsDuplicate`
  →409, `ErrNotFound`→404). `VoicePersonaHandler` CRUD → `GET /v1/voice/personas{,/{id}}` (open
  to members) + `POST`/`PUT`/`DELETE` (agent_admin), 422 on invalid input. Wired in main.go.
  Tests: Normalize (trim/lowercase + 5 reject cases + empty-kind-allowed) + handler
  validation/auth/bad-uuid. **APPLICATION WIRED 2026-07-02** (was library-only): `SessionConfig`
  now carries the applied persona (`PersonaID` + `Voice VoiceSelection` + `Greeting` + AI/recording
  disclosure overrides); the meeting dispatch accepts `persona_id` and `applyPersona` resolves it
  (tenant-scoped: 409 if personas off, 422 bad id, 404 unknown) and copies its voice/greeting/
  disclosures onto the session — tested (happy-path population + 3 error cases). Consumption seam
  built: `SynthStore.ResolveWith(VoiceSelection)` overrides the tenant voice with the persona's
  voice id/model on the tenant's connected provider+key (`Resolve` now delegates to it). Persona
  lookup wired into the voice handler in main.go. **TELEPHONY SPEAKING-PATH WIRED 2026-07-02**
  (was carried-but-unconsumed): the inbound Twilio webhook now accepts `?persona=<id>` and consumes
  the persona end-to-end. `SessionClaims` carries the persona voice (`vi`/`vm`, omitempty →
  back-compatible with pre-persona tokens) via new `SessionSigner.SignWith`; `TwiMLHandler.
  WithPersonas` resolves the persona (422 bad id / 404 unknown, mirroring `applyPersona`) and
  `renderConnectTwiML` speaks the greeting + AI/recording disclosures (XML-escaped `<Say>` lines)
  *before* `<Connect>` — governance-native: a phone call ALWAYS discloses AI + recording, persona
  overrides or platform defaults (`voiceconsent.DefaultDisclosures`, single source of truth).
  `TelephonyDeps.SynthFor` now takes the per-call `VoiceSelection`; `Begin` resolves the tenant's
  connected voice with the persona override via `SynthStore.ResolveWith` so the agent speaks in the
  persona's voice. Tests: Sign/Verify voice round-trip + zero-fallback; render say-order/escape/
  blank-skip; handler default-disclosure + persona greeting/voice-in-session + 422/404. So: define ✅,
  manage ✅, apply-at-dispatch ✅, telephony speaking-path (voice+greeting+disclosures) ✅.
  **BROWSER/LIVEKIT SPEAKING-PATH WIRED 2026-07-02** (the last persona entry point): the WebRTC
  token endpoint (`webrtcTokenRequest`) now accepts `persona_id` → `applyPersona` resolves it (same
  422/404/409 mapping) → the persona **voice** (`VoiceID`/`ModelID`) and the resolved join
  **announce lines** (greeting + AI/recording disclosures, via the *same* `callSayLines` helper the
  telephony `<Say>` path uses — single source of truth) ride the `voice.AgentAssignment` to the
  worker. Worker (`backend/voiceagent`): `AgentAssignment` mirrors the new fields; `ConversationFactory`
  now takes the whole assignment; `voiceConversation` holds the persona voice and (a) synthesizes
  turns via new `TTSClient.SynthesizeVoice(text, voiceID, model)` — its own env TTS key + the persona
  voice id, mirroring telephony — and (b) `speakAnnounce`s the greeting + disclosures on join
  (async, `speakMu`-serialized ahead of the first reply; operator-authored config spoken directly,
  like the telephony `<Say>` — DPE gates *model* speech, not fixed config). Frontend: `voiceApi.
  webrtcToken({persona_id})` + `BrowserVoiceAgent({personaId})` prop. Tests: orchestrator
  assignment-carries-persona + bad-id-rejected-no-enqueue; worker TTS voice-override (path/body) +
  assignment persona-fields JSON decode. go build/vet/gofmt + orch http/voice green; worker CGO-free
  build/vet/test green; FE tsc/lint clean. **T3.6 speaking paths COMPLETE (telephony + browser);**
  only the live TTS audio itself (Cartesia/ElevenLabs) is deployment-gated (un-exercisable in-sandbox).
  **PERSONA GOVERNANCE HARDENING 2026-07-02** (two follow-ups from the persona work, chosen over
  gating fixed operator config — a required disclosure must NEVER be block/allow-gated, since a
  fail-closed DPE blip would suppress the very compliance line): **(A) save-time PII screen** —
  `voicepersona.Input.ScanForPII(PIIScanner)` runs every free-text field (name/description/style/
  greeting/AI+recording disclosure) through the SAME `voice.Scanner`/`RegexRedactor` seam the
  artifact pipeline uses; a persona is reusable long-lived config so PII belongs in a scanned live
  transcript, never baked in. `VoicePersonaHandler.WithScanner` → 422 on PII (names offending field),
  500 fail-closed on scan error; wired `voice.RegexRedactor{}` in main.go. Unit-tested (pure scan:
  reject/clean/nil-noop/fail-closed + handler 422). **(B) `disclosures_delivered` governance event
  on the telephony artifact** — the persona disclosure OVERRIDES now ride the session token (new
  `SessionMint`/`SignSession`; `di`/`dr` omitempty ⇒ no bloat for default calls); telephony `Begin`
  resolves the exact AI+recording lines spoken (override or `voiceconsent.DefaultDisclosures`) onto
  the `SessionConfig`; `NewVoiceSession` records a structured `disclosures_delivered` event with the
  precise wording → the call artifact is auditable proof the required disclosures were delivered.
  Tested (token disclosure round-trip; session records-event / no-disclosures-no-event). **Honest:**
  the *browser* leg is stateless per turn (no orchestrator VoiceSession accumulates ⇒ no artifact),
  so its disclosure delivery is logged in the worker (`speakAnnounce`) but artifact-attachment there
  awaits browser-session finalization (documented follow-up). go build/vet/gofmt + voice/voicepersona/
  http green; worker CGO-free green.
  **BROWSER-SESSION FINALIZATION SHIPPED 2026-07-02** (closed that follow-up — the browser/LiveKit
  leg now produces a governed artifact like telephony/meetings). The cognitive loop runs in the
  *worker*, so the worker owns accumulation and does ONE finalize write on call end (mirrors
  telephony Close→Finalize; no orchestrator-side session registry ⇒ no cross-replica memory problem).
  Orchestrator: `VoiceSession.SpeakVerdict` exposes the governance decision; `POST /v1/voice/turn`
  now returns `action`+`reason` so the worker can build a governance diary; new **`POST
  /v1/voice/sessions/finalize`** (worker-token gated, bounded: 5000 segments/500 events/8KiB per
  line/8MiB body; unknown gov-event types dropped; empty transcript ⇒ 204 no artifact) builds a
  `voice.FinalizeInput` and calls the SAME `ArtifactService.Finalize` (scan→store→notify→surface).
  `AgentAssignment` refactored to carry `SessionID`+`Organizer`+`Greeting`/`AIDisclosure`/
  `RecordingDisclosure` (dropped the merged `Announce`); `WebRTCToken` mints the session id, sets
  organizer=clerk user, and resolves persona-or-default disclosures. Worker (`backend/voiceagent`):
  new `FinalizeClient`; `voiceConversation` accumulates the diarized transcript (caller + spoken
  agent replies) + governance diary (blocked/escalated from the turn action, + `disclosures_delivered`
  on join) under a mutex, and on `Close` posts the session (best-effort, fresh 20s ctx, skipped when
  nothing was said). Tests: orchestrator SpeakVerdict verdict, Turn action=block, finalize handler
  (builds input / drops unknown gov types / 204-empty / 501+401); worker FinalizeClient (submit /
  204-success / 5xx-surfaces / retries-transient-5xx / no-retry-4xx) + assignment persona-fields
  decode. go build/vet/gofmt + voice/http green; worker CGO-free green; FE tsc/lint clean.
  **Durability posture (decided, not a gap):** `FinalizeClient` retries transient failures
  (transport + 5xx) with exponential backoff + full jitter, max 3 attempts (CLAUDE.md §4.4), sized
  to complete inside the pod termination grace — so a *successful call whose persist blips* never
  loses its artifact, and a *graceful shutdown* (SIGTERM → `Close` runs → finalize) persists in-flight
  sessions. The only uncovered case is a HARD worker crash (SIGKILL/OOM/node death) mid-call, which
  kills the live media session itself — so there's no completed call to preserve; adding Temporal/
  durable-per-turn accumulation was deliberately declined (low marginal value, matches the telephony/
  meeting legs' live-media posture). Live LiveKit audio remains deployment-gated.
- ☑ **T3.7 — Durable `VoiceSessionWorkflow` (§6). DONE** 2026-07-02, flag-OFF
  (`voice.durable_sessions`). New `internal/voicesessionflow` (mirrors distillflow): a
  `TemporalDispatcher` that satisfies the SAME `meetingDispatcher` seam the in-process
  `MeetingOrchestrator` does — so it drops in behind the voice handler unchanged — but enforces
  the governance gates synchronously (EnforceMeeting + consent, immediate caller feedback) then
  durably enqueues `VoiceSessionWorkflow` (per-session workflow id) instead of a fire-and-forget
  goroutine. `RunVoiceSession` activity delegates to `MeetingOrchestrator.Launch` (join →
  transcribe → finalize; the artifact is persisted by the finalizer inside, kept OUT of workflow
  history since transcripts are large). Registered on the worker when the flag is on; the
  activity's launcher is injected via `SetActivities` after the orchestrator exists (activity
  closes over the package var, resolved at run time). **Durability delivered = the LIFECYCLE:**
  dispatch survives the API pod that accepted it, every session is a queryable + audited Temporal
  execution, lifetime cap enforced centrally. **Honest limit (documented in-code):** a live
  meeting is real-time so the media leg is NOT crash-*resumable* — the run activity does not retry
  (`MaximumAttempts:1`); a mid-call worker crash loses the live audio (the meeting-bot provider's
  own timeout reaps the orphaned bot). testsuite (completes / failure-propagates-no-retry /
  launcher-delegation) + dispatcher gate tests (consent + capability reject before any client
  call); build/vet/gofmt + voicesessionflow/config green. Back-compat: OFF ⇒ the existing
  goroutine dispatch is byte-identical.
- ☑ **T3.8 — Extra voice capabilities + no-code Voice Capability Builder (§3.1/3.3). DONE**
  2026-07-03 *[Voice moat]*. **(A) Pre-built voice capability flags (§3.1):** added
  `answer_inbound_calls` / `ivr_navigate` / `live_translate` / `voicemail_drop` / `voice_approvals`
  to `AgentCapabilities` + the `Has()` map (so the DPE Tier-1 hard-block gates them like every other
  capability) + `voice.EnforceInbound` and a generic `voice.EnforceCapability(caps, name)`
  (fail-closed on unknown). Unit-tested (each flag granted/denied + unknown-denied). **(B) No-code
  Voice Capability Builder (§3.3):** new `internal/voicecapability` — the "build your own voice
  agent" surface, in the kernel. `VoiceCapability` = **trigger** (inbound/outbound/meeting/webhook,
  each mapping to the manifest flag it requires via `Trigger.RequiredCapability`) + optional applied
  **persona** + governed **toolset** (existing tool/MCP/connector names — still governed by the
  Tool-Call Supervisor at call time) + **guardrails** (objective/knowledge sources, max call minutes,
  per-call/per-minute ceilings, calling window, require-consent, escalation, min-tier). Pure
  `Input.Normalize` (name+known-trigger required, tools de-duped/bounded, window hours 0-23, ceilings
  ≥0, objective ≤2000) — unit-tested (trim/dedupe + 6 reject cases + trigger→capability map).
  Migration 00085 (`voice_capabilities`, unique (tenant,name)) + `Repository` (CRUD, tenant-scoped,
  `IsDuplicate`→409 / `ErrNotFound`→404). `VoiceCapabilityHandler` → `GET /v1/voice/capabilities{,/{id}}`
  (members) + `POST`/`PUT`/`DELETE` (agent_admin); wired main.go. Handler tests (unknown-trigger/empty-name
  422, no-tenant 401, bad-uuid). go build/vet/gofmt + voicecapability/voice/domain/http green.
  **Honest:** the builder + flags are the governed *authoring* surface; the live RUNTIME of each new
  capability (real IVR tree navigation, live translation, voicemail drop) is deployment-gated on the
  live telephony/TTS pipeline — the manifest model, guardrails, and dispatch governance are what's
  built. Trigger→session auto-wiring (inbound-number routing, scheduled outbound) rides the outbound
  workstream (Voice plan §1).
- ☑ **T3.9 — Calendar-connected auto-join (§0.5). DONE** 2026-07-03 *[Voice moat]*. New
  `internal/calendarautojoin`: a PURE, deterministic `Evaluate(event, policy, organizerConsented,
  now) Decision` — a connected calendar's scheduled meeting is auto-joined as a governed bot ONLY
  when the per-agent `Policy` allows it and the **organizer has consented** (the pre-join consent
  card, governance-native); every gate **fails safe** (disabled / no meeting URL / all-day / private
  / below min-attendees / organizer-domain-not-allowed / ended / no-consent ⇒ no join, with a
  reason). Returns `JoinAt = StartAt − lead`. `DefaultPolicy` is conservative (disabled, consent +
  URL required, personal/all-day skipped). 12 table cases green. `CalendarSource` seam (fetch
  upcoming events) is the deployment-gated OAuth adapter injection point. Durable model: migration
  00086 (`voice_autojoin_policies` per-agent + append-only `voice_autojoin_consents` w/ revoke) +
  `Repository` (GetPolicy[default on miss]/SetPolicy upsert + GrantConsent/RevokeConsent/HasConsent).
  `VoiceAutojoinHandler` → `GET`/`PUT /v1/voice/autojoin/{agentId}` (policy; PUT agent_admin),
  `POST /v1/voice/autojoin/{agentId}/check` (dry-run: policy + live consent → Decision, previews
  behaviour with no calendar connected), `POST /v1/voice/autojoin/consent{,/revoke}` (agent_admin).
  Wired main.go. Handler tests (bad-lead 422, bad-agent-id 422, consent-requires-email). go build/
  vet/gofmt + calendarautojoin/http green. **Honest (deployment-gated, not code):** the live
  Google/M365 calendar OAuth fetch (behind `CalendarSource`) + the poller loop that dispatches the
  meeting bot at `JoinAt` via the existing `MeetingOrchestrator` verify on deploy; the decision
  engine + policy + consent gate + config API are what's built + tested.
- ☑ **T3.11 — MAL HashiCorp Vault backend. DONE** 2026-07-03. Customer-managed-keys tier for MAL
  tokens via Vault's **Transit** engine (envelope encryption): the KEK lives in Vault, is never
  returned, and is rotatable as a Vault op; only Transit ciphertext (`vault:vN:…`) is persisted, so
  plaintext PII never lands in the store, and rotation is transparent (old ciphertext still decrypts
  under retained key versions — no re-encryption of existing tokens). `internal/mal/vaultstore.go`:
  `VaultTransitStore` **decorates any inner `TokenStore`** (PgTokenStore in prod, Mem in tests) —
  Transit-encrypt on Put, Transit-decrypt on Get, delegating persistence + TTL to the inner store —
  behind a `transitCipher` seam; `VaultTransitClient` = a minimal Vault Transit HTTP client (no
  vendor SDK dep) with `Encrypt`/`Decrypt`/`RotateKey`. Config `EMAOP.Vault{Addr,Token,TransitKey}`
  (`ORCHESTRATOR_EMAOP_VAULT_*`, OFF by default) → main.go wraps the Pg store when all three are set;
  the expired-row sweep stays on the concrete Pg store. Tests (against an **httptest mock Vault**):
  client encrypt/decrypt round-trip + rotate + bad-token-error; store round-trip + **inner store
  holds ciphertext not plaintext** (the governance guarantee) + purge + nil-deps. go build/vet/gofmt,
  mal/config green. **Honest:** verifies end-to-end against a real Vault cluster on deploy (the
  code + protocol are exercised against the mock; a live Vault is the only remaining check). Per-key
  **per-tenant** transit keys need the tenant on the `TokenStore` interface (it carries only the
  task context id today) — a follow-up; the shipped tier is a customer-managed key per deployment.
- ☑ **T3.14 — Per-tenant registry secrets. DONE** 2026-07-03 (BYO-registry path + vault-sealed store;
  live ECR/ESO reconcile is deploy-only). `internal/registrybinding`: pure `NewBYOBinding` (host-only
  validation — rejects scheme/path/whitespace, bare `host[:port]`) + `DockerConfigJSON` (`.dockerconfigjson`
  with `auth: base64(user:secret)`); `Store` over the `notify`/`mcphub` credential vault (rejects nil
  vault, `sealed_secret` never logged, `maskHint`) — Connect/Get/ResolveDockerConfig/Delete. Handler
  `GET/PUT/DELETE /v1/settings/registry` (Get open, Put/Delete `agent_admin`); wired in `main.go` behind
  the vault type-assert. Migration `00088_registry_bindings.sql`; `infra/k8s/registry/externalsecret.example.yaml`
  (ESO `dockerconfigjson` template). Tests: binding_test + registry_test (422 URL-host/missing-secret,
  401 no-tenant, nil-vault error, fakeVault round-trip) — green. **Deploy-gated remainder:** the ECR
  `ECRAuthorizationToken` generator + live ESO sync run on the cluster.
- ☑ **T3.19 — Residency P3. DONE** 2026-07-03 (region-migration tooling + extra regions; physical
  regional planes are infra-heavy P2, deploy-only). Catalog gains CA/AU/AP (roadmap, EU-entitlement-gated);
  `cloudregions.go` maps AWS/GCP/Azure CA/AU/AP region strings (precise — `australiaeast` never misread
  as US). New `migration.go`: ordered `MigrationSteps` (freeze→snapshot→transfer→import→verify→cutover→
  resume→decommission), fail-closed `PlanMigration` (both regions must be LIVE — statically or promoted
  via `availableExtra` once a plane is stood up — distinct, tenant present; `PointOfNoReturn=cutover`),
  `StepIndex`. Tests: migration_test (roadmap refused, promoted plans, reject matrix, new-region mapping) +
  updated cloudregions_test for the now-placeable regions — green. **Deploy-gated remainder:** provisioning
  the actual regional data planes + the durable migration workflow's live data-moving activities.
- ☑ **T3.17b — Marketplace Stripe Connect take-rate. DONE** 2026-07-03 (all slices; live KYC/real-money
  verify in Stripe live mode on deploy — everything below is testable in Stripe TEST mode). Publisher payouts via Stripe Connect Express + platform application-fee (the
  take-rate). New in `internal/marketplace` (alongside signing.go): **`connect.go`** — pure
  `SplitEarning(grossMinor, feeBps) → (platformFee, net)` (the take-rate math; clamps to [0,gross],
  no rounding leak) + `ConnectClient` seam + `StripeConnectClient` (stripe-go/v85: Express account w/
  transfers capability, hosted `account_onboarding` link, account status). **`store.go`** — publisher
  accounts + append-only earnings ledger (migration 00087: `marketplace_publisher_accounts` [unique
  stripe_account_id for webhook lookup] + `marketplace_earnings`): UpsertAccount/GetAccount/
  SetAccountStatus + RecordEarning/SetEarningStatus/ListEarnings(+summary). **`webhook.go`** — pure
  `ConnectWebhookProcessor` (signature-verified via `ConstructEventWithOptions{IgnoreAPIVersionMismatch}`
  so a differently-versioned connected account never drops a payout webhook): `account.updated`→status,
  `payment_intent.succeeded/failed`+`charge.refunded`→earning payout status. **`MarketplaceConnectHandler`**
  (store behind an interface for testability): `POST /v1/marketplace/connect/onboard` (create Express
  acct if none + hosted link; billing-admin), `GET /v1/marketplace/connect/status` (live refresh +
  persist), `GET /v1/marketplace/earnings` (list + summary), PUBLIC signature-verified
  `POST /v1/marketplace/connect/webhook`. Config `billing.{ConnectWebhookSecret,MarketplaceFeeBps}`;
  wired in main.go (gated on Stripe key). **Tests RUN + green** (no live Stripe): SplitEarning table +
  reconstruct-invariant, Onboarded, onboard-creates+links (fake client+store), earnings-summary,
  webhook-not-enabled 501, **account.updated persists via SDK-signed test payload**, bad-signature 400.
  go build/vet/gofmt + marketplace/http green. **CHARGE-EXECUTION + FE SHIPPED 2026-07-03** (the two
  remaining slices): (1) **destination-charge purchase** — `ConnectClient.CreatePurchaseSession` opens
  a hosted Checkout (mode=payment) with `PaymentIntentData.ApplicationFeeAmount` (the take-rate) +
  `TransferData.Destination` (publisher account); `POST /v1/marketplace/purchase` resolves the
  publisher's onboarded account (409 if not onboarded), computes `SplitEarning`, opens checkout, and
  **records a pending earning correlated to the checkout session id**; the webhook
  `checkout.session.completed` settles it to paid + stamps the payment intent (`SetEarningPaidBySession`),
  `charge.refunded`/`payment_intent.payment_failed` transition by payment intent. Migration 00087 gained
  `stripe_checkout_session` (+ index). Tests: purchase opens-checkout-with-correct-split + records-pending,
  refuses-unonboarded 409, checkout.session.completed settles-by-session (SDK-signed payload). (2) **FE**:
  rewired `/marketplace/earnings` (Server Component) OFF the old Payoneer/milestones design ONTO the
  shipped Stripe Connect endpoints — `serverMarketplaceApi{connectStatus,earnings}` (server.ts) +
  `marketplaceApi.onboard` (client.ts) + `ConnectPayoutsButton` (client, redirects to hosted onboarding);
  onboarding banner until payouts enabled, net/paid/pending summary cards (minor→currency), transactions
  table w/ status badges, brand tokens (no hardcoded hex; success/warning/error from the token layer),
  loading/empty states. go build/vet/gofmt + marketplace/http green; FE tsc/lint clean.

---

## Tier 4 — Infra / CI / process

- ☑ **T4.1 — ext-authz `/metrics`** Prometheus endpoint; enable its `serviceMonitor`.
  Added `extauthz_decisions_total{outcome,requirement,reason}` (bounded-enum labels) +
  `extauthz_check_duration_seconds{requirement}` (`internal/extauthz/metrics.go`), recorded in
  `Service.Check` via a new pure `decide()` core + `AccessRequirement.String()`. Served on a
  **dedicated `metrics_port` (9192)** listener in `cmd/extauthz/main.go`, deliberately separate
  from the 9191 callout port — the ext_authz callout arrives at the caller's original path, so a
  public request to `/metrics` on the callout port would reach the handler and bypass auth.
  Chart: metrics container/service port + `servicemonitor.yaml` (scrapes `metrics` port,
  orchestrator relabel/drop parity) + `serviceMonitor.enabled: true`. Verified: gofmt/build/vet
  clean, `go test ./internal/extauthz/...` green (new table-driven metrics test asserts label
  correctness per path), `helm lint` + `helm template` render all objects.
- ☑ **T4.2 — `gatewaytrust` dual-secret HMAC rotation** window (zero-downtime key rotation).
  `gatewaytrust.Verifier` now holds a secret *set* (`secrets [][]byte`); `NewVerifier(primary,
  rotationSecrets...)` accepts an optional second secret (empty ignored, primary-dupe deduped,
  short-secret fails fast) and `Verify` accepts a MAC matching any of them (constant-time
  `hmac.Equal` per secret; 1–2 elems). Signer unchanged (signs with one secret; rotation widens
  the verifier, rolls signers, then narrows). Config: `auth.gateway_trust_secret_next` +
  empty-string defaults for the auth secrets (fixes the latent viper AutomaticEnv bind gap so
  `_SECRET`/`_NEXT` actually load from env). `main.go` passes `_next` + logs
  `rotation_window`. Runbook: 3-step zero-downtime rotation procedure added to the P6-A runbook
  (Step E). Chart needs no change — secrets arrive via `envFrom` from the Vault/ESO-managed
  Secret. Verified: gofmt/build/vet clean; gatewaytrust+config+extauthz tests green (new
  `rotation_test.go` proves both-secret accept, retired-secret reject, constructor validation).
- ☑ **T4.3 — CI umbrella-chart coverage** — `helm dependency build` + lint/template the
  umbrella, not just 3 subcharts. Rewrote the `helm-lint` job in
  `infra/.github/workflows/terraform-checks.yml`: (1) standalone `helm lint` for the two
  per-instance template charts (mcp-runner, harness-pool — the umbrella never renders them and
  their `required` guards would fail `template`); (2) `helm repo add bitnami` +
  `helm dependency update helm/actrone` (`update` not `build` — deps use `.x` ranges with no
  committed Chart.lock); (3) `helm lint helm/actrone` + `helm template` of the whole platform
  with default values AND the `values-eu.yaml` residency overlay, so a broken subchart wiring or
  EU delta fails the PR not the deploy. Validated offline as far as the sandbox allows: workflow
  YAML parses; **all 9 first-class subcharts** (orchestrator/control-tower/ext-authz/gateway/
  linkerd/sentry-relay/nats/marketplace/voiceagent) `helm template` clean standalone (so the
  umbrella's rendered set is sound), and mcp-runner/harness-pool `helm lint` clean. The bitnami
  fetch + umbrella `dependency update`/`template` run only on the networked CI runner (no egress
  in-sandbox). ~~*Caveat:* the umbrella still pins postgres/redis to the legacy Bitnami repo.~~
  **RESOLVED 2026-07-03 (Bitnami sunset):** Bitnami's free catalogue was retired 2025-08-28
  (images frozen in `bitnamilegacy`, no security patches; maintained images now require the paid
  Bitnami Secure Images subscription), so the `postgresql`/`redis` subcharts were **removed** from
  the umbrella rather than re-pointed at a dying channel. The DBs are now external attached
  resources (§2.3) — the app already reads its DSNs from `orchestrator-secrets` (envFrom), so no
  app wiring changed; managed deploys use RDS/ElastiCache, self-hosters are pointed at
  **CloudNativePG** (Postgres) + **Valkey** (Redis) in `values.yaml`. The CI `helm repo add bitnami`
  step was dropped (all deps are now `file://`, fully offline). Two latent umbrella bugs surfaced by
  re-verifying and fixed in the same pass: (a) `orchestrator`/`control-tower` were pinned `0.1.0`
  but the subcharts are `1.0.0` (version drift that broke `helm dependency update`); (b)
  `charts/marketplace` + `charts/voiceagent` existed on disk but were **undeclared** in the umbrella
  (failing `helm lint`) — now declared condition-default-false (behaviour-preserving; the umbrella
  never rendered them). Full local `helm dependency update` + `helm lint` + `helm template`
  (default + EU overlay) all green (11 file:// charts, 0 lint failures).
- ☑ **T4.4 — Reconcile ALB↔Gateway** — `helm/actrone/values.yaml` had both `ingress`
  (ALB) and `gateway` claiming `api.actrone.com`. Root cause: the `ingress:` block was **dead
  config** — no template in the whole chart tree consumes `.Values.ingress` and there is no
  `kind: Ingress` anywhere, yet it documented a second edge routing straight to the orchestrator
  and bypassing the ext_authz brain (a latent security bypass, not just a DNS clash). Committed
  the Envoy Gateway (with ext_authz) as the single north-south edge: removed the ALB `ingress`
  block from `values.yaml` + `values-eu.yaml`, replacing it with a comment explaining why there
  is deliberately no ALB Ingress (Envoy Gateway provisions its own LB and is the only path that
  runs the authorization callout). EU override now carries only `gateway.hosts`. Verified: both
  values files parse as valid YAML; zero `.Values.ingress` references remain (render output
  unchanged since the block was inert).
- ☑ **T4.5 — Cross-repo GitOps (Option 1)** — service CI writes image-tag PR → ArgoCD
  syncs (atomic, auditable), replacing direct per-service `helm upgrade`. Built the infra-side
  receiver: (1) `helm/actrone/values.images.yaml` — centralized, GitOps-owned image tags for the
  5 first-party services (orchestrator/control-tower/ext-authz/marketplace/voiceagent), each tag
  line carrying a `# svc:<name>` sentinel; (2) wired it as the **last valueFile** of the
  `actrone-platform` Argo CD Application so its tags override the baseline; (3)
  `scripts/bump-image.sh` — deterministic, comment-preserving sentinel-`sed` tag setter with a
  hard service allowlist + OCI-safe tag-charset validation (no yq dependency); (4)
  `.github/workflows/image-bump.yml` — `repository_dispatch`(from service CIs)+`workflow_dispatch`
  → validate → bump → open a labelled deploy PR via `gh` (no third-party action to SHA-pin;
  default-deny perms; re-validates so a compromised dispatch token can't deploy arbitrary images
  or bypass review); (5) README deploy-model section: **application deploys are GitOps, not
  `helm upgrade`** — no service pipeline holds cluster creds; merge = deploy; revert = rollback.
  Verified offline: all changed YAML parses; bump script tested (valid bump edits exactly 1 line,
  rejects unknown service + bad tag, restores clean); PR-body printf keeps backticks literal (no
  command substitution); and `--set image.tag` proves the tag flows into the rendered container
  image (`ghcr.io/actrone/orchestrator:9.9.9-test`). Live PR-open + Argo CD sync run only on the
  networked runner / in-cluster.

- ☑ **T4.6 — Edge CORS (browser cross-origin).** ADDED 2026-07-02 (gap found while wiring the
  control-tower SSE feed). The browser app (`app.actrone.com`) calls the API (`api.actrone.com`)
  cross-origin with an `Authorization` bearer → every call is preflighted, and **no CORS existed
  anywhere** (orchestrator middleware has none; the gateway set only security response headers) —
  so the entire browser→API surface (incl. the new `/v1/control/stream`) would have been blocked
  in prod, and the unauthenticated `OPTIONS` preflight would additionally be denied by ext_authz.
  Fixed AT THE EDGE by folding a `cors` block into the existing `edge-authz` Envoy
  `SecurityPolicy` (Envoy allows ≤1 SecurityPolicy per target, so merged not separate; the CORS
  filter answers preflight ahead of ext_authz and is a no-op for origin-less SDK/gRPC callers).
  `gateway.cors` values (allowOrigins `https://app.actrone.com`, methods, headers incl.
  Authorization/Idempotency-Key/X-Request-Id/Accept, expose X-Request-Id, 1h maxAge) + EU overlay
  override (`https://eu.app.actrone.com`). `helm template` renders one merged policy for US + EU.
  *SDKs (Go/TS/Python) are server-side → unaffected (no CORS); verified all three route via the
  same Envoy+Linkerd edge with Bearer auth + WS streaming.*

**Tier 4 COMPLETE (T4.1–T4.6).**

---

## Tier 5 — Frontend brand cleanup ✅ COMPLETE

- ☑ **T5.1 — Fix stale old-brand defaults** in `settings/organization/page.tsx`
  (`#FF3B30`/`#ADA8A2` → monochrome tokens). Real bug: tenants saw the pre-rebrand identity
  in the email-preview. Renamed `ACTRONE_RED` → `ACTRONE_PRIMARY` (`#F5F5F7`); accent →
  `#A1A1A6`.
- ☑ **T5.2 — Replace hardcoded emoji** in `TraceViewer.tsx` → lucide glyphs. `EventRow.icon`
  is now `React.ReactNode`; 🔧→`Wrench`, ✓→`Check`/`X` (status-driven), 🧠→`Brain`,
  🤖→`Bot`, all `strokeWidth={1.5}`, muted-token colour.
- ☑ **T5.3 — Retire `btn-red` class name** — renamed `btn-red` → `btn-brand` across the
  globals.css definition (`.btn-brand`/`:hover`/`:active`) + all 25 call-sites. Render was
  already correct white-on-black; this removes the misleading name.
- ☑ **T5.4 — Replace raw hexes with tokens** — notifications (`SEV_COLOR` → info/warning/error
  tokens), team + profile (`#22c55e` → `var(--color-success)`), and all marketplace status
  hexes (`#22c55e`→success, `#f59e0b`/`#fbbf24`→warning, `#ef4444`→error, `#3b82f6`→info);
  also `'Review Recommended'` → `'Review recommended'`.
- ☑ **T5.5 — Sentence-case sidebar labels** — Title-Case → sentence case across all nav
  entries (Trace viewer, Agent fleet, Memory explorer, Tool registry, Integration hub, My
  agents, Cost monitor, Rules workbench, Audit log, Alert center, Source deploy, MACP graph,
  MCP hub, A2A gateway).

**Verification (all green):** `npx tsc --noEmit` clean · `npm run lint` clean ·
`npm run build` succeeds · `npm run test` 85/85 pass.

---

## Doc drift (fix alongside related code)

- ☑ **D.1 — `Stripe_Branding_Setup.md`. DONE** 2026-07-03. Retargeted to the LOCKED Black & Apple-Silver
  identity: Brand colour `#FF3B30`→`#F5F5F7` (`--color-text-primary`, primary button fill), Accent
  `#FF6961`→`#3B82F6` (`--color-info` link), radius ~8px→~6px (`rounded-md`), Space Grotesk→Geist; contrast
  note rewritten to white-button/black-text + explicit "Never set a red brand colour — red is errors only";
  §3/§5 CTA copy ("red-gradient" / "red purchase button" → white primary). No red refs remain in colour guidance.
- ☑ **D.2 — Master plan §0a. DONE** 2026-07-03. Corrected the stale **Voice** entry — verified against the
  codebase (`internal/voice`: LiveKit tokens, meeting-bot lifecycle + 4 providers, streaming STT, TTS
  synth, DPE governor, artifacts/BYO-OAuth email; plus the CGO-isolated `backend/voiceagent` real-time
  media worker) → rewrote "interfaces only / not implemented" to **V2.1 code-complete, deployment-gated**
  (remaining = provider secrets + verify-live). Header status line + §0a verified-date updated. P7 and
  MediaGuard rows were already accurate.
- ☑ **D.3 — `connector/adapter.go`** comment fixed 2026-07-02 (with T3.2): `erp.go`/`hris.go` now
  exist as vendor presets over `CustomRESTAdapter`; the comment describes that accurately.
- ☑ **D.4 — Execution-Model plan** false "gateway cache ✅ DONE" — corrected 2026-07-01
  (§5.1 + the tier table now distinguish DPE done vs cache wiring-done/store-pending).

---

## Deployment / integration-gated (NOT code gaps — turn-up only)

- ⏸ Voice live vendors (Deepgram/ElevenLabs/Cartesia/LiveKit/Twilio); MediaGuard GPU +
  real models + real-data eval calibration; physical EU/regional data plane; all
  `terraform apply`/`helm install`/`bootstrap-platform.sh`; billing enforcement flip
  (`cfg.Billing.Enforced`) + live Stripe config; Teams inline-tap bot (external Entra/
  Azure Bot — see `Actrone_Teams_Approvals.md`); OAuth in-product connect flows.

## Untracked product loose ends (needs its own triage)

- ☐ **`docs/enhancements.txt`** — control-tower env-switcher spacing/scroller, wider
  settings pages, in-CT billing/upgrade, "smart" loading page, strict RBAC-scoped EMAOP
  agent chat, expanded EMAOP integrations/templates, marketing copy + de-3D, color
  fixes, SDK-docs split. Triage into the tiers above in a follow-up pass.
