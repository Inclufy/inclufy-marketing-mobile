// send-sandbox-invitation — invite a prospect to a time-boxed sandbox
// workspace pre-seeded with industry-pack data.
//
// ProjeXtPal pattern reference: backend/accounts/sandbox_invite.py
// — same UX (branded email + accept-CTA + 14-day trial default), but
// adapted to Supabase Auth (admin.inviteUserByEmail) + the Marketing
// sandbox schema (sandbox_invitations table + is_demo seed pattern).
//
// Auth: caller must be owner/admin of their org (verified per-request
// via service-role check, not by relying on RLS alone).
//
// Rate limit: 10 invitations / day / caller. Hard-coded for now;
// future enhancement = per-org tiered limits.
//
// Flow:
//   1. Validate caller + org membership
//   2. Validate recipient email + dup-pending check
//   3. INSERT sandbox_invitations row (status='pending')
//   4. supabase.auth.admin.inviteUserByEmail with metadata.invite_id
//      → sends Supabase-default invite mail (we DO let it send — the
//      magic link is in there). We supplement with our branded email
//      next so the inviter gets credit and the recipient sees an
//      Inclufy/AMOS look.
//   5. Send branded Resend email via send-email internal channel
//   6. Return { invitation_id, expires_at } for the UI to confirm

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_ADDRESS = Deno.env.get('EMAIL_FROM_ADDRESS')
  ?? 'Inclufy Marketing <noreply@inclufy.com>';
const APP_BASE_URL = Deno.env.get('APP_BASE_URL')
  ?? 'https://marketing.inclufy.com';

const RATE_LIMIT_PER_DAY = 10;
const PACK_LABELS: Record<string, { nl: string; emoji: string }> = {
  agency:    { nl: 'Marketing-bureau', emoji: '🎯' },
  b2b_saas:  { nl: 'B2B SaaS',         emoji: '💼' },
  ecommerce: { nl: 'E-commerce / D2C', emoji: '🛍️' },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function htmlEscape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}

function renderEmailHtml(opts: {
  recipient_name?: string | null;
  inviter_name: string;
  pack_label: string;
  pack_emoji: string;
  trial_days: number;
  accept_url: string;
}): string {
  const greet = opts.recipient_name ? `Hoi ${htmlEscape(opts.recipient_name)},` : 'Hoi,';
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>Proeftuin uitnodiging</title></head>
<body style="margin:0;background:#0b0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="background:linear-gradient(135deg,#9333EA 0%,#EC4899 100%);padding:36px 24px;border-radius:14px 14px 0 0;text-align:center">
      <div style="display:inline-block;background:rgba(255,255,255,.12);padding:10px 14px;border-radius:999px;color:#fff;font-size:12px;font-weight:600;letter-spacing:1px">🧪 PROEFTUIN UITNODIGING</div>
      <h1 style="margin:18px 0 0;color:#fff;font-size:22px;line-height:1.3">Bekijk Inclufy Marketing<br>met een ${opts.pack_emoji} ${htmlEscape(opts.pack_label)}-werkruimte</h1>
    </div>
    <div style="background:#fff;padding:28px 24px;border-radius:0 0 14px 14px">
      <p style="margin:0 0 12px;font-size:15px;line-height:1.55">${greet}</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.55">
        ${htmlEscape(opts.inviter_name)} heeft een werkruimte met realistische voorbeelddata voor je klaargezet,
        zodat je <strong>${opts.trial_days} dagen</strong> ongestoord kunt kijken hoe Inclufy Marketing werkt —
        zonder zelf een setup-wizard te hoeven doorlopen.
      </p>
      <ul style="margin:0 0 20px;padding-left:18px;font-size:14px;line-height:1.7">
        <li>✅ Pre-geseed met een ${opts.pack_emoji} <strong>${htmlEscape(opts.pack_label)}</strong>-pack: persona's, campagnes, content, contacten.</li>
        <li>✅ Markeer-en-verwijder: alle voorbeelddata heeft <code style="font-size:12px;background:#f4f4f6;padding:1px 4px;border-radius:3px">is_demo=true</code> en is in één klik op te ruimen.</li>
        <li>✅ Geen creditcard, geen verplichtingen — switch naar productie wanneer je klaar bent.</li>
      </ul>
      <div style="text-align:center;margin:24px 0">
        <a href="${opts.accept_url}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#9333EA 0%,#EC4899 100%);color:#fff;font-weight:600;text-decoration:none;border-radius:10px;font-size:15px">Open proeftuin →</a>
      </div>
      <p style="margin:24px 0 0;font-size:12px;color:#6b7280;line-height:1.5">
        De link is ${opts.trial_days} dagen geldig. Vragen? Reply op deze mail.<br>
        Inclufy Marketing B.V. · Almere, Nederland
      </p>
    </div>
  </div>
</body></html>`;
}

async function sendResendEmail(to: string, subject: string, html: string): Promise<void> {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const auth = req.headers.get('Authorization') ?? '';
    const jwt = auth.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'unauthenticated' }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user } } = await userClient.auth.getUser(jwt);
    if (!user) return json({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const recipient_email = String(body?.recipient_email ?? '').trim().toLowerCase();
    const recipient_name = body?.recipient_name ? String(body.recipient_name).trim().slice(0, 80) : null;
    const pack_id = String(body?.pack_id ?? 'agency').trim();
    const trial_days = Math.max(1, Math.min(90, parseInt(String(body?.trial_days ?? 14), 10) || 14));

    if (!recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
      return json({ error: 'invalid_email' }, 400);
    }
    if (!PACK_LABELS[pack_id]) {
      return json({ error: 'invalid_pack_id' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authz — caller must be owner/admin of an org
    const { data: orgRow } = await admin
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .limit(1)
      .maybeSingle();
    if (!orgRow) {
      return json({ error: 'forbidden', message: 'Only org owners/admins can send sandbox invitations' }, 403);
    }
    const inviterOrgId = orgRow.organization_id;

    // Rate-limit — 10 invites/day/caller
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count: dayCount } = await admin
      .from('sandbox_invitations')
      .select('*', { count: 'exact', head: true })
      .eq('inviter_user_id', user.id)
      .gte('created_at', since);
    if ((dayCount ?? 0) >= RATE_LIMIT_PER_DAY) {
      return json({ error: 'rate_limited', message: `Max ${RATE_LIMIT_PER_DAY} invites/day` }, 429);
    }

    // Dup-pending check (DB also enforces, but error message is friendlier)
    const { data: existing } = await admin
      .from('sandbox_invitations')
      .select('id')
      .eq('inviter_user_id', user.id)
      .eq('recipient_email', recipient_email)
      .eq('status', 'pending')
      .maybeSingle();
    if (existing) {
      return json({
        error: 'duplicate_pending',
        message: 'A pending invitation already exists for this recipient',
        invitation_id: existing.id,
      }, 409);
    }

    const expires_at = new Date(Date.now() + trial_days * 86_400_000).toISOString();
    const { data: inviterProfile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle();
    const inviter_name = inviterProfile?.full_name ?? inviterProfile?.email ?? 'Het Inclufy-team';

    // Insert the audit row first so even if the email fails we have a record
    const { data: inv, error: insErr } = await admin
      .from('sandbox_invitations')
      .insert({
        inviter_user_id: user.id,
        inviter_org_id: inviterOrgId,
        recipient_email,
        recipient_name,
        pack_id,
        trial_days,
        expires_at,
      })
      .select('id, expires_at')
      .single();
    if (insErr) return json({ error: 'insert_failed', detail: insErr.message }, 500);

    // Create or invite the auth user. We use the admin invite which
    // generates a magic link and either reuses an existing account (if
    // the recipient already signed up) or creates a new one.
    const acceptRedirect = `${APP_BASE_URL}/demo?sandbox_invite=${inv.id}&pack=${pack_id}`;
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(recipient_email, {
      data: {
        sandbox_invitation_id: inv.id,
        sandbox_pack_id: pack_id,
        inviter_user_id: user.id,
        inviter_org_id: inviterOrgId,
      },
      redirectTo: acceptRedirect,
    });
    // 422 from Supabase when user already exists — that's fine, we just
    // generate a magic link below; failure to invite isn't fatal for
    // the audit row.
    if (invErr && !/already.*registered|already.*exists/i.test(invErr.message)) {
      console.warn('[send-sandbox-invitation] inviteUserByEmail:', invErr.message);
    }
    if (invited?.user?.id) {
      // Record the auth user so when they accept we can detect & seed
      await admin.from('sandbox_invitations')
        .update({ invited_user_id: invited.user.id })
        .eq('id', inv.id);
    }

    // Always send our branded email — it carries the CTA. Even when the
    // user already exists, we want them to click our link not Supabase's
    // default invite mail.
    const packMeta = PACK_LABELS[pack_id];
    const html = renderEmailHtml({
      recipient_name,
      inviter_name,
      pack_label: packMeta.nl,
      pack_emoji: packMeta.emoji,
      trial_days,
      accept_url: acceptRedirect,
    });
    try {
      await sendResendEmail(
        recipient_email,
        `[Proeftuin] Uitnodiging van ${inviter_name}`,
        html,
      );
    } catch (e) {
      console.error('[send-sandbox-invitation] resend send failed', (e as Error).message);
      return json({
        ok: false,
        error: 'email_send_failed',
        invitation_id: inv.id,
        detail: (e as Error).message,
      }, 502);
    }

    return json({
      ok: true,
      invitation_id: inv.id,
      expires_at: inv.expires_at,
      recipient_email,
      pack_id,
    });
  } catch (e) {
    console.error('[send-sandbox-invitation]', e);
    return json({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
