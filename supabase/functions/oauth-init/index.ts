// oauth-init — server-side OAuth-URL builder for the marketing-web SPA.
// Mirrors the client-side URL builders in
//   src/components/wizard/StepConnect.tsx (AMOS mobile)
// and centralizes them server-side so:
//   1. Client-IDs stay out of the web bundle (publishable but cleaner)
//   2. Scope strings + provider quirks (IG-direct, Pinterest sandbox) are
//      maintained in ONE place that both apps can call
//   3. State always carries the `:web` suffix so oauth-callback knows to
//      redirect back to the web SPA instead of the `inclufy-go://` deep link
//
// Input:  POST { platform: 'linkedin'|'instagram'|'facebook'|'tiktok'|'pinterest'|'threads' }
// Output: { authorization_url: string, state: string }
// Auth:   JWT required (caller must be authenticated user)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/oauth-callback`;

// Public client IDs — same fallbacks used in mobile StepConnect.tsx.
// Override via Supabase secrets when rotating apps.
const LINKEDIN_CLIENT_ID  = Deno.env.get('LINKEDIN_CLIENT_ID')  ?? '789493c65q6j5e';
const META_APP_ID         = Deno.env.get('META_APP_ID')         ?? '947950264797942';
const INSTAGRAM_APP_ID    = Deno.env.get('INSTAGRAM_APP_ID')    ?? '2250348065370973';
const TIKTOK_CLIENT_KEY   = Deno.env.get('TIKTOK_CLIENT_KEY')   ?? 'sbaw0n7p637do602ql';
const PINTEREST_CLIENT_ID = Deno.env.get('PINTEREST_CLIENT_ID') ?? '1568759';
const THREADS_APP_ID      = Deno.env.get('THREADS_APP_ID')      ?? '952201194080195';

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

interface PlatformConfig {
  platformInState: string;
  authUrl: string;
}

function buildAuthUrl(platform: string, state: string): PlatformConfig {
  switch (platform) {
    case 'linkedin': {
      const scopes = 'openid profile email w_member_social';
      const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code` +
        `&client_id=${LINKEDIN_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&state=${encodeURIComponent(state)}`;
      return { platformInState: 'linkedin', authUrl: url };
    }
    case 'facebook': {
      const scope = 'pages_show_list,pages_manage_posts,pages_read_engagement,business_management,public_profile';
      const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${META_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&response_type=code` +
        `&state=${encodeURIComponent(state)}`;
      return { platformInState: 'facebook', authUrl: url };
    }
    case 'instagram': {
      // IG-direct flow — state platform key is 'instagram-direct' so
      // oauth-callback routes to the api.instagram.com path.
      const igScope = 'instagram_business_basic,instagram_business_content_publish';
      const params = new URLSearchParams({
        force_reauth: 'true',
        enable_fb_login: '0',
        force_authentication: '1',
        client_id: INSTAGRAM_APP_ID,
        redirect_uri: REDIRECT_URI,
        scope: igScope,
        response_type: 'code',
        state, // state is overridden by caller below
      });
      return {
        platformInState: 'instagram-direct',
        authUrl: `https://www.instagram.com/oauth/authorize?${params.toString()}`,
      };
    }
    case 'tiktok': {
      const scope = 'user.info.basic,video.publish';
      const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&response_type=code` +
        `&state=${encodeURIComponent(state)}`;
      return { platformInState: 'tiktok', authUrl: url };
    }
    case 'pinterest': {
      const scope = 'pins:read,pins:write,boards:read,boards:write,user_accounts:read';
      const url = `https://www.pinterest.com/oauth/?response_type=code&client_id=${PINTEREST_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&state=${encodeURIComponent(state)}`;
      return { platformInState: 'pinterest', authUrl: url };
    }
    case 'threads': {
      const scope = 'threads_basic,threads_content_publish';
      const url = `https://threads.net/oauth/authorize?client_id=${THREADS_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&response_type=code` +
        `&state=${encodeURIComponent(state)}`;
      return { platformInState: 'threads', authUrl: url };
    }
    default:
      throw new Error(`Platform '${platform}' not yet supported for web OAuth. Supported: linkedin, facebook, instagram, tiktok, pinterest, threads. (X/Twitter, YouTube, WhatsApp require platform-specific setup — for now connect via the AMOS mobile app.)`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResp({ error: 'POST only' }, 405);

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !user) return jsonResp({ error: 'unauthenticated' }, 401);

    const body = await req.json().catch(() => ({}));
    const platform = String(body.platform ?? '').toLowerCase().trim();
    if (!platform) return jsonResp({ error: 'platform required' }, 400);

    // Resolve org_id (best-effort — falls back to user_id for solo accounts)
    let orgId = user.id;
    try {
      const { data: org } = await userClient
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (org?.organization_id) orgId = org.organization_id;
    } catch { /* ignore — fall back to user_id */ }

    // First build with the canonical platform name, then re-state with the
    // platform-in-state value (some providers like Instagram use a different
    // platform key in state to flag a special flow).
    const tentative = buildAuthUrl(platform, '');
    // State format: user_id:organization_id:platform-in-state:caller
    // `:web` suffix tells oauth-callback to redirect to web URL instead
    // of the inclufy-go:// deep link.
    const state = `${user.id}:${orgId}:${tentative.platformInState}:web`;
    const built = buildAuthUrl(platform, state);

    return jsonResp({ authorization_url: built.authUrl, state });
  } catch (e) {
    console.error('[oauth-init]', e);
    return jsonResp({ error: (e as Error).message ?? 'internal' }, 500);
  }
});
