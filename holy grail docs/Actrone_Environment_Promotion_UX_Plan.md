# Actrone — Environment Promotion UX Plan (Development → Staging → Production)

> **Status:** **COMPLETE (2026-06-21).** Agent-level promotion engine (2026-06-20) +
> org-level ledger, readiness evaluator, gated promote/switch endpoints, the premium
> frontend promotion-pipeline UI, and Python + TS SDK parity all SHIPPED and green.
> **Owner:** Matt.
>
> **Status refreshed 2026-07-13 (code-verified):** COMPLETE confirmed, no drift. Verified in code:
> `internal/envledger.Service` + `internal/handler/http/org_environments.go`; the routes
> `GET /v1/environments/readiness`, `POST /v1/environments/promote` (admin), `POST /v1/environments/
> switch` (admin) are registered in `cmd/orchestrator/main.go`; the `org_environment` ledger is
> migration `00052_org_environments.sql` (agent-level engine on `00050`/`00051`). This is
> app-layer and fully live in code — **not** gated on the cluster rollout the P6 runbooks track.
>
> **What shipped in the org-level slice (2026-06-21):**
>
> - **Backend ledger** — `org_environment` table (migration `00052`, one-active-per-tenant
>   partial unique index) + `domain.OrgLedger`/`OrgEnvStatus` (locked/unlocked/active) +
>   `domain.DefaultLedger` (new orgs lazily materialise development=active, the rest locked —
>   no separate provisioning hook). `repository.OrgEnvironmentRepository` (lazy seed,
>   demote-before-promote transition) + `repository.ReadinessRepository` (real env-scoped
>   counts: agents, completed tasks, valid model endpoints, governance/approval/residency).
> - **Readiness evaluator** — pure, table-driven `domain.EvaluateReadiness(facts, sourceEnv)`:
>   required gates tighten for the staging→prod hop (spend limit + approver chain become
>   mandatory); 0–100 score over required gates; billing/tier is deliberately NOT server-scored
>   (the frontend entitlements layer overlays it — the backend owns only gates it can verify).
> - **Service + endpoints** — `internal/envledger.Service` (ledger view, readiness, gated
>   `Promote` that re-checks server-side and **fails closed**, `SwitchActive`); `GET /v1/environments`,
>   `GET /v1/environments/readiness`, `POST /v1/environments/promote` (admin), `POST /v1/environments/switch`
>   (admin). Each unlock is sealed `org.environment_promoted`.
> - **Frontend pipeline UI** — `EnvironmentPill` (status pill + Radix popover with the 3-stage
>   stepper, switchable unlocked rungs, gated Promote affordance) replaces the bare TopBar
>   switcher; `PromotionDialog` (live readiness checklist, production typed-confirm guardrail,
>   reduced-motion success reveal, 422 re-render + 403 "ask an admin" states); `ReadinessChecklist`;
>   `useEnvironmentPipeline` reconciles the store's active env with the server ledger. Staging is
>   tier-gated via `environment_staging` (Business+) with an `UpgradeModal` upsell.
> - **SDK parity** — Go `PromoteEnvironment`/`GetPromotions`/`GetEnvironments` (2026-06-20) now
>   matched by Python (`promote_environment`/`get_promotions`/`get_environments`) and TS
>   (`promoteEnvironment`/`getPromotions`/`getEnvironments`), each with the 409 gate + history +
>   pipeline-status surface and unit tests.
> **Reframe:** the header environment control is **not** a casual dev↔prod toggle. It is an
> enterprise **promotion pipeline**. A new org is born in **Development**, configures, and
> *promotes* — through Staging — to Production. Promotion is a celebrated, gated, audited milestone
> that makes the customer feel the product was worth paying for.
>
> **What shipped (the agent-level promotion engine — the backend core + clients):** a governed
> cross-environment promote of an agent's Agent-File one forward rung
> (`domain.ValidatePromotionPath`, ladder `development → staging → production`), reusing the **P5-B
> capability/cost diff gate** (a broadening hop needs explicit confirm → 409). Per-environment agent
> rows are now independent (migration `00050` fixed the latent `agents` unique constraint that was
> still env-blind), an append-only history read model backs the pipeline view (`agent_promotions`,
> migration `00051`), and the live-version-per-rung status is exposed. Surfaces:
> `POST /v1/agents/{id}/promotions` (gated), `GET …/promotions` (history), `GET …/environments`
> (pipeline status); packages `internal/promotion` + `repository.PromotionRepository` +
> `handler/http/promotions`; SDK `PromoteEnvironment`/`GetPromotions`/`GetEnvironments`; CLI hero verb
> `actrone promote <id> --to <env>` + `actrone promote status <id>`. Every hop is sealed into the
> audit spine (`agent.env_promoted`).
>
> **What remains (this plan's broader org-level UX):** the per-org `org_environment` ledger
> (locked/unlocked/active) of §2, the **readiness checklist** scoring of §3, and the **frontend
> promotion-pipeline UI** (the celebrated milestone). The shipped engine is what those build on — the
> ledger gates *which* envs are unlocked; the engine performs the artifact promotion underneath.

---

## 1. What exists today (the seam we build on)

- Backend: `Environment` enum `development|staging|production`
  ([environment.go](../backend/orchestrator/internal/domain/environment.go)); every request is
  scoped by the `X-Actrone-Env` header; all resources (agents, tasks, API keys, MCP) are partitioned
  by env. **Missing-header server fallback = `production`** (the secure default for legacy/no-JS).
- Frontend: per-org `env` zustand store with localStorage + cookie mirror for SSR
  ([stores/environment.ts](../frontend/src/stores/environment.ts)); a `TopBar` switcher already
  exists; `EnvironmentProvider` binds the store to the active org.

**Gap:** today it's a free switch with no notion of *readiness*, *unlock order*, or *promotion*.
That's the opposite of the intended enterprise flow.

## 2. Conceptual model — promotion ledger, not a toggle

Introduce explicit **per-org environment state** (new, control-plane concept):

```
org_environment(org_id, env, status, readiness_score, promoted_at, promoted_by, promoted_from)
  status ∈ { locked, unlocked, active }
```

- **New org:** `development = active(unlocked)`, `staging = locked`, `production = locked`.
- **Switching** is allowed only among **unlocked** envs (you can always step *back* to development).
- **Promotion** is the gated transition that *unlocks the next* env: `development → staging →
  production`. You cannot unlock production without passing through staging. Each promotion is
  RBAC-gated (admin/owner), audited (who/when/from), and idempotent.
- The **active** env is what the header carries. The *missing-header* server fallback stays
  `production` (security), but a hydrated client always sends the org's `active` env — and a brand-new
  org's `active` is **development**, satisfying "new accounts land in development" without weakening
  the legacy fallback.

### Default reconciliation (the one open decision, resolved)
- New org creation persists `org_environment(development, active)` → client sends
  `X-Actrone-Env: development`.
- Server `NormalizeEnv` fallback (truly absent header) = `production`, unchanged. No conflict:
  presence of the header is the source of truth; absence is the rare legacy path.

## 3. Promotion readiness — the gate that earns trust

Promotion to the next env requires a **readiness checklist** scored from *real* API state (no fake
ticks). Example gates (config-driven, per target env):

| Gate | Dev→Staging | Staging→Prod |
| --- | --- | --- |
| ≥1 agent created & validated | ✓ | ✓ |
| Governance policy attached | ✓ | ✓ |
| Model source configured (managed or BYOK) | ✓ | ✓ |
| At least one successful task run in current env | ✓ | ✓ |
| Spend limits / token budget set | — | ✓ |
| Billing active (paid plan) | — | ✓ |
| Approver/escalation chain configured | — | ✓ |
| Data region confirmed (see Data Residency plan) | — | ✓ |

A `readiness_score` (0–100) + per-gate pass/fail is computed by a control-plane evaluator and shown
live. Promotion CTA is disabled until all **required** gates pass; "recommended" gates warn but don't
block.

## 4. Premium UI/UX (the "glad I paid for this" layer)

All built on the revamp's token + motion system; respects `prefers-reduced-motion`.

### Header — Environment pill (replaces the bare switcher)
- A status pill: `● Development` with env-tone color (Dev = amber, Staging = violet, Prod = green —
  new semantic tokens `--color-env-dev/staging/prod`), `tabular-nums` ready badge, subtle pulse only
  on the active env.
- Click → **Environment panel** (Radix popover, frosted `menu` elevation), not a flat list.

### Environment panel — the pipeline, visualised
- A **horizontal 3-stage stepper**: `Development ✓ ─ Staging 🔒 ─ Production 🔒`, each node showing
  status, readiness summary (e.g. "4 / 6 ready"), and last-promoted metadata.
- Unlocked envs are **selectable** (switch). Locked envs show a **Promote** affordance with the
  readiness mini-list inline.
- "Switch to Development" is visually distinct (a quiet nav action) from "Promote to Staging" (a
  primary, consequential action).

### Promotion flow — the milestone
- Large modal / focused route: **"Promote to Staging"**.
  - Live readiness checklist with real pass/fail, each row linking to where to fix it.
  - Confirmation: production promotion requires typing the org slug (guardrail) + shows an
    "irreversible-ish / audited" note.
  - On confirm → **premium animated transition**: the pipeline fills from the current node to the
    next (animated connector), the header pill *morphs* Dev→Staging (color + label crossfade with a
    spring ease), a success toast ("You're now on Staging"), and a one-time celebratory but
    enterprise-tasteful reveal (no childish confetti — a refined glow/stagger). All gated behind
    reduced-motion.
- Post-promotion: an audit entry (who/when/from→to) surfaced in `/governance/audit`; optional
  notification to org admins.

### States (CLAUDE.md §8.2 — all designed)
- **Loading:** skeleton stepper while readiness loads.
- **Empty/new:** dev-only pipeline with a "Configure to unlock Staging" guide.
- **Error:** readiness fetch fails → designed error state with retry; promotion failure → structured
  error toast (never a raw console error).
- **Blocked:** non-admin sees the pipeline read-only with "Ask an admin to promote."

## 5. Tier gating (ties to entitlements)

- **Free / Pro:** Development + Production (two-stage). Staging is the upsell.
- **Business / Enterprise:** full Development → Staging → Production, plus promotion approvals and
  audit. Drives an `UpgradeModal` when a Pro user opens the Staging node.
- Wire through `lib/entitlements.ts` (`can('environment.staging')`), consistent with the revamp.

## 6. Backend additions (planned, control-plane)

- `org_environment` table + migration (status/readiness/promotion metadata).
- Readiness evaluator service (pure, table-driven gate definitions) + `GET /environments/readiness`.
- `POST /environments/promote` — RBAC-gated (admin/owner), idempotent (idempotency key =
  org+target+from), audited, emits a governance audit event + notification. Fails closed if gates
  unmet (re-checks server-side; never trust the client's "ready").
- Org-creation hook persists `development = active`.

## 7. Phasing

- **P1:** ledger + readiness evaluator + header pill + environment panel/stepper + switch among
  unlocked + promote endpoint (Dev→Staging→Prod) + audit. New-org default = development.
- **P2:** premium promotion animation + production typed-confirm guardrail + admin notifications +
  tier gating + reduced-motion parity.
- **P3:** promotion approvals (route through the existing escalation/approval chain), promotion
  history timeline, per-env config diff ("what's different between staging and prod").

## 8. Verification

Readiness evaluator unit tests (table-driven: each gate pass/fail → correct score + promotability);
promote endpoint tests (RBAC denied, gates-unmet rejected, idempotent replay, audit emitted);
frontend tests for pill/stepper states; a11y (focus, keyboard, contrast on env-tone tokens,
reduced-motion); responsive at 375/768/1280/1920.
