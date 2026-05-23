// src/screens/AgentDetailScreen.tsx
// Agent detail — shows the registered agent for the current org and the most
// recent agent_runs. Reachable from MultiAgentScreen by tapping a card.
//
// Backed by:
//   - public.agents               (this org × kind)
//   - public.agent_runs           (last 20 runs)
//   - edge fn: orchestrator        (POST /dispatch, /approve)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Platform, StatusBar, Alert, Switch, TextInput,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { supabase } from '../services/supabase';
import { RootStackParamList } from '../types';

import { CaretLeft } from 'phosphor-react-native';
type AgentKind = 'content' | 'social' | 'ads' | 'analytics' | 'lead';

interface AgentRow {
  id: string;
  kind: AgentKind;
  name: string;
  description: string;
  status: 'active' | 'beta' | 'coming' | 'paused' | 'disabled';
  config: Record<string, unknown>;
  capabilities: string[];
}

interface RunRow {
  id: string;
  agent_id: string;
  parent_run_id: string | null;
  goal: string;
  status:
    | 'queued' | 'running' | 'awaiting_approval'
    | 'completed' | 'failed' | 'cancelled' | 'blocked';
  requires_approval: boolean;
  created_at: string;
  finished_at: string | null;
}

const AGENT_THEME: Record<AgentKind, { color: string; gradient: [string, string]; icon: string; iconLib: 'ion' | 'mci' }> = {
  content:   { color: '#3B82F6', gradient: ['#1D4ED8', '#3B82F6'], icon: 'create-outline',     iconLib: 'ion' },
  social:    { color: '#EC4899', gradient: ['#BE185D', '#EC4899'], icon: 'share-social-outline', iconLib: 'ion' },
  ads:       { color: '#FF6B35', gradient: ['#C2410C', '#FF6B35'], icon: 'megaphone-outline',   iconLib: 'ion' },
  analytics: { color: '#10B981', gradient: ['#047857', '#10B981'], icon: 'chart-line',          iconLib: 'mci' },
  lead:      { color: '#F59E0B', gradient: ['#B45309', '#F59E0B'], icon: 'people-outline',      iconLib: 'ion' },
};

const STATUS_LABEL: Record<RunRow['status'], { en: string; nl: string; color: string }> = {
  queued:             { en: 'Queued',             nl: 'In wachtrij',     color: '#64748B' },
  running:            { en: 'Running',            nl: 'Bezig',           color: '#3B82F6' },
  awaiting_approval:  { en: 'Awaiting approval',  nl: 'Wacht op goedkeuring', color: '#F59E0B' },
  completed:          { en: 'Completed',          nl: 'Voltooid',        color: '#10B981' },
  failed:             { en: 'Failed',             nl: 'Mislukt',         color: '#EF4444' },
  cancelled:          { en: 'Cancelled',          nl: 'Geannuleerd',     color: '#94A3B8' },
  blocked:            { en: 'Blocked',            nl: 'Geblokkeerd',     color: '#71717A' },
};

export default function AgentDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'AgentDetail'>>();
  const { agentKind } = route.params;
  const { colors } = useTheme();
  const { locale } = useTranslation();
  const isNl = locale === 'nl';

  const theme = AGENT_THEME[agentKind];
  const [orgId, setOrgId] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentRow | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Kill switch + budget cap (Tier-1 #3) — local edit state ──────────
  const [paused, setPaused] = useState(false);
  const [dailyTokenCap, setDailyTokenCap] = useState('');
  const [dailySpendCapEur, setDailySpendCapEur] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  const loadData = useCallback(async () => {
    // Resolve current user's org. The Marketing app stores the active org in
    // organization_members; we take the first row for now (matches existing
    // pattern in OpportunityFeedScreen et al.).
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: memberRow } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    const resolvedOrg = memberRow?.organization_id ?? null;
    setOrgId(resolvedOrg);
    if (!resolvedOrg) { setLoading(false); return; }

    const [{ data: agentRow }, { data: runRows }] = await Promise.all([
      supabase
        .from('agents')
        .select('id, kind, name, description, status, config, capabilities')
        .eq('organization_id', resolvedOrg)
        .eq('kind', agentKind)
        .maybeSingle(),
      supabase
        .from('agent_runs')
        .select('id, agent_id, parent_run_id, goal, status, requires_approval, created_at, finished_at')
        .eq('organization_id', resolvedOrg)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (agentRow) {
      const cfg = (agentRow.config as Record<string, unknown>) ?? {};
      setAgent({
        ...agentRow,
        capabilities: Array.isArray(agentRow.capabilities) ? agentRow.capabilities : [],
        config: cfg,
      });
      // Hydrate the kill-switch / cap inputs from persisted config.
      setPaused(Boolean(cfg.paused));
      setDailyTokenCap(cfg.daily_token_cap != null ? String(cfg.daily_token_cap) : '');
      setDailySpendCapEur(cfg.daily_spend_cap_eur != null ? String(cfg.daily_spend_cap_eur) : '');
    }
    // Filter runs to ones for THIS agent only. The earlier `|| r.parent_run_id != null`
    // clause leaked every other agent's child runs into this screen (BUG-2026-11).
    setRuns((runRows ?? []).filter(r => r.agent_id === agentRow?.id));
    setLoading(false);
  }, [agentKind]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const dispatchTestRun = useCallback(async () => {
    if (!orgId || !agent) return;
    if (agent.status === 'coming' || agent.status === 'disabled') {
      Alert.alert(
        isNl ? 'Agent nog niet actief' : 'Agent not active',
        isNl
          ? `${agent.name} is nog niet beschikbaar (status: ${agent.status}).`
          : `${agent.name} is not yet available (status: ${agent.status}).`,
      );
      return;
    }
    Alert.alert(
      isNl ? 'Testrun starten?' : 'Start a test run?',
      isNl
        ? 'Dit start een orchestrator-aanvraag. Acties die geld of publicatie raken vereisen daarna nog steeds expliciete goedkeuring.'
        : 'This starts an orchestrator request. Actions that touch spend or publishing still require explicit approval afterwards.',
      [
        { text: isNl ? 'Annuleren' : 'Cancel', style: 'cancel' },
        {
          text: isNl ? 'Starten' : 'Start',
          onPress: async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            try {
              const res = await fetch(
                `${(supabase as any).supabaseUrl}/functions/v1/orchestrator/dispatch`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: (supabase as any).supabaseKey,
                  },
                  body: JSON.stringify({
                    organization_id: orgId,
                    goal: `${agent.name} smoke test`,
                    agent_kind: agent.kind,
                    input: {},
                  }),
                },
              );
              const body = await res.json();
              if (!res.ok) throw new Error(body?.error ?? 'Dispatch failed');
              await loadData();
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Dispatch failed');
            }
          },
        },
      ],
    );
  }, [orgId, agent, isNl, loadData]);

  // ── Persist kill switch + budget caps to agents.config (Tier-1 #3) ──
  const saveConfig = useCallback(async () => {
    if (!agent) return;
    setSavingConfig(true);
    try {
      const tokenCapNum = dailyTokenCap.trim() === '' ? null : Number(dailyTokenCap);
      const spendCapNum = dailySpendCapEur.trim() === '' ? null : Number(dailySpendCapEur);
      if (tokenCapNum != null && (!Number.isFinite(tokenCapNum) || tokenCapNum < 0)) {
        Alert.alert('Invalid', isNl ? 'Token cap moet een positief getal zijn.' : 'Token cap must be a positive number.');
        setSavingConfig(false); return;
      }
      if (spendCapNum != null && (!Number.isFinite(spendCapNum) || spendCapNum < 0)) {
        Alert.alert('Invalid', isNl ? 'Budget cap moet een positief getal zijn.' : 'Spend cap must be a positive number.');
        setSavingConfig(false); return;
      }
      const newConfig: Record<string, unknown> = {
        ...(agent.config ?? {}),
        paused,
        daily_token_cap: tokenCapNum,
        daily_spend_cap_eur: spendCapNum,
      };
      const { error } = await supabase
        .from('agents')
        .update({ config: newConfig })
        .eq('id', agent.id);
      if (error) throw error;
      await loadData();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingConfig(false);
    }
  }, [agent, paused, dailyTokenCap, dailySpendCapEur, isNl, loadData]);

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
    headerSubtitle: {
      fontSize: fontSize.sm, color: 'rgba(255,255,255,0.75)',
      marginTop: spacing.xs, lineHeight: 20,
    },
    section: { padding: spacing.md, gap: spacing.sm },
    sectionTitle: {
      fontSize: fontSize.md, fontWeight: fontWeight.bold,
      color: c.text, marginBottom: spacing.xs,
    },
    card: {
      backgroundColor: c.surface, borderRadius: borderRadius.lg,
      padding: spacing.md, borderWidth: 1, borderColor: c.border,
    },
    runRow: {
      flexDirection: 'row' as const, justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const, paddingVertical: spacing.xs,
      borderBottomWidth: 1, borderBottomColor: c.border, gap: spacing.sm,
    },
    runGoal: { color: c.text, fontSize: fontSize.sm, flex: 1 },
    statusPill: {
      borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    },
    statusText: { fontSize: 10, fontWeight: fontWeight.semibold },
    primaryBtn: {
      backgroundColor: theme.color, borderRadius: borderRadius.md,
      paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
      alignItems: 'center' as const, marginTop: spacing.sm,
    },
    primaryBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.bold },
    capabilityChip: {
      backgroundColor: c.background, borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm, paddingVertical: 4,
      borderWidth: 1, borderColor: c.border,
    },
    capabilityText: { fontSize: 11, color: c.textSecondary },
    capabilitiesRow: {
      flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs,
    },
    emptyText: { color: c.textSecondary, fontSize: fontSize.sm, fontStyle: 'italic' as const },
    // ── Kill switch + budget cap (Tier-1 #3) ──
    settingsRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    settingsLabel: { color: c.text, fontSize: fontSize.sm, flex: 1 },
    settingsHint: { color: c.textSecondary, fontSize: 11, marginTop: 2 },
    capInput: {
      backgroundColor: c.background, color: c.text,
      borderWidth: 1, borderColor: c.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.sm, paddingVertical: 6,
      width: 96, textAlign: 'right' as const,
      fontSize: fontSize.sm,
    },
    saveBtn: {
      backgroundColor: c.text, opacity: 0.85,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
      alignItems: 'center' as const, marginTop: spacing.sm,
    },
    saveBtnText: { color: c.background, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  }));

  const Icon = theme.iconLib === 'ion' ? Ionicons : MaterialCommunityIcons;

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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{
              width: 44, height: 44, borderRadius: 12,
              backgroundColor: 'rgba(255,255,255,0.18)',
              justifyContent: 'center', alignItems: 'center',
            }}>
              <Icon name={theme.icon as any} size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{agent?.name ?? '...'}</Text>
              <Text style={styles.headerSubtitle}>{agent?.description ?? ''}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.section}>
          {loading ? (
            <ActivityIndicator color={theme.color} />
          ) : !agent ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>
                {isNl
                  ? 'Geen agent geregistreerd voor deze organisatie. Voer de migratie uit om defaults te zaaien.'
                  : 'No agent registered for this organization. Run the migration to seed defaults.'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>
                {isNl ? 'Capabilities' : 'Capabilities'}
              </Text>
              <View style={[styles.card, { backgroundColor: 'transparent', borderWidth: 0, padding: 0 }]}>
                <View style={styles.capabilitiesRow}>
                  {agent.capabilities.map((cap) => (
                    <View key={cap} style={styles.capabilityChip}>
                      <Text style={styles.capabilityText}>{cap}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* ── Kill switch + Budget caps (Tier-1 #3) ── */}
              <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>
                {isNl ? 'Beperkingen & noodknop' : 'Limits & kill switch'}
              </Text>
              <View style={styles.card}>
                <View style={styles.settingsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingsLabel}>
                      {isNl ? 'Pauze deze agent' : 'Pause this agent'}
                    </Text>
                    <Text style={styles.settingsHint}>
                      {isNl
                        ? 'Geblokkeerde dispatches verschijnen als "blocked" in de runs lijst.'
                        : 'Blocked dispatches appear as "blocked" in the runs list.'}
                    </Text>
                  </View>
                  <Switch value={paused} onValueChange={setPaused} trackColor={{ true: theme.color }} />
                </View>

                <View style={styles.settingsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingsLabel}>
                      {isNl ? 'Dagelijkse token limiet' : 'Daily token cap'}
                    </Text>
                    <Text style={styles.settingsHint}>
                      {isNl ? 'Leeg = onbeperkt' : 'Empty = unlimited'}
                    </Text>
                  </View>
                  <TextInput
                    style={styles.capInput}
                    keyboardType="numeric"
                    placeholder="—"
                    placeholderTextColor={colors.textSecondary}
                    value={dailyTokenCap}
                    onChangeText={setDailyTokenCap}
                  />
                </View>

                <View style={[styles.settingsRow, { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingsLabel}>
                      {isNl ? 'Dagelijkse budget cap (EUR)' : 'Daily spend cap (EUR)'}
                    </Text>
                    <Text style={styles.settingsHint}>
                      {isNl ? 'Geldt voor Ads Agent acties.' : 'Applies to Ads Agent actions.'}
                    </Text>
                  </View>
                  <TextInput
                    style={styles.capInput}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={colors.textSecondary}
                    value={dailySpendCapEur}
                    onChangeText={setDailySpendCapEur}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, { opacity: savingConfig ? 0.5 : 0.9 }]}
                  disabled={savingConfig}
                  onPress={saveConfig}
                >
                  <Text style={styles.saveBtnText}>
                    {savingConfig
                      ? (isNl ? 'Opslaan…' : 'Saving…')
                      : (isNl ? 'Opslaan' : 'Save')}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>
                {isNl ? 'Recente runs' : 'Recent runs'}
              </Text>
              <View style={styles.card}>
                {runs.length === 0 ? (
                  <Text style={styles.emptyText}>
                    {isNl ? 'Nog geen runs voor deze agent.' : 'No runs yet for this agent.'}
                  </Text>
                ) : (
                  runs.map((r) => {
                    const cfg = STATUS_LABEL[r.status];
                    return (
                      <TouchableOpacity
                        key={r.id}
                        activeOpacity={0.6}
                        onPress={() => navigation.navigate('AgentRunDetail', { runId: r.id })}
                        style={styles.runRow}
                      >
                        <Text style={styles.runGoal} numberOfLines={2}>{r.goal || '(no goal)'}</Text>
                        <View style={[styles.statusPill, { backgroundColor: cfg.color + '22' }]}>
                          <Text style={[styles.statusText, { color: cfg.color }]}>
                            {isNl ? cfg.nl : cfg.en}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>

              <TouchableOpacity style={styles.primaryBtn} onPress={dispatchTestRun}>
                <Text style={styles.primaryBtnText}>
                  {isNl ? 'Testrun starten' : 'Start test run'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}
