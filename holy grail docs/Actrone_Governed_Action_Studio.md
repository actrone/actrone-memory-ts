# Actrone Governed Action Studio — Holistic Design & Use-Cases

> **⚠️ Reframed by `docs/Actrone_Unified_Governed_Builder.md` (2026-07-03).** The "Studio" is **NOT a
> second no-code builder.** A three-part codebase analysis confirmed we already have one (EMAOP) and
> that the action/connection frontend is itself fragmented (`/integrations` + `/mcp` + `/tools`). The
> Studio therefore folds in as **(a)** the governed-action *catalog-authoring layer inside Connections*
> (an enhancement of the existing `CustomConnectorBuilder`) and **(b)** a *typed "Actions & Connections"
> step inside the EMAOP agent builder* that composes that catalog — plus one new primitive,
> `spec.governed_actions` (per-agent action binding). Read the unification decision doc first; the
> stages below are the *capabilities*, not a separate destination.
>
> The lifecycle that turns a raw enterprise API into a **governed, agent-operable, reversible,
> audited action** — and then operates it. This is the self-serve on-ramp to the Governed Action
> Layer (GAL) moat. It is deliberately **not** a "write-action form"; it is the *lifecycle* of a
> trusted action, and the operational cockpit around it.
>
> Companion to `docs/Actrone_Governed_Action_Layer_Strategy.md`. Status: **design/vision** — most of
> the *engine* below is built (GAL P0–P5); the *authoring + operator UX* and the API/SDK surface to
> reach the governance metadata are the net-new work, called out honestly per section.
>
> **Status refreshed 2026-07-13 (code-verified):** confirmed still accurate — the WS1 API/SDK DTO
> gap described in §1.3 is closed (see `Actrone_Governed_Action_Studio_Build_Plan.md`'s own refresh
> note). One operational caveat this doc doesn't state: the GAL engine it builds on
> (`cfg.GAL.Enabled`) and the MAL/DPE pipeline underneath it (`cfg.EMAOP.Enabled`) both **default to
> off** in a fresh deployment — see the strategy doc's refresh note for the exact wiring. The
> lifecycle stages themselves (§1) are unaffected; this only matters for "is this live in my
> deployment" questions.

---

## 0. The reframe — why this is one thing, not many pieces

A write endpoint is a **commodity**: anyone (Zapier, n8n, Merge) can `POST` to Workday. What nobody
else has is the **governed** write — *this action is irreversible / here is its inverse / here is
the vendor's dry-run / this field is the money amount / this data is purpose-bound / here is the
signed receipt of what it did*. **The governance metadata is the moat, not the endpoint.**

So the Studio is organised around **one durable object** — the *governed action* (a connector
write action + its governance spec, publishable as a signed **capability pack**). Every surface
below reads or writes that one object. That is what makes this holistic instead of a pile of
features: **author it → simulate it → govern it → publish it → operate it → observe it**, all around
the same signed artifact, whether it was authored by Actrone, by the customer, or by AI.

```
        ┌──────────── ONE GOVERNED ACTION (signed) ────────────┐
Import → Classify → Author governance → Simulate → Policy → Publish → Operate → Observe
  │         │            │                  │         │         │         │         │
OpenAPI   MAL P4      risk/reverse/       vendor    money/    capability  approvals rollback
/preset  self-       sim/purpose         dry-run    purpose   pack /      inbox +   +ledger+
/probe   describe    (AI-proposed)       preview    limits    marketplace agent use  posture
```

---

## 1. The lifecycle (seven stages, one object)

Each stage names **what the user does**, **what already exists**, and **what is net-new**.

### 1.1 Import — bring an API in
- **Does:** start a connector from (a) a **curated preset** (Workday, NetSuite, …), (b) an
  **OpenAPI / Postman** import that auto-proposes the action list, or (c) **point-and-probe** a base
  URL. The 2026 default is spec-driven: read the vendor's OpenAPI → propose reads + writes.
- **Exists:** presets (`VendorPreset`), custom REST/webhook connector creation, the hardened
  SSRF-guarded adapter core.
- **Net-new:** OpenAPI/Postman importer → proposed `EndpointAction[]`; the probe-and-suggest flow.

### 1.2 Classify — know the data
- **Does:** auto-classify every field's sensitivity (PII/financial/public); human confirms. This is
  what makes tokenisation + purpose-binding possible downstream.
- **Exists:** MAL classifier + **Phase 4 self-describe** (`connectorgov.DeriveGovernance`) + drift
  attestation. This stage is largely built.
- **Net-new:** the review/accept UI over the proposed classification (accept/override/escalate).

### 1.3 Author governance — the core of the Studio
- **Does:** for each **write** action, declare the governance the gate trusts: **risk class**
  (write/money/irreversible), **reversibility + the inverse action**, **simulation strategy**
  (`dry_run` param/header/path · `read_back` · `predicted`), **money amount field**, **purpose
  bindings**, **compensation TTL**. An **AI copilot reads the vendor docs and proposes conservative
  defaults** ("this endpoint supports `?validateOnly=true`; the DELETE has no inverse → irreversible
  → approval-forced"); the human refines and signs. *This wizard is the differentiator — nobody else
  asks these questions because nobody else governs the write.*
- **Exists:** the entire **domain model + engine** consumes all of this today
  (`gal.WriteActionSpec`, `AuthoredWriteSpecResolver`, the dry-run surface).
- **Net-new (the key foundational gap):** the connector-create **API DTO + SDK do not yet expose the
  governance fields** (`risk_class`/`reversible`/`compensating_action`/`sim`/`dry_run_*`/
  `amount_field`) — today they only accept `name/kind/method/path`, so an API-authored write falls to
  the conservative default. Closing this is the small, foundational first build; the no-code wizard +
  AI copilot sit on top of it.

### 1.4 Simulate — see the governed behaviour before going live
- **Does:** a **Governance Preview console**: fire the action's dry-run against the live sandbox, see
  the **diff**, and see **what the gate would decide** at different inputs ("pay $500 → auto-commit;
  pay $50k → blocked by coverage; delete → approval"). This is the trust-building surface a buyer's
  risk officer signs off on.
- **Exists:** dry-run/read-back simulate, the deterministic commit gate (`gal.Evaluate`), the diff
  engine — all return exactly the data this console needs.
- **Net-new:** the interactive preview UI (drive inputs → render diff + verdict + reason).

### 1.5 Policy & coverage — set the tenant's bounds
- **Does:** author the **commit policy** (money auto/hard limits, approve-all), **purpose policy**
  (which purposes may touch which classified fields), per **environment** (dev/staging/prod).
- **Exists:** `gal_commit_policy` + `purpose_policy` + resolvers; **environment promotion** pipeline.
- **Net-new:** the policy-authoring UI; the promotion UX already exists (EnvironmentPill/PromotionDialog).

### 1.6 Publish — freeze, version, share
- **Does:** freeze the connector + its governed actions as a **signed, versioned capability pack**;
  optionally publish to the **marketplace** for one-click install by others.
- **Exists:** **Phase 5 capability packs** (compose classifications + purpose-bindings + write specs
  + coverage + attestations; Ed25519 sign/verify; publish/plan/install) + the marketplace.
- **Net-new:** the "publish from Studio" flow + version diff UX.

### 1.7 Operate & observe — the cockpit
- **Does:** the day-two surfaces that make governance *visible and actionable*:
  **Approval inbox** (held actions a human approves/denies), **Rollback console** ("undo everything
  agent X did in the last hour"), **Action ledger + signed receipts**, **Risk posture** (A–F grade +
  factor breakdown per agent/tenant), **Drift alerts** (a vendor changed schema/sensitivity),
  **Refinement proposals** (the correction flywheel suggests tightenings).
- **Exists:** approval service, reversal service + sweeper, hash-chained receipt ledger, assurance
  posture + risk export, drift attestation, `AnalyzeRefinements` — **all built as APIs**.
- **Net-new:** the operator UIs over these APIs (inbox, rollback, posture dashboard, drift/refinement
  review). This is mostly UX over shipped engines.

---

## 2. Who it is for — real personas & journeys

The Studio is not one screen for one user; it is one object serving distinct real-world jobs.

| Persona | Real-world job | Primary stages | What they get |
| --- | --- | --- | --- |
| **Integration engineer / platform team** | "Let agents post time-off + update records in Workday, safely." | Import→Author→Simulate→Publish (SDK-first) | A governed action catalog they can version + promote dev→prod. |
| **Ops / business builder (no-code)** | "I want an agent to create the invoice in NetSuite." | Import(preset)→Simulate→use | A working governed action **without code**, with guardrails they didn't have to design. |
| **Compliance / risk officer** | "Show me — and let me bound — what agents can do." | Policy→Simulate→Operate/Observe | Preview of governed behaviour, policy limits, posture grade, approval inbox, audit ledger. |
| **Vendor / community expert** | "I know Salesforce; I'll author + sell the governed pack." | Author→Publish→marketplace | A signed, monetisable capability pack; marketplace supply. |
| **The agent (runtime consumer)** | "Call `connector/erp:netsuite` to post the journal." | (consumes) | A governed tool: detokenise→simulate→gate→commit→reversible→receipt — transparently. |

**Journey example (holistic, end-to-end):** an ops user imports the NetSuite preset → self-describe
classifies the fields → the AI copilot proposes `create_invoice` as *money, reversible via
`void_invoice`, sim=read_back* → the user hits **Simulate**, sees "invoice for $480 → auto-commit;
$80k → blocked by the $50k coverage limit" → the risk officer sets the money limit + requires
approval over $10k in **Policy** → they **Publish** it as a pack promoted to prod → an agent later
**uses** it; a held $12k invoice lands in the **Approval inbox**; after approval it commits with a
**signed receipt**; a mistake is **rolled back** in one click; the **posture** dashboard shows the
agent at grade B with "reversibility 100%, one open incident." *Every step is the same object.*

---

## 3. Is it relevant? — yes, three ways it is load-bearing

1. **It is the only way the moat scales.** Governed writes otherwise require Actrone to hand-author
   every vendor (doesn't scale) or engineers to hand-write specs (tiny audience). The Studio makes
   governed action authoring **self-serve** — head curated by us, long tail by orgs, both signed.
2. **It makes governance *visible*, which is what gets bought.** A CFO/CISO does not buy "our agent
   can write to Workday"; they buy "every agent action here is simulated, bounded, reversible, and
   logged — here is the preview and the ledger." The Studio is where that value becomes tangible and
   demo-able. It is the sales surface for the moat.
3. **It is the marketplace supply side.** Community-authored, signed capability packs are a network
   effect competitors can't bootstrap without already being the governed action layer.

---

## 4. What else to add (the holistic set, mapped to built engines)

Beyond the seven stages, these complete the picture and each rides an **existing** engine:

- **Governance Preview / "what-if" console** (§1.4) — drive inputs, see verdict+diff. *Trust surface.*
- **Approval inbox** — held actions, approve/deny, the reviewer sees the diff + risk + purpose.
- **Rollback console** — per-action and "undo agent X's last hour" (LIFO), with confirm-good.
- **Risk posture dashboard** — A–F grade + factor breakdown, per agent/tenant, over time.
- **Drift & attestation review** — a vendor's schema/sensitivity changed → accept/re-baseline.
- **Refinement inbox (flywheel)** — accept proposed tightenings born from real incidents/reversals.
- **Templates / recipes** — one-click "Governed AP automation" = connector + write catalog + policy
  + agent, so a user starts from a working governed use-case, not a blank form.
- **AI authoring copilot** — OpenAPI/docs → proposed actions + conservative governance; the human
  signs. The 2026 accelerant across Import + Author.
- **Cross-org fabric grants** (Phase 5c) — manage which *peer orgs* may request which governed
  actions, with signed mutual receipts. The Studio is where a tenant administers its trust grants.

**Anti-goals (kept out on purpose):** it is not a general workflow builder (that's EMAOP), not a raw
API console (governance is mandatory, not optional), and it never lets a write bypass the gate. One
governed representation, no side doors.

---

## 5. Build sequencing (prove the loop before scaling)

> Detailed, code-grounded build plan for the first three workstreams (API/SDK DTO · curated vendor
> write packs · OpenAPI import + AI proposal): `docs/Actrone_Governed_Action_Studio_Build_Plan.md`.

1. **Foundation (small, unblocking):** extend the connector-create **API DTO + SDK** to accept the
   write-governance metadata (§1.3 gap) + tests. Everything else depends on this.
2. **One vendor vertical, end-to-end:** author a real governed **write** catalog for a single system
   (NetSuite or Workday) from its actual API docs → sign as a capability pack → exercise through GAL
   with the correct `sim` per action. Proves author→simulate→publish→operate before scaling.
3. **The two highest-trust UIs:** Governance Preview console (§1.4) + Approval inbox (§1.7) — the
   surfaces that turn the built engines into something a buyer's risk officer can see and sign off on.
4. **AI copilot + OpenAPI import** (§1.1/§1.3) — the scale accelerant across the head and long tail.
5. **Scale the curated head** — the top ~20 systems as signed packs; open the marketplace supply.

---

## 6. How it maps to the moat (the one-line justification)

> Competitors ship the ability to *act*. The Governed Action Studio is where a human (or AI) turns any
> API into an action that is **simulated, bounded, reversible, purpose-bound, and provable** — once,
> visibly, and signed — and then operates it. It is the self-serve factory *and* the cockpit for the
> Governed Action Layer, which is the moat.
