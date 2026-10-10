# Actrone WhatsApp Channel — Setup Runbook

The WhatsApp channel delivers **governance approvals** to approvers on WhatsApp (an Approve/Deny
interactive card, or a "Review & approve" step-up link) and receives their replies. It is built on
the **Meta WhatsApp Business Cloud API** (`graph.facebook.com/v23.0`) — the only WhatsApp API Meta
supports as of 2026 (the On-Premises API was retired in October 2025). This runbook covers the
one-time Meta setup, the Actrone config, and the utility template that guarantees delivery outside
the 24-hour window.

> **Status refreshed 2026-07-13 (code-verified):** re-checked against `internal/channels/whatsapp.go`
> — the API base (`graph.facebook.com/v23.0`), the default template name/language
> (`actrone_approval`/`en_US`), and the 24-hour-window fallback behavior (error `131047` → retry as
> the utility template) all match this runbook exactly. No corrections needed.

---

## 1. Meta setup (one-time)

1. **Meta Business Account** — business.facebook.com → Business Settings.
2. **Meta App** — developers.facebook.com → create an app → add the **WhatsApp** product.
3. **WhatsApp Business Account (WABA)** and a **registered business phone number** → this gives you
   a **`phone_number_id`**.
4. **Permanent access token** — Business Settings → create a **System User**, assign the WABA, and
   generate a token with `whatsapp_business_messaging` + `whatsapp_business_management`.
   *(The 24-hour token shown in the dashboard is for testing only.)*
5. **App Secret** — App → Settings → Basic. Used to sign inbound webhooks (`X-Hub-Signature-256`).
6. Likely **Business Verification** for production messaging tiers.

## 2. Configure the channel in Actrone

`Settings → Channels` (or `PUT /v1/channels/whatsapp`, agent_admin). Actrone seals the secrets in
its credential vault and returns a **route token**:

| Actrone field | Meta value |
| --- | --- |
| `token` | the permanent **access token** |
| `address` | the **`phone_number_id`** |
| `inbound_secret` | the **App Secret** |
| `template_name` *(optional)* | a custom out-of-window approval template name — blank ⇒ `actrone_approval` |
| `template_lang` *(optional)* | that template's language code — blank ⇒ `en_US` |

The two `template_*` fields are only used for out-of-window delivery (§4/§5); leave them blank to use
the built-in defaults. An empty value on a later update **keeps** the stored value rather than
clearing it.

Your inbound callback URL is then:

```
https://<your-actrone-host>/v1/channels/whatsapp/webhook/<routeToken>
```

## 3. Point the Meta webhook at Actrone

App → WhatsApp → Configuration → Webhook:

- **Callback URL:** the URL above.
- **Verify token:** set it to the **same route token** from the callback URL. Actrone's
  `GET /v1/channels/whatsapp/webhook/{routeToken}` handler answers Meta's verification handshake —
  it confirms the channel + echoes `hub.challenge` only when the verify token matches the route
  token (constant-time), so "Verify and Save" succeeds.
- **Subscribe to the `messages` field.**

Inbound messages then arrive at the POST endpoint and are HMAC-verified with the App Secret.

## 4. Register the utility template (for out-of-window delivery)

WhatsApp only allows free-form + interactive messages inside the **24-hour customer-service
window** (opened by the user's last message). To reach an approver **outside** that window, Actrone
falls back to a pre-approved **utility template** — you must register it once, per WABA:

- **Name:** `actrone_approval`  *(the adapter's default — or register your own name and set it as the
  channel's `template_name`)*
- **Category:** **Utility**
- **Language:** **English (US)** — `en_US` *(or another code, set as the channel's `template_lang`)*
- **Body:** `You have a pending approval: {{1}}. Tap Review & approve to continue.`
  - one body variable `{{1}}` — Actrone fills it with a one-line summary (agent + reason)
- **Button:** type **URL**, text **`Review & approve`**, URL = `https://<your-actrone-host>/{{1}}`
  - one dynamic URL suffix `{{1}}` — Actrone fills it with the review URL's path + query
  - set the base (`https://<your-actrone-host>/`) to **your Control Tower host** (the same host
    your approval `ReviewURL`/deep link uses), so the completed button URL resolves correctly

Submit it for review in the WhatsApp Manager → Message Templates. Utility templates are typically
approved quickly and cost ~\$0.004/message (US) — and are **free** when they land inside an active
24-hour window.

> If you skip this step, in-window approvals still work; only out-of-window approvals won't deliver
> (the adapter's fallback logs the missing template and returns — no worse than before).

## 5. How delivery works (behaviour)

For each approval the adapter:

1. Sends the **interactive** card (Approve/Deny buttons, or a `cta_url` step-up link).
2. If the Cloud API rejects it with **error `131047`** (re-engagement — the 24-hour window is
   closed), it automatically retries as the utility template — the channel's `template_name` /
   `template_lang`, or `actrone_approval` / `en_US` when those are blank: body = summary, button
   suffix = the review URL's path+query. The approver taps **Review & approve** and completes the
   action in the SSO-authenticated Control Tower.
3. Any other error surfaces unchanged (no fallback).

This is entirely server-side (`internal/channels/whatsapp.go`) — no per-approval configuration; the
only knobs are the optional per-channel `template_*` fields from §2.

## 6. Version / maintenance notes

- Pinned to Graph API **v23.0**. Meta supports each version ≥ 2 years; bump when it nears
  end-of-life (the `/messages` API is version-stable, so bumping is low-risk — one constant in
  `whatsapp.go`).
- Template name + language default to `actrone_approval` / `en_US` but are **per-channel
  configurable** (the optional `template_name` / `template_lang` fields — `Settings → Channels` or
  the `PUT /v1/channels/whatsapp` body; stored on `channel_configs.template_name` /
  `.template_lang`, migration `00111`). Blank ⇒ the defaults; an empty value on update keeps the
  stored one. Register the template under your WABA in the chosen language before selecting it here.
