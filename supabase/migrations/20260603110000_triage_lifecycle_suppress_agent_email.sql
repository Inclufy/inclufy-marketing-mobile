-- =============================================================================
-- Lifecycle email suppression for auto-triage writes.
--
-- The product_issues lifecycle trigger (20260512160000) fires an HTTP POST to
-- the product-issue-lifecycle edge fn on EVERY INSERT/UPDATE, which sends a
-- Resend email. The new triage-product-issues cron updates many rows per run —
-- without a guard, each UPDATE would spam one email. ProjeXtPal solved this with
-- `_suppress_email_on_save = True` + a single digest; we do the equivalent in SQL.
--
-- Guard: skip the notification when this UPDATE was written by the auto-triage
-- agent (NEW.triaged_by = 'agent:issue-triage-validator' AND triaged_at changed).
-- The triage edge fn sends ONE digest to ADMIN_EMAILS instead. INSERTs (the
-- "we received your report" mail) and human/admin triage updates are UNAFFECTED.
--
-- CREATE OR REPLACE keeps the function identical to 20260512160000 except for
-- the early-return guard. Idempotent.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_product_issue_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  webhook_url TEXT := 'https://mpxkugfqzmxydxnlxqoj.supabase.co/functions/v1/product-issue-lifecycle';
  payload      JSONB;
BEGIN
  -- ── Auto-triage suppression ──
  -- When the auto-triage agent updates an issue (status/priority/triaged_*),
  -- do NOT fire the per-issue email — the triage digest covers it. Detect via
  -- triaged_by + a change to triaged_at on this very UPDATE.
  IF TG_OP = 'UPDATE'
     AND NEW.triaged_by = 'agent:issue-triage-validator'
     AND NEW.triaged_at IS DISTINCT FROM OLD.triaged_at THEN
    RETURN NEW;
  END IF;

  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', to_jsonb(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
  );

  PERFORM net.http_post(
    url     := webhook_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := payload,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_notify(
    'product_issue_notify_error',
    jsonb_build_object('sqlstate', SQLSTATE, 'message', SQLERRM, 'op', TG_OP, 'id', NEW.id)::TEXT
  );
  RETURN NEW;
END;
$$;

-- Trigger definition unchanged — function body is replaced in place.
COMMENT ON FUNCTION public.notify_product_issue_change() IS
  'Fires HTTP POST to product-issue-lifecycle on INSERT/UPDATE. Suppresses the call for auto-triage UPDATEs (triaged_by=agent:issue-triage-validator) — the triage-product-issues digest covers those. See 20260603110000.';
