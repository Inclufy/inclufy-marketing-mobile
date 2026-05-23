// ════════════════════════════════════════════════════════════════════
// AI Chat — generic conversational endpoint for the AICopilot widget.
//
// Trigger: src/components/AICopilot.tsx → supabase.functions.invoke('ai-chat', {
//   body: { messages: [{role,content}, ...], system_prompt: string }
// })
//
// Returns: { response: string, model: 'gpt-4o-mini', input_tokens, output_tokens }
//
// Cost per call: ~$0.001-0.005 (gpt-4o-mini, ~10 message history).
// ════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAiQuota, logAiCall } from '../_shared/ai-rate-limit.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_NAME = 'ai-chat';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    // Auth — Supabase gateway has already verified the JWT (verify_jwt=true);
    // we just need the user_id for rate-limiting + logging.
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const userMessages = Array.isArray(body.messages) ? body.messages : [];
    const systemPrompt: string = typeof body.system_prompt === 'string'
      ? body.system_prompt
      : 'You are a helpful AI marketing copilot for Inclufy Marketing. Answer in the user\'s language. Be concise and practical.';

    if (userMessages.length === 0) {
      return jsonResp({ error: 'messages array required' }, 400);
    }

    // Cap to last 10 messages defensively (the frontend already does this).
    const trimmed = userMessages.slice(-10).map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : (m.role === 'system' ? 'system' : 'user'),
      content: String(m.content ?? ''),
    }));

    // Rate-limit
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const quota = await checkAiQuota(admin, { userId: user.id, functionName: FN_NAME });
    if (!quota.ok) {
      return jsonResp({ error: 'rate_limited', ...quota }, 429);
    }

    // OpenAI call
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...trimmed],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error(`[${FN_NAME}] OpenAI ${openaiRes.status}: ${errText}`);
      return jsonResp({ error: `OpenAI error ${openaiRes.status}` }, 502);
    }

    const openaiJson = await openaiRes.json();
    const responseText = openaiJson.choices?.[0]?.message?.content ?? '';
    const usage = openaiJson.usage ?? {};

    await logAiCall(admin, {
      userId: user.id,
      functionName: FN_NAME,
      provider: 'openai',
      model: 'gpt-4o-mini',
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      status: 'sent',
    });

    return jsonResp({
      response: responseText,
      model: 'gpt-4o-mini',
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
    });
  } catch (e) {
    console.error(`[${FN_NAME}] handler error:`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
