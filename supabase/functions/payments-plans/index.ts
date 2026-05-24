// payments-plans — list available billing plans (public read).
// Input:  GET / POST (no body required)
// Output: { plans: [{id, name, slug, price_monthly, price_yearly, currency, features: string[], stripe_price_id_monthly, stripe_price_id_yearly, popular, cta}] }
//
// Reads from public.pricing_tiers (preferred) or falls back to a hardcoded
// canonical bundle catalogue if the table is empty / missing. Keeps the
// pricing page rendering even before someone seeds the table.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_NAME = 'payments-plans';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
function jsonResp(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

// Canonical bundle catalogue — matches docs/PRICING_BUNDLES.md.
const FALLBACK_PLANS = [
  { id: 'starter', name: 'Starter', slug: 'starter', price_monthly: 29, price_yearly: 290, currency: 'EUR', features: ['1 pillar', 'AI co-pilot', 'Basic analytics', 'NL/EN/FR support'], popular: false, cta: 'Start je pilot' },
  { id: 'growth', name: 'Growth', slug: 'growth', price_monthly: 199, price_yearly: 1990, currency: 'EUR', features: ['2 pillars + Hub FREE', 'Full AI agents', 'Advanced analytics', 'Priority support'], popular: true, cta: 'Start je 14-dagen trial' },
  { id: 'business', name: 'Business', slug: 'business', price_monthly: 599, price_yearly: 5990, currency: 'EUR', features: ['All 5 pillars + Hub', '70% savings vs standalone', 'Dedicated success manager', 'Custom integrations'], popular: false, cta: 'Plan een demo' },
  { id: 'enterprise', name: 'Enterprise', slug: 'enterprise', price_monthly: null, price_yearly: null, currency: 'EUR', features: ['Custom volume pricing', 'SSO + Audit logs', 'White-label option', 'On-premise deployment'], popular: false, cta: 'Contact sales' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') return jsonResp({ error: 'GET or POST' }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await admin
      .from('pricing_tiers')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (!error && data && data.length > 0) {
      return jsonResp({ plans: data, source: 'db' });
    }
    return jsonResp({ plans: FALLBACK_PLANS, source: 'fallback' });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ plans: FALLBACK_PLANS, source: 'fallback', error: (e as Error).message }, 200);
  }
});
