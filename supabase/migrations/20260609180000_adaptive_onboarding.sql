-- Adaptive / skill-based onboarding.
-- Closes the 0/5 Adaptive Onboarding gap for Marketing identified in
-- COMMON_FEATURES_AUDIT § PM#2. Mirrors the ProjeXtPal donor pattern
-- (backend/accounts/onboarding_views.py:66-115) but adapted for the
-- marketing domain: experience level + primary role drive the step
-- list, copy, defaults, and which optional steps the wizard skips.
--
-- The columns live on profiles (not user_settings) because they're
-- identity facts, not user preferences — they describe WHO the user
-- is, not WHAT they'd like to see. user_settings handles the latter.
--
-- Re-take semantics: the user can re-run the onboarding any time by
-- setting onboarding_completed_at to NULL via Settings → Account →
-- "Onboarding opnieuw doorlopen". The wizard reads these columns on
-- mount and configures itself accordingly.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS experience_level TEXT
    CHECK (experience_level IN ('beginner', 'intermediate', 'expert', 'unknown'))
    DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS primary_role TEXT
    CHECK (primary_role IN ('founder', 'marketer', 'agency', 'in_house', 'consultant', 'other', 'unknown'))
    DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_step_index INT DEFAULT 0;

-- Lightweight view that the wizard polls to know "should I prompt for
-- the welcome / experience question?". Returns true only when the user
-- has NOT yet picked an experience_level (i.e. it's still 'unknown' OR
-- NULL). This is what the SetupAgent welcome screen checks.
CREATE OR REPLACE FUNCTION public.needs_onboarding_intake() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COALESCE(experience_level, 'unknown') = 'unknown'
  FROM public.profiles
  WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.needs_onboarding_intake() TO authenticated;

COMMIT;
