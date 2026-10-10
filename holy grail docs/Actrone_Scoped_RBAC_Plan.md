# Scoped (Per-Feature) RBAC Plan

> **Status refreshed 2026-07-13 (code-verified):** Re-confirmed ACCURATE — no correction needed to
> the shipped-status claim. `RequireScopeRole` is present in `internal/middleware/auth.go`, used in
> `internal/middleware/entitlement.go`, and covered by `internal/middleware/rbac_test.go`. One
> housekeeping note: §5's model text below (`Clerk org membership publicMetadata.actrone_roles`,
> "Clerk metadata map") describes the **original, pre-WorkOS analysis** — the doc already flags
> itself as capturing that original analysis with authoritative status living elsewhere, so this is
> not a functional error, just worth knowing that "Clerk" in §5 now reads as WorkOS/OIDC-session-
> claim equivalent post the 2026-07-09 WorkOS Auth Switch (`Actrone_WorkOS_Auth_Switch_Plan.md`).
>
> **Version 1.0 — June 2026 · ✅ SHIPPED as Master-Plan P3 (`actrone_roles`, `RequireScopeRole`, `useScopedRoles`/`RoleGate`, Settings→Team per-member×scope grid; old `actrone_role` back-compat). This doc captures the original analysis; authoritative status: [Platform Evolution §0a](./Actrone_Platform_Evolution_Master_Plan.md#0a-implementation-status-verified-2026-06-24).**

> Evolve the single global role into **composable, per-feature roles** so one member
> can be (e.g.) a Marketplace **publisher**, an EMAOP **approver**, and a platform
> **member** — each surface independently governed.

---

## 1. Why change

Today a member has **one** `actrone_role` (agent_operator … super_admin) applied platform-wide (the `RequireRole` middleware already shipped). Real orgs need finer control: the person who publishes to the Marketplace shouldn't automatically administer EMAOP governance, and an Auditor for compliance might be a plain member elsewhere. The fix is **scoped roles**: a role *within a feature scope*.

This is an evolution, not a rewrite — the shipped role model becomes the `platform` scope, and we add more scopes.

---

## 2. The model: (scope × role) grants

A member holds a **set of grants**, each `{ scope, role }`:

```
member.roles = {
  platform:     "member",       // bundled platform features
  emaop:        "approver",     // governance approver for EMAOP
  marketplace:  "publisher",    // can publish & manage listings
  integrations: "admin",        // manage connections & credentials
}
```

### 2.1 Scopes (extensible)
| Scope | What it governs |
|---|---|
| `platform` | Core Control Tower: agents, tasks, memory, cost (bundled features) |
| `emaop` | Governance/DPE, rules, audit, escalations, manifests |
| `marketplace` | Publishing, listings, earnings, payouts |
| `integrations` | Connections, credentials, MAL field config |
| `billing` | Plan, invoices, API keys, environments |

A scope only matters if the org is **entitled** to it (see [Agent Modes & Onboarding](./Actrone_Agent_Modes_and_Onboarding_Plan.md) §5) — RBAC is layered *on top of* entitlements (entitlement = the org can; role = this member may).

### 2.2 Roles per scope
Reuse the 5-role ladder where it fits, plus scope-specific roles:
- **platform / emaop / integrations:** `operator | admin | auditor | super_admin` (the shipped set).
- **marketplace:** `viewer | publisher | manager` (publish, manage listings, see earnings).
- **billing:** `viewer | admin`.

`super_admin` in any scope ⇒ full control of that scope; an **org `super_admin`** (a top-level grant) ⇒ everything.

---

## 3. Storage & claims

- **Source of truth:** Clerk org membership `publicMetadata.actrone_roles` as a JSON map `{ scope: role }` (replaces the single `actrone_role` string; keep a back-compat read so existing members map their old role → `platform` scope).
- **Token:** the `actrone_roles` claim flows in the Clerk session token (claim template), same path as the current `actrone_role`.
- **Default:** a new member with no grants → `{ platform: "member" }`, org admins → `super_admin` (matching today's fallback).

---

## 4. Enforcement

### Backend (Go)
Extend the shipped middleware:
- `RequireScopeRole(scope string, roles ...string)` — reads `actrone_roles[scope]`, applies the same `super_admin`-anywhere + API-key bypass logic the current `RequireRole` has.
- `ScopeRoleFromContext(scope)` accessor; `ActroneRolesFromContext()` returns the whole map.
- Back-compat: if only the old `actrone_role` claim exists, treat it as the `platform` (and `emaop`) scope.

Apply per route, e.g.:
```
RequireScopeRole("emaop", "approver", "admin")   // POST /v1/governance/escalations/{id}/approve
RequireScopeRole("marketplace", "publisher")     // POST /v1/marketplace/listings
RequireScopeRole("integrations", "admin")        // POST /v1/connectors
```

### Frontend
- `useScopedRoles()` → `{ can(scope, role), role(scope), roles }`, replacing/extending `useCurrentUserRole()`.
- `<RoleGate scope="emaop" min="approver">` to hide/disable controls per scope (mirrors `FeatureGate`).
- Settings → Team: the role matrix becomes a **per-member, per-scope** grant editor (a grid: members × scopes, each cell a role dropdown) — only showing scopes the org is entitled to.

---

## 5. UX in Settings → Team

```
Member            platform   emaop        marketplace   integrations
─────────────────────────────────────────────────────────────────────
Ada (you)         super_admin —            —             —
Bob               member      approver     publisher     admin
Cy                operator    auditor      viewer        operator
```

- Each cell is a dropdown of that scope's roles.
- Scopes the org isn't entitled to are greyed with an "in your plan?" hint.
- Changing a grant calls a backend mutation (`PATCH /v1/team/{memberId}/roles`) writing the Clerk metadata map.
- A "role templates" shortcut (e.g. "Compliance Officer" = `{emaop: auditor, platform: operator}`) for fast assignment.

---

## 6. Migration

1. Add `RequireScopeRole` + the claim map (back-compat with `actrone_role`).
2. Frontend `useScopedRoles` + `RoleGate`; keep `useCurrentUserRole` as a thin shim (`platform` scope).
3. Settings → Team grant grid.
4. Re-key existing members: `actrone_role` → `{ platform: role, emaop: role }`.
5. Gradually replace `RequireRole`/`RequireOrgAdmin` call-sites with scoped guards where finer control matters.

---

## 7. Why this is the right call

- **Real-world team structures** — publishers, approvers, auditors, integration owners are different people; one global role can't express that.
- **Least privilege** — each surface granted independently.
- **Layers cleanly on entitlements** — entitlement (org can) → enablement (org shows) → scoped role (member may). Three orthogonal gates, each with one home.
- **Evolves the shipped RBAC** — no rewrite; `RequireRole` becomes a `platform`-scope special case.

---

*Last updated: 2026-06-10 · Planning only.*
