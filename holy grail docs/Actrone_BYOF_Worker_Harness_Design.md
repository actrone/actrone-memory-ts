# Actrone — BYOF-Hosted Worker Harness: Architecture & Interface Spec

> **Status:** **P1 SHIPPED** (2026-06-19) — encapsulated-any + the Go `HostedAgentWorkflow`
> and `run_framework_step` contract are built, tested green, and routed at submit time on a
> shared harness task queue. **P2 stepwise-durable driver SHIPPED** (2026-06-20) — the
> replay-with-memoization `StepwiseDriver`/`StepwiseContext` + parser enablement gated to
> `{langgraph, actrone_sdk, custom}`, tested green. **P3 TS harness SHIPPED** (2026-06-29) — the
> TypeScript **encapsulated** driver at `@actrone/sdk/harness` (`actrone-ts/src/harness/`:
> `protocol`/`context`/`loader`/`encapsulated`/`activity`/`worker` mirroring the Python harness
> field-for-field on the `run_framework_step` wire contract; Temporal is an optional peer imported
> dynamically so the entry builds/typechecks/tests without it; tsc-strict + build green, 17 harness
> tests green / 58 total). So **every JS/TS framework** (Vercel AI SDK, Mastra, OpenAI-Agents JS,
> LangGraph.js, …) now runs hosted + governed + durable day one (encapsulated). **P2 per-tenant
> pools + P3 more stepwise drivers remain** (warm pools/queues = infra-repo; OpenAI-Agents/AutoGen/
> CrewAI Python stepwise shims), gated on **P5-B**
> (deploy/version path — also shipped as P6-C control plane) and **P6-A/C** (worker pools + hyperscale). **Owner:** Matt. Implements §2 of
> [Execution Model & BYOF Durability](./Actrone_Execution_Model_and_BYOF_Durability_Plan.md);
> the third and final **P6-D** slice (after the durable governed loop, MCP/A2A advertising,
> and native `tool_calls` fidelity).
>
> **Status refreshed 2026-07-13 (code-verified):** §9's "initial" per-framework driver matrix and §12's
> "P3 — More stepwise drivers... TS harness" (both framed as future work) are **superseded — P3 is
> BUILT.** Stepwise now ships for **13 Python frameworks** (`agno, autogen, aws_strands, crewai, dspy,
> google_adk, langchain, llamaindex, microsoft_agent_framework, openai_agents, pydantic_ai,
> semantic_kernel, smolagents` — i.e. OpenAI-Agents, AutoGen, and CrewAI, marked ⚠️
> encapsulated-only in §9, now have real stepwise drivers) and the **TS harness gained a full stepwise
> core** (`actrone-ts/src/harness/stepwise.ts`, not present as of this doc's last pass) with 6
> framework shims (`genkit, langchain, llamaindex, openai-agents, vercel, voltagent`). The
> `HostedFrameworks`/`StepwiseFrameworks` enum is in sync with every driver (a prior mismatch is fixed
> and regression-tested, `internal/agent/runtime_test.go`). See
> `Actrone_Stepwise_Framework_Expansion_Plan.md`'s refresh note for the full record; per-tenant warm
> pools (the P2 infra tail) were not re-verified this pass.

---

## 0. The one-sentence goal

**Let a developer deploy their existing framework agent (LangGraph / CrewAI / AutoGen /
OpenAI-Agents / …) to Actrone and have the kernel run its loop as a durable, governed,
supervised, cached, audited Temporal execution — without rewriting it on a new SDK.**

This is the only thing **connected** BYOF structurally cannot have (Temporal durability of a loop
that runs in the developer's own process) and therefore the structural reason to pay.

## 1. Goals / non-goals

**Goals**
- Run an unmodified (or near-unmodified) framework agent under the kernel's governance: every
  model call through the gateway (MAL · DPE · cache · routing/BYOK · audit), every tool call
  through the Tool-Call Supervisor, memory through L1/L2.
- Durability: crash-resume, workflow retries with backoff, idempotency, human-in-the-loop
  (DPE Tier-3) approval signals, spend/turn caps.
- Per-tenant isolation: dedicated worker pools, concurrency caps, egress allowlist.
- Polyglot: **Python first** (most frameworks), TS second.

**Non-goals**
- Not a new agent-authoring SDK (the developer keeps their framework).
- Not a general FaaS — only agent-loop workloads.
- Not magic determinism: the framework's own logic may be non-deterministic; we make the
  **execution** durable, see §4.

## 2. The control-plane decision — **Go owns the workflow; the harness owns one activity**

Two designs were considered:

1. *Python harness owns the Temporal workflow* (temporalio Python), calling Go activities.
2. **Go orchestrator owns the workflow; the Python harness is an activity worker** that executes
   framework steps on the tenant's task queue. ✅ **Chosen.**

**Why (2):** Temporal workflows must be deterministic; arbitrary framework code is not. Keeping
the **workflow in Go** reuses the proven `AgentTaskWorkflow` governance spine (MAL → DPE →
governed loop → audit → caps) and keeps all non-determinism quarantined inside **activities**. The
harness shrinks to "an activity worker that advances a framework agent to its next governed
boundary" — far smaller surface, language-agnostic contract, and one determinism model to reason
about. Cross-language is native Temporal: the Go workflow dispatches the `RunFrameworkStep`
activity to the **tenant's Python task queue**; the existing governed activities
(`StreamLLMResponse`, `ExecuteGovernedTool`, memory) run on the Go worker.

```
HostedAgentWorkflow (Go, durable, deterministic)
  MALTokenise → DPEPreCheck                         (existing activities, reused)
  loop until done / cap:
    step ← RunFrameworkStep(tenantQueue, state)      (NEW — Python harness activity)
    switch step.Kind {
      model_request → llm  ← StreamLLMResponse(...)   (existing governed activity)
      tool_request  → tr   ← ExecuteGovernedTool(...) (existing governed activity)
      memory_op     → m    ← Memory{Write,Retrieve}   (existing activities)
      approval_gate → await Tier-3 signal             (existing escalation path)
      done          → return step.Output
    }
    state ← step.Resume(result)   ; AuditAppend(step)  (durable checkpoint after each boundary)
```

The hosted workflow is a **sibling of `AgentTaskWorkflow`** (same activity options, GetVersion
discipline, caps from `LimitsSpec`, audit spine, reasoning trace), differing only in that the
"what to do next" decision comes from `RunFrameworkStep` instead of a direct model call.

## 3. Two execution strategies behind one contract

Frameworks differ in whether they can **pause at a governed boundary and resume from a serialized
checkpoint**. The harness supports both, picked per framework (§9 matrix):

### 3.1 Stepwise-durable (checkpoint-capable frameworks — the flagship)
The framework is driven **one boundary at a time**. `RunFrameworkStep` restores the framework's
serialized checkpoint, advances until the agent next wants a model/tool/memory call (or finishes),
and **returns that request as a boundary** plus the new checkpoint blob. The Go workflow runs the
governed activity for that request, then calls `RunFrameworkStep` again with the result.

- **Each model/tool call is a real workflow-level activity** ⇒ crash resumes from the last
  checkpoint; per-step retries; per-step audit. This is the moat.
- Interception mechanism: the harness binds the framework's model/tool client to a **shim** that
  raises a `Boundary` exception (carrying the request) instead of calling out — unwinding to the
  driver, which serializes state via the framework's checkpointer.
- First-class driver: **LangGraph** (native checkpointer). Then anything with a step/callback hook
  (OpenAI-Agents run hooks, AutoGen message hooks, CrewAI task callbacks) given a checkpoint shim.

### 3.2 Encapsulated-governed (any framework — the universal fallback)
The whole loop runs inside **one** `RunFrameworkStep` activity that **heartbeats** for liveness.
The framework's model/tool calls are intercepted to route **synchronously** through Actrone:
model → the gateway (`POST /v1/gateway/chat/completions`, governed); tools →
`POST /v1/tools/authorize` (supervise-only, Steps 1–5) then execute, or the governed connector/MCP
path. Returns `done` in a single boundary.

- Governance: **full** (every inner call still flows through gateway + supervisor).
- Durability: **coarse** — workflow-level retry of the whole activity + idempotency + signals +
  spend caps; on crash the activity retries from the last committed checkpoint (or from the start,
  idempotently). No per-step resume. **Still strictly more than connected (which has none).**
- This guarantees **every** framework runs hosted on day one; stepwise upgrades the ones that can.

## 4. Determinism & governance contract

- **Determinism stays in Go.** The workflow only ever sees activity results (framework step
  outputs, model/tool results) — all non-determinism (LLM output, framework branching) is captured
  *inside* activities and recorded in the workflow history, so replay is deterministic. No framework
  code runs in the workflow goroutine.
- **Governance is non-bypassable.** In both strategies, model calls traverse the gateway
  (MAL · DPE · cache · routing · audit) and tool calls traverse the Supervisor (allowlist · rate ·
  spend · injection/SSRF · MAL · audit). The harness has **no path** to a raw provider or a raw
  tool — its only egress is to Actrone endpoints (enforced by the egress allowlist, §7). A hosted
  agent therefore cannot exceed its manifest capabilities even though Actrone didn't author its loop.
- **Caps** reuse `LimitsSpec` (`max_tool_calls_per_task`, `max_task_cost_usd`,
  `max_task_duration_minutes`) enforced by the Go workflow exactly as the native loop does; cost is
  threaded cumulatively (`CostAccrued`).

## 5. Interface contracts

### 5.1 Manifest additions (Agent-File)
```yaml
spec:
  runtime:
    build_mode: byof_hosted          # native | byof_connected | byof_hosted
    framework: langgraph             # langgraph|crewai|autogen|openai_agents|llamaindex|dspy|actrone_sdk|custom
    entrypoint: "agent.graph:app"    # module:callable the harness loads (actrone_sdk uses ctx.client)
    strategy: auto                   # auto | encapsulated | stepwise  (auto ⇒ encapsulated; stepwise only for langgraph|actrone_sdk|custom)
    bundle:
      kind: image                    # image ONLY (omit ⇒ image); 'code' is rejected until the build pipeline ships
      ref: "registry/...@sha256:…"   # digest-pinned image, built FROM the Actrone harness base image
    resources: { cpu: "1", memory: "2Gi", timeout_minutes: 30 }  # hosted pod size; validated against tier-allowed sizes (drives GB-s billing)
    egress: { allow: [] }            # extra allowlisted hosts beyond the Actrone endpoints
```
Validated at deploy time (`internal/agent/parser.go validateRuntime`); `build_mode: byof_hosted`
routes the agent to the hosted scheduler (§6). Re-uses the manifest hash + version model so a hosted
agent is a versioned, promotable, rollback-able artifact (P5-B), exactly like a native manifest.

> **Shipped vs. design note.** `framework: actrone_sdk` (an agent authored on the Actrone SDK and
> hosted — §6.4) and the image-only / `code`-rejected rules are in the shipped validator. `strategy`
> accepts `auto`/`encapsulated`/`stepwise` (the last gated to `StepwiseFrameworks =
> {langgraph, actrone_sdk, custom}`; other frameworks are told to use `encapsulated`). `resources` is **not hand-authored
> YAML** — see §5.5; the parser applies defaults (`cpu:1`, `memory:2Gi`, `timeout_minutes` from the
> task-duration cap), and **tier-bounded size validation is the follow-up** (today values are accepted
> as-is).

### 5.5 `resources` is a platform-managed, tier-gated selection — not free-form

`resources` (pod CPU/memory + activity timeout) applies **only to hosted agents** (a pod exists) and
is **COGS-bearing** — it directly drives the §15.8 GB-second meter. So it must not be free-form YAML a
developer types. The decided UX:

- **The named sizes are real EKS-on-Fargate task configurations** (Infra Plan §4) — not arbitrary
  numbers. Each preset maps 1:1 onto a single valid Fargate microVM, so a chosen size provisions
  exactly one pod with **no surprise round-up** and the §15.8 meter attributes GB-seconds +
  vCPU-seconds cleanly. The catalogue:

  | Size | vCPU | Memory | Fargate task | Approx. compute COGS¹ |
  |---|---|---|---|---|
  | `small` | 0.5 | 1 GiB | 0.5 vCPU / 1 GB | ~$0.025 / pod-hour |
  | `medium` (default) | 1 | 2 GiB | 1 vCPU / 2 GB | ~$0.049 / pod-hour |
  | `large` | 2 | 4 GiB | 2 vCPU / 4 GB | ~$0.099 / pod-hour |
  | `xl` | 4 | 8 GiB | 4 vCPU / 8 GB | ~$0.197 / pod-hour |

  ¹ us-east-1 on-demand Fargate ($0.04048/vCPU-hr + $0.004445/GB-hr); pods scale to zero between
  tasks (KEDA on Temporal queue depth, Infra §4.3), so this is billed only while a task runs. Above
  `xl` we do **not** add larger self-serve sizes — bigger/dedicated needs are served by single-tenant
  Karpenter node pools billed as **reserved capacity** (Infra §4.3 / §15.8 line 25), not the per-task
  GB-second meter.
- **Fargate per-pod overhead is absorbed at deploy time.** EKS-on-Fargate reserves ~256 MiB/pod for
  the kubelet/containerd it injects and provisions the task whose memory ≥ (container requests +
  reserve). The P6-C pod-spec renderer therefore sets the container memory request to
  (`MemoryGiB`·1024 − `FargatePodOverheadMiB`) so the pod lands on **this** size's task, not the next
  one up — i.e. the catalogue values are the *provisioned task* (the billing basis), and
  `domain.FargatePodOverheadMiB = 256` is the single source of truth for that arithmetic.
- **Control Tower presents a tier-gated *named* size selector**, chosen at the **hosting/deploy
  configuration step** (when an agent is configured as hosted / on promote-to-hosted), not earlier —
  resources are meaningless until something runs in a pod. The platform **injects** the chosen preset
  into `spec.runtime.resources` server-side; the **go-live checklist verifies** a valid size is set.
- **Server-side validation is mandatory regardless of UI** (defense in depth — a manifest can also
  arrive via SDK/REST/YAML upload, bypassing the selector). **SHIPPED (2026-06-20):** the named-size
  catalogue is the canonical source of truth in `internal/domain/podsize.go` (each entry carrying the
  K8s `cpu`/`memory` strings **and** the numeric `VCPU`/`MemoryGiB` the meter bills on;
  `DefaultPodSize = medium`), and `validateRuntime` rejects any `cpu`/`memory` pair that does not
  match a known named size — so nobody can request 64 vCPU and blow COGS, no matter how the manifest
  arrives. An omitted `resources` block defaults to the `medium` preset (== the historical cpu:1/2Gi
  default), so existing hosted manifests validate unchanged.
- **Per-tier ceiling enforces TWO gates** (`TierMaxPodSize` + `IsPodSizeAllowedForTier(size, tier)`,
  the single helper the frontend size-selector mirrors and the backend gate calls): **(1) the hosting
  capability gate** — hosting a code agent is a **Scale/Enterprise** capability (§15.8); Free and Pro
  are *absent* from the map and fail closed (they run connected + manifest agents, which provision no
  pod) — and **(2) the size ceiling** — `scale` → `large`, `enterprise` → `xl`. It is **not yet wired
  at the registration boundary** because the orchestrator has no tenant-tier source today (tier lives
  in Clerk/frontend entitlements; `agent.Service.Register` receives only `tenantID`). Wiring an unused
  tier seam now would be a stub (no-stub rule), so the **absolute** named-size cap is the live gate and
  the per-tier check activates the moment tier data is plumbed into the registration/deploy boundary.
- Named sizes (not raw cpu/memory) keep it Vercel/Fargate-like and let the size→price mapping stay a
  platform concern the customer never has to reason about.

### 5.2 New Go activity — `RunFrameworkStep`
```go
// workflow package
type RunFrameworkStepInput struct {
    TaskID, TenantID, AgentID string
    Strategy   string            // "stepwise" | "encapsulated"
    Checkpoint json.RawMessage   // opaque framework state; empty on the first step
    // Result of the governed activity the previous boundary requested (nil on first step).
    Resume     *StepResume
    AgentFile  domain.AgentFile
    Deadline   time.Time
}
type StepResume struct {
    Kind   string          // "model" | "tool" | "memory"
    Output json.RawMessage // governed result to feed back into the framework
    IsError bool
}
type RunFrameworkStepResult struct {
    Kind       string          // "model_request"|"tool_request"|"memory_op"|"approval_gate"|"done"
    ModelReq   *StreamLLMInput          // when Kind=model_request (built by the harness from the framework's call)
    ToolReq    *ExecuteGovernedToolInput// when Kind=tool_request
    MemoryReq  *MemoryOp                // when Kind=memory_op
    Output     json.RawMessage          // when Kind=done — the agent's final result
    Checkpoint json.RawMessage          // opaque state to persist + pass to the next step (stepwise)
    Reasoning  string                   // optional framework-emitted reasoning → audit ReasoningTrace
}
```
Dispatched with `ActivityOptions{TaskQueue: tenantWorkerQueue(tenantID), HeartbeatTimeout: …}`. The
workflow maps `ModelReq`/`ToolReq` straight onto the **existing** `StreamLLMResponse` /
`ExecuteGovernedTool` activities — no new governance code.

### 5.3 Python harness — the worker
The harness is a small `temporalio` **activity worker** (no workflow code) registering
`run_framework_step`. Per-framework `AgentDriver`s adapt a framework to the boundary protocol:
```python
class AgentDriver(Protocol):
    """Advances a framework agent to its next governed boundary."""
    async def start(self, task: TaskInput) -> StepOutcome: ...
    async def resume(self, checkpoint: bytes, result: StepResult) -> StepOutcome: ...
    def supports_stepwise(self) -> bool: ...

@dataclass(frozen=True)
class StepOutcome:
    kind: Literal["model_request","tool_request","memory_op","approval_gate","done"]
    request: ModelRequest | ToolRequest | MemoryOp | None
    output: dict | None          # when kind == "done"
    checkpoint: bytes            # serialized framework state (stepwise); b"" in encapsulated mode
    reasoning: str | None = None
```
- **Stepwise driver** (LangGraph): bind the graph's model+tool nodes to the boundary shim; run the
  graph until a `Boundary` is raised; serialize via the LangGraph checkpointer → `checkpoint`.
- **Encapsulated driver** (any framework): reuse the **existing connected adapters** —
  `resolve_gateway()` ([integrations/_gateway.py](../backend/src/actrone/integrations/_gateway.py))
  points the framework's model client at the governed gateway, and `govern_local_tool` /
  `actrone_tool` ([integrations/_local.py](../backend/src/actrone/integrations/_local.py)) route
  tool calls through the Supervisor. The whole loop runs in one heartbeating activity.
- **Checkpoint store:** opaque blobs persisted as workflow activity results (Temporal) for small
  state; large state (e.g. big LangGraph graphs) spills to the tenant's object store keyed by
  `{task_id}/{step}` with a pointer in the checkpoint. No framework state ever leaves the region.

### 5.4 Reuse, don't reinvent
| Concern | Reused existing component |
|---|---|
| Governed inference | gateway `/v1/gateway/chat/completions` + `StreamLLMResponse` activity |
| Governed tools | Supervisor `Execute` / `Authorize` + `ExecuteGovernedTool` activity |
| Memory | L1 Redis + L2 Qdrant via the memory activities |
| MAL / DPE / audit / reasoning trace | the activities the native loop already calls |
| Caps / cost | `LimitsSpec` + `CostAccrued` threading |
| Deploy / versions / rollback / canary | P5-B deployment path + manifest hash/version |
| Signals (Tier-3 approval) | the existing `awaitEscalationDecision` escalation path |

## 6. Deploy & scheduling path (depends on P5-B + P6-A/C)

### 6.1 How a developer ships a hosted agent (the decided UX)

The manifest's `spec.runtime.bundle.kind` is the fork between two ingestion journeys:
`image` (developer builds their own container) and `code` (developer pushes source; Actrone
builds it on the harness base image). **Decision (2026-06-19): `image` is the ONLY accepted kind**
— not merely "first." `kind: code` requires a build pipeline (install deps, SBOM, seal, sign) we
have not built, so the validator **rejects it now** (`validateRuntime`, mirroring how it rejects
`strategy: stepwise`) rather than accepting it into a path that fails later at deploy — no stub
surface (CLAUDE.md §0). An omitted `kind` defaults to `image`. `code` ("zero-config, we build it"
— the Vercel feel) is a roadmap item, un-gated only once the build infra exists.

**The `image` contract (no build infra on our side):** the customer's container is built
**`FROM` the published Actrone harness base image** (which ships the `run_framework_step` activity
worker); their Dockerfile just `COPY`s their framework code + installs their deps, and the harness
imports their `spec.runtime.entrypoint` at runtime. We publish the base image + a Dockerfile
template; the customer's CI builds + pushes to their registry; **we only verify the pinned digest
+ scan it.** This is why image-only needs zero build infra from us — the supply-chain burden sits
in the customer's CI where it already lives, and it is the enterprise-credible path.

Three surfaces feed the **same** pipeline; **decision: the `actrone deploy` CLI is the hero**
(CI-native, fastest to ship, reuses the existing Go CLI), with git-connect and a Control-Tower
upload as fast-follows. **`actrone deploy` is ONE verb for both execution tiers** — for a native /
EMAOP agent it pins a new **manifest version**; for a `byof_hosted` agent it verifies + pins an
**image digest** — branching on `build_mode`, so developers learn one command:

| Surface | Status | Path |
|---|---|---|
| **`actrone deploy` (CLI/CI)** ← hero | new `deploy` verb on the existing `actrone-cli/` | resolves the `byof_hosted` manifest + image digest → `POST /v1/agents/{id}/bundles` → server verifies digest reachability + scan → version-pins → optional `--promote`. `--env` aware (reuses the deploy flag precedence). |
| **Git-connected auto-deploy** | fast-follow | connect GitHub/GitLab → branch→env map (`main`→prod, others→preview) → push builds (customer CI produces the image) → PR preview-deployment comment. The full GitHub/Vercel feel. |
| **Control Tower upload** | fast-follow | paste an image ref (`registry/...@sha256:…`) + pick framework/entrypoint in the UI; the no-CI first-touch. |

**Server-side per push (image path):** validate the `byof_hosted` manifest (`validateRuntime`,
already shipped) → **verify the image digest** is pinned + reachable + signed (cosign/SBOM, no
mutable tags) → **scan** (Trivy/`pip-audit` on the SBOM, block HIGH/CRITICAL) → store an immutable,
version-pinned **deployment record** (manifest hash + image digest + env + author + source SHA).
A `code` bundle adds, ahead of this, a network-isolated build step (detect framework → install from
`requirements.txt`/`pyproject` → SBOM → seal + sign → produce the digest) — deferred with `kind: code`.

> **SHIPPED — control plane (2026-06-20).** The deploy pipeline's app layer is built and green:
> - **Endpoints** (orchestrator): `POST /v1/agents/{id}/bundles` (deploy push — agent_admin),
>   `GET …/bundles` + `GET …/bundles/{id}` (deployments feed/detail — members),
>   `POST …/bundles/{id}/promote` (governed promote — agent_admin). Tenant + env scoped.
> - **Pipeline** (`internal/bundle.Service`): a pushed manifest is parsed/validated
>   (byof_hosted → digest-pinned image → named pod size), then run through a `pending → verifying →
>   scanning → ready/failed` state machine, persisted to `agent_bundles` at every transition
>   (migration `00049`). It **fails closed**: a bad digest, a HIGH/CRITICAL scan, or *no scanner
>   configured* never yields a promotable bundle.
> - **Digest verification** (`internal/registry.Verifier`): real Docker/OCI Registry v2 `HEAD`
>   with the bearer-token challenge flow, over the **SSRF-hardened dialer** (`mcp.SafeHTTPClient`)
>   since the registry host is customer-supplied — bounded timeout + retry/backoff/jitter, and a
>   `Docker-Content-Digest` mismatch is rejected.
> - **Scanning** (`internal/registry.Scanner`): a `VulnerabilityScanner` seam with a real
>   `HTTPScanner` (posts the image to a Trivy-style service URL; the HIGH/CRITICAL gate is enforced
>   on *our* side, never trusting the backend's `status`) and a fail-closed `NotConfiguredScanner`.
> - **Promote** reuses the **P5-B governance gate** (`DiffDeployment` + audit) and version snapshot,
>   so a hosted deploy threads into the existing version history / rollback / canary machinery.
> - **CLI/SDK**: `actrone deploy <agent-id> -f agent.yaml [--promote] [--confirm]` is the hero verb
>   (`actrone-cli`), backed by `DeployBundle`/`GetBundles`/`PromoteBundle` on the Go SDK;
>   `actrone deployments bundles <agent-id>` lists the feed.
>
> **Still infra-repo (P6-C data plane):** the per-tenant Fargate pools the verified image actually
> runs on (KEDA/Karpenter/gVisor — Infra §4), `kind: code` build infra, per-tenant registry pull
> secrets (vault), and moving the synchronous verify→scan into a durable Temporal deploy workflow for
> long scans. The control plane above is the durable contract those consume.

### 6.2 Deployments product (UI — extends the shipped P5-B surface)

`agents/[id]/deployments` already does promote / rollback / canary / sandbox-preview / go-live
checklist for manifest versions. The same surface serves **BYOF-hosted and EMAOP/native
identically** — the lifecycle (version → preview → promote → rollback → canary → audit) is shared;
only the build step differs (build/scan a pod vs validate a manifest). Add, Vercel/GitHub-grade:

- **Deployments list** — every push is an immutable row: status (`Queued → Building → Validating →
  Live / Failed / Rolled-back`), source (commit SHA + message + author), env, duration, Live/Canary
  badges. Reuse `useDataView`.
- **Live build/validate logs** — streamed step-by-step over the existing task **WS event taxonomy**
  (`EventToolCall`/`EventThinking` machinery) repurposed for build steps. The premium CI/CD moment.
- **Deployment detail page** — image digest + source, env, bound connectors, scan/validation result,
  the live **reasoning trace** of its sandbox run, and the **capability/cost diff** on promote.
- Instant rollback, canary slider, governed promote gate — already shipped, re-skinned into this.

### 6.3 Scheduling (unchanged from P1; hyperscale in P6-C)

1. The orchestrator schedules the agent onto the **tenant's worker pool** (a dedicated Temporal
   task queue + harness deployment), warm-pooled like the browser/connector workers (P6-C).
2. A task for a hosted agent starts `HostedAgentWorkflow` with `ActivityOptions.TaskQueue` set to
   that tenant's queue, so `RunFrameworkStep` lands on the tenant's harness; governed activities
   stay on the shared Go worker.
3. Promote / rollback / canary reuse P5-B (a hosted agent version is just another deployable).

### 6.4 What gets a pod — authoring style × execution locus (don't conflate them)

"Should an agent built natively on the Actrone SDK also run on a per-tenant pool, and deploy the
same way?" The determinant is **not** "native vs BYOF" — it is **(a) is there *code* to run, and
(b) is it *hosted*.** Two independent dimensions:

**Authoring style — how the developer expresses the agent:**

- **Declarative manifest** (`agent.yaml`, no code): persona/tools/memory/governance as data; the
  shared Go kernel (`AgentTaskWorkflow` + governed activities) *provides* the loop. Nothing of the
  developer's executes — there is no image, no process.
- **Actrone-SDK code** (`framework: actrone_sdk`): the developer writes the loop themselves in
  Python/TS against the Actrone SDK (`ActroneClient`, governed gateway, `call_tool`/`actrone_tool`)
  — *not* a third-party framework, but still **code**.
- **Third-party framework** (`framework: langgraph|crewai|…`): a LangGraph graph, a CrewAI crew, etc.
  — also **code**.

**Execution locus — where the loop runs:**

- **Connected** — the loop runs in the *developer's own* process/infra and calls Actrone for governed
  inference/memory/tools. Applies to SDK-code and framework styles. **Nothing is deployed to us, no
  worker pool**; billed on the inference/memory/tool/routing meters. (Already shipped — the SDKs +
  gateway + D3 tools.)
- **Hosted** — the loop runs **on Actrone** as a durable Temporal execution. For a manifest, the Go
  kernel runs it (**no pod**). For **any code** (SDK-authored *or* framework), it runs in the Python
  **harness pod** on the tenant's worker pool. The harness is framework-agnostic by construction: it
  loads `spec.runtime.entrypoint` and hands it a `HostedContext` whose `.client` is an `ActroneClient`
  *specifically so an SDK-authored entrypoint can use the SDK* — so a hosted `actrone_sdk` agent is a
  first-class harness citizen, **identical in pod/pool/billing to a hosted BYOF agent**.

**So the corrected answer:** an agent authored on the Actrone SDK, **when hosted, absolutely runs on
a per-tenant worker pool exactly like BYOF** — same `actrone deploy`, image bundle, deployment
lifecycle, and per-pod GB-second billing ([monetization §15.8](./monetization-strategy.md)); the only
difference from a framework agent is the code inside the pod imports `actrone.*` rather than
`langgraph.*` (`framework: actrone_sdk`). The **only** style that never gets a pod is the *declarative
manifest* (no code to run): it deploys via the same lifecycle but **skips the Build step**
(`Validating → Live`, vs code's `Building → Validating → Live`) and runs on the shared Go kernel.

**Tenancy (shared vs dedicated) is a further, orthogonal choice:** hosted *code* is always a dedicated
per-tenant pod (arbitrary code must be isolated, egress-locked). A *manifest* agent defaults to the
shared Go kernel — it runs Actrone's own governed code over MAL-tokenised data, so MAL + per-env
isolation ([Infra §3](./Actrone_Infrastructure_and_Environments_Plan.md)) already cover most needs —
but a **dedicated single-tenant Go worker pool is offered as an Enterprise opt-in** (residency,
noisy-neighbour, compliance), on the same P6-C machinery. That dedicated-manifest pool is priced as
**reserved capacity, not** the per-task GB-second meter (a manifest has no per-task pod spin-up) — see
§15.8. The *deploy lifecycle* (version → preview → promote → rollback → canary → audit, one
`actrone deploy` verb, one `agents/[id]/deployments` surface) is **shared by all three styles**.

## 7. Isolation, concurrency, egress (hyperscale posture — P6-C)
- **Per-tenant worker pools** (own task queue, own harness pods); noisy-neighbour isolation.
  Provisioned on **EKS** — Fargate-default for per-task runs, EC2+Karpenter for warm/dedicated pools,
  scaled by **KEDA on Temporal queue depth**; see [Infra §4](./Actrone_Infrastructure_and_Environments_Plan.md)
  for the full compute-provisioning decision (and why ECS is rejected / why no GPU).
- **Concurrency caps:** Temporal worker `MaxConcurrentActivities` + per-tenant task-queue limits +
  the entitlements ceiling for the tenant's tier; quality/cost caps from
  [`internal/floors`](../backend/orchestrator/internal/floors/floors.go) (note: `floors` governs
  *quality/cost* floors, not concurrency — concurrency lives in the worker/task-queue config).
- **Egress isolation:** the harness pod's network policy allowlists **only** the Actrone gateway /
  tools / memory endpoints + any `spec.runtime.egress.allow` hosts; no arbitrary outbound. This is
  what makes "we run your loop" safe and is why governance can't be bypassed.
- **Bundle sandboxing:** distroless/rootless, read-only FS, seccomp, no extra capabilities; image
  digests pinned (the customer image is built `FROM` the Actrone harness base image — §6.1). Untrusted
  pods get microVM isolation: **Fargate** by default, or **gVisor/Kata** when scheduled on EC2 nodes
  (Infra §4.3).

## 8. Idempotency, caps, signals
- **Idempotency:** workflow ID = `{agent_id}:{idempotency_key}`; `RunFrameworkStep` is idempotent
  per `(task_id, step_index)` so a retried activity does not double-advance. Governed model/tool
  activities reuse their existing idempotency.
- **Spend/turn caps:** enforced by the Go workflow (`LimitsSpec`), with the forced tool-free
  wrap-up borrowed from the native loop when capped, so a hosted run always returns a final answer.
- **Human-in-the-loop:** a `approval_gate` boundary (or a DPE Tier-3 escalation on a tool) pauses
  the workflow on the existing escalation-signal path; approval resumes the next `RunFrameworkStep`.

## 9. Per-framework driver matrix (initial)
| Framework | Stepwise-durable | Encapsulated | Notes |
|---|---|---|---|
| **LangGraph** | ✅ (native checkpointer) | ✅ | flagship stepwise driver |
| OpenAI-Agents | ✅ (run hooks + shim) | ✅ | hooks give clean boundaries |
| AutoGen | ⚠️ (message-hook shim) | ✅ | stepwise after a checkpoint shim |
| CrewAI | ⚠️ (task-callback shim) | ✅ | encapsulated first |
| LlamaIndex | ⚠️ | ✅ | encapsulated first |
| DSPy | ⚠️ | ✅ | encapsulated first |
| Custom (`actrone` SDK agent) | ✅ | ✅ | already boundary-aware |

Everything ships **encapsulated** day one (universal governance + coarse durability); stepwise
lands per framework, LangGraph first.

> **Stepwise driver core ✅ SHIPPED (2026-06-20).** The `StepwiseDriver` +
> `StepwiseContext` boundary API (`src/actrone/harness/stepwise.py`) implement the
> replay-with-memoization engine: the checkpoint the Go workflow persists between boundaries is the
> ordered log of *resolved boundary results*; on every `run_framework_step` the driver replays the
> author loop, feeding each `await sctx.{model,tool,memory_retrieve,memory_write,approval}` call its
> memoized result in cursor order until the first unresolved call, which it raises as the next
> boundary. A fresh pod reaching the same boundary from the persisted log is the crash-resume
> guarantee (covered by `tests/unit/test_harness_stepwise.py`). The driver is **framework-agnostic
> by construction** — a framework "adopts" stepwise by routing its model/tool nodes through the
> boundary API rather than needing a bespoke checkpointer binding; the matrix's per-framework column
> is therefore about *which loops are author-controllable enough to route* (`StepwiseFrameworks =
> {langgraph, actrone_sdk, custom}`, enforced in `validateRuntime`; others run encapsulated). The Go
> boundary loop was already wired for it in P1, so no workflow reshaping was needed. *Still P2-pending
> (infra, infra-repo):* per-tenant warm pools + per-tenant task queues (needs P6-C data plane).

## 10. Observability
- Reuse the WS event taxonomy (`token`, `thinking`, `tool_call`, `tool_result`, `complete`) — the
  hosted loop publishes the same events from the governed activities, so the Trace Viewer works
  unchanged. Each `RunFrameworkStep` boundary + governed activity appends to the audit spine; a
  framework-emitted `reasoning` string flows into the `ReasoningTrace` (rune-safe, capped) exactly
  like native extended thinking.
- Metrics: per-tenant active hosted runs, step latency, checkpoint size, encapsulated-vs-stepwise
  ratio, crash-resume count.

## 11. Security
- Governance non-bypassable (§4) + egress allowlist (§7) are the core guarantees.
- No provider secrets in the harness — BYOK/managed resolution stays server-side at the gateway.
- Supply chain: pinned digests, `pip-audit`/SBOM on bundles, no network during build, signed images.
- Tenant code never shares a process across tenants; checkpoints are region-pinned (ties to the
  [Data Residency Plan](./Actrone_Data_Residency_Plan.md)).

## 12. Build phases
- **P1 — Encapsulated-any + the Go hosted workflow. ✅ SHIPPED (2026-06-19).**
  `HostedAgentWorkflow` (`internal/workflow/hosted_workflow.go`) + the `run_framework_step`
  contract (`RunFrameworkStepInput`/`Result`, `StepResume`, `MemoryOp`); `spec.runtime` manifest
  + deploy-time validation (`internal/agent/parser.go` `validateRuntime`); submit-time routing
  (`agentRuntimeLookup` → `resolveWorkflow`); Python harness with the **encapsulated** driver
  reusing `resolve_gateway` (`src/actrone/harness/`: `protocol`, `context`, `encapsulated`,
  `activity`, `worker`); caps (tool-call/cost/deadline) + DPE pre-check + audit. The boundary
  loop already handles all kinds (`done`/`model_request`/`tool_request`/`memory_op`/
  `approval_gate`) so stepwise (P2) slots in without reshaping the workflow. **Outcome:** any
  Python framework runs hosted, fully governed, workflow-retryable. *Remaining for full P1
  parity:* deploy/version path is P5-B; runs today on a single shared harness queue
  (`byof-harness`), per-tenant pools are P2.
- **P2 — Stepwise-durable driver ✅ SHIPPED (2026-06-20); per-tenant pools pending (infra).** The
  replay-with-memoization `StepwiseDriver` + `StepwiseContext` boundary API
  (`src/actrone/harness/stepwise.py`), parser enablement gated to `domain.StepwiseFrameworks`
  (`{langgraph, actrone_sdk, custom}`), activity dispatch (`activity.py` selects the driver on
  `strategy == "stepwise"`), and the full crash-resume/budget-exhausted/memoization test suite
  (`tests/unit/test_harness_stepwise.py`). Per-step activities + crash-resume work end-to-end on the
  existing Go boundary loop; Tier-3 `approval_gate` boundaries flow on the existing escalation path.
  *Remaining (infra-repo, needs P6-C):* per-tenant task queues + warm pools + per-tenant egress
  policy enforcement.
- **P3 — More stepwise drivers (OpenAI-Agents, AutoGen, CrewAI) + the TS harness** (Node temporalio
  activity worker, same contract) for JS/TS frameworks.

## 13. Dependencies & open questions
- **Hard deps:** P5-B (deploy/version/rollback path), P6-A (gateway routing to per-tenant pools),
  P6-C (worker pools + warm-pool + JetStream audit bus at scale).
- **Open questions:** (a) large-checkpoint spill format + GC; (b) whether to expose a thin
  *optional* `actrone.hosted` boundary API for "custom" agents that want first-class stepwise
  without a framework; (c) cold-start budget for tenant pools (pre-warm vs scale-to-zero);
  (d) cross-language idempotency-key propagation into the Python activity.

## 14. Testing strategy
- **Go:** `HostedAgentWorkflow` under `testsuite.WorkflowTestSuite` with a fake `RunFrameworkStep`
  emitting each boundary kind (model/tool/memory/approval/done); assert governed activities are
  called, caps enforced, crash-resume replays deterministically, Tier-3 pause/resume.
- **Python:** `AgentDriver` contract tests per framework (a scripted 2-tool LangGraph: stepwise
  yields the right boundaries + checkpoint round-trips; encapsulated routes inner calls through a
  stub gateway/authorize). Determinism: same input ⇒ same boundary sequence.
- **Integration:** a real LangGraph agent end-to-end against a test orchestrator; kill the harness
  mid-run and assert resume-from-checkpoint with no duplicated side effects.

---

*Last updated: 2026-06-19 · Design. Builds on the durable governed loop (P6-D slices 1–3) and the
connected D2/D3 seams; ready to implement once P5-B + P6-A/C land.*
