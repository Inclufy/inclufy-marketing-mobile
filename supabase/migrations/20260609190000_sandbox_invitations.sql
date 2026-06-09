-- Sandbox / proeftuin invitation flow (Linear/Stripe sales pattern).
-- Lets an org owner/admin invite a prospect to a time-boxed sandbox
-- workspace pre-seeded with industry-pack data — the most effective
-- pre-sales motion an early-stage SaaS can ship.
--
-- ProjeXtPal pattern reference: backend/accounts/sandbox_invite.py
-- (uses PasswordResetToken + Resend). Marketing-web equivalent uses
-- Supabase auth.admin.inviteUserByEmail + a sandbox_invitations
-- audit table + a Resend send via the existing send-email infra.
--
-- Flow:
--   1. Org admin POSTs to send-sandbox-invitation edge fn with
--      { recipient_email, recipient_name?, pack_id?, trial_days? }
--   2. Edge fn auth-gates (caller must be org owner/admin), rate-limits
--      (10 invites/day/caller), inserts a row here, calls Supabase
--      Admin API inviteUserByEmail (with metadata.sandbox_invitation_id),
--      sends branded Resend email.
--   3. Recipient clicks the magic link → lands on /demo with the
--      pre-chosen pack pre-selected → seeds with 1 click.
--   4. accepted_at populated on first login (auth trigger).
--   5. expires_at hides expired sandboxes from the inviter's UI.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sandbox_invitations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inviter_org_id    UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_email   TEXT NOT NULL,
  recipient_name    TEXT,
  pack_id           TEXT NOT NULL DEFAULT 'agency'
                    CHECK (pack_id IN ('agency', 'b2b_saas', 'ecommerce')),
  trial_days        INT  NOT NULL DEFAULT 14 CHECK (trial_days BETWEEN 1 AND 90),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  invited_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at       TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '14 days',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Avoid double-sending to the same prospect by the same inviter
  -- while the previous invite is still pending. Once accepted/expired/
  -- revoked the inviter can re-invite freely.
  CONSTRAINT sandbox_inv_no_dup_pending UNIQUE NULLS NOT DISTINCT (inviter_user_id, recipient_email, status)
    DEFERRABLE INITIALLY DEFERRED
);

-- Drop the partial-unique above and replace with a partial unique index
-- so we only enforce uniqueness on pending rows (per Postgres docs the
-- DEFERRABLE table-constraint form doesn't accept WHERE clauses).
ALTER TABLE public.sandbox_invitations
  DROP CONSTRAINT IF EXISTS sandbox_inv_no_dup_pending;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sandbox_inv_unique_pending
  ON public.sandbox_invitations(inviter_user_id, recipient_email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sandbox_inv_inviter ON public.sandbox_invitations(inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_inv_org     ON public.sandbox_invitations(inviter_org_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_inv_email   ON public.sandbox_invitations(recipient_email);
CREATE INDEX IF NOT EXISTS idx_sandbox_inv_expires ON public.sandbox_invitations(expires_at)
  WHERE status = 'pending';

ALTER TABLE public.sandbox_invitations ENABLE ROW LEVEL SECURITY;

-- Inviter can read their own outgoing invitations
DROP POLICY IF EXISTS sandbox_inv_inviter_read ON public.sandbox_invitations;
CREATE POLICY sandbox_inv_inviter_read ON public.sandbox_invitations FOR SELECT TO authenticated
  USING (inviter_user_id = auth.uid());

-- Org owners/admins can read any invitation from their org (audit trail)
DROP POLICY IF EXISTS sandbox_inv_org_admin_read ON public.sandbox_invitations;
CREATE POLICY sandbox_inv_org_admin_read ON public.sandbox_invitations FOR SELECT TO authenticated
  USING (inviter_org_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Inviter can revoke (UPDATE status to revoked) their own invitations
DROP POLICY IF EXISTS sandbox_inv_inviter_revoke ON public.sandbox_invitations;
CREATE POLICY sandbox_inv_inviter_revoke ON public.sandbox_invitations FOR UPDATE TO authenticated
  USING (inviter_user_id = auth.uid())
  WITH CHECK (inviter_user_id = auth.uid());

-- INSERT goes through the edge fn (service-role), not direct from client.
-- No INSERT policy needed for authenticated.

-- Janitor: mark expired rows. Runs nightly via pg_cron.
CREATE OR REPLACE FUNCTION public.cron_mark_expired_sandbox_invitations() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INT;
BEGIN
  UPDATE public.sandbox_invitations
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE '[sandbox-inv] marked % expired', v_n;
  RETURN v_n;
END;
$$;

-- Schedule daily 02:30 UTC, after retention crons (03:00+)
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-sandbox-invitations';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'expire-sandbox-invitations',
  '30 2 * * *',
  'SELECT public.cron_mark_expired_sandbox_invitations();'
);

COMMIT;
