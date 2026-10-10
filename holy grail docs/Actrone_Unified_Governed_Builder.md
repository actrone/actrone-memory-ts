# Actrone — One No-Code Builder: folding GAL + Governed Actions into EMAOP

> **Decision doc.** We already have a no-code builder (EMAOP). We must NOT ship a second one for
> "governed actions." This synthesises a three-part codebase analysis (agent-builder frontend,
> integrations/action frontend, backend agent/GAL seam) into a single-builder design: what merges,
> what stays separate, and the one missing primitive that makes it work.
>
> Companions: `docs/Actrone_Governed_Action_Studio.md` (vision — now reframed by this doc),
> `docs/Actrone_Governed_Action_Studio_Build_Plan.md` (WS1–3), `docs/Actrone_Governed_Action_Layer_Strategy.md`.

> **Status refreshed 2026-07-13 (code-verified), scoped to the connector/GAL claims this doc makes
> (SDK/channel/voice content is out of this doc's scope):** this doc's core technical claim — that
> `connector.EndpointAction` carries `gal.WriteActionSpec` (risk class/reversibility/sim/dry-run) at
> per-connector-action granularity, exemplified by `erp:oracle-netsuite`/`post_journal` — is confirmed
> accurate against the current code: `backend/orchestrator/internal/connector/erp.go` and `hris.go`
> now author exactly this kind of `ActionWrite` entry against `gal.WriteActionSpec`
> (`internal/gal/action.go`), and `write.go` implements the `WriteAdapter`/`DryRunAdapter` this doc's
> model assumes — see `Actrone_Connector_Integration_Depth_Plan.md`'s 2026-07-13 status note for the
> full build-out. This doc's own gap analysis (no per-agent action-binding object; `IntegrationSelector`
> catalog drift; no post-create edit) was not re-audited in this pass — **(unverified 2026-07-13)**
> whether those specific frontend/binding gaps still stand.

---

## 1. What the analysis found (grounded)

**The EMAOP agent builder** (`/agents/new/studio`, `components/features/agent-studio/*`) is a 5-step
wizard: Template → Persona → **Capabilities** → **Integrations** → Rules & Deploy. It already has
**three overlapping ways to attach "actions"** to an agent, none of them a typed governed action:
1. a fixed 13-item **capability** catalog (verb grants like `send_email`);
2. a **custom capability** with a **free-text `binding` string** (`"stripe.refunds or mcp:billing"`) +
   scopes + guardrail lines — the closest thing to "define an action," but untyped;
3. **connector selection** (toggles a system name onto the agent; does not bind operations).
There is **no GAL surface anywhere in the frontend** and the sandbox step is a hardcoded fake.

**The "action/connection" frontend is itself fragmented** across `/integrations` (which hosts the
`CustomConnectorBuilder`), `/mcp`, and `/tools` — three fronts over largely the same backend — plus
governance scattered across `/governance`, `/audit`, `/escalations`, `/rules`, `/compliance`. The
`CustomConnectorBuilder` already authors actions as `{name, kind: read|write|event, method, path}` +
per-field MAL classification, but carries **zero write-action governance** (no risk class,
reversibility, simulation/dry-run, purpose).

**The backend ownership is already cleanly layered** (this is the good news):
- **Connector-action (tenant catalog):** `connector.EndpointAction` → `gal.WriteActionSpec` carries
  risk class / reversibility / sim / dry-run / amount — *per connector action, tenant-level*.
- **Tenant policy:** `gal_commit_policy` (money limits, approve-all) + `purpose_policy` — *per tenant*.
  Notably `gal_commit_policy` already **accepts `connector_id`/`action` but ignores them** — it was
  designed to become per-action later.
- **Agent:** `GovernanceSpec` (one `Purpose` string, MCP/Media governance) + coarse `AgentCapabilities`
  verb flags + the `spec.tools` allow-list (**which connectors**, at `connector/{id}` granularity).

**The pivotal finding:** an agent is scoped to **which connectors** it may touch, but **never to which
action** within one. The specific write is a runtime, model-chosen arg gated **only tenant-wide**.
There is **no per-agent action-binding object**, and a connector write isn't even tied to an
`AgentCapabilities` flag. Capability packs + self-describe attach governance to the **connector/tenant**
and **never reference an agent**.

---

## 2. The decision — one experience, two planes, one new primitive

**Do not build a second builder. Unify.** The clean way to unify — and the reason the codebase already
half-supports it — is to recognise there are **two authoring planes that must stay distinct in DATA but
become one in EXPERIENCE**:

- **Plane A — the Governed Action Catalog (tenant-level, reusable).** "What governed actions exist" =
  connections + their governed read/**write** actions (risk/reversible/sim/dry-run) + field
  classifications + tenant policy + signed capability packs. Authored **once per tenant, reused by every
  agent.** This is where the "Governed Action Studio" work lives — as an **enhancement of the existing
  `CustomConnectorBuilder`**, not a new page. A governed action is a **reusable object**, exactly like a
  capability pack; you must not re-author NetSuite governance inside every agent.

- **Plane B — the Agent (per-agent composition).** The EMAOP builder. It **composes** governed actions
  from the catalog and adds the per-agent envelope (purpose, ceilings, approvals).

**The one missing primitive** (which the whole unification hinges on, and which the backend analysis
proved absent): a **per-agent governed-action binding** on `AgentSpec`:

```jsonc
// new: spec.governed_actions  (per-agent, composes the tenant catalog)
[
  { "connector_id": "erp:oracle-netsuite", "action": "post_journal",
    "purpose": "month-end-close",
    "risk_ceiling": "money",            // optional per-agent NARROWING (never widening)
    "require_approval": true }          // optional per-agent override (only stricter)
]
```

This is what turns "capability × connector" (today's loose join via a free-text string) into a **typed,
governed, per-agent action grant**. It hangs on seams that already exist and were built for it: the
Supervisor allow-list, the per-action `WriteActionSpec`, and `gal_commit_policy.PolicyFor` (which already
takes `connector_id`/`action`). Invariant: a per-agent binding may only ever be **equal to or stricter
than** the tenant catalog/policy — never a way to loosen governance.

---

## 3. What merges, what stays, what's new

### Merges (collapse the redundancy the analysis found)
- **Agent-builder Step 3 (Capabilities) + Step 4 (Integrations) → one "Actions & Connections" step.**
  Replace the free-text custom-capability `binding` with a **typed picker over the Governed Action
  Catalog** + an inline "author a new governed action" affordance that writes to the catalog (Plane A).
- **`/integrations` + `/mcp` + `/tools` → one "Connections & Actions" resource** (Plane A's home). Three
  fronts over one backend today; make it one catalog with connect + action-authoring + tool approval.
- **The "Governed Action Studio" folds into Plane A** — it is *not* a standalone destination. Its stages
  map onto existing surfaces: Import/Classify/Author-governance/Publish → enhanced connector builder +
  capability packs; Policy → `/rules` + `gal_commit_policy`; Operate/Observe → `/governance` +
  `/escalations`.

### Stays separate (correctly)
- **Catalog data ≠ agent data.** A governed action is authored once (Plane A) and referenced by many
  agents (Plane B). Keep the two data models distinct even though the *experience* is one flow.
- **BYOF/native build modes** stay as-is (they're a runtime concern, not authoring).
- **Agent-File marketplace** stays distinct from the connector/action catalog (different artifacts).

### New (the minimal net-new set)
1. **`spec.governed_actions`** per-agent binding (§2) + Supervisor enforcement (gate the specific action,
   not just the connector) + `gal_commit_policy` honouring per-agent `connector_id`/`action` overrides.
2. **Write-governance fields on the connector/action authoring** (this is Build-Plan **WS1**, now framed
   as *enhance `CustomConnectorBuilder`*, not a new UI).
3. **A real "Simulate" step.** The builder's fake `SandboxValidation` becomes a live **governance
   preview** that calls the now-real dry-run/read-back + `gal.Evaluate` — "pay $500 → auto-commit; $50k →
   blocked; delete → approval." This is the single highest-trust upgrade and it's now possible because
   the vendor-sandbox/read-back simulate is built.

---

## 4. The unified flow (one builder, end to end)

```
CONNECTIONS & ACTIONS  (Plane A — tenant catalog, authored once)
  connect system (preset / custom / MCP)
    → self-describe classifies fields (P4)
    → author governed actions: kind + method + path + risk/reversible/sim/dry-run/purpose  ← WS1
    → publish as signed capability pack (optional, shareable)               ← existing

AGENT BUILDER  (Plane B — composes the catalog)
  Template → Persona
    → ACTIONS & CONNECTIONS  (merged step)
         pick governed actions from the catalog (typed)                      ← replaces free-text binding
         set agent Purpose + optional per-agent ceiling/approval             ← new spec.governed_actions
         [inline] author a new governed action → writes to Plane A
    → SIMULATE  (real governance preview: dry-run/read-back + gate verdict)   ← replaces fake sandbox
    → Rules & Deploy  (per-agent overrides surfaced from tenant policy)
```

Everything an agent may do is now a **typed, governed, previewable, per-agent action grant** composed
from a **reusable, signed catalog** — one builder, no second UI.

---

## 5. Fixes this unification also lands (half-built surfaces the analysis flagged)

- **`build_mode` is neither emitted by the wizard nor persisted** — fix as part of the builder rework.
- **No post-create edit** of an agent's capabilities/connectors/rules — the merged "Actions &
  Connections" step must be editable on `/agents/[id]`, not create-only.
- **Create/edit field divergence** (`spec.reasoning_effort` vs `spec.personality.*`; system_prompt/
  temperature never emitted) — reconcile the manifest contract.
- **Hardcoded connector catalog** in `IntegrationSelector` that drifts from the backend registry — the
  merged catalog must be **fetched**, not hardcoded.
- **Fake `SandboxValidation`** → real simulate (see §3.3).

---

## 6. Build sequencing (revised — supersedes the standalone Studio ordering)

1. **WS1 (foundation):** expose write-governance on the connector API/DTO + **enhance
   `CustomConnectorBuilder`** to author it. (Plane A becomes real.)
2. **Per-agent binding primitive:** add `spec.governed_actions` + Supervisor action-level enforcement +
   `gal_commit_policy` per-agent honouring. (Plane B can now compose Plane A.)
3. **Merge the agent-builder Steps 3+4** into "Actions & Connections" over the typed catalog; make it
   editable post-create.
4. **Real Simulate step** (governance preview) — highest-trust, now unblocked by the built dry-run.
5. **Consolidate `/integrations` + `/mcp` + `/tools`** into one "Connections & Actions" resource.
6. **One curated vendor vertical** (Build-Plan WS2) + **OpenAPI/AI import** (WS3) feed the same catalog.

---

## 6a. GAL is for the SDK too — governance is a runtime substrate, not a builder feature

Governance is enforced at **runtime** (tool supervisor + `gal.Service`), so it applies to every agent
regardless of authoring surface — no-code EMAOP, SDK-native Agent-File, or BYOF framework. All three
emit the **same** representation (`spec.governed_actions` + connector specs + capability packs), and the
authoring APIs are **SDK-first, no-code on top**. Governance guarantee by build mode:

| Build mode | Where the loop runs | Governance guarantee |
| --- | --- | --- |
| `native` | Actrone kernel (durable) | **Airtight** — every tool/connector/model call mediated. |
| `byof_hosted` | Actrone kernel (durable Temporal) | **Airtight** — same as native; no bypass possible. |
| `byof_connected` | **developer's process**, calls Actrone as a gateway | **Governed for everything routed through the gateway** (model, `connector/{id}` writes, memory). The only ungoverned path is the developer's own code making a **direct side-channel call to a vendor** — which never enters Actrone's action layer (and forfeits Actrone's receipts/rollback/simulate for that call). The SDK/connectors never bypass. |

**Guidance:** an org needing *provable* governance on every action chooses `native`/`byof_hosted`
(loop runs in Actrone). `byof_connected` is a latency/convenience mode with a weaker guarantee.

**Custom vs built-in:** purposes are tenant-defined strings (matched against tenant-authored
`purpose_policy` bindings — not a code enum); governed actions are both **curated by us** (presets +
signed packs) and **custom per-org** (custom connectors + inline-authored actions); rules/limits are
org-authored (`/rules`, `gal_commit_policy`, `purpose_policy`). Only the legacy coarse capability
verb-flags are code-fixed — superseded by the typed governed-action catalog.

**Operate/observe is authoring-agnostic:** the operator surfaces (`/agents/[id]`, `/governance`,
`/governance/audit`, `/governance/escalations` approvals, `/cost`, `/usage`, posture, rollback) read
from the **runtime** (ledger/receipts/approvals), so an SDK- or BYOF-authored agent gets the same
Control Tower. (Trace *depth* varies: native/hosted expose the full loop; connected shows what's routed
through the gateway — but actions, receipts, approvals, cost are visible in all modes.)

## 6b. Cross-cutting dependency — the Requirement Gate (just-in-time provisioning)

The unified builder must feel seamless: any step that needs a prerequisite the user hasn't set up yet
resolves it **inline**, not by sending them elsewhere. Build one reusable **Requirement Gate** primitive
(a.k.a. just-in-time provisioning / inline setup), distinct from first-run onboarding. **Full
platform-wide design + grounded inventory: `docs/Actrone_Requirement_Gate_Design.md`** (it generalises
the existing `EntitlementDenialGate` + env-promotion `ReadinessGate` machinery, and lists all 16+
trigger points across builder, integrations, tasks, deploy, promotion, compliance, SDK onboarding).

> **detect** a missing prerequisite → **offer** the resolution inline *with transparent tradeoffs/cost*
> → **resolve** without leaving the flow → **persist** it to the org → **continue.**

Not model-specific — it resolves a missing **model** (BYOK-vs-managed with transparent per-token cost),
**connector** (connect inline in the Actions step), **credential**, or **tier** (the existing
`UpgradeModal` is a narrow instance). Today the pieces are split (`ModelPicker` is managed-only, billing
hardcoded `"managed"`; a BYOK plan; `UpgradeModal`). The Actions & Connections step (§4) and the
model/persona step both **depend** on this primitive — build it as shared infrastructure, invoked as
`RequirementGate({ need: "model" | "connector" | "credential" | "tier", … })`.

## 7. Answer to "merge or synergy?"

**Merge the experience; keep two data planes; add one primitive.** There is exactly **one no-code
builder** (the agent builder), the Governed Action Studio becomes the **catalog-authoring layer inside
Connections** (not a destination), governed actions are **reusable signed objects** agents compose, and
the new `spec.governed_actions` binding is the primitive that finally scopes governance **per agent** —
which the platform cannot express today. This removes redundancy (three connect surfaces → one; two
"define an action" concepts → one typed one), makes governance **visible and previewable** inside the
builder people already use, and keeps a single governed representation from catalog to agent to receipt.
