// admin-invite — invite a new user via email magic link.
// Caller MUST be the owner of an organization (or superadmin).
// Input:  { email: string, organization_id?: uuid, role?: 'admin'|'member', invited_by_name?: string }
// Output: { invited, magic_link, expires_at }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAuthUser, jsonResp, corsHeaders } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'Inclufy Marketing <noreply@inclufy.com>';
const APP_NAME = Deno.env.get('APP_NAME') ?? 'Inclufy Marketing';
const SUPERADMIN_EMAILS = (Deno.env.get('SUPERADMIN_EMAILS') ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const FN_NAME = 'admin-invite';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const caller = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!caller) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResp({ error: 'valid email required' }, 400);
    const orgId = body.organization_id ? String(body.organization_id) : null;
    const role = ['admin', 'member', 'owner'].includes(body.role) ? body.role : 'member';
    const invitedByName = body.invited_by_name ? String(body.invited_by_name) : (caller.email ?? 'Inclufy team');

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authorization: caller must be superadmin OR owner of the target org.
    const isSuperadmin = SUPERADMIN_EMAILS.includes(caller.email?.toLowerCase() ?? '');
    if (!isSuperadmin && orgId) {
      const { data: member } = await admin
        .from('organization_members')
        .select('role')
        .eq('organization_id', orgId)
        .eq('user_id', caller.id)
        .maybeSingle();
      if (!member || !['owner', 'admin'].includes(member.role)) {
        return jsonResp({ error: 'forbidden', message: 'must be org owner/admin or superadmin' }, 403);
      }
    } else if (!isSuperadmin && !orgId) {
      return jsonResp({ error: 'organization_id required for non-superadmin invite' }, 400);
    }

    // Generate a magic link (Supabase auto-creates the auth row on first click)
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink', email,
    });
    if (linkErr) return jsonResp({ error: 'magic_link_failed', detail: linkErr.message }, 500);
    const actionLink = (link as any)?.properties?.action_link;

    // Stage a pending invite row so we know who they belong to once they accept
    if (orgId) {
      try {
        await admin.from('organization_invites').upsert({
          organization_id: orgId, email, role,
          invited_by: caller.id, status: 'pending',
        }, { onConflict: 'organization_id,email' });
      } catch { /* table may not exist — non-fatal */ }
    }

    // Send the invite email via Resend
    if (RESEND_API_KEY && actionLink) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: EMAIL_FROM, to: email,
            subject: `${invitedByName} invited you to ${APP_NAME}`,
            html: `<p>${invitedByName} invited you to join ${APP_NAME}.</p><p><a href="${actionLink}">Click here to accept</a></p><p>This link expires in 1 hour.</p>`,
            text: `${invitedByName} invited you to join ${APP_NAME}. Click to accept: ${actionLink}`,
            tags: [{ name: 'type', value: 'invite' }],
          }),
        });
      } catch (e) {
        console.warn(`[${FN_NAME}] resend send failed:`, e);
      }
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    return jsonResp({ invited: email, magic_link: actionLink, expires_at: expiresAt });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
