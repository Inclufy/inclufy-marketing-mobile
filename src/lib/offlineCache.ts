// src/lib/offlineCache.ts
// Minimal React Query cache persister to AsyncStorage. Closes Phase A of
// P0-5 from the baseline audit — AMOS now retains cached query results
// across cold starts, so a user on bad event-WiFi can still see their
// last-loaded captures/posts/strategy/etc.
//
// No new dependency added: this is a hand-rolled equivalent of
// @tanstack/react-query-persist-client. Trade-offs we accept for speed:
//   • Snapshot every 30s (interval) + on AppState→background. No
//     differential-write — entire cache serialised. Fine for AMOS which
//     has <2 MB of typed query data.
//   • No version-guard / GC-time-aware rehydrate. Rows older than
//     24h on rehydrate are dropped so a user who hasn't opened the app
//     in days doesn't see stale data.
//   • Mutations / pending state NOT persisted (that's Phase B —
//     mutationQueue.ts).

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

const CACHE_KEY = '@inclufy_rq_cache_v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;  // 24h
const SNAPSHOT_INTERVAL_MS = 30 * 1000;  // 30s

interface PersistedEntry {
  key: unknown[];
  data: unknown;
  dataUpdatedAt: number;
}

interface PersistedSnapshot {
  savedAt: number;
  entries: PersistedEntry[];
}

let interval: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;

export async function rehydrateOfflineCache(qc: QueryClient): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return 0;
    const snap: PersistedSnapshot = JSON.parse(raw);
    if (!snap?.entries || Date.now() - snap.savedAt > MAX_AGE_MS) return 0;
    let restored = 0;
    for (const entry of snap.entries) {
      try {
        qc.setQueryData(entry.key as any, entry.data);
        restored++;
      } catch {
        // skip individual entries that fail to deserialize
      }
    }
    return restored;
  } catch (e) {
    console.warn('[offlineCache] rehydrate failed:', e);
    return 0;
  }
}

export function startOfflineCache(qc: QueryClient): () => void {
  const snapshot = async () => {
    try {
      const cache = qc.getQueryCache();
      const queries = cache.getAll();
      const entries: PersistedEntry[] = [];
      for (const q of queries) {
        const state = q.state;
        // Only persist successful queries with actual data
        if (state.status !== 'success' || state.data === undefined) continue;
        // Skip stale (>24h)
        if (state.dataUpdatedAt && Date.now() - state.dataUpdatedAt > MAX_AGE_MS) continue;
        entries.push({
          key: q.queryKey as unknown[],
          data: state.data,
          dataUpdatedAt: state.dataUpdatedAt ?? Date.now(),
        });
      }
      const snap: PersistedSnapshot = { savedAt: Date.now(), entries };
      const serialized = JSON.stringify(snap);
      // AsyncStorage soft-cap is ~6 MB on Android; bail if we cross 4 MB
      if (serialized.length > 4 * 1024 * 1024) {
        console.warn('[offlineCache] snapshot >4MB, skipping');
        return;
      }
      await AsyncStorage.setItem(CACHE_KEY, serialized);
    } catch (e) {
      console.warn('[offlineCache] snapshot failed:', e);
    }
  };

  // Periodic snapshot
  interval = setInterval(snapshot, SNAPSHOT_INTERVAL_MS);

  // Snapshot on app backgrounding so the user's last interaction is saved
  const handleAppState = (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      void snapshot();
    }
  };
  appStateSub = AppState.addEventListener('change', handleAppState);

  return () => {
    if (interval) { clearInterval(interval); interval = null; }
    if (appStateSub) { appStateSub.remove(); appStateSub = null; }
  };
}

export async function clearOfflineCache(): Promise<void> {
  try { await AsyncStorage.removeItem(CACHE_KEY); } catch {}
}
