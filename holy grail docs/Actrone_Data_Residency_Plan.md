# Actrone — Data Residency & Regional Compliance Plan

> **Status refreshed 2026-07-13 (code-verified):** P2's data-plane **routing** layer is materially
> further along than the 2026-07-04 line below states. `internal/regionpool` (`router.go`,
> `registry.go`, `migrator.go`, `pgx_executor.go`, `shard.go` + migration `00101_region_migrations.sql`)
> is now wired at bootstrap in `main.go` for **all four** backing stores: Postgres
> (`regionpool.NewRegistry[*pgxpool.Pool]` + `db.SetRegionRegistry`), Qdrant, Redis, and the object
> store (each gets its own `Router[T]`/`Registry[T]`) — confirmed by direct read of `main.go`
> (~lines 277, 333, 373, 1268-1270, 3056-3131). A governed **tenant region-cutover** trigger also
> exists: `regionpool.Migrator` (dry-run by default, idempotency-keyed, audit-ledger-recorded,
> refuses same-pool moves) behind `POST /v1/admin/residency/migrations`
> (`handler/http/residency_migration.go`, `RequireOrgAdmin`, scoped to the caller's own tenant only).
> This closes two items §7 P3 below lists as "still pending" — **DPA/BAA automation is COMPLETE**
> (see `Actrone_DPA_BAA_Automation_Plan.md`, not pending) and **region-migration tooling now
> exists in code** (not just "runbook tooling" to be written). The genuinely remaining gap is
> unchanged in kind, only narrower: the `regionpool` machinery is fail-safe-inert until a regional
> DSN is registered against an *applied* physical plane — `infra/terraform/envs/prod-eu` is
> authored but (unverified 2026-07-13) not confirmed applied to a live cluster from this doc
> read alone. Until then every tenant resolves to the primary pool/store, i.e. single-plane
> behavior, exactly as this doc's honest-framing principle requires. Certification track
> (referenced in §7 P3) is SHIPPED P1–P3 per `Actrone_Certification_Track_Plan.md`, not merely
> "on top of" a plan. One stale detail: §2's "Global control plane... auth/SSO (Clerk)" bullet
> now reads WorkOS-managed (cloud tier) / generic-OIDC (self-host) — Clerk is fully removed
> (zero `@clerk` references anywhere in the repo, verified 2026-07-13); the architecture point
> (SSO handled globally, customer content stays regional) is otherwise still correct.
>
> **Status:** 🟡 P1 BUILT · P2 written + wired, APPLY-gated · P3 partial (verified by code audit 2026-07-04).
> **P1 (app-layer) ✅ done:** `internal/residency/` (`catalog.go` w/ decline-to-serve for `pipl-cn`/`fz152-ru`,
> `attestation.go` sealed posture), `PrivacyHandler` DSR + `GET /v1/privacy/residency/attestation`, frontend
> `ResidencyPanel.tsx` + `AttestationPanel.tsx`. **P2 is NOT unbuilt code — it is deployment-gated:** the
> region-routing seam is wired (`internal/regionresolve` + `middleware.RequireRegion` in `main.go`) and the
> physical EU plane is written Terraform (`infra/terraform/modules/regional-data-plane/` + `envs/prod-eu/`) —
> it just hasn't been *applied* (no live EU backends) and EU DSNs aren't wired. **P3:** attestation + DPA/BAA +
> decline-to-serve done; remaining = extra region configs (UK/CA/AU) + cert-track P4 org process. **Owner:** Matt.
> **Corrected framing (was wrong in the first draft):** Actrone already has a meaningful
> **config-level** residency + data-rights + multi-framework governance layer (see §0). What it does
> **not** have is **physical regional data planes** — data is logically tagged with a region but
> stored in one place. The environments feature (dev/staging/prod) partitions data *within* a region
> and is **not** geographic residency. A region dropdown without regional backends is theatre; this
> plan turns the existing config layer into real residency, phased, and gates it by tier.

---

## 0. What already exists (inventory — build on this, don't re-invent)

**Residency config (control-plane):** a `tenant_data_residency` table +
[DataResidencyRepository](../backend/orchestrator/internal/repository/compliance.go) — `region`
(`global | eu | us | za`), per-framework applicability flags (`gdpr_applicable`, `popia_applicable`,
`hipaa_applicable`), data-officer name/email, and retention windows (tasks 90d / memory 365d / audit
2555d ≈ 7y).

**Data-subject rights (CCPA/GDPR/POPIA):**
[PrivacyHandler](../backend/orchestrator/internal/handler/http/privacy.go) — full DSR lifecycle
(`access | erasure | portability | correction | restriction | objection`), `+ /privacy/erase` (Art.
17 / POPIA §24) and `/privacy/export` (Art. 20 portability).

**Retention enforcement:**
[DataRetentionService](../backend/orchestrator/internal/service/data_retention_service.go) — scheduled
purge per GDPR Art. 5(1)(e); governance violations are never purged (Merkle-chained immutable audit).

**Frontend surface (read-only today):** the Control Tower
[/compliance page](../frontend/src/app/(app)/compliance/page.tsx) already renders the residency
config, retention windows, SOC 2 control status, the DSR queue (with overdue SLA flags), and the
access-audit log — but the residency tab is **display-only** (it points the user at
`PUT /v1/privacy/residency`). P1's frontend work is making that tab **editable** with
entitlement-gated region choice + honest labelling, not building it from zero.

**Governance policy pack (DPE-enforced YAML, 9 frameworks today):** `gdpr`, `hipaa`, `popia`,
`eu-ai-act`, `fda-21-cfr-11`, `fca-mifid-ii`, `fsca`, `financial-services`, `general-enterprise`
(`backend/orchestrator/internal/governance/policies/`). Plus a `soc2-checklist.md`.

**The real gap:** (1) no physical regional data planes (EU data actually sitting in EU infra); (2)
the framework coverage below is narrower than our addressable market; (3) CCPA/US-state and several
localization regimes aren't represented as first-class config. This plan closes all three.

## 1. The requirement, precisely

- **GDPR (EU):** restricts transfer of EU personal data to non-"adequate" jurisdictions; demands the
  ability to keep EU customer data in the EU and to **prevent failover** into non-compliant regions.
  This is a **residency** (where bytes physically live) problem.
- **CCPA (California):** primarily a **rights** regime — access / delete / opt-out / know — not a
  physical-residency mandate. We address it mostly with DSAR tooling + audit, not geo-pinning.

So two distinct workstreams: **(A) residency** (infra-heavy, GDPR) and **(B) data-subject rights /
DSAR** (app-layer, CCPA + GDPR Art. 15–17). Don't conflate them.

## 1b. Framework coverage matrix — beyond GDPR & CCPA (2026)

Frameworks split into three behaviours that matter to *this* plan:
**[L] hard data-localization** (bytes must physically stay in-country → forces a regional data plane);
**[T] cross-border-transfer-restricted** (export allowed only to "adequate" jurisdictions / under a
mechanism → forces region-aware routing + adequacy config); **[R] rights/processing only** (no
geo-pinning → satisfied by DSAR + audit + consent). Status: ✅ already represented · ➕ to add.

### Comprehensive privacy regimes

| Framework | Region | Behaviour | Status |
| --- | --- | --- | --- |
| GDPR | EU/EEA | T (no transfer to non-adequate) | ✅ policy + flag |
| UK GDPR + DPA 2018 | UK | T (own adequacy list post-Brexit) | ➕ add (distinct from EU) |
| Swiss nFADP (revFADP) | Switzerland | T | ➕ add |
| LGPD | Brazil | T + R | ➕ add |
| PIPEDA + **Quebec Law 25** | Canada | R (+ Law 25 strict consent, fines to 4% global) | ➕ add |
| Australia Privacy Act / APPs | Australia | T + R (cross-border accountability) | ➕ add |
| APPI | Japan | T + R | ➕ add |
| PIPA | South Korea | T + R (consent-heavy) | ➕ add |
| PDPA | Singapore | R + T | ➕ add |
| PDPA | Thailand | R + T | ➕ add |
| POPIA | South Africa | T + R | ✅ policy + flag |
| NDPA/NDPR | Nigeria | R + partial L | ➕ add |
| DPA 2019 | Kenya | R + partial L | ➕ add |
| Privacy Act 2020 | New Zealand | R + T | ➕ add |
| PDPL | UAE / Saudi Arabia | T + sectoral L | ➕ add |

### Hard data-localization regimes (these force a *physical* in-country/region data plane — [L])

| Framework | Region | Note | Status |
| --- | --- | --- | --- |
| **PIPL** (+ CSL, DSL) | China | CIIO/threshold data stays in CN; export needs CAC security assessment; fines to 5% revenue | ➕ add (own data plane; likely out-of-scope near-term — flag explicitly) |
| **Federal Law 152-FZ** | Russia | Russian-citizen PII DBs must reside in RU; Roskomnadzor notification | ➕ add (likely decline-to-serve — document the stance) |
| Cybersecurity Law + Decree 53 | Vietnam | Layered localization for in-scope operators | ➕ add (flag) |
| PDP Law / GR 71 | Indonesia | Sectoral/public localization | ➕ add (flag) |
| DPDP Act 2023 (rules live Nov 2025) | India | No blanket localization, but **sectoral** (RBI finance, telecom) localizes; govt allow-list for transfers | ➕ add |
| Various (KSA SAMA, etc.) | Gulf finance | Sectoral localization | ➕ add (sector pack) |

### Africa (AU Malabo Convention backbone + national laws)

The **AU Malabo Convention** (African Union Convention on Cyber Security & Personal Data Protection)
came **into force 8 June 2023** — the pan-African backbone (≈15+ ratifications). Treat it like "the
GDPR of Africa": a tenant in a ratifying state inherits a Malabo-aligned baseline, refined by national
law. Africa is **strategically core** to Actrone (we already ship POPIA + FSCA and carry a `za`
region) — cover it properly, not as an afterthought.

| Framework | Country | Behaviour | Note | Status |
| --- | --- | --- | --- | --- |
| AU Malabo Convention | Pan-African | T + R (baseline) | In force Jun 2023; ratifying-state baseline | ➕ add as backbone |
| POPIA | South Africa | T + R | + FSCA financial | ✅ policy + flag + `za` region |
| **NDPA 2023** (NDPC, GAID Mar 2025) | Nigeria | R + risk-tier DPO/audit | **CBN payment-data localization → in force Jan 2027** [L] for payment/financial | ➕ add (+ flag CBN 2027) |
| Data Protection Act 2019 (ODPC) | Kenya | T + R; financial-data localization | | ➕ add |
| Law 151/2020 | Egypt | T (**prior regulator approval** to export) | stricter transfer gate | ➕ add |
| DPA 2012 + **draft 2025 bill** | Ghana | R → moving to **[L]** | draft mandates domestic storage of national-security / sensitive / children's / biometric / health / genetic data | ➕ add (watch 2025 bill) |
| Law 058/2021 + Data Sharing Policy | Rwanda | T + leaning [L] | localization via cyber + financial laws | ➕ add |
| Data Protection Act 2021 | Zambia | partial [L] | sensitive PII in-country unless conditions met | ➕ add |
| Cyber & Data Protection Act 2021 | Zimbabwe | partial [L] | personal-info export needs authorization | ➕ add |
| Personal Data Protection Act 2022 | Tanzania | R + T | | ➕ add |
| DPP Act 2019 | Uganda | R + sectoral [L] | financial-services localization | ➕ add |
| Data Protection Act 2017 | Mauritius | T + R (GDPR-aligned) | adequacy-friendly hub | ➕ add |
| Law 09-08 / Loi 18-07 | Morocco | T + R | | ➕ add |
| Law 2008-12 | Senegal | T + R | one of Africa's earliest | ➕ add |
| DPA 2018 / national laws | Botswana, Côte d'Ivoire, Togo, Angola, Benin | R (Malabo-aligned) | covered by the backbone + national row | ➕ add as Malabo baseline |

**African residency strategy (pragmatic):** most African localization is **"soft"** (cyber/financial
laws restricting *transfer*, not always mandating a physical plane). The cost-effective path is a
**sovereign-cloud commitment** (e.g. a contractually region-bound zone — Azure SA-North/Google
sovereign offerings, or a local provider) to satisfy soft localization **without** standing up
dedicated infra — reserve a true dedicated plane for hard cases (Nigeria CBN payments from 2027,
Ghana's pending bill). Map each African country onto the §1b L/T/R model + the Malabo baseline so a
new national law is a config row, not new code.

### US: federal sectoral + the 19-state patchwork

| Framework | Scope | Behaviour | Status |
| --- | --- | --- | --- |
| CCPA/**CPRA** | California consumers | R (rights + opt-out of sale/share) | ➕ first-class (DSR exists; add sale/share opt-out + GPC) |
| 18 other state laws (VA CDPA, CO CPA, CT CTDPA, TX, OR, MN, NJ, DE, …) | Per-state | R (one baseline covers ~all) | ➕ add as **one "US-State" baseline** |
| HIPAA | US health PHI | R + safeguards (no hard L, but BAA) | ✅ policy + flag |
| GLBA | US financial | R + safeguards | ➕ add |
| FERPA | US education | R | ➕ add (if edu vertical) |
| COPPA | US children <13 | R + consent | ➕ add (ties to voice/age-gating) |

### Sector / payment / AI / certifications

| Framework | Type | Status |
| --- | --- | --- |
| PCI DSS | Payment card data | ➕ add (if we touch card data — likely tokenize/avoid) |
| EU AI Act | AI governance/risk | ✅ policy |
| FDA 21 CFR Part 11 | e-records/signatures | ✅ policy |
| FCA MiFID II | UK/EU markets | ✅ policy |
| FSCA | SA financial | ✅ policy |
| SOC 2 (Type II) | Trust-services audit | ✅ checklist (certification track) |
| ISO 27001 / 27701 / 27018 | ISMS / PIMS / cloud-PII | ➕ add to cert roadmap |
| FedRAMP / StateRAMP | US gov cloud | ➕ enterprise/gov roadmap (high lift) |
| HITRUST | Healthcare assurance | ➕ if health vertical |

**Design takeaway:** don't model 40 laws individually. Model the **three behaviours** (L/T/R) plus a
small set of **adequacy/transfer lists**, then map each framework onto them. A tenant's
`data_region` + applicable-framework set drives: which data plane stores their data (L/T), which
model endpoints are reachable (T), and which DSR/consent flows are exposed (R). New laws become rows
in a config table, not new code.

## 2. Architecture pattern (verified 2026 best practice)

**Control-plane / data-plane split with geographic sharding:**

- **Global control plane (minimal, no customer content):** auth/SSO (WorkOS-managed / generic-OIDC
  self-host — Clerk removed 2026-07-09, see `Actrone_WorkOS_Auth_Switch_Plan.md`), billing, marketing, and
  the **org→region registry** (which region each org's data lives in). Industry consensus: auth/SSO
  can be processed globally even though it touches identifiers, because it's low-volume and carved out
  by SCCs/adequacy — this is how mature SaaS balances compliance with operability.
- **Regional data planes (customer content stays local):** Postgres, Qdrant (memory/vectors), Redis,
  object storage (files, **voice recordings**), the audit spine, and model-inference endpoints — all
  pinned to the org's home region. **Geographic sharding:** EU orgs' rows live only in EU
  infrastructure; US orgs' in US. No cross-region replication of customer content; **no failover into
  a non-adequate region** (region-bound backups + DR within the same legal boundary).
- **Region-aware routing:** the gateway resolves an org's home region from the global registry and
  routes every request to that region's data plane. This belongs in the **P6-A Envoy gateway** —
  residency routing is a gateway concern.
- **Model residency:** route to **in-region provider endpoints** (EU Bedrock/Azure/Vertex regions)
  and **block** models with no in-region endpoint for an EU-pinned org. Our P6-E provider work is
  already region-aware (Bedrock region, Azure endpoint, Vertex location) — residency reuses it.

## 3. What we capture at sign-up / onboarding

- An org-level **`data_region`** chosen at creation (onboarding step), stored in the global control
  plane. Initial regions: **US** (default), **EU**, and **ZA / Africa** (already a first-class `za`
  region today, satisfied via a sovereign-cloud-bound zone); roadmap: UK, CA, AU, AP, and a Nigeria
  zone ahead of the **CBN Jan-2027** payment-localization deadline.
- **Immutable by default.** Region is set once; changing it = a heavy, support-assisted **data
  migration** (Enterprise runbook), not a settings toggle. The UI states this clearly.
- **Honest labelling.** Until the EU data plane physically exists, the selector must not *claim* EU
  residency. P1 stores the attribute and shows "Data stored in: US (EU coming Q_/__)"; we only expose
  EU as selectable when the EU plane is live.

## 4. Subscription gating (residency as an enterprise lever)

Residency is a standard enterprise upsell — gate it:

| Plan | Residency capability |
| --- | --- |
| Free / Pro | Default region only (US). No choice. DSAR self-serve (rights, not residency). |
| Business | Choose region at sign-up (US **or** EU). Region-pinned data plane. |
| Enterprise | EU + region-pinned, **DPA**, residency **attestation/reporting**, region-pinned model endpoints, custom/extra regions, BAA where applicable. |

Wire through `lib/entitlements.ts` (`can('residency.region_choice')`, `can('residency.eu')`). A
Pro user selecting EU sees the `UpgradeModal`.

## 5. Data-subject rights (CCPA + GDPR Art. 15–17) — separate, app-layer

- **DSAR tooling:** export (access), delete (erasure), and opt-out flows per data subject, scoped to
  the org's region. Leverages the audit spine (we already record activity) + memory stores (Qdrant/
  Redis purge). Append-only audit/financial records are exempted from hard-delete per policy
  (documented), with redaction instead.
- This ships earlier and cheaper than residency and covers most CCPA obligations.

## 6. Enforcement guarantees (what auditors ask for)

- Region-bound replication + backups; DR stays within the legal boundary; **failover never crosses**
  into a non-adequate region (config-enforced, alerted).
- Cross-region egress blocked at the gateway; the org→region binding is the single source of truth.
- **Residency attestation:** a generated report + audit trail proving an org's data never left its
  region (Enterprise deliverable).
- Any unavoidable control-plane cross-border flow (auth) covered by SCCs/adequacy + documented in the
  DPA.

## 7. Phasing (be honest about cost)

- **P1 — App-layer, cheap (weeks):** `data_region` org attribute captured at onboarding + shown in
  settings; entitlement gating; honest labelling (no false EU claim yet); **DSAR export/delete**
  (covers CCPA) — *already largely built (§0); extend to first-class CCPA/CPRA sale-share opt-out +
  Global Privacy Control.* Generalise the residency config from 3 framework flags to a **framework
  catalog** (the §1b L/T/R model: a `frameworks` config table + adequacy/transfer lists), and add a
  **US-State baseline** + UK-GDPR + LGPD + Quebec Law 25 + Australia/Japan/Korea/Singapore as config
  rows (policy YAMLs where DPE enforcement applies). *No residency claim until P2.*
- **P2 — Infra, real residency (quarter+, infra repo):** stand up the **EU data plane** (regional
  Postgres/Qdrant/Redis/object store), **region-aware routing** in the Envoy gateway (P6-A),
  region-pinned backups + no-cross-region-failover policy, region-pinned model endpoints. EU becomes
  truly selectable.
- **P3 — Enterprise polish:** residency attestation/reporting, DPA/BAA automation, additional regions
  (UK/CA/AU/AP), region-migration runbook tooling; **certification track** (ISO 27001/27701/27018 on
  top of the existing SOC 2 checklist; FedRAMP/HITRUST only if gov/health verticals demand it). Make
  an explicit **decline-to-serve** stance for hard-localization regimes we won't build a plane for
  (China PIPL, Russia 152-FZ) rather than silently mis-serving them.
  - *Built 2026-06-25 (app-layer):* **residency attestation** —
    `GET /v1/privacy/residency/attestation` (`internal/residency/attestation.go`, pure + table-tested)
    generates a control-by-control, SHA-256-sealed report from the region binding + deployment
    posture (`Availability`) + DSR/opt-out evidence counts; the verdict is honest and degrades to
    `action_required` where the deployment cannot back a guarantee (region pinned with no matching
    plane, transfer framework on the global plane, overdue DSR). Frontend `AttestationPanel`
    (Attestation tab on `/compliance`) renders and downloads the verifiable JSON. **Decline-to-serve**
    — `Framework.DeclineToServe` (pipl-cn, fz152-ru); `UpdateResidency` rejects a framework set naming
    a declined regime (422) and the picker surfaces them as "Not served".
  - *Still pending (corrected 2026-07-13 — was overbroad):* additional regions (UK/CA/AU/AP). **No
    longer pending:** DPA/BAA automation is COMPLETE (`Actrone_DPA_BAA_Automation_Plan.md`);
    region-migration tooling now exists in code (`internal/regionpool.Migrator` + the
    `/v1/admin/residency/migrations` admin endpoint, see the status note at the top of this doc);
    the certification track is SHIPPED P1–P3 (`Actrone_Certification_Track_Plan.md`). The hard
    region-bound storage/backup attestation for a non-global region stays gated on the P2 EU-plane
    operator apply (runbook §8) — that gate is real and unchanged; only the *tooling* to execute a
    cutover once the plane exists is no longer pending.

## 8. Dependencies & ties

- **P6-A (Envoy gateway):** region-aware routing lives here.
- **P6-E (providers):** in-region model endpoints reuse the existing region-aware Bedrock/Azure/Vertex
  bindings.
- **Voice V2 + MediaGuard:** recordings are personal data → must obey residency + DSAR.
- **Environments:** orthogonal — env partitions dev/staging/prod *inside* a region; residency pins the
  region. Both compose (an EU org has EU dev + EU prod).

## 9. Recommendation

Do **P1 now** (capture region + DSAR — small, real, sellable as "data-region aware" + "CCPA-ready"),
and scope **P2 as a dedicated infra initiative** (the EU data plane) rather than pretending a dropdown
equals residency. Don't sell EU residency until the EU plane is live — claiming it without the
infrastructure is the one thing that turns a compliance feature into a liability.

## 10. Sources (2026 verification)

- [Data Residency for SaaS: How to Build Compliant Architecture — Alation](https://www.alation.com/blog/data-residency-by-design-global-compliance/)
- [Building a Multi-Region Compliant Customer Data Lake at Scale — Atlassian](https://www.atlassian.com/blog/atlassian-engineering/building-a-multi-region-compliant-customer-data-lake-at-scale)
- [Why authentication doesn't need to stay local: the new data residency pattern — WorkOS](https://workos.com/blog/data-residency-for-enterprise-saas)
- [Data Residency Requirements: EU vs US Explained — Secure Privacy](https://secureprivacy.ai/blog/data-residency-requirements-eu-vs-us-explained)
- [Multi-Region Database Design & Data Residency — scalewithchintan](https://scalewithchintan.com/blog/multi-region-database-design-data-residency-challenges)
- [Understanding Architectures for Multi-Region Data Residency — InfoQ](https://www.infoq.com/articles/understanding-architectures-multiregion-data-residency/)
- [Data Localization Laws by Country (2026) — Recording Law](https://www.recordinglaw.com/world-laws/world-data-privacy-laws/data-localization-laws-by-country/)
- [Global Data Protection Laws in 2026 — Forcepoint](https://www.forcepoint.com/blog/insights/tracking-global-data-protection-laws-2026)
- [Managing Data Localization Across Global Privacy Laws — TrustArc](https://trustarc.com/resource/data-localization-global-privacy-laws/)
- [US State Privacy Law Tracker 2026: Twenty Laws, One Baseline — Consenteo](https://www.consenteo.com/knowledge-hub/legal/us_state_privacy_law_tracker_2026)
- [US State Privacy Law Tracker (2026) — Secure Privacy](https://secureprivacy.ai/blog/us-state-privacy-law-tracker-2026)
- [Quebec's Privacy Law 25: What You Need to Know — Outside GC](https://outsidegc.com/blog/quebecs-privacy-law-25-what-you-need-to-know/)
- [Brazil's LGPD Explained — Termly](https://termly.io/resources/articles/brazils-general-data-protection-law/)
- [AU Malabo Convention enters force — dataprotection.africa](https://dataprotection.africa/malabo-convention-set-to-enter-force/)
- [Data Protection in Africa Roundup 2025/2026 — Digital Policy Alert](https://digitalpolicyalert.org/blog/data-protection-in-africa-roundup)
- [Data Sovereignty in African Tech Hubs — Secure Privacy](https://secureprivacy.ai/blog/african-data-sovereignty-laws)
- [Which Way for Data Localisation in Africa? — CIPESA](https://cipesa.org/download/briefs/Which_Way_for_Data_Localisation_in_Africa___Brief.pdf)
- [CBN Nigeria Payment Data Localization → sovereign cloud — Hyperscalers Africa](https://africa.hyperscalers.news/analysis/cbns-data-localisation-directive-could-become-nigerias-most-important-cloud-policy/)
- [Data Protection Laws & Regulations 2025–2026: Nigeria — ICLG](https://iclg.com/practice-areas/data-protection-laws-and-regulations/nigeria/)
