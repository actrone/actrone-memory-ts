# Actrone — Certification Track Plan

> **Status refreshed 2026-07-13 (code-verified):** Two corrections to the record below.
> **(1) Data-law frameworks are IN the catalog, not just planned.** `backend/orchestrator/internal/
> compliance/catalog.go` defines 5 data-protection-law `FrameworkID`s — `gdpr`, `popia`, `ndpa`,
> `pipeda`, `ccpa` — each with a `Framework{}` entry and a `dataLawOverlay` remapping 8 of the 16
> base controls onto that law's own clause identifiers (e.g. GDPR Art. 32, POPIA §19, CCPA
> §1798.150), merged via `mergeDataLaws()` at package load (`catalog_datalaw_test.go` covers it).
> **No control asserts a status it doesn't already hold for SOC 2/ISO** — the overlay only adds
> clause refs to controls already `implemented`/`partial`. ⚠️ **Legal-signoff caveat (per the
> audit brief): these are code-mapped CONTROLS, not certifications or legal compliance
> determinations — GDPR/POPIA/NDPA/PIPEDA/CCPA applicability and adequacy require counsel
> sign-off per jurisdiction before any customer-facing compliance claim is made.** Note: the audit
> brief that triggered this refresh also named a 6th framework, "GPA" — no such `FrameworkID`
> exists in `catalog.go`; only the 5 above are implemented. Treat "GPA" as not built (or a
> mis-citation) rather than assume it's missing-but-planned.
> **(2) P4 (ISMS) now has real code, not just org process.** `compliance/isms.go` +
> `isms_test.go` implement `ReviewStatus()` (current/overdue/missing verdicts per attested
> control against its `ReviewCadence`); migration `00102_isms_control_reviews.sql` backs a
> platform-level `isms_control_reviews` register; `repository/isms_reviews.go` implements it;
> `handler/http/compliance.go` serves `GET /v1/compliance/isms/reviews` (open read) and
> `POST /v1/compliance/isms/reviews/{controlID}` (`RequireOrgAdmin`), both wired in `main.go`
> (`WithISMSReviews(repository.NewISMSReviewRepository(db.Pool()))`, routes ~3855-3856). This is
> genuinely useful scaffolding (turns "when was this policy last reviewed" into a queryable
> signal) but it is **not a frontend surface yet** — no ISMS review UI was found under
> `frontend/apps/control-tower`. The accredited-auditor engagement + the ISMS content itself
> (policies, risk register) remain org-only, as the doc already says — but "P4 is org-not-code"
> is no longer accurate for the review-tracking mechanism specifically.
>
> Extends the existing SOC 2 surface to a **multi-framework control + evidence engine** that makes
> ISO 27001 / 27701 / 27018 (and, only if a vertical demands it, FedRAMP / HITRUST) auditable —
> and makes the public trust page *truthful* rather than aspirational. Data Residency Plan §7 P3
> lists this as the certification track.
>
> **P1 ✅ SHIPPED 2026-06-25** (go build/vet + compliance/handler tests + frontend tsc/eslint green).
> The multi-framework **control catalog** is live: new `internal/compliance` package — versioned
> in-code reference data (precedent: residency catalog) with **one control → many frameworks**
> (16 controls mapping to SOC 2 + ISO 27001/27701/27018, each carrying that framework's clause refs,
> an `auto`|`attested` evidence kind + named source, owner, and honest status implemented/partial/
> planned). Projection: `Frameworks`/`FrameworkByID`/`AllFrameworkSummaries`/`Readiness` (weighted:
> implemented=1, partial=0.5) /`ControlsForFramework`. Endpoints `GET /v1/compliance/frameworks`
> (list + per-framework readiness) and `GET /v1/compliance/frameworks/{id}` (controls + refs); the
> legacy `/compliance/summary` SOC 2 list stays for back-compat. Frontend: `complianceApi` + a
> **framework-switchable** `CertificationPanel` (selector with per-framework readiness %, weighted
> progress bar, controls with clause-ref chips + status + auto/attested evidence + owner) replacing
> the hardcoded SOC 2 list on `/compliance`. Tests: catalog integrity (every control maps to a known
> framework, no dup ids, valid status), weighted+bounded readiness, projection refs.
>
> **P2 ✅ SHIPPED 2026-06-25** (go build/vet + compliance/handler tests + frontend tsc/eslint green).
> The **evidence engine** derives control status from live signals instead of asserting it, and is
> honest about where it cannot: every control resolves to an `Evidence` record with an explicit
> **method** — `runtime` (observed live this generation by querying a running system), `configuration`
> (true by deployment/codebase posture but not runtime-sampled), or `attestation` (owner-maintained,
> not machine-collected). Four controls have genuine runtime collectors wired to real sources —
> access-authn-logged (access audit count + latest), dsar-rights (DSR queue counts), data-residency
> (reuses the canonical residency-attestation verdict), dpa-subprocessors (executed agreements +
> subprocessor registry/events); every other control falls back to its catalog-declared kind, honestly
> labelled (never a faked live number for CI/KMS/TLS). The auditor artifact `GET /v1/compliance/
> frameworks/{id}/evidence` returns a **sealed `EvidencePackage`** (per-control evidence + observed
> readiness + recomputable SHA-256 over the body with content_hash blanked — same seal pattern as the
> residency attestation), downloadable from a **"Live evidence" lens** on `CertificationPanel` (method
> badge, observed status, the machine signal, sources, observed-at, and the sha256 seal). A read
> failure on any source yields `unobserved`, never a false satisfied.
>
> **P3 ✅ SHIPPED 2026-06-25** (go build/vet + compliance/handler tests + frontend tsc/eslint +
> promtool/YAML green). The **trust center** makes the public `/trust` page truthful instead of
> aspirational. New `compliance/trust.go` builds a **platform-level, tenant-independent** sealed
> `TrustPosture` (catalog readiness + every control's honest status with a platform-scoped
> `verification` kind — `continuously_verified` / `configuration` / `attestation`, never a tenant's
> figures — + live subprocessor-registry transparency + the same recomputable SHA-256 seal). Served
> UNAUTHENTICATED at `GET /v1/trust` (a dedicated lightweight `TrustHandler` carrying only the
> platform subprocessor registry, registered before the auth middleware; `Cache-Control: max-age=300`).
> The marketing `/trust` page is rebuilt as a **live Server Component** consuming it — the fabricated
> "78% / 99.97% / 0 CVEs" stat cards and the hardcoded `✓` emoji are gone, replaced by live framework
> readiness, the live control posture (honest implemented/in-progress/planned + how each is verified +
> framework chips), live subprocessor count, and the sha256 seal; it degrades gracefully (static
> policy still renders) if the endpoint is unreachable. **Continuous-monitoring drift**: `compliance/
> metrics.go` exports `actrone_compliance_framework_readiness_percent{framework}` + controls
> total/implemented + `actrone_compliance_subprocessors_active` (published at startup and on every
> `/trust` call); `infra/observability/prometheus/alert_rules.yml` gains an `actrone.compliance` group
> (ComplianceReadinessRegressed < 60% for 15m; SubprocessorRegistryEmpty == 0 for 10m — level rules,
> since readiness is a level not a rate). **P4 (auditor/ISMS/observation window) is org-not-code — the
> code side of the certification track is complete.**

## 0. The honest framing first

A certification is **earned from an accredited auditor over a months-long observation window**, on
top of a real ISMS (policies, risk register, management review). **Code cannot grant a cert.** What
code *can* do — and what this plan covers — is make the audit cheap and the trust claims honest:

1. a **multi-framework control catalog** (one control → many frameworks),
2. an **evidence engine** that auto-collects proof from systems we already run, and
3. a **trust center** backed by *live* control status, not marketing copy.

The org-side work (engaging an auditor, writing the ISMS, the observation period) is explicitly
**out of code scope** and called out as such — pretending otherwise is the dishonesty to avoid.

## 1. What exists today

- A **SOC 2** checklist (`docs/.../soc2-checklist.md`) and a controls view on `/compliance`
  (served by `GET /v1/compliance/summary` — `soc2_controls`, readiness %).
- Real evidence *sources* already running: the **audit spine**, **access logs** (SOC 2 CC7.2),
  **IaC** (Terraform/Helm), **CI security gates** (govulncheck/pip-audit/npm audit, SHA-pinned
  actions), the **residency attestation**, the **opt-out ledger**, RBAC, and the governance DPE.
- ISO 27701/27018, FedRAMP, HITRUST appear **only** on the marketing `/trust` + `/enterprise` pages
  — aspirational copy with no control mapping behind it. That is the gap.

## 2. Multi-framework control catalog (the core abstraction)

Generalise the SOC 2-only model to: **one control → the frameworks it satisfies → status →
evidence refs.** A control like "All API access is authenticated and logged" maps to SOC 2 CC6.1,
ISO 27001 A.8.15/A.5.15, and ISO 27701 — proved once, counted everywhere.

- Control catalog as versioned in-code reference data (precedent: `internal/residency` catalog,
  `models_catalog.go`) — `{id, title, frameworks[], evidence_kind, owner}`.
- Framework coverage = a projection over the catalog (ISO 27001 Annex A, 27701 privacy extension,
  27018 cloud-PII). FedRAMP/HITRUST are added as framework tags only if a gov/health deal funds them.

## 3. Evidence engine

For each control, an **evidence collector** pulls proof from the source of truth on a schedule and
records `{control_id, framework, status, evidence_ref, collected_at}`:

| Control area | Auto-evidence source (already exists) |
|---|---|
| Access control / authn | access-audit log, RBAC config, Clerk |
| Change management | CI gates, Conventional Commits, PR review, IaC plan/apply history |
| Vuln management | govulncheck / pip-audit / npm audit CI results |
| Data residency / privacy | residency attestation, opt-out ledger, DSR queue |
| Encryption / key mgmt | KMS config (Terraform), TLS posture (gateway) |
| Availability / DR | backup config, multi-AZ (Terraform), SLO/alert rules |

Manual controls (policies, training, management review) are tracked with an owner + review cadence
+ an uploaded-evidence ref — the catalog distinguishes `auto` vs `attested` evidence honestly.

## 4. Surfaces

- `GET /v1/compliance/frameworks` + `/frameworks/{id}` — per-framework control status + readiness,
  generalising today's `soc2_controls`. The `/compliance` controls view becomes framework-switchable.
- **Evidence export** — a per-framework package (controls + evidence refs + timestamps) an auditor
  consumes, sealed like the residency attestation.
- **Trust center** — the public `/trust` page rebuilt on *live* control status (only claim what the
  evidence shows; "in progress" where it is), replacing the static copy.

## 5. Phasing

- **P1 — Multi-framework catalog:** generalise the SOC 2 control model; add ISO 27001/27701/27018
  mappings; framework-switchable `/compliance` view + readiness per framework.
- **P2 ✅ SHIPPED — Evidence engine:** live collectors for the runtime sources above (access audit,
  DSR, residency verdict, agreements/subprocessors); explicit `runtime`/`configuration`/`attestation`
  method per control (honest about what is and isn't runtime-sampled); sealed, downloadable
  per-framework evidence package with a recomputable content hash.
- **P3 ✅ SHIPPED — Trust center:** sealed platform-level `TrustPosture` at public `GET /v1/trust`;
  marketing `/trust` rebuilt as a live Server Component (fabricated stats + emoji removed); compliance
  posture exported as Prometheus gauges with an `actrone.compliance` alert group for readiness drift.
- **P4 (org, NOT code):** engage an accredited auditor for ISO 27001, then 27701/27018; FedRAMP /
  HITRUST only if a gov/health vertical commits (high cost — not speculative).

## 6. Ties

[[post-p6e-plans]] residency attestation (a control evidence source + the same seal pattern),
[[p7-monetization]] (Enterprise tier lever), the audit/observability spine, the existing SOC 2
checklist (the seed catalog), and the DPA/BAA automation (an Art. 28 / privacy-control evidence
source). See [[Actrone_DPA_BAA_Automation_Plan]].

## 7. Honest scope boundary

This builds the **evidence and control-mapping engine** and a **truthful trust surface** — it makes
certification cheap and the public claims accurate. It does not, and cannot, *be* the certification:
that requires an accredited auditor, a real ISMS, and an observation window, which are organisational
commitments tracked separately.
