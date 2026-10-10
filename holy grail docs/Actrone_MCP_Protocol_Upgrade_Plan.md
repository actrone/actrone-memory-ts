# Actrone MCP Protocol Upgrade Plan (2026-07-28 spec)

> Upgrades Actrone's MCP client and server implementations (`internal/mcp`, `internal/mcphub`) to the
> final 2026-07-28 Model Context Protocol specification, closes a live OAuth vulnerability class the
> current implementation has no defense against, and closes an already-known governance gap on the
> MCP-server-exposure path. Related: `Actrone_Competitive_Parity_Improvements_Plan.md` Part G (owns the
> "who may expose an agent as an MCP server, under what tool allowlist" governance design; this plan owns
> the wire-protocol version this exposure runs on, the two are the same underlying work viewed from
> different angles). `Actrone_Native_SDK_And_A2A_Compliance_Plan.md` Part B (the adjacent A2A 0.3.0 → 1.0
> upgrade; a separate protocol, not in scope here).

---

## 0. TL;DR

1. **MCP's 2026-07-28 revision shipped as final on 2026-07-28.** Actrone's own code anticipated it
   (`internal/mcp/types.go:51-54` names it explicitly as "in release-candidate, not yet final" and leaves
   a bump instruction), but the upgrade was never executed. It is no longer a future concern.
2. **Four real code changes, not a rewrite.** `internal/mcp/client.go` and `server.go` are built around the
   old stateful `initialize`/`Mcp-Session-Id` model; `internal/mcphub/oauth.go` has no issuer validation.
   None of this requires re-architecting `mcphub`'s tenant/connection governance layer, that layer sits
   above the wire protocol and is untouched by this upgrade.
3. **One finding is a live security gap, not just a spec-compliance item.** `oauth.go` performs zero RFC
   9207 issuer (`iss`) validation today, closing an authorization-server mix-up vulnerability class the new
   spec formalizes. This should ship first and independently of the rest of the migration.
4. **One finding confirms an already-planned fix, doesn't create a new one.** `internal/mcp/server.go:138-140`
   carries an explicit comment: *"The Tool-Call Supervisor is not invoked here, MCP server calls are from
   trusted external MCP clients; governance runs on the agent task level."* This is the exact gap
   `Actrone_Competitive_Parity_Improvements_Plan.md` §7 (Part G) already scoped to close. This plan
   sequences the wire-protocol work that gap-closure depends on; it does not duplicate Part G's governance
   design.
5. **Actrone's governance layer is not eroded by the new spec, because it isn't the same layer.** The
   2026-07-28 hardening (issuer validation, stateless scalability, credential binding) fixes
   protocol-correctness and infrastructure problems. It has no equivalent of `mcphub`'s least-privilege tool
   allowlists, rug-pull detection (`ToolPins`), vaulted credentials, org-admin approval workflow, or
   tamper-evident audit log. Nothing here is a "the spec now does what we do" situation; it's orthogonal
   infrastructure Actrone still sits its governance on top of, detailed in §5.
6. **Deprecation of Sampling/Roots/Logging costs Actrone nothing.** `ClientCapabilities`
   (`internal/mcp/types.go:78-81`) only ever declared `Tools` and `Resources`, confirmed by reading the
   code. Actrone skipped building the exact three things the new spec just deprecated, there is nothing to
   migrate away from.

---

## 1. Motivation

- **Interoperability risk grows every month this sits unshipped.** External MCP servers and clients (Claude
  Desktop, Cursor, third-party catalog entries in `mcphub`'s catalog) will adopt 2026-07-28 semantics at
  their own pace; Actrone's client needs to keep working against both old and new servers, and its server
  needs to keep serving both old and new external clients, during that transition. Waiting doesn't reduce
  the work, it just delays it into a period when more of the ecosystem has already moved.
- **The issuer-validation gap is a real, present vulnerability, not a future one.** An authorization-server
  mix-up attack is possible against `oauth.go` today, independent of whether the rest of this plan ships.
- **Part G (Competitive Parity plan) cannot honestly claim governed MCP server-exposure while
  `server.go`'s own comment says the Tool-Call Supervisor is skipped on that path.** This plan is the
  prerequisite wire-protocol work; Part G's tool-allowlist and inbound-governance design is the layer built
  on top of it once this lands.
- **The stateless core is a genuine, uncomplicated scalability win Actrone doesn't have yet.** Removing
  per-connection session affinity means any orchestrator instance behind the load balancer can serve any
  MCP request, which the current session-ID-replay design in `client.go` doesn't allow for outbound calls,
  and the current handshake-per-connection design in `server.go` doesn't allow for inbound ones.

---

## 2. Current state, verified directly from the code

| Component | File | State |
| --- | --- | --- |
| Protocol version pin | `internal/mcp/types.go:55` | `ProtocolVersionLatest = "2025-11-25"`, with an explicit forward-looking comment already naming the 2026-07-28 RC and instructing a future bump. |
| Client capabilities | `internal/mcp/types.go:78-81` | Only `Tools` and `Resources` ever declared. No `Sampling`, `Roots`, or `Logging`, the exact three the new spec deprecates. |
| Outbound client | `internal/mcp/client.go:113-151, 262-317` | Classic stateful flow: `initialize` handshake, caches `negotiatedVersion` and a server-assigned `Mcp-Session-Id`, replays the session id on every subsequent request. No `_meta`, no `Mcp-Method`/`Mcp-Name` headers, no MRTR, no `server/discover`. |
| Inbound server | `internal/mcp/server.go:91-121, 138-140` | `supportedProtocolVersions` map stops at `"2025-11-25"`. Handles `initialize`/`tools/list`/`tools/call` only. Explicit comment confirms the Tool-Call Supervisor is **not** invoked on inbound calls today. No `server/discover`, no Tasks, no MCP Apps. |
| OAuth | `internal/mcphub/oauth.go` (215 lines) | PKCE authorization-code flow (RFC 7636). No `iss` issuer validation (RFC 9207/SEP-2468), no `application_type` on DCR requests (SEP-837), no CIMD awareness. |
| Client-connection governance | `internal/mcphub/connection.go`, `service.go`, `catalog.go`, `security.go`, `ssrf.go`, `vault.go`, `tier.go` | Mature and unaffected by this upgrade: `Connection` domain model with `StatusRequested`/`StatusQuarantined` org-admin approval workflow, `ToolPins` rug-pull detection, encrypted vaulted credentials, SSRF guard, tier gating. This is tenant-config state persisted in Postgres, a different kind of state than the wire-protocol session affinity the new spec removes, and does not need to change for this upgrade. |

---

## 3. What changed in the 2026-07-28 spec

Verified against the official spec release post and a migration guide (see Sources).

- **Stateless protocol core (SEP-2575/2567).** The `initialize`/`initialized` handshake and
  `Mcp-Session-Id` header are removed. Every request is self-contained: client identity and capabilities
  travel in a `_meta` field on each JSON-RPC request rather than being negotiated once at connection time.
  Any request can land on any server instance behind a plain round-robin load balancer, no shared session
  storage required. Application-level state that genuinely needs to persist across calls is carried as a
  tool-returned handle the caller passes back as an argument, not as connection affinity.
- **Multi Round-Trip Requests, MRTR (SEP-2322).** Replaces the old server-initiated bidirectional callbacks
  (`elicitation/create`, `sampling/createMessage`, `roots/list`) with a stateless pattern over plain HTTP: a
  server returns `resultType: "input_required"` naming what it needs, the client retries the original call
  with `inputResponses` attached. Enables mid-call user confirmation or missing-parameter collection without
  an open bidirectional stream.
- **Header-based routing (SEP-2243).** Streamable HTTP requests now carry `Mcp-Method` and `Mcp-Name`
  headers, so a gateway, rate limiter, or WAF can route and authorize on header inspection alone, without
  parsing the JSON-RPC body.
- **Cacheable list results (SEP-2549).** `tools/list`, `prompts/list`, `resources/list`, and
  `resources/read` responses now carry `ttlMs` and `cacheScope`, explicit client-side caching directives
  that survive reconnection.
- **Authorization hardening.** RFC 9207 issuer (`iss`) validation (SEP-2468): the authorization server must
  return `iss`, and the client must validate it before redeeming a code, closing an auth-server mix-up
  vulnerability. Dynamic Client Registration gains `application_type` for correct `localhost` redirect
  handling on desktop/CLI clients (SEP-837), but DCR itself is formally deprecated in favor of Client ID
  Metadata Documents (CIMD), remaining functional during the transition. Client credentials are bound to
  their issuing authorization server, no cross-server reuse (SEP-2352).
- **Formal extensions framework.** Tasks graduates from experimental core status to the
  `io.modelcontextprotocol/tasks` extension: poll-based `tasks/get` plus a new `tasks/update` (SEP-2663);
  `subscriptions/listen` replaces long-lived HTTP GET endpoints for change notifications, opt-in per
  notification type. Two further named extensions: **MCP Apps** (interactive HTML UI rendered inside a
  chat/agent surface) and **Enterprise Managed Authorization (EMA)**.
- **Deprecations, 12-month minimum offramp (SEP-2577).** Roots, Sampling, and Logging are formally
  deprecated (earliest removal 2027-07-28); the legacy HTTP+SSE transport is deprecated in favor of
  Streamable HTTP on the same one-year timeline. All remain functional during the transition.
- **Optional `server/discover` RPC** lets a client learn server capabilities on demand rather than caching
  them from a handshake that no longer exists.
- **SDK support.** All four Tier 1 SDKs (TypeScript, Python, Go, C#) support 2026-07-28; Rust is beta.

---

## 4. Design

### 4.1 Wire types (`internal/mcp/types.go`)

- Bump `ProtocolVersionLatest` to `"2026-07-28"`.
- Add a `Meta json.RawMessage` (`json:"_meta,omitempty"`) field to the request-params types that need it
  (`ToolCallParams`, and a new stateless-mode replacement for `InitializeParams`), carrying client identity
  and capabilities per-request instead of once at handshake time.
- Add `TTLMs int64` / `CacheScope string` (`json:"ttlMs,omitempty"` / `json:"cacheScope,omitempty"`) to
  `ToolsListResult` and any resource/prompt list result types.
- Add the `Mcp-Method` / `Mcp-Name` header name constants alongside the existing `MethodX` constants, for
  use by both client and server.
- Leave `Sampling`/`Roots`/`Logging` capability fields absent, matching current state; no deprecation
  cleanup needed since they were never added (§0.6).

### 4.2 Outbound client (`internal/mcp/client.go`)

- Add a **stateless request path**: build each request with `_meta` carrying client identity/capabilities,
  set `Mcp-Method`/`Mcp-Name` headers, and stop relying on a cached `negotiatedVersion`/`sessionID` pair for
  servers that advertise `2026-07-28`.
- **Keep the existing handshake-and-session-replay path as the negotiated fallback** for servers that only
  speak `2025-11-25` or earlier (§7, dual-version negotiation), Actrone's catalog of external MCP servers
  will not all upgrade on the same day.
- Add `server/discover` as an on-demand capability lookup, replacing the current pattern of caching
  capabilities from the `initialize` response for stateless-mode servers.
- Add MRTR handling: recognise `resultType: "input_required"` on a `tools/call` response and support
  resubmitting with `inputResponses`. Not required for a first cut against servers that never return it, but
  the type support and retry plumbing land now so a future server-side use (§4.6) doesn't need a second pass
  through this file.
- Respect `ttlMs`/`cacheScope` on cached `tools/list` results, reusing whatever local list-caching already
  exists in the `tools` cache field rather than adding a second cache.

### 4.3 Inbound server (`internal/mcp/server.go`)

- Add `"2026-07-28"` to `supportedProtocolVersions`; when negotiated, serve the stateless flow (no session
  id issued, `_meta` read from the request rather than a connection-scoped field).
- Implement `server/discover`.
- Parse and honour `Mcp-Method`/`Mcp-Name` headers for routing where present, falling back to the JSON body
  method when a legacy client omits them.
- **Route `handleToolsCall` through the Tool-Call Supervisor.** This is the fix for the gap the file's own
  comment names (§0.4, §2). The exact allowlist/scoping design (which agents may be MCP-exposed, under what
  tool allowlist) is Part G's (`Competitive_Parity_Improvements_Plan.md` §7.5-§7.6, `agent_mcp_exposure`
  table); this plan's responsibility is making sure the call actually reaches the Supervisor pipeline once
  Part G's exposure flag is on, the plumbing, not the policy.
- Add `ttlMs`/`cacheScope` to `handleToolsList`'s response.

### 4.4 OAuth hardening (`internal/mcphub/oauth.go`)

- **RFC 9207 issuer validation, ships first, independent of the rest of this plan.** Require `iss` in the
  authorization response, validate it against the expected authorization server before redeeming the code.
  Reject on mismatch or absence, fail closed, matching the fail-closed discipline already used elsewhere in
  `mcphub` (e.g. `Connection.IsUsable()`).
- Add `application_type` to Dynamic Client Registration requests for correct `localhost` redirect handling.
- Note, don't yet build, the CIMD migration path: DCR remains functional through the spec's transition
  window, so this is tracked as a later, lower-urgency item (§11), not blocking this plan's delivery.
- Credential binding (SEP-2352): tie a stored credential to the authorization server that issued it,
  reusing `EncryptedCredential`'s existing vaulted-storage pattern, no new storage mechanism.

### 4.5 Extensions evaluated, not built in v1

- **Tasks (`io.modelcontextprotocol/tasks`)**: a natural fit once Part G's code-execution/computer-use
  sessions exist and need exposing as long-running MCP tools (poll via `tasks/get` instead of blocking the
  caller). Deferred until Part G ships (§9), evaluating it before that has nothing real to attach it to.
- **MCP Apps**: interactive HTML UI inside a chat surface. Could plausibly surface inside Control
  Tower/Studio, but this is a frontend product decision, not a protocol-compliance requirement, out of scope
  here (§11 flags it as worth a separate look once the wire-protocol upgrade itself has shipped).
- **Enterprise Managed Authorization (EMA)**: worth evaluating against `mcphub`'s existing org-admin
  approval workflow (`StatusRequested`/`ApprovedBy`) once its details are published in more depth than the
  current spec summary provides; flagged as an open decision (§11), not designed here.
- **MRTR as a carrier for GAL's human-approval-above-threshold flow.** If an agent's action ever needs to
  round-trip a human approval over MCP (rather than only within Actrone's own gateway), MRTR's stateless
  `input_required`/`inputResponses` pattern is the right shape for it. Not required for this plan's scope,
  the retry plumbing added in §4.2 makes it buildable later without revisiting the wire layer again.

---

## 5. What does not change: governance layer vs. the new spec

The new spec hardens the protocol and the transport. It adds nothing resembling business-level governance,
so nothing here is displaced by adopting it:

| Concern | New spec (2026-07-28) | Actrone's `mcphub` governance |
| --- | --- | --- |
| Is this OAuth flow safe from a mix-up attack | Yes, `iss` validation (SEP-2468) | N/A, different problem |
| Can any server instance serve any request | Yes, stateless core | N/A, different problem |
| Which tools may a tenant's agent actually call | Not addressed | `Connection.EnabledTools`, least-privilege allowlist |
| Did the upstream server silently change a tool's behaviour (rug-pull) | Not addressed | `ToolPins`, detected on reconnect, connection auto-quarantines |
| Are credentials ever exposed to the agent or logged | Not addressed | Vaulted, encrypted, `json:"-"` on every serialisation path |
| Does a non-admin need approval to add a new server | Not addressed | `StatusRequested` → `ApprovedBy` org-admin workflow |
| Is every tool call attributable and auditable | Not addressed | Tamper-evident `tool_audit_log`, `ConnectionUsage` derived from it, not a separate counter |
| Is outbound traffic to a malicious/internal URL blocked | Not addressed | SSRF guard (`ssrf.go`) |

**Conclusion for the earlier question this plan follows up on:** yes, Actrone's additions remain
meaningfully better than the new spec's native capabilities, because the new spec was never trying to solve
the same problem. Adopting 2026-07-28 is necessary for interoperability and closes a real, separate
vulnerability (issuer validation), but it doesn't reduce the value of `mcphub`'s governance layer by one
degree, that layer has no equivalent anywhere in the spec, old or new.

---

## 6. Data model & migrations

- **No new tables.** This is a protocol-version and transport-behaviour upgrade; `mcphub`'s existing schema
  (`Connection`, `ToolPins`, vaulted credentials) is untouched.
- **One real regression risk to test for explicitly:** `ToolPins` fingerprints a connected server's tool
  definitions to detect rug-pulls. If the new `_meta`/`ttlMs`/`cacheScope` fields change what gets hashed
  (because they're now present on a `tools/list` response that didn't carry them before), a benign spec
  version bump could register as a false rug-pull and quarantine a legitimate connection. The pin
  computation must explicitly exclude protocol-version-dependent metadata fields, tested at §8.

---

## 7. Backward compatibility & rollout strategy

- **Dual-version negotiation, both directions, for the length of the spec's own 12-month deprecation
  window.** Outbound (`client.go`): keep advertising `ProtocolVersionLatest` on `initialize` for legacy
  servers while preferring the stateless path when a server's `server/discover` (or initialize response, for
  legacy) reports `2026-07-28` support. Inbound (`server.go`): keep `supportedProtocolVersions` covering
  `2024-11-05` through `2026-07-28`, matching the existing negotiate-down pattern already in
  `handleInitialize` (§2), just extended with the new floor.
- **No forced migration for existing `mcphub` connections.** A tenant's already-configured `Connection`
  keeps working against whichever protocol version its upstream server speaks; this upgrade changes what
  Actrone's client/server can speak, not what's required of external parties.
- **Legacy HTTP+SSE stays supported** through the same window (`internal/mcp/server.go`'s `HandleSSE`,
  §2), removal tracked against the spec's own 2027-07-28 earliest-removal date, not sooner.

---

## 8. Testing strategy

| Layer | Coverage |
| --- | --- |
| **Unit** | `_meta` marshal/unmarshal round-trips correctly on both stateless and legacy request shapes; version negotiation picks the correct path for every combination of client-supported × server-supported version (table-driven); MRTR retry logic resubmits with `inputResponses` correctly and gives up after a bounded number of round trips (no infinite retry loop). |
| **Regression (ToolPins)** | A tools/list response gaining `ttlMs`/`cacheScope` does **not** change a `ToolPins` fingerprint for an otherwise-unchanged tool set, explicit table case for exactly this scenario per §6. |
| **Security** | RFC 9207 `iss` validation rejects a token exchange when `iss` is missing or mismatched, table-tested against a simulated mix-up attack; credential binding rejects a credential presented against a different authorization server than the one that issued it. |
| **Integration** | A live round-trip against both a `2025-11-25`-only fake server and a `2026-07-28` fake server, asserting the client correctly falls back on the former and uses the stateless path on the latter; the inbound server path (`handleToolsCall`) is confirmed to actually invoke the Tool-Call Supervisor once Part G's exposure flag is enabled, closing the gap from §0.4/§4.3 with a real test, not just a code review. |
| **Contract** | `server/discover`'s response shape is asserted against the spec's documented schema; header-based routing (`Mcp-Method`/`Mcp-Name`) is asserted to match the JSON body's `method`/tool name for every request built by the client, so the two never silently diverge. |
| **CI gates** | lint 0-warnings, race detector, coverage threshold, vuln scan (`govulncheck`), image build, per CLAUDE.md §7/§8, same bar as every other backend change. |

---

## 9. Phased delivery

- **Phase 0: RFC 9207 issuer validation (`oauth.go`).** Ships alone, first, ahead of everything else in
  this plan, it's a live vulnerability fix, not a feature. *Exit:* a simulated auth-server mix-up attempt is
  rejected; existing OAuth connections continue to authenticate normally.
- **Phase 1: Wire types + dual-version negotiation (§4.1, §7).** `types.go` changes, extended
  `supportedProtocolVersions`, the negotiate-down logic on both client and server. No behavioural change yet
  for existing connections. *Exit:* Actrone's client correctly negotiates `2026-07-28` against a spec-compliant
  test server while continuing to negotiate `2025-11-25` against an unchanged one.
- **Phase 2: Stateless client + server paths (§4.2, §4.3, minus the Supervisor fix).** `_meta`-based
  requests, `server/discover`, header-based routing, `ttlMs`/`cacheScope` on list results. *Exit:* a full
  stateless round-trip works against a real `2026-07-28` server with no session-ID bookkeeping.
- **Phase 3: Tool-Call Supervisor on the inbound path (§4.3's last bullet).** Sequenced after Phase 2, not
  before, because it needs the new server request path to carry enough identity/context (via `_meta`) for
  the Supervisor to make a real decision, not just a boolean gate. Coordinated with Part G's `agent_mcp_exposure`
  flag from the Competitive Parity plan, this phase supplies the plumbing that flag turns on. *Exit:* an
  inbound MCP tool call against an exposed agent is visible in the same audit ledger as any other governed
  tool call.
- **Phase 4: MRTR retry plumbing (§4.2's MRTR bullet).** Deferred to its own phase since nothing in Actrone's
  current server surface returns `input_required` yet; ships ahead of any real use so the GAL-over-MCP idea
  (§4.5) isn't blocked on a wire-layer gap when someone wants to build it.
- **Phase 5: Extensions evaluation (§4.5), gated explicitly on Part G shipping.** Tasks, MCP Apps, and EMA
  are each individually scoped, not built speculatively; Tasks specifically waits for Part G's code-exec/
  computer-use sessions to exist, since there's nothing real to expose as a long-running task before then.

---

## 10. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| **A `ToolPins` fingerprint changes on the new metadata fields, quarantining legitimate connections** | Explicit regression test (§8) before this ships; pin computation excludes protocol-version-dependent fields by construction. |
| **An external MCP server or client the catalog depends on never upgrades, and Actrone drops support for it prematurely** | Dual-version negotiation is kept for the spec's full 12-month deprecation window (§7), matching the ecosystem's own transition timeline rather than a shorter internal one. |
| **The stateless client path introduces a subtle correctness bug (e.g. `_meta` identity dropped on a retry) that isn't caught until production** | Integration tests explicitly exercise the stateless path end-to-end (§8), not just unit-level marshal/unmarshal; MRTR retry logic is bounded and tested for the give-up case, not just the happy path. |
| **Phase 3's Supervisor wiring ships before Part G's exposure/allowlist design is ready, creating a half-built, confusing surface** | Explicitly sequenced after Part G's `agent_mcp_exposure` flag exists (§9); Phase 3 is plumbing behind a flag that stays off until Part G's policy layer is ready to turn it on. |
| **RFC 9207 validation is implemented too strictly and rejects a legitimate authorization server that's slow to adopt the `iss` parameter** | Fail-closed by design, but rolled out with the existing OAuth connections monitored for a spike in auth failures immediately after deploy, consistent with how any fail-closed security change should be watched. |

---

## 11. Open decisions

1. **Enterprise Managed Authorization (EMA): does it replace or complement `mcphub`'s existing org-admin
   approval workflow?** Not resolved here, the spec's EMA extension details weren't available in enough
   depth during this plan's research to design against; needs its own look once published more fully.
2. **MCP Apps: does Control Tower or Studio ever want to render one?** A product/frontend decision, not a
   protocol one; this plan intentionally doesn't answer it, only notes that nothing here blocks evaluating
   it later.
3. **CIMD migration timing.** DCR remains functional through the transition window (§4.4), so there's no
   forcing function yet; revisit once the spec's removal date is closer or CIMD tooling matures.

---

## 12. Definition of done

- `ProtocolVersionLatest` is `2026-07-28`; both client and server negotiate correctly across the full
  `2024-11-05` → `2026-07-28` range, verified by integration test, not just code review.
- RFC 9207 issuer validation is live and rejects a simulated mix-up attempt; shipped and verified
  independently of the rest of this plan's phases.
- The inbound MCP server path (`handleToolsCall`) routes through the Tool-Call Supervisor once Part G's
  exposure flag is enabled, closing the gap named in `server.go`'s own comment, with a passing integration
  test asserting the audit ledger entry exists, not just that the code compiles.
- `ToolPins` rug-pull detection is confirmed unaffected by the new metadata fields via an explicit
  regression test.
- Dual-version negotiation is in place and documented as intentional through the spec's own 12-month
  deprecation window, not an oversight to "clean up later."
- CI gates green (lint, race, coverage, vuln scan, image build).
- `progress.md` updated; the three open decisions (§11) resolved or explicitly left open, not silently
  dropped; Part G's dependency on this plan's Phase 3 documented in both docs, not just this one.

---

*Last updated: 2026-08-12 | Owner: Matt | Scope: `internal/mcp` (client.go, server.go, types.go),
`internal/mcphub/oauth.go`. Depends on / feeds: `Actrone_Competitive_Parity_Improvements_Plan.md` §7
(Part G, MCP server-exposure governance). Not in scope: `internal/a2a` (separate protocol, see
`Actrone_Native_SDK_And_A2A_Compliance_Plan.md` Part B).*

## Sources

- [The 2026-07-28 Specification](https://blog.modelcontextprotocol.io/posts/2026-07-28/), Model Context
  Protocol Blog.
- [MCP 2026-07-28: From Local Tool to Distributed Protocol, migration guide](https://aaif.io/blog/mcp-2026-07-28-whats-changing-and-how-to-migrate),
  Agentic AI Foundation.
- [The 2026 MCP Roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/), Model Context
  Protocol Blog.
- [The 2026-07-28 MCP Specification Release Candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/),
  Model Context Protocol Blog.
