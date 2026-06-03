-- =============================================================================
-- product_issue_comments.visibility — public vs internal triage comments.
--
-- The triage-product-issues edge function (ProjeXtPal pattern port) writes TWO
-- sibling comments per LLM-classified issue:
--   • visibility='public'   — friendly, reporter-facing, no jargon
--   • visibility='internal' — dev/admin only (file paths, edge-fn names, fixes)
--
-- Before this migration every org-member could read every comment. We add the
-- column (default 'public' so all existing rows stay visible) and tighten the
-- SELECT RLS so 'internal' rows are only visible to org admins/owners + service
-- role. Mirrors ProjeXtPal's ProductIssueComment.visibility split.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + DROP/CREATE POLICY guarded.
-- =============================================================================

ALTER TABLE public.product_issue_comments
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'internal'));

COMMENT ON COLUMN public.product_issue_comments.visibility IS
  'public = reporter-visible; internal = admin/owner + service-role only. Set by triage-product-issues edge fn.';

-- ─── Tighten SELECT RLS ──────────────────────────────────────────────────────
-- Replace the old "any org member reads all comments" policy with one that
-- hides internal comments from non-admin/owner members.
DROP POLICY IF EXISTS "Org members read product_issue_comments"
  ON public.product_issue_comments;

DO $$ BEGIN
  CREATE POLICY "Org members read public product_issue_comments"
    ON public.product_issue_comments
    FOR SELECT
    USING (
      visibility = 'public'
      AND EXISTS (
        SELECT 1
          FROM public.product_issues pi
          JOIN public.organization_members om
            ON om.organization_id = pi.organization_id
         WHERE pi.id = product_issue_comments.issue_id
           AND om.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Org admins read internal product_issue_comments"
    ON public.product_issue_comments
    FOR SELECT
    USING (
      visibility = 'internal'
      AND EXISTS (
        SELECT 1
          FROM public.product_issues pi
          JOIN public.organization_members om
            ON om.organization_id = pi.organization_id
         WHERE pi.id = product_issue_comments.issue_id
           AND om.user_id = auth.uid()
           AND om.role IN ('admin', 'owner')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service-role full-access policy already exists from 20260504170000 — unchanged.

NOTIFY pgrst, 'reload schema';
