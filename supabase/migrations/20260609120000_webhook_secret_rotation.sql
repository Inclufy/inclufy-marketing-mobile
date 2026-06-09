-- Webhook dual-secret rotation overlap window.
--
-- Customer rotation flow:
--   1. Customer hits "Rotate secret" in Settings → Integrations → Webhooks.
--   2. A new secret is generated and stored in `secret`; the old secret
--      moves to `secret_previous`; `secret_previous_until` = now() + 24h.
--   3. For the next 24 hours the dispatcher signs each delivery with BOTH
--      keys and emits `X-Inclufy-Signature: t=<ts>,v0=<old hmac>,v1=<new hmac>`.
--      The customer can validate either — giving them time to roll out
--      the new secret to their endpoint without any dropped events.
--   4. After 24h, the cron job (cron_clear_expired_webhook_secrets) wipes
--      secret_previous and the dispatcher reverts to signing with v1 only.
--
-- This matches the Stripe pattern customers are familiar with — and
-- closes the doc-vs-code gap in WEBHOOKS.md §6 ("Rotate secrets quarterly").

BEGIN;

ALTER TABLE public.webhooks
  ADD COLUMN IF NOT EXISTS secret_previous TEXT,
  ADD COLUMN IF NOT EXISTS secret_previous_until TIMESTAMPTZ;

-- Index used by the cron janitor to quickly find rows past their grace window
CREATE INDEX IF NOT EXISTS idx_wh_secret_prev_expired
  ON public.webhooks(secret_previous_until)
  WHERE secret_previous IS NOT NULL;

-- Atomic rotation helper. Caller is the org's owner/admin (RLS enforced).
-- Returns the new plain secret ONCE — caller is responsible for showing it
-- to the user and never persisting it client-side beyond the rotate dialog.
CREATE OR REPLACE FUNCTION public.rotate_webhook_secret(p_webhook_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_secret TEXT;
  v_org UUID;
  v_role TEXT;
BEGIN
  -- Authz: caller must be owner/admin of the webhook's org
  SELECT w.organization_id INTO v_org FROM public.webhooks w WHERE w.id = p_webhook_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'webhook not found'; END IF;

  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = v_org AND user_id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'forbidden — only owner/admin can rotate webhook secrets';
  END IF;

  -- Generate a strong 32-byte random secret, hex-encoded → 64 chars
  v_new_secret := 'whsec_' || encode(gen_random_bytes(32), 'hex');

  UPDATE public.webhooks
  SET
    secret_previous       = secret,
    secret_previous_until = now() + INTERVAL '24 hours',
    secret                = v_new_secret,
    failure_count         = 0  -- fresh start; rotation often pairs with re-enabling
  WHERE id = p_webhook_id;

  RETURN v_new_secret;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rotate_webhook_secret(UUID) TO authenticated;

-- Janitor that wipes expired secret_previous values. Idempotent.
CREATE OR REPLACE FUNCTION public.cron_clear_expired_webhook_secrets() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cleared INT;
BEGIN
  UPDATE public.webhooks
  SET secret_previous = NULL, secret_previous_until = NULL
  WHERE secret_previous IS NOT NULL
    AND secret_previous_until IS NOT NULL
    AND secret_previous_until < now();

  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  RETURN v_cleared;
END;
$$;

-- Schedule the janitor every 10 minutes (granularity > 24h grace ÷ 144 ticks)
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'clear-expired-webhook-secrets';
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'clear-expired-webhook-secrets',
  '*/10 * * * *',
  'SELECT public.cron_clear_expired_webhook_secrets();'
);

COMMIT;
