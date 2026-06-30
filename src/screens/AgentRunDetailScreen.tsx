// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: showInput ? 'chevron-up' : 'chevron-down'> | Ionicons name=<dynamic: showOutput ? 'chevron-up' : 'chevron-down'> | Ionicons name=<dynamic: showToolCalls ? 'chevron-up' : 'chevron-down'> | MaterialCommunityIcons name=<dynamic: m.role === 'tool' ? 'tools' : m.role === 'agent' ? 'robot-outline' : m.role === 'user' ? 'account-outline' : m.role === 'assistant' ? 'message-text-outline' : 'cog-outline'>
// src/screens/AgentRunDetailScreen.tsx
// One specific agent_runs row, showing:
//   - Live Receipts (Tier-1 #1): the exact input, tool_calls, output, cost,
//     tokens, and status timeline that the agent saw + produced.
//   - Plain-language inter-agent thread (Tier-1 #4): renders agent_run_messages
//     for this run as a chat-bubble timeline so the user can read what the
//     agents said to each other.
//
// Reachable from AgentDetailScreen by tapping a run row.
//
// Backed by:
//   - public.agent_runs       (one row by id)
//   - public.agent_run_messages   (children of run_id, ordered)
//   - public.agents           (joined for to-agent / from-agent display name)
//   - edge fn: orchestrator    (POST /approve when run.requires_approval)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Platform, StatusBar, Alert,
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
type AgentKind = 'content' | 'social' | 'ads' | 'analytics' | 'lead' | 'orchestrator';

interface RunRow {
  id: string;
  organization_id: string;
  agent_id: string;
  parent_run_id: string | null;
  goal: string;
  trigger: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  tool_calls: Array<Record<string, unknown>>;
  status:
    | 'queued' | 'running' | 'awaiting_approval'
    | 'completed' | 'failed' | 'cancelled' | 'blocked';
  requires_approval: boolean;
  approved_by_user: string | null;
  approved_at: string | null;
  error_message: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  related_post_id: string | null;
  related_campaign_id: string | null;
  related_event_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  agent: { kind: AgentKind; name: string } | null;
}

interface MessageRow {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool' | 'agent';
  from_agent: string | null;
  to_agent: string | null;
  content: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const STATUS_COLOR: Record<RunRow['status'], string> = {
  queued: '#64748B',
  running: '#3B82F6',
  awaiting_approval: '#F59E0B',
  completed: '#10B981',
  failed: '#EF4444',
  cancelled: '#94A3B8',
  blocked: '#71717A',
};

const STATUS_LABEL: Record<RunRow['status'], { en: string; nl: string }> = {
  queued: { en: 'Queued', nl: 'In wachtrij' },
  running: { en: 'Running', nl: 'Bezig' },
  awaiting_approval: { en: 'Awaiting approval', nl: 'Wacht op goedkeuring' },
  completed: { en: 'Completed', nl: 'Voltooid' },
  failed: { en: 'Failed', nl: 'Mislukt' },
  cancelled: { en: 'Cancelled', nl: 'Geannuleerd' },
  blocked: { en: 'Blocked', nl: 'Geblokkeerd' },
};

const AGENT_GRADIENT: Record<AgentKind, [string, string]> = {
  content:      ['#1D4ED8', '#3B82F6'],
  social:       ['#BE185D', '#EC4899'],
  ads:          ['#C2410C', '#FF6B35'],
  analytics:    ['#047857', '#10B981'],
  lead:         ['#B45309', '#F59E0B'],
  orchestrator: ['#7E22CE', '#A855F7'],
};

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString();
}

function fmtDuration(start: string | null, end: string | null): string {
  if (!start) return '—';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - s;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function safeStringify(value: unknown, max = 4000): string {
  try {
    const s = JSON.stringify(value, null, 2);
    return s.length > max ? s.slice(0, max) + '\n…(truncated)' : s;
  } catch {
    return String(value);
  }
}

export default function AgentRunDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'AgentRunDetail'>>();
  const { runId } = route.params;
  const { colors } = useTheme();
  const { locale } = useTranslation();
  const isNl = locale === 'nl';

  const [run, setRun] = useState<RunRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [showOutput, setShowOutput] = useState(true);
  const [showToolCalls, setShowToolCalls] = useState(false);
  const [approving, setApproving] = useState(false);

  const loadData = useCallback(async () => {
    const [runRes, msgRes] = await Promise.all([
      supabase
        .from('agent_runs')
        .select(`
          id, organization_id, agent_id, parent_run_id, goal, trigger,
          input, output, tool_calls, status, requires_approval,
          approved_by_user, approved_at, error_message,
          prompt_tokens, completion_tokens, cost_usd,
          related_post_id, related_campaign_id, related_event_id,
          started_at, finished_at, created_at,
          agent:agents (kind, name)
        `)
        .eq('id', runId)
        .maybeSingle(),
      supabase
        .from('agent_run_messages')
        .select('id, role, from_agent, to_agent, content, payload, created_at')
        .eq('run_id', runId)
        .order('created_at', { ascending: true }),
    ]);

    if (runRes.data) {
      const raw = runRes.data as any;
      setRun({
        ...raw,
        // Normalize the joined agent which Supabase returns as either
        // an object or an array depending on the relationship.
        agent: Array.isArray(raw.agent) ? (raw.agent[0] ?? null) : (raw.agent ?? null),
        input: raw.input ?? {},
        output: raw.output ?? {},
        tool_calls: Array.isArray(raw.tool_calls) ? raw.tool_calls : [],
      });
    }
    setMessages((msgRes.data ?? []) as MessageRow[]);
    setLoading(false);
  }, [runId]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const approveRun = useCallback(async () => {
    if (!run) return;
    setApproving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in');
      const res = await fetch(
        `${(supabase as any).supabaseUrl}/functions/v1/orchestrator/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: (supabase as any).supabaseKey,
          },
          body: JSON.stringify({ run_id: run.id }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Approval failed');
      await loadData();

      // ── Killer integration: if this was an Ads Agent boost approval and
      // we have a target post, deep-link straight into the existing
      // BoostFlowScreen with the agent's pacing prefilled. Cuts a manual
      // re-entry of budget/audience for the user. (Tier-2 connection.)
      const isAdsBoost =
        run.agent?.kind === 'ads' &&
        (run.goal === 'dispatch_ads_agent' || (run.input as any)?.action === 'boost_post');
      const draft = (run.output as any)?.draft ?? {};
      const pacing = draft.recommended_pacing ?? {};
      const inputChannel = (run.input as any)?.channel as string | undefined;
      const inputPost    = (run.input as any)?.post_id as string | undefined;
      const targetPost   = run.related_post_id ?? inputPost ?? null;

      if (isAdsBoost && targetPost) {
        const channel: 'facebook' | 'instagram' | 'meta' =
          inputChannel === 'instagram' ? 'instagram' :
          inputChannel === 'facebook'  ? 'facebook'  :
                                         'meta';
        const dailyEur = Number(pacing.daily_cap_eur ?? 0);
        const days     = Number(pacing.days ?? 0);
        const budgetCents = dailyEur > 0 && days > 0 ? Math.round(dailyEur * days * 100) : undefined;

        // Map Ads Agent's free-form draft.audience to one of BoostFlow's 4 preset
        // keys (BUG-2026-14 — was always defaulting to lookalike_followers because
        // the audience hint never made it into the navigation params).
        const audience = (draft.audience ?? {}) as Record<string, unknown>;
        const jobTitles  = Array.isArray(audience.job_titles)  ? audience.job_titles  : [];
        const industries = Array.isArray(audience.industries) ? audience.industries : [];
        const prefillAudienceKey =
          jobTitles.length > 0
            ? 'business_decisionmakers'
            : industries.some((i) => typeof i === 'string' && /esg|dei|inclusion|sustainability/i.test(i))
              ? 'esg_dei_interest'
              : (audience.geo || (audience as { country?: unknown }).country) && jobTitles.length === 0 && industries.length === 0
                ? 'geo_only'
                : 'lookalike_followers';

        navigation.navigate('BoostFlow' as any, {
          postId: targetPost,
          channel,
          agentRunId: run.id,
          prefillBudgetCents: budgetCents,
          prefillDurationDays: days > 0 ? days : undefined,
          prefillAudienceKey,
          prefillSourceLabel: isNl ? 'Voorgesteld door Ads Agent' : 'Suggested by Ads Agent',
        });
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setApproving(false);
    }
  }, [run, loadData, navigation, isNl]);

  const gradient = useMemo<[string, string]>(() => {
    return run?.agent?.kind ? AGENT_GRADIENT[run.agent.kind] : ['#475569', '#64748B'];
  }, [run?.agent?.kind]);

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
      fontSize: fontSize.sm, color: 'rgba(255,255,255,0.85)',
      marginTop: spacing.xs, lineHeight: 20,
    },
    metaRow: {
      flexDirection: 'row' as const, gap: spacing.md, marginTop: spacing.sm, flexWrap: 'wrap' as const,
    },
    metaPill: {
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm, paddingVertical: 3,
    },
    metaText: { color: '#fff', fontSize: 11, fontWeight: fontWeight.semibold },
    section: { padding: spacing.md, gap: spacing.sm },
    sectionTitle: {
      fontSize: fontSize.md, fontWeight: fontWeight.bold,
      color: c.text, marginBottom: 4,
    },
    card: {
      backgroundColor: c.surface, borderRadius: borderRadius.lg,
      padding: spacing.md, borderWidth: 1, borderColor: c.border,
    },
    statusPill: {
      alignSelf: 'flex-start' as const,
      borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    },
    statusText: { fontSize: 10, fontWeight: fontWeight.semibold },
    receiptsRow: {
      flexDirection: 'row' as const, flexWrap: 'wrap' as const,
      justifyContent: 'space-between' as const, gap: spacing.xs,
    },
    receiptCell: {
      width: '48%' as any,
      backgroundColor: c.background,
      borderRadius: borderRadius.md, padding: spacing.sm,
      borderWidth: 1, borderColor: c.border,
    },
    receiptLabel: { fontSize: 10, color: c.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    receiptValue: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: c.text, marginTop: 2 },
    expanderRow: {
      flexDirection: 'row' as const, justifyContent: 'space-between' as const,
      alignItems: 'center' as const, paddingVertical: spacing.xs,
    },
    expanderLabel: { color: c.text, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
    code: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 11, color: c.text,
      backgroundColor: c.background,
      padding: spacing.sm, borderRadius: borderRadius.md,
      borderWidth: 1, borderColor: c.border,
    },
    msgRowAgent: {
      flexDirection: 'row' as const, gap: spacing.sm,
      marginVertical: spacing.xs, alignItems: 'flex-end' as const,
    },
    msgAvatar: {
      width: 28, height: 28, borderRadius: 14,
      justifyContent: 'center' as const, alignItems: 'center' as const,
    },
    msgBubble: {
      flex: 1, padding: spacing.sm,
      borderRadius: borderRadius.md, borderWidth: 1, borderColor: c.border,
      backgroundColor: c.surface,
    },
    msgRole: { fontSize: 10, fontWeight: fontWeight.semibold, color: c.textSecondary, marginBottom: 2 },
    msgContent: { color: c.text, fontSize: fontSize.sm, lineHeight: 19 },
    primaryBtn: {
      backgroundColor: '#10B981',
      borderRadius: borderRadius.md,
      paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
      alignItems: 'center' as const, marginTop: spacing.sm,
    },
    primaryBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.bold },
    errorBox: {
      backgroundColor: '#EF444415',
      borderRadius: borderRadius.md, padding: spacing.sm,
      borderWidth: 1, borderColor: '#EF444444',
    },
    errorText: { color: '#EF4444', fontSize: fontSize.sm },
    emptyText: { color: c.textSecondary, fontSize: fontSize.sm, fontStyle: 'italic' as const },
  }));

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!run) {
    return (
      <View style={[styles.container, { padding: spacing.lg }]}>
        <Text style={styles.emptyText}>{isNl ? 'Run niet gevonden.' : 'Run not found.'}</Text>
      </View>
    );
  }

  const statusCfg = STATUS_LABEL[run.status];
  const statusColor = STATUS_COLOR[run.status];

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        <LinearGradient colors={gradient} style={styles.header}>
          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <CaretLeft size={20} color="#fff" weight="bold" />
              <Text style={styles.backLabel}>{isNl ? 'Terug' : 'Back'}</Text>
            </TouchableOpacity>
            <View style={[styles.statusPill, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={[styles.statusText, { color: '#fff' }]}>
                {isNl ? statusCfg.nl : statusCfg.en}
              </Text>
            </View>
          </View>

          <Text style={styles.headerTitle} numberOfLines={2}>
            {run.goal || (isNl ? '(geen doel)' : '(no goal)')}
          </Text>
          <Text style={styles.headerSubtitle}>
            {run.agent?.name ?? '—'} • {run.trigger}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.metaPill}><Text style={styles.metaText}>{fmtDuration(run.started_at, run.finished_at)}</Text></View>
            <View style={styles.metaPill}><Text style={styles.metaText}>{(run.prompt_tokens + run.completion_tokens).toLocaleString()} tok</Text></View>
            <View style={styles.metaPill}><Text style={styles.metaText}>${run.cost_usd.toFixed(4)}</Text></View>
          </View>
        </LinearGradient>

        {/* ── Approval CTA when applicable ───────────────────── */}
        {run.status === 'awaiting_approval' && (
          <View style={styles.section}>
            <View style={[styles.card, { borderColor: '#F59E0B', backgroundColor: '#F59E0B11' }]}>
              <Text style={{ color: colors.text, fontSize: fontSize.sm, lineHeight: 20 }}>
                {isNl
                  ? 'Deze run wijzigt budget of publiceert iets en heeft jouw goedkeuring nodig.'
                  : 'This run will spend money or publish something and needs your approval.'}
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, { opacity: approving ? 0.5 : 1 }]}
                disabled={approving}
                onPress={approveRun}
              >
                <Text style={styles.primaryBtnText}>
                  {approving
                    ? (isNl ? 'Bezig…' : 'Approving…')
                    : (isNl ? 'Goedkeuren' : 'Approve')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {run.error_message && (
          <View style={styles.section}>
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{run.error_message}</Text>
            </View>
          </View>
        )}

        {/* ── Live Receipts (Tier-1 #1) ─────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Live receipts
          </Text>
          <View style={styles.receiptsRow}>
            <View style={styles.receiptCell}>
              <Text style={styles.receiptLabel}>{isNl ? 'Gestart' : 'Started'}</Text>
              <Text style={styles.receiptValue}>{fmtTime(run.started_at)}</Text>
            </View>
            <View style={styles.receiptCell}>
              <Text style={styles.receiptLabel}>{isNl ? 'Voltooid' : 'Finished'}</Text>
              <Text style={styles.receiptValue}>{fmtTime(run.finished_at)}</Text>
            </View>
            <View style={styles.receiptCell}>
              <Text style={styles.receiptLabel}>Prompt tokens</Text>
              <Text style={styles.receiptValue}>{run.prompt_tokens.toLocaleString()}</Text>
            </View>
            <View style={styles.receiptCell}>
              <Text style={styles.receiptLabel}>Output tokens</Text>
              <Text style={styles.receiptValue}>{run.completion_tokens.toLocaleString()}</Text>
            </View>
            <View style={styles.receiptCell}>
              <Text style={styles.receiptLabel}>{isNl ? 'Kosten' : 'Cost'}</Text>
              <Text style={styles.receiptValue}>${run.cost_usd.toFixed(4)}</Text>
            </View>
            <View style={styles.receiptCell}>
              <Text style={styles.receiptLabel}>Trigger</Text>
              <Text style={styles.receiptValue}>{run.trigger}</Text>
            </View>
          </View>

          {/* Input expander */}
          <TouchableOpacity onPress={() => setShowInput(s => !s)} style={[styles.card, styles.expanderRow]}>
            <Text style={styles.expanderLabel}>
              {isNl ? 'Input (wat de agent zag)' : 'Input (what the agent saw)'}
            </Text>
            <Ionicons name={showInput ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {showInput && (
            <Text style={styles.code} selectable>{safeStringify(run.input)}</Text>
          )}

          {/* Tool calls expander */}
          <TouchableOpacity onPress={() => setShowToolCalls(s => !s)} style={[styles.card, styles.expanderRow]}>
            <Text style={styles.expanderLabel}>
              {`Tool calls (${run.tool_calls.length})`}
            </Text>
            <Ionicons name={showToolCalls ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {showToolCalls && (
            <Text style={styles.code} selectable>{safeStringify(run.tool_calls)}</Text>
          )}

          {/* Output expander (default open) */}
          <TouchableOpacity onPress={() => setShowOutput(s => !s)} style={[styles.card, styles.expanderRow]}>
            <Text style={styles.expanderLabel}>
              Output
            </Text>
            <Ionicons name={showOutput ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {showOutput && (
            <Text style={styles.code} selectable>{safeStringify(run.output)}</Text>
          )}
        </View>

        {/* ── Inter-agent thread (Tier-1 #4) ─────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isNl ? 'Agent gesprek' : 'Agent conversation'}
          </Text>
          {messages.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>
                {isNl
                  ? 'Geen berichten geregistreerd voor deze run.'
                  : 'No messages recorded for this run.'}
              </Text>
            </View>
          ) : (
            messages.map((m) => {
              // Pick a tone per role.
              const roleColor =
                m.role === 'tool'      ? '#3B82F6' :
                m.role === 'assistant' ? '#10B981' :
                m.role === 'agent'     ? '#A855F7' :
                m.role === 'user'      ? '#F59E0B' :
                                         '#64748B';
              const roleLabel =
                m.from_agent && m.to_agent
                  ? `${m.from_agent} → ${m.to_agent}`
                  : m.role;
              return (
                <View key={m.id} style={styles.msgRowAgent}>
                  <View style={[styles.msgAvatar, { backgroundColor: roleColor + '22' }]}>
                    <MaterialCommunityIcons
                      name={
                        m.role === 'tool' ? 'tools' :
                        m.role === 'agent' ? 'robot-outline' :
                        m.role === 'user' ? 'account-outline' :
                        m.role === 'assistant' ? 'message-text-outline' :
                                                 'cog-outline'
                      }
                      size={16}
                      color={roleColor}
                    />
                  </View>
                  <View style={styles.msgBubble}>
                    <Text style={[styles.msgRole, { color: roleColor }]}>
                      {roleLabel.toUpperCase()}
                    </Text>
                    {m.content ? (
                      <Text style={styles.msgContent}>{m.content}</Text>
                    ) : null}
                    {m.payload && Object.keys(m.payload).length > 0 && (
                      <Text style={[styles.code, { marginTop: 6, fontSize: 10 }]} selectable>
                        {safeStringify(m.payload, 800)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ── Related deep-links ─────────────────────────────── */}
        {(run.related_post_id || run.related_campaign_id || run.related_event_id) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {isNl ? 'Gerelateerd' : 'Related'}
            </Text>
            <View style={styles.card}>
              {run.related_post_id && (
                <Text style={styles.msgContent}>Post: {run.related_post_id}</Text>
              )}
              {run.related_campaign_id && (
                <Text style={styles.msgContent}>Campaign: {run.related_campaign_id}</Text>
              )}
              {run.related_event_id && (
                <Text style={styles.msgContent}>Event: {run.related_event_id}</Text>
              )}
            </View>
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}
