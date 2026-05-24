// generate-mascot — branded mascot illustration via DALL-E 3.
// Input:  { brand: string, traits?: string[], setting?: string, style?: 'cartoon'|'flat'|'3d' }
// Output: { url, revised_prompt, model: 'dall-e-3' }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAiQuota, logAiCall } from '../_shared/ai-rate-limit.ts';
import { openaiImage, jsonResp, corsHeaders, getAuthUser } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_NAME = 'generate-mascot';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const user = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const brand = String(body.brand ?? '').trim();
    if (!brand) return jsonResp({ error: 'brand required' }, 400);
    const traits = Array.isArray(body.traits) ? body.traits.map(String) : ['friendly', 'professional'];
    const setting = String(body.setting ?? 'plain neutral background');
    const style = ['cartoon', 'flat', 'three-d', '3d'].includes(body.style) ? body.style : 'flat';
    const styleClause = style === '3d' || style === 'three-d' ? 'modern 3D character render' : style === 'cartoon' ? 'friendly cartoon illustration' : 'clean flat-design vector illustration';

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const quota = await checkAiQuota(admin, { userId: user.id, functionName: FN_NAME });
    if (!quota.ok) return jsonResp({ error: 'rate_limited', ...quota }, 429);

    const prompt = `${styleClause} of a brand mascot character for "${brand}". Traits: ${traits.join(', ')}. ${setting}. Single character, full body, soft lighting, brand-safe, no text in the image, transparent or neutral background.`;

    const result = await openaiImage({ prompt, size: '1024x1024', quality: 'standard' });

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
