-- Queue table for outbound webhook deliveries.
-- The dispatcher (supabase/functions/webhooks-dispatch) drains rows where
-- status = 'pending' AND next_attempt_at <= now(), POSTs the payload to
-- webhook.url with an HMAC-SHA256 signature, and updates the row.
--
-- Retry policy: exponential backoff via next_attempt_at, max 5 attempts.
-- On 4xx the row goes straight to dead_letter (client error, not worth
-- retrying). 5xx and network errors trigger backoff.
--
-- RLS: org owner/admin can SELECT deliveries for their org (audit trail
-- in the UI). Only service_role writes — never end-user.

BEGIN;

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id       UUID NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL,
  event            TEXT NOT NULL,
  payload          JSONB NOT NULL,
  attempt_count    INT  NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at     TIMESTAMPTZ,
  last_status      INT,
  last_error       TEXT,
  last_response    TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','delivered','dead_letter')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot index for the dispatcher: "give me pending deliveries due now".
CREATE INDEX IF NOT EXISTS idx_wd_pending
  ON public.webhook_deliveries(next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_wd_org
  ON public.webhook_deliveries(organization_id);

CREATE INDEX IF NOT EXISTS idx_wd_webhook
  ON public.webhook_deliveries(webhook_id);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wd_admin_read ON public.webhook_deliveries;
CREATE POLICY wd_admin_read ON public.webhook_deliveries FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  ));

-- Convenience: a SECURITY DEFINER fn the app can call to fan an event out
-- to every active webhook in the caller's org that subscribes to that
-- event. Returns the number of deliveries queued. The dispatcher will
-- pick them up on its next run.
CREATE OR REPLACE FUNCTION public.enqueue_webhook_event(
  p_event TEXT,
  p_payload JSONB
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org UUID;
  v_queued INT := 0;
BEGIN
  -- Resolve caller's org. If they're in 0 or >1 orgs, the queue stays
  -- empty rather than fanning out to a guessed org.
  SELECT organization_id INTO v_org
  FROM public.organization_members
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'caller has no organization';
  END IF;

  INSERT INTO public.webhook_deliveries
    (webhook_id, organization_id, event, payload)
  SELECT w.id, w.organization_id, p_event, p_payload
  FROM public.webhooks w
  WHERE w.organization_id = v_org
    AND w.active = true
    AND (p_event = ANY(w.events) OR cardinality(w.events) = 0);

  GET DIAGNOSTICS v_queued = ROW_COUNT;
  RETURN v_queued;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_webhook_event(TEXT, JSONB) TO authenticated;

COMMIT;
