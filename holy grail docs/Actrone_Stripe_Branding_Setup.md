# Actrone — Stripe Hosted Branding Setup

> **Scope:** how to make the **Stripe-hosted** Checkout and Customer Portal pages look
> as on-brand as Stripe allows, so the redirect from `/settings/billing` into Stripe
> (and back) feels continuous rather than jarring.
>
> **Why hosted:** Actrone uses Stripe **Checkout** (card entry + purchase) and the
> **Customer Portal** (manage/cancel/invoices) as hosted pages. Card data never touches
> the Actrone app (PCI **SAQ-A**), and SCA/3DS, tax, proration, dunning and invoices come
> for free. The cost is that the transaction surfaces are Stripe-branded by default —
> this doc closes that gap with Dashboard configuration only (no code changes).
>
> This is **operator/Dashboard configuration**, not a code task. It is a sub-step of the
> P7 enforcement-flip runbook (see `internal/billing` + the P7 memory). Owner: Matt.
>
> **Status refreshed 2026-07-13 (code-verified):** still accurate and still pending turn-up. This is
> a Stripe-Dashboard task with no code dependency; the in-app side it references is confirmed present
> (`internal/billing/checkout.go` builds Checkout/Portal sessions off `ORCHESTRATOR_BILLING_APP_BASE_URL`,
> defaulting to `NoopCheckout` until live keys are set). The §5 acceptance gate
> (`ORCHESTRATOR_BILLING_ENABLED`/`_ENFORCED`) maps to `billing.enabled`/`billing.enforced`, both
> **`false` by default** — so nothing here is live until an operator both configures the Stripe
> catalog/branding AND flips those flags. Purely turn-up-pending; no stale claims.

---

## 0. What is and isn't customisable

> **Brand note (2026-07):** this doc now targets the LOCKED **Black & Apple-Silver** identity
> (`docs/branding.md`) — the previous iOS-red + Space Grotesk identity is retired. Red is for
> errors only; the primary button is **white on black**; the display font is **Geist**.

Stripe hosted pages expose a **fixed set** of branding controls — a logo, an icon, two
colours, and a button shape. You **cannot** push Actrone's full design system (Geist,
custom layout) onto them. The goal here is *recognisably Actrone*, not
pixel-parity. For pixel-parity you would have to embed Stripe **Elements / Payment
Element** in-app and build custom subscription-management screens — a deliberate, larger
UX investment, explicitly **out of scope** for the hosted flow.

| Control | Checkout | Customer Portal | Notes |
| --- | --- | --- | --- |
| Logo | ✅ | ✅ | Shown top-left. Use the **wordmark**. |
| Icon | ✅ | ✅ | Square app icon (favicon/tab). |
| Brand colour | ✅ | ✅ | Primary fill — map to Actrone **primary (Apple-silver white)**. |
| Accent / highlight colour | ✅ | ✅ | Links/secondary — map to the sanctioned link colour (info blue). |
| Button shape (corner radius) | ✅ | ✅ | Actrone uses ~8 px ("rounded"). |
| Custom domain | ✅ (paid add-on) | ✅ (paid add-on) | `billing.actrone.com` — optional, see §4. |
| Fonts / gradients / layout | ❌ | ❌ | Not configurable — accept Stripe defaults. |

---

## 1. Brand values to enter (from the Actrone token layer)

These are pulled from `frontend/src/app/globals.css` so Stripe matches the Control Tower's
**primary CTA** — a solid **white** button on black (no gradient in the locked identity).
Stripe takes a solid brand colour; the Apple-silver white is exactly that.

| Stripe field | Value | Source token |
| --- | --- | --- |
| **Brand colour** | `#F5F5F7` | `--color-text-primary` / primary button fill (Apple-silver white) |
| **Accent colour** | `#3B82F6` | `--color-info` (the sanctioned link colour) |
| **Button corner radius** | `Rounded` (~6 px) | matches `rounded-md` on Actrone buttons |
| **Logo** | `actrone-wordmark.svg` | `frontend/public/brand/` |
| **Icon** | `actrone-appicon.svg` | `frontend/public/brand/` |

> **Contrast note:** the brand colour `#F5F5F7` is near-white, so Stripe computes **black**
> button text — matching the Actrone primary (white button, black text), which clears WCAG AA.
> Verify the button renders white-with-black-text in the live preview. **Never** set a red
> brand colour — red is reserved for errors in the locked identity.

### Logo / icon files

All under `frontend/public/brand/`:

- **Logo (Checkout/Portal header):** `actrone-wordmark.svg`
  - If the hosted background reads light, the dark wordmark renders best:
    `actrone-wordmark-black.svg`. Stripe hosted pages are **light** by default, so
    prefer the **black** wordmark for legibility.
- **Icon:** `actrone-appicon.svg` (or `favicon-512.png` if an SVG is rejected).
- Raster fallbacks if Stripe rejects SVG: `actrone-wordmark-1708.png`,
  `actrone-brandmark-512.png`.

Upload formats: Stripe accepts PNG/JPG always; SVG support varies by asset slot — keep
the PNG fallbacks ready.

---

## 2. Configure Checkout & Portal branding (Dashboard)

Do this **once per Stripe account**, and repeat in **both** Test and Live mode (branding
is mode-scoped — Test-mode branding does **not** carry to Live).

1. **Branding (global):** Dashboard → **Settings → Business → Branding**
   (`https://dashboard.stripe.com/settings/branding`).
   - Upload **Logo** = black wordmark, **Icon** = app icon.
   - Set **Brand colour** = `#F5F5F7`, **Accent colour** = `#3B82F6`.
   - Set **Button shape** = Rounded.
   - This block drives **Checkout** and emailed **invoices/receipts**.
2. **Customer Portal:** Dashboard → **Settings → Billing → Customer portal**
   (`https://dashboard.stripe.com/settings/billing/portal`).
   - Confirm the same logo/colours (it inherits global branding; override only if needed).
   - **Functionality** to enable so the Portal is actually useful:
     - ✅ Allow customers to **update payment methods**
     - ✅ Allow customers to **view invoice history**
     - ✅ Allow **cancel subscription** (choose *at period end*, not immediately, to match
       our webhook's end-of-period downgrade-to-free semantics)
     - ✅ Allow **switch plans** — and add the Pro/Scale prices to the allowed set so a
       Portal-initiated upgrade/downgrade fires `customer.subscription.updated`, which our
       webhook already maps to the new tier.
   - **Business information / links:** set Terms `https://actrone.com/legal/terms`,
     Privacy `https://actrone.com/legal/privacy`.
3. **Preview** both flows in Test mode (a Checkout link + a Portal session) and eyeball the
   logo legibility and button colour before going Live.

---

## 3. Keep the redirect continuous (already handled in code)

The in-app side is built to make the hand-off feel intentional — no operator action
needed, listed here so the flow is auditable:

- **Outbound:** `/settings/billing` shows the Actrone-branded plan card; the *Upgrade* /
  *Manage subscription* buttons are our white primary CTAs, so the last thing the user sees
  before redirect matches the first colour they see on Stripe.
- **Return:** Stripe redirects back to
  `https://<app>/settings/billing?checkout=success|cancelled`
  (set via `ORCHESTRATOR_BILLING_APP_BASE_URL`). The page reads that query and shows a
  branded toast, then the webhook-applied tier appears on refresh. The Portal returns to
  `/settings/billing` plain.

> If `APP_BASE_URL` is wrong, users land on a 404 after paying. Verify it points at the
> public Control Tower origin (e.g. `https://app.actrone.com`) in the env that owns the
> Stripe keys.

---

## 4. Optional: custom domain (`billing.actrone.com`)

For the **strongest** continuity, Stripe **Custom Domains** (Dashboard → Settings →
Business → Custom domains; a paid add-on) serves Checkout/Portal from
`billing.actrone.com` instead of `*.stripe.com`. This removes the visible domain switch
in the address bar. It needs a CNAME (Stripe provides the target) and is the only way to
hide the Stripe domain. Recommended **once revenue justifies the add-on**, not at launch.

---

## 5. Acceptance check

Before flipping `ORCHESTRATOR_BILLING_ENABLED`/`_ENFORCED`:

- [ ] Branding set in **both Test and Live** mode (logo, `#F5F5F7`/`#3B82F6`, rounded).
- [ ] Checkout preview shows the Actrone wordmark and a white purchase button with legible
      (white) text.
- [ ] Portal allows payment-method update, invoice history, plan switch (Pro/Scale prices
      added), and cancel-at-period-end.
- [ ] Legal/terms/privacy links resolve.
- [ ] `ORCHESTRATOR_BILLING_APP_BASE_URL` returns the user to a real `/settings/billing`.
- [ ] (Optional) custom domain `billing.actrone.com` verified.

---

_Last updated: 2026-06-24 | Owner: Matt | Related: `internal/billing`, P7 monetization
enforcement-flip runbook, `frontend/src/app/(app)/settings/billing`._
