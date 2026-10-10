# Actrone Governed Computer Use — Implementation Plan

> **Status:** Draft for review (2026-09-04). Written in response to the GPT-6 Astra launch (2026-09-03),
> whose headline capability is computer use, and the parallel Grok computer-use release.
> **Owner:** Matt · **Scope:** `backend/browserpool` + orchestrator (`internal/browser`,
> `internal/browsertool`, new `internal/computeruse`) + both SDKs (TS + Python) + Control Tower + docs.
> **Precedence:** inherits `../CLAUDE.md` (workspace) and `CLAUDE.md` (Actrone). Brand is LOCKED
> (Black & Apple-Silver).
> **Supersedes:** the computer-use half of `docs/Actrone_Competitive_Parity_Improvements_Plan.md` §7
> (Part G). Part G's payments / code-execution / MCP-exposure legs are unaffected and stay there.
> **Related:** `docs/Actrone_Governed_Action_Layer_Strategy.md`, `docs/Actrone_MediaGuard_Plan.md`,
> `docs/Actrone_Positioning_And_Competitive_Moats.md`, `docs/EMAOP_Actrone_Integration_Plan.md` §3.4,
> `docs/Actrone_Self_Hosting_Plan.md`.

---

## 0. TL;DR

**What:** Extend Actrone from *governed page-fetch* to *governed computer use*: an agent that can click,
type, scroll and read a screen, where every one of those actions crosses the same governed boundary every
other Actrone tool call already crosses, and every frame the model sees has been through MediaGuard first.

**What we are explicitly not building:** a computer-use model. Astra, Claude computer use and Grok are
pluggable backends behind the existing model gateway and BYOK path. The clicking is the commodity. The
control plane is the product.

**The one-line pitch:** *the only computer-use agent where the model never sees un-redacted pixels, and
the only one whose session is cryptographically replayable.*

**Two capabilities, deliberately split:**

| Capability family | Surface | Vehicle | Cost to build |
| --- | --- | --- | --- |
| `computer_web_*` | a browser viewport | extend `backend/browserpool` | weeks |
| `computer_desktop_*` | a full guest OS | new VM pool service | a quarter-plus, gated on demand |

Phase 1 ships `computer_web_*` only. `computer_desktop_*` is scoped in §12 but **not committed** until a
named design partner needs a thick-client app.

**A Phase 0 that ships before any of it:** `authorize_tool()` already pre-flights an action through the
Tool-Call Supervisor without executing it. A developer running their own Astra CUA loop can call it before
every click today and get allowlist, rate limit, spend cap and audit, with Actrone executing nothing. That
is a real governed-computer-use claim requiring no new infrastructure (§10).

---

## 1. Motivation and positioning

### 1.1 What actually changed on 2026-09-03

GPT-6 Astra shipped with computer use as its headline: operating software, completing multi-step tasks
across applications, minimal human intervention. OpenAI stated it is the first model to trigger their
advanced internal safety protections given its cyber capabilities.

That last fact is the entire commercial argument for this plan. A model whose capability triggers its own
lab's containment protocol is a model no regulated enterprise can point at a production CRM without a
control plane that they, not the lab, operate.

### 1.2 The gap the labs are not closing

From the Part G research, still accurate:

- Anthropic's Cowork is **excluded from Audit Logs, the Compliance API, and Data Exports on every plan
  tier.** A frontier lab's own computer-use product does not tell an enterprise buyer what it clicked.
- *"Most enterprises have no governance at the tool invocation layer. Tool invocations trusted by default,
  no risk scoring before execution."*
- *"Most organisations can monitor what their AI agents are doing, but the majority cannot stop them when
  something goes wrong."* A monitoring-versus-control gap.
- *"Endpoint logs rarely capture which MCP servers an agent is wired into, and are not centralised."*

Every one of those is a control-plane gap, not a model gap. Model capability improving makes each of them
more acute, not less.

### 1.3 Why the structural claim holds

`docs/EMAOP_Actrone_Integration_Plan.md` §3.4 already makes the argument for browsing: OpenAI's CUA passes
raw screenshots and HTML directly to the model, so a vendor portal page containing salary data enters the
LLM context as-is. Computer use makes this dramatically worse, because the unit of input stops being a page
the agent chose to fetch and becomes **whatever happens to be on the screen**: the open inbox behind the
window, the adjacent CRM column, the notification toast.

A lab cannot fix this for us. Their product requires the screenshot reaching their API. Ours does not.
That asymmetry is the moat, and it is not a configuration flag, it is where the code sits.

---

## 2. What already exists (read from the code, not assumed)

Verified 2026-09-04:

| Component | Path | State |
| --- | --- | --- |
| Browser tier ladder + allowlist | `backend/orchestrator/internal/browser/tiers.go` | Built. 4 tiers, `TierPolicy` carries DPE tier / vault injection / human review / session recording. `DomainAllowed` is fail-closed on an empty allowlist. |
| Governed browse orchestration | `internal/browser/service.go` | Built. `Browse()` enforces tier, provisions, authorises URL, navigates, MAL-governs, always tears down. Refuses to return content when no interceptor is wired. |
| MAL interceptor | `internal/browser/mal_interceptor.go` | Built. Classify + tokenise every response body against the task token context. |
| Loop tool router | `internal/browsertool/router.go` | Built. Reserved tool name `browser`, resolves the agent's grant, picks the highest granted tier. |
| Session pool service | `backend/browserpool/` | Built and tested. Bounded pool, per-session isolated `BrowserContext`, TTL + idle sweeper, SSRF guard, bearer auth, `/health/*`, `/metrics`, `BrowserBackend` seam with a real Playwright adapter and an in-memory fake. |
| Capability → tool catalog | `internal/agent/capability_tools.go` | Built, with a drift test that fails the build if the catalog and `domain.CapabilityNames()` diverge. |
| MediaGuard | `internal/mediaguard/` | Built. Fail-closed, zero-egress, `Engine.Guard()`, detectors `ocr_text_pii` / `faces` / `signatures`, actions `redact` / `block` / `escalate`, findings carry entity types only, never raw values. P2/P3 ML engines built; model weights are a deploy gate. |
| GAL | `internal/gal/` | Built. `RiskClass` write/money/irreversible, `SimStrategy` none/dry_run/read_back/predicted, compensation, approval, signed receipts, reversal. |
| Attestation | `internal/assurance/attestation.go` | Built. Ed25519, canonical signing order, `LedgerHead` ties the artifact to the hash-chained action ledger. |
| Object store | `internal/objectstore/s3.go` | Built. `Store` port, SSE-KMS with a customer-managed key required, sha256 checksum at ingest, fail-closed `Unavailable` default. |
| Tool registry | `internal/tool/registry.go` | Built. `Register(name, handler, schema)`, duplicate registration panics at startup. |
| Stepwise governed boundary | `actrone-py/src/actrone/harness/protocol.py` | Built. Every framework step yields `model_request` / `tool_request` / `memory_op` / `approval_gate` / `done` across into the Go workflow. |

**The load-bearing consequence:** a click is a `tool_request`. It therefore inherits the Tool-Call
Supervisor, DPE, approval gates, spend caps, the signed ledger and Temporal durability **for free**, with
no second governance story. This plan is mostly about extending an existing surface, not building a new one.

**What does not exist:** any interaction verb beyond `navigate`, any screenshot capture, any element-level
authorisation, any desktop surface.

---

## 3. Scope: two capability families, split on purpose

Part G said "extend browserpool beyond navigate to click, type, scroll." Astra's demo is *cross-application*
(Maps, then a provider website, then a form), which invites the conclusion that we need a full desktop.
We should resist that conclusion for v1, for one reason: **the overwhelming majority of enterprise line-of-
business software is web-delivered.** A browser viewport with real interaction verbs covers it. A guest OS
adds VM pool management, golden images, per-tenant VM isolation, guest OS licensing and a much larger
attack surface, in exchange for legacy thick clients.

So:

- **`computer_web_*` (Phase 1, this plan).** Real interaction inside a governed browser viewport.
- **`computer_desktop_*` (Phase 4, scoped in §12, not committed).** A guest OS. Gated on a named design
  partner with a real thick-client workflow.

Splitting them also keeps the security story honest: the two have genuinely different isolation
requirements and should never be sold as one capability.

---

## 4. The capability ladder

Mirrors the browser tier ladder, which is the pattern the codebase already proves. Cumulative: a higher
grant implies the lower ones.

| Capability id | Verbs | DPE tier | Vault | Human review | Screenshot policy |
| --- | --- | --- | --- | --- | --- |
| `computer_web_observe` | `screenshot`, `read_dom`, `scroll` | 0 | no | no | MediaGuard mandatory |
| `computer_web_interact` | + `click`, `type`, `select`, `hover`, `key` | 2 | yes | no | MediaGuard mandatory |
| `computer_web_transact` | + interaction with elements classified irreversible | 3 | yes | **per-action** | MediaGuard mandatory, full session recording |

Three notes on the design:

1. **`computer_web_observe` is deliberately separable from `browser_read_only`.** Existing `browser_*`
   grants stay exactly as they are and keep meaning "fetch a page's text." Nothing about the current
   contract changes, so no existing agent silently gains the ability to click.
2. **There is no `computer_web_autonomous`.** The browser ladder's fourth tier exists because navigation is
   low-consequence enough to run unattended. Clicking is not. An agent that needs unattended interaction
   gets `computer_web_interact` plus an explicit per-tenant DPE rule, not a blanket tier.
3. **Registration.** All three go into `capabilityToolCatalog` in
   `backend/orchestrator/internal/agent/capability_tools.go` as `BindingBuiltin` pointing at the new
   reserved tool name, and into `domain.CapabilityNames()` plus the FE mirror
   `frontend/apps/control-tower/src/lib/agent-capabilities.ts`. The existing drift test enforces this;
   do not add the capability without all three.

---

## 5. Moats and USPs

Ranked by defensibility, each tied to code that exists.

### 5.1 Pixel-level MAL (the one the labs structurally cannot copy)

Computer use is a screenshot loop. Every frame is a raw dump of whatever is on screen. `internal/mediaguard`
is already a fail-closed, zero-egress, in-cluster scanner whose founding design rule is that *sending media
to a managed API to protect it is exactly the egress we guard against*.

Wiring `Engine.Guard()` into the frame path before the frame reaches the model gives us: **the only
computer-use agent where the model never sees un-redacted pixels.** OpenAI and Anthropic cannot match this,
because their product requires the frame reaching their API. It is a business-model asymmetry, not an
engineering lead they can close.

### 5.2 Action-level authorisation, not domain-level

`DomainAllowed()` is the right primitive for navigation and the wrong one for interaction. Once the agent
is clicking, the domain has stopped being the unit of risk: a single allowlisted SaaS domain contains both
"export report" and "delete workspace". §7.4 introduces the element policy. Nobody else has an
authorisation primitive at this granularity because nobody else has an authorisation primitive at all.

### 5.3 Sealed, visually replayable sessions

Hash each governed action's frame and DOM snapshot into the existing hash-chained ledger, and surface them
through `assurance.Attestation` (which already carries `LedgerHead` tying the artifact to that chain). The
result is a session that provably reconstructs *what the agent saw and what it clicked*, signed.

This maps directly onto EU AI Act Article 12's reasoning-chain-reconstruction requirement for consequential
actions, and it is the direct answer to the Cowork audit-exclusion gap. Per Part G's survey, no compared
product makes this claim.

### 5.4 A real mid-session kill switch

Native and BYOF-hosted sessions already run as durable Temporal workflows, so cancelling an in-progress
session mid-click is genuinely cheap. This is the named monitoring-versus-control gap, closed by an
architecture we already run.

### 5.5 Simulate-then-commit for irreversible clicks

The risk moment in computer use is one click on "Delete", "Send", "Pay". GAL already models exactly this:
`RiskIrreversible` is always approval-forced, `SimStrategy` describes how a write can be previewed, and
`Reversible` requires a named `CompensatingAction`. §7.5 classifies the *target element* pre-click and
routes it through that machinery.

### 5.6 Credentials never enter the frame

Already the `browser_authenticated` design (vault injects into the container, credentials never leave the
vault). Extended: the frame the model receives has credential-bearing regions redacted by MediaGuard even
if a page renders a token in plaintext.

### 5.7 Customer-managed compute

`browserpool` is a plain Docker/K8s service, so the pool runs inside the buyer's own VPC under the existing
self-hosting story. This is Daytona's named differentiator falling out of infrastructure we already ship,
and it is the only viable answer for a bank that cannot send screenshots of internal systems to a US model
vendor. It compounds with the self-host moat in `docs/Actrone_Self_Hosting_Plan.md`.

### 5.8 Bring your own CUA model

Astra, Claude computer use and Grok all reach the loop through the existing model gateway and BYOK path. We
never own the frontier-model risk, we never have to win a benchmark, and every lab release upgrades our
product for free. Stated plainly in marketing: *we do not compete with the model, we make it deployable.*

---

## 6. Data model and migrations

Next free migration number is **`00139`** (`00138_notification_delivery_failures.sql` is current head).

**`00139_computer_use_sessions.sql`**

Extends the existing `browser_sessions` model (`00033_browser_sessions.sql`) rather than adding a parallel
table, per Part G §7.5.

- `ALTER TABLE browser_sessions ADD COLUMN`:
  - `surface text NOT NULL DEFAULT 'page'` — `page` (today's navigate-only lease) or `viewport`
    (interactive). Existing rows keep their meaning.
  - `element_policy jsonb NOT NULL DEFAULT '{}'::jsonb` — the resolved element policy (§7.4), stored so a
    replay can prove which policy was in force.
  - `frame_refs jsonb NOT NULL DEFAULT '[]'::jsonb` — ordered object-store pointers, one per governed
    action.
  - `dom_snapshot_refs jsonb NOT NULL DEFAULT '[]'::jsonb` — same, for DOM snapshots.
- New table `computer_use_actions`:
  - `id uuid pk`, `tenant_id uuid`, `session_id uuid references browser_sessions`, `task_id uuid`,
    `agent_id uuid`, `seq int`, `verb text`, `target_digest text`, `risk_class text`,
    `decision text` (`allowed` / `denied` / `escalated`), `frame_ref text`, `dom_ref text`,
    `content_hash text`, `receipt_id uuid`, `created_at timestamptz`.
  - Indexes on `(tenant_id, session_id, seq)` and `(tenant_id, task_id)`. Append-only: no `UPDATE`, no
    `DELETE`, matching the financial/audit discipline in `CLAUDE.md` §6.4.
  - `target_digest` is a **hash of the element descriptor, never the raw text**, so the audit row stays
    MAL-safe the way `mediaguard.Finding` already does.

Migration is backwards-compatible and reversible: the `ALTER` columns all have defaults, and the down
migration drops the new table and columns without touching existing session rows.

**Retention.** Frames are the most sensitive artifact this platform will ever store. They inherit the
tenant's existing residency routing (`internal/residency` / `regionpool`) and get an explicit per-tenant TTL,
defaulting to 30 days, with reveal gated behind the existing auditor-gated PII reveal path. This is an
§16 open decision, not a default to be assumed.

---

## 7. Backend architecture

### 7.1 `backend/browserpool` — extend the backend seam

`BrowserBackend` (`src/browserpool/browser/backend.py`) gains interaction verbs alongside `navigate`. The
existing seam is what makes this cheap: the real Playwright adapter and the in-memory
`FakeBrowserBackend` both satisfy the Protocol, so the pool logic stays unit-tested with no browser install.

```python
async def act(self, session_id: str, action: ActionRequest, *, timeout_seconds: float) -> ActionResult
async def capture(self, session_id: str, *, full_page: bool, max_bytes: int) -> CaptureResult
```

- `ActionRequest` is a closed union of `click` / `type` / `select` / `hover` / `key` / `scroll`, each
  addressing its target by **accessibility-tree reference or CSS selector, never raw pixel coordinates.**
  This is a deliberate governance decision, not an ergonomics one: a coordinate is unauditable, whereas a
  selector plus its accessible name and role is a describable, hashable, policy-checkable thing. It also
  makes the element policy in §7.4 possible at all.
- `CaptureResult` returns PNG bytes plus the accessibility-tree summary. Bounded by
  `BROWSERPOOL_MAX_FRAME_BYTES` (new, default 4 MiB) and rejected above it rather than truncated, since a
  truncated frame is a corrupt frame.
- Every verb re-checks the session's egress allowlist at the pool, exactly as `navigate` already does.
  Defence in depth is preserved: the orchestrator authorises first, the pool re-checks.

New API surface, matching the existing contract discipline in `README.md` and staying bound to
`internal/browser/httpmanager.go`:

| Method and path | Body | Reply |
| --- | --- | --- |
| `POST /sessions/{id}/act` | `{verb, target, value?}` | `{ok, settled, final_url, status}` |
| `POST /sessions/{id}/capture` | `{full_page}` | `{frame_b64, a11y_tree, truncated}` |

Errors keep the existing structured `{code, message}` mapping and the existing status semantics (`429` pool
saturated, `403` off-allowlist, `400` bad request, `502` failure). No new error philosophy.

New config (`BROWSERPOOL_` prefix, fail-fast validated like the rest): `MAX_FRAME_BYTES`,
`ACT_TIMEOUT_SECONDS` (default 15), `MAX_ACTIONS_PER_SESSION` (default 200, a runaway-loop bound).

### 7.2 `internal/browser` and the new `internal/computeruse`

- `internal/browser/service.go` gains `Act()` and `Capture()` beside `Browse()`, keeping the same shape:
  enforce the grant, authorise the target, perform, govern the output, never return ungoverned content.
- **New package `internal/computeruse`** owns what is genuinely new and does not belong in `browser`: the
  element policy engine (§7.4), the pre-commit classifier (§7.5) and the frame pipeline (§7.3). Pure Go,
  no I/O, table-testable, following the `internal/browser` precedent where tier enforcement and allowlist
  logic are pure and the session lifecycle is behind an interface.
- **New package `internal/computerusetool`** (sibling of `internal/browsertool`) registers the reserved
  tool name **`computer`** via `tool.Registry.Register`, resolves the agent's granted tier, and dispatches.
  One tool with a `verb` argument, not six tools, so the Supervisor's allowlist stays legible and an
  operator can revoke computer use in one entry.

### 7.3 The frame pipeline (the moat, in code)

Every frame that would reach a model goes through this, with no bypass path:

```
capture  →  MediaGuard Engine.Guard()  →  verdict
                                          ├─ pass      → frame to model
                                          ├─ redacted  → REDACTED frame to model (originals never sent)
                                          ├─ block     → ERR_GOVERNANCE_BLOCK, $0 model spend
                                          └─ escalate  → pause for Tier-3 approval
        →  seal (sha256) → objectstore.Put (SSE-KMS) → frame_ref → ledger
```

Non-negotiables, inherited from MediaGuard's existing design rather than reinvented:

- **Fail closed.** If the scan cannot complete, the action is blocked. An unscanned frame never reaches a
  provider. This is already `Engine.Guard()`'s behaviour; we must not add an "on error, continue" path.
- **The stored frame is the redacted one.** We seal and store post-redaction bytes. Storing the original
  would recreate the exact exposure we are selling protection from. If an auditor needs the original, that
  is what the auditor-gated reveal path is for, and it must be an explicit, logged, separately-authorised
  operation.
- **A computer-use policy defaults `detectors` to `["ocr_text_pii", "faces"]` and `action` to `redact`.**
  `mediaguard.Policy`'s zero value is disabled, which is the correct default for general media and the
  *wrong* one here, so the computer-use path supplies its own normalised policy and refuses to run with
  media governance disabled. Screenshot governance is not opt-in.
- Findings stay MAL-safe: entity types and confidences, never raw values, so ledger rows and log lines are
  safe to retain.

Cost is real and must be stated: MediaGuard on every frame of a 40-action session is 40 scans. §14 makes
frame-rate policy an explicit lever (capture on governed actions only, not continuously).

### 7.4 The element policy (the new governance primitive)

The gap: `DomainAllowed(url, allowlist)` cannot express "may click Export, may not click Delete".

The element policy is a per-agent, per-domain rule set evaluated against the **element descriptor** the
accessibility tree gives us (role, accessible name, and whether it sits inside a form). Shape:

```yaml
element_policy:
  - domain: "*.workday.com"
    allow_roles: [button, link, textbox, combobox]
    deny_name_patterns: ["delete", "remove", "deactivate", "terminate"]
    require_approval_name_patterns: ["submit", "approve", "pay", "send"]
```

Rules, all fail-closed to match `DomainAllowed`:

- An **empty policy denies all interaction** (observe still works). Same philosophy as the empty allowlist.
- Deny beats require-approval beats allow.
- A target whose descriptor cannot be resolved is denied, never guessed.
- Pattern matching is on the **normalised accessible name**, case-folded and whitespace-collapsed, and the
  matched name is hashed into `target_digest` for audit rather than stored raw.

Honest limitation, to be stated in the docs rather than discovered by a customer: this is a heuristic over
a hostile surface. A page can render a destructive button with a benign accessible name. It raises the bar
substantially and it is strictly better than a domain allowlist, but it is not a proof. The defence in
depth is that `computer_web_transact` still forces per-action human review regardless of what the policy
says, and GAL still forces approval on anything classified irreversible.

### 7.5 Pre-commit classification

Before any `click` executes, `internal/computeruse` classifies the target into a `gal.RiskClass`:

- Matches `require_approval_name_patterns`, or sits inside a form with a submit affordance → `RiskIrreversible`.
- Carries a detected monetary amount in the surrounding context → `RiskMoney` (amount extracted for the
  existing spend-cap gate).
- Otherwise → `RiskWrite`.

Then the existing GAL machinery runs unchanged: `RiskIrreversible` is always approval-forced,
`RiskMoney` is amount-gated and coverage-limited, and a receipt is written either way. We add a
classifier; we add no new governance engine. `SimStrategy` for a GUI click is `SimPredicted` at best
(we can describe what the click will probably do, we cannot dry-run it), which correctly forces approval
for anything consequential.

### 7.6 Mid-session interrupt

The session runs inside the durable Temporal workflow that already backs native and BYOF-hosted tasks, so:

- A cancel signal aborts before the next `act`, never mid-action.
- The workflow's cleanup path closes the pool session, which purges the `BrowserContext` and its
  credentials, exactly as `Service.Browse`'s deferred close already does.
- The kill is recorded as a ledger entry with the last `frame_ref`, so "what was on screen when we stopped
  it" is answerable.

Exposed to operators as a button in Control Tower (§11) and to developers as an SDK call (§9).

### 7.7 Attestation and replay

- Each `computer_use_actions` row carries a `content_hash` over `(verb, target_digest, frame_ref,
  dom_ref, decision)` and links to its GAL receipt.
- `assurance.AttestedAction` gains computer-use rows naturally: it already carries
  `{ActionID, Action, RiskClass, Outcome, Assured, Gaps, ReceiptHash}`, which fits a click without a schema
  change. `Connector` is set to `computer` for these rows.
- The signed `Attestation` therefore already covers the session via `LedgerHead`, with **no change to the
  attestation format and no break to the cross-language golden test.** This is the payoff of having built
  attestation generically.
- **Replay honesty:** a GUI session is replayable in the *reconstruct what was seen and done* sense, not
  the *deterministically re-execute* sense. Say this in the docs and the UI. Overclaiming here is the
  fastest way to lose an auditor's trust, and the reconstruction claim is already stronger than anything
  a competitor offers.

---

## 8. The model layer: bring your own CUA

No new model plumbing. A computer-use agent declares its model through the existing gateway, so Astra,
Claude computer use, Grok, or a self-hosted VLM all work, subject to the existing constraint in
`docs/Actrone_Model_Catalog_GLM_Kimi_and_Thinking_Controls_Plan.md`: **no direct API to Chinese models,
aggregator or self-host only.**

The one addition is a per-frame **model-input receipt**: which model, which frame refs, which MediaGuard
verdict. This is what lets a customer answer "did OpenAI ever see our patient data" with evidence rather
than a policy assertion, and it is the single most valuable artifact in this plan for a regulated buyer.

---

## 9. SDK parity (TypeScript + Python, no Go)

Per the parity rule, a client-facing change lands in **both** SDKs against one contract with contract
tests. The Go SDK is deleted and gets nothing.

New surface, mirrored in `actrone-py/src/actrone/client.py` and `actrone-ts/src/client.ts`:

| Method | Purpose |
| --- | --- |
| `open_computer_session(agent_id, *, surface, element_policy=None)` | Lease a governed session. |
| `computer_act(session_id, verb, target, value=None, *, idempotency_key=None)` | One governed action. Returns the decision, the risk class and the receipt id. |
| `computer_capture(session_id, *, full_page=False)` | A MediaGuard-governed frame. |
| `close_computer_session(session_id)` | Explicit teardown (sessions also sweep). |
| `cancel_computer_session(session_id)` | The kill switch. |
| `get_computer_session_replay(session_id)` | Ordered actions with frame refs and the attestation link. |

Conventions that are not optional, because the rest of both SDKs already hold them:

- `X-Request-Id` set per outbound request with a fresh UUIDv7, echoed on every raised exception.
- Idempotency keys auto-generated per call as UUIDv7 and **echoed on the response object**, with the
  docstring repeating the standing warning that a retry loop must pass the *same* key. A replayed click
  that dedupes incorrectly is a double-submit of a form, which is exactly the failure this platform exists
  to prevent.
- Structured domain errors: `ERR_COMPUTER_TIER_NOT_GRANTED`, `ERR_COMPUTER_ELEMENT_DENIED`,
  `ERR_COMPUTER_APPROVAL_REQUIRED`, `ERR_GOVERNANCE_BLOCK` (reused from MediaGuard).
- Harness support: the stepwise drivers need no change, because a computer action is a `tool_request`
  boundary and `approval_gate` already exists for the escalation case. This is worth verifying early as a
  contract test rather than assuming.

---

## 10. Phase 0: the thing we can ship before any of this

`authorize_tool()` already exists in both SDKs and pre-flights a proposed call through the Supervisor's
pre-execution checks (allowlist, rate limit, spend cap, injection and SSRF sanitisation) **without
executing it**, explicitly for the case where the developer's framework runs the tool in its own process.

So a developer running an Astra CUA loop on their own machine can, today, call `authorize_tool()` before
every click and receive governance, audit and a spend gate, with Actrone executing nothing.

What Phase 0 needs is not code, it is a **documented recipe plus one example repo**:

1. Register an agent with an `allowed_tools` policy naming `computer.click`, `computer.type` and friends.
2. Call `authorize_tool()` before each action from the CUA loop.
3. Honour `PermissionDeniedError` by not performing the action.
4. Ship the frames through `call_tool` against a MediaGuard-backed scan endpoint (this one *does* need a
   small endpoint, and it is the only Phase 0 code).

This gives us a credible "governed computer use, with the model you already chose" story within days of
the Astra launch, and it doubles as the design validation for Phases 1 to 3. It should ship first.

---

## 11. Frontend (Control Tower)

Brand is LOCKED. Monochrome, Geist, sentence case, `lucide-react` at `strokeWidth={1.5}`, tokens only, no
hardcoded colour or spacing, no live-status dot in any form.

- **New route `(app)/computer-use/`**: live sessions, and a session detail view.
- **Session replay view.** The flagship screen: an ordered action timeline, each step showing the governed
  frame, the verb, the target's accessible name, the risk class, the decision, and the MediaGuard verdict.
  Redacted regions are visibly marked as redacted, not silently blacked out, because "governance did
  something here" is the product.
- **Kill switch.** A destructive-styled control (`--color-error`, the one sanctioned red use) that cancels
  the running session, with a confirmation step.
- **Approval queue integration.** A `computer_web_transact` pause surfaces in the existing escalation queue
  with the frame attached. The approver sees what the agent sees. Reuse the existing queue, do not build a
  second one.
- **Element policy editor** in Agent Studio, sitting beside the existing domain allowlist, with the
  fail-closed semantics stated in the UI copy (an empty policy denies all interaction), so an author cannot
  misread silence as permission.
- Mandatory per `CLAUDE.md` §8.2: designed loading, error and empty states on every one of these. The empty
  state for the session list is a real design task, not a placeholder, since it is the first thing every
  evaluator sees.

Accessibility note with some irony to it: a product built on the accessibility tree must itself meet WCAG
AA. Frames need meaningful alt text describing the governed action, not `alt="screenshot"`.

---

## 12. Desktop surface (Phase 4, scoped, NOT committed)

Recorded so the decision is deliberate rather than drifted into.

To support thick-client apps we would need: a VM pool service (the `browserpool` architecture applied to
microVMs), golden image management, per-tenant VM isolation stronger than a browser context, guest OS
licensing, a video-rate frame pipeline, and input injection at the OS level. Firecracker is the right
isolation tier, matching the reasoning already recorded in Part G §7.4 for code execution.

The governance layer designed above transfers almost entirely: the frame pipeline, GAL classification,
attestation and the kill switch are all surface-agnostic. What does not transfer is the element policy,
because there is no accessibility tree to lean on in an arbitrary desktop app, so the pre-commit classifier
would fall back to OCR over the frame. That is a materially weaker guarantee and would need to be sold as
such.

**Gate:** do not start this without a named design partner with a real workflow that a browser cannot reach.

---

## 13. Testing strategy

Per `CLAUDE.md` §7, error paths tested with the same rigour as happy paths.

- **Unit (pure, table-driven).** Element policy evaluation including every deny-precedence case and the
  unresolvable-target case; risk classification; tier enforcement; frame-size bounds. All in
  `internal/computeruse`, no I/O.
- **Fail-closed suite (the one that matters).** Explicit tests that each of these *blocks*: MediaGuard
  unavailable, MediaGuard errors, media policy disabled, empty element policy, unknown element role,
  missing tier grant, object store unavailable. Each asserts no frame reached the model and no action
  executed. This suite is the executable form of the product claim.
- **Pool integration.** Against the real Playwright backend and a local fixture server, following the
  existing `-m integration` pattern so CI without a browser install still passes.
- **Contract.** The `browserpool` wire shape against `httpmanager.go`, and both SDKs against the endpoint
  contract. The existing `ci-browserpool.yml` workflow extends rather than gains a sibling.
- **Drift.** Extend `TestCapabilityToolCatalog_CoversAllCapabilities` so the three new capabilities cannot
  land in one place and not the other.
- **Attestation golden.** Extend the existing cross-language golden with a computer-use action row, proving
  the format did not break.
- **E2E (thin).** One Playwright journey: grant, act, get denied by policy, escalate, approve, replay.
- Determinism throughout: no `sleep`, fake clocks, no shared mutable state.

---

## 14. Phasing

| Phase | Content | Gate to proceed |
| --- | --- | --- |
| **0** | `authorize_tool()` recipe, example repo, frame-scan endpoint | Ships standalone. Do this first. |
| **1** | `browserpool` verbs + capture, `internal/computeruse`, `computer` tool, migration `00139`, frame pipeline | Fail-closed suite green |
| **2** | Element policy, pre-commit classification, GAL wiring, approval queue integration | An external reviewer tries to get a destructive click past the policy |
| **3** | Attestation + replay UI, kill switch, SDK parity both languages, docs | Attestation golden green in both languages |
| **4** | Desktop surface | Named design partner only |

Frame-rate policy is decided in Phase 1 and is a real cost lever: **capture on governed actions only**, not
continuously. A continuous capture loop multiplies MediaGuard cost, storage and residency exposure for
marginal governance value.

---

## 15. Not in scope for v1

- A computer-use model of our own. Permanently out of scope, and saying so is part of the positioning.
- Pixel-coordinate targeting. Excluded by design (§7.1), not by omission.
- Continuous video capture.
- Third-party certification of the isolation claims. Ship, build a track record, then pursue, the same
  discipline applied to the guardrail benchmark and Gate E.
- Any "beats OpenAI CUA" claim. We have not run a comparative benchmark, and the standing rule is no
  competitive superiority claims until an operator has run one. The claims in §5 are about *governance
  properties*, which are structural and verifiable, not about task success rates, which are not.

---

## 16. Open decisions

1. **Frame retention default.** 30 days proposed. This is the highest-sensitivity artifact the platform
   will hold and the answer is probably per-tenant and contractual, not a product default.
2. **Does `computer_web_observe` imply `browser_read_only`?** Proposal: no. Keep them independent so an
   existing agent's grants never silently widen.
3. **Element policy authoring.** Hand-written YAML in Phase 2, or learned from an observation run and then
   approved by a human? The latter is a much better product and a much larger build.
4. **Frame storage location under residency.** Frames follow the tenant's data plane, but confirm whether
   any tenant's contract forbids screenshot retention entirely, in which case we need a
   scan-and-discard mode that keeps only the hash.
5. **Pricing.** A governed frame has real marginal cost (MediaGuard compute plus storage). Metering exists
   (`internal/billing` usage events), so decide whether the meter is per action, per frame, or per session
   minute before Phase 1 rather than retrofitting it.

---

## 17. Risks, stated plainly

- **The element policy is a heuristic over a hostile surface.** A page can lie about an accessible name.
  Mitigated by defence in depth, not eliminated. Do not let marketing describe it as a guarantee.
- **MediaGuard's false-negative rate on real screenshots is unmeasured.** The engines are built but the
  model weights are still a deploy gate, and no evaluation has been run against screenshot-shaped input
  (dense UI chrome, small text, partial occlusion) as opposed to documents and photos. **Measure this
  before making the pixel-level claim publicly.** It is the load-bearing claim of the entire plan.
- **Latency.** A MediaGuard scan sits in the critical path of every action. If it costs seconds per frame,
  the agent is unusable for interactive work regardless of how well governed it is. Profile in Phase 1;
  this is a viability question, not an optimisation.
- **Scope gravity toward the desktop.** Every demo the labs publish will be cross-application, and there
  will be steady pressure to chase it. The §12 gate exists to resist that.
- **We are building on an unshipped deployment.** `browserpool` needs
  `ORCHESTRATOR_MCP_BROWSER_POOL_URL` configured, and the browser tool is dormant until it is. Phase 1
  should not begin before the pool is actually running somewhere.

---

Last updated: 2026-09-04 | Owner: Matt | Status: draft for review

---

## 18. Amendment (2026-09-09): gaps found by reading the code against this plan

Added after a verification pass. Everything below is either a gap this plan does not currently
close, or a correction to something it assumes. None of it changes the plan's architecture; all of
it has to be done for browser and computer-use agents to be production-grade and usable from both
the SDK and the platform generally.

### 18.1 The existing `browser_*` tiers grant actions the runtime cannot perform

This is the most important finding, and it is a live overclaim rather than a missing feature.

`internal/agent/capability_tools.go` registers four browser capabilities, and all four resolve to
the single reserved `browsertool.ToolName`:

```
browser_read_only · browser_authenticated · browser_form_submit · browser_autonomous
```

`backend/browserpool` implements exactly one verb:

```
start · ready · open_context · navigate · close_context · shutdown
```

There is no click, no type, no extract, no screenshot. So an agent can be granted
`browser_form_submit` today and **there is no form-submit action for it to perform**. The manifest
promises a capability the runtime does not have.

§4 of this plan deliberately leaves `browser_*` untouched so that "no existing agent silently
gains the ability to click", which is the correct safety decision and should stand. But leaving the
names as they are means the platform keeps advertising three capabilities that do nothing, in a
codebase whose whole argument is that a declared grant is enforced. That is exactly the kind of
gap this product exists to make impossible elsewhere.

**Task, to be done independently of Phase 1 and preferably before it:** collapse the browser
ladder to what it can actually do, and reserve the rest.

- Keep `browser_read_only`, whose meaning ("fetch a page's text") matches `navigate`.
- Deprecate `browser_authenticated`, `browser_form_submit` and `browser_autonomous`: reject them at
  manifest parse with an error naming the `computer_web_*` capability that replaces each, rather
  than silently accepting a grant that does nothing.
- The drift test in `capability_tools_test.go` plus `domain.CapabilityNames()` and the FE mirror
  `frontend/apps/control-tower/src/lib/agent-capabilities.ts` all move together, as §4.3 requires.

A migration note belongs in the deprecation: any agent currently declaring one of the three gains
nothing today, so removing it changes no behaviour. That is worth stating in the release notes
precisely because it sounds like it should.

### 18.2 SDK surface for the EXISTING browser tool is missing

§9 specifies the SDK methods for `computer_*`, which is right, but no method exists today for the
browser tool that already ships. A developer using the native SDK cannot drive a governed
navigation at all; they declare the capability in the manifest and the agent may use it during a
run, but there is no client call.

**Task:** add `browse(agent_id, url)` to both SDKs alongside the `computer_*` surface, returning
the governed fetch result and the egress decision. It is a small addition, and without it "browser
agents can be built with the SDK" remains untrue even after Phase 1 ships the richer verbs.

### 18.3 Phase 0 needs one endpoint, and that endpoint does not exist yet

§10 is correct that `authorize_tool()` already exists in both SDKs (verified:
`actrone-py/src/actrone/client.py` and `actrone-ts/src/client.ts`), so a developer running their
own CUA loop can pre-flight every click today.

What §10 lists as "the only Phase 0 code" is a MediaGuard-backed scan endpoint for frames. There is
no such HTTP route today: MediaGuard is wired as Activity 0.5 inside the task workflow, reachable
only from a governed run, not from a developer's own loop.

**Task, and it should ship first as §10 says:**

- `POST /v1/mediaguard/scan` accepting an image and returning the redacted frame plus the finding
  set. Bounded body, rate-limited per tenant, agent-scoped so the frame is attributed.
- `scan_frame(agent_id, image)` in both SDKs.
- The documented recipe and one example repo. This is the deliverable, not the endpoint: the
  endpoint without the recipe gives a developer a URL and no reason to call it.

Sequencing note: Phase 0 is the only part of this plan that produces a credible governed
computer-use claim without new infrastructure. It should not wait behind Phase 1.

### 18.4 What remains after Phase 1, stated so it is not discovered later

Completing §7 through §9 makes `computer_web_*` real and SDK-reachable. These stay open:

- **Desktop.** `computer_desktop_*` is scoped in §12 and explicitly not committed. Thick-client
  workflows remain unbuildable, and that should be said plainly in any external claim, because
  "computer use" reads to most buyers as "a computer", not "a browser viewport".
- **The CUA model.** §8's bring-your-own position is right, but it means an out-of-the-box
  computer-use agent does not exist: a tenant must configure a model endpoint before any of this
  runs. The first-run experience needs a documented default, or the capability looks broken.
- **Element policy authoring.** §7.4 introduces the element policy as a new governance primitive.
  A primitive needs a place to be authored, reviewed and promoted, exactly as topic rails now have
  (`internal/topicrail`, accuracy-gated promotion). Without that it is a JSON blob passed to
  `open_computer_session`, which is a worse version of a control the codebase already knows how to
  build properly.
- **Frontend.** §11's Control Tower work is real design effort against the locked monochrome
  system, and is not covered by any of the above.

### 18.5 Two smaller corrections

- **§9's harness note should be a test, not an assumption.** It says the stepwise drivers need no
  change "because a computer action is a `tool_request` boundary", and adds that this is "worth
  verifying early as a contract test rather than assuming". Promote that from a parenthetical to a
  named Phase 1 exit criterion: a BYOF-hosted agent performing a governed click is the interop
  claim, and an untested assumption about the harness is where it would fail.
- **Session lifetime is unbounded in the current text.** §7.6's kill switch covers deliberate
  interruption, but nothing states a maximum session duration or an idle sweep beyond a passing
  mention in §9. A browser session holds a real browser context; it needs an explicit ceiling and a
  sweep, in the same shape as the other bounded resources in this codebase.

### 18.6 Suggested order

1. §10 Phase 0, including the scan endpoint and the recipe. Days.
2. §18.1 browser capability honesty. Small, and it removes a live overclaim.
3. §18.2 `browse()` SDK method. Small.
4. §7 to §9 Phase 1 proper, with §18.4's element-policy authoring folded in. Weeks, as stated.
5. §11 frontend.
6. Desktop only on a named design partner, per §12.

## 19. Amendment (2026-10-04): a third executor on the user’s own device

The Actronauts plan (`Actrone_Personal_Agents_Implementation_Plan.md`, section 8.5) adds a desktop app whose Rust device host acts on the owner’s own machine. It is a third executor for the same `computer` tool, not a separate system:

| Capability family | Executor | Where it runs | Status |
| --- | --- | --- | --- |
| `computer_web_*` | `backend/browserpool` | Actrone’s cloud browser | Phase 1 of this plan |
| `computer_device_*` | The Rust device host in the Actronaut desktop app | The owner’s own Windows, macOS or Linux machine | Actronauts plan, phase P2 |
| `computer_desktop_*` | The VM pool in §12 | Actrone’s cloud virtual machines | Scoped, not committed |

Everything in §7.3 to §7.7 applies to `computer_device_*` unchanged: the frame pipeline (MediaGuard before any model sees a frame), the element policy, pre-commit classification, the mid-session interrupt, attestation and replay. Two differences matter:

- **The accessibility tree exists.** §12 worries that an arbitrary desktop app has no accessibility tree. On a real desktop, UI Automation on Windows, the AX API on macOS and AT-SPI on Linux expose role and accessible name for most native apps, so the element policy works as it does in the browser. Apps that expose nothing fall back to OCR and are marked as the weaker guarantee
- **The stop is local too.** The device is the owner’s, so the device host also stops input between keystrokes on a hotkey or a spoken “stop”, without waiting for the cloud

Because `computer` is one kernel tool, every agent type granted it gets it: Work and Personal Actronauts, SDK agents and framework agents. Phase 0 and Phase 1 of this plan are prerequisites for the Actronauts phase P2.

### 19.1 Addendum (2026-10-04): a fourth executor in the owner’s own browser

The Actronauts plan (section 8.5, decision D12) adds a browser extension for Chrome and Edge, then Firefox. It is a fourth executor for the same `computer` tool:

| Capability family | Executor | Where it runs | Status |
| --- | --- | --- | --- |
| `computer_browser_*` | The Actronauts browser extension | The owner’s own browser tabs, with their existing logins | Actronauts plan, phase P2 |

§7.3 to §7.7 apply unchanged. Three differences matter:

- **The DOM is available.** The extension reads the page’s DOM and accessibility tree directly, so element-level authorization by role and accessible name works as in `computer_web_*`, without OCR
- **The sessions are real.** The owner’s logged-in sites are reachable, which raises the stakes compared with the cloud browser’s sealed vault. Logged-in sites start on the ask list, the lethal-trifecta guard applies to every page, and banking, password managers and health portals are excluded by default
- **The stop is in the tab.** Any click or keystroke from the owner pauses the extension at once, and the kill switch revokes its lease like any other device
