# Guide 07 — Frontend Control Tower

> **Status refreshed 2026-07-13 (code-verified) — MAJOR STALE CONTENT, most heavily-affected guide:**
> this guide has 39 Clerk mentions and describes a project layout and design-token set that both
> predate two shipped changes: **(1) the WorkOS auth switch** (Clerk fully removed — zero `clerk`
> references anywhere in `frontend/`, confirmed by grep) and **(2) the Black & Apple-Silver rebrand**
> (`docs/Actrone_Frontend_Rebrand_Plan.md`, `docs/branding.md` — the indigo/purple `--color-accent
> #6366f1` + Cal Sans/DM Sans tokens below were replaced by the monochrome silver-on-black system +
> Geist). **The project structure is also stale**: this is a monorepo — `frontend/apps/{control-tower,
> marketing,marketplace}/src/` (each its own Next.js app) + `frontend/packages/ui/` (shared design
> system, `@actrone/ui`) — not a single `frontend/src/`. Auth is now **headless**: `RootAuthProvider`
> (`components/auth/RootAuthProvider.tsx`) is a documented pass-through around `<html>` — "Both
> providers (WorkOS managed + generic OIDC self-host) are HEADLESS — no vendor client wraps `<html>`"
> — with `AppAuthProvider` mounting the session context inside `<body>` instead; there is no
> `<ClerkProvider>`. Corrections are applied inline below where the pattern is simple; where an entire
> code sample would need reconstruction (the Clerk Elements sign-in flow, `useOrganization`/`useAuth`
> call shapes), a note points at the real files instead of fabricating unverified replacement code —
> see `frontend/apps/control-tower/src/components/auth/*`, `lib/auth/hooks-oidc.ts` (`useOrganization`,
> `useUser`), and `lib/auth/actions-oidc.ts` / `actions-workos.ts` (`useAuthActions`).

## Project Structure

```
frontend/apps/control-tower/src/     ← the Control Tower app specifically; marketing/ and
                                        marketplace/ are sibling apps under frontend/apps/
  app/
    (auth)/              ← Sign-in, sign-up (headless WorkOS AuthKit / generic-OIDC custom UI)
    (app)/               ← Authenticated shell (sidebar, nav) — 60 page.tsx routes as of 2026-07-13
      dashboard/
      agents/
      tasks/
      settings/
        profile/         ← Passkeys, connected accounts, sessions
        team/            ← Members, roles, invitations
        organization/    ← Name/slug, SSO, danger zone
    layout.tsx           ← Root: RootAuthProvider (pass-through) → PostHogProviderWrapper
  components/
    ui/                  ← App-local composites; shared primitives live in frontend/packages/ui
    features/            ← Domain-specific composites (AgentCard, TaskStream...)
    auth/                ← AuthCard, AuthInput, SocialButton, PasskeyButton, WorkosSignIn, OidcSignIn,
                            RootAuthProvider, AppAuthProvider
    marketing/           ← CookieBanner, LandingNav
  lib/
    api/                 ← Typed API client (fetch-based, Zod-validated)
    analytics/           ← posthog.tsx (provider + session sync)
    auth/                ← hooks-oidc.ts (useOrganization/useUser), actions-oidc.ts /
                            actions-workos.ts (useAuthActions), session-context.tsx
  hooks/                 ← useTask, useAgent, useWebSocket, useFeatureFlag
  stores/                ← Zustand: uiStore, taskStore
  types/                 ← Shared TypeScript interfaces

frontend/packages/ui/src/            ← @actrone/ui: shared Button/Card/Badge/IntegrationIcon/
                                        BrandMark/Charts design-system primitives, consumed by all 3 apps
```

---

## App Router Layout Tree

```
app/layout.tsx                 ← RootAuthProvider (headless pass-through) → PostHogProviderWrapper
  app/(auth)/layout.tsx        ← Centered card, no sidebar
    app/(auth)/sign-in/        ← WorkosSignIn / OidcSignIn — headless, no vendor-hosted UI
    app/(auth)/sign-up/        ← Same headless pattern
  app/(app)/layout.tsx         ← Sidebar + header shell; mounts AppAuthProvider (session context)
    app/(app)/dashboard/
    app/(app)/agents/
    app/(app)/tasks/
    app/(app)/settings/
```

**Root layout** (`app/layout.tsx`) — corrected 2026-07-13: both WorkOS managed and self-hosted
generic-OIDC auth are **headless** (no vendor client wraps `<html>`/`<body>`), per the doc comment
on `components/auth/RootAuthProvider.tsx`. The exact current `layout.tsx` composition was not
re-transcribed verbatim this pass; the shape is:

```tsx
// RootAuthProvider is a documented pass-through — headless auth needs no provider around <html>.
// PostHogProviderWrapper uses 'use client' and must NOT wrap <html>/<body>.
// AppAuthProvider (session context) mounts inside <body>, scoped to the (app) route group.
export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                <RootAuthProvider>
                    <PostHogProviderWrapper>
                        {children}
                    </PostHogProviderWrapper>
                </RootAuthProvider>
            </body>
        </html>
    )
}
```

---

## API Client

All orchestrator API calls go through the typed client in `src/lib/api/`. Never call `fetch` directly from components.

```
src/lib/api/
  client.ts     ← Base fetch wrapper: auth header injection, error normalisation
  agents.ts     ← createAgent, getAgent, listAgents, deleteAgent
  tasks.ts      ← submitTask, getTask, cancelTask
  auth.ts       ← createApiKey, listApiKeys, revokeApiKey
  types.ts      ← Zod schemas for all request/response shapes
```

**Base client pattern:**

```typescript
// src/lib/api/client.ts

async function apiFetch<T>(
    path: string,
    options: RequestInit & { schema: z.ZodType<T> }
): Promise<T> {
    const token = await getAuthToken()  // WorkOS/OIDC session token

    const res = await fetch(`${process.env.NEXT_PUBLIC_ORCHESTRATOR_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...options.headers,
        },
    })

    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Unknown error' }))
        throw new ApiError(res.status, err.code, err.message)
    }

    const data = await res.json()
    return options.schema.parse(data)  // Zod validates shape at runtime
}
```

**Using the client in a Server Component:**

```tsx
// app/(app)/agents/page.tsx (Server Component — no 'use client')
import { listAgents } from '@/lib/api/agents'

export default async function AgentsPage() {
    const { agents } = await listAgents()
    return <AgentList agents={agents} />
}
```

**Using the client in a Client Component** — wrap in `useEffect` or React Query:

```tsx
'use client'
import { useQuery } from '@tanstack/react-query'
import { getTask } from '@/lib/api/tasks'

function TaskDetail({ taskId }: { taskId: string }) {
    const { data, isLoading, error } = useQuery({
        queryKey: ['task', taskId],
        queryFn: () => getTask(taskId),
        refetchInterval: 2000,  // poll while pending
    })
    // ...
}
```

---

## WebSocket Task Streaming

The task stream (`/v1/tasks/{id}/stream`) delivers real-time token events from the Temporal workflow to the browser.

```typescript
// src/hooks/useTaskStream.ts

export function useTaskStream(taskId: string) {
    const [tokens, setTokens] = useState<string[]>([])
    const [status, setStatus] = useState<'connecting' | 'streaming' | 'complete' | 'error'>('connecting')

    useEffect(() => {
        let cancelled = false
        let ws: WebSocket | null = null

        // Browsers cannot set Authorization headers on the WebSocket handshake.
        // Pass the WorkOS/OIDC session token via the Sec-WebSocket-Protocol subprotocol —
        // the standard browser-compatible workaround. The orchestrator's auth
        // middleware reads the token from the protocol header before upgrade.
        ;(async () => {
            const token = await getAuthToken()
            if (cancelled) return
            const socket = new WebSocket(
                `${process.env.NEXT_PUBLIC_ORCHESTRATOR_WS_URL}/v1/tasks/${taskId}/stream`,
                ['bearer', token],
            )
            ws = socket

            socket.onopen = () => setStatus('streaming')

            socket.onmessage = (e) => {
                const event = JSON.parse(e.data) as StreamEvent
                switch (event.type) {
                    case 'token':
                        setTokens(prev => [...prev, event.content])
                        break
                    case 'complete':
                        setStatus('complete')
                        socket.close()
                        break
                    case 'error':
                        setStatus('error')
                        socket.close()
                        break
                }
            }

            socket.onerror = () => setStatus('error')
        })()

        return () => {
            cancelled = true
            ws?.close()
        }
    }, [taskId])

    return { tokens, status, fullText: tokens.join('') }
}
```

---

## Component System

### Design Tokens

All colour, spacing, typography, and motion values come from CSS variables defined in `globals.css`. Never hardcode values.

```css
/* apps/control-tower/src/app/globals.css — corrected 2026-07-13: the indigo/purple palette and
   Cal Sans/DM Sans fonts below are the PRE-REBRAND tokens. The shipped identity is monochrome
   Black & Apple-Silver / Geist-only (docs/branding.md, docs/Actrone_Frontend_Rebrand_Plan.md),
   verified live in globals.css. Real current values: */
@theme {
    --color-bg:              #030303;   /* app canvas */
    --color-surface:         #111111;   /* cards / panels */
    --color-surface-raised:  #121214;   /* modals, dropdowns, popovers */
    --color-border:          #262629;
    --color-text-primary:    #F5F5F7;
    --color-text-secondary:  #E5E5E7;
    --color-text-muted:      #A1A1AA;
    --color-accent:          #F5F5F7;   /* silver — status only, never decoration */
    --color-accent-hover:    #FFFFFF;
    --color-destructive:     #EF4444;   /* errors/destructive/critical ONLY */
    --color-success:         #22C55E;
    --color-warning:         #F59E0B;
    --color-info:            #3B82F6;

    --font-sans:    var(--font-geist-sans), system-ui, sans-serif;
    --font-mono:    var(--font-geist-mono), 'JetBrains Mono', monospace;
    --font-display: var(--font-geist-sans), system-ui, sans-serif;  /* Space Grotesk removed */

    --space-1: 0.25rem;  /* 4px */
    --space-2: 0.5rem;
    --space-4: 1rem;
    --space-8: 2rem;
    --space-16: 4rem;

    --duration-fast:   100ms;
    --duration-base:   200ms;
    --duration-slow:   400ms;
    --ease-out:        cubic-bezier(0.16, 1, 0.3, 1);
    --ease-spring:     cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### Primitive UI Components

```
src/components/ui/
  Button.tsx      ← variant: primary | secondary | ghost | destructive
  Input.tsx       ← with label, error state, helper text
  Card.tsx        ← surface with border-radius and border
  Badge.tsx       ← status indicators: running | complete | failed | pending
  Skeleton.tsx    ← loading placeholder matching content shape
  Modal.tsx       ← focus-trapped, esc-dismissable, portal-rendered
  Toast.tsx       ← success | error | info variants; auto-dismiss 4s
  Table.tsx       ← sortable columns, empty state slot, loading state
```

**Button component contract:**

```tsx
// src/components/ui/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
    size?: 'sm' | 'md' | 'lg'
    isLoading?: boolean
}

export function Button({ variant = 'primary', size = 'md', isLoading, children, ...props }: ButtonProps) {
    return (
        <button
            {...props}
            disabled={isLoading || props.disabled}
            aria-busy={isLoading}
            className={cn(buttonVariants({ variant, size }), props.className)}
        >
            {isLoading ? <Spinner size="sm" aria-hidden /> : null}
            {children}
        </button>
    )
}
```

---

## WorkOS / Generic-OIDC Auth Integration

> Rewritten 2026-07-13 (was "Clerk Integration" — Clerk Elements were removed in the WorkOS auth
> switch, `docs/Actrone_WorkOS_Auth_Switch_Plan.md`). Auth is **headless and dual-provider**: managed
> deployments use WorkOS AuthKit (our own UI on WorkOS's User Management APIs), self-hosted
> deployments use a generic OIDC issuer — both go through the same app-level components rather than a
> vendor-hosted `<SignIn>` widget. Code below reflects the real files
> (`frontend/apps/control-tower/src/components/auth/`, `lib/auth/`); exact JSX composition inside
> `WorkosSignIn.tsx` / `OidcSignIn.tsx` was not transcribed verbatim this pass — read those files
> directly for the current markup.

### Sign-In Flow (Custom UI, Provider-Selected at Runtime)

`NEXT_PUBLIC_AUTH_PROVIDER` (`workos` or `oidc`) selects the flow. Both render through the shared
`AuthCard` / `AuthInput` / `SocialButton` / `PasskeyButton` primitives — only the auth backend
differs:

```tsx
// app/(auth)/sign-in/page.tsx (shape, not verbatim)
import { WorkosSignIn } from '@/components/auth/WorkosSignIn'
import { OidcSignIn } from '@/components/auth/OidcSignIn'
import { resolveAuthProvider } from '@/lib/auth/config'

export default function SignInPage() {
    return resolveAuthProvider() === 'workos' ? <WorkosSignIn /> : <OidcSignIn />
}
```

### Getting the Auth Token (Client Components)

The API client (`lib/api/client.ts`) takes a token getter registered once at mount — it does not call
a `useAuth()`-style hook per request. On the self-hosted OIDC path, `OidcTokenProvider` fetches the
token from a same-origin route because the access token lives in an httpOnly cookie:

```tsx
// lib/auth/oidc-token-provider.tsx (real file, lightly trimmed)
'use client'
import { useEffect } from 'react'
import { setTokenGetter } from '@/lib/api/client'

async function fetchOidcToken(): Promise<string | null> {
    const res = await fetch('/api/auth/token', { headers: { accept: 'application/json' }, cache: 'no-store' })
    if (!res.ok) return null
    return ((await res.json()) as { token?: string }).token ?? null
}

export function OidcTokenProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => { setTokenGetter(fetchOidcToken) }, [])
    return <>{children}</>
}
```

The managed WorkOS path has an equivalent provider backed by the iron-sealed AuthKit session instead
of the `/api/auth/token` route — see `lib/auth/workos-*.ts`.

### Getting the Auth Token (Server Components / Route Handlers)

Use the provider-agnostic server helper — it dispatches to WorkOS or OIDC internally so callers never
branch on provider:

```tsx
import { getServerAuthToken } from '@/lib/auth/server-token'

export async function GET() {
    const token = await getServerAuthToken()
    if (!token) return new Response('Unauthorized', { status: 401 })
    // ...
}
```

### RBAC Guards in UI

Show/hide UI elements based on org role — mirrors the server-side `RequireOrgAdmin` guard. The hook
name is unchanged (`useOrganization()`) but it now reads from the WorkOS/OIDC session context
(`lib/auth/hooks-oidc.ts`), not `@clerk/nextjs`:

```tsx
import { useOrganization } from '@/lib/auth/hooks-oidc'

function AdminOnlyButton() {
    const { membership } = useOrganization()
    const isAdmin = membership?.role === 'org:admin'

    if (!isAdmin) return null
    return <Button variant="destructive">Delete Agent</Button>
}
```

---

## Settings Pages

### Team Management (`/settings/team`)

```
┌─────────────────────────────────────────────────────┐
│  Team Members                    [Invite Member]    │
├─────────────────────────────────────────────────────┤
│  Alice Chen     alice@co.com     Admin     [Change] │
│  Bob Smith      bob@co.com       Member    [Change] │
│  Carol Davis    carol@co.com     Member    [Remove] │
├─────────────────────────────────────────────────────┤
│  Pending Invitations                                │
│  dave@co.com    Invited 2h ago              [×]    │
└─────────────────────────────────────────────────────┘
```

**Corrected 2026-07-13:** no longer a Clerk `useOrganization({memberships,invitations})` client
mutation surface. Per `components/settings/WorkosTeamSettings.tsx`: the roster is read from **the
orchestrator** (synced `org_memberships`, provider-agnostic) via `teamApi`, and invitations /
role-and-group mapping are **delegated entirely to the WorkOS Admin Portal's SCIM Directory Sync**
(`components/auth/WorkosAdminPortal.tsx`) — there is intentionally no bespoke invite/role CRUD UI to
build or maintain; a customer's IT team provisions from their own directory instead:

```tsx
import { teamApi } from '@/lib/api/client'
import { useOrganization } from '@/lib/auth/hooks'
import { WorkosAdminPortal } from '@/components/auth/WorkosAdminPortal'

// Roster: read-only, from the orchestrator's synced membership mirror.
const members = await teamApi.list()

// Invitations/role changes: not an in-app mutation — render <WorkosAdminPortal /> and let the
// org admin manage Directory Sync (SCIM) in the WorkOS-hosted portal.
```

### Organization Settings (`/settings/organization`)

Shows org name, slug, plan tier (`components/settings/WorkosOrganizationSettings.tsx`). SSO, domain
verification, and audit-log streaming are WorkOS Admin Portal redirects (`WorkosAdminPortal`), not
`organization.destroy()`-style Clerk SDK calls — the exact current org-deletion path was not
re-verified this pass (unverified 2026-07-13).

### Profile Settings (`/settings/profile`)

```
┌─────────────────────────────────────────────────────┐
│  Profile                                            │
│  Name: [Alice Chen              ]                   │
│                                                     │
│  Passkeys                        [Add Passkey]      │
│  MacBook Pro Touch ID     Added 3d ago    [Remove]  │
│                                                     │
│  Active Sessions                                    │
│  Chrome/macOS   This device   Last active: now      │
│  Safari/iOS     iPhone 15     Last active: 1h ago   │
│                                                     │
│  Danger Zone                   [Delete Account]     │
└─────────────────────────────────────────────────────┘
```

**Corrected 2026-07-13:** passkeys are no longer an in-page `user.createPasskey()` WebAuthn ceremony.
Per `components/settings/PasskeySettings.tsx`: "WorkOS runs the WebAuthn ceremony inside AuthKit (its
SDK exposes no headless passkey API), so setting up / using a passkey is initiated by a secure
hand-off to AuthKit rather than an in-page ceremony" — it is the one AuthKit-hosted step in an
otherwise fully custom auth UI (password, magic link, social, TOTP MFA all stay in-house). Session
listing/revocation API shape was not re-verified this pass (unverified 2026-07-13).

---

## Feature Flags

Feature flags from PostHog gate advanced UI panels. Use the `useFeatureFlag` hook to avoid server round-trips.

```tsx
// src/hooks/useFeatureFlag.ts
'use client'
import { usePostHog } from 'posthog-js/react'

export function useFeatureFlag(flagKey: string): boolean {
    const posthog = usePostHog()
    return posthog.isFeatureEnabled(flagKey) ?? false
}

// Usage in a component:
function RiskPanel({ taskId }: { taskId: string }) {
    const hasRiskScoring = useFeatureFlag('advanced_risk_scoring')
    if (!hasRiskScoring) return null
    return <RiskScoreChart taskId={taskId} />
}
```

---

## Loading, Error, and Empty States

Every async operation must have all three states. Use Next.js `loading.tsx` and `error.tsx` files for route-level states.

```tsx
// app/(app)/agents/loading.tsx
export default function AgentsLoading() {
    return (
        <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-lg" />
            ))}
        </div>
    )
}

// app/(app)/agents/error.tsx
'use client'
export default function AgentsError({ error, reset }: { error: Error; reset: () => void }) {
    return (
        <div className="flex flex-col items-center gap-4 py-16">
            <p className="text-destructive">Failed to load agents</p>
            <Button variant="secondary" onClick={reset}>Try again</Button>
        </div>
    )
}
```

**Empty state pattern** for lists:

```tsx
function AgentList({ agents }: { agents: Agent[] }) {
    if (agents.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 py-16 text-muted">
                <BotIcon className="h-10 w-10 opacity-30" />
                <p className="text-sm">No agents yet</p>
                <Button size="sm" href="/agents/new">Create your first agent</Button>
            </div>
        )
    }
    return <div className="grid grid-cols-3 gap-4">{agents.map(a => <AgentCard key={a.id} agent={a} />)}</div>
}
```

---

## Analytics — Tracking Custom Events

For non-LLM product events (button clicks, page flows, feature adoption):

```tsx
'use client'
import { usePostHog } from 'posthog-js/react'

function AgentCreateButton() {
    const posthog = usePostHog()

    function handleClick() {
        posthog.capture('agent_create_clicked', {
            source: 'dashboard',
            // Never include PII or credentials here
        })
        router.push('/agents/new')
    }

    return <Button onClick={handleClick}>Create Agent</Button>
}
```

**What NOT to track** — never include in PostHog events:
- API keys, tokens, JWTs
- Email addresses (beyond what's already in user identity)
- Agent prompt content or task outputs
- Any value that might contain user PII

Apply `ph-no-capture` class to any input that might contain sensitive data:

```tsx
<input className="ph-no-capture" placeholder="System prompt..." />
```

---

## TypeScript Conventions

- `strict: true` in `tsconfig.json` — always enabled.
- No `any` without a `// UNSAFE: <reason>` comment.
- Use `satisfies` for object literals to keep narrowed types:

```typescript
const routes = {
    dashboard: '/dashboard',
    agents:    '/agents',
    tasks:     '/tasks',
} satisfies Record<string, string>
// typeof routes.dashboard = '/dashboard' (not string)
```

- API response types are derived from Zod schemas, not manually written:

```typescript
const AgentSchema = z.object({
    id:         z.string().uuid(),
    name:       z.string(),
    created_at: z.string().datetime(),
})

type Agent = z.infer<typeof AgentSchema>
```

---

## Running the Frontend

```bash
cd frontend

# Development server (http://localhost:3000)
npm run dev

# Type check (no emit)
npm run type-check

# Lint
npm run lint

# Unit tests
npm test

# Build for production
npm run build

# Analyse bundle sizes
ANALYZE=true npm run build
```
