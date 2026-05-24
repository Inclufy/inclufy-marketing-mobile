// content-social — generate a social media post for a specific channel.
// Input:  { topic, channel: 'linkedin'|'instagram'|'facebook'|'x'|'tiktok'|'threads'|'pinterest'|'youtube'|'whatsapp', tone?, language?, with_hashtags? }
// Output: { post: { content, hashtags: string[] }, model, input_tokens, output_tokens }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAiQuota, logAiCall } from '../_shared/ai-rate-limit.ts';
import { openaiChat, jsonResp, corsHeaders, getAuthUser } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_NAME = 'content-social';

// Per-channel character limit guidance (soft).
const LIMITS: Record<string, number> = {
  x: 280, threads: 500, linkedin: 1300, instagram: 2200,
  facebook: 2000, tiktok: 2200, pinterest: 500, youtube: 1500, whatsapp: 1024,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const user = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const topic = String(body.topic ?? '').trim();
    if (!topic) return jsonResp({ error: 'topic required' }, 400);
    const channel = String(body.channel ?? 'linkedin').toLowerCase();
    const tone = String(body.tone ?? 'engaging');
    const language = ['nl', 'fr', 'en'].includes(body.language) ? body.language : 'en';
    const withHashtags = body.with_hashtags !== false;
    const limit = LIMITS[channel] ?? 1500;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const quota = await checkAiQuota(admin, { userId: user.id, functionName: FN_NAME });
    if (!quota.ok) return jsonResp({ error: 'rate_limited', ...quota }, 429);

    const langLabel = language === 'nl' ? 'Dutch' : language === 'fr' ? 'French' : 'English';
    const systemPrompt = `You write social posts for ${channel}. Language: ${langLabel}. Tone: ${tone}. Soft char limit: ${limit}. Return ONLY JSON: {"content": string, "hashtags": string[]}. ${withHashtags ? 'Include 3-6 relevant hashtags.' : 'Empty hashtags array.'}`;

    const result = await openaiChat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: topic },
      ],
      temperature: 0.8,
      max_tokens: 600,
      response_format: { type: 'json_object' },
    });

    let post: { content: string; hashtags: string[] } = { content: '', hashtags: [] };
    try {
      const parsed = JSON.parse(result.text);
      post = { content: String(parsed.content ?? ''), hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : [] };
    } catch {
      // Fallback: treat raw text as content
      post = { content: result.text, hashtags: [] };
    }

    await logAiCall(admin, {
      userId: user.id, functionName: FN_NAME, provider: 'openai',
      model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, status: 'sent',
    });

    return jsonResp({ post, model: result.model, input_tokens: result.inputTokens, output_tokens: result.outputTokens });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
