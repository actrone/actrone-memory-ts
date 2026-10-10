# Actrone: AI Governance Launch Kit & Policy Generator Plan

> **Status:** Brainstorm and design plan, not yet built. Everything below is a proposal for review,
> grounded in a direct read of the existing compliance/governance code, not a description of shipped
> behaviour.
> **Scope:** two separable deliverables (§0): a sales/trust documentation package (Launch Kit) and a
> hosted-platform product feature (Policy Generator) that turns a customer's described AI use case
> into draft governance policy, disclosures, and a framework crosswalk.
> **Owner:** Matt.
> **Precedence:** inherits `../CLAUDE.md` (workspace) and `CLAUDE.md` (Actrone). Brand is LOCKED (Black
> & Apple-Silver, §8.1.1 the one named `<Emphasis>` exception aside).
> **Related:** `docs/Actrone_Certification_Track_Plan.md` (the shipped multi-framework control catalog
> and sealed evidence engine this plan extends, not replaces), `docs/Actrone_EMAOP_Conversational_Builder_Plan.md`
> (the JIT intake/compiler this plan's Policy Generator half depends on for its conversational form),
> `docs/Actrone_DPA_BAA_Automation_Plan.md` (the deterministic-PDF machinery this plan reuses),
> `docs/Actrone_Governed_Action_Layer_Strategy.md` (GAL risk-class defaults), `internal/compliance/`,
> `internal/agreements/`, `internal/gal/`.

---

## 0. TL;DR

Two different things, kept explicitly separate per CLAUDE.md's dependency-earns-its-place and
no-drift principles, because conflating them is how a product ends up making a claim it cannot back:

1. **AI Governance Launch Kit**: a documentation and public-trust-page deliverable that maps
   Actrone's actual, shipped controls onto EU AI Act Article 50 and the NIST AI RMF, for enterprise
   sales and whitepaper use. **Not new infrastructure.** It is a data extension of the multi-framework
   control catalog Actrone already ships (`internal/compliance/catalog.go`, Certification Track P1-P3)
   plus a content/marketing deliverable, following the exact pattern already proven for SOC2/ISO/GDPR.
2. **AI Governance Policy Generator**: a product feature that turns a customer's described agent use
   case into a draft risk classification, a compiled governance configuration, a tool permission
   summary, and template-selected disclosure text, flagging what still needs legal review. **Not a new
   questionnaire engine.** The underlying "ask structured questions about an agent's use case, compile
   into governed config" mechanism is the EMAOP Conversational Builder's JIT clarification loop
   (`docs/Actrone_EMAOP_Conversational_Builder_Plan.md`), which is itself still a design, not shipped.
   This plan's product surface is a **compliance-framed export of that same compiled output**, a
   "Governance Brief," not a second, competing intake system.

**The one hard rule that governs every design decision below, stated once so it doesn't drift:**
Actrone never asserts a customer is compliant, certified, or approved. Every generated artifact states
what is enforced, what is recorded, what is the customer's responsibility, and what needs a human/legal
review, and nothing else. This mirrors the "honesty rule" already load-bearing in the existing catalog
(`internal/compliance/catalog.go`: *"We never claim a control we cannot evidence"*). This plan applies
the identical discipline to a new, higher-stakes surface (regulatory framework language), so the bar
does not get lower just because the words "AI Act" are more marketable than "SOC 2."

---

## 1. Motivation & positioning

### 1.1 Why now

Enterprise buyers evaluating a governed-agent platform ask two different questions at two different
points in the sales cycle: "how does your architecture map to the frameworks our risk/compliance team
already uses" (answered once, generically, before a contract) and "what does *my* specific agent's
configuration produce as governance artifacts" (answered per-deployment, continuously, after
onboarding). Actrone has real, shipped machinery that answers adjacent versions of both questions
today (the Certification Track's control catalog for the first; capability tiers, GAL risk classes,
and MAL field classification for the second) but nothing yet packages either one in the vocabulary an
AI-governance buyer specifically asks for (EU AI Act, NIST AI RMF).

### 1.2 Why two deliverables, not one

| | Launch Kit | Policy Generator |
| --- | --- | --- |
| Audience | Prospect's risk/compliance/legal team, pre-contract | The customer's own product/security team, per agent |
| Content | How Actrone's architecture maps to frameworks, generally | A specific agent's draft policy, disclosures, open questions |
| Cadence | Written once, updated on framework/control changes | Generated per agent, revised as the agent's spec changes |
| Where it lives | Docs + public trust page (marketing surface) | Hosted product feature (entitlement-gated, per tenant) |
| Built on | `internal/compliance` catalog (extended) | The compiled agent manifest (capabilities, risk class, DPE rules) |

Folding these into one "compliance thing" is the mistake the source research explicitly flags: it
blurs "here is how our platform is generally built" (a claim Actrone can fully stand behind) with
"here is a draft for your specific, legally consequential deployment" (a draft that needs the
customer's own legal review before anyone relies on it). Keeping them architecturally separate keeps
that line visible in the product, not just in a disclaimer paragraph.

### 1.3 What neither deliverable does

Stated plainly, because a governance product overclaiming is a worse failure mode than a governance
product underclaiming:

- Actrone does not make a customer's deployment compliant. It produces controls, evidence, and drafts;
  the customer's own risk assessment and legal review remain theirs to do.
- No output may be labelled "EU AI Act certified" or imply NIST endorsement. NIST AI RMF is a voluntary
  framework, not a certification scheme; there is no such thing as "AI Act certified" for the parts of
  the regulation this plan touches.
- The EU AI Act is risk- and use-case-based; Article 50 is a transparency-obligations slice of it
  (informing people they are interacting with an AI system, labelling certain AI-generated content), not
  a complete compliance checklist. Nothing in this plan should be read as covering the Act's high-risk
  system obligations (Title III), which are a different, much heavier regime this plan does not attempt.

---

## 2. What already exists (inventory: extend this, do not re-invent)

Grounded in a direct read of the code, mirroring the discipline every other plan in this repo applies
before proposing new work.

- **A multi-framework control catalog, already proven for exactly this shape of problem.**
  [`internal/compliance/catalog.go`](../backend/orchestrator/internal/compliance/catalog.go) is
  "one control, proved once, mapped to the framework clauses it satisfies." The `Control` struct already
  carries `Mappings map[FrameworkID][]string` (e.g. SOC2 maps to `"CC6.1"`, ISO27001 to `"A.8.15"`), an
  honest `Status` (`implemented | partial | planned`), an `Evidence` kind (`auto | attested`), an owner,
  and an attested-control `ReviewCadence`. It already spans SOC2, ISO27001/27701/27018, GDPR, POPIA,
  NDPA, PIPEDA, CCPA, GPA, and APPS. **This is the exact mechanism the Launch Kit's crosswalk needs: two
  more `FrameworkID` values and populated `Mappings` entries, not a new subsystem.**
- **A sealed evidence engine.** [`internal/compliance/evidence.go`](../backend/orchestrator/internal/compliance/evidence.go)
  derives each control's live status from runtime signals where they exist (`MethodRuntime`), the
  deployment posture where a live signal doesn't apply (`MethodConfiguration`), or an owner-maintained
  artifact (`MethodAttestation`), never dressing a configuration fact up as a live measurement. The
  package is sealed with a recomputable SHA-256 so a third party can verify it was not altered.
- **A public, tenant-independent trust page.** [`internal/compliance/trust.go`](../backend/orchestrator/internal/compliance/trust.go)
  serves platform-wide posture (never a single tenant's evidence) unauthenticated at `/v1/trust`, with
  the marketing `/trust` page reading from it. This is the Launch Kit's natural home, already built.
- **Deterministic, brand-consistent PDF rendering, already used for a regulated document type.**
  [`internal/agreements/document.go`](../backend/orchestrator/internal/agreements/document.go)'s
  `RenderExecutedPDF` renders a branded, multi-page PDF from built-in fonts (no external assets),
  deterministic from its inputs, content-hash-sealed the same way the evidence package is. This is the
  Policy Generator's Governance Brief export mechanism, not a new PDF pipeline.
- **Governed-write defaults that already answer "what needs human approval."**
  `internal/gal` (`action.go`, `engine.go`, `approval.go`, `policy.go`) already carries risk-class-driven
  approval requirements for write actions; an unclassified write action already defaults to
  `write` + approval-forced (the same rule OpenAPI-imported actions get). This is most of the "human
  approval workflow" row a Policy Generator output would otherwise have to invent.
- **A structured, per-tenant capability library with governance metadata already attached.**
  `internal/capability` (`custom_capabilities`, migration `00078`) already carries scopes, `dpe_rules`,
  and `min_tier` per capability a tenant's agent is granted. This is the "tool permission matrix" a
  Policy Generator output would otherwise have to invent.
- **The intake/compile mechanism the *interactive* Policy Generator would run on, if it existed.**
  `docs/Actrone_EMAOP_Conversational_Builder_Plan.md`'s JIT clarification loop already asks
  goal/system/risk-hint questions (does this touch money, PII, or an irreversible action) and compiles
  into a governed manifest via a non-LLM compiler. **This plan does not build a second version of that
  loop.** It is a real, current dependency for the *conversational* form of the Policy Generator, and
  that plan is itself still design-only (verified: no `internal/skill`-equivalent implementation exists
  for it yet); see §4.1 for how this plan avoids blocking on it.

**Net-new, the actual gap:** two `FrameworkID` entries plus populated crosswalk data (Launch Kit); a
`governance_brief` artifact model plus a template-driven disclosure/system-description generator plus an
export endpoint reading an *already-compiled* agent manifest (Policy Generator v0, works today off the
existing manual Studio wizard, no EMAOP dependency); and the wiring to re-point that same generator at
EMAOP's JIT loop once it ships, instead of building a second generator later.

---

## 3. Part A: AI Governance Launch Kit

### 3.1 What it is

A documentation and public-trust-page deliverable: a crosswalk from Actrone's real, shipped controls
to EU AI Act Article 50 transparency obligations and NIST AI RMF functions (Govern, Map, Measure,
Manage), plus a reference architecture, an evidence catalogue, a control checklist, a customer
responsibility matrix, and a limitations statement. It is sales enablement and a trust asset, not a
runtime feature.

### 3.2 Framework crosswalk: extend the existing catalog, do not fork it

Add to `internal/compliance/catalog.go`:

```go
const (
    // ... existing FrameworkIDs unchanged ...
    EUAIACT   FrameworkID = "eu_ai_act"    // EU, Regulation (EU) 2024/1689, Article 50 transparency slice only
    NISTAIRMF FrameworkID = "nist_ai_rmf"  // US, NIST AI 100-1, a voluntary framework, not a certification scheme
)
```

`Mappings` values for `EUAIACT` are the specific Article 50 sub-obligation (e.g. `"Article 50(1)"` for
disclosing direct human-AI interaction, `"Article 50(2)"` for AI-generated content marking); for
`NISTAIRMF` they are the RMF function + category (e.g. `"Govern 1.1"`, `"Map 2.3"`, `"Measure 2.7"`).
Populate `Mappings` on the controls that already exist and genuinely satisfy part of these obligations
(examples, to be finalised against the live catalog at implementation time, not invented per-control
here):

| Existing control (illustrative, confirm exact IDs in the live catalog) | EU AI Act Article 50 | NIST AI RMF |
| --- | --- | --- |
| Tool-Call Supervisor (unauthorised/unsafe action prevention) | n/a (not a transparency obligation; tag NIST only) | Manage 1.1, Manage 2.1 |
| Agent-File (versioned model/tool/memory/safety configuration) | n/a | Map 1.1, Govern 4.1 |
| Audit ledger / signed evidence | n/a | Measure 2.7, Govern 4.2 |
| Human-approval workflow (GAL) | Article 50(1), if the agent interacts directly with a person | Govern 1.1, Manage 1.3 |
| MAL field classification / PII tokenization | n/a | Map 2.3, Manage 2.3 |

Two `Status = StatusPlanned` controls are added explicitly, not silently omitted: **AI-generated-content
labelling** (Article 50(2)/(4), no existing Actrone control watermarks or labels agent-authored
content today) and **deployer-facing model-capability disclosure** (Article 50(3), relevant only to
providers of general-purpose AI systems, out of scope for most Actrone deployments but tracked so the
catalog stays honest about what it does and doesn't cover).

This is data-authoring plus a small `catalog_test.go` extension (mirroring the existing
`catalog_datalaw_test.go` pattern already in the package) asserting every `EUAIACT`/`NISTAIRMF` mapping
resolves to a control that actually exists and whose `Status` is not silently `implemented` without a
real `EvidenceSource`.

### 3.3 Content deliverable

- **Reference architecture, control checklist, customer responsibility matrix, and limitations
  statement:** hand-authored docs content (`docs/`), reusing the crosswalk data as the source of truth
  for which controls are cited (no hand-typed control claims that can drift from the catalog, the same
  single-sourcing discipline CLAUDE.md §2 requires for API contracts applies here to compliance claims).
- **Evidence catalogue** (generated, not hand-written): extend the existing evidence engine
  (`internal/compliance/evidence.go`) to filter/project by the two new frameworks, reusing
  `EvidencePackage`'s sealed-JSON shape.
- **Public trust page:** extend `internal/compliance/trust.go`'s `PublicControl` rendering to include
  `EUAIACT`/`NISTAIRMF` mappings alongside the existing frameworks; extend the marketing `/trust` page
  (already live per the Certification Track) with an "AI Act & NIST AI RMF" section. No new page, no new
  auth surface, no new sealing mechanism.
- **Whitepaper diagrams and example policies:** hand-authored content assets for enterprise sales,
  outside the orchestrator codebase (marketing/sales-enablement deliverables).

### 3.4 What this part does *not* require

No new database tables, no new HTTP endpoints beyond extending the existing `/v1/trust` response shape,
no new frontend route (the marketing `/trust` page is extended, not duplicated). This is the fastest,
lowest-risk part of the plan and should ship first (§8).

---

## 4. Part B: AI Governance Policy Generator

### 4.1 What it is, and the dependency it's honest about

An interactive feature: a customer describes an agent's use case (what it does, who it talks to, what
it can touch, what money/PII/irreversible-action risk it carries) and Actrone produces a draft risk
classification, a compiled governance configuration, a tool permission summary, template-selected
disclosure text, and an explicit list of unresolved questions for legal review.

**The honest dependency:** the *conversational, JIT-questionnaire* form of this intake is
`docs/Actrone_EMAOP_Conversational_Builder_Plan.md`'s clarification loop, design-only today, not
built. This plan does not duplicate that intake. Instead, §4.2 defines a **v0 that works today**, off
the *existing, shipped* manual Studio wizard, so the Policy Generator's value (the compiled-output
side: risk classification, permission summary, disclosure drafting, crosswalk labelling) ships
independent of EMAOP's timeline, and §4.5 defines the compiler-side seam so that once EMAOP's JIT loop
lands, it plugs into the *same* generator rather than requiring a second one.

### 4.2 v0: Governance Brief from an already-compiled manifest (no EMAOP dependency)

Every agent built through the existing manual Studio wizard already produces a compiled manifest
carrying: attached capabilities (with `dpe_rules`, `min_tier`, scopes), GAL risk class per write action,
MAL field-classification defaults, and whether the agent is reachable via a direct-human-interaction
surface (chat/voice/channel binding vs. a purely scheduled/background trigger). That is sufficient
signal to generate a first draft **today**, with no new questionnaire:

1. Operator clicks "Generate governance brief" on an existing agent's detail page.
2. The generator reads the compiled manifest (already persisted; no new intake).
3. It classifies risk signals deterministically (§4.3) and emits the Governance Brief artifact (§4.4).
4. The brief is reviewable, editable (an operator can add/override an unresolved-question item), and
   exportable as a branded PDF (§4.6).

### 4.3 The disclosure/system-description generator: template-driven, not generative

**This is the single most important design constraint in this plan, and it is non-negotiable given §0's
hard rule.** The generator that produces human-readable disclosure text, a system description, and a
transparency notice must be **deterministic template selection over structured fields**, never a
free-form LLM call authoring compliance-sounding prose. A hallucinated disclosure sentence is a
liability, not a convenience; it would directly contradict the honesty rule this whole plan is built
on, and would put legally load-bearing text in the mouth of a system with no accountability for it.

Concretely:

- A small, **legally-reviewed template library** (finite set, versioned, each template's provenance and
  last-legal-review date tracked) keyed on which structured signals fired: `direct_human_interaction`,
  `handles_payment`, `handles_pii`, `irreversible_action`, `automated_decision`.
- The generator selects and fills templates; it does not compose new sentences. Where no template
  matches a combination of signals, the output is an explicit **"needs review"** entry, never a
  best-effort generated paragraph.
- Every generated disclosure/notice carries a **three-way classification per obligation**, mirroring the
  source research's own worked example, never a bare "compliant"/"non-compliant":
  - **Likely applicable:** the signal that triggers the obligation was detected with high confidence
    (e.g. the agent has a chat/voice channel binding, so direct human interaction is likely).
  - **Potentially not applicable:** the agent's triggers/capabilities suggest a background,
    machine-to-machine posture, but this is not asserted as certain.
  - **Needs review:** the signal is ambiguous (e.g. an agent reachable via both a scheduled trigger and
    an on-demand chat entry point) or no template covers the detected combination.
- Templates are content-addressed and change-controlled the same way skill/capability-pack bundles are
  elsewhere in this codebase (`content_hash` plus an owner plus a review cadence, reusing the exact
  vocabulary `internal/compliance/catalog.go`'s `ReviewCadence` already establishes for attested
  controls): a template cannot be silently edited without bumping its version and re-triggering legal
  sign-off.

### 4.4 Data model & migrations

Next available migration number: `00139` (verified against the live chain, currently ending at
`00138_notification_delivery_failures.sql`).

- **`governance_briefs`:** one generated brief: `id, tenant_id, env, agent_id, version, source
  (manual_wizard | emaop_jit), risk_signals (jsonb, the structured fields §4.3 keys off), crosswalk_refs
  (jsonb, control IDs + framework mappings cited), disclosure_text, system_description,
  transparency_notice, unresolved_questions (jsonb array), content_hash, created_by, created_at`.
  Unique `(tenant_id, env, agent_id, version)`. Immutable once created (a re-generation is a new version,
  mirroring `skill_versions`' immutability discipline elsewhere in this codebase): a brief a customer
  relied on for a review cannot be silently rewritten under them.
- **`governance_disclosure_templates`:** the template library: `id, key (the signal-combination this
  template answers), body, version, owner, last_legal_review_at, review_cadence, content_hash,
  created_at`. Attested, not auto-collected: same `EvidenceAttested` discipline as catalog controls.
- No change to `internal/compliance` tables; the Launch Kit's catalog extension (§3.2) is pure code plus
  data, no migration needed there.

Migrations are backwards-compatible and reversible (goose), with rollback covered in integration tests
per CLAUDE.md §6.4/§7.1.

### 4.5 Backend architecture

- `internal/governancebrief/`: new package: `Brief`, `RiskSignals` (the structured extraction from a
  compiled manifest), the deterministic classifier (§4.3's three-way logic), the template selector,
  `content_hash`. Pure where possible (classifier + template selection are pure functions over
  `RiskSignals`, table-tested per CLAUDE.md §7.2).
- `internal/governancebrief/extract.go`: reads a compiled agent manifest (capabilities, GAL risk
  classes, channel bindings) and produces `RiskSignals`. This is the **only** seam that differs between
  v0 (manual wizard, §4.2) and the future EMAOP-fed version: `extract.go` gains a second constructor,
  `FromAgentIntent(intent emaop.AgentIntent) RiskSignals`, once EMAOP's `AgentIntent` type exists;
  the classifier, templates, and output artifact are unchanged. This is the concrete mechanism that
  keeps this plan from building a second generator later.
- `internal/repository/governancebrief.go`: CRUD over `governance_briefs` /
  `governance_disclosure_templates` (parameterised, env-scoped, following the residency-routing repo
  pattern already used elsewhere).
- `internal/handler/http/governancebrief.go`:

| Method + path | Purpose |
| --- | --- |
| `POST /v1/agents/{id}/governance-brief` | generate a new brief version from the agent's current compiled manifest |
| `GET /v1/agents/{id}/governance-brief` | latest brief |
| `GET /v1/agents/{id}/governance-brief/versions` | version history |
| `GET /v1/agents/{id}/governance-brief/{version}/pdf` | branded PDF export (reuses `agreements.RenderExecutedPDF`'s rendering primitives) |
| `GET /v1/governance/disclosure-templates` | the template library (admin/ops visibility, not customer-editable; templates are legal-reviewed content) |

All writes idempotent (idempotency key, CLAUDE.md §6.2); inputs allowlist-validated with size caps;
authz in the service (`RequireScopeRole`), not only the gateway (CLAUDE.md §5.2); structured domain
errors, no internal detail on 5xx.

### 4.6 Export: reuse the agreements PDF pipeline, do not build a second one

`GET /v1/agents/{id}/governance-brief/{version}/pdf` calls into the same rendering primitives
`internal/agreements/document.go` already uses for executed DPAs: built-in fonts (no external assets),
deterministic output from `(brief, templates)`, content-hash sealed the same way. The brief's PDF
carries the same limitations statement on every page (§1.3), not just a cover-page disclaimer.

### 4.7 SDK parity

Per the CLAUDE.md parity rule (TS + Python, no Go leg): `governance.brief.generate(agentId)`,
`governance.brief.get(agentId)`, `governance.brief.pdf(agentId, version)` in both `actrone-ts` and
`actrone-py`, contract-tested against the single OpenAPI spec (the same 3-copy sync discipline already
enforced for every other endpoint, §2 CLAUDE.md and the `openapi-drift` CI gate).

### 4.8 Frontend changes (Control Tower)

All FE reuses `@actrone/ui` primitives and the locked Black & Apple-Silver tokens, lucide icons at
`strokeWidth={1.5}`, sentence case, no hardcoded emoji. Every async surface ships loading/error/empty
states.

- `agents/[id]/page.tsx`: a "Governance brief" card: current risk classification (three-way badges,
  never a bare pass/fail), "Generate brief" action, link to full brief view.
- `agents/[id]/governance-brief/page.tsx`: full brief: crosswalk citations (control to framework to
  article/function, reusing `TrustBadge`-style components from the Certification Track FE work),
  disclosure/system-description/transparency-notice text with each item's three-way classification
  visibly attached, the unresolved-questions list rendered as an explicit checklist (not buried prose),
  version history, PDF export button.
- Nav: add under the existing Compliance/Trust area, entitlement-gated (`governance_brief` feature
  flag), consistent with how Governed Skills gates its own nav entry.

---

## 5. Positioning & language (binding on all customer-facing copy)

Every surface this plan produces, marketing or in-product, uses language of this shape:

> "Actrone helps organisations translate AI governance requirements into runtime policies, controls,
> disclosures, and auditable evidence."

Never language of this shape, in any generated artifact, docs page, or sales material:

> "Actrone makes your AI compliant with the EU AI Act."

This is not a copywriting preference; it is a legal-exposure boundary. The first statement describes a
real, ownable product capability. The second creates a claim Actrone cannot substantiate and would
directly contradict §0's hard rule. Any PR touching customer-facing text generated by this plan's code
paths (templates, docs, the trust page) should be checked against this line before merge, the same way
brand-token compliance is checked today.

---

## 6. Governance & security

- **Prompt injection is not a concern here by construction.** Unlike the EMAOP intake (which processes
  freeform user-pasted text), this plan's v0 classifier reads only a compiled, already-governed manifest
  (structured fields, not freeform text). Once §4.5's `FromAgentIntent` seam is added, it inherits
  whatever injection defenses `AgentIntent` extraction already applies (the EMAOP plan's own
  schema-constrained extraction call, §6 of that plan); this plan does not introduce a new untrusted-
  text ingestion path.
- **Templates are the trust boundary, not the classifier.** The classifier can only select among a
  finite, legal-reviewed, versioned template set (§4.3); it cannot author new text. This is the
  disclosure-generator equivalent of the capability-ceiling principle already load-bearing elsewhere in
  this codebase (a skill's instructions can't exceed granted capabilities; a brief's disclosure can't
  exceed the reviewed template set).
- **Every brief is versioned and immutable** (§4.4) so a customer who relied on version N for their own
  review process has a stable, unalterable record, with the audit trail (`created_by`, `content_hash`)
  the same rigor the signed audit ledger applies elsewhere.
- **No brief is ever labelled "compliant."** The three-way classification (§4.3) and the mandatory
  unresolved-questions list are the enforced output shape; there is no code path that emits a bare
  pass/fail verdict for a regulatory obligation.

---

## 7. Testing strategy (CLAUDE.md §7/§8)

| Layer | Coverage |
| --- | --- |
| **Unit** | Catalog extension: every `EUAIACT`/`NISTAIRMF` mapping resolves to a real control (§3.2's `catalog_test.go` extension). `RiskSignals` extraction from a manifest; the three-way classifier (table-driven, every signal combination, including the "no template matches, needs review" fallback); template selection determinism (same `RiskSignals` in, same template out, every time); `content_hash` stability. |
| **Integration** (testcontainers PG16) | `governance_briefs`/`governance_disclosure_templates` CRUD, env-scoping, migration up + **down** (rollback); version immutability (an attempted overwrite of an existing version fails closed). |
| **Security** | The classifier never emits generated (non-templated) disclosure text under any input: an explicit test asserts every code path through the generator terminates in either a template match or a "needs review" entry, never free text. |
| **Contract** | `governance-brief` endpoints in **both** SDKs vs. the single OpenAPI spec; TS↔Py parity. |
| **E2E** (Playwright) | Studio-built agent, generate brief, crosswalk citations render, PDF export, loading/error/empty states asserted. |
| **CI gates** | lint 0-warnings, race/`-forked`, coverage threshold, `govulncheck`/`pip-audit`/`npm audit` (no HIGH/CRIT), image build, contract breaking-change check, `openapi-drift` gate (already enforced, extended to the new endpoints). |

---

## 8. Phased delivery

- **Phase 0: Launch Kit (§3).** Extend `internal/compliance/catalog.go` with `EUAIACT`/`NISTAIRMF` plus
  populated `Mappings`; extend `trust.go`'s public rendering; docs content (reference architecture,
  checklist, responsibility matrix, limitations statement). *Exit:* the public `/trust` page and a
  whitepaper-ready crosswalk exist, sourced from the same catalog the rest of the platform already
  trusts, no new runtime surface. **Ship this first: it has no dependency on anything else in this plan
  and is the fastest path to an enterprise-sales-usable artifact.**
- **Phase 1: Policy Generator v0 (§4.2-§4.6).** `internal/governancebrief` package, migrations,
  extraction from an already-compiled manual-wizard manifest, the template library (a small, hand-
  reviewed initial set: general enterprise agent, customer-support agent, financial-research agent,
  internal knowledge assistant, high-impact-action agent requiring approval, mirroring the source
  research's own recommended starter set), HTTP CRUD + PDF export, FE brief view. *Exit:* an operator
  generates a governance brief for an existing agent, with real crosswalk citations and template-
  selected disclosure text, exportable as a branded PDF. No EMAOP dependency.
- **Phase 2: SDK parity + marketplace-adjacent surfacing.** TS + Python client, contract tests; surface
  the brief summary on the agent's manifest preview during Studio authoring (not just post-deploy) so a
  builder sees governance signal *before* shipping the agent, not only after. *Exit:* SDK parity green;
  brief preview visible pre-deploy.
- **Phase 3: EMAOP integration (gated on that plan shipping).** Add `FromAgentIntent` to
  `internal/governancebrief/extract.go`; wire the conversational Policy Generator experience (ask
  the customer directly, generate the brief inline) once EMAOP's JIT clarification loop exists. This
  phase does not start until `docs/Actrone_EMAOP_Conversational_Builder_Plan.md` Phase 1 (§14 of that
  plan) ships; building it earlier would mean guessing at an interface that plan hasn't locked yet.
- **Phase 4: Template library depth + additional frameworks (demand-gated).** Broader template
  coverage (more signal combinations, more jurisdictions), additional framework crosswalks (e.g. a
  state-level US AI law) only once real customer usage shows which combinations are actually asked for,
  avoiding over-building a template library speculatively, the same discipline the source research
  itself recommends ("prevents you from building a generic compliance wizard that produces impressive-
  looking but unreliable documents").

---

## 9. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| **Overclaiming compliance** (the dominant risk of this entire plan) | §0's hard rule, §5's binding language rule, §6's "no bare pass/fail" enforced output shape, the three-way classification everywhere, a limitations statement on every generated artifact. |
| **A generated disclosure is legally wrong or stale** | Template-only generation (§4.3), never free text; templates carry an owner, a `last_legal_review_at`, and a `review_cadence`, the same attested-evidence discipline the catalog already applies; a template past its review cadence is flagged, not silently served. |
| **Crosswalk claims drift from what the platform actually enforces** | Single-sourced from the live `internal/compliance` catalog (§3.2), same `catalog_test.go`-style assertion pattern already proven; no hand-typed control claims outside the catalog. |
| **Policy Generator v0 becomes a dead end once EMAOP ships** | `extract.go`'s dual-constructor seam (§4.5) is designed in from the start specifically to avoid this; the classifier/template/output layers are unchanged by which constructor feeds them. |
| **Scope creep into a general-purpose compliance wizard before real demand is known** | Phase 4 explicitly demand-gated (§8); the starter template set is small and hand-reviewed, matching the source research's own sequencing recommendation. |
| **Brief PDF export duplicates the agreements PDF pipeline** | Explicitly reuses `agreements.RenderExecutedPDF`'s primitives (§4.6) rather than a second renderer. |

---

## 10. Open decisions

1. **Who legally reviews and owns the initial template library (§4.3)?** Needs a named owner before
   Phase 1 ships any template a customer could rely on; this cannot be an engineering-only call.
2. **Does the Governance Brief ship as a distinct entitlement, or bundled with the existing Certification
   Track / compliance tier?** Packaging/pricing decision, not an engineering one (mirrors how the
   Governed Skills plan explicitly deferred its own attested-compile packaging call to whoever owns
   pricing tiers).
3. **Which additional jurisdictions, if any, get a Phase 4 crosswalk first** (a US state AI law, UK's
   framework, etc.), deferred until Phase 1 usage data shows real customer demand, per §8.

---

## 11. Definition of done

- Launch Kit: `EUAIACT`/`NISTAIRMF` frameworks live in the catalog with populated, tested mappings; the
  public `/trust` page reflects them; docs content published.
- Policy Generator v0: an operator can generate, view, version, and PDF-export a governance brief for
  any existing agent, with real crosswalk citations, template-selected disclosure text, and an explicit
  unresolved-questions list, no free-text generation anywhere in the path.
- Every generated artifact carries the three-way classification and the limitations statement; no code
  path emits a bare compliance verdict.
- TS + Python SDK parity + contract tests green; OpenAPI (3 synced copies) updated; `openapi-drift` CI
  gate passing.
- CI gates green (lint, race, coverage, vuln scan, image build, contract check).
- `progress.md` updated; this plan's Phase 3 explicitly blocked-and-documented on EMAOP's own progress,
  not silently attempted early.

---

*Last updated: 2026-08-07 | Owner: Matt | Scope: Launch Kit (docs/trust-page) + Policy Generator v0-v2
(hosted platform feature), TS+Python SDK parity. Phase 3 gated on the EMAOP Conversational Builder Plan.*
