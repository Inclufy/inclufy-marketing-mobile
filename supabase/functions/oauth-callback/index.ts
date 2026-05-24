// Supabase Edge Function: OAuth Callback
// Handles OAuth callbacks for LinkedIn, Meta (Facebook/Instagram), and TikTok.
// Exchanges the authorization code for tokens, stores the social account,
// and redirects the user back to the app.
// Also supports fetching Facebook Pages and Instagram Business accounts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const META_APP_ID = Deno.env.get('META_APP_ID') ?? '';
const META_APP_SECRET = Deno.env.get('META_APP_SECRET') ?? '';
const TIKTOK_CLIENT_KEY = Deno.env.get('TIKTOK_CLIENT_KEY') ?? '';
const TIKTOK_CLIENT_SECRET = Deno.env.get('TIKTOK_CLIENT_SECRET') ?? '';

// The redirect URI must exactly match what's registered in developer consoles
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/oauth-callback`;

// Escape user-supplied text for safe HTML interpolation. Without this, error
// messages containing quotes (e.g. LinkedIn: `Scope "w_organization_social"
// is not authorized`) broke HTML attribute context and caused Safari to
// render the response as plain source text instead of rendered HTML.
function esc(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Web-caller success: return a 302 redirect to the marketing-web SPA's
// /oauth/return route so the SPA can show its own toast + invalidate
// React Query caches. Unlike the mobile flow we don't need an HTML page
// with deep-link JS — browser redirect works cleanly.
function webSuccessRedirect(platform: string, accountName: string) {
  const webBase = Deno.env.get('WEB_APP_BASE_URL') ?? 'https://marketing.inclufy.com';
  const params = new URLSearchParams({
    status: 'success',
    platform,
    account: accountName ?? '',
  });
  return new Response(null, {
    status: 302,
    headers: { 'Location': `${webBase}/oauth/return?${params.toString()}` },
  });
}

function webErrorRedirect(platform: string, message: string) {
  const webBase = Deno.env.get('WEB_APP_BASE_URL') ?? 'https://marketing.inclufy.com';
  const params = new URLSearchParams({
    status: 'error',
    platform: platform ?? '',
    message: message ?? '',
  });
  return new Response(null, {
    status: 302,
    headers: { 'Location': `${webBase}/oauth/return?${params.toString()}` },
  });
}

function successPage(platform: string, accountName: string, pages?: Array<{id: string, name: string}>) {
  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
  const platformColor: Record<string, string> = {
    facebook: '#1877F2',
    instagram: '#E4405F',
    linkedin: '#0077B5',
    tiktok: '#FE2C55',
  };
  const accent = platformColor[platform.toLowerCase()] ?? '#7C3AED';

  const pagesHtml = pages && pages.length > 0
    ? `<div class="pages">
        <p class="pages-title">${pages.length} ${pages.length === 1 ? 'account' : 'accounts'} ontdekt</p>
        ${pages.map(p => `<div class="page-row"><span class="check">✓</span><span>${esc(p.name)}</span></div>`).join('')}
       </div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="nl"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#7C3AED">
<title>${platformLabel} verbonden — AMOS</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;height:100%;overflow:hidden;-webkit-font-smoothing:antialiased}
  body{
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",system-ui,sans-serif;
    display:flex;flex-direction:column;justify-content:center;align-items:center;
    min-height:100vh;
    background:linear-gradient(160deg,#F7F6FF 0%,#EDE9FE 50%,${accent}15 100%);
    color:#1a1a2e;
    padding:24px;
    position:relative;
  }
  .pulse{
    position:absolute;
    top:50%;left:50%;
    transform:translate(-50%,-50%);
    width:280px;height:280px;
    border-radius:50%;
    background:radial-gradient(circle, ${accent}25 0%, transparent 70%);
    animation:pulse 3s ease-out infinite;
    pointer-events:none;
  }
  @keyframes pulse{
    0%{transform:translate(-50%,-50%) scale(0.8);opacity:0.8}
    100%{transform:translate(-50%,-50%) scale(1.4);opacity:0}
  }
  .card{
    background:rgba(255,255,255,0.95);
    backdrop-filter:blur(20px);
    -webkit-backdrop-filter:blur(20px);
    border-radius:24px;
    padding:40px 28px 32px;
    text-align:center;
    max-width:380px;
    width:100%;
    box-shadow:0 20px 60px rgba(124,58,237,0.18), 0 0 0 1px rgba(255,255,255,0.5) inset;
    position:relative;
    z-index:1;
    animation:slideUp 0.5s cubic-bezier(0.16,1,0.3,1) both;
  }
  @keyframes slideUp{
    from{opacity:0;transform:translateY(20px)}
    to{opacity:1;transform:translateY(0)}
  }
  .check-circle{
    width:80px;height:80px;
    margin:0 auto 24px;
    border-radius:50%;
    background:linear-gradient(135deg, ${accent}, ${accent}DD);
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 8px 24px ${accent}40;
    animation:bounce 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.1s both;
  }
  @keyframes bounce{
    from{opacity:0;transform:scale(0.3)}
    to{opacity:1;transform:scale(1)}
  }
  .check-circle svg{width:40px;height:40px;stroke:#fff;stroke-width:3.5;fill:none;stroke-linecap:round;stroke-linejoin:round}
  .check-circle path{stroke-dasharray:32;stroke-dashoffset:32;animation:draw 0.5s ease-out 0.4s forwards}
  @keyframes draw{to{stroke-dashoffset:0}}
  h1{font-size:26px;font-weight:700;margin:0 0 8px;color:#1a1a2e;letter-spacing:-0.02em}
  .platform-badge{
    display:inline-flex;align-items:center;gap:6px;
    padding:4px 12px;border-radius:999px;
    background:${accent}15;color:${accent};
    font-size:13px;font-weight:600;letter-spacing:-0.01em;
    margin-bottom:12px;
  }
  .subtitle{color:#525272;font-size:15px;margin:0 0 20px;line-height:1.5;font-weight:400}
  .subtitle strong{color:#1a1a2e;font-weight:600}
  .pages{
    margin:24px 0 8px;
    padding:16px;
    background:#FAFAFC;
    border-radius:14px;
    text-align:left;
    border:1px solid #EFEEFA;
  }
  .pages-title{font-size:13px;color:#525272;font-weight:600;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.04em}
  .page-row{
    display:flex;align-items:center;gap:10px;
    padding:8px 0;font-size:14px;color:#1a1a2e;font-weight:500;
  }
  .page-row + .page-row{border-top:1px solid #EFEEFA}
  .check{
    flex-shrink:0;width:20px;height:20px;border-radius:50%;
    background:${accent};color:#fff;
    display:flex;align-items:center;justify-content:center;
    font-size:11px;font-weight:700;
  }
  .footer-msg{
    font-size:14px;color:#888;margin:24px 0 0;line-height:1.5;
  }
  .countdown{
    margin-top:16px;
    height:4px;background:#EFEEFA;border-radius:2px;overflow:hidden;
    position:relative;
  }
  .countdown::after{
    content:'';position:absolute;left:0;top:0;height:100%;
    background:linear-gradient(90deg, ${accent}, ${accent}AA);
    border-radius:2px;
    animation:countdown 3s linear forwards;
  }
  @keyframes countdown{from{width:100%}to{width:0%}}
  .footer-brand{
    margin-top:32px;
    display:flex;align-items:center;justify-content:center;gap:6px;
    font-size:12px;color:#9999AA;letter-spacing:0.04em;
  }
  .footer-brand .dot{width:6px;height:6px;border-radius:50%;background:${accent}}
</style>
</head>
<body>
  <div class="pulse"></div>
  <div class="card">
    <div class="check-circle">
      <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
    </div>
    <div class="platform-badge">${platformLabel}</div>
    <h1>Verbonden!</h1>
    <p class="subtitle">${accountName ? `<strong>${esc(accountName)}</strong> is gekoppeld aan AMOS.` : `${platformLabel} is gekoppeld aan AMOS.`}</p>
    ${pagesHtml}
    <p class="footer-msg">Dit venster sluit automatisch.<br>Ga terug naar AMOS om verder te gaan.</p>
    <div class="countdown"></div>
    <div class="footer-brand"><span class="dot"></span>Powered by AMOS<span class="dot"></span></div>
  </div>
  <script>
    // Auto-close after 3 sec — works in SFSafariViewController on iOS
    setTimeout(function(){
      try { window.close(); } catch(e) {}
      // Fallback: redirect to a deep link if window.close doesn't work
      try { window.location.href = 'inclufy-go://oauth-success?platform=${platform}'; } catch(e) {}
    }, 3000);
  </script>
</body></html>`;
  // Return HTML success page with embedded JS deep-link redirect.
  //
  // We tried HTTP 302 redirect to inclufy-go:// scheme but iOS in-app
  // browsers (SFSafariViewController via expo-web-browser openBrowserAsync)
  // show a WHITE SCREEN because they can't follow custom URL schemes via
  // 302 Location header. They CAN follow them via document.location = '...'
  // in JavaScript, which is what we use here.
  //
  // After Build 233+ where wizard uses openAuthSessionAsync (which DOES
  // intercept custom-scheme redirects), we can switch back to 302.
  // For now stick with HTML+JS approach to keep Build 232 functional.
  const deepLink = `inclufy-go://oauth-success?platform=${encodeURIComponent(platform)}&account=${encodeURIComponent(accountName ?? '')}`;
  const wrappedHtml = html.replace(
    '<body>',
    `<body>
<script>
  (function(){
    // Try deep-link to bounce back to AMOS app
    setTimeout(function(){
      try { window.location.href = ${JSON.stringify(deepLink)}; } catch(e) {}
    }, 100);
    // Fallback: try window.close() after 2.5s if still on this page
    setTimeout(function(){ try { window.close(); } catch(e) {} }, 2500);
  })();
</script>`,
  );

  return new Response(wrappedHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

function errorPage(platform: string, reason: string, details?: string) {
  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
  const html = `<!DOCTYPE html>
<html lang="nl"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#DC2626">
<title>Verbinding mislukt — AMOS</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;height:100%;-webkit-font-smoothing:antialiased}
  body{
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",system-ui,sans-serif;
    display:flex;flex-direction:column;justify-content:center;align-items:center;
    min-height:100vh;
    background:linear-gradient(160deg,#FFF5F5 0%,#FEF2F2 50%,#FEE2E215 100%);
    color:#1a1a2e;
    padding:24px;
  }
  .card{
    background:rgba(255,255,255,0.95);
    backdrop-filter:blur(20px);
    -webkit-backdrop-filter:blur(20px);
    border-radius:24px;
    padding:40px 28px 32px;
    text-align:center;
    max-width:380px;
    width:100%;
    box-shadow:0 20px 60px rgba(220,38,38,0.15), 0 0 0 1px rgba(255,255,255,0.5) inset;
    animation:slideUp 0.5s cubic-bezier(0.16,1,0.3,1) both;
  }
  @keyframes slideUp{
    from{opacity:0;transform:translateY(20px)}
    to{opacity:1;transform:translateY(0)}
  }
  .error-circle{
    width:80px;height:80px;
    margin:0 auto 24px;
    border-radius:50%;
    background:linear-gradient(135deg,#DC2626,#B91C1C);
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 8px 24px rgba(220,38,38,0.3);
    animation:shake 0.6s cubic-bezier(0.36,0.07,0.19,0.97) 0.1s both;
  }
  @keyframes shake{
    0%,100%{transform:translateX(0)}
    20%,60%{transform:translateX(-6px)}
    40%,80%{transform:translateX(6px)}
  }
  .error-circle svg{width:40px;height:40px;stroke:#fff;stroke-width:3.5;fill:none;stroke-linecap:round;stroke-linejoin:round}
  h1{font-size:24px;font-weight:700;margin:0 0 8px;color:#1a1a2e;letter-spacing:-0.02em}
  .platform-badge{
    display:inline-flex;align-items:center;gap:6px;
    padding:4px 12px;border-radius:999px;
    background:#DC262615;color:#DC2626;
    font-size:13px;font-weight:600;
    margin-bottom:12px;
  }
  .reason{
    color:#525272;font-size:15px;margin:0 0 16px;line-height:1.5;
  }
  .reason strong{color:#1a1a2e;font-weight:600}
  .detail{
    font-size:12px;color:#888;margin-top:16px;padding:12px;
    background:#FAFAFC;border-radius:10px;text-align:left;
    border:1px solid #EFEEFA;font-family:ui-monospace,SF Mono,Menlo,monospace;
    word-break:break-all;line-height:1.4;max-height:120px;overflow:auto;
  }
  .help{
    margin-top:24px;font-size:14px;color:#888;line-height:1.5;
  }
  .help strong{color:#1a1a2e}
  .footer-brand{
    margin-top:32px;
    display:flex;align-items:center;justify-content:center;gap:6px;
    font-size:12px;color:#9999AA;letter-spacing:0.04em;
  }
  .footer-brand .dot{width:6px;height:6px;border-radius:50%;background:#DC2626}
</style>
</head>
<body>
  <div class="card">
    <div class="error-circle">
      <svg viewBox="0 0 24 24"><path d="M6 6L18 18 M6 18L18 6"/></svg>
    </div>
    <div class="platform-badge">${platformLabel}</div>
    <h1>Verbinding mislukt</h1>
    <p class="reason">${esc(reason)}</p>
    ${details ? `<div class="detail">${esc(details)}</div>` : ''}
    <p class="help">Ga terug naar <strong>AMOS</strong> en probeer opnieuw te verbinden.</p>
    <div class="footer-brand"><span class="dot"></span>Powered by AMOS<span class="dot"></span></div>
  </div>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function upsertSocialAccount(
  db: any,
  userId: string,
  platform: string,
  profileId: string,
  profileName: string,
  profilePicture: string,
  accessToken: string,
  accountType: string = 'personal',
  pageAccessToken?: string,
  expiresAt?: string | null,
  refreshToken?: string | null,
) {
  // Try to find existing account by user_id + platform + platform_account_id
  let { data: existing } = await db
    .from('social_accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('platform_account_id', profileId)
    .maybeSingle();

  // NOTE: Previous code deleted any other account on the same platform here to
  // "avoid unique constraint violations". That was wrong — the UNIQUE constraint
  // is on (user_id, platform, platform_account_id), so different platform_account_id
  // values on the same platform don't violate it. Deleting old rows also prevented
  // the user from connecting multiple accounts per platform (e.g. a personal LinkedIn
  // AND a company page). Removed to enable multi-account publishing with a picker
  // at publish time in the app.

  let socialAccountId: string;

  const accountData: any = {
    account_name: profileName,
    profile_image_url: profilePicture,
    platform_account_id: profileId,
    status: 'active',
    account_type: accountType,
  };

  if (existing) {
    socialAccountId = existing.id;
    const { error: updateErr } = await db
      .from('social_accounts')
      .update(accountData)
      .eq('id', socialAccountId);
    if (updateErr) {
      console.error('Update social_accounts error:', updateErr);
    }
  } else {
    const insertData: any = {
      user_id: userId,
      platform,
      platform_account_id: profileId,
      ...accountData,
    };

    // Try with organization_id first, fall back without it
    try {
      const { data: inserted, error: insertErr } = await db
        .from('social_accounts')
        .insert({ ...insertData, organization_id: userId })
        .select('id')
        .single();

      if (insertErr) throw insertErr;
      socialAccountId = inserted.id;
    } catch (err1: any) {
      console.log('Insert with organization_id failed, trying without:', err1.message);
      // Try without organization_id (column might not exist)
      const { data: inserted, error: insertErr } = await db
        .from('social_accounts')
        .insert(insertData)
        .select('id')
        .single();

      if (insertErr) throw insertErr;
      socialAccountId = inserted!.id;
    }
  }

  // Upsert oauth token
  const tokenToStore = pageAccessToken || accessToken;
  const { data: existingToken } = await db
    .from('oauth_tokens')
    .select('id')
    .eq('social_account_id', socialAccountId)
    .maybeSingle();

  if (expiresAt === undefined) {
    console.warn(`upsertSocialAccount: expires_at not provided for platform=${platform} account=${socialAccountId}`);
  }

  const now = new Date().toISOString();
  const tokenRecord: any = {
    social_account_id: socialAccountId,
    platform,
    access_token: tokenToStore,
    expires_at: expiresAt ?? null,
    refresh_token: refreshToken ?? null,
    updated_at: now,
  };

  if (existingToken) {
    await db.from('oauth_tokens').update(tokenRecord).eq('id', existingToken.id);
  } else {
    await db.from('oauth_tokens').insert(tokenRecord);
  }

  return socialAccountId;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  console.log('OAuth callback hit:', url.pathname + url.search);

  // ── Handle CORS preflight ──
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // ── Handle manual account connection (POST) ──
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { userId, platform, accountName, accountUrl, accountType } = body;

      if (!userId || !platform || !accountName) {
        return new Response(JSON.stringify({ error: 'Missing required fields' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const accountId = await upsertSocialAccount(
        db, userId, platform,
        accountUrl || accountName, // use URL as platform_account_id if available
        accountName,
        '', // no profile picture for manual connections
        '', // no access token for manual connections
        accountType || 'manual',
      );

      return new Response(JSON.stringify({ success: true, id: accountId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (err: any) {
      console.error('Manual connect error:', err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  // ── Handle OAuth callback (GET) ──
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') ?? '';
  const errorParam = url.searchParams.get('error');
  const errorDesc = url.searchParams.get('error_description') ?? '';

  console.log('OAuth params:', { code: code ? 'present' : 'missing', state, error: errorParam });

  if (errorParam) {
    console.error('OAuth error:', errorParam, errorDesc);
    return errorPage('social media', errorParam, errorDesc);
  }

  if (!code) {
    return errorPage('social media', 'Geen autorisatiecode ontvangen');
  }

  // Parse state → "user_id:organization_id:platform[:caller]"
  // Optional 4th part: 'web' = marketing-web SPA (redirect to web URL after success)
  //                    omitted = AMOS mobile (default, redirect to inclufy-go:// deep link)
  const parts = state.split(':');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    console.error('Invalid state parameter:', state);
    return errorPage('social media', 'Ongeldige state parameter');
  }
  const userId = parts[0];
  const platform = parts[2] || parts[1] || 'facebook';
  const callerHint = (parts[3] ?? '').toLowerCase();
  const isWebCaller = callerHint === 'web';

  try {
    let accessToken: string;
    let profileId: string;
    let profileName: string;
    let profilePicture: string;
    let pages: Array<{id: string, name: string, access_token: string, ig_id?: string}> = [];

    let tokenExpiresAt: string | null = null;
    let tokenRefreshToken: string | null = null;

    if (platform === 'linkedin') {
      // ─── LinkedIn ─────────────────────────────────────────────────
      const LINKEDIN_CLIENT_ID = Deno.env.get('LINKEDIN_CLIENT_ID') ?? '';
      const LINKEDIN_CLIENT_SECRET = Deno.env.get('LINKEDIN_CLIENT_SECRET') ?? '';

      console.log('LinkedIn token exchange with redirect_uri:', REDIRECT_URI);

      const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: LINKEDIN_CLIENT_ID,
          client_secret: LINKEDIN_CLIENT_SECRET,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('LinkedIn token exchange failed:', err);
        return errorPage('LinkedIn', 'Token exchange mislukt', err);
      }
      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;
      // LinkedIn returns expires_in (seconds); refresh_token only for r_email+offline_access scopes
      if (tokenData.expires_in) {
        tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
      } else {
        console.warn('LinkedIn token response missing expires_in');
      }
      tokenRefreshToken = tokenData.refresh_token ?? null;

      const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!profileRes.ok) {
        const err = await profileRes.text();
        console.error('LinkedIn profile fetch failed:', err);
        return errorPage('LinkedIn', 'Profiel ophalen mislukt', err);
      }
      const profile = await profileRes.json();
      profileId = profile.sub ?? '';
      profileName = profile.name ?? '';
      profilePicture = profile.picture ?? '';

    } else if (platform === 'tiktok') {
      // ─── TikTok ───────────────────────────────────────────────────
      console.log('TikTok token exchange');

      const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: TIKTOK_CLIENT_KEY,
          client_secret: TIKTOK_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('TikTok token exchange failed:', err);
        return errorPage('TikTok', 'Token exchange mislukt', err);
      }
      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token ?? tokenData.data?.access_token ?? '';
      const openId = tokenData.open_id ?? tokenData.data?.open_id ?? '';
      const ttExpiresIn = tokenData.expires_in ?? tokenData.data?.expires_in;
      if (ttExpiresIn) {
        tokenExpiresAt = new Date(Date.now() + ttExpiresIn * 1000).toISOString();
      } else {
        console.warn('TikTok token response missing expires_in');
      }
      tokenRefreshToken = tokenData.refresh_token ?? tokenData.data?.refresh_token ?? null;

      const profileRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const profileData = profileRes.ok ? await profileRes.json() : { data: { user: {} } };
      const user = profileData.data?.user ?? {};
      profileId = openId || user.open_id || '';
      profileName = user.display_name || 'TikTok User';
      profilePicture = user.avatar_url || '';

    } else if (platform === 'pinterest') {
      // ─── Pinterest ────────────────────────────────────────────────
      console.log('Pinterest token exchange');

      const PINTEREST_CLIENT_ID = Deno.env.get('PINTEREST_CLIENT_ID') ?? '';
      const PINTEREST_CLIENT_SECRET = Deno.env.get('PINTEREST_CLIENT_SECRET') ?? '';
      // Mirror publish-social: token-exchange + profile-fetch must happen on
      // the same API base as publish, otherwise Trial-Access apps get tokens
      // that don't authenticate against the sandbox endpoint.
      // Default = sandbox (Trial-Access). Override after Standard-access via:
      //   supabase functions secrets set PINTEREST_API_BASE=https://api.pinterest.com/v5
      const PINTEREST_API_BASE = Deno.env.get('PINTEREST_API_BASE') ?? 'https://api-sandbox.pinterest.com/v5';

      if (!PINTEREST_CLIENT_ID || !PINTEREST_CLIENT_SECRET) {
        return errorPage('Pinterest', 'Pinterest credentials niet geconfigureerd', 'PINTEREST_CLIENT_ID en _SECRET ontbreken in Supabase secrets');
      }

      const basicAuth = btoa(`${PINTEREST_CLIENT_ID}:${PINTEREST_CLIENT_SECRET}`);
      console.log(`[Pinterest] OAuth token exchange via ${PINTEREST_API_BASE}/oauth/token`);
      const tokenRes = await fetch(`${PINTEREST_API_BASE}/oauth/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('Pinterest token exchange failed:', err);
        return errorPage('Pinterest', 'Token exchange mislukt', err);
      }

      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;
      tokenRefreshToken = tokenData.refresh_token ?? null;
      if (tokenData.expires_in) {
        tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
      }

      const profileRes = await fetch(`${PINTEREST_API_BASE}/user_account`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const profile = profileRes.ok ? await profileRes.json() : {};
      profileId = profile.username ?? '';
      profileName = profile.username ?? 'Pinterest User';
      profilePicture = profile.profile_image ?? '';

    } else if (platform === 'threads') {
      // ─── Threads (Meta) ───────────────────────────────────────────
      // Uses Meta OAuth via the same META_APP_ID. Threads-specific
      // endpoints under graph.threads.net.
      //
      // GOTCHA (same as IG): Threads use case has SEPARATE app_id +
      // app_secret, distinct from Meta App credentials. Found in Meta
      // App → Use cases → Access the Threads API → Customize → Settings.
      console.log('Threads token exchange');

      const THREADS_APP_ID = Deno.env.get('THREADS_APP_ID') ?? '952201194080195';
      const THREADS_APP_SECRET = Deno.env.get('THREADS_APP_SECRET') ?? '';
      if (!THREADS_APP_SECRET) {
        return errorPage('Threads', 'Configuratie ontbreekt', 'THREADS_APP_SECRET niet gezet in Supabase secrets.');
      }

      const tokenUrl = new URL('https://graph.threads.net/oauth/access_token');
      const tokenRes = await fetch(tokenUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: THREADS_APP_ID,
          client_secret: THREADS_APP_SECRET,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI,
          code,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('Threads token exchange failed:', err);
        return errorPage('Threads', 'Token exchange mislukt', err);
      }

      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;
      const threadsUserId = tokenData.user_id ?? '';

      // Optionally exchange for long-lived token (60 days)
      try {
        const longLivedRes = await fetch(
          `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${THREADS_APP_SECRET}&access_token=${accessToken}`,
        );
        if (longLivedRes.ok) {
          const longLivedData = await longLivedRes.json();
          accessToken = longLivedData.access_token || accessToken;
          if (longLivedData.expires_in) {
            tokenExpiresAt = new Date(Date.now() + longLivedData.expires_in * 1000).toISOString();
          }
        }
      } catch { /* keep short-lived */ }

      // Fetch user profile
      const profileRes = await fetch(
        `https://graph.threads.net/v1.0/me?fields=id,username,name&access_token=${accessToken}`,
      );
      const profile = profileRes.ok ? await profileRes.json() : {};
      // GDPR log hygiene — don't dump full profile or external user_id;
      // just enough to debug the OAuth flow.
      console.log('[Threads] Profile response ok=', profileRes.ok, 'has_user_id=', !!profile?.id);
      console.log('[Threads] tokenData.user_id present=', !!threadsUserId);

      profileId = String(profile.id ?? threadsUserId ?? '');
      profileName = profile.username || profile.name || 'Threads User';

      // Threads sometimes returns no id in /me — fall back to a synthetic ID
      // so the insert at least has a unique platform_account_id and the
      // user gets visible feedback in Settings (status='active' even if
      // profile fetch was incomplete). User can disconnect + reconnect.
      if (!profileId) {
        profileId = `threads_${Date.now()}`;
        console.warn('[Threads] No profile id from API — using synthetic:', profileId);
      }
      console.log('[Threads] Final profileId:', profileId, 'profileName:', profileName);

    } else if (platform === 'instagram-direct') {
      // ─── Instagram Direct Login (NEW 2024+ flow) ──────────────────
      // Bypasses FB Pages dependency. User logs in directly with IG
      // credentials. Token works directly for IG Business publishing
      // without needing FB Pages API or Account Center IG-Page link.
      //
      // Required Meta App use case: "Manage messaging & content on
      // Instagram" → "API setup with Instagram login" → reveals a
      // SEPARATE Instagram App ID + App Secret (NOT the Meta App's).
      //
      // GOTCHA: Use INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET here,
      // not META_APP_ID/SECRET. Meta credentials return "Invalid
      // request" on api.instagram.com endpoints.
      //
      // OAuth URL: https://www.instagram.com/oauth/authorize
      // Token exchange: https://api.instagram.com/oauth/access_token
      // Long-lived: https://graph.instagram.com/access_token
      console.log('Instagram Direct Login token exchange');

      const IG_APP_ID = Deno.env.get('INSTAGRAM_APP_ID') ?? '2250348065370973';
      const IG_APP_SECRET = Deno.env.get('INSTAGRAM_APP_SECRET') ?? '';
      if (!IG_APP_SECRET) {
        return errorPage('Instagram', 'Configuratie ontbreekt', 'INSTAGRAM_APP_SECRET niet gezet in Supabase secrets.');
      }

      const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: IG_APP_ID,
          client_secret: IG_APP_SECRET,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI,
          code,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('Instagram Direct token exchange failed:', err);
        return errorPage('Instagram', 'Token exchange mislukt', err);
      }

      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;
      const igUserId = tokenData.user_id ? String(tokenData.user_id) : '';

      // Exchange short-lived (1h) for long-lived (60d) token
      try {
        const longLivedRes = await fetch(
          `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${IG_APP_SECRET}&access_token=${accessToken}`,
        );
        if (longLivedRes.ok) {
          const longLivedData = await longLivedRes.json();
          accessToken = longLivedData.access_token || accessToken;
          if (longLivedData.expires_in) {
            tokenExpiresAt = new Date(Date.now() + longLivedData.expires_in * 1000).toISOString();
          }
        }
      } catch (e) {
        console.warn('IG long-lived token exchange failed (using short-lived):', e);
      }

      // Fetch IG profile
      const profileRes = await fetch(
        `https://graph.instagram.com/v20.0/me?fields=user_id,username,name,account_type&access_token=${accessToken}`,
      );
      if (!profileRes.ok) {
        const err = await profileRes.text();
        console.error('IG profile fetch failed:', err);
        return errorPage('Instagram', 'Profiel ophalen mislukt', err);
      }
      const profile = await profileRes.json();
      profileId = profile.user_id ? String(profile.user_id) : igUserId;
      profileName = profile.username ? `@${profile.username}` : (profile.name || 'Instagram User');
      profilePicture = '';

      // For Instagram Direct: account_type from profile (BUSINESS / CREATOR / PERSONAL)
      // We map all to 'business' for AMOS publishing logic since both
      // BUSINESS and CREATOR can use the publishing API.
      const igAccountType = profile.account_type ?? 'BUSINESS';
      const accountTypeForDb = ['BUSINESS', 'CREATOR'].includes(igAccountType) ? 'business' : 'personal';

      // Store directly — no FB Pages flow needed
      const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await upsertSocialAccount(
        db, userId, 'instagram', profileId, profileName, profilePicture,
        accessToken, accountTypeForDb, undefined, tokenExpiresAt, tokenRefreshToken,
      );

      console.log(`Instagram Direct connected: ${profileName} (${accountTypeForDb})`);
      if (isWebCaller) return webSuccessRedirect('instagram', profileName);
      return successPage('Instagram', profileName);

    } else {
      // ─── Meta (Facebook/Instagram via FB Pages — legacy) ──────────
      console.log('Meta token exchange for platform:', platform);

      const tokenUrl = new URL('https://graph.facebook.com/v20.0/oauth/access_token');
      tokenUrl.searchParams.set('client_id', META_APP_ID);
      tokenUrl.searchParams.set('client_secret', META_APP_SECRET);
      tokenUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      tokenUrl.searchParams.set('code', code);

      const tokenRes = await fetch(tokenUrl.toString());
      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('Meta token exchange failed:', err);
        return errorPage(platform, 'Token exchange mislukt', err);
      }
      const tokenData = await tokenRes.json();
      accessToken = tokenData.access_token;

      // Get long-lived token (~60 days, expires_in ≈ 5184000 s); Meta does not issue refresh tokens
      try {
        const longLivedUrl = new URL('https://graph.facebook.com/v20.0/oauth/access_token');
        longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
        longLivedUrl.searchParams.set('client_id', META_APP_ID);
        longLivedUrl.searchParams.set('client_secret', META_APP_SECRET);
        longLivedUrl.searchParams.set('fb_exchange_token', accessToken);
        const longLivedRes = await fetch(longLivedUrl.toString());
        if (longLivedRes.ok) {
          const longLivedData = await longLivedRes.json();
          accessToken = longLivedData.access_token || accessToken;
          if (longLivedData.expires_in) {
            tokenExpiresAt = new Date(Date.now() + longLivedData.expires_in * 1000).toISOString();
          } else {
            console.warn('Meta long-lived token response missing expires_in');
          }
          tokenRefreshToken = null; // Meta does not issue refresh tokens
          console.log('Got long-lived token');
        }
      } catch { /* keep short-lived token */ }

      // Fetch user profile
      const profileRes = await fetch(
        `https://graph.facebook.com/v20.0/me?fields=id,name,picture.type(large)&access_token=${accessToken}`,
      );
      if (!profileRes.ok) {
        const err = await profileRes.text();
        console.error('Meta profile fetch failed:', err);
        return errorPage(platform, 'Profiel ophalen mislukt', err);
      }
      const profile = await profileRes.json();
      profileId = profile.id ?? '';
      profileName = profile.name ?? '';
      profilePicture = profile.picture?.data?.url ?? '';

      // ─── Fetch Facebook Pages (for business page support) ────────
      // Meta has TWO IG-Page link fields since 2024:
      //   `instagram_business_account` — old, populated when IG-Page link was
      //     made via Page Settings > Linked accounts (legacy flow)
      //   `connected_instagram_account` — new, populated when link was made
      //     via Account Center / Business Settings > Page Settings > IG link
      //     (current flow as of 2024+)
      // We query both and use whichever returns a value, since the IG-Page
      // link UI may use either flow depending on user's Meta version/region.
      try {
        const pagesRes = await fetch(
          `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url},connected_instagram_account{id,name,username,profile_picture_url}&access_token=${accessToken}`,
        );
        if (pagesRes.ok) {
          const pagesData = await pagesRes.json();
          pages = (pagesData.data || []).map((p: any) => {
            // Try both fields, prefer the one that has an id
            const igLink = p.instagram_business_account ?? p.connected_instagram_account;
            return {
              id: p.id,
              name: p.name,
              access_token: p.access_token,
              ig_id: igLink?.id,
              ig_name: igLink?.username || igLink?.name,
              ig_picture: igLink?.profile_picture_url,
            };
          });
          console.log(`Found ${pages.length} Facebook Pages`);
          console.log('IG links:', JSON.stringify(pages.map(p => ({
            page: p.name, ig_id: p.ig_id, ig_name: p.ig_name,
          }))));
        } else {
          const errText = await pagesRes.text();
          console.error('Pages fetch HTTP error:', pagesRes.status, errText);
        }
      } catch (e) {
        console.error('Failed to fetch pages:', e);
      }
    }

    // ─── Store accounts ─────────────────────────────────────────────
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Store main personal account.
    //
    // NOTE: For Instagram AND Facebook, we deliberately SKIP storing a
    // 'personal' row.
    //
    // Instagram: OAuth uses the FB OAuth flow; IG content publishing requires
    // a Business account linked to a FB Page (Meta deprecated the IG Basic
    // Display API). A personal IG row would appear in the picker but every
    // publish attempt would silently fail.
    //
    // Facebook: Meta deprecated the `publish_actions` permission in 2018, so
    // there is no API to publish to a personal Facebook profile any more —
    // only Pages (`pages_manage_posts`). Storing a 'personal' FB row here
    // produced cryptic 403 errors in the publish flow ("non-2xx") because
    // the token simply lacks any publish scope. Pages are stored below.
    //
    // For both platforms, all publishable identities are populated via the
    // Pages-discovery block further down (`/me/accounts`).
    if (platform !== 'instagram' && platform !== 'facebook') {
      await upsertSocialAccount(db, userId, platform, profileId, profileName, profilePicture, accessToken, 'personal', undefined, tokenExpiresAt, tokenRefreshToken);
    }

    // ─── LinkedIn: discover company pages the user can administer ───
    // Requires w_organization_social + rw_organization_admin scopes,
    // which need LinkedIn Marketing Developer Platform (LMDP) approval.
    // Without LMDP, the ACL call returns 403 — we log & gracefully
    // continue. After LMDP approval, add the scopes in
    // SettingsScreen.tsx and reconnect; org rows will appear here.
    const connectedPages: Array<{id: string, name: string}> = [];
    if (platform === 'linkedin') {
      try {
        const aclsUrl = 'https://api.linkedin.com/v2/organizationAcls'
          + '?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED'
          + '&projection=(elements*(organization~(id,localizedName,logoV2(original~:playableStreams))))';
        const aclsRes = await fetch(aclsUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (aclsRes.ok) {
          const aclsData = await aclsRes.json();
          const orgs = (aclsData.elements ?? []) as any[];
          for (const el of orgs) {
            const org = el['organization~'];
            if (!org?.id) continue;
            const orgId = String(org.id);
            const orgName = org.localizedName ?? `Organization ${orgId}`;
            let logoUrl = '';
            try {
              const streams = org.logoV2?.['original~']?.elements?.[0]?.identifiers;
              logoUrl = streams?.[0]?.identifier ?? '';
            } catch { /* logo is best-effort */ }
            try {
              await upsertSocialAccount(
                db, userId, 'linkedin',
                orgId, `${orgName} (Bedrijf)`, logoUrl,
                accessToken, 'company', undefined, tokenExpiresAt, tokenRefreshToken,
              );
              connectedPages.push({ id: orgId, name: orgName });
            } catch (e) {
              console.error(`Failed to store LinkedIn company page ${orgName}:`, e);
            }
          }
          // userId redacted to a prefix — sufficient for cross-log correlation,
          // not enough alone to identify the data subject.
          console.log(`LinkedIn: discovered ${orgs.length} admin company pages for user ${userId.slice(0, 8)}…`);
        } else {
          const errBody = await aclsRes.text();
          console.warn(
            `LinkedIn organizationAcls fetch returned ${aclsRes.status} — expected until LMDP approved. `
            + `Body: ${errBody.substring(0, 200)}`,
          );
        }
      } catch (e: any) {
        console.warn('LinkedIn organization discovery failed (graceful):', e.message);
      }
    }

    // Store Facebook Pages as separate accounts
    for (const page of pages) {
      try {
        await upsertSocialAccount(
          db, userId, 'facebook',
          page.id, `${page.name} (Pagina)`, '',
          accessToken, 'page', page.access_token, tokenExpiresAt, null,
        );
        connectedPages.push({ id: page.id, name: page.name });

        // Also connect Instagram Business Account if linked to this page
        if ((page as any).ig_id) {
          if (!page.access_token) {
            console.warn(`[oauth-callback] Skipping IG account ${(page as any).ig_id} for page "${page.name}" — page.access_token is missing. Re-authorize with pages_read_engagement permission.`);
          } else {
            await upsertSocialAccount(
              db, userId, 'instagram',
              (page as any).ig_id,
              (page as any).ig_name || `${page.name} Instagram`,
              (page as any).ig_picture || '',
              accessToken, 'business', page.access_token, tokenExpiresAt, null,
            );
            connectedPages.push({ id: (page as any).ig_id, name: `${(page as any).ig_name || page.name} (Instagram)` });
          }
        }
      } catch (e) {
        console.error(`Failed to store page ${page.name}:`, e);
      }
    }

    console.log(`Social account connected: platform=${platform} account=${profileName} pages=${connectedPages.length}`);

    // Clean fix for Option A: Facebook publishing requires a Page. If the
    // user has no admin Pages and no IG Business links, we have stored zero
    // publishable rows — surface a clear error instead of returning success
    // and letting the user discover the failure later in the publish flow.
    if (platform === 'facebook' && connectedPages.length === 0) {
      return errorPage(
        'Facebook',
        'Geen Facebook Pagina gevonden',
        'AMOS publiceert via Facebook Pages — persoonlijke profielen ondersteunen geen API-publishing meer (Meta heeft de publish_actions-permissie verwijderd in 2018). Maak eerst een Pagina aan via facebook.com/pages/create en koppel je account opnieuw, of geef AMOS toegang tot een bestaande Pagina waar jij beheerder van bent.',
      );
    }

    if (isWebCaller) return webSuccessRedirect(platform, profileName);
    return successPage(platform, profileName, connectedPages.length > 0 ? connectedPages : undefined);

  } catch (err: any) {
    console.error('OAuth callback error:', err);
    if (isWebCaller) return webErrorRedirect(platform, err?.message ?? 'Server error');
    return errorPage(platform, 'Server error', err?.message);
  }
});
