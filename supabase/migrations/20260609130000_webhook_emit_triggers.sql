-- Webhook event emit triggers.
-- Wires the natural emit-points in app data to enqueue_webhook_event_for_org()
-- so customers receive real-time notifications without any client-side code
-- having to remember to call the dispatcher.
--
-- Events emitted by this migration:
--   contact.created       — AFTER INSERT ON contacts
--   post.published        — AFTER UPDATE ON library_posts (status -> 'published')
--   post.failed           — AFTER UPDATE ON library_posts (status -> 'failed')
--   campaign.created      — AFTER INSERT ON ad_campaigns
--   campaign.approved     — AFTER UPDATE ON ad_campaigns (status -> 'approved')
--
-- Other doc-listed events (post.approval_requested, event.scanned, lead.scored,
-- agent.run_completed) currently fire from edge-fn code paths and will be
-- wired in a follow-up — those tables don't yet have a clean "transition"
-- column to anchor a trigger on.
--
-- All triggers route through enqueue_webhook_event_for_org which we
-- introduce here — a trigger-safe sibling of enqueue_webhook_event
-- (which uses auth.uid() and is unreachable from a SECURITY DEFINER
-- trigger called by service_role).

BEGIN;

-- Trigger-safe variant. Takes the org explicitly so triggers don't depend
-- on auth.uid() being set. SECURITY DEFINER so it can write
-- webhook_deliveries from any caller context.
CREATE OR REPLACE FUNCTION public.enqueue_webhook_event_for_org(
  p_org UUID,
  p_event TEXT,
  p_payload JSONB
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_queued INT := 0;
BEGIN
  IF p_org IS NULL THEN RETURN 0; END IF;

  INSERT INTO public.webhook_deliveries
    (webhook_id, organization_id, event, payload)
  SELECT w.id, w.organization_id, p_event, p_payload
  FROM public.webhooks w
  WHERE w.organization_id = p_org
    AND w.active = true
    AND (p_event = ANY(w.events) OR cardinality(w.events) = 0);

  GET DIAGNOSTICS v_queued = ROW_COUNT;
  RETURN v_queued;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- contacts: contact.created
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_contacts_emit_webhook() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org UUID;
BEGIN
  -- contacts.organization_id is set directly on most modern rows; fall
  -- back to deriving from the inserter's org membership.
  v_org := NEW.organization_id;
  IF v_org IS NULL THEN
    SELECT organization_id INTO v_org FROM public.organization_members
    WHERE user_id = NEW.user_id LIMIT 1;
  END IF;

  -- contacts has no dedicated 'source' column; lookup attributes->>'source'
  -- which the import paths populate, then fall back to null.
  PERFORM public.enqueue_webhook_event_for_org(
    v_org,
    'contact.created',
    jsonb_build_object(
      'contact_id', NEW.id,
      'email',      NEW.email,
      'source',     NEW.attributes->>'source',
      'tags',       NEW.tags,
      'created_at', NEW.created_at
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_emit_webhook ON public.contacts;
CREATE TRIGGER contacts_emit_webhook
  AFTER INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.trg_contacts_emit_webhook();

-- ─────────────────────────────────────────────────────────────────────
-- library_posts: post.published + post.failed (status transitions)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_library_posts_emit_webhook() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org UUID;
  v_event TEXT;
BEGIN
  -- Only fire on status TRANSITION (not every update)
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  IF NEW.status = 'published' THEN v_event := 'post.published';
  ELSIF NEW.status = 'failed' THEN v_event := 'post.failed';
  ELSE RETURN NEW;
  END IF;

  -- library_posts has no organization_id column — derive via user_id
  SELECT organization_id INTO v_org FROM public.organization_members
  WHERE user_id = NEW.user_id LIMIT 1;

  PERFORM public.enqueue_webhook_event_for_org(
    v_org,
    v_event,
    jsonb_build_object(
      'post_id',      NEW.id,
      'channels',     NEW.channels,
      'status',       NEW.status,
      'published_at', NEW.published_at
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS library_posts_emit_webhook ON public.library_posts;
CREATE TRIGGER library_posts_emit_webhook
  AFTER UPDATE OF status ON public.library_posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_library_posts_emit_webhook();

-- ─────────────────────────────────────────────────────────────────────
-- ad_campaigns: campaign.created + campaign.approved
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_ad_campaigns_emit_create_webhook() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_webhook_event_for_org(
    NEW.organization_id,
    'campaign.created',
    jsonb_build_object(
      'campaign_id', NEW.id,
      'channel',     NEW.channel,
      'status',      NEW.status,
      'created_at',  NEW.created_at
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ad_campaigns_emit_create_webhook ON public.ad_campaigns;
CREATE TRIGGER ad_campaigns_emit_create_webhook
  AFTER INSERT ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.trg_ad_campaigns_emit_create_webhook();

CREATE OR REPLACE FUNCTION public.trg_ad_campaigns_emit_approve_webhook() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;

  PERFORM public.enqueue_webhook_event_for_org(
    NEW.organization_id,
    'campaign.approved',
    jsonb_build_object(
      'campaign_id',  NEW.id,
      'channel',      NEW.channel,
      'approved_at',  COALESCE(NEW.approved_at, now())
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ad_campaigns_emit_approve_webhook ON public.ad_campaigns;
CREATE TRIGGER ad_campaigns_emit_approve_webhook
  AFTER UPDATE OF status ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.trg_ad_campaigns_emit_approve_webhook();

COMMIT;
