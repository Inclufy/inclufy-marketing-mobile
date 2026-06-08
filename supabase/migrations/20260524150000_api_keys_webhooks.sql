-- Canonical migration for api_keys extensions + webhooks table.
-- Applied live on 2026-05-24 via Management API; this file is for
-- supabase db reset reproducibility.
BEGIN;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS last_used_ip TEXT;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS prefix TEXT;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ak_read ON public.api_keys;
CREATE POLICY ak_read ON public.api_keys FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS ak_admin_write ON public.api_keys;
CREATE POLICY ak_admin_write ON public.api_keys FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner','admin')))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
CREATE TABLE IF NOT EXISTS public.webhooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  secret          TEXT NOT NULL,
  events          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  active          BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_status     INT,
  failure_count   INT NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wh_org ON public.webhooks(organization_id);
CREATE INDEX IF NOT EXISTS idx_wh_active ON public.webhooks(active) WHERE active = true;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wh_admin_all ON public.webhooks;
CREATE POLICY wh_admin_all ON public.webhooks FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner','admin')))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));
COMMIT;
