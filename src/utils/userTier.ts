/**
 * User tier feature gate helper — mobile.
 *
 * Single source of truth for which tier unlocks which feature in the
 * AMOS app. Server-side mirror is in supabase/functions/boost-post and
 * the public.tier_features view (see migration 20260508230000).
 *
 * Read pattern:
 *   const { tier } = useUserTier();
 *   if (canBoostMeta(tier)) showBoostButton();
 *
 * Tier hierarchy (ascending):
 *   free → pro → promote → ads → enterprise
 *
 * Bridges marketing.inclufy.com Stripe billing with AMOS code: the
 * Stripe webhook on the marketing site updates profiles.tier; AMOS
 * reads it via the useUserTier hook below.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';

export type Tier = 'free' | 'pro' | 'promote' | 'ads' | 'enterprise';

const TIER_ORDER: Record<Tier, number> = {
  free: 0,
  pro: 1,
  promote: 2,
  ads: 3,
  enterprise: 4,
};

/** True if the user's tier is at least the required tier. */
export function tierAtLeast(userTier: Tier | null | undefined, required: Tier): boolean {
  if (!userTier) return false;
  return TIER_ORDER[userTier] >= TIER_ORDER[required];
}

// ─── Feature gates ──────────────────────────────────────────────────
// Keep these grouped so it's easy to scan what each tier unlocks.

export function canBoostMeta(tier: Tier | null | undefined): boolean {
  return tierAtLeast(tier, 'promote');
}

export function canBoostMultiChannel(tier: Tier | null | undefined): boolean {
  // TikTok / LinkedIn / Pinterest ads (not just Meta)
  return tierAtLeast(tier, 'ads');
}

export function canWhiteLabel(tier: Tier | null | undefined): boolean {
  return tierAtLeast(tier, 'enterprise');
}

/**
 * True when the user's tier allows hiding the "AMOS · by Inclufy" watermark
 * from published photos/videos. Free tier always carries the watermark as a
 * brand-visibility lever AND as a freemium upgrade-driver. Pro and above
 * publish without it.
 *
 * Visual contract: see src/components/AmosWatermark.tsx (rendered inside
 * the ViewShot that bakes the overlay before publish — so the watermark
 * is permanently composited into the uploaded image, not a runtime overlay
 * that can be screenshot'd around).
 */
export function canHideWatermark(tier: Tier | null | undefined): boolean {
  return tierAtLeast(tier, 'pro');
}

export function platformsLimit(tier: Tier | null | undefined): number {
  switch (tier) {
    case 'free': return 1;
    case 'pro': case 'promote': return 6;
    case 'ads': case 'enterprise': return 8;
    default: return 1;
  }
}

export function postsPerMonthLimit(tier: Tier | null | undefined): number {
  // -1 = unlimited.
  // DEPRECATED: replaced by postsPerDayLimit below. Kept here so any external
  // pricing pages that imported this still compile. Use postsPerDayLimit in
  // new enforcement paths.
  return -1;
}

/**
 * Daily publish cap per user. Free tier is allowed 1 unique post per
 * rolling 24 hours; paid tiers are unlimited. Enforced client-side in
 * PostReviewScreen.doPublish (DB count of distinct post rows where
 * status='published' AND published_at >= now()-24h). Should be mirrored
 * server-side in publish-social to prevent custom-client bypass.
 *
 * Counter semantics: counts the post row, NOT the per-channel fanout.
 * So one post fanned out to 3 channels = 1 toward the daily cap. This
 * lets free users experience the cross-channel USP within the cap.
 */
export function postsPerDayLimit(tier: Tier | null | undefined): number {
  return tier === 'free' ? 1 : -1;
}

/**
 * Maximum number of channels a single post can fan out to. Free users
 * get 3 — enough to see the cross-channel USP (capture once → LinkedIn
 * + IG + FB) without paying. Paid tiers get unlimited so an enterprise
 * user can push to 8+ platforms in one go.
 *
 * Enforcement TODO: filter the "publish to multiple" account picker so
 * a free user can select at most 3 accounts in one publish action.
 */
export function channelsPerPostLimit(tier: Tier | null | undefined): number {
  return tier === 'free' ? 3 : -1;
}

export function boostsIncludedPerMonth(tier: Tier | null | undefined): number {
  // -1 = unlimited
  switch (tier) {
    case 'promote': return 1;
    case 'ads': return 5;
    case 'enterprise': return -1;
    default: return 0;
  }
}

// ─── React hook ─────────────────────────────────────────────────────

interface UseUserTierResult {
  tier: Tier;
  loading: boolean;
  commissionPct: number;
  /** Refetch — useful after Stripe webhook lag. Returns a Promise (react-query)
   *  so callers can `await` it before reflecting the fresh tier. */
  refetch: () => Promise<unknown>;
}

/**
 * Reads tier + commission_pct from profiles row for current user.
 * Cached for 60s to avoid hammering DB on every component re-render.
 */
export function useUserTier(): UseUserTierResult {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['user-tier'],
    queryFn: async (): Promise<{ tier: Tier; commission_pct: number }> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { tier: 'free', commission_pct: 0 };
      const { data: profile } = await supabase
        .from('profiles')
        .select('tier, commission_pct')
        .eq('id', user.id)
        .maybeSingle();
      return {
        tier: (profile?.tier ?? 'free') as Tier,
        commission_pct: profile?.commission_pct ?? 0,
      };
    },
    staleTime: 60_000,
  });

  return {
    tier: data?.tier ?? 'free',
    commissionPct: data?.commission_pct ?? 0,
    loading: isLoading,
    refetch,
  };
}
