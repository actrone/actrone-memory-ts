# Premium Chat Interface Plan

**Version 1.0 — June 2026 · ✅ SHIPPED as Master-Plan P2 (governed chat at `/agents/[id]/chat` — reasoning/thinking stream, tool-call timeline, governance overlay, per-turn reasoning-effort). This doc captures the original analysis; authoritative status: [Platform Evolution §0a](./Actrone_Platform_Evolution_Master_Plan.md#0a-implementation-status-verified-2026-06-24).**

> **Status refreshed 2026-07-13 (code-verified):** the core components this plan names are confirmed
> present in `frontend/apps/control-tower/src/components/features/chat/` — `AgentChat.tsx`,
> `ArtifactPanel.tsx`, and `ThinkingStream.tsx` all exist, matching §5's "new components" list. Did
> not re-verify every sub-feature (KaTeX/Mermaid rendering, artifact versioning/diff, slash commands)
> at this pass — **(unverified 2026-07-13)** for those specifics; the top-level SHIPPED claim and
> component inventory check out.

> A best-in-class, enterprise-premium chat surface for interacting with Actrone
> agents — everything Claude/OpenAI have (streaming, reasoning, tool use,
> artifacts, formatting), plus a governance overlay only Actrone can offer.

---

## 1. Where chat fits

Two entry points, one component:

- **Agent Playground** (`/agents/[id]/chat`) — talk to a specific deployed agent under its persona, capabilities, governance, and connectors.
- **Sandbox chat** (onboarding / pre-deploy) — try an agent against synthetic data before deploying (ties to the EMAOP onboarding sandbox).

Both render the same `<AgentChat>` surface. The backend already streams over WebSocket (`ws.Broker`, the Trace Viewer consumes token/tool/memory events) — the chat reuses that stream rather than inventing a new transport.

---

## 2. The unfair advantage: a governance-native chat

Claude and OpenAI chats are ungoverned. Actrone's chat can render, inline, what no competitor can:

- **PII tokenisation indicator** — a subtle badge when MAL tokenised a value before inference ("3 fields protected"), with a hover showing classifications (never the raw value).
- **DPE verdict chips** — when a tool call or the turn was evaluated, show approved / escalated / blocked inline with the matched rule.
- **Reasoning trace** — the 6-step `audit.ReasoningTrace` rendered as the "thinking" stream (trigger → context → tokenisation → inference → evaluation → action).
- **Cost + model meter** — per-turn cost, model used, tokens, latency — live.
- **Audit link** — "view this turn in the Audit Log" (deep-link to the tamper-evident record).

This reframes "thinking/reasoning display" from a novelty into a **compliance feature** — the single most differentiated thing about Actrone chat.

---

## 3. Anatomy

```
┌───────────────────────────────────────────────┬───────────────────┐
│  Thread (messages)                             │  Artifact panel   │
│   ┌─ user bubble                               │  (opens on demand)│
│   ├─ assistant turn                            │   • code (Shiki)  │
│   │    ▸ Thinking ▾  (collapsible reasoning)   │   • markdown doc  │
│   │    ▸ Tool calls timeline                   │   • HTML preview  │
│   │    ▸ Response (rich markdown)              │   • table / CSV   │
│   │    ▸ governance chips · cost · audit link  │   • diagram       │
│   └─ …                                          │  versioned + copy │
│  ─────────────────────────────────────────────│  / download       │
│  [ persona avatar ] composer · attach · ⌘↵     │                   │
└───────────────────────────────────────────────┴───────────────────┘
```

### 3.1 Persona (user-chosen, per agent)
Reuse the Agent Studio persona model: **avatar icon/illustration, accent colour, name, tone**. The chat header + assistant bubbles render the agent's avatar + colour. Avatar sources (see [Integrations & Capabilities](./Actrone_Integrations_and_Capabilities_Plan.md) §6): a **DiceBear** style picker, a **Lucide** icon picker, or an **uploaded image** — with a colour swatch. Persona is set in Agent Studio and editable from the chat header.

### 3.2 Reasoning / thinking stream
- A collapsible **"Thinking"** section per assistant turn, streamed live as the model reasons (where the provider exposes reasoning) and/or assembled from the 6-step reasoning trace.
- **Premium process loader** while thinking: a brand-consistent animated indicator (shimmer + the brand chevron pulsing), not a generic spinner. Distinct loaders for: *connecting*, *thinking*, *calling a tool* (named, e.g. "Querying Salesforce…"), *streaming*, *finalising*.
- Respects `prefers-reduced-motion`; collapses by default once the answer arrives (expandable).

### 3.3 Tool-call timeline
Each tool call renders as a step: tool name + official integration icon, arguments (collapsed), status (running/success/blocked), duration, and — for governed/browser tools — the MAL interception + DPE verdict. Mirrors the Trace Viewer but inline.

### 3.4 Response formatting & rich rendering
Enterprise-grade markdown + rich content:
- **Markdown (GFM)** — headings, lists, tables, blockquotes, task lists.
- **Code** — Shiki syntax highlighting (already a dep), per-block copy, language label, line numbers, optional wrap. Inline code styled.
- **Math** — KaTeX for LaTeX.
- **Diagrams** — Mermaid (flow, sequence, gantt) rendered safely.
- **Tables** — sortable, copy-as-CSV, sticky headers (reuse `Table` primitives).
- **Citations / sources** — when an agent cites a retrieved memory or web result, render a footnote chip linking to the source/memory.
- **Files & images** — render returned images/files; safe rendering, lazy-loaded.
- **Streaming-safe** — partial markdown renders progressively without layout thrash (incremental parser).

### 3.5 Artifacts / canvas (Claude-artifacts grade, better)
When the agent produces a substantial structured output (code file, document, table, HTML), it opens a **right-side artifact panel** instead of cluttering the thread:
- Types: code, markdown doc, runnable HTML preview, data table/CSV, diagram.
- **Versioned** — each revision tracked; diff between versions; revert.
- **Actions** — copy, download, open-in-new, and (for code) "copy as file".
- **Live preview** — HTML/markdown rendered; code with a "run in sandbox" path (future).
- Collapses to a chip in the thread; reopen anytime.
- Governance-aware: an artifact built from tokenised data shows the protection badge.

### 3.6 Composer
- Multiline, ⌘/Ctrl+↵ to send, attach files/images, slash-commands (e.g. `/clear`, `/persona`, `/tools`), token/cost preview, stop-generation, regenerate, edit-and-resend.
- Per-environment + per-agent context shown (you are chatting with *Finance Approver* in *Production*).

---

## 4. Premium loaders & motion (brand system)

A small, reusable loader library, all token-driven and brand-consistent:
- **ProcessLoader** — staged ("Connecting → Thinking → Calling {tool} → Writing"), each stage with the brand chevron pulse + shimmer.
- **StreamingCursor** — a refined blinking caret in brand accent.
- **SkeletonTurn** — for thread hydration.
- **ToolCallPulse** — per-tool running indicator with the integration icon.
All respect reduced-motion (degrade to opacity fades) and use `--duration-*`/`--ease-*` tokens.

---

## 5. Architecture & reuse

| Concern | Reuse |
|---|---|
| Transport | Existing WebSocket `ws.Broker` + the token/tool/memory/complete event types already consumed by the Trace Viewer |
| Reasoning | `audit.ReasoningTrace` (6-step) → thinking panel; `ReasoningTracePanel.tsx` already models it |
| Code/markdown | `CodeBlock` (Shiki), `prose-docs` styles from docs |
| Tables | `components/ui/Table` primitives |
| Persona | Agent Studio persona model + the avatar library (DiceBear/Lucide/upload) |
| Governance chips | entitlements + DPE/MAL verdicts from the audit stream |
| Design | tokens, materials, `Card`, `Badge`, motion utilities |

New components (frontend): `AgentChat`, `ChatThread`, `ChatTurn`, `ThinkingStream`, `ToolCallTimeline`, `ArtifactPanel` (+ `CodeArtifact`/`DocArtifact`/`HtmlArtifact`/`TableArtifact`), `ChatComposer`, `ProcessLoader`, `MarkdownRenderer` (GFM+KaTeX+Mermaid+citations). New deps to vet: a markdown renderer (e.g. `react-markdown` + `remark-gfm` + `rehype` sanitiser), `katex`, `mermaid` — all pinned, all behind a sanitiser (untrusted model output must be XSS-safe).

---

## 6. Security & quality bars

- **XSS-safe rendering** — sanitise all model-generated HTML/markdown (allowlist), sandbox HTML artifact previews in an iframe with a strict CSP. This is critical: model output is untrusted.
- **No raw PII** — the chat shows detokenised final output (per the MAL pipeline) but flags what was protected; intermediate/tool content stays tokenised.
- **A11y** — full keyboard nav, ARIA roles on the thread/composer, focus management on artifact open, contrast ≥ AA, reduced-motion.
- **Performance** — virtualise long threads; stream without reflow; code-split KaTeX/Mermaid/Shiki out of the critical path.
- **States** — loading, empty ("start a conversation"), error (with retry + request id), stopped, rate-limited — all designed.

---

## 7. Phasing

1. **MVP** — thread + streaming + markdown/code + persona + process loaders + basic tool timeline + governance chips. (Reuses the WS stream.)
2. **Artifacts** — right-side panel (code/doc/table), versioning, copy/download.
3. **Rich content** — KaTeX, Mermaid, citations, image/file rendering, HTML sandbox preview.
4. **Power features** — slash commands, edit/regenerate, attachments, voice (ties to the `voice` package), multi-agent threads.

---

*Last updated: 2026-06-10 · Planning only.*
