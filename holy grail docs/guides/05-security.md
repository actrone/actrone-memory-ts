# Guide 05 — Zero-Trust Network Security

> **Status refreshed 2026-07-13 (code-verified) — MAJOR STALE CONTENT:** the mesh technology this
> entire guide describes has changed. **Istio Ambient/ztunnel/SPIFFE-SPIRE was retired and replaced
> by Linkerd** — `infra/helm/actrone/charts/linkerd/Chart.yaml` states outright: "Linkerd replaces the
> retired Istio+SPIRE charts: automatic, zero-config mTLS with its own CA — no SPIRE to operate, the
> lowest latency/memory overhead (Infra plan §1.3)." Linkerd here runs as a standard **sidecar-injected**
> mesh (`linkerd.io/inject: enabled` + `config.linkerd.io/default-inbound-policy: deny`), not a
> sidecarless ambient mode — so the "0 MB / no sidecar" framing below no longer applies to either
> mesh option in use. mTLS identity is Linkerd's own mesh CA (trust domain `linkerd.cluster.local`,
> identity format `<serviceaccount>.<namespace>.serviceaccount.identity.linkerd.cluster.local`), not
> a SPIFFE SVID issued by a separate SPIRE server. Policy is expressed via Linkerd's `Server` +
> `AuthorizationPolicy` + `MeshTLSAuthentication` CRDs (`policy.linkerd.io/v1alpha1`), configured in
> `infra/helm/actrone/charts/linkerd/{values.yaml,templates/*.yaml}` — verified: orchestrator HTTP
> (8080) is restricted to the `envoy-gateway.envoy-gateway-system` identity + Prometheus; orchestrator
> gRPC (50051) is open to any meshed identity (app-layer auth still enforces principal/tenant); an
> `ext-authz` brain on 9191 is gateway-only. **The edge is now Envoy Gateway + a Go `ext_authz` service,
> not a direct AWS ALB** (see the Platform Evolution plan's "API Gateway decision: adopt Envoy + Go
> ext_authz behind it" and Infra plan §2.5's "gateway trust" header path referenced in Guide 01).
> Sections below are corrected for product names and CRD shapes; **specific numeric claims this pass
> could not re-derive (exact p99 latency deltas, cert rotation cadence, blast-radius windows) are
> marked unverified 2026-07-13** rather than invented — treat this guide's narrative shape as correct
> and its old Istio-specific numbers as illustrative only.

## The Zero-Trust Model

Traditional cluster security trusts the network: "if you're inside the cluster, you're trusted." Zero-Trust means **nothing is trusted by default** — every connection must be authenticated, regardless of network location.

```
TRADITIONAL (what we replaced):
  Pod A ──────────────────────────────► Pod B
  No encryption. No identity verification. Anyone in the cluster can talk to anyone.

ZERO-TRUST (what we have):
  Pod A ──[Linkerd mesh identity]──[mTLS]──► Pod B
  Every connection encrypted. Both sides verify identity certificates.
  A compromised Pod A cannot impersonate Pod B or intercept Pod B's traffic.
```

---

## Linkerd Mesh (sidecar-injected, automatic mTLS)

> Corrected 2026-07-13: this section previously described Istio Ambient Mode (ztunnel/HBONE/SPIFFE).
> That stack was retired; Linkerd is the current mesh (`infra/helm/actrone/charts/linkerd/`).

```
┌──────────────────────────────────────────────────────────────────────┐
│                         EKS Node                                     │
│                                                                      │
│   Pod: orchestrator          Pod: nats          Pod: postgres        │
│   [app container]            [nats]              [postgres]          │
│   +[linkerd-proxy sidecar]   +[linkerd-proxy]     +[linkerd-proxy]    │
│   linkerd.io/inject: enabled on every meshed namespace                │
│   config.linkerd.io/default-inbound-policy: deny (zero-trust default) │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

Inter-pod traffic path:
  orchestrator app → linkerd-proxy (mTLS, mesh identity) → network
    → linkerd-proxy (verify + decrypt) → nats app

Only Server + AuthorizationPolicy resources (below) admit traffic under the
default-deny policy — everything else is rejected at the proxy.
```

**Note:** the previous "classic sidecar vs. ambient mode" latency/memory comparison table is retired
along with Ambient Mode — Linkerd here runs sidecar-injected, so there is no ambient/sidecarless
option in the current stack. Concrete overhead numbers were not re-measured this pass (unverified
2026-07-13).

---

## Linkerd Mesh Identity

Every meshed pod's `linkerd-proxy` sidecar is issued a short-lived mTLS certificate by the Linkerd
control plane's own CA — no separate SPIRE server to operate.

```
Trust domain:    linkerd.cluster.local
Identity format: <serviceaccount>.<namespace>.serviceaccount.identity.linkerd.cluster.local
  e.g. envoy-gateway.envoy-gateway-system.serviceaccount.identity.linkerd.cluster.local
       prometheus.monitoring.serviceaccount.identity.linkerd.cluster.local

Certificate issuance/rotation cadence: managed automatically by the Linkerd control plane
  (linkerd-identity component); exact rotation interval not re-verified this pass
  (unverified 2026-07-13 — was previously documented as a SPIRE-issued 24h SVID, which no
  longer applies since SPIRE was removed).
```

**Identity source on EKS:** a pod's Linkerd identity is derived from its Kubernetes service account
(no separate node/workload attestation step like SPIRE's AWS IID + K8s SA two-step) — this is the
"automatic, zero-config" property the Linkerd chart's `Chart.yaml` cites as the reason for the switch.

---

## Server + AuthorizationPolicy (Linkerd CRDs)

```yaml
# infra/helm/actrone/charts/linkerd/templates/authorization-policies.yaml (policy.linkerd.io/v1alpha1)

# MeshTLSAuthentication: named sets of trusted mesh identities.
#   edge-and-metrics → the Envoy Gateway data-plane identity + Prometheus
#   any-meshed       → "*" (any mTLS-verified workload) — mirrors the old
#                       "any workload with a valid SPIFFE identity" rule

Effect:
  Any pod without a valid Linkerd mesh identity cannot make connections to any
  other meshed pod under the namespace's default-deny inbound policy. Even if
  an attacker gains cluster network access, they cannot communicate with any
  service without an identity issued by the Linkerd control plane's CA.
```

---

## AuthorizationPolicy (L7 Traffic Rules) — verified against `infra/helm/actrone/charts/linkerd/`

```yaml
# Restricts which workloads can reach which ports.
# Enforced by the linkerd-proxy sidecar per pod.

Rules for orchestrator pods (verified in authorization-policies.yaml / values.yaml):

  Port 8080 (REST/WebSocket, "orchestrator-http"):
    Only allowed from: MeshTLSAuthentication "edge-and-metrics"
      (envoy-gateway.envoy-gateway-system identity + prometheus.monitoring identity)
    Effect: Only traffic through the Envoy Gateway data plane reaches the API,
    plus Prometheus scraping. Direct pod access blocked. (The edge changed from
    a direct AWS ALB to Envoy Gateway + a Go ext_authz service — Guide 01/09.)

  Port 9191 (ext-authz HTTP):
    Only allowed from: MeshTLSAuthentication "edge-and-metrics" (gateway-only)

  Port 50051 (gRPC, "orchestrator-grpc"):
    Allowed from: MeshTLSAuthentication "any-meshed" (any mesh-authenticated identity)
    Effect: SDK-facing gRPC stays open to any meshed workload; the app-layer
    auth interceptor (Guide 04) still enforces principal/tenant on every call.
```

---

## NetworkPolicy (Defense-in-Depth)

NetworkPolicy operates at the CNI level, independent of the service mesh. Both run simultaneously — Linkerd encrypts and authenticates, NetworkPolicy provides a second enforcement layer.

```
INGRESS ALLOWED (unverified 2026-07-13 — ports below updated for the Envoy Gateway edge and
Linkerd mesh port; the exact NetworkPolicy manifest was not re-read this pass):
  :8080  ← Envoy Gateway data-plane pods (envoy-gateway-system namespace), not a direct AWS ALB
  :50051 ← Any pod in actrone-core namespace
  :4143  ← linkerd-proxy inbound port (replaces the old Istio ztunnel :15008 HBONE tunnel port)

EGRESS ALLOWED:
  :5432  ← PostgreSQL pods
  :6379  ← Redis pods
  :6333  ← Qdrant pods
  :4222  ← NATS pods
  :7233  ← Temporal pods
  :443   ← External HTTPS (WorkOS, Resend, OpenAI, Anthropic, Mistral)
  :53    ← kube-dns pods only (CoreDNS)

EVERYTHING ELSE: BLOCKED
```

---

## Sentry Relay (PII Enforcement)

```
┌─────────────────────────────────────────────────────────────────┐
│                        actrone-core namespace                   │
│                                                                 │
│  orchestrator pod                                               │
│  next.js pod          ──[error event]──► Sentry Relay pod      │
│                                          │                      │
│                             ┌────────────▼────────────┐        │
│                             │   PII Scrubbing Rules    │        │
│                             │                          │        │
│                             │  key matches:            │        │
│                             │  secret|token|api_key|   │        │
│                             │  jwt|password|bearer...  │        │
│                             │                          │        │
│                             │  value → "[FILTERED]"   │        │
│                             └────────────┬────────────┘        │
│                                          │ only after scrub     │
└──────────────────────────────────────────┼─────────────────────┘
                                           │
                                           ▼ external
                                    sentry.io cloud

Effect: Credentials NEVER leave the cluster in any event payload.
The Relay scrubs at the network layer before transmission.
```

---

## NATS Account-Level Isolation

```
NATS server account config (infra/helm/actrone/charts/nats/conf/nats-server.conf):

  accounts {
    orchestrator {
      users [{ nkey: "UA..." }]  ← orchestrator's NKey public key
      permissions {
        publish:   { allow: ["macp.>", "tenant.>"] }
        subscribe: { allow: ["macp.>", "tenant.>", "_INBOX.>"] }
      }
    }
  }

Effect:
  1. Only connections authenticated with the orchestrator NKey can publish
     or subscribe to macp.> and tenant.> subjects.
  2. Even if a pod is compromised and tries to subscribe to another tenant's
     subject (e.g. macp.org_evil.>), the NATS server rejects it at the
     connection level.
  3. The orchestrator is the sole authoritative publisher — no other pod
     can inject events into any tenant's stream.
```

---

## Security Threat Model Summary

| Threat | Control | Layer |
|---|---|---|
| Stolen WorkOS/OIDC session JWT | Short expiry; JWKS key rotation (`internal/oidc.Verifier`) | Application |
| Forged API key | SHA-256 one-way hash; rate limit on lookup | Application |
| Cross-tenant data access | SQL WHERE tenant_id; Barrier 2 DB check | Application |
| Cleartext inter-pod traffic | Linkerd sidecar mTLS, automatic | Infrastructure |
| Compromised pod impersonation | Linkerd mesh identity issued by the Linkerd control-plane CA, keyed off the K8s service account | Infrastructure |
| Lateral pod movement | K8s NetworkPolicy explicit allowlist + Linkerd default-deny inbound policy | Infrastructure |
| PII in error events | Sentry Relay scrubs credentials before transmission | Infrastructure |
| Cross-tenant NATS eavesdrop | Subject prefix + NKey account auth | Infrastructure |
| NATS replay attack | JetStream WorkQueue ack — each msg acked once | Application |
| Compromised node sniffing | Linkerd mTLS: encrypted proxy-to-proxy, decrypted only at destination sidecar | Infrastructure |
| Webhook replay attack | WorkOS-Signature HMAC-SHA256, 5-minute timestamp window (`internal/handler/http/workos_webhooks.go`) — Svix was dropped with Clerk | Application |
| Stolen Linkerd mesh cert | Short-lived, control-plane-rotated; exact validity/rotation window not re-verified this pass (unverified 2026-07-13) | Infrastructure |
