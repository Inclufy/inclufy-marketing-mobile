// ai-image — DALL-E 3 image generation wrapper.
// Input:  { prompt: string, size?: '1024x1024'|'1792x1024'|'1024x1792', quality?: 'standard'|'hd', style?: 'vivid'|'natural' }
// Output: { url, revised_prompt, model: 'dall-e-3' }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAiQuota, logAiCall } from '../_shared/ai-rate-limit.ts';
import { openaiImage, jsonResp, corsHeaders, getAuthUser } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_NAME = 'ai-image';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const user = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt ?? '').trim();
    if (!prompt) return jsonResp({ error: 'prompt required' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // DALL-E is ~10x the cost of gpt-4o-mini — shares global per-user quota
    // for now (set AI_MAX_PER_DAY in Supabase secrets to tighten if needed).
    const quota = await checkAiQuota(admin, { userId: user.id, functionName: FN_NAME });
    if (!quota.ok) return jsonResp({ error: 'rate_limited', ...quota }, 429);

    const result = await openaiImage({
      prompt,
      size: body.size,
      quality: body.quality,
      style: body.style,
    });

    await logAiCall(admin, {
      userId: user.id, functionName: FN_NAME, provider: 'openai',
      model: 'dall-e-3', inputTokens: 0, outputTokens: 0, status: 'sent',
    });

    return jsonResp({ url: result.url, revised_prompt: result.revised_prompt, model: 'dall-e-3' });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
