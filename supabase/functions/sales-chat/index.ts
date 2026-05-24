// sales-chat — conversational sales assistant for the marketing-web SPA.
// Input:  { messages: [{role,content}, ...], context?: { brand?, audience?, offering? } }
// Output: { response: string, model, input_tokens, output_tokens }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAiQuota, logAiCall } from '../_shared/ai-rate-limit.ts';
import { openaiChat, jsonResp, corsHeaders, getAuthUser } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_NAME = 'sales-chat';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const user = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const userMessages = Array.isArray(body.messages) ? body.messages : [];
    if (userMessages.length === 0) return jsonResp({ error: 'messages required' }, 400);
    const ctx = body.context ?? {};

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const quota = await checkAiQuota(admin, { userId: user.id, functionName: FN_NAME });
    if (!quota.ok) return jsonResp({ error: 'rate_limited', ...quota }, 429);

    const sysParts = [
      'You are a sales assistant for the Inclufy AI Marketing platform.',
      'Goal: help the prospect understand fit, objections, and next steps.',
      'Style: helpful, concise (max 4 short paragraphs), no hard-sell.',
    ];
    if (ctx.brand) sysParts.push(`Prospect brand: ${ctx.brand}.`);
    if (ctx.audience) sysParts.push(`Their audience: ${ctx.audience}.`);
    if (ctx.offering) sysParts.push(`Our offering: ${ctx.offering}.`);

    const trimmed = userMessages.slice(-10).map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : (m.role === 'system' ? 'system' : 'user'),
      content: String(m.content ?? ''),
    }));

    const result = await openaiChat({
      messages: [{ role: 'system', content: sysParts.join(' ') }, ...trimmed],
      temperature: 0.6,
      max_tokens: 700,
    });

    await logAiCall(admin, {
      userId: user.id, functionName: FN_NAME, provider: 'openai',
      model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, status: 'sent',
    });

    return jsonResp({ response: result.text, model: result.model, input_tokens: result.inputTokens, output_tokens: result.outputTokens });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
