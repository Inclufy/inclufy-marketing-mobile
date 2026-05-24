// ai-write — generic AI text generator.
// Input:  { topic: string, tone?: string, length?: 'short'|'medium'|'long', language?: 'nl'|'en'|'fr' }
// Output: { text: string, model, input_tokens, output_tokens }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAiQuota, logAiCall } from '../_shared/ai-rate-limit.ts';
import { openaiChat, jsonResp, corsHeaders, getAuthUser } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_NAME = 'ai-write';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const user = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const topic = String(body.topic ?? '').trim();
    if (!topic) return jsonResp({ error: 'topic required' }, 400);
    const tone = String(body.tone ?? 'professional');
    const length = body.length === 'short' ? 'short' : body.length === 'long' ? 'long' : 'medium';
    const language = ['nl', 'fr', 'en'].includes(body.language) ? body.language : 'en';
    const max_tokens = length === 'short' ? 200 : length === 'long' ? 1500 : 600;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const quota = await checkAiQuota(admin, { userId: user.id, functionName: FN_NAME });
    if (!quota.ok) return jsonResp({ error: 'rate_limited', ...quota }, 429);

    const langLabel = language === 'nl' ? 'Dutch' : language === 'fr' ? 'French' : 'English';
    const systemPrompt = `You are a marketing copywriter. Write in ${langLabel} with a ${tone} tone. Be concrete and avoid filler.`;

    const result = await openaiChat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: topic },
      ],
      temperature: 0.7,
      max_tokens,
    });

    await logAiCall(admin, {
      userId: user.id, functionName: FN_NAME, provider: 'openai',
      model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, status: 'sent',
    });

    return jsonResp({ text: result.text, model: result.model, input_tokens: result.inputTokens, output_tokens: result.outputTokens });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
