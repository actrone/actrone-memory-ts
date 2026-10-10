# Actrone Governed Runtime — consolidated roadmap (what's built · what's planned · what's next)

> The single grounding index for everything designed in this planning cycle. Positioning is **LOCKED**:
> Actrone is the *governed autonomy runtime*; frameworks (native SDK, no-code EMAOP, BYOF) are authoring
> surfaces on top of it (see `Actrone_Governed_Multiframework_Runtime_Plan.md` → Positioning). This doc
> is the map from that strategy to an ordered backlog.
>
> Discipline: **BUILT** = code exists + tested; **PLANNED** = designed, not yet built; deployment-gated
> items are flagged. Nothing here is committed to git yet (by owner's instruction).
>
> **Status refreshed 2026-07-13 (code-verified):** the Track 3 enum-wiring gap flagged 2026-07-06
> (⚠️ "`HostedFrameworks`/`StepwiseFrameworks` omit 6 of the Python drivers + the TS vercel/mastra
> ones") is **FIXED**. Current enum (`internal/domain/agent.go`) lists 21 frameworks; every one of the
> now-13 Python stepwise drivers and 6 TS stepwise drivers (`actrone-ts/src/harness/frameworks/`, plus
> a new `actrone-ts/src/harness/stepwise.ts` core — TS stepwise did not exist as of this doc's last
> pass) has a matching entry, and `internal/agent/runtime_test.go`
> (`TestRuntime_AllHostedFrameworksAcceptStepwise`) now regression-guards the parity. This closes the
> §3 Tier-1/Tier-3 items referencing Python stepwise drivers and the TS harness gap. Also confirmed
> this pass: the §3 Tier-1 item #3 ("inter-agent trust delegation enforcement... `internal/a2a` never
> calls `VerifyDelegationToken`") is **partially fixed** — `a2a/registry.go` now calls it — but
> enforcement is still off by default (`cfg.MCP.RequireAgentDelegation` defaults `false`, and key
> minting needs a vault key). Track 2's "16+" Requirement-Gate checkers are now **16/16 wired**
> (a2a_trust + billing included) — see `Actrone_Requirement_Gate_Design.md`'s refresh note, correcting
> this doc's "12-of-14" Tier-3 tail item. Not re-verified this pass: Track 1 (unified builder), Track 4
> UX surfaces, Track 5 vendor packs, Track 6 calibration gate, and the `GovernedSystem`/G1/G2
> orphaned-wiring claims in Track 3's last bullet.

---

## 1. What's already BUILT (the governed substrate — the moat foundation)

The reason the plans below are *real*: the hard engine is done. Every "groundbreaking" feature later is
an assembly of these.

| Capability | Where | Status |
| --- | --- | --- |
| GAL P0 — governed writes (detokenise→simulate→gate→commit→signed receipt) | `internal/gal` | ✅ built+tested |
| GAL simulate: **vendor dry-run sandbox** (param/header/path, universal) + read-back | `internal/connector`, `connectortool` | ✅ built+tested (this cycle) |
| GAL P1 — field provenance + purpose-binding | `internal/provenance` | ✅ built+tested |
| GAL P1b — MCP result governance | `internal/mcpgov` | ✅ built+tested |
| GAL P2 — SAGA rollback + TTL revert (reversible agents) | `internal/gal` (reversal/sweeper) | ✅ built+tested |
| GAL P3 — Assurance (risk engine + coverage + posture + incidents) | `internal/assurance` | ✅ built+tested |
| GAL P4 — self-describing connectors (auto-classify + drift attest) | `internal/connectorgov` | ✅ built+tested |
| GAL P5 — signed capability packs + correction flywheel | `internal/capabilitypack`, `assurance` | ✅ built+tested |
| GAL P5c — **cross-org action fabric** (Ed25519 mutual receipts) | `internal/actionfabric` | ✅ built+tested (this cycle) |
| Durable governed agentic loop (MAL→MediaGuard→memory→DPE T1/2/3→tool loop→audit spine→detokenise) | `internal/workflow` (Temporal) | ✅ built |
| DPE policy engine (Tier-1/2/3 + human approval + eval-context replay) | `internal/dpe` | ✅ built |
| MAL tokenisation boundary · MediaGuard | `internal/mal`, `internal/mediaguard` | ✅ built |
| MACP mesh + Crew (sequential/hierarchical/parallel + shared memory) · A2A | `internal/macp`, `internal/a2a` | ✅ built |
| byof_hosted harness + **EgressSpec network-policy choke point** | `internal/domain`, harness | ✅ built (encapsulated strategy) |
| Requirement-Gate raw material: `EntitlementDenialGate` + env `ReadinessGate`/`readiness.go` | frontend + `internal/repository` | ✅ built (narrow) |

---

## 2. Tracks — ALL SIX IMPLEMENTED ✅ (was "PLANNED"; updated 2026-07-04 after a code-grounded audit)

> Every track below is now built + tested at the codebase's standard bar (code + unit/contract tests
> green). Per-item evidence and the deployment-gated tail live in **`progress.md`** (repo root). Items
> whose only remaining step is a live-infra exercise are marked *(deploy-gated)*.

### Track 1 — The one governed builder (no-code + SDK converge) ✅
*Docs: `Actrone_Unified_Governed_Builder.md`, `Actrone_Governed_Action_Studio.md`, `Actrone_Governed_Action_Studio_Build_Plan.md`.*
- ✅ **WS1** — write-governance on the connector API/DTO (`connectors.go` `actionRequest`/`validateGovernedWrites`) + all 3 SDKs + enhanced `CustomConnectorBuilder`.
- ✅ **`spec.governed_actions`** — per-agent action-binding primitive (`internal/domain/governed_action.go`, narrows-only) + parser + Supervisor/`connectortool.executeWrite` enforcement.
- ✅ **Merge EMAOP Steps 3+4** → one "Actions & Connections" step (`agent-studio/ActionsAndConnections.tsx`, STUDIO_STEPS 5→4).
- ✅ **Real Simulate step** — `gal.Service.Preview` → `PreviewWrite` → `POST /v1/connectors/{id}/actions/{action}/preview` + `GovernancePreview.tsx` (replaced the fake `SandboxValidation`).
- ✅ **Consolidate** `/integrations` + `/mcp` + `/tools` → one "Resources" workspace (`integration-hub/ResourceTabs.tsx`; sidebar 3→1).

### Track 2 — Requirement Gate (platform-wide JIT provisioning) ✅
*Doc: `Actrone_Requirement_Gate_Design.md`.*
- ✅ `internal/requirements` service + `GET /v1/requirements` + `ERR_REQUIREMENT_UNMET{kind}`.
- ✅ `RequireGate` (declarative) + `RequirementDenialGate` (reactive global listener) + resolver registry + rich `model` (BYOK-vs-managed+cost) resolver + builder wired.
- ✅ *(corrected 2026-07-06 deep audit)* **All 14 checker kinds are now real + wired** in `main.go:2559-2673` (`requirements/checkers.go:159` `BuildCheckers`); a `nil` Dep fail-closes (never falsely satisfied). *Remaining: the design's `a2a_trust` + `billing` kinds (→ "16+") are still unimplemented — planned-deferral.*

### Track 3 — Governed runtime for every framework (Part A + Part B) 🟡
*Doc: `Actrone_Governed_Multiframework_Runtime_Plan.md` + `Actrone_BYOF_Governance_And_Instrumentation_Plan.md` + `Actrone_Native_vs_Framework_Audit.md`.*
*STATUS CORRECTED 2026-07-06 by a 7-agent deep WIRING audit — several items here were BUILT-BUT-UNWIRED (code existed, unreachable). Corrections below.*
- ✅ **G3 stepwise harness** — `actrone-py/.../harness/stepwise.py` + **TS `harness/stepwise.ts` exists**. Stepwise drivers exist for **9 Python** (langchain/llamaindex/pydantic_ai/semantic_kernel/dspy/google_adk + openai_agents/autogen/crewai) + **3 TS** (openai-agents/vercel/langchain) shims. ⚠️ **UNWIRED at the enum: `HostedFrameworks`/`StepwiseFrameworks` (`internal/domain/agent.go:129-143`) omit 6 of the Python drivers + the TS vercel/mastra ones, so `parser.go` REJECTS a `byof_hosted` agent-file declaring them.** L4 enum wiring is the fix (biggest gap in this track).
- ✅ **OTel/OpenInference exporter** — TS `actrone-ts/src/adapters/otel.ts` **AND Python `actrone-py/src/actrone/integrations/otel.py`** both exist (prior "Python twin NOT built" was stale).
- ✅ **Egress boundary (hosted/byof_hosted)** — `harness-pool/templates/networkpolicy.yaml` + `internal/egressproxy` (byof_connected sidecar built).
- ✅ **Part A `GovernedSystem` runtime — BUILT + WIRED** (`internal/governedsystem/{runtime,adapters,taskinvoker,quarantine}.go` → `main.go:2400-2409`, `POST /v1/systems/run` `main.go:3014`, SDK `client.runSystem`/`run_system`). *(prior "runtime unbuilt" was WRONG.)* ⚠️ *Remaining: a system topology is a request body only — NOT persisted/versioned as an agent-file (no parser surface/storage).*
- ⚠️ **G1 native graph DSL** (`internal/agentgraph`) + **G2 crew DX** (`internal/domain/crew_spec.go`) exist **BUT ARE ORPHANED — zero callers** (no parser field, handler, or SDK). Prior "✅" was existence-only; they are not wired into any authoring path. This is real remaining work, not done.

### Track 4 — Substrate moats (expose built engines through SDK/UX) ✅
*Doc: `Actrone_Governed_Multiframework_Runtime_Plan.md` §B.2.*
- ✅ Reversible-agent SDK surface (×3), whole-agent simulation SDK (×3), insurable/flywheel SDK (×3), **governed evals** read surface (`internal/eval.Summarise` → `GET /v1/evals/agents/{id}/summary` + Go/TS/Python), provenance-native (GAL receipts), durable long-running (Temporal + task SDK).
- ⚠️ *Remaining (net-new UX, not blocking):* time-travel/replay console, shadow-mode simulation UI, governed-evals-gate-deploys flow — richer front-end surfaces over shipped APIs.

### Track 5 — Vendor content + AI authoring ✅
*Doc: `Actrone_Governed_Action_Studio_Build_Plan.md` WS2/WS3.*
- ✅ **WS2** — curated NetSuite + Workday governed write packs (`erp.go`/`hris.go`; `TestVendorWritePacks` resolves all 6 through the real resolver). *(deploy-gated: live vendor sandbox.)*
- ✅ **WS3** — `internal/connectorimport` (`ParseOpenAPI` + advisory `ProposeGovernance`, safety-reconciled via `gal.WriteActionSpec.Validate`). *(deploy-gated: wiring a live model proposer + an import HTTP endpoint.)*

### Track 6 — Assurance calibration (data-gated, later) ✅
*Doc: `Actrone_Governed_Action_Layer_Strategy.md` Part VI §1.*
- ✅ Deterministic explainable engine (shipped) + **minimum-evidence gate** (`internal/assurance/calibration.go`, fail-closed to deterministic until ≥200 harm labels / ≥5000 labelled actions / ≥3 segments). The ML fit is **correctly gate-deferred**, not missing.

---

## 3. What's NEXT — the ordered backlog (rewritten 2026-07-04 after the code-grounded plan audit)

The original six-track backlog is **done** (§2). A full audit of all ~40 plan docs against the code
re-scoped "next" into two buckets: **genuinely-unbuilt code** vs **deployment-gated** (code done, needs
live infra). This is the real remaining engineering, ranked.

**Tier 1 — build now (small, high-leverage, well-scoped):**
1. **Connector OAuth refresh** (`Actrone_Connector_Integration_Depth_Plan.md` Part III) — pasted ERP/HRIS
   OAuth bearer tokens silently die ~1h after connect (no refresh token/expiry/`ExchangeRefresh`). Reuse
   the proven pattern in `internal/mcphub/oauth.go`. **The #1 genuinely-broken thing.**
2. **Python-SDK OTel/OpenInference exporter** — parity gap; TS-only today (`actrone-ts/src/adapters/otel.ts`).
3. **Inter-agent trust delegation enforcement** — `internal/trust/delegation.go` exists but `internal/a2a`
   never calls `VerifyDelegationToken`; cross-agent dispatch isn't gated. Security hardening.

**Tier 2 — strategic builds (pick one):**
4. **Self-Hosting P0** (`Actrone_Self_Hosting_Plan.md`) — `internal/licensing` (Ed25519 offline verify →
   tier/entitlements + grace), air-gap `UsageReportClient` MeterClient, `values-selfhost.yaml`, frontend
   de-Clerk (~52 files). Greenfield, but the seams exist (pluggable `MeterClient`/`NoopMeterClient`,
   DB-authoritative tier). Enterprise revenue unlock.
5. **`GovernedSystem` runtime + Studio operator UIs** — wire `internal/domain/governed_system.go` into a
   real service (cross-framework handoff spanning ledger/trace + shared memory); build the Approval-inbox /
   Rollback-console / Preview-console / Risk-posture UIs over the shipped `/v1/gal/*` + `/v1/assurance/*`
   APIs. Makes the substrate *visible & sellable*.
6. **Voice Outbound/Embed/SDK** (`Actrone_Voice_Outbound_Embed_SDK_Plan.md`) — outbound origination, the
   `<actrone-orb>` embed web component + token allowlist, voice namespaces in all 3 SDKs, the
   `GovernedAgentResponder` (agentic-during-call), multi-channel delivery. Substrate ~70% exists.
7. **Browser Capability runtime** — govern­ance logic exists but `SessionManager` is a test-only fake, not
   wired into `main.go`; needs a production Playwright/K8s-Job impl + wiring.

**Tier 3 — tails (small, on demand):** Requirement-Gate 12-of-14 checkers · Python stepwise drivers
(OpenAI-Agents/AutoGen/CrewAI) · `byof_connected` egress proxy/sidecar · MediaGuard P2/P3 + external OCR
service · Certification P4 org-auditor/ISMS · TS LangChain.js/LangGraph.js adapters.

---

## 4. Cross-cutting notes
- **Deployment-gated (code done, NOT engineering — needs a live cluster/AWS/keys to *apply*):** all infra
  installs (Linkerd/Envoy/KEDA/Karpenter/ArgoCD/ESO/BuildKit) · Voice V2 bring-up (secrets + Twilio/
  Deepgram/ElevenLabs) · P7 monetization turn-up (Stripe keys) · Data-Residency P2 (apply the written
  `regional-data-plane` Terraform + EU DSNs) · VCS preview DNS/cert · cross-org fabric two-tenant run ·
  WS2 vendor sandbox · semantic-cache Qdrant collection + distillation fine-tune key · per-tenant registry
  ESO/IRSA · Code-Bundle BuildKit live run.
- **All roadmap build-work is UNCOMMITTED** (owner commits). Status tracker: `progress.md` at repo root.
- **Moat test for any new idea:** *"does it require the governed substrate to exist?"* Yes → moat; no →
  table stakes.
