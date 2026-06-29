// src/components/SyncStatusBadge.tsx
// Header indicator that shows offline / pending-writes / synced status.
// Drop into any screen header alongside NotificationBell.
//
// States:
//   • online + queue empty       → not rendered (silent)
//   • online + queue > 0         → spinner + "Syncing N…"
//   • offline + queue empty      → wifi-off icon + "Offline"
//   • offline + queue > 0        → wifi-off icon + "Offline (N pending)"
//
// Closes Phase C of P0-5 — the user sees their offline state instead of
// silently losing writes.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { getQueueSize, flushQueue } from '../lib/mutationQueue';
import { useTheme } from '../context/ThemeContext';

export function SyncStatusBadge() {
  const { colors } = useTheme();
  const { isOnline } = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const n = await getQueueSize();
      if (alive) setPending(n);
    };
    refresh();
    const id = setInterval(() => { void refresh(); }, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Auto-flush when online + queue has items + not already syncing
  useEffect(() => {
    if (!isOnline || pending === 0 || syncing) return;
    setSyncing(true);
    flushQueue()
      .then(async () => { setPending(await getQueueSize()); })
      .catch((e) => console.warn('[SyncStatusBadge] flush failed:', e))
      .finally(() => setSyncing(false));
  }, [isOnline, pending, syncing]);

  // Silent when everything's clean
  if (isOnline && pending === 0 && !syncing) return null;

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: isOnline
        ? colors.surface
        : (colors as any).warning + '20' || 'rgba(217,119,6,0.15)',
    },
    text: {
      fontSize: 11,
      fontWeight: '600',
      color: isOnline ? colors.text : colors.warning,
    },
  });

  return (
    <View style={styles.container}>
      {syncing ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons
          name={isOnline ? 'cloud-upload-outline' : 'cloud-offline-outline'}
          size={14}
          color={isOnline ? colors.primary : colors.warning}
        />
      )}
      <Text style={styles.text}>
        {!isOnline
          ? (pending > 0 ? `Offline (${pending} wachtend)` : 'Offline')
          : `Synct ${pending}…`}
      </Text>
    </View>
  );
}
