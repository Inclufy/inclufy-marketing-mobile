// email-send-campaign — bulk-send an email to a list of recipients via Resend.
// Input:  { subject: string, html_body: string, text_body?: string, recipients: string[], from?: string, reply_to?: string, tag?: string }
// Output: { sent: number, failed: number, ids: string[], errors: {email,reason}[] }
//
// Caps at 500 recipients per call to avoid Resend rate-limit blast.
// Caller should chunk larger lists.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAuthUser, jsonResp, corsHeaders } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const DEFAULT_FROM = Deno.env.get('EMAIL_FROM') ?? 'Inclufy Marketing <noreply@inclufy.com>';
const FN_NAME = 'email-send-campaign';

const MAX_RECIPIENTS = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    if (!RESEND_API_KEY) return jsonResp({ error: 'resend_not_configured' }, 503);
    const user = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const subject = String(body.subject ?? '').trim();
    const html = String(body.html_body ?? '').trim();
    const text = String(body.text_body ?? '').trim() || stripHtml(html);
    const recipients: string[] = Array.isArray(body.recipients) ? body.recipients.map(String).map(s => s.trim()).filter(Boolean) : [];
    const from = String(body.from ?? DEFAULT_FROM);
    const replyTo = body.reply_to ? String(body.reply_to) : undefined;
    const tag = body.tag ? String(body.tag) : 'campaign';

    if (!subject) return jsonResp({ error: 'subject required' }, 400);
    if (!html) return jsonResp({ error: 'html_body required' }, 400);
    if (recipients.length === 0) return jsonResp({ error: 'recipients required' }, 400);
    if (recipients.length > MAX_RECIPIENTS) return jsonResp({ error: `too many recipients (max ${MAX_RECIPIENTS})` }, 413);

    const valid = recipients.filter((e) => EMAIL_RE.test(e));
    const invalid = recipients.filter((e) => !EMAIL_RE.test(e));

    const ids: string[] = []; const errors: { email: string; reason: string }[] = [];
    for (const e of invalid) errors.push({ email: e, reason: 'invalid_format' });

    // Sequential send so we can capture per-email errors. Resend supports
    // /emails/batch (max 100/call) but here we keep per-send isolation.
    for (const to of valid) {
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to, subject, html, text,
            reply_to: replyTo,
            tags: [{ name: 'campaign', value: tag }, { name: 'user_id', value: user.id }],
          }),
        });
        const j = await r.json();
        if (!r.ok) errors.push({ email: to, reason: j.error?.message ?? `HTTP ${r.status}` });
        else ids.push(j.id);
      } catch (e) {
        errors.push({ email: to, reason: (e as Error).message });
      }
    }

    return jsonResp({ sent: ids.length, failed: errors.length, ids, errors });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
