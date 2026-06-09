# Inclufy Ecosystem — Common-Features Audit (2026-06-09)

**Scope:** AMOS (Marketing mobile) · Marketing-web · Inclufy Finance (web + mobile) · ProjeXtPal (web + mobile + backend) · IQ-Helix (web + backend + mobile shell) · Ignite (web)
**Stacks detected:** Supabase + Vite/React + Expo (Marketing, Finance) · Django/DRF + Vite/React + Expo (ProjeXtPal) · FastAPI + Vite/React + Expo shell (IQ-Helix) · Django + Vite/React (Ignite)
**Mode:** READ-ONLY inventory after a heavy P0+P1 sprint (today). Outputs reflect post-sprint state.

---

## Headline coverage (overall, A–I, %)

| App | Surface(s) | Coverage | Δ vs yesterday |
|---|---|---|---|
| **Marketing-web** | web | **78%** | +14 pts |
| **AMOS** | mobile | **62%** | +8 pts |
| **Inclufy Finance (web)** | web | **71%** | unchanged |
| **Inclufy Finance (mobile)** | mobile | **42%** | unchanged |
| **ProjeXtPal (web)** | web | **64%** | unchanged |
| **ProjeXtPal (mobile)** | mobile | **38%** | unchanged |
| **IQ-Helix (web)** | web | **35%** | unchanged |
| **IQ-Helix (mobile)** | shell only | **12%** | unchanged |
| **Ignite (web)** | web | **30%** | unchanged |

Today's sprint moved **Marketing-web** from "credible SaaS" to "enterprise-credible" (MFA + Azure SSO + webhooks v1 + sub-processors + status page). AMOS gained MFA, biometric, offline-cache and notification bell, but stayed below Marketing-web because the new collaboration / templates / saved-views / command-palette UI did not get mobile counterparts.

---

## Category coverage matrix (A–I)

| Cat | Marketing-web | AMOS | Fin-web | Fin-mobile | ProX-web | ProX-mobile | IQH-web | Ignite |
|---|---|---|---|---|---|---|---|---|
| A. Identity & Access | 95% | 80% | 85% | 50% | 60% | 30% | 40% | 40% |
| B. Collaboration | 80% | 55% | 50% | 25% | 75% | 35% | 25% | 20% |
| C. Data & Views | 90% | 30% | 80% | 20% | 70% | 25% | 30% | 25% |
| D. Productivity | 75% | 50% | 60% | 35% | 65% | 40% | 30% | 25% |
| E. Platform & Integrations | 90% | 60% | 75% | 30% | 50% | 25% | 25% | 30% |
| F. UX & Accessibility | 70% | 75% | 70% | 60% | 65% | 60% | 50% | 45% |
| G. Trust/Privacy/Ops | 75% | 75% | 70% | 50% | 55% | 40% | 30% | 25% |
| H. AI | 90% | 90% | 85% | 50% | 70% | 30% | 60% | 30% |
| I. Email | 75% | 75% | 70% | 60% | 50% | 30% | 40% | 30% |

---

## Web ↔ mobile parity gaps — Marketing (web ↔ AMOS)

| Feature | Web | AMOS | Parity gap |
|---|---|---|---|
| Comments + @mentions | PRESENT (`CommentThread.tsx`) | MISSING | **P1** |
| Saved views | PRESENT (`SavedViewsSelector.tsx`) | MISSING | **P1** |
| Bulk select + actions | PRESENT (`BulkActionToolbar.tsx`) | MISSING | P2 |
| Content templates | PRESENT (`ContentTemplates.tsx`) | MISSING | P2 |
| MFA TOTP | PRESENT | PRESENT (`MFASetupScreen.tsx`) | none |
| Microsoft SSO | PRESENT | PARTIAL — Login routes through web OAuth deep-link; native button missing | P1 |
| Sessions list / sign-out-everywhere | PRESENT (Settings) | MISSING | **P1** |
| Webhooks manager | PRESENT | MISSING | P3 (mobile-admin not expected) |
| API keys page | PRESENT | MISSING | P3 |
| Offline cache + sync | n/a | PRESENT | n/a |
| Notification bell | PRESENT | PRESENT (`NotificationBell.tsx`) | none |

---

## Cross-app parity matrix (the big picture)

| Feature | Marketing | Finance | ProjeXtPal | IQ-Helix | Ignite |
|---|---|---|---|---|---|
| **TOTP MFA (UI)** | shipped today | already shipped | "Manage 2FA" link only — STUB | MISSING | MISSING |
| **MFA recovery codes** | shipped today | MISSING | MISSING | MISSING | MISSING |
| **Microsoft / Azure SSO** | shipped today | already shipped | MISSING | MISSING | MISSING |
| **Sessions / sign-out-everywhere** | shipped today | MISSING | MISSING | MISSING | MISSING |
| **Biometric mobile login** | shipped today | MISSING | MISSING | n/a | n/a |
| **Comments + @mentions (polymorphic)** | shipped today | MISSING | PRESENT (`collaboration/models.py:Comment`) | MISSING | MISSING |
| **Notification bell** | PRESENT (web + mobile) | MISSING (DB notifs via Resend only) | PRESENT (`NotificationBell.tsx`) | MISSING | MISSING |
| **Saved views (polymorphic)** | shipped today | shipped today (independent table) | PRESENT (`SavedViews.tsx`) | MISSING | MISSING |
| **Bulk actions** | shipped today | MISSING | MISSING | MISSING | MISSING |
| **Custom fields** | MISSING | shipped today | PRESENT | MISSING | MISSING |
| **Content templates** | shipped today | MISSING | PRESENT (project blueprints) | MISSING | MISSING |
| **⌘K command palette** | shipped today | MISSING | MISSING | MISSING | MISSING |
| **Public API + keys (outbound)** | shipped today | shipped (`public_api_keys` + `api-gateway`) | PARTIAL | MISSING | MISSING |
| **Customer webhooks v1** (HMAC, retry, rotate, dead-letter) | **shipped today** | PARTIAL — cross-app sync only, no per-tenant | PARTIAL — stub `Webhook` model | MISSING | MISSING |
| **/status public page** | shipped today | MISSING | MISSING | MISSING | MISSING |
| **/sub-processors public page** | shipped today | MISSING | MISSING | MISSING | MISSING |
| **GDPR Art. 15 export (UI)** | PRESENT | PRESENT — UI reachability unconfirmed | PARTIAL — endpoint, no UI | MISSING | MISSING |
| **GDPR Art. 17 delete (UI)** | PRESENT | PRESENT | PARTIAL | MISSING | MISSING |
| **Offline cache + sync** | shipped today (AMOS) | MISSING | MISSING | n/a | n/a |
| **Audit log** | PRESENT | PRESENT | PRESENT | MISSING | MISSING |
| **Rate limiting** | PRESENT | PARTIAL | MISSING | MISSING | MISSING |
| **i18n (NL/EN/FR)** | PRESENT | PRESENT NL/EN | PARTIAL EN-only | PARTIAL | PARTIAL |

### Critical: did today's webhook platform get inherited? — **NO**
- **Finance** has its own `webhook_endpoints` + `webhook_deliveries` (April 2026), but targets *cross-app sync* (sync-to-projextpal, finance↔ignite). Lacks customer UI, dual-secret rotation, dead-letter auto-pause, the 30s/2m/10m/1h/6h retry ladder, HMAC v1 versioned signature header, per-tenant emit triggers. **~40% of Marketing's v1**.
- **ProjeXtPal** has a stub `integrations.Webhook` model used by `AutomationRule` — no dispatcher, no retry, no rotation. **~15% of Marketing's v1**.
- This is the **single biggest portability opportunity** in the ecosystem right now.

---

## P0 / P1 / P2 backlog

### P0 — table-stakes / blocks adoption

| # | App(s) | Item | Rationale | Portable from |
|---|---|---|---|---|
| 1 | Finance, ProjeXtPal, IQ-Helix, Ignite | **MFA TOTP enrollment + recovery codes** (UI on web + mobile) | SOC 2 CC6.1, ISO 27001 A.5.17, every B2B procurement RFP asks. ProjeXtPal "Manage 2FA" is a STUB. | `inclufy-marketing-web/src/pages/Settings.tsx:138-330` + `mfa-recovery-generate/index.ts` |
| 2 | Finance, ProjeXtPal, IQ-Helix | **Microsoft / Azure Entra ID SSO** | Enterprise gatekeeper (Asana, Monday, ClickUp). Finance already PRESENT — replicate. | `inclufy-auto-finance-main/src/pages/Auth.tsx:handleOAuth("azure")` |
| 3 | Finance, ProjeXtPal | **Sessions / sign-out-everywhere** | OWASP ASVS 3.7, GDPR Art. 32. | `20260523220000_setup_sessions.sql` |
| 4 | ProjeXtPal | **Wire Art. 15 + Art. 17 UI** (backend exists) | UI-reachability rule — endpoint without UI = GDPR PARTIAL. | Marketing-web Settings pattern |
| 5 | All except Marketing | **/status + /sub-processors public pages** | GDPR Art. 28 + procurement table-stakes (Stripe/Linear/Notion). | `StatusPage.tsx` + `SubProcessors.tsx` |

### P1 — expected / parity gap

| # | App(s) | Item | Rationale | Portable from |
|---|---|---|---|---|
| 6 | Finance, ProjeXtPal | **Per-tenant customer webhooks v1** (deliveries + retry + dual-secret rotation + dead-letter + HMAC v1) | Stripe/HubSpot/Shopify-grade webhook platform now in Marketing; selling Finance/ProX without it is a competitive miss. | `20260609100000-130000_webhook_*.sql` + `webhooks-dispatch/index.ts` + `WebhooksManager.tsx` + `docs/WEBHOOKS.md` |
| 7 | AMOS | **Comments + @mentions screen** | Schema is shared — only the screen is missing. | `CommentThread.tsx` |
| 8 | AMOS | **Saved views on list screens** | Schema is shared; mobile users re-filter every cold start. | `SavedViewsSelector.tsx` |
| 9 | AMOS | **Sessions screen** | Mobile = most likely to be lost/stolen. | Web Settings sessions tab |
| 10 | AMOS | **Native "Continue with Microsoft" button on LoginScreen** | Currently funnels users out to web browser. | `LoginScreen.tsx` + Supabase `signInWithOAuth({provider:'azure'})` |
| 11 | Finance (mobile), ProjeXtPal (mobile) | **Offline cache + mutation queue + SyncStatusBadge** | Field accountants & PMs work offline. | `InclufyMarketing/src/lib/offlineCache.ts` + `mutationQueue.ts` + `SyncStatusBadge.tsx` |
| 12 | Finance, ProjeXtPal | **Notification bell + center on web** | ProX backend has `Notification` model — only UI missing. | Marketing notification bell |
| 13 | Marketing (both) | **Custom fields (polymorphic)** | Finance + ProX both have it; Marketing posts/contacts cannot be tenant-extended. | Finance `20260609100000_custom_fields.sql` |
| 14 | ProjeXtPal | **Update saved_views to shared polymorphic shape** | Shared shape (`subject_type`, `subject_id`, `filters_jsonb`) is now Marketing's canonical. | `20260524160000_saved_views.sql` |
| 15 | Finance | **MFA recovery codes** | Has TOTP enroll but no `mfa_recovery_codes` → users lose access on phone loss. | Marketing's two edge fns |
| 16 | All | **i18n — finish FR + add AR** | Inclufy positions Maghreb/MENA; AMOS NL/EN/FR done — port. | AMOS `src/i18n/locales/` |

### P2 — nice-to-have / trend

| # | App(s) | Item | Rationale |
|---|---|---|---|
| 17 | All | **⌘K command palette** | Linear/Notion/Stripe-grade UX expectation. Portable from `GlobalCommandPalette.tsx`. |
| 18 | Finance, ProjeXtPal | **Bulk select + actions** on list pages (invoices, tasks) | Portable from `BulkActionToolbar.tsx` + `useBulkSelect.ts`. |
| 19 | AMOS | **Bulk select** on AllPosts / Library list | Mobile long-press multi-select = expected. |
| 20 | ProjeXtPal, IQ-Helix | **Audit log UI** (backend exists) | Compliance-readiness, not engineering. |
| 21 | All | **OpenAPI/Swagger autogen + docs page** | Finance `api-gateway` already routes; just publish. |
| 22 | All except Marketing | **Auto-pause webhook after 10 dead-letters** | Today's polish — copy when porting webhooks. |
| 23 | All | **Real-time presence (who's editing)** | Trend: Figma/Notion-grade. |

---

## Compliance verdict (category J — short form)

**GDPR** (60 controls in master template, scored per app):
- **Marketing-web + AMOS**: ~85% — Art. 15/17 reachable UI, sub-processors page, consent log, retention partially documented. PARTIAL on RoPA doc + cookie banner finalization.
- **Finance (web)**: ~75% — Art. 15/17 edge fns; UI reachability needs confirmation; no sub-processors page; audit log present.
- **Finance (mobile)**: ~55%.
- **ProjeXtPal**: ~55% — GDPR endpoints unreachable from UI (classic UI-reachability fail); audit log present; sub-processors missing.
- **IQ-Helix / Ignite**: ~30% — no documented privacy controls surfaced.

**ISO 27001 readiness** (Annex A): all apps fail the same documentation gate — no Statement of Applicability, no RoPA, no ISMS policy set. Engineering controls are 60–80% in place; documentation is the gap.

| App | Readiness |
|---|---|
| Marketing | ~55% |
| Finance | ~50% |
| ProjeXtPal | ~40% |
| IQ-Helix | ~25% |
| Ignite | ~20% |

**Critical statement:** No Inclufy app is "ISO 27001 certified" — that requires an accredited external auditor and an ISMS. The above are readiness scores.

---

## Executive summary (5 lines)

1. **Biggest risk:** ProjeXtPal's GDPR endpoints exist but have no UI — classic Art. 15/17 PARTIAL → audit-fail under the UI-reachability rule.
2. **Fastest win:** Port Marketing's `MFASetupScreen` + `mfa-recovery-*` edge fns to Finance + ProjeXtPal — same Supabase Auth API, ~1 day each, kills the #1 enterprise-RFP blocker across three products.
3. **Top parity gap:** Marketing-web is now 16 points ahead of AMOS (comments / saved views / sessions / Microsoft-native missing on mobile). The shared `mpxkugfqzmxydxnlxqoj` schema is *ready*; only the React Native screens are missing.
4. **Webhook inheritance:** Today's customer-grade webhook v1 (HMAC, retry, rotation, dead-letter, emit triggers) lives **only in Marketing**. Finance + ProX still ship cross-app/automation-grade webhooks. This is the single biggest portability dividend available — copy `20260609100000-130000_*` + `webhooks-dispatch/` + `WebhooksManager.tsx` to the other two repos.
5. **Compliance verdict:** GDPR — Marketing/AMOS *complied with* (~85%), Finance solid (~75%), ProjeXtPal needs UI wiring (~55%); ISO 27001 — **no app is certified**, readiness 25–55%, gap is documentation (ISMS, SoA, RoPA), not code.

---

## Key files referenced

- `~/InclufyMarketing/supabase/migrations/20260609100000_webhook_deliveries.sql`
- `~/InclufyMarketing/supabase/migrations/20260609110000_webhook_dispatch_cron.sql`
- `~/InclufyMarketing/supabase/migrations/20260609120000_webhook_secret_rotation.sql`
- `~/InclufyMarketing/supabase/migrations/20260609130000_webhook_emit_triggers.sql`
- `~/InclufyMarketing/supabase/functions/webhooks-dispatch/index.ts`
- `~/InclufyMarketing/docs/WEBHOOKS.md`
- `~/InclufyMarketing/src/screens/MFASetupScreen.tsx`
- `~/InclufyMarketing/src/lib/offlineCache.ts`
- `~/InclufyMarketing/src/lib/mutationQueue.ts`
- `~/InclufyMarketing/src/components/SyncStatusBadge.tsx`
- `~/InclufyMarketing/src/components/NotificationBell.tsx`
- `~/Projects/inclufy-marketing-web/src/pages/Settings.tsx`
- `~/Projects/inclufy-marketing-web/src/pages/StatusPage.tsx`
- `~/Projects/inclufy-marketing-web/src/pages/SubProcessors.tsx`
- `~/Projects/inclufy-marketing-web/src/pages/ContentTemplates.tsx`
- `~/Projects/inclufy-marketing-web/src/components/settings/WebhooksManager.tsx`
- `~/Projects/inclufy-marketing-web/src/components/SavedViewsSelector.tsx`
- `~/Projects/inclufy-marketing-web/src/components/BulkActionToolbar.tsx`
- `~/Projects/inclufy-marketing-web/src/components/GlobalCommandPalette.tsx`
- `~/Projects/inclufy-marketing-web/src/components/CommentThread.tsx`
- `~/Projects/inclufy-auto-finance-main/src/pages/Auth.tsx` (Azure SSO)
- `~/Projects/inclufy-auto-finance-main/src/components/MFAStatus.tsx`
- `~/Projects/inclufy-auto-finance-main/supabase/migrations/20260429171000_webhook_endpoints.sql` (cross-app, not customer-facing)
- `~/Projects/inclufy-auto-finance-main/supabase/migrations/20260608160000_public_api.sql`
- `~/Projects/inclufy-auto-finance-main/supabase/migrations/20260609100000_custom_fields.sql`
- `~/Projects/projextpal/backend/integrations/models.py` (Webhook stub)
- `~/Projects/projextpal/backend/collaboration/models.py` (Comment present)
- `~/Projects/projextpal/frontend/src/pages/Settings.tsx:585` ("Manage 2FA" stub link)
