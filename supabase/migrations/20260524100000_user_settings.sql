-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ USER-SETTINGS MIGRATION  —  link account prefs between web + mobile     ║
-- ║                                                                          ║
-- ║ Today's gaps (per settings_link_audit_2026-05-24.md):                   ║
-- ║   • Theme (dark/light) — localStorage / AsyncStorage only                ║
-- ║   • Language (NL/EN/FR) — localStorage / AsyncStorage only               ║
-- ║   • AI consent — AsyncStorage only (mobile), not synced                  ║
-- ║   • Notification prefs — web only in React-state (lost on refresh)       ║
-- ║                                                                          ║
-- ║ This table is the single source of truth for cross-device preferences.   ║
-- ║ Both AMOS mobile and marketing-web SPA upsert against (user_id) PK.      ║
-- ║                                                                          ║
-- ║ Idempotent: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS.          ║
-- ║ AMOS-impact: ADDITIVE only. No existing table touched.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. user_settings — one row per auth.users row
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- UI preferences
  theme                TEXT NOT NULL DEFAULT 'system'
                          CHECK (theme IN ('light', 'dark', 'system')),
  language             TEXT NOT NULL DEFAULT 'nl'
                          CHECK (language IN ('nl', 'en', 'fr', 'ar')),

  -- Notification preferences — JSONB so each app can add its own keys
  -- without a schema migration. Recommended shape:
  --   { email: {digest:bool, mentions:bool, approvals:bool, errors:bool, campaign_alerts:bool, weekly_report:bool},
  --     push:  {mentions:bool, approvals:bool, errors:bool, campaign_alerts:bool},
  --     in_app:{mentions:bool, approvals:bool, errors:bool} }
  notification_preferences JSONB NOT NULL DEFAULT '{
    "email":  {"digest": true, "mentions": true, "approvals": true, "errors": true, "campaign_alerts": true, "weekly_report": true},
    "push":   {"mentions": true, "approvals": true, "errors": true, "campaign_alerts": true},
    "in_app": {"mentions": true, "approvals": true, "errors": true}
  }'::jsonb,

  -- AI consent (GDPR / EU AI Act). Mobile previously stored in AsyncStorage;
  -- syncing here means consent granted on web shows on mobile too.
  ai_consent_granted   BOOLEAN NOT NULL DEFAULT FALSE,
  ai_consent_at        TIMESTAMPTZ,
  ai_consent_version   TEXT,

  -- Workflow defaults
  default_brand_kit_id UUID REFERENCES public.brand_kits(id) ON DELETE SET NULL,
  default_tone         TEXT,
  default_channels     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Locale / regional
  location             JSONB DEFAULT '{}'::jsonb,
  timezone             TEXT,
  currency             TEXT,

  -- Telemetry
  telemetry_opt_in     BOOLEAN NOT NULL DEFAULT TRUE,
  sentry_opt_in        BOOLEAN NOT NULL DEFAULT TRUE,

  -- App-specific defaults (kept here for completeness; per-device-only
  -- things like push tokens stay in user_devices)
  capture_default      TEXT DEFAULT 'camera' CHECK (capture_default IN ('camera','voice','quote','event')),
  approval_flow        TEXT DEFAULT 'require_approval' CHECK (approval_flow IN ('auto_publish','require_approval')),

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_lang ON public.user_settings (language);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RLS — strict per-user; no org-scope. Settings belong to the user, not
--    their org, so a user switching org keeps their prefs.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_settings_owner_select ON public.user_settings;
CREATE POLICY user_settings_owner_select ON public.user_settings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_settings_owner_insert ON public.user_settings;
CREATE POLICY user_settings_owner_insert ON public.user_settings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_settings_owner_update ON public.user_settings;
CREATE POLICY user_settings_owner_update ON public.user_settings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_settings_owner_delete ON public.user_settings;
CREATE POLICY user_settings_owner_delete ON public.user_settings
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Auto-bump updated_at on every row change
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_settings_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_settings_touch_trg ON public.user_settings;
CREATE TRIGGER user_settings_touch_trg
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.user_settings_touch();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Auto-create empty settings row when a new auth user is created.
--    Means the first read from either app always returns a row (no race).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_settings_init()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_settings_init_trg ON auth.users;
CREATE TRIGGER user_settings_init_trg
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.user_settings_init();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Backfill: ensure every existing auth user has a settings row.
--    Idempotent via ON CONFLICT.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.user_settings (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Verification
-- ─────────────────────────────────────────────────────────────────────────
SELECT 'table'   AS kind, table_name    AS name FROM information_schema.tables
  WHERE table_schema='public' AND table_name='user_settings'
UNION ALL
SELECT 'policy'  AS kind, policyname     AS name FROM pg_policies
  WHERE schemaname='public' AND tablename='user_settings'
UNION ALL
SELECT 'trigger' AS kind, tgname         AS name FROM pg_trigger
  WHERE tgrelid='public.user_settings'::regclass AND NOT tgisinternal
UNION ALL
SELECT 'rows'    AS kind, (SELECT count(*)::text FROM public.user_settings)::text AS name;

COMMIT;
