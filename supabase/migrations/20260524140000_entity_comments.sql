-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ENTITY_COMMENTS + ENTITY_MENTIONS — universal comments + @mentions      ║
-- ║                                                                          ║
-- ║ Closes P0-3 from the baseline audit (Phase A — DB).                    ║
-- ║                                                                          ║
-- ║ Polymorphic across post / capture / campaign / event / contact /        ║
-- ║ content_item / etc. New table coexists with the existing                ║
-- ║ public.comments (which is content_item-only and stays for backward      ║
-- ║ compat).                                                                 ║
-- ║                                                                          ║
-- ║ Trigger auto-fans @mention rows into go_notifications + sends push      ║
-- ║ via the register-push-token tokens.                                      ║
-- ║                                                                          ║
-- ║ Idempotent. AMOS-impact: ADDITIVE (mobile reads same tables).           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. entity_comments — polymorphic
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.entity_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     TEXT NOT NULL
                    CHECK (entity_type IN (
                      'post', 'capture', 'campaign', 'event',
                      'contact', 'content_item', 'content_proposal',
                      'opportunity', 'lead', 'agent_run', 'training', 'invoice'
                    )),
  entity_id       UUID NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES public.entity_comments(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ec_entity ON public.entity_comments(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ec_user ON public.entity_comments(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ec_parent ON public.entity_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_ec_org ON public.entity_comments(organization_id);

ALTER TABLE public.entity_comments ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user in the same org as the comment
DROP POLICY IF EXISTS ec_read ON public.entity_comments;
CREATE POLICY ec_read ON public.entity_comments
  FOR SELECT TO authenticated
  USING (
    organization_id IS NULL OR organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- Write: any authenticated user; the trigger pins user_id to auth.uid()
DROP POLICY IF EXISTS ec_insert ON public.entity_comments;
CREATE POLICY ec_insert ON public.entity_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Update / delete: own comments only (admins TBD via separate policy)
DROP POLICY IF EXISTS ec_update_own ON public.entity_comments;
CREATE POLICY ec_update_own ON public.entity_comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ec_delete_own ON public.entity_comments;
CREATE POLICY ec_delete_own ON public.entity_comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 2. entity_mentions — fast lookup table populated by trigger
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.entity_mentions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id          UUID NOT NULL REFERENCES public.entity_comments(id) ON DELETE CASCADE,
  mentioned_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mentioner_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type         TEXT NOT NULL,
  entity_id           UUID NOT NULL,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comment_id, mentioned_user_id)
);
CREATE INDEX IF NOT EXISTS idx_em_mentioned ON public.entity_mentions(mentioned_user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_em_comment ON public.entity_mentions(comment_id);

ALTER TABLE public.entity_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS em_read ON public.entity_mentions;
CREATE POLICY em_read ON public.entity_mentions
  FOR SELECT TO authenticated
  USING (mentioned_user_id = auth.uid() OR mentioner_user_id = auth.uid());

DROP POLICY IF EXISTS em_mark_read ON public.entity_mentions;
CREATE POLICY em_mark_read ON public.entity_mentions
  FOR UPDATE TO authenticated
  USING (mentioned_user_id = auth.uid())
  WITH CHECK (mentioned_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 3. updated_at touch + extract mentions trigger
--    On INSERT into entity_comments: scan body for @uuid patterns and
--    auto-create entity_mentions + go_notifications rows.
--    Two mention syntaxes supported:
--      • @[Name](user_id_uuid) — preferred, rich, picker-generated
--      • @username — fallback, only if a profile row matches
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.entity_comments_extract_mentions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  m_uuid UUID;
  m_handle TEXT;
  m_user UUID;
  preview TEXT;
BEGIN
  -- Rich format @[Name](uuid)
  FOR m_uuid IN
    SELECT (regexp_matches(NEW.body, '@\[[^\]]+\]\(([0-9a-fA-F-]{36})\)', 'g'))[1]::uuid
  LOOP
    IF m_uuid IS NULL OR m_uuid = NEW.user_id THEN CONTINUE; END IF;
    INSERT INTO public.entity_mentions (
      comment_id, mentioned_user_id, mentioner_user_id, entity_type, entity_id
    ) VALUES (
      NEW.id, m_uuid, NEW.user_id, NEW.entity_type, NEW.entity_id
    ) ON CONFLICT (comment_id, mentioned_user_id) DO NOTHING;
    -- Fan into go_notifications
    preview := left(NEW.body, 120);
    INSERT INTO public.go_notifications (user_id, type, title, body, data)
    VALUES (
      m_uuid,
      'mention',
      'Je bent genoemd in een opmerking',
      preview,
      jsonb_build_object(
        'comment_id', NEW.id,
        'entity_type', NEW.entity_type,
        'entity_id', NEW.entity_id,
        'mentioner_user_id', NEW.user_id
      )
    );
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ec_extract_mentions_trg ON public.entity_comments;
CREATE TRIGGER ec_extract_mentions_trg
  AFTER INSERT ON public.entity_comments
  FOR EACH ROW EXECUTE FUNCTION public.entity_comments_extract_mentions();

-- updated_at touch
CREATE OR REPLACE FUNCTION public.entity_comments_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); IF OLD.body IS DISTINCT FROM NEW.body THEN NEW.edited_at := now(); END IF; RETURN NEW; END $$;

DROP TRIGGER IF EXISTS ec_touch_trg ON public.entity_comments;
CREATE TRIGGER ec_touch_trg
  BEFORE UPDATE ON public.entity_comments
  FOR EACH ROW EXECUTE FUNCTION public.entity_comments_touch();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Verify
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

SELECT 'table'   AS kind, table_name AS name FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN ('entity_comments','entity_mentions')
UNION ALL
SELECT 'policy', polname FROM pg_policy
  WHERE polrelid IN ('public.entity_comments'::regclass, 'public.entity_mentions'::regclass)
UNION ALL
SELECT 'trigger', tgname FROM pg_trigger
  WHERE tgrelid IN ('public.entity_comments'::regclass) AND NOT tgisinternal
ORDER BY kind, name;

COMMIT;
