# Guide 08 — Observability: PostHog + Sentry

> **Status refreshed 2026-07-13 (code-verified):** four Clerk-era references corrected — the
> `organization_id` property is a WorkOS/OIDC org id (not "Clerk org UUID"); the context helper is
> `middleware.OrgExternalIDFromContext` (not `OrgClerkIDFromContext` — verified in
> `internal/middleware/auth.go`, which exports `TenantIDFromContext`, `PrincipalFromContext`,
> `OrgExternalIDFromContext`, `OrgRoleFromContext`, `ActroneRoleFromContext`/`ActroneRolesFromContext`,
> no Clerk-named helpers); the `tenants` lookup column is `external_org_id` (not `clerk_org_id` —
> `internal/repository/identity.go`); and the `principal` log field example is a WorkOS-style
> `user_01H...` id, not Clerk's `user_2abc...`. The rest of this guide (PostHog/Sentry dashboards,
> alert matrix, Prometheus metrics, cost-spike runbook) is product/vendor configuration this pass did
> not re-verify against the live PostHog/Sentry/Grafana projects (unverified 2026-07-13).

## Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                     What each system covers                        │
│                                                                    │
│  PostHog                        Sentry                             │
│  ─────────────────────          ─────────────────────             │
│  Product analytics              Error tracking                     │
│  LLM token cost + quality       Performance tracing                │
│  Feature flag evaluation        Session replay (errored sessions)  │
│  A/B testing                    Cron heartbeat monitoring          │
│  Funnel + retention             Alert → PagerDuty / Slack          │
│  Session replay (product)                                          │
└────────────────────────────────────────────────────────────────────┘
```

**Data flow summary:**

```
Go Orchestrator ──NATS events──► analytics.Bridge ──► PostHog EU Cloud
                ──errors──────► Sentry Relay (self-hosted) ──► Sentry Cloud

Next.js browser ──posthog-js──► /ingest/* (reverse proxy) ──► PostHog EU Cloud
               ──@sentry/nextjs──► NEXT_PUBLIC_SENTRY_DSN (Relay) ──► Sentry Cloud

Sentry Relay (actrone-core pod) ──PII scrub──► sentry.io
```

---

## PostHog — Product Analytics

### Accessing the Dashboard

PostHog EU Cloud: `https://eu.posthog.com`

**Primary views for this platform:**

| Dashboard | What to look at |
|---|---|
| LLM Analytics | Token costs, model performance, tool call rates |
| Product Analytics | DAU, feature adoption, task submission funnel |
| Session Replay | User flows, bug reproduction |
| Feature Flags | Rollout status, per-org targeting |
| Groups (Companies) | Per-org usage, plan tier breakdown |

---

### LLM Analytics Dashboard

PostHog's LLM Analytics tab surfaces events forwarded by the NATS→PostHog bridge. Every completed agent task generates a `$ai_generation` event.

```
┌──────────────────────────────────────────────────────────────────┐
│  LLM Analytics — Last 7 days                                     │
│                                                                  │
│  Total cost: $1,247.83         Avg cost/task: $0.034             │
│  Total tokens: 36.8M           Avg latency: 4.2s                 │
│  Tasks: 36,701                 Error rate: 0.3%                  │
│                                                                  │
│  By Model:                                                       │
│  claude-sonnet-4-6   72%    $0.028/task                          │
│  gpt-4o-mini         21%    $0.009/task                          │
│  claude-opus-4-7      7%    $0.189/task                          │
│                                                                  │
│  By Tool (call frequency):                                       │
│  web_search          44%                                         │
│  code_interpreter    31%                                         │
│  memory_search       25%                                         │
└──────────────────────────────────────────────────────────────────┘
```

**Key LLM Analytics event properties:**

| Property | Type | Description |
|---|---|---|
| `$ai_model` | string | e.g. `claude-sonnet-4-6` |
| `$ai_provider` | string | `anthropic` \| `openai` \| `mistral` |
| `$ai_input_tokens` | number | Prompt tokens consumed |
| `$ai_output_tokens` | number | Completion tokens generated |
| `$ai_total_cost_usd` | number | Dollar cost of this generation |
| `$ai_latency` | number | Time to first token (ms) |
| `$ai_error` | boolean | `true` if the generation failed |
| `$ai_error_code` | string | e.g. `rate_limit_exceeded` |
| `organization_id` | string | WorkOS/OIDC org id — used for group analytics |

**Filtering by org** — in any PostHog insight:
1. Add filter: `organization_id = <external_org_id>`
2. Or use Group analytics → Company → select org

---

### Creating a New PostHog Insight

**Example: track which agents are most expensive**

1. Click **Insights** → **New insight** → **Trends**
2. Event: `$ai_generation`
3. Aggregate by: `sum($ai_total_cost_usd)` (property sum)
4. Breakdown by: `$ai_model`
5. Filter by date range: Last 30 days
6. Save to: **LLM Cost Dashboard**

**Example: task submission funnel**

1. Click **Insights** → **New insight** → **Funnel**
2. Steps:
   - `agent_create_clicked`
   - `task_submitted`
   - `$ai_generation` (where `$ai_error = false`)
3. Measure: **Conversion rate**

---

### Feature Flags

Feature flags control plan-gated features. The Go backend evaluates them locally (< 50ms) using the PostHog Go SDK.

**Current flags:**

| Flag key | Targets | Controls |
|---|---|---|
| `advanced_risk_scoring` | Pro+ orgs | `GET /v1/tasks/{id}/risk` endpoint |
| `agent_rollback` | Scale+ orgs | `POST /v1/agents/{id}/rollback` |
| `crew_max_agents` | By plan tier | Max agents per MACP crew |
| `experimental_model_routing` | Internal | Circuit breaker tuning |

**Creating a new flag:**

1. PostHog → **Feature Flags** → **New feature flag**
2. Key: `your_flag_key` (lowercase, underscores)
3. Match by: Group property `plan_tier` equals `pro` or `scale` or `enterprise`
4. Rollout: 100% for matching condition
5. Save → flag is live within 60 seconds (local evaluation polling interval)

**Using a flag in Go (backend gate):**

```go
// internal/handler/http/tasks.go
func (h *TaskHandler) GetRisk(w http.ResponseWriter, r *http.Request) {
    tenantID, _ := middleware.TenantIDFromContext(r.Context())
    orgID := middleware.OrgExternalIDFromContext(r.Context())
    userID := middleware.PrincipalFromContext(r.Context())

    if !h.flags.IsEnabled(r.Context(), "advanced_risk_scoring", userID, orgID) {
        writeError(w, http.StatusNotFound, domain.ErrCodeNotFound, "feature not available on your plan")
        return
    }
    // ... fetch and return risk data
}
```

**Using a flag in frontend:**

```tsx
const hasRiskScoring = useFeatureFlag('advanced_risk_scoring')
```

---

### Cookie Consent and Opt-Out Verification

`PostHogProviderWrapper` reads the `posthog_consent` localStorage key **before** calling `posthog.init()`, and passes `opt_out_capturing_by_default: !hasConsented`. PostHog also persists its own `__ph_opt_in_out_<key>` cookie / localStorage entry — so clearing `posthog_consent` alone resets the consent banner but does NOT reset PostHog's internal opt-out state. To fully reset for testing, clear both.

To verify consent works correctly:

1. Open browser DevTools → Application → Local Storage
2. Delete both `posthog_consent` AND any `__ph_opt_in_out_*` keys (simulates first visit)
3. Reload — banner appears, no PostHog requests in Network tab
4. Click **Accept** — PostHog events should start appearing in Network tab (`/ingest/e/`)
5. Repeat steps 1–2, then click **Decline** — no `/ingest/` requests in Network tab

**Check opt-out state from browser console:**

```javascript
posthog.has_opted_out_capturing()  // → true if declined
posthog.has_opted_in_capturing()   // → true if accepted
```

---

## Sentry — Error Tracking

### Accessing Sentry

Self-hosted Relay runs in-cluster. Sentry UI is at `https://sentry.io` (your organisation).

**Two projects:**

| Project | What it catches |
|---|---|
| `actrone-go` | Go orchestrator errors (HTTP 5xx, gRPC Internal, panics) |
| `actrone-nextjs` | Next.js browser errors, SSR errors, session replay |

---

### Alert Matrix

**Rule 1 — Platform Critical (pages on-call):**

Fires when: any error where `organization_id = system-core` OR unhandled exception without org tag.
Action: PagerDuty → engineering on-call.

These are YOUR bugs — infrastructure is broken.

**Rule 2 — User Agent Runtime (Slack only):**

Fires when: error where `error.category = user-agent-runtime`.
Action: `#agent-errors` Slack channel.

These are the customer's agent logic errors — monitor for patterns, not individual fires.

**Reading the distinction in the Sentry UI:**

| Tag in Sentry event | Meaning | Who investigates |
|---|---|---|
| `error.category: platform` | Infrastructure bug | On-call engineer |
| `error.category: user-agent-runtime` | Agent logic error | Customer success |
| `organization_id: system-core` | No org context; always platform | On-call engineer |

---

### Triaging a Sentry Alert

**Step 1 — Read the error title and tags:**

```
TypeError: Cannot read properties of undefined (reading 'tenantID')
  Tags: organization_id=org_2abc, error.category=platform, environment=production
  Occurred: 47 times in last hour
  First seen: 23 minutes ago
```

**Step 2 — Check the breadcrumbs** — Sentry captures the last 100 events before the error. Look for the NATS message or HTTP request that triggered it.

**Step 3 — Check the stack trace** — Go stack traces show the exact goroutine and line number.

**Step 4 — Find the request_id** — The `request_id` Sentry tag matches a trace in your structured logs (if you have log aggregation configured). Use it to see every log line for that request.

**Step 5 — Check if it's a regression** — "First seen" and "Releases" show which deploy introduced it.

---

### Sentry Crons (Temporal Worker Health)

The Temporal worker sends a heartbeat to Sentry Crons every 30 seconds. If the worker stops (crash, OOM, stuck goroutine), Sentry fires a "Missed check-in" alert after 2 minutes.

**Monitoring in Sentry UI:**

1. Sentry → **Crons** → `temporal-worker-health`
2. Status: `OK` = healthy; `Missed` = worker not heartbeating; `Error` = explicit failure signal

**If Cron shows "Missed":**

1. Check Temporal worker pod: `kubectl -n actrone-core get pods -l app=orchestrator`
2. Check pod logs: `kubectl -n actrone-core logs -l app=orchestrator --tail=100`
3. Check Temporal UI (`http://temporal.internal:8233`) for stuck workflows
4. If pod is `CrashLoopBackOff`: check OOM events: `kubectl -n actrone-core describe pod <name>`

---

### Sentry Relay — PII Verification

The Relay scrubs credentials before any event reaches Sentry Cloud. To verify:

1. Trigger an error that includes an API key in the event extras (use a test endpoint in staging)
2. Check Sentry — the field should show `[FILTERED]`
3. Check Relay logs: `kubectl -n actrone-core logs -l app=sentry-relay --tail=50`

**Relay scrub patterns (from `values.yaml`):**

```
secret | token | api_key | jwt | private_key | authorization | password | credential | seed | nkey
```

Any key matching these patterns has its value replaced with `[FILTERED]` before the event leaves the cluster.

---

## Prometheus Metrics

The Go orchestrator exposes `/metrics` for Prometheus scraping. These are infrastructure-level metrics (latency histograms, queue depth) as distinct from PostHog product analytics.

**Key metrics to watch:**

| Metric | Description | Alert threshold |
|---|---|---|
| `http_request_duration_seconds{p99}` | HTTP handler latency | > 2s |
| `grpc_request_duration_seconds{p99}` | gRPC handler latency | > 500ms |
| `temporal_workflow_pending` | Workflows waiting for a worker | > 100 |
| `nats_consumer_lag` | Messages not yet consumed | > 1000 |
| `llm_tokens_total` | Token consumption counter | (budget alert) |
| `llm_cost_usd_total` | Dollar cost counter | (budget alert) |
| `tool_calls_total{status="blocked"}` | Blocked tool calls | > 5% of total |
| `redis_cache_hits_total` vs `redis_cache_misses_total` | L1 cache effectiveness | miss rate > 30% |

**Accessing Grafana:**

Grafana is deployed alongside Prometheus in the `monitoring` namespace. The main dashboard (`actrone-platform`) shows all of these metrics with 5-minute rollups.

---

## Structured Log Fields Reference

Every Go log line includes these fields. Use them to filter in your log aggregation system (CloudWatch, Loki, Datadog).

| Field | Example | Use |
|---|---|---|
| `level` | `error` | Filter by severity |
| `ts` | `2026-05-21T14:32:01Z` | Time ordering |
| `msg` | `tasks.create.failed` | Dot-namespaced, searchable |
| `tenant_id` | `aaa-bbb-ccc` | Filter to one org's logs |
| `agent_id` | `eee-fff-ggg` | Filter to one agent's logs |
| `task_id` | `hhh-iii-jjj` | Filter to one task execution |
| `workflow_id` | `task-hhh-iii-jjj` | Match to Temporal UI entry |
| `request_id` | `01HV...` | Match to Sentry event |
| `principal` | `user_01H...` | Which user triggered this |
| `duration_ms` | `347.2` | Operation timing |
| `error` | `context deadline exceeded` | Error string |

**Sample CloudWatch Insights query to trace one task:**

```
fields @timestamp, level, msg, error
| filter task_id = "hhh-iii-jjj"
| sort @timestamp asc
```

---

## Cost Spike Response

If PostHog LLM Analytics shows an unexpected cost spike:

1. **PostHog → LLM Analytics → filter last 1h** — identify which org and model
2. **Filter by `organization_id`** — is it one org driving the spike?
3. **Check `$ai_total_cost_usd` by agent** — which agent is running?
4. **Check the org's `daily_budget_usd`** in the `tenants` table:
   ```sql
   SELECT name, daily_budget_usd FROM tenants WHERE external_org_id = 'org_xxx';
   ```
5. **If over budget, halt manually** via the orchestrator admin endpoint:
   ```bash
   curl -X POST https://api.actrone.com/v1/admin/tenants/{id}/suspend \
     -H "Authorization: Bearer $ADMIN_KEY"
   ```

The PostHog cost alert webhook (configured in PostHog → Destinations) calls `POST /v1/cost/kill-switch` automatically when daily budget burn rate exceeds 80%.
