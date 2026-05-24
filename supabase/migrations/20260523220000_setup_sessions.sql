-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SETUP-SESSIONS MIGRATION  —  refresh-safe wizard progress                ║
-- ║                                                                          ║
-- ║ Purpose: store SetupAgent wizard state server-side so a page refresh    ║
-- ║          (or device switch) does not wipe the user's onboarding draft.  ║
-- ║                                                                          ║
-- ║ Replaces (alongside) the localStorage-only persistence in:              ║
-- ║   src/contexts/SetupAgentContext.tsx                                     ║
-- ║   src/services/setup-agent/setup-agent.service.ts (getProgress/save)    ║
-- ║                                                                          ║
-- ║ Idempotent — CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS, etc.    ║
-- ║ Safe to re-run.                                                          ║
-- ║                                                                          ║
-- ║ AMOS-impact: NONE.                                                       ║
-- ║   This table is exclusively a marketing-web wizard concern. AMOS         ║
-- ║   mobile has its own onboarding flow and does not read this table.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. setup_sessions — one open draft per user, plus completed history rows
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.setup_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- 'onboarding' = first-time full-page wizard
  -- 'sidebar'    = in-app reconfiguration (6 steps)
  mode                TEXT NOT NULL DEFAULT 'onboarding',

  -- Which phase/step the user is currently on (0-indexed).
  -- For 'onboarding' that's the 6-phase wizard; for 'sidebar' the 6-step
  -- linear flow.
  current_step        INTEGER NOT NULL DEFAULT 0,

  -- Steps the user has explicitly completed (kept as TEXT[] not JSONB
  -- because we filter on .contains() / .overlaps() in some queries).
  completed_steps     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Full OnboardingData / SetupProgress payload — the canonical wizard
  -- state. UPSERT-friendly so the client can splat partial updates and
  -- have the row merged.
  step_data           JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Lifecycle: 'draft' (in progress), 'completed' (finalize ran),
  -- 'abandoned' (no update in > 30 days — for cleanup jobs).
  status              TEXT NOT NULL DEFAULT 'draft',

  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

-- One ACTIVE draft per (user, mode). Completed/abandoned rows don't count
-- so a user can re-do their setup after finishing once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_setup_sessions_one_draft
  ON public.setup_sessions (user_id, mode)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_setup_sessions_user
  ON public.setup_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_setup_sessions_last_updated
  ON public.setup_sessions (last_updated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RLS — strict per-user isolation. No org-scope: the wizard is private
--    to the user until they finalize and the data lands in the org tables.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.setup_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS setup_sessions_owner ON public.setup_sessions;
CREATE POLICY setup_sessions_owner ON public.setup_sessions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Auto-bump last_updated_at on every row change
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.setup_sessions_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.last_updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS setup_sessions_touch_trg ON public.setup_sessions;
CREATE TRIGGER setup_sessions_touch_trg
  BEFORE UPDATE ON public.setup_sessions
  FOR EACH ROW EXECUTE FUNCTION public.setup_sessions_touch();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Drop blocking CHECK constraints if any pre-existing (defensive — the
--    table is fresh on most environments but Lovable may have created a
--    skeleton)
-- ─────────────────────────────────────────────────────────────────────────
DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.setup_sessions'::regclass AND contype = 'c'
  LOOP
    EXECUTE 'ALTER TABLE public.setup_sessions DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Reload PostgREST schema cache so the new table is reachable from the
--    SPA immediately (no need to wait for the scheduled reload)
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Verification — confirm the table, index, policy and trigger are in
--    place. Expected output: 1 row per object.
-- ─────────────────────────────────────────────────────────────────────────
SELECT 'table'    AS kind, table_name   AS name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'setup_sessions'
UNION ALL
SELECT 'index'    AS kind, indexname    AS name FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'setup_sessions'
UNION ALL
SELECT 'policy'   AS kind, policyname   AS name FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'setup_sessions'
UNION ALL
SELECT 'trigger'  AS kind, tgname       AS name FROM pg_trigger
  WHERE tgrelid = 'public.setup_sessions'::regclass AND NOT tgisinternal;

COMMIT;
