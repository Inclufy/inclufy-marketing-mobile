# Information Security Management System (ISMS) — Inclufy

**Standard:** ISO/IEC 27001:2022
**Scope:** All Inclufy production apps (Marketing/AMOS, Finance, ProjeXtPal, Academy, Ignite, Hub, Connect) and the supporting infrastructure (Supabase, Cloudflare, Resend, OpenAI/Anthropic, Stripe).
**Approved by:** Sami Loukile, founder & CTO
**Effective:** 2026-06-09
**Review:** annual; or within 30 days of any significant change (new product, new sub-processor, breach, regulatory change).

This is an ISMS Lite — proportionate to an early-stage SaaS. It does NOT
claim ISO 27001 certification. It DOES provide the policy baseline an
external auditor needs to begin a Stage 1 gap assessment.

---

## A. ISMS scope & boundaries

**Included:**
- All Inclufy SaaS products and their data stores
- The shared Supabase projects (Marketing `mpxkugfqzmxydxnlxqoj`, Finance `nruqfegrngpzoigflexn`)
- The marketing.inclufy.com web SPA + AMOS mobile (iOS/Android via TestFlight + Play Store)
- All edge functions deployed under `supabase/functions/`
- All third parties handling Inclufy data (sub-processor register `docs/DPA_SUBPROCESSORS.md`)

**Excluded:**
- Personal devices of customers (out of scope — covered by their own controls)
- The customer's own infrastructure (out of scope — their controls)
- Marketing website static content not handling personal data

## B. Information security objectives

| # | Objective | Metric | Target |
|---|---|---|---|
| 1 | Maintain confidentiality of personal data | Number of data breaches | 0 reportable breaches per year |
| 2 | Maintain integrity of customer content | Successful unauthorized writes | 0 |
| 3 | Maintain availability of paid services | Uptime per quarter (per `/status`) | 99.5% |
| 4 | Detect security incidents within 24h | Mean time to detect | ≤ 24h |
| 5 | Resolve P0 vulnerabilities within 7 days | MTTR on P0 | ≤ 7 days |
| 6 | Train all staff on security annually | % of staff with completed training | 100% |

Reviewed quarterly; reported to founder.

## C. Roles & responsibilities

| Role | Person | Responsibility |
|---|---|---|
| **CISO** | Sami Loukile | Owns this ISMS; approves all security policies; sign-off on access exceptions. |
| **DPO** | privacy@inclufy.com (Sami delegate) | GDPR compliance, data subject requests, breach reporting to AP. |
| **On-call engineer** | Sami + freelance backup | First responder to incidents; runs the breach runbook. |
| **Sub-processor manager** | Sami | Maintains the sub-processor register, approves new vendors. |
| **All staff (incl. freelancers)** | — | Follow this policy; report incidents within 4h. |

## D. Risk assessment & treatment

Annual risk register maintained as `docs/RISK_REGISTER.md` (TODO — next milestone). Methodology:
1. List assets (data + code + infrastructure)
2. Identify threats per asset (STRIDE: Spoofing, Tampering, Repudiation, Info-disclosure, DoS, Elevation)
3. Score Likelihood × Impact (1–5 each)
4. Treat: accept / mitigate / transfer / avoid
5. Document residual risk and risk-owner acceptance

Top 5 identified risks (preliminary):
1. **Account takeover via phishing** — mitigate with mandatory MFA (controls A.5.17 + A.8.5)
2. **Supabase key compromise** — mitigate with vault.secrets + rotation policy (A.5.16)
3. **OpenAI/Anthropic data exposure** — mitigate with consent gate + zero-retention enterprise terms (A.5.34)
4. **Insider misuse via service_role key** — mitigate with audit logs + alerting on usage (A.8.15)
5. **DDoS via webhook flood-back** — mitigate with auto-pause after 10 dead-letters + rate limits (A.5.7 + A.5.10)

## E. Access control policy (A.5.15 / A.5.16 / A.5.18 / A.8.3)

- **Principle of least privilege** applied to all systems.
- **MFA mandatory** for all production access (Supabase dashboard, Stripe, Resend, GitHub/GitLab, Apple/Google developer accounts).
- **Service-role keys** stored only in vault.secrets or 1Password — never in code, env files committed to repos, or chat messages.
- **Production database access:**
  - Sami (full)
  - Time-bound delegation via Management API API-keys with `reveal=true` ONLY when on-call
  - All queries via Management API or psql leave a server-side log (Supabase audit)
- **Customer-data access** by staff requires an explicit ticket with reason + customer notification within 7 days unless legally restricted.
- **Quarterly access review** — Sami audits who has which keys, deletes stale ones.

## F. Asset management (A.5.9 / A.5.10 / A.5.13)

| Asset class | Inventory location | Owner |
|---|---|---|
| Source code | GitHub + GitLab + macOS local | Sami |
| Production DB | Supabase dashboard | Sami |
| Secrets | 1Password + Supabase vault + macOS keychain | Sami |
| Devices | macOS laptop (FileVault on), iOS phone, Mac Studio | Sami |
| Sub-processors | `docs/DPA_SUBPROCESSORS.md` | Sami |
| Data classifications | `docs/ROPA.md` | Sami |

Acceptable Use Policy (A.5.10): no personal email forwarding of customer data; no copying production data to personal cloud; no storage of customer data on devices without disk encryption.

## G. Cryptography (A.8.24)

- **At rest:** Supabase Postgres + Storage encrypted by AWS KMS (AES-256). FileVault on workstation. Apple/Google native encryption on mobile.
- **In transit:** TLS 1.2+ everywhere. HSTS preload enabled on inclufy.com. mTLS internally where supported.
- **Application secrets:** stored in Supabase vault (pgsodium-backed). Customer webhook secrets — 32 random bytes hex, dual-rotation supported.
- **Password storage:** Argon2id via Supabase Auth.
- **API keys (`sk_inclufy_*`)**: SHA-256 hash stored; plain shown ONCE on mint.
- **Webhook signing:** HMAC-SHA256 with `v1=` versioned signature.

## H. Physical security (A.7)

Inclufy is fully remote. Physical security delegated to:
- Supabase / AWS for data center
- Apple/Google for app stores
- Cloudflare for edge
- Sami's home office (locked door, alarm) for workstations

## I. Operations security (A.8.7 / A.8.8 / A.8.15 / A.8.16)

- **Patching:** auto-updates enabled on macOS, iOS, browsers. Supabase Postgres + Auth patches applied by vendor. Node deps refreshed monthly via Dependabot/Renovate (TODO — verify enabled).
- **Vulnerability scanning:** GitHub/GitLab native dependency alerts. `npm audit` weekly via CI.
- **Logging:** every edge fn emits structured logs; audit_logs table for sensitive ops; Sentry for crashes (EU pinned — verify after EU DSN provisioned).
- **Anti-malware:** macOS XProtect + Gatekeeper. No Windows endpoints.
- **Capacity:** monitored via Supabase dashboard. Scaling = vendor-managed.

## J. Communications security (A.8.20 / A.8.21 / A.8.22)

- **Network segmentation:** Supabase enforces per-project tenant isolation. RLS enforces per-org tenant isolation within a project.
- **DNS:** managed by Cloudflare; DNSSEC enabled.
- **Email:** SPF + DKIM + DMARC fully aligned on inclufy.com.
- **Messaging:** internal comms via 1:1 Slack/Signal; never customer data over personal channels.

## K. Acquisition & development (A.8.25 / A.8.26 / A.8.28 / A.8.29)

- **Secure development:** code review on every PR touching auth/RLS/edge-fn (currently 1-eye for solo founder; 2-eye when freelancer involved).
- **Static analysis:** TypeScript strict mode; ESLint; Supabase RLS lint via data-leak-hunter agent.
- **Dependency review:** `npm audit` before each release; SBOM (TODO — add `cyclonedx-npm` to CI).
- **Test data:** never copy production data into dev/test; use seeded synthetic data.
- **Outsourced development:** any freelancer signs NDA + this ISMS acknowledgment before access.

## L. Supplier relationships (A.5.19 / A.5.20 / A.5.21 / A.5.22)

- All sub-processors listed in `docs/DPA_SUBPROCESSORS.md`.
- DPA signed with every sub-processor handling personal data.
- Annual review of sub-processor security posture (SOC 2 reports requested where available — Supabase, Stripe, Resend confirmed).
- 30-day customer notification before adding a new sub-processor.

## M. Incident management (A.5.24 / A.5.25 / A.5.26 / A.5.27 / A.5.28 / A.5.29)

- **Runbook:** `docs/BREACH_RESPONSE_RUNBOOK.md`.
- **Escalation tree:** founder (Sami) → DPO (same person, separate role) → AP (within 72h if reportable breach) → affected users (if high risk).
- **Forensics:** preserve audit_logs, edge-fn logs, Sentry events for 1 year after incident close.
- **Lessons learned:** post-mortem within 14 days; action items tracked in `product_issues` with `tag = post-mortem`.

## N. Business continuity (A.5.29 / A.5.30)

- **Backups:** Supabase PITR enabled (max 7 days). Daily logical dump cron (TODO — verify the data-guardian agent's schedule is active).
- **Off-site backups:** iCloud nightly dump (consumer iCloud — works for now, plan to move to dedicated EU S3 by 2026-Q4).
- **RTO** (Recovery Time Objective): 4 hours.
- **RPO** (Recovery Point Objective): 24 hours.
- **DR drill:** annually — first scheduled for 2026-12.

## O. Compliance (A.5.31 / A.5.32 / A.5.33 / A.5.34 / A.5.35 / A.5.36)

- **Legal register:** GDPR/AVG (EU), ePrivacy Directive, Dutch BW (B2B), Dutch fiscal law (7y retention).
- **Documentation:** RoPA `docs/ROPA.md`, DPA `docs/DPA_SUBPROCESSORS.md`, breach runbook `docs/BREACH_RESPONSE_RUNBOOK.md`, this ISMS, SoA `docs/ISO27001_SOA.md`.
- **Independent audit:** none currently. Plan: SOC 2 Type I observation period starting 2026-Q4.
- **Customer DPA:** standard template available on request via privacy@inclufy.com.

## P. Training & awareness (A.6.3)

- All staff (incl. freelancers) read this ISMS within 14 days of access grant.
- Annual phishing-awareness exercise (TODO).
- Security alerts shared in #security Slack channel (TODO — create channel + invite freelancers).

## Q. Documented review

| Section | Last reviewed | Next review | Owner |
|---|---|---|---|
| Whole ISMS | 2026-06-09 | 2027-06-09 | Sami |
| RoPA | 2026-06-09 | 2026-12-09 | Sami |
| Sub-processor register | 2026-05-24 | 2026-08-24 | Sami |
| Breach runbook | 2026-05-14 | 2026-11-14 | Sami |
| SoA | 2026-06-09 | 2027-06-09 | Sami |
| Risk register | TODO (target 2026-07-01) | quarterly thereafter | Sami |

---

*This document is a living policy. Material changes are recorded in
the repo's git history; the "Last reviewed" header is updated on every
formal review.*
