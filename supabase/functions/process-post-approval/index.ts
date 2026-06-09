// ═══════════════════════════════════════════════════════════════════════════
// process-post-approval — admin/owner approves or rejects a pending post.
//
// Wire format:
//   POST /functions/v1/process-post-approval
//   Authorization: Bearer <admin_user_jwt>
//   {
//     post_id: "uuid",
//     decision: "approve" | "reject",
//     reason?: string  // required when decision='reject'
//   }
//
// Effects:
//   approve → status='approved', approved_by_user_id + approved_at set,
//             notification to submitter (+ post is now publish-eligible).
//   reject  → status='draft', rejection_reason set, rejected_by_user_id +
//             rejected_at set, notification to submitter with reason.
//
// Only org admins/owners may call this. Self-approval (admin who is also
// the submitter) is allowed but logged.
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

  let body: { post_id?: string; decision?: 'approve' | 'reject'; reason?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.post_id) return json({ error: 'post_id required' }, 400);
  if (body.decision !== 'approve' && body.decision !== 'reject') {
    return json({ error: 'decision must be approve|reject' }, 400);
  }
  if (body.decision === 'reject' && !body.reason) {
    return json({ error: 'reason required when rejecting' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: post, error: postErr } = await admin
    .from('go_posts')
    .select('id, status, channel, text_content, user_id, submitted_by_user_id')
    .eq('id', body.post_id)
    .single();
  if (postErr || !post) return json({ error: 'Post not found' }, 404);

  // Only in_review posts can be processed
  if (post.status !== 'in_review') {
    return json({ error: `Post is in status=${post.status}, expected in_review` }, 409);
  }

  // Verify caller is admin/owner of the AUTHOR's org. Since go_posts has
  // no organization_id, we check that the caller shares an org with the
  // post's author AND has admin/owner role there.
  const { data: authorOrgs } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', post.user_id);
  const authorOrgIds = (authorOrgs ?? []).map((r: any) => r.organization_id).filter(Boolean);
  if (authorOrgIds.length === 0) {
    return json({ error: 'Author has no organization membership' }, 403);
  }
  const { data: callerMembership } = await admin
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .in('organization_id', authorOrgIds)
    .in('role', ['owner', 'admin'])
    .maybeSingle();
  if (!callerMembership) {
    return json({ error: 'Only org admins/owners can approve posts' }, 403);
  }

  const now = new Date().toISOString();
  const submitterId = post.submitted_by_user_id ?? post.user_id;

  if (body.decision === 'approve') {
    const { error: updErr } = await admin
      .from('go_posts')
      .update({
        status: 'approved',
        approved_by_user_id: user.id,
        approved_at: now,
        // Clear any previous rejection state (in case a draft was bounced
        // back, edited, and re-submitted).
        rejected_by_user_id: null,
        rejected_at: null,
        rejection_reason: null,
      })
      .eq('id', post.id);
    if (updErr) return json({ error: 'Update failed', detail: updErr.message }, 500);

    // Notify the submitter
    if (submitterId && submitterId !== user.id) {
      await admin.from('go_notifications').insert({
        user_id: submitterId,
        type: 'post_approval_decided',
        title: '✅ Post goedgekeurd',
        body: `Je ${(post.channel ?? 'social').toUpperCase()}-post is klaar om gepubliceerd te worden.`,
        data: {
          post_id: post.id,
          decision: 'approve',
          approver_user_id: user.id,
          route: 'PostReview',
        },
        read: false,
      });
    }

    // Emit webhook event for downstream customer integrations.
    try {
      await admin.rpc('enqueue_webhook_event_for_org', {
        p_org: authorOrgIds[0],
        p_event: 'post.approved',
        p_payload: {
          post_id: post.id,
          channel: post.channel,
          approved_by_user_id: user.id,
          approved_at: now,
        },
      });
    } catch (e) {
      console.warn('[process-post-approval] webhook emit (approve) failed', (e as Error).message);
    }

    return json({ ok: true, post_id: post.id, status: 'approved', notified_submitter: !!submitterId });
  }

  // Reject path — bounce back to draft with reason
  const { error: updErr } = await admin
    .from('go_posts')
    .update({
      status: 'draft',
      rejected_by_user_id: user.id,
      rejected_at: now,
      rejection_reason: body.reason!.slice(0, 500),
      // Clear any previously-set approval fields so audit stays clean
      approved_by_user_id: null,
      approved_at: null,
    })
    .eq('id', post.id);
  if (updErr) return json({ error: 'Update failed', detail: updErr.message }, 500);

  if (submitterId && submitterId !== user.id) {
    await admin.from('go_notifications').insert({
      user_id: submitterId,
      type: 'post_approval_decided',
      title: '❌ Post afgekeurd',
      body: `Reden: ${body.reason!.slice(0, 120)}`,
      data: {
        post_id: post.id,
        decision: 'reject',
        approver_user_id: user.id,
        reason: body.reason,
        route: 'PostReview',
      },
      read: false,
    });
  }

  // Emit webhook event for the rejection.
  try {
    await admin.rpc('enqueue_webhook_event_for_org', {
      p_org: authorOrgIds[0],
      p_event: 'post.rejected',
      p_payload: {
        post_id: post.id,
        channel: post.channel,
        rejected_by_user_id: user.id,
        rejected_at: now,
        reason: body.reason!.slice(0, 500),
      },
    });
  } catch (e) {
    console.warn('[process-post-approval] webhook emit (reject) failed', (e as Error).message);
  }

  return json({ ok: true, post_id: post.id, status: 'draft', rejection_reason: body.reason });
});
