// webhooks-dispatch — drains pending rows from public.webhook_deliveries
// and POSTs each payload to the customer-configured webhook.url, signed
// with HMAC-SHA256 using the webhook's `secret`.
//
// Three call modes:
//   1. Empty body / POST  → drain mode (max 25 deliveries per invocation
//      to stay under edge-fn CPU/time limits). Typical caller: a 1-min
//      cron-trigger or "fire after enqueue" from another edge fn.
//   2. { webhook_delivery_id: <uuid> } → process exactly that row.
//   3. { enqueue: { event, payload }, organization_id } → service-role
//      callers can enqueue without going through the SQL helper. Caller
//      must include the SERVICE-ROLE auth in the Authorization header.
//
// Signing scheme:
//   Header: X-Inclufy-Signature: t=<unix-ts>,v1=<hex hmac>
//   Body:   raw JSON payload as sent
//   Hmac:   HMAC_SHA256(secret, `${t}.${body}`)
//   Customers verify by:
//     1. extracting t and v1 from the header
//     2. recomputing HMAC and constant-time-comparing to v1
//     3. rejecting if abs(now - t) > 300s (replay window)
//
// Retry policy:
//   • network error or 5xx → backoff: 30s, 2m, 10m, 1h, 6h (5 attempts)
//   • 4xx (except 429) → straight to dead_letter (client config error,
//     pointless to retry)
//   • 429 → backoff like 5xx
//   • after 5th failed attempt → dead_letter, increment webhooks.failure_count
//   • on success → mark delivered, update webhooks.last_triggered_at + last_status

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BATCH = 25;
const MAX_ATTEMPTS = 5;
const BACKOFF_SECONDS = [30, 120, 600, 3600, 21600]; // 30s, 2m, 10m, 1h, 6h
const DELIVERY_TIMEOUT_MS = 10_000;

function jsonResp(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface DeliveryRow {
  id: string;
  webhook_id: string;
  organization_id: string;
  event: string;
  payload: unknown;
  attempt_count: number;
  status: string;
}

interface WebhookRow {
  id: string;
  url: string;
  secret: string;
  failure_count: number;
}

interface DeliveryResult {
  id: string;
  status: 'delivered' | 'pending' | 'dead_letter';
  http_status?: number;
  error?: string;
  next_attempt_at?: string;
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function deliverOne(d: DeliveryRow, w: WebhookRow): Promise<DeliveryResult> {
  const body = JSON.stringify({
    event: d.event,
    delivery_id: d.id,
    occurred_at: new Date().toISOString(),
    organization_id: d.organization_id,
    payload: d.payload,
  });
  const ts = Math.floor(Date.now() / 1000);
  const sig = await hmacSha256Hex(w.secret, `${ts}.${body}`);

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), DELIVERY_TIMEOUT_MS);
  let httpStatus: number | null = null;
  let responseText = '';
  let networkError: string | null = null;

  try {
    const res = await fetch(w.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Inclufy-Webhooks/1.0',
        'X-Inclufy-Event': d.event,
        'X-Inclufy-Delivery': d.id,
        'X-Inclufy-Signature': `t=${ts},v1=${sig}`,
      },
      body,
      signal: ac.signal,
    });
    httpStatus = res.status;
    responseText = (await res.text()).slice(0, 1024); // cap to 1 KB for storage
  } catch (e: any) {
    networkError = (e as Error)?.message ?? 'fetch failed';
  } finally {
    clearTimeout(timeout);
  }

  const success = httpStatus !== null && httpStatus >= 200 && httpStatus < 300;
  const clientErrorNoRetry =
    httpStatus !== null && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 429;

  const nextAttempt = d.attempt_count + 1;
  let nextStatus: 'delivered' | 'pending' | 'dead_letter' = 'pending';
  let nextAttemptAt: string | undefined;

  if (success) {
    nextStatus = 'delivered';
  } else if (clientErrorNoRetry || nextAttempt >= MAX_ATTEMPTS) {
    nextStatus = 'dead_letter';
  } else {
    nextStatus = 'pending';
    const seconds = BACKOFF_SECONDS[Math.min(nextAttempt - 1, BACKOFF_SECONDS.length - 1)];
    nextAttemptAt = new Date(Date.now() + seconds * 1000).toISOString();
  }

  // Persist delivery outcome
  await admin.from('webhook_deliveries').update({
    attempt_count: nextAttempt,
    status: nextStatus,
    last_status: httpStatus,
    last_error: networkError,
    last_response: responseText || null,
    delivered_at: success ? new Date().toISOString() : null,
    next_attempt_at: nextAttemptAt ?? new Date(0).toISOString(), // 1970 for non-pending so the partial index drops it
  }).eq('id', d.id);

  // Update webhook aggregate counters
  if (success) {
    await admin.from('webhooks').update({
      last_triggered_at: new Date().toISOString(),
      last_status: httpStatus,
      failure_count: 0,
    }).eq('id', w.id);
  } else if (nextStatus === 'dead_letter') {
    await admin.from('webhooks').update({
      last_triggered_at: new Date().toISOString(),
      last_status: httpStatus,
      failure_count: (w.failure_count ?? 0) + 1,
    }).eq('id', w.id);
  }

  return {
    id: d.id,
    status: nextStatus,
    http_status: httpStatus ?? undefined,
    error: networkError ?? undefined,
    next_attempt_at: nextAttemptAt,
  };
}

async function drainBatch(specificDeliveryId?: string): Promise<DeliveryResult[]> {
  // Fetch pending deliveries due now (or one specific row)
  let query = admin
    .from('webhook_deliveries')
    .select('id, webhook_id, organization_id, event, payload, attempt_count, status')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(MAX_BATCH);

  if (specificDeliveryId) {
    query = admin
      .from('webhook_deliveries')
      .select('id, webhook_id, organization_id, event, payload, attempt_count, status')
      .eq('id', specificDeliveryId)
      .limit(1);
  }

  const { data: deliveries, error } = await query;
  if (error) throw new Error(`select_failed: ${error.message}`);
  const rows = (deliveries ?? []) as DeliveryRow[];
  if (rows.length === 0) return [];

  // Bulk-fetch webhook rows for these deliveries (one query, indexed)
  const webhookIds = [...new Set(rows.map((r) => r.webhook_id))];
  const { data: webhooks, error: whErr } = await admin
    .from('webhooks')
    .select('id, url, secret, failure_count, active')
    .in('id', webhookIds);
  if (whErr) throw new Error(`webhook_select_failed: ${whErr.message}`);

  const wmap = new Map<string, WebhookRow & { active: boolean }>();
  for (const w of (webhooks ?? []) as Array<WebhookRow & { active: boolean }>) wmap.set(w.id, w);

  // Process deliveries in parallel — independent, no shared state.
  const results = await Promise.all(rows.map(async (d) => {
    const w = wmap.get(d.webhook_id);
    if (!w) {
      // Orphaned delivery — webhook was deleted. Mark dead_letter.
      await admin.from('webhook_deliveries').update({
        status: 'dead_letter',
        last_error: 'webhook_not_found',
      }).eq('id', d.id);
      return { id: d.id, status: 'dead_letter' as const, error: 'webhook_not_found' };
    }
    if (!w.active) {
      // Webhook disabled mid-flight. Skip — leave row pending so it
      // resumes if the user re-enables.
      return { id: d.id, status: 'pending' as const, error: 'webhook_inactive' };
    }
    return deliverOne(d, w);
  }));

  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const body = await req.json().catch(() => ({}));

    // Mode 3: enqueue a new delivery (service-role only)
    if (body?.enqueue && body?.organization_id) {
      const event = String(body.enqueue.event ?? '').trim();
      if (!event) return jsonResp({ error: 'enqueue.event required' }, 400);
      const payload = body.enqueue.payload ?? {};

      const { data: matches, error } = await admin
        .from('webhooks')
        .select('id, organization_id, events, active')
        .eq('organization_id', body.organization_id)
        .eq('active', true);
      if (error) return jsonResp({ error: 'lookup_failed', detail: error.message }, 500);

      const rows = (matches ?? []).filter((w: any) =>
        Array.isArray(w.events) && (w.events.length === 0 || w.events.includes(event))
      );
      if (rows.length === 0) return jsonResp({ enqueued: 0 });

      const inserts = rows.map((w: any) => ({
        webhook_id: w.id,
        organization_id: w.organization_id,
        event,
        payload,
      }));
      const { data: inserted, error: insErr } = await admin
        .from('webhook_deliveries')
        .insert(inserts)
        .select('id');
      if (insErr) return jsonResp({ error: 'enqueue_failed', detail: insErr.message }, 500);

      // Fall through to drain mode so the freshly enqueued rows are
      // attempted immediately rather than waiting for the next cron tick.
    }

    const specificDeliveryId = body?.webhook_delivery_id
      ? String(body.webhook_delivery_id)
      : undefined;

    const results = await drainBatch(specificDeliveryId);

    return jsonResp({
      processed: results.length,
      delivered: results.filter((r) => r.status === 'delivered').length,
      dead_letter: results.filter((r) => r.status === 'dead_letter').length,
      pending_retry: results.filter((r) => r.status === 'pending').length,
      results,
    });
  } catch (e) {
    console.error('[webhooks-dispatch]', e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
