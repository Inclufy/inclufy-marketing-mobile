-- GDPR-compliant consent audit trail.
-- Closes the §4 + §7 gap in docs/GDPR_AUDIT_2026-05-14.md — the existing
-- web CookieConsent component (Finance) and AMOS AIConsentModal store
-- state in localStorage only, which the user can wipe = not demonstrable
-- under Art. 7(1) ("the controller shall be able to demonstrate").
--
-- Anyone can record consent — anonymous visitors and authenticated users
-- both. We key on either (user_id, scope) for logged-in or
-- (anon_session, scope) for pre-login visitors. The two reconcile when
-- the user signs up (we migrate anon → user_id with a follow-up UPDATE).

BEGIN;

CREATE TABLE IF NOT EXISTS public.consents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anon_session    TEXT,                              -- cookie-based session id for pre-auth
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- One of: necessary / analytics / marketing / ai_processing / ai_training
  -- Necessary is implicit but we still record so the user can see it.
  scope           TEXT NOT NULL CHECK (scope IN (
    'necessary', 'analytics', 'marketing', 'ai_processing', 'ai_training'
  )),

  granted         BOOLEAN NOT NULL,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at      TIMESTAMPTZ,

  policy_version  TEXT NOT NULL,                     -- e.g. "2026-06-09"
  ip_address      TEXT,
  user_agent      TEXT,
  source          TEXT,                              -- 'banner' / 'settings' / 'signup' / 'rpc'

  CONSTRAINT consents_subject_present
    CHECK (user_id IS NOT NULL OR anon_session IS NOT NULL)
);

-- Lookup index for the "what is my current consent" query
CREATE INDEX IF NOT EXISTS idx_consents_user_scope
  ON public.consents(user_id, scope, granted_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consents_anon_scope
  ON public.consents(anon_session, scope, granted_at DESC)
  WHERE anon_session IS NOT NULL;

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

-- Users can read their own consent history (Art. 15 Right of Access)
DROP POLICY IF EXISTS consents_own_read ON public.consents;
CREATE POLICY consents_own_read ON public.consents FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Anyone (even anon) can INSERT — that's the whole point of recording
-- consent for pre-auth visitors. Server-side (edge fn / RPC) sets the
-- IP/UA so the client can't spoof.
DROP POLICY IF EXISTS consents_insert ON public.consents;
CREATE POLICY consents_insert ON public.consents FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- RPC: record consent atomically. Returns the consent row.
-- We use server-set NOW() and request_headers for IP/UA so the client
-- can't spoof. Called by the CookieBanner + Settings consent toggle.
CREATE OR REPLACE FUNCTION public.record_consent(
  p_scope          TEXT,
  p_granted        BOOLEAN,
  p_policy_version TEXT,
  p_anon_session   TEXT DEFAULT NULL,
  p_source         TEXT DEFAULT 'banner'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id        UUID;
  v_user_id   UUID;
  v_ip        TEXT;
  v_ua        TEXT;
BEGIN
  v_user_id := auth.uid();  -- NULL for anon

  -- Pull IP + UA from PostgREST request headers (set by Supabase)
  v_ip := current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for';
  v_ip := COALESCE(split_part(v_ip, ',', 1), v_ip);
  v_ua := current_setting('request.headers', true)::jsonb ->> 'user-agent';

  IF v_user_id IS NULL AND p_anon_session IS NULL THEN
    RAISE EXCEPTION 'either authenticated user or anon_session required';
  END IF;

  INSERT INTO public.consents
    (user_id, anon_session, scope, granted, policy_version, ip_address, user_agent, source)
  VALUES
    (v_user_id, p_anon_session, p_scope, p_granted, p_policy_version, v_ip, v_ua, p_source)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_consent(TEXT, BOOLEAN, TEXT, TEXT, TEXT) TO anon, authenticated;

-- View: latest-state-per-scope for the current user. Used by the
-- "your privacy settings" UI to render the current toggle state.
CREATE OR REPLACE VIEW public.consents_current AS
SELECT DISTINCT ON (user_id, scope)
  user_id, scope, granted, granted_at, policy_version
FROM public.consents
WHERE user_id IS NOT NULL
ORDER BY user_id, scope, granted_at DESC;

COMMIT;
