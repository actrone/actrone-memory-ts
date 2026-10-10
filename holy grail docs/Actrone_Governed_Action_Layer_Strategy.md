# Actrone — The Governed Action Layer (GAL): Strategy & Architecture

> **Status refreshed 2026-07-13 (code-verified):** the component map in §8 is accurate on *what's
> built*; add one load-bearing operational fact it doesn't state: **`cfg.EMAOP.Enabled` (the MAL/DPE/
> audit-spine pipeline this whole strategy assumes) defaults to `false`** (`config.go:1096`), same as
> `cfg.GAL.Enabled` (§8 already notes GAL itself is "OFF by default; read-only fallback"). The connector
> router (`connectortool.NewRouter`) nil-checks its MAL dependency (`connectortool/router.go:157`) and
> degrades gracefully rather than erroring, so reads/writes still function with EMAOP off — but MAL
> tokenisation/field classification is skipped in that mode, i.e. **a deployment needs both
> `EMAOP.Enabled=true` and `GAL.Enabled=true` (+ a vault-held signing key) before any of the governance
> mechanisms in this doc are live**, not just the GAL flag. Two audit observations — **re-checked and
> down-graded on 2026-07-13 review** (the first pass over-stated both as "governance holes"; on closer
> reading neither is one):
> 1. **Comment-vs-code mismatch (LOW), not a governance hole.** `AuditGovernance` is dispatched
>    fire-and-forget (`_ = workflow.ExecuteActivity(...)`). But it is **Activity 6 — a *post-output*
>    audit that runs AFTER `StreamLLMResponse` (Activity 4)** has already streamed the answer, so it
>    could not gate the response regardless of awaiting. The **actual pre-execution gating is DPE/MAL**
>    (before the model call). The only real issue is that `rules_engine.go`'s "sync for CRITICAL rules"
>    comment is misleading for a post-hoc audit; whether CRITICAL *output* rules are meant to block
>    pre-execution is worth confirming, but this is a comment/design-intent question, not a live
>    security gap. Do not read this as "governance is bypassed."
> 2. **A/B experiment router dormant — distillation serving is NOT broken (corrected).** The first pass
>    concluded "no promoted model is ever served"; that is wrong. `governance/ab_router.RouteModel` (the
>    *A/B-experiment* hook) does have no live callers, so A/B experiments are idle — but **distilled-model
>    serving flows through a different path, `service.ActivityService.RouteModel` + the distill resolver**
>    (see `activity_service.go:245,1539`), which DOES serve the promoted student. So distillation
>    train→eval→promote→serve works; only the separate A/B experiment router is dormant. See
>    `cost-leadership-implementation-plan.md`'s corrected refresh note.
> Also: `internal/dpe` Tier-1 (capability hard-block) and the confidence-based Tier-3 path have no
> callers outside tests — only Tier-2 (threshold rules) is genuinely wired into the live request path;
> capability hard-blocking is instead reimplemented ad hoc in `browser/tiers.go` (bypassing DPE for that
> one surface). None of this changes the §8 build-status table (the primitives are real, tested code) —
> it corrects the *operational* picture: built, but several links in the enforcement chain are either
> off by default or not actually consulted at runtime.
>
> Authoritative strategy + architecture doc for Actrone's core moat. Audience: founders,
> product, architecture, GTM. Last updated 2026-07-02. Every mechanism maps to a *built*
> primitive (MAL, DPE, Contract Registry, Tool-Call Supervisor, Temporal, sealed-evidence
> engine, marketplace, distillation flywheel) or a clearly-scoped new component. Honest about
> what is engineering vs BD/legal. Companion: `Actrone_Positioning_And_Competitive_Moats.md`.

---

## PART I — STRATEGY

### 1. The reframe: stop selling "connectors." Own the Governed Action Layer.

Every competitor in 2026 is racing the same race: **give agents more access** — more MCP servers,
more tools, more actions (Zapier, n8n, Vapi/Retell function-calling, LangChain tools, Merge/Finch
unified APIs). They are all optimizing *"can the agent do it?"*

That race hits a wall. As agents get more autonomous (2026→2030), the binding constraint stops
being **capability** and becomes: **"Can you prove what the agent did, that it was allowed, and
undo it if it was wrong?"** No CFO lets an autonomous agent touch the general ledger, no CHRO lets
one touch payroll, no bank lets one move money — at scale — without provable governance,
reversibility, and someone to sue.

**Nobody owns that layer.** Everyone has logs; nobody has proofs. Everyone can call a write; nobody
can *un-*call it. The connector layer isn't integrations — it's the **Governed Action Layer (GAL)**:
the platform where autonomous agents act on enterprise systems with the same provability,
reversibility, and accountability as a human with audited credentials.

**Why it's credible, not vaporware:** we already have every primitive; nobody else has the
combination. The moat is *composing* them.

### 2. The six novel mechanisms

| # | Mechanism | Why nobody has it | Reuses |
| --- | --- | --- | --- |
| 1 | **Field-level data-flow provenance** — every value carries a cryptographic tag (source connector, classification, which fields fed which output); task-end **data-flow attestation** ("this refund used order-total + status; never saw the SSN") | No one has per-field provenance through an autonomous loop; exactly what EU AI Act / GDPR Art. 22 demand. Turns "trust me" into a Merkle proof | MAL tokens → make them provenance-carrying |
| 2 | **Purpose-bound access** — a field is tagged with allowed *purposes*; an agent whose task purpose doesn't match is **blocked, not tokenized** ("salary readable only by payroll-purpose tasks") | Merge normalizes schemas; nobody purpose-binds at the agent-action level | DPE + manifest (gate by capability) → extend to purpose × classification |
| 3 | **Simulate-then-commit writes** — every write is simulated (shadow/sandbox or predicted-effect), producing the exact **diff**, then commit is policy-gated (auto within bounds / human approval / DPE Tier-1 block) | Nobody does transactional preview for AI-agent writes; flips an enterprise from "no autonomous writes ever" to "yes" | Tool-Call Supervisor + DPE + connector adapter |
| 4 | **Compensating-action rollback (SAGA) + TTL writes** — every write registers its inverse; "undo everything agent X did in the last hour" is one op; optional auto-revert after N hours | Nobody offers provable reversibility of agent actions; reversibility is what makes it insurable | Temporal is a saga engine |
| 5 | **Signed action receipts on an immutable ledger** — every action emits a tamper-evident receipt (what·who·why·policy-version·classifications·provenance-hash), append-only, Merkle-anchored | Everyone has logs; nobody has cryptographic proofs of every agentic action | Sealed-evidence certification engine (already sha256-seals evidence packages) |
| 6 | **Governance-aware, self-describing connectors** — connecting Workday auto-classifies every field (MAL), infers least-privilege scopes, proposes a policy, continuously attests compliance + detects drift; the connector also **advertises its real action menu to the agent** so the model calls valid actions first-time | Merge normalizes; nobody auto-derives *governance* from schema, nor a governed action menu | MAL classifier + Contract Registry drift engine; ✅ *shipped 2026-07-03: preset connectors advertise their read-action enum in the tool schema (`connectortool.Router.Advertise`)* |

### 3. The business-model moat: **insurable autonomy** (built as a substrate, not a license)

Mechanisms 1–5 produce what no one else can: **provable governance + provable reversibility of
every agent action** — the exact substrate an insurer needs to underwrite AI-agent errors &
omissions. Today enterprises self-insure agent risk (i.e., they don't deploy autonomy at scale).

**The stance (decided): Actrone builds the substrate, not the regulated product.** We are the risk
engine + evidence ledger — the "Verisk / telematics for agent actions" — that a licensed carrier,
a captive, or the customer's own risk program plugs into. This keeps us out of insurance
regulation while capturing the moat. See Part III for the full **Assurance Layer** design.

The moat compounds: every governed action feeds the loss/actuarial dataset → better risk pricing
than any new entrant can bootstrap without the ledger + the volume. Zapier/Vapi/Merge can't touch
it — they can't *prove* governance or *undo* actions.

### 4. Network / data moats layered on top

- **Governed capability marketplace.** Not connectors — pre-certified, pre-classified, policy-bound,
  compliance-attested **capability packs** ("Governed Workday Payroll Pack": fields classified,
  purposes bound, writes approval-gated, SOC 2-attested). Publishers earn (Stripe Connect, T3.17b);
  buyers get *instant governed action*, not raw API access. Two-sided network effect.
- **Cross-org governed action fabric.** Extend A2A/MACP from agent↔agent to agent↔*system across
  orgs*: an agent in org A requests a governed action in org B's system, with cross-org policy
  negotiation + mutual signed receipts. The "Visa network for agent actions."
- **Governance-correction flywheel on actions.** Every blocked/corrected action trains a per-connector,
  per-org policy model → the platform pre-empts violations. Ties to the existing distillation moat.

### 5. Why it's defensible (not a weekend for a competitor)

It requires the full stack to already interlock: field-level classification **inside** the agent
loop, **hard** manifest enforcement, **durable** orchestration for saga rollback, an **immutable
evidence** engine, then the **actuarial + marketplace** network effects that only accrue with time.
A pure-integration player (Merge/Zapier) has none of the governance; a voice/agent player
(Vapi/Retell) none of the data-governance or durability; an iPaaS (Workato/MuleSoft) none of the
AI-agent-native trust plane. **The intersection is empty, and it's where we already live.**

### 6. Honest — what's hard

- **Simulate-then-commit** needs shadow/sandbox endpoints (some vendors offer; many don't) or a
  predicted-effect model — real engineering, per-connector maturity varies.
- **Compensating actions** need an inverse per write-action — some enterprise ops are genuinely
  one-way; those get flagged **"irreversible → mandatory approval"** (a first-class outcome, not a
  bug).
- **Insurance** needs a licensed underwriting partner for actual indemnity — a BD/legal motion. But
  the technical substrate (provable governance + reversibility + risk ledger) is ours to build and
  is the hard part nobody else can. (Part III makes indemnity optional, not required.)

---

## PART II — ARCHITECTURE

### 7. The GAL execution flow (one governed write)

```
agent turn → tool call "connector/{id}:write:{action}" with args
  1. Supervisor authorize (allowed_tools · rate · spend · injection/SSRF)      [built]
  2. Purpose check: task.purpose ⊇ action.required_purposes else BLOCK        [mech 2 — new]
  3. Detokenise-on-egress: MAL tokens in args → real values (audited)          [extend MAL — new]
  4. SIMULATE: shadow/sandbox or predicted-effect → DIFF                        [mech 3 — new]
  5. Commit policy gate: within bounds ⇒ auto · else human approval · else DPE [DPE — extend]
  6. COMMIT via connector adapter (write action)                               [extend Fetch — new]
  7. Register COMPENSATING action (inverse) + optional TTL                      [mech 4 — new]
  8. Emit SIGNED RECEIPT to the action ledger (provenance hash, classifications)[mech 5 — new]
  9. Risk engine updates exposure/score; result (tokenised) back to the loop    [Part III — new]
```

Reads (already shipped) are steps 1 + 3(reverse: tokenise-on-ingress) + 8. Writes add 2, 4–7, 9.

### 8. Component map (built vs new)

| GAL component | Status | Built primitive it extends |
| --- | --- | --- |
| Governed tool plane (connector as tool) | ✅ built | Tool-Call Supervisor + `connectortool.Router` + MAL tokenise |
| Field classification + tokenisation | ✅ built | MAL (`Tokenise`/`Detokenise`, PII floor) |
| Capability hard-enforcement | ✅ built | Manifest + DPE |
| Schema drift / rug-pull | ✅ built | Contract Registry |
| Sealed evidence packages | ✅ built | Certification/evidence engine |
| Durable + retryable execution | ✅ built | Temporal |
| Provenance-carrying tokens (mech 1) | ✅ Phase 1 built + wired | `provenance.Graph` + `Attestation` ("used order-total; never saw the SSN") over a durable per-task store (`provenance.PgStore`, migration `00092`, token→path index); connector reads ingest token→path, the governed write resolves its arg tokens → used sensitive fields → `Attestation.Hash()` on the receipt (`gal.Service.WithProvenance`) |
| Purpose-bound access (mech 2) | ✅ Phase 1 built + wired | `provenance.PurposePolicy.CheckField`/`FilterFields` (fail-closed, most-specific binding wins) wired into the connector READ path — a purpose-mismatched field is dropped BEFORE tokenisation; `domain.GovernanceSpec.Purpose` threaded via `tool.WithPurpose` from the tool activity; per-tenant `purpose_policy` (migration `00093`) + `PgPurposePolicyResolver` |
| MCP/memory result governance (mech 1–2 on the 2nd ingress) | ✅ Phase 1b built + wired (opt-in, **full parity**) | opt-in `GovernanceSpec.MCPResultGovernance` → `internal/mcpgov.Governor`, **fail-closed**. **Structured tier** (JSON): field-classify every leaf, purpose-gate (withhold purpose-blocked fields), tokenise sensitive leaves IN PLACE preserving shape, text-tokenise public strings for embedded PII, provenance with real paths. **Text tier**: free-text tokenise for non-JSON. Reuses the connector path's MAL service + provenance store + purpose resolver; wired via `Supervisor.WithMCPGovernor` + `main.go` |
| Detokenise-on-egress (writes) | ✅ Phase 0 core | `gal.DetokeniseArgs` — MAL reverse at the write boundary, fail-closed, revealed-set → provenance hash |
| Simulate-then-commit (mech 3) | ✅ Phase 0 core (+ vendor sandbox) | `gal.Evaluate` commit gate (coverage-as-governance) + `gal.ComputeDiff` + `connectortool.GALCommitter` simulate over `connector.WriteAdapter.Invoke`. Three real strategies: **`dry_run` vendor server-side sandbox** (`connector.DryRunAdapter`, universal: `dry_run_param` query flag `dryRun=All`/`validateOnly=true`/`DryRun=true`, or `dry_run_header` `Prefer: handling=strict`, or a separate `dry_run_path`; vendor validates without persisting → vendor-verified diff, degrades to read-back/approval), `read_back` (pre-image diff), `predicted`/`none` (unverified → approval) |
| Compensating actions + TTL (mech 4) | ✅ Phase 0 derive + Phase 2 FIRE | `gal.DeriveCompensation` (pure) → durable `gal.PgCompensationStore` (migration `00094`) registered on commit; `gal.ReversalService` fires the inverse → signed `reversed` receipt (`Reverse` one · `ReverseAgentActions` one-op LIFO "undo everything agent X did" · `Cancel` confirm-good); `gal.Sweeper` TTL auto-revert (leader-guarded) |
| Action ledger + signed receipts (mech 5) | ✅ Phase 0 built + wired | `gal.Receipt` Ed25519-signed + SHA-256 hash-chained (`VerifyReceiptChain`) + durable `gal.PgReceiptSink` (migration `00089`, linear-chain unique index, `ErrChainConflict` retry) |
| Write routing into the agent loop | ✅ Phase 0 wired | `connectortool.Router` routes declared WRITE actions through `gal.Service` (config-gated `cfg.GAL.Enabled` + vault Ed25519 seed; OFF by default; read-only fallback) |
| Approval flow (deferred commit) | ✅ Phase 0 wired | `require_approval` → vault-sealed `PendingAction` (migration `00091`); `gal.ApprovalService.Approve` rebuilds the committer + commits + signed approver receipt; `Deny` blocks; HTTP `/v1/gal/actions{,/{id}/approve,/deny}` + `/v1/gal/ledger` (agent_admin) |
| Per-connector action authoring + coverage model | ✅ Phase 0 wired | GAL metadata on `connector.EndpointAction` + `AuthoredWriteSpecResolver`; per-tenant `gal_commit_policy` (migration `00090`) + fail-safe `PgPolicyResolver` |
| Compensating action FIRING (saga + TTL) | 🔨 Phase 2 | derivation is Phase 0 (`DeriveCompensation`); durable firing/auto-revert = Temporal saga |
| Self-describing governed connectors (mech 6) | ✅ Phase 4 built | `internal/connectorgov`: `DeriveGovernance` (auto-classify → proposed schema + suggested purpose-bindings + scopes) + `Attest` (classification-drift + sensitivity escalation) + `Service` (Describe/Accept/Attest); real `connector.PgContractStore` (migration `00096`, closes the nil-store gap); `GET/POST /v1/connectors/{id}/self-describe + /attestation`. Read-action advertise shipped earlier |
| **Assurance layer** (Part III) | ✅ Phase 3 core built (feature, no indemnity) | `internal/assurance`: deterministic explainable Risk Engine + Coverage Model + Posture + Incident Register (migration `00095`) + Risk Export; `GET/POST /v1/assurance/*`. Underwriter seam + premium calc intentionally omitted |

### 9. The Action Ledger (the substrate everything else reads)

Append-only, per-tenant hash-chained (Merkle-anchored). One receipt per governed action:

```
action_id · tenant · agent · task · connector_id · action_kind (read|write|money|irreversible)
policy_version · purpose · data_classifications_touched[] · provenance_hash
reversibility { reversible: bool · compensating_action_id? · ttl? · irreversible_reason? }
simulation { simulated: bool · diff_hash? }
outcome (ok|blocked|reversed|failed) · approver? · timestamp · signature (Ed25519)
prev_receipt_hash            # hash chain → tamper-evidence
```

This is the single source both auditors and the risk engine read. Signing reuses the platform's
Ed25519 (A2A/gatewaytrust) + the sealed-evidence packager.

---

## PART III — THE ASSURANCE LAYER (insurance, built as a system capability, not a license)

### 10. The principle

**Actrone provides *Assurance*, not *Insurance*.** Assurance = a production-grade technical
capability: provable governance + reversibility + a deterministic risk engine + the actuarial
dataset. **Indemnity** (the legal promise to pay a claim) is provided by a licensed third party — a
carrier/MGA, the customer's captive, or their existing cyber/E&O program — that plugs into our
substrate. Terminology matters everywhere in product/marketing: **"Assurance," "Agent Risk Engine,"
"Action Assurance"** — never "we insure you" unless via a named licensed partner. This keeps
Actrone entirely outside insurance regulation while owning the moat and the data flywheel.

Analogy: a telematics company gives insurers the driving data that lets them underwrite usage-based
auto insurance — without being an insurer. Actrone is that for agent actions.

### 11. The elegant unification: **coverage-as-governance**

The Assurance layer is not a financial wrapper bolted on top — it is **the same governance engine,
viewed as risk.** A *coverage model* is policy-as-data, and its conditions feed the DPE:

- "Money-movement > $10k is *uncovered* unless human-approved" ⇒ the DPE enforces that as a commit
  gate (step 5). An out-of-coverage action is *blocked or escalated*, not silently risked.
- "Only *reversible* writes are covered" ⇒ an irreversible write requires explicit approval.
- "Covered only when provenance is complete + purpose-bound" ⇒ incomplete-governance actions are
  refused or flagged.

So **coverage conditions become governance rules**, and every governed action is automatically an
*insurable* action. This is the thing no competitor can replicate — because they have no governance
engine to attach coverage to.

### 12. Components (all buildable prod-grade, no license required)

1. **Action Ledger** (§9) — the signed, hash-chained record. *The product.*
2. **Risk Engine** — **deterministic, explainable** scoring (not a black box, so it's auditable +
   regulator-friendly). Inputs: provenance completeness · reversibility coverage · purpose
   compliance · policy-compliance rate · drift events · correction rate · action risk-class · historical
   incident rate. Output: a risk score + coverage recommendation per action-class / agent / tenant.
   (An ML arm — the governance-correction flywheel — can *refine* it later; the base stays explainable.)
3. **Coverage Model** — policy-as-data: covered action classes, per-action + aggregate limits,
   conditions (reversible-only, approval thresholds, purpose requirements). Conditions compile into
   DPE gates (§11). Versioned; every receipt records the coverage_version in force.
4. **Incident / Claim Register** — a governed action that caused harm (detected via outcome, a
   reversal, or a reported claim) → links to its receipt → computes exposure → feeds the actuarial set.
5. **Actuarial Export** — aggregate loss events + action volumes + risk distributions, tenant-scoped
   + platform-anonymised. The dataset a partner underwriter prices from. **The flywheel.**
6. **Underwriter Seam (BYO-insurer / partner API)** — Actrone exposes risk score + coverage posture
   + evidence attestations to an external underwriter/captive via API; *they* issue the legal policy.
   Also supports "attach to your existing cyber/E&O program."
7. **Indicative Premium Calculator** *(optional)* — a transparent premium *estimate* from the risk
   model, clearly labelled **"indicative, not a binding quote."** Binding quotes come only from the
   underwriter seam. (Avoids offering a regulated financial product.)

### 13. Monetisation paths — none require an insurance license

- **Assurance tier (pure tech, now):** sell the risk engine + reversibility guarantees + signed
  evidence + audit exports as a premium platform tier. Enterprises pay for *provable, reversible
  autonomy* even with no policy attached. **This is the immediately-monetisable slice.**
- **Partner referral / take-rate (BD):** integrate a carrier/MGA via the underwriter seam; take a
  referral fee or revenue share on policies written on Actrone data.
- **Marketplace of certified capability packs:** governed, attested packs carry lower risk scores →
  cheaper coverage → a reason to buy governed packs over raw connectors. Publishers earn.
- **(Later, optional, heavy) MGA / captive:** only if the volume + actuarial data justify partnering
  as a managing general agent with a licensed carrier. Never on the critical path.

### 14. Legal / compliance posture (encode everywhere)

- Product + marketing say **"Assurance,"** describe the *technical* guarantees (governance,
  reversibility, evidence, risk scoring), and attribute any *indemnity* to a named licensed partner.
- The indicative premium is labelled non-binding; no risk is *accepted* by Actrone.
- The actuarial export is privacy-governed (tenant data isolated; platform aggregates anonymised) —
  reuse the residency + DSR + MAL layers.
- Get counsel sign-off before any customer-facing "insur*" wording; default to "Assurance" until then.

---

## PART IV — PHASED BUILD PATH

Each phase ships standalone value; together they are the category. The read/write question from the
connector work is **Phase 0 of this moat**, not a caveat.

- **Phase 0 — Governed writes, done right.** simulate → diff → policy-gate → commit → register the
  compensating action → detokenise-on-egress → emit a signed receipt. Build the write path *as* the
  GAL primitive (mechanisms 3–5 minimal), not a plain POST. *(Highest leverage; do first.)*
  **✅ CORE BUILT + TESTED 2026-07-03** — `internal/gal` (pure, fail-closed, table-tested): the
  action model (`WriteActionSpec`: risk-class read/write/money/irreversible · reversibility ·
  sim-strategy · money amount field · TTL), `ComputeDiff`, the explainable commit `Evaluate` gate
  (coverage-as-governance: irreversible/unverified → approval, over-hard-limit → block,
  within-bounds → auto), `DetokeniseArgs` (MAL reverse at egress, fail-closed, revealed-set →
  `ProvenanceHash`), `DeriveCompensation` (inverse invocation + TTL), the Ed25519-signed +
  SHA-256 hash-chained `Receipt` (`VerifyReceiptChain`), and `Service.ExecuteWrite` composing all
  of it fail-closed over injected seams. Executable edge: `connector.WriteAdapter.Invoke`
  (SSRF-guarded real HTTP write, httptest-covered) + `connectortool.GALCommitter` (read-back /
  predicted simulate + commit). **WIRING SHIPPED same pass:** durable `gal.PgReceiptSink` +
  migration `00089_action_ledger` (append-only, linear-chain unique index, `ErrChainConflict`
  retry); the write-tool routing in `connectortool.Router` (declared WRITE actions → `gal.Service`,
  governed writes advertised in the tool schema, governed OUTCOME returned to the model, fail-closed
  when GAL off); `gal.PolicyResolver` + safe `DefaultCommitPolicy` + `DefaultWriteSpecResolver`;
  main.go construction behind `cfg.GAL.Enabled` + a vault-held Ed25519 seed (`SigningKeyFromSeed`,
  fail-closed), OFF by default. **PHASE 0 COMPLETED (final slices):** deferred-commit **approval flow**
  (vault-sealed `PendingAction` migration `00091` + `ApprovalService.Approve`/`Deny` + `CommitterFactory`
  rebuild + HTTP `/v1/gal/actions{,/{id}/approve,/deny}` + `/v1/gal/ledger`, agent_admin-gated);
  per-connector **authoring** (`EndpointAction` GAL metadata + `AuthoredWriteSpecResolver`); per-tenant
  **coverage model** (migration `00090` + fail-safe `PgPolicyResolver`); all main-wired behind the same
  gate. **Only Phase 2 + deploy remain:** compensating-action *firing* (durable Temporal saga + TTL
  auto-revert — a distinct phase); live apply of `00089`/`00090`/`00091` + testcontainer pg-store tests.
- **Phase 1 — Provenance + purpose-binding** (mechanisms 1–2) on read/write flows — extend MAL tokens
  + field→purpose tags + DPE purpose gate. **✅ CORE BUILT + TESTED 2026-07-03** — new
  `internal/provenance` (pure, dependency-free, table-tested): **mech 2 purpose-binding** —
  `PurposePolicy.CheckField`/`FilterFields` (fail-closed: most-specific field-glob/classification
  binding wins; a task with no declared purpose can't read purpose-bound data; opt-in per field or a
  strict `DefaultDeny` posture) is **wired into the connector READ path** — a field the task's purpose
  may not read is **dropped before MAL tokenisation** (blocked, not tokenised — the model never learns
  a value existed), via `domain.GovernanceSpec.Purpose` + `tool.WithPurpose` + the
  `connectortool.PurposePolicyResolver` seam (no-op unless a tenant authors a policy; tested
  block/allow/unchanged end-to-end). **mech 1 provenance** — `provenance.Graph` (per-task field nodes:
  path · source connector · classification · purposes) + `Attestation` (the negative proof — "used
  order-total + status; **never saw** the SSN" = untouched SENSITIVE fields — + deterministic hash for
  the receipt) built + tested. **✅ PHASE 1 COMPLETED 2026-07-03 (durable + wired):** `provenance.PgStore`
  (migration `00092_provenance_field`, per-task token→path index, `Ingest`/`LoadGraph`/`ResolveTokens`/
  `Purge`) so the graph survives across tool-call activities; the connector read path ingests each
  classified field with its MAL token; `DetokeniseArgs` now returns the arg tokens, and the GAL write
  resolves them → the used sensitive fields → `provenance.StoreAttestor` → the real `Attestation.Hash()`
  on the receipt (replacing the Phase-0 revealed-fields placeholder), via `gal.Service.WithProvenance`.
  Purpose (mech 2) is threaded from `AgentFile.Spec.Governance.Purpose` through the tool activity
  (`tool.WithPurpose`) and enforced by the `purpose_policy` table (migration `00093`) +
  `PgPurposePolicyResolver`. Both wired in `main.go`, no-ops until a tenant authors policy. Integration
  tests (DSN-gated) cover ingest/resolve/attest + context isolation. **Provenance purged on task close**
  — `ActivityService.MALDetokenise` (the final-output step) drops the task's provenance rows once every
  governed-write receipt has attested (best-effort, `SetProvenancePurger`), so rows don't accumulate.
  **Phase 1 is complete for the structured enterprise-connector ingress** (where regulated data enters —
  HRIS/ERP). The parallel **MCP/memory** ingress is captured as its own deliberate, opt-in build below
  (**Phase 1b**) — a distinct workstream, not a Phase-1 loose end.

- **Phase 1b — MCP / memory result governance (opt-in). ✅ CORE BUILT + TESTED 2026-07-03.** Extends
  mechanisms 1–2 to the second data ingress. **What shipped:** `domain.GovernanceSpec.MCPResultGovernance`
  (per-agent, off by default) + new `internal/mcpgov.Governor` (`TokeniseText` the MCP result in place,
  preserving JSON; **fail-closed** — a tokenise error refuses the result rather than leaking raw; records
  the minted tokens as `mcp:{server}/{tool}` provenance so governed writes attest over MCP-sourced data)
  + `tool.Supervisor.WithMCPGovernor` gating the MCP case on the agent flag + `main.go` wiring (reuses the
  MAL service + the shared provenance store). Table-tested (tokenise+provenance, fail-closed, no-context
  passthrough, empty result, prefix→classification). **STRUCTURED TIER ALSO SHIPPED 2026-07-03 (full
  mechanism 1–2 parity):** for a JSON result the governor now field-classifies every leaf via the MAL
  classifier (catching e.g. a `salary` number a text pattern misses), **purpose-gates** each field (a
  blocked field is WITHHELD — map key omitted / array element nulled — so the model never learns it
  existed), **tokenises sensitive leaves in place preserving JSON shape + types**, **text-tokenises
  public strings** for embedded PII, and records **provenance with real field paths**; non-JSON falls
  back to the text tier; fail-closed throughout. Reuses the connector path's `purpose_policy` resolver
  (`WithPurpose`), so one authored policy governs BOTH connector and MCP ingress. **MCP data now has the
  same MAL boundary as enterprise connectors.** **The original gap (verified in `tool/supervisor.go`):** connector tool
  results are MAL-tokenised before the model sees them, but **MCP tool results (and mid-loop
  memory-tool results) reach the model RAW** — they go straight through `mcpRegistry.Execute`, never
  MAL-classified/tokenised. For a governance-native platform this is a real hole (a HubSpot/Salesforce
  MCP returning customer PII, a Notion MCP returning a secret) — but blanket-tokenising all MCP output
  would break tool semantics (an agent must often reason over the record it just fetched), so it is a
  **deliberate, opt-in capability**, OFF by default (today's behaviour preserved).
  - **Opt-in surface:** `domain.GovernanceSpec.MCPResultGovernance` (per-agent; optionally refined to a
    per-MCP-server allow/deny so a tenant can govern the CRM server but not the docs server).
  - **Core (pragmatic tier):** route the MCP tool result through MAL `TokeniseText` in the supervisor's
    MCP case (post-`mcpRegistry.Execute`, gated by the flag) — pattern-detectable PII (SSN/email/card/…)
    is tokenised **in place**, preserving the result's JSON structure, detokenised with the task's final
    output like everything else. **Fail-closed:** if governance is on and tokenisation errors, the tool
    result is refused (surfaced as a tool error), never returned raw.
  - **Provenance (mech 1 parity):** ingest the minted tokens into `provenance.Store` with source
    `mcp:{server}/{tool}`, so a later governed WRITE can attest over MCP-sourced sensitive data too
    (the "never saw" proof extends across both ingresses).
  - **Structured tier (deeper, later):** flatten + field-classify the MCP result (like the connector
    path) to get path→classification, enabling **purpose-binding** on MCP fields — needed only for
    tenants that want full connector-parity purpose control on MCP data.
  - **Reuse + sequencing:** reuses Phase 1's `mal` classifier/tokeniser + `provenance.Store` +
    `PurposePolicy`; a new small `internal/mcpgov.Governor` + a `Supervisor` setter + the agent flag +
    main wiring. Small-to-medium; do after Phase 1, independent of the Phase 2 saga.
  - **Also brings mid-loop memory-tool results** (the `actrone-memory` MCP) under the same boundary via
    the same path (memory retrieved as *task-start context* already rides input tokenisation; this
    closes the *tool-call* path).
- **Phase 2 — Rollback + Action Ledger** (mechanisms 4–5 full) — Temporal saga + evidence engine
  pointed at actions + the hash-chained ledger. **✅ BUILT + TESTED 2026-07-03.** (Mechanism 5, the
  signed hash-chained ledger, already shipped in Phase 0, so Phase 2 = mechanism 4 in full: FIRING the
  inverse.) **What shipped:** a committed reversible write now REGISTERS its fireable inverse (sealed
  args) in the durable `gal.PgCompensationStore` (migration `00094_gal_compensation`) via
  `Service.WithCompensationRegistry`; `gal.ReversalService` executes it — `Reverse` (one action:
  rebuild committer → invoke inverse → append a signed **`reversed`** receipt naming the original
  action_id via the new `Receipt.Reverses`, mark fired), `ReverseAgentActions` (the one-op **"undo
  everything agent X did in the last hour"**, LIFO over the still-revertable set, partial-failure
  tolerant), and `Cancel` (confirm an action good so its inverse — incl. TTL — never fires). **TTL
  auto-revert** = `gal.Sweeper` (periodic, leader-guarded via the billing Redis tick-guard so no
  double-rollback) fires the inverse of any compensation whose deadline elapsed unconfirmed. HTTP
  `POST /v1/gal/actions/{id}/{reverse,confirm}` + `POST /v1/gal/agents/{agentId}/reverse?since=1h`
  (agent_admin). Wired in `main.go` behind the same `cfg.GAL.Enabled` gate. Table-tested (fire +
  reversed-receipt + mark-fired + double-reverse-refused, failed-inverse → failed receipt, one-op LIFO
  scoped-to-agent, cancel, register-on-commit, TTL sweep due-only) + DSN-gated pg integration test.
- **Phase 3 — Assurance Layer core** — Risk Engine + Coverage Model (coverage-as-governance) +
  Incident Register + Actuarial Export. *Pure tech, monetisable as the Assurance tier.* **✅ BUILT +
  TESTED 2026-07-03 (as a governance FEATURE — no insurance/indemnity/underwriter-seam/premium, per
  decision: build the real substrate orgs pay for, not a regulated product).** New `internal/assurance`
  (pure-first, deterministic, explainable): **Risk Engine** (`Evaluate(RiskInputs) → RiskScore` — a
  0–100 risk score + band + A–F grade + a sorted, explainable factor breakdown from reversibility/
  provenance/simulation coverage gaps, money/irreversible exposure, failure/reversal rates, open
  incidents, drift; corrections *reduce* risk; never a black box); **Coverage Model** (policy-as-data
  `CoverageModel.Assess(ActionFacts) → AssuranceVerdict{assured, gaps}` — the criteria a "fully
  assured" action meets); **Assurance Posture** (`BuildPosture` — the per-agent/tenant report:
  assured% · reversible% · provenance% · open incidents · risk score, over the signed action ledger);
  **Incident Register** (`Incident` + severity/status + exposure, migration `00095_assurance_incident`,
  `PgIncidentStore`, linked to a ledger receipt — technical harm-tracking, NOT insurance claims);
  **Risk Export** (tenant-scoped posture + aggregate exposure). `LedgerStatsRepository` aggregates the
  `action_ledger` via SQL FILTER counts; `Service` composes posture/incidents/export; HTTP
  `GET /v1/assurance/{posture,agents/{id}/posture,export,incidents}` + `POST .../incidents[/{id}/status]`
  (report/list = members, resolve/dismiss = agent_admin); wired in `main.go` (read-only feature over
  the ledger, independent of the write-path gate). Table-tested (coverage matrix, risk engine
  low/high/baseline/corrections, posture, service posture+incidents+export+status) + DSN-gated pg
  integration (incident lifecycle + ledger-stats aggregation). **The Assurance *tier* / Underwriter
  Seam / Indicative Premium (Part III §12.6–7, §13) are deliberately NOT built** — the technical
  substrate is the feature; any indemnity would be a separate BD motion.
- **Phase 4 — Self-describing governed connectors** (mechanism 6) — auto-classify + auto-policy +
  continuous attestation. **✅ BUILT + TESTED 2026-07-03.** New `internal/connectorgov` (pure-first):
  **`DeriveGovernance`** — samples a connected system, MAL-classifies every field, and auto-derives a
  **proposed governance policy** (field schema + per-sensitive-class **suggested purpose-bindings**
  [`provenance.FieldPurposeBinding`, advisory] + declared scopes + a risk summary) the admin reviews;
  **`Attest`** — compares a fresh sample to the approved baseline and surfaces added/removed fields
  AND **classification drift**, including **sensitivity ESCALATIONS** (a field now returning more-
  sensitive data than when approved — the rug-pull the existing name-hash drift check misses). The
  `connectorgov.Service` wires it to a live connector: `Describe` (preview), `Accept` (pin the sampled
  schema as the baseline), `Attest` (drift verdict). Backed by a real **`connector.PgContractStore`**
  (migration `00096_connector_contract`) — which also **closes the pre-existing gap** that the Contract
  Registry had no store wired (it was constructed with `nil`). HTTP `GET /v1/connectors/{id}/self-describe`
  + `/attestation` (members) + `POST .../self-describe/accept` (agent_admin). Table-tested (derive
  counts/bindings/summary; attest compliant/new-field/escalation/de-escalation) + service tests
  (httptest adapter: describe classifies a sample, accept→attest compliant, attest detects a new field,
  no-baseline errors) + DSN-gated pg contract-store integration. The read-action **advertisement** half
  of mech 6 shipped earlier (`connectortool.Router.Advertise` enum).
- **Phase 5 — Network moats** — governed capability marketplace + cross-org action fabric +
  underwriter seam (partner indemnity) + governance-correction flywheel on actions. **✅ 3 of 3 BUILT +
  TESTED 2026-07-03; underwriter seam intentionally omitted (no indemnity).** **(a) Governed capability marketplace** — `internal/capabilitypack`: a
  `CapabilityPack` is a **signed, versioned governance bundle** for a connector (composes every prior
  phase: field classifications [P4] + purpose-bindings [P1] + write-action risk/reversibility specs
  [P0] + coverage model [P3] + compliance attestations), with a deterministic content hash +
  **Ed25519 sign/verify** (a buyer proves the governance is tamper-free offline). `Service`
  publish→verify→list→**PlanInstall** (preview)→**Install** (pins the classifications as the connector
  contract, records the install). Durable `Store` (migration `00097_capability_pack` + installs). HTTP
  `GET /v1/capability-packs[/{id}[/plan]]` (members) + `POST .../capability-packs[/{id}/install]`
  (agent_admin). Installing a pack = **instant governed action** on a system instead of hand-authoring.
  **(b) Governance-correction flywheel** — `assurance.AnalyzeRefinements` reads per-(connector, action)
  ledger + incident signals and proposes **explainable governance TIGHTENINGS** (require_approval on an
  action that caused an incident / was repeatedly reversed / keeps failing — with reason + confidence,
  sorted; only ever proposes *more* governance, never loosening; a human accepts). `LedgerStatsRepository.
  ActionSignals` (ledger group-by + incident join) + `Service.Refinements` + `GET /v1/assurance/refinements`.
  Table-tested (pack sign/verify/tamper/plan; flywheel rules) + service tests + DSN-gated pg integration.
  **(c) Cross-Org Governed Action Fabric** (Phase 5c) — `internal/actionfabric`: extends A2A/MACP from
  agent↔agent to **agent↔*system across orgs***. An agent in org A builds an Ed25519-**signed**
  `CrossOrgRequest` (requester org + key id + target org + connector + action + args + nonce + expiry);
  org B's receiver (`Service.HandleRequest`) **fails closed at every gate** — wrong target, expired,
  replayed nonce, unknown requester, unverifiable signature — then evaluates its own **`TrustGrant`**
  (which peer may request which connector/action, a per-grant **risk ceiling** [write<money<irreversible]
  with optional forced approval), resolves the action's risk, and runs the write through **org B's own GAL**
  (the target tenant stays sovereign: detokenise→simulate→gate→commit|approval|block→signed ledger).
  Org B returns a **`CrossOrgReceipt`** that is Ed25519-signed **and binds the exact request hash**, so
  BOTH orgs hold mutually-verifiable, non-repudiable proof; a policy DENIAL still returns a *signed
  `blocked` receipt* (org A gets proof of the refusal), while an unauthenticated request gets no receipt
  (B never vouches for what it cannot verify). The GAL executor reuses the connector-tool governed-write
  path via `Router.ExecuteGovernedWrite`/`ResolveWriteRisk` (a grant's forced-approval OR-s the tenant's
  approve-all policy). Durable `PgTrustStore`/`PgReceiptStore`/`PgNonceStore` (migration
  `00098_action_fabric`; nonce PK = the anti-replay). HTTP `POST /v1/fabric/actions` (inbound, signature-
  authenticated) + `GET /v1/fabric/receipts` (ledger) + `GET/PUT/DELETE /v1/fabric/trust` (grants,
  agent_admin); main-wired behind `cfg.GAL.Enabled` (reuses the GAL signing key — a receipt must be
  signable). Table-tested (protocol sign/verify/tamper/expiry/bind; trust eval; the full fail-closed
  receiver matrix — permit/deny/risk-ceiling/force-approval/unknown/bad-sig/replay/expired/wrong-target)
  plus DSN-gated pg integration. *A true two-org LIVE exercise is deployment-gated (needs two tenants with a
  live connector each).* **Deferred by decision: the underwriter seam** (partner indemnity — a BD/legal
  motion, not engineering).

---

## PART V — OPEN QUESTIONS / DECISIONS TO REVISIT

**Status audit 2026-07-03:** #1 ✅ resolved (built) · #2 ✅ resolved (built) · #3 ✅ resolved
(decision; calibration methodology → PART VI §1) · #4 ⏸ open — deferred by decision (GTM, not
engineering) · #5 ✅ resolved in product (external legal sign-off is the only remaining, non-eng, item).

1. **Simulation strategy per connector:** ✅ RESOLVED (built 2026-07-03). Per-**action**
   `WriteActionSpec.Sim` (`dry_run` | `read_back` | `predicted` | `none`). All three are real and
   distinct: `dry_run` calls the vendor's **server-side sandbox** (`connector.DryRunAdapter`) using
   whichever convention the vendor supports — a **query flag on the same endpoint** (`dry_run_param`,
   e.g. `dryRun=All` [Kubernetes], `validateOnly=true` [Google AIP-163], `DryRun=true` [AWS]), a
   **request header** (`dry_run_header`, e.g. `Prefer: handling=strict` [RFC 7240]), or a **separate
   validate endpoint** (`dry_run_path`); GAL sends the args, the vendor validates without persisting,
   and the predicted post-image is diffed against the pre-image → a *vendor-verified* diff. It
   degrades to `read_back` when the action declares no sandbox, and to an *unverified* (approval-
   forcing) diff when the vendor rejects the write. `read_back` diffs the proposed args against a
   freshly-read pre-image; `predicted`/`none` yield an unverified diff. Only `dry_run`/`read_back`
   produce a verified diff eligible to auto-commit. *(Safety: for the same-endpoint param/header
   conventions the author asserts the vendor honours the flag — a vendor that ignored it would
   persist what GAL treats as a simulation; the separate-endpoint form has no such risk.)*
2. **Irreversible actions:** ✅ RESOLVED (built + wired). An action with an irreversible `RiskClass`
   (or any write with no registered inverse) is forced to `require_approval` by the deterministic gate
   (`gal.Evaluate`), and the receipt carries a prominent, distinct `IrreversibleReason` flag
   (`gal.irreversibleReason`: "classified irreversible / no inverse exists / not marked reversible").
   The *taxonomy* of which ops are one-way (money sent, email sent, message posted) is authored
   per-action via `RiskClass = irreversible` — the correct place for it, not a hardcoded global list.
3. **Risk-engine transparency vs power:** ✅ RESOLVED (as a *decision*, not a code gap). The base is
   deterministic + explainable (`assurance.Evaluate` → sorted `RiskFactor` breakdown), and **no ML was
   added** — a black-box model (XGBoost/deep) would break the auditable + insurer-acceptable
   requirement. The "gate any ML refinement behind explainability" clause is a *future option*, and its
   robust methodology is now specified in **PART VI §1** (glass-box only — logistic/EBM/monotonic —
   calibrated, monotonic-constrained, floor-bounded, signed & shadow-moded; triggered only once a
   labelled outcome dataset exists). Nothing is blocked; deterministic is the correct current answer.
4. **Assurance monetisation first step:** ⏸ OPEN — **deferred by decision (GTM/pricing, not
   engineering).** The Assurance *tech* is built and sellable (Risk Engine + Coverage + Posture +
   Incident Register + Export), but the paid **tier / entitlement flip** was intentionally not built
   (per the "build the substrate, don't monetise yet" call). Revisit as a pricing/packaging decision;
   shipping the tier is also what accrues the actuarial dataset that makes partner underwriting
   possible (and feeds PART VI §1's calibration).
5. **Naming:** ✅ RESOLVED in product. The code + comments consistently use "Assurance" with explicit
   no-indemnity disclaimers ("NOT insurance: no indemnity, underwriter seam, or premium here"). The
   only remaining item is external **legal sign-off** before any future *partner indemnity* is named —
   a legal motion, not an engineering task.

---

## PART VI — FUTURE WORK

### 1. Risk Engine — robust empirical calibration (open question #3, the "how")

The shipped Risk Engine (`internal/assurance`, `Evaluate(RiskInputs) → RiskScore`) is a
**deterministic, explainable weighted sum**: hand-set factor weights (reversibility_gap ×25,
irreversible_exposure ×20, failure_rate ×20, open_incidents capped 30, corrections −…) over
ledger-derived counts, clamped 0–100, emitted with a sorted factor breakdown. This is the correct
*base* — auditable, monotonic, regulator-friendly, and it needs **no data to be useful**. But the
weights are **judgement, not fitted to realised loss**. The future work is to *calibrate* them from
outcome data **without ever becoming a black box**. This is also the work that makes the score
**actuarially credible** — the precondition for any partner underwriting (Part III). Do it in this
order; do **not** skip to modelling before the labels + volume exist.

**Robust methodology (each step gates the next):**

1. **Instrument the ground truth FIRST (no model yet).** A risk score predicts *realised governance
   harm*. Today the ledger records actions + outcomes (committed/reversed/failed) and the incident
   register records harm; extend this into an explicit **per-action outcome label**: `clean` /
   `reversed-benign` / `reversed-harm` / `incident` / `loss` (+ a loss magnitude where money moved).
   Without a labelled outcome you cannot calibrate anything. This is a data-capture task, not ML.
2. **Accumulate + respect rarity.** Governance failures are *rare events* (class imbalance). Define a
   **minimum-evidence gate** — e.g. ≥ N labelled harm events across ≥ M tenants/segments — **below
   which the platform stays purely deterministic** and refuses to fit a model (premature ML on sparse
   data is worse than the heuristic). Track dataset growth as a first-class metric.
3. **Choose a GLASS-BOX model class only.** In preference order: (a) **logistic regression** on the
   existing factors → coefficients are directly interpretable as log-odds contributions, preserving
   the "here are the reasons and their weights" UX verbatim; (b) an **Explainable Boosting Machine /
   GA²M** (per-feature shape functions you can plot + audit) if non-linearity is justified; (c) a
   **monotonic-constrained GBM** as the ceiling. **Never a free-form XGBoost/deep model as the gate.**
   The deterministic engine remains the **floor + sanity bound**.
4. **Enforce monotonicity + sign constraints in the model itself.** Gaps/incidents/failures may only
   *raise* risk; corrections may only *lower* it. Hard constraints (not learned from noisy data) keep
   the model from ever learning a perverse relationship — this is both correctness and
   auditor-acceptability.
5. **Calibrate, don't just discriminate.** A "risk score" is read as a probability by humans and
   underwriters, so it must be **calibrated**: fit Platt scaling / isotonic regression on a held-out
   set and *measure* calibration — reliability diagrams, **Brier score**, **Expected Calibration
   Error** — not just AUC/accuracy. Calibration is the crux of "robust" for an insurance-adjacent score.
6. **Validate out-of-time, per-segment.** Governance data is temporal — train on the past, validate
   on the *future* window (backtest), never random k-fold. Validate per segment (vendor, risk class,
   agent) to catch subgroups where it fails. Report subgroup calibration, not just the global number.
7. **Govern the model like any other action (dogfood the moat).** The coefficients / shape functions
   are a **versioned, signed artifact** with a model card; swapping the scoring model is a *governed
   change* with its own audit trail (reuse the capability-pack sign/attest machinery). **Shadow-mode**
   the calibrated model against the deterministic one in production before it gates anything.
8. **Bound the learned model by the deterministic floor.** The calibrated score may only *refine
   within a band* around the deterministic score, so a bad fit can never wildly mis-gate. Add
   **input-drift monitoring** (population stability index on the factor distributions) and a fixed
   **recalibration cadence**; a human can always override.
9. **Explainability at inference is non-negotiable.** Per-score attributions (LR coefficients ×
   feature, or EBM per-feature contributions; SHAP permitted only as a *presentation* of an
   already-glass-box model). The user-/auditor-facing artifact stays exactly what it is today: *the
   reasons and their weights.*

**Trigger:** begin step 3 only when step 2's minimum-evidence gate is met; until then the shipped
deterministic engine is the answer, and "robust" means stable + explainable + monotonic (which it is).

### 2. Governed Action Studio (the authoring + operation surface)

The no-code + SDK authoring surface for turning a raw enterprise API into a governed, agent-operable,
reversible, audited **action** — and operating it. Full design + use-cases:
`docs/Actrone_Governed_Action_Studio.md`.

---

## The through-line

> Competitors let agents *act*. Actrone makes every agent action **provable, bounded, reversible,
> and accountable** — and turns that into the substrate that makes autonomous agents *insurable*.
> We build the assurance system; a licensed partner (or the customer's own program) carries the
> indemnity. The moat is the substrate + the ledger + the compounding actuarial data — which nobody
> can bootstrap without already being the governed action layer.
