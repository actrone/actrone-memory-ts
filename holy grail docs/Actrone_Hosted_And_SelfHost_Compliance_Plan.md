# Actrone — What To Do for the Hosted Platform vs. the Self-Hosting Offering

> **Purpose.** The actionable "what do we actually have to do" split by **delivery model**, because the
> two carry **completely different compliance burdens** — and that difference is Actrone's biggest
> strategic lever for the hardest-regulated (esp. African fintech) buyers. Grounded in Actrone's shipped
> code (`internal/{residency,licensing,oidc,compliance,agreements}`, `infra/helm/actrone/values-selfhost*`,
> `infra/kots`). **Not legal advice** — the *(counsel)* items need a lawyer's sign-off. Owner: Matt.
> Date: 2026-07-21.
>
> **The one big idea:** on the **hosted** platform Actrone carries the data-protection weight (staged, and
> mostly deal-gated). On **self-host**, the **customer** becomes the controller running Actrone in *their*
> infra — so registration, residency, localization, and cross-border transfer become **their** problem, in
> **their** country. **Self-host is therefore the compliance answer for the buyers who would otherwise be
> un-servable** (CBN/BoG/CBE localization, air-gapped, sovereign). Sell the hard-regulated buyer self-host,
> and the "heavy Africa compliance list" mostly evaporates for that deal.

---

## 0. Two models, two burdens (read this first)

| | **Hosted platform** (Actrone-run SaaS) | **Self-hosting** (customer-run) |
|---|---|---|
| Who runs it | Actrone (our cloud, our regions) | The customer (their infra / cloud / on-prem / air-gap) |
| **Who is the controller** | Customer (their end-user data); Actrone = **processor**. Actrone = controller of its own account/identity/telemetry | **Customer** — of everything. Actrone = **software vendor, not a processor** for that deployment |
| Where does the data live | Actrone's region plane (US today; af-south-1/eu roadmap) | **The customer's chosen location** — data **never touches Actrone** |
| Who registers with the regulator | **Actrone** (where triggered) + customer | **The customer**, in their jurisdiction — not Actrone |
| Who owns cross-border transfer | **Actrone** (SCCs to sub-processors) | **The customer** (no transfer to Actrone happens) |
| Who owns localization (CBN/BoG/CBE) | **Actrone must host in-country** (usually can't) | **Customer hosts in-country → satisfied by their own infra** |
| Actrone's remaining duty | The full processor stack (below) | **Ship software + evidence + license + support** (below) |
| Best fit | Devs, SMB, non-regulated, residency-via-region | **Regulated fintech, data-localization, air-gapped, sovereign** |

**Corollary:** the maximalist "register in 5 countries + local reps + in-country planes" list applies
**only to the hosted platform, and only when a deal/scale triggers it.** For the hardest buyers, you don't
solve it on hosted at all — you route them to **self-host**.

---

## 1. Hosted platform — what to do (staged)

### 1.1 Now — table-stakes (light; a few hours of counsel + docs you already generate)
- [ ] **Customer-facing docs:** privacy policy, ToS, a **signable DPA** (Actrone already generates
      per-tenant DPAs — `internal/agreements`), and a **published sub-processor list** (AWS, WorkOS, model
      providers, etc.).
- [ ] **Transfers:** rely on **your sub-processors' standard SCCs / DPF** (AWS, WorkOS…) — you sign
      *theirs*; you do **not** write bespoke per-country SCCs early. Document the chain.
- [ ] **Lawful basis + controller/processor posture** — **one counsel session** settles it for all wave-1
      countries *(counsel)*. Consent/DSR machinery is already shipped (`handler/http/privacy.go`).
- [ ] **Breach runbook** — who notifies whom, and the timelines (processor→controller fast; 72h to
      NG/KE/EG regulators; **24h FSCA** for a ZA fintech). Wire into DPAs.
- [ ] **Don't trip obvious wires** — no credit-reporting / special-category / children's cross-matching
      without care (ZA POPIA **s57** prior-authorisation is use-case-specific, not a blanket blocker).
- [ ] **Honesty guardrail:** never *claim* a certification/registration you don't hold. Operating
      risk-based is normal; misrepresenting compliance is not.

### 1.2 Buyer-gated — do only when a deal / local entity / scale triggers it
- [ ] **Regulator registration** — **KE ODPC** (mandatory, extraterritorial), **NG NDPC/DCPMI** (+ a
      licensed **DPCO** for the annual audit at EHL/UHL), **GH DPC**, **ZA Information Officer**. Do it
      when you **incorporate locally, land a material customer, or procurement demands it.** Honest note:
      KE/NG registration is *technically* mandatory the moment you process their residents' data — early
      operation without it is a **managed risk**, common for foreign SaaS pre-traction; prioritise the
      country where your first real customer lands *(counsel)*.
- [ ] **Local representative / DPO** — soft/uncertain for ZA/NG/KE (a local contact point suffices early);
      **appoint when counsel/scale says.** *(EG's hard local-rep requirement is a wave-2 / self-host item.)*
- [ ] **FSCA-grade controls** for a ZA fintech buyer (Joint Standard 2 of 2024: third-party controls, 24h
      cyber-incident reporting) — flow down via the DPA when the buyer requires it.
- [ ] **Certifications on demand** — SOC 2 / ISO 27001/27701/27018 + GDPR evidence. The **certification
      track is already built** (`internal/compliance`: catalog + sealed evidence + trust center); the work
      is *running the audit*, not building the machinery.

### 1.3 Strategic infra (a business decision, not a legal gate)
- [ ] **Stand up `af-south-1`** (flip `za` Roadmap→Live) — the SA anchor + African latency; makes POPIA
      clean (SA PI stays in-Republic ⇒ no s72 transfer). **You can launch legally on `us`/`global` with
      SCCs first** — time af-south-1 to SA enterprise demand. Same `regionpool` work progresses **EU/CA**
      planes.
- [ ] Only build **in-country planes** (NG/GH/EG) if a **hosted** regulated buyer demands it *and*
      self-host isn't acceptable to them — usually it is, so **prefer routing them to self-host** over
      building a plane.

### 1.4 Hosted — built vs. to-do
- **BUILT:** residency catalog + regional routing (`regionpool`), POPIA/FSCA DPE packs, DSR/DSAR, DPA
  automation, certification track, WorkOS/OIDC auth.
- **TO-DO:** the **legal acts** (registrations, transfer papering, the counsel posture), the **physical
  planes** (af-south-1/eu/ca — infra), and the **customer-facing legal docs** (privacy/ToS/sub-processor
  list). Plus, for EU: **appoint a GDPR Art-27 EU representative** if no EU establishment.

---

## 2. Self-hosting — what to do (this is the moat for hard buyers)

On self-host the customer owns the data and its location, so **Actrone's compliance duty collapses to
"ship trustworthy software + the evidence to prove it."** Your job is to make the customer's compliance
*easy*, not to carry it.

### 2.1 What Actrone must PROVIDE
- [ ] **Deployment artifacts (mostly built):** Helm (`values-selfhost.yaml` / `-ha.yaml`) + **KOTS /
      Replicated** (`infra/kots`: app, config, embedded-cluster, preflight, helmchart) for a
      customer-run, air-gap-capable install. Keep these current with every release.
- [ ] **Licensing (built):** Ed25519 **offline license** (`internal/licensing`) that can set tier/limits
      with no phone-home. **TO-DO:** a self-serve **license admin UI** + issuance flow.
- [ ] **No-phone-home / metering (built):** off-cloud metering (`internal/billing` licensed store, Noop
      default) so an air-gapped install never exfiltrates usage. **TO-DO:** the **air-gap usage-export**
      bundle (customer emails/uploads a signed usage report).
- [ ] **BYO-everything seams:** BYO-OIDC (`internal/oidc` — built, keeps identities in the customer's IdP),
      BYO-model/inference (built), BYO-storage (customer's Postgres/Qdrant/Redis/S3), and **BYO-carrier**
      for voice (the media-gateway seam — see the voice plan) so voice media stays in the customer's
      network too.
- [ ] **The compliance EVIDENCE PACK** (the deal-maker — **TO-DO**, mostly assembling what exists):
  - a **shared-responsibility matrix** (who owns what: customer = controller/registration/residency/
    localization; Actrone = software/patches/vulns) — the single most-requested self-host artifact;
  - the **control mapping** the certification catalog already produces (SOC 2 / ISO / POPIA / etc.), so the
    customer's auditor/regulator can map Actrone's controls into their own filing;
  - **SBOM + provenance** (the publishing runbook already ships SBOM/cosign) + a security whitepaper +
    a pen-test summary;
  - a **data-flow / no-egress statement** (proves, for CBN/BoG/CBE, that customer data never leaves their
    boundary).
- [ ] **Support + lifecycle (TO-DO):** an SLA, a **patch/CVE delivery channel that works air-gapped**, a
      **version-support policy**, and upgrade docs. Regulated buyers require a named support commitment.

### 2.2 Why this answers the hardest African compliance
- **NG CBN payments localization (Jan 2027), GH BoG CISD, EG CBE, KE strategic-interest** — all require
  **in-country hosting**. On self-host the customer **runs Actrone in-country on their own infra** →
  localization satisfied by *them*; **Actrone never processes the data** ⇒ **no Actrone registration,
  transfer papering, local rep, or in-country plane for that deployment.**
- **EG's hard in-Egypt local-representative + CBE outsourcing-registration** problem: largely dissolved —
  a self-hosting Egyptian buyer runs it themselves; Actrone is a licensed software supplier, not an
  Egyptian data processor.
- The customer's own **DPO/registration/residency** obligations are theirs to meet — Actrone just has to
  not get in the way (no forced egress, no forced foreign IdP → hence BYO-OIDC + off-cloud metering).

### 2.3 Self-host — built vs. to-do
- **BUILT (P0–P2):** Ed25519 licensing, off-cloud metering, generic-OIDC, `values-selfhost*`, KOTS/
  Replicated packaging, BYO-model.
- **TO-DO (P3/P4):** license-admin UI, air-gap usage-export, **SCIM** (enterprise user provisioning), the
  **compliance evidence pack + shared-responsibility matrix**, and the **support/SLA + air-gap patch**
  story.

---

## 3. Which buyer → which model (route the deal, don't over-build)

| Buyer | Model | Why |
|---|---|---|
| Individual dev / OSS user / SMB | **Hosted (self-serve)** | Light compliance; fastest path; wave-1 motion |
| Enterprise wanting residency | **Hosted on their region plane** (once `af-south-1`/`eu` Live) *or* self-host | Region plane satisfies residency without them running infra |
| **Regulated fintech / data-localization (CBN/BoG/CBE)** | **Self-host in-country** | The *only* clean way to meet hard localization; Actrone never touches the data |
| Air-gapped / sovereign / government | **Self-host** (KOTS/embedded) | No connectivity; customer owns everything |

**Golden rule:** do **not** build in-country planes or take on foreign registrations to win a regulated
deal — **route that deal to self-host.** Build the hosted planes only for the residency-wanting enterprise
segment where self-host is overkill.

---

## 4. Sequencing (what to do, in order)

1. **Now (both models):** ship the hosted **table-stakes docs** (privacy/ToS/DPA/sub-processor list) + a
   **one-session counsel posture** + the **self-host shared-responsibility matrix + evidence pack** (the
   two artifacts that unblock the most deals for the least effort).
2. **Wave-1 hosted:** register + appoint reps **only where a deal/entity triggers it**; run the **SOC 2/
   ISO** audit when an enterprise asks; stand up **af-south-1** when SA enterprise demand justifies it.
3. **Self-host P3/P4:** license UI, air-gap export, SCIM, support/SLA + air-gap patch — the polish that
   makes regulated/air-gapped deals closeable.
4. **Never:** pre-build in-country planes or blanket-register everywhere. Deal-gated, always.

---

## 5. Honest caveats
- **Not legal advice** — *(counsel)* items (registration triggers, local-rep, transfer validity,
  controller/processor status) need a lawyer per country before any customer commitment.
- **Self-host shifts but doesn't erase Actrone's duty** — you still owe secure software, timely CVEs, a
  truthful evidence pack, and a support SLA; a vulnerability in shipped software is still yours.
- **Don't over-claim** — the certification *machinery* is built, but a cert is only real once the **audit
  is run**; a residency region is only real once the **plane is Live**. Represent both honestly.

---

Last updated: 2026-07-21 | Owner: Matt | Companion to `Actrone_Africa_Launch_Readiness_Plan.md`,
`Actrone_Self_Hosting_Plan.md`, and `Actrone_Voice_Media_Gateway_Plan.md`.
