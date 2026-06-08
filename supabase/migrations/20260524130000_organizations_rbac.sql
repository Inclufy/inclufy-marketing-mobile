-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ORGANIZATIONS + RBAC — canonical migration                               ║
-- ║                                                                          ║
-- ║ Tables `organizations` + `organization_members` were applied live to    ║
-- ║ production (project mpxkugfqzmxydxnlxqoj) on 2026-05-18 / 2026-05-24    ║
-- ║ via SQL Editor / Management API. This file captures the current state   ║
-- ║ so that a fresh `supabase db reset` reproduces it.                       ║
-- ║                                                                          ║
-- ║ Closes P0-4 from the baseline audit "organization_members migration     ║
-- ║ absent" finding. The TABLE was already live; the migration FILE was     ║
-- ║ missing — clean-restore would have broken RLS and multi-seat sales.     ║
-- ║                                                                          ║
-- ║ Idempotent. AMOS-impact: NONE (additive).                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. organizations — tenant root
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  slug                   TEXT NOT NULL UNIQUE,
  plan                   TEXT NOT NULL DEFAULT 'starter',
  settings               JSONB NOT NULL DEFAULT '{}'::jsonb,
  subscription_id        TEXT,
  subscription_status    TEXT,
  current_period_end     TIMESTAMPTZ,
  requires_post_approval BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orgs_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_orgs_subscription_status ON public.organizations(subscription_status)
  WHERE subscription_status IS NOT NULL;

-- Drop any pre-existing CHECKs so legacy `plan` values keep working
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT conname FROM pg_constraint
    WHERE conrelid='public.organizations'::regclass AND contype='c'
  LOOP EXECUTE 'ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. organization_members — composite PK (organization_id, user_id)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_members (
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role             TEXT NOT NULL DEFAULT 'member'
                     CHECK (role IN ('owner','admin','member','viewer')),
  permissions      JSONB NOT NULL DEFAULT '{}'::jsonb,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_om_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_om_org ON public.organization_members(organization_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- organizations: user can see orgs they're a member of
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;
DROP POLICY IF EXISTS orgs_select_member ON public.organizations;
CREATE POLICY orgs_select_member ON public.organizations
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid()
  ));

-- organizations: owner+admin can update settings + plan + post-approval
DROP POLICY IF EXISTS orgs_update_admin ON public.organizations;
CREATE POLICY orgs_update_admin ON public.organizations
  FOR UPDATE TO authenticated
  USING (id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  ))
  WITH CHECK (id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  ));

-- organization_members: user sees own memberships AND co-members of orgs they
-- belong to (so the team-directory page can list the team).
DROP POLICY IF EXISTS om_select_self ON public.organization_members;
DROP POLICY IF EXISTS om_select_co ON public.organization_members;
DROP POLICY IF EXISTS org_members_select_auth ON public.organization_members;
CREATE POLICY om_select_co ON public.organization_members
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid()
  ));

-- organization_members: user can leave own membership (self-delete)
DROP POLICY IF EXISTS om_delete_self ON public.organization_members;
CREATE POLICY om_delete_self ON public.organization_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- organization_members: owner+admin can add new members (insert)
DROP POLICY IF EXISTS om_insert_self ON public.organization_members;
DROP POLICY IF EXISTS om_insert_admin ON public.organization_members;
CREATE POLICY om_insert_admin ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Self-insert (first owner during signup) OR admin/owner of the target org
    user_id = auth.uid()
    OR organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner','admin')
    )
  );

-- organization_members: owner+admin can promote/demote others
DROP POLICY IF EXISTS om_update_admin ON public.organization_members;
CREATE POLICY om_update_admin ON public.organization_members
  FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid() AND role IN ('owner','admin')
  ));

-- ─────────────────────────────────────────────────────────────────────────
-- 4. updated_at touch trigger on organizations
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.organizations_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS organizations_touch_trg ON public.organizations;
CREATE TRIGGER organizations_touch_trg
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_touch();

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Verification
-- ─────────────────────────────────────────────────────────────────────────
SELECT 'table'   AS kind, table_name AS name FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN ('organizations','organization_members')
UNION ALL
SELECT 'policy', polname FROM pg_policy
  WHERE polrelid IN ('public.organizations'::regclass, 'public.organization_members'::regclass)
UNION ALL
SELECT 'trigger', tgname FROM pg_trigger
  WHERE tgrelid IN ('public.organizations'::regclass)
  AND NOT tgisinternal
ORDER BY kind, name;

COMMIT;
