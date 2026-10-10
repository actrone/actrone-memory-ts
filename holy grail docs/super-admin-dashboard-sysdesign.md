# Actrone — Super Admin Dashboard
### System Design Document: Secure Internal Operations Platform
**Version:** 1.1.0  
**Classification:** INTERNAL — RESTRICTED  
**Access:** Engineering Leadership Only  
**Last Updated:** 2026  

> **Status refreshed 2026-07-13 (code-verified) — THIS IS A DESIGN DOCUMENT ONLY. NOTHING IN IT IS
> BUILT.** A full-repo check found **no trace of any of the concrete artefacts this doc describes**:
> - No `apps/super-admin` (or any admin app) — `frontend/apps/` contains exactly three apps:
>   `control-tower`, `marketing`, `marketplace`. No fourth app, isolated or otherwise.
> - No dedicated `admin-api` Go microservice anywhere under `backend/`.
> - No WireGuard config, no SPIRE/SPIFFE-adjacent VPN gateway, no `actrone-admin` VPC/ALB/RDS
>   instance in `infra/terraform` or `infra/helm`.
> - No Hedera Hashgraph integration anywhere in the repo (the only Hedera hit in the whole codebase
>   is this document's own text and its generated build artefacts).
> - No isolated `actrone-superadmin` WorkOS project, no Merkle-chained `admin_audit_log` table/migration,
>   no break-glass Telegram bot, no dual-approval kill-switch endpoints.
> - The string `super_admin` **does** exist in the real backend (`internal/middleware/auth.go`,
>   `RoleSuperAdmin = "super_admin"`), but it is an **unrelated concept**: it is the highest tier of
>   the ordinary, in-product EMAOP RBAC role set (`agent_operator, agent_admin, integration_admin,
>   auditor, super_admin`) used within customer-facing Control Tower orgs — not a separate internal
>   operations platform. Do not confuse the two; this doc's "Super Admin Dashboard" (SAD) has zero
>   code overlap with that role string.
>
> This is a legitimate, well-thought-out **security architecture spec for a not-yet-started project**.
> Every claim below should be read as "designed," never as "implemented," until an actual build lands.
> If/when work starts on this, update this banner rather than deleting it, so the design-vs-built line
> stays clear.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Threat Model & Security Philosophy](#2-threat-model--security-philosophy)
3. [Access Architecture — Zero Trust Network Model](#3-access-architecture--zero-trust-network-model)
4. [Authentication — Multi-Layer Identity Verification](#4-authentication--multi-layer-identity-verification)
5. [Authorisation — RBAC Model](#5-authorisation--rbac-model)
6. [Permission Schema](#6-permission-schema)
7. [Session Management & Token Security](#7-session-management--token-security)
8. [Audit & Immutable Logging](#8-audit--immutable-logging)
9. [Dashboard Modules & Capabilities](#9-dashboard-modules--capabilities)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Backend Architecture](#11-backend-architecture)
12. [Infrastructure & Deployment](#12-infrastructure--deployment)
13. [Incident Response & Kill Switches](#13-incident-response--kill-switches)
14. [Compliance & Regulatory Posture](#14-compliance--regulatory-posture)
15. [Security Testing & Review Cadence](#15-security-testing--review-cadence)
16. [Operational Runbooks](#16-operational-runbooks)

---

## 1. Executive Summary

The Actrone Super Admin Dashboard (SAD) is the internal operations and security control plane for the entire Actrone platform. It is accessible only to named, verified Actrone team members through a security stack that makes unauthorised access practically impossible even if an attacker obtains valid credentials.

This document defines the complete security architecture, authentication model, RBAC schema, audit infrastructure, and operational capability set. It is the source of truth for how the dashboard is built, secured, and operated.

**Core security principles:**

- **Zero Trust:** No request is trusted by default. Every request proves identity, device posture, network origin, and role permission — every time.
- **Defence in depth:** Access requires passing seven independent security controls. Failing any one blocks access entirely. Compromising one control does not compromise the system.
- **Least privilege by default:** Every team member gets the minimum permissions required for their role. Privilege escalation requires explicit approval and is fully audited.
- **Immutable audit trail:** Every action taken in the dashboard — every page view, every data read, every mutation — is written to an append-only, Merkle-chained, cryptographically verifiable audit log. Nothing can be hidden.
- **Assume breach:** The system is designed assuming that credentials will eventually be stolen, that insiders will eventually misbehave, and that network controls will eventually be bypassed. Layers exist for each of these assumptions.

---

## 2. Threat Model & Security Philosophy

### 2.1 Assets Being Protected

| Asset | Sensitivity | Why It Matters |
|---|---|---|
| All customer organisation data | Critical | POPIA, GDPR, NDPR compliance; enterprise contracts |
| Billing and revenue data | Critical | Financial exposure; contractual obligations |
| API keys and secrets (Vault) | Critical | Full platform compromise if leaked |
| User PII across all customers | Critical | Legal liability; regulatory fines |
| RBAC and permission configuration | Critical | Privilege escalation vector |
| Audit log integrity | Critical | Legal and regulatory evidence |
| Feature flag state | High | Can enable/disable production features for all users |
| Infrastructure access (services, DBs) | High | Platform availability |
| Agent governance violations | High | Customer trust and regulatory evidence |
| Kill switch controls | High | Platform availability; DoS amplification if misused |

### 2.2 Threat Actors

| Actor | Capability | Most Likely Attack |
|---|---|---|
| External attacker (no access) | Medium–High | Credential stuffing, phishing admin accounts, VPN bypass attempts |
| External attacker (stolen credentials) | High | Login with stolen password; attempt to bypass MFA |
| Malicious insider (current employee) | Critical | Abuse legitimate access; cover tracks by deleting logs |
| Malicious insider (ex-employee) | High | Retained access via stale credentials or shared secrets |
| Compromised third-party dependency | Medium | Supply chain attack via npm package or infrastructure provider |
| Nation-state actor | Very High | Targeted spearphishing; zero-day exploitation |

### 2.3 Attack Vectors and Mitigations

| Attack Vector | Mitigation Layer |
|---|---|
| Password theft / credential stuffing | Hardware MFA required; password alone is never sufficient |
| MFA bypass (SIM swap, OTP intercept) | Hardware security key (FIDO2) required for Owner and Super Admin; TOTP only for lower roles |
| VPN credential theft | Certificate-based VPN auth; no username/password VPN |
| Insider data exfiltration | All data reads are audit-logged; anomaly detection on download volume |
| Insider log tampering | Append-only audit log; Merkle chain; external archival; no admin can delete log entries |
| Session hijacking | Short-lived JWTs; device fingerprinting; session anomaly detection |
| SSRF / injection via admin forms | Input sanitisation; parameterised queries; no raw SQL in admin |
| Phishing admin to approve rogue action | Dual approval required for destructive actions (data purge, kill switch) |
| Compromised admin device | Device posture check at VPN and at application layer |
| Privilege escalation | Role changes require Owner approval; all role changes are audited |
| Stale access (ex-employee) | Offboarding checklist; quarterly access reviews; WorkOS-enforced deprovisioning |

---

## 3. Access Architecture — Zero Trust Network Model

### 3.1 The Seven-Layer Access Stack

Access to the Super Admin Dashboard requires passing **all seven layers**. Failing any layer returns a generic 404 — not a 401 or 403 — so attackers cannot confirm the dashboard exists.

```
REQUEST TO admin.actrone.com
          │
          ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 1: DNS — Private DNS only                        │
│  admin.actrone.com resolves only from within VPN        │
│  Public DNS returns NXDOMAIN — domain does not exist    │
└─────────────────────────────────────────────────────────┘
          │ resolves
          ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 2: VPN — WireGuard with certificate auth        │
│  Client must have valid device certificate              │
│  Certificate tied to device, not just user              │
│  All traffic encrypted in transit inside VPN            │
└─────────────────────────────────────────────────────────┘
          │ connected
          ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 3: IP Allowlist — CIDR enforcement               │
│  Request source IP must match an approved CIDR          │
│  VPN gateway IPs are the only approved CIDRs            │
│  Enforced at network edge (Cloudflare WAF + AWS SG)     │
└─────────────────────────────────────────────────────────┘
          │ IP allowed
          ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 4: Cloudflare WAF — Request inspection           │
│  Rate limiting: 10 req/min per IP on auth endpoints     │
│  Bot detection and JS challenge                         │
│  Request anomaly detection                              │
└─────────────────────────────────────────────────────────┘
          │ passes WAF
          ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 5: WorkOS AuthKit Authentication                 │
│  Email + password (min 16 chars, zxcvbn strength check) │
│  Passkey / FIDO2 hardware key — required for Owner and  │
│  Super Admin (via AuthKit passwordless flow)            │
│  TOTP MFA (Authenticator app) — required for all others │
│  WorkOS Radar risk signals checked against sign-in event│
└─────────────────────────────────────────────────────────┘
          │ authenticated
          ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 6: Application RBAC                              │
│  WorkOS-issued JWT claims validated on every request     │
│  Role and permissions checked against permission registry│
│  Resource-level permission enforcement (WorkOS FGA)      │
│  WorkOS Organization membership verified                 │
└─────────────────────────────────────────────────────────┘
          │ authorised
          ▼
┌─────────────────────────────────────────────────────────┐
│  LAYER 7: Audit Gate                                    │
│  Every request writes an audit entry before responding  │
│  If audit write fails, request is blocked               │
│  Ensures no action is ever taken without a log entry    │
└─────────────────────────────────────────────────────────┘
          │
          ▼
     ACCESS GRANTED
```

### 3.2 VPN Architecture

**Technology:** WireGuard hosted on a dedicated VPN gateway (AWS EC2, separate VPC from all application infrastructure).

**Why WireGuard over OpenVPN/Cisco:**
- Smaller attack surface (fewer lines of code)
- Modern cryptography (Curve25519, ChaCha20, BLAKE2)
- Faster connection establishment
- No username/password — certificate-only authentication

**Device certificate provisioning:**
Each team member's device receives a unique WireGuard keypair during onboarding. The public key is registered in the VPN gateway configuration. When the device connects, it authenticates via its private key — no password involved. If a device is lost or stolen, the public key entry is removed from the gateway config and connection is immediately impossible.

**VPN gateway configuration:**

```ini
# /etc/wireguard/wg0.conf (gateway — simplified)
[Interface]
PrivateKey = <gateway_private_key>
Address = 10.100.0.1/24
ListenPort = 51820

# Matt — MacBook Pro (primary device)
[Peer]
PublicKey = <matt_mbp_public_key>
AllowedIPs = 10.100.0.2/32

# Matt — MacBook Pro (secondary device)
[Peer]
PublicKey = <matt_mbp2_public_key>
AllowedIPs = 10.100.0.3/32

# Sarah — Engineering Lead
[Peer]
PublicKey = <sarah_device_public_key>
AllowedIPs = 10.100.0.4/32
```

**DNS inside VPN:** The VPN gateway runs a private DNS resolver (dnsmasq or Route53 private hosted zone). Inside the VPN, `admin.actrone.com` resolves to the private IP of the admin application load balancer. Outside the VPN, the record does not exist.

### 3.3 IP Allowlist Configuration

The IP allowlist is enforced at two independent layers:

**Layer A — Cloudflare WAF rule:**

```
Rule: Block non-VPN access to admin
If: not (ip.src in {10.100.0.0/24})
And: http.host eq "admin.actrone.com"
Action: Block (returns 404, not 403)
```

**Layer B — AWS Security Group on the admin ALB:**

```
Inbound rule:
  Port 443  HTTPS  Source: 10.100.0.0/24  ALLOW
  Port 443  HTTPS  Source: 0.0.0.0/0      DENY (implicit)
```

Both layers must independently allow the request. If Cloudflare is compromised or misconfigured, the AWS security group still blocks direct IP access. If the AWS SG is misconfigured, Cloudflare still blocks non-VPN traffic.

### 3.4 Adding/Removing VPN Access

VPN access changes are performed exclusively via an Infrastructure-as-Code PR in the private `actrone-infra` repository. Changes require:

1. PR authored by the requesting team member's manager
2. Review and approval by the Owner (Matt) or a designated Super Admin
3. Terraform plan reviewed to confirm only the intended change is made
4. Merge triggers a GitHub Actions workflow that applies the WireGuard config change
5. The provisioned keypair is delivered to the new team member via a separate, encrypted channel (1Password shared vault)
6. Every VPN access change is logged in the audit trail automatically via the Terraform provider

---

## 4. Authentication — Multi-Layer Identity Verification

### 4.1 Authentication Stack

**Identity Provider:** WorkOS AuthKit (already installed in the Actrone monorepo)

The Super Admin Dashboard uses a **dedicated, fully isolated WorkOS project** — completely separate from the main `actrone.com` WorkOS project used by customers. This is critical: a compromised customer account cannot be used to access the admin dashboard even if role manipulation were possible, because they live in entirely separate WorkOS projects with independent API keys, independent user stores, and no shared session state.

```
actrone.com customer auth    →  WorkOS Project: actrone-production
admin.actrone.com admin auth →  WorkOS Project: actrone-superadmin (isolated)
```

Each WorkOS project has its own Client ID, API key, and redirect URIs. The admin project's API key is stored in HashiCorp Vault and is never accessible to any service outside the admin infrastructure (see Section 12.1).

### 4.2 Login Flow — Step by Step

```
1. Admin navigates to admin.actrone.com
   → VPN check (layers 1–4 above must already pass)

2. WorkOS AuthKit login page rendered (hosted or embedded via
   @workos-inc/authkit-nextjs)
   → Email field
   → Password field (minimum 16 characters, enforced at signup)
   → Password strength check: zxcvbn score ≥ 3 required

3. MFA / step-up challenge (always — cannot be skipped or bypassed)
   → Owner / Super Admin: FIDO2 hardware key required, enrolled as a
                          WebAuthn passkey via AuthKit's passwordless
                          authentication flow (YubiKey 5 or equivalent)
   → Infra Admin / Security Admin: TOTP required via AuthKit's
                                    Multi-Factor API (Authenticator
                                    app, not SMS)
   → Support Engineer / Read Only: TOTP required via AuthKit MFA
   → SMS MFA: not supported by WorkOS by design — this is treated as
              a security advantage, not a gap; all roles use TOTP or
              phishing-resistant WebAuthn instead

4. Risk and anomaly check (WorkOS Radar)
   → Every sign-in attempt is scored by WorkOS Radar for anomalous
     signals (impossible travel, known-bad IP reputation, credential
     stuffing patterns, new browser/device combination)
   → High-risk verdict: sign-in blocked and Security Admin alerted
   → New device/browser combination: email alert sent to the account
     holder and Security Admin; the admin can review recent sign-in
     events from the WorkOS dashboard and revoke a session if needed

5. Session issued
   → Short-lived WorkOS-issued JWT (15 minutes expiry)
   → Refresh token (8 hours, then full re-authentication required)
   → Refresh tokens are rotated on every use
   → Session bound to IP address — IP change invalidates session

6. Audit event written
   → LOGIN_SUCCESS or LOGIN_FAILURE with actor, IP, device, timestamp,
     and the WorkOS Radar risk verdict for that sign-in
```

### 4.3 Hardware Security Key Policy

**Roles required to use FIDO2 hardware keys:** Owner, Super Admin

**Acceptable hardware keys:**
- YubiKey 5 Series (recommended)
- Google Titan Security Key
- Any FIDO2-certified hardware authenticator

**How this is enforced in WorkOS:** WorkOS's standalone Multi-Factor API is TOTP-only. Hardware key / passkey enrollment is handled through AuthKit's broader passwordless authentication flow, which supports WebAuthn credentials — including FIDO2 hardware keys — as the primary authentication factor. For Owner and Super Admin, the admin WorkOS project is configured so that password + TOTP is not accepted as a complete login; a registered WebAuthn hardware credential is required to complete authentication.

**Policy:**
- Each Owner and Super Admin must register a minimum of two hardware keys (primary + backup) as WebAuthn credentials
- Backup keys are stored physically secure and offline when not in use
- Key registration is logged and requires an existing authenticated session
- Lost or stolen keys must be reported within 1 hour; deregistration is immediate via the WorkOS dashboard or Admin API
- Hardware keys are company-provided — personal devices are not acceptable for these roles

**Why not TOTP for Owner/Super Admin:**
TOTP codes are 6-digit and time-based. They can be intercepted by a real-time phishing proxy (an attacker who proxies the login page can steal and replay a valid TOTP code within its 30-second window). FIDO2 hardware keys are phishing-resistant by design — the private key never leaves the device and the WebAuthn challenge is cryptographically bound to the relying party origin, so a phishing proxy cannot intercept and replay it.

### 4.4 Emergency Access (Break-Glass)

In the event that normal authentication is unavailable (WorkOS outage, all hardware keys lost or unavailable), a break-glass procedure exists:

1. Break-glass credentials are stored in a **physical sealed envelope in a physically secure location** (not digital)
2. Breaking the seal sends an automated alert to all Super Admins via an out-of-band channel (Telegram Bot to a private group)
3. Break-glass access grants 30-minute read-only access only
4. A post-incident review is mandatory within 24 hours
5. Break-glass use is logged to an immutable external audit store (AWS CloudTrail in a separate, locked-down AWS account)

### 4.5 Password Policy

```
Minimum length:          16 characters
Maximum length:          256 characters
Strength requirement:    zxcvbn score ≥ 3 (strong)
Password history:        Last 12 passwords blocked
Expiry:                  365 days (with MFA — no shorter expiry is needed)
Breached password check: Checked against a breached-password database at
                         set time (enforced at the application layer on
                         top of AuthKit's signup/reset flow)
Common password block:   Top 10,000 common passwords blocked
Shared passwords:        Never. Each team member has their own credentials.
```

### 4.6 Account Lockout

```
Failed attempts before lockout:  5
Lockout duration:                30 minutes (automatic)
Manual unlock:                   Owner or Security Admin via audit-logged action
Failed attempt logging:          Every failed attempt logged with IP, device, timestamp
Brute force detection:           5 failures in 10 minutes → immediate lockout + alert
```

---

## 5. Authorisation — RBAC Model

### 5.1 Design Principles

**Least privilege:** Every role contains only the permissions strictly required for that role's function. No permission is included "just in case."

**Explicit deny:** Permissions are deny-by-default. A team member with no role cannot access anything. A new permission is not accessible to any role until explicitly granted.

**Immutable role definitions:** Role definitions live in the `actrone-infra` repository as code. They cannot be modified via the dashboard UI — only via a reviewed and approved PR. This prevents a malicious insider from elevating their own permissions through the UI.

**Separation of duties:** No single role can both perform a destructive action AND manage the audit log for that action. Security Admins can read audit logs but cannot execute destructive operations. Infra Admins can execute infrastructure changes but cannot modify audit log access.

**Dual approval for critical actions:** Kill switches, data purges, and production configuration changes require approval from a second team member of equal or higher role before execution.

### 5.2 Role Definitions

```
┌──────────────────────────────────────────────────────────────────┐
│  OWNER (1 person — Matt)                                         │
│                                                                  │
│  Full system access. The only role that can:                     │
│  • Create or delete roles                                        │
│  • Assign Owner or Super Admin roles                             │
│  • Approve dual-approval actions without a second person         │
│    (emergency only — always logged)                              │
│  • Access break-glass credentials                                │
│  • Permanently delete audit log entries (impossible by design)   │
│                                                                  │
│  Authentication: FIDO2 hardware key required                     │
│  Session timeout: 4 hours                                        │
│  Access review: N/A (this is the reviewer)                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  SUPER ADMIN                                                     │
│                                                                  │
│  Broad platform operations access. Cannot:                       │
│  • Manage roles or assign Super Admin                            │
│  • Access break-glass                                            │
│  • Execute kill switches without dual approval                   │
│  • Modify their own permissions                                  │
│                                                                  │
│  Authentication: FIDO2 hardware key required                     │
│  Session timeout: 4 hours                                        │
│  Access review: Quarterly                                        │
│  Headcount limit: 3                                              │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  INFRA ADMIN                                                     │
│                                                                  │
│  Infrastructure and deployment operations. Cannot:              │
│  • Access customer data or PII                                   │
│  • Modify billing or financial data                              │
│  • Manage user or org accounts                                   │
│  • View governance violations (customer compliance data)         │
│                                                                  │
│  Authentication: TOTP required                                   │
│  Session timeout: 8 hours                                        │
│  Access review: Quarterly                                        │
│  Headcount limit: 4                                              │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  SECURITY ADMIN                                                  │
│                                                                  │
│  Security monitoring and access management. Cannot:             │
│  • Modify infrastructure or services                             │
│  • Access customer business data                                 │
│  • Execute kill switches or data purges                          │
│  • Modify their own audit log entries                            │
│                                                                  │
│  Authentication: TOTP required                                   │
│  Session timeout: 8 hours                                        │
│  Access review: Quarterly                                        │
│  Headcount limit: 3                                              │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  BILLING ADMIN                                                   │
│                                                                  │
│  Financial data and customer billing. Cannot:                   │
│  • Access infrastructure or services                             │
│  • Access governance violations or agent data                    │
│  • Modify user accounts or org settings                          │
│  • Execute any destructive action                                │
│                                                                  │
│  Authentication: TOTP required                                   │
│  Session timeout: 8 hours                                        │
│  Access review: Quarterly                                        │
│  Headcount limit: 3                                              │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  SUPPORT ENGINEER                                                │
│                                                                  │
│  Customer-facing support operations. Cannot:                    │
│  • Access billing or financial data                              │
│  • Modify any configuration                                      │
│  • Access infrastructure or services                             │
│  • View raw API keys or secrets                                  │
│                                                                  │
│  Authentication: TOTP required                                   │
│  Session timeout: 8 hours                                        │
│  Access review: Biannual                                         │
│  Headcount limit: 10                                             │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  READ ONLY                                                       │
│                                                                  │
│  Non-sensitive read access. Cannot:                             │
│  • Access customer PII or billing data                           │
│  • Access security-sensitive views                               │
│  • Execute any write operation                                   │
│  Use case: Investors, advisors, onboarding team members          │
│                                                                  │
│  Authentication: TOTP required                                   │
│  Session timeout: 4 hours                                        │
│  Access review: Biannual                                         │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Permission Schema

### 6.1 Permission Notation

All permissions follow the pattern: `resource:action`

Resources: `platform`, `orgs`, `users`, `agents`, `billing`, `marketplace`, `services`, `databases`, `flags`, `rbac`, `audit`, `keys`, `ip`, `governance`, `violations`, `kill_switch`, `data_purge`

Actions: `read`, `write`, `delete`, `execute`, `export`

Wildcard: `*` means all actions on that resource. `*:*` means all resources and all actions.

### 6.2 Permission Matrix

| Permission | Owner | Super Admin | Infra Admin | Security Admin | Billing Admin | Support Eng | Read Only |
|---|---|---|---|---|---|---|---|
| `*:*` | ✓ | — | — | — | — | — | — |
| `platform:*` | ✓ | ✓ | — | — | — | — | — |
| `orgs:read` | ✓ | ✓ | — | ✓ | — | ✓ | ✓ |
| `orgs:write` | ✓ | ✓ | — | — | — | — | — |
| `orgs:delete` | ✓ | ✓ | — | — | — | — | — |
| `users:read` | ✓ | ✓ | — | ✓ | — | ✓ | — |
| `users:write` | ✓ | ✓ | — | — | — | — | — |
| `agents:read` | ✓ | ✓ | — | — | — | ✓ | ✓ |
| `agents:write` | ✓ | ✓ | — | — | — | — | — |
| `billing:read` | ✓ | ✓ | — | — | ✓ | — | — |
| `billing:write` | ✓ | ✓ | — | — | ✓ | — | — |
| `billing:export` | ✓ | ✓ | — | — | ✓ | — | — |
| `marketplace:read` | ✓ | ✓ | — | — | — | ✓ | ✓ |
| `marketplace:write` | ✓ | ✓ | — | — | — | — | — |
| `services:read` | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
| `services:write` | ✓ | ✓ | ✓ | — | — | — | — |
| `databases:read` | ✓ | ✓ | ✓ | — | — | — | — |
| `flags:read` | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `flags:write` | ✓ | ✓ | ✓ | — | — | — | — |
| `rbac:read` | ✓ | ✓ | — | ✓ | — | — | — |
| `rbac:write` | ✓ | — | — | — | — | — | — |
| `audit:read` | ✓ | ✓ | — | ✓ | — | — | — |
| `audit:export` | ✓ | ✓ | — | ✓ | — | — | — |
| `keys:read` | ✓ | ✓ | ✓ | — | — | — | — |
| `keys:write` | ✓ | ✓ | ✓ | — | — | — | — |
| `ip:read` | ✓ | ✓ | — | ✓ | — | — | — |
| `ip:write` | ✓ | ✓ | — | ✓ | — | — | — |
| `governance:read` | ✓ | ✓ | — | ✓ | — | — | — |
| `violations:read` | ✓ | ✓ | — | ✓ | — | — | — |
| `kill_switch:execute` | ✓ | ✓ (dual) | — | — | — | — | — |
| `data_purge:execute` | ✓ | ✓ (dual) | — | — | — | — | — |

**Note:** `(dual)` means the action requires approval from a second Super Admin or the Owner before execution.

### 6.3 Permission Enforcement Architecture

Permissions are enforced at three levels — all three must allow for an action to succeed. WorkOS includes permissions directly in the issued JWT (via its RBAC and Fine-Grained Authorization features), so permission checks at Levels 1 and 2 require no extra API call back to WorkOS — the claims are already on the token and cryptographically verified.

**Level 1 — Next.js middleware (route protection):**

```typescript
// apps/super-admin/middleware.ts
import { authkitMiddleware } from '@workos-inc/authkit-nextjs'
import { getRoutePermission } from '@/lib/rbac'

export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [], // every admin route requires auth — no exceptions
  },
  async afterAuth(auth, request) {
    // Not authenticated — generic 404 (do not reveal admin exists)
    if (!auth?.user) {
      return new Response(null, { status: 404 })
    }

    // Not in the isolated admin WorkOS project — 404
    if (auth.organizationId !== process.env.WORKOS_ADMIN_ORG_ID) {
      return new Response(null, { status: 404 })
    }

    // Permissions arrive directly on the WorkOS session — no extra API call
    const requiredPermission = getRoutePermission(request.nextUrl.pathname)
    const hasPermission = auth.permissions?.includes(requiredPermission)

    if (!hasPermission) {
      return new Response(null, { status: 404 })
    }

    // All checks passed — write audit event
    await writeAuditEvent({
      actor: auth.user.id,
      action: 'page_view',
      resource: request.nextUrl.pathname,
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })
  },
})
```

**Level 2 — API route handler (server action / API endpoint):**

```typescript
// Every API route starts with this guard
import { withAuth } from '@workos-inc/authkit-nextjs'

export async function POST(req: Request) {
  const { user, permissions } = await withAuth()
  const permission = 'orgs:write'

  if (!permissions?.includes(permission)) {
    return new Response(null, { status: 404 })
  }

  // Write audit before executing
  await audit.write({ actor: user.id, action: permission, ... })

  // Execute action
  ...
}
```

**Level 3 — Database query layer (row-level security in PostgreSQL):**

```sql
-- RLS policy on sensitive tables
-- Even if application code is bypassed, DB refuses cross-role access
CREATE POLICY admin_role_isolation ON admin_actions
  USING (
    current_setting('app.actor_role') IN ('owner', 'super_admin')
    OR (
      action_type NOT IN ('kill_switch', 'data_purge', 'rbac_write')
      AND current_setting('app.actor_role') = required_min_role
    )
  );
```

---

## 7. Session Management & Token Security

### 7.1 Session Lifecycle

```
Token type:         WorkOS-issued JWT (RS256 signed)
Access token TTL:   15 minutes
Refresh token TTL:  8 hours (Owner/Super Admin), 8 hours (others)
After 8 hours:      Full re-authentication required (MFA again)
Refresh rotation:   Every refresh token use issues a new refresh token
                    Old refresh token is immediately invalidated
Concurrent sessions: Maximum 2 simultaneous sessions per user
                     (primary device + one secondary)
```

WorkOS's session model exposes explicit session lifecycle states (active, timed-out, revoked), which the admin app subscribes to via WorkOS webhooks to trigger the forced-logout behaviour described in 7.5 in near real time, rather than waiting for the next token refresh to notice.

### 7.2 Session Binding

Sessions are bound to multiple fingerprints. If any fingerprint changes mid-session, the session is immediately invalidated and the user must re-authenticate:

- **IP address binding:** Session is bound to the connecting IP. An IP change (even within the VPN range) invalidates the session.
- **User-agent binding:** The browser/client user agent is stored at session creation. A change invalidates the session.
- **Risk signal binding:** WorkOS Radar evaluates each sign-in for anomalous signals (new browser/device combination, impossible travel, IP reputation). A session originating from a sign-in that Radar flagged as elevated risk is automatically restricted to read-only until a Security Admin clears it.

### 7.3 Idle Timeout

```
Owner:           15 minutes idle → force logout
Super Admin:     15 minutes idle → force logout
Infra Admin:     30 minutes idle → force logout
Security Admin:  30 minutes idle → force logout
All other roles: 30 minutes idle → force logout
```

Idle timeout is enforced client-side (JavaScript activity monitoring) AND server-side (WorkOS session validation via `withAuth()` on every API call). Client-side bypassing (e.g., a script simulating activity) does not prevent server-side timeout.

### 7.4 JWT Claim Structure

```json
{
  "sub": "user_01HXYZ...",
  "aud": "actrone-superadmin",
  "iss": "https://api.workos.com/user_management/client_...",
  "iat": 1700000000,
  "exp": 1700000900,
  "org_id": "org_actrone_superadmin",
  "role": "super_admin",
  "permissions": ["platform:*", "billing:read", "audit:read"],
  "actrone": {
    "mfa_verified": true,
    "mfa_method": "webauthn",
    "radar_risk_verdict": "allow",
    "vpn_ip": "10.100.0.4",
    "session_id": "session_01HXYZ..."
  }
}
```

`role` and `permissions` are populated natively by WorkOS's RBAC and Fine-Grained Authorization features and are included on the session token automatically — they cannot be forged by the client. The `actrone` namespace holds application-specific claims added via a WorkOS JWT template. The application verifies the JWT signature on every request using WorkOS's published JWKS endpoint for the admin project.

### 7.5 Forced Logout Triggers

The following events cause immediate session termination for the affected user, with an audit event written:

- Role change or permission modification to the user's account
- IP allowlist change that excludes the user's current IP
- VPN certificate revocation for the user's device
- Manual session revocation by Owner or Security Admin (via WorkOS Admin API)
- Password change
- New MFA/passkey device registration (invalidates all existing sessions)
- Account suspension
- WorkOS Radar flags a concurrent session from a different IP as high-risk

---

## 8. Audit & Immutable Logging

### 8.1 Audit Architecture

The audit log is the most security-critical component of the dashboard. It must be:
- **Append-only:** No one — including the Owner — can modify or delete audit entries
- **Tamper-evident:** Any modification is mathematically detectable
- **Replicated:** Stored in multiple locations so that compromising one does not destroy evidence
- **Queryable:** Security and compliance teams can search and filter
- **Exportable:** Entries can be exported as signed PDF reports for regulatory submissions

### 8.2 Audit Event Schema

```sql
CREATE TABLE admin_audit_log (
    log_id          BIGSERIAL PRIMARY KEY,
    event_id        UUID NOT NULL DEFAULT gen_random_uuid(),
    event_type      TEXT NOT NULL,
    actor_id        TEXT NOT NULL,          -- WorkOS user ID
    actor_email     TEXT NOT NULL,          -- email at time of action
    actor_role      TEXT NOT NULL,          -- role at time of action
    action          TEXT NOT NULL,          -- e.g. "orgs:write"
    resource_type   TEXT NOT NULL,          -- e.g. "organisation"
    resource_id     TEXT,                   -- e.g. org ID
    resource_before JSONB,                  -- state before mutation (encrypted)
    resource_after  JSONB,                  -- state after mutation (encrypted)
    ip_address      INET NOT NULL,
    user_agent      TEXT NOT NULL,
    vpn_peer_ip     INET NOT NULL,
    session_id      TEXT NOT NULL,
    result          TEXT NOT NULL,          -- "success" | "failure" | "blocked"
    failure_reason  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    merkle_leaf     BYTEA NOT NULL          -- SHA-256 Merkle chain hash
);

-- Append-only enforcement — no updates or deletes permitted
CREATE RULE no_update_audit AS ON UPDATE TO admin_audit_log DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO admin_audit_log DO INSTEAD NOTHING;

-- Even superuser cannot delete: revoke DELETE from all roles
REVOKE DELETE ON admin_audit_log FROM PUBLIC;
REVOKE DELETE ON admin_audit_log FROM postgres;
```

### 8.3 Merkle Hash Chain

Each audit entry includes a `merkle_leaf` — the SHA-256 hash of the entry's content concatenated with the previous entry's hash. This creates a tamper-evident chain:

```
merkle_leaf[n] = SHA-256(
    event_id_n      ||
    actor_id_n      ||
    action_n        ||
    resource_id_n   ||
    result_n        ||
    created_at_n    ||
    merkle_leaf[n-1]   ← chained to previous entry
)
```

To verify the integrity of the audit log:
1. Start from the first entry (merkle_leaf[0] = SHA-256 of entry 0 content)
2. For each subsequent entry, recompute the hash and compare
3. Any modification to any historical entry breaks the chain at that point
4. Verification script runs nightly and alerts if chain integrity fails

### 8.4 External Archival

Every 1,000 entries, the current Merkle root is written to two external, immutable locations:

1. **AWS CloudTrail** in a separate, locked-down AWS account with no admin access from the main account
2. **Hedera Hashgraph** — the Merkle root is submitted as a transaction, creating a cryptographic timestamp that cannot be retroactively altered even by Actrone

This means: even if the Actrone database is completely compromised and all data is deleted, the Merkle roots that existed at every 1,000-entry checkpoint are permanently recorded externally. Any reconstructed or forged audit log would fail to match these checkpoints.

**Identity-event stream (WorkOS Audit Logs):** In addition to the Actrone-owned Merkle-chained `admin_audit_log` table above (which covers application-level actions — page views, mutations, kill switches), WorkOS's own Audit Logs product independently captures every identity-layer event for the admin project — sign-ins, MFA enrolment, session revocation, role and permission changes — and can stream those events directly to a SIEM (WorkOS supports streaming to Microsoft Sentinel) or export to CSV for a given period. This gives a second, independently-sourced record of identity events that does not depend on the Actrone admin-api being available or uncompromised, which is valuable corroborating evidence during an incident investigation.

### 8.5 Audit Event Types

Every of the following events is logged without exception:

| Category | Events |
|---|---|
| Authentication | login_success, login_failure, logout, session_expired, mfa_challenged, mfa_success, mfa_failure, new_device_detected, account_locked, password_changed |
| Authorisation | permission_granted, permission_denied, role_assigned, role_revoked, role_created, role_deleted |
| VPN / Network | vpn_connected, vpn_disconnected, ip_blocked, ip_allowlisted, ip_removed |
| Organisation | org_created, org_suspended, org_deleted, org_tier_changed, org_data_exported |
| User | user_invited, user_suspended, user_deleted, user_data_exported, user_impersonated |
| Billing | billing_viewed, billing_refund_issued, subscription_modified, invoice_exported |
| Infrastructure | service_restarted, flag_toggled, db_queried, config_changed, deployment_triggered |
| Security | key_rotated, key_revoked, cert_renewed, break_glass_accessed, security_scan_run |
| Governance | violation_viewed, violation_exported, compliance_report_generated |
| Destructive | kill_switch_requested, kill_switch_approved, kill_switch_executed, data_purge_requested, data_purge_approved, data_purge_executed |
| Dashboard | page_viewed, data_exported, search_performed, filter_applied |

### 8.6 Audit Log Access

Viewing the audit log is itself audited. When a Security Admin or Super Admin views audit entries, an `audit:read` event is written for that session. This prevents an insider from reading the audit log to learn what they can and cannot safely do without being recorded.

Exporting the audit log (PDF or CSV) requires the `audit:export` permission and triggers an `audit:export` event with the query parameters used (time range, filters) so it is clear exactly what data was exported.

---

## 9. Dashboard Modules & Capabilities

### 9.1 Module Map with Required Permissions

| Module | Route | Minimum Permission | Data Sensitivity |
|---|---|---|---|
| System overview | `/` | `services:read` | Low |
| System health | `/health` | `services:read` | Low |
| Alerts | `/alerts` | `services:read` | Low |
| Organisations | `/orgs` | `orgs:read` | High |
| Organisation detail | `/orgs/:id` | `orgs:read` | High |
| Users | `/users` | `users:read` | High |
| User detail | `/users/:id` | `users:read` | High |
| Agents | `/agents` | `agents:read` | Medium |
| Marketplace | `/marketplace` | `marketplace:read` | Low |
| Billing overview | `/billing` | `billing:read` | Critical |
| Billing detail | `/billing/:orgId` | `billing:read` | Critical |
| Services | `/services` | `services:read` | Medium |
| Databases | `/databases` | `databases:read` | High |
| Feature flags | `/flags` | `flags:read` | Medium |
| RBAC management | `/rbac` | `rbac:read` | Critical |
| Audit log | `/audit` | `audit:read` | Critical |
| Access reviews | `/access-reviews` | `rbac:read` | Critical |
| API keys | `/keys` | `keys:read` | Critical |
| IP allowlist | `/ip` | `ip:read` | High |
| Governance violations | `/governance` | `governance:read` | High |
| Compliance reports | `/compliance` | `governance:read` | High |
| Kill switches | `/kill-switches` | `kill_switch:execute` | Critical |
| Data purge | `/data-purge` | `data_purge:execute` | Critical |
| Maintenance mode | `/maintenance` | `services:write` | High |
| Admin team settings | `/settings` | `rbac:read` | High |

### 9.2 Key Module Specifications

#### System Overview (Dashboard Home)
- Platform-wide metrics: active organisations, active agents, MRR, open incidents
- Live service health table (all Actrone microservices with uptime and latency)
- Active alerts panel (critical, warning, info tiers)
- Task throughput chart (8h window, mini bar chart)
- Top metrics: avg cost/task, total tool calls, hallucination rate, governance blocks
- Top 5 organisations by MRR
- Mini-audit feed (last 5 events, link to full audit log)
- Infrastructure usage bars (Redis, Qdrant, PostgreSQL, S3, Temporal)
- Security posture summary (MFA coverage, failed logins, blocked IPs)

#### Organisation Management
- Searchable, filterable list of all organisations
- Columns: name, tier, MRR, agents, users, created date, status
- Individual org view: tier, billing, usage, agents, users, API keys, governance score
- Actions: suspend org, change tier, reset billing, export org data
- All write actions require confirmation with typed resource name

#### RBAC Management
- Current role list with member count and permission summary
- Individual role view: all permissions as a matrix
- Team member list with current role, last login, MFA status, device count
- Actions: assign role, remove role, invite new admin, suspend admin
- Role edit: available only to Owner, triggers immediate session invalidation for affected user
- All changes require the actor to re-enter their password before applying

#### Audit Log
- Full paginated audit log with search and filter
- Filters: actor, event type, resource type, result, date range, IP address
- Each entry expandable to show: before/after state, full request context
- Merkle proof viewer: verify any entry's chain integrity inline
- Export: signed PDF or CSV with audit metadata

#### Kill Switches
- Enumerated list of named kill switches with clear descriptions
- Each kill switch shows: what it does, what it affects, estimated impact, last activated
- Activation requires: dual approval (second Super Admin or Owner confirms in-app), reason code entry, typed confirmation phrase
- Full history of previous activations with actor, reason, duration
- Kill switch state is persisted in a separate, high-durability configuration store

**Available kill switches:**

| Kill Switch | Effect | Impact |
|---|---|---|
| `halt_all_agents` | Stops all running agent tasks immediately | Platform-wide |
| `halt_new_tasks` | Blocks new task submissions; running tasks complete | Platform-wide |
| `halt_tool_calls` | Blocks all external tool call execution | All agents |
| `halt_model_calls` | Blocks all LLM API calls | All agents |
| `halt_org_{id}` | Stops all agents for a specific org | Single org |
| `read_only_mode` | Blocks all write operations; reads continue | Platform-wide |
| `maintenance_mode` | Returns 503 to all user-facing traffic | Platform-wide |
| `block_marketplace` | Blocks all marketplace publish/install operations | Marketplace |
| `halt_governance` | Disables governance engine (async only) | Governance |
| `freeze_billing` | Pauses all billing charges and renewals | Billing |

---

## 10. Frontend Architecture

### 10.1 Monorepo Placement

The Super Admin Dashboard is a **separate Next.js application** in the monorepo, not a route within an existing app. This isolates its dependencies, build process, and deployment from customer-facing applications.

```
apps/
  marketing/          ← actrone.com
  control-tower/      ← app.actrone.com
  marketplace/        ← marketplace.actrone.com
  docs/               ← actrone.com/docs
  super-admin/        ← admin.actrone.com  ← isolated here
    app/
      (auth)/         ← WorkOS AuthKit-protected, all admin routes
      api/            ← BFF: API routes proxying to Go backend
      layout.tsx      ← Root layout: security headers, session check
      not-found.tsx   ← Generic 404 for all not-found responses
    components/
    lib/
      rbac.ts         ← Permission checking utilities
      audit.ts        ← Audit event writing
      workos-admin.ts ← Admin WorkOS project client (isolated from
                         the customer-facing WorkOS project)
    middleware.ts     ← Auth + permission + audit gate
```

### 10.2 Security Headers

Every response from the admin app includes these security headers, enforced in `next.config.ts`:

```typescript
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'nonce-{nonce}' https://api.workos.com",
      "style-src 'self' 'nonce-{nonce}'",
      "img-src 'self' data:",
      "connect-src 'self' https://api.workos.com https://api.actrone.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
]
```

CSP uses **nonces** (randomly generated per request) rather than `unsafe-inline` — no inline scripts are permitted without a valid nonce matching the response header.

### 10.3 Sensitive Data Handling in Frontend

- **No sensitive data in client-side state:** API keys, billing data, and PII are never stored in React state, localStorage, or sessionStorage. They are server-rendered, masked by default, and revealed only on explicit action (which is logged).
- **Masking:** Sensitive fields (API keys, account numbers, email addresses) are masked in the UI by default: `act_live_••••••••••••••••`. A "reveal" button shows the full value, triggers an `audit:read` event, and sets a 30-second auto-mask timer.
- **Copy protection:** Sensitive pages set `user-select: none` on key fields in the DOM and intercept clipboard events to log copy actions.
- **No caching of sensitive responses:** API responses containing PII or billing data include `Cache-Control: no-store, no-cache, must-revalidate`.

---

## 11. Backend Architecture

### 11.1 Dedicated Admin API

The Super Admin Dashboard communicates with a **dedicated Go microservice** (`admin-api`) — not the customer-facing Orchestrator API. This service:

- Runs in a private subnet with no public internet access
- Accepts connections only from the admin Next.js app (via private ALB)
- Uses a dedicated PostgreSQL schema (`admin`) with its own connection pool
- Has read access to all other service databases but cannot write to them except through controlled admin operations
- Validates WorkOS-issued JWTs independently using the admin project's published JWKS endpoint

### 11.2 Dual Approval Implementation

Destructive actions (kill switches, data purges) use a two-phase commit pattern:

```
Phase 1 — PROPOSE:
  Actor A calls POST /admin/kill-switch/propose
  Body: { switch_id, reason_code, confirmation_phrase }
  Response: { proposal_id, expires_at (15 minutes) }
  Audit event: kill_switch_requested
  
  Notification sent to all eligible approvers via:
  - In-app notification (WebSocket push)
  - Email to admin team
  - Telegram alert to private admin group

Phase 2 — APPROVE:
  Actor B (different person, equal or higher role) calls
  POST /admin/kill-switch/approve
  Body: { proposal_id, approver_confirmation }
  
  Checks:
  - Actor B is not Actor A
  - Actor B has kill_switch:execute permission
  - Proposal has not expired (15 minute window)
  - Proposal has not already been approved or rejected
  
  Audit event: kill_switch_approved

Phase 3 — EXECUTE:
  Immediately after approval, execution is automatic
  Audit event: kill_switch_executed
  Notification: All Super Admins and Owner receive confirmation
  
  If Actor A tries to approve their own proposal:
  - Request is rejected
  - Suspicious_self_approval event written to audit log
  - Security Admin alerted
```

---

## 12. Infrastructure & Deployment

### 12.1 Dedicated Infrastructure

The Super Admin Dashboard runs on completely separate infrastructure from all customer-facing services. There is no shared load balancer, no shared database, and no shared network segment.

```
Customer-facing infrastructure:
  VPC: actrone-production (10.0.0.0/16)
  ECS cluster: actrone-prod-cluster
  ALB: api.actrone.com (public)

Admin infrastructure:
  VPC: actrone-admin (10.200.0.0/16)
  VPC peering: none (admin VPC does not peer with production VPC)
  ECS cluster: actrone-admin-cluster (dedicated)
  ALB: admin-internal-alb (private, VPN-only)
  Database: admin-rds (dedicated PostgreSQL instance)
```

Cross-VPC API calls from the admin service to production services go through **VPC endpoints** (AWS PrivateLink) — never through the public internet.

### 12.2 Deployment Pipeline

```
admin/ source code change
    ↓
GitHub Actions CI:
  - Dependency audit (npm audit --audit-level=moderate, fails on any)
  - Static analysis (ESLint, TypeScript strict mode)
  - Security scan (Snyk or Semgrep)
  - Test suite (unit + integration)
  - Docker image build
  - Trivy container vulnerability scan
  - Image pushed to ECR (admin-only ECR repo)
    ↓
ArgoCD (admin cluster):
  - Sync triggered
  - Rolling deployment (zero downtime)
  - Health check: /health endpoint must return 200 within 60s
  - Rollback on failure: automatic
    ↓
Deployment complete
  - Deploy event logged to audit trail
  - Notification to admin team Slack channel
```

### 12.3 Secrets Management

All secrets (database credentials, API keys, WorkOS admin API key) are stored in **HashiCorp Vault** with:

- Dynamic secret generation: database credentials are generated per-deployment, expire after 12 hours, and are automatically rotated
- No secrets in environment variables, config files, or Docker image layers
- Secrets are injected at runtime via the Vault Agent sidecar
- Access to Vault is via IAM role authentication (no static Vault token)

---

## 13. Incident Response & Kill Switches

### 13.1 Security Incident Severity Levels

| Level | Definition | Response Time | Actions |
|---|---|---|---|
| P0 — Critical | Confirmed breach or active attack | Immediate | Kill switches, isolate, escalate |
| P1 — High | Suspected breach or critical vulnerability | 15 minutes | Investigate, prepare kill switches |
| P2 — Medium | Security anomaly requiring investigation | 1 hour | Investigate, monitor |
| P3 — Low | Minor security concern or informational alert | 24 hours | Log, review, monitor |

### 13.2 Incident Response Playbook (P0)

```
0:00 — Alert triggers (automated detection or manual report)
       → PagerDuty page to Owner and all Super Admins

0:05 — Owner or first available Super Admin acknowledges
       → Create incident in incident tracking
       → Notify team via Telegram admin group

0:10 — Initial triage
       → Review audit log for anomalous activity
       → Identify affected accounts/services
       → Assess whether active breach is ongoing

0:15 — Containment decision
       → If active breach: activate appropriate kill switch
       → If stale credentials: revoke sessions, force re-auth
       → If insider threat: suspend account immediately

0:30 — Evidence collection
       → Export audit log for incident period
       → Preserve VPN connection logs
       → Capture CloudTrail events from external audit store

1:00 — Communication
       → Internal: notify all admin team members
       → External: assess customer notification requirements
       → Legal: notify legal counsel if customer data affected

2:00 — Remediation
       → Apply fixes
       → Force re-authentication for all admin users
       → Review and tighten relevant controls

24:00 — Post-incident review
        → Root cause analysis
        → Control improvements identified
        → Documentation updated
```

### 13.3 Offboarding Checklist

When a team member leaves, the following actions are completed within 2 hours of departure confirmation:

```
□ WorkOS admin account suspended via Admin API (not deleted — preserves audit history)
□ WireGuard public key removed from VPN gateway config
□ All active sessions revoked
□ API key access reviewed and relevant keys rotated
□ 1Password shared vault access revoked
□ All other access removed (Slack, GitHub, AWS console)
□ Audit event written: offboarding_completed with actor and timestamp
□ Offboarding confirmed by Owner or HR lead
□ 30-day monitoring period: audit log watched for any residual access attempts
```

---

## 14. Compliance & Regulatory Posture

### 14.1 Data Handling in the Admin Dashboard

The Super Admin Dashboard is the highest-privilege access point to all customer data. As such:

- **Data minimisation:** The dashboard displays the minimum data necessary for each operation. Full PII fields are masked by default and only unmasked when there is a legitimate operational reason.
- **Purpose limitation:** Access to customer data via the dashboard is limited to: customer support, billing disputes, security investigations, and regulatory requests. It is not permitted for product analytics, market research, or competitive intelligence.
- **Data subject access requests (DSAR):** The dashboard includes a dedicated DSAR workflow that allows Security Admins to retrieve all data held for a specific data subject across all Actrone systems, formatted for regulatory submission.
- **Right to erasure:** Data purge operations in the dashboard implement the right-to-erasure workflow, with a complete audit trail of what was deleted, when, and who authorised it.

### 14.2 Access Review Schedule

| Role | Review Frequency | Reviewer | What Is Reviewed |
|---|---|---|---|
| Owner | Annual | Board-level / External auditor | Full access audit |
| Super Admin | Quarterly | Owner | All permissions, recent audit log, necessity of access |
| Infra Admin | Quarterly | Owner or Super Admin | Permissions, recent activity |
| Security Admin | Quarterly | Owner or Super Admin | Permissions, recent activity |
| Support Engineer | Biannual | Super Admin | Permissions, recent activity |
| Read Only | Biannual | Super Admin | Continued need for access |

Access reviews are documented in the `actrone-infra` repository with signed-off sign sheets. They are not a formality — any team member whose access cannot be justified with a current business reason is immediately deprovisioned.

---

## 15. Security Testing & Review Cadence

| Activity | Frequency | Conducted By | Output |
|---|---|---|---|
| Dependency audit (npm audit, Go audit) | On every PR | CI pipeline | PR blocked if high/critical vulnerability |
| Container image scan (Trivy) | On every deployment | CI pipeline | Deployment blocked if critical CVE |
| Static application security testing (SAST) | On every PR | Semgrep / GitHub Advanced Security | Review required for findings |
| Penetration test (black-box, external) | Annual | Independent security firm | Findings logged, remediated with deadlines |
| Penetration test (white-box, internal) | Annual | Internal security engineer | Findings logged, remediated with deadlines |
| Access review | Per schedule above | Per schedule above | Deprovisioning of stale access |
| Audit log integrity verification | Nightly | Automated script | Alert on chain break |
| Merkle root anchoring | Every 1,000 entries | Automated | Hedera + CloudTrail record |
| Break-glass test | Quarterly | Owner + one Super Admin | Confirm procedure works |
| Incident response drill | Biannual | Full admin team | Timing and process review |

---

## 16. Operational Runbooks

### 16.1 Adding a New Admin Team Member

```
1. Owner approves new hire with specific role in writing
2. Infra PR created in actrone-infra:
   - Add WireGuard public key for their device
   - Create WorkOS user in the isolated admin project and add to
     the admin Organization
   - Assign role via WorkOS RBAC (role and permissions attach to
     the Organization membership)
3. PR reviewed by a second Super Admin and Owner
4. PR merged and Terraform applied
5. WireGuard config delivered via encrypted 1Password share
6. New team member logs in, registers MFA device (passkey/hardware
   key for Owner/Super Admin, TOTP for all other roles)
7. Owner or Super Admin confirms successful login
8. Onboarding event written to audit log
```

### 16.2 Rotating a Compromised API Key

```
1. Identify the compromised key from audit log or report
2. Navigate to /keys, locate the key
3. Click "Rotate" — this generates a new key and invalidates the old one
4. New key is displayed once (copy immediately)
5. Update the key in HashiCorp Vault for the affected service
6. Trigger a deployment of the affected service to pick up new key
7. Verify old key no longer works (any request with old key returns 401)
8. Audit log records: key_rotated with actor, timestamp, key ID
9. If compromise was confirmed: escalate to P1 incident and investigate
    how the key was accessed
```

### 16.3 Responding to a Suspicious Login Alert

```
1. Receive alert: new_device_detected or login_failure_threshold
2. Navigate to /audit, filter by the account in question
3. Review recent activity:
   - Is the IP within expected ranges?
   - Is the device recognised?
   - Is the activity pattern normal?
4. If benign (team member travelling, new laptop):
   - Confirm with team member via out-of-band channel (phone or Signal)
   - Approve the new device in /users/:id
5. If suspicious (unrecognised IP, unknown device, unusual hours):
   - Immediately suspend the account: /users/:id → Suspend
   - Revoke all active sessions
   - Contact the team member via out-of-band channel to verify
   - Escalate to P1 incident if contact cannot be made within 30 minutes
   - Review audit log for any actions taken during the suspicious session
```

---

*Document Version 1.1.0 — Actrone Engineering — RESTRICTED — 2026*  
*This document contains sensitive security architecture details. Do not distribute outside the Actrone engineering leadership team.*
