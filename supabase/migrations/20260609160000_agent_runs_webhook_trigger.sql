-- agent.run_completed emit trigger.
-- Fires when an agent_runs row transitions to status='completed'.
-- Covers both call-sites in supabase/functions/orchestrator/index.ts
-- (the dispatch flow at L434 + the post-approval flow at L1038) plus
-- any future code path that uses the same UPDATE.
--
-- The other two doc-listed events that don't have triggers yet:
--   event.scanned  — source table `event_scans` does not exist today;
--                    will be added when LiveCaptureScreen scanner ships
--                    the persistence layer (Q3 milestone).
--   lead.scored    — source table `lead_scores` does not exist today;
--                    will be added when the predictive-scoring fn ships
--                    its persistence layer (also Q3).
-- Both will get their own triggers in the migration that introduces them.

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_agent_runs_emit_completed_webhook() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only fire on transition INTO 'completed' (not every UPDATE of a
  -- completed row, not status='running'→'completed' twice in a row).
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;

  PERFORM public.enqueue_webhook_event_for_org(
    NEW.organization_id,
    'agent.run_completed',
    jsonb_build_object(
      'run_id',       NEW.id,
      'agent_id',     NEW.agent_id,
      'outcome',      'completed',
      'output',       NEW.output,
      'finished_at',  COALESCE(NEW.finished_at, now())
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_runs_emit_completed_webhook ON public.agent_runs;
CREATE TRIGGER agent_runs_emit_completed_webhook
  AFTER UPDATE OF status ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.trg_agent_runs_emit_completed_webhook();

COMMIT;
