// content-improve — polish existing text (clarity, grammar, tone, brevity).
// Input:  { text: string, instruction?: string, language?: 'nl'|'fr'|'en' }
// Output: { improved: string, diff_summary: string, model, input_tokens, output_tokens }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAiQuota, logAiCall } from '../_shared/ai-rate-limit.ts';
import { openaiChat, jsonResp, corsHeaders, getAuthUser } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_NAME = 'content-improve';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const user = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const text = String(body.text ?? '').trim();
    if (!text) return jsonResp({ error: 'text required' }, 400);
    if (text.length > 8000) return jsonResp({ error: 'text too long (max 8000 chars)' }, 413);
    const instruction = String(body.instruction ?? 'Improve clarity, fix grammar, keep the original tone, make it 10-20% shorter.');
    const language = ['nl', 'fr', 'en'].includes(body.language) ? body.language : 'en';

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const quota = await checkAiQuota(admin, { userId: user.id, functionName: FN_NAME });
    if (!quota.ok) return jsonResp({ error: 'rate_limited', ...quota }, 429);

    const langLabel = language === 'nl' ? 'Dutch' : language === 'fr' ? 'French' : 'English';
    const systemPrompt = `You are an editor. Language: ${langLabel}. Instruction: ${instruction}. Return ONLY JSON: {"improved": string, "diff_summary": string (one sentence describing what changed)}.`;

    const result = await openaiChat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.4,
      max_tokens: Math.min(2000, text.length * 2),
      response_format: { type: 'json_object' },
    });

    let improved = text;
    let diffSummary = '';
    try {
      const parsed = JSON.parse(result.text);
      improved = String(parsed.improved ?? text);
      diffSummary = String(parsed.diff_summary ?? '');
    } catch {
      improved = result.text;
    }

    await logAiCall(admin, {
      userId: user.id, functionName: FN_NAME, provider: 'openai',
      model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, status: 'sent',
    });

    return jsonResp({ improved, diff_summary: diffSummary, model: result.model, input_tokens: result.inputTokens, output_tokens: result.outputTokens });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
