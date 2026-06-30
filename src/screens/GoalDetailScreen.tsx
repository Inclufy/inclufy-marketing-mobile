// src/screens/GoalDetailScreen.tsx
// Goal Mode (Tier-2) — read-only goal detail view.
//
// Mirrors AgentDetailScreen.tsx structure: gradient header (status-coloured)
// + section list. Uses react-native-svg for the metric ring (already in
// package.json so no new deps).
//
// Backed by:
//   - public.agent_goals
//   - public.agent_goal_runs
//   - public.agent_runs            (children, joined via parent_run_id)
//   - edge fn: orchestrator         (POST /run_goals — admin/owner only)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Platform, StatusBar, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { supabase } from '../services/supabase';
import type { RootStackParamList } from '../types';
import { CaretLeft, FlagCheckered } from 'phosphor-react-native';
import {
  useGoal, useGoalRuns, useTransitionGoal, useRunGoalsNow, useOrgRole,
  type GoalStatus, type AgentGoal,
} from '../hooks/useAgentGoals';

type Rt = RouteProp<RootStackParamList, 'GoalDetail'>;

interface ChildRun {
  id: string;
  goal: string;
  status: string;
  parent_run_id: string | null;
  created_at: string;
  finished_at: string | null;
}

const STATUS_THEME: Record<GoalStatus, { color: string; gradient: [string, string]; label: { en: string; nl: string } }> = {
  draft:    { color: '#64748B', gradient: ['#475569', '#64748B'], label: { en: 'Draft',    nl: 'Concept' } },
  active:   { color: '#F97316', gradient: ['#EA580C', '#F97316'], label: { en: 'Active',   nl: 'Actief' } },
  paused:   { color: '#64748B', gradient: ['#334155', '#64748B'], label: { en: 'Paused',   nl: 'Gepauzeerd' } },
  met:      { color: '#10B981', gradient: ['#047857', '#10B981'], label: { en: 'Met',      nl: 'Behaald' } },
  missed:   { color: '#EF4444', gradient: ['#991B1B', '#EF4444'], label: { en: 'Missed',   nl: 'Niet behaald' } },
  archived: { color: '#9CA3AF', gradient: ['#6B7280', '#9CA3AF'], label: { en: 'Archived', nl: 'Gearchiveerd' } },
};

const METRIC_LABEL: Record<string, { en: string; nl: string }> = {
  event_attendees: { en: 'Event attendees', nl: 'Event aanmeldingen' },
  revenue_eur:     { en: 'Revenue (EUR)',   nl: 'Omzet (EUR)' },
  posts_published: { en: 'Posts published', nl: 'Gepubliceerde posts' },
  roas:            { en: 'ROAS',            nl: 'ROAS' },
  followers:       { en: 'Followers',       nl: 'Volgers' },
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function daysLeft(periodEnd: string): number {
  const end = new Date(periodEnd + 'T23:59:59');
  const now = new Date();
  const ms = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function dateLabel(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString();
  } catch { return iso; }
}

// Metric progress ring rendered with react-native-svg.
function MetricRing({ progress, color, size = 140 }: { progress: number; color: string; size?: number }) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = circ * clamp01(progress);
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(0,0,0,0.08)"
        strokeWidth={stroke}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

export default function GoalDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<Rt>();
  const { goalId } = route.params;
  const { colors } = useTheme();
  const { locale } = useTranslation();
  const isNl = locale === 'nl';

  const { data: goal, isLoading: goalLoading, refetch: refetchGoal } = useGoal(goalId);
  const { data: runs, isLoading: runsLoading, refetch: refetchRuns } = useGoalRuns(goalId, 30);
  const { data: role } = useOrgRole(goal?.organization_id);

  const transitionGoal = useTransitionGoal();
  const runGoalsNow = useRunGoalsNow();

  const [refreshing, setRefreshing] = useState(false);
  const [childRuns, setChildRuns] = useState<ChildRun[]>([]);
  const [childLoading, setChildLoading] = useState(false);

  const isAdminOrOwner = role === 'admin' || role === 'owner';

  const parentRunIds = useMemo(
    () => (runs ?? []).map((r) => r.parent_run_id).filter((v): v is string => !!v),
    [runs],
  );

  // Pull the agent_runs whose parent_run_id traces back to this goal.
  const loadChildren = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setChildRuns([]); return; }
    setChildLoading(true);
    const { data } = await supabase
      .from('agent_runs')
      .select('id, goal, status, parent_run_id, created_at, finished_at')
      .in('parent_run_id', ids)
      .order('created_at', { ascending: false });
    setChildRuns((data as ChildRun[] | null) ?? []);
    setChildLoading(false);
  }, []);

  useEffect(() => { loadChildren(parentRunIds); }, [parentRunIds, loadChildren]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchGoal(), refetchRuns()]);
    await loadChildren(parentRunIds);
    setRefreshing(false);
  }, [refetchGoal, refetchRuns, loadChildren, parentRunIds]);

  // ── Action handlers ──
  const doTransition = useCallback((newStatus: GoalStatus, label: string) => {
    if (!goal) return;
    Alert.alert(
      isNl ? 'Bevestig' : 'Confirm',
      isNl ? `Doel ${label.toLowerCase()}?` : `${label} this goal?`,
      [
        { text: isNl ? 'Annuleren' : 'Cancel', style: 'cancel' },
        {
          text: label,
          onPress: async () => {
            try {
              await transitionGoal.mutateAsync({ goalId: goal.id, newStatus });
              await refetchGoal();
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Transition failed');
            }
          },
        },
      ],
    );
  }, [goal, isNl, transitionGoal, refetchGoal]);

  const doRunNow = useCallback(async () => {
    if (!goal) return;
    try {
      await runGoalsNow.mutateAsync({ goalId: goal.id });
      await Promise.all([refetchGoal(), refetchRuns()]);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Run failed');
    }
  }, [goal, runGoalsNow, refetchGoal, refetchRuns]);

  // ── Styles ──
  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      paddingTop: Platform.OS === 'ios' ? 52 : (StatusBar.currentHeight || 24) + 12,
      paddingBottom: spacing.lg, paddingHorizontal: spacing.md,
    },
    navRow: {
      flexDirection: 'row' as const, alignItems: 'center' as const,
      justifyContent: 'space-between' as const, marginBottom: spacing.md,
    },
    backBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2, padding: 8 },
    backLabel: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.medium },
    headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: '#fff' },
    headerSubtitle: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.78)', marginTop: spacing.xs, lineHeight: 20 },
    statusPill: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: borderRadius.full,
      paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' as const,
    },
    statusPillText: { color: '#fff', fontSize: 11, fontWeight: fontWeight.bold },
    section: { padding: spacing.md, gap: spacing.sm },
    sectionTitle: {
      fontSize: fontSize.md, fontWeight: fontWeight.bold,
      color: c.text, marginBottom: spacing.xs,
    },
    card: {
      backgroundColor: c.surface, borderRadius: borderRadius.lg,
      padding: spacing.md, borderWidth: 1, borderColor: c.border,
    },
    ringWrap: { alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.md },
    ringOverlay: {
      position: 'absolute' as const,
      alignItems: 'center' as const, justifyContent: 'center' as const,
    },
    ringValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text },
    ringLabel: { fontSize: 11, color: c.textSecondary, marginTop: 2 },
    statsRow: {
      flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.xs,
    },
    statTile: {
      flex: 1, backgroundColor: c.surface,
      borderRadius: borderRadius.md, borderWidth: 1, borderColor: c.border,
      padding: spacing.sm, alignItems: 'center' as const,
    },
    statValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: c.text },
    statLabel: { fontSize: 10, color: c.textSecondary, marginTop: 2, textAlign: 'center' as const },
    timelineRow: {
      flexDirection: 'row' as const, justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const, paddingVertical: spacing.xs,
      borderBottomWidth: 1, borderBottomColor: c.border, gap: spacing.sm,
    },
    timelineDate: { fontSize: fontSize.sm, color: c.text, fontWeight: fontWeight.medium, flex: 1 },
    timelineMeta: { fontSize: 11, color: c.textSecondary, textAlign: 'right' as const },
    childRunRow: {
      flexDirection: 'row' as const, justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const, paddingVertical: spacing.xs,
      borderBottomWidth: 1, borderBottomColor: c.border, gap: spacing.sm,
    },
    childRunGoal: { color: c.text, fontSize: fontSize.sm, flex: 1 },
    childRunStatus: { fontSize: 10, color: c.textSecondary },
    btnRow: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.sm },
    btn: {
      flex: 1, borderWidth: 1, borderColor: c.border,
      borderRadius: borderRadius.md, paddingVertical: spacing.sm,
      alignItems: 'center' as const,
    },
    btnPrimary: { backgroundColor: '#F97316', borderColor: '#F97316' },
    btnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: c.text },
    btnTextPrimary: { color: '#fff' },
    emptyText: { color: c.textSecondary, fontSize: fontSize.sm, fontStyle: 'italic' as const },
  }));

  // Group child runs by day for the section under the timeline.
  // NB: declared before the early return below so this hook runs on EVERY
  // render (rules-of-hooks). childRuns is independent of `goal`, so moving it
  // up is behaviour-preserving and fixes the "rendered fewer hooks" crash that
  // hit when `goal` went from undefined → loaded.
  const childByDay = useMemo(() => {
    const map = new Map<string, ChildRun[]>();
    for (const r of childRuns) {
      const day = (r.created_at ?? '').slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [childRuns]);

  if (goalLoading || !goal) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        {goalLoading
          ? <ActivityIndicator color={colors.primary} />
          : (
            <View style={{ padding: spacing.lg, alignItems: 'center' }}>
              <Text style={styles.emptyText}>
                {isNl ? 'Doel niet gevonden.' : 'Goal not found.'}
              </Text>
              <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.btn, { marginTop: spacing.md, paddingHorizontal: spacing.lg }]}>
                <Text style={styles.btnText}>{isNl ? 'Terug' : 'Back'}</Text>
              </TouchableOpacity>
            </View>
          )}
      </View>
    );
  }

  const theme = STATUS_THEME[goal.status];
  const target = Number(goal.target_value) || 0;
  const current = Number(goal.current_value) || 0;
  const progressFrac = target > 0 ? clamp01(current / target) : 0;
  const budget = Number(goal.budget_eur) || 0;
  const spent  = Number(goal.spent_eur)  || 0;

  const metricLbl = METRIC_LABEL[goal.metric]?.[isNl ? 'nl' : 'en'] ?? goal.metric;

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        <LinearGradient colors={theme.gradient} style={styles.header}>
          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <CaretLeft size={20} color="#fff" weight="bold" />
              <Text style={styles.backLabel}>{isNl ? 'Terug' : 'Back'}</Text>
            </TouchableOpacity>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.statusPill}>
            <FlagCheckered size={11} color="#fff" weight="fill" />
            <Text style={styles.statusPillText}>{theme.label[isNl ? 'nl' : 'en']}</Text>
          </View>
          <Text style={[styles.headerTitle, { marginTop: spacing.xs }]}>{goal.title}</Text>
          <Text style={styles.headerSubtitle}>{metricLbl} · {goal.period_start} → {goal.period_end}</Text>
        </LinearGradient>

        {/* ── Metric ring ── */}
        <View style={styles.section}>
          <View style={styles.card}>
            <View style={styles.ringWrap}>
              <MetricRing progress={progressFrac} color={theme.color} />
              <View style={[styles.ringOverlay, { width: 140, height: 140 }]}>
                <Text style={styles.ringValue}>{Math.round(progressFrac * 100)}%</Text>
                <Text style={styles.ringLabel}>
                  {current.toLocaleString()} / {target.toLocaleString()}
                </Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statTile}>
                <Text style={styles.statValue}>
                  €{Math.round(spent).toLocaleString()} / €{Math.round(budget).toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>
                  {isNl ? 'Uitgaven / budget' : 'Spend / budget'}
                </Text>
              </View>
              <View style={styles.statTile}>
                <Text style={styles.statValue}>{daysLeft(goal.period_end)}</Text>
                <Text style={styles.statLabel}>
                  {isNl ? 'Dagen resterend' : 'Days left'}
                </Text>
              </View>
            </View>

            {isAdminOrOwner && (
              <View style={styles.btnRow}>
                {goal.status === 'active' && (
                  <TouchableOpacity
                    style={styles.btn}
                    onPress={() => doTransition('paused', isNl ? 'Pauzeer' : 'Pause')}
                  >
                    <Text style={styles.btnText}>{isNl ? 'Pauzeer' : 'Pause'}</Text>
                  </TouchableOpacity>
                )}
                {goal.status === 'paused' && (
                  <TouchableOpacity
                    style={styles.btn}
                    onPress={() => doTransition('active', isNl ? 'Hervat' : 'Resume')}
                  >
                    <Text style={styles.btnText}>{isNl ? 'Hervat' : 'Resume'}</Text>
                  </TouchableOpacity>
                )}
                {(goal.status === 'paused' || goal.status === 'met' || goal.status === 'missed') && (
                  <TouchableOpacity
                    style={styles.btn}
                    onPress={() => doTransition('archived', isNl ? 'Archiveer' : 'Archive')}
                  >
                    <Text style={styles.btnText}>{isNl ? 'Archiveer' : 'Archive'}</Text>
                  </TouchableOpacity>
                )}
                {goal.status === 'active' && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary, runGoalsNow.isPending && { opacity: 0.6 }]}
                    disabled={runGoalsNow.isPending}
                    onPress={doRunNow}
                  >
                    {runGoalsNow.isPending
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={[styles.btnText, styles.btnTextPrimary]}>
                          {isNl ? 'Nu evalueren' : 'Run now'}
                        </Text>}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>

        {/* ── Daily eval timeline ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isNl ? 'Dagelijkse evaluaties' : 'Daily evaluations'}
          </Text>
          <View style={styles.card}>
            {runsLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (runs ?? []).length === 0 ? (
              <Text style={styles.emptyText}>
                {isNl
                  ? 'Nog geen evaluaties. De cron draait elke dag om 04:00 UTC.'
                  : 'No evaluations yet. The cron runs daily at 04:00 UTC.'}
              </Text>
            ) : (
              (runs ?? []).map((r) => {
                const dispatched = Array.isArray(r.actions_dispatched) ? r.actions_dispatched.length : 0;
                const gap = r.gap_to_target;
                return (
                  <TouchableOpacity
                    key={r.id}
                    activeOpacity={0.6}
                    disabled={!r.parent_run_id}
                    onPress={() => r.parent_run_id && navigation.navigate('AgentRunDetail', { runId: r.parent_run_id })}
                    style={styles.timelineRow}
                  >
                    <Text style={styles.timelineDate}>{dateLabel(r.evaluated_at)}</Text>
                    <Text style={styles.timelineMeta}>
                      {gap != null ? `${isNl ? 'gat' : 'gap'}: ${Number(gap).toLocaleString()} · ` : ''}
                      {dispatched} {isNl ? 'acties' : 'actions'}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>

        {/* ── Child agent_runs grouped by day ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isNl ? 'Verzonden agent-acties' : 'Dispatched agent actions'}
          </Text>
          <View style={styles.card}>
            {childLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : childByDay.length === 0 ? (
              <Text style={styles.emptyText}>
                {isNl ? 'Geen kinderacties.' : 'No child actions.'}
              </Text>
            ) : (
              childByDay.map(([day, items]) => (
                <View key={day} style={{ marginBottom: spacing.sm }}>
                  <Text style={[styles.timelineDate, { marginBottom: 4 }]}>{day}</Text>
                  {items.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      activeOpacity={0.6}
                      onPress={() => navigation.navigate('AgentRunDetail', { runId: r.id })}
                      style={styles.childRunRow}
                    >
                      <Text style={styles.childRunGoal} numberOfLines={2}>{r.goal || '(no goal)'}</Text>
                      <Text style={styles.childRunStatus}>{r.status}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))
            )}
          </View>
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

// Suppress unused-var warning for AgentGoal — surfaced to keep type-availability tidy.
export type { AgentGoal };
