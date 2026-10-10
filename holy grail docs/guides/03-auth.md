# Guide 03 — Authentication & Identity

> **Status refreshed 2026-07-13 (code-verified) — MAJOR STALE CONTENT:** this guide was written
> entirely around Clerk, which was fully removed in the WorkOS auth switch
> (`docs/Actrone_WorkOS_Auth_Switch_Plan.md`; zero `clerk` references anywhere in the codebase,
> verified by grep). The identity provider is now **dual**: **WorkOS AuthKit** for the managed/cloud
> tier, or a **generic OIDC issuer** (Keycloak the bundled default, or Okta/Entra/Auth0/Zitadel) for
> self-hosted deployments — both verified by the **same provider-neutral verifier**,
> `internal/oidc.Verifier` (`internal/oidc/verifier.go`), not a Clerk-specific JWKS client. The
> identity-mirror columns are provider-neutral (`external_user_id`, `external_org_id` — not
> `clerk_org_id`), and the sync webhook is `POST /webhooks/workos` verified via WorkOS-Signature
> HMAC-SHA256 (`internal/handler/http/workos_webhooks.go`), not a Clerk+Svix webhook. **One thing
> that did NOT change:** the `org_role` claim value `"org:admin"` is still the literal `RequireOrgAdmin`
> checks against (`internal/middleware/auth.go:438`) — that part of the original guide was accidentally
> still correct. This guide also predates the **EMAOP RBAC role set** (`agent_operator, agent_admin,
> integration_admin, auditor, super_admin` — the `actrone_role` claim) and **scoped RBAC**
> (`platform, emaop, marketplace, integrations, billing` — the `actrone_roles` map claim,
> `docs/Actrone_Scoped_RBAC_Plan.md`), both real and both layered on top of the `org_role` check
> described below; not covered here, see the plan doc.

## Mental Model

```
              ┌───────────────────────┐
              │  WorkOS AuthKit (SaaS)  │  Managed tier
              │  or generic OIDC issuer │  Self-hosted tier — EITHER, verified by
              │  (self-host, e.g. Keycloak) │  ONE provider-neutral verifier
              └───────────┬─────────────┘
                          │ WorkOS-Signature webhook (HMAC-SHA256 verified,
                          │ POST /webhooks/workos)
                          ▼
                    ┌─────────────┐
                    │  PostgreSQL │  Local identity mirror
                    │  users      │  Zero-latency auth checks
                    │  orgs       │  Tenant ↔ Org mapping (external_org_id)
                    │  members    │  RBAC role storage
                    └─────────────┘

BROWSER SESSION:          WorkOS/OIDC session JWT → internal/oidc.Verifier → tenantID in context
SDK PROGRAMMATIC ACCESS:  SHA-256(api_key) lookup → tenant from api_keys table
```

---

## Authentication Flow (WorkOS / Generic-OIDC Session JWT)

```
1. User signs in via browser (headless custom UI — WorkosSignIn or OidcSignIn,
   selected by NEXT_PUBLIC_AUTH_PROVIDER; Guide 07)
   └─ The IdP issues an RS256/384/512 or ES256/384/512 JWT with claims
      (default claim names — configurable per self-hosted issuer):
      sub          = user_01H...         (IdP user id)
      org_id       = org_01H...          (active org — OrgClaim, default "org_id")
      org_role     = org:admin           (OrgRoleClaim, default "org_role")
      actrone_role = agent_admin         (RoleClaim — EMAOP role, optional)
      email        = user@company.com    (EmailClaim)

2. Browser sends: Authorization: Bearer <session_jwt>

3. Go middleware (internal/middleware/auth.go), backed by internal/oidc.Verifier:
   a. Verifier.Verify(token)
      ├─ Reads kid from JWT header
      ├─ Looks up RSA/ECDSA public key from in-memory cache (by kid)
      ├─ If kid unknown → eager JWKS refresh (handles key rotation)
      ├─ Rejects HS*/"none" algorithms outright (alg-confusion hardening) —
      │  only accepts RS256/384/512, ES256/384/512
      └─ Validates signature + expiry + issuer (+ audience, if configured)
   b. On success → OrganizationRepository.GetTenantID(org_id)
      └─ SQL: SELECT tenant_id FROM organizations WHERE external_org_id = $1
   c. Injects into context:
      tenantKey        → uuid.UUID (for SQL scoping)
      principalKey     → "user_01H..." (for audit log)
      orgExternalIDKey → "org_01H..."
      orgRoleKey       → "org:admin"

4. Every SQL query uses: WHERE tenant_id = TenantIDFromContext(ctx)
```

---

## Authentication Flow (API Key)

```
1. SDK sends: Authorization: Bearer act_live_abc123...

2. Go middleware fallthrough path:
   a. SHA-256 hash of raw bearer token
   b. SQL: SELECT tenant_id FROM api_keys
          WHERE hash = $1 AND revoked_at IS NULL
   c. RecordUsage fire-and-forget (5s timeout, non-blocking)
   d. Injects tenant_id + principal ("apikey:" + hash[:16]) into context
   e. org_role set to "org:admin" — API key holders are trusted

3. API keys are stored as SHA-256 hashes — the raw key is never stored.
   If the database is compromised, raw keys cannot be recovered.
```

---

## JWKS Key Cache

```
internal/oidc/verifier.go   (Package oidc — GENERIC OIDC verifier; corrected 2026-07-13,
                              was internal/clerk/jwks_verifier.go)

┌──────────────────────────────────────────────────────────┐
│                    oidc.Verifier                          │
│                                                          │
│  cache: map[string]crypto.PublicKey  (keyed by kid,      │
│         RSA or ECDSA — not RSA-only)                     │
│  mu: sync.RWMutex                                        │
│                                                          │
│  Startup: fetch + cache → HTTP GET JWKS_URL (discovered   │
│           from Issuer + /.well-known/openid-configuration │
│           when JWKSURL is not set explicitly)             │
│  Per-request: cache read (< 1 µs, no network)           │
│  On unknown kid: eager refresh → re-fetch JWKS           │
│  Background: refresh loop → every 6h (jwksRefreshInterval)│
└──────────────────────────────────────────────────────────┘

Key rotation scenario:
  1. The IdP (WorkOS or your self-hosted OIDC issuer) rotates signing keys
     (new kid appears in JWKS)
  2. Next request with new kid → cache miss → immediate refresh
  3. Old kid remains cached until 6h refresh or process restart
  4. Zero downtime key rotation guaranteed
```

---

## Identity Mirror (PostgreSQL)

The local identity mirror exists so tenant resolution is a single DB lookup, not an IdP API call on every request.

```sql
-- Populated exclusively via WorkOS webhooks (never written to directly)
-- corrected 2026-07-13: columns are provider-neutral (external_*), not clerk_*

users              -- IdP user objects: external_user_id, email, full_name, image_url
organizations      -- IdP orgs: external_org_id → tenant_id (1:1 mapping)
org_memberships    -- user ↔ org with role: org:admin | org:member
agent_sessions     -- workflow_id → org_id (Barrier 2 isolation)
tenants            -- Internal tenant: name, external_org_id, deleted_at, daily_budget_usd
```

**Webhook → DB sync path:**
```
WorkOS event (WorkOS-Signature HMAC-SHA256 verified — POST /webhooks/workos,
internal/handler/http/workos_webhooks.go; corrected 2026-07-13, was Clerk+Svix)
  │
  ├─ user.created → IdentityService.OnUserCreated()
  │   ├─ users.Upsert(externalUserID, email, fullName)
  │   ├─ ensurePersonalWorkspace() → creates free plan org + tenant
  │   └─ emailSvc.Send(WelcomeEmail)
  │
  ├─ organization.created → OnOrgCreated()
  │   ├─ tenants.Create(name, externalOrgID)
  │   └─ organizations.Upsert(externalOrgID, tenantID, name, slug)
  │
  ├─ organizationMembership.created → OnMembershipCreated()
  │   └─ org_memberships.Upsert(userID, orgID, role)
  │
  └─ organizationInvitation.created → OnInvitationCreated()
      └─ emailSvc.Send(InvitationEmail via Resend)
```

---

## RBAC Guards

```go
// Applied in main.go router:

// org:admin only — write operations that affect the entire org
router.With(middleware.RequireOrgAdmin).Delete("/v1/agents/{id}", ...)
router.With(middleware.RequireOrgAdmin).Post("/v1/auth/api-keys", ...)
router.With(middleware.RequireOrgAdmin).Delete("/v1/auth/api-keys/{id}", ...)
router.With(middleware.RequireOrgAdmin).Put("/v1/governance/policy", ...)

// RequireOrg — block personal workspace access to team features
router.With(middleware.RequireOrg).Get("/v1/coordination/active", ...)
```

API key holders bypass RBAC guards — they are treated as trusted admins (role forced to `org:admin`). This is intentional: SDK programmatic access via API keys is for automated pipelines, not human users with role constraints.

---

## Three User Modalities

| Modality | Auth | Plan | Use Case |
|---|---|---|---|
| **Indie Dev** | Email + social sign-in → personal workspace | Free | Building alone, < 1 agent |
| **Production Team** | Org sign-in, role-based | Pro / Scale | Team with admins + members |
| **Enterprise** | SAML/OIDC SSO, domain-based routing | Enterprise | 100+ users, compliance required |

---

## Adding New Protected Endpoints

```go
// In cmd/orchestrator/main.go, inside r.Route("/v1", func(r chi.Router) {

// Admin-only endpoint:
r.With(middleware.RequireOrgAdmin).Post("/v1/your-new-endpoint", yourHandler.Create)

// Authenticated any role:
r.Get("/v1/your-new-endpoint", yourHandler.List)

// In your handler, always scope SQL by tenant:
tenantID, ok := middleware.TenantIDFromContext(ctx)
if !ok {
    writeError(w, http.StatusUnauthorized, domain.ErrCodeUnauthorised, "...")
    return
}
// Then: repository.SomeQuery(ctx, tenantID, ...)
```

---

## WorkOS Webhook Security

> Corrected 2026-07-13 (was "Svix Webhook Security" — Clerk+Svix were removed with the WorkOS auth
> switch).

The Go webhook handler (`internal/handler/http/workos_webhooks.go`) verifies every WorkOS event
using the `WorkOS-Signature` HMAC-SHA256 scheme before any processing:

```
Signed message = "{timestamp}.{rawBody}"
Expected sig   = hex(HMAC-SHA256(signedMessage, signingSecret))
Header format  = "t=<timestamp>, v1=<hex-hmac>"
Replay guard   = |now - timestamp| < 5 minutes (workosMaxAgeSeconds)
Body limit     = 1 MiB (workosMaxBodyBytes), rejected before decode

Startup fail-fast: NewWorkOSWebhookHandler panics if the signing secret is empty or
shorter than 16 chars (workosMinSecretLen) — a misconfiguration must never silently
accept unauthenticated identity mutations.
```

The webhook route (`POST /webhooks/workos`) is registered **before** the Auth middleware so it does
not require a Bearer token — WorkOS-Signature verification replaces token auth. It feeds the SAME
provider-neutral `IdentityService` the Clerk+Svix path used to (one-to-one `On*` methods), so no
downstream sync logic changed — only the transport-layer verification.
