# Actrone — Studio Governed-Tools Provisioning, Teams & Role-Scoping Plan

> **Status:** Proposed · **Owner:** Matt · **Created:** 2026-07-14 · **Updated:** 2026-07-14 · **Scope:**
> backend orchestrator + control-tower Agent Studio + a **platform-wide Teams primitive** + contracts + docs.
> **Precedence:** inherits the workspace + project `CLAUDE.md`. Every phase is additive and default-off
> unless a migration is explicitly called out.
>
> **This plan has two intertwined halves:** (I) make the no-code Studio emit governed `spec.tools` so
> tool/role governance is authorable no-code (§0–§12), and (II) a **Teams** system — a platform-wide,
> GitHub-inspired-but-better group primitive that becomes a first-class access **principal** (§13), used
> everywhere access is granted, including the Studio's tool role-assignment (an org admin picks *teams*,
> not just individual roles). Half II also makes channel **approvals/rejections AND alert delivery**
> org-admin-configurable and role/team-enforced (§13.8) — closing the "notifications aren't role-checked"
> and "only org-admins can approve" gaps.
>
> **Decisions locked 2026-07-14** (see §9): connection-binding = author-picks-connection · dead Tier-1 =
> delete · secure-by-default = keep all-roles (opt-in scoping) · channel-chat = adopt Teams principal ·
> Teams grant model = both (principal + role-grants) · nested teams **and** IdP/SCIM sync in v1 · channel
> authorization = org-admin-configurable, enforced on tap **and** delivery.

---

## 0. Why this exists (the gap, code-grounded)

The no-code **Agent Studio** lets an author pick *capabilities*, *integrations* (connectors), and author
*custom capabilities*, but the backend compiler throws most of that away, and the one enforcement path
the no-code model appears to rely on is **not wired**. Concretely, verified in the code:

1. **The Studio compiler emits no `spec.tools`.**
   `internal/agent/studio.go :: CompileStudioManifest` maps built-in capability **IDs → `AgentCapabilities`
   boolean flags** (`capabilitiesFromIDs`) and sets persona/model/budget/schedule/escalation. `studioSpec`
   (studio.go:56–65) has **no** `integrations` or `custom_capabilities` field, so both are **silently
   dropped**. The frontend `buildManifest` (control-tower `components/features/agent-studio/types.ts`)
   *does* emit `spec.integrations` and `spec.custom_capabilities` — the backend just never reads them.

2. **The capability hard-block is dead code.**
   `internal/dpe/engine.go` defines `EvaluateTier1(caps, action)` (capability-flag hard-block) and
   `RequiredCapabilityForTool(tool)` (tool→capability map). **Neither has any production call site**
   (grep: test-only). `ActivityService` wires `DPEEngine` but calls only `EvaluateTier2` (threshold
   rules, activity_service.go:613). `AgentCapabilities` flags are consumed **only** for approval step-up
   sensitivity (`HasSensitive()` → `task_workflow.go:426`, `domain/approval.go:42`) and the go-live
   checklist (`domain/deployment.go`). They are **not** a hard gate on tool execution.

3. **The real, tested tool gate is `spec.tools`.**
   `internal/tool/supervisor.go` governs every model-requested call against `agentFile.Spec.Tools`
   (allowed_tools membership → rate → spend → injection/SSRF → **`AllowedRoles`** → execute). The
   role-scoping we already shipped (`ToolSpec.AllowedRoles`, `ToolDefinitionsForRole`, `authorize`
   Step 2.5, `WithActingRole`) operates **exclusively** on `spec.tools`.

**Net:** a Studio agent has an empty `spec.tools`, so it advertises **no** connector/MCP/A2A/fabric tool
through the governed loop, its custom-capability *bindings* are dead, and its capability *flags* enforce
nothing at call time. Therefore a "restrict this capability to roles" toggle in the Studio would compile
to a field **nothing enforces** — an unenforced control, which the secure-by-construction bar forbids.

Closing this properly means building **Studio → governed `spec.tools` provisioning** first; role-scoping
then rides the *already-wired* `AllowedRoles` path for free. That is this plan.

---

## 1. Goals / non-goals

### Goals
- **G1.** A Studio-authored agent's selected **integrations**, enabled **custom capabilities**, and
  tool-backed **built-in capabilities** compile into real, governed `spec.tools` entries — so they are
  advertised to the model and pass the full Supervisor pipeline.
- **G2.** A no-code author can **restrict any provisioned tool/capability/integration to specific EMAOP
  roles**, enforced through the existing `ToolSpec.AllowedRoles` menu-filter + execution-gate.
- **G3.** **Zero behaviour change** for every existing agent until an author opts in (additive fields,
  default-off, determinism-safe).
- **G4.** One authoritative **capability→tool binding catalog** (versioned reference data), so the
  capability abstraction and the enforced tool names never drift.
- **G5.** Resolve the dead `EvaluateTier1` path deliberately — either wire it as admission-time
  defense-in-depth or delete it — no dead security code left dangling.

### Non-goals
- Not building a general visual tool-graph editor. Provisioning is derived from the existing Studio
  primitives (capabilities / integrations / custom capabilities).
- Not changing the SDK/YAML power-user authoring path (that already works and is untouched).
- Not adding new *connector* implementations — this wires existing connectors/MCP into the Studio, it
  does not add providers.
- Not reworking DPE Tier-2/Tier-3.

---

## 2. Current-state map (files that change or are depended on)

| Concern | Location | Role in this plan |
| --- | --- | --- |
| Studio draft + manifest serialiser | control-tower `components/features/agent-studio/types.ts` | add role-restriction fields; emit them |
| Studio wizard UI | `components/features/agent-studio/{AgentStudioWizard,CapabilityToggles,TemplateSelector}.tsx` | new "role access" controls + governed-tools review |
| Capability catalog (FE) | control-tower `lib/agent-capabilities.ts` | source of capability ids/labels/tiers |
| Entitlements | control-tower `lib/entitlements.ts` (`FEATURE_MATRIX`, `FeatureId`) | tier gating of capabilities/tools |
| Studio compiler (BE) | `internal/agent/studio.go` | **primary change**: read integrations/custom-caps, emit `spec.tools` + `AllowedRoles` |
| Manifest domain | `internal/domain/agent.go` (`AgentSpec`, `ToolSpec.AllowedRoles`) | already has `AllowedRoles`; add capability-catalog plumbing |
| Tool governance | `internal/tool/supervisor.go` | **reuse** — no change (already role-aware) |
| Connector tool router | `internal/connectortool/router.go`, `internal/tool/connector_router.go` | tool name = `connector/{connection_id}` |
| MCP / A2A / fabric advertisers | `internal/tool/supervisor.go` (`{server}/{tool}`, `a2a/…`, `fabric/…`) | tool-name conventions the catalog targets |
| Capability hard-block (dead) | `internal/dpe/engine.go` (`EvaluateTier1`, `RequiredCapabilityForTool`) | **decision**: wire or delete (Phase 4) |
| Contract | `internal/assets/openapi.yaml` + `docs/` | document the studio manifest fields (currently untyped/opaque) |

---

## 3. Design overview

### 3.1 The provisioning pipeline

```
Studio draft (FE)
  ├─ capabilities:        [ "web_search", "send_email", ... ]   (built-in ids)
  ├─ custom_capabilities: [ { id, binding, scopes, dpe_rules, gate, allowed_roles } ]
  ├─ integrations:        [ "erp:workday", "github", ... ]      (connection ids/keys)
  └─ tool_role_access:    { <capability|integration|custom id>: ["agent_admin", ...] }   ← NEW
                       │
                       ▼  buildManifest() emits all of the above (FE)
Studio manifest (actrone.dev/v1, spec.persona-shaped)
                       │
                       ▼  CompileStudioManifest() (BE)  ← PRIMARY WORK
AgentFile.Spec.Tools = provisionTools(
     builtinCaps → capabilityToolCatalog,
     integrations → "connector/{id}",
     customCaps.binding,
   ) each carrying AllowedRoles from tool_role_access
                       │
                       ▼  (unchanged) validate() → store manifest hash
Runtime: Supervisor.ToolDefinitionsForRole + authorize (ALREADY role-aware)
```

### 3.2 Capability → tool binding catalog (new reference data)

A **server-side, versioned, pure** catalog (precedent: `internal/compliance/catalog.go`,
`internal/*/models_catalog.go`) mapping each built-in capability id to the governed tool name(s) it
provisions and how the name is resolved:

```go
// internal/agent/capability_tools.go  (new)
type ToolBindingKind int // builtin | connectorProvider | mcpServer

type CapabilityToolBinding struct {
    Capability string        // "send_email"
    Kind       ToolBindingKind
    // For builtin: the registered tool name (e.g. "web_search").
    // For connectorProvider: the provider key; the concrete tool is "connector/{connection_id}"
    //   resolved from the tenant's connection for that provider (see §3.3).
    // For mcpServer: the "{server}/{tool}" name.
    ToolName   string
    MinTier    domain.FeatureID // entitlement gate mirror (optional)
}
```

- **Built-in capabilities** with a real registered handler (e.g. `web_search`) → a `ToolSpec{Name:"web_search"}`.
- **Capabilities backed by a connector/MCP** (e.g. `send_email`, `create_tickets`) → resolved via the
  tenant's **connection** (see §3.3); if the tenant has no connection for that provider, the tool is
  **omitted** from `spec.tools` (graceful — the capability flag still exists for sensitivity/approval,
  and the author sees a "connect a provider to enable this" state in the UI).
- **Custom capabilities** carry an explicit `binding` (author-provided tool name) → direct `ToolSpec{Name: binding}`.
- **Integrations** are connection ids → `ToolSpec{Name: "connector/{id}"}`.

The catalog is the **single source of truth** (§CLAUDE.md contract-first) so the FE capability list, the
BE compiler, and enforcement never diverge. A catalog-integrity test asserts every FE capability id has a
catalog entry (or is explicitly "no tool binding").

### 3.3 Connection resolution (the one genuinely stateful bit)

`connector/{id}` needs a **connection id**, not a provider name. Two clean options — pick in Phase 1:

- **(A, recommended) Author selects a concrete connection** in the Studio "Integrations" step (the wizard
  already lists connectors). `draft.integrations` holds **connection ids**; the compiler emits
  `connector/{id}` directly. Deterministic, no lookup, no ambiguity.
- **(B) Author selects a provider**, the compiler resolves the tenant's default connection for that
  provider at compile time. Requires a `ConnectionResolver` dependency in `CompileStudioManifest` and a
  policy for "which connection when several exist." More magic, more failure modes.

**Decision (§9.1): A — chosen.** Keeps `CompileStudioManifest` pure (no new I/O dependency) and matches the
SDK/YAML mental model (you name the exact `connector/{id}`). Option B is dropped.

### 3.4 Role-scoping (rides the existing rail, extended to Teams in §13)

`tool_role_access` maps each provisioned unit (capability id / integration id / custom-cap id) → an
allowlist of **principals** — EMAOP roles **and/or Teams** (§13). During provisioning, each emitted
`ToolSpec` gets `AllowedRoles = tool_role_access[unit].roles` and `AllowedTeams = tool_role_access[unit].teams`
(both empty ⇒ unrestricted). Enforcement is **already built and tested** for roles; §13.7 extends the same
single predicate to teams — no *new* enforcement pattern, just a wider principal:

- `Supervisor.ToolDefinitionsForRole` (→ `ToolDefinitionsForPrincipal`) drops disallowed tools from the menu;
- `authorize` Step 2.5 hard-blocks a disallowed call (`ERR_TOOL_NOT_PERMITTED`);
- the acting principal (`role` + resolved `team_ids`) is threaded from the playground submit **and**
  channel-chat (role threading already shipped; team ids added additively in §13.7).

---

## 4. Workstreams (phased, additive, independently shippable)

### Phase 0 — Capability→tool binding catalog + contract (no behaviour change)
- New `internal/agent/capability_tools.go`: the catalog + a pure `ToolNameForCapability` / `BindingKind`
  resolver. Table-driven, no I/O.
- Catalog-integrity test: every built-in capability id in the FE catalog either maps to a binding or is
  explicitly marked "no tool" (locks drift). Mirror of `compliance` catalog tests.
- **Contract:** add the studio manifest tool/role fields (`spec.integrations`, `spec.custom_capabilities`,
  `spec.tool_role_access`) to a documented schema. The studio manifest is currently untyped/opaque at the
  API boundary — introduce a `StudioAgentManifest` schema in `internal/assets/openapi.yaml` (+ the two
  published copies) so consumers validate against one shape (§CLAUDE.md single-source contract).

### Phase 1 — Backend provisioning (flagged, additive)
- Extend `studioSpec` with `Integrations []string`, `CustomCapabilities []studioCustomCapability`,
  `ToolRoleAccess map[string][]string`.
- New `provisionTools(m studioManifest) []domain.ToolSpec`:
  - built-in caps → catalog binding (skip caps with no tool or no tenant connection where required);
  - custom caps (enabled, non-empty binding) → `{Name: binding}`;
  - integrations (connection ids) → `{Name: "connector/{id}"}`;
  - de-dupe by name; apply `AllowedRoles` from `ToolRoleAccess`; carry `AllowedDomains`/`RateLimit` where
    the catalog/custom-cap declares them.
- Wire into `CompileStudioManifest` → `Spec.Tools = provisionTools(m)`. Unknown/garbage tool names remain
  safe: the Supervisor already **omits unresolvable names** from the advertised menu (supervisor.go:199).
- **Feature flag** `STUDIO_TOOL_PROVISIONING` (env → typed config): off ⇒ current behaviour
  (empty `spec.tools`), on ⇒ provisioning. Lets us dark-ship + canary.
- **Role-scoping validation:** reject a manifest whose `tool_role_access` names an unknown EMAOP role
  (fail-fast at compile, clear `ERR_VALIDATION`) — an unknown role is over-restrictive (only super_admin
  passes), so failing loudly is correct.

### Phase 2 — Custom-capability governance completeness
Custom capabilities carry `scopes` + `dpe_rules` + `gate` that are currently dropped. When we start
provisioning their `binding` as a tool, honour the rest so the tool is *fully* governed, not half:
- `scopes` → the connector/OAuth scope allowlist (already enforced at connect time; assert consistency).
- `dpe_rules` → append to `Spec.Governance.Rules` (Tier-2), the same rule engine `EvaluateTier2` runs.
- `gate` (tier) → entitlement check at compile (reject if the tenant's plan lacks the tier), mirroring the
  FE's `FEATURE_MATRIX` gate so the server is authoritative (§CLAUDE.md authorise in the service).

### Phase 3 — Studio UI (role access + governed-tools review)
- `types.ts`: add `toolRoleAccess: Record<string, string[]>` to `AgentDraft`; `CustomCapability` gains
  `allowedRoles?: string[]`. `buildManifest` emits `spec.tool_role_access` + `allowed_roles` on custom caps.
- **"Actions & Connections" step (Step 4):** for each enabled capability / selected connection / custom
  capability, an optional **"Who can use this in chat"** multi-select over the EMAOP roles (default: all).
  Uses the existing `lucide` iconography, tokens, and the design system (no hardcoded colours; loading/
  empty/error states for the connection list).
- **Governed-tools review panel:** a read-only summary ("this agent exposes N governed tools; M are
  role-restricted") so the author sees exactly what will be provisioned before deploy — the no-code mirror
  of reading `spec.tools`. Reuse `ManifestPreview.tsx`.
- Accessibility (WCAG AA), responsive breakpoints, `prefers-reduced-motion` — per §8.

### Phase 4 — Delete the dead capability gate (decision §9.2 = DELETE)

`EvaluateTier1` + `RequiredCapabilityForTool` are unreferenced in production (test-only). Provisioning
(Phases 1–2) makes `spec.tools` the real, single, tested gate, so:

- **Delete** `EvaluateTier1`, `RequiredCapabilityForTool`, the `ProposedAction` type, and their tests from
  `internal/dpe/engine.go` (keep Tier-2/Tier-3, which ARE wired). Removing dead security-adjacent code is a
  net safety win — no reader is misled into thinking capability flags hard-gate tool calls.
- Confirm no build breakage (grep already shows zero non-test callers); the `AgentCapabilities` flags stay
  (they drive approval step-up sensitivity + the go-live checklist — those *are* wired).

### Phase 5 — Backfill & rollout
- Existing Studio agents keep empty `spec.tools` (byte-identical) until re-saved. Provide an **opt-in
  "re-provision tools"** action on the agent settings page that recompiles from the stored studio manifest
  under the new pipeline (versioned via the existing version-snapshot path — never mutate a live manifest
  in place). No forced migration.
- Enable the flag per-env: dev → staging → prod, watching the metrics in §7.

---

## 5. Contracts, back-compat & determinism

- **Single source of truth:** the capability→tool catalog (BE) + the `StudioAgentManifest` OpenAPI schema.
  A contract test fails the build if the FE capability ids and the BE catalog diverge.
- **Additive only:** every new manifest field is optional; absent ⇒ today's behaviour. `ToolSpec.AllowedRoles`
  already ships. `provisionTools` behind a flag.
- **Determinism:** the agent runtime replays through Temporal off the **stored** `AgentFile`. Because
  provisioning happens at **compile/registration time** (not inside the workflow), historical workflow
  replays are unaffected — an already-registered agent's `spec.tools` doesn't change under it. Re-provision
  is an explicit, versioned new manifest (Phase 5), never an in-place mutation.
- **Idempotent compile:** `provisionTools` is a pure function of the manifest; the same draft yields the
  same `spec.tools` (stable ordering, de-duped) so the manifest hash is stable.

---

## 6. Security

- **Authorise in the service:** the `gate`/tier check (Phase 2) and the role-restriction validation run in
  `CompileStudioManifest` (server-side), never trusting the client draft.
- **Fail-closed role validation:** unknown role in `tool_role_access` → compile error (not silently
  over-restrictive-at-runtime).
- **No secret exposure:** connection ids are opaque handles; the compiler never embeds tokens (connectors
  resolve credentials at call time via the existing router).
- **SSRF/injection:** unchanged — every provisioned tool still passes the Supervisor's sanitiser +
  `AllowedDomains` at execution. Provisioning cannot bypass it.
- **Least privilege by default is a product choice:** default `AllowedRoles` is empty = *all roles* (matches
  today). If we want secure-by-default, a follow-up could default sensitive-capability tools to
  `agent_admin` — call out as a decision (§9), don't silently change semantics.

## 7. Observability

- Structured log `event=studio.tools.provisioned` with `{agent_id, tool_count, restricted_count,
  omitted_unresolved_count}` at compile (canonical field schema, no PII).
- Metric `studio_tools_provisioned_total{restricted}` + `studio_tools_omitted_total{reason}` (no
  connection / unknown binding) to watch the flag rollout.
- The existing `tool.blocked` audit row already fires on a role-gated execution block — no new audit needed.

## 8. Testing strategy (error paths as rigorously as happy paths)

- **Unit (BE):** catalog resolver (each capability → expected binding); `provisionTools` table tests
  (built-in/connector/custom/integration, de-dupe, role application, unresolved omission, unknown-role
  rejection); `gate` entitlement rejection.
- **Unit (FE):** `buildManifest` emits `tool_role_access` + custom-cap `allowed_roles`; draft round-trips.
- **Contract:** FE-capability-ids ↔ BE-catalog parity test; OpenAPI `StudioAgentManifest` validation.
- **Integration:** compile a real studio manifest → assert stored `AgentFile.Spec.Tools` (names +
  `AllowedRoles`); then a governed run with an operator vs. admin `ActingRole` asserts the menu-filter +
  execution-gate (reuse the shipped `tool` package tests as the enforcement proof).
- **E2E (thin):** Studio → deploy → chat-as-operator can't invoke an admin-only provisioned tool; deploy
  hash stable across recompiles of the same draft.
- Determinism: no `sleep`; table-driven; each test owns its fixtures.

## 9. Decisions (RESOLVED — 2026-07-14)

1. **Connection binding (§3.3): (A) author picks a concrete connection.** `draft.integrations` holds
   connection ids; the compiler emits `connector/{id}` directly — pure compile, no `ConnectionResolver`.
2. **Dead Tier-1 (§Phase 4): DELETE** `EvaluateTier1` + `RequiredCapabilityForTool` + their tests.
   `spec.tools` is the single, tested gate; a second gate that never ran is confusing dead code.
3. **Secure-by-default roles (§6): keep default = all-roles (back-compat).** Empty `AllowedRoles`/
   `AllowedTeams` ⇒ unrestricted; role/team scoping is opt-in per tool.
4. **Channel-chat granularity: adopt the Teams principal.** Once Teams land (P7), channel chat resolves the
   acting principal (role + team ids) via `PrincipalResolver` — replacing the coarse
   `org-admin→super_admin` / `member→agent_operator` map — so channel tool-scoping uses real roles/teams.
   The coarse map is the interim until P7.
5. **Teams grant model (§13): BOTH** — teams as a first-class access principal (`AllowedTeams`) **and**
   team→role grants (`team_role_grants`) feeding the existing `AllowedRoles`.
6. **Teams nesting & IdP sync: BOTH in v1** — nested teams **and** WorkOS Directory/SCIM group sync ship in
   v1 (sync is no longer deferred; former P10 folds into v1 scope).
7. **Channel authorization (§13.8): org-admin-configurable, enforced on tap AND delivery.** The org admin
   configures which principals (roles/teams) may **approve/reject** *and* which **receive** alerts —
   defaults reproduce today's behaviour; approver-team routing is opt-in per agent with the org-admin
   fallback preserved. (Supersedes the earlier narrow "approver-team routing" question and implements the
   new "enforce role checks for notifications too" requirement.)

## 10. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Provisioning changes behaviour for existing Studio agents | Feature flag + opt-in re-provision (Phase 5); default off |
| Capability→tool catalog drifts from reality | Contract/integrity test fails the build on divergence |
| A capability needs a connection the tenant lacks | Omit gracefully + surface "connect to enable" in UI; capability flag still set for sensitivity |
| Author over-restricts and locks themselves out of a tool in chat | super_admin always passes; review panel shows restrictions pre-deploy |
| Half-provisioned custom caps (binding without scopes/rules) | Phase 2 honours scopes + dpe_rules + gate; don't ship Phase 1 for custom caps without Phase 2 |
| **Teams:** nested-team cascade leaks privilege | Downward-only cascade, cycle prevention + bounded depth, super_admin-gated role grants (§13.9) |
| **Teams:** membership changes mid-run change access | Principal `team_ids` snapshotted at submit into the task input — replay-stable (§13.7) |
| **Teams:** IdP-sync drift / double-edit | Synced teams are UI-immutable (source = IdP); manual + synced teams are disjoint (§13.1) |
| **Teams:** effective-principal resolution on the hot path | `PrincipalResolver` cached ~30s; closure via bounded-depth CTE or a `team_closure` table if profiled (§13.3) |
| **Channels:** enforcing `alert_audience` hides cards users get today | Per-tenant `legacy→authorized` switch; existing tenants stay `legacy` until an admin opts in; new tenants default `authorized` (§13.8) |
| **Channels:** broadcast channels (Teams) can't filter per-recipient | Broadcast gated all-or-nothing on a non-empty audience; carries only a Control-Tower deep link, never sensitive detail (§13.8) |

## 11. Sequencing & rough effort

**Half I — Studio governed-tools provisioning:**

- **P0** catalog + contract — S (1–2 d). Unblocks everything, ships safely (no behaviour change).
- **P1** BE provisioning (integrations + built-ins) behind flag — M (2–4 d).
- **P2** custom-cap governance completeness — M (2–3 d).
- **P3** Studio UI (role access + review) — M (3–4 d).
- **P4** Tier-1 delete/wire — S (0.5–1 d).
- **P5** backfill/re-provision + rollout — S (1–2 d) + soak.

**Half II — Teams (independently valuable; §13). P6/P7 can land before P3 so the Studio picker has real teams:**

- **P6** Teams primitive — migration + repository (CRUD, **nested teams**, expiry, closure) + API + `team_audit` — M (3–5 d).
- **P7** `PrincipalResolver` + enforcement generalisation (`AllowedTeams`, `ActingPrincipal`, `toolAllowedForPrincipal`) + threading + **channel-chat principal adoption (§9.4)** — M (3–5 d).
- **P8** Reusable Teams UI module (`MemberPicker`/`TeamPicker`/`TeamsList`/`TeamDetail`) + org-settings home — L (4–6 d).
- **P9** Channel authorization policy (§13.8) — `channel_authorization_policies` (migration ~00130) + **notification-delivery filtering** + principal-checked approve/reject + config UI + `legacy→authorized` migration switch — M (3–5 d).
- **P10** Platform-wide reuse (team→role RBAC grants, agent ownership/visibility, marketplace publisher teams) — M (3–5 d, incremental per surface).
- **P11** IdP-group sync (WorkOS Directory/SCIM → team) — **in v1** — M (2–4 d).

**Sequencing:** Half I P0/P1 dark-ship first (no behaviour change). Teams P6/P7 unblock the Studio principal
picker (P3), the enforcement extension, and channel-chat granularity; P8 gives the shared pickers that P9's
config UI + the Studio picker both consume; P9 lands the notification-delivery enforcement; P10/P11 broaden
reuse + sync. Total ≈ **6–7 focused weeks** across both halves, every phase an independent, reversible slice
behind additive/default-off seams.

## 12. Pre-ship checklist (per slice)

- [ ] Additive + default-off; existing agents byte-identical until opt-in
- [ ] Catalog is the single source; FE↔BE parity test green
- [ ] Role/principal validation fails closed on unknown roles/teams; tier `gate` enforced server-side
- [ ] Provisioned tools still pass sanitiser/SSRF/rate/spend (no bypass)
- [ ] Determinism: compile-time provisioning + submit-time principal snapshot; stable ordering; manifest hash stable
- [ ] Enforcement reused (one `toolAllowedForPrincipal` predicate, two points); operator/member-vs-admin/team run tested
- [ ] Structured logs + metrics for rollout; no secrets/PII (incl. `team_audit`)
- [ ] Teams: downward-only cascade, cycle-prevented, role grants super_admin-gated, synced teams UI-immutable
- [ ] Loading/empty/error states + a11y (AA) in the Studio UI + Teams module; tokens only; one shared picker
- [ ] Migrations reversible + PG16-validated (`~00129` teams); no in-place manifest mutation
- [ ] Docs: studio manifest schema, Teams API schema, "governed tools & role access" + "managing teams" guides

---

## 13. Teams — a platform-wide access principal (GitHub-inspired, better)

Individual-user grants don't scale: an org admin should grant *a group* access once and manage the group.
**Teams** are named, org-scoped groups of members that become a **first-class access principal** across the
whole platform — for RBAC, agent tool access (this plan), approval routing, notifications, and ownership.
Inspired by GitHub Teams; deliberately better on the axes GitHub is weak.

### 13.1 What "better than GitHub Teams" means (committed differentiators)

- **Nested teams** (parent → child) with downward-only permission cascade — like GitHub — **plus**:
- **Time-boxed membership** (`expires_at`) — access that auto-expires (GitHub has none); a nightly job
  revokes and audits.
- **Request-to-join + maintainer approval** with an in-app queue (not email-only).
- **IdP-group sync** (WorkOS Directory / SCIM group → team) so membership mirrors the source of truth;
  synced teams are read-only in the UI (a lock badge), preventing drift. Manual teams coexist.
- **Team-level RBAC grants** — assign an EMAOP role/scope to a *team*, members inherit (the "assign a role
  to a Team" ask). GitHub only has fixed repo-permission levels; ours grants our real role vocabulary.
- **Full audit trail** (append-only `team_audit`) — every add/remove/grant with actor + reason.
- **First-class in the API + design system** so every surface reuses one `MemberPicker`/`TeamPicker`.

### 13.2 Data model (new tables — migration ~00129, forward + reversible)

Built beside `org_memberships` (migration 00014); all tenant-scoped.

- `teams(id, tenant_id, name, slug, description, parent_team_id NULL→teams.id, visibility
  ['visible'|'secret'], external_group_id NULL, created_by, created_at, updated_at)` — `UNIQUE(tenant_id, slug)`;
  `parent_team_id` for nesting; `external_group_id` set for IdP-synced teams.
- `team_memberships(team_id, user_id, role ['member'|'maintainer'], added_by, expires_at NULL, created_at)`
  — `PRIMARY KEY(team_id, user_id)`; a maintainer can manage membership without being an org admin.
- `team_role_grants(team_id, scope, actrone_role, granted_by, created_at)` — team-level RBAC: members of the
  team hold `actrone_role` within `scope`. The mechanism behind "assign a role to a Team."
- `team_join_requests(id, team_id, user_id, status, decided_by, created_at)` — request-to-join queue.
- `team_audit(id, tenant_id, team_id, actor, action, detail JSONB, created_at)` — append-only.
- Cycle prevention on `parent_team_id` (a team can't be its own ancestor) enforced in the repository +
  a DB `CHECK`/trigger guard; bounded nesting depth (e.g. ≤5) to keep closure resolution cheap.

### 13.3 Effective-principal resolution (the load-bearing logic)

A `PrincipalResolver` (new, server-side, cached ~30s) resolves a user → their **principal**:
`{ actrone_role (direct), scope_roles (direct), team_ids (direct ∪ nested-ancestor closure),
   team_role_grants (union over those teams) }`.

- **Roles are a SET, not a rank** (the EMAOP roles aren't cleanly ordered — see §D2). A user "holds" a role
  if granted **directly OR via any team**. Enforcement is *any-of* set membership, never a numeric max.
- **Nested cascade is downward only** (a parent team's members inherit child grants), never upward — matches
  GitHub, prevents privilege leaks. Ancestor closure is computed with a recursive CTE (bounded depth) or a
  maintained `team_closure` table if profiling demands it.
- Expired memberships are excluded at resolve time (belt-and-braces with the nightly revoke job).

### 13.4 API (contract-first — new `Team*` schemas in OpenAPI)

- Teams CRUD: `POST/GET /v1/teams`, `GET/PATCH/DELETE /v1/teams/{id}` (org-admin; maintainer for own team edits).
- Members: `GET /v1/teams/{id}/members`, `PUT/DELETE /v1/teams/{id}/members/{userId}` (role, expires_at).
- Role grants: `PUT/DELETE /v1/teams/{id}/roles` (scope + actrone_role) — **super_admin-gated** (granting a
  role is privilege assignment; only a super_admin may hand out high roles).
- Join flow: `POST /v1/teams/{id}/join`, `POST /v1/teams/{id}/requests/{reqId}/{approve|deny}`.
- Pickers: reuse the existing `GET /v1/org/members` (from `MembershipRepository.ListMembers`) + `GET /v1/teams`.
- Every mutation is `RequireRole`/`RequireScopeRole`-gated **in the service** and writes `team_audit`.

### 13.5 UI/UX — one reusable Teams module, used platform-wide

A design-system module (`frontend/packages/ui/src/ui/teams/*` + `control-tower/components/features/teams/*`),
brand-locked (Black & Apple-Silver, Geist, `lucide` @1.5, sentence case, tokens only; a11y AA;
loading/empty/error states; `prefers-reduced-motion`):

- **`MemberPicker`** — searchable async multi-select over org members with avatars, keyboard-first, chips,
  recently-added, and an "invite" affordance. The GitHub people-picker, better.
- **`TeamPicker`** — multi-select over teams (with nested indentation + synced-lock badges).
- **`TeamsList`** (searchable nested tree) · **`TeamDetail`** (members table, maintainers, children, role
  grants, audit drawer) · **`JoinRequestQueue`**.
- **Where it's reused (the "entire platform where necessary" mandate):**
  1. **Org settings → Teams** (canonical management home).
  2. **RBAC** — grant roles/scopes to teams (`team_role_grants`) instead of only individuals.
  3. **Agent Studio** (this plan) — pick teams for governed-tool access (§13.6).
  4. **Approvals/escalations** — route an escalation to an **approver Team** (fixes the coarse org-admin-only
     check in `channels.applyApproval`; see §13.8).
  5. **Channel notifications** — target a team's members instead of every linked account.
  6. **Agent ownership/visibility & marketplace** — a team owns/publishes an agent; visibility = "teams X,Y".
  `MemberPicker`/`TeamPicker` are the single shared primitives every one of these consumes.

### 13.6 Studio integration (the specific ask)

In the Studio **"Actions & Connections"** step, the "who can use this in chat" control becomes a
**principal picker**: the org admin selects **Teams** (primary) and/or EMAOP roles from a list. For a team
grant they may also pick the effective role level. This writes
`tool_role_access[unit] = { roles: [...], teams: [...] }`, which the compiler (§Phase 1–2) maps to
`ToolSpec.AllowedRoles` + `ToolSpec.AllowedTeams`. The org admin can add members to a team inline via the
shared `MemberPicker` without leaving the builder, though canonical team management lives in org settings.
Role-grant assignment (`team_role_grants`) is org-admin/super_admin-gated and audited.

### 13.7 Enforcement extension (generalise the shipped predicate — no new pattern)

- `ToolSpec` gains optional `AllowedTeams []string` (team ids) beside `AllowedRoles`. Both empty ⇒ unrestricted.
- The threaded `ActingRole` generalises to an **`ActingPrincipal{ Role string; TeamIDs []string }`**, carried
  the same additive way already built: `AgentTaskInput` → `StreamLLMInput`/`ExecuteGovernedToolInput`, sourced
  in the submit handler + channels via the `PrincipalResolver`. (Additive/optional: empty ⇒ byte-identical.)
- The predicate generalises to `toolAllowedForPrincipal(p, spec)`: unrestricted OR `p.Role == super_admin` OR
  `p.Role ∈ spec.AllowedRoles` OR `(p.TeamIDs ∩ spec.AllowedTeams) ≠ ∅`. Both the menu filter and the
  execution gate call this **one** predicate — the exact two-point discipline already shipped for roles.
- **Determinism:** the principal's `team_ids` are resolved **at submit time** and snapshotted into the task
  input, so a Temporal replay is stable even if team membership later changes — the run reflects membership
  as of submission. Documented + tested.

### 13.8 Org-admin-configurable channel authorization & notification audiences

**Requirement (2026-07-14):** enforce role checks on notification **delivery** (not just the approval tap),
and let the org admin configure **which principals may approve/reject AND which receive alerts** — beyond
just org-admins.

**Today (verified):** `channels.applyApproval` gates taps by `IsOrgAdminBySubject` (**org-admin only**), and
delivery (`NotifyEscalation`/`NotifySummary`) fans out to **all** verified linked accounts with **no**
role/team filter. Both become **policy-driven** and principal-aware (roles ∪ teams, §13.7).

**Authorization policy (new, org-admin-owned).** A `ChannelAuthorizationPolicy` with an **org default** and
an optional **per-agent override**:

- `approvers`: principals (roles and/or teams) permitted to **approve/reject** an escalation. Default =
  the org-admin set (today's behaviour, expressed as a principal set).
- `alert_audience`: principals permitted to **receive** approval cards / alerts / notices. Default handled
  by the migration switch below.
- Optional per-alert-type / per-severity audiences (e.g. `critical` → on-call team) as a v1.1 extension.

**Enforcement — two points, one predicate** (`principalAllowed(p, set)` over the `PrincipalResolver`, §13.3):

1. **Delivery filter (new — the core of the requirement):** `NotifyEscalation`/`NotifySummary` resolve each
   verified linked target → its principal and **deliver only to those in `alert_audience`**. Broadcast
   channels (Teams) can't filter per-recipient, so a broadcast post is gated all-or-nothing on whether the
   audience is non-empty for that channel and carries only a "review in Control Tower" deep link (the
   authenticated surface re-checks) — never sensitive detail to an unfiltered broadcast.
2. **Tap authorization (tightened):** `applyApproval` checks the tapper's principal ∈ `approvers`
   (replaces the hard-coded `IsOrgAdminBySubject`; the default policy reproduces it exactly). Fully audited
   with the resolved principal.

**Storage & contract.** New `channel_authorization_policies(tenant_id, agent_id NULL, approvers JSONB,
alert_audience JSONB, delivery_mode, updated_by, updated_at)` — `agent_id NULL` = org default, a row with
`agent_id` set = per-agent override; migration **~00130**, forward + reversible. Managed by org-admins via
`GET/PUT /v1/channels/authorization` (+ `/v1/agents/{id}/channels/authorization`), using the shared
`MemberPicker`/`TeamPicker` + a role multiselect. `RequireRole(super_admin)`-gated (configuring who can
approve/receive is privilege assignment); every change audited.

**Back-compat & how the "enforce for notifications" directive lands without surprises:**

- `approvers` default = org-admin set ⇒ **tap behaviour is byte-identical** until an admin widens it.
- `alert_audience` is the one intentional delivery change. To avoid silently hiding cards from users who
  receive them today, it's carried by a per-policy `delivery_mode`: **`legacy`** (all verified linked
  accounts — today) → **`authorized`** (filter to `alert_audience` — recommended, the enforced state).
  **New tenants** default to `authorized` with `alert_audience = approvers` (you receive what you can act
  on). **Existing tenants** stay `legacy` until an org-admin flips to `authorized`, so nobody loses
  notifications by surprise. The switch is per-tenant, auditable, reversible.

**Approver-team routing (decision §9.7 = opt-in).** A per-agent `escalation.approver` may name a **team**
(or role set); when set it seeds that agent's `approvers` override. Unset ⇒ the org default (org-admin) —
today's behaviour. This makes approval authority + alert delivery **precise and admin-governed** (named
roles/teams) instead of coarse (any org-admin) / unfiltered (everyone), on the same principal machinery the
tool-scoping uses — one model across the platform.

### 13.9 Security

- Team CRUD + membership gated in-service (org-admin, or maintainer for their team); **role grants
  super_admin-gated** (handing out a role is privilege assignment). Every mutation audited (append-only).
- IdP-synced teams are UI-immutable (source of truth is the IdP); prevents membership drift/escalation.
- Downward-only cascade + cycle prevention + bounded depth stop accidental privilege leaks.
- A team can never grant a role its granter couldn't (a maintainer can't grant super_admin).
- No secrets/PII in `team_audit.detail`; scrub per the canonical log schema.

### 13.10 Migration, back-compat & testing

- **Migration ~00129** (new tables, forward + reversible), PG16-validated. Everything additive: no existing
  agent, manifest, RBAC grant, or approval flow changes until a team is created and used. `AllowedTeams` +
  `ActingPrincipal.TeamIDs` default empty ⇒ byte-identical + determinism-safe.
- **Tests:** repository (CRUD, cycle rejection, expiry, closure resolution) · `PrincipalResolver` (direct ∪
  team ∪ nested-parent union; expired excluded) · `toolAllowedForPrincipal` / `principalAllowed` (role-hit /
  team-hit / both-empty / super_admin / no-match) · **channel authorization** (default policy = today's
  org-admin tap behaviour; `alert_audience` delivery filter drops non-audience targets; `legacy` mode =
  all-linked unchanged; `authorized` mode filters; per-agent override beats org default) · integration
  (grant role to team → member inherits → governed run scoped; team-scoped approval tap accepted, non-member
  rejected; a member in `alert_audience` receives the card, a non-member does not) · contract (Team +
  ChannelAuthorizationPolicy OpenAPI schemas; FE↔BE parity) · thin E2E (org admin builds a team in Studio,
  assigns to a tool, member vs non-member chat; org admin adds a role/team to `approvers` and a non-admin
  member can now approve). Deterministic, table-driven, error paths tested as rigorously as happy paths.

---

### Appendix A — What's already built (this plan reuses, does not rebuild)
- `ToolSpec.AllowedRoles` + `toolAllowedForRole` predicate (`internal/tool/supervisor.go`).
- Menu filter `ToolDefinitionsForRole` + execution gate `authorize` Step 2.5 (`WithActingRole` ctx).
- `ActingRole` threaded from the playground submit (`tasks.go :: actingRoleForSubmit`) and from
  channel-chat (`channels.Service.resolveActingRole` → `ChatResponder.Respond`).
- Tests: `internal/tool/tool_scoping_test.go`, `channels/chat_inbound_test.go :: TestResolveActingRole_MapsOrgRole`.

### Appendix B — Tool-name conventions (the catalog targets these)
Resolution order in `Supervisor.ToolDefinitions` (supervisor.go:158–200): built-in registry name →
`a2a/{remote}/{skill}` → `connector/{connection_id}` → `fabric/{target_org}/{action}` → MCP
`{server}/{tool}`. Unresolvable names are omitted from the advertised menu (graceful degrade), so a bad
provisioned name is never a hard failure.
