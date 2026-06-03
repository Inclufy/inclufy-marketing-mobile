-- =============================================================================
-- triage-product-issues-30min — pg_cron job that runs auto-triage every 30 min.
--
-- Port of ProjeXtPal's scripts/cron-triage.sh (which did docker-exec + 30-min
-- crontab). AMOS has no container — the cron POSTs the triage edge function
-- server-side, so it runs unattended without a Mac awake.
--
-- Pattern follows 20260509073500_agent_goal_mode_cron.sql and
-- 20260424010000_scheduled_publisher.sql (vault.decrypted_secrets + net.http_post).
--
-- The edge fn authorizes the call via `Authorization: Bearer <service-role-key>`
-- (triage-product-issues has verify_jwt=false and checks the bearer itself).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── Vault secrets (set out-of-band, NOT committed) ─────────────────────────
-- Reuses the same two secrets as the scheduled-publisher / goal-mode jobs:
--   SELECT vault.create_secret('https://mpxkugfqzmxydxnlxqoj.supabase.co', 'supabase_url');
--   SELECT vault.create_secret('YOUR_SERVICE_ROLE_KEY',                    'supabase_service_role_key');
-- If either is missing, net.http_post fails silently and no triage runs — safe.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'triage-product-issues-30min') THEN
    PERFORM cron.unschedule('triage-product-issues-30min');
  END IF;

  PERFORM cron.schedule(
    'triage-product-issues-30min',
    '*/30 * * * *',   -- at :00 and :30 every hour
    $cron$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url')
             || '/functions/v1/triage-product-issues',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key')
      ),
      body := jsonb_build_object('limit', 25),
      timeout_milliseconds := 60000
    );
    $cron$
  );
END $$;

-- ─── Verification (run manually after apply) ────────────────────────────────
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'triage-product-issues-30min';
-- Expected: 1 row, schedule '*/30 * * * *', active=true.
-- SELECT * FROM cron.job_run_details WHERE jobname = 'triage-product-issues-30min' ORDER BY start_time DESC LIMIT 10;
