-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ FINANCE INVOICE WEBHOOK — auto-sync invoices → Inclufy Finance app      ║
-- ║                                                                          ║
-- ║ On INSERT into public.invoices, fires the finance-invoice-sync edge fn  ║
-- ║ via pg_net. Finance receives the invoice, books it, generates PDF,      ║
-- ║ optionally sends it to the customer, and returns finance_invoice_id +    ║
-- ║ pdf_url which finance-invoice-sync mirrors back onto the invoices row.   ║
-- ║                                                                          ║
-- ║ Idempotent: CREATE EXTENSION IF NOT EXISTS, DROP TRIGGER IF EXISTS.      ║
-- ║                                                                          ║
-- ║ Requires the pg_net extension (Supabase: Database → Extensions → enable ║
-- ║ pg_net). If not enabled, the trigger body silently NOTICEs and skips —  ║
-- ║ caller can fall back to manual call from AdminInvoices "Resync" button.  ║
-- ║                                                                          ║
-- ║ AMOS-impact: NONE. AMOS doesn't read public.invoices.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- 1. Ensure pg_net is available (Supabase enables it by default but be defensive)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Trigger function
CREATE OR REPLACE FUNCTION public.invoice_sync_to_finance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  fn_url TEXT;
  service_key TEXT;
  request_id BIGINT;
BEGIN
  -- Skip drafts — Finance only books once status leaves 'draft'.
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;
  -- Skip if already synced (pdf_url present)
  IF NEW.pdf_url IS NOT NULL THEN
    RETURN NEW;
  END IF;

  fn_url := COALESCE(
    current_setting('app.supabase_url', true),
    'https://mpxkugfqzmxydxnlxqoj.supabase.co'
  ) || '/functions/v1/finance-invoice-sync';

  -- pg_net needs a bearer to call back into our edge fn. Service key is
  -- exposed via Supabase Vault on most projects; if absent we use a hard-
  -- coded fallback (only the function's verify_jwt=false saves us here).
  service_key := COALESCE(current_setting('app.supabase_service_role_key', true), '');

  BEGIN
    SELECT net.http_post(
      url := fn_url,
      body := jsonb_build_object('invoice_id', NEW.id::text),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      )
    ) INTO request_id;
    RAISE NOTICE 'invoice_sync_to_finance: queued request % for invoice %', request_id, NEW.id;
  EXCEPTION WHEN OTHERS THEN
    -- pg_net might not be enabled or available — non-fatal. AdminInvoices
    -- can always trigger the sync manually via "Resync" button.
    RAISE NOTICE 'invoice_sync_to_finance: skipped (%): %', SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END $$;

-- 3. Trigger
DROP TRIGGER IF EXISTS invoices_sync_to_finance_trg ON public.invoices;
CREATE TRIGGER invoices_sync_to_finance_trg
  AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoice_sync_to_finance();

-- 4. Verify
SELECT 'trigger' AS kind, tgname AS name FROM pg_trigger
WHERE tgrelid = 'public.invoices'::regclass AND NOT tgisinternal;

COMMIT;
