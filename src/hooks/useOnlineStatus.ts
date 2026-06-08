// src/hooks/useOnlineStatus.ts
// Lightweight online-status detector for AMOS. Phase C of P0-5.
//
// No @react-native-community/netinfo dep — we ping Supabase's /auth/v1
// endpoint every 15s and on AppState→active. Cheap (~200 B), accurate
// enough for the SyncStatusBadge use-case. NetInfo would be more accurate
// but requires adding the package + relinking.

import { useEffect, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;
const HEARTBEAT_URL = 'https://mpxkugfqzmxydxnlxqoj.supabase.co/auth/v1/health';

export interface OnlineStatus {
  isOnline: boolean;
  lastCheckedAt: number;
  consecutiveFailures: number;
}

export function useOnlineStatus(): OnlineStatus {
  const [status, setStatus] = useState<OnlineStatus>({
    isOnline: true,        // optimistic start — first failed query will flip
    lastCheckedAt: 0,
    consecutiveFailures: 0,
  });

  const check = useCallback(async () => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), HEARTBEAT_TIMEOUT_MS);
    try {
      const res = await fetch(HEARTBEAT_URL, { method: 'GET', signal: ac.signal });
      const ok = res.ok || res.status === 401;  // 401 still means we're online
      setStatus((prev) => ({
        isOnline: ok,
        lastCheckedAt: Date.now(),
        consecutiveFailures: ok ? 0 : prev.consecutiveFailures + 1,
      }));
    } catch {
      setStatus((prev) => ({
        isOnline: false,
        lastCheckedAt: Date.now(),
        consecutiveFailures: prev.consecutiveFailures + 1,
      }));
    } finally {
      clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    void check();
    const interval = setInterval(check, HEARTBEAT_INTERVAL_MS);

    const onAppState = (s: AppStateStatus) => {
      if (s === 'active') void check();
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [check]);

  return status;
}
