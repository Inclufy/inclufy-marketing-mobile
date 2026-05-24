// admin-delete-user — irreversibly delete an auth user + cascade public.users.
// Caller MUST be a superadmin. NOT a soft-delete; for GDPR use gdpr-account-delete.
// Input:  { user_id: uuid, reason?: string }
// Output: { user_id, deleted_at }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAuthUser, jsonResp, corsHeaders } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPERADMIN_EMAILS = (Deno.env.get('SUPERADMIN_EMAILS') ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const FN_NAME = 'admin-delete-user';

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
    const userId = String(body.user_id ?? '').trim();
    const reason = body.reason ? String(body.reason) : 'admin_action';
    if (!userId) return jsonResp({ error: 'user_id required' }, 400);
    if (userId === caller.id) return jsonResp({ error: 'cannot delete self' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Best-effort: remove public.users row first (cascades to most app tables
    // via FK ON DELETE CASCADE). Auth row is the last step so we don't leave
    // an orphan-auth-row with no public counterpart.
    try { await admin.from('organization_members').delete().eq('user_id', userId); } catch {}
    try { await admin.from('users').delete().eq('id', userId); } catch {}

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return jsonResp({ error: 'auth_delete_failed', detail: error.message }, 500);

    // Audit log (best-effort)
    try {
      await admin.from('admin_audit_log').insert({
        actor_id: caller.id,
        actor_email: callerEmail,
        action: 'user_delete',
        target_id: userId,
        reason,
      });
    } catch { /* table may not exist yet */ }

    return jsonResp({ user_id: userId, deleted_at: new Date().toISOString() });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
