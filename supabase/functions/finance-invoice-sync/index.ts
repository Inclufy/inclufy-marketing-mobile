// finance-invoice-sync — push a Marketing invoice to the Inclufy Finance app.
//
// Marketing (this project, mpxkugfqzmxydxnlxqoj) is the source-of-truth for
// SUBSCRIPTION billing (Starter/Growth/Business plans, generated on Stripe
// payment). Inclufy Finance (separate project, nruqfegrngpzoigflexn) is the
// canonical AR/AP / accounting system that needs to:
//   1) Book the invoice (debiteurenadministratie)
//   2) Send the PDF + email to the customer
//   3) Match incoming bank transactions (CAMT.053 via Finance reconciliation)
//
// This fn POSTs a Marketing invoice to Finance's `/api/invoices/intake`
// endpoint with a shared bearer secret. Finance responds with
// { booked: true, pdf_url, finance_invoice_id } which we mirror back onto
// the Marketing invoice row (so AdminInvoices download button lights up).
//
// Triggered by:
//  • DB trigger on public.invoices INSERT (recommended — see migration
//    20260524110000_finance_invoice_webhook.sql)
//  • Manual call from AdminInvoices "Resync" button
//  • Stripe webhook handler when a new invoice arrives from Stripe
//
// Env required (Supabase secrets):
//   FINANCE_APP_BASE_URL   = https://finance.inclufy.com  (or the Cloudflare Tunnel hostname)
//   FINANCE_INTAKE_SECRET  = shared bearer secret matched by Finance's
//                            intake endpoint. Rotate quarterly.
//
// Input:  POST { invoice_id: uuid }
// Output: { synced: true, finance_invoice_id, pdf_url } or { error }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FINANCE_APP_BASE_URL = Deno.env.get('FINANCE_APP_BASE_URL') ?? '';
const FINANCE_INTAKE_SECRET = Deno.env.get('FINANCE_INTAKE_SECRET') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResp(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    // Configuration check — fail loudly so the missing env var is obvious in
    // logs, not silently dropped.
    if (!FINANCE_APP_BASE_URL || !FINANCE_INTAKE_SECRET) {
      return jsonResp({
        error: 'finance_not_configured',
        message: 'Set FINANCE_APP_BASE_URL and FINANCE_INTAKE_SECRET as Supabase function secrets to enable invoice sync.',
      }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const invoiceId = String(body.invoice_id ?? '').trim();
    if (!invoiceId) return jsonResp({ error: 'invoice_id required' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Pull the invoice + org context — Finance needs both
    const { data: invoice, error: invErr } = await admin
      .from('invoices')
      .select('id, number, amount, status, due_date, line_items, organization_id, created_at')
      .eq('id', invoiceId)
      .maybeSingle();
    if (invErr || !invoice) return jsonResp({ error: 'invoice_not_found', detail: invErr?.message }, 404);

    const { data: org } = await admin
      .from('organizations')
      .select('id, name, slug, settings')
      .eq('id', invoice.organization_id)
      .maybeSingle();

    // Build the Finance intake payload — mirrors the contract that Inclufy
    // Finance's POST /api/invoices/intake expects (CAMT.053-compatible shape
    // so reconciliation can match bank rows against invoice.number).
    const payload = {
      source: 'inclufy-marketing',
      source_invoice_id: invoice.id,
      number: invoice.number,
      organization: org ? {
        id: org.id,
        name: org.name,
        slug: org.slug,
        // Finance needs the customer's billing details from org settings
        billing_email: (org.settings as any)?.billing?.email ?? null,
        vat_number: (org.settings as any)?.billing?.vat_number ?? null,
      } : null,
      amount_total: Number(invoice.amount),
      currency: 'EUR',
      status: invoice.status,
      due_date: invoice.due_date,
      issued_at: invoice.created_at,
      line_items: invoice.line_items ?? [],
    };

    const url = `${FINANCE_APP_BASE_URL.replace(/\/$/, '')}/api/invoices/intake`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FINANCE_INTAKE_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const respText = await r.text();
    let respJson: any = {};
    try { respJson = JSON.parse(respText); } catch { /* not JSON */ }

    if (!r.ok) {
      console.error(`[finance-invoice-sync] Finance ${r.status}:`, respText.slice(0, 400));
      return jsonResp({
        error: 'finance_intake_failed',
        status: r.status,
        detail: respJson?.error ?? respText.slice(0, 200),
      }, 502);
    }

    // Finance returned PDF URL + its own invoice id — mirror back onto our row
    // so AdminInvoices download button works without a second roundtrip.
    if (respJson?.pdf_url || respJson?.finance_invoice_id) {
      await admin.from('invoices').update({
        pdf_url: respJson.pdf_url ?? null,
        // We don't have a finance_invoice_id column yet; store under stripe_invoice_id
        // as the external-system reference until a dedicated column is added.
        ...(respJson.finance_invoice_id
          ? { stripe_invoice_id: `finance:${respJson.finance_invoice_id}` }
          : {}),
      }).eq('id', invoiceId);
    }

    return jsonResp({
      synced: true,
      finance_invoice_id: respJson?.finance_invoice_id ?? null,
      pdf_url: respJson?.pdf_url ?? null,
    });
  } catch (e) {
    console.error('[finance-invoice-sync]', e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
