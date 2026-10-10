# Actrone — Optional Agent Scheduling + Autonomy · Plan

> **Status:** PLAN (build not started). Give EMAOP agents an **optional schedule** — so a user can have an
> agent run itself on a cadence, unattended — via Temporal **Schedules**, without bypassing any governance.
> Also documents the autonomy verdict: native agents are **execution-autonomous** already; scheduling is what
> makes them **proactively** autonomous.
>
> Grounded in the current runtime: `runAgenticLoop` ([task_workflow.go]), `ScheduleSpec`
> ([domain/agent.go:357]), the studio capture ([agent/studio.go:217]), and `SubmitTask`
> ([grpc/server.go:75]). Prod-grade per `CLAUDE.md`.
>
> **v1.1 (2026-07-18):** decisions locked with refinements; companion decisions A–D (run timeout,
> consecutive-failure auto-pause, authorization + human attribution, limits/entitlement) added as first-class.

---

## 0. Findings (read first)

**Autonomy — yes in execution, no in triggering (today).**

- **Execution autonomy: YES.** Native agents run `runAgenticLoop` — a durable, governed agentic loop:
  *"repeatedly call the model with its tools advertised, execute any requested tool calls through the governed
  `ExecuteGovernedTool` activity, and feed the results back, until the model returns a final answer or a cap is
  hit."* The model chooses its own tool calls each turn (ReAct-style; an optional declared `Graph` gives
  LangGraph-style control flow, default is the autonomous linear loop). Bounded by turn ceiling
  (`defaultMaxLoopTurns=10` / `max_tool_calls_per_task` / `spec.loop.max_turns`), tool-call count, and spend
  (`max_task_cost_usd`). Every step is a Temporal activity (crash-resumable); an operator can
  pause/resume/cancel at each turn (<30s pause guarantee). The DPE Tier-1 hard-block checks each action against
  the manifest `Capabilities` before the LLM can act.
- **Trigger autonomy: NO.** Agents are **reactive** — they only run when a task is submitted (`SubmitTask` via
  SDK/API, an inbound channel message, or the playground). Nothing makes an agent run itself on a cadence.

**Scheduling — a stub that was never wired.** `ScheduleSpec` exists (`Timezone`, `ActiveDays`, `ActiveFrom`,
`ActiveUntil`, `TriggerMode: scheduled|event_driven|webhook_inbound`) but is **inert**: (1) **no cadence field**
— even `"scheduled"` can't say *when/how often*; (2) **not executed** — only `studio.go` copies `Timezone` +
`TriggerMode` into the domain (dropping the active-window fields); nothing reads it; (3) **no Temporal Schedules
in the codebase**; periodic system jobs use in-process `time.NewTicker` in `main.go` (fine for singletons,
wrong for per-agent/per-tenant durable scheduling).

→ The work is to **wire the missing scheduler** and add the missing cadence + task fields, opt-in per agent.

---

## 1. Mechanism — Temporal **Schedules** (not cron-on-workflow, not tickers)

Temporal explicitly recommends **Schedules** over cron jobs — they have their own identity, pause/resume,
backfill, an overlap policy, and observability, with no extra infra. The deprecated
`StartWorkflowOptions.CronSchedule` is a property of a workflow execution; a **Schedule** is a first-class,
updatable object. The codebase has neither, so go straight to Schedules.

**Explicitly not:** per-agent `time.NewTicker` (not durable, lost on restart, no pause/backfill/observability,
poor multi-tenant isolation) — even though that's the existing precedent for system jobs.

---

## 2. `ScheduleSpec` extension (additive, back-compatible)

Zero value = reactive, unchanged. New fields only matter when `TriggerMode == "scheduled"`.

```go
type ScheduleSpec struct {
    Timezone    string   // IANA tz, e.g. "Africa/Johannesburg"
    ActiveDays  []string // firing-window guard
    ActiveFrom  string
    ActiveUntil string
    TriggerMode string   // "scheduled" | "event_driven" | "webhook_inbound"

    // ── Recurring trigger (opt-in; only read when TriggerMode == "scheduled") ──────────────

    // Cadence — at least one required for a scheduled agent. Cron is the AUTHORING / interchange
    // SSOT (the Studio builder compiles to it; users can paste/export it), but the reconciler
    // COMPILES it into Temporal's structured ScheduleCalendarSpec + TimeZoneName (§3) — calendars
    // are DST-aware and unambiguous; a raw cron string is neither. EverySeconds is the convenience
    // path for trivial intervals. min=60 is the ABSOLUTE floor; the EFFECTIVE floor is tier-gated
    // at deploy (§4.D) — sub-5-minute cadences require a higher tier + explicit cost acknowledgment
    // (each hosted tick may cold-start a harness pod and spend money).
    Cron         string          `json:"cron"          yaml:"cron"          validate:"omitempty,cron"`
    EverySeconds int             `json:"every_seconds" yaml:"every_seconds" validate:"omitempty,min=60"`

    // Task — the recurring instruction a scheduled run executes. A scheduled agent must carry its
    // OWN input (a reactive task gets it from the caller). Required when scheduled. TaskPrompt
    // supports scheduled-context interpolation at run start (§3): {{scheduled_at}} (RFC3339),
    // {{run_date}}, {{timezone}} — so "summarise today's tickets" knows what "today" is. Full task
    // TEMPLATES (named, parameterised) are a later phase.
    TaskPrompt   string          `json:"task_prompt"     yaml:"task_prompt"`
    Input        json.RawMessage `json:"input,omitempty" yaml:"input,omitempty"`

    // Overlap — behaviour when a tick fires while the previous run is still going. Default "skip".
    // Studio surfaces skip + buffer_one ONLY; allow_all stays YAML-only + tier-gated (unbounded
    // stacking of long autonomous runs is a cost/safety footgun). NOTE: skip is only safe paired
    // with RunTimeoutMinutes — otherwise one hung run skips every future tick forever.
    Overlap      string          `json:"overlap"       yaml:"overlap"       validate:"omitempty,oneof=skip buffer_one allow_all"`

    // RunTimeoutMinutes — wall-clock cap on a SINGLE scheduled run, SEPARATE from the loop's
    // turn/tool/spend caps (which do not bound wall-clock). Guarantees a run ends, so Overlap=skip
    // can never be frozen by a stuck run (companion A). 0 ⇒ system default (30). A scheduled run
    // never blocks on human escalation: if it needs an approval it can't get autonomously it
    // records "escalation required", notifies, and ends cleanly — it does NOT hang to the timeout.
    RunTimeoutMinutes int        `json:"run_timeout_minutes,omitempty" yaml:"run_timeout_minutes,omitempty" validate:"omitempty,min=1"`

    // CatchUp — governs replay of missed ticks (companion #4 nuance). false (default) ⇒ a SMALL
    // Temporal CatchupWindow (~1 min) so a brief infra/deploy blip doesn't silently drop a tick,
    // but a paused-then-resumed agent does NOT flood with a backlog. true ⇒ a wider window
    // (advanced). Pause→resume NEVER auto-replays regardless; an operator can request an explicit
    // Backfill (admin op, §3).
    CatchUp      bool            `json:"catch_up" yaml:"catch_up"`

    // PauseAfterFailures — after N CONSECUTIVE failed runs the reconciler auto-pauses the Schedule
    // and alerts, so a broken scheduled agent can't burn budget failing on every tick forever
    // (companion B). 0 ⇒ system default (3).
    PauseAfterFailures int       `json:"pause_after_failures,omitempty" yaml:"pause_after_failures,omitempty" validate:"omitempty,min=1"`
}

// IsScheduled reports whether the agent opts into autonomous recurring runs.
func (s ScheduleSpec) IsScheduled() bool {
    return s.TriggerMode == "scheduled" && (s.Cron != "" || s.EverySeconds > 0)
}
```

The **`TaskPrompt`/`Input` is the load-bearing addition** — the reason a "scheduled" trigger was never usable:
a schedule needs something to *do*. **`RunTimeoutMinutes` is the second load-bearing addition** — the reason
`Overlap=skip` is safe.

*Deferred to v2 (noted, not built): `SessionStrategy: fresh | continue | rolling` — some agents want to
continue yesterday's thread rather than a fresh session. v1 is always fresh (§6.3).*

---

## 3. The reconciler — `internal/agentschedule`

A small, idempotent manager that keeps Temporal Schedules in sync with agent manifests.

- **Deterministic id:** `agent-schedule:{orgID}:{agentID}:{env}` — so create/update/delete is idempotent and a
  restart never duplicates.
- **`Reconcile(ctx, agent)`:**
  - `IsScheduled()` and active + promoted + within limits (§4.D) → **create-or-update** a Schedule whose action
    is `StartWorkflow(AgentTaskWorkflow, scheduledInput)` on the agent's task queue — the **same** workflow
    `SubmitTask` enqueues, so all governance applies unchanged.
  - Not scheduled / paused / budget-exhausted / not-promoted / over-limit → **pause or delete** the Schedule.
- **Cadence compilation:** `Cron` → Temporal **`ScheduleCalendarSpec`** (parsed + normalised once here, not a
  raw string re-parsed everywhere); `EverySeconds` → `Intervals`; `TimeZoneName: Timezone` (DST-correct).
- **Overlap:** `Skip` (default) | `BufferOne` | `AllowAll` (tier-gated) from `Overlap`.
- **Run timeout (companion A):** the `StartWorkflow` action sets `WorkflowRunTimeout = RunTimeoutMinutes`
  (or the 30-min default) — distinct from the loop caps, so a hung run terminates and the next tick runs clean.
- **Backfill / catchup (companion #4):** `CatchupWindow` = small (~1 min) when `CatchUp=false`, wider when
  true. Pause→resume never replays. A separate **explicit Backfill** admin operation (Temporal's Backfill API)
  lets an operator re-run a past window on demand — never automatic.
- **Deterministic scheduled input** — built from the Schedule's nominal time (Temporal injects `scheduledAt`
  deterministically, so this is replay-safe):
  - `scheduleID`, `scheduledAt`, `source:"scheduled"`, the creating principal (companion C), and the
    **interpolated** prompt (`{{scheduled_at}}`/`{{run_date}}`/`{{timezone}}` resolved from `scheduledAt`).
  - **`session_id = uuidv5(ns, scheduleID + ":" + scheduledAt.RFC3339)`** — deterministic ⇒ a Temporal retry
    of the start action reuses the **same** session (no double-accrete, idempotent), while each nominal tick
    gets its own **fresh L1** session (§6.3). The agent's `agent_id` is unchanged, so **L2 long-term memory is
    shared across runs** and each fresh run still writes salient facts back to L2 (the "always-on employee that
    remembers").
  - The workflow id embeds `scheduledAt`; a re-fire dedupes via the existing idempotency layer.
- **Consecutive-failure tracking (companion B):** the reconciler (or a paired monitor) tracks consecutive
  failed runs per schedule; at `PauseAfterFailures` (default 3) it **pauses the Schedule + alerts**. A
  successful run resets the counter.
- **Next-run preview:** a helper computes the next N fire times from the compiled calendar/interval spec, for
  the Studio builder + observability (§5).
- **Startup sweep:** on boot, reconcile every agent (self-heal drift between DB and Temporal).

---

## 4. Governance — the load-bearing part

A scheduled autonomous agent is powerful, so scheduling must **not** bypass anything. A scheduled run is just a
governed task initiated by the Schedule instead of a user, so it inherits — with **no new bypass** —:

- the **DPE Tier-1 capability gates** (each action pre-checked against manifest `Capabilities`);
- per-run `max_task_cost_usd` + the monthly `TokenBudget` (`on_exhaustion: pause|notify|hard_stop`);
- the loop caps (turns / tool-calls / spend) and the `EscalationSpec` approval chain;
- the control-plane **pause/cancel** (and the reconciler pauses the *Schedule* itself on agent pause — belt and
  suspenders).

Added for scheduling:

- an **active-window guard** at workflow start (timezone + days/hours) that no-ops a tick outside the window;
- **env-gating** — only create Schedules in promoted environments (no surprise runs in dev);
- `trigger=scheduled` **provenance** in the reasoning trace + signed ledger, so audit distinguishes autonomous
  runs from user-initiated ones;
- **(A) a wall-clock `RunTimeout`** on every scheduled run (§2/§3) so `Overlap=skip` can't be frozen by a hung
  run. **Scheduled runs are non-blocking on human escalation:** if a run needs an approval it cannot obtain
  autonomously, it records `escalation_required`, notifies the escalation chain, and **ends cleanly** — it does
  not hang until the timeout, and the schedule stays healthy;
- **(B) consecutive-failure auto-pause** — after `PauseAfterFailures` (default 3) consecutive failed runs the
  reconciler pauses the Schedule and alerts, so a broken agent can't burn budget failing every tick;
- **(C) authorization + human attribution** — creating/enabling a schedule spawns an *unattended autonomous
  agent* and is a **privileged** action: gated by `RequireScopeRole` (a scheduling grant, defaulting to
  `agent_admin`). The run executes under the agent's own governed identity, but the **creating human principal
  is recorded** on the schedule and stamped into every scheduled run's ledger entry (source *and* responsible
  human), alongside `trigger=scheduled`;
- **(D) limits / entitlement** — a per-tenant/plan **max active schedules** cap and a **tier-gated interval
  floor** (e.g. sub-5-minute cadence requires a higher tier + cost ack). The reconciler refuses to create a
  Schedule beyond the cap; validation + deploy enforce the floor. Prevents a low tier from arming thousands of
  sub-minute autonomous runs.

---

## 5. UX / optionality (EMAOP Studio + SDK)

- **Default = reactive** — nothing changes for existing agents.
- **Studio "Schedule" panel:** trigger mode (on-demand / scheduled / event / webhook), a friendly cadence
  ("daily at 09:00", "every 4 hours") that compiles to `Cron`, timezone, active window, and:
  - **overlap = Skip (default) or BufferOne only** — `allow_all` is not offered in Studio;
  - a **"next 5 runs" preview** computed from the compiled spec (the highest-trust feature for cron + timezone);
  - a **run timeout** field (default 30 min) with a hint that it's what keeps Skip safe;
  - the recurring **task prompt** (with a note that `{{scheduled_at}}`/`{{run_date}}`/`{{timezone}}` interpolate);
  - sub-5-minute cadences show a **tier gate + cost acknowledgment** (§4.D).
  `studio.go` compiles this into the extended `ScheduleSpec` (and stops dropping the active-window fields).
- **SDK/manifest:** the extended `schedule:` block is authored in YAML/JSON; the TS + Python SDK manifest types
  add the new fields — `cron`, `every_seconds`, `task_prompt`, `overlap`, `run_timeout_minutes`, `catch_up`,
  `pause_after_failures` (contract parity, per `CLAUDE.md §0.1`).

---

## 6. Decisions — LOCKED (with refinements)

### The five

1. **Cadence format** → **both**. Cron is the **authoring/interchange SSOT** (Studio builder compiles to it,
   users can paste/export), but the reconciler **compiles it into Temporal's structured `ScheduleCalendarSpec`
   and `TimeZoneName`** (DST-aware, unambiguous) rather than re-parsing a raw string. `EverySeconds` for trivial
   intervals; `min=60` absolute floor, **effective floor tier-gated** (§4.D). Studio shows a **"next 5 runs"
   preview**.
2. **Overlap** → **Skip** (don't stack a new run on a still-running one — autonomous runs can be long);
   **`BufferOne`** selectable for catch-up-once. `allow_all` stays YAML-only + tier-gated (not in Studio).
   **Only safe because of companion A** (a hung run would otherwise Skip every future tick forever). Skipped
   ticks are surfaced in run history so Skip never looks like a silent failure.
3. **Recurring input** → a free-text **`TaskPrompt`** on the schedule for v1 (task *templates* later), with
   **`{{scheduled_at}}`/`{{run_date}}`/`{{timezone}}` interpolation in v1** (a recurring prompt must know what
   "today" is). **Fresh session per run** — `session_id = uuidv5(ns, scheduleID+":"+scheduledAt.RFC3339)`:
   deterministic ⇒ replay-safe + idempotent (a start-action retry reuses the session; no L1 double-accrete),
   yet each nominal tick gets a clean L1. The agent's **long-term (L2) memory persists** across runs (same
   `agent_id`) and each fresh run still writes salient facts back to L2. (`SessionStrategy` = v2.)
4. **Backfill** → **off by default** (`CatchUp=false`), but precisely: `false` ⇒ a **small `CatchupWindow`
   (~1 min)** so a brief deploy/infra blip doesn't silently drop a tick, while a paused-then-resumed agent does
   **not** flood. Pause→resume **never** auto-replays; **manual Backfill** stays an explicit admin op. (`true`
   ⇒ wider window.)
5. **Scope** → **native first**; **byof_hosted** in the same phase (its loop already runs as a governed
   Temporal execution, so Schedule→`StartWorkflow` is identical — note each tick **cold-starts a harness pod**,
   a further reason for the interval floor); **byof_connected deferred** — its loop runs in the developer's
   process, so scheduling means **signalling that process** (a push/long-poll or SDK-polled signal, inherently
   best-effort since the worker must be online at fire time). A separate design.

### Companion decisions (locked in the same phase)

- **A — Max run duration.** Every scheduled run carries a wall-clock **`RunTimeoutMinutes`** (default 30),
  distinct from turn/tool/spend caps, so `Overlap=skip` can't be frozen by a stuck run. **Scheduled runs are
  non-blocking on human escalation** — a run that can't get an approval autonomously records `escalation_required`,
  notifies, and ends cleanly instead of hanging.
- **B — Consecutive-failure policy.** After **`PauseAfterFailures`** (default 3) consecutive failed runs the
  reconciler **auto-pauses the Schedule + alerts**; a success resets the counter.
- **C — Authorization + human attribution.** Schedule create/enable is **privileged** (`RequireScopeRole`,
  default `agent_admin`); the **creating human principal is recorded** on the schedule and stamped into every
  scheduled run's ledger entry (source *and* responsible human).
- **D — Limits / entitlement.** A per-tenant/plan **max active schedules** cap + a **tier-gated interval
  floor** (sub-5-min requires higher tier + cost ack), enforced at validation/deploy and by the reconciler.

---

## 7. Build phases

- **P1 — Spec.** Extend `ScheduleSpec` (§2: cadence, task, overlap, **`RunTimeoutMinutes`**, **`CatchUp`
  semantics**, **`PauseAfterFailures`**) + parser validation + `IsScheduled()`; fix `studio.go` to capture the
  full schedule (cadence, task, window, timeout). Unit tests (validation, compile, cron parse, defaults).
- **P2 — Reconciler.** `internal/agentschedule` — Temporal Schedule create/update/delete/pause, deterministic
  id, **cron→`ScheduleCalendarSpec` compilation**, **deterministic `session_id` + scheduled-time interpolation**,
  **`WorkflowRunTimeout` wiring**, **small vs wide `CatchupWindow`**, **next-run preview helper**, startup sweep.
  Tests against the Temporal test env + a mocked `ScheduleClient`.
- **P3 — Lifecycle + governance.** Hook agent create/update/delete, pause/resume, budget-exhaustion, and
  env-promotion → `Reconcile`. Active-window guard + `trigger=scheduled`/creator provenance. **(A)** run timeout
  and non-blocking escalation; **(B)** consecutive-failure auto-pause; **(C)** authz gate + human attribution;
  **(D)** max-active-schedules cap + tier interval floor. Governance tests (see §8).
- **P4 — Studio + SDK.** Schedule panel (friendly → cron, **next-5-runs preview**, **Skip/BufferOne only**,
  **run-timeout field**, **sub-5-min tier gate**) + TS/Python SDK manifest fields (incl. `run_timeout_minutes`,
  `pause_after_failures`) + docs, with contract tests.
- **P5 — Observability + docs.** Schedule metrics (next-run, last-run status, **skipped-by-overlap**,
  **timed-out**, **consecutive-failures**, **auto-paused**), a runbook, and the manifest reference.

---

## 8. Acceptance / testing

- **Unit:** `ScheduleSpec` validation + `IsScheduled` + cron parse + defaults (`RunTimeout=30`,
  `PauseAfterFailures=3`) + `studio.go` compile round-trip + scheduled-time interpolation.
- **Reconciler:** create/update/delete/pause **idempotence**; **`session_id` determinism** (same
  `scheduleID+scheduledAt` ⇒ same id; a start-action retry reuses the session); cron→calendar compilation;
  `CatchupWindow` small-vs-wide; next-run preview; drift self-heal on startup (mock `ScheduleClient`).
- **Integration (Temporal test env):** a Schedule fires → `AgentTaskWorkflow` starts with the scheduled input;
  `overlap=skip` prevents a second concurrent run; the active-window guard no-ops out-of-window ticks; **a run
  exceeding `RunTimeout` terminates and the next tick runs clean** (A); **a brief-outage blip still fires within
  the small catchup window, but a long pause does not backfill** (#4).
- **Governance:** a scheduled run whose action lacks the capability is DPE-blocked; monthly budget exhaustion
  pauses the Schedule; agent pause pauses the Schedule; scheduled runs carry `trigger=scheduled` **+ creator
  principal** in the ledger; **a scheduled run needing an approval it can't get records `escalation_required`
  and ends cleanly (no hang)** (A); **N consecutive failures auto-pause the Schedule + alert, and a success
  resets the counter** (B); **a non-`agent_admin` is refused schedule creation** (C); **creating past the
  max-active cap, or below the tier interval floor, is refused** (D).
- **Back-compat:** every existing (reactive) agent is byte-identical — no Schedule created, loop history
  unchanged.

---

*Plan v1.1 — EMAOP agents are already execution-autonomous (the governed agentic loop); this adds **optional**
proactive autonomy. A back-compatible `ScheduleSpec` extension (cadence + the missing task payload + run timeout
and failure/limit controls) plus an idempotent Temporal-Schedules reconciler let a user opt an agent into running
itself on a cadence — with every governance control (DPE gates, budget, escalation, pause, active window,
run timeout, failure auto-pause, authorization, audit) intact. Default stays reactive.*
