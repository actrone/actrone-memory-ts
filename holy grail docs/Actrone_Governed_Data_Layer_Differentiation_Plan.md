# Actrone Governed Data Layer: differentiation plan

> **Status:** plan, not built. Two workstreams.
> **Owner:** Matt · **Created:** 2026-09-07
> **Related:** `Actrone_MediaGuard_Plan.md`, `Actrone_Governed_Action_Layer_Strategy.md`,
> `Actrone_Governed_Computer_Use_Plan.md`, `Actrone_Positioning_And_Competitive_Moats.md`

## Why this exists

PII redaction at the gateway layer commoditised during 2026. WSO2, APISIX/API7, TrueFoundry and
Envoy AI Gateway all ship inbound prompt redaction. Our own `internal/gateway` stateless
classify-and-tokenise pass (`gateway.go:381-401`) is now table stakes, not differentiation.

Two consequences follow, and this document covers both:

1. **An engineering gap.** MediaGuard runs once, on task input only. Text PII (MAL) is guarded
   across 14 call sites spanning the whole action surface; binary media is guarded at the front
   door only. That is backwards, because media is precisely the modality a gateway cannot reach.
2. **A positioning gap.** We currently lead with redaction, which a buyer can now get from their
   existing gateway for free. The defensible claim is purpose binding plus loop-wide coverage plus
   attestation, and we are not saying it.

---

# Workstream 1: MediaGuard loop-wide coverage

## 1.1 Current state (verified 2026-09-07)

| Surface | Text PII (MAL) | Media PII (MediaGuard) |
| --- | --- | --- |
| Task input | Yes, gateway + Activity 1 | **Yes**, Activity 0.5 (`task_workflow.go:238`) |
| Browser page content | Yes, `browser/mal_interceptor.go` | **No** |
| Browser screenshots | n/a | **No** |
| Governed tool results | Yes, `connectortool/router.go` | **No** |
| MCP tool results | Yes, `mcpgov/governor.go` | **No** |
| Connector reads | Yes, `connectorgov/selfdescribe.go` | **No** |
| Action egress | Yes, `gal/egress.go` | **No** |

Grep confirms zero `mediaguard` references in the `browser`, `tool`, `mcp*` and `connectortool`
packages. An agent that screenshots a page or pulls a scanned document mid-loop sends that media to
the provider unscanned.

This also means the "MediaGuard on every frame" moat asserted in
`Actrone_Governed_Computer_Use_Plan.md` is currently a plan, not code. Governed computer use is
blocked on this workstream.

## 1.2 Target state

Media entering the agent's context is scanned at every ingress point, not just the first one, with
the same fail-closed guarantee the task-input path already has.

## 1.3 Design

### M1. Extract a reusable scan seam

Mirror the proven `browser.Interceptor` pattern (`browser/mal_interceptor.go`), which is the
existing precedent for "guaranteed by architecture, not configuration."

Add `mediaguard.Interceptor` wrapping the existing `Engine`:

- `Intercept(ctx, policy, items []MediaItem) (InterceptResult, error)`
- Returns redacted items plus verdict, entity types, counts and confidences. Never raw values.
- Reuses `Engine.Guard`, so fail-closed behaviour, the `Detector` seam and the zero-egress rule are
  inherited rather than reimplemented.

Do not duplicate scan logic per call site. One seam, many callers.

### M2. Cheap prefilter before the expensive detector

Task input is scanned once per task. Tool results are scanned once per tool call, inside the
agentic loop. The latency budget is an order of magnitude tighter, and the remote ML detector
(YuNet, YOLOv8-face, VLM-OCR) cannot sit unconditionally in that path.

Prefilter in order, short-circuiting on the first negative:

1. Does the payload contain media at all? Magic-byte sniff for PNG/JPEG/WebP/PDF plus a base64-blob
   heuristic. No media means no scan and no cost.
2. Content hash already seen in this task, with an unchanged policy? Reuse the prior verdict.
3. Metadata strip only (EXIF/GPS/device) when the policy enables no visual detectors. Pure Go,
   sub-millisecond, already implemented in `mediaguard/metadata.go`.

Only payloads surviving all three reach the ML detector.

### M3. Hook points

| # | Location | Notes |
| --- | --- | --- |
| M3.1 | `activity_service.go` `executeGovernedToolUncached`, at result construction (`Output: string(result.Output)`) | Covers every governed tool including connectors |
| M3.2 | `browser` screenshot path | New `mediaguard.Interceptor` alongside the existing MAL one |
| M3.3 | `mcpgov/governor.go` structured-result path | MCP servers can return image content blocks |
| M3.4 | `gal/egress.go` | Media leaving via an action, not only entering the model |

All hooks live in **activities**, never in workflow code. Scanning is non-deterministic I/O and must
not run in the replayable path.

### M4. Cache correctness (blocking constraint)

`executeGovernedToolCached` (`activity_service.go:1986`) content-addresses tool results on
`sha256(agentID, tool, args)` and serves hits without re-executing. A scan hook placed only in the
uncached path is **silently bypassed on every cache hit**. That is worse than having no scan at
all, because the audit trail would claim a scan occurred.

Required:

- Cache the **post-scan** artifact, never the raw one. The scan runs inside the singleflight
  closure, before `toolCache.Set`.
- Include a policy fingerprint in the cache key: `sha256(agentID, tool, args, policyHash)`.
  Tightening a media policy must invalidate results cached under the looser one.
- Never cache a `block` or `escalate` verdict. Those are decisions, not artifacts. The existing code
  already declines to cache errors for the same reason.

### M5. Verdict handling inside the loop

Pre-loop, Activity 0.5 can simply fail the task. Mid-loop the agent is already running, so:

- **redact**: substitute the sanitised bytes into the tool result and continue. Emit a stream event
  so the TraceViewer badges the redaction.
- **block**: return a governance error **as the tool result** (`IsError: true`), not as a task
  failure. The model then sees that the tool returned governed content it cannot be shown, and can
  choose another path. Failing an entire task on one dirty screenshot is too blunt.
- **escalate**: mid-loop human review is expensive. Phase 1 treats escalate as block inside the loop
  and records the downgrade in the audit row. Phase 2 may reuse `awaitEscalationDecision` once a
  real use case appears.

### M6. Replay safety

Follow the existing precedent exactly. Gate each new scan point behind its own
`workflow.GetVersion` key (`mediaguard-tool-results`, `mediaguard-browser-frames`) so histories
recorded before the change replay byte for byte on the old path.

### M7. Default-on for media-capable agents

Today the `Policy` zero value is disabled and media governance is opt-in. Gateway vendors ship
redaction on by default, and "off unless configured" is hard to defend in a security review.

Change: any agent whose capability set includes vision, browser or file input gets
`media_governance.enabled = true` with `action: redact` and `strip_metadata: true` by default.
Explicit opt-out remains available. Agents with no media capability are unaffected and pay nothing.

## 1.4 Sequencing

| Phase | Scope | Gate |
| --- | --- | --- |
| P1 | M1 seam, M2 prefilter, M4 cache correctness, M6 gating | Unit tests including a cache-bypass regression test |
| P2 | M3.1 governed tool results, M5 verdict handling | Integration test: dirty image via tool, assert the provider never sees it |
| P3 | M3.2 browser frames, M3.3 MCP results | Unblocks governed computer use |
| P4 | M3.4 egress, M7 default-on | Migration note for existing agents |

## 1.5 Test obligations

- **Cache-bypass regression.** A cached tool result must never bypass the scan. This is the single
  most important test in the workstream.
- **Policy-change invalidation.** Tightening a policy invalidates prior cache entries.
- **Fail-closed.** Detector unreachable means block, never pass. Assert at every new hook point.
- **Prefilter correctness.** A payload with no media incurs zero detector calls.
- **Replay.** A history recorded before the change replays identically.
- **Audit safety.** Rows carry entity types and counts only, never raw PII. Assert on log output.

## 1.6 Risks

| Risk | Mitigation |
| --- | --- |
| Per-tool-call latency in the hot loop | M2 prefilter; detector budget with a hard timeout |
| Cache hole ships unnoticed | M4 is a blocking gate on P1 with a named regression test |
| Over-redaction breaks agent reasoning | `min_confidence` floor is already tunable; redact beats block mid-loop |
| ML detector cost per call | Prefilter plus per-task content-hash memo |

---

# Workstream 2: repositioning off redaction

## 2.1 The problem

"We redact PII before the model sees it" is now free with APISIX, WSO2, TrueFoundry or Envoy AI
Gateway. Leading with it puts us in a comparison we cannot win and did not need to enter.

## 2.2 What replaces it

New primary claim:

> **We bind data to purpose and prove what the agent actually saw.**

Three supporting pillars, in priority order.

### Pillar 1: purpose binding

`internal/provenance/purpose.go` blocks on **why** a task is acting, not what is in the payload.
Salary is readable only by payroll-purpose tasks. A gateway sees a request, not an intent, so it
structurally cannot do this. It maps directly to GDPR Art. 5(1)(b) purpose limitation, a named
obligation a compliance buyer already has a budget line for.

This is the strongest asset we have and it is currently almost unmentioned in positioning material.

### Pillar 2: loop-wide coverage

A gateway guards one door. PII does not mostly arrive through the user's prompt, it arrives through
tool results, connector reads, browser DOM and MCP responses, all of which happen after the
gateway. MAL is wired at 14 call sites across that surface. Workstream 1 brings media to parity.

Message: **a gateway guards the front door of a building with eight.**

### Pillar 3: attestation over assertion

Field-level provenance lets a task attest that a refund used order-total and status and never saw
the SSN. A stateless per-request gateway cannot produce that artifact. Combined with the portable
Ed25519 per-run attestation, this is an auditable output rather than a claim.

### Supporting, not leading: reversible tokenisation

Gateways redact destructively, which breaks the agent's ability to act on the value. We tokenise,
act, then detokenise at the egress boundary, with values held under a customer-owned Vault Transit
KEK (`mal/vaultstore.go`) and an audit-gated `RevealForAudit`. Plaintext never lands in the store.
Useful, but a technical detail rather than a headline.

## 2.3 What to stop saying

- "We redact PII before the model sees it" as a headline claim. Demote it to a table row.
- Any framing that positions us against gateways on inbound prompt inspection.
- "MediaGuard scans every frame" until Workstream 1 P3 ships. It is currently untrue.
- Anything implying a SOC 2 report exists. We have an evidence collector. A security reviewer knows
  the difference instantly, and the conflation costs more trust than the claim gains.

## 2.4 Deliverables

| # | Deliverable | Surface |
| --- | --- | --- |
| D1 | Rewrite the governance value proposition around the three pillars | Marketing homepage, governance feature page |
| D2 | Comparison table: gateway redaction vs governed data layer, by layer not by feature | Docs, sales collateral |
| D3 | Purpose-binding explainer with a worked example (payroll vs support reading salary) | Docs |
| D4 | Sample attestation artifact, real output from a real run | Docs, trust centre |
| D5 | Record the commoditisation event and this response in the positioning doc | `Actrone_Positioning_And_Competitive_Moats.md` |
| D6 | Honesty pass across all GTM docs for redaction and coverage claims | Internal |

## 2.5 Proof obligations

Each pillar needs one artifact a technical buyer can inspect without trusting us:

- **Pillar 1:** a runnable example where the same tool call succeeds under one purpose and is
  blocked under another.
- **Pillar 2:** the call-site table from §1.1, published, with the media column honest about status.
- **Pillar 3:** a real signed attestation, verifiable with the cross-language golden verifier.

## 2.6 Dependency

D2, and the media column in §1.1, cannot be published honestly until Workstream 1 P3 lands. Until
then the coverage claim is text-only and must be stated as such. Workstream 1 is a prerequisite for
the strongest version of Workstream 2, not parallel to it.

---

## Open questions

1. Should media governance default-on (M7) apply retroactively to existing agents, or only to newly
   created ones? Retroactive is safer but changes behaviour for anyone already running.
2. Is mid-loop escalation (M5 phase 2) worth building, or is block-and-let-the-model-reroute
   sufficient in practice?
3. Does the purpose-binding story need a named framework mapping (GDPR Art. 5(1)(b), EU AI Act
   Art. 10) on the marketing surface, or does that narrow the audience too far?
