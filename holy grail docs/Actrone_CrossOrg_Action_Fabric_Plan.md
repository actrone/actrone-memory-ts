# Actrone — Cross-Org Governed Action Fabric (GAL Phase 5c)

> **Status refreshed 2026-07-13 (code-verified):** This doc (last updated 2026-07-03, §5) describes
> only the **operator HTTP surface** (`POST /v1/fabric/actions`, `/v1/fabric/trust`) as the
> integration point. Since then, an **agent-callable fabric TOOL was built and wired** —
> `internal/fabrictool/router.go` implements a `fabric/{target_org}/{action}` tool: an agent
> references a pre-configured trusted peer by target org + an operator-whitelisted action; the
> router resolves the peer's trust material (endpoint, bearer, Ed25519 key) from the outbound-peer
> store (`actionfabric.PgPeerStore`) — **the agent never handles keys** — and fires the signed
> request through `actionfabric.Requester` (build+sign→send→verify receipt), returning the peer's
> signed ALLOW/DENY receipt as inference-safe JSON (no raw enterprise data). It is fail-closed
> (unknown peer / non-whitelisted action / unverifiable receipt → error) and confirmed wired into
> the agent tool router in `main.go` (`fabrictool.NewRouter(peerStore, fabricReq, 2*time.Minute)`,
> ~line 2507). This directly answers the "is the agent-callable cross-org fabric tool present or
> absent" question in the affirmative — it is **present, built, and wired**, not just the operator
> API this doc originally scoped. Everything else in this doc (protocol core, trust layer, Service,
> HTTP surface, security properties, `cfg.GAL.Enabled` wiring) is unchanged and was not
> re-verified line-by-line in this pass beyond confirming the packages
> (`internal/actionfabric/{peerstore.go,pgstore.go,protocol.go,requester.go,service.go,trust.go}`)
> exist and are non-trivial.

**Version 0.1 — July 2026 · Owner: Matt · Status: PLAN + BUILD (this pass)**

> The "Visa network for agent actions": an agent in **org A** requests a **governed action on a
> system in org B**, org B stays sovereign (its GAL governs the write), and **both orgs hold
> cryptographically-signed, mutually-verifiable receipts**. Extends A2A (agent↔agent) to
> agent↔*system across orgs*. No indemnity/insurance — pure protocol + governance substrate.

---

## 1. What exists (grounded) and what's new

**Reuse:** A2A already gives cross-org **transport** (`a2a.Client`/`a2a.Service`/`a2a.Connection`,
Bearer-authed, `established→active→quarantined` lifecycle, AgentCard skills, an internal SHA-256
provenance chain). GAL already gives org B a **governed write** (`gal.Service.ExecuteWrite`:
detokenise→simulate→gate→commit→compensation→signed receipt) and a **committer factory** to run
it (`connectortool.GALCommitterFactory`).

**New (the gaps):** A2A authenticates with an opaque **Bearer token** and hash-chains provenance
*internally* — it has **no Ed25519 mutual signatures** and **no governed-action-across-orgs path**.
The fabric adds:
1. **Cross-org identity** — each org has an Ed25519 keypair; the receiver registers requester
   orgs' public keys (a trust registry). Requests + receipts are Ed25519-signed → **non-repudiable**.
2. **A signed action REQUEST** — org A's cryptographic ask ("perform action X on connector Y for
   purpose P"), with a nonce + expiry (anti-replay).
3. **Cross-org policy** — org B's **TrustGrant**: which requester org may request which actions on
   which connector, at what max risk, auto vs approval. Org B's sovereignty as data.
4. **A mutual signed RECEIPT** — org B binds the request hash + its GAL receipt (decision/outcome/
   reversibility) and signs it; org A verifies with B's public key. Both sides hold proof.

## 2. The flow (one cross-org governed action)

```
org A agent → build CrossOrgRequest{requester, target connector+action+args, purpose, nonce, exp}
            → Ed25519-SIGN with A's key  → send (over the A2A Bearer connection)  ─────────────┐
                                                                                                ▼
org B receives → 1. VERIFY A's signature against A's registered public key (non-repudiation)
              → 2. anti-replay: nonce unseen + not expired
              → 3. TrustGrant.Evaluate(A, connector, action, risk) → permitted? else DENY
              → 4. run org B's GAL: gal.Service.ExecuteWrite (simulate→gate→commit|approval|block
                   →compensation→signed action-ledger receipt)  ← org B stays sovereign
              → 5. build CrossOrgReceipt{request_hash, target org, gal decision/outcome/action_id,
                   reversible}, Ed25519-SIGN with B's key → return
org A ← VERIFY B's signature → store the mutual receipt (proof B performed exactly what A asked)
```

Both orgs now hold **mutually-verifiable proof**: B has A's signed request (A authorised it); A has
B's signed receipt (B performed it, with B's governance decision). Neither can repudiate.

## 3. Components (this build)

- **`internal/actionfabric` protocol core (pure):** `CrossOrgRequest` + `CrossOrgReceipt` +
  canonical content hash + Ed25519 `Sign`/`Verify` + nonce/expiry. Deterministic + offline-verifiable.
- **Trust layer (pure + durable):** `TrustGrant` (requester org id + pubkey → allowed connector/
  actions/max-risk/approval) + `Evaluate`; `PgTrustStore` (migration).
- **Fabric `Service`:** org-B `HandleRequest` (verify → anti-replay → trust → `gal.Service.ExecuteWrite`
  via the committer factory → mutual signed receipt); org-A `BuildRequest` + `VerifyReceipt`. Durable
  `PgReceiptStore` (the cross-org receipt ledger) + a nonce store (anti-replay).
- **HTTP:** `POST /v1/fabric/actions` (inbound, authed by the A2A connection Bearer + the request
  signature — defence in depth) + trust-grant management (`/v1/fabric/trust`).
- **Wiring** behind `cfg.GAL.Enabled` (reuses the GAL signing key as org B's fabric key).

## 4. Security properties

- **Non-repudiation both ways** (Ed25519 request + receipt).
- **Sovereignty:** org B's GAL + TrustGrant fully govern the write — org A only *requests*.
- **Anti-replay:** signed nonce + expiry; the receiver rejects a seen nonce.
- **Defence in depth:** the A2A Bearer connection proves A is a connected partner; the signature
  proves the specific action is from A's key.
- **Fail-closed:** an unverifiable signature, an unknown requester, an expired/replayed nonce, or a
  missing trust grant → DENY, no execution.

## 5. Honestly deployment-gated

The protocol + governance are fully unit/integration testable single-process (org A and org B
roles exercised with two keypairs). A true two-org *live* exercise (two Actrone deployments
exchanging over the network) is turn-up, like other cross-org features. Public-key distribution
(how orgs learn each other's keys — manual exchange vs a directory) is an operational choice; the
build supports manual registration + leaves a directory as a later enhancement.

_Last updated: 2026-07-03 | Owner: Matt | Related: `internal/a2a`, `internal/gal`,
`internal/connectortool`; GAL Strategy Part IV Phase 5._
