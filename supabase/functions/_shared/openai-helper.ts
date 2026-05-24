// ─────────────────────────────────────────────────────────────────────
// Shared OpenAI helper for the AI edge-function family
// (ai-write, ai-image, sales-chat, content-social, content-email,
//  content-improve, content-analyze-url, generate-mascot, setup-agent).
//
// Every AI fn duplicates the same boilerplate: build the request, set
// auth header, parse the response shape, handle the common 429/5xx.
// Centralizing it here keeps every fn ~60 lines instead of ~200 and
// makes upgrades (new model, different temperature defaults) a one-line
// change in this file.
// ─────────────────────────────────────────────────────────────────────

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_BASE = 'https://api.openai.com/v1';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export interface ChatOpts {
  model?: 'gpt-4o-mini' | 'gpt-4o';
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
}

export interface ChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export async function openaiChat(opts: ChatOpts): Promise<ChatResult> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  const model = opts.model ?? 'gpt-4o-mini';
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens ?? 1500,
      ...(opts.response_format ? { response_format: opts.response_format } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return {
    text: json.choices?.[0]?.message?.content ?? '',
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
    model,
  };
}

export interface ImageOpts {
  prompt: string;
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
}

export interface ImageResult {
  url: string;
  revised_prompt?: string;
}

export async function openaiImage(opts: ImageOpts): Promise<ImageResult> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  const res = await fetch(`${OPENAI_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: opts.prompt,
      size: opts.size ?? '1024x1024',
      quality: opts.quality ?? 'standard',
      style: opts.style ?? 'vivid',
      n: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI Image ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return {
    url: json.data?.[0]?.url ?? '',
    revised_prompt: json.data?.[0]?.revised_prompt,
  };
}

// Auth helper — every fn extracts the user from the JWT and rejects 401.
export async function getAuthUser(req: Request, supabaseUrl: string, anonKey: string) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error } = await userClient.auth.getUser(jwt);
  if (error || !user) return null;
  return user;
}
