// content-email — generate an email (subject + preheader + html_body + text_body).
// Input:  { topic, audience?, tone?, language?, cta?, type?: 'newsletter'|'cold'|'nurture'|'announcement' }
// Output: { email: { subject, preheader, html_body, text_body }, model, input_tokens, output_tokens }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAiQuota, logAiCall } from '../_shared/ai-rate-limit.ts';
import { openaiChat, jsonResp, corsHeaders, getAuthUser } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_NAME = 'content-email';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const user = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const topic = String(body.topic ?? '').trim();
    if (!topic) return jsonResp({ error: 'topic required' }, 400);
    const audience = String(body.audience ?? '');
    const tone = String(body.tone ?? 'professional');
    const language = ['nl', 'fr', 'en'].includes(body.language) ? body.language : 'en';
    const cta = String(body.cta ?? 'Learn more');
    const type = ['newsletter', 'cold', 'nurture', 'announcement'].includes(body.type) ? body.type : 'newsletter';

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const quota = await checkAiQuota(admin, { userId: user.id, functionName: FN_NAME });
    if (!quota.ok) return jsonResp({ error: 'rate_limited', ...quota }, 429);

    const langLabel = language === 'nl' ? 'Dutch' : language === 'fr' ? 'French' : 'English';
    const systemPrompt = `You write marketing emails (type=${type}). Language: ${langLabel}. Tone: ${tone}. ${audience ? `Audience: ${audience}.` : ''} CTA: "${cta}". Return ONLY JSON: {"subject": string (<60 chars), "preheader": string (<100 chars), "html_body": string (well-formed HTML, basic tags only), "text_body": string (plain text version)}.`;

    const result = await openaiChat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: topic },
      ],
      temperature: 0.7,
      max_tokens: 1800,
      response_format: { type: 'json_object' },
    });

    let email = { subject: '', preheader: '', html_body: '', text_body: '' };
    try {
      const parsed = JSON.parse(result.text);
      email = {
        subject: String(parsed.subject ?? ''),
        preheader: String(parsed.preheader ?? ''),
        html_body: String(parsed.html_body ?? ''),
        text_body: String(parsed.text_body ?? ''),
      };
    } catch {
      email = { subject: '', preheader: '', html_body: result.text, text_body: result.text };
    }

    await logAiCall(admin, {
      userId: user.id, functionName: FN_NAME, provider: 'openai',
      model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, status: 'sent',
    });

    return jsonResp({ email, model: result.model, input_tokens: result.inputTokens, output_tokens: result.outputTokens });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
