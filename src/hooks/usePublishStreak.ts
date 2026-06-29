// src/hooks/usePublishStreak.ts
// ──────────────────────────────────────────────────────────────────────────
// Computes the user's "publish streak": consecutive days (counting backwards
// from today, in the user's local timezone) on which they published at least
// one post. Used by HomeScreenV2 to power the streak counter in the hero.
//
// Query strategy: pull the last 60 days of published_at timestamps for the
// current user, then walk back day-by-day until we hit a gap. Cached for
// 5 minutes — streak is a per-day concept, no need to thrash.
//
// "Today counts" semantics:
//   - If you published today → streak includes today (count >= 1)
//   - If you didn't publish today but did yesterday → streak still includes
//     yesterday and back, but TODAY isn't counted (we don't break the streak
//     until you go to bed without posting — i.e. we look at yesterday as the
//     anchor when today is empty)
// ──────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';

interface StreakResult {
  /** Consecutive days with at least 1 published post. 0 = streak broken. */
  current: number;
  /** Longest streak in the queried window (last 60 days). */
  longest: number;
  /** True if the user already published TODAY (for "you're on fire" copy). */
  todayDone: boolean;
}

const LOOKBACK_DAYS = 60;

function dateKey(iso: string): string {
  // Local-date key (YYYY-MM-DD in user's TZ) for grouping
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayKey(): string {
  return dateKey(new Date().toISOString());
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d.toISOString());
}

export function usePublishStreak() {
  return useQuery<StreakResult>({
    queryKey: ['publish-streak'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return { current: 0, longest: 0, todayDone: false };

      const since = new Date();
      since.setDate(since.getDate() - LOOKBACK_DAYS);

      const { data, error } = await supabase
        .from('go_posts')
        .select('published_at')
        .eq('user_id', user.id)
        .eq('status', 'published')
        .not('published_at', 'is', null)
        .gte('published_at', since.toISOString())
        .order('published_at', { ascending: false });

      if (error || !data) return { current: 0, longest: 0, todayDone: false };

      // Bucket by local day
      const days = new Set<string>();
      for (const row of data) {
        const iso = (row as any).published_at as string | null;
        if (iso) days.add(dateKey(iso));
      }

      const today = todayKey();
      const yest  = yesterdayKey();
      const todayDone = days.has(today);

      // Walk back from anchor day (today if posted today, else yesterday)
      let cursor = new Date();
      if (!todayDone && days.has(yest)) cursor.setDate(cursor.getDate() - 1);

      let current = 0;
      // Hard cap at LOOKBACK_DAYS so we don't loop forever on a malformed dataset
      for (let i = 0; i < LOOKBACK_DAYS; i++) {
        const k = dateKey(cursor.toISOString());
        if (!days.has(k)) break;
        current += 1;
        cursor.setDate(cursor.getDate() - 1);
      }

      // Longest streak in the window: scan sorted day keys
      const sorted = Array.from(days).sort((a, b) => a.localeCompare(b));
      let longest = 0;
      let run = 0;
      let prev: string | null = null;
      for (const k of sorted) {
        if (!prev) { run = 1; prev = k; continue; }
        const prevDate = new Date(prev);
        prevDate.setDate(prevDate.getDate() + 1);
        const expected = dateKey(prevDate.toISOString());
        if (k === expected) { run += 1; }
        else { longest = Math.max(longest, run); run = 1; }
        prev = k;
      }
      longest = Math.max(longest, run, current);

      return { current, longest, todayDone };
    },
  });
}
