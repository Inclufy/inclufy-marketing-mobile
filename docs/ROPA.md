# Records of Processing Activities (RoPA) — Inclufy Marketing

**GDPR Art. 30 — Records of Processing Activities.**
**Controller:** Inclufy B.V., NL
**DPO contact:** privacy@inclufy.com
**Last reviewed:** 2026-06-09
**Review cadence:** every 6 months OR within 30 days of any new processing activity / sub-processor / lawful basis.

This register lists EVERY processing activity in the Inclufy Marketing
platform (web SPA `marketing.inclufy.com` + AMOS mobile app + the shared
Supabase project `mpxkugfqzmxydxnlxqoj`). Each row is auditable against
the published privacy policy, sub-processor list, and source code.

Sister registers in other Inclufy products (Finance, ProjeXtPal) follow
the same template but live in those repos.

---

## 1. Account & authentication

| Field | Value |
|---|---|
| **Purpose** | Identify and authenticate users; allow them to use the service they signed up for. |
| **Lawful basis** | GDPR Art. 6(1)(b) — performance of a contract. |
| **Data subjects** | Registered users (workspace owners, admins, members). |
| **Data categories** | Email, password hash, optional full name, optional avatar URL, OAuth tokens for social/Microsoft SSO. |
| **Source tables** | `auth.users`, `public.profiles`, `public.organization_members`, `public.user_sessions`, `auth.mfa_factors`, `public.oauth_tokens`. |
| **Retention** | Until account deletion + 30-day grace + best-effort `audit_logs` retained 1 year. After grace: anonymized profile shell, ban_duration ~100y on auth.users. |
| **Recipients (internal)** | Inclufy founders + on-call engineers. |
| **Recipients (sub-processors)** | Supabase (EU, AWS eu-west-1) — DB & auth hosting. |
| **International transfers** | None for credentials themselves. SSO tokens transit to Microsoft (US) under Microsoft DPA + SCCs. |
| **Security measures** | Argon2id password hash (Supabase Auth default), TOTP MFA, recovery codes, biometric trust-this-device, AAL2 escalation, RLS on every row. |

## 2. Social-account linking & publishing

| Field | Value |
|---|---|
| **Purpose** | Let the user publish content from Inclufy to their own LinkedIn / Meta / TikTok / Pinterest / Threads / X account. |
| **Lawful basis** | Art. 6(1)(b) contract + Art. 6(1)(a) explicit consent per platform (OAuth grant). |
| **Data subjects** | Registered users who link a social account. |
| **Data categories** | OAuth access + refresh tokens (encrypted at rest), platform user IDs, platform handles, post content the user composes. |
| **Source tables** | `public.social_accounts`, `public.library_posts`, `public.oauth_tokens`. |
| **Retention** | Until the user disconnects the channel OR account deletion. Token rotation handled by `oauth-callback` edge fn. |
| **Recipients (sub-processors)** | LinkedIn, Meta (FB/IG/Threads), TikTok, Pinterest, X — receive the post content the user submits on their instruction. |
| **International transfers** | All listed platforms are US/CN-based; controller relies on the user's own OAuth grant. Each platform's own DPA + the user's account terms govern. |
| **Security measures** | Tokens stored encrypted via Supabase vault, prefix-only in logs, RLS scoped to owner. |

## 3. Marketing-content storage

| Field | Value |
|---|---|
| **Purpose** | Store the user's marketing strategy, brand kit, content library, drafts, captures, events, scheduled posts. |
| **Lawful basis** | Art. 6(1)(b) — contract (the user signed up to create marketing content). |
| **Data subjects** | Workspace users + named contacts in their CRM list. |
| **Data categories** | Free-text content (anything the user types), images uploaded by the user, brand colours/logos, marketing strategy answers. |
| **Source tables** | `public.captures`, `public.library_posts`, `public.events`, `public.brand_kits`, `public.marketing_strategy`, `public.content_proposals`, `public.campaigns`, `public.ad_campaigns`. |
| **Retention** | While the workspace is active. On account deletion: org-level content preserved if other org members remain (Art. 17(3)(e) — legitimate interest of the org); else deleted. |
| **Recipients (sub-processors)** | Supabase (DB + storage), OpenAI + Anthropic (for AI generation IF user has granted `ai_processing` consent in the consents table). |
| **International transfers** | AI calls to OpenAI/Anthropic (US) under DPA + SCCs. Free-text payloads may include PII the user typed. |
| **Security measures** | RLS, organization-scoped tenancy, AI consent gate. |

## 4. CRM contacts (customers' own marketing audiences)

| Field | Value |
|---|---|
| **Purpose** | Let the user store contacts they want to market to. **Inclufy is processor here; the user is controller.** |
| **Lawful basis** | Determined by the user (controller). Inclufy DPA Art. 28 governs processing. |
| **Data subjects** | The customer's prospects / leads / clients. |
| **Data categories** | Name, email, phone, city, country, tags, attributes (JSONB). |
| **Source tables** | `public.contacts`. |
| **Retention** | Until the user deletes the contact OR the org subscription ends + 30d grace. |
| **Recipients (sub-processors)** | Supabase (DB), Resend (only when the user actively sends an email campaign). |
| **International transfers** | None unless the user uses an integration that exports the list. |
| **Security measures** | RLS on `user_id`, org-scoped tenancy, bulk-delete + CSV-export from ContactManager. |
| **Note** | Sub-processor terms ARE flowed down: customer signs Inclufy DPA → Inclufy has DPAs with Supabase + Resend. |

## 5. AI-generated content + telemetry

| Field | Value |
|---|---|
| **Purpose** | Generate copy/images via OpenAI/Anthropic; log calls for billing & abuse detection. |
| **Lawful basis** | Art. 6(1)(a) — explicit consent (consents.scope = 'ai_processing'). |
| **Data subjects** | Workspace user (the prompt author). |
| **Data categories** | Prompt text (free-form), AI response, model + token count, latency. |
| **Source tables** | `public.ai_call_log`, `public.ai_explanation_cache`. |
| **Retention** | `ai_call_log` — 1 year for billing; `ai_explanation_cache` — 90 days (cron `retention-ai-cache`). |
| **Recipients (sub-processors)** | OpenAI (US), Anthropic (US). |
| **International transfers** | Yes — DPA + SCCs in place. **Neither vendor trains on our enterprise data per their respective enterprise terms (OpenAI Enterprise + Anthropic Standard API).** |
| **Security measures** | Consent gate per user (`consents.granted` for scope=`ai_processing`), no training opt-in. |

## 6. Push & email notifications

| Field | Value |
|---|---|
| **Purpose** | Deliver in-app notifications + transactional & digest emails. |
| **Lawful basis** | Transactional — Art. 6(1)(b) contract. Marketing digest — Art. 6(1)(a) consent. |
| **Data subjects** | Registered users. |
| **Data categories** | Recipient email, push token, notification body. |
| **Source tables** | `public.notifications`, `public.go_notifications`, `public.push_tokens`, `public.email_log`. |
| **Retention** | `email_log` — 90 days. `notifications` — 365 days. `push_tokens` — until device re-registers or user logs out. |
| **Recipients (sub-processors)** | Resend (EU eu-west-1), Apple APNS, Google FCM. |
| **International transfers** | APNS/FCM = US — necessary for mobile delivery (no EU equivalent), under platform-vendor terms. |

## 7. Webhooks (outbound to customer's own server)

| Field | Value |
|---|---|
| **Purpose** | Notify the customer's own server when business events occur in their workspace. |
| **Lawful basis** | Art. 6(1)(b) contract — the customer configured the URL. |
| **Data subjects** | Whatever the event payload references — could be the customer's contacts, posts, campaigns. |
| **Data categories** | Per event (see `docs/WEBHOOKS.md § 2`): post_id, contact_id, channel, status, timestamps. |
| **Source tables** | `public.webhooks`, `public.webhook_deliveries`. |
| **Retention** | `webhook_deliveries` — 30 days (cron `retention-webhook-deliveries`). `webhooks` config — until deleted. |
| **Recipients** | The customer's own server at their configured URL. |
| **International transfers** | Determined by the customer's chosen URL. |
| **Security measures** | HMAC-SHA256 signature, dual-secret rotation, auto-pause after 10 dead-letters. |

## 8. Logs, error telemetry, security events

| Field | Value |
|---|---|
| **Purpose** | Detect bugs, abuse, breaches; satisfy GDPR Art. 32 monitoring obligation. |
| **Lawful basis** | Art. 6(1)(f) — legitimate interest (operational security). |
| **Data subjects** | Users whose action triggered the log. |
| **Data categories** | User ID, IP, user-agent, action description, JSON metadata. **NO passwords, NO full OAuth tokens (prefixes only).** |
| **Source tables** | `public.audit_logs`, `public.product_issues`, `public.rate_limit_logs`. Supabase edge-function logs (managed by Supabase). |
| **Retention** | `audit_logs` — 365 days (cron `retention-audit-logs`). `rate_limit_logs` — 30 days. Supabase function logs — 7 days (managed). |
| **Recipients (sub-processors)** | Sentry (EU pinned — IMPLEMENTATION NOTE: confirm `region: 'eu'` after EU DSN provisioned), Supabase. |
| **International transfers** | None once Sentry EU pinned. |
| **Security measures** | Log scrubbing for password fields, token prefixes only, RLS on audit_logs. |

## 9. Consent records

| Field | Value |
|---|---|
| **Purpose** | Demonstrate (Art. 7(1)) and audit the user's consent decisions over time. |
| **Lawful basis** | Art. 6(1)(c) — legal obligation. |
| **Data subjects** | All visitors + users (anonymous via cookie session). |
| **Data categories** | user_id OR anon_session, scope, granted/revoked, timestamp, IP, UA, policy version. |
| **Source tables** | `public.consents`. |
| **Retention** | Current-state row — indefinite. Superseded rows — 7 years from last update (cron `retention-consents`). |
| **Recipients (sub-processors)** | Supabase. |
| **International transfers** | None. |

## 10. Billing & subscription

| Field | Value |
|---|---|
| **Purpose** | Charge for paid plans, deliver invoices. |
| **Lawful basis** | Art. 6(1)(b) contract + Art. 6(1)(c) — tax law (7-year invoice retention in NL). |
| **Data subjects** | Workspace owners (subscriber). |
| **Data categories** | Email (from auth), Stripe customer ID, last 4 of card (Stripe-only — we never see PAN), billing address. |
| **Source tables** | `public.subscriptions`, `public.invoices`. |
| **Retention** | 7 years (Dutch fiscal law `Wet op de inkomstenbelasting`). |
| **Recipients (sub-processors)** | Stripe (IE — Stripe Payments Europe). |
| **International transfers** | Stripe internal infra spans EU + US — Stripe DPA. |

## 11. Support communications

| Field | Value |
|---|---|
| **Purpose** | Respond to support tickets, manage product_issues. |
| **Lawful basis** | Art. 6(1)(b) contract + Art. 6(1)(f) legit interest. |
| **Data subjects** | The reporting user. |
| **Data categories** | Email, ticket body (free-text — may contain anything), attached screenshots. |
| **Source tables** | `public.product_issues`. |
| **Retention** | 2 years from resolution (matches commercial-warranty + statute-of-limitations alignment). |
| **Recipients (sub-processors)** | Resend (for the lifecycle email notifications). |

## 12. Rate-limit anti-abuse

| Field | Value |
|---|---|
| **Purpose** | Throttle abusive demo-request spam, prevent enumeration attacks. |
| **Lawful basis** | Art. 6(1)(f) — legit interest (platform security). |
| **Data subjects** | Anyone who hits a rate-limited endpoint. |
| **Data categories** | IP address, endpoint hit, timestamp. |
| **Source tables** | `public.demo_request_rate_limit`, `public.rate_limit_logs`. |
| **Retention** | 7 days (cron `retention-demo-rate-limit`). |
| **Recipients (sub-processors)** | None. |
| **International transfers** | None. |

---

## Cross-cutting concerns

### A. Sub-processor register
See `docs/DPA_SUBPROCESSORS.md` and the public page `/sub-processors`.
**Material changes notified 30 days in advance to the billing contact.**

### B. Data subject rights
- **Art. 15 (Access)** — implemented as `gdpr-export` edge function, reachable from Settings → Data → Export my data.
- **Art. 16 (Rectification)** — handled in Settings UI for own profile + via support for embedded references.
- **Art. 17 (Erasure)** — implemented as `gdpr-account-delete` edge function with 30d grace period, reachable from Settings → Data → Delete my account.
- **Art. 18 (Restriction)** — handled via support ticket → audit-logged DB action.
- **Art. 20 (Portability)** — `gdpr-export` returns structured JSON.
- **Art. 21 (Object)** — via revoking consent in Settings → Privacy → consents toggle.
- **Art. 22 (Automated decision-making)** — Inclufy AI features are advisory only; no decisions with legal/significant effects without user approval.

Response SLA: 30 days (Art. 12(3)).

### C. International transfers
All sub-processors outside the EU/EEA are covered by either:
- An adequacy decision (none currently apply for US),
- Standard Contractual Clauses (SCCs) signed,
- The user's own OAuth grant (for social platforms — Inclufy is not the controller for their downstream use).

### D. Retention summary
| Table | Retention | Enforcement |
|---|---|---|
| webhook_deliveries | 30 days | cron `retention-webhook-deliveries` |
| audit_logs | 365 days | cron `retention-audit-logs` |
| demo_request_rate_limit | 7 days | cron `retention-demo-rate-limit` |
| consents (superseded) | 7 years | cron `retention-consents` |
| ai_explanation_cache | 90 days | cron `retention-ai-cache` |
| invoices / billing | 7 years | manual (legal) |
| user account | indefinite | user-controlled |
| email_log | 90 days | TODO — cron not yet scheduled |
| Supabase function logs | 7 days | platform-default |

### E. Breach response
See `docs/BREACH_RESPONSE_RUNBOOK.md` for the Art. 33/34 procedure.
72h notification to AP (Autoriteit Persoonsgegevens) + affected users where required.

### F. DPIA (Art. 35)
Performed when a new processing activity is "likely to result in a high
risk". Template: `docs/DPIA_TEMPLATE.md`. Triggers:
- New profiling / scoring of natural persons (e.g. lead-scoring AI)
- New large-scale special-category data (race, health, biometrics)
- New cross-border transfer to a country without an adequacy decision
- New large-scale public-area systematic monitoring

DPIAs completed to date: none (no activity meets the threshold today).
