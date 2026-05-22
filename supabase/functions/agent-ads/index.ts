// Supabase Edge Function: agent-ads
//
// First real backend for the AMOS Ads Agent. Owns four sub-actions:
//   - boost_post     → drafts a paid promotion for an existing go_posts row
//   - draft_campaign → drafts a campaign brief into agent_runs.output
//   - pace_budget    → checks campaign_costs spend vs configured cap
//   - report_roas    → computes ROAS from campaign_costs + campaign_revenue
//
// LMDP guard: LinkedIn programmatic spend is BLOCKED until the org's
// agents.config.linkedin_lmdp_approved === true. Until then, LinkedIn actions
// produce a "manual queue" output the user copies into Campaign Manager.
//
// Approval gate: every action that *would* spend money (boost_post,
// draft_campaign with budget>0) writes to campaign_costs with a 'pending'
// description prefix; the orchestrator already gated the run on
// requires_approval, so by the time we get here approval is granted.
//
// Auth: invoked either by the orchestrator (service-role) or directly by the
// app (user JWT). Both are accepted.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  checkAiQuota,
  logAiCall,
  rateLimitResponse,
} from '../_shared/ai-rate-limit.ts';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY') ?? '';

const FN_NAME = 'agent-ads';

/** Per-request AI logging context (null when invoked service-role w/o user JWT). */
interface AiCtx {
  supa: SupabaseClient;
  userId: string;
  organizationId: string | null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errResp(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return jsonResp({ error: message, ...extra }, status);
}

function svcClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function callOpenAI(
  ctx: AiCtx | null,
  messages: object[],
  model = 'gpt-4o-mini',
  maxTokens = 1500,
): Promise<string> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model, messages, max_tokens: maxTokens, temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (ctx) {
      await logAiCall(ctx.supa, {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        functionName: FN_NAME,
        provider: 'openai',
        model,
        inputTokens: data.usage?.prompt_tokens ?? null,
        outputTokens: data.usage?.completion_tokens ?? null,
        status: 'sent',
      });
    }
    return data.choices?.[0]?.message?.content ?? '{}';
  } catch (err) {
    if (ctx) {
      await logAiCall(ctx.supa, {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        functionName: FN_NAME,
        provider: 'openai',
        model,
        status: 'failed',
        statusDetail: (err as Error).message?.slice(0, 500),
      });
    }
    throw err;
  }
}

interface ReqBody {
  organization_id: string;
  run_id?: string;            // agent_runs.id when invoked by orchestrator
  action: 'boost_post' | 'draft_campaign' | 'pace_budget' | 'report_roas';
  post_id?: string;
  campaign_id?: string;
  channel?: 'linkedin' | 'google' | 'meta' | 'tiktok';
  budget_eur?: number;
  audience?: Record<string, unknown>;
  notes?: string;
}

// ─── LMDP guard ────────────────────────────────────────────────────────────
async function isLinkedInProgrammaticAllowed(svc: SupabaseClient, orgId: string): Promise<boolean> {
  const { data } = await svc
    .from('agents')
    .select('config')
    .eq('organization_id', orgId)
    .eq('kind', 'ads')
    .maybeSingle();
  return !!data?.config?.linkedin_lmdp_approved;
}

// ─── Action: boost_post ────────────────────────────────────────────────────
async function actionBoostPost(svc: SupabaseClient, body: ReqBody, aiCtx: AiCtx | null) {
  if (!body.post_id) return errResp('post_id required for boost_post');
  if (!body.channel) return errResp('channel required for boost_post');
  if (!body.budget_eur || body.budget_eur <= 0)
    return errResp('budget_eur > 0 required for boost_post');

  // Load the post.
  const { data: post, error: postErr } = await svc
    .from('go_posts')
    .select('id, caption, channel, organization_id, campaign_id')
    .eq('id', body.post_id)
    .maybeSingle();
  if (postErr || !post) return errResp('Post not found', 404);
  if (post.organization_id !== body.organization_id)
    return errResp('Post does not belong to this organization', 403);

  // LMDP guard for LinkedIn.
  const lmdpAllowed = body.channel === 'linkedin'
    ? await isLinkedInProgrammaticAllowed(svc, body.organization_id)
    : true;
  const dispatchMode = lmdpAllowed ? 'programmatic' : 'manual_queue';

  // Look up a candidate audience from go_event_attendees (last 90d) — the
  // simplest "warm" retargeting pool the org already has.
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const { count: attendeeCount } = await svc
    .from('go_event_attendees')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);

  // Use OpenAI to draft the ad copy + targeting suggestion.
  const prompt = [
    {
      role: 'system' as const,
      content:
        'You are the AMOS Ads Agent. Produce a JSON object with keys: ' +
        'headline (max 70 chars), body (max 280 chars), audience_summary, ' +
        'recommended_pacing (object with daily_cap_eur, days), risk_flags (array). ' +
        'Be concrete. No emoji unless the source post had them.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        source_post: post.caption,
        channel: body.channel,
        budget_eur: body.budget_eur,
        warm_audience_size: attendeeCount ?? 0,
        notes: body.notes ?? '',
      }),
    },
  ];
  let draft: Record<string, unknown> = {};
  try {
    draft = JSON.parse(await callOpenAI(aiCtx, prompt));
  } catch {
    draft = { headline: '', body: '', audience_summary: '', recommended_pacing: {}, risk_flags: ['llm_parse_failed'] };
  }

  // Write a pending entry to campaign_costs only when we have a campaign_id —
  // post boosts attach to whatever campaign the post belongs to.
  let costId: string | null = null;
  if (post.campaign_id && dispatchMode === 'programmatic') {
    const { data: cost } = await svc.from('campaign_costs').insert({
      campaign_id: post.campaign_id,
      user_id: body.run_id ? null : null,  // service-role insert: leave null until we resolve initiator
      category: 'ads',
      description: `[pending] ${body.channel} boost for post ${body.post_id}`,
      amount: body.budget_eur,
    }).select('id').single();
    costId = cost?.id ?? null;
  }

  return jsonResp({
    action: 'boost_post',
    post_id: body.post_id,
    channel: body.channel,
    dispatch_mode: dispatchMode,
    draft,
    cost_row_id: costId,
    next_steps:
      dispatchMode === 'manual_queue'
        ? `LMDP not approved — copy this brief into LinkedIn Campaign Manager manually.`
        : `Programmatic dispatch ready. campaign_costs row ${costId} created in pending state.`,
  });
}

// ─── Action: draft_campaign ────────────────────────────────────────────────
async function actionDraftCampaign(svc: SupabaseClient, body: ReqBody, aiCtx: AiCtx | null) {
  if (!body.channel) return errResp('channel required for draft_campaign');
  // Load social accounts available for this channel.
  const { data: accounts } = await svc
    .from('social_accounts')
    .select('id, platform, account_name, status')
    .eq('platform', body.channel)
    .eq('status', 'active');

  const lmdpAllowed = body.channel === 'linkedin'
    ? await isLinkedInProgrammaticAllowed(svc, body.organization_id)
    : true;

  const prompt = [
    {
      role: 'system' as const,
      content:
        'You are the AMOS Ads Agent. Draft a campaign brief as JSON with keys: ' +
        'objective, audience (object with geo, job_titles, industries, exclusions), ' +
        'creative (object with hook_variants array of 3, format), tracking (object with ' +
        'utm_template, conversion_events array), budget (object with total_eur, daily_cap_eur, ' +
        'days_to_run, learn_phase_days, scale_phase_days), kpis (object with target_cpl_eur, ' +
        'target_roas), risk_flags (array).',
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        channel: body.channel,
        budget_eur: body.budget_eur ?? null,
        audience_hint: body.audience ?? {},
        notes: body.notes ?? '',
        connected_accounts: accounts?.map(a => a.account_name) ?? [],
      }),
    },
  ];

  let brief: Record<string, unknown> = {};
  try { brief = JSON.parse(await callOpenAI(aiCtx, prompt, 'gpt-4o-mini', 2000)); }
  catch { brief = { error: 'llm_parse_failed' }; }

  return jsonResp({
    action: 'draft_campaign',
    channel: body.channel,
    lmdp_allowed: lmdpAllowed,
    dispatch_mode: lmdpAllowed ? 'programmatic' : 'manual_queue',
    accounts_found: accounts?.length ?? 0,
    brief,
  });
}

// ─── Action: pace_budget ───────────────────────────────────────────────────
async function actionPaceBudget(svc: SupabaseClient, body: ReqBody) {
  if (!body.campaign_id) return errResp('campaign_id required for pace_budget');
  const { data: costs } = await svc
    .from('campaign_costs')
    .select('amount, date, category, description')
    .eq('campaign_id', body.campaign_id)
    .eq('category', 'ads');
  const totalSpend = (costs ?? []).reduce((s, c) => s + Number(c.amount ?? 0), 0);

  const last7 = (costs ?? []).filter(c => {
    const d = new Date(c.date as string).getTime();
    return d >= Date.now() - 7 * 24 * 3600 * 1000;
  });
  const last7Spend = last7.reduce((s, c) => s + Number(c.amount ?? 0), 0);

  return jsonResp({
    action: 'pace_budget',
    campaign_id: body.campaign_id,
    total_ads_spend_eur: totalSpend,
    last_7d_ads_spend_eur: last7Spend,
    rows: costs?.length ?? 0,
    flags: last7Spend > 1000 ? ['high_burn_rate_last_7d'] : [],
  });
}

// ─── Action: report_roas ───────────────────────────────────────────────────
async function actionReportRoas(svc: SupabaseClient, body: ReqBody) {
  if (!body.campaign_id) return errResp('campaign_id required for report_roas');
  const [{ data: costs }, { data: revs }] = await Promise.all([
    svc.from('campaign_costs').select('amount').eq('campaign_id', body.campaign_id).eq('category', 'ads'),
    svc.from('campaign_revenue').select('amount').eq('campaign_id', body.campaign_id),
  ]);
  const cost = (costs ?? []).reduce((s, c) => s + Number(c.amount ?? 0), 0);
  const rev  = (revs ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const roas = cost > 0 ? rev / cost : 0;
  return jsonResp({
    action: 'report_roas',
    campaign_id: body.campaign_id,
    ads_spend_eur: cost,
    revenue_eur: rev,
    roas: Number(roas.toFixed(2)),
    verdict:
      cost === 0 ? 'no_spend_yet' :
      roas >= 3  ? 'healthy' :
      roas >= 1  ? 'breakeven' :
      'underperforming',
  });
}

// ─── Router ────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errResp('Method not allowed', 405);

  let body: ReqBody;
  try { body = await req.json(); }
  catch { return errResp('Invalid JSON body'); }

  if (!body.organization_id) return errResp('organization_id required');
  if (!body.action) return errResp('action required');

  const svc = svcClient();

  // ─── AI rate-limit context (Sprint-3 #17) ───
  // Only enforce the quota when this call is made by an end user (JWT). When
  // invoked by the orchestrator (service-role) or another internal worker, we
  // skip the check — the orchestrator already paid the "user-initiated" tax.
  let aiCtx: AiCtx | null = null;
  const authHeader = req.headers.get('Authorization') ?? '';
  if (authHeader && authHeader !== `Bearer ${SUPABASE_SERVICE_KEY}`) {
    try {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const quota = await checkAiQuota(svc, { userId: user.id, functionName: FN_NAME });
        if (!quota.ok) return rateLimitResponse(quota);
        aiCtx = { supa: svc, userId: user.id, organizationId: body.organization_id };
      }
    } catch {
      // Best-effort — fall through with aiCtx = null (no logging, no enforcement)
    }
  }

  // If invoked with a run_id, mark the run as running.
  if (body.run_id) {
    await svc.from('agent_runs').update({
      status: 'running', started_at: new Date().toISOString(),
    }).eq('id', body.run_id);
  }

  let result: Response;
  try {
    switch (body.action) {
      case 'boost_post':     result = await actionBoostPost(svc, body, aiCtx);     break;
      case 'draft_campaign': result = await actionDraftCampaign(svc, body, aiCtx); break;
      case 'pace_budget':    result = await actionPaceBudget(svc, body);    break;
      case 'report_roas':    result = await actionReportRoas(svc, body);    break;
      default: return errResp(`Unknown action: ${body.action}`);
    }
  } catch (e) {
    if (body.run_id) {
      await svc.from('agent_runs').update({
        status: 'failed',
        error_message: e instanceof Error ? e.message : 'unknown',
        finished_at: new Date().toISOString(),
      }).eq('id', body.run_id);
    }
    return errResp(e instanceof Error ? e.message : 'Internal error', 500);
  }

  // On success, persist the output back into agent_runs.
  if (body.run_id && result.ok) {
    const cloned = result.clone();
    const out = await cloned.json();
    await svc.from('agent_runs').update({
      status: 'completed',
      output: out,
      finished_at: new Date().toISOString(),
    }).eq('id', body.run_id);
  }
  return result;
});
