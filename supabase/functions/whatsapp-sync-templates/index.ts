// Supabase Edge Function: WhatsApp Sync Templates
// Pulls approved + pending templates from Meta Graph API
// (GET /v20.0/{waba_id}/message_templates) and upserts them into whatsapp_templates.
//
// Body: { wabaConfigId?: string }   // defaults to user's active WABA
// Returns: { ok, synced, created, updated, skipped, errors }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const META_GRAPH_VERSION = 'v20.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'DISABLED';
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components?: unknown[];
}

interface MetaTemplatesResponse {
  data: MetaTemplate[];
  paging?: { next?: string };
  error?: { message?: string; type?: string; code?: number };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  // ─── Auth ─────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'missing bearer token' }, 401);

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  // ─── Body ─────────────────────────────────────────────────────────
  let body: { wabaConfigId?: string };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ─── Resolve WABA config ─────────────────────────────────────────
  let configQuery = supabase
    .from('whatsapp_config')
    .select('id, waba_id, access_token, status')
    .eq('user_id', userId);

  if (body.wabaConfigId) {
    configQuery = configQuery.eq('id', body.wabaConfigId);
  } else {
    configQuery = configQuery.eq('status', 'active').limit(1);
  }

  const { data: config, error: cfgErr } = await configQuery.maybeSingle();
  if (cfgErr || !config) {
    return json({ error: 'no active WABA config found', detail: cfgErr?.message }, 404);
  }

  // ─── Fetch templates from Meta (paginated) ───────────────────────
  const allTemplates: MetaTemplate[] = [];
  let nextUrl: string | null =
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${config.waba_id}/message_templates?fields=id,name,language,status,category,components&limit=100`;

  let pageCount = 0;
  while (nextUrl && pageCount < 20) {
    pageCount++;
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${config.access_token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      return json({ error: 'meta graph api error', status: res.status, detail: text }, 502);
    }
    const payload: MetaTemplatesResponse = await res.json();
    if (payload.error) {
      return json({ error: 'meta graph api returned error', detail: payload.error }, 502);
    }
    allTemplates.push(...(payload.data ?? []));
    nextUrl = payload.paging?.next ?? null;
  }

  // ─── Upsert into whatsapp_templates ─────────────────────────────
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ name: string; language: string; error: string }> = [];

  for (const t of allTemplates) {
    if (!t.name || !t.language) {
      skipped++;
      continue;
    }

    const headerComponent = (t.components as Array<Record<string, unknown>> | undefined)?.find(
      (c) => (c.type as string)?.toUpperCase() === 'HEADER',
    );
    const bodyComponent = (t.components as Array<Record<string, unknown>> | undefined)?.find(
      (c) => (c.type as string)?.toUpperCase() === 'BODY',
    );

    const row = {
      waba_config_id:   config.id,
      name:             t.name,
      language:         t.language,
      category:         t.category,
      status:           t.status.toLowerCase(),
      body_text:        (bodyComponent?.text as string) ?? null,
      header_type:      (headerComponent?.format as string) ?? 'NONE',
      components:       t.components ?? null,
      meta_template_id: t.id,
      updated_at:       new Date().toISOString(),
    };

    const { data: existing, error: selErr } = await supabase
      .from('whatsapp_templates')
      .select('id')
      .eq('waba_config_id', config.id)
      .eq('name', t.name)
      .eq('language', t.language)
      .maybeSingle();

    if (selErr) {
      errors.push({ name: t.name, language: t.language, error: selErr.message });
      continue;
    }

    if (existing) {
      const { error: updErr } = await supabase
        .from('whatsapp_templates')
        .update(row)
        .eq('id', existing.id);
      if (updErr) errors.push({ name: t.name, language: t.language, error: updErr.message });
      else updated++;
    } else {
      const { error: insErr } = await supabase
        .from('whatsapp_templates')
        .insert(row);
      if (insErr) errors.push({ name: t.name, language: t.language, error: insErr.message });
      else created++;
    }
  }

  return json({
    ok: true,
    waba_id: config.waba_id,
    synced: allTemplates.length,
    created,
    updated,
    skipped,
    errors,
  });
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
