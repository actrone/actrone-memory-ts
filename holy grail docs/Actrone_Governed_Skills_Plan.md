# Actrone Governed Skills — Implementation Plan

> **Status:** Ready for Phase 0 — all §16 open decisions locked (2026-07-18). Hosted-platform feature
> (entitlement-gated `governed_skills`), independent of the OSS memory launch — buildable, prod-grade, and fully
> tested now even while OSS ships.
> **Owner:** Matt · **Scope:** backend (orchestrator) + both SDKs (TS + Python) + Control-Tower FE + marketplace + docs.
> **Precedence:** inherits `../CLAUDE.md` (workspace) and `CLAUDE.md` (Actrone). Brand is LOCKED (Black & Apple-Silver).
> **Related:** `docs/Actrone_Governed_Action_Layer_Strategy.md`, `docs/agent-marketplace-design.md`,
> `docs/Actrone_Positioning_And_Competitive_Moats.md`, the Execution/Authoring taxonomy, Capability Packs
> (`backend/orchestrator/internal/capabilitypack/`).

---

## 0. TL;DR

**What:** A **Skill** is a governed, packaged, dynamically-loaded unit of *procedural know-how* — instructions
(+ optional bundled scripts + resources) that an agent loads on demand via **progressive disclosure**. Actrone
implements the open **Anthropic Agent Skills / `SKILL.md`** format for interop, then wraps it in a governance
envelope (signing, version-pinning, DPE enforcement, simulate-then-commit, per-skill ledger, trust tiers,
marketplace) so that **a Skill running inside Actrone is safer and more valuable than the same Skill anywhere
else.**

**Why it is a moat, not a checkbox:** every other host runs a skill's bundled code *ungoverned*. Actrone runs
it under the Tool-Call Supervisor + DPE, pinned and signed, with a replayable audit ledger. The interop is
table-stakes; the governance is the differentiation.

**Where it lives (the capability stack):**

```
tools / MCP           →   the raw verbs (what actions physically exist)
capabilities          →   governed, named, PERMISSION-carrying verbs (what an agent MAY do, under which DPE rules)
skills                →   on-demand PROCEDURES that orchestrate those verbs (HOW to accomplish a task)
```

Skills **compose** capabilities; they do not replace them. `custom_capabilities` stays (it is the standing
*permission* primitive); Skills are the orthogonal on-demand *know-how* primitive. See §2.4 for why merging them
would be a governance regression.

**Where it runs:** all three execution loci (`native` / `byof_hosted` / `byof_connected`), flagship on
**Native/EMAOP**. Delivery mechanism differs per locus; governance holds in all of them because it is enforced at
*install-time* and at the *action boundary*, not only at prompt construction (§4).

**Authoring:** **both** pre-built (first-party catalog) and custom. Custom bifurcates by the existing **pod
principle**: *instruction/binding-only* skills (no code ⇒ **no pod**, no-code authorable in Studio) vs
*script-bearing* skills (custom code ⇒ **pod**, treated like BYOF-hosted code). (§6)

---

## 1. Motivation & positioning

### 1.1 The gap Skills close

Today an Actrone agent's "how to do X" lives in **one static system prompt**, synthesised once at author time and
frozen onto the manifest (`backend/orchestrator/internal/agent/studio.go` → `synthesiseSystemPrompt`). Procedural
knowledge is therefore either (a) crammed into the always-resident prompt (context cost, paid every turn) or (b)
simply absent. There is no reusable, composable, on-demand unit of procedure.

Actrone already has **two of the three** progressive-disclosure axes:

| Axis | Exists? | Where |
| --- | --- | --- |
| Progressive disclosure of **context** | ✅ | `internal/service/jit_context.go` (`memory.search`, `doc.fetch`, `ledger.get`) |
| Progressive disclosure of **tools** | ✅ | `internal/service/tool_selector.go` (`tool_advertise: relevant`, RAG top-K) |
| Progressive disclosure of **procedures** | ❌ | **this plan** |

Skills is the missing third axis.

### 1.2 The standard & the interop play

Agent Skills (`SKILL.md` — YAML frontmatter `name`+`description`, plus instructions and optional bundled
scripts/resources, loaded in three stages: **Discovery → Activation → Execution**) is becoming a cross-vendor
standard (~40 clients by mid-2026). Actrone already made the strategic bet to *consume* the ecosystem as an **MCP
client**; Skills are to *procedural knowledge* what MCP is to *tools*. A customer arriving with a library of
`SKILL.md` files must be able to bring them — otherwise it becomes a distribution gap.

### 1.3 The moat thesis

A **governed** Skill differs from a raw Anthropic/Copilot/Cursor skill in ways that require Actrone's stack:

1. **Governed execution** — a skill's bundled scripts and every action it triggers run under DPE + the Tool-Call
   Supervisor. Instructions can never exceed the agent's *granted* capabilities (§7.4).
2. **Signed provenance + version-pinning** — every skill is content-hashed, signed, and pinned; rug-pulls are
   defeated (reuses the A2A skill-pinning + Capability-Pack signing machinery).
3. **Simulate-then-commit + SAGA rollback** on the writes a skill performs (GAL mechanisms).
4. **Per-skill audit ledger** — signed, replayable "skill X v1.2 did Y under policy Z."
5. **Insurable / outcome-gated** (long game) — a skill can carry a coverage attestation; the optimizer
   promotes/demotes skills by measured governed outcome, feeding the distillation flywheel.

Items 2–5 already exist for *other* artifacts; the moat build is largely **pointing existing moats at a new
artifact type**.

### 1.4 Two adjacent open standards to interoperate with, not rebuild (added 2026-08-07)

Two ecosystem developments since this plan was written are worth building for explicitly, because they widen
where a tenant's skills can come from without adding new governance surface: the existing scan → sign →
version/pin pipeline (§6.1, §7.2) covers both unchanged.

1. **Skill discovery directories (Vercel's `skills.sh` + `npx skills add <owner/repo>`).** A public,
   multi-agent directory of `SKILL.md`-format skills (Vercel-curated + community, working across 18+ agent
   clients) now exists alongside Anthropic's own ecosystem. This doesn't change the artifact model (it's the
   same `SKILL.md` format §3.1 already round-trips), but it means a tenant increasingly won't have a skill
   *file* sitting locally to upload; they'll have a *reference* to a known public skill. **Addition:** the
   import step (§6.1, `POST /v1/skills/import`) also accepts a `source_ref` (an `owner/repo`-style reference
   or a direct URL). The pipeline fetches it server-side and runs it through the **identical** scan → sign →
   pin path as an uploaded bundle. A skill is never trusted by the reputation of its source; only the scan
   result and the trust tier the operator assigns after import (§7.2, §12.1) determine that.
2. **`agent-plugins.org`, a multi-vendor plugin-bundle standard** (Technical Steering Committee spans
   Amazon, Cursor, Microsoft, OpenAI, and Vercel: genuine cross-vendor governance, not one company's format).
   A "plugin" here is one directory bundling **both** `skills/` (Agent Skills) **and** `mcp.json` (MCP server
   configs) under one `plugin.json` manifest, the packaging layer one level above a single skill, for
   distributing a coherent set of skills plus the MCP servers they depend on together. Actrone already has
   both halves separately (an MCP client, and this Skills plan) but no bundle-level import that keeps them
   together on the way in. **Addition:** a new import path,
   `POST /v1/skills/plugins/import` (§10.3), that accepts an `agent-plugins.org`-shaped bundle and splits it
   deterministically:
   - `skills/*` → the normal governed skill import pipeline, one `skills` row + `skill_versions` row per
     skill, scanned and signed identically to any other import. Provenance is preserved distinctly (§9), so
     a plugin-imported skill's origin is auditable, not silently merged into a generic "custom" bucket.
   - `mcp.json` → **staged, not auto-connected.** Each MCP server entry is surfaced to the tenant as a
     pending connector for explicit approval through the existing MCP connector flow
     (`internal/mcphub`); a bundle can propose servers, it cannot silently grant them. This mirrors the
     capability-ceiling principle in §7.4: importing content is never itself a grant of trust or access.
   - Client-specific extensions in the bundle (reverse-domain namespaced directories per the spec, e.g.
     `com.example.client/`) are ignored. Actrone consumes the portable core only, consistent with how the
     bundle format is designed to degrade gracefully for a client that doesn't recognise a given extension.

Neither addition changes §2–§13's governance model; they are new *inputs* to the same pipeline, not a new
enforcement path. Both are scoped into **Phase 2** (§14), which is already where marketplace/SDK/harness
interop parity lands, since that is the natural point a customer expects to bring an existing skill library
wholesale rather than author from scratch.

---

## 2. Concepts & the capability stack

### 2.1 Definitions

- **Skill** — a versioned, signed artifact: `metadata` (name, description, tags — the *discovery* layer) +
  `instructions` (the `SKILL.md` body — the *activation* layer) + optional `resources` (extra `.md`/data files,
  loaded only when referenced) + optional `scripts` (bundled executables — the *execution* layer). Answers **"how
  do I accomplish task Y?"**
- **Capability** (`custom_capability`) — a tenant-authored *permission*: a named binding to an existing
  tool/connector plus scopes + DPE rules + min-tier (`internal/capability/store.go`, migration `00078`). Standing,
  always-enforced; provisions a governed tool. Answers **"what may this agent do, and under which rules?"**
- **Tool / MCP server** — the raw action surface (`ToolSpec`, `MCPServerConfig` in `internal/domain/agent.go`).
- **Capability flags** (`AgentCapabilities`, ~30 booleans) — coarse kernel hard-blocks (DPE Tier-1 gate).

### 2.2 The stack (one diagram to hold in your head)

```
              ┌─────────────────────────────────────────────────────────────┐
  SKILLS      │  process_refund.skill  —  "SOP: verify → refund → notify"    │  on-demand PROCEDURE
              │  requires: [stripe.refund_cap, email.send_cap]               │  (progressive disclosure)
              └───────────────┬──────────────────────────┬──────────────────┘
                              │ composes                 │ composes
              ┌───────────────▼───────────┐  ┌───────────▼──────────────────┐
  CAPABILITIES│ stripe.refund_cap          │  │ email.send_cap               │  standing PERMISSION
              │ binding=stripe.refunds     │  │ binding=mcp:gmail/send       │  (+ DPE rules, scopes)
              └───────────────┬───────────┘  └───────────┬──────────────────┘
              ┌───────────────▼───────────┐  ┌───────────▼──────────────────┐
  TOOLS/MCP   │ stripe.refunds (connector) │  │ mcp:gmail/send (MCP tool)    │  raw VERB
              └────────────────────────────┘  └──────────────────────────────┘
```

### 2.3 What Skills reuse vs add

| Machinery | Source (already built) | Skills reuse it for |
| --- | --- | --- |
| Signed, versioned, installable bundle | `internal/capabilitypack/pack.go` | the skill artifact envelope + sign/verify |
| Per-tenant reusable library | `custom_capabilities` (migration `00078`) | the skill library table + `created_by` scoping |
| Marketplace publish/install + trust tiers | `docs/agent-marketplace-design.md`, `internal/repository/marketplace.go`, FE `TrustBadge` | skill as a marketplace listing type |
| Version-pinning against rug-pulls | A2A `AllowedSkills`/`SkillAllowed` | skill version pinning |
| Progressive disclosure runtime | `tool_selector.go`, `jit_context.go` | the discovery→activation loader |
| Governed code sandbox | BYOF harness pod (`RuntimeSpec`/`EgressSpec`, `actrone-py/harness`) | script-bearing skill execution |
| DPE + Tool-Call Supervisor | governance/DPE | action-boundary enforcement of skill actions |

**Net-new:** the skill *artifact model* + the *loader* (metadata→on-demand body of *instructions*) + the *script
runner* wiring for native + the *skill-requires-capability* composition + a marketplace *listing discriminator* +
the FE surfaces.

### 2.4 Skill ≠ custom_capability — why we keep both

| | Custom capability | Skill |
| --- | --- | --- |
| Payload | binding ref + scopes + `dpe_rules` + `min_tier` | instructions (+ scripts + resources) |
| Question | "what is this agent **allowed** to do?" | "**how** does it do task X?" |
| Lifetime | **standing** — always in the allowlist | **on-demand** — loaded only when relevant |
| Provisions | a governed **tool** | procedural **context** (+ maybe a sandboxed script) |

Two reasons a permission must **not** be folded into a skill (i.e. why "Skills only" is wrong):

1. **Standing vs on-demand.** If the permission to call `stripe.refund` lived inside a skill loaded on demand, the
   agent's action surface would blink in/out with skill loading — "what can this agent do?" stops being a
   deterministic, auditable fact. The DPE allowlist must be fixed and inspectable.
2. **Self-authorisation is privilege escalation.** Least-privilege/separation-of-duties says the thing that *wants
   to act* must not be the thing that *authorises* it. Tenant/admin grants capabilities; a skill merely **uses**
   capabilities already granted. A skill declares `requires: [capabilities]`; activating it may *request* them, but
   granting stays a separate, governed act.

---

## 3. The Skill artifact model

### 3.1 On-disk / on-wire format (SKILL.md-compatible)

A skill bundle is a directory that round-trips with the open standard:

```
process_refund/
  SKILL.md            # YAML frontmatter: name, description, [tags], + instruction body (activation layer)
  actrone.yaml        # Actrone governance envelope (NEW, optional for imports — synthesised if absent)
  reference.md        # optional resource, loaded only when SKILL.md references it
  scripts/
    validate.py       # optional bundled script (execution layer) — script-bearing skills only
```

`SKILL.md` is the **portable** core (import/export any standard skill unchanged). `actrone.yaml` is the
**governance envelope**:

```yaml
# actrone.yaml
schema: actrone.skill/v1
kind: instruction | scripted          # drives the pod bifurcation (§6.2)
requires_capabilities:                 # composition — the capabilities this skill uses (§2.4)
  - stripe.refund_cap
  - email.send_cap
scripts:
  runtime: python3.12                  # scripted only
  entrypoint: scripts/validate.py:run
  egress_allow: []                     # extra outbound hosts; default deny-all (mirrors EgressSpec)
  resources: { cpu: "250m", memory: "256Mi", timeout_seconds: 60 }
dpe_rules:                             # skill-scoped governance guidance (descriptive; enforcement stays in DPE)
  - "Never refund above the per-agent spend cap."
activation:
  match_hint: "customer refund, chargeback, money-back"   # aids the relevance matcher (§5)
min_tier: pro
```

### 3.2 The two payload layers

| Layer | Content | Loaded | Governed by |
| --- | --- | --- | --- |
| **Instructions** | `SKILL.md` body + referenced `resources` | progressive disclosure into model context | scan-at-publish + trust tier + action-boundary DPE (instructions can't exceed granted caps) |
| **Scripts** | `scripts/*` executables | executed on demand as governed tool-calls | **pod/sandbox** + egress deny-all + DPE + capability allowlist |

An **instruction-only** skill (no `scripts:`) is `kind: instruction` — no pod, no-code authorable. A skill with
`scripts:` is `kind: scripted` — custom code ⇒ pod (§6.2).

### 3.3 Immutability & pinning

Each published version is an **immutable snapshot** identified by `content_hash` (sha256 over the normalised
bundle) and signed (Ed25519, reusing the Capability-Pack/marketplace signing path). Agents pin a specific version
(`spec.skills[].version`); an upgrade is an explicit re-pin. This is the rug-pull defense (§7.2).

---

## 4. Where skills run — per-locus delivery

Grounded in the three build modes (`BuildModeNative` / `BuildModeBYOFHosted` / `BuildModeBYOFConnected`,
`internal/domain/agent.go`). Two things differ per locus: **who does progressive disclosure of instructions** and
**where scripts execute**. Governance holds everywhere because it is enforced at install-time + the action
boundary.

| Locus | Loop runs in | Instructions delivery | Scripts run… | Governance |
| --- | --- | --- | --- | --- |
| **Native** (EMAOP no-code + native-SDK) | Actrone kernel (`runAgenticLoop`) | **Kernel push** — full 3-stage disclosure, alongside `tool_advertise` + JIT | Kernel-invoked in a **governed sandbox** as tool-calls under DPE | **Full** — kernel owns prompt/tools/context |
| **BYOF-hosted · stepwise** | Actrone harness pod (`sctx`) | Harness **injects at each step boundary** | In the **pod**, DPE-gated, egress-locked | **Full** — "we run your loop," non-bypassable |
| **BYOF-hosted · encapsulated** | Actrone harness pod (opaque loop) | **SDK pull** (`client.skills.*`) | In the pod | install-time + action-boundary |
| **BYOF-connected** | Customer infra | **SDK pull** | governed *actions* → gateway; pure-local compute → customer's box | install-time + action-boundary |

**Honest limit:** arbitrary *local compute* inside a connected-mode skill script runs on the customer's box (same
boundary as all connected-mode code). Any **governed action** the script performs still routes through the Actrone
tool gateway, so the write is governed even though the loop is remote. We document this, not paper over it.

**Attach point:** a new `Skills []SkillRef` section on `AgentSpec` (`SkillRef = {id, version, enabled}`), resolved
at deploy for native/hosted and exposed to the SDK (scoped to the agent) for connected. Same shape as how
`tools`/`custom_capabilities` attach.

---

## 5. Progressive disclosure (the runtime)

Three stages, mirroring the standard, implemented as a **`SkillManager`** that sits beside `tool_selector` and
`jit_context` in the native loop (and in the harness for hosted-stepwise):

1. **Discovery** — at loop start, only each attached skill's `name`+`description`(+`match_hint`) is injected into
   the (already-synthesised) system prompt. Budgeted: ~30–60 tokens/skill. A tenant with 40 skills pays ~2k
   standing tokens, not 40× full bodies.
2. **Activation** — when the turn's intent matches a skill (cheap embedding similarity over descriptions, reusing
   the retrieval stack behind `tool_selector`; the model may also explicitly request a skill by name), the full
   `SKILL.md` body is loaded into context. Referenced `resources` are loaded only when the body points at them
   (second-level disclosure).
3. **Execution** — the model follows the instructions; any `scripts` are invoked as **governed tool-calls**
   (`skill.exec/{skill}/{script}`) that run in the sandbox/pod and whose actions hit DPE like any other tool.

**Budget & safety rails:** a per-turn cap on activated skills + total skill tokens (config, defaults in
`internal/domain/loop.go` neighbourhood); disclosure can only *narrow/surface*, never silently grant capability
(same invariant as `tool_selector.go`).

---

## 6. Authoring & sources

### 6.1 Three sources, one governed pipeline

Mirrors the tools story (built-in + custom + MCP catalog + marketplace):

1. **Pre-built, first-party** — an Actrone-curated, signed, trust-tier `OFFICIAL` catalog (like the 24-server MCP
   catalog). Batteries-included + the trust anchor.
2. **Custom, tenant-authored** — see §6.2.
3. **Marketplace, third-party** — publishers share/sell skills, trust-tiered, on the Agent-File rails.

**One pipeline for all three:** `author/import → scan → sign → version/pin → DPE-attach → trust-tier → (optional)
publish`. See §7.

### 6.2 Custom authoring bifurcates by the pod principle

| Sub-tier | Authored by | Contains | Pod? | Runtime treatment |
| --- | --- | --- | --- | --- |
| **Instruction/binding-only** (`kind: instruction`) | no-code, in Studio | procedural text + `requires_capabilities` | **No pod** | pure context; scripts absent |
| **Script-bearing** (`kind: scripted`) | pro/dev, upload `SKILL.md` bundle | instructions + `scripts/*` | **Pod** | runs in sandbox, signed/scanned/egress-locked, like BYOF-hosted code |

This is the elegant part: an EMAOP no-code user **can** author custom skills (the instruction kind) without
touching code; power users bring script-bearing skills that get the full pod treatment. The split is a direct,
consistent application of "no code ⇒ no pod."

---

## 7. Governance & security

### 7.1 DPE integration

A skill's `dpe_rules` are **descriptive** system-prompt guidance (as `custom_capabilities` `dpe_rules` are today —
`internal/agent/capability_tiers.go`). **Enforcement** stays in the DPE + Tool-Call Supervisor at the action
boundary: whatever a skill's instructions say, the underlying action is still policy-checked against the agent's
granted capabilities. Skill-scoped *enforceable* rules (Tier-2) are an explicit later phase, not P1.

### 7.2 Signing, scanning, pinning

- **Sign** every published version (Ed25519, reuse `capabilitypack`/marketplace signer) → `content_hash` +
  signature stored on `skill_versions`.
- **Scan at publish** (the **Skill Scanner**, new): (a) static injection/exfil heuristics over `SKILL.md`
  (prompt-injection patterns, requests to disable governance, data-exfil URLs); (b) for `scripted`, dependency +
  secret scan of `scripts/*` (reuse the image/bundle scan path used for BYOF). HIGH/CRITICAL blocks publish.
- **Pin**: agents reference an exact version; verification on load fails closed if `content_hash`/signature mismatch
  (rug-pull defense).

### 7.3 Script execution surface

- **Native:** a governed sandbox (`skill-runner`) — reuse the harness sandbox primitives; **default deny-all
  egress** (`egress_allow` opt-in, mirroring `EgressSpec`), bounded CPU/mem/timeout, no ambient credentials; the
  only way out is the Actrone tool gateway (so every action is DPE-gated).
- **Hosted:** reuse the existing harness pod (the code already runs there).
- Idempotency: script tool-calls carry an idempotency key (§ CLAUDE.md 6.2) so a retried activation cannot
  double-execute a side-effecting script.

### 7.4 Prompt-injection defense (a skill's instructions are untrusted content)

Loading a third-party skill's `SKILL.md` into context is loading **untrusted instructions**. Layered defense:

1. **Capability ceiling** — the strongest guarantee: a skill can only drive actions the agent was *already granted*
   (capabilities). Malicious instructions cannot exceed the granted set; the DPE allowlist is the hard boundary.
2. **Scan + trust tier** — injection heuristics at publish; provenance surfaced (OFFICIAL/VERIFIED/COMMUNITY/
   EXPERIMENTAL) so operators choose their risk.
3. **Pinning + signature** — the reviewed bytes are the executed bytes.
4. **Isolation of instruction vs data** — resources are loaded as clearly-delimited untrusted content.

This is a *selling point*: "bring any open skill — it still can't exceed your governed permissions."

### 7.5 Observability & audit

- Tag existing trace/ledger events (`tool_call`/`tool_result` in `TraceViewer`) with `skill_id`+`skill_version`.
- `skill_invocations` summary table for the "which skills fired, outcome, governed?" view + the signed audit ledger
  (`AuditLogBrowser`, HMAC chain) records skill activation + actions.
- Metrics: activation rate, activation→action ratio, script exec latency p50/p95/p99, scan-block rate, per-skill
  spend (Prometheus, per CLAUDE.md 6.3).

---

## 8. Moats & USPs (what makes the governed version defensible)

1. **Governed execution** — everyone else runs skill code raw; Actrone runs it DPE-gated + egress-locked.
2. **Signed provenance + version-pinning** — reviewed == executed; rug-pulls defeated.
3. **Simulate-then-commit + SAGA rollback** on skill-driven writes (GAL).
4. **Capability ceiling** — instructions can never exceed granted permissions (the prompt-injection answer).
5. **Per-skill signed ledger** — replayable "skill X did Y under policy Z."
6. **Marketplace unit** — more granular/reusable than a whole Agent-File; trust-tiered.
7. **Insurable / outcome-gated** (Phase 4) — coverage attestation + optimizer promotion by measured outcome →
   distillation flywheel.

---

## 9. Data model & migrations

Next available migration numbers (verify latest at implementation time — the chain is ~`00125`; use `00126`+).
All tables `env`-scoped and `tenant_id`-scoped, following the residency-routing repo pattern.

- **`skills`** — logical skill in a tenant library: `id, tenant_id, env, slug, name, description, kind
  (instruction|scripted), source (first_party|custom|marketplace|plugin_import), current_version, min_tier,
  status (draft|active|deprecated), created_by, created_at, updated_at`. Unique `(tenant_id, env, slug)`.
  `plugin_import` (§1.4) preserves that a skill arrived inside an `agent-plugins.org` bundle rather than a
  standalone upload — same governed pipeline, distinct provenance for audit + default trust-tier assignment
  (bundle-imported skills default to `COMMUNITY` unless the bundle's publisher is independently verified).
- **`skill_versions`** — immutable snapshot: `id, skill_id, version, content_hash, signature, body_ref (object
  store), resources_ref, scripts_ref, scan_result (jsonb), sbom_ref, created_at`. Unique `(skill_id, version)`.
- **`skill_required_capabilities`** — composition: `skill_version_id, capability_ref` (custom_capability id or
  built-in id). The "skill requires capability" edge.
- **`skill_invocations`** — audit summary: `id, tenant_id, env, agent_id, task_id, skill_id, skill_version,
  activated_at, outcome, actions_count, correlation_id`. Feeds observability; ties to the existing signed ledger.
- **Marketplace:** add a `package_kind (agent|skill|policy_pack|...)` discriminator to the marketplace package row
  (see §10.3) — do **not** overload `category`.
- Attachment is on the **manifest** (`spec.skills`), not a join table; deployed agents resolve + pin at deploy.

Migrations are backwards-compatible + reversible (goose), with rollback covered in integration tests (CLAUDE.md 6.4).

---

## 10. Backend architecture (orchestrator)

### 10.1 New packages

- `internal/skill/` — domain: `Skill`, `SkillVersion`, `SkillRef`, `Kind`, envelope parse/validate, `content_hash`.
  **Naming (resolved, §16.2): `skill.Skill`** — the `internal/skill` package disambiguates it from `internal/a2a`
  `AgentSkill` (A2A wire endpoints); reference A2A's as "agent skills (A2A)" in comments. No `Governed*` prefix.
- `internal/skill/scanner.go` — the Skill Scanner (§7.2).
- `internal/skill/loader.go` — discovery/activation matcher (relevance), body/resource fetch, budget.
- `internal/skillrunner/` — the governed script sandbox (native) + harness bridge (hosted).
- `internal/repository/skills.go` — CRUD over `skills`/`skill_versions`/`skill_required_capabilities`/
  `skill_invocations` (parameterised, env-scoped).

### 10.2 Loop integration

- **Native:** wire `SkillManager` into `runAgenticLoop` after tool selection + JIT — discovery metadata into the
  system prompt, activation on relevance, `skill.exec/*` governed tool-calls into the sandbox.
- **Hosted-stepwise:** expose skill discovery/activation + `sctx.skill.*` in the harness (`actrone-py/harness`,
  `actrone-ts/harness`).
- **Compile path:** extend `internal/agent/studio.go` `provisionStudioTools`/manifest build to resolve
  `spec.skills`, validate each skill's `requires_capabilities` is granted (fail-closed at deploy if not), and pin
  versions. Extend `internal/agent/parser.go` validation for the new `spec.skills` section.

### 10.3 HTTP API (`internal/handler/http/skills.go`)

| Method + path | Purpose |
| --- | --- |
| `GET /v1/skills` | list tenant library (env-scoped) |
| `POST /v1/skills` | author a custom skill (instruction kind, no-code) |
| `POST /v1/skills/import` | upload a `SKILL.md` bundle (instruction or scripted), or fetch by `source_ref` (`owner/repo` / URL, §1.4) |
| `POST /v1/skills/plugins/import` | import an `agent-plugins.org` plugin bundle (§1.4): `skills/*` → the normal import path per skill (`source=plugin_import`); `mcp.json` entries → staged pending connectors in `internal/mcphub`, never auto-connected |
| `GET /v1/skills/{id}` · `GET /v1/skills/{id}/versions` | detail + versions |
| `PUT /v1/skills/{id}` | update → new immutable version |
| `DELETE /v1/skills/{id}` | deprecate (soft; keeps ledger integrity) |
| `GET /v1/skills/catalog` | first-party OFFICIAL catalog |
| `POST /v1/skills/{id}/install` | install catalog/marketplace skill into the library |
| `POST /v1/skills/{id}/publish` | publish to marketplace (role-gated `RequireScopeRole(ScopeMarketplace, publisher)`) |
| `POST /v1/skills/relevant` | connected-mode SDK pull: given a task, return relevant skill metadata |
| `GET /v1/skills/{id}/body?version=` | connected-mode activation: full instructions (governed, pinned) |

All writes idempotent (idempotency key); all inputs allowlist-validated with size caps; authz in the service
(`RequireScopeRole`), not only the gateway (CLAUDE.md 5.2). Errors use the structured domain-error contract; no
internal detail on 5xx.

### 10.4 Marketplace listing discriminator

The marketplace is agent-centric today (single `MarketplacePackage`, free-form `category` — no polymorphic type).
Add a `package_kind` discriminator (`agent | skill | policy_pack`) to the package row + registry
(`internal/repository/marketplace.go`) and branch the publish/validate/search paths. Trust tiers
(OFFICIAL/VERIFIED/COMMUNITY/EXPERIMENTAL) and Ed25519 signing are reused unchanged.

---

## 11. SDK parity (TypeScript + Python — no Go)

Per the CLAUDE.md parity rule: one contract, both SDKs, each with contract tests. (The Go SDK is removed from the
family — no Go leg.)

### 11.1 Client surface (both `actrone-ts` + `actrone-py`)

```
skills.list()                      # library
skills.get(id) / skills.versions(id)
skills.create(input)               # author instruction skill
skills.import(bundle)              # upload SKILL.md bundle
skills.install(id) / skills.publish(id)
skills.relevant(task)              # connected-mode pull: metadata for matching skills
skills.load(id, version)           # connected-mode activation: full instructions (pinned)
```

### 11.2 Harness integration (hosted)

- `actrone-py/src/actrone/harness/` + `actrone-ts/src/harness/`: add `sctx.skill.discover()/activate()/exec()`
  so stepwise frameworks get kernel-parity progressive disclosure inside the pod; encapsulated frameworks use the
  pull client.
- BYOF-connected framework adapters expose a helper to inject relevant skill instructions into the framework's
  prompt (pull model), and route skill `exec` actions through the governed gateway.

### 11.3 Contract tests

Skill CRUD + install + relevant/load covered by contract tests against the single OpenAPI contract in **both**
SDKs; parity asserted (identical request/response shapes). Update the OpenAPI spec (the 3 synced copies:
`backend/orchestrator/internal/assets/openapi.yaml`, `frontend/apps/marketing/public/openapi.yaml`,
`infra/mock/openapi.yaml`).

---

## 12. Frontend changes (Control Tower + marketplace)

All FE reuses `@actrone/ui` primitives and the locked Black & Apple-Silver tokens (`globals.css`), lucide icons at
`strokeWidth={1.5}`, sentence case, no hardcoded emoji. Every async surface ships **loading / error / empty**
states (`Skeleton`/`ErrorState`/`EmptyState`). Accessibility per CLAUDE.md 8.2.

### 12.1 New route tree — `frontend/apps/control-tower/src/app/(app)/skills/`

- `/skills` — **library list** (server component; `serverSkillsApi.list()`), rendered with a `SkillsBrowser`
  client component using `useDataView` (URL-synced table), `DataToolbar`, `Badge` for `kind`/`trust_tier`/`min_tier`,
  `EmptyState` ("No skills yet — create one or install from the catalog"). Filters: source, kind, tier.
- `/skills/new` — **authoring page**. Reuse the proven `CustomCapabilityBuilder` dialog shape
  (`components/features/agent-studio/CapabilityToggles.tsx:372`) promoted to a full page/`SkillBuilder`: fields for
  name, auto-slug, description, `match_hint`, instructions (a monospace `CodeBlock`-style editor for the `SKILL.md`
  body), `requires_capabilities` (multi-select from the tenant capability library), `dpe_rules` (one per line),
  `min_tier`. A **kind** toggle: *Instruction* (no-code, default) vs *Scripted* (reveals a bundle-upload dropzone +
  egress/resource fields; gated to `pro`+ and flagged "runs in a governed sandbox").
- `/skills/[id]` — **detail**: metadata, version history (`VersionSelector` reuse), `requires_capabilities`,
  scan result + trust badge (`TrustBadge` reuse), "used by N agents", `RollbackConsole`-style version pin/rollback.
- `/skills/catalog` — **first-party catalog** grid with `InstallButton` (reuse marketplace component).

### 12.2 Agent Studio integration

- Add a **Skills** section to the wizard. Cleanest placement: a sub-panel in **Capabilities** step
  (`CapabilityToggles.tsx`) — since skills *compose* capabilities, this keeps them visually adjacent — OR a 5th step
  `['Template','Persona','Capabilities','Skills','Actions & Connections']` (`agent-studio/types.ts:210`). Recommend
  a sub-panel to avoid wizard bloat.
- `SkillAttach` component: pick from library/catalog, shows each skill's `requires_capabilities` and
  **auto-suggests/auto-enables the capabilities it needs** (resolving the capability-vs-skill UX confusion — §2.4).
  Selected skills compile into `spec.skills` via `buildManifest` (`agent-studio/types.ts` — add a `skills` mapping
  next to `custom_capabilities`).
- `ManifestPreview.tsx` + `GovernedToolsReview.tsx`: show attached skills + the capabilities they pull in, so the
  pre-deploy summary is complete.

### 12.3 Agent detail / settings

- `agents/[id]/page.tsx` spec cards: add a "Skills" card reading `agent.agent_file.spec.skills` (mirror how
  `capabilities`/`custom_capabilities` render via `specValue`).
- `agents/[id]/settings/page.tsx`: allow attach/detach + version re-pin (PUT `/v1/agents/{id}`).

### 12.4 Marketplace UI (both control-tower + standalone `apps/marketplace`)

- Thread the new `package_kind` discriminator through `MarketplacePackage` (`marketplace/types/index.ts:715`),
  `AgentCard`/`AgentCardCompact` (render skill vs agent chrome), `FilterPanel` (add a **Type** facet: Agents /
  Skills / Policy packs — currently only free-form `category`), and `PublishWizard` (branch: publishing a skill
  vs an agent). `TrustBadge`, `GovernanceStats`, `InstallButton`, `VersionSelector` reused unchanged.
- BFF routes under `app/api/marketplace/*` extended for the skill kind; `marketplaceApi`/`marketplace-server.ts`
  typed accordingly.

### 12.5 Observability

No new route: per-skill invocations ride the existing `tool_call`/`tool_result` rows in
`components/features/TraceViewer.tsx:342` — add a skill badge/label + "activated skill" event row and a governed
status variant. `AuditLogBrowser.tsx` + `governance/actions` show skill-driven actions (already generic over
tool-calls). Add a small "Skills fired" panel to `tasks/[taskId]` if useful.

### 12.6 API client + nav

- **Browser client:** add `skillsApi` to `lib/api/client.ts` following `customCapabilitiesApi` (`client.ts:1229`)
  — typed `SkillRecord`/`SkillInput`/`SkillVersion`, wrapped by the shared `request`/retry/circuit-breaker.
- **Server client:** add read-only `serverSkillsApi` to `lib/api/server.ts` (following `serverAgentsApi:151`) for
  SSR pages.
- **Nav:** add `{ href:'/skills', label:'Skills', icon: <lucide, e.g. GraduationCap/Sparkles>, feature:'governed_skills' }`
  to the **Resources** group in `components/layout/Sidebar.tsx` (next to Integrations), plus a `CommandPalette` entry.
- **Entitlement:** register `governed_skills` in `lib/entitlements.ts` so nav + routes gate by plan.

### 12.7 Marketing/docs FE

- Docs pages under `frontend/apps/marketing/src/app/(marketing)/docs/` for Governed Skills (concept, authoring,
  `SKILL.md` import, the capability-composition model, governance/trust). Respects the OSS launch gate
  (`NEXT_PUBLIC_LAUNCH_MODE=oss` hides hosted surfaces — Skills is a hosted feature, so it's hidden in OSS-only
  mode until GA).

---

## 13. Testing strategy (prod-grade, CLAUDE.md §7/§8)

| Layer | Coverage |
| --- | --- |
| **Unit** | envelope parse/validate; `content_hash` stability; relevance matcher; scanner heuristics (injection/exfil positives + negatives); capability-ceiling logic; version-pin verify (tamper → fail closed); loader budget. Table-driven; error paths as rigorous as happy paths. |
| **Integration** (testcontainers PG16) | skills/skill_versions/required_capabilities/invocations CRUD env-scoping; migration up+**down** (rollback); publish→install→attach→deploy; deploy fail-closed when a required capability isn't granted. |
| **Sandbox/security** | script runner egress deny-all (blocked host → denied); DPE gate on `skill.exec` actions; idempotency (retried activation doesn't double-execute); a "malicious" skill can't exceed granted caps (the capability-ceiling test — the headline security assertion). |
| **Contract** | skill endpoints in **both** SDKs vs the single OpenAPI; TS↔Py parity (identical shapes). |
| **E2E** (Playwright) | Studio: author instruction skill → attach to agent → deploy → run → skill activates in `TraceViewer`. Marketplace: publish skill → install → attach. FE loading/error/empty states asserted. |
| **CI gates** | lint 0-warnings, race/`-forked`, coverage threshold, `govulncheck`/`pip-audit`/`npm audit` (no HIGH/CRIT), image build, contract breaking-change check. |

Progress tracked in `progress.md`; the infra deployment runbook updated when deployment-gated pieces (sandbox
infra, object store buckets, scanner) land.

---

## 14. Phased delivery (architect once, ship in tiers)

The fast-follow and the moat build are the **same codebase, phased** — never a rebuild. Each phase is independently
shippable and fully tested before the next.

- **Phase 0 — Artifact & pipeline (foundation).** `internal/skill` domain + envelope, `skill_versions` immutability,
  sign/verify (reuse capabilitypack), scanner v1, repository + migrations, HTTP CRUD + import, `skillsApi`/
  `serverSkillsApi`, `/skills` list + `/skills/new` (instruction-only), nav + entitlement. *Exit:* author + store +
  sign + list an instruction skill, fully tested. **This is the correctly-architected "fast-follow" slice.**
- **Phase 1 — Native governed execution (flagship).** `SkillManager` in `runAgenticLoop` (discovery/activation),
  `skillrunner` sandbox for `scripted` skills, capability-ceiling enforcement, `spec.skills` compile + deploy
  fail-closed, Studio attach + agent detail, `TraceViewer` skill rows. *Exit:* an EMAOP agent activates a skill and
  runs a governed script end-to-end.
- **Phase 2 — BYOF + SDK parity + marketplace (BOTH surfaces).** Harness `sctx.skill.*` (hosted-stepwise), SDK
  pull (`relevant`/`load`) for connected + encapsulated, TS+Py client + contract tests, the marketplace
  `package_kind` discriminator + the skill listing/publish/install surfaces in **both** control-tower AND the
  standalone `apps/marketplace` (§16 decision 5), plus the first-party catalog. Also lands the two ecosystem
  import additions from §1.4: `source_ref` import (skills.sh-style directory reference) and
  `POST /v1/skills/plugins/import` (whole `agent-plugins.org` bundle, MCP entries staged for approval). *Exit:*
  import a standard `SKILL.md` (by upload or `source_ref`) **or a plugin bundle** (skills land governed + its
  MCP servers land as pending, unapproved connectors), run it in a hosted framework, publish/install via both
  marketplace surfaces.
- **Phase 3 — Moat depth.** Simulate-then-commit + SAGA on skill writes, per-skill signed ledger view, richer
  scanner, outcome metrics.
- **Phase 4 — Assurance/outcome (gate on demand).** Coverage attestation ("insurable skills"), optimizer
  promotion by governed outcome + distillation. **Build only once Skills adoption is real** — its value depends on
  enterprise buyers caring that a skill is *governed*.

---

## 15. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| **Naming collision** with A2A `AgentSkill` | distinct package/type (`skill.Skill` vs `a2a.AgentSkill`); consistent "agent skills (A2A)" phrasing; user-facing term is just "Skills." |
| **Prompt injection** via untrusted skill instructions | capability ceiling (hard limit) + scan + pinning + trust tiers (§7.4). |
| **Script sandbox escape** | reuse the proven harness isolation + egress deny-all + no ambient creds; gate `scripted` skills to `pro`+. |
| **UX confusion** capability vs skill | Studio adjacency + auto-suggest capabilities from a skill's `requires` (§12.2). |
| **Progressive-disclosure only works where we own the loop** | explicit per-locus model (§4); connected/encapsulated use SDK pull; documented honestly. |
| **Scope creep before OSS/raise** | it's a hosted feature, entitlement-gated, decoupled from OSS; Phase 4 gated on demand. |
| **Marketplace was single-type** | add `package_kind` discriminator cleanly rather than overloading `category`. |
| **A plugin bundle's `mcp.json` is untrusted input** (a malicious/compromised bundle could try to smuggle in a rogue MCP server alongside legitimate skills) | never auto-connect: every server from an imported `mcp.json` lands as a **pending** connector in `internal/mcphub` requiring the same explicit tenant approval as any manually-added MCP server (§1.4); importing content is not itself a grant. |
| **`source_ref` fetch is server-side outbound to an arbitrary reference** | reuse the existing outbound-fetch hardening already required for connector/webhook fetches (allowlist-validated URL, size cap, timeout) rather than a bespoke fetcher; the fetched bytes still go through the unmodified scan → sign → pin path, so a bad `source_ref` produces a scan failure, not a bypass. |

## 16. Resolved decisions (locked before Phase 0)

All five open decisions are now decided (2026-07-18):

1. **Studio placement → sub-panel of the Capabilities step.** Skills attach in the same step where capabilities
   are chosen — since a skill *composes* capabilities, keeping them adjacent (and auto-suggesting the
   capabilities a skill needs) is the clearest mental model, and it avoids `STUDIO_STEPS`-tuple churn (§12.2).
2. **Domain type name → `skill.Skill`.** The package name (`internal/skill`) disambiguates it from
   `internal/a2a` `AgentSkill` (A2A wire endpoints); comments say "agent skills (A2A)" where the two could be
   confused. No `Governed*` prefix — the whole platform is governed, so it would be noise (§10.1).
3. **Body storage → object store (S3).** All skill bodies + `resources` + `scripts` live in the object store,
   addressed by `content_hash` (immutable, signable, cheap to stream, uniform for instruction-only and
   script-bearing skills alike). The DB keeps only metadata + refs (`body_ref`, `resources_ref`, `scripts_ref`)
   (§3.3, §9).
4. **Relevance matcher → reuse the `tool_selector` embedding path.** Skill discovery/activation uses the same
   retrieval stack that already backs `tool_advertise: relevant` (embed the turn intent, cosine over skill
   descriptions/`match_hint`) — one retrieval subsystem, no dedicated skill index to operate (§5).
5. **Marketplace app → extend BOTH now (control-tower + standalone `apps/marketplace`).** The `package_kind`
   discriminator + the skill listing/publish/install surfaces land in **both** the control-tower publisher/
   consumer surfaces **and** the standalone public marketplace app in Phase 2 (not deferred) — a Skill is
   discoverable + installable everywhere an Agent-File is from day one (§12.4, §14).

## 17. Definition of done

- All three sources (first-party / custom / marketplace) authorable + installable through one governed pipeline.
- Instruction-only (no-pod) **and** script-bearing (pod) custom skills both work, DPE-enforced.
- Progressive disclosure live on Native; SDK-pull on hosted-encapsulated + connected; `sctx` on hosted-stepwise.
- Capability-ceiling test green (a skill cannot exceed granted permissions).
- TS + Python SDK parity + contract tests green; OpenAPI (3 copies) updated.
- FE: `/skills` tree, Studio attach, agent detail, marketplace kind, `TraceViewer` labels — all with loading/error/
  empty states, brand tokens, a11y.
- Signed + version-pinned + scanned; per-skill ledger; metrics exposed.
- CI gates green; `progress.md` + deployment runbook updated.

---

*Last updated: 2026-08-07 | Owner: Matt | Scope: hosted-platform Governed Skills (interop + moat), TS+Python SDKs.*
