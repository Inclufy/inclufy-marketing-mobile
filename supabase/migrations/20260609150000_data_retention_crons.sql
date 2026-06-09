-- Automated data retention enforcement (GDPR Art. 5(1)(e) — storage
-- limitation principle, ISO 27001 A.5.10 — Acceptable use).
--
-- Until this migration the codebase had retention POLICY documented in
-- WEBHOOKS.md and the GDPR audit, but no actual purge. This wires
-- pg_cron jobs that delete old rows per the published schedule.
--
-- Retention schedule (per-table):
--   webhook_deliveries          → 30 days (per docs/WEBHOOKS.md § 5)
--   audit_logs                  → 365 days (1 year — minimum forensics window)
--   demo_request_rate_limit     → 7 days (transient anti-abuse data)
--   consents (revoked rows)     → 7 years (legal-defensibility window;
--                                  current-state rows never purged)
--   ai_explanation_cache        → 90 days (cached LLM output, can regenerate)
--   webhook_deliveries dead-letter → kept full 30d so customer can debug
--
-- Each job is idempotent (UNSCHEDULE before SCHEDULE). Each runs nightly
-- at a different hour to avoid contention.

BEGIN;

-- ─── Job functions ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cron_purge_old_webhook_deliveries() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INT;
BEGIN
  DELETE FROM public.webhook_deliveries
  WHERE created_at < now() - INTERVAL '30 days'
    AND status IN ('delivered', 'dead_letter');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '[retention] purged % webhook_deliveries', v_n;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cron_purge_old_audit_logs() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INT := 0;
BEGIN
  -- audit_logs may or may not exist depending on which migrations ran
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_logs') THEN
    EXECUTE 'DELETE FROM public.audit_logs WHERE created_at < now() - INTERVAL ''365 days''';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[retention] purged % audit_logs', v_n;
  END IF;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cron_purge_demo_rate_limit() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INT := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='demo_request_rate_limit') THEN
    EXECUTE 'DELETE FROM public.demo_request_rate_limit WHERE created_at < now() - INTERVAL ''7 days''';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[retention] purged % demo_request_rate_limit', v_n;
  END IF;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cron_purge_old_consents() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INT;
BEGIN
  -- Only purge SUPERSEDED rows (newer row exists for same user+scope).
  -- The latest row per (user, scope) is the current state and is never
  -- purged — keeping 7 years of revocation history for legal evidence.
  DELETE FROM public.consents c
  WHERE c.granted_at < now() - INTERVAL '7 years'
    AND EXISTS (
      SELECT 1 FROM public.consents c2
      WHERE c2.scope = c.scope
        AND (
          (c2.user_id IS NOT NULL AND c2.user_id = c.user_id)
          OR (c2.anon_session IS NOT NULL AND c2.anon_session = c.anon_session)
        )
        AND c2.granted_at > c.granted_at
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '[retention] purged % consents (superseded > 7y)', v_n;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cron_purge_ai_explanation_cache() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INT := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ai_explanation_cache') THEN
    EXECUTE 'DELETE FROM public.ai_explanation_cache WHERE created_at < now() - INTERVAL ''90 days''';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[retention] purged % ai_explanation_cache', v_n;
  END IF;
  RETURN v_n;
END;
$$;

-- ─── Schedule each — staggered hours to avoid contention ──────────────

DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname LIKE 'retention-%'; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 03:00 UTC nightly
SELECT cron.schedule('retention-webhook-deliveries', '0 3 * * *', 'SELECT public.cron_purge_old_webhook_deliveries();');
-- 03:15
SELECT cron.schedule('retention-audit-logs',         '15 3 * * *', 'SELECT public.cron_purge_old_audit_logs();');
-- 03:30
SELECT cron.schedule('retention-demo-rate-limit',    '30 3 * * *', 'SELECT public.cron_purge_demo_rate_limit();');
-- 03:45 — weekly only (Sun) because 7y deletions are rare
SELECT cron.schedule('retention-consents',           '45 3 * * 0', 'SELECT public.cron_purge_old_consents();');
-- 04:00
SELECT cron.schedule('retention-ai-cache',           '0 4 * * *',  'SELECT public.cron_purge_ai_explanation_cache();');

COMMIT;
