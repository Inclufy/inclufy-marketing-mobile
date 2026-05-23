// ════════════════════════════════════════════════════════════════════
// Growth Blueprint — synchronous website scan + AI analysis.
//
// Trigger: marketing-web ScanForm → supabase.functions.invoke('growth-blueprint', {
//   body: { company_name, website_url, industry }
// })
//
// Flow (no polling — single round-trip):
//   1. Auth check (JWT)
//   2. Rate-limit check (shared ai-rate-limit middleware)
//   3. Fetch website HTML, extract first 5 KB of text + meta tags
//   4. Call OpenAI gpt-4o-mini with structured JSON prompt
//   5. INSERT row into growth_blueprints (best-effort; non-fatal on error)
//   6. Return { blueprint, status_quo, recommendations } in the shape
//      ResultsView.tsx expects.
//
// Cost per call: ~$0.01-0.02 (gpt-4o-mini, 5KB website + meta as input).
// ════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAiQuota, logAiCall } from '../_shared/ai-rate-limit.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_NAME = 'growth-blueprint';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Strip HTML to text + extract meta tags ────────────────────────
function extractWebsiteSignals(html: string) {
  // Meta tags
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? '';
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '';
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '';
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '';
  // H1s
  const h1s = Array.from(html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi)).map((m) => m[1].trim()).slice(0, 5);
  // Body text (strip tags), trimmed to 5 KB to stay token-cheap
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);
  // Social links
  const socialLinks: Record<string, string> = {};
  for (const platform of ['linkedin', 'instagram', 'facebook', 'tiktok', 'twitter', 'youtube']) {
    const m = html.match(new RegExp(`href=["']([^"']*${platform}\\.com[^"']*)["']`, 'i'));
    if (m) socialLinks[platform] = m[1];
  }
  return { title, metaDesc, ogTitle, ogDesc, h1s, bodyText, socialLinks };
}

// ─── OpenAI call returning structured Growth Blueprint JSON ────────
async function analyzeWithLLM(opts: {
  company_name: string;
  website_url: string;
  industry: string;
  signals: ReturnType<typeof extractWebsiteSignals>;
}) {
  const prompt = `You are a senior marketing strategist. Analyze the following website and return a JSON Growth Blueprint.

COMPANY: ${opts.company_name}
URL: ${opts.website_url}
INDUSTRY (user-provided, may be empty): ${opts.industry || '(unknown)'}

WEBSITE SIGNALS:
- title: ${opts.signals.title}
- meta description: ${opts.signals.metaDesc}
- og:title: ${opts.signals.ogTitle}
- og:description: ${opts.signals.ogDesc}
- H1s: ${opts.signals.h1s.join(' | ')}
- detected social links: ${Object.keys(opts.signals.socialLinks).join(', ') || '(none)'}
- body excerpt: ${opts.signals.bodyText.slice(0, 3000)}

Return ONLY a valid JSON object with this exact shape:
{
  "overall_score": <0-100>,
  "website_score": <0-100>,
  "seo_score": <0-100>,
  "content_score": <0-100>,
  "social_score": <0-100>,
  "media_presence_score": <0-100>,
  "industry": "<detected or echo user's>",
  "value_proposition": "<one sentence>",
  "target_audience": "<one sentence>",
  "key_services": ["<service 1>", "<service 2>", ...],
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "weaknesses": ["<weakness 1>", "<weakness 2>", ...],
  "recommendations": [
    {"title": "<short>", "description": "<one paragraph>", "priority": "critical"|"high"|"medium"|"low"}
  ]
}

Be specific and grounded in the actual website signals. 3-5 items per array. Output JSON only, no markdown fence.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(content);
  const usage = json.usage ?? {};
  return { parsed, inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0 };
}

// ─── Main handler ──────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    // Auth — Supabase gateway has already verified the JWT (verify_jwt=true);
    // we just need the user_id for rate-limiting and DB writes.
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const company_name = String(body.company_name ?? '').trim();
    const website_url  = String(body.website_url ?? '').trim();
    const industry     = String(body.industry ?? '').trim();
    if (!company_name || !website_url) {
      return jsonResp({ error: 'company_name + website_url required' }, 400);
    }

    // Normalise URL — accept "www.foo.com" / "foo.com" / "https://foo.com"
    let url = website_url;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    // Rate-limit
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const quota = await checkAiQuota(admin, { userId: user.id, functionName: FN_NAME });
    if (!quota.ok) {
      return jsonResp({ error: 'rate_limited', ...quota }, 429);
    }

    // Fetch website (10s timeout — many marketing sites are slow)
    let html = '';
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const siteRes = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InclufyGrowthBlueprint/1.0)' },
      });
      clearTimeout(t);
      if (siteRes.ok) html = (await siteRes.text()).slice(0, 200_000); // hard cap 200 KB
    } catch (e) {
      console.warn(`[${FN_NAME}] site fetch failed: ${(e as Error).message}`);
      // continue with empty html — LLM will work off company_name + industry only
    }
    const signals = extractWebsiteSignals(html);

    // LLM
    const { parsed, inputTokens, outputTokens } = await analyzeWithLLM({
      company_name, website_url: url, industry, signals,
    });

    await logAiCall(admin, {
      userId: user.id, functionName: FN_NAME, provider: 'openai',
      model: 'gpt-4o-mini', inputTokens, outputTokens, status: 'sent',
    });

    // Shape the response for ResultsView.tsx (its nested shape).
    const blueprintRow = {
      user_id: user.id,
      company_name,
      website_url: url,
      industry: parsed.industry ?? industry,
      overall_score: parsed.overall_score ?? 0,
      status: 'completed',
      scan_progress: 100,
      status_quo: {
        website_url: url,
        industry: parsed.industry ?? industry,
        website_score: parsed.website_score ?? 0,
        seo_score: parsed.seo_score ?? 0,
        content_score: parsed.content_score ?? 0,
        social_score: parsed.social_score ?? 0,
        media_presence_score: parsed.media_presence_score ?? 0,
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        ai_analysis: {
          industry: parsed.industry ?? industry,
          value_proposition: parsed.value_proposition ?? '',
          target_audience: parsed.target_audience ?? '',
          key_services: Array.isArray(parsed.key_services) ? parsed.key_services : [],
          founders: [], // not detected by this minimal scan
        },
      },
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    };

    // Best-effort persist. Table may or may not exist on prod (was Lovable-
    // created — see tmp/ghost_tables_schema_proposal_20260523.md). If insert
    // fails, return the blueprint anyway — UI doesn't strictly need an id.
    let savedId: string | null = null;
    try {
      const { data: saved } = await admin
        .from('growth_blueprints')
        .insert({
          user_id: user.id,
          company_name,
          website_url: url,
          industry: parsed.industry ?? industry,
          overall_score: parsed.overall_score ?? 0,
          status: 'completed',
          scan_progress: 100,
          status_quo: blueprintRow.status_quo,
          recommendations: blueprintRow.recommendations,
        })
        .select('id')
        .single();
      savedId = saved?.id ?? null;
    } catch (e) {
      console.warn(`[${FN_NAME}] persist skipped: ${(e as Error).message}`);
    }

    return jsonResp({
      blueprint: {
        id: savedId ?? crypto.randomUUID(),
        company_name,
        overall_score: parsed.overall_score ?? 0,
        status: 'completed',
        setup_completed: false,
      },
      status_quo: blueprintRow.status_quo,
      recommendations: blueprintRow.recommendations,
    });
  } catch (e) {
    console.error(`[${FN_NAME}] handler error:`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
