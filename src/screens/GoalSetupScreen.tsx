// TODO: migrate to Phosphor — unmapped icons: MaterialCommunityIcons name=<dynamic: a.icon as any> | MaterialCommunityIcons name=<dynamic: m.icon as any> | MaterialCommunityIcons name=<dynamic: opt.key === 'conservative' ? 'shield-check' : opt.key === 'balanced' ? 'scale-balance' : 'rocket-launch'>
// src/screens/GoalSetupScreen.tsx
// Goal Mode (Tier-2) — 3-step wizard.
//
// Step 1: pick metric
// Step 2: target + budget + period
// Step 3: agents + autonomy
// Final:  review summary, "Activate Goal" button
//   → INSERT status='draft' then UPDATE status='active' so the transition
//     trigger logs the activation.
//
// Mirrors MarketingStrategyScreen's STEP_TITLES + progressDot UX.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Alert, Platform, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { supabase } from '../services/supabase';
import { useTranslation } from '../i18n';
import { ArrowLeft, CaretLeft, CaretRight, Check, FlagCheckered } from 'phosphor-react-native';
import {
  useCreateGoal, useTransitionGoal,
  type GoalMetric, type GoalTargetKind, type GoalAutonomy, type GoalAgentKind,
} from '../hooks/useAgentGoals';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'GoalSetup'>;

const R = 'row' as const;
const C = 'center' as const;
const SB = 'space-between' as const;

// ─── Static option lists (NL/EN) ────────────────────────────────────────────

interface MetricOpt {
  key: GoalMetric;
  icon: string;
  color: string;
  label: { en: string; nl: string };
  example: { en: string; nl: string };
}

const METRICS: MetricOpt[] = [
  {
    key: 'event_attendees',
    icon: 'calendar-account',
    color: '#9333EA',
    label: { en: 'Event attendees',  nl: 'Event aanmeldingen' },
    example: { en: 'e.g. 250 sign-ups by Sept 30', nl: 'bijv. 250 aanmeldingen voor 30 sept' },
  },
  {
    key: 'revenue_eur',
    icon: 'currency-eur',
    color: '#10B981',
    label: { en: 'Revenue (EUR)',    nl: 'Omzet (EUR)' },
    example: { en: 'e.g. €25k this quarter', nl: 'bijv. €25k dit kwartaal' },
  },
  {
    key: 'posts_published',
    icon: 'send',
    color: '#3B82F6',
    label: { en: 'Posts published',  nl: 'Gepubliceerde posts' },
    example: { en: 'e.g. 60 posts in 90 days', nl: 'bijv. 60 posts in 90 dagen' },
  },
  {
    key: 'roas',
    icon: 'chart-line',
    color: '#F59E0B',
    label: { en: 'ROAS',             nl: 'ROAS' },
    example: { en: 'e.g. 3.0x return on ad spend', nl: 'bijv. 3.0x rendement op ads' },
  },
  {
    key: 'followers',
    icon: 'account-multiple-plus',
    color: '#EC4899',
    label: { en: 'Followers',        nl: 'Volgers' },
    example: { en: 'e.g. +1k LinkedIn followers', nl: 'bijv. +1k LinkedIn volgers' },
  },
];

const TARGET_KINDS: { key: GoalTargetKind; label: { en: string; nl: string } }[] = [
  { key: 'absolute',  label: { en: 'Absolute target',     nl: 'Absoluut doel' } },
  { key: 'delta_abs', label: { en: 'Delta (+ N)',         nl: 'Delta (+ N)' } },
  { key: 'delta_pct', label: { en: 'Delta (% increase)',  nl: 'Delta (% stijging)' } },
];

const AGENT_KINDS: { key: GoalAgentKind; icon: string; label: { en: string; nl: string } }[] = [
  { key: 'ads',       icon: 'megaphone',      label: { en: 'Ads',       nl: 'Ads' } },
  { key: 'content',   icon: 'pencil',         label: { en: 'Content',   nl: 'Content' } },
  { key: 'social',    icon: 'share-variant',  label: { en: 'Social',    nl: 'Social' } },
  { key: 'analytics', icon: 'chart-bar',      label: { en: 'Analytics', nl: 'Analytics' } },
  { key: 'lead',      icon: 'account-search', label: { en: 'Lead',      nl: 'Lead' } },
];

const AUTONOMY: { key: GoalAutonomy; color: string; label: { en: string; nl: string }; desc: { en: string; nl: string } }[] = [
  { key: 'conservative', color: '#10B981', label: { en: 'Conservative', nl: 'Conservatief' }, desc: { en: 'Always approval', nl: 'Altijd goedkeuring' } },
  { key: 'balanced',     color: '#3B82F6', label: { en: 'Balanced',     nl: 'Balanced' },     desc: { en: 'AI within limits', nl: 'AI binnen grenzen' } },
  { key: 'aggressive',   color: '#9333EA', label: { en: 'Aggressive',   nl: 'Agressief' },    desc: { en: 'Fully autonomous', nl: 'Volledig autonoom' } },
];

// ─── Date helpers ────────────────────────────────────────────────────────────

function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Current quarter [start, end] inclusive. */
function currentQuarter(): { start: string; end: string } {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3); // 0..3
  const startMonth = q * 3;
  const endMonth = startMonth + 2;
  const start = new Date(now.getFullYear(), startMonth, 1);
  const end = new Date(now.getFullYear(), endMonth + 1, 0); // last day of endMonth
  return { start: fmtDate(start), end: fmtDate(end) };
}

const STEP_TITLES_EN = ['Metric', 'Target & budget', 'Agents & autonomy', 'Review'];
const STEP_TITLES_NL = ['Metriek', 'Doel & budget', 'Agents & autonomie', 'Bevestig'];

export default function GoalSetupScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { colors } = useTheme();
  const { locale } = useTranslation();
  const isNl = locale === 'nl';

  const STEP_TITLES = isNl ? STEP_TITLES_NL : STEP_TITLES_EN;
  const prefill = route.params?.prefill;

  // ── Wizard state ──
  const [step, setStep] = useState(0);

  const defaultPeriod = useMemo(currentQuarter, []);
  const [metric, setMetric] = useState<GoalMetric>(prefill?.metric ?? 'event_attendees');
  const [title, setTitle] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [targetKind, setTargetKind] = useState<GoalTargetKind>('absolute');
  const [periodStart, setPeriodStart] = useState(prefill?.period_start ?? defaultPeriod.start);
  const [periodEnd, setPeriodEnd]     = useState(prefill?.period_end   ?? defaultPeriod.end);
  const [budgetEur, setBudgetEur] = useState(
    prefill?.budget_eur != null ? String(prefill.budget_eur) : '5000',
  );
  const [agentKinds, setAgentKinds] = useState<GoalAgentKind[]>(
    prefill?.agent_kinds ?? ['ads', 'content', 'social'],
  );
  const [autonomyLevel, setAutonomyLevel] = useState<GoalAutonomy>(
    prefill?.autonomy_level ?? 'balanced',
  );

  const [submitting, setSubmitting] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  const createGoal = useCreateGoal();
  const transitionGoal = useTransitionGoal();

  // Resolve org once.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: memberRow } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (mounted) setOrgId(memberRow?.organization_id ?? null);
    })();
    return () => { mounted = false; };
  }, []);

  // ── Handlers ──
  const toggleAgent = (k: GoalAgentKind) => {
    setAgentKinds((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  };

  const canAdvance = (): boolean => {
    if (step === 0) return !!metric;
    if (step === 1) {
      const tv = Number(targetValue);
      if (!Number.isFinite(tv) || tv <= 0) return false;
      if (!periodStart || !periodEnd) return false;
      const b = Number(budgetEur);
      if (!Number.isFinite(b) || b < 0) return false;
      return true;
    }
    if (step === 2) return agentKinds.length > 0;
    return true;
  };

  const handleActivate = async () => {
    if (!orgId) {
      Alert.alert(
        isNl ? 'Geen organisatie' : 'No organization',
        isNl ? 'Kan organisatie niet vinden.' : 'Could not resolve organization.',
      );
      return;
    }
    setSubmitting(true);
    try {
      const tv = Number(targetValue);
      const b = Number(budgetEur);
      const computedTitle = title.trim() ||
        (METRICS.find((m) => m.key === metric)?.label[isNl ? 'nl' : 'en'] ?? 'Goal');
      // 1. INSERT draft
      const draft = await createGoal.mutateAsync({
        organization_id: orgId,
        title: computedTitle,
        metric,
        target_value: tv,
        target_kind: targetKind,
        period_start: periodStart,
        period_end: periodEnd,
        budget_eur: b,
        autonomy_level: autonomyLevel,
        agent_kinds: agentKinds,
        config: {},
      });
      // 2. UPDATE → active so the transition trigger logs the flip
      await transitionGoal.mutateAsync({ goalId: draft.id, newStatus: 'active' });
      // 3. Navigate to detail
      navigation.replace('GoalDetail', { goalId: draft.id });
    } catch (e) {
      Alert.alert(
        isNl ? 'Fout' : 'Error',
        e instanceof Error ? e.message : (isNl ? 'Activeren mislukt.' : 'Activation failed.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Styles (mirror MarketingStrategyScreen) ──
  const s = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    headerRow: { flexDirection: R, alignItems: C, gap: spacing.sm },
    headerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: c.text, flex: 1 },
    stepRow: { flexDirection: R, alignItems: C, justifyContent: C, paddingVertical: spacing.sm },
    stepCircle: {
      width: 28, height: 28, borderRadius: 14, justifyContent: C, alignItems: C,
      borderWidth: 2, borderColor: c.border, backgroundColor: c.background,
    },
    stepCircleActive: { borderColor: '#F97316', backgroundColor: '#F97316' },
    stepCircleDone:   { borderColor: '#EA580C', backgroundColor: '#EA580C' },
    stepNum: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: c.textTertiary },
    stepNumActive: { color: '#fff' },
    stepLine: { width: 28, height: 2, backgroundColor: c.border },
    stepLineDone: { backgroundColor: '#EA580C' },
    scroll: { flex: 1 },
    scrollContent: { padding: spacing.md, gap: spacing.md, paddingBottom: 120 },
    section: {
      backgroundColor: c.surface, borderRadius: borderRadius.lg,
      padding: spacing.md, gap: spacing.sm, ...subtleShadow,
    },
    sectionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: c.text },
    sectionSub: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: -4 },
    metricCard: {
      borderWidth: 1.5, borderColor: c.border, backgroundColor: c.background,
      borderRadius: borderRadius.md, padding: spacing.sm, gap: spacing.xs,
      flexDirection: R, alignItems: C,
    },
    metricIconWrap: {
      width: 36, height: 36, borderRadius: 10,
      justifyContent: C, alignItems: C,
    },
    metricLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: c.text },
    metricExample: { fontSize: 11, color: c.textSecondary, marginTop: 1 },
    input: {
      backgroundColor: c.background, color: c.text,
      borderWidth: 1, borderColor: c.border,
      borderRadius: borderRadius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
      fontSize: fontSize.sm,
    },
    chipsWrap: { flexDirection: R, flexWrap: 'wrap' as const, gap: spacing.xs },
    chip: {
      paddingHorizontal: spacing.sm, paddingVertical: 6,
      borderRadius: borderRadius.full, borderWidth: 1.5,
      borderColor: c.border, backgroundColor: c.background,
      flexDirection: R, alignItems: C, gap: 4,
    },
    chipLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: c.textSecondary },
    radioRow: { flexDirection: R, alignItems: C, gap: spacing.sm, paddingVertical: 4 },
    radioOuter: {
      width: 20, height: 20, borderRadius: 10, borderWidth: 2,
      borderColor: c.border, justifyContent: C, alignItems: C,
    },
    radioInner: { width: 10, height: 10, borderRadius: 5 },
    radioLabel: { fontSize: fontSize.sm, color: c.text, fontWeight: fontWeight.medium },
    autonomyRow: { flexDirection: R, gap: spacing.xs },
    autonomyBtn: {
      flex: 1, borderWidth: 1.5, borderColor: c.border,
      borderRadius: borderRadius.md, padding: spacing.sm,
      alignItems: C, gap: 4,
    },
    autonomyLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: c.textSecondary },
    autonomyDesc:  { fontSize: 9, color: c.textTertiary, textAlign: C },
    summaryRow: {
      flexDirection: R, justifyContent: SB, paddingVertical: spacing.xs,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    summaryLabel: { fontSize: fontSize.sm, color: c.textSecondary },
    summaryValue: { fontSize: fontSize.sm, color: c.text, fontWeight: fontWeight.semibold },
    navBar: {
      position: 'absolute' as const, bottom: 0, left: 0, right: 0,
      flexDirection: R, justifyContent: SB, alignItems: C,
      padding: spacing.md, paddingBottom: Platform.OS === 'ios' ? 34 : spacing.md,
      backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border,
    },
    navBtn: {
      flexDirection: R, alignItems: C, gap: 4,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      borderRadius: borderRadius.full, borderWidth: 1, borderColor: c.border,
    },
    navBtnPrimary: { backgroundColor: '#F97316', borderColor: '#F97316' },
    navBtnDisabled: { opacity: 0.4 },
    navBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: c.textSecondary },
    navBtnTextPrimary: { color: '#fff' },
  }));

  // ── Step renderers ─────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <>
      <View style={s.section}>
        <Text style={s.sectionTitle}>{isNl ? 'Kies metriek' : 'Pick a metric'}</Text>
        <Text style={s.sectionSub}>
          {isNl
            ? 'Eén meetbaar doel per kwartaal.'
            : 'One measurable target per quarter.'}
        </Text>
        {METRICS.map((m) => {
          const sel = metric === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              style={[s.metricCard, sel && { borderColor: m.color, backgroundColor: m.color + '12' }]}
              onPress={() => setMetric(m.key)}
            >
              <View style={[s.metricIconWrap, { backgroundColor: m.color + '20' }]}>
                <MaterialCommunityIcons name={m.icon as any} size={20} color={m.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.metricLabel}>{m.label[isNl ? 'nl' : 'en']}</Text>
                <Text style={s.metricExample}>{m.example[isNl ? 'nl' : 'en']}</Text>
              </View>
              <View style={[s.radioOuter, sel && { borderColor: m.color }]}>
                {sel && <View style={[s.radioInner, { backgroundColor: m.color }]} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>{isNl ? 'Titel (optioneel)' : 'Title (optional)'}</Text>
        <TextInput
          style={s.input}
          value={title}
          onChangeText={setTitle}
          placeholder={isNl ? 'bijv. "Q3 Lead Push"' : 'e.g. "Q3 Lead Push"'}
          placeholderTextColor={colors.textTertiary}
        />
      </View>
    </>
  );

  const renderStep2 = () => (
    <>
      <View style={s.section}>
        <Text style={s.sectionTitle}>{isNl ? 'Doelwaarde' : 'Target value'}</Text>
        <TextInput
          style={s.input}
          value={targetValue}
          onChangeText={setTargetValue}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={s.sectionTitle}>{isNl ? 'Soort doel' : 'Target kind'}</Text>
        {TARGET_KINDS.map((k) => {
          const sel = targetKind === k.key;
          return (
            <TouchableOpacity key={k.key} style={s.radioRow} onPress={() => setTargetKind(k.key)}>
              <View style={[s.radioOuter, sel && { borderColor: '#F97316' }]}>
                {sel && <View style={[s.radioInner, { backgroundColor: '#F97316' }]} />}
              </View>
              <Text style={s.radioLabel}>{k.label[isNl ? 'nl' : 'en']}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>{isNl ? 'Periode' : 'Period'}</Text>
        <Text style={s.sectionSub}>
          {isNl ? 'Formaat: JJJJ-MM-DD' : 'Format: YYYY-MM-DD'}
        </Text>
        <View style={{ flexDirection: R, gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionSub}>{isNl ? 'Start' : 'Start'}</Text>
            <TextInput
              style={s.input}
              value={periodStart}
              onChangeText={setPeriodStart}
              autoCapitalize="none"
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionSub}>{isNl ? 'Einde' : 'End'}</Text>
            <TextInput
              style={s.input}
              value={periodEnd}
              onChangeText={setPeriodEnd}
              autoCapitalize="none"
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>{isNl ? 'Budget (EUR)' : 'Budget (EUR)'}</Text>
        <TextInput
          style={s.input}
          value={budgetEur}
          onChangeText={setBudgetEur}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textTertiary}
        />
      </View>
    </>
  );

  const renderStep3 = () => (
    <>
      <View style={s.section}>
        <Text style={s.sectionTitle}>{isNl ? 'Welke agents?' : 'Which agents?'}</Text>
        <Text style={s.sectionSub}>
          {isNl
            ? 'Alleen geselecteerde agents worden ingezet voor dit doel.'
            : 'Only selected agents will be dispatched for this goal.'}
        </Text>
        <View style={s.chipsWrap}>
          {AGENT_KINDS.map((a) => {
            const sel = agentKinds.includes(a.key);
            return (
              <TouchableOpacity
                key={a.key}
                style={[s.chip, sel && { borderColor: '#F97316', backgroundColor: '#F9731615' }]}
                onPress={() => toggleAgent(a.key)}
              >
                <MaterialCommunityIcons
                  name={a.icon as any}
                  size={14}
                  color={sel ? '#F97316' : colors.textSecondary}
                />
                <Text style={[s.chipLabel, sel && { color: '#F97316', fontWeight: fontWeight.bold }]}>
                  {a.label[isNl ? 'nl' : 'en']}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>{isNl ? 'Autonomie' : 'Autonomy'}</Text>
        <View style={s.autonomyRow}>
          {AUTONOMY.map((opt) => {
            const sel = autonomyLevel === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[s.autonomyBtn, sel && { borderColor: opt.color, backgroundColor: opt.color + '15' }]}
                onPress={() => setAutonomyLevel(opt.key)}
              >
                <MaterialCommunityIcons
                  name={
                    opt.key === 'conservative' ? 'shield-check' :
                    opt.key === 'balanced'     ? 'scale-balance' : 'rocket-launch'
                  }
                  size={20}
                  color={sel ? opt.color : colors.textTertiary}
                />
                <Text style={[s.autonomyLabel, sel && { color: opt.color }]}>
                  {opt.label[isNl ? 'nl' : 'en']}
                </Text>
                <Text style={s.autonomyDesc}>{opt.desc[isNl ? 'nl' : 'en']}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </>
  );

  const renderReview = () => {
    const metricLbl = METRICS.find((m) => m.key === metric)?.label[isNl ? 'nl' : 'en'] ?? metric;
    const tkLbl = TARGET_KINDS.find((k) => k.key === targetKind)?.label[isNl ? 'nl' : 'en'] ?? targetKind;
    const auLbl = AUTONOMY.find((a) => a.key === autonomyLevel)?.label[isNl ? 'nl' : 'en'] ?? autonomyLevel;
    const agentLbl = agentKinds.map((k) => AGENT_KINDS.find((a) => a.key === k)?.label[isNl ? 'nl' : 'en'] ?? k).join(', ');
    return (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{isNl ? 'Bevestig je doel' : 'Review your goal'}</Text>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>{isNl ? 'Titel' : 'Title'}</Text>
          <Text style={s.summaryValue}>{title.trim() || metricLbl}</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>{isNl ? 'Metriek' : 'Metric'}</Text>
          <Text style={s.summaryValue}>{metricLbl}</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>{isNl ? 'Doelwaarde' : 'Target'}</Text>
          <Text style={s.summaryValue}>{targetValue} ({tkLbl})</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>{isNl ? 'Periode' : 'Period'}</Text>
          <Text style={s.summaryValue}>{periodStart} → {periodEnd}</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>{isNl ? 'Budget' : 'Budget'}</Text>
          <Text style={s.summaryValue}>€{budgetEur}</Text>
        </View>
        <View style={s.summaryRow}>
          <Text style={s.summaryLabel}>{isNl ? 'Agents' : 'Agents'}</Text>
          <Text style={s.summaryValue}>{agentLbl}</Text>
        </View>
        <View style={[s.summaryRow, { borderBottomWidth: 0 }]}>
          <Text style={s.summaryLabel}>{isNl ? 'Autonomie' : 'Autonomy'}</Text>
          <Text style={s.summaryValue}>{auLbl}</Text>
        </View>
      </View>
    );
  };

  // ── Step indicator ──
  const renderStepIndicator = () => (
    <View style={s.stepRow}>
      {[0, 1, 2, 3].map((i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={[s.stepLine, step > i - 1 && s.stepLineDone]} />}
          <TouchableOpacity
            style={[s.stepCircle, step === i && s.stepCircleActive, step > i && s.stepCircleDone]}
            onPress={() => { if (i <= step) setStep(i); }}
          >
            {step > i
              ? <Check size={14} color="#fff" weight="bold" />
              : <Text style={[s.stepNum, step === i && s.stepNumActive]}>{i + 1}</Text>}
          </TouchableOpacity>
        </React.Fragment>
      ))}
    </View>
  );

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <ArrowLeft size={24} color={colors.text} weight="bold" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{STEP_TITLES[step]}</Text>
        </View>
        {renderStepIndicator()}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {step === 0 && renderStep1()}
        {step === 1 && renderStep2()}
        {step === 2 && renderStep3()}
        {step === 3 && renderReview()}
      </ScrollView>

      <View style={s.navBar}>
        {step > 0 ? (
          <TouchableOpacity style={s.navBtn} onPress={() => setStep(step - 1)}>
            <CaretLeft size={18} color={colors.textSecondary} weight="bold" />
            <Text style={s.navBtnText}>{isNl ? 'Vorige' : 'Back'}</Text>
          </TouchableOpacity>
        ) : <View />}
        {step < 3 ? (
          <TouchableOpacity
            style={[s.navBtn, s.navBtnPrimary, !canAdvance() && s.navBtnDisabled]}
            disabled={!canAdvance()}
            onPress={() => setStep(step + 1)}
          >
            <Text style={[s.navBtnText, s.navBtnTextPrimary]}>
              {isNl ? 'Volgende' : 'Next'}
            </Text>
            <CaretRight size={18} color="#fff" weight="bold" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.navBtn, s.navBtnPrimary, submitting && s.navBtnDisabled]}
            disabled={submitting}
            onPress={handleActivate}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : (
                <>
                  <FlagCheckered size={16} color="#fff" weight="fill" />
                  <Text style={[s.navBtnText, s.navBtnTextPrimary]}>
                    {isNl ? 'Activeer doel' : 'Activate Goal'}
                  </Text>
                </>
              )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
