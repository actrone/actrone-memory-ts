# Actrone — Engineering Documentation

> **The LLM is just a CPU. Production AI agents need an operating system.**
>
> Actrone is the infrastructure layer that makes AI agent pipelines reliable,
> cost-efficient, and governable at scale — just as an operating system makes raw
> CPU cycles useful.
>
> **Status refreshed 2026-07-13 (code-verified):** Two corrections to the diagram/table below:
> (1) **Auth is WorkOS (AuthKit, managed) + generic OIDC (self-hosted), not Clerk** — Clerk was fully
> removed from the codebase (`docs/Actrone_WorkOS_Auth_Switch_Plan.md`; zero `clerk` refs in
> `frontend/`, verified by grep). (2) **The service mesh is Linkerd, not Istio** — `infra/helm/actrone/charts/linkerd/Chart.yaml`
> states outright "Linkerd replaces the retired Istio+SPIRE charts" (Infra plan §1.3); there is no
> SPIFFE/SPIRE/ztunnel in the current infra. (3) The Go SDK client shown next to the Python SDK was
> **removed from the family 2026-07-05** — the two client SDKs are TS + Python (CLAUDE.md §0.1).
> (4) `backend/orchestrator/go.mod` pins `go 1.24` (not 1.23); `backend/marketplace` is still on 1.23
> and `backend/voiceagent` requires 1.26 as a separate module — versions are per-module, not uniform.

---

## Table of Contents

| # | Guide | Audience |
|---|---|---|
| 01 | [Architecture Overview](01-architecture.md) | All engineers |
| 02 | [Local Development Setup](02-local-dev.md) | All engineers |
| 03 | [Authentication & Identity](03-auth.md) | Backend, Security |
| 04 | [Service Communication](04-communication.md) | Backend, Infrastructure |
| 05 | [Zero-Trust Network Security](05-security.md) | Infrastructure, Security |
| 06 | [Backend Go Service Guide](06-backend.md) | Backend engineers |
| 07 | [Frontend Control Tower Guide](07-frontend.md) | Frontend engineers |
| 08 | [Observability: PostHog + Sentry](08-observability.md) | All engineers |
| 09 | [Infrastructure & Deployment](09-infra.md) | Infrastructure engineers |
| 10 | [On-Call Runbook](10-runbook.md) | On-call engineers |

---

## Platform at a Glance

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ACTRONE PLATFORM                             │
│                                                                         │
│   ┌──────────────────────┐         ┌──────────────────────────────┐    │
│   │   Control Tower UI   │         │        SDK Clients           │    │
│   │   (Next.js 16.2)     │         │   Python SDK  │  TS SDK      │    │
│   │   WorkOS/OIDC Auth   │         │   gRPC + Protobuf            │    │
│   └──────────┬───────────┘         └──────────────┬───────────────┘    │
│              │ REST + WebSocket                    │ gRPC :50051        │
│              │ :8080                               │                    │
│   ┌──────────▼─────────────────────────────────────▼───────────────┐   │
│   │                   Go Orchestrator Binary                        │   │
│   │                                                                 │   │
│   │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐   │   │
│   │  │ HTTP (chi)  │  │ gRPC server  │  │ WebSocket Broker   │   │   │
│   │  │ WorkOS/OIDC │  │  Auth Intcpt │  │ + NATS bridge      │   │   │
│   │  │  API Keys   │  │              │  │                    │   │   │
│   │  └──────┬──────┘  └──────┬───────┘  └────────┬───────────┘   │   │
│   │         └────────────────┼──────────────────── ┤              │   │
│   │                          │ service layer        │              │   │
│   │  ┌───────────┐  ┌────────▼────────┐  ┌─────────▼──────────┐  │   │
│   │  │ Governance│  │ Model Router    │  │ Context Manager    │  │   │
│   │  │ Rules Eng │  │ OpenAI/Anthro.  │  │ Redis L1 + Qdrant  │  │   │
│   │  │ Audit Eng │  │ Circuit Breaker │  │ L2 semantic memory │  │   │
│   │  └───────────┘  └─────────────────┘  └────────────────────┘  │   │
│   └──────────┬───────────────────────────────────────┬────────────┘   │
│              │ Temporal SDK                           │ NATS.go         │
│   ┌──────────▼────────────┐              ┌────────────▼──────────┐    │
│   │  Temporal Workflows   │              │  NATS JetStream       │    │
│   │  AgentTaskWorkflow    │              │  MACP coordination     │    │
│   │  SpawnSubAgentWorkflow│              │  Telemetry fan-out     │    │
│   │  Durable replay       │              │  Analytics bridge      │    │
│   └───────────────────────┘              └───────────────────────┘    │
│                                                                         │
│   ┌───────────┐ ┌──────────┐ ┌────────────┐ ┌────────────────────┐   │
│   │ PostgreSQL│ │  Redis   │ │   Qdrant   │ │ Sentry Relay (K8s) │   │
│   │ Identity  │ │  L1 hot  │ │  L2 vector │ │ PostHog EU Cloud   │   │
│   │ Tasks     │ │  memory  │ │  memory    │ │ Prometheus / OTel  │   │
│   └───────────┘ └──────────┘ └────────────┘ └────────────────────┘   │
│                                                                         │
│   ━━━━━━━━━━━━━━━━━━━━━ Linkerd mesh (automatic mTLS) ━━━━━━━━━━━━━━━  │
│    Linkerd CA identity · default-deny inbound · AuthorizationPolicy    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Five Core Services Every Engineer Must Understand

| Service | Role | Language | Port |
|---|---|---|---|
| **Orchestrator** | API gateway, Temporal worker, analytics bridge | Go 1.24 | 8080 (REST), 50051 (gRPC) |
| **Control Tower** | Developer dashboard, auth flows, settings | Next.js 16.2 | 3000 (dev), 443 (prod) |
| **Temporal** | Durable workflow execution, agent state machine | External | 7233 |
| **NATS JetStream** | Event streaming, MACP coordination, analytics | External | 4222 |
| **PostgreSQL 16** | Identity mirror, tasks, violations, audit | External | 5432 |

---

## Non-Negotiable Engineering Standards

These rules apply to every PR. No exceptions.

```
✓  CLAUDE.md §0–11 compliance is checked on every PR
✓  No hardcoded secrets, credentials, or environment values
✓  All SQL uses parameterised statements
✓  All context.Context propagated through every I/O call
✓  Errors wrapped with %w and surfaced with call-site context
✓  No TODOs without a ticket reference
✓  go build ./... passes with zero warnings
✓  tsc --noEmit passes with strict: true
```
