// admin-create-user — create a new auth user + public.users row.
// Caller MUST be a superadmin (email in SUPERADMIN_EMAILS env).
// Input:  { email: string, password?: string, full_name?: string, role?: 'admin'|'member', organization_id?: uuid }
// Output: { user_id, email, created_at, magic_link? }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAuthUser, jsonResp, corsHeaders } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPERADMIN_EMAILS = (Deno.env.get('SUPERADMIN_EMAILS') ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const FN_NAME = 'admin-create-user';

function randomPassword(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  let p = ''; for (let i = 0; i < 20; i++) p += charset[Math.floor(Math.random() * charset.length)];
  return p;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const caller = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!caller) return jsonResp({ error: 'unauthenticated' }, 401);
    const callerEmail = caller.email?.toLowerCase() ?? '';
    if (!SUPERADMIN_EMAILS.includes(callerEmail)) {
      return jsonResp({ error: 'forbidden', message: 'superadmin only' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResp({ error: 'valid email required' }, 400);
    const password = String(body.password ?? '') || randomPassword();
    const fullName = body.full_name ? String(body.full_name) : '';
    const role = ['admin', 'member', 'owner'].includes(body.role) ? body.role : 'member';
    const orgId = body.organization_id ? String(body.organization_id) : null;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Create auth user
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (authErr || !created.user) return jsonResp({ error: 'auth_create_failed', detail: authErr?.message }, 500);
    const userId = created.user.id;

    // 2) Shadow into public.users (some flows still depend on this row)
    await admin.from('users').upsert({ id: userId, email, full_name: fullName || null }, { onConflict: 'id' });

    // 3) Optionally add to an organization
    if (orgId) {
      await admin.from('organization_members').upsert({
        organization_id: orgId, user_id: userId, role,
      }, { onConflict: 'organization_id,user_id' });
    }

    // 4) Generate a one-time magic link so the new user can set their own password
    let magicLink: string | undefined;
    try {
      const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      magicLink = (link as any)?.properties?.action_link;
    } catch { /* non-fatal */ }

    return jsonResp({ user_id: userId, email, created_at: created.user.created_at, magic_link: magicLink });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
