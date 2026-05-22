// ─────────────────────────────────────────────────────────────────────────
// Server-side AMOS watermark bake — v7 (superadmin-configurable global).
//
// History:
//   v1 — tried to fetch Roboto-Bold.ttf from GitHub for text rendering →
//        timeouts on Supabase Edge Runtime, function errored before
//        any response was written.
//   v2 — stripped external deps; flat pink rectangle, hardcoded top-left.
//   v3 — added 9-position placement (top|middle|bottom × left|center|right)
//        via a fallback chain, but still drew a flat pink rectangle (no
//        logo, no text — purely a brand-color marker).
//   v4 — pre-rendered "AMOS by Inclufy" pink→orange gradient chip with
//        text, inlined as base64. Sized at 30% of image width, min 240px.
//        Worked but felt destructive: covered roughly a third of the photo
//        and the cobbled-together pill didn't match the real brand mark.
//   v5 — real polygonal AMOS logo (JPEG from assets/icon.png), 10% width
//        default. Smaller than v4 but still had a dark purple-blue square
//        backdrop — looked like a sticker slapped on the photo.
//   v6 — same logo, BACKGROUND REMOVED via hue-based segmentation (R-B
//        channel difference). Only the magenta→orange polygonal A renders
//        over the photo. Inlined at 192×192 RGBA PNG.
//   v7 (this) — adds superadmin-configurable global override via the new
//        `app_settings` table (key='watermark', value={image_url, opacity}).
//        On every bake the edge function loads the row: a custom image_url
//        replaces the inlined badge (cached per URL in module scope); an
//        opacity 0..1 multiplies the badge's alpha channel just before
//        compositing. Missing row / unreachable DB / failed fetch all
//        fall back gracefully to the inlined PNG at opacity 1.0. The
//        inlined PNG is now the FALLBACK, not the only option.
// ─────────────────────────────────────────────────────────────────────────

import { Image, decode as imgDecode } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';
import { decodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { Tier } from './free-tier-policy.ts';

export type WatermarkPosition =
  | 'top-left'    | 'top-center'    | 'top-right'
  | 'middle-left' | 'middle-center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

const VALID_POSITIONS: ReadonlySet<WatermarkPosition> = new Set([
  'top-left',    'top-center',    'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]);

/** Clamp arbitrary input back to a safe position (default top-left). */
export function safeWatermarkPosition(input: unknown): WatermarkPosition {
  if (typeof input === 'string' && VALID_POSITIONS.has(input as WatermarkPosition)) {
    return input as WatermarkPosition;
  }
  return 'top-left';
}

/** Size variant — controls the badge width as a % of image width. */
export type WatermarkSize = 'small' | 'medium' | 'large' | 'xlarge';

const VALID_SIZES: ReadonlySet<WatermarkSize> = new Set(['small', 'medium', 'large', 'xlarge']);

export function safeWatermarkSize(input: unknown): WatermarkSize {
  if (typeof input === 'string' && VALID_SIZES.has(input as WatermarkSize)) {
    return input as WatermarkSize;
  }
  return 'medium';
}

// v5 → v6 (2026-05-20): the previous text-pill design covered ~30% of the
// image and felt destructive on user content. Now using a much smaller
// AMOS logo stamp with TRANSPARENT BACKGROUND, at 10% width by default.
// Goal: "brand presence without ruining the photo".
const SIZE_PCT: Record<WatermarkSize, number> = {
  small:  0.06,  //  6% of image width — barely visible, just a hint
  medium: 0.10,  // 10% — default, brand-present but unobtrusive
  large:  0.14,  // 14% — prominent
  xlarge: 0.20,  // 20% — maximum, still well under the old 30% default
};

const SIZE_MIN_W_PX: Record<WatermarkSize, number> = {
  small:   48,
  medium:  80,
  large:  120,
  xlarge: 160,
};

const BADGE_MARGIN_PCT = 0.025; // 2.5% margin from edges
// Aspect ratio of the actual badge source (inlined or custom upload) is
// computed at runtime from the loaded Image, so arbitrary-aspect uploads
// don't get squished. The inlined fallback PNG below is 192×192 square.

// ── AMOS logo watermark stamp ────────────────────────────────────────────
// The polygonal-A AMOS brand mark with transparent background (from
// assets/amos-logo-transparent.png — pre-extracted via hue-segmentation
// from assets/icon.png). Resized to 192×192 PNG and inlined as base64
// so the Deno edge function needs zero external assets at runtime.
// Decoded once per cold start, cached in module scope, then resized to
// fit each target image.
//
// To regenerate (e.g. brand update):
//   1. Update assets/icon.png (the source square logo with bg)
//   2. python3 scripts/gen_logo_alpha.py     # rebuilds assets/amos-logo-transparent.png
//   3. sips -Z 192 -s format png assets/amos-logo-transparent.png --out /tmp/amos_logo_192.png
//   4. base64 -i /tmp/amos_logo_192.png | tr -d '\n'
//   5. paste over the constant below.
const BADGE_PNG_BASE64 =
  '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';

// Module-scoped cache for the decoded fallback (inlined) badge image.
// Decoded once per cold start; reused when no custom watermark is configured.
let _cachedDefaultBadge: Image | null = null;
async function getDefaultBadgeSource(): Promise<Image> {
  if (_cachedDefaultBadge) return _cachedDefaultBadge;
  const bytes = decodeBase64(BADGE_PNG_BASE64);
  const decoded = await imgDecode(bytes);
  if (!(decoded instanceof Image)) {
    throw new Error('[watermark] inlined badge PNG decoded as non-static image');
  }
  _cachedDefaultBadge = decoded;
  return _cachedDefaultBadge;
}

// Cache for the custom-image badge keyed by image_url so repeated bakes
// with the same custom watermark don't refetch on every invocation.
const _customBadgeCache = new Map<string, Image>();
async function getCustomBadgeSource(url: string): Promise<Image | null> {
  const hit = _customBadgeCache.get(url);
  if (hit) return hit;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.warn(`[watermark] custom badge fetch ${res.status} — falling back to default`);
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const decoded = await imgDecode(bytes);
    if (!(decoded instanceof Image)) {
      console.warn('[watermark] custom badge decoded as non-static — falling back');
      return null;
    }
    _customBadgeCache.set(url, decoded);
    return decoded;
  } catch (err: any) {
    console.warn(`[watermark] custom badge load failed: ${err?.message ?? err}`);
    return null;
  }
}

interface GlobalWatermarkSettings {
  imageUrl: string | null;
  opacity: number; // 0..1
  /** Superadmin-configured global size. null → fall back to per-post/profile. */
  size: WatermarkSize | null;
}

// Read the singleton app_settings row keyed 'watermark'. Returns sensible
// defaults on any error so a missing row or unreachable DB never blocks
// a publish.
async function loadGlobalWatermarkSettings(
  db: SupabaseClient,
): Promise<GlobalWatermarkSettings> {
  try {
    const { data, error } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'watermark')
      .maybeSingle();
    if (error || !data) {
      return { imageUrl: null, opacity: 1.0, size: null };
    }
    const v = (data.value ?? {}) as {
      image_url?: string | null;
      opacity?: number;
      size?: string | null;
    };
    const opacity = typeof v.opacity === 'number' && v.opacity >= 0 && v.opacity <= 1
      ? v.opacity
      : 1.0;
    const imageUrl = typeof v.image_url === 'string' && v.image_url.length > 0
      ? v.image_url
      : null;
    const size = typeof v.size === 'string' && VALID_SIZES.has(v.size as WatermarkSize)
      ? (v.size as WatermarkSize)
      : null;
    return { imageUrl, opacity, size };
  } catch {
    return { imageUrl: null, opacity: 1.0, size: null };
  }
}

// Multiply every pixel's alpha by `opacity` (0..1) in-place. Used to dial
// down the watermark visibility per the superadmin-configured global value.
function applyOpacity(img: Image, opacity: number): void {
  if (opacity >= 1.0) return;
  const data = img.bitmap as Uint8ClampedArray;
  for (let i = 3; i < data.length; i += 4) {
    data[i] = Math.round(data[i] * opacity);
  }
}

/**
 * Bake the AMOS watermark into the bottom-right corner of an image.
 *
 * - Free tier: downloads `imageUrl`, composites a flat pink badge, uploads
 *   the result to storage, returns the new signed URL.
 * - Pro+ tier: no-op, returns `imageUrl` unchanged.
 *
 * Fail-open: any error returns the original URL so publish never fails on
 * a bake issue.
 */
export async function bakeAmosWatermark(args: {
  db: SupabaseClient;
  imageUrl: string;
  userId: string;
  tier: Tier;
  /** One of the 9 grid positions. Defaults to 'top-left' when omitted. */
  position?: WatermarkPosition;
  /** Visual size of the chip. Defaults to 'medium'. */
  size?: WatermarkSize;
}): Promise<string> {
  const { db, imageUrl, userId, tier } = args;
  const position = safeWatermarkPosition(args.position);
  // `size` is resolved below — the superadmin-configured global size (from
  // app_settings) takes precedence over the per-post/profile size in args.

  if (tier !== 'free') return imageUrl;
  if (!imageUrl) return imageUrl;

  try {
    // 1. Download original image bytes (5s timeout — fail-open if slow)
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(5000) });
    if (!imgRes.ok) {
      console.warn(`[watermark] fetch ${imgRes.status} — returning original`);
      return imageUrl;
    }
    const imgBytes = new Uint8Array(await imgRes.arrayBuffer());

    // 2. Decode (Image.decode handles PNG + JPEG; throws on unsupported)
    const decoded = await Image.decode(imgBytes);
    if (!(decoded instanceof Image)) {
      console.warn('[watermark] non-static image — returning original');
      return imageUrl;
    }

    // 3. Resolve target badge dimensions from the size variant. The width
    // scales with the image (% of image width) but is clamped to a minimum
    // so tiny images still get a legible chip. Height follows the badge's
    // native aspect ratio so the source PNG isn't squished.
    const margin = Math.max(20, Math.round(decoded.width * BADGE_MARGIN_PCT));

    // 4. Resolve the badge source: superadmin-configured custom image if
    // app_settings.watermark.image_url is set, else the inlined default.
    // Aspect ratio is derived from whichever source we end up using so
    // arbitrary-aspect uploads don't get stretched.
    const globalSettings = await loadGlobalWatermarkSettings(db);
    const customSource = globalSettings.imageUrl
      ? await getCustomBadgeSource(globalSettings.imageUrl)
      : null;
    const source = customSource ?? (await getDefaultBadgeSource());
    const sourceAspect = source.height / source.width;
    // Global size (superadmin) wins; else fall back to per-post/profile size.
    const size = globalSettings.size ?? safeWatermarkSize(args.size);
    const targetW = Math.max(SIZE_MIN_W_PX[size], Math.round(decoded.width * SIZE_PCT[size]));
    const targetH = Math.round(targetW * sourceAspect);

    // Clone first so the cached source is never mutated; then resize and
    // apply the configured opacity (default 1.0 = no change).
    const badge = source.clone();
    badge.resize(targetW, targetH);
    applyOpacity(badge, globalSettings.opacity);

    // 5. Compute composite coordinates from the 9-position grid.
    // Image coords: (0,0) is top-left; (decoded.width, decoded.height) is
    // bottom-right. The badge anchor is its top-left, so we subtract badge
    // width/height for right/bottom positions and divide for center.
    const [vert, horiz] = position.split('-') as [
      'top' | 'middle' | 'bottom',
      'left' | 'center' | 'right',
    ];
    const x =
      horiz === 'left'  ? margin :
      horiz === 'right' ? decoded.width - targetW - margin :
                          Math.round((decoded.width - targetW) / 2);
    const y =
      vert === 'top'    ? margin :
      vert === 'bottom' ? decoded.height - targetH - margin :
                          Math.round((decoded.height - targetH) / 2);
    decoded.composite(badge, x, y);
    console.log(
      `[watermark] position=${position} size=${size} badge=${targetW}x${targetH} at (${x},${y}) ` +
      `img=${decoded.width}x${decoded.height} src=${customSource ? 'custom' : 'default'} opacity=${globalSettings.opacity}`,
    );

    // 5. Encode JPEG q=85
    const out = await decoded.encodeJPEG(85);

    // 6. Upload to media bucket
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const path = `branded/${userId}/${fileName}`;
    const { error: upErr } = await db.storage
      .from('media')
      .upload(path, out, { contentType: 'image/jpeg', upsert: false });
    if (upErr) {
      console.warn(`[watermark] upload failed: ${upErr.message}`);
      return imageUrl;
    }

    // 7. Sign URL (7 days)
    const { data: signData } = await db.storage
      .from('media')
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (!signData?.signedUrl) {
      console.warn('[watermark] no signed URL — returning original');
      return imageUrl;
    }

    console.log(`[watermark] baked → ${path}`);
    return signData.signedUrl;
  } catch (err: any) {
    console.warn(`[watermark] threw: ${err?.message ?? err} — returning original`);
    return imageUrl;
  }
}
