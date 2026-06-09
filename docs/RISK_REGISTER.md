# Risk Register — Inclufy Marketing

**Standard:** ISO/IEC 27001:2022 § 6.1.2 + § 8.2
**Owner:** Sami Loukile (CISO + DPO delegate)
**Effective:** 2026-06-09
**Review:** quarterly; or within 30 days of a material change (new product, new sub-processor, breach, regulatory change)
**Methodology:** STRIDE threat modelling + Likelihood × Impact (1–5 each)

This register implements the risk assessment + treatment process committed to in `docs/ISMS_POLICY.md` § D. The scope mirrors the ISMS scope: all Inclufy production apps + the supporting infrastructure.

---

## Scoring scale

| Score | Likelihood | Impact |
|---|---|---|
| 1 | Very rare (< 1 / 5y) | Negligible (no customer impact) |
| 2 | Rare (1 / 2-5y) | Minor (single-user inconvenience) |
| 3 | Occasional (1 / year) | Moderate (multi-user, recoverable) |
| 4 | Likely (1 / quarter) | Major (broad data exposure, recoverable) |
| 5 | Almost certain (monthly+) | Critical (regulatory + reputational) |

**Risk = Likelihood × Impact.** Scores ≥ 12 trigger immediate treatment.

Treatment options: **avoid** (don't run the activity) / **mitigate** (technical + organizational control) / **transfer** (insurance / contract clause) / **accept** (residual risk, with documented sign-off).

---

## Active risks (Q3 2026 review)

### R-01 — Account takeover via phishing

| | |
|---|---|
| **Asset** | Customer accounts (`auth.users`, `profiles`, OAuth tokens) |
| **Threat** | Spoofing — attacker steals credentials, signs in, exfiltrates content + impersonates customer |
| **Likelihood** | 4 — phishing attempts seen weekly; tied for #1 SaaS attack vector industry-wide |
| **Impact** | 4 — full read/write to the victim's workspace; recoverable via password reset + session revoke |
| **Inherent score** | **16** |
| **Treatment** | Mitigate (controls A.5.17 + A.8.5) |
| **Controls in place** | TOTP MFA (mandatory after policy bump 2026-Q3), recovery codes, biometric trust-this-device, AAL2 escalation in Settings, Sessions screen for revoke, suspicious-login alerts via Sentry |
| **Residual score** | 8 (likelihood drops to 2 — phishing succeeds only when MFA is bypassed) |
| **Owner** | Sami |
| **Acceptance** | Signed: Sami Loukile, 2026-06-09 |

### R-02 — Supabase service-role key compromise

| | |
|---|---|
| **Asset** | All multi-tenant data (every public table) |
| **Threat** | Information disclosure + tampering — anyone with the SR key bypasses RLS |
| **Likelihood** | 2 — stored in vault.secrets + macOS keychain; never committed; rotation policy quarterly |
| **Impact** | 5 — total platform compromise |
| **Inherent score** | **10** |
| **Treatment** | Mitigate (A.5.16 + A.8.2 + A.8.4) |
| **Controls in place** | Vault-stored, never in code, prefix-only in logs, quarterly rotation, GitHub/GitLab secret scanning, data-leak-hunter agent before every PR touching RLS |
| **Residual score** | 5 (likelihood drops to 1 with continued discipline) |
| **Owner** | Sami |
| **Acceptance** | Signed: Sami Loukile, 2026-06-09 |

### R-03 — OpenAI / Anthropic data exposure

| | |
|---|---|
| **Asset** | Free-text prompts entered by users (may include PII, customer lists, brand secrets) |
| **Threat** | Information disclosure to third-country sub-processor; risk of model-training inclusion |
| **Likelihood** | 3 — every AI feature call sends prompt to US-based vendor |
| **Impact** | 4 — multi-customer free-text exposure; recoverable via vendor deletion request |
| **Inherent score** | **12** |
| **Treatment** | Mitigate (A.5.19 + A.5.20 + A.5.34) |
| **Controls in place** | Per-user consent gate (`consents.scope='ai_processing'`), OpenAI Enterprise + Anthropic Standard API terms (no training on enterprise data), SCCs + DPA signed, AI features off by default for new users, prompt redaction for known PII patterns in `ai-call-log` retention |
| **Residual score** | 6 (impact drops to 2 — vendor cannot train; recoverable in 30 days via deletion API) |
| **Owner** | Sami |
| **Acceptance** | Signed: Sami Loukile, 2026-06-09 |

### R-04 — Insider misuse via privileged production access

| | |
|---|---|
| **Asset** | Customer data across all multi-tenant tables |
| **Threat** | Elevation of privilege + repudiation — staff accesses customer data without business need |
| **Likelihood** | 2 — only Sami has full production access today; freelancers scoped via time-bound delegated keys |
| **Impact** | 4 — multi-customer read exposure |
| **Inherent score** | **8** |
| **Treatment** | Mitigate (A.5.15 + A.5.18 + A.8.15) |
| **Controls in place** | `audit_logs` for sensitive ops, alerting on service_role-key usage, customer-notification within 7 days unless legally restricted, quarterly access review, freelancer NDA + ISMS acknowledgment |
| **Residual score** | 4 |
| **Owner** | Sami |
| **Acceptance** | Signed: Sami Loukile, 2026-06-09 |

### R-05 — Outbound webhook feedback loop / DDoS amplification

| | |
|---|---|
| **Asset** | Customer's own webhook endpoint + Inclufy edge function budget |
| **Threat** | Denial of service — flapping endpoint generates infinite retries; or attacker registers fake URL to exhaust budget |
| **Likelihood** | 3 — early production already saw httpbin.org/503 generate retry traffic during tests |
| **Impact** | 3 — customer endpoint may be over-loaded; Inclufy edge-fn budget consumed |
| **Inherent score** | **9** |
| **Treatment** | Mitigate (A.5.7 + A.5.10 + A.8.6) |
| **Controls in place** | Auto-pause after 10 dead-letters, 5-attempt retry ceiling with 30s→6h backoff, 25-concurrent batch limit, HTTPS-only URL validation at registration, dual-secret rotation (limits replay window) |
| **Residual score** | 3 |
| **Owner** | Sami |
| **Acceptance** | Signed: Sami Loukile, 2026-06-09 |

### R-06 — Stripe webhook spoofing → false billing state

| | |
|---|---|
| **Asset** | `subscriptions` + `invoices` tables; downstream feature-gating logic |
| **Threat** | Tampering — attacker forges a Stripe webhook to mark themselves as Pro-tier |
| **Likelihood** | 2 — Stripe signature verification active; endpoint URL not widely known |
| **Impact** | 4 — direct revenue impact + multi-customer feature unlock |
| **Inherent score** | **8** |
| **Treatment** | Mitigate (A.8.24 + A.8.28) |
| **Controls in place** | HMAC verification via official `stripe.webhooks.constructEvent`, 5-min replay window, Stripe-signed-event log retained 90 days for forensics |
| **Residual score** | 2 |
| **Owner** | Sami |
| **Acceptance** | Signed: Sami Loukile, 2026-06-09 |

### R-07 — Mobile-device loss / theft → unattended session

| | |
|---|---|
| **Asset** | The lost user's workspace + any cached offline data |
| **Threat** | Information disclosure + repudiation |
| **Likelihood** | 3 — phones get lost regularly; AMOS user base will hit this once per year |
| **Impact** | 3 — one workspace exposed; recoverable via Sessions screen sign-out-everywhere |
| **Inherent score** | **9** |
| **Treatment** | Mitigate (A.7.9 + A.8.1) |
| **Controls in place** | Biometric required to sign back into trust-this-device state, Sessions screen with sign-out-everywhere (shipped 2026-06-09), offline-cache MAX_AGE 24h auto-drop, mobile device password mandatory in onboarding |
| **Residual score** | 3 |
| **Owner** | Sami |
| **Acceptance** | Signed: Sami Loukile, 2026-06-09 |

### R-08 — Single-founder bus factor

| | |
|---|---|
| **Asset** | Operational continuity of the entire platform |
| **Threat** | Availability + supportability — Sami unavailable for >7d during a P0 |
| **Likelihood** | 2 — illness / family emergency |
| **Impact** | 5 — no second engineer with prod access today |
| **Inherent score** | **10** |
| **Treatment** | Mitigate (A.5.3 + A.5.29) — segregation of duties + business continuity |
| **Controls in place (partial)** | iCloud + Supabase PITR backups; freelance on-call backup contracted for emergencies; runbook docs/BREACH_RESPONSE_RUNBOOK.md |
| **Gap** | No second engineer with production access. **Planned: hire #2 engineer 2026-Q3.** |
| **Residual score** | 6 (drops to 3 after Q3 hire) |
| **Owner** | Sami |
| **Acceptance** | Signed: Sami Loukile, 2026-06-09 — acknowledged residual is above target until Q3 hire |

### R-09 — Sentry crash payloads sent to US (default region)

| | |
|---|---|
| **Asset** | Free-text breadcrumbs in crash reports — may contain PII the user typed before the crash |
| **Threat** | International transfer without adequacy / SCCs in active enforcement |
| **Likelihood** | 4 — every crash today |
| **Impact** | 2 — limited free-text; pseudo-anonymized user IDs |
| **Inherent score** | **8** |
| **Treatment** | Avoid (A.5.14 + A.5.23) |
| **Controls in place** | None today — Sentry SDK defaults to US org |
| **Gap** | EU DSN not yet provisioned. **Planned: provision Sentry EU DSN within 30 days; pin via `region:'eu'` in `sentry.ts`.** |
| **Residual score** | 2 once EU pinned |
| **Owner** | Sami |
| **Acceptance** | Open — flagged in `docs/GDPR_AUDIT_2026-05-14.md` § 6 and `docs/ISMS_POLICY.md` § J |

### R-10 — Stale freelancer access after engagement ends

| | |
|---|---|
| **Asset** | Customer data, source code |
| **Threat** | Elevation of privilege via lingering tokens |
| **Likelihood** | 2 — current freelance roster is small; tokens manually rotated |
| **Impact** | 4 — read access to recent customer data |
| **Inherent score** | **8** |
| **Treatment** | Mitigate (A.6.5) |
| **Controls in place** | Offboarding checklist; manual revoke of Supabase Management API API-keys; GitHub/GitLab access revoked same-day |
| **Gap** | No automated stale-access scanner. |
| **Residual score** | 4 |
| **Owner** | Sami |
| **Acceptance** | Signed: Sami Loukile, 2026-06-09 |

---

## Summary

| Risk ID | Inherent | Residual | Treatment status |
|---|---:|---:|---|
| R-01 phishing | 16 | 8 | mitigated |
| R-02 SR key | 10 | 5 | mitigated |
| R-03 AI vendor | 12 | 6 | mitigated |
| R-04 insider | 8 | 4 | mitigated |
| R-05 webhook feedback | 9 | 3 | mitigated |
| R-06 Stripe spoof | 8 | 2 | mitigated |
| R-07 mobile theft | 9 | 3 | mitigated |
| R-08 bus factor | 10 | 6 | partially mitigated — hire Q3 |
| R-09 Sentry US | 8 | 2 | **open — fix within 30d** |
| R-10 stale freelancer | 8 | 4 | mitigated |

**Total residual risk:** 43 (down from 98 inherent). No residual ≥ 12. Two items above accepted-target (R-08 + R-09); both have committed delivery dates.

## Review log

| Date | Reviewer | Outcome |
|---|---|---|
| 2026-06-09 | Sami | Initial register. 10 risks identified, 8 fully mitigated, 2 with open delivery commitments. |
