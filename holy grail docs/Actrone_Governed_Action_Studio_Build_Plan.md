# Actrone Governed Action Studio — Build Plan (Workstreams 1–3)

> Concrete, code-grounded build plan for the three foundational Studio workstreams. Companion to
> the vision (`docs/Actrone_Governed_Action_Studio.md`) and the moat strategy
> (`docs/Actrone_Governed_Action_Layer_Strategy.md`, PART VI).
>
> Status (updated 2026-07-04 after code audit — supersedes "nothing here is built yet"): **WS1 ✅ built**
> (connector write-governance DTO in `connectors.go` + all 3 SDKs + enhanced `CustomConnectorBuilder`),
> **WS2 ✅ built** (curated NetSuite + Workday governed write packs in `erp.go`/`hris.go`, verified by
> `TestVendorWritePacks`; live vendor sandbox is deploy-gated), **WS3 ✅ built** (`internal/connectorimport`:
> `ParseOpenAPI` + advisory `ProposeGovernance` safety-reconciled via `gal.WriteActionSpec.Validate`; wiring a
> live model proposer + an import HTTP endpoint is the deploy-gated tail). The operator/preview UIs from the
> vision doc (Approval inbox, Rollback console, Preview console, Risk dashboard) remain net-new front-end work.
>
> **Status refreshed 2026-07-13 (code-verified):** WS1/WS2/WS3 status not independently re-verified
> line-by-line this pass (backend orchestrator scope was governance/dpe/model/loop/memory/execution
> subsystems, not `connectors.go`/`erp.go`/`hris.go`/`connectorimport` specifically) — treat the WS1–WS3
> build claims above as **unverified 2026-07-13** rather than re-confirmed. One relevant fact that *was*
> verified this pass: the GAL write path these workstreams feed (`cfg.GAL.Enabled`) and the MAL/DPE
> pipeline under it (`cfg.EMAOP.Enabled`) both default OFF — see
> `Actrone_Governed_Action_Layer_Strategy.md`'s refresh note.

---

## Dependency map & sequencing

```
WS1 (API/SDK DTO)  ──┬─→ WS3 (OpenAPI import + AI proposal)   [import writes into the WS1 DTO]
                     └─→ WS2 (curated vendor packs, custom-connector path)
WS2 (preset path)  ────→ can start independently (presets are authored in Go, bypassing the DTO)
```

- **WS1 is the keystone** — it exposes the governance metadata the engine already consumes but no
  authoring surface reaches. Do it first.
- **WS2 has two halves:** curated *presets* (authored in Go, can start now) and the *custom-connector*
  authoring path (needs WS1). Ship the preset half first as the reference catalog.
- **WS3 builds on WS1** — the importer and AI proposer emit the same DTO WS1 defines.

---

## Workstream 1 — Expose write-governance metadata on the connector API + SDKs

### 1.1 Goal
Let an author declare a **governed write** (risk class, reversibility + inverse, simulation strategy
incl. the universal dry-run wiring, money field, compensation TTL) through the public connector API
and the SDKs — closing the gap where the engine + domain model fully support governed writes but no
authoring surface can express them.

### 1.2 Verified current state
- Domain model **already supports** everything: `connector.EndpointAction` carries `RiskClass`,
  `Reversible`, `CompensatingAction`, `Sim`, `AmountField`, `CompensationTTLHours`,
  `DryRunParam/Header/Path/Method`, with `Validate()` enforcing them.
- The engine **already consumes** them: `connectortool.AuthoredWriteSpecResolver.Resolve` maps the
  persisted `EndpointAction` → `gal.WriteActionSpec`; the store persists the full spec as JSON.
- **The gap** is exactly one layer: `internal/handler/http/connectors.go` — the `actionRequest` DTO
  has only `{name, kind, method, path}` and `buildSpec` drops the rest. So an API-authored write
  resolves to the conservative default (approval-forced, no sim).
- **SDKs** (`actrone-ts`, `actrone-go`) have **no connector-authoring surface at all** today (they
  target agents/tasks/tools) — so the SDK part is net-new, not an edit.

### 1.3 Design & changes
1. **Extend `actionRequest`** (connectors.go) with the optional governance fields, mirroring
   `EndpointAction` 1:1 (snake_case JSON): `risk_class`, `reversible`, `compensating_action`, `sim`,
   `amount_field`, `compensation_ttl_hours`, `dry_run_param`, `dry_run_header`, `dry_run_path`,
   `dry_run_method`.
2. **Map them in `buildSpec`** onto `EndpointAction`. No new validation code needed — `spec.Validate()`
   already covers risk-class/sim/dry-run/amount-field invariants and runs on create. Fail-closed is
   already the default (empty risk_class → conservative resolver).
3. **Extend `actionResponse` + `connectorView`** so the governed metadata round-trips on read (today
   `Actions` is just names — surface the governance so the UI/Studio can show it).
4. **SDKs** — add a minimal connector-authoring surface (create/list/get/delete custom connector with
   the governed action shape) to `actrone-go` and `actrone-ts`, typed to the same contract. Python SDK
   parity if/when present. *Decision: API-first; SDK methods are thin typed wrappers over the same
   endpoints.*
5. **Frontend types** (`frontend/src/types` + the integrations create flow) gain the fields — the
   data contract only here; the authoring *wizard* UX is a later Studio workstream.

### 1.4 Tests
- **Handler tests** (httptest): create a connector with a full governed write → read it back → assert
  every governance field persisted + round-trips; an invalid combo (money action without
  `amount_field`, irreversible+reversible, `dry_run` on a read action) → 4xx via `spec.Validate()`.
- **Resolver integration:** author via the DTO → `AuthoredWriteSpecResolver.Resolve` yields the exact
  `gal.WriteActionSpec` (not the fallback) → drives `GALCommitter` to the right sim path.
- **SDK tests:** contract test each SDK's connector-create against a mocked API; assert the JSON body
  matches the handler DTO.

### 1.5 Risks / decisions
- **Backward compatibility:** all new fields optional; existing read-only connectors unaffected
  (empty governance → today's behaviour).
- **Authorisation:** creating a governed *write* connector should require `agent_admin` (a write
  capability is higher-privilege than a read poll) — confirm the route guard, tighten if needed.
- **Don't leak the dry-run safety caveat:** the API docs must carry the same warning as the field
  comments (same-endpoint param/header trusts the vendor to honour the flag).

### 1.6 Acceptance
A governed write authored purely through the public API (or an SDK) is gated by GAL with the authored
risk/sim/reversibility — verifiably not the conservative fallback — and round-trips on read.

---

## Workstream 2 — Curated vendor write packs (NetSuite, Workday) from real docs

### 2.1 Goal
Ship the first **reference governed write catalogs** for two flagship systems, authored from their
real API docs, so agents can *write* to them under full GAL governance — and so we have the template
(and the moat exemplar) for scaling to the top ~20.

### 2.2 Verified current state & architecture seam
- Shipped presets (`VendorPreset`, incl. `hris:workday`, `erp:oracle-netsuite`) declare **read actions
  only**.
- **Key seam:** a `capabilitypack.CapabilityPack` carries `[]gal.WriteActionSpec` — the *governance*
  (risk/reversible/sim/amount) — but **not** the endpoint wiring (method/path and the
  `dry_run_param/header/path`), which live on `connector.EndpointAction`. So:
  - **The authoring home for a curated vendor WRITE is the preset** (an `EndpointAction` with method +
    path + dry-run wiring + governance, which `AuthoredWriteSpecResolver` reads directly).
  - **The capability pack is the distribution/marketplace overlay** that pins the governance (and
    field classifications + coverage + attestations) on top of a connected connector.
  - Deliver **both**: presets = the working catalog; a signed pack per vendor = the shareable artifact.

### 2.3 Grounded vendor reality (from API docs)
- **NetSuite (SuiteTalk REST):** plain CRUD — `GET/POST/PATCH/DELETE` on records; **no true dry-run**
  (only `X-NetSuite-PropertyName/ValueValidation` headers + `respond-async`). ⇒ Governance:
  - `create_*` (POST) → `risk=write`, `sim=predicted` (no pre-image) ⇒ **approval-forced**; reversible
    via `delete_*` inverse.
  - `update_*` (PATCH) → `risk=write`, `sim=read_back` (GET the record first) ⇒ verified diff, can
    auto-commit if reversible (inverse = update back to the pre-image values).
  - `delete_*` (DELETE) → `risk=irreversible` ⇒ approval-forced, no inverse.
  - Money-bearing records (e.g. an invoice/payment) → `risk=money` + `amount_field`, gated by the
    tenant coverage limits.
- **Workday (SOAP WWS full CRUD / REST limited):** **no generic dry-run**; many changes run through a
  **business process that already requires approval** (a natural fit for GAL's approval path);
  effective-dated; some ops irreversible (e.g. termination). ⇒ Governance:
  - Time-off / absence request → `risk=write`, `sim=read_back` where a pre-image exists, reversible via
    the rescind/correct operation; else `predicted` ⇒ approval.
  - Worker data change → `risk=write`, effective-dated; reversible only where a clean correction exists.
  - Termination / one-way events → `risk=irreversible` ⇒ approval-forced.
  - *(Note the transport: Workday's richest writes are SOAP; the current `CustomRESTAdapter` is JSON/REST.
    Decision point in 2.5.)*

### 2.4 Changes
1. Add `erpWritePresets` / `hrisWritePresets` (or extend the existing presets) with a curated set of
   **high-value write `EndpointAction`s** per vendor, each fully governed per 2.3.
2. Author one **signed `CapabilityPack`** per vendor (`capabilitypack.Service.Publish` with
   `WithWriteSpecs(...)` + field classifications + coverage), published under the platform publisher.
3. A short **authoring runbook** doc per vendor citing the exact API endpoints the actions map to.

### 2.5 Risks / decisions
- **Workday SOAP gap (real):** Workday's governed writes are largely SOAP, but the adapter core is
  REST/JSON. **Decision needed:** (a) start with Workday's REST-exposed writes only (narrower but no new
  adapter), or (b) add a SOAP write surface to the connector (larger). *Recommend (a) first* — ship the
  REST-available Workday writes, defer SOAP as its own workstream. NetSuite is fully REST, so it's the
  cleaner first vertical.
- **No dry-run for either** — so these catalogs prove the `read_back`/`predicted`+approval paths, not
  `dry_run`. That's the honest, common case; `dry_run` is reserved for vendors that document one.
- **Credentials/scopes** are per-tenant (unchanged) — the preset carries auth *strategy* + scopes, not
  secrets.

### 2.6 Tests
- Preset build/validate tests (each write action passes `spec.Validate()` + resolves to the intended
  `WriteActionSpec`).
- `GALCommitter` path tests per action against an **httptest** stand-in for the vendor (create→predicted→
  approval; update→read_back→verified; delete→irreversible→approval; money→coverage-gated).
- Pack sign/verify/plan/install tests (reuse the capabilitypack suite) for each vendor pack.
- *Live-vendor exercise is deployment-gated (needs real NetSuite/Workday sandbox creds) — call it out.*

### 2.7 Acceptance
Against a NetSuite (and REST-Workday) sandbox connection, an agent can perform the catalogued writes
and each is governed exactly as authored (verified/approval/blocked), reversible where declared, on a
signed receipt — and the same governance ships as an installable signed pack.

---

## Workstream 3 — OpenAPI import + AI governance proposal

### 3.1 Goal
Turn a vendor's **OpenAPI/Postman spec** into a *proposed* governed connector: auto-derive the action
list, and have an **AI copilot propose conservative governance** for each write, which a human reviews
and signs. The scale accelerant for both the curated head and the long tail.

### 3.2 Verified current state
- No importer today; connectors are authored field-by-field.
- The platform has a **model gateway** (`internal/gateway`, `internal/model`) the AI step can call — no
  new LLM plumbing needed.
- Phase 4 self-describe (`connectorgov.DeriveGovernance`) already auto-classifies *fields* from a live
  sample; WS3 complements it by proposing *actions + write governance* from the spec.

### 3.3 Design & changes (two clean stages, human-in-the-middle)
1. **Deterministic import (no AI):** parse an OpenAPI 3 / Postman collection → `[]EndpointAction`
   proposals (method, path, kind read/write inferred from verb: GET→read, POST/PUT/PATCH/DELETE→write).
   Pure, testable, offline. New `internal/connectorimport` (pure-first).
2. **AI governance proposal (assist, never authority):** for each write, call the model gateway with
   the endpoint + its OpenAPI description/schema (and, when available, `dryRun`/`validateOnly` hints
   from the spec) → a **proposed** `WriteActionSpec`-shaped governance draft with rationale. Strict
   rules:
   - **Conservative defaults:** anything unknown → `risk=irreversible`/`write` + `sim=predicted` ⇒
     approval-forced. The AI can only *propose loosening* (e.g. "this DELETE has a documented restore →
     reversible"), never silently auto-commit.
   - **Structured output + validation:** the proposal is parsed into the typed shape and must pass
     `EndpointAction.Validate()`; anything invalid is dropped, not trusted.
   - **Human sign-off is mandatory** — the proposal lands in the Studio's authoring review (WS1 DTO),
     the human edits + saves. The AI never writes the connector directly.
   - **Provenance:** record that a field was AI-proposed vs human-authored (for audit + the trust story).
3. **Output = the WS1 DTO** — so import/AI/hand-authoring all converge on one governed representation,
   installable as a pack (WS2).

### 3.4 Risks / decisions
- **AI is advisory only** — it proposes, the human signs; conservative fail-closed defaults mean a bad
  proposal degrades to *more* governance (approval), never less. This is the core safety invariant.
- **Spec quality varies** — many enterprise specs are partial/absent; the importer must degrade
  gracefully (propose what it can, mark the rest for manual authoring).
- **Prompt-injection via a hostile spec** — treat spec text as untrusted input to the model; never let
  it change governance without passing `Validate()` + human sign-off. Keep the model call
  read-only/no-tools.
- **Cost/latency** — batch endpoints per call; cache proposals by spec hash.

### 3.5 Tests
- Importer: table tests over sample OpenAPI/Postman → expected `EndpointAction[]` (verb→kind mapping,
  path/param extraction, malformed-spec degradation). Pure + deterministic.
- AI proposer: with a **stubbed model** returning canned drafts → assert conservative defaults,
  invalid-proposal rejection, `Validate()` enforcement, and human-review hand-off (no direct write).
- End-to-end (stubbed model): spec → proposals → accept → a governed connector identical to
  hand-authoring.

### 3.6 Acceptance
Importing a real vendor OpenAPI yields a reviewable governed-connector draft in minutes; every write
defaults to fail-closed governance until a human accepts the (optionally AI-loosened) proposal; the
accepted result is byte-identical to a hand-authored governed connector and installable as a pack.

---

## Cross-cutting: definition of done (all three)

- CLAUDE.md bar: fail-closed by construction; input validated at the boundary; no secrets logged;
  deterministic tests covering happy + error + edge; public surfaces documented.
- **One governed representation** end to end — API/SDK, curated preset, and AI import all emit the same
  `EndpointAction`/`WriteActionSpec`/`CapabilityPack`; no parallel shapes.
- Honest deployment-gating called out where live vendor systems are required (WS2 live exercise, WS3
  live model calls).
- Migrations, if any, are additive/reversible (WS1/WS3 likely need none — the spec is already JSON;
  WS3's provenance flag is a small additive column if persisted).
