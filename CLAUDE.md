# CLAUDE.md — Production-Grade Engineering Standards

> This file is the authoritative source of truth for all code Claude generates in this workspace.
> Every output — regardless of size, language, or domain — must comply with every section below.
> "Good enough" does not exist here. Ship it or scrap it.

---

## 0. Prime Directives

1. **Production by default.** No scaffolding, no TODOs, no stubs unless explicitly requested. Every function must be callable in a live system today.
2. **10× efficiency.** Choose algorithms, data structures, and concurrency primitives that eliminate unnecessary work — not ones that are merely correct.
3. **Secure by construction.** Security is not a layer bolted on; it is the shape of the code itself.
4. **Explicit over implicit.** Prefer clarity over cleverness. The next engineer (or Claude instance) must understand intent without running the code.
5. **Dependencies must earn their place.** Every import must be justified; every library must be stable, actively maintained, and pinned.

---

## 0.1 SDKs & Client Libraries — canonical locations

The client SDKs and their exact locations (all now top-level `actrone-*` dirs — the Python SDK was
moved out of the backend to `actrone-py/`):

| SDK / lib | Location | Package | Verify with |
| --- | --- | --- | --- |
| **TypeScript SDK** | `actrone-ts/` (top-level) | `@actrone/sdk` | `npm run typecheck && npx vitest run` |
| **Python SDK** | **`actrone-py/` (top-level, sibling of `actrone-ts/`).** pyproject `actrone-py/pyproject.toml`, package `actrone`; `actrone-memory` (the package) is a local path dep at `../actrone-memory-py` (the local dir was renamed `actrone-memory`→`actrone-memory-py`; package name unchanged). | `actrone` | run in `actrone-py/`: `mypy src/actrone && pytest tests/unit -o addopts=""` |
| **CLI** | `actrone-cli/` (top-level, Go) | — | tool, not a client library |
| **Memory library (Python)** | `actrone-memory-py/` (top-level; local dir renamed from `actrone-memory/`, package name still `actrone-memory`) | — | a **separate** memory lib — do NOT confuse with the Python SDK |

> **The Go SDK is REMOVED from the family — do NOT build anything for it.** The two supported client
> SDKs are **TypeScript + Python** only. `actrone-go/` has been **deleted** (Go SDK Removal Plan,
> `docs/Actrone_Go_SDK_Removal_Plan.md`): the CLI was first migrated to its own self-contained
> `internal/client` (no SDK dependency), then the module was removed. There is no Go client SDK — no new
> endpoints, no parity work. Any plan that would "also do it for Go" is stale.

**Parity rule:** a client-facing change (e.g. a new endpoint surface) must land in **both SDKs —
TS + Python** — against one contract, each with contract tests. The Python SDK also hosts the BYOF
framework integrations (`backend/src/actrone/integrations/*`) and the worker harness
(`actrone-py/src/actrone/harness/`). *(The Python SDK was **extracted** from the backend to the
top-level **`actrone-py/`** repo — see `docs/Actrone_Python_SDK_Repo_Extraction_Plan.md`. Package name
unchanged (`actrone`); `actrone-memory` (the package) is consumed as a local path dep at
`../actrone-memory-py` (top-level sibling; the local dir was renamed `actrone-memory`→`actrone-memory-py`,
package name unchanged); the harness worker image is `actrone-py/Dockerfile`. It no longer exists under
`backend/`.)*

---

## 0.2 Skills: mandatory usage

Skills are not optional aids. If a skill exists for the task at hand, **invoke it before doing the
work**, not after, and follow what it returns. Skipping an applicable skill is a process violation in
the same way that skipping a CI gate is.

### 0.2.1 Frontend work, always

**Every** piece of frontend work in this repo (`frontend/apps/*`, `frontend/packages/ui`, the OSS
demo UI, any marketing/docs surface, any component, layout, style, token, animation or copy change
that a user sees) **must** invoke both of the following before code is written:

| Skill | What it is for |
| --- | --- |
| **`ui-ux-pro-max`** | Layout, information density, component patterns, animation timing, navigation, forms, and the priority-ordered UX rule set. Run its pre-delivery checklist (§1 to §3, the CRITICAL and HIGH categories) as a final pass. |
| **`design`** | Brand identity, design tokens, UI styling, and the wider design system. Use `design-system` for token architecture and component specs, `ui-styling` for shadcn/Tailwind implementation, and `banner-design`/`brand` for marketing assets. |

Additionally, for the surface being touched:

- **`web-design-guidelines`**: run as an audit pass on any UI before it is considered done. It
  checks accessibility, focus, forms, typography and interaction against the Web Interface
  Guidelines. Findings are fixed, not noted.
- **`vercel-react-best-practices`**: any React or Next.js component, page, data fetch or bundle
  change.
- **`vercel-react-view-transitions`**: any route transition, shared-element animation or enter/exit
  motion.
- **`dataviz`**: read **before** writing the first line of any chart, graph, dashboard tile, meter
  or sparkline, in any medium.
- **`writing-guidelines`**: any docs page, marketing copy, README or user-facing prose.
- **`artifact-design`**, **`artifact-diagramming`**, **`artifact-capabilities`**: before publishing
  any artifact, diagram or interactive page.

### 0.2.1a Rules beat guidelines, always

Two different kinds of instruction apply to frontend work, and they are not equals:

- **Brand rules** are §8.1.1 of this file. They are mandatory. They are not recommendations,
  preferences or one input among several, and nothing a skill says can relax them.
- **Skill guidelines** come from `ui-ux-pro-max`, `design`, `web-design-guidelines`,
  `writing-guidelines` and any other skill. They are advisory. Apply them only where they do not
  contradict a brand rule.

Order of precedence, highest first: **§8.1.1 brand rules → the rest of this file → skill
guidelines**. When a skill guideline contradicts a brand rule, the brand rule is simply the
requirement; there is no decision to make and nothing to trade off.

Known conflicts, where the skills say one thing and the brand requires another:

| Skill guideline | Brand rule that applies instead |
| --- | --- |
| Title Case for headings, buttons, nav and labels (`web-design-guidelines`, `writing-guidelines` nav labels) | Sentence case everywhere, including nav labels, legal page headings, diagram labels and `<title>` |
| Palettes, accent colours, gradients, glow, glassmorphism (`ui-ux-pro-max`, `design`, `banner-design`) | Monochrome Black and Apple Silver; chroma only for status; no gradients or glow |
| Font pairings, bold 700+ headings (`ui-ux-pro-max` weight hierarchy) | Geist only (plus the scoped `<Emphasis>` face); weights 400, 500 and 600 only |
| Shadows or elevation for depth | 1px borders and section fills; shadows only on true floating overlays |
| Pills and fully rounded buttons or badges | Radii 4, 6 and 8; `rounded-full` only on avatars |
| Live or status dots, pulsing indicators | A text label or a held border colour, never a dot |
| ALL CAPS eyebrows or tracking-heavy uppercase labels | Sentence case, no `uppercase` transform |
| Em or en dashes in copy | Commas, colons, parentheses or a new sentence |
| Emoji or glyph icons | `lucide-react` at `strokeWidth={1.5}` |

How to report it: never describe following a brand rule as "declining", "rejecting" or "not
implementing" a recommendation. That framing makes a mandatory rule sound optional. State the
rule that applied (for example, "headings use sentence case per §8.1.1") and **fix every existing
violation you find**; do not list a known brand violation as a follow-up when it can be fixed in
the same change. Report a genuine conflict that §8.1.1 does not settle to the user as a question.

In practice the palette and font-pairing halves of `ui-ux-pro-max` never apply here, while its
layout, density, component, animation and accessibility guidance does.

**Enforcement:** the marketing app's `npm run brand:check -- <origin>` crawls a running build and
fails on Title Case headings, buttons, links, labels and titles, em or en dashes in visible text,
ALL CAPS text, font weights above 600, and pill radii. It also resizes every page through 375, 768,
1024, 1280 and 1920 px and fails on sideways scrolling, naming the element that overflows. Run it with `seo:smoke` before any frontend
change is considered done.

### 0.2.2 Everything else: check first, then invoke

For **all** other work in this codebase (backend, infra, SDKs, CLI, tooling, docs, config), consult
the available-skills list before starting and invoke every skill that covers the task. The mapping
that applies most often:

| Task | Skill |
| --- | --- |
| Anything touching Claude, Anthropic models, the Messages API, agents, MCP, tool definitions, prompt caching, token counting | **`claude-api`** (read before opening the target file; never answer model or pricing questions from memory) |
| Questions about Claude Code itself, the Agent SDK, hooks, slash commands, plugins | **`claude-code-guide`** |
| Reviewing a diff, branch or PR for correctness and quality | **`code-review`** |
| Cleaning up reuse, complexity or efficiency in changed code | **`simplify`** |
| Security review of pending changes | **`security-review`** |
| Running or screenshotting the app to verify a change works | **`run`** |
| Settings, permissions, env vars, hooks, automated behaviours | **`update-config`** |
| Recurring tasks, cron agents, scheduled runs | **`loop`**, **`schedule`** |
| Presentations and slide decks | **`slides`** |
| Not sure a skill exists | **`find-skills`** |

If no skill matches, say so explicitly rather than assuming none applies. When a user asks a question
that a skill covers, invoking it is the answer, not optional extra work.

---

## 1. Language-Specific Toolchains & Stable Dependencies

### 1.1 Go

| Concern | Canonical Choice |
| --- | --- |
| HTTP server | `net/http` (stdlib) + `chi` v5 for routing |
| gRPC | `google.golang.org/grpc` v1.6x |
| Config | `github.com/spf13/viper` v2 |
| Logging | `go.uber.org/zap` v1.27+ |
| Metrics | `github.com/prometheus/client_golang` v1.19+ |
| DB/ORM | `pgx/v5` (Postgres); raw SQL + `sqlc` for type safety |
| Validation | `github.com/go-playground/validator/v10` |
| Testing | stdlib `testing` + `github.com/stretchr/testify` v1.9+ |
| Worker queues | `github.com/temporalio/sdk-go` v1.26+ |

- **Always** set `GOGC`, `GOMEMLIMIT`, and `GOMAXPROCS` explicitly for containerised workloads.
- **Never** use `init()` for side effects; use explicit initialisation in `main` or a `Bootstrap()` function.
- Use `context.Context` as the first argument of every function that performs I/O.
- Errors must be wrapped with `%w` and surfaced with enough context to locate the call site without a debugger.

### 1.2 Python

| Concern | Canonical Choice |
| --- | --- |
| HTTP server | `fastapi` ≥ 0.111 + `uvicorn[standard]` |
| Async | `asyncio` (stdlib) — no `gevent`, no `eventlet` |
| Data validation | `pydantic` v2 |
| Config | `pydantic-settings` v2 |
| Logging | `structlog` ≥ 24.x (JSON output) |
| DB (async) | `asyncpg` or `sqlalchemy[asyncio]` ≥ 2.0 |
| Vector DB | `qdrant-client` ≥ 1.9 |
| Cache | `redis[hiredis]` ≥ 5.x |
| Testing | `pytest` ≥ 8 + `pytest-asyncio` + `httpx` for async HTTP |
| Task queue | `temporalio` ≥ 1.6 |
| Packaging | `uv` for lock-file management; `pyproject.toml` only — no `setup.py` |

- **Type-annotate everything.** `mypy --strict` must pass before merge.
- Never use mutable default arguments. Never suppress `Exception` without re-raising or structured logging.
- All I/O must be `async`. Blocking calls inside `async` functions are a bug.

### 1.3 TypeScript / Node.js

| Concern | Canonical Choice |
| --- | --- |
| Runtime | Node.js LTS (≥ 22) |
| Framework | `fastify` ≥ 4 (APIs); `next.js` ≥ 14 (SSR/full-stack) |
| Validation | `zod` ≥ 3.22 |
| ORM | `drizzle-orm` ≥ 0.30 (preferred) or `prisma` ≥ 5 |
| Logging | `pino` ≥ 9 |
| State (React) | `zustand` ≥ 4 or React Server Components (RSC) |
| Styling | `tailwindcss` ≥ 3.4 — utility-first, no CSS-in-JS |
| Testing | `vitest` ≥ 1.6 + `@testing-library/react` |
| Dates | `date-fns` ≥ 3 (tree-shakable) — never `moment.js` |
| HTTP client | `fetch` (native) or `ky` — never `axios` for new code |

- Enable `strict: true` in `tsconfig.json`. No `any` without a `// UNSAFE:` comment explaining why.
- Use `satisfies` operator for object literals to preserve narrowed types.
- ESM only — no CommonJS in new projects.

### 1.4 Containerisation & Infrastructure

- Base images: `distroless` or `alpine` — never `ubuntu:latest` or `node:latest`.
- Multi-stage `Dockerfile`: build stage → test stage → minimal runtime stage.
- All secrets via environment variables or mounted secrets — never baked into images.
- Health endpoints: `GET /health/live` (liveness) and `GET /health/ready` (readiness). Both must return within 50 ms under load.

---

## 2. Architecture Principles

### 2.1 Service Boundaries

- Each service owns its data store. No cross-service DB joins.
- Communicate via gRPC (internal, typed) or events (Temporal / message bus) — never direct HTTP between backend services.
- Keep domain logic in the domain layer. HTTP handlers and gRPC interceptors are I/O adapters only.

### 2.2 Configuration

- All configuration via environment variables. Validate at startup and **fail fast** if required vars are missing.
- Use a typed config struct (Pydantic `BaseSettings`, `viper`, Zod-parsed `process.env`) — never raw `os.Getenv()` scattered through business logic.
- Separate `dev` / `staging` / `prod` configs. Never share credentials across environments.

### 2.3 Twelve-Factor Compliance

- Stateless processes. Session state in Redis, not in-process.
- Treat backing services (DB, cache, queue) as attached resources resolvable by URL/DSN.
- Export logs to stdout as JSON. Never write to files from application code.

---

## 3. Performance

### 3.1 Algorithmic Baseline

- State time complexity of non-trivial algorithms in a comment above the function.
- Prefer O(n log n) or better for any hot path processing > 1 000 items.
- Profile before optimising. Use `pprof` (Go), `py-spy` (Python), or `clinic.js` (Node) to identify real bottlenecks.

### 3.2 Database

- All queries must use **parameterised statements** — never string interpolation.
- Add indexes for every foreign key and every column that appears in a `WHERE` or `ORDER BY` on a table > 10 k rows.
- Use `EXPLAIN ANALYZE` on any query that touches > 10 k rows before shipping.
- Prefer batch inserts over row-by-row inserts. Prefer bulk reads over N+1 queries.
- Use connection pooling (`PgBouncer`, `pgx` pool, `asyncpg` pool). Set `max_connections` conservatively.

### 3.3 Caching

- Cache at the right layer: HTTP (`Cache-Control`), application (Redis), or query result.
- Always set a TTL. Never cache without an invalidation strategy.
- Cache misses must not cascade into thundering-herd DB load — use a **cache-aside with probabilistic early expiry** or a single-flight pattern.

### 3.4 Concurrency

- **Go**: Use `errgroup` for concurrent fan-out with coordinated cancellation. Always set a context deadline. Protect shared state with `sync.Mutex` or atomic operations — never raw channel hacks.
- **Python**: `asyncio.gather` with `return_exceptions=True`; use `asyncio.Semaphore` to bound concurrency against external services.
- **Node**: `Promise.all` / `Promise.allSettled` for fan-out; use a semaphore library (`p-limit`) to throttle.
- Set explicit concurrency limits on all worker pools, goroutine spawners, and task queues.

---

## 4. Error Handling

### 4.1 Principles

- **Errors are values.** Never ignore an error return. Every error must be handled or explicitly propagated.
- **Fail loudly at startup, gracefully at runtime.** Config errors = immediate panic. Request errors = structured error response.
- **No silent swallowing.** `catch(e) {}` and `_ = err` are bugs.

### 4.2 Error Structure

Every domain error must carry:

```text
code       — machine-readable string (e.g. "ERR_POLICY_VIOLATION")
message    — human-readable description
details    — structured map of contextual fields
request_id — correlation ID from the request context
```

`request_id` must be read from the **X-Request-Id** response header when handling HTTP calls (the server echoes back the ID it used internally). Every SDK client sets `X-Request-Id` on outbound requests using a fresh UUIDv7; when the server is missing the header, fall back to the client-generated value. The ID must be included on every raised exception so callers can stitch their logs against the server's without hunting through timestamps.

### 4.3 HTTP / gRPC Status Codes

- Map domain errors to correct HTTP 4xx/5xx codes and gRPC status codes deterministically.
- Never return HTTP 200 with an `"error"` field in the body.
- 5xx responses must never expose stack traces or internal system details.

### 4.4 Retries & Circuit Breaking

- All outbound network calls must have a retry policy: **exponential backoff with jitter**, max 3 attempts.
- Wrap downstream dependencies in a circuit breaker (`gobreaker`, `circuitbreaker` for Python, `opossum` for Node).
- Timeouts are mandatory on every outbound call. No open-ended waits.

---

## 5. Security

### 5.1 Input Validation

- Validate and sanitise **all** input at the service boundary — not just form fields, but headers, path params, query strings, and message payloads.
- Use allowlist validation (accept known-good) not denylist (reject known-bad).
- Maximum length limits on all string inputs. Reject oversized payloads at the HTTP layer before deserialization.

### 5.2 Authentication & Authorisation

- Verify JWTs with signature validation + expiry check on every request. Store public keys in a dedicated JWKS endpoint; rotate regularly.
- Authorisation checks must occur in the service, not just at the gateway.
- Apply the principle of least privilege to every service account and API key.
- Never log tokens, passwords, PII, or secrets. Use a structured log scrubber.
- **Next.js Server Components / Route Handlers:** use `auth()` from `@clerk/nextjs/server` and the server-only API client (`src/lib/api/server.ts`) rather than the browser client (`src/lib/api/client.ts`). The browser client requires the `useAuth()` React hook and cannot run in Node.js server contexts; using it in a Server Component silently falls back to unauthenticated requests. The server client injects the Clerk session token directly into the server-side fetch, avoids an unnecessary browser round-trip, and keeps credentials out of the client bundle.

### 5.3 Secrets Management

- Secrets in environment variables (12-factor) or a secrets manager (Vault, AWS Secrets Manager, GCP Secret Manager).
- **Never commit secrets to source control.** Pre-commit hooks (`gitleaks`, `truffleHog`) must be configured in every repo.
- Rotate secrets on any suspected exposure. Treat rotation as a routine operation, not an emergency.

### 5.4 Transport Security

- TLS 1.2 minimum; TLS 1.3 preferred. mTLS for all internal service-to-service communication.
- HSTS, `X-Content-Type-Options`, `X-Frame-Options`, and `Content-Security-Policy` headers on all HTTP responses.
- Rate-limit all public endpoints. Implement per-IP and per-token quotas.

### 5.5 Dependency Security

- Run `govulncheck` (Go), `pip-audit` (Python), or `npm audit` (Node) in CI. Block merges on HIGH/CRITICAL findings.
- Pin all transitive dependencies in lock files (`go.sum`, `uv.lock`, `package-lock.json`).
- Review changelogs before upgrading major versions of cryptographic or network libraries.

---

## 6. Resilience

### 6.1 Graceful Shutdown

Every process must:

1. Trap `SIGTERM` / `SIGINT`.
2. Stop accepting new work.
3. Drain in-flight requests (configurable grace period, default 30 s).
4. Close DB connections, flush logs, release locks.
5. Exit with code 0 on clean shutdown, non-zero otherwise.

### 6.2 Idempotency

- All write operations exposed via API or message queue must be idempotent.
- Use a client-supplied or server-generated idempotency key stored in the DB to deduplicate replayed requests.
- Temporal workflows are idempotent by design; leverage workflow IDs for deduplication.
- **Idempotency-key generation semantics (SDK callers):** auto-generation is *per call*, not per logical write. When implementing retry loops, pass the **same** key on every attempt; each `submit_task()` / `SubmitTask()` invocation that does not receive an explicit key generates a fresh UUIDv7 — retrying with a new key defeats deduplication. The generated key is echoed back on the response object so callers can capture it before the first retry.

### 6.3 Observability

- **Structured JSON logs** on stdout. Every log line must include: `timestamp`, `level`, `service`, `request_id`, `trace_id`, `message`, and relevant domain fields.
- **Standard log field schema (canonical, non-negotiable):** `service` (constant per service), `request_id` (X-Request-Id from the inbound call), `trace_id` (OTel traceparent[1]), `event` (machine-readable dotted name, e.g. `memory.context.retrieved`), plus domain identifiers (`agent_id`, `session_id`, etc.) as applicable. Use `bind_logger()` / `getLogger()` helpers rather than scattering ad-hoc kwargs — field names must not vary between files.
- **Metrics**: expose a `/metrics` Prometheus endpoint. Instrument: request rate, error rate, latency (p50/p95/p99), queue depth, and cache hit rate.
- **Traces**: propagate `traceparent` (W3C Trace Context) across all service boundaries. Use OpenTelemetry SDK — never vendor-specific instrumentation.
- **Alerts**: define SLOs. Alert on error budget burn rate using **multi-window, multi-burn-rate** rules (fast window 5 m × 1 h at 14.4× budget burn; slow window 30 m × 6 h at 6× burn). Raw error-rate threshold alerts (`error_rate > 1%`) are deprecated — they false-page on transient blips and miss sustained slow burns. See `infra/observability/prometheus/alert_rules.yml` for the canonical rule set.

### 6.4 Data Integrity

- Database migrations must be backwards-compatible and reversible. Use a migration tool (`goose`, `alembic`, `drizzle-kit`) — never apply manual SQL in production.
- Write integration tests that cover rollback scenarios.
- For financial or audit data: use append-only event tables; never `UPDATE` or `DELETE` financial records.

---

## 7. Testing Strategy

### 7.1 Test Pyramid

| Layer | Coverage Target | Tooling |
| --- | --- | --- |
| Unit | ≥ 80 % of business logic | per-language test framework |
| Integration | All repository + service adapter code | testcontainers |
| Contract | All gRPC/REST APIs | pact / buf breaking |
| E2E | Critical user journeys only | playwright |

### 7.2 Test Quality Rules

- Tests must be **deterministic**. Flaky tests are bugs; fix or delete them.
- No `time.Sleep` in tests — use test clocks, polling helpers, or event-driven synchronisation.
- No shared mutable state between test cases. Each test sets up and tears down its own state.
- Table-driven tests for any function with > 2 branches.
- Test error paths with the same rigour as happy paths.

### 7.3 CI Gates (nothing merges without passing)

1. `lint` — zero warnings at configured severity
2. `test` — full suite, race detector enabled (Go), `--forked` (Python), coverage threshold enforced
3. `security` — `govulncheck` / `pip-audit` / `npm audit` — no HIGH/CRITICAL
4. `build` — Docker image builds cleanly in multi-stage
5. `contract` — no breaking changes to published API schemas

---

## 8. Premium UI/UX Standards

### 8.1 Design Principles

- **Intentional aesthetics.** Every interface must have a clear, committed visual identity — not a generic template. Choose a design direction (brutalist, editorial, refined minimal, industrial, etc.) and execute it without compromise.
- **Typography first.** Select distinctive, characterful font pairs. Body text must be legible at all sizes. Line-height ≥ 1.5 for body copy. Never use Inter, Roboto, or Arial as the primary typeface.
- **Spatial hierarchy.** Information density must match user cognitive load. Use generous whitespace or controlled density — never accidental clutter.
- **Motion with purpose.** Animations must aid comprehension or delight — not distract. Staggered reveals on load, hover states that surprise, micro-interactions on state change. Respect `prefers-reduced-motion`.

#### 8.1.1 Actrone brand system — LOCKED (Black & Apple Silver)

The committed visual identity for **all** Actrone surfaces (marketing, docs, Control Tower,
marketplace, auth). Authoritative refs: `docs/branding.md` + `docs/design prompt.md`. This
**supersedes** the previous warm-grey + iOS-red identity. Non-negotiable:

- **Monochrome canvas.** Black & Apple-Silver. App canvas `#030303`, marketing hero `#000`, cards
  `#111111`, elevated `#121214`. Light mode is a faithful Apple-silver "paper" counterpart (white
  canvas, ink text) — both themes ship, including on docs.
- **Colour is a status vector, never decoration.** The silver/charcoal ramp carries the UI; chroma
  appears only for state: `--color-error #EF4444` (errors/destructive/critical ONLY),
  `--color-success #22C55E`, `--color-warning #F59E0B`, `--color-info #3B82F6` (links/info).
- **Red is for errors only.** No red CTAs, no red brand accents, no red gradients. **Primary
  button = white `#F5F5F7` on black**, text black, radius 6px, hover = inner-glow
  (`0 0 0 1px rgba(255,255,255,0.08)`).
- **No gradients. No shadows for separation.** Depth comes from **1px borders** (`#262629`) and
  alternating section fills. Shadows are permitted only on true floating overlays (menu/modal/
  popover) that need off-canvas depth.
- **Typography:** Geist (sans + mono) only — Space Grotesk is removed. Weights 400/500/600 only
  (never 700/800, never ≤300). One weight per role: headings (h1 to h6) 600; labels, buttons and
  navigation 500; body copy 400; mono labels 400. The heading default lives in `@layer base` in
  `globals.css`, so utilities can still set size, tracking and leading.
  **Sentence case everywhere** — no ALL CAPS, no Title-Case UI labels.
  **One named exception:** the `<Emphasis>` accent typeface (`@actrone/ui`, currently Big
  Shoulders), a structurally distinct face rather than a heavier Geist cut, may wrap a single
  emphasized word or short phrase inside a hero headline, a Studio/wizard step title, or a
  dashboard hero greeting only. Never body text, buttons, nav, or live/numeric data. Full scope
  and rationale: `docs/branding.md` section 4.2.1 and `docs/Actrone_Display_Typography_Plan.md`.
  This weight ceiling is otherwise unchanged and still applies to Geist everywhere, including
  every other heading.
- **Icons:** `lucide-react` only, `strokeWidth={1.5}` always (16 nav / 14 inline / 20 feature).
- **Radii:** sm 4 / md 6 / lg 8. `rounded-full` only on avatars and status dots.
- **Code:** full syntax highlighting on all code across the site, through `CodeBlock` (blocks) and
  `CodeLine` (one-line commands), both on the shared `CODE_THEMES` (Shiki `github-light-default`
  and `github-dark-default`, chosen because every token clears WCAG AA on the code surfaces). Owner decision, 2026-10-01: code is the one place hue appears outside status
  colours, because recognisable token colours make code faster to read. Inline code in prose
  stays monochrome.
- **Motion discipline:** no animated counters in Control Tower/Marketplace data (instant updates);
  alert = held border-colour change, never a flash/pulse. Signature marketing effects (Cognitive
  Grid, Beam Scan, Terminal Typewriter, Agent Trace Visualiser, Governance Score Ring, magnetic
  CTA, pinned scroll) are **marketing-only** and must honour `prefers-reduced-motion`.
- **No "live" status indicator dot.** Do NOT render a "Live"/online/active/streaming indicator as a
  dot, in either form: no **pulsating dot** (blinking, breathing, ping, ripple, glow) and no **static
  dot** either. Convey a live or active state with a clear **text label** (e.g. "live", "connected")
  or the held border-colour treatment above, never a coloured circle. Remove any existing live-dot
  component; `rounded-full` stays reserved for avatars only.
- **No em dashes.** Do NOT use the em dash (—) anywhere: UI copy, labels, docs, marketing, code
  comments, commit messages, or any prose Claude writes for this project. Do NOT substitute an en
  dash (–) as sentence punctuation either. Use a comma, a colon, parentheses, or split the sentence.
  (A hyphen in a compound word or a numeric range is fine.)

### 8.2 Component Standards

- **Accessibility first.** Every interactive element must have: correct ARIA roles, visible focus indicators, keyboard navigability, colour contrast ≥ 4.5:1 (WCAG AA), and meaningful `alt` text on images.
- **Responsive by default.** Mobile-first layout. Test at 375 px, 768 px, 1280 px, and 1920 px breakpoints.
- **Loading states are not optional, and content loads as a skeleton.** Every page, route `loading.tsx`, list, panel and dashboard that is waiting on data shows a skeleton shaped like what is coming (`PageLoading`, `SkeletonList`, `LoadingRegion` with `SkeletonText` or `SkeletonCard` from `@actrone/ui`), never a spinner. A spinner is only feedback for an action the user started, such as a submitting button. Skeleton bars are flat `--color-skeleton` fills with a gentle pulse that stops under reduced motion, never a gradient. Owner standard, 2026-10-07. A page prerendered at build time (docs, blog, use cases, legal) waits on nothing, so it gets **no route `loading.tsx`**: that boundary puts the page's content in a hidden streamed segment behind the fallback, which crawlers that skip JavaScript never see and slow connections show as a loading state until the whole document arrives. Wrap only the genuinely dynamic part in `<Suspense>` with a skeleton, as the homepage does for the Founding 500 panel. `seo:smoke` fails any sitemap page whose `<h1>` arrives in such a segment.
- **Error states are not optional.** Every form field, fetch call, and async action must have a designed error state — not a raw console error or blank space.
- **Empty states are not optional.** Every list, table, or data view must have a designed empty state.
- **Icons come from SVG libraries — never hardcoded emoji/glyphs.** Use the project's SVG icon system (`lucide-react` for UI glyphs, `IntegrationIcon` for provider/brand marks). Hardcoded emoji render inconsistently across platforms/fonts and break the brand. Where a target genuinely cannot render SVG (messaging-platform button labels, HTML email buttons that Gmail strips SVG from), use clean text labels and convey meaning through colour/style — not emoji.

### 8.3 Performance (Frontend)

- Core Web Vitals targets: LCP < 2.5 s, CLS < 0.1, INP < 200 ms.
- Images: use `next/image` or native `<img loading="lazy" decoding="async">`. Serve WebP/AVIF. Never ship unoptimised rasters.
- Fonts: `font-display: swap`. Subset fonts. Self-host or use a CDN — never block render on a third-party font load.
- Bundle: code-split at the route level. No synchronous imports of heavyweight libraries in the critical path.
- Prefer CSS animations over JS animations. Use `will-change` sparingly and intentionally.

### 8.4 Design Tokens (CSS Variables)

Every UI project must define a token layer at `:root`:

```css
/* Colour */
--color-bg, --color-surface, --color-border
--color-text-primary, --color-text-secondary, --color-text-muted
--color-accent, --color-accent-hover, --color-destructive

/* Typography */
--font-display, --font-body, --font-mono
--text-xs through --text-4xl (scale)
--leading-tight, --leading-normal, --leading-relaxed

/* Spacing */
--space-1 through --space-16 (4 px base grid)

/* Motion */
--duration-fast (100 ms), --duration-base (200 ms), --duration-slow (400 ms)
--ease-out, --ease-in-out, --ease-spring
```

Never hardcode colour values or spacing outside this token layer.

---

## 9. Code Style & Review Standards

### 9.1 Naming

- Names must be self-documenting. `ProcessInvoicePayment()` > `process()`.
- Boolean variables/functions: `is*`, `has*`, `can*`, `should*` prefix.
- Constants: `SCREAMING_SNAKE_CASE` (Python/JS/TS), `PascalCase` (Go exported constants).
- Avoid abbreviations unless universally understood in the domain (`id`, `url`, `ctx` are fine; `proc`, `dat`, `cfg` are not).

### 9.2 Function Design

- Single responsibility. If a function needs a comment to explain what it does, it should be two functions.
- Maximum cyclomatic complexity: 10. If exceeded, refactor.
- Functions longer than 50 lines are candidates for decomposition.
- All public APIs must have doc comments (godoc, docstrings, JSDoc). Include parameters, return values, and error conditions.

### 9.3 Comments

- Comment **why**, not **what**. The code says what; the comment explains the non-obvious why.
- `// TODO(username):` and `// FIXME(username):` must reference a ticket ID.
- `// UNSAFE:` comment required on any use of `unsafe`, `any`, `reflect`, or raw pointer arithmetic.

### 9.4 Git Discipline

- Commits follow Conventional Commits: `feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Each commit must be atomic and buildable. No "WIP" commits on main.
- PR titles are the merge commit message — make them meaningful.
- Squash-merge feature branches. Preserve merge commits only for release branches.

---

## 10. Project Structure Templates

### 10.1 Go Service

```text
/cmd/servicename/main.go       — entry point, flag parsing, bootstrap
/internal/
  config/                      — typed config structs
  domain/                      — pure business logic, no I/O
  repository/                  — DB access layer
  service/                     — use-case orchestration
  handler/                     — HTTP/gRPC adapters
  middleware/                  — auth, logging, tracing
/pkg/                          — exportable utility packages
/migrations/                   — SQL migration files (goose)
/proto/                        — .proto definitions
/scripts/                      — build, lint, migration scripts
Dockerfile
.golangci.yml
```

### 10.2 Python Service

```text
/src/packagename/
  __init__.py
  config.py                    — pydantic-settings BaseSettings
  domain/                      — pure business logic
  repositories/                — DB + vector store access
  services/                    — use-case orchestration
  api/
    routers/                   — FastAPI routers
    middleware/                — auth, logging, CORS
    schemas/                   — Pydantic request/response models
  workers/                     — Temporal workflow definitions
/tests/
  unit/
  integration/
  conftest.py
pyproject.toml
Dockerfile
```

### 10.3 TypeScript / Next.js App

```text
/src/
  app/                         — Next.js App Router pages
  components/
    ui/                        — primitive design-system components
    features/                  — domain-specific composite components
  lib/
    api/                       — typed API client
    db/                        — drizzle schema + queries
    auth/                      — auth helpers
  hooks/                       — custom React hooks
  stores/                      — zustand stores
  types/                       — shared TypeScript interfaces
/public/                       — static assets
/migrations/                   — drizzle migrations
tailwind.config.ts
tsconfig.json
Dockerfile
```

---

## 11. Checklist — Before Any Output Leaves This Context

Claude must internally verify every item before emitting code or documentation:

- [ ] Every applicable skill invoked (§0.2). Frontend work ran `ui-ux-pro-max` + `design` before
      coding and `web-design-guidelines` as an audit pass; where a skill guideline conflicts with
      §8.1.1, the brand rule was applied as a requirement (§0.2.1a), not reported as a declined
      recommendation
- [ ] Brand rules hold on the rendered site: `npm run brand:check -- <origin>` passes, and every
      brand violation found during the work was fixed rather than listed as a follow-up
- [ ] All error paths handled and tested
- [ ] No hardcoded secrets, credentials, or environment-specific values
- [ ] Input validation present at all entry points
- [ ] Context/timeout propagated through all I/O calls
- [ ] Concurrency limits set on all worker / goroutine / promise pools
- [ ] Retries with backoff + jitter on all outbound calls
- [ ] Graceful shutdown implemented
- [ ] Idempotency key present on all write endpoints
- [ ] Structured JSON logging with correlation ID
- [ ] Dependencies pinned to stable, maintained versions
- [ ] Tests cover happy path AND error paths AND edge cases
- [ ] Public functions have doc comments
- [ ] No TODOs unless accompanied by a ticket reference
- [ ] Accessibility requirements met for any UI output
- [ ] Loading, error, and empty states designed for any UI output
- [ ] Design tokens used — no hardcoded colours or spacing in UI output

If any item cannot be checked, Claude must explicitly note it and explain the constraint.

---

Last updated: 2026-05 | Owner: Matt | Scope: all projects in this workspace
