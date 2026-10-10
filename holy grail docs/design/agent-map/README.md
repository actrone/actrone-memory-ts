# Agent map design spec

Status: approved direction for M2, not built. Date: 2026-09-14. Plan: [Actrone_Agent_Map_Plan.md](../../Actrone_Agent_Map_Plan.md). Mockup: [agent-map.html](agent-map.html) (open in a browser; it renders the run view in both themes with the same tokens the app ships).

This spec defines how the agent map looks, moves and behaves: the run view (graph, waterfall, history playback, span drawer, tree view), the fleet map, the async states, and the React implementation constraints that keep a live graph fast. It inherits everything in CLAUDE.md §8.1.1 and [docs/branding.md](../../branding.md). If the build deviates from this file, update this file.

## Skills run for this spec

The CLAUDE.md §0.2.1 frontend skills were run before writing, and each shaped a specific part:

| Skill | What it decided here | Rejected on brand grounds |
| --- | --- | --- |
| `ui-ux-pro-max` | Dense dashboard density, 44 px touch hit areas, keyboard and focus rules, reduced motion, network graphs need a list alternative (accessibility grade D otherwise), skeleton over spinner | Fira Code and Fira Sans, slate palette with a green accent, oversized display type, categorical node colours, amber highlight path, Phosphor icons |
| `design` and `design-system` | Three-layer tokens: brand primitives, semantic tokens, then the `--map-*` component tokens below | Nothing |
| `dataviz` | One time scale shared by ruler and waterfall, thin marks, hairline solid gridlines, emphasis over categorical colour, table or tree equivalent for every chart, status never colour alone | 4 px rounded data ends (bars here are 10 px ranges, so 2 px) |
| `vercel-react-best-practices` | Dynamic import of the graph, event buffering in refs, transitions for non-urgent updates, deferred search, content-visibility on rows | Nothing |
| `web-design-guidelines` | Audit of the four existing surfaces (bottom of this file) and the interaction rules for the new ones | Title Case for headings and buttons |
| `artifact-design`, `artifact-diagramming` | Mockup construction and the edge labelling rule | Nothing |

The palette validator in `dataviz` measured the brand status colours as a set. Amber and green sit 5.7 apart under protanopia (target is 8), so state must always ship with an icon and a text tag. In the light theme the same hues measure below 3:1 against white, which led to the ink tokens below.

## Layout

The run view is one frame with six regions, top to bottom:

| Region | Contents | Size |
| --- | --- | --- |
| Run bar | Breadcrumb, run name in Geist Mono, state chips, duration, spans, tokens, cost, "Verify attestation", "Export OTLP" | Auto height, `--color-surface` |
| Toolbar | View switch (graph, tree), "Governance path only", span search, keyboard hint, zoom and fit | 46 px |
| Canvas and drawer | Graph canvas on the left, span drawer on the right | Canvas fills; drawer 360 px |
| Playback bar | Step back, play, step forward, speed, ruler with governance notches, readout | 64 px |
| Waterfall | Span rows against the same time scale as the ruler | 28 px rows, collapsible |

Breakpoints (CLAUDE.md §8.2 widths):

- **1440 px and up**: canvas and drawer side by side; drawer resizable from 320 to 520 px
- **1024 to 1439 px**: drawer opens as a sheet over the right of the canvas; it's a floating overlay, so `--shadow-overlay` is permitted
- **768 to 1023 px**: drawer is a bottom sheet at 60% height; waterfall collapses by default
- **Below 768 px**: tree view is the default, graph stays available for panning, playback bar stacks to one column

The mockup stacks the drawer under the canvas below 1360 px so both are reviewable in one page; that shortcut isn't the app behaviour.

State lives in the URL so every view is shareable: `?view=graph|tree&span=<span_id>&t=<seq>&gov=1&q=<text>`. Back and forward restore selection and playhead.

## Tokens

Components consume only the tokens below. No hex values appear outside the token layer.

### New semantic tokens: status ink

The shared `Badge` renders status text as `text-success`, `text-warning`, `text-destructive` and `text-info`. Those hues pass in the dark theme and fail WCAG AA in the light theme, so this spec adds ink tokens for any status used as text or as a thin mark. Measured contrast ratios:

| Token | Dark value | On `#111111` | Light value | On `#ffffff` | On `#fafafa` | Old light value on `#ffffff` |
| --- | --- | --- | --- | --- | --- | --- |
| `--color-success-ink` | `#22C55E` | 8.29 | `#15803D` | 5.02 | 4.81 | 2.28 |
| `--color-warning-ink` | `#F59E0B` | 8.79 | `#B45309` | 5.02 | 4.81 | 2.15 |
| `--color-error-ink` | `#EF4444` | 5.02 | `#B91C1C` | 6.47 | 6.20 | 3.76 |
| `--color-info-ink` | `#3B82F6` | 5.13 | `#1D4ED8` | 6.70 | 6.42 | 3.68 |

Wire these into `Badge` in the same change (plan item M0), since the failure affects every badge in the light theme today.

### Map component tokens

| Token | Maps to | Why |
| --- | --- | --- |
| `--map-canvas-bg` | `--color-bg` | Canvas is the base plane |
| `--map-grid-dot` | `--color-border-subtle` | 1 px dots every 24 px, a pan reference only visible when you move |
| `--map-node-bg` | `--color-surface` | Nodes are panels |
| `--map-node-border` | `--color-border` | Default 1 px |
| `--map-node-border-hover` | `--color-border-hover` | Hover |
| `--map-node-border-selected` | `--color-border-focus` plus `--glow-focused` | Selection is border plus inner glow, never 2 px unless that's the only selected item |
| `--map-node-border-running` | `--color-text-primary` | Running reads as a held ink border, no dot, no pulse |
| `--map-node-border-held` | `--color-warning-ink` | Waiting on approval |
| `--map-node-border-blocked` | `--color-error-ink` | Policy block or failure |
| `--map-node-future-opacity` | `0.28` | Spans after the playhead |
| `--map-node-dim-opacity` | `0.4` | Spans filtered out by search or governance path |
| `--map-edge` | `--color-text-dim` | 5.09:1 dark, 5.28:1 light; `--color-border-strong` measured 1.83:1 and fails WCAG 1.4.11 for meaningful graphics |
| `--map-edge-active` | `--color-text-primary` | Selected path |
| `--map-group-border` | `--color-border` | Sub-agent group outline |
| `--map-bar` | `--color-text-dim` | Completed span bar |
| `--map-bar-running` | `--color-text-primary` | |
| `--map-bar-held` | `--color-warning-ink` | |
| `--map-bar-blocked` | `--color-error-ink` | |
| `--map-playhead` | `--color-text-primary` | |
| `--map-node-width`, `--map-node-height` | `196px`, `56px` | Node height clears the 44 px touch minimum |
| `--map-rank-gap`, `--map-node-gap` | `72px`, `20px` | Rank gap fits an 8-character edge label |
| `--map-row-height`, `--map-bar-height`, `--map-bar-radius` | `28px`, `10px`, `2px` | Dense rows; radius scaled to bar height |
| `--map-drawer-width` | `360px` | |

## Nodes

A node is a 196 by 56 px panel: a 28 px icon well, the span name in Geist Mono 12/500 in `--color-text-primary`, a meta line in Geist Mono 11/400 in `--color-text-dim`, and a state tag on the right. Kind is carried by icon and label; colour never encodes kind.

| Kind | lucide icon | Name shows | Meta line shows |
| --- | --- | --- | --- |
| agent | `bot` | Agent name | `invoke_agent`, duration |
| chat | `message-square` | `chat · turn N` | Model id, tokens |
| tool | `wrench` | Tool name | Duration, policy verdict or redactions |
| context | `layers` | `context.assemble` | Admitted and dropped counts |
| memory | `brain` | `memory.retrieve` | Hit count, top score |
| policy | `shield-x` (block), `shield-check` (allow) | `policy.evaluate` | Policy version, verdict |
| approval | `user-check` | Approver role | Time held, decision |
| action | `receipt` | `action.commit` | Receipt hash, truncated |
| handoff | `git-branch` | Sub-agent name (group header) | Run id, duration |
| a2a | `globe` | Peer agent | Peer org, attestation state |
| mediaguard | `eye-off` | `mediaguard.scan` | Redaction count |

Allowed policy verdicts don't get their own node; they appear in the tool's meta line. Only `require_approval` and `block` become nodes, so the governance hops that matter are visible and routine allows add no clutter.

States use border, tag text and icon together:

| State | Border | Tag | Icon |
| --- | --- | --- | --- |
| ok | Default | None | None |
| running | `--map-node-border-running` | "running" | None |
| held | `--map-node-border-held` | "held" | `clock` |
| blocked | `--map-node-border-blocked` | "blocked" | `ban` |
| failed | `--map-node-border-blocked` | "failed" | `x` |
| future (after playhead) | Default at 0.28 opacity | None | None |

**Loop folds**: three or more consecutive calls to the same tool with the same argument shape fold into one node. Two offset 1 px outlines (4 px and 8 px) sit behind it, which reads as a stack without a shadow. The meta line reads "3 attempts · 2 retried". Enter or click expands the fold in place.

**Groups**: a sub-agent run is an ELK compound node with a 1 px border, 8 px radius and a 30 px header in Geist Mono 11 ("sub-agent · vendor-matcher · run 0198f3b7"). The header is a button that selects the group and toggles collapse to a single handoff node.

## Edges

Edges follow causality, not only OTel parentage. A tool span is drawn as a child of the chat turn whose `tool_call_id` requested it, even though OTel parents both under `invoke_agent`; the normalizer records the link.

- Orthogonal routing (`elk.edgeRouting: ORTHOGONAL`), bend 16 px after the source, 6 px corner radius, 8 px arrowhead
- 1 px `--map-edge`; the selected span's ancestor path and its direct children switch to 1.5 px `--map-edge-active`
- Labels only on governance hops, in Geist Mono 11 `--color-text-dim`: `approval`, `commit`, `evaluate`, `handoff`. Parent-to-child edges are unlabelled and explained once in the canvas legend
- Edges to spans after the playhead drop to 0.25 opacity with their labels

The dot grid is functional: it's the only fixed reference while panning a canvas with no other landmarks. It stays at `--color-border-subtle` so it disappears at rest. This is a design call for review; if it reads as decoration, remove it and keep the minimap as the only reference.

## Waterfall

Rows are in depth-first order with children sorted by start time, matching the tree view.

- Label column 280 px, indent 14 px per depth level, lucide icon 12 px, name in Geist Mono 12, duration right-aligned in Geist Mono 11 with tabular figures
- Bars 10 px tall, 2 px radius, 2 px minimum width; colours from the bar tokens
- One time scale for the ruler and the waterfall. Ticks use steps of 1, 2 or 5 times a power of ten, targeting 5 to 7 ticks, with the run end labelled at the right edge
- Gridlines are solid 1 px `--color-border-subtle`; the playhead is 1 px `--map-playhead`
- Rows use `content-visibility: auto` with `contain-intrinsic-size: 0 28px`; switch to `@tanstack/react-virtual` only if a measured run passes 2,000 rows

## History playback

Playback redraws the run from the run log exactly as it happened; it never re-executes. Forking is a separate, confirmed action.

- **Controls**: previous span start, play or pause, next span start, speed (1x, 2x, 5x, 10x), and a "skip idle" option that compresses gaps over 2s to 0.5s and labels them on the ruler
- **Ruler**: a native `input type="range"` (keyboard and screen reader support for free), 2 px track, 12 by 16 px thumb with 2 px radius. `aria-valuetext` reads "41.6 seconds, event 27 of 30"
- **Governance notches**: icon buttons above the ruler for redactions (info), approval holds (warning), signed commits (success) and blocks (error). Each has an `aria-label`, and clicking one jumps the playhead and selects the span. Notches closer than 24 px cluster into one button with a count
- **Readout**: "41.6s · event 27 of 30 · replay" in Geist Mono 12. It's `aria-live="off"` while playing and `polite` when paused, so screen readers aren't flooded
- **Live runs**: the readout says "live" as text, the playhead follows the newest event, dragging back pauses following, and a "Return to live" button appears. No dot, no pulse
- **Legacy runs**: a neutral "reconstructed" chip and an explanation of what wasn't recorded

| Key | Action |
| --- | --- |
| Space | Play or pause (when focus is on the canvas or page) |
| `,` and `.` | Previous and next span start |
| `f` | Fit graph to view |
| `/` | Focus span search |
| Arrow keys | Move between nodes: left to parent, right to first child, up and down between siblings |
| Enter | Open the selected span in the drawer |
| Escape | Close drawer or confirmation |

## Span drawer

Governance comes first in the drawer because it's what no other trace tool shows. Sections appear only when they have content:

1. Header: kind icon, kind and seq, name in Geist Mono 14, state chip
2. Governance: decision, policy version, rule, reason, whether a write was attempted
3. Signed receipt (actions): outcome, risk class, hash, previous hash, signature validity, reversibility window
4. Call or prompt: parameters in a Shiki `actrone-dark` block (brightness only), or a hidden-content panel with "Request auditor reveal"
5. Context ledger (chat): admitted and dropped items with reasons
6. Timing and usage: start, duration, tokens, cost
7. Trace: span id, parent span, trace id
8. Actions: "Fork from here" (tool, chat, policy), "Verify receipt" (action), "Copy span link"

"Fork from here" opens an inline confirmation, since forking re-runs governed work: "Fork re-runs this task from seq 13 under the current policy. Governed writes are evaluated again, and the new run links back here." Buttons: "Fork run" (primary) and "Cancel". After confirming, the drawer shows the new task id and the map draws the child run as a linked group.

## Tree view

The tree is the accessible equivalent of the graph and the default below 768 px. It follows the WAI-ARIA tree pattern: `role="tree"`, `treeitem` with `aria-level`, `aria-expanded` and `aria-selected`, roving `tabindex`, Up and Down to move, Left and Right to collapse and expand, Home and End, Enter to select. Selection syncs with the graph, waterfall and drawer.

## Fleet map

The fleet map reuses the node vocabulary for agents, tools, connectors and peer orgs over a time range.

- Filter row above the graph, date range first, presets before custom (last 24 hours, 7 days, 30 days)
- Edge width encodes call volume in three buckets (1, 2 and 3 px) with a legend; magnitude never uses colour
- Error rate appears as an edge label, and the edge turns `--color-error-ink` only when it breaches the SLO
- A table view (source, target, calls, errors, blocks, cost, p95) is required, because network graphs alone aren't accessible
- Selecting an edge opens a drawer with a single-series latency sparkline: 2 px line in `--color-text-muted`, 8 px endpoint marker, hover crosshair, no legend box
- While data refetches, the previous render stays at reduced opacity; no skeleton flash
- Render with React Flow; move to Sigma.js on WebGL only if real tenants pass 2,000 visible nodes

## Motion

Control Tower motion stays functional (design prompt §19). Every animated property is `opacity` or `transform`.

| Element | Motion | Duration | Reduced motion |
| --- | --- | --- | --- |
| Node appears (live) | Opacity 0 to 1, once on mount | 120 ms linear | Instant |
| Layout change | Node transform to new position | 200 ms `--ease-out` | Instant |
| State change (running, held, blocked) | Border colour, held | 100 ms linear | Instant |
| Hover | Border colour and inner glow | 100 ms linear | Instant |
| Drawer or sheet | Opacity plus 8 px translate in; exit at 70% of enter | 200 ms in, 140 ms out | Instant |
| Playhead | Follows playback time each frame | User-driven | Unchanged (user-initiated) |
| Live values (tokens, cost, elapsed) | None, instant update | n/a | n/a |

No pulses, pings, breathing dots or animated counters anywhere in the map.

## Async states

Every state keeps the frame so nothing shifts when data arrives:

| State | Treatment | Copy |
| --- | --- | --- |
| Loading snapshot | Static skeleton in the last layout's node positions | None |
| Queued run | Empty canvas with a neutral chip | "Queued. The map draws as soon as the run emits its first span." |
| Reconstructed run | Map plus "reconstructed" chip | "This run predates the run log. Tool calls, approvals and signed writes are shown; prompts and model calls were not recorded." |
| Reconnecting | Readout text changes to "reconnecting…" | None |
| Events missing | Warning-bordered banner above the canvas | "Events 41 to 48 didn't arrive. The graph between them may be incomplete." Button: "Reload snapshot" |
| Content hidden | Dashed-border panel in the drawer | "Prompt content is redacted by this agent's capture policy. Revealing it needs an auditor and is recorded." Button: "Request auditor reveal" |
| Load error | `ErrorState` with request id | "Couldn't load this run. The server returned an internal error. Retry, or send the request id to support." Button: "Retry" |
| No permission | `EmptyState` | "You don't have access to this run. Ask an org admin for task read access." |

## Implementation notes

These follow from `vercel-react-best-practices` and the existing app conventions:

- The route `app/(app)/tasks/[taskId]/map/page.tsx` is a Server Component that fetches the snapshot with the server API client (CLAUDE.md §5.2) and passes only folded spans to the client, never content blobs
- The map client component loads with `next/dynamic` and `ssr: false`, keeping `@xyflow/react` and `elkjs` out of the route's initial bundle
- `elkjs` runs in a Web Worker. Layout reruns at most every 500 ms and only when topology changes; state-only events never trigger layout
- SSE events land in a ref buffer and flush once per animation frame inside `startTransition` into a `zustand` store keyed by span id
- Node components are memoized and read their own span through a selector, so one event re-renders one node
- The playhead position lives in a ref and a CSS custom property on the waterfall, so scrubbing and playback don't re-render React per frame
- Span search uses `useDeferredValue`
- The only new dependencies are `@xyflow/react` and `elkjs`, pinned to exact versions in the M2 change

## Accessibility checklist

- [ ] Tree view reaches every span and action the graph does
- [ ] Every node, notch, zoom control and drawer action is a `button` with a visible `:focus-visible` outline
- [ ] State is always tag text plus icon, never colour alone
- [ ] Status text uses the ink tokens; contrast is at least 4.5:1 in both themes
- [ ] Edges and meaningful marks are at least 3:1 against the canvas
- [ ] Touch targets are at least 44 px on coarse pointers
- [ ] Live regions stay quiet during playback
- [ ] Reduced motion removes every non-user-initiated animation, including SVG animations the global CSS rule doesn't reach
- [ ] Verified at 375, 768, 1280 and 1920 px in both themes

## Audit of existing surfaces

The findings below come from `web-design-guidelines` plus the brand lock, run on 2026-09-14 against the four surfaces the map replaces or touches. The plan maps each to a phase.

### frontend/apps/control-tower/src/components/features/TraceViewer.tsx

- `TraceViewer.tsx:119`: activities fetch error swallowed by `.catch(() => {})`; no error state
- `TraceViewer.tsx:126`: polls every 3s regardless of visibility
- `TraceViewer.tsx:140`: "Replay from here" posts to a route that doesn't exist; failure isn't surfaced
- `TraceViewer.tsx:187-199`: tabs lack `role="tablist"`, `role="tab"` and `aria-selected`; no `focus-visible` ring
- `TraceViewer.tsx:198`: Title Case labels "Event Stream", "Activity Graph"; the "graph" is a list
- `TraceViewer.tsx:203-207`: pulsing live dot (`animate-ping`), forbidden by the brand
- `TraceViewer.tsx:232-242`: `rounded-full` state circle with an inner status dot
- `TraceViewer.tsx:245`, `:248`: lucide icons missing `strokeWidth={1.5}`
- `TraceViewer.tsx:350`: infinite `animate-pulse` caret
- `TraceViewer.tsx:404-405`: staggered entrance on every data row; the design prompt allows a 120 ms mount fade with no stagger on data
- `TraceViewer.tsx:441-447`: `div` content nested inside `button` (invalid phrasing content)
- `TraceViewer.tsx:445`: em dash in `aria-label`
- `TraceViewer.tsx:541`: hardcoded `▾` glyph instead of lucide `ChevronDown`
- `TraceViewer.tsx:416-421`: unbounded `pre` for tool params; needs a max height with scroll

### frontend/apps/control-tower/src/components/features/replay/TaskReplayConsole.tsx

- `TaskReplayConsole.tsx:46`, `:48`, `:209`, `:213`: em dash used as the empty placeholder
- `TaskReplayConsole.tsx:59`: only the latest 50 tasks, no search or pagination
- `TaskReplayConsole.tsx:78`, `:138`, `:158`, `:177`: lucide icons missing `strokeWidth={1.5}`
- `TaskReplayConsole.tsx:100`, `:209`, `:213`: `toLocaleString` and `toLocaleTimeString` instead of `Intl.DateTimeFormat`
- `TaskReplayConsole.tsx:106`, `:114`: selected task and step not in the URL
- `TaskReplayConsole.tsx:120`: timeline sourced from Temporal history, which expires after the namespace retention (7 days in dev)

### frontend/apps/control-tower/src/components/features/chat/ToolCallTimeline.tsx

- `ToolCallTimeline.tsx:4`, `:14`: em dashes in doc comments
- `ToolCallTimeline.tsx:106`: `rounded-full` state circle
- `ToolCallTimeline.tsx:120-125`: static running dot, forbidden by the brand
- `ToolCallTimeline.tsx:126-128`, `:169`: lucide icons missing `strokeWidth={1.5}`
- `ToolCallTimeline.tsx:55`: hardcoded duration format

### frontend/apps/control-tower/src/app/(app)/coordination/page.tsx

- `page.tsx:26`: capabilities fetch error swallowed
- `page.tsx:39`: polls every 3s regardless of visibility
- `page.tsx:46`, `:60`: Title Case "MACP Visualiser"
- `page.tsx:110`: Title Case "Capability Registry"
- `page.tsx:139`, `:143`: `rounded-full` bars; `transition-all duration-500` animates `width`
- `page.tsx:171-184`: grid layout labelled force-directed; nodes past the fourth row fall outside the fixed 500 px viewBox and are clipped
- `page.tsx:191`: graph has no list or table alternative
- `page.tsx:246-255`: SVG `g role="button"` handles Enter but not Space and has no focus style
- `page.tsx:257-262`: infinite SMIL pulse ring; the global reduced-motion CSS rule doesn't stop SMIL
- `page.tsx:279`: initials forced to uppercase
- `page.tsx:343`: hardcoded `✕` glyph; close button has no focus style and a small hit area
- `page.tsx:357-363`: Title Case labels "Agent ID", "Msgs Sent", "Msgs Received"
- `page.tsx:364`: `toLocaleTimeString` instead of `Intl.DateTimeFormat`

### frontend/packages/ui/src/ui/Badge.tsx

- `Badge.tsx:8-11`: status variants use raw status hues as text; all four fail WCAG AA in the light theme (see the ink token table)
