// api-key-verify — verifies a presented sk_inclufy_ API key and returns
// the matched org + permissions. Designed to be the auth gate for all
// /api/* style ingress where the caller is a third party (not an end-user
// JWT). Updates last_used_at + last_used_ip atomically as a side-effect.
//
// Two call modes:
//   1. As an edge function — POST with body { key, required_permission? }
//      Returns 200 { organization_id, prefix, permissions, name } on match
//      or 401 on miss / 403 on insufficient permissions / 410 on revoked
//      or expired.
//   2. As a library — import { verifyApiKey } from this file and call it
//      from any other Deno edge fn that wants to accept API-key ingress.
//
// Auth: NO JWT required. The presented sk_inclufy_ key IS the credential.
// SHA-256 (the same algo used by api-key-mint) is the constant-time-safe
// lookup primitive: hash the presented key, equality-match the stored
// `key_hash` column. The plain key is never persisted; only the prefix
// is shown in the management UI.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
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

export interface VerifyResult {
  ok: true;
  organization_id: string;
  api_key_id: string;
  prefix: string;
  name: string;
  permissions: string[];
}
export interface VerifyError {
  ok: false;
  status: 401 | 403 | 410;
  error: string;
}

/** Reusable helper for any other edge fn that wants to accept sk_inclufy_ ingress. */
export async function verifyApiKey(
  plain: string,
  opts?: { required_permission?: string; client_ip?: string | null }
): Promise<VerifyResult | VerifyError> {
  if (!plain || !plain.startsWith('sk_inclufy_')) {
    return { ok: false, status: 401, error: 'invalid_key_format' };
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const hash = await sha256Hex(plain);

  // Single round-trip lookup by hash. RLS on api_keys must allow the
  // service_role to SELECT — it does, since service_role bypasses RLS.
  const { data: row, error } = await admin
    .from('api_keys')
    .select('id, organization_id, name, prefix, permissions, expires_at, revoked_at')
    .eq('key_hash', hash)
    .maybeSingle();

  if (error) return { ok: false, status: 401, error: 'lookup_failed' };
  if (!row) return { ok: false, status: 401, error: 'key_not_found' };
  if (row.revoked_at) return { ok: false, status: 410, error: 'key_revoked' };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 410, error: 'key_expired' };
  }

  const perms: string[] = Array.isArray(row.permissions) ? row.permissions : [];
  if (opts?.required_permission && perms.length > 0 && !perms.includes(opts.required_permission)) {
    return { ok: false, status: 403, error: `missing_permission:${opts.required_permission}` };
  }

  // Fire-and-forget last_used_* update. We don't await because the caller
  // shouldn't pay 30-100 ms for what is purely audit-trail data. If the
  // update fails, the next call simply has an older timestamp — no
  // security implication.
  void admin.from('api_keys').update({
    last_used_at: new Date().toISOString(),
    last_used_ip: opts?.client_ip ?? null,
  }).eq('id', row.id);

  return {
    ok: true,
    api_key_id: row.id,
    organization_id: row.organization_id,
    prefix: row.prefix,
    name: row.name,
    permissions: perms,
  };
}

/** Extracts the API key from Authorization: Bearer or X-API-Key header. */
export function extractApiKey(req: Request): string | null {
  const auth = req.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+(sk_inclufy_\S+)/i.exec(auth);
  if (m) return m[1];
  const x = req.headers.get('X-API-Key');
  if (x && x.startsWith('sk_inclufy_')) return x.trim();
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    // Accept the key either in the body OR in the Authorization header.
    // The header form is what production third-party API calls will use.
    const headerKey = extractApiKey(req);
    const body = await req.json().catch(() => ({}));
    const plain = headerKey ?? String(body?.key ?? '').trim();
    const requiredPerm = body?.required_permission ? String(body.required_permission) : undefined;

    if (!plain) return jsonResp({ ok: false, error: 'no_key' }, 401);

    // Best-effort client IP — Supabase edge runtime exposes x-forwarded-for.
    const cf = req.headers.get('cf-connecting-ip');
    const xff = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const clientIp = cf ?? (xff || null);

    const result = await verifyApiKey(plain, { required_permission: requiredPerm, client_ip: clientIp });
    if (!result.ok) return jsonResp({ ok: false, error: result.error }, result.status);
    return jsonResp(result);
  } catch (e) {
    console.error('[api-key-verify]', e);
    return jsonResp({ ok: false, error: (e as Error).message ?? 'internal' }, 500);
  }
});
