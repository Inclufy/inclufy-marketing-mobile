// create-checkout — Stripe checkout session creator for a chosen plan.
// Input:  { plan_slug: 'starter'|'growth'|'business'|'enterprise', billing_cycle: 'monthly'|'yearly', success_url?, cancel_url? }
// Output: { checkout_url, session_id, mode: 'subscription' }
//
// Requires STRIPE_SECRET_KEY env var. If absent the function returns a
// 503 with an honest "Stripe not configured" error — caller renders a
// "Contact sales" fallback CTA instead of pretending checkout exists.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAuthUser, jsonResp, corsHeaders } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const APP_BASE_URL = Deno.env.get('APP_BASE_URL') ?? 'https://marketing.inclufy.com';
const FN_NAME = 'create-checkout';

// Map slug → Stripe price IDs. In production set these as env vars or read
// from pricing_tiers.stripe_price_id_monthly/yearly. For now we expose
// `STRIPE_PRICE_<SLUG>_<CYCLE>` env-var convention.
function priceIdFor(slug: string, cycle: 'monthly' | 'yearly'): string | null {
  const key = `STRIPE_PRICE_${slug.toUpperCase()}_${cycle.toUpperCase()}`;
  return Deno.env.get(key) || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    if (!STRIPE_SECRET_KEY) {
      return jsonResp({ error: 'stripe_not_configured', message: 'STRIPE_SECRET_KEY is not set. Set it as a Supabase function secret to enable checkout.' }, 503);
    }

    const user = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const slug = String(body.plan_slug ?? '').toLowerCase();
    const cycle = body.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
    if (!['starter', 'growth', 'business'].includes(slug)) {
      return jsonResp({ error: 'invalid plan_slug', valid: ['starter', 'growth', 'business'] }, 400);
    }

    const priceId = priceIdFor(slug, cycle);
    if (!priceId) {
      return jsonResp({ error: 'price_not_configured', message: `STRIPE_PRICE_${slug.toUpperCase()}_${cycle.toUpperCase()} env var missing.` }, 503);
    }

    const successUrl = String(body.success_url ?? `${APP_BASE_URL}/app/billing?status=success&session_id={CHECKOUT_SESSION_ID}`);
    const cancelUrl = String(body.cancel_url ?? `${APP_BASE_URL}/app/billing?status=cancel`);

    // Build form-urlencoded body (Stripe API uses application/x-www-form-urlencoded)
    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    params.set('payment_method_types[]', 'card');
    params.set('line_items[0][price]', priceId);
    params.set('line_items[0][quantity]', '1');
    params.set('success_url', successUrl);
    params.set('cancel_url', cancelUrl);
    params.set('customer_email', user.email ?? '');
    params.set('client_reference_id', user.id);
    params.set('subscription_data[metadata][user_id]', user.id);
    params.set('subscription_data[metadata][plan_slug]', slug);
    params.set('subscription_data[metadata][billing_cycle]', cycle);
    if (cycle === 'monthly') {
      params.set('subscription_data[trial_period_days]', '14');
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const stripeJson = await stripeRes.json();
    if (!stripeRes.ok) {
      console.error(`[${FN_NAME}] Stripe ${stripeRes.status}:`, stripeJson);
      return jsonResp({ error: 'stripe_error', detail: stripeJson.error?.message ?? 'unknown' }, 502);
    }

    return jsonResp({ checkout_url: stripeJson.url, session_id: stripeJson.id, mode: 'subscription' });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
