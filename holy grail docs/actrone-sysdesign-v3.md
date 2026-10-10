# Actrone — System Design Document
### The Cognitive Kernel for Production AI Agents
**Version:** 3.0.0  
**Classification:** Internal Engineering  
**Authors:** Engineering Team  
**Last Updated:** 2026  

> **Status refreshed 2026-07-13 (code-verified):** This is a foundational/narrative system-design
> doc, not a build ledger — §22's v0.1→v3.0 roadmap and §23 pricing describe the *original plan*,
> and the shipped platform has diverged and expanded well beyond it (see `progress.md` and the
> plan-status-audit trail in memory for the current build state; not re-verified line-by-line here).
> Two concrete corrections applied this pass: (1) **the Go client SDK is REMOVED from the family**
> (deleted 2026-07-05 — CLAUDE.md §0.1) — all "Python & Go SDKs" / `go get github.com/actrone/actrone-go`
> references below are corrected to **Python & TypeScript SDKs** (`@actrone/sdk`); the Go
> *Orchestrator* (backend service) is unaffected and still real. (2) A second, partially-diverged
> copy of this file exists at `backend/docs/actrone-sysdesign-v3.md` — it had already fixed the §6.3
> SDK section but not the other Go-SDK mentions fixed here; the two copies should be reconciled by
> whoever owns `backend/docs/`. Auth references elsewhere in this doc are generic/architectural and
> were not found to name Clerk. Everything else in this 2065-line doc (diagrams, API spec, schema,
> security model) reflects the design as originally written and is **unverified 2026-07-13** against
> current code beyond the SDK fixes above — treat deep implementation claims here as directional,
> not current-state.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What Is Actrone — The Complete Picture](#2-what-is-actrone--the-complete-picture)
3. [Problem Statement & Pain Points](#3-problem-statement--pain-points)
4. [Goals & Non-Goals](#4-goals--non-goals)
5. [How Actrone Compares to LangGraph & CrewAI](#5-how-actrone-compares-to-langgraph--crewai)
6. [How Developers Use Actrone — Product Layers](#6-how-developers-use-actrone--product-layers)
7. [System Architecture — Complete Design](#7-system-architecture--complete-design)
8. [Architecture Deep Dive — Every Component](#8-architecture-deep-dive--every-component)
9. [The Go / Python Boundary — How It Works](#9-the-go--python-boundary--how-it-works)
10. [LangChain, LangGraph & CrewAI Integrations](#10-langchain-langgraph--crewai-integrations)
11. [Data Flow & Sequence Diagrams](#11-data-flow--sequence-diagrams)
12. [Production Tech Stack](#12-production-tech-stack)
13. [API Specification](#13-api-specification)
14. [Agent-File Schema](#14-agent-file-schema)
15. [Memory Architecture](#15-memory-architecture)
16. [Multi-Agent Coordination Protocol](#16-multi-agent-coordination-protocol)
17. [AI Governance Engine — The AI Auditor](#17-ai-governance-engine--the-ai-auditor)
18. [Security Model](#18-security-model)
19. [Observability & Control Tower UI](#19-observability--control-tower-ui)
20. [Failure Modes & Resilience](#20-failure-modes--resilience)
21. [Scalability & Performance](#21-scalability--performance)
22. [Product Versioning & Release Roadmap](#22-product-versioning--release-roadmap)
23. [Monetisation & Pricing Architecture](#23-monetisation--pricing-architecture)
24. [Open Questions & Future Work](#24-open-questions--future-work)

---

## 1. Executive Summary

Actrone is a production-grade infrastructure platform that treats the Large Language Model (LLM) as a non-deterministic CPU and provides the "Operating System" services required to make AI agent pipelines reliable, cost-efficient, observable, and governable at scale.

It is **not** a framework for writing agents. Frameworks — LangGraph, CrewAI, AutoGen — help developers define what an agent does. Actrone is the infrastructure that makes agents work reliably in production: durable execution, hierarchical memory, secure tool sandboxing, multi-model routing, spend controls, and real-time observability. It is the layer those frameworks run on top of.

The system is consumed in four ways, unlocked progressively:

1. **Open Source Memory Manager** — a standalone Python library (MIT licence) that solves the single most complained-about problem in AI development: long-term agent memory. This is the developer wedge.
2. **Python & TypeScript SDKs** — thin clients that talk to the hosted Orchestrator. Drop into existing LangChain, LangGraph, and CrewAI projects with one line of code. *(Corrected 2026-07-13: a Go client SDK previously shipped here was removed from the family — see CLAUDE.md §0.1 / `docs/Actrone_Go_SDK_Removal_Plan.md`. The Go Orchestrator itself, referenced below, is the backend service and is unaffected.)*
3. **Hosted Platform (actrone.com)** — fully managed cloud infrastructure. Usage-based pricing. The SDK talks here by default.
4. **Self-Hosted Enterprise** — a Helm chart that deploys the complete stack into the customer's own Kubernetes cluster. Annual licence. Zero data leaves their infrastructure.

The Go Orchestrator is the engine. Python is the developer interface. The two communicate over gRPC. Developers never see Go — they see a clean, Pythonic SDK that feels like every other library in their AI stack.

A fifth major pillar ships in v1.0: the **AI Governance Engine** — a meta-intelligence layer that audits every agent action against configurable rules, laws, and standards; maintains a tamper-proof violation ledger; detects hallucinations with evidence; and closes the feedback loop automatically by generating correction examples and submitting fine-tuning jobs when violation thresholds are reached. No equivalent system exists in the market today.

---

## 2. What Is Actrone — The Complete Picture

### 2.1 The One-Paragraph Explanation

Every company building with AI agents is rebuilding the same infrastructure from scratch: a way to persist memory across sessions, a way to recover when a model provider goes down, a way to stop an agent from spending $3,000 in a weekend loop, a way to see what an agent actually did and why. Actrone builds that infrastructure once, correctly, and makes it available as managed cloud infrastructure and open-source libraries so teams can focus on what their agents do rather than on keeping them alive.

### 2.2 The Operating System Analogy — In Detail

The name is precise, not metaphorical. Classical operating systems exist because applications should not have to manage their own hardware resources, process scheduling, memory allocation, and I/O — the OS abstracts those concerns so applications can focus on their logic. LLMs create the same need at the AI application layer.

| Classical OS | Actrone Equivalent | Why It Matters |
|---|---|---|
| CPU | LLM (non-deterministic processor) | The model is the compute unit |
| Kernel Space | Orchestrator + Context Manager + Abstraction Layer + Supervisor | Infrastructure the agent runs on |
| User Space | Agent-File + Agent Logic | What the developer writes |
| RAM — L1 Cache | Redis — hot session memory | Fast, short-lived context |
| Disk — L2 Storage | Vector DB — long-term episodic memory | Persistent, semantically searchable history |
| Process Scheduler | Temporal Workflow Engine | Durable task execution and recovery |
| System Calls | Tool-Call Supervisor (validated API calls) | Secure, audited external actions |
| Process Config File | Agent-File (YAML manifest) | Declarative, version-controlled agent definition |
| Process Monitor | Control Tower UI | Real-time observability and debugging |
| Package Manager | Agent Marketplace (v3) | Shareable, reusable agent configurations |

### 2.3 What Makes This Different From a Framework

A framework is a library you import. It gives you abstractions and patterns for writing code. When you import LangGraph, you get a graph data structure and some utilities for connecting agent steps. When something goes wrong at 3am, LangGraph has no opinion — your agent dies and you find out later.

Actrone is a **runtime**. It runs alongside your application (or in your cloud) and actively manages the lifecycle of your agents: checkpointing their progress, routing their model calls, managing their memory, validating their tool calls, tracking their costs. It is running code on your behalf, not patterns you copy.

The closest analogy is the difference between the Flask web framework (which gives you routing patterns) and Kubernetes (which actively manages your application's deployment, health, and scaling). You need both. They serve different purposes.

### 2.4 The Target Developer

**Primary:** AI/ML engineers and backend engineers at companies running agents in production or planning to. They have already built something with LangChain, LangGraph, or CrewAI, hit the pain points (memory fails, no recovery from crashes, can't debug, agents run up costs), and are looking for production-grade infrastructure.

**Secondary:** Enterprises in regulated industries (financial services, healthcare, government) that need agent governance, audit trails, spend controls, and data residency — capabilities the frameworks do not provide.

**Tertiary:** Startups building agent-native products (research tools, automation platforms, AI assistants) who want to build on solid infrastructure from day one rather than bolt it on later.

---

## 3. Problem Statement & Pain Points

### 3.1 The Core Problem

Every AI developer is building a bespoke operating system for their agents. Without shared infrastructure, each team solves the same six problems independently, inconsistently, and at great cost. The result is fragile, expensive, and impossible to debug in production.

### 3.2 Pain Point 1 — No Persistent Memory

LLMs are stateless by design. A 128k token context window sounds large until you have an agent that accumulates conversation history, tool results, and retrieved documents across multiple sessions. Teams work around this with ad-hoc solutions: dumping raw history into the prompt (expensive, hits the limit anyway), or building custom Vector DB integrations (time-consuming, poorly tuned, no standard retrieval algorithm). Neither approach is production-ready.

**Impact:** Agents hallucinate because they forgot a decision made three sessions ago. Long-horizon tasks fail because context is truncated silently. Users lose trust when the agent asks for information it was already given.

### 3.3 Pain Point 2 — No Durable Execution

If a model provider has an outage mid-task — and all of them do — the entire agent task is lost. If an agent enters an infinite reasoning loop, it keeps running until someone notices the cost spike or the request times out. There is no standard mechanism to checkpoint progress, resume from failure, or kill runaway agents gracefully.

**Impact:** Data loss on multi-step tasks. Wasted GPU spend on loops. Degraded user experience. A research agent 40 steps into a 50-step task starts over because OpenAI had a 10-minute outage.

### 3.4 Pain Point 3 — Vendor Lock-In at the Model Layer

Most agent frameworks are practically coupled to a single model provider. CrewAI works best with OpenAI. Switching to Mistral for cost reduction, or routing simpler tasks to Groq for speed, or using a local Ollama model for PII-sensitive operations requires rewriting agent logic. There is no standard routing layer.

**Impact:** Inability to optimise cost/quality tradeoffs. No resilience when a provider has an outage. Unable to respond to market changes in model pricing or capability.

### 3.5 Pain Point 4 — Uncontrolled Tool Calls

Agents that can call external APIs (Stripe, Salesforce, internal microservices, web search) have no security boundary. There is no schema validation before calls fire. No per-agent rate limits. No daily spend caps. No parameter sanitisation. No audit trail. A single agent in a loop can make thousands of Stripe API calls before anyone notices.

**Impact:** Financial damage (accidental charges, API costs). Data corruption in downstream systems. Security incidents from prompt injection via tool results. Inability to pass enterprise security reviews.

### 3.6 Pain Point 5 — No Observability

When an agent produces wrong output, there is no standard way to trace why. Was it a bad memory retrieval? A hallucinated tool call? A model that ignored its instructions? Developers dig through raw API logs manually. There is no visualisation of reasoning chains, no cost attribution per task, and no way to see which memory was retrieved and whether it was relevant.

**Impact:** Debugging takes days. Regressions are invisible until production. It is impossible to improve agent quality systematically without understanding what went wrong.

### 3.7 Pain Point 6 — Agent Configuration is Imperative Code

Agent personality, allowed tools, memory policies, and spend limits are hardcoded in Python files. There is no declarative configuration standard. You cannot diff an agent change, review it in a PR, roll it back safely, or deploy different versions to staging vs production.

**Impact:** Configuration drift. Accidental production changes. No governance over what agents are allowed to do. Legal and compliance teams cannot review agent behaviour.

---

## 4. Goals & Non-Goals

### 4.1 Goals

| # | Goal | Success Metric |
|---|------|----------------|
| G1 | Durable task execution — no task loss on failure | Zero task loss on provider outage; resume within 30s |
| G2 | Unified model provider API — zero code changes to swap providers | Agent runs unchanged on GPT-4, Claude, Mistral, Llama-3 |
| G3 | Hierarchical memory — relevant context in budget | Context retrieved in < 50ms P99; no silent truncation |
| G4 | Secure tool sandboxing — no agent exceeds configured limits | 100% of tool calls pass Supervisor before execution |
| G5 | Real-time observability — full thought chain visible | Trace complete within 200ms of generation |
| G6 | Declarative agent configuration via Agent-File | All agent behaviour defined in versioned YAML; no runtime surprises |
| G7 | 100+ concurrent agents with < 5% latency regression | Goroutine-per-agent model; horizontal scaling |
| G8 | 99.9% uptime via multi-provider failover | Automatic failover with < 30s recovery |
| G9 | Drop-in integration with LangChain, LangGraph, CrewAI | Integration requires changing ≤ 3 lines of existing code |
| G10 | Multi-agent coordination protocol | Agents can spawn, message, and synchronise with sub-agents |

### 4.2 Non-Goals

- **Not a training or fine-tuning platform.** Operates entirely at inference time.
- **Not a model hosting service.** Consumes third-party model APIs.
- **Not a chat UI for end users.** The Control Tower is an engineering observability tool.
- **Not a replacement for application business logic.** Agents still need to be programmed with purpose.

---

## 5. How Actrone Compares to LangGraph & CrewAI

### 5.1 The Fundamental Distinction

LangGraph and CrewAI are **frameworks** — libraries you import into your Python code that give you patterns and abstractions for writing agents. Actrone is **infrastructure** — a runtime that actively manages your agents' execution, memory, security, and observability. You need both; they serve different purposes.

The analogy: Flask is a framework for writing web applications. Kubernetes is infrastructure for running them reliably in production. You can use Flask without Kubernetes (for hobby projects). You cannot run production web applications at scale without both. The same relationship applies here.

### 5.2 Feature Comparison

| Capability | LangGraph | CrewAI | AutoGen | **Actrone** |
|---|---|---|---|---|
| Workflow definition | Graph (Python code) | Roles/Crews (Python code) | Conversations (Python code) | Agent-File (YAML) + Temporal |
| Multi-agent coordination | Basic | Yes (crews) | Yes (group chat) | Yes + MACP protocol |
| Tool use | Yes | Yes | Yes | Yes + Supervisor |
| Session memory | Basic | Basic | Basic | Redis L1 (managed) |
| Long-term memory | DIY | DIY | DIY | Qdrant L2 (managed) |
| **Durable execution** | **No** | **No** | **No** | **Yes (Temporal)** |
| **Multi-model routing** | **Manual** | **Manual** | **Manual** | **Automatic** |
| **Spend controls** | **No** | **No** | **No** | **Yes** |
| **Real-time observability** | LangSmith (paid add-on) | None | None | **Control Tower (built-in)** |
| **Audit trail** | **No** | **No** | **No** | **Yes (immutable)** |
| **Declarative config** | **No** | **No** | **No** | **Yes (Agent-File)** |
| Managed cloud | No | No | No | Yes (actrone.com) |
| Self-hosted enterprise | Yes | Yes | Yes | Yes (Helm chart) |
| LangChain compatible | Native | Partial | Partial | Drop-in integration |
| Production-ready OOTB | No | No | No | Yes |

### 5.3 The Positioning

Actrone enters the market as a **complement** to these frameworks, not a replacement. The Memory Manager and SDK integrate into existing LangGraph and CrewAI projects with minimal code changes. This maximises adoption speed.

Over time, as the ecosystem matures, Actrone becomes the complete alternative for teams building new projects — providing everything LangGraph and CrewAI provide, plus production reliability built in from day one.

The developers who switch fastest are not beginners. They are engineers who already built something on LangGraph, got it into production, and are now dealing with agents that lose memory, crash without recovery, burn money in loops, and produce errors they cannot trace.

---

## 6. How Developers Use Actrone — Product Layers

### 6.1 The Four Layers

Actrone is consumed through four progressive layers, each targeting a different user type and maturity level.

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 4 — ENTERPRISE SELF-HOSTED                            │
│  Helm chart deployment into customer's Kubernetes cluster    │
│  Full stack: Orchestrator, Redis, Qdrant, Temporal, UI       │
│  Annual licence · Air-gap capable · SOC 2 / ISO 27001        │
│  Target: Banks, telcos, regulated industries, governments    │
├──────────────────────────────────────────────────────────────┤
│  LAYER 3 — HOSTED PLATFORM (actrone.com)                    │
│  Fully managed cloud · Usage-based pricing                   │
│  SDK points at hosted Orchestrator API                       │
│  Control Tower dashboard · Multi-tenant                      │
│  Target: Startups, scale-ups, AI engineering teams           │
├──────────────────────────────────────────────────────────────┤
│  LAYER 2 — PYTHON & TYPESCRIPT SDK                            │
│  pip install actrone · npm install @actrone/sdk              │
│  Thin gRPC client → hosted or self-hosted Orchestrator       │
│  LangChain / LangGraph / CrewAI integrations built-in        │
│  Target: Individual developers, existing agent projects       │
├──────────────────────────────────────────────────────────────┤
│  LAYER 1 — OPEN SOURCE MEMORY MANAGER                        │
│  pip install actrone-memory · MIT licence                  │
│  Pure Python · Runs locally · No cloud account needed        │
│  Redis L1 + Qdrant L2 · Drop-in for LangChain               │
│  Target: All AI/ML developers · Community wedge              │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Layer 1 — Open Source Memory Manager

The Memory Manager is a standalone, pure Python library released under the MIT licence. It requires no Actrone account and no cloud connectivity. Developers point it at their own Redis and Qdrant instances (both have free Docker setups) and get production-grade two-tier memory immediately.

```python
pip install actrone-memory
```

```python
from actrone_memory import MemoryManager

mem = MemoryManager(
    redis_url="redis://localhost:6379",
    qdrant_url="http://localhost:6333",
    agent_id="research-bot",
    embedding_model="text-embedding-3-small"
)

# Retrieve context for a new turn — handles Redis L1 + Qdrant L2 automatically
context = await mem.retrieve(
    query="What did the Fed decide about interest rates?",
    token_budget=4000
)

# Commit after the LLM responds
await mem.commit(
    user_message="What did the Fed decide?",
    assistant_message="The Fed held rates steady at...",
    metadata={"task_id": "tsk_abc123"}
)

# Search what the agent knows
memories = await mem.search("Federal Reserve", limit=10)

# Delete a memory causing hallucinations
await mem.delete("mem_88ff92")
```

**Why this is the wedge:** Long-term memory is the single most complained-about problem in every AI developer community. A library that solves it in three lines, works with any framework, and requires no account gets GitHub stars and word-of-mouth growth before any marketing budget is spent.

**The conversion path:** Once a developer has deployed the Memory Manager in production, they want managed infrastructure (they don't want to run Redis and Qdrant themselves at scale). They add one config line and move to the hosted platform.

```python
# Local mode — no account needed
mem = MemoryManager(redis_url="...", qdrant_url="...")

# Cloud mode — managed infrastructure, same interface
mem = MemoryManager(api_key="act_live_abc123")
```

### 6.3 Layer 2 — Python & TypeScript SDKs

The SDK is a thin gRPC client that talks to the hosted (or self-hosted) Orchestrator. It exposes the full Actrone capability set — not just memory, but durable execution, multi-model routing, tool supervision, and observability — through a clean, Pythonic interface.

```python
pip install actrone
```

```python
from actrone import Agent

# Agent defined declaratively in a YAML file
agent = Agent.from_file("agents/research-agent.yaml")

# Run synchronously
result = agent.run(
    "Summarise Q3 earnings for NVDA, MSFT, AAPL",
    session_id="ses_abc123"
)
print(result.output)
print(f"Cost: ${result.cost_usd:.4f}")

# Stream tokens as they arrive
async for token in agent.stream("What happened in AI this week?"):
    print(token.delta, end="", flush=True)

# Run a crew of agents
from actrone import Crew
crew = Crew(
    agents=["agents/researcher.yaml", "agents/analyst.yaml", "agents/writer.yaml"],
    goal="Produce a detailed report on Q3 AI infrastructure spending",
    process="hierarchical"
)
result = await crew.run()
```

**TypeScript SDK** (`@actrone/sdk`) for JS/TS teams:

```bash
npm install @actrone/sdk
```

```ts
import { ActroneClient } from "@actrone/sdk";

const client = new ActroneClient({ apiKey: process.env.ACTRONE_API_KEY! });

const stream = await client.streamTask({
  agentId: "research-agent",
  input: { query: "Summarise NVDA Q3 earnings" },
});
for await (const event of stream) {
  if (event.type === "token") process.stdout.write(event.delta);
}
```

<!-- Historical: a Go client SDK example previously appeared here. The Go SDK was
     removed from the family (CLAUDE.md §0.1); the two client SDKs are TS + Python. -->

### 6.4 Layer 3 — Hosted Platform

When developers add their API key, the SDK routes all requests to the hosted Orchestrator at `api.actrone.com`. The developer gets:

- A managed Redis cluster for L1 session memory
- A managed Qdrant namespace for L2 long-term memory
- A Temporal tenant for durable workflow execution
- Multi-provider model routing (bring your own OpenAI/Anthropic keys, or use ours)
- The Control Tower dashboard at `app.actrone.com`
- Real-time trace streaming, cost attribution, memory explorer

No infrastructure to manage. No Temporal to configure. No Redis to tune. Everything is handled.

### 6.5 Layer 4 — Self-Hosted Enterprise

For enterprises that cannot send agent workloads to a third-party cloud (regulated industries, air-gapped environments, data sovereignty requirements), the entire stack deploys into their Kubernetes cluster via a single Helm chart.

```bash
helm repo add actrone https://charts.actrone.com
helm install actrone actrone/actrone \
  --set license.key="ent_xyz123" \
  --set global.region="af-south-1" \
  --set vault.enabled=true
```

This deploys: Go Orchestrator workers, Redis cluster, Qdrant instance, Temporal workers, PostgreSQL for audit/config, NATS JetStream, and the Control Tower UI. All within the customer's cluster. No data leaves their infrastructure.

Their developers use the identical SDK and Agent-Files — just pointing at an internal URL:

```python
agent = Agent.from_file("agent.yaml",
    base_url="https://actrone.internal.company.com"
)
```

Same developer experience. Zero cloud dependency.

---

## 7. System Architecture — Complete Design

### 7.1 Full Architecture Diagram

```
╔═════════════════════════════════════════════════════════════════════╗
║                    DEVELOPER / CLIENT LAYER                         ║
║                                                                     ║
║   Python SDK          TypeScript SDK  REST API         CLI          ║
║   (pip install)       (npm install)   (curl)           (actrone)  ║
╚═════════════════════════════╤═══════════════════════════════════════╝
                              │  gRPC / HTTP
                              ▼
╔═════════════════════════════════════════════════════════════════════╗
║              ORCHESTRATOR API GATEWAY (Go)                          ║
║   Auth · Rate Limiting · Request Routing · WebSocket Manager        ║
╚══════════════╤══════════════╤══════════════╤═════════════════════════╝
               │              │              │
     ┌─────────▼──────┐ ┌─────▼──────┐ ┌───▼──────────────┐
     │ TASK           │ │  MACP       │ │  STREAMING       │
     │ ORCHESTRATOR   │ │  COORDINATOR│ │  GATEWAY         │
     │ (Temporal)     │ │  (Multi-    │ │  (NATS +         │
     │                │ │  Agent)     │ │  WebSocket)      │
     └────────┬───────┘ └─────┬──────┘ └──────────────────┘
              │               │
    ┌─────────▼───────────────▼──────────────────────────────┐
    │              KERNEL SPACE                               │
    │                                                         │
    │  ┌─────────────────┐  ┌─────────────────┐              │
    │  │ CONTEXT MANAGER │  │ ABSTRACTION     │              │
    │  │                 │  │ LAYER           │              │
    │  │ Sliding Window  │  │                 │              │
    │  │ Token Budget    │  │ GPT-4o          │              │
    │  │ Relevance Score │  │ Claude 3.5      │              │
    │  │ Async Write-back│  │ Mistral Large   │              │
    │  └────────┬────────┘  │ Llama-3 (Groq)  │              │
    │           │           │ Ollama (local)  │              │
    │  ┌────────▼────────┐  └─────────────────┘              │
    │  │ MEMORY SYSTEM   │                                    │
    │  │                 │  ┌─────────────────┐              │
    │  │ L1: Redis       │  │ TOOL-CALL       │              │
    │  │ (hot, < 1ms)    │  │ SUPERVISOR      │              │
    │  │                 │  │                 │              │
    │  │ L2: Qdrant      │  │ Schema Validate │              │
    │  │ (cold, ~10ms)   │  │ Permission Check│              │
    │  └─────────────────┘  │ Rate Limit      │              │
    │                       │ Spend Cap       │              │
    │                       │ Audit Log       │              │
    │                       └────────┬────────┘              │
    └────────────────────────────────┼──────────────────────-┘
                                     │
                          ┌──────────▼──────────┐
                          │   EXTERNAL APIs      │
                          │   (web, Stripe, etc) │
                          └─────────────────────-┘

╔═════════════════════════════════════════════════════════════════════╗
║                      USER SPACE                                     ║
║                                                                     ║
║   Agent-File (YAML)   Agent Logic   Tool Definitions   Crews        ║
╚═════════════════════════════════════════════════════════════════════╝

╔═════════════════════════════════════════════════════════════════════╗
║               CONTROL TOWER UI (React + WebSocket)                  ║
║                                                                     ║
║  Trace Viewer  ·  Cost Monitor  ·  Memory Explorer  ·  Tool Registry║
╚═════════════════════════════════════════════════════════════════════╝
```

### 7.2 The Two Critical Boundaries

**Boundary 1 — Python SDK ↔ Go Orchestrator (gRPC)**

The Python SDK is a thin client. All intelligence lives in the Go Orchestrator. Communication is gRPC with protobuf serialisation for efficiency. The SDK handles: request construction, streaming response parsing, retry logic, and Pythonic interface ergonomics. The Orchestrator handles: everything else.

**Boundary 2 — Orchestrator ↔ External World (Tool-Call Supervisor)**

The Tool-Call Supervisor is the only component with egress to external networks. Nothing in the Kernel Space touches external APIs directly. All tool calls are funnelled through the Supervisor, which validates, rate-limits, audits, and executes them. This is a hard architectural boundary enforced by Kubernetes NetworkPolicy.

---

## 8. Architecture Deep Dive — Every Component

### 8.1 Task Orchestrator (Go + Temporal)

The Task Orchestrator is built on Temporal, the open-source durable execution engine used in production at Uber, Stripe, Netflix, and Hashicorp. It is the most critical reliability component in the system.

**What Temporal Provides:**

Temporal treats every agent task as a Workflow. Each step in the task is an Activity. Temporal automatically persists the state of every Workflow to its database. If the Orchestrator process crashes, is killed, or loses network connectivity, Temporal replays the Workflow history on a new worker and resumes exactly where it left off — with full state restored.

This is not retry logic. It is not error handling. It is a fundamentally different execution model where the progression of a task is durable by default, not fragile by default.

**Go Channels for Concurrent Streaming:**

The Orchestrator uses Go Channels to manage streaming token output from model providers. This allows:

- Streaming partial token outputs to the client WebSocket in real time without blocking the execution pipeline
- Running concurrent sub-agent tasks (spawned via MACP) without thread-per-task overhead
- Fan-out requests to multiple model providers simultaneously and returning the fastest response

**Workflow Structure:**

```
Workflow: AgentTask
├── Activity: LoadContext      (Redis L1 + Qdrant L2 in parallel)
├── Activity: AssemblePrompt   (budget allocation + pruning)
├── Activity: ModelCall        (via Abstraction Layer)
│   ├── Channel: StreamTokens  → NATS → WebSocket → Client
│   └── Channel: FinalResponse → Next Activity
├── Activity: ToolCall         (zero or more, via Supervisor)
│   └── Activity: ValidateAndExecute
├── Activity: FinalModelCall   (if tool results present)
└── Activity: CommitMemory     (async — does not block response)
    ├── Redis L1 write
    └── Qdrant L2 embed + upsert
```

### 8.2 Context Manager

The Context Manager solves the token window problem through a four-phase pipeline that runs on every agent turn.

**Phase 1 — Parallel Data Fetching**

Redis L1 and Qdrant L2 are queried simultaneously (Go goroutines). The current user message is embedded while the Redis fetch is in flight. Total fetch time target: < 50ms P99.

**Phase 2 — Budget Allocation**

The total context budget (model's context window minus output budget) is divided into four priority buckets:

| Bucket | Content | Priority | Typical Size |
|---|---|---|---|
| System Prompt | Agent personality, constraints | Highest — never pruned | ~500 tokens |
| Episodic Memory | Retrieved from Qdrant L2 | High — pruned last | ~1,500 tokens |
| Active Session | Recent turns from Redis L1 | Medium — sliding window | ~2,000 tokens |
| Current Turn | User message + tool results | Variable | Variable |

**Phase 3 — Relevance Retrieval**

The user message embedding is compared against all Qdrant vectors for this agent using cosine similarity. Only memories above the configured relevance threshold (default: 0.72) are included. Results are ranked by combined score: `0.7 × relevance + 0.3 × recency`.

**Phase 4 — Priority-Weighted Pruning**

If total budget is exceeded, the Context Manager prunes in this order:
1. Oldest session turns (sliding window)
2. Lowest-relevance episodic memories
3. System prompt is never pruned

**Async Write-Back:**

After the agent turn completes, a goroutine asynchronously writes the turn to Redis L1 (full turn) and, if the session exceeds the configured `summarise_after_turns` threshold, generates a compressed summary and upserts it to Qdrant L2. This does not block the response path.

### 8.3 Model Abstraction Layer

The Abstraction Layer exposes a single Go interface for all LLM providers. The Orchestrator exclusively calls this interface — never a provider API directly.

```go
type ModelProvider interface {
    Complete(ctx context.Context, req *CompletionRequest) (*CompletionResponse, error)
    Stream(ctx context.Context, req *CompletionRequest) (<-chan *TokenEvent, error)
    Embed(ctx context.Context, text string) ([]float32, error)
    CountTokens(ctx context.Context, text string) (int, error)
    HealthCheck(ctx context.Context) error
}
```

**Routing Strategies (configured per Agent-File):**

| Strategy | Behaviour | Use Case |
|---|---|---|
| `primary_with_fallback` | Use primary; failover to next in list on error | Standard production |
| `cost` | Route based on task complexity score; cheap tasks to cheap models | Cost optimisation |
| `latency` | Fan out to multiple providers; return fastest response | Latency-critical |
| `quality` | Always use highest-capability model regardless of cost | Mission-critical tasks |
| `pinned` | Always use exactly one specified model | Consistency-critical agents |

**Circuit Breaker per Provider:**

Each provider has a circuit breaker. Open condition: 5 failures in 10 seconds. Recovery: 2 successes after 30-second half-open period. This prevents cascading failures when a provider is degraded.

### 8.4 Tool-Call Supervisor

The Tool-Call Supervisor is a hard security boundary. Every tool call from every agent is intercepted and validated before execution. The agent cannot bypass this layer.

**8-Step Validation Pipeline:**

```
1. SCHEMA VALIDATION
   Is the tool call well-formed JSON matching the tool's registered schema?
   Failure → return structured error to agent (no execution)

2. PERMISSION CHECK
   Is this tool listed in the Agent-File's allowed_tools?
   Failure → return TOOL_NOT_PERMITTED error

3. RATE LIMIT CHECK
   Has this agent exceeded its configured calls/minute for this tool?
   Failure → return RATE_LIMIT_EXCEEDED with retry_after timestamp

4. SPEND CAP CHECK
   Has this agent exceeded its daily_budget_usd for this tool?
   Failure → return SPEND_CAP_EXCEEDED error; alert agent owner

5. PARAMETER SANITISATION
   Are there prompt injection patterns, SSRF vectors, or forbidden values?
   Failure → return PARAMETER_REJECTED with detail

6. EXECUTION
   Call the actual external API with a configured timeout

7. RESPONSE VALIDATION
   Does the response match the expected schema?
   Failure → return malformed response error to agent (log raw response)

8. AUDIT LOG
   Write to append-only PostgreSQL audit table regardless of outcome
   Includes: agent_id, tool, params_hash, response_hash, cost, timestamp
```

**Fail-Safe Principle:** Any validation failure blocks execution and returns a structured error to the agent. The agent must handle this gracefully (retry, escalate, or report). The Supervisor never silently passes invalid requests.

### 8.5 Multi-Agent Coordination Protocol (MACP)

The MACP enables agents to spawn sub-agents, send messages between agents, and synchronise on shared tasks. This is required for complex multi-agent workflows that CrewAI attempts to handle with its "crew" abstraction, but without production guarantees.

See Section 16 for the full MACP specification.

### 8.6 Agent-File

See Section 14 for the full Agent-File schema and specification.

---

## 9. The Go / Python Boundary — How It Works

This section explains precisely how the Go Orchestrator and Python SDK relate to each other — because this is a common source of confusion.

### 9.1 There Is No Go Inside the Python Package

The Python SDK does not contain a Go binary. It does not shell out to a Go process. It does not use CGo or any native bindings. It is a pure Python package that makes network calls to the Go Orchestrator running separately.

```
pip install actrone
# Installs: pure Python package (~500KB)
# Contains: gRPC client, Agent-File parser, streaming utilities
# Does NOT contain: any Go code, any binary, any compiled extension
```

This means:
- The SDK installs instantly on any platform (Linux, macOS, Windows, ARM)
- No compilation step for users
- No Go toolchain required on the developer's machine
- Standard pip install works in all environments

### 9.2 Communication: gRPC over HTTP/2

The Python SDK communicates with the Go Orchestrator via gRPC. The interface is defined in protobuf and compiled to both Python and Go.

```
┌─────────────────────┐         gRPC / HTTP2         ┌──────────────────────┐
│  Python SDK         │ ────────────────────────────► │  Go Orchestrator     │
│  (developer's env)  │ ◄──────────────────────────── │  (your cloud / k8s)  │
│                     │   streaming: Server-Sent gRPC  │                      │
└─────────────────────┘                               └──────────────────────┘
```

For streaming (token-by-token output), the SDK uses gRPC server-side streaming — the Orchestrator sends a stream of TokenEvent messages and the Python SDK yields them one by one.

### 9.3 The Memory Manager Is Different — Pure Python, Runs Locally

The open-source Memory Manager is an exception to this pattern. Because it is designed to run locally without any cloud dependency, it contains the full memory logic in pure Python. It talks directly to Redis and Qdrant from Python using their official Python clients.

```
┌─────────────────────┐    Python redis-py    ┌──────────────────────┐
│  actrone-memory   │ ──────────────────── ► │  Redis               │
│  (pure Python)      │                        │  (local or managed)  │
│                     │    Python qdrant-client │                      │
│                     │ ──────────────────── ► │  Qdrant              │
└─────────────────────┘                        └──────────────────────┘
```

When the developer upgrades from local Memory Manager to the full SDK + hosted platform, the memory operations are transparently proxied through the Orchestrator instead of direct database calls. The interface is identical.

### 9.4 Two Modes: Local and Cloud

```python
# MODE 1: Local (open source Memory Manager — no account, no cloud)
from actrone_memory import MemoryManager
mem = MemoryManager(
    redis_url="redis://localhost:6379",
    qdrant_url="http://localhost:6333",
    agent_id="my-agent"
)

# MODE 2: Cloud (full SDK — talks to hosted Orchestrator)
from actrone import Agent
agent = Agent.from_file("agent.yaml", api_key="act_live_abc123")
# Redis, Qdrant, Temporal all managed — developer touches none of it
```

### 9.5 Self-Hosted Enterprise Mode

Enterprise customers run the Go Orchestrator on their own infrastructure. Their Python SDK is configured with an internal base URL:

```python
agent = Agent.from_file("agent.yaml",
    base_url="https://actrone.internal.yourcompany.com",
    api_key=os.environ["ACTRONE_INTERNAL_KEY"]
)
```

The SDK cannot tell the difference between pointing at `api.actrone.com` and an internal deployment. Same code. Same Agent-Files. Different endpoint.

---

## 10. LangChain, LangGraph & CrewAI Integrations

### 10.1 Integration Philosophy

Actrone does not fork, embed, or depend on LangChain, LangGraph, or CrewAI internally. Instead, it implements the standard public interfaces those frameworks expose for external memory backends and callback handlers. This means:

- Integrations are maintained in one place (the `actrone.integrations` module)
- Updates to LangChain do not break Actrone internals
- Developers keep their existing code unchanged and swap one component

### 10.2 LangChain Memory Integration

LangChain exposes a `BaseMemory` interface. Actrone implements it, making the Memory Manager a drop-in replacement for any LangChain memory backend.

```python
from actrone.integrations.langchain import ActroneMemory

# Replace ConversationBufferMemory, VectorStoreRetrieverMemory,
# or any other LangChain memory with this one line:
memory = ActroneMemory(agent_id="research-bot")

# Your existing chain is unchanged
chain = ConversationalRetrievalChain.from_llm(
    llm=ChatOpenAI(),
    retriever=vectorstore.as_retriever(),
    memory=memory   # ← only this line changes
)
```

Under the hood, `ActroneMemory.load_memory_variables()` calls the Memory Manager's `retrieve()` method and `save_context()` calls `commit()`. The entire two-tier memory system (Redis L1 + Qdrant L2) is available to any LangChain chain without changing any other code.

### 10.3 LangGraph Observability Integration

LangGraph manages state as a graph, not just memory. The primary value Actrone adds to LangGraph is observability and durability — not memory replacement.

```python
from actrone.integrations.langgraph import ActroneCheckpointer

# Add to any compiled LangGraph app — one line
app = workflow.compile(
    checkpointer=ActroneCheckpointer(agent_id="my-langgraph-agent")
)

# Every LangGraph run now:
# - Appears in the Control Tower with full trace
# - Is durably checkpointed (resume on failure via Temporal)
# - Has cost tracking and spend alerts
# - Writes tool calls to the audit trail
```

### 10.4 CrewAI Memory Integration

```python
from actrone.integrations.crewai import ActroneMemory

crew = Crew(
    agents=[researcher, analyst, writer],
    tasks=[research_task, analysis_task, writing_task],
    memory=True,
    # Provide Actrone as the memory backend
    memory_config=ActroneMemory(agent_id="finance-crew")
)
```

### 10.5 The Build Sequence

Integrations are built based on where users come from — not speculatively:

| Priority | Integration | Effort | Impact |
|---|---|---|---|
| Launch | Standalone Memory Manager (no integration) | — | Baseline |
| Month 2 | LangChain BaseMemory adapter | ~100 lines | Very High — LangChain has millions of users |
| Month 3 | LangGraph checkpointer + tracer | ~150 lines | High — LangGraph is the production choice for most |
| Month 4 | CrewAI memory backend | ~100 lines | Medium-High |
| Month 6+ | AutoGen, LlamaIndex, Haystack | ~100 lines each | Based on community demand |

---

## 11. Data Flow & Sequence Diagrams

### 11.1 Happy Path — Single Agent Turn (Full Detail)

```
Client         SDK          Orchestrator   ContextMgr   Abstraction   Supervisor   ExtAPI
  │             │                │              │             │             │          │
  │ agent.run() │                │              │             │             │          │
  │ ──────────► │                │              │             │             │          │
  │             │ gRPC Task      │              │             │             │          │
  │             │ ─────────────► │              │             │             │          │
  │             │                │ Temporal     │             │             │          │
  │             │                │ Checkpoint   │             │             │          │
  │             │                │ ──────────── │             │             │          │
  │             │                │ LoadContext  │             │             │          │
  │             │                │ ────────────►│             │             │          │
  │             │                │              │ Redis L1    │             │          │
  │             │                │              │ Qdrant L2   │             │          │
  │             │                │              │ (parallel)  │             │          │
  │             │                │ ◄── context ─│             │             │          │
  │             │                │ AssemblePrompt              │             │          │
  │             │                │ ModelCall   │              │             │          │
  │             │                │ ────────────────────────── ►│             │          │
  │             │                │              │             │ Provider API│          │
  │ ◄─ stream ──│◄── stream ─────│◄── tokens ──────────────── │             │          │
  │  (tokens)   │                │              │ [agent decides tool call] │          │
  │             │                │ ToolCall     │             │             │          │
  │             │                │ ─────────────────────────────────────── ►│          │
  │             │                │              │             │ Validate    │          │
  │             │                │              │             │ Execute ────────────── ►│
  │             │                │              │             │             │ ◄─result─│
  │             │ ◄── result ────│◄─────────────────────────────────────── │          │
  │             │                │ FinalModelCall              │             │          │
  │ ◄─ final ───│◄── response ───│◄── output ──────────────── │             │          │
  │             │                │ CommitMemory (async goroutine)            │          │
  │             │                │ ────────────►│             │             │          │
```

### 11.2 Provider Failure and Recovery

```
Orchestrator   Temporal    Abstraction    Provider A    Provider B
     │             │             │              │              │
     │ ModelCall   │             │              │              │
     │ ──────────► │             │              │              │
     │             │ Checkpoint  │              │              │
     │             │ ────────────►              │              │
     │             │             │ Call()       │              │
     │             │             │ ────────────►│              │
     │             │             │              │ 503 Error    │
     │             │             │ ◄── error ───│              │
     │             │             │ Retry #1 (2s backoff)       │
     │             │             │ ────────────►│              │
     │             │             │              │ 503 Error    │
     │             │             │ [circuit breaker opens]     │
     │             │             │ [failover to Provider B]    │
     │             │             │ Call()                      │
     │             │             │ ──────────────────────────► │
     │             │             │                             │ 200 OK
     │             │ Resume      │                             │
     │ ◄── output ─│             │                             │
```

### 11.3 Multi-Agent Coordination Flow

```
Orchestrator   MACP        Agent A      Agent B       SharedMemory
     │           │             │            │               │
     │ Crew.run()│             │            │               │
     │ ─────────►│             │            │               │
     │           │ Spawn A     │            │               │
     │           │ ────────────►            │               │
     │           │ Spawn B     │            │               │
     │           │ ─────────────────────── ►│               │
     │           │             │            │               │
     │           │             │ WriteSharedMemory          │
     │           │             │ ──────────────────────────►│
     │           │             │            │               │
     │           │             │ MessageAgent(B, result)    │
     │           │             │ ─────────────────────────► │
     │           │             │            │ ReadSharedMem │
     │           │             │            │ ─────────────►│
     │           │             │            │ ◄── context ──│
     │           │             │            │ Process...    │
     │           │ ◄── done ───────────────-│               │
     │ ◄── result│             │            │               │
```

---

## 12. Production Tech Stack

### 12.1 Core Infrastructure

| Component | Technology | Version | Rationale |
|---|---|---|---|
| Orchestrator Runtime | Go | 1.23+ | Goroutines for concurrent streaming; compiled; low latency |
| LLM Interface | Python | 3.12+ | Native SDK support for all providers; async-native |
| Workflow Engine | Temporal | 1.25+ | Durable execution; used at Uber/Stripe/Netflix scale |
| L1 Cache | Redis | 7.2+ | Sub-millisecond reads; Redis JSON for structured sessions |
| L2 Vector DB | Qdrant | 1.9+ | HNSW indexing; Rust-native performance; gRPC API |
| Relational DB | PostgreSQL | 16+ | Audit trail; agent configs; billing; tool registry |
| Message Queue | NATS JetStream | 2.10+ | Low-latency pub/sub for streaming token events to clients |
| Service Mesh | Envoy + Istio | Latest | mTLS between services; circuit breakers; observability |
| SDK Serialisation | Protocol Buffers + gRPC | Latest | Type-safe; efficient; bi-directional streaming |

### 12.2 Model Providers (Abstraction Layer)

| Provider | Model | Use Case | Routing Strategy |
|---|---|---|---|
| OpenAI | GPT-4o | Complex reasoning, primary | Primary in `primary_with_fallback` |
| Anthropic | Claude 3.5 Sonnet | Long context, analysis | Fallback or `quality` routing |
| Mistral AI | Mistral Large | Mid-tier tasks | `cost` routing for medium-complexity |
| Groq | Llama-3-70B | Speed-critical, classification | `latency` routing |
| Ollama (local) | Mistral-7B / Llama-3-8B | PII-sensitive, air-gapped | Self-hosted enterprise only |
| Together AI | Various | Additional cost options | `cost` routing overflow |

### 12.3 Observability Stack

| Component | Technology | Purpose |
|---|---|---|
| Distributed Tracing | OpenTelemetry + Jaeger | End-to-end trace per agent turn |
| Metrics | Prometheus + Grafana | Token burn rate, latency P50/P95/P99, cost |
| Structured Logging | Zap (Go) + Loki | Machine-parseable agent event logs |
| Real-time Events | NATS + WebSocket | Stream agent thoughts to Control Tower UI |
| Error Tracking | Sentry | Agent exception capture with full context |
| Cost Attribution | Custom (PostgreSQL) | Per-task, per-agent, per-model breakdown |

### 12.4 Infrastructure & Deployment

| Component | Technology | Notes |
|---|---|---|
| Container Runtime | Docker + containerd | Each agent in isolated namespace |
| Orchestration | Kubernetes 1.30+ | HPA for Orchestrator workers |
| Secrets Management | HashiCorp Vault | Model API keys; encryption keys |
| CI/CD | GitHub Actions + ArgoCD | GitOps deployment; Agent-File as code |
| IaC | Terraform + Helm | Full infrastructure as code |
| Cloud (Primary) | AWS (us-east-1) | EKS, ElastiCache (Redis), RDS (PostgreSQL) |
| Cloud (Secondary) | GCP (for African regions) | Supplementary compute |

### 12.5 Open Source Memory Manager Dependencies (Python)

| Library | Version | Purpose |
|---|---|---|
| redis-py | 5.0+ | Redis L1 operations (async-native) |
| qdrant-client | 1.9+ | Qdrant L2 vector operations |
| openai | 1.x | Embedding generation (text-embedding-3-small) |
| sentence-transformers | 3.x | Local embedding option (no API key required) |
| tiktoken | 0.7+ | Token counting across model families |
| pydantic | 2.x | Memory object validation and serialisation |
| asyncio | stdlib | Async-native throughout |

---

## 13. API Specification

### 13.1 Orchestrator REST / gRPC API

#### Submit Agent Task

```
POST /v1/tasks
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "agent_id": "research-agent-v2",
  "input": "Summarise Q3 earnings for NVDA, MSFT, AAPL",
  "context": {
    "user_id": "usr_abc123",
    "session_id": "ses_xyz789"
  },
  "options": {
    "stream": true,
    "timeout_seconds": 300,
    "max_tool_calls": 20
  }
}

Response 202 Accepted:
{
  "task_id": "tsk_88ff92a1",
  "status": "PENDING",
  "stream_url": "wss://api.actrone.com/v1/tasks/tsk_88ff92a1/stream"
}
```

#### Get Task Status

```
GET /v1/tasks/{task_id}

Response 200:
{
  "task_id": "tsk_88ff92a1",
  "agent_id": "research-agent-v2",
  "status": "RUNNING",
  "created_at": "2026-04-13T10:00:00Z",
  "token_usage": { "input": 2340, "output": 891, "cost_usd": 0.0412 },
  "tool_calls_made": 3,
  "current_step": "Retrieving AAPL earnings data"
}
```

#### Kill / Cancel Task

```
DELETE /v1/tasks/{task_id}
```

### 13.2 WebSocket Stream Event Types

```json
{"event": "token",       "data": {"delta": "The", "index": 1}}
{"event": "tool_call",   "data": {"tool": "web_search", "params": {"query": "NVDA Q3"}}}
{"event": "tool_result", "data": {"tool": "web_search", "status": "success", "tokens": 340}}
{"event": "memory_hit",  "data": {"memory_id": "mem_ff29", "relevance": 0.87, "content": "..."}}
{"event": "agent_spawn", "data": {"sub_agent_id": "analyst-v1", "task": "..."}}
{"event": "complete",    "data": {"task_id": "tsk_88ff92a1", "total_cost_usd": 0.0412}}
{"event": "error",       "data": {"code": "TOOL_RATE_LIMIT", "message": "web_search exceeded 10/min"}}
```

### 13.3 Memory API

```
GET    /v1/agents/{agent_id}/memory?query={text}&limit=10
POST   /v1/agents/{agent_id}/memory          — manually inject memory
DELETE /v1/agents/{agent_id}/memory/{id}     — delete episodic memory
DELETE /v1/agents/{agent_id}/memory          — clear all memory
GET    /v1/agents/{agent_id}/memory/stats    — count, size, oldest/newest
```

### 13.4 Agent Registry API

```
POST   /v1/agents               — register agent from Agent-File
GET    /v1/agents               — list all agents
GET    /v1/agents/{id}          — get agent config
PUT    /v1/agents/{id}          — update agent (new Agent-File version)
DELETE /v1/agents/{id}          — deregister agent
GET    /v1/agents/{id}/versions — list all deployed versions
```

---

## 14. Agent-File Schema

The Agent-File is a declarative YAML manifest that fully defines an agent's behaviour, permissions, and memory policy. It is the equivalent of a `Dockerfile` for agents — version-controlled, reviewable in PRs, and deployable via GitOps.

```yaml
apiVersion: actrone/v1
kind: Agent
metadata:
  name: research-agent
  version: "2.1.0"
  description: "Deep research agent for financial analysis"
  owner: "analytics-team"
  tags: ["research", "finance", "production"]

spec:
  # ── PERSONALITY ──────────────────────────────────────────────
  personality:
    system_prompt: |
      You are a precise financial research analyst. You synthesise
      data from multiple sources, cite sources, and always quantify
      uncertainty. You never fabricate statistics.
    temperature: 0.3
    max_tokens: 4096
    response_format: "structured"

  # ── MODEL ROUTING ──────────────────────────────────────────────
  model:
    primary: "gpt-4o"
    fallback: ["claude-3-5-sonnet", "mistral-large"]
    routing_strategy: "primary_with_fallback"
    cost_ceiling_usd_per_call: 0.50

  # ── ALLOWED TOOLS ──────────────────────────────────────────────
  tools:
    - name: "web_search"
      rate_limit: "10/minute"
      daily_budget_usd: 2.00
      allowed_domains: ["sec.gov", "bloomberg.com", "reuters.com"]

    - name: "code_interpreter"
      rate_limit: "5/minute"
      timeout_seconds: 30
      allowed_libraries: ["pandas", "numpy", "matplotlib"]

    - name: "database_query"
      rate_limit: "20/minute"
      allowed_tables: ["public.earnings", "public.market_data"]
      read_only: true

  # ── MEMORY POLICY ──────────────────────────────────────────────
  memory:
    session_ttl_hours: 24
    long_term_enabled: true
    max_episodic_memories: 500
    relevance_threshold: 0.72
    auto_summarise: true
    summarise_after_turns: 20

  # ── SPEND LIMITS ───────────────────────────────────────────────
  limits:
    max_daily_cost_usd: 50.00
    max_task_cost_usd: 5.00
    max_task_duration_minutes: 30
    max_tool_calls_per_task: 50
    max_concurrent_tasks: 5

  # ── MULTI-AGENT ────────────────────────────────────────────────
  coordination:
    can_spawn_agents: true
    allowed_sub_agents: ["data-fetcher-v1", "code-analyst-v1"]
    max_sub_agents: 3
    shared_memory: true

  # ── SAFETY ─────────────────────────────────────────────────────
  safety:
    output_filter: "strict"
    pii_detection: true
    privacy_proxy_enabled: false   # set true to integrate Privacy Proxy
    allowed_output_formats: ["markdown", "json"]
```

---

## 15. Memory Architecture

### 15.1 Two-Tier Design

```
                    ┌──────────────────────────────────┐
                    │        CONTEXT WINDOW             │
                    │   (up to 128k tokens, per model)  │
                    └─────────────┬────────────────────-┘
                                  │  assembled by Context Manager
              ┌───────────────────┴──────────────────────┐
              │                                          │
    ┌─────────▼──────────┐                   ┌──────────-▼──────────┐
    │   L1: Redis         │                   │  L2: Qdrant           │
    │   (Hot Memory)      │                   │  (Cold Memory)        │
    │                     │                   │                       │
    │ • Active session    │                   │ • Episodic history    │
    │ • Last 50 turns     │                   │ • Semantic search     │
    │ • Tool results      │                   │ • Unlimited depth     │
    │ • < 1ms reads       │                   │ • ~10ms reads         │
    │ • TTL: 24 hours     │                   │ • Persistent          │
    │ • Per session key   │                   │ • Per agent namespace │
    └─────────────────────┘                   └───────────────────────┘
```

### 15.2 Redis L1 Schema

```
Key Pattern : agent:{agent_id}:session:{session_id}:turns
Type        : Redis List (LPUSH / LRANGE / LTRIM)
Max Items   : 50 turns (LTRIM enforced on write)
TTL         : 24 hours (configurable per Agent-File)

Turn Object (stored as Redis JSON):
{
  "turn_id":    "trn_001",
  "role":       "user | assistant | tool",
  "content":    "...",
  "token_count": 340,
  "timestamp":  1713000000,
  "tool_calls": [],
  "cost_usd":   0.002,
  "model":      "gpt-4o"
}
```

### 15.3 Qdrant L2 Schema

```
Collection    : agent_memories
Vector Dims   : 1536 (text-embedding-3-small) or 384 (local sentence-transformers)
Distance      : Cosine

Point Schema:
{
  "id": "mem_uuid_v4",
  "vector": [0.023, -0.441, ...],
  "payload": {
    "agent_id":        "research-agent",
    "session_id":      "ses_xyz789",
    "content":         "Compressed turn summary or raw content",
    "content_type":    "turn_summary | tool_result | user_fact | injected",
    "timestamp":       1713000000,
    "importance_score": 0.85,
    "topic_tags":      ["finance", "NVDA", "Q3"],
    "token_count":     180,
    "source_turn_ids": ["trn_001", "trn_002"]
  }
}
```

### 15.4 Retrieval Algorithm

```python
def retrieve_context(query, agent_id, budget_tokens):
    context = []
    remaining = budget_tokens

    # 1. System prompt (always, never pruned)
    context += [system_prompt]
    remaining -= len(system_prompt)

    # 2. Parallel fetch: Redis L1 + Qdrant L2
    session_turns, memories = await asyncio.gather(
        redis.lrange(session_key, 0, 10),
        qdrant.search(
            collection="agent_memories",
            query_vector=embed(query),
            query_filter={"agent_id": agent_id},
            limit=20,
            score_threshold=0.72
        )
    )

    # 3. Fill half budget with recent session turns
    for turn in session_turns:
        if remaining > turn.token_count:
            context += [turn]
            remaining -= turn.token_count

    # 4. Fill remaining budget with top-scored memories
    for mem in sorted(memories, key=lambda m: 0.7*m.score + 0.3*recency(m)):
        if remaining > mem.token_count:
            context += [mem]
            remaining -= mem.token_count

    return context
```

---

## 16. Multi-Agent Coordination Protocol (MACP)

### 16.1 Overview

The MACP is the internal protocol by which agents in Actrone spawn, communicate with, and synchronise with other agents. It is built on top of NATS JetStream for message delivery and Temporal for workflow coordination.

This is a v1 feature — it is part of the initial platform release because multi-agent workflows (researcher → analyst → writer, data fetcher → processor → reporter) are a primary use case for enterprise customers.

### 16.2 Core Operations

**Spawning a Sub-Agent:**

An agent can spawn a sub-agent by calling the `spawn` tool (registered automatically for agents with `can_spawn_agents: true` in their Agent-File):

```python
# The parent agent calls this tool during its execution
result = await tools.spawn_agent(
    agent_id="data-fetcher-v1",
    input="Fetch NVDA Q3 earnings data from SEC EDGAR",
    wait_for_result=True,   # block until sub-agent completes
    timeout_seconds=120
)
```

The Orchestrator creates a new Temporal Workflow for the sub-agent, linked to the parent workflow. If the parent is killed, all sub-agents are cancelled. If a sub-agent fails, the parent receives a structured error and can retry or escalate.

**Agent-to-Agent Messaging:**

Agents can send messages to other running agents without spawning:

```python
# Send a message to a running agent (fire and forget)
await tools.message_agent(
    agent_id="analyst-v1",
    session_id="ses_crew_abc",
    message="Research complete. Findings attached.",
    payload={"findings": research_results}
)
```

**Shared Memory Namespace:**

Agents in a Crew share a Qdrant namespace. Any agent can write memories to the shared namespace and any agent can query it. This is how the researcher's findings become available to the analyst without explicit message passing.

```yaml
# In Agent-File
coordination:
  shared_memory: true
  shared_namespace: "crew_{crew_id}"  # auto-populated at runtime
```

### 16.3 Crew Abstraction

The `Crew` object in the SDK coordinates multiple agents toward a shared goal:

```python
from actrone import Crew

crew = Crew(
    agents=[
        "agents/researcher.yaml",
        "agents/analyst.yaml",
        "agents/writer.yaml"
    ],
    goal="Produce a 2,000-word report on Q3 AI infrastructure spending",
    process="hierarchical",   # or "sequential" or "parallel"
    memory_shared=True,
    max_runtime_minutes=30
)

result = await crew.run()
print(result.output)
print(f"Total cost: ${result.total_cost_usd:.4f}")
print(f"Agents used: {result.agents_used}")
```

**Process Types:**

- `sequential` — agents run one after another; each receives the output of the previous
- `hierarchical` — a manager agent delegates tasks to sub-agents based on capabilities
- `parallel` — all agents run simultaneously with shared memory; results merged

---


---

## 17. AI Governance Engine — The AI Auditor

### 17.1 Overview & Purpose

The AI Governance Engine is a meta-intelligence layer that sits above all agents and LLM calls with one purpose: to audit, catch, evidence, and remediate every deviation from configured standards — automatically and continuously.

It is not a logging tool. It is not a guardrail filter. It is an active governance system with five integrated components: a configurable Rules Engine, an Audit Engine (a meta-LLM that reviews agent reasoning chains), a tamper-proof Violation Ledger, an automated Feedback Loop that closes the gap between violation detection and model improvement, and a Governance Dashboard that visualises everything in real time.

**Why this does not exist in the market today:**

- **LangSmith** (LangChain) is a logging and annotation tool. It does not audit against configurable rules or laws, does not detect hallucinations automatically, and does not close the feedback loop.
- **Arize AI / Phoenix** are ML observability platforms. They score hallucination risk at the call level but have no rules engine, no cross-turn consistency checking, and no feedback loop.
- **Guardrails AI / NeMo Guardrails** are input/output validators — they intercept a single call and return pass/fail. They have no concept of auditing a multi-step reasoning chain, no violation ledger, and no feedback loop.

The full integrated system — rules engine + multi-step audit + tamper-proof evidence ledger + automated fine-tuning feedback loop — does not exist anywhere. This is a first.

### 17.2 The Five Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AI GOVERNANCE ENGINE                             │
│                                                                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │  RULES ENGINE   │    │  AUDIT ENGINE   │    │  VIOLATION      │ │
│  │                 │    │                 │    │  LEDGER         │ │
│  │ GovernancePolicy│───▶│ Meta-LLM        │───▶│                 │ │
│  │ YAML (versioned)│    │ (async reviews  │    │ Append-only     │ │
│  │                 │    │  full chains)   │    │ Merkle-chained  │ │
│  │ Rule types:     │    │                 │    │ Exportable      │ │
│  │ • citation      │    │ Checks:         │    │ Cryptographically│ │
│  │ • consistency   │    │ • factual ground│    │ signed          │ │
│  │ • pii_scan      │    │ • consistency   │    │                 │ │
│  │ • intent_class  │    │ • rule violations│   └────────┬────────┘ │
│  │ • decision_pat  │    │ • hallucinations│             │          │
│  └─────────────────┘    └─────────────────┘             │          │
│                                                          │          │
│  ┌───────────────────────────────────────────────────── ▼────────┐ │
│  │                    FEEDBACK LOOP                               │ │
│  │                                                                │ │
│  │  Violation → Correction Generated → Human Review →            │ │
│  │  Dataset Accumulates → Fine-Tune Triggered →                  │ │
│  │  Validation → A/B Test → Deploy / Rollback                    │ │
│  └────────────────────────────────────────────────────────────── ┘ │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              GOVERNANCE DASHBOARD (Control Tower tab)        │   │
│  │  Violation Timeline · Compliance Scoreboard · Hallucination  │   │
│  │  Map · Fine-Tuning Pipeline View · Rule Coverage Heatmap     │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 17.3 Component 1 — The Rules Engine

The Rules Engine is a declarative, versioned configuration system where organisations define the standards their agents must follow. Rules are written in `GovernancePolicy` YAML files, versioned in Git alongside Agent-Files, and referenced from each agent's configuration.

**GovernancePolicy Schema:**

```yaml
apiVersion: actrone/v1
kind: GovernancePolicy
metadata:
  name: financial-services-compliance
  version: "1.0.0"
  applies_to: ["research-agent", "analyst-agent", "report-writer"]

rules:

  - id: RULE_001
    name: "No unverified financial claims"
    severity: CRITICAL
    description: >
      Agent must not state specific financial figures (prices, percentages,
      earnings) without citing a verifiable source in the same response.
    detector: citation_required
    pattern: financial_claim_without_citation
    action: BLOCK_AND_FLAG

  - id: RULE_002
    name: "No investment advice"
    severity: CRITICAL
    law: "FSCA — Financial Advisory and Intermediary Services Act"
    description: >
      Agent must not recommend buying, selling, or holding specific securities.
    detector: intent_classifier
    classifier_model: "investment-advice-classifier-v2"
    action: BLOCK_AND_FLAG

  - id: RULE_003
    name: "PII must not appear in final output for third parties"
    severity: HIGH
    law: "POPIA Section 26"
    description: >
      Final response must not contain names, account numbers, or ID numbers
      of third parties not directly involved in the conversation.
    detector: pii_scanner
    action: REDACT_AND_WARN

  - id: RULE_004
    name: "Reasoning must be internally consistent"
    severity: MEDIUM
    description: >
      The agent's conclusion must not contradict facts it stated earlier
      in the same reasoning chain.
    detector: consistency_checker
    action: FLAG_FOR_REVIEW

  - id: RULE_005
    name: "GDPR Article 22 — No automated decisions on individuals"
    severity: CRITICAL
    law: "GDPR Art. 22"
    description: >
      Agent must not make fully automated decisions that significantly affect
      individual data subjects without a human review step.
    detector: decision_pattern_classifier
    action: REQUIRE_HUMAN_APPROVAL

  - id: RULE_006
    name: "Tool call results must be acknowledged"
    severity: LOW
    description: >
      If a tool returns a result that contradicts the agent's prior assertion,
      the agent must acknowledge the contradiction in its next response.
    detector: contradiction_tracker
    action: FLAG_FOR_REVIEW
```

**Rule Severity Levels:**

| Severity | Response Action | Use Case |
|---|---|---|
| CRITICAL | BLOCK_AND_FLAG — response blocked, violation logged, owner alerted | Legal / regulatory violations |
| HIGH | REDACT_AND_WARN — PII stripped, warning injected, violation logged | Data protection violations |
| MEDIUM | FLAG_FOR_REVIEW — response delivered, violation flagged for human review | Quality / consistency issues |
| LOW | LOG_ONLY — violation logged silently, no user-visible action | Monitoring and improvement data |
| REQUIRE_HUMAN_APPROVAL | Response held in queue until a human approves or rejects | Irreversible actions with individual impact |

**Rule Detector Types:**

| Detector | Implementation | What It Catches |
|---|---|---|
| `citation_required` | Regex + context cross-reference | Claims without traceable source in context |
| `intent_classifier` | Fine-tuned ONNX classifier (< 5ms) | Prohibited intent patterns (advice, decisions, etc.) |
| `pii_scanner` | Privacy Proxy NER integration | PII in output not belonging to the conversation subject |
| `consistency_checker` | Meta-LLM cross-turn comparison | Contradictions within the same reasoning chain |
| `decision_pattern_classifier` | Fine-tuned ONNX classifier | Automated decision patterns affecting individuals |
| `contradiction_tracker` | Tool result vs assertion comparison | Agent ignoring or contradicting tool results |
| `hallucination_scorer` | Grounding score vs retrieved context | Claims with no basis in provided context |

**Governance Policy referenced from Agent-File:**

```yaml
# agents/research-agent.yaml
spec:
  governance:
    policy: "governance/financial-services-compliance.yaml"
    audit_mode: "async"          # async (non-blocking) or sync (blocking)
    sync_rules: ["RULE_001", "RULE_002", "RULE_005"]  # these run sync
    human_review_queue: "compliance-team"
    violation_alert_channel: "slack://compliance-alerts"
```

### 17.4 Component 2 — The Audit Engine

The Audit Engine is a specialised meta-LLM instance configured with a governance-focused system prompt. It reviews complete agent reasoning chains — not just individual outputs — looking for patterns that single-call validators cannot detect.

**What it reviews per turn:**

**Factual Grounding:** Did the agent make claims that cannot be traced back to any document, tool result, or memory it was actually given? This is hallucination at the reasoning level — not just a confabulated word, but a confabulated fact with no grounding in the provided context.

**Reasoning Coherence:** Did the agent's conclusion logically follow from its stated reasoning steps? Are there internal contradictions — for example, the agent said "Company X has strong cash flow" in step 2 but concluded "Company X is at risk of insolvency" in step 8, without acknowledging new evidence between those steps?

**Rule Compliance:** Did any segment of the response violate a rule from the GovernancePolicy? Synchronous rules have already been checked; the Audit Engine performs the async deep-check pass.

**Cross-Turn Pattern Detection:** Is there a pattern across the last N turns that individually look fine but collectively suggest drift? For example, the agent has been consistently overestimating upside risk across the last 15 responses. No single response triggered a rule, but the pattern is statistically anomalous.

**Behavioural Baseline Drift:** Is this agent behaving consistently with its established baseline? Embedding-based comparison of recent outputs against historical outputs for this agent. Significant drift may indicate prompt corruption, model degradation, or an adversarial input.

**Structured Audit Verdict per Turn:**

```json
{
  "turn_id": "trn_abc123",
  "agent_id": "research-agent",
  "session_id": "ses_xyz789",
  "audit_timestamp": "2026-04-21T10:00:00Z",
  "audit_engine_version": "v1.2.0",
  "verdict": "VIOLATION",
  "overall_compliance": false,
  "scores": {
    "factual_grounding": 0.41,
    "reasoning_coherence": 0.88,
    "hallucination_risk": 0.81,
    "policy_compliance": 0.60,
    "baseline_drift": 0.12
  },
  "violations": [
    {
      "rule_id": "RULE_001",
      "severity": "CRITICAL",
      "description": "Agent stated NVDA Q3 revenue was $18.1B with no cited source",
      "evidence": {
        "agent_claim": "NVDA reported Q3 revenue of $18.1 billion",
        "retrieved_context_contains": false,
        "nearest_context_fact": "NVDA Q3 revenue: $18.4B — source: sec.gov/NVDA-Q3-2026",
        "delta": "$0.3B discrepancy — figure not present in any retrieved document",
        "classification": "HALLUCINATION — ungrounded factual claim"
      },
      "location": {
        "response_segment": "NVDA reported Q3 revenue of $18.1 billion",
        "char_offset_start": 45,
        "char_offset_end": 89
      },
      "action_taken": "FLAGGED — async rule, response already delivered",
      "correction_generated": true
    }
  ],
  "pattern_alerts": [],
  "merkle_leaf": "sha256:a1b2c3d4..."
}
```

**Audit Engine Execution Modes:**

- **Async (default):** Audit runs after response is delivered. Does not add latency to the user-facing response. Catches violations for logging, correction, and feedback loop. Used for MEDIUM and LOW severity rules.
- **Sync (blocking):** Audit runs before response is delivered. Blocks the response if a violation is detected. Used only for CRITICAL rules (e.g., investment advice, GDPR Art. 22 automated decisions) where the cost of a false negative outweighs the latency cost.

### 17.5 Component 3 — The Violation Ledger

Every Audit Engine verdict — pass or fail — is written to the Violation Ledger. The Ledger is an append-only PostgreSQL table with a Merkle hash chain, identical in architecture to the Privacy Proxy audit trail. It is designed to be:

**Tamper-evident:** Each row includes a Merkle leaf hash (SHA-256 of row content + previous leaf hash). Any modification to a historical record breaks the chain and is immediately detectable.

**Court-exportable:** The Ledger can be exported as a signed PDF compliance report for regulatory submissions. The export includes the Merkle proof, allowing regulators to independently verify that the log has not been altered.

**Queryable for patterns:** The Ledger is indexed for analytical queries: "Show all CRITICAL violations by agent in the last 30 days." "Show all hallucinations involving financial figures." "Show which rules are violated most frequently and by which agents." "Show me the violation rate trend for research-agent over the last 90 days."

**Violation Ledger Schema:**

```sql
CREATE TABLE governance_violations (
    violation_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turn_id         TEXT NOT NULL,
    agent_id        TEXT NOT NULL,
    session_id      TEXT NOT NULL,
    rule_id         TEXT NOT NULL,
    severity        TEXT NOT NULL,
    verdict         JSONB NOT NULL,        -- Full audit verdict object
    evidence        JSONB NOT NULL,        -- Structured evidence record
    action_taken    TEXT NOT NULL,
    correction_id   UUID,                  -- FK to correction_examples if generated
    reviewed_by     TEXT,                  -- Human reviewer if applicable
    review_decision TEXT,                  -- APPROVED / REJECTED / PENDING
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    merkle_leaf     BYTEA NOT NULL         -- SHA-256 Merkle chain hash
);

-- Append-only enforcement
CREATE RULE no_update_violations AS ON UPDATE TO governance_violations DO INSTEAD NOTHING;
CREATE RULE no_delete_violations AS ON DELETE TO governance_violations DO INSTEAD NOTHING;
```

### 17.6 Component 4 — The Feedback Loop

This is the most strategically valuable component of the Governance Engine. It transforms the violation record from a passive log into an active improvement mechanism. The loop has six stages:

**Stage 1 — Violation Capture**
Audit Engine detects a hallucination: agent claimed NVDA Q3 revenue was $18.1B. The actual figure in the retrieved context was $18.4B. The agent had the correct figure available — it hallucinated a different one.

**Stage 2 — Correction Example Generation**
The Governance Engine generates a corrected version of the agent's response. This becomes a supervised fine-tuning (SFT) example:

```
SYSTEM:  [agent system prompt]
USER:    [user message + full retrieved context including sec.gov filing]
ASSISTANT (BAD):  "NVDA reported Q3 revenue of $18.1 billion, showing..."
ASSISTANT (GOOD): "Based on NVDA's Q3 10-Q filing (sec.gov), Q3 revenue was
                   $18.4 billion, representing a 17% YoY increase..."
```

The correction is generated by the meta-LLM with explicit instruction: "Given the context the agent had, write the response it should have produced, following all configured governance rules."

**Stage 3 — Human Review Queue**
Correction examples go to a human review queue in the Governance Dashboard. Compliance officers or domain experts mark each as:
- **APPROVED** — correct correction, include in fine-tuning dataset
- **REJECTED** — correction is also wrong or the violation was a false positive
- **EDITED** — reviewer modifies the correction before approving

Human review is configurable per rule severity. CRITICAL violations require human approval before entering the dataset. LOW violations can be auto-approved if the hallucination score exceeds a confidence threshold.

**Stage 4 — Dataset Accumulation**
Approved correction examples accumulate in a structured fine-tuning dataset, tagged by: rule violated, severity, agent, model, domain. The dataset is formatted for the target provider's fine-tuning API (OpenAI JSONL, Anthropic XML format, Together AI format).

**Stage 5 — Threshold-Triggered Fine-Tuning**
When configurable thresholds are reached, the Governance Engine automatically submits a fine-tuning job:

```yaml
# governance/fine-tune-policy.yaml
fine_tune_triggers:
  - condition: "approved_examples >= 500 AND avg_violation_rate > 0.05"
    action: submit_fine_tune_job
    provider: "openai"
    base_model: "gpt-4o-mini"           # fine-tune cheaper model first
    validation_set_size: 0.15
    notify: ["governance-team@company.com"]

  - condition: "critical_violations_7d >= 50"
    action: submit_fine_tune_job
    priority: urgent
    provider: "anthropic"
    base_model: "claude-3-haiku"
```

**Stage 6 — Validation, A/B Test, and Deployment**

The fine-tuned model is never deployed automatically. Before deployment:

1. The Governance Engine runs the fine-tuned model against a held-out evaluation set of known violations
2. Pass rate must exceed the configured threshold (default: 90% on CRITICAL rule violations)
3. If validation passes, an A/B test begins: 10% of matching traffic routes to the fine-tuned model
4. Violation rate is tracked for the A/B cohort for 7 days
5. If fine-tuned model violation rate is statistically lower, it is promoted to the Abstraction Layer as a routing option
6. If it regresses or shows new violation patterns, it is rolled back and flagged for investigation

```
VIOLATION DETECTED
        ↓
CORRECTION GENERATED (meta-LLM)
        ↓
HUMAN REVIEW (approve / reject / edit)
        ↓
DATASET ACCUMULATES (tagged by rule, agent, domain)
        ↓
THRESHOLD REACHED → FINE-TUNE JOB SUBMITTED
        ↓
VALIDATION AGAINST EVAL SET (≥ 90% pass rate required)
        ↓
A/B TEST (10% traffic, 7 days)
        ↓
PROMOTE to Abstraction Layer  ←───── ROLLBACK if regression
        ↓
CONTINUOUS MONITORING (violation rate tracked post-deploy)
```

**The Compounding Moat:**
Every month a customer uses the Governance Engine, their correction dataset grows. Their fine-tuned models get more accurate for their specific domain, rules, and terminology. After six months, their agents are meaningfully better than the base models at following their specific governance policy. A competitor starting fresh would need to rebuild that dataset from scratch. This is a genuine, compounding competitive advantage that grows with tenure.

### 17.7 Component 5 — Governance Dashboard

A dedicated section of the Control Tower UI, separate from the operational Trace Viewer. Built for compliance officers, legal teams, and governance leads — not just engineers.

**Violation Timeline:** A chronological feed of all violations across all agents. Filterable by agent, rule, severity, and time range. Each entry is expandable to show the full evidence record: what was said, what the context contained, what the rule required, the correction generated, and the human review decision.

**Compliance Scoreboard:** Per-agent compliance rates over time. A trend graph showing violation rate over 7/30/90-day windows. Which agents are the most problematic? Which rules are violated most? Is the overall fleet improving or degrading after fine-tuning?

**Hallucination Map:** A visualisation of where in reasoning chains hallucinations tend to occur. Does it happen consistently on the final synthesis step? After a specific tool is called? At high token counts (suggesting context compression is causing loss)? Does hallucination rate correlate with response latency (model under load)?

**Fine-Tuning Pipeline View:** Current state of the correction dataset — approved examples, pending review, rejected. Progress toward the fine-tuning trigger threshold. History of all submitted fine-tuning jobs, their validation results, A/B test outcomes, and deployment status.

**Rule Coverage Heatmap:** Which rules are being triggered, how often, and by which agents. Identifies rules that are never triggered (possibly too loose or not applicable) and rules triggered constantly (agent needs retraining or rule is misconfigured). Surfaces rules that are blocking high volumes of responses in sync mode (potential latency impact).

**Audit Trail Export:** One-click export of any time-range violation log as a signed PDF report for regulator submission. Includes Merkle proof verifying the log has not been tampered with. Formatted for submission to FSCA, GDPR supervisory authorities, FCA, or other relevant bodies.

### 17.8 Integration with Existing Components

The Governance Engine is not an add-on — it is woven into the platform architecture:

| Component | Governance Integration |
|---|---|
| Agent-File | `governance.policy` field references GovernancePolicy YAML |
| Tool-Call Supervisor | REQUIRE_HUMAN_APPROVAL rules trigger a hold on tool execution pending review |
| Context Manager | Audit Engine reads full assembled context to verify grounding of claims |
| Memory Manager | Approved corrections stored as high-priority memories to reinforce correct patterns |
| Privacy Proxy | PII_COMPLIANCE rule type shares evidence with Privacy Proxy vault audit trail |
| Control Tower | Governance Dashboard is a first-class tab alongside Trace Viewer and Cost Monitor |
| Abstraction Layer | Fine-tuned models registered as named routing options per agent |
| MACP | Governance policy applies to all agents in a Crew, including dynamically spawned sub-agents |

### 17.9 Governance Engine Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| Rules Engine | Go (YAML parser + rule evaluator) | Fast synchronous evaluation; compiled |
| Intent/Decision Classifiers | ONNX Runtime (quantised models) | Sub-5ms inline inference; no API call |
| Audit Engine | Anthropic Claude (via Abstraction Layer) | Best-in-class instruction following for compliance analysis |
| Violation Ledger | PostgreSQL (append-only + Merkle) | ACID; auditable; exportable |
| Correction Generator | Meta-LLM (GPT-4o or Claude 3.5) | Highest quality corrections for fine-tuning datasets |
| Fine-Tune Dataset Store | PostgreSQL + S3 (JSONL files) | Structured storage + provider-compatible export formats |
| Dashboard UI | React + D3 + WebSocket | Real-time violation stream; trend charts; heatmaps |
| Merkle Anchoring (optional) | Hedera Hashgraph | Immutable off-chain proof for highest-assurance deployments |

### 17.10 GovernancePolicy Rule Library (Shipped)

Actrone ships a library of pre-built governance policies for common regulated industries. Organisations use these as baselines and extend them:

| Policy Pack | Covers | Key Rules |
|---|---|---|
| `financial-services-za` | FSCA, POPIA, JSE rules | No investment advice, citation required, PII controls |
| `financial-services-eu` | MiFID II, GDPR, EBA guidelines | Suitability, explainability, data protection |
| `healthcare` | HIPAA, medical ethics | No diagnosis, no prescription, PHI controls |
| `legal` | Legal professional standards | No legal advice, jurisdiction-specific disclaimers |
| `general-enterprise` | Basic hallucination + PII | Hallucination scoring, PII scan, consistency check |
| `gdpr-baseline` | GDPR Articles 5, 13, 22 | Data minimisation, transparency, no automated decisions |
| `popia-baseline` | POPIA Conditions 1–8 | Lawful processing, purpose limitation, data subject rights |

---

</GOVERNANCE_EOF
echo "written"## 17. Security Model

### 17.1 Threat Model

| Threat | Attack Vector | Mitigation |
|---|---|---|
| Prompt injection via tool results | Malicious API response modifies system prompt | Tool results sanitised; system prompt immutable at runtime |
| Agent exfiltrates secrets | Tool call to attacker-controlled endpoint | Supervisor allow-list; only approved domains reachable |
| Runaway agent financial damage | Infinite loop burns API credits | Per-agent daily spend cap; hard kill on breach |
| Agent impersonation | API key theft or replay | Short-lived JWTs (RS256); agent keys scoped per Agent-File |
| Memory poisoning | Injecting false episodic memories | Memory writes are HMAC-signed; vector DB is write-gated |
| Cross-agent data leak | Sub-agent reading parent's private memory | Namespace isolation; shared memory requires explicit opt-in |
| Supply chain attack | Malicious Agent-File from marketplace | Agent-File signatures verified before deployment (v3+) |

### 17.2 Network Security

All inter-service communication uses mTLS enforced by Istio. The Tool-Call Supervisor is the **only** component with external network egress. All other services are network-isolated by Kubernetes NetworkPolicy. Even if an attacker gains code execution inside an Orchestrator pod, they cannot make external network calls — only the Supervisor can.

### 17.3 Secrets Management

Model provider API keys are stored in HashiCorp Vault with dynamic secret rotation. Secrets are injected at runtime via Vault Agent — they never appear in environment variables, config files, or logs. Log scrubbing removes any accidental key appearances.

### 17.4 Privacy Proxy Integration

For agents processing PII, the Agent-File can enable Privacy Proxy integration:

```yaml
safety:
  privacy_proxy_enabled: true
  privacy_proxy_url: "https://proxy.internal.company.com"
```

When enabled, the Context Manager strips PII tokens from prompts before they cross jurisdictional boundaries, and re-hydrates them in responses. This is the integration point between Actrone and the Semantic Privacy Proxy product.

---

## 18. Observability & Control Tower UI

### 18.1 What the Control Tower Is

The Control Tower is a real-time engineering observability dashboard for AI agents. It is not a chat interface — it is a debugging and monitoring tool built for the engineers running agents in production.

It answers the questions that developers cannot answer with console logs: Why did this agent produce that output? What context did it have? What did it actually retrieve from memory? What did that tool call return? What did this cost?

### 18.2 Key Modules

**Trace Viewer:** An interactive chronological tree of every agent turn. Each node shows: user input → reasoning steps → memory retrievals (with relevance scores) → tool calls (with parameters and responses) → final output. Streamed via WebSocket in real time as the agent runs. Built with React and D3 recursive tree layout.

**Token & Cost Monitor:** Real-time spend dashboard. Shows burn rate per agent, per model, and per task. Rolling cost graph with configurable alert thresholds. Kill-switch button that terminates any running task immediately. Particularly important for catching agents in reasoning loops before they cause significant financial damage.

**Memory Explorer:** A visual query interface for the Qdrant Vector DB. Engineers can type a natural language query and see what memories would be retrieved for that query, with cosine similarity scores. They can inspect the content of individual memories, see when they were created and from which session, and delete memories that are causing systematic hallucinations.

**Tool Registry:** A management interface for all registered tools. Shows current rate limit usage vs configured limits, daily spend per tool, and recent tool call history. Allows toggling tools on/off per agent without redeploying. Shows which agents have access to which tools across the fleet.

**Agent Fleet View:** Overview of all running agents. Shows status (running, queued, failed, completed), real-time cost accumulation, current step, and time running. Allows bulk operations (pause all agents, apply cost cap to all agents).

**MACP Visualiser:** For multi-agent workflows, shows the agent coordination graph in real time — which agents spawned which sub-agents, message flow between agents, and shared memory access patterns.

### 18.3 Key SLOs

| SLO | Target |
|---|---|
| Context retrieval latency P99 | < 50ms |
| Orchestrator scheduling overhead | < 10ms |
| Task resume time after provider outage | < 30s |
| WebSocket stream start latency | < 200ms |
| Audit log write latency | < 5ms |
| Memory write-back (async) | < 2s |
| Control Tower UI load time | < 1s |

---

## 19. Failure Modes & Resilience

### 19.1 Failure Mode Analysis

| Failure | Probability | Impact | Mitigation |
|---|---|---|---|
| LLM provider outage | Medium | High | Multi-provider fallback; circuit breaker |
| Temporal worker crash | Low | High | State preserved; new worker resumes from checkpoint |
| Redis failure | Low | Medium | Degrade to Vector DB-only context; alert ops |
| Qdrant unavailable | Low | Medium | Degrade to session-only context; no long-term memory |
| Infinite reasoning loop | Medium | High | Max tool call limit + cost cap kill-switch |
| Prompt injection via tool result | Medium | High | Supervisor sanitisation + parameter validation |
| Sub-agent cascade failure | Low | Medium | Parent receives structured error; retry or escalate |
| Network partition to external APIs | Low | Low | Tool-call timeout + retry with backoff |

### 19.2 Circuit Breaker Configuration

| State | Condition | Duration |
|---|---|---|
| Closed → Open | 5 failures in 10 seconds | — |
| Open → Half-Open | After 30 seconds | — |
| Half-Open → Closed | 2 consecutive successes | — |
| Half-Open → Open | 1 failure | Reset 30s timer |

---

## 20. Scalability & Performance

### 20.1 Scaling Model

| Component | Strategy | Trigger |
|---|---|---|
| Temporal Workers (Go) | Horizontal pod autoscaling | Queue depth > 100 |
| Redis | Cluster mode with sharding | Memory > 70% |
| Qdrant | Additional nodes + replication | Query P95 latency > 50ms |
| NATS JetStream | Cluster mode | Message lag > 10k |
| Orchestrator API | HPA on CPU/request count | CPU > 70% |

### 20.2 Performance Targets

| Metric | Target |
|---|---|
| Context load (L1 + L2, parallel) | < 50ms P99 |
| Orchestrator scheduling overhead | < 10ms per task |
| Token stream start (first byte) | < 200ms |
| Memory write-back (async) | < 2s |
| Concurrent agents per node | 100+ (goroutine model) |
| API gateway throughput | 10,000 req/s per pod |

---

## 21. Product Versioning & Release Roadmap

### 21.1 Version Philosophy

Actrone follows a four-version release strategy aligned to the four product layers. Each version is a coherent, shippable product that generates value independently — not a partial release waiting for the next version to be useful.

### 21.2 v0.1 — Open Source Memory Manager

**Timeline:** Months 1–4  
**Licence:** MIT  
**Distribution:** PyPI (`pip install actrone-memory`), GitHub  
**Target:** All AI/ML developers

**What Ships:**
- Pure Python MemoryManager class (async-native)
- Redis L1 integration (redis-py, full CRUD + TTL management)
- Qdrant L2 integration (semantic search, upsert, delete, namespace isolation)
- Relevance-weighted context retrieval algorithm
- Async write-back with compression
- Memory search, delete, and clear operations
- LangChain BaseMemory adapter (drop-in replacement)
- LangGraph checkpointer adapter
- CrewAI memory backend adapter
- Local embedding support (sentence-transformers, no API key required)
- OpenAI embedding support (text-embedding-3-small)
- Comprehensive test suite + documentation
- Docker Compose file for local Redis + Qdrant setup

**What Does NOT Ship in v0.1:**
- Go Orchestrator (not needed for memory-only use)
- Temporal integration (not needed at this stage)
- Hosted platform (developers run their own Redis + Qdrant)
- Agent-File (not yet relevant)
- Control Tower UI

**Success Metric:** 500 GitHub stars, 50 production deployments within 60 days of launch.

**Why This First:** Long-term memory is the single most complained-about problem in the AI developer community. A library that solves it in three lines, works with any framework, and requires no cloud account earns developer trust before any sales motion begins. Every developer who deploys the Memory Manager is a qualified lead for the hosted platform.

### 21.3 v1.0 — Full Hosted Platform

**Timeline:** Months 5–10  
**Distribution:** actrone.com (hosted SaaS) + PyPI + GitHub  
**Target:** AI engineering teams building production agents

**What Ships:**
- Go Orchestrator with full gRPC API
- Temporal-backed durable execution (task checkpointing, resume on failure)
- Model Abstraction Layer (OpenAI, Anthropic, Mistral, Groq)
- Multi-provider routing (primary_with_fallback, cost, latency)
- Tool-Call Supervisor (full 8-step validation pipeline)
- Agent-File YAML schema v1 (personality, model, tools, memory, limits, safety)
- Agent Registry API
- Python SDK v1.0 (full Orchestrator client)
- Go SDK v1.0 (full Orchestrator client) — *(historical: this Go client SDK later shipped and was subsequently removed from the family 2026-07-05; the CLI was migrated to its own self-contained `internal/client` and a TypeScript SDK was added instead — CLAUDE.md §0.1, unverified 2026-07-13 whether other v1.0 bullets in this list shipped exactly as scoped)*
- Hosted platform (actrone.com) — multi-tenant, usage-based billing
- Control Tower UI v1 (Trace Viewer, Cost Monitor, Memory Explorer, Tool Registry)
- **Multi-Agent Coordination Protocol (MACP)** — agent spawning, messaging, shared memory
- Crew abstraction (sequential, hierarchical, parallel process types)
- WebSocket streaming for real-time token delivery
- NATS JetStream for internal event routing
- Prometheus + Grafana metrics (hosted dashboard)
- OpenTelemetry distributed tracing
- PostgreSQL audit trail for all tool calls

**Why MACP in v1.0 (not later):**
Multi-agent workflows are not a nice-to-have — they are the primary use case for enterprise customers. A researcher-analyst-writer crew, a data-fetcher-processor-reporter pipeline, a hierarchical agent that delegates to specialists: these are the workflows enterprises are trying to build right now. Shipping MACP in v1 rather than a later version avoids the product being positioned as a single-agent solution that needs to be retrofitted for multi-agent use.

**On-Premise / Air-Gapped (v1.0 Enterprise tier):**
The self-hosted Helm chart ships in v1.0, available under the enterprise licence. This is prioritised because financial services and government customers (high-value, high-ACV contracts) will not evaluate a product that requires their data to leave their infrastructure. Shipping self-hosted in v1 unlocks these conversations from day one.

```bash
# v1.0 self-hosted deployment
helm install actrone actrone/actrone \
  --set license.key="ent_xyz" \
  --set orchestrator.replicas=3 \
  --set temporal.enabled=true \
  --set redis.enabled=true \
  --set qdrant.enabled=true
```

**v1.0 Pricing:**

| Tier | Price | Limits |
|---|---|---|
| Free | $0/month | 5 agents, 100 tasks/month, 10k memory vectors |
| Developer | $49/month | 20 agents, 5k tasks, 500k vectors |
| Startup | $299/month | Unlimited agents, 50k tasks, 5M vectors |
| Scale | $999/month | Priority support, 500k tasks, 50M vectors |
| Enterprise | Custom | Self-hosted, SLA, SSO, audit logs, air-gap |

### 21.4 v2.0 — Ecosystem & Fine-Tuning

**Timeline:** Months 11–18  
**Focus:** Deeper ecosystem integrations, fine-tuning pipeline, advanced enterprise features

**What Ships:**
- AutoGen, LlamaIndex, Haystack, DSPy integrations
- OpenAI Agents SDK integration
- Fine-tuning pipeline integration — log agent traces → prepare fine-tuning datasets → trigger fine-tuning jobs (OpenAI, Anthropic, Together AI) — agents improve from production feedback
- Advanced MACP features: agent-to-agent contracts, capability negotiation, load balancing across agent pools
- Advanced cost optimisation: automatic model downgrade for simple sub-tasks, batch processing for non-real-time workloads
- SOC 2 Type II certification
- ISO 27001 certification
- Advanced air-gapped deployment (no outbound internet required even for model calls — Ollama-based local model stack)
- Secrets rotation automation (HashiCorp Vault integration)
- Multi-region hosted platform (EU, Africa, APAC)

**Fine-Tuning Pipeline (v2.0):**

The fine-tuning integration is explicitly out of scope for v1 but lands in v2. The architecture is:

1. Every agent task generates a structured trace (already in v1)
2. v2 adds a trace annotation UI in Control Tower — engineers mark traces as "good" or "bad"
3. Annotated traces are automatically formatted as fine-tuning datasets (OpenAI JSONL, Anthropic format)
4. One-click fine-tuning job submission to the provider
5. Fine-tuned model automatically registered in the Agent's Abstraction Layer as a routing option
6. A/B testing framework compares fine-tuned model against base model on production traffic

### 21.5 v3.0 — Agent Marketplace & Advanced Intelligence

**Timeline:** Month 19–30  
**Focus:** Network effects, marketplace, advanced agent capabilities

**What Ships:**
- **Agent Marketplace** — developers publish, share, and monetise Agent-Files. Searchable by capability, industry, and rating. Verified publisher programme. Revenue share for marketplace creators.
- Agent-File signing and verification (cryptographic proof that a marketplace Agent-File has not been tampered with)
- **Wasm-based agent sandbox** — ultra-isolated execution environment for untrusted or marketplace-sourced agents. Tool calls from sandboxed agents run in a Wasm VM with even stricter resource limits.
- Advanced MACP: agent capability discovery (agents advertise what they can do; orchestrator dynamically assembles crews), agent reputation scoring
- Reasoning trace analysis — automated detection of hallucination patterns, loop indicators, and quality regressions using a meta-agent that reviews other agents' traces
- Cross-account agent collaboration (enterprise feature: share agents between business units securely)
- Regulatory compliance modules (SOX, HIPAA, FedRAMP-ready configurations)

### 21.6 Version Summary Table

| Feature | v0.1 | v1.0 | v2.0 | v3.0 |
|---|---|---|---|---|
| Open Source Memory Manager | ✓ | ✓ | ✓ | ✓ |
| LangChain / LangGraph / CrewAI integrations | ✓ | ✓ | ✓ | ✓ |
| Python SDK | — | ✓ | ✓ | ✓ |
| Go SDK *(removed 2026-07-05 — replaced by TypeScript SDK, see §0.1 of CLAUDE.md)* | — | ✓ | ✓ (retired) | — |
| Go Orchestrator + Temporal | — | ✓ | ✓ | ✓ |
| Tool-Call Supervisor | — | ✓ | ✓ | ✓ |
| Agent-File Schema | — | ✓ | ✓ | ✓ |
| Hosted Platform (actrone.com) | — | ✓ | ✓ | ✓ |
| Control Tower UI (Trace Viewer, Cost Monitor, Memory Explorer) | — | ✓ | ✓ | ✓ |
| Multi-Agent Coordination Protocol (MACP) | — | ✓ | ✓ | ✓ |
| Self-Hosted / Air-Gapped (Enterprise Helm) | — | ✓ | ✓ | ✓ |
| **AI Governance Engine — Rules Engine + Audit Engine** | — | ✓ | ✓ | ✓ |
| **Violation Ledger (Merkle-chained, tamper-proof)** | — | ✓ | ✓ | ✓ |
| **Governance Dashboard (Violation Timeline, Compliance Scoreboard)** | — | ✓ | ✓ | ✓ |
| **Governance Policy Library (POPIA, GDPR, FSCA, Healthcare)** | — | ✓ | ✓ | ✓ |
| Fine-Tuning Feedback Loop (correction generation + dataset) | — | — | ✓ | ✓ |
| Advanced Ecosystem Integrations (AutoGen, LlamaIndex, DSPy) | — | — | ✓ | ✓ |
| Fine-Tuning Pipeline (auto-submit + A/B validation) | — | — | ✓ | ✓ |
| SOC 2 Type II / ISO 27001 | — | — | ✓ | ✓ |
| Advanced Governance Analytics (Hallucination Map, drift detection) | — | — | ✓ | ✓ |
| Wasm-Based Agent Sandbox | — | — | — | ✓ |
| Agent Marketplace | — | — | — | ✓ |
| Governance Merkle Anchoring (Hedera / Ethereum L2) | — | — | — | ✓ |

---

## 22. Monetisation & Pricing Architecture

### 22.1 Revenue Model

Actrone uses a **usage-based SaaS model** for the hosted platform and an **annual licence model** for enterprise self-hosted deployments. This aligns revenue with customer value — customers pay more as their agent usage grows.

### 22.2 Usage-Based Metrics (Hosted)

| Metric | Unit | Notes |
|---|---|---|
| Tasks executed | Per task | Primary billing metric |
| Memory vectors stored | Per 100k vectors | Qdrant storage |
| Model routing calls | Per call | Markup on pass-through model costs |
| Tool call executions | Per call | Small fee for Supervisor processing |
| Streaming sessions | Per hour active | WebSocket session time |

### 22.3 Enterprise Licensing

Enterprise contracts are annual, negotiated, and include:

- Unlimited tasks within agreed infrastructure allocation
- Dedicated Temporal cluster (no noisy-neighbour)
- On-premise / air-gapped deployment rights
- SLA with financial penalties
- Dedicated support engineer
- Custom Agent-File review and approval workflows
- Priority feature development influence
- SSO (SAML, OIDC)
- Advanced audit logs + SIEM integration

ACV range: $20,000 – $500,000 per year depending on agent fleet size and infrastructure requirements.

### 22.4 Open Source Monetisation Strategy

The MIT-licensed Memory Manager is not monetised directly. Its purpose is:

1. **Developer trust** — engineers evaluate tools on GitHub before they evaluate them on sales calls
2. **Qualified lead generation** — every developer who deploys the Memory Manager and hits scale is a natural upgrade candidate
3. **Ecosystem network effects** — LangChain/CrewAI integrations mean Actrone appears in every discussion of those frameworks
4. **Talent attraction** — visible open source work attracts engineering candidates

The conversion path from open source → hosted is deliberately frictionless: one config line change, same code, same interface.

---

## 23. Open Questions & Future Work

| Question | Priority | Version Target | Notes |
|---|---|---|---|
| Release Memory Manager as open source under MIT? | Critical | v0.1 | Confirmed — this is the go-to-market strategy |
| AI Governance Engine — Rules Engine + Violation Ledger? | Critical | v1.0 | Ships in v1 — regulated industry requirement; genuine market gap |
| GovernancePolicy pre-built library (POPIA, GDPR, FSCA)? | High | v1.0 | Ships with financial-services-za, gdpr-baseline, general-enterprise packs |
| Feedback Loop — correction generation + human review queue? | High | v2.0 | Requires v1 violation dataset to be meaningful; deferred to v2 |
| Fine-tuning pipeline automation (threshold-triggered jobs)? | High | v2.0 | Full auto-submit + A/B test + deploy/rollback pipeline |
| Hallucination Map and drift detection analytics? | Medium | v2.0 | Requires 3+ months of violation data for statistical significance |
| Multi-agent coordination protocol (MACP)? | High | v1.0 | Included in v1 — required for enterprise multi-agent workflows |
| On-premise / air-gapped deployment? | High | v1.0 | Included in v1 enterprise tier — financial sector requirement |
| Fine-tuning pipeline integration? | Medium | v2.0 | Agents improve from production traces; deferred from v1 |
| Agent Marketplace (share Agent-Files)? | Medium | v3.0 | Long-term monetisation and network effects vector |
| Wasm-based agent sandbox? | Low | v3.0 | Ultra-strict isolation for marketplace/untrusted agents |
| MCP (Model Context Protocol) compatibility? | High | v1.0 | Standard is now Linux Foundation; must be compatible |
| African language NER for Privacy Proxy integration? | Medium | v2.0 | Relevant for Privacy Proxy integration; Shona/Yoruba/Zulu |
| Formal verification of Tool-Call Supervisor? | Low | Post-v3 | Relevant for regulated industries (finance, healthcare) |
| Decentralised agent identity (DID)? | Low | Post-v3 | Long-term: agents have verifiable cryptographic identities |

---

*Document Version 3.0.0 — Actrone Engineering Team — 2026*
*Supersedes: System Design Document v2.0.0*
