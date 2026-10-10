# Actrone — DPA / BAA Automation Plan

> **Status refreshed 2026-07-13 (code-verified):** The workstream is still accurately "COMPLETE"
> (re-verified: `internal/agreements/{documenso.go,esign.go,scc.go,subprocessors.go,service.go}`
> all present and substantial, not stubs). One inline claim is now stale and corrected: the
> subprocessor-registry seed list below says **"AWS/Clerk/OpenAI/Anthropic/..."** — the live
> migration `00067_subprocessors.sql` seeds **"WorkOS"**, not "Clerk" (the seed data was updated
> in place when the WorkOS Auth Switch shipped, ahead of this doc's prose). Read every "Clerk" in
> the seed-list sentence below as "WorkOS." Also note: `frontend/src/app/(marketing)/legal/dpa/
> page.tsx` (referenced in §0 "what exists today") predates the frontend's split into
> `frontend/apps/{control-tower,marketing,marketplace}`; the live path is
> `frontend/apps/marketing/src/app/(marketing)/legal/dpa/page.tsx`. Cosmetic only — no functional
> claim in this doc is affected.
>
> Turns the **static** `legal/dpa` page into a real, per-tenant agreement lifecycle:
> generate → deliver → execute → record → surface. Data Residency Plan §4 lists DPA (and the
> residency attestation) as Enterprise deliverables; this is the DPA half.
>
> **P1 + P2 + P3 ✅ SHIPPED (verified by code audit 2026-07-04 — supersedes the earlier "P2/P3 pending" note).**
> Beyond P1: P2 countersign e-sign (`internal/agreements/esign.go` + `documenso.go`) and P3 subprocessor
> registry (`subprocessors.go`) + SCC versioning (`scc.go`) are all built; migrations `00066`–`00070`;
> frontend `AgreementsPanel.tsx` + /compliance Agreements tab. Deployment-gated: live Documenso/e-sign creds.
>
> **P1 ✅ SHIPPED 2026-06-25** (go build/vet + agreements/residency/billing/handler tests green;
> frontend tsc + eslint clean). Record + click-through DPA is live: migration `00066_tenant_agreements`
> (append-only, idempotent on `(tenant,kind,version)`); `internal/agreements` (in-code DPA template v1,
> `Signatory.Validate`, content-hash seal, deterministic executed-PDF renderer, `Service` with
> idempotent `Accept`/`List`/`Document`/`ExecutedDPA` + optional region-resident object-store persist,
> else render-on-demand); `repository.AgreementRepository`; `handler/http/agreements.go`
> (`GET /v1/agreements`, `POST /v1/agreements/{kind}/accept` [agent_admin], `GET /v1/agreements/{id}/document`),
> all gated on new entitlement `billing.FeatureDPA` (Enterprise). The residency **attestation** now carries
> an `executed_dpa` citation + a `dpa_on_file` control (excluded from overall-status degradation — a DPA is
> contractual, not a residency-enforcement gap). Frontend: `agreementsApi`, `AgreementsPanel` (Agreements
> tab on `/compliance`: offered DPA, accept dialog with signatory capture, executed list, PDF download,
> Enterprise-gated/empty/error states), `entitlements.ts`/`feature-copy.ts` `dpa` entry.
>
> **P2 ✅ SHIPPED 2026-06-25** (go build/vet + agreements/residency/handler tests + frontend tsc/eslint green).
> **Countersignature + BAA:** in-code **BAA template v1** registered under `KindBAA`; `Service.Countersign`
> (signed→countersigned terminal state, idempotent) + repo `Countersign` (`WHERE status='signed'` guard) + `POST
> /v1/agreements/{id}/countersign` gated to **super_admin** (Actrone's own act, not the customer's);
> `Service.ExecutedBAA` + pure `agreements.PHIPermitted(hipaaApplicable, baaExecuted)` decline-to-serve guard. The
> BAA is **offered only to HIPAA-applicable tenants** (handler reads `DataResidencyRepository.HIPAAApplicable`); the
> list response carries `baa_required`. Attestation gained a `baa_on_file` control + `executed_baa` citation (both
> agreement controls excluded from overall-status degradation — contractual, not residency-enforcement). Frontend:
> BAA appears in the offered list + a `baa_required` warning banner. NOTE: external e-sign provider
> (DocuSign/Dropbox Sign) intentionally NOT built — click-through + Actrone countersignature already yields a
> two-party executed agreement; an e-sign port plugs into the same `signed→countersigned` lifecycle when needed.
>
> **P3 ✅ SHIPPED 2026-06-25** (same green sweep). **Subprocessor registry:** migration `00067_subprocessors`
> (platform-global `subprocessors` + append-only `subprocessor_events`, **seeded** with the current vendor list:
> AWS/Clerk/OpenAI/Anthropic/Stripe/Resend/PostHog); `repository.SubprocessorRepository` (ListActive/ListEvents +
> atomic Add/Remove appending a change event in a tx); `handler/http/subprocessors.go` — `GET /v1/subprocessors` +
> `/events` readable by any member, `POST`/`DELETE` gated to **super_admin** (Actrone maintains its own list).
> Frontend: a self-loading **Subprocessors** card in the Agreements tab (list + recent-changes log), always visible
> (the transparency list is not entitlement-gated).
>
> **P3 advance-notice ✅ SHIPPED 2026-06-25** (go build/test + frontend tsc/eslint green). Per-tenant change
> **subscription + advance-notice email**: migration `00068_subprocessor_subscriptions` (one opt-in email per
> tenant); repo `SubscriptionUpsert/Delete/Get` + `SubscriberEmails`; endpoints `GET /v1/subprocessors/subscription`
> (any member), `PUT`/`DELETE` (agent_admin); on every `Add`/`Remove` the handler fans an Art. 28(2) advance-notice
> email out to subscribers via the existing Resend `email.Service` — **bounded worker pool (8), background goroutine
> with its own deadline, per-recipient failures logged not fatal**, HTML-escaped body. Frontend: a subscribe
> toggle + email field in the Subprocessors card. Tests: fan-out reaches all subscribers (channel-synced, no
> sleeps), nil-sender no-op, `looksLikeEmail` table, body HTML-escape.
>
> **E-signature ✅ SHIPPED 2026-06-25** via **self-hosted Documenso** (open-source, AGPL-3.0, eIDAS/PKCS#12/PAdES —
> chosen over DocuSeal for legal rigour + Postgres-native). Self-hosting dissolved the earlier blocker: the outbound
> call is now *our own service*, so the whole flow is testable against a mock. Built against Documenso's verified v1
> contract: `EsignProvider` port (`agreements/esign.go`) + `DocumensoProvider` adapter (`documenso.go` — create
> `POST /api/v1/documents` with `externalId`=our agreement id → PUT PDF to the presigned `uploadUrl` → send
> `POST /api/v1/documents/{id}/send`; `Authorization: api_…`); migration `00069` (`esign_provider`/`esign_ref` +
> the `sent` status); `Service.RequestSignature`/`CompleteSignatureByExternalID`/`EsignEnabled` + repo
> `GetByVersion`/`UpsertSent`/`AdvanceSignedByExternalID`; `POST /v1/agreements/{kind}/request-signature`
> (agent_admin) + **PUBLIC `POST /v1/agreements/webhooks/esign`** authenticated by the `X-Documenso-Secret` header
> (**constant-time** compare, fail-closed), advancing `sent→signed` on `DOCUMENT_COMPLETED` (correlated by
> `externalId`, idempotent). Config `ORCHESTRATOR_ESIGN_*` (OFF by default → click-through+countersign unchanged).
> Frontend: "Request e-signature" action (opens the signing URL) + an "awaiting signature" status. Self-host:
> `infra/k8s/esign/` (Documenso Deployment/Service/Secret examples + README, AGPL note). Tests: service lifecycle,
> Documenso adapter against an httptest mock (asserts the 3-call flow + auth header + externalId), webhook secret.
>
> **SCC module versioning ✅ SHIPPED 2026-06-25** — the LAST remaining item; the workstream is now complete.
> `agreements/scc.go` models the EU Standard Contractual Clauses (Commission Implementing Decision (EU) 2021/914)
> as **versioned reference data** (`CurrentSCCVersion`="EU-2021/914"; Module Two controller→processor + Module
> Three processor→processor; `ApplicableSCCModules`/`SCCModulesForVersion`). A DPA executed for a tenant whose
> residency **restricts cross-border transfers** (`residency.RestrictsTransfer` over its frameworks, resolved by
> the handler) records the SCC version in force (migration `00070` `scc_version` column), **sealed into the
> content hash**, and the executed PDF renders an "Incorporated Standard Contractual Clauses" section listing the
> modules. The attestation's `executed_dpa` citation gains `scc_version`; the frontend shows an "SCC {version}"
> chip on the executed DPA. BAAs (HIPAA/US-domestic) and non-restricted DPAs record no SCCs. A new Commission
> decision is a version bump → supersession + re-acceptance, with old versions still resolvable for stable
> re-render. Tests: applicability table + that a restricted DPA seals + renders the SCC section.
>
> **The DPA/BAA automation workstream (P1–P3 + countersign + e-sign + SCC) is COMPLETE.**

## 0. What exists today (don't re-invent)

- A **static** DPA document at `frontend/src/app/(marketing)/legal/dpa/page.tsx` (read-only legal text).
- The **residency attestation** (`GET /v1/privacy/residency/attestation`) — which *should* cite an
  executed DPA but currently can't, because there is no executed-DPA record.
- The **audit spine**, **entitlements** (`enterprise` tier), and **object storage** (region-resident) — all reused here.
- The compliance surface (`/compliance` tabs) — the natural home for an "Agreements" tab.

**Gap:** there is no *executed* DPA/BAA per tenant, no countersignature, no subprocessor-change
notification, and nothing the attestation or an auditor can point to. It is a manual,
email-and-PDF process today — sales friction for every Enterprise/health deal.

## 1. The two instruments

- **DPA** (GDPR Art. 28) — the controller↔processor contract every EU/UK customer's procurement
  requires, including the **SCCs** for any onward transfer and a **subprocessor list** (Art. 28(2)/(4)).
- **BAA** (HIPAA) — required *only* when a tenant processes PHI (the `hipaa` framework is applicable).
  Gates PHI features; without an executed BAA, HIPAA workloads must be refused (ties to the
  decline-to-serve pattern already in `internal/residency`).

## 2. Data model (new)

`tenant_agreements` (append-only status history; financial/audit-grade — never hard-deleted):

| column | notes |
|---|---|
| `id`, `tenant_id` | |
| `kind` | `dpa` \| `baa` |
| `template_version` | content-addressed ref to the versioned legal template (below) |
| `status` | `pending` → `sent` → `signed` → `countersigned` → `superseded` |
| `signatory_name`, `signatory_email`, `signatory_title` | who executed it |
| `executed_at`, `document_ref` | object-storage key of the rendered, executed PDF (region-resident) |
| `subprocessor_list_version` | the subprocessor snapshot in force at execution |
| `request_id`, `created_at` | correlation + provenance |

`agreement_templates` — versioned legal text (DPA, BAA, SCC module) as content-addressed
documents; a new version `supersedes` the prior and triggers re-acceptance where required.

`subprocessors` + `subprocessor_events` — the maintained Art. 28(2) list and its change log
(name, purpose, location/region, added/removed_at) that customers can subscribe to.

## 3. Surfaces (new)

- `POST /v1/agreements/{kind}/accept` — click-through acceptance (self-serve), records signatory +
  stamps `signed`. Idempotent on (tenant, kind, template_version).
- `GET /v1/agreements` / `GET /v1/agreements/{id}/document` — list + download the executed PDF.
- `POST /v1/agreements/{kind}/countersign` (internal/admin) — Actrone's countersignature →
  `countersigned`, the terminal executed state.
- `GET /v1/subprocessors` + change-subscription — the live list + notifications.
- Frontend: a **"Agreements"** tab on `/compliance` (download executed DPA/BAA, see status), and an
  onboarding step for Enterprise tenants. The **attestation** report gains an `executed_dpa`
  reference (control: "DPA on file").

## 4. Execution model (two tiers of rigour)

- **Click-through** (self-serve Scale→Enterprise): in-app acceptance with a recorded signatory and
  an immutable, hash-sealed PDF — sufficient for the standard DPA. Cheapest, no third party.
- **Countersigned e-signature** (negotiated Enterprise/BAA): integrate one e-sign provider
  (DocuSign or Dropbox Sign) behind an interface; webhook → status. Keep the provider behind a
  port so click-through and e-sign share the same record model.

## 5. Phasing

- **P1 — Record + click-through DPA:** the table, template v1, click-through accept, executed-PDF
  render + region-resident storage, `/compliance` Agreements tab, attestation `executed_dpa` ref.
- **P2 — Countersignature + BAA:** e-sign port + one provider, Actrone countersign, BAA gated on the
  `hipaa` framework (no BAA ⇒ PHI features refused, reusing the decline-to-serve guard).
- **P3 — Subprocessor registry + notifications:** the maintained list, change events, customer
  subscriptions, and the Art. 28(2) advance-notice flow; SCC module versioning for transfers.

## 6. Ties

[[post-p6e-plans]] residency (attestation cites the executed DPA), `internal/residency`
decline-to-serve (BAA gating for PHI), entitlements (`enterprise`), the audit spine (every status
transition is an audit event), region-resident object storage (executed PDFs follow residency).

## 7. Honest scope boundary

Code automates *generation, execution-capture, storage, and surfacing*. It does **not** draft the
legal text (counsel owns the templates) or constitute legal advice. The instrument's enforceability
rests on the template + the recorded signatory, not on the tooling.
