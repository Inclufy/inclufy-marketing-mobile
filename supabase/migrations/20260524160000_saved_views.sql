-- Saved views (P1) — applied live 2026-05-24 via Management API.
BEGIN;
CREATE TABLE IF NOT EXISTS public.saved_views (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  name            TEXT NOT NULL,
  filters         JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort            JSONB DEFAULT '{}'::jsonb,
  visible_columns TEXT[],
  shared          BOOLEAN NOT NULL DEFAULT false,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sv_user_entity ON public.saved_views(user_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_sv_org_shared ON public.saved_views(organization_id, entity_type) WHERE shared = true;
ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sv_read ON public.saved_views;
CREATE POLICY sv_read ON public.saved_views FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR (shared = true AND organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()))
);
DROP POLICY IF EXISTS sv_own_write ON public.saved_views;
CREATE POLICY sv_own_write ON public.saved_views FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.saved_views_touch() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS saved_views_touch_trg ON public.saved_views;
CREATE TRIGGER saved_views_touch_trg BEFORE UPDATE ON public.saved_views FOR EACH ROW EXECUTE FUNCTION public.saved_views_touch();
COMMIT;
