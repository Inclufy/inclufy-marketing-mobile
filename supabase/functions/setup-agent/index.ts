// setup-agent — onboarding orchestrator. Multi-action endpoint.
// Input:  { action: 'analyze-website' | 'analyze-competitors' | 'generate-strategy' | 'generate-personas' | 'generate-scoring' | 'generate-integrations' | 'generate-templates', ... }
// Output: shape depends on action. All responses include { action, _meta: { model, input_tokens, output_tokens } }.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAiQuota, logAiCall } from '../_shared/ai-rate-limit.ts';
import { openaiChat, jsonResp, corsHeaders, getAuthUser } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_NAME = 'setup-agent';

async function fetchPage(url: string): Promise<{ title: string; body: string; meta: string }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let html = ''; let bytes = 0;
    const reader = res.body?.getReader();
    if (!reader) throw new Error('no body');
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 200_000) { reader.cancel().catch(() => {}); break; }
      html += new TextDecoder().decode(value);
    }
    const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '').trim();
    const meta = (html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1] ?? '').trim();
    const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
    return { title, body, meta };
  } finally { clearTimeout(t); }
}

async function runAction(action: string, payload: any, userId: string, admin: any) {
  const langLabel = payload.language === 'nl' ? 'Dutch' : payload.language === 'fr' ? 'French' : 'English';
  let systemPrompt = ''; let userPrompt = '';

  switch (action) {
    case 'analyze-website': {
      if (!payload.url) throw new Error('url required');
      const page = await fetchPage(payload.url);
      systemPrompt = `Analyze a company website. Language: ${langLabel}. Return ONLY JSON: {"brand_name", "tagline", "industry", "description", "mission", "primary_color", "secondary_color", "tone", "brand_values": string[], "messaging_dos", "messaging_donts", "suggested_competitors": string[]}.`;
      userPrompt = `URL: ${payload.url}\nTitle: ${page.title}\nMeta: ${page.meta}\n\nBody:\n${page.body}`;
      break;
    }
    case 'analyze-competitors': {
      const comps = Array.isArray(payload.competitors) ? payload.competitors : [];
      systemPrompt = `You are a competitive intelligence analyst. Language: ${langLabel}. Return ONLY JSON: {"competitors": [{"name", "category": "direct"|"indirect"|"aspirational", "strengths": string[], "weaknesses": string[], "positioning": string}]}.`;
      userPrompt = `Our brand: ${payload.our_brand ?? ''}\nIndustry: ${payload.industry ?? ''}\nCompetitors to analyze: ${JSON.stringify(comps)}`;
      break;
    }
    case 'generate-strategy': {
      systemPrompt = `You are a marketing strategist. Language: ${langLabel}. Return ONLY JSON: {"strategy": {"summary"}, "objectives": [{"title", "description", "objective_type": "revenue"|"growth"|"acquisition"|"engagement", "priority": "high"|"medium"|"low", "target_value": number, "current_value": 0, "unit": "leads"|"EUR"|"%"|"posts"|"customers"}]}.`;
      userPrompt = `Brand: ${payload.brandName ?? ''}\nIndustry: ${payload.industry ?? ''}\nGoals (free text): ${JSON.stringify(payload.goals ?? [])}\nGenerate a 90-day strategy with 3-5 SMART objectives.`;
      break;
    }
    case 'generate-personas': {
      systemPrompt = `You are a CMO persona designer. Language: ${langLabel}. Return ONLY JSON: {"personas": [{"name", "demographics": {"age_range", "gender", "occupation", "income_range", "location"}, "psychographics": {"interests": string[]}, "behavioral": {"goals": string[], "pain_points": string[], "buying_behavior": string}}]}. Produce 2-3 personas.`;
      userPrompt = `Brand: ${payload.brandName ?? ''}\nIndustry: ${payload.industry ?? ''}\nAudience hint: ${JSON.stringify(payload.audiences ?? [])}`;
      break;
    }
    case 'generate-scoring': {
      systemPrompt = `You design lead-scoring rules. Language: ${langLabel}. Return ONLY JSON: {"model": {"name", "description", "threshold_mql": 50, "threshold_sql": 75, "category_weights": {"firmographic": 0.3, "demographic": 0.2, "behavioral": 0.3, "intent": 0.2}}, "rules": [{"name", "rule_type": "demographic"|"firmographic"|"behavioral"|"intent", "condition": {"field", "op": "=", "value"}, "points": 5}]}. 6-10 rules.`;
      userPrompt = `Brand: ${payload.brandName ?? ''}\nIndustry: ${payload.industry ?? ''}`;
      break;
    }
    case 'generate-integrations': {
      systemPrompt = `You recommend marketing integrations. Language: ${langLabel}. Return ONLY JSON: {"integrations": [{"platform": "meta"|"linkedin"|"google_ads"|"sendgrid"|"hubspot"|"mailchimp"|"zapier"|"slack"|"instagram"|"facebook"|"tiktok"|"x"|"whatsapp"|"youtube"|"pinterest"|"threads", "display_name", "category": "advertising"|"social"|"email"|"crm"|"analytics"|"communication"|"automation", "rationale"}]}. 5-7 entries.`;
      userPrompt = `Brand: ${payload.brandName ?? ''}\nIndustry: ${payload.industry ?? ''}\nGoals: ${JSON.stringify(payload.goals ?? [])}`;
      break;
    }
    case 'generate-templates': {
      systemPrompt = `You create reusable content templates. Language: ${langLabel}. Return ONLY JSON: {"templates": [{"name", "description", "content_type": "social"|"email"|"blog"|"ad", "category", "prompt_template": string with {{variables}}, "variables": string[]}]}. 4-6 templates.`;
      userPrompt = `Brand: ${payload.brandName ?? ''}\nIndustry: ${payload.industry ?? ''}`;
      break;
    }
    default:
      throw new Error(`unknown action: ${action}`);
  }

  const result = await openaiChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: action === 'analyze-website' ? 0.3 : 0.6,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });

  let parsed: any = {};
  try { parsed = JSON.parse(result.text); } catch { parsed = { raw: result.text }; }

  await logAiCall(admin, {
    userId, functionName: FN_NAME, provider: 'openai',
    model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, status: 'sent',
  });

  return { action, ...parsed, _meta: { model: result.model, input_tokens: result.inputTokens, output_tokens: result.outputTokens } };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const user = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '').trim();
    if (!action) return jsonResp({ error: 'action required' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const quota = await checkAiQuota(admin, { userId: user.id, functionName: FN_NAME });
    if (!quota.ok) return jsonResp({ error: 'rate_limited', ...quota }, 429);

    const out = await runAction(action, body, user.id, admin);
    return jsonResp(out);
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
