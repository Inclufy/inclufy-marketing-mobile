// src/components/GoalModeTile.tsx
// Goal Mode (Tier-2) home-screen tile.
//
// If no active goal:  muted CTA → tap navigates to GoalSetup wizard.
// If active goal:     orange-gradient card with progress bar, spend bar,
//                     awaiting-approval pill (links to MultiAgent filtered by
//                     goal_id), tap navigates to GoalDetail.
//
// Mirrors AgentActivityTile.tsx structure / aesthetic.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../services/supabase';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { useActiveGoal, type AgentGoal } from '../hooks/useAgentGoals';

import { CaretRight, Flag, FlagCheckered, WarningCircle } from 'phosphor-react-native';
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function formatEur(n: number): string {
  if (!Number.isFinite(n)) return '€0';
  if (n >= 1000) return `€${(n / 1000).toFixed(1)}k`;
  return `€${Math.round(n)}`;
}

const METRIC_LABEL: Record<string, { en: string; nl: string }> = {
  event_attendees: { en: 'Event attendees', nl: 'Event aanmeldingen' },
  revenue_eur:     { en: 'Revenue (EUR)',   nl: 'Omzet (EUR)' },
  posts_published: { en: 'Posts published', nl: 'Gepubliceerde posts' },
  roas:            { en: 'ROAS',            nl: 'ROAS' },
  followers:       { en: 'Followers',       nl: 'Volgers' },
};

export default function GoalModeTile() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { locale } = useTranslation();
  const isNl = locale === 'nl';

  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);

  // Resolve current org once. Same pattern as AgentDetailScreen.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (mounted) { setOrgId(null); setOrgLoading(false); } return; }
      const { data: memberRow } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (mounted) {
        setOrgId(memberRow?.organization_id ?? null);
        setOrgLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const { data: activeGoal, isLoading: goalLoading } = useActiveGoal(orgId);

  // ── Awaiting-approval count for this goal's runs ─────────────────────────
  // We pull goal_run rows for this goal and then count agent_runs whose
  // parent_run_id matches AND status='awaiting_approval'. RLS scopes to org.
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);

  const loadApprovals = useCallback(async (goal: AgentGoal | null) => {
    if (!goal) { setPendingApprovals(0); return; }
    const { data: goalRunRows } = await supabase
      .from('agent_goal_runs')
      .select('parent_run_id')
      .eq('goal_id', goal.id);
    const parentIds = (goalRunRows ?? [])
      .map((r: { parent_run_id: string | null }) => r.parent_run_id)
      .filter((v): v is string => !!v);
    if (parentIds.length === 0) { setPendingApprovals(0); return; }
    const { count } = await supabase
      .from('agent_runs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'awaiting_approval')
      .in('parent_run_id', parentIds);
    setPendingApprovals(count ?? 0);
  }, []);

  useEffect(() => {
    loadApprovals(activeGoal ?? null);
  }, [activeGoal, loadApprovals]);

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
    pendingPill: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
      backgroundColor: '#7C2D12',
      borderRadius: borderRadius.full,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    pendingText: { color: '#fff', fontSize: 10, fontWeight: fontWeight.bold },
    barRow: {
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: borderRadius.md,
      padding: spacing.sm, gap: 6,
    },
    barLabelRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
    },
    barLabel: { color: '#fff', fontSize: 11, fontWeight: fontWeight.semibold },
    barValue: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
    barTrack: {
      height: 6, borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.20)',
      overflow: 'hidden' as const,
    },
    barFillProgress: { height: '100%' as const, backgroundColor: '#FDE68A' },
    barFillSpend:    { height: '100%' as const, backgroundColor: '#F59E0B' },
    // ── Empty state (no active goal) ──
    emptyContainer: {
      borderRadius: borderRadius.lg,
      overflow: 'hidden' as const,
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1, borderColor: c.border,
      backgroundColor: c.surface,
      padding: spacing.md,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    emptyIconWrap: {
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: '#F9731620',
      justifyContent: 'center' as const, alignItems: 'center' as const,
    },
    emptyTitle: { color: c.text, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
    emptySub: { color: c.textSecondary, fontSize: 11, marginTop: 1 },
  }));

  const loading = orgLoading || goalLoading;

  // ── No org / loading ──
  if (loading) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // ── Empty state: no active goal ──
  if (!activeGoal) {
    return (
      <TouchableOpacity
        style={styles.emptyContainer}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('GoalSetup' as any)}
      >
        <View style={styles.emptyIconWrap}>
          <Flag size={18} color="#F97316" weight="regular" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.emptyTitle}>
            {isNl ? 'Stel een kwartaaldoel in' : 'Set a quarterly goal'}
          </Text>
          <Text style={styles.emptySub}>
            {isNl
              ? 'Goal Mode dispatcht agents richting één meetbaar doel.'
              : 'Goal Mode dispatches agents toward one measurable target.'}
          </Text>
        </View>
        <CaretRight size={18} color={colors.textSecondary} weight="bold" />
      </TouchableOpacity>
    );
  }

  // ── Active goal: progress + spend tile ──
  const targetValue = Number(activeGoal.target_value) || 0;
  const currentValue = Number(activeGoal.current_value) || 0;
  const progressFrac = targetValue > 0 ? clamp01(currentValue / targetValue) : 0;

  const budget = Number(activeGoal.budget_eur) || 0;
  const spent  = Number(activeGoal.spent_eur)  || 0;
  const spendFrac = budget > 0 ? clamp01(spent / budget) : 0;

  const metricLbl = METRIC_LABEL[activeGoal.metric]?.[isNl ? 'nl' : 'en'] ?? activeGoal.metric;

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.92}
      onPress={() => navigation.navigate('GoalDetail' as any, { goalId: activeGoal.id })}
    >
      <LinearGradient
        colors={['#EA580C', '#F97316']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.iconWrap}>
              <FlagCheckered size={18} color="#fff" weight="fill" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {activeGoal.title}
              </Text>
              <Text style={styles.subtitle}>{metricLbl}</Text>
            </View>
          </View>
          {pendingApprovals > 0 && (
            <TouchableOpacity
              style={styles.pendingPill}
              onPress={(e) => {
                e.stopPropagation?.();
                navigation.navigate('MultiAgent' as any, { goalId: activeGoal.id });
              }}
            >
              <WarningCircle size={11} color="#fff" weight="fill" />
              <Text style={styles.pendingText}>
                {pendingApprovals} {isNl ? 'wacht' : 'pending'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.barRow}>
          <View style={styles.barLabelRow}>
            <Text style={styles.barLabel}>
              {isNl ? 'Voortgang' : 'Progress'}
            </Text>
            <Text style={styles.barValue}>
              {Math.round(progressFrac * 100)}%
              {targetValue > 0
                ? ` (${currentValue.toLocaleString()} / ${targetValue.toLocaleString()})`
                : ''}
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFillProgress, { width: `${progressFrac * 100}%` }]} />
          </View>

          <View style={styles.barLabelRow}>
            <Text style={styles.barLabel}>
              {isNl ? 'Uitgaven' : 'Spend'}
            </Text>
            <Text style={styles.barValue}>
              {formatEur(spent)} / {formatEur(budget)}
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFillSpend, { width: `${spendFrac * 100}%` }]} />
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}
