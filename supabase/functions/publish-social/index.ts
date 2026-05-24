// Supabase Edge Function: Publish Social
// Publishes approved content proposals to social media platforms.
// Supports: LinkedIn (v2 API), Facebook Pages (Graph API), Instagram (Graph API via Pages)
// Fetches OAuth tokens from oauth_tokens table, posts content, updates proposal status.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  fetchUserTier,
  checkDailyCap,
  checkChannelsPerPost,
  policyDenyResponse,
} from '../_shared/free-tier-policy.ts';
import { bakeAmosWatermark, safeWatermarkPosition, safeWatermarkSize, type WatermarkPosition, type WatermarkSize } from '../_shared/watermark.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// Optional verified-domain proxy for media URLs that must be served under a
// host registered in TikTok / Meta / Pinterest "URL Properties". Set this in
// `supabase functions secrets set MEDIA_PROXY_BASE_URL=https://images.inclufy.com`
// once the Cloudflare rewrite is live. When unset, publishers fall back to
// fresh signed Supabase URLs.
const MEDIA_PROXY_BASE_URL = Deno.env.get('MEDIA_PROXY_BASE_URL') ?? '';

// TikTok privacy level. In Sandbox mode the API rejects PUBLIC_TO_EVERYONE
// with `unaudited_client_can_only_post_to_private_accounts`. Set this to
// `SELF_ONLY` for sandbox/testing (default) and to `PUBLIC_TO_EVERYONE`
// after TikTok audits the app for production:
//   supabase functions secrets set TIKTOK_PRIVACY_LEVEL=PUBLIC_TO_EVERYONE
// Valid values: SELF_ONLY | MUTUAL_FOLLOW_FRIENDS | PUBLIC_TO_EVERYONE
const TIKTOK_PRIVACY_LEVEL = Deno.env.get('TIKTOK_PRIVACY_LEVEL') ?? 'SELF_ONLY';

// Pinterest API base. When the Pinterest Developer App is in "Trial access"
// mode, all publish calls to api.pinterest.com return 403 with code 29 and
// instruct the caller to use api-sandbox.pinterest.com. Once the app is
// promoted to "Standard access" by Pinterest review, switch this to
// `https://api.pinterest.com/v5` via:
//   supabase functions secrets set PINTEREST_API_BASE=https://api.pinterest.com/v5
const PINTEREST_API_BASE = Deno.env.get('PINTEREST_API_BASE') ?? 'https://api-sandbox.pinterest.com/v5';

// ─── Email notification helper ─────────────────────────────────────────────
// Looks up the user's email from auth.users and POSTs to the send-email
// edge function. Fire-and-forget — caller should NOT await this so the
// publish response stays fast even if email is slow.
async function sendEmailNotification(
  db: ReturnType<typeof createClient>,
  userId: string,
  type: 'publish_success' | 'publish_failed' | 'oauth_token_expired',
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: userRow, error } = await db.auth.admin.getUserById(userId);
    if (error || !userRow?.user?.email) {
      console.warn(`[send-email hook] Could not find email for user ${userId}: ${error?.message ?? 'no email'}`);
      return;
    }
    const fnUrl = `${SUPABASE_URL}/functions/v1/send-email`;
    const internalEmailSecret = Deno.env.get('INTERNAL_EMAIL_SECRET') ?? '';
    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'x-internal-secret': internalEmailSecret,
      },
      body: JSON.stringify({
        to: userRow.user.email,
        type,
        data,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[send-email hook] send-email returned ${res.status}: ${errBody.slice(0, 200)}`);
    }
  } catch (err: any) {
    console.warn('[send-email hook] exception:', err?.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Convert a Supabase storage URL into one any external platform can fetch.
//
// Strategy (in priority order):
//   1. If MEDIA_PROXY_BASE_URL is set, rewrite Supabase URLs through that
//      verified host (preferred — same proxy works for TikTok / Meta IG Reels
//      / Pinterest / Facebook video without per-platform domain claims).
//   2. Otherwise refresh as a 1-hour service-role signed URL.
//   3. Non-Supabase URLs (already external CDN, public/ bucket) pass through.
//
// IMPORTANT: this helper is the single source of truth for media URLs that
// leave the function. Don't inline `createSignedUrl` calls in publishers —
// always go through here so the proxy/signing strategy stays consistent.
// ═══════════════════════════════════════════════════════════════════════════
async function toExternalMediaUrl(url: string): Promise<string> {
  if (!url) return url;

  // Strategy 1 — proxy rewrite (only for our `media` bucket)
  if (MEDIA_PROXY_BASE_URL) {
    const m = url.match(/\/(?:sign\/)?(media)\/(.+?)(\?|$)/);
    if (m) {
      const bucket = m[1];
      const objectPath = m[2];
      return `${MEDIA_PROXY_BASE_URL.replace(/\/$/, '')}/${bucket}/${objectPath}`;
    }
  }

  // Strategy 3 — non-Supabase URLs pass through unchanged
  if (!url.includes('supabase') || url.includes('/public/')) return url;

  // Strategy 2 — refresh as a service-role signed URL
  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const pathMatch = url.match(/\/(?:sign\/)?media\/(.+?)(\?|$)/);
    if (!pathMatch) return url;
    const { data: signData } = await db.storage.from('media').createSignedUrl(pathMatch[1], 3600);
    return signData?.signedUrl ?? url;
  } catch (err: any) {
    console.warn('[media-url] could not refresh signed URL:', err?.message);
    return url;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ═══════════════════════════════════════════════════════
// Platform Publishers
// ═══════════════════════════════════════════════════════

async function publishToLinkedIn(
  accessToken: string,
  profileId: string,
  rawText: string,
  imageUrl?: string,
  accountType?: string, // 'personal' | 'company'
  extraImageUrls?: string[], // additional images for multi-image posts
  videoUrl?: string, // video URL for video posts
  mediaType?: string, // 'photo' | 'video' | 'audio'
): Promise<{ success: boolean; postId?: string; error?: string }> {
  // LinkedIn shareCommentary hard limit = 3000 chars. Without truncation,
  // long AI-generated posts return 422 from /v2/ugcPosts. Truncate with
  // ellipsis so the post still publishes cleanly.
  const text = (rawText ?? '').length > 3000
    ? rawText.substring(0, 2997) + '...'
    : (rawText ?? '');
  try {
    let authorUrn: string;

    if (accountType === 'company' && profileId) {
      // Company page — profileId contains the organization ID
      authorUrn = profileId.startsWith('urn:') ? profileId : `urn:li:organization:${profileId}`;
    } else {
      // Personal profile — fetch user URN from LinkedIn API
      const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!profileRes.ok) {
        return { success: false, error: `LinkedIn profile error: ${profileRes.status}` };
      }

      const profile = await profileRes.json();
      authorUrn = `urn:li:person:${profile.sub}`;
    }

    // Create post
    const postBody: any = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    // Helper: upload a single image to LinkedIn and return its asset URN
    async function uploadImageToLinkedIn(url: string): Promise<string | null> {
      try {
        const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
              owner: authorUrn,
              serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
            },
          }),
        });
        if (!registerRes.ok) {
          console.error('[LinkedIn] Register upload error:', registerRes.status);
          return null;
        }
        const registerData = await registerRes.json();
        const uploadUrl = registerData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
        const assetUrn = registerData.value?.asset;
        if (!uploadUrl || !assetUrn) return null;

        const imgRes = await fetch(url);
        if (!imgRes.ok) return null;
        const imgBlob = await imgRes.blob();
        const imgBuffer = await imgBlob.arrayBuffer();

        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': imgBlob.type || 'image/jpeg' },
          body: imgBuffer,
        });
        if (!uploadRes.ok) return null;
        console.log('[LinkedIn] Image uploaded successfully, asset:', assetUrn);
        return assetUrn;
      } catch (err: any) {
        console.error('[LinkedIn] Image upload exception:', err.message);
        return null;
      }
    }

    // Helper: upload a video to LinkedIn and return its asset URN.
    // Steps: (1) HEAD the video to get Content-Length, (2) registerUpload with fileSizeBytes,
    // (3) PUT the video bytes to LinkedIn's upload URL, (4) poll until asset is AVAILABLE.
    // Falls back gracefully — returns null on any failure so caller can post text-only.
    async function uploadVideoToLinkedIn(url: string): Promise<string | null> {
      try {
        // Step 1 — determine file size via HEAD request (LinkedIn requires fileSizeBytes).
        // If HEAD is not supported by the storage provider we fall back to fetching the body
        // and using the blob size, which works but is slower for large files.
        let fileSizeBytes = 0;
        try {
          const headRes = await fetch(url, { method: 'HEAD' });
          const cl = headRes.headers.get('content-length');
          if (cl) fileSizeBytes = parseInt(cl, 10);
        } catch {
          // HEAD not supported — will fall back below after fetching blob
        }

        // Step 2 — register upload with LinkedIn
        const registerBody: any = {
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
            owner: authorUrn,
            serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
          },
        };
        // fileSizeBytes is optional in the LinkedIn API but improves upload reliability
        if (fileSizeBytes > 0) {
          registerBody.registerUploadRequest.supportedUploadMechanism = ['SYNCHRONOUS_UPLOAD'];
          registerBody.registerUploadRequest.fileSizeBytes = fileSizeBytes;
        }

        const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(registerBody),
        });
        if (!registerRes.ok) {
          console.error('[LinkedIn] Video register upload error:', registerRes.status, await registerRes.text());
          return null;
        }
        const registerData = await registerRes.json();
        const uploadUrl = registerData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
        const assetUrn: string | undefined = registerData.value?.asset;
        if (!uploadUrl || !assetUrn) {
          console.error('[LinkedIn] Video register upload: missing uploadUrl or assetUrn');
          return null;
        }

        // Step 3 — fetch video bytes and PUT to LinkedIn
        const videoRes = await fetch(url);
        if (!videoRes.ok) {
          console.error('[LinkedIn] Could not fetch video from storage:', videoRes.status);
          return null;
        }
        const videoBlob = await videoRes.blob();
        const videoBuffer = await videoBlob.arrayBuffer();
        // Use content-type from source; default to mp4 if unknown
        const contentType = videoBlob.type && videoBlob.type !== 'application/octet-stream'
          ? videoBlob.type
          : 'video/mp4';

        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': contentType,
          },
          body: videoBuffer,
        });
        if (!putRes.ok) {
          console.error('[LinkedIn] Video PUT upload error:', putRes.status, await putRes.text());
          return null;
        }
        console.log('[LinkedIn] Video PUT complete, asset:', assetUrn);

        // Step 4 — poll until asset status is AVAILABLE (max 90s, 5s interval)
        const MAX_POLLS = 18; // 18 × 5s = 90s
        for (let i = 0; i < MAX_POLLS; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          try {
            const assetId = assetUrn.split(':').pop();
            const pollRes = await fetch(`https://api.linkedin.com/v2/assets/${assetId}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (pollRes.ok) {
              const assetData = await pollRes.json();
              const status = assetData.recipes?.[0]?.status ?? assetData.status;
              console.log(`[LinkedIn] Video asset poll ${i + 1}/${MAX_POLLS}: status=${status}`);
              if (status === 'AVAILABLE') {
                return assetUrn;
              }
              if (status === 'PROCESSING_FAILED') {
                console.error('[LinkedIn] Video processing failed on LinkedIn side');
                return null;
              }
            }
          } catch (pollErr: any) {
            console.warn('[LinkedIn] Poll error (non-fatal):', pollErr.message);
          }
        }
        // Polling timed out — LinkedIn sometimes still accepts the post with a not-yet-AVAILABLE
        // asset (it finishes processing asynchronously). Log a warning and continue.
        console.warn('[LinkedIn] Video asset polling timed out after 90s — proceeding with asset:', assetUrn);
        return assetUrn;
      } catch (err: any) {
        console.error('[LinkedIn] uploadVideoToLinkedIn exception:', err.message);
        return null;
      }
    }

    // ── Video post branch ──
    if (mediaType === 'video' && videoUrl) {
      const videoAssetUrn = await uploadVideoToLinkedIn(videoUrl);
      if (videoAssetUrn) {
        postBody.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'VIDEO';
        postBody.specificContent['com.linkedin.ugc.ShareContent'].media = [
          { status: 'READY', media: videoAssetUrn },
        ];
      } else {
        // Video upload failed — fall back to text-only with a warning
        console.warn('[LinkedIn] Video upload failed, posting as text-only');
      }
    } else {
      // ── Image post branch ──
      // Upload all images (primary + extras) for multi-image LinkedIn posts.
      // Use the shared media-URL helper so LinkedIn fetches go through the
      // verified proxy when configured (or a fresh signed URL otherwise).
      const rawImageUrls = [imageUrl, ...(extraImageUrls || [])].filter(Boolean) as string[];
      const allImageUrls: string[] = [];
      for (const original of rawImageUrls) {
        allImageUrls.push(await toExternalMediaUrl(original));
      }
      if (allImageUrls.length > 0) {
        const uploadedAssets: string[] = [];
        for (const url of allImageUrls) {
          const assetUrn = await uploadImageToLinkedIn(url);
          if (assetUrn) uploadedAssets.push(assetUrn);
        }
        if (uploadedAssets.length > 0) {
          postBody.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'IMAGE';
          postBody.specificContent['com.linkedin.ugc.ShareContent'].media = uploadedAssets.map(urn => ({
            status: 'READY',
            media: urn,
          }));
        } else {
          console.warn('[LinkedIn] All image uploads failed — posting as text-only');
        }
      }
    }

    const publishRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(postBody),
    });

    if (!publishRes.ok) {
      const errBody = await publishRes.text();
      console.error('[LinkedIn] Publish error:', publishRes.status, errBody);
      return { success: false, error: `LinkedIn API error ${publishRes.status}: ${errBody}` };
    }

    const postId = publishRes.headers.get('x-restli-id') || 'unknown';
    return { success: true, postId };
  } catch (err: any) {
    return { success: false, error: `LinkedIn exception: ${err.message}` };
  }
}

async function publishToFacebook(
  accessToken: string,
  pageId: string,
  text: string,
  imageUrl?: string,
  videoUrl?: string, // video URL for video posts
): Promise<{ success: boolean; postId?: string; error?: string }> {
  try {
    // ── Video post branch ──
    // Facebook /videos endpoint accepts a publicly accessible file_url and publishes it
    // as a native video post. The response includes { id } which is the video object ID.
    if (videoUrl) {
      const externalVideoUrl = await toExternalMediaUrl(videoUrl);
      const videoRes = await fetch(`https://graph.facebook.com/v20.0/${pageId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_url: externalVideoUrl,
          description: text,
          access_token: accessToken,
        }),
      });

      if (!videoRes.ok) {
        const errBody = await videoRes.text();
        const safeErrBody = errBody.replace(/"access_token"\s*:\s*"[^"]*"/g, '"access_token":"[REDACTED]"');
        console.error('[Facebook] Video publish error:', videoRes.status, safeErrBody);
        return { success: false, error: `Facebook video API error ${videoRes.status}: ${safeErrBody}` };
      }

      const videoData = await videoRes.json();
      console.log('[Facebook] Video published, id:', videoData.id);
      return { success: true, postId: videoData.id };
    }

    // ── Photo / text post branch (unchanged) ──
    let url = `https://graph.facebook.com/v20.0/${pageId}/feed`;
    const params: any = {
      message: text,
      access_token: accessToken,
    };

    if (imageUrl) {
      url = `https://graph.facebook.com/v20.0/${pageId}/photos`;
      params.url = await toExternalMediaUrl(imageUrl);
      params.caption = text;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errBody = await res.text();
      const safeErrBody = errBody.replace(/"access_token"\s*:\s*"[^"]*"/g, '"access_token":"[REDACTED]"');
      console.error('[Facebook] Publish error:', res.status, safeErrBody);
      return { success: false, error: `Facebook API error ${res.status}: ${safeErrBody}` };
    }

    const data = await res.json();
    return { success: true, postId: data.id || data.post_id };
  } catch (err: any) {
    return { success: false, error: `Facebook exception: ${err.message}` };
  }
}

// Wait for an IG/Threads media container to leave PROCESSING / IN_PROGRESS
// before calling /media_publish. Without this we hit "Media ID is not
// available — Bitte warte noch einen Moment" (code 9007 / subcode 2207027)
// because Meta's CDN is still fetching the source URL.
//
// Polls /<container-id>?fields=status_code,status until FINISHED, ERROR or
// the timeout fires. Returns true when ready, false on terminal failure
// (caller can still attempt publish — Meta will give the real error).
async function waitForIgContainerReady(
  apiBase: string,
  containerId: string,
  accessToken: string,
  maxSeconds = 30,
): Promise<boolean> {
  const start = Date.now();
  let attempt = 0;
  while ((Date.now() - start) / 1000 < maxSeconds) {
    attempt++;
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(
        `${apiBase}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`,
      );
      if (!res.ok) {
        // 400 here means container vanished; don't keep hammering.
        const body = await res.text();
        console.warn(`[Instagram] container ${containerId} status fetch ${res.status}: ${body}`);
        return false;
      }
      const data = await res.json();
      const status = data.status_code ?? data.status;
      console.log(`[Instagram] container ${containerId} attempt ${attempt}: status_code=${status}`);
      if (status === 'FINISHED' || status === 'PUBLISHED') return true;
      if (status === 'ERROR' || status === 'EXPIRED') return false;
      // IN_PROGRESS / PROCESSING / undefined → keep polling
    } catch (err: any) {
      console.warn(`[Instagram] container status fetch exception:`, err?.message);
    }
  }
  console.warn(`[Instagram] container ${containerId} polling timed out after ${maxSeconds}s — attempting publish anyway`);
  return false;
}

async function publishToInstagram(
  accessToken: string,
  igBusinessAccountId: string,
  text: string,
  imageUrl?: string,
  extraImageUrls?: string[], // for carousel posts
  igFormat: 'feed' | 'story' | 'reel' = 'feed',
  videoUrl?: string,
): Promise<{ success: boolean; postId?: string; error?: string; permalink?: string }> {
  // Detect token type by prefix to route to the correct API endpoint:
  //   "IGAA…" = Instagram Direct API token (IG-Login flow, no FB Page)
  //              → graph.instagram.com
  //   "EAA…"  = Facebook Graph API token (FB-Login flow, IG via FB Page)
  //              → graph.facebook.com
  // Both speak the same JSON-shape, just on different hosts. Code 190
  // "Cannot parse access token" surfaces when an IGAA token hits the
  // graph.facebook.com endpoint (or vice versa).
  const IG_API_BASE = accessToken.startsWith('IGAA')
    ? 'https://graph.instagram.com/v20.0'
    : 'https://graph.facebook.com/v20.0';
  console.log(`[Instagram] Using API base: ${IG_API_BASE} (token prefix=${accessToken.slice(0, 4)})`);
  try {
    // ── Story ──────────────────────────────────────────────────────────────
    if (igFormat === 'story') {
      const hasMedia = !!(imageUrl || videoUrl);
      if (!hasMedia) {
        return { success: false, error: 'Story vereist een afbeelding of video.' };
      }

      const storyBody: Record<string, string> = { media_type: 'STORIES', access_token: accessToken };
      if (videoUrl) {
        storyBody.video_url = await toExternalMediaUrl(videoUrl);
      } else {
        storyBody.image_url = await toExternalMediaUrl(imageUrl!);
      }

      const storyCreateRes = await fetch(
        `${IG_API_BASE}/${igBusinessAccountId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(storyBody),
        },
      );

      if (!storyCreateRes.ok) {
        const errBody = await storyCreateRes.text();
        return { success: false, error: `Instagram Story upload error: ${errBody}` };
      }

      const { id: storyContainerId } = await storyCreateRes.json();

      await waitForIgContainerReady(IG_API_BASE, storyContainerId, accessToken);

      const storyPublishRes = await fetch(
        `${IG_API_BASE}/${igBusinessAccountId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creation_id: storyContainerId, access_token: accessToken }),
        },
      );

      if (!storyPublishRes.ok) {
        const errBody = await storyPublishRes.text();
        return { success: false, error: `Instagram Story publish error: ${errBody}` };
      }

      const storyData = await storyPublishRes.json();
      const storyPermalink = await fetchInstagramPermalink(storyData.id, accessToken);
      return { success: true, postId: storyData.id, ...(storyPermalink ? { permalink: storyPermalink } : {}) };
    }

    // ── Reel ───────────────────────────────────────────────────────────────
    if (igFormat === 'reel') {
      if (!videoUrl) {
        return {
          success: false,
          error: 'Reels vereisen een video. Schakel naar Feed of Story, of upload een video.',
        };
      }

      const reelBody: Record<string, string> = {
        media_type: 'REELS',
        video_url: await toExternalMediaUrl(videoUrl),
        caption: text.slice(0, 2200), // Reels support captions up to 2200 chars
        share_to_feed: 'true',
        access_token: accessToken,
      };

      const reelCreateRes = await fetch(
        `${IG_API_BASE}/${igBusinessAccountId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reelBody),
        },
      );

      if (!reelCreateRes.ok) {
        const errBody = await reelCreateRes.text();
        return { success: false, error: `Instagram Reel upload error: ${errBody}` };
      }

      const { id: reelContainerId } = await reelCreateRes.json();

      // Reels need extra processing time — give them up to 60s
      await waitForIgContainerReady(IG_API_BASE, reelContainerId, accessToken, 60);

      const reelPublishRes = await fetch(
        `${IG_API_BASE}/${igBusinessAccountId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creation_id: reelContainerId, access_token: accessToken }),
        },
      );

      if (!reelPublishRes.ok) {
        const errBody = await reelPublishRes.text();
        return { success: false, error: `Instagram Reel publish error: ${errBody}` };
      }

      const reelData = await reelPublishRes.json();
      const reelPermalink = await fetchInstagramPermalink(reelData.id, accessToken);
      return { success: true, postId: reelData.id, ...(reelPermalink ? { permalink: reelPermalink } : {}) };
    }

    // ── Feed (default) ────────────────────────────────────────────────────
    if (!imageUrl) {
      return { success: false, error: 'Instagram vereist een afbeelding voor publicatie' };
    }

    // Route every image URL through the shared media helper (proxy or
    // signed-URL refresh). Both the primary image and carousel extras.
    const publicImageUrl = await toExternalMediaUrl(imageUrl);
    const extraPublicUrls: string[] = [];
    for (const u of extraImageUrls || []) {
      if (u) extraPublicUrls.push(await toExternalMediaUrl(u));
    }
    const allImages = [publicImageUrl, ...extraPublicUrls].filter(Boolean) as string[];

    // Multi-image: use carousel container
    if (allImages.length > 1) {
      // Step 1: Create individual media items
      const childIds: string[] = [];
      for (const url of allImages) {
        const childRes = await fetch(
          `${IG_API_BASE}/${igBusinessAccountId}/media`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image_url: url,
              is_carousel_item: true,
              access_token: accessToken,
            }),
          },
        );
        if (childRes.ok) {
          const { id } = await childRes.json();
          childIds.push(id);
        }
      }

      if (childIds.length === 0) {
        return { success: false, error: 'Instagram carousel: geen items konden worden aangemaakt' };
      }

      // Step 2: Create carousel container
      const carouselRes = await fetch(
        `${IG_API_BASE}/${igBusinessAccountId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: 'CAROUSEL',
            children: childIds.join(','),
            caption: text,
            access_token: accessToken,
          }),
        },
      );

      if (!carouselRes.ok) {
        const errBody = await carouselRes.text();
        return { success: false, error: `Instagram carousel error: ${errBody}` };
      }

      const { id: containerId } = await carouselRes.json();

      await waitForIgContainerReady(IG_API_BASE, containerId, accessToken);

      // Step 3: Publish carousel
      const publishRes = await fetch(
        `${IG_API_BASE}/${igBusinessAccountId}/media_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
        },
      );
      if (!publishRes.ok) {
        const errBody = await publishRes.text();
        return { success: false, error: `Instagram carousel publish error: ${errBody}` };
      }
      const data = await publishRes.json();
      const permalink = await fetchInstagramPermalink(data.id, accessToken);
      return { success: true, postId: data.id, ...(permalink ? { permalink } : {}) };
    }

    // Single image post
    // Step 1: Create media container
    const createRes = await fetch(
      `${IG_API_BASE}/${igBusinessAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: publicImageUrl,
          caption: text,
          access_token: accessToken,
        }),
      },
    );

    if (!createRes.ok) {
      const errBody = await createRes.text();
      return { success: false, error: `Instagram create error: ${errBody}` };
    }

    const { id: containerId } = await createRes.json();

    await waitForIgContainerReady(IG_API_BASE, containerId, accessToken);

    // Step 2: Publish the container
    const publishRes = await fetch(
      `${IG_API_BASE}/${igBusinessAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: accessToken,
        }),
      },
    );

    if (!publishRes.ok) {
      const errBody = await publishRes.text();
      return { success: false, error: `Instagram publish error: ${errBody}` };
    }

    const data = await publishRes.json();
    const permalink = await fetchInstagramPermalink(data.id, accessToken);
    return { success: true, postId: data.id, ...(permalink ? { permalink } : {}) };
  } catch (err: any) {
    return { success: false, error: `Instagram exception: ${err.message}` };
  }
}

// Helper: after publishing, fetch the public permalink (best-effort).
// Returns undefined on failure; callers should fall back to a generic URL.
async function fetchInstagramPermalink(mediaId: string, accessToken: string): Promise<string | undefined> {
  // Same dual-host logic as publishToInstagram: IGAA tokens speak
  // graph.instagram.com, EAA tokens speak graph.facebook.com.
  const base = accessToken.startsWith('IGAA')
    ? 'https://graph.instagram.com/v20.0'
    : 'https://graph.facebook.com/v20.0';
  try {
    const res = await fetch(
      `${base}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!res.ok) {
      console.warn('[Instagram] permalink fetch returned', res.status);
      return undefined;
    }
    const data = await res.json();
    return data.permalink as string | undefined;
  } catch (err: any) {
    console.warn('[Instagram] permalink fetch exception:', err.message);
    return undefined;
  }
}

// ═══════════════════════════════════════════════════════
// TikTok Publisher (video + photo carousel)
// ═══════════════════════════════════════════════════════
//
// Two endpoints under the Content Posting API — same scope (`video.publish`)
// despite the misleading name:
//   • POST /v2/post/publish/video/init/    — single video file
//   • POST /v2/post/publish/content/init/  — 1–35 photos (carousel)
// Both return a `publish_id` we poll on `/v2/post/publish/status/fetch/`.
//
// PRODUCTION CAVEATS
// 1. PULL_FROM_URL requires the source domain to be verified in the TikTok
//    Developer Portal (see "URL Properties" in your app settings). For
//    Supabase storage signed URLs the host is `<project-ref>.supabase.co`
//    which TikTok generally accepts as a verifiable property. If TikTok
//    rejects the host, switch to a verified inclufy.com proxy or implement
//    FILE_UPLOAD (chunked) — both are larger refactors.
// 2. The TikTok app must be "Audited" (out of Sandbox) for posts to be
//    visible to anyone other than the connected account holder.

const TIKTOK_API = 'https://open.tiktokapis.com/v2';

// Shared: poll the TikTok publish/status endpoint until terminal state.
// Returns the public post id on success or an error message on failure.
async function pollTikTokPublishStatus(
  accessToken: string,
  publishId: string,
  maxAttempts = 30, // 30 × 2s = 60s timeout
): Promise<{ ok: true; postId: string } | { ok: false; error: string }> {
  console.log(`[TikTok] Polling publish status for publish_id=${publishId}`);
  let attempts = 0;
  let lastStatus = 'PROCESSING_DOWNLOAD';
  while (attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, 2000));
    attempts++;
    const statusRes = await fetch(`${TIKTOK_API}/post/publish/status/fetch/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    if (!statusRes.ok) {
      const errBody = await statusRes.text();
      console.warn(`[TikTok] poll attempt ${attempts}: status fetch returned ${statusRes.status} body=${errBody}`);
      continue;
    }
    const statusData = await statusRes.json();
    lastStatus = statusData.data?.status ?? lastStatus;
    console.log(`[TikTok] poll attempt ${attempts}: status=${lastStatus}`);
    if (lastStatus === 'PUBLISH_COMPLETE') {
      const publicId =
        statusData.data?.publicaly_available_post_id?.[0]
        ?? statusData.data?.publicaly_available_post_id
        ?? statusData.data?.public_id
        ?? publishId;
      console.log(`[TikTok] PUBLISH_COMPLETE — public id: ${publicId}`);
      return { ok: true, postId: String(publicId) };
    }
    if (lastStatus === 'FAILED') {
      const failReason = statusData.data?.fail_reason ?? 'unknown';
      console.error(`[TikTok] PUBLISH FAILED — fail_reason=${failReason} — full response:`, JSON.stringify(statusData));
      // Map TikTok's machine-readable fail_reason codes to user-friendly NL messages.
      const friendly = (() => {
        switch (failReason) {
          case 'photo_pull_failed':
            return 'TikTok kon de foto niet ophalen vanaf images.inclufy.com. Mogelijke oorzaken: '
              + '(1) Foto te groot — TikTok eist max 1920×1920px en max 4MP. '
              + '(2) Aspect ratio buiten 9:16-16:9. '
              + '(3) Domein-verificatie nog aan het propageren bij TikTok (kan tot enkele uren duren — verifieer status in TikTok Developer Portal). '
              + '(4) TikTok-pull-bot wordt geblokkeerd door Cloudflare Bot Fight Mode of een ander beschermingsmechanisme.';
          case 'video_pull_failed':
            return 'TikTok kon de video niet ophalen vanaf images.inclufy.com. Probeer een kortere/kleinere video, of check of het domein geverifieerd is in TikTok Developer Portal.';
          case 'url_ownership_unverified':
            return 'TikTok heeft images.inclufy.com nog niet geverifieerd als toegestane bron-URL. Verifieer het domein in TikTok Developer Portal → URL Properties.';
          case 'unsupported_format':
          case 'media_format_not_supported':
            return 'TikTok ondersteunt het foto-formaat niet. Gebruik JPG, PNG of WEBP (geen HEIC of GIF).';
          case 'media_too_large':
            return 'Foto is te groot voor TikTok (max 4MP, max 10MB). Verklein de foto en probeer opnieuw.';
          case 'media_resolution_too_low':
            return 'Foto-resolutie te laag voor TikTok (min 360×360px).';
          case 'unaudited_client_can_only_post_to_private_accounts':
            return 'TikTok-app draait nog in Sandbox-mode en kan alleen privacy_level=SELF_ONLY/MUTUAL_FOLLOW_FRIENDS gebruiken. Server-config: zet TIKTOK_PRIVACY_LEVEL=SELF_ONLY (default).';
          case 'spam_risk_account':
          case 'spam_risk_video_lacks_metadata':
            return 'TikTok markeert de account als spam-risico of de content mist metadata. Wacht enkele uren of probeer een ander account.';
          case 'unknown':
            return 'TikTok gaf geen specifieke fout-code. Probeer over een paar minuten opnieuw of bekijk de logs voor meer details.';
          default:
            return `TikTok publish faalde met fail_reason="${failReason}". Bekijk Supabase logs voor de volledige TikTok-response.`;
        }
      })();
      return {
        ok: false,
        error: friendly,
      };
    }
  }
  // Timed out — TikTok sometimes still completes async. Return publish_id
  // so the row can be reconciled later.
  console.warn(`[TikTok] Poll timeout after ${maxAttempts * 2}s, last status=${lastStatus} — returning publish_id`);
  return { ok: true, postId: publishId };
}

// Backwards-compat alias — kept so the TikTok publisher reads naturally.
// All other publishers should use `toExternalMediaUrl` directly.
const makeTikTokAccessibleUrl = (url: string) => toExternalMediaUrl(url);

async function publishToTikTok(
  accessToken: string,
  text: string,
  videoUrl?: string,
  imageUrl?: string,
  extraImageUrls?: string[],
): Promise<{ success: boolean; postId?: string; error?: string }> {
  // ── Photo carousel branch ───────────────────────────────────────────
  // Triggered when no video is supplied but at least one image is.
  // Uses /post/publish/content/init/ with media_type=PHOTO.
  if (!videoUrl) {
    const rawImages = [imageUrl, ...(extraImageUrls || [])].filter(Boolean) as string[];
    if (rawImages.length === 0) {
      return { success: false, error: 'TikTok requires either a video or at least one image.' };
    }
    if (rawImages.length > 35) {
      return { success: false, error: 'TikTok supports max 35 images per carousel post.' };
    }
    try {
      const photoImages: string[] = [];
      for (const u of rawImages) {
        let proxied = await makeTikTokAccessibleUrl(u);
        // Append ?preset=tiktok so the media-proxy resizes the image down to
        // 1920px on the longest side. Bypasses TikTok's `photo_pull_failed`
        // error for oversized images (e.g. iPhone camera 4032×3024 / 6.2MP+).
        if (proxied.startsWith(MEDIA_PROXY_BASE_URL) && MEDIA_PROXY_BASE_URL) {
          const sep = proxied.includes('?') ? '&' : '?';
          proxied = `${proxied}${sep}preset=tiktok`;
        }
        photoImages.push(proxied);
      }
      console.log(`[TikTok] Photo publish — ${photoImages.length} images, privacy_level=${TIKTOK_PRIVACY_LEVEL}, first_url=${photoImages[0]}`);

      const initRes = await fetch(`${TIKTOK_API}/post/publish/content/init/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_info: {
            title: text.substring(0, 90), // TikTok photo title max 90 chars
            description: text.substring(0, 4000),
            disable_comment: false,
            privacy_level: TIKTOK_PRIVACY_LEVEL,
            auto_add_music: true,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            photo_cover_index: 0,
            photo_images: photoImages,
          },
          post_mode: 'DIRECT_POST',
          media_type: 'PHOTO',
        }),
      });

      if (!initRes.ok) {
        const errBody = await initRes.text();
        console.error('[TikTok] Photo init error:', initRes.status, errBody);
        // 403 with "url_ownership_unverified" means the source domain is not
        // verified in the TikTok Developer Portal — give the user actionable
        // guidance instead of the raw error.
        const friendly = errBody.includes('url_ownership_unverified')
          ? 'TikTok weigert de afbeeldings-URL: het bron-domein is niet geverifieerd in de TikTok Developer Portal. Verifieer het Supabase-storage-domein bij je TikTok app of gebruik een geverifieerde inclufy.com proxy.'
          : `TikTok photo init error ${initRes.status}: ${errBody}`;
        return { success: false, error: friendly };
      }

      const initData = await initRes.json();
      console.log('[TikTok] Photo init OK — response:', JSON.stringify(initData));
      const publishId: string = initData.data?.publish_id ?? '';
      if (!publishId) {
        console.error('[TikTok] Photo init returned no publish_id:', JSON.stringify(initData));
        return { success: false, error: 'TikTok did not return publish_id for photo post' };
      }

      const poll = await pollTikTokPublishStatus(accessToken, publishId);
      if (!poll.ok) return { success: false, error: poll.error };
      return { success: true, postId: poll.postId };
    } catch (err: any) {
      console.error('[TikTok] Photo exception:', err?.message, err?.stack);
      return { success: false, error: `TikTok photo exception: ${err.message}` };
    }
  }

  // ── Video branch ─────────────────────────────────────────────────────
  try {
    const finalVideoUrl = await makeTikTokAccessibleUrl(videoUrl);

    const initRes = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        post_info: {
          title: text.substring(0, 2200), // TikTok video caption max 2200 chars
          privacy_level: TIKTOK_PRIVACY_LEVEL,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: finalVideoUrl,
        },
      }),
    });

    if (!initRes.ok) {
      const errBody = await initRes.text();
      console.error('[TikTok] Video init error:', initRes.status, errBody);
      const friendly = errBody.includes('url_ownership_unverified')
        ? 'TikTok weigert de video-URL: het bron-domein is niet geverifieerd in de TikTok Developer Portal.'
        : `TikTok video init error ${initRes.status}: ${errBody}`;
      return { success: false, error: friendly };
    }

    const initData = await initRes.json();
    const publishId: string = initData.data?.publish_id ?? '';
    if (!publishId) {
      return { success: false, error: 'TikTok did not return publish_id' };
    }

    const poll = await pollTikTokPublishStatus(accessToken, publishId);
    if (!poll.ok) return { success: false, error: poll.error };
    return { success: true, postId: poll.postId };
  } catch (err: any) {
    return { success: false, error: `TikTok exception: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════
// Pinterest Publisher (image pins with SEO description)
// ═══════════════════════════════════════════════════════

async function publishToPinterest(
  accessToken: string,
  text: string,
  imageUrl?: string,
  videoUrl?: string,
  options?: {
    title?: string;
    boardId?: string;
    boardName?: string;
    clickThroughLink?: string;
  },
): Promise<{ success: boolean; postId?: string; error?: string; boardId?: string }> {
  if (!imageUrl && !videoUrl) {
    return { success: false, error: 'Pinterest requires an image or video.' };
  }

  try {
    const PIN_API = PINTEREST_API_BASE;
    console.log(`[Pinterest] Using API base: ${PIN_API}`);

    // Step 1: Resolve board (find existing or create new).
    // Walks all pages of the user's boards (Pinterest paginates with
    // `bookmark`); falls back to creating a new board only when not found.
    let boardId = options?.boardId;
    if (!boardId) {
      const boardName = options?.boardName ?? 'AMOS Captures';

      const findExistingBoard = async (): Promise<string | undefined> => {
        let bookmark: string | undefined = undefined;
        for (let page = 0; page < 10; page++) {
          // 10-page hard cap = up to 1000 boards; sane upper bound.
          const url = new URL(`${PIN_API}/boards`);
          url.searchParams.set('page_size', '100');
          if (bookmark) url.searchParams.set('bookmark', bookmark);
          const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) {
            console.warn(`[Pinterest] list boards page ${page} returned ${res.status} — stop paging`);
            return undefined;
          }
          const data = await res.json();
          const items: any[] = data.items ?? [];
          const match = items.find(
            (b: any) => (b.name ?? '').trim().toLowerCase() === boardName.toLowerCase(),
          );
          if (match) {
            console.log(`[Pinterest] Found existing board "${boardName}" on page ${page}, id=${match.id}`);
            return match.id;
          }
          if (!data.bookmark) return undefined;
          bookmark = data.bookmark;
        }
        return undefined;
      };

      boardId = await findExistingBoard();

      // Create if not exists
      if (!boardId) {
        console.log(`[Pinterest] Board "${boardName}" not found in listing — attempting create`);
        const createRes = await fetch(`${PIN_API}/boards`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: boardName,
            description: `${boardName} — managed by AMOS`,
            privacy: 'PUBLIC',
          }),
        });
        if (createRes.ok) {
          const createData = await createRes.json();
          boardId = createData.id;
          console.log(`[Pinterest] Created board "${boardName}", id=${boardId}`);
        } else {
          // Inspect error: code 58 = "name already taken" — list-boards missed it,
          // probably because the token lacks `boards:read` scope. Re-try the
          // listing once more or surface a clear error.
          const errText = await createRes.text();
          let errCode = 0;
          try { errCode = JSON.parse(errText)?.code ?? 0; } catch { /* */ }
          if (errCode === 58) {
            console.warn('[Pinterest] Board create returned code 58 (already exists) — retrying find');
            boardId = await findExistingBoard();
            if (!boardId) {
              // Pinterest sandbox quirk: it claims the board exists but
              // doesn't return it via /boards. Fall back to a unique
              // timestamped name so we can keep publishing.
              const fallbackName = `${boardName} ${new Date().toISOString().slice(0, 10)} ${Math.random().toString(36).slice(2, 6)}`;
              console.warn(`[Pinterest] Falling back to unique board name: "${fallbackName}"`);
              const retryRes = await fetch(`${PIN_API}/boards`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  name: fallbackName,
                  description: `${fallbackName} — managed by AMOS (auto-fallback)`,
                  privacy: 'PUBLIC',
                }),
              });
              if (!retryRes.ok) {
                const retryErr = await retryRes.text();
                return {
                  success: false,
                  error: `Pinterest fallback board create faalde ook: ${retryErr}. Token mist mogelijk de boards:read/boards:write scope. Loskoppelen + opnieuw verbinden via AMOS Settings.`,
                };
              }
              const retryData = await retryRes.json();
              boardId = retryData.id;
              console.log(`[Pinterest] Created fallback board "${fallbackName}", id=${boardId}`);
            }
          } else {
            return { success: false, error: `Pinterest board create error: ${errText}` };
          }
        }
      }
    }

    if (!boardId) {
      return { success: false, error: 'Could not resolve Pinterest board' };
    }

    // Step 2: Create pin — Pinterest fetches our cover_image_url / image_url
    // server-side, so route both through the media helper.
    const externalImageUrl = imageUrl ? await toExternalMediaUrl(imageUrl) : undefined;
    const externalVideoRef = videoUrl ? await toExternalMediaUrl(videoUrl) : undefined;
    const pinBody: any = {
      board_id: boardId,
      media_source: externalVideoRef
        ? { source_type: 'video_id', cover_image_url: externalImageUrl, media_id: externalVideoRef } // legacy form
        : { source_type: 'image_url', url: externalImageUrl },
      title: (options?.title ?? text.split('\n')[0] ?? 'AMOS').substring(0, 100),
      description: text.substring(0, 800),
    };
    if (options?.clickThroughLink) {
      pinBody.link = options.clickThroughLink;
    }

    const pinRes = await fetch(`${PIN_API}/pins`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pinBody),
    });

    if (!pinRes.ok) {
      const errBody = await pinRes.text();
      console.error('[Pinterest] Pin create error:', pinRes.status, errBody);
      return { success: false, error: `Pinterest pin error ${pinRes.status}: ${errBody}` };
    }

    const pinData = await pinRes.json();
    return { success: true, postId: pinData.id, boardId };
  } catch (err: any) {
    return { success: false, error: `Pinterest exception: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════
// Threads Publisher (Meta — text/image/video)
// ═══════════════════════════════════════════════════════

async function publishToThreads(
  accessToken: string,
  threadsUserId: string,
  text: string,
  imageUrl?: string,
  videoUrl?: string,
): Promise<{ success: boolean; postId?: string; error?: string; permalink?: string }> {
  try {
    const THREADS_API = 'https://graph.threads.net/v1.0';

    // Step 1: Create container
    const containerBody: any = {
      access_token: accessToken,
      text: text.substring(0, 500), // Threads max 500 chars
    };

    // Helper: append ?preset=meta to media-proxy URLs so the proxy auto-resizes
    // to ≤1080×1920 (Threads/IG reject oversized images with timeout / 400).
    const withMetaPreset = (mediaUrl: string): string => {
      if (!MEDIA_PROXY_BASE_URL || !mediaUrl.startsWith(MEDIA_PROXY_BASE_URL)) return mediaUrl;
      const sep = mediaUrl.includes('?') ? '&' : '?';
      return `${mediaUrl}${sep}preset=meta`;
    };

    if (videoUrl) {
      containerBody.media_type = 'VIDEO';
      containerBody.video_url = withMetaPreset(await toExternalMediaUrl(videoUrl));
    } else if (imageUrl) {
      containerBody.media_type = 'IMAGE';
      containerBody.image_url = withMetaPreset(await toExternalMediaUrl(imageUrl));
    } else {
      containerBody.media_type = 'TEXT';
    }

    const createRes = await fetch(`${THREADS_API}/${threadsUserId}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerBody),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      return { success: false, error: `Threads container error ${createRes.status}: ${errBody}` };
    }

    const containerData = await createRes.json();
    const creationId = containerData.id;

    // Step 2: Wait briefly for media processing (Meta recommends ~30 sec for video)
    if (videoUrl) {
      await new Promise((r) => setTimeout(r, 5000));
    } else if (imageUrl) {
      await new Promise((r) => setTimeout(r, 1500));
    }

    // Step 3: Publish container
    const publishRes = await fetch(`${THREADS_API}/${threadsUserId}/threads_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        creation_id: creationId,
      }),
    });

    if (!publishRes.ok) {
      const errBody = await publishRes.text();
      return { success: false, error: `Threads publish error ${publishRes.status}: ${errBody}` };
    }

    const publishData = await publishRes.json();
    // Best-effort: fetch the public permalink so the client can deep-link to the thread.
    let permalink: string | undefined;
    try {
      const permRes = await fetch(
        `${THREADS_API}/${publishData.id}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`,
      );
      if (permRes.ok) {
        const permData = await permRes.json();
        permalink = permData.permalink as string | undefined;
      }
    } catch (permErr: any) {
      console.warn('[Threads] permalink fetch exception:', permErr.message);
    }
    return { success: true, postId: publishData.id, ...(permalink ? { permalink } : {}) };
  } catch (err: any) {
    return { success: false, error: `Threads exception: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════
// First-Comment Publishers
// ═══════════════════════════════════════════════════════

/**
 * Post a first comment on a LinkedIn UGC post right after publishing.
 * Endpoint: POST https://api.linkedin.com/v2/socialActions/urn:li:ugcPost:{postId}/comments
 * Requires x-restli-protocol-version 2.0.0 header and the author URN used during publish.
 */
async function postLinkedInFirstComment(
  accessToken: string,
  publishedPostId: string,
  authorUrn: string,
  commentText: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const commentRes = await fetch(
      `https://api.linkedin.com/v2/socialActions/urn:li:ugcPost:${publishedPostId}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          actor: authorUrn,
          object: `urn:li:ugcPost:${publishedPostId}`,
          message: { text: commentText },
        }),
      },
    );
    if (!commentRes.ok) {
      const errBody = await commentRes.text();
      console.error('[LinkedIn] First-comment error:', commentRes.status, errBody);
      return { success: false, error: `LinkedIn comment API error ${commentRes.status}: ${errBody}` };
    }
    console.log('[LinkedIn] First comment posted successfully on post', publishedPostId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: `LinkedIn comment exception: ${err.message}` };
  }
}

/**
 * Post a first comment on a Facebook post right after publishing.
 * Endpoint: POST https://graph.facebook.com/v20.0/{postId}/comments
 */
async function postFacebookFirstComment(
  accessToken: string,
  publishedPostId: string,
  commentText: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const commentRes = await fetch(
      `https://graph.facebook.com/v20.0/${publishedPostId}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: commentText,
          access_token: accessToken,
        }),
      },
    );
    if (!commentRes.ok) {
      const errBody = await commentRes.text();
      const safeErrBody = errBody.replace(/"access_token"\s*:\s*"[^"]*"/g, '"access_token":"[REDACTED]"');
      console.error('[Facebook] First-comment error:', commentRes.status, safeErrBody);
      return { success: false, error: `Facebook comment API error ${commentRes.status}: ${safeErrBody}` };
    }
    console.log('[Facebook] First comment posted successfully on post', publishedPostId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: `Facebook comment exception: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════════
// Token Validation Helper
// ═══════════════════════════════════════════════════════

/**
 * Ensures the stored OAuth token is still valid.
 * - LinkedIn: attempts a real refresh_token flow if expired.
 * - Facebook/Instagram: marks token as expired and signals reconnect (Meta
 *   does not allow server-side refresh with an already-expired token).
 * Returns { valid: true, token } on success or { valid: false, action: 'reconnect' }.
 */
async function ensureValidToken(
  db: ReturnType<typeof createClient>,
  tokenData: { access_token: string; refresh_token?: string | null; expires_at?: string | null; created_at?: string | null; updated_at?: string | null },
  socialAccountId: string,
  channel: string,
): Promise<{ valid: boolean; token?: string; action?: 'reconnect'; error?: string }> {
  // Zombie token detection: expires_at is null (from oauth-callback before v22)
  // AND the token row is older than 45 days → treat as expired (platforms typically
  // invalidate after 60 days). This prevents silently sending a dead token to the API.
  const now = Date.now();
  const ZOMBIE_AGE_MS = 45 * 24 * 60 * 60 * 1000;
  const tokenAgeRef = tokenData.updated_at || tokenData.created_at;
  const isZombie = !tokenData.expires_at
    && tokenAgeRef
    && (now - new Date(tokenAgeRef).getTime() > ZOMBIE_AGE_MS);

  if (isZombie) {
    // Force reconnect flow
    if (channel === 'facebook' || channel === 'instagram') {
      await db.from('social_accounts').update({ status: 'expired' }).eq('id', socialAccountId);
    }
    return {
      valid: false,
      action: 'reconnect',
      error: `${channel} token is zombie (geen expires_at, >${Math.floor(ZOMBIE_AGE_MS / (24*60*60*1000))} dagen oud). Koppel je account opnieuw in Instellingen.`,
    };
  }

  // Token not yet expired (or no expiry stored and young enough) — all good
  if (!tokenData.expires_at || new Date(tokenData.expires_at) >= new Date()) {
    return { valid: true, token: tokenData.access_token };
  }

  // LinkedIn: try real refresh_token grant
  if (channel === 'linkedin' && tokenData.refresh_token) {
    try {
      const refreshRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokenData.refresh_token,
          client_id: Deno.env.get('LINKEDIN_CLIENT_ID') ?? '',
          client_secret: Deno.env.get('LINKEDIN_CLIENT_SECRET') ?? '',
        }),
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        await db
          .from('oauth_tokens')
          .update({
            access_token: refreshData.access_token,
            expires_at: new Date(Date.now() + (refreshData.expires_in || 5184000) * 1000).toISOString(),
            refresh_token: refreshData.refresh_token || tokenData.refresh_token,
          })
          .eq('social_account_id', socialAccountId);
        return { valid: true, token: refreshData.access_token };
      }
    } catch {
      // fall through to reconnect
    }
    return { valid: false, action: 'reconnect', error: 'OAuth token verlopen en refresh mislukt. Koppel je account opnieuw.' };
  }

  // Facebook / Instagram: expired token cannot be refreshed server-side
  if (channel === 'facebook' || channel === 'instagram') {
    await db
      .from('social_accounts')
      .update({ status: 'expired' })
      .eq('id', socialAccountId);
    return { valid: false, action: 'reconnect', error: `${channel} token expired — please reconnect your account` };
  }

  // Any other channel without refresh support
  return { valid: false, action: 'reconnect', error: 'OAuth token verlopen. Koppel je account opnieuw in Instellingen.' };
}

// ═══════════════════════════════════════════════════════
// Main Handler
// ═══════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Internal-call escape (scheduled-publisher / system cron) ──
  // Trusted server-side callers (like the scheduled publish worker) hit
  // this endpoint via pg_cron and cannot produce a user JWT. They pass
  // the service-role key as Bearer + a shared INTERNAL_CALL_SECRET.
  // In that mode we skip the per-user JWT check but still trust body.user_id
  // for DB scoping (service-role bypasses RLS).
  const internalSecret = Deno.env.get('INTERNAL_CALL_SECRET') ?? '';
  const xInternalCall = req.headers.get('x-internal-call') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const isInternalCall = !!internalSecret
    && xInternalCall === internalSecret
    && authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;

  let jwtUser: { id: string } | null = null;

  if (isInternalCall) {
    // Trusted internal caller — skip JWT check.
    console.log('[publish-social] internal call accepted');
  } else {
    // ── JWT authentication (normal app calls) ──
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const jwt = authHeader.slice(7);
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user: jwtUserData }, error: jwtErr } = await authClient.auth.getUser();
    if (jwtErr || !jwtUserData) {
      console.error('[publish-social] JWT validation failed:', jwtErr?.message ?? 'no user');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    jwtUser = jwtUserData;
  }

  try {
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { proposal_id, post_id, user_id, channel: directChannel, text: directText, image_url: directImageUrl, video_url: directVideoUrl, media_type: directMediaType, extra_image_urls: directExtraImageUrls, account_id: directAccountId, ig_format: directIgFormat, product_key: directProductKey } = body;

    // ─── Account preference helpers ────────────────────────────────────
    // Prefer publishing as the company/business/page identity over personal.
    // Personal LinkedIn = w_member_social only; company = w_organization_social (LMDP).
    // Personal IG = no API publishing; business = full Graph publishing.
    const ACCOUNT_TYPE_RANK: Record<string, number> = {
      company: 1, business: 1, page: 1,
      personal: 5, manual: 9,
    };
    // LinkedIn product → admin page mapping. Active once LMDP is approved
    // and `social_accounts` rows exist with account_type='company'.
    const LINKEDIN_PAGE_BY_PRODUCT: Record<string, string> = {
      academy: 'Inclufy Academy', assessments: 'Inclufy Academy',
      projects: 'ProjextPal', projextpal: 'ProjextPal',
      marketing: 'AMOS', amos: 'AMOS', events: 'AMOS',
      helix: 'Inclufy-AI', 'iq-helix': 'Inclufy-AI', iqhelix: 'Inclufy-AI',
      finance: 'Inclufy AI Solutions', sales: 'Inclufy AI Solutions',
      procurement: 'Inclufy AI Solutions', inventory: 'Inclufy AI Solutions',
      warehousing: 'Inclufy AI Solutions', manufacturing: 'Inclufy AI Solutions',
      logistics: 'Inclufy AI Solutions', ignite: 'Inclufy AI Solutions',
      erp: 'Inclufy AI Solutions',
      ecosystem: 'Inclufy Consulting', consulting: 'Inclufy Consulting',
      community: 'LEADERS NETWORK', leadership: 'LEADERS NETWORK',
    };
    function pickAccount(accounts: any[], channel: string, productKey?: string): any | null {
      if (!accounts || accounts.length === 0) return null;
      // Normalize account-name for comparison: strip the trailing "(Bedrijf)" /
      // "(Company)" suffix that the OAuth callback adds, lowercase, trim. This
      // prevents substring ambiguity (e.g. target "Inclufy" used to also match
      // "Inclufy AI Solutions" — now must be EXACT after normalization).
      const normName = (s?: string | null) =>
        (s || '')
          .toLowerCase()
          .replace(/\s*\((?:bedrijf|company)\)\s*$/i, '')
          .trim();
      // 1) LinkedIn — try product → page name match first (exact match only)
      if (channel === 'linkedin' && productKey) {
        const lc = productKey.toLowerCase();
        const sortedKeys = Object.keys(LINKEDIN_PAGE_BY_PRODUCT).sort((a, b) => b.length - a.length);
        for (const key of sortedKeys) {
          if (lc.includes(key)) {
            const target = normName(LINKEDIN_PAGE_BY_PRODUCT[key]);
            const match = accounts.find((a) =>
              normName(a.account_name) === target && a.account_type === 'company',
            );
            if (match) return match;
          }
        }
      }
      // 2) Smart-default — prefer company/business/page over personal
      const sorted = [...accounts].sort((a, b) =>
        (ACCOUNT_TYPE_RANK[a.account_type] ?? 7) - (ACCOUNT_TYPE_RANK[b.account_type] ?? 7),
      );
      return sorted[0];
    }

    // Assert JWT user matches request body user_id (skipped for internal calls)
    if (!isInternalCall && user_id && jwtUser && jwtUser.id !== user_id) {
      return new Response(JSON.stringify({ error: 'Forbidden: user_id mismatch' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Direct post publish (from go_posts via mobile app) ──
    if (post_id && user_id) {
      const channel = directChannel;
      const text = directText;
      let imageUrl = directImageUrl;
      // Mutable local so we can re-assign with watermarked URLs below.
      // `let` (not `const`) because the bake step replaces each entry
      // with the new branded URL. Defensive empty-array fallback so
      // downstream `.map()` / spreads never trip on undefined.
      let extraImageUrls: string[] = Array.isArray(directExtraImageUrls)
        ? (directExtraImageUrls as any[]).filter((u): u is string => typeof u === 'string' && !!u)
        : [];
      const videoUrl = directVideoUrl as string | undefined;
      const mediaType = (directMediaType as string | undefined) ?? 'photo';
      const igFormat = (directIgFormat as 'feed' | 'story' | 'reel' | undefined) ?? 'feed';

      // Always log incoming requests so we can trace silent early-returns
      // (401 unauth, 422 missing account, etc) without instrumenting every
      // exit path.
      console.log('[publish-social] Incoming request:', JSON.stringify({
        post_id,
        user_id,
        channel,
        has_image: !!imageUrl,
        has_video: !!videoUrl,
        media_type: mediaType,
        ig_format: igFormat,
        has_account_id: !!directAccountId,
        text_len: text?.length ?? 0,
      }));

      if (!channel || !text) {
        console.error('[publish-social] Bad request — missing channel or text');
        return new Response(
          JSON.stringify({ error: 'channel and text are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // ── Free-tier policy gates ─────────────────────────────────────────
      // Internal/service-role callers (scheduled-publisher cron, recovery
      // scripts) bypass the gates — they're already trusted code and
      // shouldn't be capped by end-user policy.
      if (!isInternalCall) {
        const tier = await fetchUserTier(db, user_id);

        // 1. Daily cap: max 1 unique post / day on free.
        const dailyCheck = await checkDailyCap(db, {
          userId: user_id,
          tier,
          postId: post_id,
        });
        if (!dailyCheck.ok) {
          console.warn(`[publish-social] free-tier daily cap hit for user ${user_id}`);
          return policyDenyResponse(dailyCheck, corsHeaders);
        }

        // 2. Channels-per-post cap: max 3 distinct channel fanouts on free.
        if (directAccountId) {
          const channelCheck = await checkChannelsPerPost(db, {
            userId: user_id,
            tier,
            postId: post_id,
            targetAccountId: directAccountId,
          });
          if (!channelCheck.ok) {
            console.warn(`[publish-social] free-tier channels-per-post cap hit for post ${post_id}`);
            return policyDenyResponse(channelCheck, corsHeaders);
          }
        }

        // 3. Bake AMOS watermark for free tier. Pro+ tiers no-op inside
        // the helper. v3 uses imagescript with NO external font fetch —
        // a flat pink badge composited at one of 9 grid positions. Wrapped
        // in try/catch so any unexpected failure falls back to original URL.
        //
        // Position resolution (first match wins):
        //   a. post.engagement.watermark_position  (per-post override)
        //   b. profile.watermark_positions_by_channel[channel]  (per-channel)
        //   c. profile.watermark_position                       (user default)
        //   d. 'top-left'                                       (system default)
        const channelKey = String(channel ?? '').toLowerCase();

        // Single batched lookup: post row + profile row in parallel for the
        // fallback chain. This was previously two awaits per gate.
        const [postLookup, profileLookup] = await Promise.all([
          db.from('go_posts')
            .select('engagement')
            .eq('id', post_id)
            .maybeSingle()
            .then(r => r.data, () => null),
          db.from('profiles')
            .select('watermark_position, watermark_positions_by_channel, watermark_size')
            .eq('id', user_id)
            .maybeSingle()
            .then(r => r.data, () => null),
        ]);

        const watermarkPosition: WatermarkPosition = (() => {
          const fromPost = (postLookup?.engagement as any)?.watermark_position;
          if (typeof fromPost === 'string') return safeWatermarkPosition(fromPost);
          const byChan = (profileLookup?.watermark_positions_by_channel as any)?.[channelKey];
          if (typeof byChan === 'string') return safeWatermarkPosition(byChan);
          if (typeof profileLookup?.watermark_position === 'string') {
            return safeWatermarkPosition(profileLookup.watermark_position);
          }
          return 'top-left';
        })();

        const watermarkSize: WatermarkSize = (() => {
          const fromPost = (postLookup?.engagement as any)?.watermark_size;
          if (typeof fromPost === 'string') return safeWatermarkSize(fromPost);
          if (typeof profileLookup?.watermark_size === 'string') {
            return safeWatermarkSize(profileLookup.watermark_size);
          }
          return 'medium';
        })();

        // Multi-image: carousel posts (IG / LinkedIn / FB) ship a primary
        // image + N extras. We MUST bake every one — otherwise a free user
        // can bypass the watermark by tucking unbranded extras after a
        // primary image we did watermark. Run all bakes in parallel for
        // latency; each call has its own try/catch so one bad image
        // doesn't cascade-fail the rest.
        const safeBake = async (url: string): Promise<string> => {
          try {
            return await bakeAmosWatermark({
              db, imageUrl: url, userId: user_id, tier,
              position: watermarkPosition,
              size: watermarkSize,
            });
          } catch (bakeErr: any) {
            console.error(`[publish-social] watermark bake threw for ${url.slice(0, 60)}…: ${bakeErr?.message ?? bakeErr}`);
            return url; // fail-open: original URL still publishes
          }
        };

        if (imageUrl || extraImageUrls.length > 0) {
          const targets: string[] = [
            ...(imageUrl ? [imageUrl] : []),
            ...extraImageUrls,
          ];
          const baked = await Promise.all(targets.map(safeBake));
          if (imageUrl) {
            imageUrl = baked[0];
            extraImageUrls = baked.slice(1);
          } else {
            extraImageUrls = baked;
          }
          console.log(
            `[publish-social] watermark baked: 1 primary + ${extraImageUrls.length} extras (tier=${tier}, position=${watermarkPosition}, size=${watermarkSize})`,
          );
        }
      }

      // Find social account — use specific account_id if provided, else smart-default
      // (prefer company/business/page over personal, with LinkedIn product→page mapping).
      const normalizedChannel = String(channel).toLowerCase();
      let socialAccount: any = null;

      if (directAccountId) {
        const { data } = await db
          .from('social_accounts')
          .select('id, platform, platform_account_id, account_type, account_name, status')
          .eq('user_id', user_id)
          .eq('id', directAccountId)
          .limit(1)
          .maybeSingle();
        socialAccount = data;
      } else {
        // Fetch all matching accounts; prefer 'active', fall back to any status
        const { data: activeAccounts } = await db
          .from('social_accounts')
          .select('id, platform, platform_account_id, account_type, account_name, status')
          .eq('user_id', user_id)
          .ilike('platform', normalizedChannel)
          .eq('status', 'active');
        let candidates = activeAccounts ?? [];
        if (candidates.length === 0) {
          console.log(`[publish-social] No active ${channel} account — retrying without status filter`);
          const { data: anyAccounts } = await db
            .from('social_accounts')
            .select('id, platform, platform_account_id, account_type, account_name, status')
            .eq('user_id', user_id)
            .ilike('platform', normalizedChannel);
          candidates = anyAccounts ?? [];
        }
        socialAccount = pickAccount(candidates, normalizedChannel, directProductKey);
        if (socialAccount) {
          console.log(`[publish-social] Picked ${channel} account: type=${socialAccount.account_type} name="${socialAccount.account_name}" (productKey=${directProductKey || 'n/a'})`);
        }
      }

      if (!socialAccount) {
        console.error(`[publish-social] No ${channel} account found for user ${user_id} (directAccountId=${directAccountId || 'none'})`);
        return new Response(
          JSON.stringify({ error: `Geen ${channel} account gekoppeld`, action: 'connect_account', channel }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Manual account — mark as published
      if (socialAccount.account_type === 'manual') {
        return new Response(
          JSON.stringify({ success: true, published: false, manual: true, message: `Content klaar om te kopiëren naar ${channel}.` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Fetch first_comment from go_posts row (may be null if not set)
      const { data: postRow } = await db
        .from('go_posts')
        .select('first_comment')
        .eq('id', post_id)
        .maybeSingle();
      const firstCommentText: string | null = (postRow as any)?.first_comment ?? null;

      // Fetch OAuth token (check expiry)
      const { data: tokenData } = await db
        .from('oauth_tokens')
        .select('access_token, refresh_token, expires_at, created_at, updated_at')
        .eq('social_account_id', socialAccount.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!tokenData?.access_token) {
        console.error(`[publish-social] No OAuth access_token for ${channel} account ${socialAccount.id} (user ${user_id}) — needs reconnect`);
        return new Response(
          JSON.stringify({ error: 'Geen geldig OAuth token. Koppel je account opnieuw.', action: 'reconnect', channel }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Check if token is expired / refresh if needed
      const tokenCheck = await ensureValidToken(db, tokenData, socialAccount.id, channel);
      if (!tokenCheck.valid) {
        console.error(`[publish-social] Token check failed for ${channel} account ${socialAccount.id}: ${tokenCheck.error} (action=${tokenCheck.action})`);
        const status = (channel === 'facebook' || channel === 'instagram') ? 401 : 422;
        return new Response(
          JSON.stringify({ success: false, action: tokenCheck.action, error: tokenCheck.error, channel }),
          { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      tokenData.access_token = tokenCheck.token!;

      // Instagram feed requires an image; Story/Reel have their own media checks inside publishToInstagram
      if (channel === 'instagram' && igFormat === 'feed' && !imageUrl) {
        return new Response(
          JSON.stringify({ error: 'Instagram vereist een afbeelding. Voeg een foto toe aan je post.', action: 'add_image', channel }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Publish
      let result: { success: boolean; postId?: string; error?: string; permalink?: string; boardId?: string };
      switch (channel) {
        case 'linkedin':
          // Use the WATERMARKED extraImageUrls (not directExtraImageUrls) so
          // free-tier carousel extras carry the AMOS chip too. Same below.
          result = await publishToLinkedIn(tokenData.access_token, socialAccount.platform_account_id, text, imageUrl, socialAccount.account_type === 'company' ? 'company' : 'personal', extraImageUrls, videoUrl, mediaType);
          break;
        case 'facebook':
          result = await publishToFacebook(tokenData.access_token, socialAccount.platform_account_id, text, imageUrl, videoUrl);
          break;
        case 'instagram':
          result = await publishToInstagram(tokenData.access_token, socialAccount.platform_account_id, text, imageUrl, extraImageUrls, igFormat, videoUrl);
          break;
        case 'whatsapp':
          // WhatsApp Cloud API publishing not yet active — manual copy-paste only.
          // A separate agent will extend this case with WABA / Cloud API support.
          result = { success: false, error: 'WhatsApp API publishing nog niet actief. Ondersteunt nu alleen manual copy-paste.' };
          break;
        case 'tiktok':
          // TikTok Content Posting API — supports both video AND photo carousel.
          // Single scope (`video.publish`) covers both endpoints. The publisher
          // routes internally based on which media is supplied: if no videoUrl
          // is given, the photo-carousel branch (/post/publish/content/init/)
          // is used with up to 35 images.
          result = await publishToTikTok(
            tokenData.access_token,
            text,
            videoUrl,
            imageUrl,
            extraImageUrls,
          );
          break;
        case 'pinterest': {
          // Pinterest API v5 — image pins with SEO description + board management.
          // Requires Pinterest Developer App + pins:write scope.
          // NOTE: in the post-based flow `proposal` is undefined — we read pinterest_*
          // overrides from the request body (sent by useEventPosts/Library hooks)
          // and fall back to sensible defaults inside publishToPinterest.
          const b = body as any;
          result = await publishToPinterest(
            tokenData.access_token,
            text,
            imageUrl,
            videoUrl,
            {
              title: b?.pinterest_title,
              boardId: b?.pinterest_board_id,
              boardName: b?.pinterest_board_name,
              clickThroughLink: b?.pinterest_click_through_url ?? b?.pinterest_click_through,
            },
          );
          break;
        }
        case 'threads':
          // Threads API (Meta) — text/image/video posts.
          // Requires Meta App with "Access the Threads API" use case.
          result = await publishToThreads(
            tokenData.access_token,
            socialAccount.platform_account_id,
            text,
            imageUrl,
            videoUrl,
          );
          break;
        case 'snapchat':
          // Snapchat: no public publish API exists (Snap Kit deprecated 2023).
          // AMOS only supports manual share via deep-link to Snapchat app.
          // PostReview handles this client-side with snapchat:// URL scheme.
          result = {
            success: false,
            error: 'Snapchat ondersteunt geen API-publishing. Gebruik de "Manueel delen" knop in PostReview om naar de Snapchat-app te springen.',
          };
          break;
        default:
          result = { success: false, error: `Platform '${channel}' wordt nog niet ondersteund` };
      }

      if (!result.success) {
        console.error(`[publish-social] ${channel} publish failed: ${result.error}`);
        // Fire-and-forget email notification to the user.
        const isReconnect = /token|expired|verlopen|reconnect|unauthorized|access token/i.test(result.error ?? '');
        sendEmailNotification(db, user_id, isReconnect ? 'oauth_token_expired' : 'publish_failed', {
          channel,
          error: result.error,
          action: isReconnect ? 'reconnect' : '',
        }).catch((e) => console.warn('[send-email hook]', e?.message));
        return new Response(
          JSON.stringify({ success: false, error: result.error }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      console.log(`[publish-social] ${channel} publish succeeded — postId=${result.postId}`);

      // Fire-and-forget success email (don't await — slow Resend shouldn't
      // delay the publish response).
      sendEmailNotification(db, user_id, 'publish_success', {
        channel,
        postUrl: (result as any).liveUrl ?? (result as any).permalink ?? '',
        accountName: socialAccount.account_name ?? '',
      }).catch((e) => console.warn('[send-email hook]', e?.message));

      // ── First-comment auto-post ──────────────────────────────────────────
      // Post a first comment on the just-published post if configured.
      // Failures are non-fatal: we log them and report status in the response
      // but never roll back or fail the entire publish.
      let firstCommentStatus: 'posted' | 'skipped' | 'failed' = 'skipped';

      if (firstCommentText && result.postId) {
        let commentResult: { success: boolean; error?: string };

        if (channel === 'linkedin') {
          // Determine the author URN — must match the one used during publish.
          // Company page: platform_account_id is the org ID or full URN.
          // Personal: fetch sub from /userinfo (same logic as publishToLinkedIn).
          let authorUrn: string;
          if (socialAccount.account_type === 'company' && socialAccount.platform_account_id) {
            authorUrn = socialAccount.platform_account_id.startsWith('urn:')
              ? socialAccount.platform_account_id
              : `urn:li:organization:${socialAccount.platform_account_id}`;
          } else {
            try {
              const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
              });
              const profile = profileRes.ok ? await profileRes.json() : {};
              authorUrn = `urn:li:person:${profile.sub ?? socialAccount.platform_account_id}`;
            } catch {
              authorUrn = `urn:li:person:${socialAccount.platform_account_id}`;
            }
          }
          commentResult = await postLinkedInFirstComment(
            tokenData.access_token,
            result.postId,
            authorUrn,
            firstCommentText,
          );
        } else if (channel === 'facebook') {
          commentResult = await postFacebookFirstComment(
            tokenData.access_token,
            result.postId,
            firstCommentText,
          );
        } else {
          // Instagram: the Meta Graph API does not support posting comments on
          // media published by third-party apps (including Business API clients).
          // Attempting it returns a (200 #15) permissions error. Skip silently.
          console.log('[publish-social] First-comment skipped for Instagram — not supported by Meta Graph API');
          commentResult = { success: false };
          firstCommentStatus = 'skipped';
        }

        if (channel !== 'instagram') {
          if (commentResult.success) {
            firstCommentStatus = 'posted';
            // Stamp first_comment_posted_at in DB (best-effort, non-fatal)
            try {
              await db
                .from('go_posts')
                .update({ first_comment_posted_at: new Date().toISOString() })
                .eq('id', post_id);
            } catch (dbErr: any) {
              console.warn('[publish-social] Could not update first_comment_posted_at:', dbErr.message);
            }
          } else {
            firstCommentStatus = 'failed';
            console.error('[publish-social] First-comment failed (non-fatal):', commentResult.error);
          }
        }
      }

      // Compute a best-effort live URL so the client can link straight to the post.
      // Prefers the permalink returned by the platform; otherwise falls back to a
      // deterministic URL when the postId format makes that safe.
      const liveUrl = (() => {
        const r: any = result;
        if (r.permalink) return r.permalink as string;
        if (!r.postId) return null;
        const pid = String(r.postId);
        if (channel === 'linkedin') return `https://www.linkedin.com/feed/update/urn:li:activity:${pid}/`;
        if (channel === 'facebook') return `https://www.facebook.com/${pid}`;
        if (channel === 'pinterest') return `https://www.pinterest.com/pin/${pid}/`;
        return null;
      })();

      return new Response(
        JSON.stringify({
          success: true,
          published: true,
          postId: result.postId,
          channel,
          firstComment: firstCommentStatus,
          ...(liveUrl ? { liveUrl } : {}),
          ...(result.permalink ? { permalink: result.permalink } : {}),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Legacy proposal publish (from go_content_proposals) ──
    if (!proposal_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'proposal_id/post_id and user_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 1. Fetch the proposal
    const { data: proposal, error: proposalErr } = await db
      .from('go_content_proposals')
      .select('*')
      .eq('id', proposal_id)
      .eq('user_id', user_id)
      .single();

    if (proposalErr || !proposal) {
      return new Response(
        JSON.stringify({ error: 'Voorstel niet gevonden', details: proposalErr?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (proposal.status !== 'approved') {
      return new Response(
        JSON.stringify({ error: 'Voorstel moet eerst goedgekeurd zijn', status: proposal.status }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const channel = proposal.channel; // linkedin, facebook, instagram, etc.
    const text = proposal.content_text + ((proposal.hashtags ?? []).length > 0 ? '\n\n' + proposal.hashtags.join(' ') : '');
    const imageUrl = proposal.media_url || undefined;

    // 2. Find social account for this channel
    // Case-insensitive platform match + fallback without status filter (mirrors mobile fix 6548a90)
    const normalizedChannel = String(channel).toLowerCase();
    let { data: socialAccount } = await db
      .from('social_accounts')
      .select('id, platform, platform_account_id, account_type, status')
      .eq('user_id', user_id)
      .ilike('platform', normalizedChannel)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    // Fallback: retry without status filter
    if (!socialAccount) {
      console.log(`[publish-social:legacy] No active ${channel} account — retrying without status filter`);
      const { data: fallbackAccount } = await db
        .from('social_accounts')
        .select('id, platform, platform_account_id, account_type, status')
        .eq('user_id', user_id)
        .ilike('platform', normalizedChannel)
        .limit(1)
        .maybeSingle();
      socialAccount = fallbackAccount;
    }

    if (!socialAccount) {
      // Update proposal with error
      await db
        .from('go_content_proposals')
        .update({
          status: 'approved', // keep approved, not published
          review_note: `Geen ${channel} account gekoppeld. Koppel je account in Instellingen.`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', proposal_id);

      return new Response(
        JSON.stringify({
          error: `Geen ${channel} account gekoppeld`,
          action: 'connect_account',
          channel,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3. Fetch OAuth token (with expiry check)
    const { data: tokenData } = await db
      .from('oauth_tokens')
      .select('access_token, refresh_token, expires_at, created_at, updated_at')
      .eq('social_account_id', socialAccount.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tokenData?.access_token) {
      // Manual account without token — mark as published anyway (simulated)
      if (socialAccount.account_type === 'manual') {
        await db
          .from('go_content_proposals')
          .update({
            status: 'published',
            reviewed_at: new Date().toISOString(),
            review_note: `Gepubliceerd (handmatig account — kopieer de tekst naar ${channel})`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', proposal_id);

        return new Response(
          JSON.stringify({
            success: true,
            published: false,
            manual: true,
            message: `Content klaar om te kopiëren naar ${channel}. Account is handmatig gekoppeld.`,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({ error: 'Geen geldig OAuth token gevonden. Koppel je account opnieuw.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3b. Check token expiry / refresh
    const legacyTokenCheck = await ensureValidToken(db, tokenData, socialAccount.id, channel);
    if (!legacyTokenCheck.valid) {
      const status = (channel === 'facebook' || channel === 'instagram') ? 401 : 422;
      return new Response(
        JSON.stringify({ success: false, action: legacyTokenCheck.action, error: legacyTokenCheck.error, channel }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    tokenData.access_token = legacyTokenCheck.token!;

    // 4. Publish to the platform
    let result: { success: boolean; postId?: string; error?: string };

    switch (channel) {
      case 'linkedin':
        result = await publishToLinkedIn(tokenData.access_token, socialAccount.platform_account_id, text, imageUrl);
        break;
      case 'facebook':
        result = await publishToFacebook(tokenData.access_token, socialAccount.platform_account_id, text, imageUrl);
        break;
      case 'instagram':
        result = await publishToInstagram(tokenData.access_token, socialAccount.platform_account_id, text, imageUrl);
        break;
      default:
        result = { success: false, error: `Platform '${channel}' wordt nog niet ondersteund voor automatisch publiceren` };
    }

    // 5. Update proposal status
    if (result.success) {
      await db
        .from('go_content_proposals')
        .update({
          status: 'published',
          reviewed_at: new Date().toISOString(),
          review_note: `Gepubliceerd op ${channel} (post ID: ${result.postId})`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', proposal_id);

      // Log to automation logs if automation exists for content_scheduled
      const { data: automation } = await db
        .from('go_automations')
        .select('id')
        .eq('user_id', user_id)
        .eq('trigger_type', 'content_scheduled')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (automation) {
        await db.from('go_automation_logs').insert({
          user_id,
          automation_id: automation.id,
          status: 'success',
          trigger_data: { proposal_id, channel },
          actions_executed: [{ type: 'post_social', channel, post_id: result.postId }],
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: 0,
        });

        // Update automation stats
        await db
          .from('go_automations')
          .update({
            total_runs: (automation as any).total_runs ? (automation as any).total_runs + 1 : 1,
            last_run_at: new Date().toISOString(),
          })
          .eq('id', automation.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          published: true,
          channel,
          postId: result.postId,
          message: `Succesvol gepubliceerd op ${channel}!`,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    } else {
      // Publishing failed
      await db
        .from('go_content_proposals')
        .update({
          review_note: `Publicatie mislukt: ${result.error}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', proposal_id);

      return new Response(
        JSON.stringify({
          success: false,
          error: result.error,
          channel,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  } catch (err: any) {
    console.error('[publish-social] Unhandled error:', err.message ?? err);
    return new Response(
      JSON.stringify({ error: 'Server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
