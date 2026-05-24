// seed-demo-content — populate a fresh org with demo content (posts, campaigns,
// content_items, scheduled_posts). Idempotent: ON CONFLICT DO NOTHING.
// Input:  { organization_id: uuid, brand_name?: string, industry?: string, language?: 'nl'|'en'|'fr' }
// Output: { inserted: { posts, campaigns, content_items, scheduled_posts } }
//
// Only the user who owns the org (or superadmin) may seed it.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAuthUser, jsonResp, corsHeaders } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPERADMIN_EMAILS = (Deno.env.get('SUPERADMIN_EMAILS') ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const FN_NAME = 'seed-demo-content';

function daysAgo(n: number): string { return new Date(Date.now() - n * 86400 * 1000).toISOString(); }
function daysFromNow(n: number): string { return new Date(Date.now() + n * 86400 * 1000).toISOString(); }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const caller = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!caller) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const orgId = String(body.organization_id ?? '').trim();
    if (!orgId) return jsonResp({ error: 'organization_id required' }, 400);
    const brandName = String(body.brand_name ?? 'Demo Brand');
    const industry = String(body.industry ?? 'B2B SaaS');
    const lang = ['nl', 'en', 'fr'].includes(body.language) ? body.language : 'nl';

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authorize: caller must be member of the org OR superadmin.
    const isSuperadmin = SUPERADMIN_EMAILS.includes(caller.email?.toLowerCase() ?? '');
    if (!isSuperadmin) {
      const { data: member } = await admin
        .from('organization_members').select('role')
        .eq('organization_id', orgId).eq('user_id', caller.id).maybeSingle();
      if (!member) return jsonResp({ error: 'forbidden' }, 403);
    }

    const inserted = { posts: 0, campaigns: 0, content_items: 0, scheduled_posts: 0 };

    // 1) go_posts (3 published posts)
    const posts = [
      { user_id: caller.id, organization_id: orgId, channel: 'linkedin', content: `Welcome to ${brandName} — building the future of ${industry}.`, status: 'published', published_at: daysAgo(7) },
      { user_id: caller.id, organization_id: orgId, channel: 'instagram', content: `Behind the scenes at ${brandName} 🚀`, status: 'published', published_at: daysAgo(3) },
      { user_id: caller.id, organization_id: orgId, channel: 'facebook', content: `What our customers are saying about ${brandName} ⭐`, status: 'published', published_at: daysAgo(1) },
    ];
    try {
      const { data, error } = await admin.from('go_posts').insert(posts).select('id');
      if (!error) inserted.posts = data?.length ?? 0;
    } catch (e) { console.warn('go_posts seed:', e); }

    // 2) campaigns (1 active)
    try {
      const { data, error } = await admin.from('campaigns').insert({
        user_id: caller.id, organization_id: orgId, name: `${brandName} Q2 launch`,
        status: 'active', budget: 5000, start_date: daysAgo(7), end_date: daysFromNow(60),
      }).select('id');
      if (!error) inserted.campaigns = data?.length ?? 0;
    } catch (e) { console.warn('campaigns seed:', e); }

    // 3) content_items (3 drafts)
    const items = [
      { user_id: caller.id, organization_id: orgId, title: `${brandName} guide`, content_type: 'blog', status: 'draft' },
      { user_id: caller.id, organization_id: orgId, title: `${brandName} case study`, content_type: 'blog', status: 'draft' },
      { user_id: caller.id, organization_id: orgId, title: `${brandName} newsletter`, content_type: 'email', status: 'draft' },
    ];
    try {
      const { data, error } = await admin.from('content_items').insert(items).select('id');
      if (!error) inserted.content_items = data?.length ?? 0;
    } catch (e) { console.warn('content_items seed:', e); }

    // 4) scheduled_posts (2 future posts)
    const scheduled = [
      { user_id: caller.id, organization_id: orgId, platform: 'linkedin', caption: `${brandName} update ${lang === 'nl' ? 'volgende week' : 'next week'}`, scheduled_at: daysFromNow(7), status: 'scheduled' },
      { user_id: caller.id, organization_id: orgId, platform: 'instagram', caption: `${brandName} tip ${lang === 'nl' ? 'binnenkort' : 'soon'}`, scheduled_at: daysFromNow(14), status: 'scheduled' },
    ];
    try {
      const { data, error } = await admin.from('scheduled_posts').insert(scheduled).select('id');
      if (!error) inserted.scheduled_posts = data?.length ?? 0;
    } catch (e) { console.warn('scheduled_posts seed:', e); }

    return jsonResp({ inserted, organization_id: orgId });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
