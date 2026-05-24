// content-analyze-url — fetch a URL, extract main text, summarize + extract topics.
// Input:  { url: string, language?: 'nl'|'fr'|'en' }
// Output: { summary, topics: string[], suggested_posts: string[], model, input_tokens, output_tokens }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkAiQuota, logAiCall } from '../_shared/ai-rate-limit.ts';
import { openaiChat, jsonResp, corsHeaders, getAuthUser } from '../_shared/openai-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FN_NAME = 'content-analyze-url';

async function fetchAndExtract(url: string): Promise<{ title: string; body: string }> {
  // 10s timeout, cap at 200KB to avoid blowing memory on enormous pages.
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('no body');
    let html = ''; let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 200_000) { reader.cancel().catch(() => {}); break; }
      html += new TextDecoder().decode(value);
    }
    // Naive extraction: drop scripts/styles, strip tags, collapse whitespace.
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '').trim();
    return { title, body: cleaned.slice(0, 6000) };
  } finally {
    clearTimeout(t);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    const user = await getAuthUser(req, SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const url = String(body.url ?? '').trim();
    if (!url || !/^https?:\/\//i.test(url)) return jsonResp({ error: 'valid http(s) url required' }, 400);
    const language = ['nl', 'fr', 'en'].includes(body.language) ? body.language : 'en';

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const quota = await checkAiQuota(admin, { userId: user.id, functionName: FN_NAME });
    if (!quota.ok) return jsonResp({ error: 'rate_limited', ...quota }, 429);

    const { title, body: pageBody } = await fetchAndExtract(url);
    if (!pageBody) return jsonResp({ error: 'could not extract page content' }, 422);

    const langLabel = language === 'nl' ? 'Dutch' : language === 'fr' ? 'French' : 'English';
    const systemPrompt = `You analyze webpage content. Language: ${langLabel}. Return ONLY JSON: {"summary": string (2-4 sentences), "topics": string[] (3-5 key topics), "suggested_posts": string[] (3 short social-post drafts based on the content)}.`;
    const userInput = `URL: ${url}\nTitle: ${title}\n\nContent excerpt:\n${pageBody}`;

    const result = await openaiChat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput },
      ],
      temperature: 0.5,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    let out = { summary: '', topics: [] as string[], suggested_posts: [] as string[] };
    try {
      const parsed = JSON.parse(result.text);
      out = {
        summary: String(parsed.summary ?? ''),
        topics: Array.isArray(parsed.topics) ? parsed.topics.map(String) : [],
        suggested_posts: Array.isArray(parsed.suggested_posts) ? parsed.suggested_posts.map(String) : [],
      };
    } catch { /* keep defaults */ }

    await logAiCall(admin, {
      userId: user.id, functionName: FN_NAME, provider: 'openai',
      model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, status: 'sent',
    });

    return jsonResp({ ...out, model: result.model, input_tokens: result.inputTokens, output_tokens: result.outputTokens });
  } catch (e) {
    console.error(`[${FN_NAME}]`, e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
