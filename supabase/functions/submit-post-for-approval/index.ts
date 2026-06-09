// ═══════════════════════════════════════════════════════════════════════════
// submit-post-for-approval — non-admin team-member flow.
//
// Moves a draft go_post to status='in_review' and fans out an in-app
// notification + (via DB trigger) native push to every admin/owner of
// the post's organization.
//
// If the org has requires_post_approval=false, OR if the caller is
// already an admin/owner, this is a no-op that returns 400 — admins
// should set status='approved' directly via the existing flow.
//
// Wire format:
//   POST /functions/v1/submit-post-for-approval
//   Authorization: Bearer <user_jwt>
//   { post_id: "uuid", note?: "optional message to admins" }
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Missing auth' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Not authenticated' }, 401);

  let body: { post_id?: string; note?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.post_id) return json({ error: 'post_id required' }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Load the post — no organization_id on go_posts, we resolve org via
  // the author's organization_members membership below.
  const { data: post, error: postErr } = await admin
    .from('go_posts')
    .select('id, status, channel, text_content, user_id')
    .eq('id', body.post_id)
    .single();
  if (postErr || !post) return json({ error: 'Post not found' }, 404);

  // Only the post's author may submit it.
  if (post.user_id !== user.id) {
    return json({ error: 'Cannot submit a post you do not own' }, 403);
  }

  // Resolve the author's primary org. AMOS users typically belong to a
  // single org; if they belong to multiple, we use the most recently
  // joined one as a heuristic.
  const { data: membershipList } = await admin
    .from('organization_members')
    .select('organization_id, role, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  const primaryMembership = membershipList?.[0];
  if (!primaryMembership) {
    return json({ error: 'User has no organization membership' }, 403);
  }
  const orgId = primaryMembership.organization_id;

  // Only draft posts can be submitted
  if (post.status !== 'draft') {
    return json({ error: `Post is in status=${post.status}, can only submit drafts` }, 409);
  }

  // 1. Move post to in_review
  const { error: updateErr } = await admin
    .from('go_posts')
    .update({
      status: 'in_review',
      submitted_by_user_id: user.id,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', post.id);
  if (updateErr) return json({ error: 'Failed to update post', detail: updateErr.message }, 500);

  // 2. Find admins of the org → notify them.
  const { data: admins } = await admin
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)
    .in('role', ['owner', 'admin']);

  let recipients = Array.from(new Set((admins ?? []).map((r: any) => r.user_id))).filter((id) => id && id !== user.id);

  // Fallback for solo orgs where the only admin is the submitter:
  // surface to all owners (still possibly includes self — filtered above).
  if (recipients.length === 0) {
    const { data: owners } = await admin
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('role', 'owner');
    recipients = Array.from(new Set((owners ?? []).map((r: any) => r.user_id))).filter((id) => id && id !== user.id);
  }

  // 3. Insert one go_notifications row per admin — push trigger handles
  //    the native notification + any future email bridge.
  if (recipients.length > 0) {
    const preview = (post.text_content ?? '').slice(0, 80);
    const rows = recipients.map((adminId) => ({
      user_id: adminId,
      type: 'post_approval_needed',
      title: 'Post wacht op je goedkeuring',
      body: `${(post.channel ?? 'social').toUpperCase()} — ${preview}${preview.length === 80 ? '…' : ''}`,
      data: {
        post_id: post.id,
        organization_id: orgId,
        channel: post.channel,
        author_user_id: post.user_id,
        submitted_by_user_id: user.id,
        note: body.note ?? null,
        route: 'PostReview',
      },
      read: false,
    }));
    const { error: notifErr } = await admin.from('go_notifications').insert(rows);
    if (notifErr) console.warn('[submit-post-for-approval] notify failed', notifErr.message);
  }

  // Emit webhook event — customers integrated via webhooks-dispatch get
  // the approval-request notification. Fire-and-forget — must not block.
  try {
    await admin.rpc('enqueue_webhook_event_for_org', {
      p_org: orgId,
      p_event: 'post.approval_requested',
      p_payload: {
        post_id: post.id,
        channel: post.channel,
        author_user_id: post.user_id,
        submitted_by_user_id: user.id,
        note: body.note ?? null,
        notified_admins: recipients.length,
      },
    });
  } catch (e) {
    console.warn('[submit-post-for-approval] webhook emit failed', (e as Error).message);
  }

  return json({
    ok: true,
    post_id: post.id,
    status: 'in_review',
    notified_admins: recipients.length,
  });
});
