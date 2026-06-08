// mfa-recovery-consume — verify a recovery code and grant an aal2-like
// upgrade. The caller is in an aal1 session (password done, TOTP missing
// or device lost). On success we mark the matching row used_at=now()
// and return a session JWT that mirrors the aal2 claim.
//
// Input:  POST { code: 'XXXXX-XXXXX' }
// Output: { verified: true, codes_remaining: N }
//
// IMPORTANT: This fn does NOT mint a new Supabase session — Supabase doesn't
// expose a server-side aal2 attest API. Instead it returns verified=true
// and the client is expected to call supabase.auth.mfa.challenge/verify
// against a server-side virtual factor in a future iteration. For now the
// success response just unlocks the local app state — protected RLS reads
// will still require aal2 once Supabase ships the API. Practical workaround:
// when verified=true, the client falls back to "remember this device for
// 30 days" trust pattern (P0-1C).

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

function normalize(code: string): string {
  return code.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
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
    const { data: { user }, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const code = normalize(String(body.code ?? ''));
    if (!code || code.length < 8) return jsonResp({ error: 'invalid_code_format' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Hash incoming code with SHA-256 (matches the fallback path in
    // mfa-recovery-generate; pgcrypto bcrypt match path covered server-side
    // via the arc_verify_match RPC if present).
    const buf = new TextEncoder().encode(code);
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    const shaHash = `sha256:${hashHex}`;

    // 1) Try direct SHA-256 match (fast path)
    let { data: hit } = await admin.from('auth_recovery_codes')
      .select('id')
      .eq('user_id', user.id)
      .eq('code_hash', shaHash)
      .is('used_at', null)
      .maybeSingle();

    // 2) Fallback: pgcrypto bcrypt match via RPC (slow path; iterates rows)
    if (!hit) {
      const rpc = await admin.rpc('arc_verify_match', { p_user_id: user.id, p_plain: code });
      if (!rpc.error && rpc.data) hit = { id: rpc.data as string };
    }

    if (!hit) return jsonResp({ verified: false, error: 'invalid_or_used_code' }, 401);

    // Mark used + capture IP (best-effort)
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
    await admin.from('auth_recovery_codes')
      .update({ used_at: new Date().toISOString(), used_from_ip: ip })
      .eq('id', hit.id);

    // Report remaining unused codes
    const { count } = await admin.from('auth_recovery_codes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('used_at', null);

    return jsonResp({ verified: true, codes_remaining: count ?? 0 });
  } catch (e) {
    console.error('[mfa-recovery-consume]', e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
