# Auto-triage — `triage-product-issues`

Automated `product_issues` triage for AMOS. Port of ProjeXtPal's
`python manage.py triage_product_issues` + `scripts/cron-triage.sh`, adapted to
AMOS's stack (Supabase edge fn, OpenAI, direct Resend). Runs every 30 minutes
via pg_cron. Each run:

1. **Phase A — catalog cross-match** (no LLM). Reads `known_issues.json` and
   resolves any open issue matching a `fixed_verified` / `fix_pending_deploy`
   entry (endpoint substring in `error_trace`, or ≥2 keyword hits).
2. **Phase B — OpenAI classify** (`gpt-4o-mini`). For unmatched issues: returns
   `classification` (bug / duplicate / feature / needs-info / wontfix / escalate)
   + `priority` (P0–P3) + reporter message + dev notes. Writes two sibling
   comments — `visibility='public'` (reporter) and `visibility='internal'` (dev).
3. **Digest** — one email to `ADMIN_EMAILS`. Per-issue lifecycle emails are
   suppressed for auto-triage writes (migration `20260603110000`).

## Deploy (shared prod `mpxkugfqzmxydxnlxqoj`)

```bash
# 1. Apply migrations (Supabase SQL Editor — in order):
#    20260603100000_product_issue_comment_visibility.sql
#    20260603110000_triage_lifecycle_suppress_agent_email.sql
#    20260603120000_triage_product_issues_cron.sql   (needs vault secrets below)

# 2. Deploy the function (or via safe-redeploy.sh):
supabase functions deploy triage-product-issues --project-ref mpxkugfqzmxydxnlxqoj

# 3. Vault secrets for the cron (set once, NOT committed):
#    SELECT vault.create_secret('https://mpxkugfqzmxydxnlxqoj.supabase.co', 'supabase_url');
#    SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'supabase_service_role_key');
#    (Likely already present — shared with scheduled-publisher + goal-mode crons.)
```

## Required env (Supabase function secrets)

| Var | Default | Purpose |
|---|---|---|
| `SUPABASE_URL` | auto-injected | — |
| `SUPABASE_SERVICE_ROLE_KEY` | auto-injected | RLS-bypass + bearer the cron sends |
| `OPENAI_API_KEY` | — | Phase B. If missing, Phase B no-ops (Phase A still runs) |
| `TRIAGE_MODEL` | `gpt-4o-mini` | OpenAI model |
| `RESEND_API_KEY` | — | digest email. If missing, digest is skipped |
| `EMAIL_FROM_ADDRESS` | `AMOS by Inclufy <noreply@inclufy.com>` | digest from |
| `ADMIN_EMAILS` | `sami@inclufy.com` | digest recipients (comma-separated) |
| `TRIAGE_TRIGGER_TOKEN` | — | optional shared secret for manual curl |

## Manual smoke-test

```bash
BASE=https://mpxkugfqzmxydxnlxqoj.functions.supabase.co/triage-product-issues

# Dry-run — no DB writes, no LLM call (auth via service-role bearer)
curl -sS -X POST "$BASE" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"dry_run":true,"limit":5}' | jq

# One specific issue
curl -sS -X POST "$BASE" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -d '{"issue_id":"<uuid>"}' | jq

# Or with a shared token instead of the service key
curl -sS -X POST "$BASE" -H "X-Triage-Token: $TRIAGE_TRIGGER_TOKEN" -d '{"limit":5}' | jq
```

Response is a summary: `{ triaged, by_catalog, by_llm, needs_info, errors, idempotent_skipped, candidates, dry_run }`.

## Inspect cron

```sql
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'triage-product-issues-30min';
SELECT * FROM cron.job_run_details WHERE jobname = 'triage-product-issues-30min'
  ORDER BY start_time DESC LIMIT 10;
```

Edge-fn logs: Supabase Dashboard → Functions → triage-product-issues → Logs
(each run logs `[triage] {summary json}`).

## Pause / resume

```sql
UPDATE cron.job SET active = false WHERE jobname = 'triage-product-issues-30min';  -- pause
UPDATE cron.job SET active = true  WHERE jobname = 'triage-product-issues-30min';  -- resume
```

## Idempotency

Triage comments start with `[auto-triage-YYYY-MM-DD] #<issue-id>`. A second run
the same calendar day **skips** any issue already triaged today — unless the
reporter posted a (non-`agent:`) comment after the last triage, in which case the
issue is re-triaged with the reporter's new info as context.

## Editing the catalog

`known_issues.json` lives in this function's directory (edge functions only
deploy their own folder — it's AMOS's equivalent of ProjeXtPal's
`tests/regression/known_issues.json`). Add an entry with `status: "fixed_verified"`
or `"fix_pending_deploy"` and **redeploy the function** for it to take effect.

## What it can't do (yet)

- No real reproduction — classifies on text only. The `amos-operational-tester`
  agent still runs separately for "did the bug actually go away".
- `classification='duplicate'` is set, but `duplicate_of_id` FK is not linked
  (would need vector search).
- No retry-with-backoff on OpenAI transient errors — a failure leaves the issue
  at `status='new'` with an internal `llm-error` comment; next cycle retries.
