# Actrone Reliability Substrate — Plan 2: Build LATER (the category-definers)

> **Thesis:** These are the moves that turn Actrone's reliability *substrate* into a *category*. Each is
> uniquely possible **because** of the governance/durability substrate (and Plan 1's shadow-run + verifier) —
> which is exactly why they're moats no framework can copy. But each is bigger, riskier, or demand-gated, so
> they are **sequenced by a trigger condition, not a calendar**. Build them when the gate opens, not before.
>
> **Status:** Deliberately deferred. Depends on `Actrone_Reliability_Substrate_Plan_1_Now.md` shipping first.
> **Owner:** Matt · **Scope:** orchestrator backend + both SDKs + Control-Tower FE.
> **Grounded in the same 2026-07-18 audit** as Plan 1.

---

## 0. TL;DR — three phases, ordered by (built-ness × moat depth × trigger)

| Phase | Feature | How built already? | Trigger to start |
| --- | --- | --- | --- |
| **L1** | **Attested Autonomy** (product/audit feature, **NOT insurance**) | **~90% built** (`internal/assurance`, 2 signed ledgers, compliance) | Plan-1 verifier+chaos shipped **AND** an enterprise buyer asking for an exportable, signed assurance artifact |
| **L2** | **Governed Speculative Execution** | **~half** (child-workflows + SAGA + PendingStore exist; fork/reconcile new) | A proven **long-horizon / high-value** workload that justifies parallel inference cost |
| **L3** | **Compliance Time-Travel** (edit-and-continue + gated reveal) | **nearly all-new** (Temporal replay free; reset + gated detokenize new) | A **regulated design partner** (finance/health/legal) needs auditor replay |

**Why this order:** L1 is the deepest moat *and* the least engineering (the hard risk/coverage/ledger substrate is
already done, only one small signed-artifact wrapper remains), so it's the highest ROI category move. L2 reuses
Plan-1's shadow/pending machinery but costs real money per run, so it waits for a workload that pays for it. L3 is
almost entirely new and only matters to regulated buyers, so it waits for one.

> **Scope decision (2026-07-21, owner):** Actrone is **not** becoming or partnering with an insurer. The actual
> insurance machinery is **out of scope**: the external **underwriter seam (was L1.2)** and the **indicative
> premium + cross-tenant actuarial aggregate (was L1.3)** are **dropped**, because being an insurer is a separate
> business (capital, licensing, claims, actuarial, per-jurisdiction regulatory approval) with no bearing on the
> product. What remains is the already-built assurance substrate plus **one** cheap wrapper (**L1.1**), reframed as
> an **enterprise trust / audit / procurement feature, not an insurance product**. The word "insurance" (and
> "insured", "premium", "underwrite", "coverage" in the policy sense) is **retired from all customer-facing copy** —
> claiming insurance without an insurer is misleading and legally loaded. Honest vocabulary only: **attested
> autonomy, provable governance, audit-grade assurance, signed assurance attestation, assurance grade.**

---

## 1. Phase L1 — Attested Autonomy *(the deepest moat; start first when the gate opens)*

**The pitch no one else can make:** "This agent action is **provably governed and independently gradeable**, and
here is a signed attestation to prove it, verifiable with a public key alone." It turns governance from a cost
center into an exportable, auditable trust artifact. **This is Actrone's category-defining move**, and it needs
**no insurer**: the buyer's own risk, compliance, or audit function is the reader of the evidence. (An external
carrier could later underwrite off the same substrate, but that is a GTM motion for someone else, not a build for
Actrone. See the scope decision in section 0.)

### What already exists (audit: ~90% built, and all of it stands alone without an insurer)

- **`internal/assurance`** — a complete, deterministic, *explainable* risk + coverage engine: `risk.go`
  `Evaluate(RiskInputs) → RiskScore{Score 0-100, Band, AssuranceGrade A–F, Factors}` (every factor's point impact
  reported — "never a black box"); `coverage.go` `CoverageModel.Assess(ActionFacts) → AssuranceVerdict{Assured, Gaps}`
  (only reversible + simulated + provenance-complete writes are "assured"); `posture.go`, incident register
  (`pgincident.go`, migration `00095`), `service.go` `Posture`/`Export`/`Refinements`, `flywheel.go` (governance-
  correction flywheel).
- **Two tamper-evident ledgers** any third party can verify: the **HMAC-chained audit spine** (`audit/spine.go`,
  `VerifyChain`) and the **Ed25519-signed, hash-chained action ledger** (`gal/receipt.go`, asymmetric, so a
  customer's own auditor verifies with the public key alone; each receipt carries risk class, purpose, decision,
  simulated flag, diff/provenance hashes, reversibility + compensating action).
- **Compliance evidence + trust posture** (`internal/compliance` — sealed SHA-256 evidence packages), **DPA/BAA**
  automation (`internal/agreements`), GAL **provenance** attestations.

### The one remaining gap (the only thing to build)

`coverage.go:1-12` states it outright: *"a PRODUCT FEATURE … NOT insurance: there is deliberately no indemnity,
underwriter seam, or premium here."* The engine computes the grade, the coverage verdict, and the signed ledger
today. The single missing piece is a **portable, signed attestation** that binds those already-computed outputs to a
specific run/action in one verifiable artifact a buyer can export.

### What to build (just L1.1)

- **L1.1 — Portable assurance attestation.** Wrap the already-computed `assurance.Service.Export` +
  `CoverageModel.Assess` verdict (`assurance/service.go:126`, `coverage.go:68`) in an **Ed25519-signed attestation**
  ("run/action R met coverage model vN, grade A, reversible+simulated+provenance-complete, risk 12/100"), reusing the
  `gal/receipt.go` signing path. This is the artifact a customer hands to their own risk, compliance, or audit
  function, or shows a regulator. It needs no insurer: the reader is the buyer's own assurance function.
- **SDK:** the assurance read surfaces already exist (`getPosture`/`galLedger`/`reverseAction` in both SDKs); add
  `getAssuranceAttestation(runID)` + `verifyAttestation(pub)` (client-side Ed25519, mirroring the existing
  `verifyEd25519Signature`). TS + Python parity.
- **FE:** extend the existing `RiskPostureDashboard` + `CertificationPanel` (sealed evidence packages) +
  `AttestationPanel` (downloadable verifiable reports) with a **per-run assurance-attestation card**: grade, coverage
  verdict, and a downloadable signed attestation. No "insured up to $X" language, no monetary coverage claim. Rename
  the `types/assurance.ts` `Posture` comment away from "the insurable-autonomy substrate" to "the attested-autonomy
  substrate" for consistency.

### Out of scope (dropped 2026-07-21, owner decision, not deferred)

Not "build later", but **not building**. Both existed only to serve an actual insurer, which Actrone is not:

- **~~L1.2 — Underwriter seam.~~** An API exposing risk score + evidence to an **external carrier**. Dropped. If a
  carrier ever wants it, they can read the existing signed ledger and attestation directly, so there is nothing to
  pre-build.
- **~~L1.3 — Indicative premium + cross-tenant actuarial aggregate.~~** A premium calculator and an anonymised
  cross-tenant loss aggregate. Dropped. This is actuarial/insurance-business machinery (capital, licensing, claims)
  with no product value to Actrone, and the cross-tenant aggregate adds privacy surface for no benefit.

### When + why

**When:** after Plan 1's **verifier + chaos** ship, because the attestation's basis is *"the action was simulated,
verified by an independent judge, and proven to survive chaos before commit."* Without Plan 1, the attestation has
nothing rigorous to attest. **And** when an **enterprise buyer asks for an exportable, signed assurance artifact**
(procurement, audit, or their own risk review), which is what makes L1.1 worth the small build.
**Why:** it is the deepest, most defensible moat (no competitor has the deterministic risk substrate to grade and
sign an agent action) and now the least remaining engineering (one signed wrapper over already-computed outputs), so
the moment an enterprise trust conversation opens, it's the highest-leverage build.

---

## 2. Phase L2 — Governed Speculative Execution *(category-definer; gate on a workload that pays for it)*

**The move:** fork a hard, long-horizon task into N competing branches, run them **in the shadow** (no real side
effects), and **commit only the winner** — self-healing parallel exploration instead of a linear gamble. Speculative
branching that competitors *can't* do safely, because their branches would corrupt real state; Actrone's don't,
because a merge is a *governed commit*.

### What already exists (audit: ~half)
- **Temporal child-workflow spawning works** — `spawn_workflow.go:68`
  (`workflow.ExecuteChildWorkflow(ctx, AgentTaskWorkflow, childInput)`), registered in main; MACP crew fan-out
  (`macp/crew.go`, `ProcessParallel`).
- **SAGA / compensation is production-grade** — `internal/gal` (`DeriveCompensation`, `ReversalService`, sealed
  inverses, TTL auto-revert).
- **The non-committing substrate exists** — GAL `Preview`/`Simulate` (never commits) + the **deferred-commit
  `PendingStore`** (`gal/pgpending.go`) that already holds **sealed real args** for later commit. This is exactly
  what "run branches without committing, commit the winner later" needs — **and Plan 1 makes `Preview` a true shadow.**

### The gap
There is **no** mechanism to fork *one run's state* into N competing variants and pick a winner — `ProcessParallel`
runs *different cooperating* agents (all results kept), not variants racing. **No reconciliation/merge logic exists
anywhere** (confirmed by grep).

### What to build (cleanest extension — audit-identified)
- **L2.1 — Governing parent workflow.** A new `SpeculativeTaskWorkflow` that fans out N `AgentTaskWorkflow` children
  over the existing `ExecuteChildWorkflow` seam, each seeded with the same `AgentTaskInput` + a variant strategy,
  **all in shadow mode** (Plan-1 `Preview`-forces-simulate-only) so no branch commits.
- **L2.2 — Reconciliation / winner selection.** A `ReconciliationAgent` step (net-new) that scores branches on a
  verifiable milestone (reuse Plan-1's verifier + `eval.Gate`), selects the winner, and **commits only the winner's
  pending actions** via the existing `PendingStore` → GAL `Commit` path; the losers' pending actions **never fire**
  (and are cancelled, reusing `ReversalService.Cancel`).
- **L2.3 — Cost control.** Losing branches run on **cheap tiers** (Plan-1 Track A) so speculation is affordable;
  a hard branch-count + spend cap.
- **FE:** a **branch/speculative-tree visualization** — net-new (no DAG/tree lib today), built on the vertical
  activity-graph pattern already in `TraceViewer.tsx:166`, showing branches racing, the winner merging, losers
  discarded. Reuse `GovernanceSimulator` as the per-branch "what-if" host.

### When + why
**When:** after Plan 1 (it *is* the enabling substrate — true shadow runs + the pre-commit pass + `PendingStore`
orchestration), and gated on a **real long-horizon, high-value workload** (multi-hour pipelines, complex research/
migration) where the parallel-inference cost is justified by the value of not throwing away hours of work.
**Why:** it's a genuine category-definer (safe speculative execution), but it's *expensive* (N× inference) and complex
(reconciliation is net-new) — so it should follow a proven use case, not lead one.

---

## 3. Phase L3 — Compliance Time-Travel *(regulated-industry unlock; gate on a regulated design partner)*

**The move:** pause a run, rewind to step 42, **edit** the input/tool-result, and **re-execute forward** — and, for
auditors, replay any historical run with a **counterfactual** ("what would it have done under policy v2?") and PII
**revealed only to authorized eyes.** Turns agent engineering into a deterministic, testable state machine and turns
compliance into a replayable proof.

### What already exists (audit: nearly all-new, but the substrate is there)
- **Temporal is event-sourced replay for free**; the `/v1/tasks/{id}/activities` endpoint already reconstructs the
  step timeline from workflow history (`tasks.go:398`), rendered by the read-only `TaskReplayConsole` scrubber.
- **A working "Replay from here"** already exists — `TraceViewer.tsx:93-103` POSTs `/api/tasks/{id}/replay?from_activity=…`
  and reconnects. This is the seed for edit-and-continue.
- **A real counterfactual engine exists — but rules-only** — `dpe/replay.go` `ReplayRuleSet` backtests a *candidate
  rule set* over recorded eval contexts and lists every changed verdict.

### The gap
- **No `ResetWorkflowExecution`** anywhere (confirmed) — no true edit-a-past-step-and-continue.
- **MAL detokenize is unconditional and purged at task close** (`mal/tokeniser.go:78`, purge in `MALDetokenise`) —
  so there's (a) nothing to reveal later and (b) no `authorize(surface, role)` gate. An auditor-replay-with-gated-reveal
  is impossible today.
- The counterfactual is rules-only, not whole-task.

### What to build (cleanest extension — audit-identified)
- **L3.1 — Edit-and-continue.** A workflow-reset activity on Temporal's `ResetWorkflowExecution`, seeded from the
  timeline the `/activities` handler already reconstructs, with an injected/edited step input or tool-result —
  extending the existing "Replay from here" from re-run to **mutate-then-re-run**.
- **L3.2 — Authorized-surface detokenize.** Add a `authorize(surface, role)` predicate + swap the task-close purge
  for a **retained, policy-scoped token vault** (the `mal/vaultstore.go` substrate already exists) so a later
  auditor replay reveals real PII **only to authorized eyes** — everyone else sees tokens.
- **L3.3 — Whole-task counterfactual.** Extend `dpe/replay.go` from rules-only to a full "re-run this task under
  policy vN / model vN" over the recorded activity timeline.
- **SDK:** add `activities(taskID)` / `replayFrom(taskID, step, edits)` to **both** SDKs (neither wraps the replay
  endpoints today) + an authorized detokenize-for-audit call. Parity + contract tests.
- **FE:** upgrade `TaskReplayConsole` from read-only scrubber to **interactive edit-and-continue** (edit a step →
  re-run forward), add a counterfactual diff panel, and a gated-reveal toggle (visible only to authorized roles).
  Reuse `AuditLogBrowser` + `ReasoningTracePanel` for the auditor-facing view.

### When + why
**When:** gated on a **regulated design partner** (finance / health / legal) whose adoption is blocked by auditability
— it's a regulated-industry unlock, not a general feature, so build it for the customer that needs it (and will pay).
**Why:** regulated buyers can't adopt autonomous agents without exactly this (replayable proof + gated PII reveal),
and Actrone is uniquely positioned (Temporal event-sourcing + MAL + the signed ledger) — but it's almost entirely new
code and narrow in audience, so it should follow a concrete pull.

---

## 4. Cross-cutting: testing, sequencing, risks

### Testing (CLAUDE.md §7/§8)
- **L1:** signed-attestation round-trip (sign, then verify with the public key alone); coverage verdict correctness;
  attestation binds to the exact run/action it claims; tampering with any attested field fails verification.
- **L2 (real Temporal via Docker):** N branches fan out in shadow → **zero** real commits from losers; only the
  winner's `PendingStore` actions commit; losers' pending actions are cancelled; a branch/spend cap holds.
- **L3 (real Temporal):** `ResetWorkflowExecution` re-runs from step N with an edited input and produces a divergent
  timeline; a retained-vault replay reveals PII to an authorized role and **tokens** to an unauthorized one; the
  whole-task counterfactual lists changed outcomes.
- **Back-compat:** all three off-by-default + version-gated; existing runs byte-identical.

### The gating conditions, restated (the "when")
1. **L1 starts** when Plan 1's verifier+chaos are live **and** an enterprise buyer wants an exportable signed
   assurance artifact.
2. **L2 starts** when a paying long-horizon workload justifies parallel inference.
3. **L3 starts** when a regulated design partner's adoption is blocked on auditability.

Do **not** build any of these speculatively (ironic for L2) — each is a large, moat-grade investment whose value
depends on a real pull. The Plan-1 substrate is what makes them *cheap to start* when the pull arrives.

### Risks
| Risk | Mitigation |
| --- | --- |
| Attestation copy drifts back toward implying "insurance" | Vocabulary is locked to attested/provable/audit-grade (section 0); no "insured", "premium", "coverage limit", or "$X covered" ever ships; the artifact states governance facts, not indemnity |
| L2 parallel cost blows budgets | Losers on cheap tiers (Plan-1 A), hard branch + spend caps, shadow-only until a winner |
| L2 reconciliation merges a subtly-wrong branch | Winner must pass the independent verifier (Plan-1 B3), not just "reached a milestone" |
| L3 gated reveal leaks PII | Retained vault is policy-scoped + role-gated; reveal itself is a signed, audited action; default is tokens-for-everyone |
| Retaining tokens past task close expands the sensitive-data surface | Retention is opt-in per policy, TTL-bounded, Vault-backed, and audited — never the default |

### Execution-locus applicability (native · BYOF-hosted · BYOF-connected)

Same principle as Plan 1 §11 and [[execution-authoring-taxonomy]]: **action-boundary features work at every locus;
loop-orchestration (fork / replay / reset) needs Actrone to own the execution.**

- **L1 Attested Autonomy — all three loci.** The attestation covers **governed actions** (GAL receipts +
  the assurance risk score), which are enforced at the action boundary regardless of who ran the loop. Any run whose
  consequential actions passed through Actrone's governed-action layer can be attested. *Honest limit:* a
  BYOF-connected agent's pure-local compute that never hit the gateway is outside the attested envelope — you attest
  the governed actions, not the parts Actrone never saw.
- **L2 Governed Speculative Execution — native + BYOF-hosted only.** Forking N `AgentTaskWorkflow`/harness children
  and committing only the winner requires the loop to run as an Actrone-owned Temporal execution. **BYOF-connected is
  out** (the loop lives in the customer's process — Actrone can't fork a loop it doesn't run), exactly as scheduling
  deferred connected.
- **L3 Compliance Time-Travel — native + BYOF-hosted for loop replay; all loci for the action ledger.** Temporal
  replay + `ResetWorkflowExecution` edit-and-continue apply to Actrone-run executions (native + hosted). For
  BYOF-connected, only the **governed-action + audit ledger** is replayable/auditable (the actions, not the loop) —
  which is still the part regulators care about most.

### Definition of done (per phase, when built)
- **L1:** a run emits a **portable signed assurance attestation** verifiable by public key alone, binding the grade
  and coverage verdict to that run. No underwriter endpoint, no premium (both dropped, section 0).
- **L2:** a hard task forks N shadow branches, **only the winner commits**, losers never touch real state, cost is
  capped — proven against real Temporal.
- **L3:** an operator edits a past step and re-runs forward; an auditor replays a historical run with PII gated by
  role; a whole-task counterfactual runs under an alternate policy.

---

*Plan 2, the category-definers the Plan-1 substrate makes possible: attested autonomy (deepest moat, ~90% built, no
insurer), governed speculative execution (safe branching), and compliance time-travel (regulated unlock). Sequenced
by trigger, not calendar. Last updated: 2026-07-21 | Owner: Matt.*
