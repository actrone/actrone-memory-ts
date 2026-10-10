# Guide 02 — Local Development Setup

> **Status refreshed 2026-07-13 (code-verified):** Auth env vars below are stale — Clerk was removed;
> the orchestrator now reads `ORCHESTRATOR_AUTH_WORKOS_*` (managed tier: `CLIENT_ID`, `AUTH_DOMAIN`,
> `WEBHOOK_SECRET`) and `ORCHESTRATOR_AUTH_OIDC_*` (self-host generic OIDC: `ISSUER`, `JWKS_URL`,
> `AUDIENCES`, claim-mapping vars — `internal/config/config.go`). Leave both empty for local dev to
> use API-key auth only, same as before. Also: **the migration count is stale** — `goose -dir
> ./migrations` currently applies **128 files** (`backend/orchestrator/migrations/`, up to
> `00127_channel_default_agent.sql`), not 14; don't rely on the literal count, just run `goose ... up`.
> The frontend env var is `NEXT_PUBLIC_WORKOS_CLIENT_ID` (+ server-side `WORKOS_API_KEY` / equivalents),
> not `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` — confirm exact names against
> `frontend/apps/control-tower/.env.example` at setup time, as this pass did not enumerate every var.

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Go | 1.23+ | `brew install go` or [go.dev](https://go.dev/dl) |
| Node.js | 22 LTS | `brew install node` or [nodejs.org](https://nodejs.org) |
| Docker Desktop | latest | [docker.com](https://docker.com) |
| `goose` | latest | `go install github.com/pressly/goose/v3/cmd/goose@latest` |
| `buf` | latest | `go install github.com/bufbuild/buf/cmd/buf@latest` |

---

## 1. Clone and Bootstrap

```bash
git clone https://github.com/actrone/actrone.git
cd actrone
```

---

## 2. Start Backing Services (Docker Compose)

```bash
# From the repo root:
docker compose up -d

# Services started:
#   postgres:5432   — PostgreSQL 16 (task/identity DB)
#   redis:6379      — Redis 7.2 (L1 hot memory)
#   qdrant:6333     — Qdrant (L2 vector memory)
#   nats:4222       — NATS JetStream (event fabric)
#   temporal:7233   — Temporal server + UI at :8233
```

Wait for Temporal to be healthy before proceeding:
```bash
docker compose ps
# All services should show "healthy" or "running"
```

---

## 3. Run Database Migrations

```bash
cd backend/orchestrator
cp .env.example .env   # fill in API keys (see below)

# Run all 14 migrations
goose -dir ./migrations postgres "$ORCHESTRATOR_DATABASE_DSN" up
```

**Minimum `.env` values for local dev** (no WorkOS/OIDC, no PostHog, no Sentry needed):
```env
ORCHESTRATOR_DATABASE_DSN=postgres://actrone:changeme@localhost:5432/actrone
ORCHESTRATOR_REDIS_URL=redis://localhost:6379
ORCHESTRATOR_QDRANT_URL=http://localhost:6333
ORCHESTRATOR_TEMPORAL_HOST_PORT=localhost:7233
ORCHESTRATOR_TEMPORAL_NAMESPACE=default

ORCHESTRATOR_MODEL_OPENAI_API_KEY=sk-...   # required for completions

# Auth: leave blank to use SHA-256 API key mode only (no WorkOS/OIDC in dev)
ORCHESTRATOR_AUTH_WORKOS_CLIENT_ID=
ORCHESTRATOR_AUTH_WORKOS_WEBHOOK_SECRET=
ORCHESTRATOR_AUTH_OIDC_ISSUER=

# Analytics: leave blank to disable
ORCHESTRATOR_SENTRY_DSN=
ORCHESTRATOR_POSTHOG_API_KEY=

ORCHESTRATOR_NATS_URL=nats://localhost:4222
ORCHESTRATOR_GRPC_PORT=50051
```

---

## 4. Start the Go Orchestrator

```bash
cd backend/orchestrator
go run ./cmd/orchestrator/...
```

Expected output:
```
{"level":"info","ts":"...","msg":"orchestrator.starting","addr":"0.0.0.0:8080"}
{"level":"info","ts":"...","msg":"redis.connected"}
{"level":"info","ts":"...","msg":"qdrant.connected"}
{"level":"info","ts":"...","msg":"temporal.worker.started","task_queue":"orchestrator"}
{"level":"info","ts":"...","msg":"grpc.server.listening","port":50051}
{"level":"info","ts":"...","msg":"http.server.listening","addr":"0.0.0.0:8080"}
```

Health check:
```bash
curl http://localhost:8080/health/live   # → {"status":"ok"}
curl http://localhost:8080/health/ready  # → {"status":"ok"}
```

---

## 5. Start the Frontend

```bash
cd frontend
cp .env.example .env.local
# Fill in at minimum:
# NEXT_PUBLIC_ORCHESTRATOR_URL=http://localhost:8080
# NEXT_PUBLIC_WORKOS_CLIENT_ID=client_... (from the WorkOS Dashboard)
# WORKOS_API_KEY=sk_test_...
# WORKOS_COOKIE_PASSWORD=... (random 32+ char string)

npm install
npm run dev
# Opens at http://localhost:3000
```

---

## 6. Submit Your First Task (API Key Mode)

Create an API key directly in the database for local testing:
```bash
# Generate a random key
KEY=$(openssl rand -hex 32)
HASH=$(echo -n "$KEY" | sha256sum | awk '{print $1}')

# Insert into database
psql postgres://actrone:changeme@localhost:5432/actrone <<SQL
INSERT INTO tenants (name) VALUES ('dev-tenant')
  RETURNING id;
-- Note the tenant_id from above, e.g. 'aaa-bbb-ccc'
INSERT INTO api_keys (tenant_id, name, hash)
  VALUES ('aaa-bbb-ccc', 'local-dev', '$HASH');
SQL

echo "Your API key: $KEY"
```

Submit a task:
```bash
curl -X POST http://localhost:8080/v1/tasks \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "00000000-0000-0000-0000-000000000001",
    "input": {"prompt": "What is 2 + 2?"},
    "idempotency_key": "test-001"
  }'
```

Stream the result:
```bash
# Install wscat: npm install -g wscat
wscat -c "ws://localhost:8080/v1/tasks/{task_id}/stream" \
  -H "Authorization: Bearer $KEY"
```

---

## 7. Running Tests

```bash
# Go unit tests (race detector enabled)
cd backend/orchestrator
go test -race ./...

# Go integration tests (requires Docker services running)
go test -race -tags integration ./...

# Frontend TypeScript type check
cd frontend
npm run type-check

# Frontend unit tests
npm test

# Lint
cd backend/orchestrator && golangci-lint run ./...
cd frontend && npm run lint
```

---

## Common Local Dev Issues

| Symptom | Cause | Fix |
|---|---|---|
| `dial tcp: connect: connection refused` on Temporal | Temporal not started | `docker compose up temporal -d` |
| `macp: subscribe all task events: nats: no servers available` | NATS not started | `docker compose up nats -d` |
| `migrate: no change` on goose up | Already at latest | Normal; safe to ignore |
| `posthog.init_failed` in logs | No PostHog key in `.env` | Expected in local dev; analytics disabled |
| `sentry.init_failed` | No Sentry DSN in `.env` | Expected in local dev; errors logged to stdout |
| WorkOS/OIDC JWT validation fails | No WorkOS/OIDC config | Use API key auth mode in dev (leave `ORCHESTRATOR_AUTH_WORKOS_CLIENT_ID` / `ORCHESTRATOR_AUTH_OIDC_ISSUER` empty) |

---

## Code Generation

```bash
# Re-generate gRPC Go code from proto (requires buf installed)
cd backend/orchestrator
buf generate

# Output:
#   gen/orchestrator/v1/orchestrator.pb.go
#   gen/orchestrator/v1/orchestrator_grpc.pb.go
```

> **Note:** The `gen/` directory is committed to the repository so that engineers
> without `buf` installed can still build the project. Run `buf generate` whenever
> `proto/orchestrator/v1/orchestrator.proto` is modified.
