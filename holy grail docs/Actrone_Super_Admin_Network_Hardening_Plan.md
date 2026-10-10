# Actrone Super Admin plane: network fix and hardening plan

> **Status:** plan only. Nothing here is applied.
> **Scope:** the L2/L3/L4/L7 network controls in front of the Super Admin Dashboard (SAD).
> **Companions:** `infra/holy grail docs/super-admin-dashboard-sysdesign.md` (the design),
> `infra/holy grail docs/Actrone_Super_Admin_Dashboard_Implementation_Plan.md` (P8 is the phase this
> plan replaces), `infra/docs/Actrone_Deployment_Runbook.md` §9 (the bring-up steps this plan edits).
>
> **Origin:** a review of whether to replace the self-hosted WireGuard gateway with Tailscale. The
> decision is to **stay self-hosted**, because the admin plane is the highest-value target in the
> product and Tailscale puts a third-party coordination server inside its trust path. That decision is
> only defensible if the gaps below are closed, since two of them are correctness bugs that would take
> the dashboard down on first apply and one is a single point of failure during an incident.

---

## 1. Summary

The admin plane is authored but never applied, so nothing here has been caught by a real deploy. The
review found ten issues. Two are blocking defects, not hardening:

1. **The dashboard fails closed on first apply.** Three of the four places that carry the WireGuard
   gateway `/32` sit at hops that never observe that IP. Every admin-api request returns 404 in prod.
2. **The failure is near-undiagnosable.** By design every layer answers `404` (`notFound`,
   `middleware.go:25`), so a network misconfiguration is indistinguishable from a bad token, an
   unknown operator, or a missing permission. Expect this to burn a day at bring-up.

The rest are genuine hardening items, of which the single point of failure (§5, P1) is the one place
where a hosted mesh would actually have served us better.

---

## 2. The root cause: an IP allowlist placed after TCP re-origination

An IP allowlist is only meaningful at a hop that **observes the operator's source address**. Each
reverse proxy and each application fetch opens a **new TCP connection**, so the original source address
survives exactly one hop. After that, identity has to travel as a **verified header**, never as an IP.

The current design places the same `10.0.1.10/32` at four hops. Only the first can see it.

| # | Hop | Control and where it lives | Source address actually seen | Verdict |
|---|---|---|---|---|
| 1 | Internal NLB | `loadBalancerSourceRanges` in `infra/argocd/apps/ingress-nginx-internal.yaml:51` | the gateway `10.0.1.10` | **valid** |
| 2 | ingress-nginx pod | `whitelist-source-range` annotation in `infra/helm/actrone-admin/values-prod.yaml:30` | a **node IP**, because the chart sets neither `externalTrafficPolicy: Local` nor NLB IP-target mode, so kube-proxy SNATs | **fails closed** |
| 3 | super-admin web pod | `-web-ingress` NetworkPolicy `ipBlock` in `infra/helm/actrone-admin/templates/networkpolicy.yaml:26-34` | the **ingress-nginx pod IP** | **fails closed** |
| 4 | admin-api pod | `ADMIN_IP_ALLOWLIST` in `infra/helm/actrone-admin/values-prod.yaml:21` | the **super-admin web pod IP** | **fails closed** |

Hop 4 is the definitive one. `frontend/apps/super-admin/src/lib/admin-api.ts:21-27` calls the admin-api
over the in-cluster Service (`ADMIN_API_URL`, set at `templates/super-admin.yaml:33-34`) and sends only
`Authorization` and `Content-Type`. No `X-Forwarded-For` is set, so `clientIP`
(`backend/orchestrator/internal/admin/httpapi/middleware.go:66-80`) falls through to `r.RemoteAddr`,
which is the web pod IP. That is not inside `10.0.1.10/32`, so `IPAllowlist`
(`middleware.go:39-64`) returns 404 for **every** request. `config.go:119-122` makes a non-empty
allowlist mandatory in prod, so this cannot be sidestepped by leaving it unset.

The unit tests do not catch this. `middleware_test.go` exercises the middleware in isolation with a
crafted `RemoteAddr`, which proves the gate works, not that the deployed topology delivers the address
the gate expects.

### 2.1 The second defect in the same resolver

`clientIP` trusts the leftmost `X-Forwarded-For` unconditionally, with no trusted-proxy check, while
its own comment claims it is "honouring a single trusted X-Forwarded-For hop (the private ALB)".
Nothing verifies the hop. Once hop 4 is made to work by forwarding a header, anything that can open a
connection to the admin-api pod can set `X-Forwarded-For` and satisfy the gate. The NetworkPolicy at
`networkpolicy.yaml:48-57` limits that to the web pods, which is a real mitigation, but the resolver
itself must not be credulous.

The same resolver feeds the **audit record's** IP (`audit_gate.go:124-132` into `audit.Record.IP`,
`audit/audit.go:40`, column `ip_address INET` in `migrations/0002_admin_audit_log.sql:20`). So one fix
in `clientIP` corrects both the security gate and the audit attribution.

### 2.2 SNAT erases per-operator attribution

The gateway masquerades every operator onto its own fixed private IP
(`infra/terraform/modules/wireguard-gateway/cloud-init.sh.tftpl:30-31`). Even once the header chain
works, every audit row would read `10.0.1.10`, so no record can distinguish operators by address. For a
dashboard whose entire premise is a tamper-evident audit chain, that is a material loss. The runbook
already names the alternative at §9 (route-based, no SNAT); this plan adopts it.

---

## 3. Target architecture

Preserve the operator's real address end to end, and make every hop enforce something it can actually
observe.

```
operator device            10.100.0.N
  -> WireGuard gateway     no SNAT, forwards
  -> internal NLB          L3: loadBalancerSourceRanges = 10.100.0.0/24        (sees 10.100.0.N)
  -> ingress-nginx pod     externalTrafficPolicy: Local preserves the address  (sees 10.100.0.N)
                           sets X-Forwarded-For: 10.100.0.N
  -> super-admin web pod   L4: NetworkPolicy allows the ingress namespace
                           forwards the inbound X-Forwarded-For unchanged
  -> admin-api pod         L4: NetworkPolicy allows only the web pods
                           L7: trusts XFF only from the web pod CIDR,
                               validates against 10.100.0.0/24,
                               writes the real operator IP to the audit row
```

Two principles fall out, and both belong in the sysdesign:

- **An IP allowlist goes at the last hop that observes the address.** That is the NLB and nginx.
- **After that, the address is a claim.** It is trusted only when the immediate peer is a known proxy,
  and it is used for attribution and defence in depth, never as the primary authorisation control.
  WorkOS with FIDO2 (L5) and the RBAC deny-by-default check (L6) remain the real gate.

---

## 4. Decisions

| # | Decision | Rationale |
|---|---|---|
| **N1** | Stay on self-hosted WireGuard. Do not adopt Tailscale. | No third-party control plane in the admin path. Whoever controls a hosted tailnet can enrol a device onto the admin network. Tailnet Lock plus ACLs would claw most of that back, but it is added machinery for something already written. |
| **N2** | Switch the gateway to **no-SNAT, route-based** forwarding. | Restores per-operator audit attribution, which SNAT structurally prevents. `source_dest_check` is already disabled (`main.tf:184`), so only the route tables change. |
| **N3** | The operator address is carried past hop 1 as `X-Forwarded-For`, trusted **only** from a configured proxy CIDR. | An allowlist cannot be enforced at a hop that re-originates TCP. Making the trust boundary explicit is the only honest version of the current comment. |
| **N4** | The allowlist CIDR is defined **once** and templated everywhere. | It currently lives in four hand-synced places. Four copies of one value is a guaranteed future outage or hole. |
| **N5** | L4 NetworkPolicy selects **namespaces and pods**, never `ipBlock`, for in-cluster hops. | An `ipBlock` cannot express "the ingress controller", and in-cluster source addresses are pod addresses. |
| **N6** | The gateway becomes an **ASG of 1** with peers reconciled from SSM. | Removes both the single point of failure and the rebuild-on-every-peer-change behaviour. |
| **N7** | Keep the uniform `404` on failure, but add a **server-side** structured log naming the layer that rejected. | Preserves the no-oracle property for the client while making bring-up and incidents diagnosable. This is what makes the rest of the plan operable. |
| **N8** | L2 stays possession-only. Device posture is **not** attempted. | WireGuard has no device-posture concept. The compensating control is WorkOS FIDO2 at L5, which is stronger than a tailnet device check. Write the assumption down rather than pretend otherwise. |

---

## 5. Phases

### P0: unblock and correct (must land before any `terraform apply`)

These four together are what make the dashboard reachable at all.

**P0.1 Make `clientIP` trust-aware.** In `backend/orchestrator/internal/admin/httpapi/middleware.go`:
- Add `ADMIN_TRUSTED_PROXY_CIDRS` to `config.Config` alongside `IPAllowlist` (`config.go:49-51`), parsed
  the same way (`config.go:74-80`) and **required in prod** (`config.go:119-122`).
- Change `clientIP` to take the trusted set: honour `X-Forwarded-For` only when `r.RemoteAddr` is inside
  it, and take the **rightmost** entry not in the trusted set rather than the leftmost, so an operator
  cannot prepend a forged hop. Otherwise use the socket peer.
- Correct the misleading comment at `middleware.go:66-67`.
- Tests: forged XFF from an untrusted peer is rejected; forged prepended XFF from a trusted peer is
  ignored in favour of the real entry; no XFF falls back to the peer; the audit row records the
  resolved address.

**P0.2 Forward the operator address from the web tier.** In
`frontend/apps/super-admin/src/lib/admin-api.ts:21-27`, read the inbound request's `X-Forwarded-For`
(via `headers()` in the Server Component or Route Handler) and pass it through on the `fetch` to
`ADMIN_API_URL`. Without this the admin-api has nothing to resolve. Set the trusted proxy CIDR to the
cluster pod CIDR so only the web pods can assert it, backed by the existing NetworkPolicy at
`networkpolicy.yaml:48-57`.

**P0.3 Fix the L4 NetworkPolicy.** In `infra/helm/actrone-admin/templates/networkpolicy.yaml:26-34`,
replace the `ipBlock` on `-web-ingress` with a `namespaceSelector` matching the
`ingress-nginx-internal` namespace plus a `podSelector` for the controller. Label the namespace in the
Argo CD app so the selector has something to match. The `-api-ingress` policy at lines 48-57 is already
correct and needs no change.

**P0.4 Make nginx observe the real address.** In `infra/argocd/apps/ingress-nginx-internal.yaml`, set
`controller.service.externalTrafficPolicy: Local` so kube-proxy stops SNATing to a node IP, and pin
`controller.config.use-forwarded-headers: "false"` so nginx always overwrites `X-Forwarded-For` with
the address it observed. That default is currently relied upon while being unset, which is exactly the
kind of implicit dependency that silently flips on a chart bump. Confirm at bring-up that the NLB
preserves the client address for the chosen target mode; if it does not, the fallback is NLB IP-target
mode with `preserve_client_ip` enabled.

### P1: robustness (the real gap versus a hosted mesh)

**P1.1 Remove the single point of failure.** The gateway is one `t3.small` in one AZ behind one EIP,
with no ASG and no health check (`main.tf:175-216`). If it dies, no operator can reach the admin plane,
which is precisely when it is needed. Convert to an ASG of 1 across two AZs with an EC2 health check so
a dead instance is replaced automatically. Accept the few minutes of reconnect. A second always-on
gateway with both endpoints in every client config is the stronger option if the reconnect window is
judged too long during an incident.

**P1.2 Document a network break-glass path.** SSM Session Manager reaches the gateway box, but there is
no written path for when the gateway itself is gone. The sysdesign's sealed-envelope break-glass is
*identity* break-glass, not network. Write the procedure: an SSM session onto a node in the VPC, plus
who may invoke it and how the invocation is itself audited.

**P1.3 Stop rebuilding the gateway on every peer change.** Peers render into user data and
`user_data_replace_on_change = true` (`main.tf:186-195`), so adding or removing one operator destroys
and recreates the instance and drops everyone. Emergency offboarding of a stolen laptop should not be a
rebuild. Move the peer list to an SSM parameter, reconcile it on the box with a systemd timer running
`wg syncconf`, and take `peers` out of the user-data template. Revocation then takes seconds and still
goes through an IaC PR, preserving the sysdesign §3.4 control.

### P2: attribution and observability

**P2.1 Switch to no-SNAT (N2).** Drop the `MASQUERADE` rules from
`cloud-init.sh.tftpl:30-31`, keeping the two `FORWARD` accepts. Add a `10.100.0.0/24` route to the
gateway ENI on the private route tables in `infra/terraform/envs/prod/admin.tf`. The allowlist value
then becomes `10.100.0.0/24` everywhere and each operator keeps their own `/32`. Rename the
`admin_wireguard_gateway_ip` output accordingly, since it stops being the allowlist value.

**P2.2 Single-source the CIDR (N4).** One Helm value, for example `adminSourceCIDRs`, templated into
the NetworkPolicy, the ingress annotation and `ADMIN_IP_ALLOWLIST`. Emit the ingress
`loadBalancerSourceRanges` from the Terraform output rather than the hardcoded `10.0.1.10/32` at
`ingress-nginx-internal.yaml:52`. Fail the chart render if the value is unset.

**P2.3 Fix the base chart default.** `infra/helm/actrone-admin/values.yaml:14-15` defaults to
`10.100.0.0/24` while prod overrides to `10.0.1.10/32`, so the base encodes the opposite network model
from the one shipped. Any new environment that forgets to override inherits a wrong allowlist. Make the
default empty and required.

**P2.4 Add layer-attributing logs (N7).** Each of the IP gate, the authenticate step and the RBAC check
already returns the same `404`. Add a structured log line at the rejection point naming the layer and
the resolved address, using the canonical field schema from the root `CLAUDE.md` §6.3
(`service`, `request_id`, `trace_id`, `event`). The client response does not change.

**P2.5 Gateway telemetry.** Nothing currently records who opened a tunnel and when, and nothing alerts
if the gateway is down. Ship WireGuard handshake metrics to CloudWatch from the box, alert on
zero-healthy-gateway, and treat the handshake log as admin-plane audit input.

### P3: lifecycle

**P3.1 Key rotation cadence.** WireGuard keys never expire and there is no rotation story. Fold a
quarterly device re-key into the P7 access-review work, and treat a peer past its window as an
access-review finding.

**P3.2 Write down the L2 trust assumption (N8).** A WireGuard key is a file on disk. Record that L2 is
possession-only, that full-disk encryption and OS keychain storage are required of operator devices,
and that the actual second factor is WorkOS FIDO2 at L5.

**P3.3 Narrow the gateway source range.** `allowed_wireguard_source_cidrs` defaults to `0.0.0.0/0`
(`main.tf:44-48`). Defensible, since WireGuard is silent to unauthenticated peers, but narrowing to
known egress ranges costs nothing once they exist and removes exposure to a future WireGuard CVE.

---

## 6. Verification

Add to runbook §9.8. The first three are the ones that would have caught the blocking defect, and each
must be run **on-VPN**, where the expected result is success.

| Check | Expectation |
|---|---|
| On-VPN, load the dashboard and perform one audited action | 200, not 404. This is the regression test for §2. |
| Read the audit row for that action | `ip_address` is the operator's own `10.100.0.N`, not a gateway, node, or pod address |
| Two operators perform an action | the two audit rows carry **different** addresses |
| Curl the admin-api Service directly from a pod in another namespace | connection refused by NetworkPolicy |
| From the web pod, curl admin-api with a forged `X-Forwarded-For` | the forged value is ignored; the audit row shows the real resolved address |
| From an untrusted peer, send `X-Forwarded-For: 10.100.0.2` | 404 |
| Off-VPN | `dig admin.actrone.internal` returns NXDOMAIN and the host is unreachable |
| Terminate the gateway instance | a replacement comes up and operators reconnect within the stated window |
| Remove a peer from SSM | that device's handshake fails within the reconcile interval, with no instance replacement |

---

## 7. Runbook edits

`infra/docs/Actrone_Deployment_Runbook.md` §9 needs these changes once the phases land:

- The SNAT note at §9 becomes a **no-SNAT** note, and the "three places" count is replaced by the single
  templated value from P2.2.
- The L2 and L3 rows of the layer table gain the `externalTrafficPolicy` and trusted-proxy requirements.
- §9.7 client config keeps `AllowedIPs = 10.0.0.0/16, 10.100.0.0/24` (split tunnel, unchanged), and the
  offboarding step changes from "remove from tfvars and apply" to the SSM reconcile path.
- §9.9 gains the key-rotation cadence and drops the "server key rotation replaces the gateway" caveat
  once P1.3 lands.
- §9.10 should no longer describe the network layers as fully authored, since P0 is a correction.

---

## 8. What this buys, and what it does not

With P0 through P2 done, the self-hosted plane is ahead of a default Tailscale deployment on every axis
that matters here: no third-party control plane, per-operator attribution written into a tamper-evident
audit chain, explicit trust boundaries, and allowlists that enforce something real.

It remains behind on exactly one thing: **device posture**. Tailscale can bind a tunnel to an SSO
identity and require a healthy device. WireGuard cannot, and N8 accepts that, leaning on WorkOS FIDO2
at L5 instead.

Revisit the decision if operator count passes roughly five to ten, or if per-identity network ACLs
beyond one flat `/24` become necessary. If so, evaluate **Headscale** on this same gateway pattern
before paying for Tailscale, since it keeps the control plane inside our own infrastructure and
preserves N1.
