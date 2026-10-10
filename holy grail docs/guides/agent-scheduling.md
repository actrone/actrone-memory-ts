# Agent scheduling — manifest reference & runbook

Give an agent **optional** proactive autonomy: run itself on a cadence, unattended, via a governed
Temporal **Schedule** — with every governance control (DPE gates, budget, escalation, pause, active
window, run-timeout, audit) intact. Default stays **reactive** (runs only when a task is submitted).

Plan of record: [`Actrone_Agent_Scheduling_Plan.md`](../Actrone_Agent_Scheduling_Plan.md).

## Manifest — `spec.schedule`

```yaml
spec:
  schedule:
    trigger_mode: scheduled          # "scheduled" enables the recurring-run fields; default reactive
    timezone: Africa/Johannesburg    # IANA tz (DST-correct)
    cron: "0 9 * * *"                # 5-field cron — the authoring SSOT (daily 09:00)
    # every_seconds: 3600            # …OR a fixed interval (>= 60; set exactly one of cron | every_seconds)
    task_prompt: >                   # what each run does — a scheduled agent carries its OWN input
      Summarise overnight tickets for {{run_date}} and post to #ops.
    active_days: [mon, tue, wed, thu, fri]   # firing-window guard (optional; empty = every day)
    active_from: "08:00"             # HH:MM window start (optional)
    active_until: "18:00"            # HH:MM window end (optional; wraps midnight if end < start)
    overlap: skip                    # skip (default) | buffer_one | allow_all (YAML-only, tier-gated)
    run_timeout_minutes: 30          # wall-clock cap on one run (default 30) — keeps `skip` safe
    catch_up: false                  # backfill missed ticks after a long pause (default false)
    pause_after_failures: 3          # auto-pause after N consecutive failed runs (default 3)
```

### Field notes

| Field | Meaning |
| --- | --- |
| `trigger_mode` | `scheduled` turns on recurring runs. `event_driven` / `webhook_inbound` stay reactive. |
| `cron` / `every_seconds` | The cadence — **exactly one**. Cron is validated with the same parser Temporal uses, so a cron that loads is accepted at schedule creation. `every_seconds` floor is **tier-gated** (free 1h · pro 5m · scale+ finer). |
| `task_prompt` | The recurring instruction. Supports `{{scheduled_at}}` / `{{run_date}}` / `{{timezone}}`, resolved at run start in the schedule's timezone. Required when scheduled. |
| `active_days` / `active_from` / `active_until` | The active window. A tick that fires outside it **no-ops cleanly** (a skipped tick is not a failed run). |
| `overlap` | Behaviour when a tick fires while the previous run is still going. `skip` never stacks autonomous runs; `buffer_one` queues exactly one. |
| `run_timeout_minutes` | Wall-clock cap on a single run, separate from the loop's turn/spend caps. Guarantees a run ends so `skip` is never frozen by a hung run. A scheduled run also never blocks on human escalation. |
| `catch_up` | `false` still absorbs a brief infra/deploy blip (small catch-up window) but never floods on a paused-then-resumed schedule. |
| `pause_after_failures` | The reconciler auto-pauses + alerts after this many consecutive failed runs. |

## Authoring

- **No-code (Studio):** the **Actions & Connections** step has a *Schedule* panel — pick "Scheduled", set
  the cadence, the recurring prompt, the active window, and the overlap / run-timeout / catch-up controls.
  It compiles to the `spec.schedule` block above.
- **SDK / YAML:** author the `schedule:` block directly and register the agent. Both the TypeScript and
  Python SDKs pass the manifest through unchanged, so scheduling works identically in each.

## Governance & limits

- **Arming a schedule is privileged** — a scheduled manifest requires the **agent_admin** role
  (server-authoritative, fail-closed). The creating user is recorded for audit.
- Every scheduled run is a governed task initiated by the Schedule instead of a user: it inherits the DPE
  capability gates, per-run + monthly budget, loop caps, escalation chain, and control-plane pause — with
  **no new bypass**. Pausing the agent pauses its Schedule.
- Schedules are created only in **promoted** environments (never development — no surprise dev runs).

## Runbook

- **Schedule id:** `agent-schedule:{agentUUID}:{env}` (deterministic — idempotent create/update/delete).
- **Reconciliation:** the orchestrator reconciles an agent's Schedule on register / update / delete /
  pause / resume / **env-promotion** (a scheduled agent promoted into a target env starts firing there),
  and runs a **best-effort startup sweep** (production-scoped) to self-heal any drift between the manifest
  and Temporal.
- **Preview:** `POST /v1/schedule/preview` (the `spec.schedule` block as body) returns the next 5 fire times,
  computed with the same cron parser Temporal uses — the Studio panel shows these live as you edit the cadence.
- **Budget:** per-run spend (`max_task_cost_usd`) is enforced at run time (a scheduled run inherits the cap
  and wraps up at the ceiling). A schedule-level auto-pause on *monthly* budget exhaustion is a reserved hook
  (`Lifecycle.BudgetExhausted`) awaiting a per-agent budget-status source; runaway per-run spend is already bounded.
- **Metrics:** `agentschedule_reconcile_total{action,result}` counts reconcile operations. Skipped
  (out-of-window) ticks log `AgentTaskWorkflow.scheduled_skip`; a scheduled run that reaches a human
  escalation logs `AgentTaskWorkflow.scheduled_escalation_required` and ends cleanly (never hangs); an
  auto-pause logs `agentschedule.auto_paused` — all carry the `schedule_id`.
- **Auto-pause monitor:** a periodic (5 min) best-effort monitor inspects each `agent-schedule:*` schedule's
  recent run outcomes and **pauses** any that hit the consecutive-failure threshold. It honours each agent's
  own `pause_after_failures` (carried in the schedule memo; default 3) and resolves each run's terminal status
  via Temporal `DescribeWorkflowExecution`; a still-running run is not counted. An auto-pause is **durable** —
  the automatic startup self-heal sweep never clears it; only a human resume/update re-activates the schedule.
- **Provenance:** a scheduled run stamps `trigger=scheduled` + `created_by` + `schedule_id` into the
  tamper-evident audit-spine payload, so a review distinguishes autonomous runs from user-initiated ones.
- **Fresh memory per run:** each tick derives a deterministic per-run session id, so short-term (L1) memory
  is fresh every run while long-term (L2, agent-keyed) memory persists.
- **Testing the live Temporal path:** the imperative create/update/delete/pause + inspector are integration-
  tested against a real server — `go test -tags integration ./internal/agentschedule/temporalstore/` with a
  Temporal dev server running (`docker run -p 7233:7233 temporalio/temporal server start-dev --ip 0.0.0.0`
  then `TEMPORAL_TEST_ADDRESS=localhost:7233`), or unset it to auto-download an ephemeral dev server.
- **Disable a schedule:** remove the `schedule` block (or set `trigger_mode` off `scheduled`) and update
  the agent, or pause the agent — the Schedule is torn down / paused idempotently.
- **Inspect in Temporal:** the Schedule carries the note `actrone agent schedule`; its action starts the
  same `AgentTaskWorkflow` a submitted task uses, with the nominal tick time appended to the workflow id.
