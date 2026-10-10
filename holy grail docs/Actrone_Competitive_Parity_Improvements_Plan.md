# Actrone: Competitive Parity Improvements Plan

> **Status:** Design plan, not yet built. Every "already exists" claim below was verified by direct code
> read, not assumed, including two corrections to an earlier draft of this comparison (semantic caching
> was wrongly claimed absent; artifact-cache visibility was wrongly assumed to cover it). Read
> `internal/semcache/`, `internal/agentgraph/`, `internal/loopeval/`, `internal/onboarding/datasets/`,
> `internal/repository/cost.go`, and `internal/savings/metrics.go` before changing any claim in this doc.
> **Scope:** three narrow, verified gaps found while comparing Actrone against Guardrails AI, NVIDIA
> NeMo Guardrails, and Helicone (conversational topic/flow rails, semantic-cache visibility, exportable
> synthetic eval-dataset generation), plus a moat layer (Parts D-F) that goes past parity on the three
> remaining honest gaps from that comparison: query tooling, prompt-ops, and guardrail maturity, each
> built to be structurally hard for a point tool to copy, not just feature-equivalent.
> **Owner:** Matt.
> **Precedence:** inherits `../CLAUDE.md` (workspace) and `CLAUDE.md` (Actrone). Brand is LOCKED (Black &
> Apple-Silver); all new UI reuses `@actrone/ui` tokens.
> **Related:** `docs/Actrone_EMAOP_Conversational_Builder_Plan.md` (§5, the synthetic-stand-in design Part
> C builds on), `docs/Actrone_Certification_Track_Plan.md` (the evidence-sealing primitive Parts D and F
> reuse), `internal/agentgraph/`, `internal/semcache/`, `internal/savings/`, `internal/onboarding/datasets/`,
> `internal/loopeval/`, `internal/compliance/evidence.go`, `internal/compliance/trust.go`.

---

## 0. TL;DR

A comparison against Guardrails AI, NVIDIA NeMo Guardrails, and Helicone surfaced three candidate gaps.
Direct code investigation (not assumption) confirmed two as real and narrowed the third significantly:

1. **No conversational topic/flow rail construct**, the Colang-equivalent gap. `internal/agentgraph.Graph`
   (Actrone's native, governed, LangGraph-style control-flow DSL) has exactly four node kinds: `tool`,
   `llm`, `decision`, `end`. Nothing declares "stay on topic" or "redirect off-scope input" as a
   first-class, testable construct. **Confirmed real.**
2. **Semantic-cache savings have no visibility anywhere**, not the gap originally claimed (semantic
   caching itself is real, built, and more rigorous than the comparison assumed: tenant-isolated,
   governance-gated on cacheability, cost-attributed to the savings ledger). But `internal/repository/cost.go`
   (the `/cost` dashboard's data source) and `internal/savings/metrics.go` were both checked directly and
   neither surfaces semantic-cache-specific hit rate or savings; the dashboard's existing cache columns
   come from a *different* mechanism (the artifact/tool-result cache). **Confirmed real, but small**: this
   is a visibility gap on an already-built, already economically active feature, not a feature to build.
3. **No exportable, general-purpose synthetic eval-dataset generator.** `internal/loopeval` scores loop
   *performance* (cost, turns, token efficiency), not dataset generation. `internal/onboarding/datasets`
   is four fixed, hand-authored, embedded `.sql` files, one per vertical, used only for the onboarding
   walkthrough. The EMAOP Conversational Builder Plan already designs the generalization (§5: infer a
   schema for *any* described connector, always include a refuse/escalate case), but that design is
   unbuilt. **Confirmed real**, and correctly framed as building an already-specified design, not
   inventing a new one from scratch.

A follow-on assessment (comparing the same three products' remaining strengths after Parts A-C) named
three more honest gaps: query tooling, prompt-ops, and sheer production-hardened maturity in the
guardrails/eval space. Rather than building feature-equivalent versions of those (which would just be
catching up), Parts D-F below build each one on top of governance infrastructure none of the three
compared products have, so each lands as a structurally different, harder-to-copy product, not a copy:

4. **Governed query tooling (Part D).** Not a read-only analytics query language over request logs
   (Helicone's HQL); a structured, allowlisted query grammar over the *governed* data these products
   don't have at all (DPE verdicts, capability grants, approval chains, signed audit entries), with two
   moat mechanisms neither compared product has a substrate for: a saved query can be promoted into a
   live monitoring rule, and a query's result set can be exported as sealed, tamper-evident evidence
   (reusing the Certification Track's own sealing primitive), not just a chart.
5. **Governance-aware prompt-ops (Part E).** Not prompt text versioned in isolation and A/B tested on
   vibes; prompt variants scored against a generated eval dataset's golden-path *and* refuse/escalate
   scenarios through an extended `loopeval`, so a winning variant is chosen on governance accuracy and
   cost together, then promoted through the same audited per-agent version ladder every other agent
   change already goes through. No standalone prompt-ops tool can make this comparison without first
   building a governance engine and a durable eval harness underneath it.
6. **Guardrail maturity strategy (Part F).** Production-hardened maturity is earned by time and real
   traffic, not built in a plan; this part is the two moves that change the shape of that race rather
   than pretending to skip it: pluggable third-party detection backends behind the same governed wrapper
   (consuming best-of-breed detection science rather than competing with it, the same strategic bet
   already made for MCP and the open Skills format), and a published, signed, reproducible benchmark of
   the platform's own guardrail accuracy on the trust center, turning "trust us, we're mature" into a
   number a third party can verify.

**Part A was deepened past parity with four further additions (§1.6-§1.9)**, each answering a real,
named pain point rather than matching a competitor feature for its own sake: a topic rail cannot be
promoted to production without clearing a measured accuracy score (§1.6, so "does this guardrail actually
work" is answered before deployment, not discovered after a complaint), every firing carries a full,
signed, queryable reasoning trace instead of a bare boolean (§1.7), borderline firings queue for governed
human review rather than silently accumulating false positives (§1.8), and marketplace distribution of a
benchmark-badged rail is deferred with an explicit trigger condition rather than left open-ended (§1.9).
None of the three compared products can do the first three, because none of them sit on a durable
execution platform with a promotion ladder and a signed audit ledger underneath.

---

## 1. Part A: Conversational topic/flow rails

### 1.1 What exists and what's missing

`internal/agentgraph/graph.go` already gives native agents governed, durable, LangGraph-style control
flow: nodes (`tool | llm | decision | end`), conditional edges (`Edge.When`), cycles, a defined entry and
terminals, compiled to crash-resumable, governed Temporal activities. This is real infrastructure NeMo
Guardrails has no equivalent of (Colang flows aren't durable or crash-resumable). What's missing is a
node *kind* purpose-built for "is this turn's input in scope, and if not, what happens": NeMo's rails
answer that with dialog/topic rails; Actrone's graph has no comparable primitive today.

### 1.2 Design: a new `NodeGuard` kind, not a second DSL

Add `NodeGuard` to `agentgraph.NodeKind`, reusing the existing graph, edge, traversal, and Temporal-
activity-compilation machinery rather than building a parallel flow language. A guard node's `Ref` names
a reusable, tenant-authored **topic rail** configuration (new `internal/topicrail` package), evaluated at
that point in the graph, branching via the *already-existing* `Edge.When` condition mechanism to either
continue or redirect.

**Detection method, tiered like NeMo's own approach (heuristic, semantic, LLM self-check), not a single
fixed technique:**

- **Embedding-similarity path (fast, cheap, default).** Reuses the *exact* `Embedder` interface already
  defined in `internal/semcache/semcache.go` (no new embedding infrastructure): a topic rail declares a
  small set of exemplar phrases per topic ("discusses a named competitor," "requests account deletion
  without verification"); the current turn's input is embedded and compared by cosine similarity against
  the declared exemplars, same primitive semcache already uses for prompt matching, applied to a
  different comparison set.
- **LLM self-check fallback (optional, for ambiguous cases).** A small, cheap classifier call when the
  embedding path is inconclusive (within a configurable confidence band), mirroring NeMo's own "LLM
  self-checking" option rather than forcing every deployment onto the more expensive path by default.

### 1.3 Data model & migrations

Next migration number: verify against the live chain at implementation time (currently ending at `00139`
per the AI Governance plan's own note; confirm before authoring).

- **`topic_rails`**: `id, tenant_id, env, slug, name, mode (block | require | redirect), topics (jsonb:
  exemplar phrases per topic), redirect_response, detection_method (embedding | embedding_then_llm),
  confidence_threshold, accuracy_score (nullable: the most recent measured precision/recall from §1.7),
  benchmark_dataset_version (nullable, references the eval dataset it was last scored against),
  last_benchmarked_at, created_by, created_at, updated_at`. Unique `(tenant_id, env, slug)`. A simpler
  CRUD row than Skills or Capability Packs deliberately: this is tenant-internal authoring configuration,
  not a signed, distributable, third-party artifact in v1 (see §1.6 for a possible later marketplace
  extension).
- **`topic_rail_firings`**: `id, tenant_id, env, topic_rail_id, agent_id, task_id, matched_topic,
  similarity_score, detection_method_used, verdict (blocked | redirected | allowed), review_status
  (unreviewed | confirmed_correct | confirmed_incorrect, nullable, populated by §1.9), reviewed_by,
  reviewed_at, content_hash, occurred_at`. This is the §1.8 signed firing trace: every firing is a row
  here in addition to whatever the standard audit ledger already records, so a firing carries enough
  structured detail (the match, the score, the method) to be queried (Part D) and reviewed (§1.9), not
  just a boolean "blocked" buried in a generic audit entry.
- No change to `agent_graphs`/manifest storage beyond the new `NodeGuard` kind being a valid value in the
  existing `Kind` field and `Ref` resolving to a `topic_rails.slug` instead of a tool id.

### 1.4 Backend architecture

- `internal/topicrail/`: `TopicRail` domain type, embedding-comparison logic (reusing `semcache.Embedder`),
  the optional LLM self-check path, pure where possible (comparison logic table-tested against fixture
  exemplars and inputs).
- `internal/agentgraph/graph.go`: add `NodeGuard` to `NodeKind`, extend `Validate()` to require a `Ref`
  on guard nodes (mirroring the existing tool-node requirement) and at least one outgoing `When`-
  conditioned edge (a guard with no branch is a dead node, caught the same way an unreachable node
  already is).
- Runtime: the graph-to-Temporal-activity compiler (the "infra follow-on" `graph.go`'s own doc comment
  already anticipates) gains a guard-node activity type, invoked at that point in the durable workflow,
  its verdict driving which `When`-labelled edge fires next.
- `internal/handler/http/topicrails.go`: `GET/POST /v1/topic-rails`, `GET/PUT/DELETE /v1/topic-rails/{id}`,
  following the same allowlist-validated, idempotent, `RequireScopeRole`-authorized pattern as every
  other CRUD surface in this codebase. Additionally: `POST /v1/topic-rails/{id}/benchmark` (§1.7),
  `POST /v1/topic-rails/{id}/promote` (§1.6), `GET /v1/topic-rails/{id}/firings` (§1.7),
  `POST /v1/topic-rails/firings/{id}/review` (§1.8).

### 1.5 Frontend changes

- A `TopicRailBuilder` component, reusing the same dialog/form shape already proven for capabilities and
  skills (exemplar-phrase list editor, mode selector, redirect-response text field), extended with an
  accuracy badge (§1.6) once the rail has been benchmarked.
- Studio: guard nodes render in the existing graph-authoring surface (wherever `agentgraph.Graph` is
  already visualised/edited) as a distinct node type, consistent with how tool/decision nodes render
  today.
- A firings view per topic rail (reusing the `<EnvFilterBar>` list pattern from the Environment Context
  Redesign plan): every firing with its match, score, and verdict, and, once §1.8 ships, a review queue
  for borderline firings.

### 1.6 Accuracy-gated promotion: don't ship a rail on faith

The pain point this closes: NeMo Guardrails and Guardrails AI both ship a config a customer hand-tunes
and hopes works, whether it actually catches what it claims to is discovered in production, not before.
Actrone already has the pieces to close that gap, not build a new one:

- A topic rail's promotion from development to staging to production (mirroring the per-agent
  `envpromotion.go` ladder, keyed here by `topic_rails.slug` instead of an agent name) is **gated on a
  measured accuracy score**, not a manual sign-off alone. `POST /v1/topic-rails/{id}/benchmark` generates
  (or reuses) an eval dataset via Part C's generator, scoped to the rail's declared topics (adversarial
  phrasings that should match, legitimate phrasings that should not), and scores precision/recall the
  same way Part F's guardrail benchmark scores the platform overall, at the level of one rail instead of
  the whole system.
- `POST /v1/topic-rails/{id}/promote` refuses to promote a rail below a configurable minimum
  accuracy threshold (default conservative, tenant-adjustable), the same fail-closed posture used
  throughout this codebase for anything gating a promotion. An operator can still force-promote with an
  explicit override, logged, never a silent bypass.
- `accuracy_score`/`benchmark_dataset_version`/`last_benchmarked_at` (§1.3) make this visible wherever the
  rail is shown, in Studio, on the firings view, and (later) on a marketplace listing (§1.9).

### 1.7 Every firing carries a full, signed, queryable reasoning trace, not a boolean

The pain point this closes: a validator library tells you "blocked" or "allowed," nothing more, which is
useless to an auditor or a compliance buyer who needs to know *why*. Every guard-node firing writes a
`topic_rail_firings` row (§1.3): the matched topic, the similarity score, which detection method
resolved the verdict, alongside whatever the standard audit ledger already records for the underlying
action. This is queryable through Part D's governed query tooling and exportable as sealed evidence
through the same mechanism, "show me every firing on this rail in the last 30 days with a confidence
below 0.9" is a real, answerable query, not a request to grep application logs.

### 1.8 A governed, human-reviewed feedback loop on borderline firings

The pain point this closes: false positives silently frustrate legitimate users and nobody notices,
because there's no signal path from "the rail fired" back to "was that actually correct." Firings whose
similarity score falls within a configurable band around the threshold (genuinely ambiguous, not clearly
right or wrong) queue for human review (`GET`/`POST .../firings/{id}/review`, §1.4). A reviewer marks a
firing `confirmed_correct` or `confirmed_incorrect`; confirmed-incorrect firings are surfaced as candidate
exemplar/threshold adjustments an operator explicitly applies, never an automatic, silent retune. This is
a real, scoped increment of new work (a review queue UI, a moderation workflow), not a wiring exercise
like §1.6/§1.7, and is sequenced as its own phase (§8) rather than bundled into v1.

### 1.9 Not in scope for v1, explicitly

- **Marketplace distribution of topic rails as a shareable, benchmark-badged artifact.** The Governed
  Skills plan's `package_kind` discriminator already anticipates a `policy_pack` kind for exactly this
  shape of thing; extending it is a small follow-on once there's something real to badge with, not a
  redesign. **Explicit trigger condition, not an open-ended "later"**: this becomes worth building once
  §1.6 produces real `accuracy_score` data across enough tenant-authored rails to make "install a topic
  rail with a proven, sealed accuracy number attached" a credible claim, not before. A marketplace listing
  with no accuracy data behind it would be exactly the unverifiable marketing claim §1.6-§1.7 exist to
  avoid.
- **Extending the topic rail's enforcement to BYOF-connected/BYOF-hosted agents via a gateway-level
  check.** A real, plausible extension (inference calls from every build mode already pass through the
  same gateway `internal/semcache` sits in), but it trades away graph-level branching (redirect within a
  governed flow) for a narrower per-call block/substitute capability, since a BYOF agent has no
  `agentgraph.Graph` for Actrone to branch within. Left as an explicit open decision (§11) rather than
  assumed either way; §1.6-§1.8's accuracy-gating, firing trace, and review loop are all written to apply
  to a firing regardless of which enforcement point produced it, so none of that work needs to be redone
  if this extension is built later.

---

## 2. Part B: Semantic-cache visibility

### 2.1 What exists (the correction from the earlier draft of this comparison)

Two separate, real caching mechanisms exist, and only one is currently visible:

- **The artifact cache** (`internal/service/activity_service.go`'s `toolCache`, exact-match on
  idempotent connector READ tool calls): **is** customer-visible. `internal/repository/cost.go`'s
  `ModelCostRow` carries `CacheHits`/`CacheSavingsUSD`, rendered on the `/cost` page, sortable, per
  model.
- **The semantic cache** (`internal/semcache`, embedding-similarity on LLM prompts, backed by Qdrant,
  tenant-isolated, governance-gated on cacheability): records into the `savings` ledger via
  `savings.Recorder.Record(savings.Event{Source: savings.SourceCacheHit, ...})`, which feeds the
  savings-backed-fee billing reconciliation. **Checked `cost.go` and `savings/metrics.go` directly: neither
  exposes a semantic-cache-specific figure anywhere.** It is economically active (it affects what a
  customer is billed) but functionally invisible.

### 2.2 Design: expose what already exists, don't build a second caching system

- **Backend**: extend `CostSummary` (`internal/repository/cost.go`) with a `SemanticCache` block:
  `hit_count`, `savings_usd`, `enabled` (reflecting `semcache.enabled`), `mode` (`shadow` when
  measuring-only per the existing rollout discipline in `semcache.go`'s own doc comment, `active` when
  actually serving cached responses). Sourced from the `savings` ledger filtered to `SourceCacheHit`
  events attributable to semcache specifically.
  - **Verify at implementation time**: whether `savings.SourceCacheHit` is currently shared between the
    artifact cache and the semantic cache, or exclusive to semcache, since `cost.go`'s existing
    `CacheHits`/`CacheSavingsUSD` columns were not traced to the `savings` package in this investigation
    (they may be computed independently from raw audit rows). If the enum value is shared, add a
    sub-source discriminator (`SourceCacheHitArtifact` / `SourceCacheHitSemantic`) before building the
    new summary block, so the two are never silently double-counted or conflated.
- **Frontend**: a "Semantic cache" card on `/cost`, reusing the page's existing `Card`/`Sparkline`
  components, showing hit rate and dollars saved over the selected window, with a clear `shadow` vs.
  `active` badge so an operator who hasn't flipped `semcache.enabled` to serving mode isn't confused
  about why the number is zero or measurement-only.
- **Settings**: confirm whether a toggle for `semcache.enabled` already exists anywhere in Settings; if
  not, add one, since today it is a deploy-time config value with no in-product control, which is
  inconsistent with how most other tenant-configurable behaviour in this codebase is exposed.

### 2.3 What this explicitly does not touch

No change to the semantic cache's matching logic, similarity threshold, TTL, or governance-gated
cacheability check (§ `internal/semcache/semcache.go`). This is purely a visibility and control-surface
addition over an already-correct, already-tested mechanism.

---

## 3. Part C: Exportable synthetic eval-dataset generation

### 3.1 What exists and what's missing (be precise about which)

- `internal/loopeval`: scores loop *performance* (token efficiency, cost, turns) against a baseline for
  a known task. Not a dataset generator; unrelated to this gap despite the naming similarity.
- `internal/onboarding/datasets`: four fixed, hand-authored, embedded `.sql` files (`hr`, `finance`,
  `it`, `procurement`), shipped in the binary for the onboarding walkthrough only. Each deliberately
  includes at least one refuse/escalate case (a real, good design precedent worth keeping), but the data
  itself is static and cannot be generated for an arbitrary, customer-described system.
- The EMAOP Conversational Builder Plan (§5) already **designs** the generalization: infer a schema for
  any described connector from whatever signal is available (an imported OpenAPI spec, extracted
  screenshot fields, a pasted sample-data file), fabricate plausible records, and always generate at
  least one golden-path case and one refuse/escalate case. **This design is not built anywhere.** Framing
  this as "just export what already exists" (as an earlier pass at this comparison put it) was
  imprecise: the generator itself needs to be built, using EMAOP §5's already-locked design, then
  additionally exposed as a standalone surface rather than buried inside EMAOP's own build flow.

### 3.2 Design: build EMAOP §5's generator as a standalone service, consumed by both EMAOP and a public API

- **Do not gate this on EMAOP's JIT conversational loop shipping.** EMAOP §5's generator needs a
  structured input (a schema signal: an OpenAPI spec, sample data, or extracted field names) and a target
  description, it does not need the full conversational intake to exist first. Build it as its own
  package with its own narrower intake, so it delivers value immediately and EMAOP's JIT loop becomes an
  *additional* caller later, exactly the same "don't duplicate, add a second constructor" pattern already
  used in the AI Governance Launch Kit plan's `governancebrief.extract.go` seam.
- **Schema-confidence threshold, reusing the AI Governance plan's own resolved decision on this exact
  question** (§10.2 of `Actrone_AI_Governance_Launch_Kit_And_Policy_Generator_Plan.md`, decided for a
  different feature but the identical underlying problem): a structured, typed source (an OpenAPI spec,
  or sample data with typed columns) is confident enough to fabricate; a names-only, unstructured source
  is not, and the generator returns a "need real example records" response instead of guessing a wrong
  shape. Reused verbatim, not re-derived.
- **Scenario generation always includes the refuse/escalate discipline** already proven in
  `internal/onboarding/datasets`: at minimum one golden-path case and one case a governed agent is
  expected to refuse or escalate, inferred from the described domain (an over-threshold transaction, a
  privileged access request, a compliance-lapsed counterparty, or the domain-appropriate equivalent).

### 3.3 Data model & migrations

- **`eval_datasets`**: `id, tenant_id, env, name, source_kind (openapi | sample_data | field_names),
  source_ref (object-store pointer to the uploaded spec/sample), schema_confidence (structured |
  unstructured), records (jsonb, the fabricated dataset), scenarios (jsonb: golden-path + refuse/escalate
  case markers), content_hash, created_by, created_at`. Every value in `records` is synthetic by
  construction (the generator never has access to real tenant data when fabricating, only the shape
  signal supplied), and every dataset carries the same `EVERY VALUE IS INVENTED` / RFC 2606 example-domain
  discipline `internal/onboarding/datasets` already documents, extended here rather than relaxed.
- No change to existing onboarding-dataset tables; the four fixed verticals stay exactly as they are for
  the onboarding walkthrough specifically, this is additive.

### 3.4 Backend architecture

- `internal/evaldataset/`: the generator (`GenerateFromSpec`, `GenerateFromSampleData`), the shared
  scenario-generation logic (golden-path + refuse/escalate, reusable by both this package and, later,
  `internal/onboarding/datasets` if it's ever worth unifying), pure/table-tested against fixture specs.
- `internal/handler/http/evaldatasets.go`: `POST /v1/eval-datasets/generate` (structured input, returns
  a generated dataset or a "need real examples" response per §3.2's threshold), `GET /v1/eval-datasets/{id}`,
  `GET /v1/eval-datasets/{id}/export` (download as JSON/CSV/SQL for use outside Actrone entirely, the
  actual "exportable" requirement, not just internal consumption).
- EMAOP's own sandbox (once EMAOP itself is built) becomes a caller of this package rather than owning
  its own generation logic, per §3.2.

### 3.5 SDK parity

Per the CLAUDE.md parity rule: `evalDatasets.generate(input)`, `evalDatasets.get(id)`,
`evalDatasets.export(id, format)` in both `actrone-ts` and `actrone-py`, contract-tested against the
single OpenAPI spec.

### 3.6 Frontend changes

- A "Generate eval dataset" flow reachable from both the sandbox-testing surface (once wired to an
  agent's build flow) and as a standalone tool (`/eval-datasets/new`): upload a spec or sample data,
  confirm the inferred schema confidence, review the generated golden-path and refuse/escalate scenarios,
  export.

---

## 4. Part D: Governed query tooling

### 4.1 What exists and what's missing

Task/trace list endpoints today take fixed filters (tenant, env, agent, date range); there is no
structured, ad hoc query surface across the governance data itself: DPE verdicts, capability grants,
approval chains, risk classes, the signed audit ledger. Helicone's HQL queries request logs, cost, and
latency, a real, useful thing, but it has no schema for any of the above because it has no governance
engine underneath it to produce that data in the first place.

### 4.2 Design: a structured, allowlisted grammar compiled to parameterized SQL, not raw SQL exposed to users

A query is field, operator, value, boolean combinators, and an optional aggregation (count, sum, avg),
over an allowlisted set of fields spanning tasks, tool calls, DPE verdicts, capability grants, and audit
ledger entries, the same shape Datadog/Honeycomb-style filter builders already use. It compiles
server-side into parameterized SQL against an explicit allowlist of tables/columns, never string
interpolation (CLAUDE.md §4.2, non-negotiable given this is a query surface by definition). No raw SQL
is ever accepted from a client.

**Two mechanisms make this a moat, not a copy of HQL:**

- **A saved query can be promoted into a live rule.** Reuses the existing `notify.Service` alert-type
  catalogue and delivery pipeline (`internal/notify`, already built, already durable-retry-capable per
  the earlier notification-delivery work) rather than a second, parallel alerting system: promoting a
  query means "notify me, on this channel, whenever this pattern next matches," turning ad hoc analysis
  into standing policy instead of a one-off read.
- **A query's result set can be exported as sealed, tamper-evident evidence.** Reuses
  `internal/compliance/evidence.go`'s exact sealing primitive (deterministic JSON, a recomputable SHA-256
  with the content hash blanked before hashing) rather than a second sealing mechanism: the export is a
  signed report a third party can verify wasn't altered, not a screenshot or a CSV a customer's auditor
  has to take on faith.

### 4.3 Data model & migrations

- **`saved_queries`**: `id, tenant_id, env, name, grammar (jsonb, the parsed field/operator/value tree),
  created_by, created_at, promoted_to_rule (bool), alert_type_id (nullable, set when promoted, referencing
  the existing notify-package catalogue)`. Unique `(tenant_id, env, name)`.
- **`query_evidence_exports`**: `id, tenant_id, saved_query_id (nullable, ad hoc exports allowed), query_snapshot
  (jsonb), result_snapshot (jsonb), content_hash, sealed_at, exported_by`. Mirrors `EvidencePackage`'s
  shape (§4.2) deliberately, so the same verification tooling a customer already trusts for compliance
  evidence works unchanged here.

### 4.4 Backend architecture

- `internal/govquery/`: the grammar parser, the allowlist validator, and the SQL compiler, pure and
  table-tested against fixture grammars including deliberately malicious ones (a field or table not on
  the allowlist must be rejected, not silently dropped).
- `internal/handler/http/govquery.go`: `POST /v1/query` (ad hoc, returns results), `POST/GET /v1/query/saved`,
  `POST /v1/query/saved/{id}/promote` (wires into `notify.Service`), `POST /v1/query/export` (seals via
  `compliance/evidence.go`'s existing function, not a reimplementation).

### 4.5 Frontend changes

- A query-builder component (field/operator/value rows, AND/OR grouping, an aggregation picker),
  reachable from `/query` and as an advanced-filter mode on the existing list/stream views from the
  Environment Context Redesign plan, respecting the same env-scoping filter pattern already established
  there rather than inventing a second scoping model.
- "Save as rule" and "Export as sealed evidence" actions on any result set.

### 4.6 Not in scope for v1

Arbitrary joins across tables outside the allowlisted governance set. v1 ships against a fixed, reviewed
field list; widen only on demonstrated need, the same discipline used throughout this plan.

---

## 5. Part E: Governance-aware prompt-ops

### 5.1 What exists and what's missing

Agent manifests already version the system prompt as part of the whole spec, promoted through the
existing per-agent ladder (`envpromotion.go`). `internal/loopeval` already scores a run's cost, turns,
and token efficiency against a baseline. What's missing: a way to compare prompt variants side by side
without manually creating and diffing full separate agent versions, and a scoring dimension for whether a
variant still gets governance right (correctly refuses/escalates what it should), not just whether it's
fast and cheap.

### 5.2 Design: variant comparison as an action over existing versioning and eval infrastructure, not a new artifact type

A "compare variants" flow lets a builder author two or more prompt variants inline against a draft (not
yet separately promoted agents, a lightweight, ephemeral variant list). Each variant runs, through the
same governed execution path any agent normally runs through (no ungoverned side-channel test path), as a
batch against the *same* eval dataset (Part C's generator output, including its refuse/escalate
scenarios). `loopeval` gains a new scoring dimension, governance-verdict accuracy: did the run correctly
refuse/escalate the cases the eval dataset marked as such, and correctly proceed on golden-path cases,
alongside its existing cost/turns/efficiency numbers. The comparison view shows every variant against
every dimension. The winning variant promotes into the agent's real version history through the
*existing* per-agent promotion path, so a prompt-ops decision becomes a normal, audited version bump, not
a disconnected artifact sitting outside the governance model everything else in this platform already
follows.

### 5.3 Data model & migrations

- **`prompt_variants`**: `id, tenant_id, env, agent_id, label, prompt_text, created_by, created_at`.
  Deliberately ephemeral/draft-scoped, not a permanent, signed artifact type like Skills, since only a
  *promoted* variant should become a real, durable agent version.
- **`variant_runs`**: `id, variant_id, eval_dataset_id (references the eval_datasets table from Part C),
  score (jsonb: cost, latency, governance_accuracy, per-scenario pass/fail), run_at`.

### 5.4 Backend architecture

- `internal/loopeval/`: add a `GovernanceAccuracy` score to `LoopQualityReport`, a pure function over a
  run's recorded outcomes against the eval dataset's scenario markers (golden-path expected-proceed vs.
  refuse/escalate expected-block).
- `internal/promptvariant/` (new): variant CRUD, orchestrates dispatching each variant through the normal
  durable execution path against a chosen `eval_dataset_id`, collects `loopeval` scores.
- `internal/handler/http/promptvariants.go`: CRUD, `POST /v1/agents/{id}/prompt-variants/{id}/run`,
  a comparison-view read endpoint, `POST .../promote` (calls the existing `envpromotion` path, not a new
  one).

### 5.5 SDK parity

`promptVariants.create/list/run/promote` in both `actrone-ts` and `actrone-py`, contract-tested.

### 5.6 Frontend changes

A side-by-side comparison view in Studio: variants as columns, dimensions as rows (cost, latency,
governance accuracy, per-scenario pass/fail), a "promote this variant" action that hands off to the
existing promotion-ladder UI from the Environment Context Redesign plan.

### 5.7 Not in scope for v1

- **Automatic prompt optimization** (an LLM proposing prompt edits itself). v1 is human-authored
  variants, human-selected winner; automated proposal is a distinct, materially higher-risk feature worth
  its own review only once the comparison mechanism itself has a track record.
- **Extending prompt-variant comparison to BYOF-hosted stepwise frameworks** (the ones with an injectable
  per-framework model shim, the same narrow opening noted for topic rails), a real, plausible extension
  since a stepwise driver could plausibly swap the prompt at each step the same way it does for a native
  agent's graph. **Deliberately deprioritized relative to Part A's BYOF question (§10), not treated with
  the same urgency**: nothing in the compared product set, Helicone included, has a governance-aware
  prompt-ops feature at all, so there is no direct competitive gap being left open the way there clearly
  is with topic rails against NeMo Guardrails and Guardrails AI. This stays a later, opportunistic add if
  BYOF-hosted stepwise usage of Part E's native version shows real demand, not something to rush for
  parity's sake. BYOF-hosted encapsulated and BYOF-connected are excluded from this even as a later
  option, Actrone does not own or see the prompt as a discrete artifact in either mode.

---

## 6. Part F: Guardrail maturity strategy

### 6.1 The honest premise

Production-hardened maturity is earned by time and real traffic; nothing in this section claims to
substitute for that. These are the two moves that change the shape of that race rather than a claim that
either one skips it.

### 6.2 Pluggable third-party detection backends behind `NodeGuard`

Extend the topic rail's detection method (Part A: embedding-similarity, optional LLM self-check) to a
pluggable `DetectionBackend` interface, the built-in embedding path as the default, adapters for
established third-party safety/PII classifiers as optional, swappable backends. This mirrors the
platform's own already-established strategy of consuming best-of-breed ecosystem tooling rather than
re-deriving detection science in-house (the same bet already made for MCP as a client and for the open
Skills format, per the Governed Skills plan's own positioning). The moat stays exactly where it already
is: the governance wrapper around whichever detector is plugged in (capability ceiling, signing, the
durable graph, the audit ledger), not the detector's own accuracy, which is a different company's job to
be best at.

### 6.3 A published, signed, reproducible guardrail-accuracy benchmark

Reuse Part C's eval-dataset generator and Part E's extended `loopeval` governance-accuracy scoring to run
a standing, scheduled benchmark of the platform's own topic rails, DPE, and capability-ceiling
enforcement against a maintained, versioned benchmark dataset. Seal the results with the exact sealing
function already built for compliance evidence (`internal/compliance/evidence.go`), and publish them on
the trust center (`internal/compliance/trust.go`, the same public, tenant-independent posture already
used for SOC2/ISO/GDPR controls). This turns "how mature is your guardrails system" from a marketing
sentence into a signed, reproducible, third-party-checkable number, republished on a cadence, applying
the AI Governance Launch Kit plan's own honesty rule (never claim what isn't evidenced) to a new surface.
Publish it as a **trend over time**, not a single absolute score, so an early, still-maturing result reads
as what it honestly is rather than a permanent verdict.

### 6.4 Data model & migrations

**`guardrail_benchmark_runs`**: `id, benchmark_dataset_version, run_at, results (jsonb: per-category
accuracy), content_hash, published (bool)`. Reuses the object-store content-addressing pattern already
used for skill bodies and executed agreements.

### 6.5 Backend architecture

`internal/guardrailbench/` (new, small): schedules the benchmark run (reusing `promptvariant`/`loopeval`
scoring machinery unchanged), seals the result (calling `compliance/evidence.go`'s sealing function
directly, not reimplementing it), and a publish step that surfaces it through `trust.go`'s existing public
rendering.

### 6.6 Not in scope for v1

Third-party auditing/certification of the benchmark methodology itself. v1 is Actrone's own sealed,
reproducible, transparently-published self-benchmark; an independent audit of the methodology is a
credible follow-on once the benchmark has a track record, not a prerequisite to publishing the first one.

---

## 7. Part G: Universal governed capabilities (AP2 payments, code-execution, computer-use, MCP server exposure)

### 7.1 Why these are here, not in the Native SDK plan

Unlike Part A's topic rails (which need `agentgraph.Graph` and are therefore native-only), payments,
code-execution, and computer-use are **tool-shaped capabilities**, invoked as governed tool calls through
the same gateway every build mode already uses for inference, memory, and tools. There is no structural
reason to make any of them native-exclusive; they belong in the capability library, reachable by native,
BYOF-hosted, and BYOF-connected agents alike, the same way `custom_capabilities` already are. The Native
SDK plan exposes them as typed capability bindings once they exist here; it does not own them.

### 7.2 What already exists, confirmed by reading the code, not assumed

- **Computer-use (browser): substantially built, not a gap to fill from scratch.** `backend/browserpool`
  is a real, tested, governed service: a bounded pool of isolated headless-Chromium sessions
  (Playwright-backed), a fresh, isolated `BrowserContext` per session that purges cookies/storage/
  credentials on close, an egress allowlist and SSRF guard enforced twice (the orchestrator's
  `browser.Service`, re-checked again at the pool), bearer-token authenticated, exposed as the `browser`
  tool.
- **Code execution (general-purpose): does not exist.** `internal/skill`/`internal/skillrunner` (the
  sandbox originally scoped for script-bearing Skills) returns zero implementation, confirmed still
  design-only, consistent with the Governed Skills plan being unbuilt. No "run arbitrary code in a governed
  sandbox" tool exists anywhere today.
- **AP2 (Agent Payments Protocol): not built, but GAL already governs the exact class of action it needs
  to wrap.** Google's open standard for agent-initiated payments (signed Intent/Cart/Payment Mandates, no
  raw banking credentials exposed to the agent), 60+ launch partners (Mastercard, PayPal, Coinbase, Amex,
  Salesforce), contributed to FIDO Alliance governance as of May 2026. GAL's spend caps, simulate-then-
  commit, and human-approval-above-threshold model (the refund-agent example used throughout this session)
  is the exact governance layer a payment-capable agent needs; AP2 gives it the standard wire protocol to
  speak.
- **MCP: client-side built and mature (`internal/mcphub`, catalog, OAuth, SSRF guard, vault, tier gating);
  server-side exposure is narrower than "any agent" today.** Confirmed by reading `handler/http/mcp.go`,
  that endpoint is client-connection management, not server exposure. Only specific components (the
  memory library, the marketplace) currently expose themselves as MCP servers. No general "any Actrone
  agent opts in to being MCP-callable by outside tools" capability exists.

### 7.3 The named 2026 enterprise gaps this design closes

Current research on computer-use and code-execution specifically names:

- *"Anthropic Cowork is explicitly excluded from Audit Logs, the Compliance API, and Data Exports across
  all plan tiers"*, even a frontier lab's own computer-use product doesn't give enterprise buyers audit
  for what it clicked or ran.
- *"Most enterprises have no governance at the tool invocation layer... tool invocations trusted by
  default, no risk scoring before execution."*
- *"Most organisations can monitor what their AI agents are doing, but the majority cannot stop them when
  something goes wrong"*, a monitoring-vs-control gap.
- *"Endpoint logs... rarely capture which MCP servers an agent is wired into, and are not centralised."*
- On the sandbox-vendor side: E2B's named differentiator is *"SDK-first design is a moat"*; Daytona's is
  *"customer-managed compute, point at your own cloud account or on-prem hardware, code/data never
  touches Daytona's servers."*

### 7.4 Design: one governance shape, applied to three capabilities

**Shared foundation across all three, not three separate governance stories:**

- Every session (browser or code) writes into the same signed audit ledger every other governed action
  already uses, not a second logging system, directly answering the Cowork and "not centralised" gaps.
- Every action inside a session goes through the same Tool-Call Supervisor pipeline (allowed_tools → rate
  → spend → injection/SSRF → execute → audit) any other tool call already does, directly answering the
  "tool invocations trusted by default, no risk scoring" gap.
- **A real mid-session interrupt, not just a log.** Given native/BYOF-hosted sessions already run as
  durable Temporal workflows, a cancel/kill-switch during an in-progress browser or code session is
  genuinely cheap here, answering the named monitoring-vs-control gap.
- **Self-hosted deployments run the same pools on the customer's own infrastructure.** `browserpool` is
  already a plain Docker/K8s-deployable service; a code-execution sibling service inherits the same
  property. This is Daytona's named differentiator (customer-managed compute), falling out of Actrone's
  existing self-hosting story rather than requiring a new pitch.
- **Exposed through the same typed native SDK** (the Native SDK plan's capability bindings), matching
  E2B's named "SDK-first is a moat" finding, not a bolted-on separate API.
- **Mapped into the AI Governance Launch Kit plan's EU AI Act crosswalk explicitly**, Article 12's
  reasoning-chain-reconstruction requirement for consequential actions applies directly to payments and
  code-execution.

**Computer-use specific:**

- Extend `browserpool` beyond `navigate` to real interaction, click, type, scroll, matching what 2026
  research means by "computer use," not just page-fetch.
- Capture a screenshot or DOM snapshot at each governed action, sealed into the audit trail, so a session
  is visually replayable, provably reconstructing what the agent actually saw and clicked, not just a
  text log of URLs visited. No compared product makes this claim.

**Code-execution specific:**

- **MicroVM isolation (Firecracker), not container-only.** `browserpool`'s current isolation (one
  Chromium, an isolated context per session) is appropriate for browsing but is process/container-level.
  Code execution is a higher-risk surface than browsing per the current three-tier isolation ranking
  (microVM > gVisor > hardened container); the new service defaults to the strongest tier, matching what
  the leading dedicated vendors (E2B, Modal) actually use.
- Signed, reproducible execution results, content-hashing the code plus its output using the same sealing
  pattern used everywhere else in this codebase, so a code-execution result can be cited as evidence, not
  just trusted output.

**AP2 payments specific:**

- A governed `payment` tool that speaks AP2's signed Intent/Cart/Payment Mandate model on the wire, with
  GAL's existing spend caps, simulate-then-commit, and human-approval-above-threshold enforcement
  underneath it, the exact "consume the ecosystem standard, add governance on top" strategy already used
  for MCP, A2A, and Skills. No compared platform combines AP2-level payment authorization with spend-cap
  and audit-ledger enforcement underneath it.

**MCP server-exposure specific:**

- Let any agent opt in to being callable via MCP by outside tools, two-way MCP citizenship (consumes tools
  and is consumable as one), not just the memory library and marketplace. Governed the same way any
  inbound call is, through the standard authentication and Tool-Call Supervisor path, not a separate,
  weaker surface.

### 7.5 Data model & migrations

- **`code_exec_sessions`**: mirrors `browserpool`'s session shape (`id, tenant_id, agent_id, task_id,
  tier, resource_limits, egress_allowlist, created_at, closed_at`), plus `content_hash` on each execution's
  code+output pair.
- **`payment_mandates`**: `id, tenant_id, agent_id, task_id, ap2_intent_ref, ap2_cart_ref,
  ap2_payment_ref, amount, currency, gal_risk_class, approval_status, content_hash, created_at`, tying an
  AP2 mandate to the existing GAL approval/audit model rather than a parallel payments table.
- **`agent_mcp_exposure`**: `id, tenant_id, agent_id, enabled (bool), exposed_tools (jsonb allowlist),
  created_at`, the opt-in flag and scoped tool allowlist for an agent choosing to be MCP-callable.
- Computer-use sessions extend `browserpool`'s existing session model with a `screenshot_refs`/
  `dom_snapshot_refs` array (object-store pointers), not a new table.

### 7.6 Backend architecture

- **New sibling service, `backend/coderunner`** (naming to confirm at implementation time), following
  `browserpool`'s exact architecture: a `Backend` protocol (a real Firecracker/gVisor-backed
  implementation and an in-memory fake for tests, the same seam `browserpool.BrowserBackend` already
  proves), a bounded pool, a sweeper, bearer-token auth, `/health/live`, `/health/ready`, `/metrics`.
- `internal/browser/`: extend the `browser` tool's contract with `click`/`type`/`scroll` actions and
  screenshot/DOM-snapshot capture, re-checked against the egress allowlist the same way `navigate` already
  is.
- `internal/payments/` (new): the AP2 wire-protocol client, GAL integration for spend-cap and
  approval-threshold enforcement on every mandate.
- `internal/mcphub/`: extend with server-exposure registration, gated per-agent, per-tool allowlist,
  routed through the standard Tool-Call Supervisor path for inbound calls the same way outbound ones are.
- All four capabilities register as `custom_capabilities`-shaped entries, reachable by any build mode
  through the existing governed gateway, not a new access path per capability.

### 7.7 Not in scope for v1

- Third-party auditing/certification of the code-execution sandbox's isolation claims; ship with
  Firecracker/gVisor as designed, pursue a formal audit once there's a track record, the same discipline
  applied to Part F's guardrail benchmark.
- Automatic detection of which capability an agent needs; a developer or Studio user explicitly attaches
  the payment, code-execution, computer-use, or MCP-exposure capability, none are inferred.

---

## 8. Testing strategy (CLAUDE.md §7/§8)

| Layer | Coverage |
| --- | --- |
| **Unit** | `NodeGuard` validation (missing `Ref`, missing branch edge, both rejected); topic-rail embedding-comparison logic (table-driven over exemplar/input pairs, including the LLM-fallback confidence-band boundary); semantic-cache summary computation (correct even when `semcache.enabled` is false, correct source attribution once the artifact/semantic discriminator from §2.2 is resolved); eval-dataset schema-confidence classification (structured vs. unstructured, table-driven) and refuse/escalate scenario presence (every generated dataset asserted to include at least one of each). |
| **Integration** (testcontainers PG16) | `topic_rails`/`eval_datasets` CRUD, env-scoping, migration up + **down**; a compiled graph with a `NodeGuard` node executes and branches correctly end-to-end against a durable Temporal test workflow. |
| **Security** | A topic rail cannot be bypassed by a capability the agent wasn't granted (same capability-ceiling principle applied elsewhere); an eval dataset never contains a real tenant's data, asserted by construction (the generator's inputs are checked to never include a live data-source credential, only the shape signal). |
| **Contract** | `eval-datasets` endpoints in both SDKs vs. the single OpenAPI spec, parity asserted. |
| **CI gates** | lint 0-warnings, race/`-forked`, coverage threshold, vuln scan, image build, contract breaking-change check, `openapi-drift` gate extended to the new endpoints. |
| **Query grammar safety (Part D)** | Every field/table not on the allowlist is rejected, not silently dropped, table-tested against deliberately adversarial grammars; every compiled query is confirmed parameterized (a code-level assertion that no user-controlled string reaches SQL by concatenation, CLAUDE.md §4.2). |
| **Evidence-export integrity (Part D)** | A sealed query export's recomputed SHA-256 matches its stored hash; a tampered export fails verification, mirroring the existing `evidence.go`/residency-attestation test pattern exactly. |
| **Prompt-variant scoring correctness (Part E)** | `loopeval`'s new `GovernanceAccuracy` dimension scores a fixture run against known golden-path/refuse/escalate markers correctly, table-driven; a promoted variant's version bump is confirmed to go through the real `envpromotion` path, not a shortcut. |
| **Benchmark reproducibility (Part F)** | Running the same benchmark dataset version twice against an unchanged platform state yields identical sealed results; a changed platform state (a deliberately broken topic rail in a test fixture) is confirmed to move the score, proving the benchmark actually measures something. |
| **Accuracy-gated promotion (§1.6)** | A rail scoring below the configured threshold is refused promotion, table-tested at the boundary; a force-promote override is logged with the actor and reason, never silent; the same benchmark run against an unchanged rail twice yields the same score. |
| **Firing-trace integrity (§1.7)** | Every guard-node firing produces exactly one `topic_rail_firings` row with a non-empty match/score/method; the row's `content_hash` is recomputable, mirroring the evidence-sealing test pattern used elsewhere. |
| **Review-loop correctness (§1.8)** | Only firings within the configured confidence band queue for review, table-tested at the band's edges; a `confirmed_incorrect` review never silently changes the live rail, an operator's explicit action is required, asserted as a distinct step in the test. |
| **Sandbox isolation & audit integrity (Part G)** | Table-driven test that every code-execution session's declared isolation tier matches its actual backend (microVM by default, never silently downgraded); every session, browser or code, writes exactly one signed ledger entry per governed action, content-hash recomputable, mirroring the evidence-sealing pattern used elsewhere. |
| **Mid-session interrupt & payment governance (Part G)** | A cancel/kill-switch issued mid-session actually halts the durable workflow and is recorded as a distinct terminal state, not silently swallowed; an AP2 payment mandate above the configured GAL threshold is rejected without human approval, table-tested at the threshold boundary; MCP server-exposure defaults to disabled per agent and an inbound call is routed through the same Tool-Call Supervisor pipeline as an outbound one. |

---

## 9. Phased delivery

- **Phase 0: Semantic-cache visibility (Part B).** Cheapest, highest-confidence win, no new domain
  model, extends an existing dashboard over already-computed data (pending the §2.2 source-attribution
  verification). *Exit:* `/cost` shows real semantic-cache hit rate and savings, with a shadow/active
  badge.
- **Phase 1: Topic/flow rails (Part A) core, including the firing trace from day one, not as a later
  add-on.** `NodeGuard`, `internal/topicrail`, the embedding-comparison path (skip the LLM self-check
  fallback initially, ship it once the embedding path's false-negative rate is measured against real
  usage), and §1.7's signed firing trace. The firing trace has no dependency on Part C and is cheap
  relative to the core `NodeGuard` work, shipping it later would mean shipping an unauditable v1 first
  and going back to add the thing that makes it trustworthy. *Exit:* a Studio-authored agent can attach a
  topic rail to its graph, it visibly redirects an out-of-scope turn in `TraceViewer`, and every firing is
  queryable with its full match detail.
- **Phase 2: Eval-dataset generator core (Part C, structured-source only), extended to wire §1.6's
  accuracy-gated promotion as its second consumer, not a separate later phase.** `internal/evaldataset`,
  OpenAPI-spec-driven generation only (the highest-confidence source per §3.2's reused threshold), the
  `POST /v1/eval-datasets/generate` + export endpoints, plus `POST /v1/topic-rails/{id}/benchmark` and
  `.../promote` (§1.6), since accuracy-gating has nothing to score a rail against until the generator
  exists. *Exit:* a developer can upload an OpenAPI spec and export a synthetic dataset with golden-path +
  refuse/escalate scenarios, entirely standalone from EMAOP, **and** a topic rail cannot be promoted past
  development without clearing a measured accuracy threshold against a generated dataset.
- **Phase 3: LLM self-check fallback for topic rails + sample-data-driven eval-dataset generation.**
  Both deferred to their own phase deliberately, they're each a real increment of new capability (a
  second detection method; a second, lower-confidence input source), not required for either Part A or
  Part C to deliver real value first.
- **Phase 4: The human-reviewed feedback loop (§1.8).** Depends only on Phase 1's firing trace existing,
  not on Phases 2-3; sequenced here because it's a real, scoped increment of new UI and workflow (a review
  queue, a moderation flow), not wiring, and doesn't block anything else in this plan from shipping first.
  *Exit:* a borderline firing queues for review, a reviewer's confirm/override is recorded, and a pattern
  of confirmed-incorrect firings surfaces as a candidate adjustment an operator explicitly applies.
- **Phase 5: EMAOP integration.** Once EMAOP's JIT loop ships, wire it as a caller of `internal/evaldataset`
  (§3.2) instead of building its own generation logic, and consider whether topic rails belong in EMAOP's
  own intake questions (a risk-hint-style "should this agent stay on topic" prompt). Explicitly gated on
  EMAOP shipping, matching the same sequencing discipline used in the AI Governance Launch Kit plan.
- **Phase 6: Governed query tooling (Part D).** `internal/govquery`, the ad hoc query endpoint, and the
  "promote to rule" action reusing `notify.Service`. Evidence export ships in the same phase, not deferred,
  since it reuses `evidence.go` unchanged rather than requiring new sealing work. *Exit:* a query across
  governance data returns correct, allowlist-safe results, a saved query fires as a real notification when
  promoted, and a result set exports as a verifiable sealed report.
- **Phase 7: Governance-aware prompt-ops (Part E).** Depends on Part C (eval datasets) and extends
  `loopeval`. `internal/promptvariant`, the comparison view, promotion through the existing ladder. *Exit:*
  a builder compares two prompt variants against a real eval dataset and promotes the winner as a normal,
  audited agent version.
- **Phase 8: Guardrail maturity strategy (Part F).** Sequenced last deliberately, it depends on Part C's
  generator, Part E's extended `loopeval` scoring, and the existing compliance evidence-sealing machinery,
  so it has nothing real to measure or publish until those are live. `internal/guardrailbench`, the
  pluggable `DetectionBackend` interface on `NodeGuard` (§6.2), the first published benchmark on the trust
  center. *Exit:* a scheduled benchmark run produces a sealed result, published as a trend line, not a
  single score, on the public trust page.
- **Phase 9: Universal governed capabilities (Part G).** Sequenced last, not because it depends on Parts
  A-F, it doesn't structurally, but because it's the largest net-new build in this plan (a new sibling
  service, microVM infra, an AP2 wire client) and reuses patterns proven earlier (the signed firing-trace
  pattern from Phase 1, the sealed-export pattern from Phase 6) rather than inventing its own. Ships in two
  slices: **9a** extends `browserpool` with click/type/scroll and screenshot/DOM-snapshot capture, and
  stands up `backend/coderunner` with microVM isolation and signed execution results, both reachable by any
  build mode through the existing gateway; **9b** adds the AP2-governed `payment` tool and per-agent MCP
  server-exposure. *Exit:* a governed agent, any build mode, can execute code in an isolated, audited
  sandbox, interact with a real webpage (not just fetch it) with a replayable visual trail, initiate an
  AP2-governed payment gated by GAL, and optionally expose itself as an MCP server under an explicit tool
  allowlist, all through the same signed audit ledger and Tool-Call Supervisor path as every other governed
  action.

---

## 10. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| **Embedding-only topic detection has a meaningful false-negative rate on adversarial phrasing** | LLM self-check fallback is a planned, not-abandoned Phase 3 item; the embedding path is explicitly positioned as the fast/cheap default, not the only line of defence, and the capability ceiling (the "Security" row of §7) remains the hard backstop regardless of detection accuracy. |
| **`savings.SourceCacheHit` turns out to already be shared between the artifact and semantic caches, and the two get conflated in the new dashboard block** | Explicit verification step called out in §2.2 before any dashboard code ships; a discriminator is added first if needed. |
| **Eval-dataset generator produces a wrong-shaped record for an under-specified source, and a customer tests against a misleading fixture** | The reused schema-confidence threshold (§3.2) fails closed to "ask for real examples" rather than guessing; the refuse/escalate scenario discipline is asserted by construction, not left to chance. |
| **Scope creep: this plan quietly grows into a general-purpose guardrails DSL or a full observability product** | Each part is explicitly scoped to the narrow, verified gap found in §0, not the full feature set of any compared product; §1.9 explicitly defers marketplace distribution of topic rails as unvalidated demand, with a stated trigger condition rather than an open-ended "later." |
| **Accuracy-gated promotion (§1.6) blocks a legitimate rail because the generated eval dataset itself is a poor fit for that rail's topic** | The force-promote override (§1.6) exists precisely for this, logged and visible, never a silent bypass; a pattern of overrides on the same rail is itself a signal the eval dataset needs improving, surfaced through the same query tooling (Part D) used for everything else. |
| **The human-review feedback loop (§1.8) becomes a rubber-stamp queue nobody actually reviews, and stale "unreviewed" firings pile up with no consequence** | Track review-queue age and backlog as a metric from day one (reusing the observability discipline used elsewhere in this codebase), not an afterthought; a permanently-ignored review queue is itself worth surfacing, not silently tolerated. |
| **A query grammar bug lets a crafted request reach unparameterized SQL or an off-allowlist table** | Allowlist-only compilation with adversarial-input tests as a permanent CI gate (§7); no code path accepts raw SQL from a client, by construction, not by convention. |
| **Prompt-variant testing consumes real spend/quota by running multiple variants through the governed execution path** | Variants run through the same spend caps and rate limits any agent run already has, no special ungoverned bypass; a builder sees the cost of a comparison before running it, consistent with existing spend-transparency elsewhere in the product. |
| **A published guardrail benchmark score is low early on and reads as a permanent weakness rather than a maturing system** | Published as a trend over time (§6.3), not a single number; the benchmark dataset version and methodology are versioned and public alongside the score, so the comparison basis is always visible, not just the result. |
| **A code-execution sandbox escape defeats the isolation boundary** | microVM (Firecracker) as the default tier, the strongest of the three-tier ranking used industry-wide (microVM > gVisor > hardened container), not container-only; formal third-party audit deferred (§7.7) until there's a production track record, the same discipline already applied to Part F's benchmark, rather than claiming an unaudited guarantee. |
| **Extending `browserpool` to real interaction (click/type/scroll) expands the SSRF/credential-exfiltration surface beyond read-only navigation** | Every interactive action re-checked against the same egress allowlist and SSRF guard already enforced twice on `navigate`, no new, weaker code path; screenshot/DOM-snapshot capture makes an exfiltration attempt visible in the audit trail rather than only inferable from network logs. |
| **MCP server-exposure turns an agent into an unintended attack surface once any outside tool can call it** | Disabled per agent by default, opt-in only, scoped to an explicit tool allowlist (§7.5's `agent_mcp_exposure`), and every inbound call is routed through the same Tool-Call Supervisor pipeline as an outbound call, not a separate, lighter-weight path. |
| **An AP2 payment mandate is approved based on a spend cap set before the mandate's actual currency/amount is known, e.g. a cross-currency mismatch** | The mandate's `amount`/`currency` are validated against GAL's threshold before the simulate-then-commit step runs, not after; the mandate is rejected, not silently converted, on any ambiguity. |

---

## 11. Open decisions

1. **Should topic-rail enforcement extend to BYOF-connected and BYOF-hosted agents via a gateway-level
   check (§1.9's second deferred item)?** A real, plausible extension since every build mode's inference
   calls already pass through the same gateway, but it trades away graph-level branching (redirect within
   a governed flow) for a narrower per-call block/substitute capability, a BYOF agent has no
   `agentgraph.Graph` for Actrone to branch within. Leaving Actrone's topic rails native-only would be a
   real competitive gap against NeMo Guardrails and Guardrails AI, which are framework-agnostic by design
   and work with any agent loop, including one built on Actrone's own BYOF paths. Not resolved here
   deliberately: it changes Part A's scope meaningfully enough to warrant its own explicit sign-off rather
   than being folded in as an assumption. §1.6-§1.8 (accuracy-gating, the firing trace, the review loop)
   are all written to apply to a firing regardless of which enforcement point produced it, so resolving
   this later doesn't require redoing that work.
2. **What is the default minimum accuracy threshold for §1.6's promotion gate, and is it the same across
   every tenant or tenant-adjustable from the start?** The plan states a threshold exists and is
   fail-closed by default, but not the actual number; needs a decision informed by real benchmark data
   from Phase 2, not picked speculatively before any rail has been scored.
3. **Who owns triaging a stale, unreviewed §1.8 review queue?** The risk table (§9) says a permanently-
   ignored queue should be surfaced, not tolerated, but doesn't assign an owner for acting on that signal,
   an operational question, not an engineering one, the same category of decision the AI Governance
   Launch Kit plan deferred to whoever owns that operational role.
4. **Should `backend/coderunner` be a genuinely new service, or should code-execution instead be folded
   into `browserpool` as a second backend type behind the same pool abstraction?** §7.6 proposes a new
   sibling service mirroring `browserpool`'s architecture, since the isolation requirements diverge sharply
   (microVM for code-exec vs. the current Chromium-context isolation for browsing), but a shared
   pool/sweeper/health-check chassis with pluggable backends is a real alternative worth evaluating once
   implementation starts, not assumed here.
5. **Which microVM runtime, Firecracker directly or a managed layer on top of it, and does that change the
   self-hosting story from §7.4's "same pools on customer infrastructure" claim?** Firecracker is named as
   the target isolation technology, but the operational packaging (bare Firecracker vs. a higher-level
   orchestrator) isn't decided, and self-hosted customers running their own Kubernetes may not have the
   bare-metal access Firecracker typically assumes, a real constraint that needs resolving before the
   self-host claim in §7.4 can be made confidently.
6. **Does MCP server-exposure need its own rate-limit/quota class, separate from an agent's normal inbound
   request budget, given it's now callable by parties outside the tenant's own control plane?** Not
   resolved here; the current design (§7.6) routes an inbound MCP call through the existing Tool-Call
   Supervisor path, but whether that path's existing rate/spend limits are appropriate for a genuinely
   external caller, versus needing a stricter default, is an open question.

---

## 12. Definition of done

- `/cost` shows real, correctly-attributed semantic-cache hit rate and savings, distinct from the
  existing artifact-cache columns.
- A Studio-authored agent's graph can include a `NodeGuard` node backed by a tenant-authored topic rail,
  and an out-of-scope turn visibly redirects, observable in `TraceViewer`.
- A topic rail cannot be promoted past development without clearing a measured accuracy threshold against
  a generated eval dataset; a force-promote override is possible but always logged, never silent.
- Every guard-node firing produces a queryable, signed trace record (matched topic, similarity score,
  detection method), not a bare boolean, exportable as sealed evidence through Part D.
- A borderline firing queues for human review; a reviewer's confirm/override is recorded, and a pattern of
  confirmed-incorrect firings surfaces as a candidate adjustment an operator explicitly applies, never an
  automatic, silent retune.
- A developer can generate and export a synthetic eval dataset (golden-path + refuse/escalate scenarios)
  from an OpenAPI spec, entirely outside any agent-build flow.
- TS + Python SDK parity for the eval-dataset endpoints; OpenAPI (3 synced copies) updated; `openapi-drift`
  CI gate passing.
- A query across governance data (tasks, tool calls, DPE verdicts, capability grants, audit entries)
  returns correct, allowlist-safe results; a promoted query fires a real notification; a result set
  exports as a sealed report whose hash a third party can independently recompute and verify.
- A builder compares prompt variants against a real eval dataset on cost, latency, and governance
  accuracy together, and promotes a winner through the same audited version ladder every other agent
  change uses.
- A scheduled guardrail benchmark run produces a sealed, reproducible result, published as a trend on the
  public trust page, with its dataset version and methodology visible alongside the score.
- A governed agent, any build mode, can execute code in an isolated microVM sandbox with a signed,
  recomputable result, and can interact with a real webpage (click/type/scroll, not just fetch) with a
  replayable screenshot/DOM-snapshot trail, both audited through the same signed ledger and Tool-Call
  Supervisor path as any other governed action.
- An AP2-governed payment mandate above the configured GAL threshold cannot commit without human approval;
  a mid-session code-execution or browser interrupt actually halts the running session and is recorded as a
  distinct terminal state, not silently swallowed.
- An agent can opt in to MCP server-exposure under an explicit, scoped tool allowlist, disabled by default;
  an inbound MCP call is governed exactly like an outbound tool call, not a separate, weaker path.
- CI gates green (lint, race, coverage, vuln scan, image build, contract check).
- `progress.md` updated; Phase 5's EMAOP integration, and Part F's dependency on Parts C and E, explicitly
  documented as blocked on those, not silently attempted early; Phase 9's independence from Phases 0-8
  documented rather than assumed; §11's six open decisions resolved or explicitly still open, not silently
  dropped.

---

*Last updated: 2026-08-12 | Owner: Matt | Scope: `internal/agentgraph`, `internal/topicrail` (new),
`internal/repository/cost.go`, `internal/evaldataset` (new), `internal/govquery` (new),
`internal/promptvariant` (new), `internal/guardrailbench` (new), `internal/loopeval` (extended),
`backend/coderunner` (new), `internal/payments` (new), `internal/browser` (extended),
`internal/mcphub` (extended), Control Tower frontend, TS+Python SDK parity.*
