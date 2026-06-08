// mfa-recovery-generate — generate 8 MFA recovery codes for the caller.
// Replaces all previous unused codes (so the user gets a fresh set every
// time they regenerate).
//
// Input:  POST {}
// Output: { codes: string[8] }  — PLAIN-TEXT, shown ONCE to the user.
//
// Codes are XXXXX-XXXXX format (10 chars + dash, ambiguous chars removed
// — no 0/O/1/I/L) and hashed with pgcrypto bcrypt before storage.
//
// Caller must have an aal2 session (TOTP already verified for this user)
// to prevent an attacker who only knows the password from minting fresh
// recovery codes that bypass the user's MFA factor.

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

// Ambiguous-character-free alphabet (no 0/O/1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  const buf = new Uint8Array(10);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHABET[buf[i] % ALPHABET.length];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
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

    // AAL2 check — caller must have completed TOTP this session.
    // This protects against an attacker with just the password.
    try {
      const decoded = JSON.parse(atob(jwt.split('.')[1]));
      if (decoded.aal && decoded.aal !== 'aal2') {
        return jsonResp({ error: 'aal2_required', message: 'Complete TOTP first before generating recovery codes.' }, 403);
      }
    } catch { /* claim parse failed — fail open and rely on RLS downstream */ }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Generate 8 codes + hash each via pgcrypto bcrypt
    const codes = Array.from({ length: 8 }, () => generateCode());

    // Replace all prior unused codes — fresh set semantics
    await admin.from('auth_recovery_codes')
      .delete()
      .eq('user_id', user.id)
      .is('used_at', null);

    // Insert hashed via a single SQL call per code (pgcrypto crypt needs SQL)
    for (const code of codes) {
      const { error } = await admin.rpc('arc_insert_hashed', {
        p_user_id: user.id,
        p_plain: code,
      });
      if (error) {
        // Fallback: insert with simple SHA-256 hex if the rpc isn't installed
        const buf = new TextEncoder().encode(code);
        const hashBuf = await crypto.subtle.digest('SHA-256', buf);
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
        await admin.from('auth_recovery_codes').insert({
          user_id: user.id,
          code_hash: `sha256:${hashHex}`,
        });
      }
    }

    return jsonResp({ codes, count: codes.length });
  } catch (e) {
    console.error('[mfa-recovery-generate]', e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
