// src/services/analytics.ts
// ──────────────────────────────────────────────────────────────────────────
// Lightweight client-side analytics for the AMOS mobile app.
//
// Design goals:
//   - GDPR-friendly: events go to OUR Supabase (project mpxkugfqzmxydxnlxqoj),
//     no 3rd-party tracker. The schema isolates events per-user via RLS.
//   - Non-blocking: every `track()` returns immediately; writes happen in a
//     micro-batch via setTimeout(0). Network failures are swallowed.
//   - Anonymous-safe: when auth.getUser() returns no user (cold start, sign-out),
//     the event is dropped silently rather than throwing.
//   - Crash-proof: all writes are wrapped in try/catch. A broken analytics
//     pipeline must NEVER break a user-facing flow (publish, upgrade-modal, etc).
//
// Backed by: public.product_events (migration 20260518120000_product_events.sql)
// (NOT public.analytics_events — that name is already taken by a content-metrics
// table with a different schema. The "product_events" name is clearer anyway.)
//
// Read pattern (PostgREST):
//   SELECT event_name, count(*) FROM product_events
//   WHERE event_name LIKE 'upgrade_modal_%' AND created_at > now() - interval '7 days'
//   GROUP BY event_name;
//
// Funnel events emitted by UpgradeModal:
//   - upgrade_modal_shown     { reason, source, limit?, retry_after? }
//   - upgrade_modal_cta_tap   { reason, source, variant?, url }
//   - upgrade_modal_dismissed { reason, source, dwell_ms }
// ──────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

export interface AnalyticsEvent {
  event_name: string;
  event_props?: Record<string, any> | null;
}

let queue: Array<AnalyticsEvent & { ts: number }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_DELAY_MS = 1500;
const MAX_QUEUE = 50;

async function flush(): Promise<void> {
  flushTimer = null;
  if (queue.length === 0) return;

  const batch = queue.splice(0, queue.length);

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Anonymous — drop the batch silently. The product_events RLS only
      // accepts inserts with user_id = auth.uid(), so trying anyway would
      // fail anyway. (No backfill of pre-auth events by design.)
      return;
    }

    const rows = batch.map((e) => ({
      user_id: user.id,
      event_name: e.event_name,
      event_props: e.event_props ?? null,
      created_at: new Date(e.ts).toISOString(),
    }));

    const { error } = await supabase.from('product_events').insert(rows);
    if (error) {
      // Surface to console but never throw — caller is fire-and-forget.
      // eslint-disable-next-line no-console
      console.warn('[analytics] insert failed:', error.message);
    }
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.warn('[analytics] flush error:', err?.message);
  }
}

/**
 * Fire-and-forget event recorder. Safe to call from any render context.
 * Never throws. Never awaits. Never blocks.
 *
 * @example
 *   track('upgrade_modal_shown', { reason: 'free_daily_cap', source: 'amos-postreview' });
 */
export function track(eventName: string, props?: Record<string, any>): void {
  // Hard cap on queue size so a misbehaving caller can't OOM us.
  if (queue.length >= MAX_QUEUE) {
    queue.shift();
  }
  queue.push({ event_name: eventName, event_props: props ?? null, ts: Date.now() });
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      void flush();
    }, FLUSH_DELAY_MS);
  }
}

/**
 * Force a flush (e.g. before backgrounding the app). No-op when queue is empty.
 */
export async function flushNow(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flush();
}
