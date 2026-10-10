# SOC 2 Type II Readiness Checklist

> **Status refreshed 2026-07-13 (code-verified):** This static checklist (last content update
> 2026-05-20) is now **superseded as the authoritative source** by a live, code-driven system:
> `backend/orchestrator/internal/compliance/` — a 16-control catalog (`catalog.go`) mapped to
> SOC 2 **and** ISO 27001/27701/27018 **and** 5 data-protection laws (GDPR/POPIA/NDPA/PIPEDA/CCPA),
> an evidence engine (`evidence.go`, 4 controls with real runtime collectors, the rest honestly
> labelled `configuration`/`attestation`), and a public trust center (`trust.go`) — served live at
> `GET /v1/compliance/frameworks` (authenticated) and `GET /v1/trust` (public, unauthenticated).
> See `Actrone_Certification_Track_Plan.md` (a doc this same audit pass also refreshed) for the
> full status. This file remains useful as **historical narrative and a human-readable snapshot**
> of the SOC 2-specific controls, and its per-control statuses were spot-checked against the live
> catalog's honest `implemented`/`partial`/`planned` verdicts and are still broadly consistent
> (e.g. incident-response and vendor-management are `partial` in both; a formal risk register /
> ISMS policy set is `planned` in the catalog, consistent with this file's CC3/CC9.2/BCP caveats)
> — but for anything customer-facing, prefer the live endpoints, not this file, since they are
> the ones that are continuously verified rather than manually maintained.
>
> **Status:** In progress — 8/9 controls implemented  
> **Target audit date:** TBD  
> **Last updated:** 2026-05-20

---

## Trust Service Criteria

### Security (CC6 — Logical and Physical Access)

| Control | ID | Status | Implementation |
|---|---|---|---|
| Access controls | CC6.1 | ✅ Implemented | API key (SHA-256 hashed) + RS256 JWT; tenant isolation on all DB queries |
| Credential management | CC6.2 | ✅ Implemented | API key rotation, revocation, usage tracking (`api_keys` table) |
| Least privilege | CC6.3 | ✅ Implemented | Tenant-scoped queries; no cross-tenant access; no wildcard permissions |
| Encryption in transit | CC6.6 | ✅ Implemented | TLS 1.2+ required; HSTS headers; mTLS for internal services |
| Encryption at rest | CC6.7 | ⚠️ Partial | DB encryption via cloud provider (AWS RDS); application-level encryption pending |

### Security (CC7 — System Operations)

| Control | ID | Status | Implementation |
|---|---|---|---|
| Vulnerability management | CC7.1 | ✅ Implemented | `govulncheck`, `pip-audit`, `npm audit` in CI; blocks on HIGH/CRITICAL |
| System monitoring | CC7.2 | ✅ Implemented | `access_audit_log` table; every authenticated API call recorded |
| Anomaly detection | CC7.3 | ⚠️ Partial | Prometheus alerting on error rate; per-IP rate limiting; ML anomaly detection pending |
| Incident response | CC7.4 | ⚠️ Partial | Runbook required; Slack/PagerDuty webhooks via alert rules |

### Security (CC8 — Change Management)

| Control | ID | Status | Implementation |
|---|---|---|---|
| Authorised changes only | CC8.1 | ✅ Implemented | All changes via PR + review; CI gates (lint, test, security, build, contract) |
| Change documentation | CC8.1 | ✅ Implemented | `CHANGELOG.md`; conventional commits; PR descriptions |

### Security (CC9 — Risk Mitigation)

| Control | ID | Status | Implementation |
|---|---|---|---|
| Vendor risk | CC9.1 | ✅ Implemented | Dependency pinning (go.sum, uv.lock, package-lock.json); supply-chain scanning |
| Business continuity | CC9.2 | ⚠️ Partial | Temporal durable workflows for task resilience; multi-AZ RDS; formal BCP pending |

### Availability (A1)

| Control | ID | Status | Implementation |
|---|---|---|---|
| Capacity planning | A1.1 | ✅ Implemented | HPA in Kubernetes; Prometheus metrics; cost kill-switch |
| Uptime monitoring | A1.2 | ✅ Implemented | `/health/live` + `/health/ready`; Grafana SLO dashboards |

### Processing Integrity (PI1)

| Control | ID | Status | Implementation |
|---|---|---|---|
| Complete processing | PI1.1 | ✅ Implemented | Temporal durable workflows; idempotency keys on all writes; Merkle-chained violation ledger |

### Confidentiality (C1)

| Control | ID | Status | Implementation |
|---|---|---|---|
| Confidential data handling | C1.1 | ✅ Implemented | Tenant isolation; TLS; no secrets in code (`gitleaks` pre-commit); scrubbed logs |

### Privacy (P1–P8)

| Control | ID | Status | Implementation |
|---|---|---|---|
| Privacy notice | P1.1 | ⚠️ Partial | Data residency config, DSR lifecycle — privacy policy page pending |
| Choice and consent | P3.1 | ✅ Implemented | GDPR/POPIA governance policy packs; PII scanner blocks non-consensual data |
| Data access | P5.1 | ✅ Implemented | `GET /v1/privacy/export` — data portability |
| Data erasure | P5.2 | ✅ Implemented | `DELETE /v1/privacy/erase` — right to erasure; Qdrant namespace purge |
| Data retention | P6.1 | ✅ Implemented | Per-tenant retention policies; background purge service |
| Data subject requests | P8.1 | ✅ Implemented | DSR lifecycle: submit → in_progress → completed/denied; 30-day SLA tracking |

---

## Evidence Collection Checklist

Items required for an actual SOC 2 Type II audit:

- [ ] 12 months of access audit log exports (`GET /v1/compliance/access-log`)
- [ ] Change management evidence: PR history, CI build logs
- [ ] Vulnerability scan reports: `govulncheck` + `pip-audit` + `npm audit` outputs
- [ ] Incident response log (if any incidents occurred)
- [ ] Employee security training records
- [ ] Vendor assessment questionnaires (OpenAI, Anthropic, AWS, Temporal Cloud)
- [ ] Penetration test report (annual minimum)
- [ ] Business continuity plan (BCP) document
- [ ] Privacy policy published at `actrone.com/legal/privacy`
- [ ] Data Processing Agreements (DPAs) signed with all sub-processors

---

## GDPR / POPIA Compliance Status

| Requirement | Article | Status | Notes |
|---|---|---|---|
| Lawful basis for processing | GDPR Art. 6 | ✅ | API key authentication establishes contractual basis |
| Purpose limitation | GDPR Art. 5(1)(b) | ✅ | Agent-File declares purpose; governance policy enforces it |
| Data minimisation | GDPR Art. 5(1)(c) | ✅ | `pii_scanner` CRITICAL rule blocks excessive PII |
| Storage limitation | GDPR Art. 5(1)(e) | ✅ | Per-tenant retention policies; background purge service |
| Right to access | GDPR Art. 15 | ✅ | `GET /v1/privacy/export` |
| Right to erasure | GDPR Art. 17 | ✅ | `DELETE /v1/privacy/erase`; Qdrant namespace purge |
| Data portability | GDPR Art. 20 | ✅ | `GET /v1/privacy/export` in JSON format |
| DSR 30-day SLA | GDPR Art. 12 | ✅ | `deadline_at` tracked; overdue count in compliance summary |
| DPA with sub-processors | GDPR Art. 28 | ⚠️ | Template at `/legal/dpa`; must be signed per customer |
| Data breach notification | GDPR Art. 33 | ⚠️ | Alert rules can trigger webhook; 72h notification process TBD |
| POPIA — Purpose specification | POPIA S13 | ✅ | `popia` governance policy pack |
| POPIA — Information officer | POPIA S55 | ⚠️ | Configurable via `PUT /v1/privacy/residency` |
| FSCA — TCF | FSCA TCF | ✅ | `fsca` governance policy pack |

---

## Next Steps to SOC 2 Type II

1. **Select an auditor** — choose a CPA firm with cloud SaaS SOC 2 experience (e.g. Vanta, Secureframe, or direct with a Big 4 firm)
2. **Enable Vanta/Drata** — connect cloud infrastructure for continuous control monitoring
3. **Write the BCP** — document recovery time objectives (RTO) and recovery point objectives (RPO)
4. **Penetration test** — engage an external pen tester; remediate findings
5. **Publish Privacy Policy** — required for P1.1 control
6. **Sign sub-processor DPAs** — OpenAI, Anthropic, Qdrant Cloud, Temporal Cloud, AWS
7. **Begin observation period** — SOC 2 Type II requires 6–12 months of evidence
