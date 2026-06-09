-- Marketing-web Proeftuin / Sandbox.
-- Closes the 3/10 gap identified in COMMON_FEATURES_AUDIT § PM#2:
-- the SetupAgent currently seeds straight into real production tables
-- with no way for a new user to "try with sample data" without polluting
-- their workspace. After this migration + the demo-seeder service +
-- DemoEnvironmentPage, users get the Linear/Stripe/Notion-grade onboarding:
--   1. Sign up → empty workspace
--   2. Click "Probeer met voorbeelddata" → seeded org-scoped demo rows
--      created with is_demo=true
--   3. Explore the app with realistic data
--   4. Click "Wis demo data" when ready to start real work
--      → DELETE WHERE is_demo=true, partial index keeps the wipe fast
--
-- The is_demo flag is the SINGLE source of truth. Production queries
-- filter `is_demo=false`; demo views filter `is_demo=true`. Migration
-- defaults all existing rows to is_demo=false so nothing in production
-- changes for current users.

BEGIN;

-- Schema additions (idempotent).
-- We intentionally skip `events` — that table is the analytics event log
-- (page-views/clicks scoped by organization_id), not user-curated demo
-- content. Demo personas can still trigger the analytics pipeline if the
-- product team later wants to seed example funnel data; that's a
-- follow-up migration scoped through organization_members.
ALTER TABLE public.personas         ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.campaigns        ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.content_items    ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.strategic_plans  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.contacts         ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.library_posts    ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- Partial indexes scoped to is_demo=true so the wipe-all path is O(rows-in-demo),
-- not O(table-size). The production-mode listing query already uses
-- (user_id, created_at DESC) indexes; we don't need a separate index for
-- is_demo=false because that's the vast majority of rows.
CREATE INDEX IF NOT EXISTS idx_personas_demo        ON public.personas(user_id)        WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_campaigns_demo       ON public.campaigns(user_id)       WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_content_items_demo   ON public.content_items(user_id)   WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_strategic_plans_demo ON public.strategic_plans(user_id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_contacts_demo        ON public.contacts(user_id)        WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_library_posts_demo   ON public.library_posts(user_id)   WHERE is_demo;

-- Wipe RPC. Atomic per-table DELETE for a single user's demo data.
-- SECURITY DEFINER so RLS doesn't block; we explicitly scope by auth.uid().
-- Returns counts per table so the UI can show "Verwijderde: 8 personas,
-- 12 campagnes, 47 content items, …".
CREATE OR REPLACE FUNCTION public.wipe_demo_data() RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_pers INT; v_camp INT; v_ci INT; v_sp INT; v_co INT; v_lp INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  DELETE FROM public.personas        WHERE is_demo AND user_id = v_uid;  GET DIAGNOSTICS v_pers = ROW_COUNT;
  DELETE FROM public.campaigns       WHERE is_demo AND user_id = v_uid;  GET DIAGNOSTICS v_camp = ROW_COUNT;
  DELETE FROM public.content_items   WHERE is_demo AND user_id = v_uid;  GET DIAGNOSTICS v_ci   = ROW_COUNT;
  DELETE FROM public.strategic_plans WHERE is_demo AND user_id = v_uid;  GET DIAGNOSTICS v_sp   = ROW_COUNT;
  DELETE FROM public.contacts        WHERE is_demo AND user_id = v_uid;  GET DIAGNOSTICS v_co   = ROW_COUNT;
  DELETE FROM public.library_posts   WHERE is_demo AND user_id = v_uid;  GET DIAGNOSTICS v_lp   = ROW_COUNT;

  RETURN jsonb_build_object(
    'personas',        v_pers,
    'campaigns',       v_camp,
    'content_items',   v_ci,
    'strategic_plans', v_sp,
    'contacts',        v_co,
    'library_posts',   v_lp,
    'total',           v_pers + v_camp + v_ci + v_sp + v_co + v_lp
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wipe_demo_data() TO authenticated;

-- "Am I in demo mode?" — returns true when the user has at least one
-- demo row. Used by the UI to toggle the "DEMO" banner.
CREATE OR REPLACE FUNCTION public.has_demo_data() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personas        WHERE is_demo AND user_id = auth.uid()
    UNION ALL SELECT 1 FROM public.campaigns       WHERE is_demo AND user_id = auth.uid()
    UNION ALL SELECT 1 FROM public.content_items   WHERE is_demo AND user_id = auth.uid()
    UNION ALL SELECT 1 FROM public.strategic_plans WHERE is_demo AND user_id = auth.uid()
    UNION ALL SELECT 1 FROM public.contacts        WHERE is_demo AND user_id = auth.uid()
    UNION ALL SELECT 1 FROM public.library_posts   WHERE is_demo AND user_id = auth.uid()
    LIMIT 1
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_demo_data() TO authenticated;

COMMIT;
