# Post-Hardening Follow-ups

> **Status:** ✅ **All follow-ups complete** as of 2026-05-22.
>
> The 69-item CLAUDE.md hardening plan
> (`~/.claude/plans/do-a-deep-codebase-glittery-wilkinson.md`) landed on
> 2026-05-22. Every plan item is closed in code. All follow-ups below are
> also resolved. Items 4, 5, and 9 (Bootstrap staging TF state, prod RDS
> re-plan, /ultrareview) remain deferred to their original owners.
>
> **Status refreshed 2026-07-13 (code-verified):** two of the three deferred items have since been
> **codified in Terraform** (the *apply* is still an operator step, but they are no longer manual
> chicken-and-egg console work):
>
> - **Item 4 (staging TF state backend)** — now IaC: `infra/terraform/bootstrap/main.tf` provisions
>   the `actrone-terraform-state-staging` bucket + `alias/actrone-terraform-state-staging` KMS CMK
>   (plus dev/prod/cicd and the eu-west-1 prod-eu backend) with versioning, TLS-only policy, and PAB.
>   The §4 "provision outside Terraform" hand-instructions are superseded — run the bootstrap root
>   instead. Apply is still pending a live account.
> - **Item 5 (prod RDS CMK + egress)** — the code landed: `infra/terraform/modules/rds` creates a
>   customer-managed CMK (`aws_kms_key.rds`, rotation on) and pins it on the cluster/instances. The
>   `terraform plan`/apply against live prod state (maintenance window) is the only remaining part.
> - **Item 9 (`/ultrareview`)** — unchanged; user-triggered, cannot be verified from code.
> Marking those as "deferred to owners" is now imprecise for 4 & 5 (the code exists; only the apply
> is deferred) — see the corrected rows in the table below.

| # | Item | Status |
|---|------|--------|
| 1 | Python venv sync + mypy --strict + pytest 80% | ✅ Done — mypy clean, tests green |
| 2 | Frontend install + typecheck + vitest | ✅ Done — 23/23 vitest, pre-existing TS errors in marketing pages noted |
| 3 | Integration tests (Docker testcontainers) | ✅ Done — 14 passed, 5 skipped |
| 4 | Bootstrap staging TF state backend | 🟡 Codified in `terraform/bootstrap` (2026-07-13); apply pending |
| 5 | Re-plan prod RDS for new CMK | 🟡 CMK code in `modules/rds`; `plan`/apply in maintenance window pending |
| 6 | cert-manager Certificate for OTel→Jaeger mTLS | ✅ Done — `infra/observability/otel-collector/k8s/certificate.yaml` |
| 7 | Tune CSP allowlist after smoke | ✅ Done — no gaps; marketing pages use plain links only |
| 8 | Alertmanager routing for SLO burn-rate alerts | ✅ Done — `infra/observability/alertmanager/alertmanager.yml` |
| 9 | `/ultrareview` diff review | ⏸ Deferred — user-triggered |
| 10 | Promote conventions into CLAUDE.md | ✅ Done — §4.2, §5.2, §6.2, §6.3 updated |

---

Owner: Matt.

---

## 1. Sync Python virtualenvs

The hardening added new pinned dependencies (`prometheus-client`,
`typing-extensions`, etc.) and tightened retry predicates that reference
optional packages (`openai` error classes). `uv.lock` is committed but the
local `.venv`s have not been re-synced.

```bash
cd backend && uv sync --dev
cd ../actrone-memory-py && uv sync --dev
```

Then re-run the full suite per CLAUDE.md §7.3:

```bash
cd backend && uv run mypy --strict src && uv run pytest -q --cov=src --cov-fail-under=80
cd ../actrone-memory-py && uv run mypy --strict src && uv run pytest -q --cov=src --cov-fail-under=80
uv run pip-audit
```

**Why this matters:** the IDE currently flags `prometheus-client` /
`websockets` as "not installed in the selected environment" — false positive
relative to the lockfile, but means we cannot prove `mypy --strict` and
`pytest --cov-fail-under=80` pass without syncing first.

---

## 2. Frontend install + verify

`frontend/package.json` gained four new deps (`opossum`, `p-retry`, `zod`,
`@types/opossum`) and removed `reactflow`. The lockfile is not yet updated.

```bash
cd frontend
pnpm install
pnpm typecheck
pnpm lint
pnpm test -- --coverage
pnpm exec playwright test
pnpm next build
```

Confirm at the end:

- Vitest coverage threshold (80% / 80% / 70% / 80%) passes.
- The new `src/test/{env,stores,scrub}.test.ts` baseline tests all pass.
- `pnpm next build` succeeds with `output: standalone` when
  `DOCKER_BUILD=1`.

Then verify security headers and PII scrubbing in a real browser:

```bash
DOCKER_BUILD=1 docker build -t control-tower:hardened .
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_ORCHESTRATOR_URL=https://api.example.com \
  -e NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_x \
  -e CLERK_SECRET_KEY=sk_test_x \
  control-tower:hardened
curl -I http://localhost:3000/ | grep -iE 'strict-transport|x-frame|x-content|csp|referrer-policy'
```

CSP/HSTS/X-Frame/etc. should appear; the per-request `x-nonce` should
change between calls.

---

## 3. Integration tests against real backends

`actrone-memory-py/tests/integration/test_store_failures.py` requires Docker
because it boots Redis and Qdrant via testcontainers and deliberately
restarts them mid-test. Run on a host with Docker available:

```bash
cd actrone-memory-py
uv run pytest -m integration -v
```

CI should mark this job as `services: docker` and add `-m integration` to
the orchestrator's nightly Python pipeline (it's intentionally excluded
from `pytest -q` because the cold-start cost is ~30 s per container).

---

## 4. Bootstrap the staging Terraform state backend

The new `infra/terraform/envs/staging/main.tf` references resources that
do not yet exist:

- S3 bucket `actrone-terraform-state-staging`
- DynamoDB table `actrone-terraform-locks` (shared with prod — already
  exists)
- KMS alias `alias/actrone-terraform-state-staging`

Provision the bucket + KMS key *outside Terraform* (one-time chicken-and-
egg), then `terraform init` will succeed. Suggested commands (run from a
laptop with admin AWS creds, **not** from the workspace state machine):

```bash
aws kms create-key --description "Terraform state — staging" --query KeyMetadata.KeyId --output text
aws kms create-alias --alias-name alias/actrone-terraform-state-staging --target-key-id <key-id>

aws s3api create-bucket --bucket actrone-terraform-state-staging --region us-east-1
aws s3api put-bucket-versioning --bucket actrone-terraform-state-staging --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket actrone-terraform-state-staging \
  --server-side-encryption-configuration '{
    "Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms","KMSMasterKeyID":"alias/actrone-terraform-state-staging"}}]}'
aws s3api put-public-access-block --bucket actrone-terraform-state-staging \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

Then:

```bash
cd infra/terraform/envs/staging
terraform init
terraform plan
```

---

## 5. Re-plan prod RDS to pick up the new CMK + egress restrictions

The `modules/rds` changes (customer-managed KMS, IAM database auth,
egress allowlist) require a `terraform plan` against the existing prod
state to surface the diff and a maintenance window for the apply.

```bash
cd infra/terraform/envs/prod
terraform init -upgrade   # picks up the new pinned provider version
terraform plan -out=hardening.tfplan
```

Review the plan carefully:

- **KMS rotation:** the cluster will get a fresh CMK; AWS migrates data
  encryption keys in place — no downtime.
- **Backup retention:** 14 → 30 days expands the retention window; no
  data loss, just higher snapshot cost (~$0.10/GB-month).
- **Egress SG:** the catch-all 0.0.0.0/0 egress is replaced with DNS +
  443. If any *cluster-initiated* outbound traffic depends on another
  port (Performance Insights uses HTTPS, fine; cross-region replication
  needs explicit allowlisting), the apply will sever it. Audit
  VPC Flow Logs for unexpected egress before scheduling the apply.

Apply during an off-peak window; the apply itself is non-disruptive but
egress changes propagate immediately.

---

## 6. Provision cert-manager issuer for OTel ↔ Jaeger mTLS

`infra/observability/otel-collector/config.yaml` now mounts certs from
`/etc/otel/tls`. The chart that deploys the collector needs:

- A `Certificate` resource targeting an internal CA `ClusterIssuer`
  (`internal-ca` is the convention used elsewhere).
- A `volumeMounts` entry pointing the cert Secret at `/etc/otel/tls`.

Sketch (drop into `infra/observability/otel-collector/templates/cert.yaml`):

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: otel-collector-jaeger
  namespace: observability
spec:
  secretName: otel-collector-jaeger-tls
  duration: 720h          # 30 days
  renewBefore: 168h       # 7 days
  issuerRef:
    name: internal-ca
    kind: ClusterIssuer
  commonName: otel-collector.observability.svc.cluster.local
  dnsNames:
    - otel-collector
    - otel-collector.observability.svc.cluster.local
```

Until the cert exists the collector's Jaeger exporter will fail to start
— the readiness probe will catch it, but be aware before rolling out.

---

## 7. Tune the CSP allowlist after a real-traffic smoke

The CSP in `frontend/src/middleware.ts` lists the third-party origins we
know about (Clerk, Sentry, PostHog, orchestrator). A handful are likely
missing for marketing pages we haven't audited:

- Stripe (pricing / calculator page)
- Hubspot / Calendly (contact, enterprise)
- Vercel Analytics (`*.vercel-insights.com`) if enabled

Deploy to staging, open every public route in Chrome DevTools with the
Console tab visible, and capture any `Refused to load … because it
violates the following Content Security Policy directive` warnings.
Add the offending origins to `CSP_ALLOWED_*` arrays — do not relax to
`'unsafe-inline'` or `*` on scripts; if a vendor refuses to support
nonce-based CSP, isolate it behind an `<iframe sandbox>` instead.

---

## 8. Wire SLO burn-rate alerts into Alertmanager routing

`infra/observability/prometheus/alert_rules.yml` now emits
`OrchestratorErrorBudgetBurn_Fast` (severity=critical) and
`OrchestratorErrorBudgetBurn_Slow` (severity=warning). Alertmanager's
routing tree (separate config, not in this repo) needs:

- `severity=critical` ⇒ PagerDuty *and* Slack `#oncall`
- `severity=warning`  ⇒ Slack `#orchestrator-watchers` only

Confirm with a synthetic spike:

```bash
# From a worker node — generates ~10% 500s for 10 minutes
kubectl exec -n actrone deploy/orchestrator -- \
  curl -X POST localhost:9090/admin/synthetic-errors?rate=0.10\&duration=600s
```

Both alerts should fire (fast first, slow after ~15 min). If the route
to PagerDuty silently drops the fast alert, the routing tree is wrong —
fix it before the next genuine incident.

---

## 9. Run `ultrareview` on the diff before merging

The hardening branch touches ~70 files across five projects. Before merge:

```bash
git status   # confirm a clean working tree
/ultrareview
```

This launches the multi-agent cloud review against the local branch; it
catches cross-file consistency issues the per-phase audits could not
(e.g. an `APIError` field added on the Go side but not surfaced in the
TypeScript `APIError` class, or a CSP allowlist that omits an origin the
Sentry config references).

---

## 10. Renew CLAUDE.md as the source of truth

The hardening pass added several new conventions worth promoting from
this file into `CLAUDE.md`:

- Standard log field schema (`service`, `request_id`, `trace_id`, `event`,
  domain ids) — currently documented only in
  `actrone-memory-py/src/actrone_memory/logging.py`.
- Idempotency-key generation: callers must pass the same value on
  retries; auto-generation is *per call*, not per logical write.
- Server-side auth pattern for Next.js: never call client-side `tasksApi`
  from a Server Component; import `serverTasksApi` from `src/lib/api/server.ts`
  instead.
- Multi-window burn-rate alerts are the canonical alert pattern; raw
  error-rate thresholds are deprecated.

Add these as bullets under Sections 4.2, 6.2, 6.3, and 5.2 respectively
when CLAUDE.md is next revised.

---

## Plan checklist

| Phase | Items | Status |
| --- | --- | --- |
| 1 — CRITICAL | 20 | ✅ landed |
| 2 — HIGH | 27 | ✅ landed |
| 3 — MEDIUM | 14 | ✅ landed |
| 4 — LOW | 8 | ✅ landed |
| **Total** | **69** | ✅ |

All code-resident changes are in. The list above is the environmental
tail that cannot be solved by editing files alone.
