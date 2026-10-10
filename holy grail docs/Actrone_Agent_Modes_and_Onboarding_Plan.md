# Agent Modes, Onboarding & Control Tower Information Architecture

**Version 1.0 — June 2026 · ✅ SHIPPED as Master-Plan P1 (build-mode chooser, mode-scoped agents list, entitlements-first onboarding). This doc captures the original analysis; authoritative status: [Platform Evolution §0a](./Actrone_Platform_Evolution_Master_Plan.md#0a-implementation-status-verified-2026-06-24).**

> **Status refreshed 2026-07-13 (code-verified):** the three "Python/Go" SDK-language mentions in this
> doc (line ~30's Native-SDK row "Code with the Actrone SDK (Python/Go)", the ASCII diagram's "Python
> or Go" panel, and §6's code-tab list "Python / Go / TypeScript") are stale — **the Go client SDK was
> deleted** (`Actrone_Go_SDK_Removal_Plan.md`, code-verified done; no `actrone-go/` anywhere in the
> repo). The supported native-SDK languages are now **Python and TypeScript**; any onboarding
> code-tab/snippet content built from this doc should drop Go and add TypeScript where it's missing.
> The `build_mode` model itself (`native`/`byof`/`emaop` on `domain.Agent`) and the BYOF framework list
> (LangGraph/CrewAI/LangChain/AutoGen/Google ADK/OpenAI Agents SDK) are still accurate as a concept,
> though the real BYOF framework set has grown well beyond this list — see
> `Actrone_Framework_Adapter_Parity_Plan.md` for the current inventory.

> Fixes the core confusion you flagged: the Control Tower treats all agents the
> same and "New agent" wrongly forces Agent Studio. This plan introduces a
> first-class **Agent Mode** concept, a build-mode walkthrough, entitlements-first
> onboarding, and a mode-scoped Control Tower with a consolidated overview.

---

## 1. The problem

Actrone supports (at least) three fundamentally different ways to run agents, and the UI conflates them:

- A developer using the **Actrone SDK** to build an agent in code.
- A team using the **Actrone SDK as an observability/governance layer on top of an existing framework** (LangGraph, CrewAI, LangChain, AutoGen…).
- A non-developer using **EMAOP / Agent Studio** to build and deploy a no-code agent into enterprise systems.

These have different mental models, different "create" flows, different metrics, and different governance. Forcing everyone through Agent Studio (as "New agent" does today) is wrong for two of the three audiences.

---

## 2. The model: three Agent Modes

Introduce a first-class, persisted attribute on every agent: **`build_mode`**.

| Mode | `build_mode` | Who | How agents are created | Primary surfaces |
|---|---|---|---|---|
| **Native SDK** | `native` | Developers | Code with the Actrone SDK (Python/Go); registered via SDK/REST | Quickstart code snippets, SDK registry, trace viewer |
| **Bring-Your-Own-Framework (BYOF)** | `byof` | Teams with existing agents | Wrap an existing LangGraph/CrewAI/… agent with the Actrone SDK adapter | Adapter setup, framework badges, observability + governance overlay |
| **EMAOP (no-code)** | `emaop` | Ops / enterprise | Agent Studio 5-step wizard → deployed to enterprise systems | Agent Studio, connectors, manifest, governance |

**Where it's stored:** `build_mode` on the agent record (backend `domain.Agent`) + surfaced in the agent manifest metadata. SDK registrations default to `native` (or `byof` when the SDK detects/declares a framework adapter); Agent Studio sets `emaop`.

**Why a single attribute, not three products:** they share the orchestrator, governance, memory, cost, and audit. Mode is a *lens*, not a separate stack. This keeps one codebase while giving each audience a tailored view.

---

## 3. The build-mode walkthrough (replaces "New agent → Agent Studio")

"New agent" (and the empty-fleet CTA) opens a **mode chooser** first:

```
How do you want to build?

┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│  ⌨  Actrone SDK     │ │  🔗 Your framework   │ │  ✨ No-code (EMAOP) │
│  Build in code with │ │  Add Actrone to a    │ │  Build & deploy via │
│  Python or Go       │ │  LangGraph/CrewAI…   │ │  Agent Studio to    │
│                     │ │  agent you already   │ │  enterprise systems │
│                     │ │  have                │ │                     │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```

Each choice routes differently:

- **Actrone SDK (`native`)** → a guided **code-first onboarding** (not a form): real, copyable code blocks (the same `CodeBlock`/Shiki components used in docs) for `pip install actrone` / `go get`, register an agent, submit a task, read the trace — plus a prominent "Open full docs" link. No wizard. The agent appears in the fleet once the SDK registers it.
- **Your framework (`byof`)** → an **adapter setup** flow: pick the framework (LangGraph, CrewAI, LangChain, AutoGen, Google ADK, OpenAI Agents SDK), show the adapter install + wrap snippet (`from actrone.adapters import LangGraphAdapter`), explain what Actrone adds (durable execution, memory, governance, cost, audit) *without* changing their agent logic, link to per-framework docs.
- **No-code (`emaop`)** → the existing **Agent Studio** wizard (gated on the EMAOP entitlement; if not entitled, show the upgrade/enable path instead).

Mode choices the org isn't entitled to are shown but clearly gated (consistent with `FeatureGate`), so users understand what's available and how to unlock it.

---

## 4. Control Tower information architecture

### 4.1 Mode-scoped views + sidebar

Add a **Mode switcher** at the top of the sidebar (segmented control or a labeled group), with a 4th "All" option:

```
[ All ] [ SDK ] [ Framework ] [ EMAOP ]
```

Selecting a mode **filters the fleet and tailors the sidebar groups**:

- **SDK view** — Agent Fleet (native), Trace Viewer, Memory, Cost, SDK quickstart, API keys. No Agent Studio, no connector catalog.
- **Framework view** — Agent Fleet (byof, with framework badges), Trace Viewer, adapter setup, governance overlay, cost.
- **EMAOP view** — Agent Studio, Agent Fleet (emaop), Integration Hub, Rules Workbench, Audit Viewer, connectors, escalations.
- **All view** — everything, with mode badges on each agent.

Implementation: the sidebar `NAV_GROUPS` become mode-aware (a `modes: ['native','byof','emaop']` tag per item), filtered by the active mode + the org's entitlements. The fleet query filters by `build_mode`. The active mode persists per user (Clerk metadata / local).

### 4.2 Consolidated landing (the dashboard)

The Control Tower **landing page stays the cross-mode overview** — exactly your instinct. It shows consolidated metrics across all three modes (active agents by mode, tasks, success, spend, governance), with a per-mode breakdown (e.g., a small "by mode" donut + per-mode quick links). From the landing a user drills into a specific mode's view. So:

- **Landing** = "everything, one view."
- **Mode views** = focused operation.

This also fixes the dashboard's purpose: it's the executive overview; the mode views are the workbenches.

### 4.3 Agent Fleet changes

- Each agent card/row shows a **mode badge** (`SDK` / `Framework: LangGraph` / `EMAOP`).
- The fleet is filterable by mode (reusing the `DataToolbar` facet pattern already built).
- "New agent" → the build-mode walkthrough (§3), **not** Agent Studio directly.
- Clicking a `byof` agent shows its framework + adapter health; a `native` agent shows SDK registration details; an `emaop` agent shows its manifest + Agent Studio "edit".

---

## 5. Entitlements-first onboarding

> "First display everything the user has paid for, then they enable/disable extra
> features (EMAOP, Marketplace, …) so we know what onboarding steps to include and
> what to show in Control Tower."

### 5.1 Two distinct concepts

- **Entitled** — the org's plan/add-ons grant access (source of truth: `useEntitlements()` / org `publicMetadata.tier` + add-on flags). Drives *what's available*.
- **Enabled** — the org *chose to surface* a feature (a per-org toggle), so they can declutter the Control Tower even for features they're entitled to. Drives *what's shown*.

Both gate navigation and onboarding. A feature must be **entitled AND enabled** to appear.

### 5.2 Onboarding flow (revised)

A first-run, org-level setup (admin) + a personal flow (each member):

**Org setup (admin, once):**
1. **"Here's your plan"** — a clean summary of what the org is entitled to (tier + add-ons: EMAOP, Marketplace, enterprise connectors, SIEM, …), pulled from entitlements.
2. **"Choose what to enable"** — toggles for optional surfaces (EMAOP, Marketplace, BYOF, …). Entitled-but-off features can be turned on later from Settings → Features. Not-entitled features show an "Add to plan" path.
3. The selection writes per-org feature flags (org metadata) consumed by the sidebar + onboarding step list.

**Personal flow (each member):**
1. **Persona** (solo / startup / enterprise) and **vertical** (HR/Finance/IT/Procurement) — already built; keep.
2. **Build mode preference** (SDK / BYOF / EMAOP) — new; pre-selects the default Control Tower mode + tailors the checklist.
3. **Goal** — already built.

The checklist is then assembled from: enabled features × persona × build mode. (Extends the existing `checklistFor(persona, vertical)` to `checklistFor({persona, vertical, mode, enabledFeatures})`.)

### 5.3 Conditional Control Tower

The sidebar, the mode switcher options, and feature pages all render conditionally on **entitled AND enabled**. A new **Settings → Features** page lets admins toggle enabled features any time. This reuses `FeatureGate` + a thin `useEnabledFeatures()` over org metadata.

---

## 6. SDK & BYOF onboarding content (the code-first experience)

For `native` and `byof`, onboarding is **documentation-grade in-product**, not a form:

- Real syntax-highlighted code blocks (reuse `components/ui/CodeBlock` + Shiki — already a dependency) with copy buttons and tabs (Python / Go / TypeScript).
- A minimal end-to-end path: install → authenticate (API key for the chosen environment) → register/wrap an agent → submit a task → see it in the Trace Viewer.
- Framework-specific snippets for BYOF (one tab per supported framework).
- A persistent "Open full docs" deep link to the relevant docs section.
- A live "waiting for your first agent…" state that auto-advances the checklist when the SDK actually registers an agent (reuse the live-signal checklist pattern already built).

---

## 7. Backend touchpoints (for later implementation)

- `domain.Agent` += `BuildMode` (`native|byof|emaop`) + optional `Framework` (for byof). Migration + agent registration default logic (SDK sets it; Agent Studio sets `emaop`).
- Agent list/query supports `build_mode` filter.
- Org feature-flags (enabled features) stored in org metadata; read by a `useEnabledFeatures` hook + an `entitled AND enabled` guard helper.
- The SDK declares its framework adapter (so `byof` is detected, not guessed).

---

## 8. Why this is the right call

- **Removes the core confusion** — every user immediately knows which mode they're in and gets the right tools; no one is force-funnelled into Agent Studio.
- **One platform, three lenses** — shared orchestrator/governance/cost/audit, mode as a filter. No fork, no parallel products.
- **Entitlements-driven** — the Control Tower only ever shows what the org bought and chose, keeping it clean for a solo dev and complete for an enterprise.
- **Consolidated overview preserved** — the landing remains the single pane of glass you wanted.
- **Reuses everything shipped** — `FeatureGate`, entitlements, `DataToolbar`, the onboarding flow, the docs `CodeBlock`.

---

*Last updated: 2026-06-10 · Planning only.*
