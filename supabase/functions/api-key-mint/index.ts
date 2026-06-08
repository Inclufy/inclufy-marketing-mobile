// api-key-mint — mints a new API key for an organization.
// Returns the plain key ONCE (caller stores it; we keep only the SHA-256 hash).
//
// Input: POST { organization_id, name, expires_at?, permissions?: string[] }
// Output: { id, key: 'sk_inclufy_xxxxx', prefix, name, expires_at }
//
// Auth: caller must be owner/admin of the org (RLS enforces this; we re-check
// here so we can fail with a useful message instead of generic RLS 0-rows).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateKey(): { plain: string; prefix: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let body = '';
  for (let i = 0; i < 32; i++) body += alpha[bytes[i] % alpha.length];
  const plain = `sk_inclufy_${body}`;
  const prefix = plain.slice(0, 16); // sk_inclufy_AAAA — shown in UI
  return { plain, prefix };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: uerr } = await userClient.auth.getUser(jwt);
    if (uerr || !user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const orgId = String(body.organization_id ?? '').trim();
    const name = String(body.name ?? '').trim();
    const expiresAt = body.expires_at ? String(body.expires_at) : null;
    const permissions = Array.isArray(body.permissions) ? body.permissions : [];

    if (!orgId) return jsonResp({ error: 'organization_id required' }, 400);
    if (!name) return jsonResp({ error: 'name required' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authz — must be owner/admin
    const { data: member } = await admin
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return jsonResp({ error: 'forbidden', message: 'Only owner/admin can mint API keys' }, 403);
    }

    const { plain, prefix } = generateKey();
    const hash = await sha256Hex(plain);

    const { data: inserted, error: insErr } = await admin.from('api_keys').insert({
      organization_id: orgId,
      name,
      key_hash: hash,
      prefix,
      permissions,
      expires_at: expiresAt,
      created_by: user.id,
    }).select('id, prefix, name, expires_at, created_at').single();
    if (insErr) return jsonResp({ error: 'insert_failed', detail: insErr.message }, 500);

    return jsonResp({ ...inserted, key: plain });
  } catch (e) {
    console.error('[api-key-mint]', e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
