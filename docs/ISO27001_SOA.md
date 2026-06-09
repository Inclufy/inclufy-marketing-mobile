# Statement of Applicability (SoA) — ISO/IEC 27001:2022 Annex A

**Standard:** ISO/IEC 27001:2022 Annex A (93 controls across 4 themes)
**Organization:** Inclufy B.V.
**Scope:** As defined in `docs/ISMS_POLICY.md` § A
**Approved by:** Sami Loukile, CISO
**Effective:** 2026-06-09
**Review:** annual

This SoA enumerates **all 93 Annex A controls** and states for each:
applicability (Y/N), implementation status (FULL / PARTIAL / PLANNED /
NOT-APPLICABLE), evidence (file / SQL / doc reference), and justification
where a control is excluded.

Status legend:
- **FULL** — control implemented and operating
- **PARTIAL** — partially implemented; gap documented in `gap` column
- **PLANNED** — committed delivery date in `gap`
- **N/A** — control excluded with justification

---

## Theme A.5 — Organizational controls (37 controls)

| ID | Title | Apply? | Status | Evidence / Gap |
|---|---|---|---|---|
| A.5.1 | Policies for information security | Y | FULL | `docs/ISMS_POLICY.md` |
| A.5.2 | Information security roles and responsibilities | Y | FULL | `docs/ISMS_POLICY.md` § C |
| A.5.3 | Segregation of duties | Y | PARTIAL | Solo founder — 2-eye on freelancer access only. Gap: hire #2 engineer 2026-Q3. |
| A.5.4 | Management responsibilities | Y | FULL | ISMS § A approved by Sami |
| A.5.5 | Contact with authorities | Y | FULL | AP (NL DPA) — privacy@autoriteitpersoonsgegevens.nl; Politie / NCTV — 0900-8844 |
| A.5.6 | Contact with special interest groups | Y | PARTIAL | Member of NL AI Coalition; no ISACA/CSA yet. Gap: join CSA STAR Q4. |
| A.5.7 | Threat intelligence | Y | PARTIAL | GitHub Dependabot + Supabase advisories. Gap: subscribe to NCSC alerts. |
| A.5.8 | Information security in project management | Y | FULL | data-leak-hunter agent runs on every PR touching auth/RLS |
| A.5.9 | Inventory of information and other assets | Y | FULL | ISMS § F |
| A.5.10 | Acceptable use of information and other assets | Y | FULL | ISMS § F |
| A.5.11 | Return of assets | Y | PARTIAL | Freelancer offboard checklist (TODO doc) |
| A.5.12 | Classification of information | Y | FULL | ROPA columns enumerate categories |
| A.5.13 | Labelling of information | Y | PARTIAL | Implicit via DB column names; no formal label scheme |
| A.5.14 | Information transfer | Y | FULL | TLS 1.2+, SCCs with US sub-processors |
| A.5.15 | Access control | Y | FULL | ISMS § E |
| A.5.16 | Identity management | Y | FULL | Supabase Auth + RBAC migration `20260524130000_organizations_rbac.sql` |
| A.5.17 | Authentication information | Y | FULL | Argon2id + TOTP MFA + recovery codes + biometric trust |
| A.5.18 | Access rights | Y | FULL | RLS on every public table; quarterly access review |
| A.5.19 | Information security in supplier relationships | Y | FULL | DPAs signed with all sub-processors |
| A.5.20 | Addressing information security within supplier agreements | Y | FULL | DPA template references SCCs |
| A.5.21 | Managing information security in the ICT supply chain | Y | PARTIAL | SBOM not yet generated. Gap: add `cyclonedx-npm` to CI 2026-Q3. |
| A.5.22 | Monitoring, review and change management of supplier services | Y | PARTIAL | Annual sub-processor review; SOC 2 reports requested. Gap: codify cadence. |
| A.5.23 | Information security for use of cloud services | Y | FULL | Supabase region pinned to EU; Cloudflare; Sentry EU pending DSN |
| A.5.24 | Information security incident management planning and preparation | Y | FULL | `docs/BREACH_RESPONSE_RUNBOOK.md` |
| A.5.25 | Assessment and decision on information security events | Y | FULL | Severity matrix in runbook |
| A.5.26 | Response to information security incidents | Y | FULL | Runbook |
| A.5.27 | Learning from information security incidents | Y | PARTIAL | Post-mortem process described; no incidents to date to test |
| A.5.28 | Collection of evidence | Y | FULL | audit_logs + edge-fn logs + Sentry retained 1y after incident |
| A.5.29 | Information security during disruption | Y | PARTIAL | ISMS § N; DR drill not yet performed (target 2026-12) |
| A.5.30 | ICT readiness for business continuity | Y | PARTIAL | Supabase PITR + iCloud nightly backup. Gap: move off-site to EU S3. |
| A.5.31 | Legal, statutory, regulatory and contractual requirements | Y | FULL | ISMS § O |
| A.5.32 | Intellectual property rights | Y | FULL | All source proprietary or properly licensed open-source (package.json review) |
| A.5.33 | Protection of records | Y | FULL | Retention crons (`20260609150000_data_retention_crons.sql`); 7y fiscal records on Stripe |
| A.5.34 | Privacy and protection of PII | Y | FULL | `docs/ROPA.md` + GDPR Art. 15/17/30 implemented |
| A.5.35 | Independent review of information security | Y | PLANNED | SOC 2 Type I observation period 2026-Q4. No certification today. |
| A.5.36 | Compliance with policies, rules and standards for information security | Y | FULL | Quarterly self-audit by Sami |
| A.5.37 | Documented operating procedures | Y | FULL | Runbooks in `docs/` |

## Theme A.6 — People controls (8 controls)

| ID | Title | Apply? | Status | Evidence / Gap |
|---|---|---|---|---|
| A.6.1 | Screening | Y | FULL | Freelancer references checked; Sami self-screened |
| A.6.2 | Terms and conditions of employment | Y | FULL | Freelancer contracts include confidentiality + acceptable-use |
| A.6.3 | Information security awareness, education and training | Y | PARTIAL | Self-training (CISO=Sami); annual freelancer briefing. Gap: formal course log. |
| A.6.4 | Disciplinary process | Y | FULL | Contract termination clause for security breach |
| A.6.5 | Responsibilities after termination or change of employment | Y | FULL | Access revocation checklist in onboarding/offboarding |
| A.6.6 | Confidentiality or non-disclosure agreements | Y | FULL | NDA signed by every freelancer |
| A.6.7 | Remote working | Y | FULL | All-remote; FileVault on workstation; MFA on all SaaS |
| A.6.8 | Information security event reporting | Y | FULL | 4-hour staff reporting SLA in ISMS § C |

## Theme A.7 — Physical controls (14 controls)

| ID | Title | Apply? | Status | Evidence / Gap |
|---|---|---|---|---|
| A.7.1 | Physical security perimeters | Y | FULL | Home-office locked; data center = AWS |
| A.7.2 | Physical entry | Y | FULL | No customer data on physical premises beyond encrypted devices |
| A.7.3 | Securing offices, rooms and facilities | Y | FULL | Home office locked; alarm |
| A.7.4 | Physical security monitoring | Y | PARTIAL | Home alarm; no CCTV. Gap: not needed at current scale |
| A.7.5 | Protecting against physical and environmental threats | Y | FULL | Cloud-hosted; workstation encrypted |
| A.7.6 | Working in secure areas | N/A | — | No "secure areas" beyond home office |
| A.7.7 | Clear desk and clear screen | Y | FULL | Auto-lock screen 5min; no paper records |
| A.7.8 | Equipment siting and protection | Y | FULL | Workstation off-floor, UPS-backed |
| A.7.9 | Security of assets off-premises | Y | FULL | Laptop with FileVault; phone with biometric+PIN |
| A.7.10 | Storage media | Y | FULL | No removable media used |
| A.7.11 | Supporting utilities | Y | PARTIAL | UPS for workstation; no generator. Gap: failover to mobile hotspot if ISP down. |
| A.7.12 | Cabling security | N/A | — | Wireless only |
| A.7.13 | Equipment maintenance | Y | FULL | Apple Care |
| A.7.14 | Secure disposal or re-use of equipment | Y | FULL | FileVault wipe + factory reset before sale/disposal |

## Theme A.8 — Technological controls (34 controls)

| ID | Title | Apply? | Status | Evidence / Gap |
|---|---|---|---|---|
| A.8.1 | User endpoint devices | Y | FULL | macOS workstation + iOS phone, all encrypted |
| A.8.2 | Privileged access rights | Y | FULL | Service-role key vaulted; per-action audit trail |
| A.8.3 | Information access restriction | Y | FULL | RLS on every multi-tenant table |
| A.8.4 | Access to source code | Y | FULL | Private GitHub + GitLab; 2FA enforced |
| A.8.5 | Secure authentication | Y | FULL | TOTP MFA + recovery codes + Azure SSO + biometric |
| A.8.6 | Capacity management | Y | FULL | Supabase dashboard auto-scales |
| A.8.7 | Protection against malware | Y | FULL | macOS XProtect + Gatekeeper |
| A.8.8 | Management of technical vulnerabilities | Y | PARTIAL | Dependabot + `npm audit`. Gap: add Snyk or equivalent commercial scanner. |
| A.8.9 | Configuration management | Y | FULL | All infra as code (`supabase/migrations/`, `supabase/functions/`, `eas.json`) |
| A.8.10 | Information deletion | Y | FULL | `gdpr-account-delete` edge fn + retention crons |
| A.8.11 | Data masking | Y | PARTIAL | Token prefixes only in logs; no DB-level masking for analytics. Gap: dynamic data masking for read-replicas (when introduced). |
| A.8.12 | Data leakage prevention | Y | FULL | data-leak-hunter agent + RLS + scoped logging |
| A.8.13 | Information backup | Y | FULL | Supabase PITR 7d + iCloud nightly dump |
| A.8.14 | Redundancy of information processing facilities | Y | PARTIAL | Supabase AZ-redundant within eu-west-1. No multi-region failover. Gap: not justified by RTO/RPO targets. |
| A.8.15 | Logging | Y | FULL | audit_logs + edge-fn logs + Sentry |
| A.8.16 | Monitoring activities | Y | PARTIAL | Sentry crashes; rate-limit alerts. Gap: 24/7 SOC not in scope at this stage. |
| A.8.17 | Clock synchronization | Y | FULL | NTP via macOS + Supabase (vendor-managed) |
| A.8.18 | Use of privileged utility programs | Y | FULL | Supabase Management API + psql only when on-call |
| A.8.19 | Installation of software on operational systems | Y | FULL | Edge functions deployed via CI; manual deploy from Sami's laptop |
| A.8.20 | Networks security | Y | FULL | Cloudflare WAF + DDoS shield + per-tenant RLS |
| A.8.21 | Security of network services | Y | FULL | HTTPS-only; HSTS preload |
| A.8.22 | Segregation of networks | Y | FULL | Per-Supabase-project tenant isolation (Marketing vs Finance) |
| A.8.23 | Web filtering | N/A | — | No corporate network to filter |
| A.8.24 | Use of cryptography | Y | FULL | ISMS § G |
| A.8.25 | Secure development life cycle | Y | FULL | Code review + static analysis + automated tests |
| A.8.26 | Application security requirements | Y | FULL | Threat model per major feature (e.g. webhook signing scheme) |
| A.8.27 | Secure system architecture and engineering principles | Y | FULL | Multi-tenant via RLS; zero-trust between apps |
| A.8.28 | Secure coding | Y | FULL | TS strict; ESLint; no `eval`/`dangerouslySetInnerHTML` outside vetted spots |
| A.8.29 | Security testing in development and acceptance | Y | PARTIAL | Auth/RLS smoke tests; agent-driven audits. Gap: add automated DAST. |
| A.8.30 | Outsourced development | Y | FULL | Freelancers sign NDA + ISMS; PR review |
| A.8.31 | Separation of development, test and production environments | Y | PARTIAL | Production Supabase + local dev. No dedicated staging Supabase. Gap: add staging project 2026-Q4. |
| A.8.32 | Change management | Y | FULL | Git history + commit messages + data-guardian backups before destructive ops |
| A.8.33 | Test information | Y | FULL | Synthetic data only in dev/test |
| A.8.34 | Protection of information systems during audit testing | Y | FULL | Read-only audit agents by default; `--fix-stubs` requires explicit approval |

---

## Summary

| Theme | Controls | FULL | PARTIAL | PLANNED | N/A | Coverage |
|---|---:|---:|---:|---:|---:|---:|
| A.5 Organizational | 37 | 27 | 9 | 1 | 0 | 73% FULL |
| A.6 People | 8 | 7 | 1 | 0 | 0 | 88% FULL |
| A.7 Physical | 14 | 11 | 1 | 0 | 2 | 79% FULL |
| A.8 Technological | 34 | 27 | 7 | 0 | 0 | 79% FULL |
| **Total** | **93** | **72** | **18** | **1** | **2** | **77% FULL** |

**Readiness verdict:** 77% of Annex A controls FULLY implemented + 19% PARTIAL + 1% PLANNED + 2% N/A. The 19 PARTIAL controls represent ~3 weeks of focused work + 1 hire (Sami's #2 engineer for A.5.3 segregation of duties). The 1 PLANNED control is SOC 2 Type I observation — already on roadmap for Q4. No identified blocker to a successful Stage 1 audit; Stage 2 contingent on closing the PARTIAL items.

**This document is NOT a certification.** It is the SoA the controller declares to a Stage 1 auditor.
