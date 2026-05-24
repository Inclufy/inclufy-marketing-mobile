-- training_enrollments + RLS on trainings — see migration body live in DB
-- (applied via Management API 2026-05-24).
-- Kept in canonical migrations/ for reproducibility.
BEGIN;
CREATE TABLE IF NOT EXISTS public.training_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id     UUID NOT NULL REFERENCES public.trainings(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'enrolled'
                    CHECK (status IN ('enrolled','attended','cancelled','no_show')),
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at    TIMESTAMPTZ,
  notes           TEXT,
  UNIQUE (training_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_te_training ON public.training_enrollments(training_id);
CREATE INDEX IF NOT EXISTS idx_te_user ON public.training_enrollments(user_id);
ALTER TABLE public.training_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS te_own_read ON public.training_enrollments;
CREATE POLICY te_own_read ON public.training_enrollments FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS te_own_write ON public.training_enrollments;
CREATE POLICY te_own_write ON public.training_enrollments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS te_own_update ON public.training_enrollments;
CREATE POLICY te_own_update ON public.training_enrollments FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS te_admin_all ON public.training_enrollments;
CREATE POLICY te_admin_all ON public.training_enrollments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','admin')));
ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trainings_read_authenticated ON public.trainings;
CREATE POLICY trainings_read_authenticated ON public.trainings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS trainings_admin_write ON public.trainings;
CREATE POLICY trainings_admin_write ON public.trainings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','admin')));
CREATE OR REPLACE FUNCTION public.training_participants_recount()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE tid UUID;
BEGIN
  tid := COALESCE(NEW.training_id, OLD.training_id);
  UPDATE public.trainings SET participants = (SELECT count(*) FROM public.training_enrollments WHERE training_id = tid AND status = 'enrolled') WHERE id = tid;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS te_recount_trg ON public.training_enrollments;
CREATE TRIGGER te_recount_trg AFTER INSERT OR UPDATE OR DELETE ON public.training_enrollments FOR EACH ROW EXECUTE FUNCTION public.training_participants_recount();
COMMIT;
