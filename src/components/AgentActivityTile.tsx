// src/components/AgentActivityTile.tsx
// Tier-1 #2 — Dashboard Activity Tile.
//
// Shows on HomeScreen so the multi-agent system gets daily visibility:
//   • # runs awaiting approval (taps → MultiAgent screen)
//   • # blocked runs today (cap / kill-switch hits)
//   • cumulative token spend today across all agents
//
// Read-only; relies on RLS on agent_runs to scope to the current user's org.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../services/supabase';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';

import { Robot, WarningCircle } from 'phosphor-react-native';
interface Stats {
  awaitingApproval: number;
  blockedToday: number;
  tokensToday: number;
  costUsdToday: number;
}

export default function AgentActivityTile() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { locale } = useTranslation();
  const isNl = locale === 'nl';

  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const [{ count: awaitingApproval }, { data: todayRuns }] = await Promise.all([
      supabase
        .from('agent_runs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'awaiting_approval'),
      supabase
        .from('agent_runs')
        .select('status, prompt_tokens, completion_tokens, cost_usd')
        .gte('created_at', todayStart.toISOString()),
    ]);

    const blockedToday = (todayRuns ?? []).filter(r => r.status === 'blocked').length;
    const tokensToday  = (todayRuns ?? []).reduce(
      (s, r: any) => s + (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0), 0,
    );
    const costUsdToday = (todayRuns ?? []).reduce(
      (s, r: any) => s + Number(r.cost_usd ?? 0), 0,
    );

    setStats({
      awaitingApproval: awaitingApproval ?? 0,
      blockedToday,
      tokensToday,
      costUsdToday,
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const styles = useThemedStyles((c) => ({
    container: {
      borderRadius: borderRadius.lg,
      overflow: 'hidden' as const,
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1, borderColor: c.border,
    },
    gradient: { padding: spacing.md, gap: spacing.sm },
    headerRow: {
      flexDirection: 'row' as const, alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    },
    headerLeft: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm,
    },
    iconWrap: {
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.18)',
      justifyContent: 'center' as const, alignItems: 'center' as const,
    },
    title: { color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.bold },
    subtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 11 },
    statsRow: {
      flexDirection: 'row' as const, marginTop: spacing.xs,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: borderRadius.md, padding: spacing.sm,
    },
    statCell: { flex: 1, alignItems: 'center' as const },
    statValue: { color: '#fff', fontSize: fontSize.lg, fontWeight: fontWeight.bold },
    statLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 9, textAlign: 'center' as const, marginTop: 2 },
    pendingPill: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
      backgroundColor: '#F59E0B',
      borderRadius: borderRadius.full,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    pendingText: { color: '#fff', fontSize: 10, fontWeight: fontWeight.bold },
  }));

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.92}
      onPress={() => navigation.navigate('MultiAgent' as any)}
    >
      <LinearGradient
        colors={['#7E22CE', '#9333EA', '#A855F7']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.iconWrap}>
              <Robot size={18} color="#fff" weight="duotone" />
            </View>
            <View>
              <Text style={styles.title}>
                {isNl ? 'Multi-Agent Systeem' : 'Multi-Agent System'}
              </Text>
              <Text style={styles.subtitle}>
                {isNl ? 'Tik om alle agents te beheren' : 'Tap to manage all agents'}
              </Text>
            </View>
          </View>
          {!!stats?.awaitingApproval && stats.awaitingApproval > 0 && (
            <View style={styles.pendingPill}>
              <WarningCircle size={11} color="#fff" weight="fill" />
              <Text style={styles.pendingText}>
                {stats.awaitingApproval} {isNl ? 'wacht' : 'pending'}
              </Text>
            </View>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{stats?.awaitingApproval ?? 0}</Text>
              <Text style={styles.statLabel}>{isNl ? 'Wacht op goedkeuring' : 'Awaiting approval'}</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{stats?.blockedToday ?? 0}</Text>
              <Text style={styles.statLabel}>{isNl ? 'Geblokkeerd vandaag' : 'Blocked today'}</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>
                {(stats?.tokensToday ?? 0) >= 1000
                  ? `${((stats?.tokensToday ?? 0) / 1000).toFixed(1)}k`
                  : (stats?.tokensToday ?? 0).toString()}
              </Text>
              <Text style={styles.statLabel}>{isNl ? 'Tokens vandaag' : 'Tokens today'}</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>${(stats?.costUsdToday ?? 0).toFixed(2)}</Text>
              <Text style={styles.statLabel}>{isNl ? 'Kosten vandaag' : 'Cost today'}</Text>
            </View>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}
