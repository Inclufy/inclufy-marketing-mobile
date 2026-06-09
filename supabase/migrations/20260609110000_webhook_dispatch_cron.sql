-- pg_cron job that drains the webhook_deliveries queue every minute by
-- calling the webhooks-dispatch edge fn. Applied live on 2026-06-09 via
-- Management API; this file is for `supabase db reset` reproducibility.
--
-- The actual service_role key is stored encrypted in vault.secrets under
-- the name 'sr_for_cron' and decrypted on demand inside the wrapper fn
-- so it never appears in pg_cron's job definition or query logs.
--
-- To rotate the key:
--   DELETE FROM vault.secrets WHERE name = 'sr_for_cron';
--   SELECT vault.create_secret('<new sr key>', 'sr_for_cron', '...');

CREATE OR REPLACE FUNCTION public.cron_drain_webhooks() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key TEXT;
BEGIN
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'sr_for_cron'
  LIMIT 1;

  IF v_key IS NULL THEN
    RAISE WARNING '[cron_drain_webhooks] vault secret sr_for_cron missing — skipping tick';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://mpxkugfqzmxydxnlxqoj.supabase.co/functions/v1/webhooks-dispatch',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey',        v_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Idempotent: unschedule any existing 'drain-webhooks' before scheduling fresh.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'drain-webhooks';
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule('drain-webhooks', '* * * * *', 'SELECT public.cron_drain_webhooks();');
