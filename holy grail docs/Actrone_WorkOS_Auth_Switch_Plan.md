# Actrone — WorkOS Auth Switch Plan (remove Clerk entirely)

> **Status refreshed 2026-07-13 (code-verified):** The header below still says "Status: PLAN" —
> that is stale. **This workstream is COMPLETE.** Verified directly (not from prior notes):
> `grep -rli clerk` across `backend/`, `frontend/`, `actrone-py/`, `actrone-ts/`, `actrone-cli/`,
> and `infra/` (excluding `node_modules`/`.venv`) returns **zero matches**, and no `package.json`
> anywhere in the repo lists `@clerk/*`. `backend/orchestrator/internal/middleware/auth.go` now
> authenticates via a single generic `internal/oidc` verifier serving **either** managed WorkOS
> AuthKit tokens **or** a self-host generic-OIDC issuer through the same JWKS path (matches §0's
> "the backend barely changes" prediction exactly). The Python SDK's webhook path is WorkOS-native:
> `verify_workos_webhook` exists in `actrone-py/src/actrone/webhooks.py`, referenced from
> `config.py` and covered by `tests/unit/test_webhooks.py` — the svix/Clerk webhook path is gone.
> Definition-of-done item 1 ("No `@clerk/*` dependency, import, component, env var, or doc
> reference anywhere in the repo") is satisfied for code; a few **other docs** (outside this
> plan's ownership) still narrate Clerk historically — e.g. `Actrone_Self_Hosting_Plan.md` and
> `Actrone_Data_Residency_Plan.md`, both corrected separately in this same pass — which is
> expected drift, not a code gap. **Not independently re-verified in this pass (unverified
> 2026-07-13):** whether the MFA enroll/challenge/verify step-up screens and passkey support
> described in §"MFA" below actually shipped, or remain the "known follow-up" noted elsewhere —
> a light grep found only `sign-in/actions.ts` referencing MFA under
> `frontend/apps/control-tower/src/app/(auth)`, suggesting the step-up UI may still be partial;
> this needs a dedicated pass to confirm either way.
>
> **Goal.** Replace Clerk with **WorkOS** as Actrone's identity provider for the managed (cloud) tier,
> using a **fully custom, headless UI** (our own sign-in / sign-up / sign-out / user-settings surfaces
> on the locked monochrome brand) built against the **WorkOS User Management APIs** — and **delete every
> trace of Clerk** from the codebase. Keep the existing **generic-OIDC** provider as the self-host /
> air-gap path (WorkOS is SaaS and cannot run inside a sovereign cluster).
>
> **Context.** Everything is pre-production and in active development, so this is a **clean replacement,
> not a data migration** — no Clerk→WorkOS user export, no dual-run, no back-compat shims. We rip Clerk
> out and stand WorkOS up.
>
> Owner: Matt · Scope: `frontend/apps/{control-tower,marketplace,marketing}` + `backend/orchestrator` +
> infra config + docs · Status: PLAN, text below not yet updated to reflect completion — see the
> "Status refreshed 2026-07-13" note at the top of this file for the current, code-verified status
> · Last updated: 2026-07-08 · Precedence: extends the workspace +
> project `CLAUDE.md`.

---

## 0. Why WorkOS + headless, and what "done" means

- **WorkOS fits the enterprise buyer.** SSO / SCIM / Directory Sync / Audit Log are the product, with
  60+ IdP integrations, 1M MAU free on AuthKit, and predictable per-connection pricing. This is the
  identity posture a "governed enterprise agent OS" is sold into.
- **Headless (bring-your-own-UI), not the hosted box.** WorkOS supports a fully self-hosted UI against
  the **User Management APIs** (official reference: `workos/workos-custom-ui-authkit-example`). We build
  every screen. This is **required** for Actrone: the hosted AuthKit box is Radix-styled and would
  violate the **locked Black & Apple-Silver brand system** (`CLAUDE.md` §8.1.1). Headless gives us 100%
  of the pixels; WorkOS does the security-critical backend (token signing, JWKS, sealed sessions,
  SSO/SCIM/MFA).
- **The backend barely changes.** WorkOS access tokens are standard **JWKS-signed JWTs**. The
  orchestrator already runs a generic OIDC JWKS verifier (`internal/oidc`, wired at `main.go:1417`)
  *in parallel* with the Clerk verifier, and the auth middleware accepts either. WorkOS tokens verify
  through the **existing** OIDC verifier — we point its issuer/JWKS at WorkOS and delete the Clerk one.

**Definition of done**

1. No `@clerk/*` dependency, import, component, env var, or doc reference anywhere in the repo.
2. Managed tier authenticates entirely via WorkOS with our own branded UI for sign-in, sign-up,
   sign-out, and all user/org settings.
3. Self-host / air-gap continues to work via the untouched **generic-OIDC** provider.
4. Backend verifies WorkOS JWTs via JWKS; authorises in the service (not just the edge).
5. All CI gates green (typecheck, lint, unit/integration, `go build`/`vet`, contract).

---

## 1. Current state (grounded inventory, 2026-07-08)

### 1.1 Frontend — the Clerk footprint (47 files import `@clerk/*`)

| App | Files importing `@clerk/*` |
| --- | --- |
| `control-tower` | **38** |
| `marketplace` | **7** |
| `marketing` | **2** (`lib/analytics/posthog.tsx`, `lib/entitlements.server.ts`) |

Packages in use: `@clerk/nextjs ^7.0.5` (client hooks + `<ClerkProvider>` + `clerkMiddleware`/`auth()`/
`clerkClient`) and `@clerk/types ^4.101.25` (Passkey/Session/Membership/Invitation types in profile +
team). Present in all three apps' `package.json`.

### 1.2 There is already a provider-abstraction seam — reuse it

`apps/{control-tower,marketplace}/src/lib/auth/` is a real provider-agnostic layer built for self-host,
with **per-provider split files** we can mirror for WorkOS and then prune of Clerk:

- `config.ts` — `resolveAuthProvider()` / `isClerk()` / `isOidc()` (single source of provider truth).
- `server.ts` + `server-token.ts` — normalise the session; **dynamic-import** the Clerk server SDK so a
  non-Clerk build tree-shakes it out.
- `hooks.ts` → `hooks-clerk.ts` / `hooks-oidc.ts` (+ `hook-types.ts`) — provider-agnostic
  `useUser`/`useOrganization`.
- `actions.ts` → `actions-clerk.ts` / `actions-oidc.ts` (+ `actions-types.ts`) — org-switch server actions.
- `clerk-claims.ts` / `oidc-claims.ts` — normalise claims into `types.ts`'s `AuthSession`/`AuthUser`/`AuthOrg`.
- **A full custom OIDC auth-code flow already exists**: `oidc-flow.ts`, `oidc-cookies.ts`,
  `oidc-server.ts`, `capabilities.ts` (+ their `*.test.ts`). This is the template for the WorkOS headless
  flow — much of the sealed-cookie / PKCE / callback machinery is already written and tested.

The abstracted **read/session surface is ~80% insulated**; the un-abstracted seams (below) are the real work.

### 1.3 Env + provider switch

`lib/env.ts`: `NEXT_PUBLIC_AUTH_PROVIDER: z.enum(['clerk','oidc']).default('clerk')`, with Clerk keys
(`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) required when `clerk`, and a full
`NEXT_PUBLIC_OIDC_*` + `OIDC_CLIENT_SECRET`/`OIDC_SCOPE` set required when `oidc`. A superRefine enforces
per-provider requiredness at boot.

### 1.4 Backend

- `internal/oidc/verifier.go` — **generic OIDC JWKS verifier** (issuer + JWKS URL + audiences + claim
  maps), refresh loop. Gated on `cfg.Auth.OIDC.*`.
- `internal/clerk/jwks_verifier.go` — Clerk-specific JWKS verifier, gated on `cfg.Auth.ClerkJWKSURL`.
- `main.go:1406-1436` builds **both**; `main.go:2143`/`3641` pass `Verifier: clerkVerifier,
  OIDCVerifier: oidcVerifier` into the HTTP + WS auth middleware (either is accepted). WorkOS rides the
  `oidcVerifier`; the Clerk one is deleted.

### 1.5 The un-abstracted seams (the real migration cost)

| Category | Files | Clerk API |
| --- | --- | --- |
| Middleware / route protection | `control-tower/src/proxy.ts` | `clerkMiddleware`, `createRouteMatcher` |
| Root provider + auth UI | `components/auth/{RootAuthProvider,ClerkThemed}.tsx`, `components/ClerkTokenProvider.tsx`, `app/(auth)/sso-callback/page.tsx` | `<ClerkProvider>`, `<SignIn/>`, `useAuth`, redirect callback |
| Settings management (5) | `app/(app)/settings/{features,notifications,organization,profile,team}/page.tsx` | `useUser`, `useOrganization`, `useClerk`, `@clerk/types` |
| Onboarding (4) | `components/onboarding/{DashboardOnboarding,OnboardingChecklist,OnboardingFlow,OnboardingGate}.tsx` | `useUser`/`useOrganization` |
| Environments (2) | `components/features/environments/PromotionDialog.tsx`, `components/layout/EnvironmentPill.tsx` | `useOrganization` |
| Marketplace client (CT 4 + mktpl 3) | `components/marketplace/{PublishWizard,StarButton}.tsx` (both apps), CT marketplace pages, mktpl `[publisher]/[agent]` | `useAuth`, `useClerk` |
| Server API routes (CT 9) | `api/ai/docs-chat`, `api/marketplace/*` (checkout-session, packages, publish, publishers/{claim-handle,me}), `api/org/{branding,features}`, `api/ws-ticket` | `auth()`, `clerkClient` |
| Server libs | `lib/entitlements.server.ts` (×3 apps), `lib/api/marketplace-server.ts` (×2) | `auth`, `clerkClient` |
| Analytics | `lib/analytics/posthog.tsx` (×2) | `useUser`/`useOrganization` for identify |

**Org metadata lives in Clerk today** (`api/org/branding`, `api/org/features` read/write org public
metadata via `clerkClient`). WorkOS Organizations carry metadata too, but this state should move to
**our own store** (orchestrator) rather than the IdP — see Phase 6.

---

## 2. Target architecture

```
Browser (our branded React UI — no third-party auth widget)
   │  POST /auth/* (Route Handlers / Server Actions)
   ▼
Next.js server (control-tower / marketplace)
   │  WorkOS Node SDK (server-only; WORKOS_API_KEY never in the client bundle)
   │  → authenticateWithPassword / MagicAuth / getAuthorizationUrl / authenticateWithCode
   │  → sealSession()  → HTTP-only, Secure, SameSite cookie (AES-256 via jose/iron-webcrypto)
   ▼
WorkOS (identity: users, orgs, SSO, SCIM, MFA, JWKS, Audit Log)
   ▲
   │  access token = JWKS-signed JWT (Bearer)
   ▼
Go orchestrator — internal/oidc JWKS verifier (issuer/JWKS = WorkOS) → authorise in-service
```

- **One auth seam, two providers**: `workos` (managed) and `oidc` (self-host/air-gap). The enum becomes
  `['workos','oidc']` (Clerk removed), default `workos`. WorkOS *is* an OIDC IdP, so the `workos`
  provider may internally reuse large parts of the existing `oidc-*` flow; we keep a distinct provider
  because WorkOS's headless UM APIs (email-first detection, magic link, org-selection, MFA, sealed
  sessions) are richer than a bare OIDC auth-code redirect and give us the fully custom UX.
- **Server-side only** for every WorkOS call; the browser sees only our forms + a sealed cookie.
- **Backend unchanged in shape** — point the existing OIDC verifier at WorkOS; delete Clerk.

---

## 3. Phased plan

Each phase: prod-grade + tests, CI green, then next. All uncommitted until the owner commits.

### Phase 0 — Foundations
- WorkOS project/env set up (Staging + Production **separate** WorkOS environments; never share keys).
- Add deps: `@workos-inc/node` (server SDK) to all three apps; `jose` is already transitively available
  for JWT/JWKS. Do **not** add `@workos-inc/authkit-nextjs` unless we choose the middleware helper (we
  are headless — evaluate, but default to building on the raw Node SDK for full control).
- Extend `lib/env.ts`:
  - `NEXT_PUBLIC_AUTH_PROVIDER: z.enum(['workos','oidc']).default('workos')`.
  - Server-only: `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD` (**≥32 chars**),
    `WORKOS_REDIRECT_URI`. Public: `NEXT_PUBLIC_WORKOS_CLIENT_ID` (for edge middleware),
    `NEXT_PUBLIC_WORKOS_REDIRECT_URI`.
  - superRefine: require the WorkOS set when provider=`workos`, the OIDC set when `oidc`. Remove all
    Clerk keys.
- Secrets: WorkOS keys into the secrets manager (dev/staging/prod separated). `WORKOS_COOKIE_PASSWORD`
  via `openssl rand -base64 32`.

### Phase 1 — Backend token verification (smallest, do first)
- Add `cfg.Auth.WorkOS` (or simply reuse `cfg.Auth.OIDC` pointed at WorkOS — **preferred**, less code):
  set `OIDC.IssuerURL` / `OIDC.JWKSURL` / `OIDC.Audiences` / claim maps to WorkOS values. WorkOS tokens
  then verify through the existing `oidcVerifier` with **no new verifier code**.
- Delete `internal/clerk/` (`jwks_verifier.go` + test), remove `cfg.Auth.ClerkJWKSURL`, and drop
  `clerkVerifier` construction + the `Verifier: clerkVerifier` middleware field at `main.go:1406-1412`,
  `1899-1900`, `2143`, `3641`. The auth middleware keeps only `OIDCVerifier`.
- Map WorkOS JWT claims → Actrone principal: `sub` (user), the org claim, and role/roles claims (align
  to WorkOS's `org_id` + role claim names; set them in the claim-map config so the domain authz layer is
  unchanged). Impersonation `act` claim: log it; treat as the acting user for audit.
- Tests: `oidc` verifier already tested; add a WorkOS-shaped JWT fixture (issuer/aud/claims) to prove
  end-to-end verify + claim mapping. `go build ./...` + `go vet` + `go test ./internal/oidc/...` green.

### Phase 2 — The `workos` auth seam (server-side)
- New files mirroring the OIDC ones (per app): `lib/auth/workos-server.ts` (the WorkOS Node client,
  `sealSession`/`loadSealedSession`, `withAuth`-style session load + transparent refresh),
  `lib/auth/workos-claims.ts` (WorkOS user/org/role → `types.ts` shapes), `lib/auth/hooks-workos.ts`,
  `lib/auth/actions-workos.ts` (org-switch = `authenticateWithOrganizationSelection`).
- `config.ts`: `resolveAuthProvider()` returns `'workos' | 'oidc'`; add `isWorkos()`; remove `isClerk()`.
- `server.ts`/`hooks.ts`/`actions.ts`: swap the Clerk branch for the WorkOS branch (keep OIDC branch).
- Sessions: sealed **HTTP-only + Secure + SameSite=Lax** cookie; refresh tokens **single-use** (rotate
  every refresh); JWKS cached. Reuse `oidc-cookies.ts` patterns where possible.

### Phase 3 — Custom auth UI (fully branded, headless)
Build our screens under `app/(auth)/` (control-tower + marketplace as needed):
- **Sign-in (email-first)**: one email field →
  - `userManagement.listConnections({ domain })` → if an SSO connection exists, `getAuthorizationUrl({
    organizationId|connectionId })` and redirect to the IdP;
  - else show password (`authenticateWithPassword`) + "email me a link"
    (`createMagicAuth` → `authenticateWithMagicAuth`) + social buttons (`getAuthorizationUrl({ provider:
    'GoogleOAuth' })`).
- **OAuth/SSO callback**: replace `app/(auth)/sso-callback/page.tsx` with a WorkOS callback Route Handler
  → `authenticateWithCode({ code })` → `sealSession` → redirect. Handle `organization_selection_required`
  → org-picker UI → `authenticateWithOrganizationSelection`.
- **Sign-up**: `createUser` + email verification (`sendVerificationEmail`/`verifyEmail`) or invitation
  acceptance; then the same session-seal.
- **MFA**: enroll/challenge/verify auth factors (TOTP) as our own step-up screens.
- **Sign-out**: server action → `session.getLogoutUrl()` → redirect + clear the sealed cookie. **CSRF
  double-submit** token on logout + org-switch.
- Every screen on the locked brand (Geist, monochrome, lucide icons, tokens) with the mandated
  loading / error / empty states (§8.2); honour `prefers-reduced-motion`.
- Delete `components/auth/{RootAuthProvider,ClerkThemed}.tsx` + `components/ClerkTokenProvider.tsx` (no
  `<ClerkProvider>` — a headless app has no auth context provider; session comes from the server via the
  sealed cookie + a light client context if needed for `useUser`).

### Phase 4 — Middleware, route protection, WS ticket
- Rewrite `proxy.ts`: replace `clerkMiddleware`/`createRouteMatcher` with a WorkOS session middleware
  (validate the sealed cookie on the server, refresh transparently before expiry, redirect
  unauthenticated users off protected matchers). Preserve the existing **feature-gating** logic that
  currently rides in this middleware — it stays; only the auth primitive changes.
- `api/ws-ticket/route.ts`: mint the WS ticket from the WorkOS session (server `auth()` → our token),
  not Clerk.
- Keep authorization in the orchestrator (edge is optimisation, not the boundary — CLAUDE.md §5.2).

### Phase 5 — User & org settings (custom UI)
Rebuild the 5 settings pages on WorkOS UM APIs (our UI, WorkOS backend):
- `settings/profile` — update name/email, set/reset password, **manage MFA factors** (replaces Clerk
  Passkey/Session types).
- `settings/team` — list/invite/remove org members, change roles (`listOrganizationMemberships`,
  `sendInvitation`, `updateOrganizationMembership`, `deactivate…`), replacing Clerk
  Membership/Invitation.
- `settings/organization` — org profile; **embed the WorkOS Admin Portal** (`generatePortalLink`) so org
  admins self-serve **SSO + Directory Sync/SCIM** with zero UI for us to build for IdP setup.
- `settings/features` + `settings/notifications` — these are Actrone-domain, not identity; they only used
  Clerk for the current user/org id. Repoint to the seam's `useUser`/`useOrganization`.

### Phase 6 — Remaining importers (marketplace, onboarding, environments, analytics, server libs, org metadata)
- **Onboarding (4)**, **environments (2)**, **marketplace client (7)**: swap `useAuth`/`useUser`/
  `useOrganization`/`useClerk` for the seam's agnostic hooks (`@/lib/auth/hooks`) + the client token
  getter backed by the WorkOS session. Track-4 / newer surfaces already use the agnostic hooks — those
  are no-ops.
- **Server API routes (9) + server libs (`entitlements.server.ts` ×3, `marketplace-server.ts` ×2)**:
  replace `auth()`/`clerkClient` with the seam's `getAuthSession()` (WorkOS) for the principal, and for
  **org metadata** (`api/org/branding`, `api/org/features`) move the read/write to the **orchestrator**
  (a small `org_settings` surface) instead of Clerk/WorkOS metadata — one authoritative store, no IdP
  round-trip. (Contract-first per §2: one source of truth for org settings.)
- **Analytics `posthog.tsx` (×2)**: identify from the seam session, not Clerk hooks.
- **Marketing app (2)**: `entitlements.server.ts` + `posthog.tsx` → seam session.

### Phase 7 — Rip Clerk out entirely
- Remove `@clerk/nextjs` + `@clerk/types` from all three `package.json`; delete `*-clerk.ts` seam files
  (`actions-clerk.ts`, `hooks-clerk.ts`, `clerk-claims.ts`) in both apps; delete any remaining
  Clerk components; purge all `CLERK_`/`NEXT_PUBLIC_CLERK` from `env.ts` (+ its test) and every `.env*`
  example.
- Docs: update the 4 self-hosting/security docs that document Clerk env vars (`docs/self-hosting/
  {configuration,kubernetes}`, `docs/security/secret-management`, `docs/sdks/python`) to WorkOS +
  generic-OIDC.
- `grep -ri clerk` across the repo must return **zero** hits (outside historical changelog/progress notes).

### Phase 8 — Testing & CI gates
- **Unit**: claim mapping (WorkOS→`AuthSession`), sealed-session seal/unseal/refresh, provider
  resolution, middleware allow/deny, each auth Server Action. Reuse/extend the existing
  `auth.test.ts` / `oidc-flow.test.ts` / `actions-oidc.test.ts` / `capabilities.test.ts` patterns.
- **Integration**: a Route-Handler test per flow (password, magic link, OAuth callback,
  org-selection, sign-out) against a mocked WorkOS SDK; backend `internal/oidc` verify with a
  WorkOS-shaped JWT.
- **E2E (thin)**: sign-in → protected page → sign-out on a WorkOS **staging** environment.
- **Gates**: `tsc --noEmit` + `eslint` (0 warnings) on all three apps, `vitest run`, `go build`/`vet`/
  `go test`, `next build`. Nothing merges red.

### Phase 9 — Rollout & config
- Configure WorkOS **Staging** first; wire env/secrets; run the app; verify all flows + the Admin Portal
  SSO/SCIM self-serve.
- Then **Production** WorkOS environment (no wildcard/query-param redirect URIs in prod).
- Self-host/air-gap builds set `NEXT_PUBLIC_AUTH_PROVIDER=oidc` and the generic-OIDC vars — **untouched**
  by this work, so that path keeps working against a customer IdP (Keycloak/Okta/Entra).

---

## 4. Security checklist (prod-grade — verify before ship)

- [ ] `WORKOS_API_KEY` + `WORKOS_CLIENT_ID` are **server-only**; never in the client bundle or a
      `NEXT_PUBLIC_` var (except the publishable client id + redirect URI needed by edge middleware).
- [ ] Sessions sealed in **HTTP-only + Secure + SameSite=Lax** cookies; `WORKOS_COOKIE_PASSWORD` ≥32
      chars, from the secrets manager, distinct per environment.
- [ ] Refresh tokens **single-use**; rotate on every refresh; transparent refresh before expiry.
- [ ] Backend verifies every request's JWT via **JWKS** (cached, auto-rotating); checks signature +
      `exp` + audience + issuer; **authorises in the service**, not only at the edge (§5.2).
- [ ] **CSRF** double-submit on logout + org-switch (and any state-changing auth POST).
- [ ] No wildcards / query params in **production** redirect URIs.
- [ ] Rate-limit the custom auth endpoints (per-IP + per-principal) — reuse the platform limiter.
- [ ] Never log tokens/PII; scrub the WorkOS SDK's error payloads.
- [ ] Impersonation (`act` claim) is surfaced in audit logs.
- [ ] Fail-fast at boot if the WorkOS env set is incomplete when provider=`workos` (env superRefine).

---

## 5. WorkOS Node SDK method reference (what each flow calls)

| Flow | WorkOS Node SDK |
| --- | --- |
| Email-first SSO detect | `userManagement.listConnections({ domain })` |
| Password | `userManagement.authenticateWithPassword({ email, password, clientId })` |
| Magic link | `createMagicAuth({ email })` → `authenticateWithMagicAuth({ code, email })` |
| Social / SSO redirect | `getAuthorizationUrl({ provider:'GoogleOAuth' | connectionId | organizationId, redirectUri, clientId })` |
| Callback exchange | `authenticateWithCode({ code, clientId })` |
| Multi-org | catch `organization_selection_required` → `authenticateWithOrganizationSelection(...)` |
| Refresh | `authenticateWithRefreshToken({ refreshToken, clientId })` (single-use) |
| Session seal/unseal | `sealSession()` / `loadSealedSession()` / `session.authenticate()` / `session.refresh()` |
| Sign-out | `session.getLogoutUrl()` |
| Sign-up | `createUser(...)` + `sendVerificationEmail`/`verifyEmail`, or `sendInvitation`/accept |
| MFA | enroll/challenge/verify auth factors (TOTP) |
| User settings | `updateUser`, `getUser`, factors CRUD |
| Org / team | `listOrganizationMemberships`, `sendInvitation`, `updateOrganizationMembership`, `deactivateOrganizationMembership` |
| Admin Portal (SSO/SCIM self-serve) | `portal.generateLink({ organization, intent })` |

WorkOS access tokens are standard WorkOS-signed JWTs (with an `act` claim for impersonation); JWKS URL is
derived from the client id and cached (~5-min cooldown); `jose` handles key rotation. Session cookie
encryption is AES-256-CBC + HMAC-SHA256 (iron-webcrypto).

---

## 6. File-change map (summary)

- **Delete**: `backend/orchestrator/internal/clerk/*`; `apps/*/src/lib/auth/{actions-clerk,hooks-clerk,
  clerk-claims}.ts`; `control-tower/src/components/auth/{RootAuthProvider,ClerkThemed}.tsx`,
  `components/ClerkTokenProvider.tsx`, `app/(auth)/sso-callback/page.tsx` (replaced by a WorkOS callback
  handler); `@clerk/*` from 3 `package.json`; all `CLERK_*` env.
- **Add**: `apps/*/src/lib/auth/{workos-server,workos-claims,hooks-workos,actions-workos}.ts`;
  `app/(auth)/*` custom screens + callback/sign-out Route Handlers; WorkOS env in `env.ts`;
  backend WorkOS-JWT test fixture; `org_settings` surface on the orchestrator for org metadata.
- **Edit**: `config.ts`, `server.ts`, `hooks.ts`, `actions.ts`, `proxy.ts`, the 5 settings pages, 4
  onboarding, 2 environments, 7 marketplace client, 9 server routes, `entitlements.server.ts`×3,
  `marketplace-server.ts`×2, `posthog.tsx`×2, `main.go` (drop Clerk verifier), `config.go` (drop
  `ClerkJWKSURL`), 4 docs pages.

---

## 7. Risks, non-goals, open decisions

**Risks / mitigations**
- *Org metadata move* (Clerk metadata → orchestrator `org_settings`): scope it as its own small,
  contract-first surface; it's the one place we change the source of truth, so test read/write + defaults.
- *Headless surface area* (we own MFA/org-selection/error states): mitigated by the existing
  `oidc-flow.ts` machinery + the official WorkOS custom-UI example as the reference implementation.
- *Edge middleware*: `proxy.ts` is a security boundary — port carefully and keep authorization in the
  orchestrator so an edge bug can't authorize.

**Non-goals**
- No Clerk→WorkOS user data migration (pre-prod; clean stand-up).
- No change to the **generic-OIDC self-host path** (kept as-is for air-gap).
- No hosted AuthKit box (brand); no dual-run of Clerk + WorkOS.

**Open decisions (pick before Phase 2)**
1. **`@workos-inc/authkit-nextjs` helper vs raw `@workos-inc/node`.** Recommendation: **raw Node SDK**
   for full control + to keep the seam provider-symmetric with the OIDC path (the helper assumes its own
   middleware/session model). Revisit only if it saves material effort without leaking its UI opinions.
2. **Reuse `cfg.Auth.OIDC` for WorkOS on the backend vs a dedicated `cfg.Auth.WorkOS`.** Recommendation:
   **reuse OIDC** (WorkOS is an OIDC IdP) — zero new verifier code; a dedicated block only if we need
   WorkOS-specific claim handling the generic mapper can't express.
3. **`workos` provider reusing the `oidc-*` flow vs a standalone WorkOS flow.** Recommendation: a
   **standalone `workos` flow** for the fully custom UX (email-first/magic-link/org-selection/MFA), while
   borrowing the sealed-cookie/PKCE utilities from `oidc-cookies.ts`.

---

## 8. Sequencing (dependency order)

`Phase 0 (env/deps) → Phase 1 (backend JWKS, delete Clerk verifier) → Phase 2 (workos seam) →
Phase 3 (custom auth UI) → Phase 4 (middleware/WS) → Phase 5 (settings) → Phase 6 (remaining importers +
org-metadata move) → Phase 7 (rip-out + docs) → Phase 8 (tests/gates) → Phase 9 (rollout)`.

Phases 1 and 2 are independent and can run in parallel; 3–6 depend on 2; 7 depends on 3–6; 8 runs
continuously; 9 last.
