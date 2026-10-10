# Guide 10 — On-Call Runbook

> **Status refreshed 2026-07-13 (code-verified):** two sections were rewritten for stale tech —
> **Auth Failures** described Clerk JWKS specifically (auth is now WorkOS AuthKit + generic OIDC via
> `internal/oidc.Verifier`, Guide 01/03) and **mTLS / SPIFFE Issues** described Istio ztunnel + SPIRE
> (retired — Linkerd is the mesh, Guide 05/09). The `tenants.clerk_org_id` column referenced in Cost
> Spike is now `external_org_id`. Playbook steps for Pod CrashLoop, Tasks Not Processing, WebSocket
> Drops, NATS Consumer Lag, Database Issues, Analytics Gap, and Temporal Worker Health were spot-checked
> for plausibility but their exact kubectl/psql commands were not re-run against a live cluster this
> pass (unverified 2026-07-13) — the last verified-live date below (2026-05-21) predates this refresh
> and should not be treated as still current for those sections.

## Alert Routing

```
┌────────────────────────────────────────────────────────────────────┐
│  Alert source          → Destination              Severity         │
│  ──────────────────────────────────────────────────────────────    │
│  Sentry: platform error → PagerDuty on-call       CRITICAL         │
│  Sentry: user-agent err → #agent-errors Slack      INFO            │
│  Sentry: Cron missed   → PagerDuty on-call        CRITICAL         │
│  PostHog: cost spike   → /v1/cost/kill-switch      AUTO            │
│  Prometheus: p99 > 2s  → #platform-alerts Slack   WARNING         │
│  Prometheus: worker 0  → PagerDuty on-call        CRITICAL         │
└────────────────────────────────────────────────────────────────────┘
```

**First action on any page:** check the [Grafana dashboard](http://grafana.actrone-internal) and [Temporal UI](http://temporal.actrone-internal:8233) before touching anything.

---

## Playbook Index

| Symptom | Section |
|---|---|
| Orchestrator pods crashing | [Pod CrashLoop](#pod-crashloop) |
| Tasks stuck in PENDING | [Tasks Not Processing](#tasks-not-processing) |
| WebSocket disconnecting | [WebSocket Drops](#websocket-drops) |
| Auth failures (401 flood) | [Auth Failures](#auth-failures) |
| NATS consumer lag rising | [NATS Consumer Lag](#nats-consumer-lag) |
| LLM cost spike | [Cost Spike](#cost-spike) |
| Database connection exhaustion | [Database Issues](#database-issues) |
| Linkerd mTLS errors | [Linkerd Mesh Issues](#linkerd-mesh-issues) |
| PostHog events missing | [Analytics Gap](#analytics-gap) |
| Sentry Cron "Missed" | [Temporal Worker Health](#temporal-worker-health) |

---

## Pod CrashLoop

**Symptoms:** `kubectl -n actrone-core get pods` shows `CrashLoopBackOff` or `OOMKilled` for orchestrator pods.

**Step 1 — Get exit reason:**

```bash
kubectl -n actrone-core describe pod <pod-name>
# Look at "Last State: Terminated" and "Reason"
# OOMKilled → memory limit hit
# Error (exit 1) → application startup failed
# Completed → container exited 0 (misconfigured liveness probe)
```

**Step 2 — Get last logs before crash:**

```bash
kubectl -n actrone-core logs <pod-name> --previous --tail=100
```

**Step 3 — Common causes:**

| Exit reason | Cause | Fix |
|---|---|---|
| OOMKilled | Memory limit too low or goroutine leak | Increase `resources.limits.memory` in values.yaml; check pprof heap dump |
| Error: config.missing | Required env var not set | Check secret exists: `kubectl -n actrone-core get secret orchestrator-secrets` |
| Error: db.connection | Database DSN wrong or DB unreachable | Verify DSN secret; check RDS security group allows EKS node IP |
| Error: temporal.connection | Temporal server not ready | Check temporal pods: `kubectl -n actrone-core get pods -l app=temporal` |

**Step 4 — If OOMKilled:**

```bash
# Temporarily increase memory to stop the loop while investigating
kubectl -n actrone-core set resources deployment/orchestrator \
  --limits=memory=4Gi

# Capture heap profile from a healthy pod
kubectl -n actrone-core exec -it <healthy-pod> -- \
  curl -s http://localhost:6060/debug/pprof/heap > heap.prof
go tool pprof heap.prof
```

---

## Tasks Not Processing

**Symptoms:** Tasks submitted via API remain in `PENDING` state; Temporal UI shows workflows queued but not starting.

**Step 1 — Check Temporal worker registration:**

```bash
# Temporal UI → Task Queues → "orchestrator"
# "Pollers" should show at least one active worker IP.
# If empty → no orchestrator pods are connected to Temporal.

kubectl -n actrone-core logs -l app=orchestrator --tail=50 | grep temporal
# Expected: {"msg":"temporal.worker.started","task_queue":"orchestrator"}
# If missing: worker failed to start
```

**Step 2 — Check pod count:**

```bash
kubectl -n actrone-core get deployment orchestrator
# READY should be >= 1. If 0/3: pods are crashing (see CrashLoop section)
```

**Step 3 — Check Temporal server:**

```bash
kubectl -n actrone-core get pods -l app=temporal
# All temporal pods should be Running
kubectl -n actrone-core logs -l app=temporal --tail=50
```

**Step 4 — If Temporal server is healthy but tasks still stuck:**

```bash
# Check if a specific workflow is stuck
# Temporal UI → Workflows → filter by Status: Running
# Click on a stuck workflow → History → look for "ActivityTaskScheduled" with no "ActivityTaskStarted"
# This means workers are not polling — restart orchestrator pods

kubectl -n actrone-core rollout restart deployment/orchestrator
```

**Step 5 — Check NATS (for MACP task types):**

```bash
kubectl -n actrone-core exec -it nats-0 -- nats consumer info ACTRONE analytics-bridge
# If lag is very high and growing, bridge is falling behind but tasks should still process
# Task processing uses Temporal, not NATS for the primary execution path
```

---

## WebSocket Drops

**Symptoms:** Browser shows disconnected state; users report real-time output stopped mid-stream.

**Step 1 — Check if it's a load balancer timeout:**

ALB idle timeout default is 60 seconds. Long-running agents will exceed this.

```bash
# Verify ALB idle timeout
aws elbv2 describe-load-balancer-attributes \
  --load-balancer-arn $(kubectl -n kube-system get ingress orchestrator \
    -o jsonpath='{.metadata.annotations.kubernetes\.io/ingress\.class}')
# idle_timeout.timeout_seconds should be 3600 (1 hour) for agent workloads
```

**Step 2 — Check cross-pod event delivery:**

```bash
# If user's WebSocket is on Pod A but their Temporal workflow runs on Pod B,
# events must cross via NATS. Check NATS is healthy:
kubectl -n actrone-core exec -it nats-0 -- nats server report jetstream

# Check tenant.*.task.*.events subjects are being published:
kubectl -n actrone-core exec -it nats-0 -- \
  nats subscribe "tenant.>" --count=10
# Should see events if any tasks are running
```

**Step 3 — Check orchestrator WebSocket broker logs:**

```bash
kubectl -n actrone-core logs -l app=orchestrator --tail=100 | grep ws
# Look for: ws.broker.nats_publish_failed or ws.subscribe.error
```

---

## Auth Failures

**Symptoms:** Flood of `401 Unauthorized` in Sentry or logs; `ERR_UNAUTHORISED` errors for previously-working users.

**Step 1 — Distinguish WorkOS/OIDC session-token vs API key failures:**

```bash
kubectl -n actrone-core logs -l app=orchestrator --tail=200 | grep "auth\|jwt\|jwks"
# Look for:
# "jwks.refresh_failed" → WorkOS or self-hosted OIDC issuer's JWKS endpoint unreachable
# "jwt.expired" → tokens not being refreshed client-side
# "jwt.unknown_kid" → the IdP rotated signing keys; verify eager refresh worked
```

**Step 2 — WorkOS/OIDC JWKS cache:**

The `internal/oidc.Verifier` refreshes every 6 hours and on unknown `kid` (Guide 01). If the IdP
rotated keys and the refresh failed:

```bash
# Restart orchestrator to force JWKS re-fetch from scratch
kubectl -n actrone-core rollout restart deployment/orchestrator

# After restart, verify in logs:
# {"msg":"jwks.fetched","key_count":2} — healthy
```

**Step 3 — Check IdP status:**

Managed tier: visit `https://status.workos.com`. Self-hosted tier: check your own OIDC provider's
status page (Keycloak/Okta/Entra/Auth0/Zitadel). Either way, API key auth (`act_live_...` keys) still
works — SDK users are unaffected.

**Step 4 — API key failures specifically:**

```bash
# API key lookup hits Postgres. Check DB connectivity:
kubectl -n actrone-core logs -l app=orchestrator | grep "api_key\|db.query"

# Verify the api_keys table has the expected row:
psql "$ORCHESTRATOR_DATABASE_DSN" -c \
  "SELECT tenant_id, name, revoked_at FROM api_keys WHERE hash = encode(sha256('<raw_key>'), 'hex');"
```

---

## NATS Consumer Lag

**Symptoms:** `analytics-bridge` consumer lag rising in NATS; PostHog LLM events delayed or missing.

**Step 1 — Check consumer lag:**

```bash
kubectl -n actrone-core exec -it nats-0 -- nats consumer info ACTRONE analytics-bridge
# "Num Pending": should be < 100. If growing unboundedly, bridge is stuck.
```

**Step 2 — Check bridge goroutine:**

```bash
kubectl -n actrone-core logs -l app=orchestrator | grep "analytics.bridge"
# "analytics.bridge.restarting" — bridge crashed and is restarting (5s backoff, expected)
# "analytics.bridge.decode_generation" — events are arriving but malformed
# No output — bridge may not have started (check main.go initialization)
```

**Step 3 — If lag exceeds 10,000 messages:**

The WorkQueue retention means each message will be delivered exactly once. Lag = events waiting. They WILL be processed once the bridge reconnects — no data loss, just delay.

```bash
# Restart the orchestrator to force bridge reconnect:
kubectl -n actrone-core rollout restart deployment/orchestrator

# Monitor lag decreasing:
watch 'kubectl -n actrone-core exec -it nats-0 -- nats consumer info ACTRONE analytics-bridge'
```

**Step 4 — PostHog API reachability:**

```bash
# Test from inside the cluster
kubectl -n actrone-core run curl-test --image=curlimages/curl --restart=Never -- \
  curl -v https://eu.posthog.com/health
kubectl -n actrone-core delete pod curl-test
# If this fails: check NetworkPolicy egress allows :443 to PostHog
```

---

## Cost Spike

**Symptoms:** PostHog LLM Analytics alert fires; `$ai_total_cost_usd` sum spiking; billing alarm.

**Step 1 — Identify the source:**

1. PostHog → LLM Analytics → breakdown by `organization_id` → find the outlier
2. PostHog → LLM Analytics → breakdown by `$ai_model` → check for expensive model misuse (claude-opus-4-7 at scale)
3. Check if `$ai_error` is false (legitimate completions) or true (error loops consuming tokens)

**Step 2 — Check the tenant's budget:**

```bash
psql "$ORCHESTRATOR_DATABASE_DSN" -c \
  "SELECT t.name, t.daily_budget_usd, t.external_org_id
   FROM tenants t
   WHERE t.external_org_id = 'org_xxx';"
```

**Step 3 — Halt the tenant's workloads:**

```bash
# Suspend new task submissions for the tenant
curl -X POST https://api.actrone.com/v1/admin/tenants/<tenant-id>/suspend \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reason": "daily_budget_exceeded"}'

# This sets tenants.suspended_at in the DB.
# Auth middleware checks suspended_at and returns 402 for suspended tenants.
```

**Step 4 — If an agent is in an infinite loop:**

```bash
# Temporal UI → find the stuck workflow by tenant_id
# Terminate the workflow (safe — will not affect other tenants)
tctl --ns default workflow terminate \
  --workflow_id <workflow-id> \
  --reason "cost_budget_exceeded"
```

---

## Database Issues

**Symptoms:** `ERR_INTERNAL` flood; `db.query` errors in logs; `pgx: connection pool exhausted`.

**Step 1 — Check connection pool:**

```bash
kubectl -n actrone-core logs -l app=orchestrator | grep "pgx\|pool\|connection"
# "pgx: acquire timed out" → pool exhausted; too many concurrent requests
# "pgx: connection refused" → RDS unreachable
```

**Step 2 — Check RDS health:**

```bash
aws rds describe-db-instances --db-instance-identifier actrone-production \
  --query 'DBInstances[0].DBInstanceStatus'
# Should be "available"
```

**Step 3 — Check active connections:**

```bash
psql "$ORCHESTRATOR_DATABASE_DSN" -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
# If "active" count approaches max_connections, you have a connection leak or overload
```

**Step 4 — If connections are exhausted:**

```bash
# Rolling restart releases all idle connections immediately:
kubectl -n actrone-core rollout restart deployment/orchestrator

# For persistent exhaustion, check for long-running transactions:
psql "$ORCHESTRATOR_DATABASE_DSN" -c \
  "SELECT pid, now() - query_start AS duration, query
   FROM pg_stat_activity
   WHERE state = 'active'
   ORDER BY duration DESC
   LIMIT 10;"
```

---

## Linkerd Mesh Issues

> Rewritten 2026-07-13 (was "mTLS / SPIFFE Issues" — Istio ztunnel + SPIRE were retired and replaced
> by Linkerd, Guide 05/09). Commands below are illustrative Linkerd equivalents, not re-run against a
> live cluster this pass (unverified 2026-07-13).

**Symptoms:** Pod-to-pod connections refused; `connection reset by peer` in logs; `linkerd-proxy` errors.

**Step 1 — Check the Linkerd control plane:**

```bash
linkerd check
kubectl -n linkerd get pods
# linkerd-destination, linkerd-identity, linkerd-proxy-injector should all be Running.
```

**Step 2 — Check the pod has a healthy linkerd-proxy sidecar:**

```bash
kubectl -n actrone-core get pod <pod-name> -o jsonpath='{.status.containerStatuses[?(@.name=="linkerd-proxy")].ready}'
kubectl -n actrone-core logs <pod-name> -c linkerd-proxy --tail=50 | grep -i error
```

**Step 3 — Verify the pod's mesh identity/certificate:**

```bash
kubectl -n actrone-core exec -it <orchestrator-pod> -c linkerd-proxy -- \
  curl -s localhost:4191/ready
# Should return "ok". Also check: linkerd -n actrone-core identity <pod-name>
```

**Step 4 — Verify Server + AuthorizationPolicy are admitting the expected traffic:**

```bash
kubectl -n actrone-core get server,authorizationpolicy,meshtlsauthentication
# Confirm the caller's identity is listed in the relevant MeshTLSAuthentication
# (e.g. envoy-gateway.envoy-gateway-system.serviceaccount.identity.linkerd.cluster.local)

# Test that an unmeshed/unauthorized caller is rejected (from outside the mesh):
kubectl run test-curl --image=curlimages/curl --restart=Never -- \
  curl -v http://orchestrator.actrone-core.svc.cluster.local:8080/health/live
# Should be refused/blocked under the namespace's default-deny inbound policy — NOT a 200 response
```

---

## Analytics Gap

**Symptoms:** PostHog LLM Analytics shows no events for the last N hours despite tasks being processed.

**Step 1 — Verify tasks are completing:**

```bash
psql "$ORCHESTRATOR_DATABASE_DSN" -c \
  "SELECT count(*), status FROM tasks
   WHERE updated_at > NOW() - INTERVAL '1 hour'
   GROUP BY status;"
# If completed count > 0, tasks are finishing but events aren't reaching PostHog.
```

**Step 2 — Check bridge:**

```bash
kubectl -n actrone-core logs -l app=orchestrator | grep "analytics.bridge"
# "analytics.bridge.started" — bridge running
# No output → bridge goroutine not started (check PostHog API key is set)
```

**Step 3 — Check NATS subscription:**

```bash
# Check the analytics-bridge consumer exists
kubectl -n actrone-core exec -it nats-0 -- nats consumer info ACTRONE analytics-bridge
# "Num Pending" should be > 0 if tasks ran recently and bridge hasn't caught up
```

**Step 4 — Check PostHog API key:**

```bash
kubectl -n actrone-core get secret orchestrator-secrets \
  -o jsonpath='{.data.posthog-api-key}' | base64 -d
# Should be a non-empty phc_... key
# If empty: ESO hasn't synced the key from Secrets Manager
```

---

## Temporal Worker Health

**Symptoms:** Sentry Cron shows "Missed" for `temporal-worker-health`.

**Step 1 — Check Sentry Cron status:**

Sentry → Crons → `temporal-worker-health`

- **Missed:** No check-in in > 2 minutes. Worker is not running.
- **Error:** Worker sent a check-in with error status (not currently implemented — treat as Missed).

**Step 2 — Check pods:**

```bash
kubectl -n actrone-core get pods -l app=orchestrator
# All should be Running. If 0 pods: HPA or deployment issue.
```

**Step 3 — Check heartbeat in logs:**

```bash
kubectl -n actrone-core logs -l app=orchestrator | grep "sentry.cron"
# "sentry.cron.checkin_failed" → Sentry Relay not reachable
# No output → heartbeat goroutine crashed
```

**Step 4 — Check Sentry Relay:**

```bash
kubectl -n actrone-core get pods -l app=sentry-relay
kubectl -n actrone-core logs -l app=sentry-relay --tail=50
```

**Step 5 — If relay is down:**

```bash
kubectl -n actrone-core rollout restart deployment/sentry-relay
# Cron will auto-recover once next check-in succeeds
```

---

## Incident Communication Template

For any P1 incident (on-call wake-up, customer-visible outage):

```
Incident: <short description>
Status: Investigating | Identified | Mitigating | Resolved
Impact: <which users/features affected>
Timeline:
  HH:MM - Alert fired
  HH:MM - Investigation started
  HH:MM - Root cause identified: <description>
  HH:MM - Mitigation applied: <what you did>
  HH:MM - Resolved: <confirmation>
Root Cause: <1-2 sentences>
Follow-up: <ticket reference for postmortem or permanent fix>
```

Post in `#incidents` Slack channel at each status change.

---

## Escalation Path

These timers are configured in PagerDuty service `actrone-platform-oncall` — verify the current policy in PD before relying on the values below. The timers fire automatically when a page is not acknowledged.

```
1. On-call engineer (PagerDuty)
   └── 15 min → 2. Senior engineer on-call backup
                  └── 30 min → 3. Engineering lead (Matt)
                                 └── 60 min → 4. Full team bridge call
```

If the incident involves **customer data** or **billing**, notify the engineering lead immediately regardless of time — do not wait for the escalation timer.

> Last verified: 2026-05-21. If you run this runbook and find a step out of date, update it in the same change as the fix.
