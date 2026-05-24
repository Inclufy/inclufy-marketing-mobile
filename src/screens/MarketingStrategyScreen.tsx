// TODO: migrate to Phosphor — unmapped icons: MaterialCommunityIcons name=<dynamic: ch.icon> | MaterialCommunityIcons name=<dynamic: g.icon> | MaterialCommunityIcons name=<dynamic: opt.key === 'conservative' ? 'shield-check' : opt.key === 'balanced' ? 'scale-balance' : 'rocket-launch'>
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Alert, Platform, Switch, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { ArrowLeft, CaretLeft, CaretRight, Check, FlagCheckered, UsersThree } from 'phosphor-react-native';
import {
  useMarketingStrategy, useUpdateMarketingStrategy,
  MarketingStrategy, ChannelConfig,
} from '../hooks/useMarketingStrategy';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const GOALS = [
  { key: 'brand_awareness', label: 'Brand Awareness', icon: 'trending-up' as const, color: '#3B82F6' },
  { key: 'lead_gen', label: 'Lead Generatie', icon: 'account-search' as const, color: '#10B981' },
  { key: 'event_promo', label: 'Event Promotie', icon: 'calendar-star' as const, color: '#9333EA' },
  { key: 'thought_leadership', label: 'Thought Leadership', icon: 'lightbulb-on' as const, color: '#F59E0B' },
  { key: 'sales', label: 'Sales', icon: 'cart' as const, color: '#EF4444' },
  { key: 'community', label: 'Community', icon: 'account-group' as const, color: '#EC4899' },
];

const CHANNELS = [
  { key: 'linkedin', label: 'LinkedIn', icon: 'linkedin' as const, color: '#0A66C2' },
  { key: 'instagram', label: 'Instagram', icon: 'instagram' as const, color: '#E1306C' },
  { key: 'x', label: 'X', icon: 'twitter' as const, color: '#1DA1F2' },
  { key: 'facebook', label: 'Facebook', icon: 'facebook' as const, color: '#1877F2' },
  { key: 'tiktok', label: 'TikTok', icon: 'music-note' as const, color: '#000000' },
];

const BUDGET_CATS = [
  { key: 'content', label: 'Content Creatie', default: 30 },
  { key: 'ads', label: 'Advertenties', default: 40 },
  { key: 'events', label: 'Events', default: 20 },
  { key: 'tools', label: 'Tools & Software', default: 10 },
];

const CONTENT_MIX = [
  { key: 'educational', label: 'Educatief', default: 30 },
  { key: 'promotional', label: 'Promotioneel', default: 25 },
  { key: 'behind_scenes', label: 'Behind the Scenes', default: 20 },
  { key: 'thought_leadership', label: 'Thought Leadership', default: 15 },
  { key: 'user_generated', label: 'User-Generated', default: 10 },
];

const MONTHS = [
  { key: 'jan', label: 'Januari' }, { key: 'feb', label: 'Februari' },
  { key: 'mrt', label: 'Maart' }, { key: 'apr', label: 'April' },
  { key: 'mei', label: 'Mei' }, { key: 'jun', label: 'Juni' },
  { key: 'jul', label: 'Juli' }, { key: 'aug', label: 'Augustus' },
  { key: 'sep', label: 'September' }, { key: 'okt', label: 'Oktober' },
  { key: 'nov', label: 'November' }, { key: 'dec', label: 'December' },
];

const DAYS = [
  { key: 'ma', label: 'Ma' }, { key: 'di', label: 'Di' }, { key: 'wo', label: 'Wo' },
  { key: 'do', label: 'Do' }, { key: 'vr', label: 'Vr' }, { key: 'za', label: 'Za' },
  { key: 'zo', label: 'Zo' },
];

const AUTONOMY_OPTIONS = [
  { key: 'conservative' as const, label: 'Conservatief', desc: 'Altijd goedkeuring', color: '#10B981' },
  { key: 'balanced' as const, label: 'Balanced', desc: 'AI binnen grenzen', color: '#3B82F6' },
  { key: 'aggressive' as const, label: 'Agressief', desc: 'Volledig autonoom', color: '#9333EA' },
];

const STEP_TITLES = ['Doelen & Budget', 'Kanalen & Content', 'Planning & Autonomie'];
const R = 'row' as const;
const C = 'center' as const;
const SB = 'space-between' as const;

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function adjustPct(obj: Record<string, number>, key: string, delta: number): Record<string, number> {
  return { ...obj, [key]: clamp((obj[key] || 0) + delta, 0, 100) };
}

function totalPct(obj: Record<string, number>) {
  return Object.values(obj).reduce((s, v) => s + v, 0);
}

export default function MarketingStrategyScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { data: existing, isLoading } = useMarketingStrategy();
  const updateMutation = useUpdateMarketingStrategy();
  const [step, setStep] = useState(0);

  // Step 1 state
  const [goals, setGoals] = useState<string[]>([]);
  const [primaryGoal, setPrimaryGoal] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState('2000');
  const [budgetAlloc, setBudgetAlloc] = useState<Record<string, number>>(
    Object.fromEntries(BUDGET_CATS.map(c => [c.key, c.default])),
  );
  // Step 2 state
  const [channels, setChannels] = useState<Record<string, ChannelConfig>>(
    Object.fromEntries(CHANNELS.map(c => [c.key, { active: false, posts_per_week: 3, budget_pct: 20 }])),
  );
  const [contentMix, setContentMix] = useState<Record<string, number>>(
    Object.fromEntries(CONTENT_MIX.map(c => [c.key, c.default])),
  );
  // Step 3 state
  const [peakMonths, setPeakMonths] = useState<string[]>([]);
  const [postingDays, setPostingDays] = useState<string[]>(['ma', 'di', 'wo', 'do', 'vr']);
  const [eventsPerQuarter, setEventsPerQuarter] = useState(2);
  const [autonomyLevel, setAutonomyLevel] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');
  const [autoPublish, setAutoPublish] = useState(false);
  const [requireApproval, setRequireApproval] = useState(true);

  useEffect(() => {
    if (!existing) return;
    if (existing.goals?.length) setGoals(existing.goals);
    if (existing.primary_goal) setPrimaryGoal(existing.primary_goal);
    if (existing.monthly_budget) setMonthlyBudget(String(existing.monthly_budget));
    if (existing.budget_allocation) setBudgetAlloc(existing.budget_allocation);
    if (existing.channels) setChannels(existing.channels);
    if (existing.content_mix) setContentMix(existing.content_mix);
    if (existing.peak_months) setPeakMonths(existing.peak_months);
    if (existing.posting_days) setPostingDays(existing.posting_days);
    if (existing.events_per_quarter != null) setEventsPerQuarter(existing.events_per_quarter);
    if (existing.autonomy_level) setAutonomyLevel(existing.autonomy_level);
    if (existing.auto_publish != null) setAutoPublish(existing.auto_publish);
    if (existing.require_approval != null) setRequireApproval(existing.require_approval);
  }, [existing]);

  const totalPostsPerWeek = Object.values(channels).filter(ch => ch.active).reduce((s, ch) => s + ch.posts_per_week, 0);

  const toggleGoal = (key: string) => {
    setGoals(prev => {
      const next = prev.includes(key) ? prev.filter(g => g !== key) : [...prev, key];
      if (!next.includes(primaryGoal)) setPrimaryGoal(next[0] || '');
      return next;
    });
  };

  const toggleMulti = (arr: string[], key: string): string[] =>
    arr.includes(key) ? arr.filter(a => a !== key) : [...arr, key];

  const updateChannel = (key: string, patch: Partial<ChannelConfig>) =>
    setChannels(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const handleSave = async () => {
    const payload: Partial<MarketingStrategy> = {
      goals, primary_goal: primaryGoal, channels,
      monthly_budget: Number(monthlyBudget) || 0, budget_allocation: budgetAlloc,
      content_mix: contentMix, posts_per_week: totalPostsPerWeek,
      events_per_quarter: eventsPerQuarter, event_budget_pct: budgetAlloc.events || 0,
      peak_months: peakMonths, posting_days: postingDays, posting_times: {},
      autonomy_level: autonomyLevel, auto_publish: autoPublish,
      require_approval: requireApproval, is_active: true,
    };
    try {
      await updateMutation.mutateAsync(payload);
      Alert.alert('Opgeslagen', 'Je marketingstrategie is bijgewerkt.');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Fout', e?.message || 'Kon strategie niet opslaan.');
    }
  };

  const s = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    headerRow: { flexDirection: R, alignItems: C, gap: spacing.sm },
    headerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: c.text, flex: 1 },
    stepRow: { flexDirection: R, alignItems: C, justifyContent: C, paddingVertical: spacing.sm },
    stepCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: C, alignItems: C, borderWidth: 2, borderColor: c.border, backgroundColor: c.background },
    stepCircleActive: { borderColor: '#7C3AED', backgroundColor: '#7C3AED' },
    stepCircleDone: { borderColor: '#9333EA', backgroundColor: '#9333EA' },
    stepNum: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: c.textTertiary },
    stepNumActive: { color: '#fff' },
    stepLine: { width: 40, height: 2, backgroundColor: c.border },
    stepLineDone: { backgroundColor: '#9333EA' },
    scroll: { flex: 1 },
    scrollContent: { padding: spacing.md, gap: spacing.md, paddingBottom: 120 },
    section: { backgroundColor: c.surface, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm, ...subtleShadow },
    sectionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: c.text },
    sectionSub: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: -4 },
    sectionHint: { fontSize: fontSize.xs, marginTop: -4, marginBottom: spacing.xs },
    personasBtn: {
      flexDirection: R, alignItems: C, gap: spacing.sm,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      borderRadius: borderRadius.md, borderWidth: 1,
    },
    personasBtnText: { flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
    personasBtnArrow: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
    goalsGrid: { flexDirection: R, flexWrap: 'wrap' as const, gap: spacing.sm },
    goalChip: { width: '47%' as any, flexDirection: R, alignItems: C, gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.background },
    goalLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: c.text, flex: 1 },
    radioRow: { flexDirection: R, alignItems: C, gap: spacing.sm, paddingVertical: 4 },
    radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: c.border, justifyContent: C, alignItems: C },
    radioInner: { width: 10, height: 10, borderRadius: 5 },
    radioLabel: { fontSize: fontSize.sm, color: c.text, fontWeight: fontWeight.medium },
    budgetRow: { flexDirection: R, alignItems: C, gap: spacing.xs },
    euroSign: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: c.text },
    budgetInput: { flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: c.text, backgroundColor: c.background, borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, borderColor: c.border },
    pctRow: { flexDirection: R, alignItems: C, gap: spacing.xs },
    pctLabel: { width: 110, fontSize: fontSize.xs, color: c.text, fontWeight: fontWeight.medium },
    pctBarBg: { flex: 1, height: 8, backgroundColor: c.background, borderRadius: 4, overflow: 'hidden' as const },
    pctValue: { width: 36, fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: c.text, textAlign: 'right' as const },
    pctBtns: { flexDirection: R, gap: 2 },
    pctBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.background, borderWidth: 1, borderColor: c.border, justifyContent: C, alignItems: C },
    pctBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: c.text },
    totalRow: { flexDirection: R, justifyContent: SB, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: c.border },
    totalLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: c.text },
    totalWarn: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: c.error },
    channelCard: { backgroundColor: c.background, borderRadius: borderRadius.md, padding: spacing.sm, gap: spacing.xs, borderWidth: 1, borderColor: c.border },
    channelHeader: { flexDirection: R, alignItems: C, justifyContent: SB },
    channelLeft: { flexDirection: R, alignItems: C, gap: spacing.xs },
    channelName: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: c.text },
    stepper: { flexDirection: R, alignItems: C, gap: spacing.xs },
    stepperBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, justifyContent: C, alignItems: C },
    stepperVal: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: c.text, minWidth: 24, textAlign: C },
    stepperLabel: { fontSize: fontSize.xs, color: c.textSecondary, marginLeft: spacing.xs },
    chipsWrap: { flexDirection: R, flexWrap: 'wrap' as const, gap: spacing.xs },
    chip: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: borderRadius.full, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.background },
    chipLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: c.textSecondary },
    chipLabelActive: { fontWeight: fontWeight.bold },
    autonomyRow: { flexDirection: R, gap: spacing.xs },
    autonomyBtn: { flex: 1, borderWidth: 1.5, borderColor: c.border, borderRadius: borderRadius.md, padding: spacing.sm, alignItems: C, gap: 4 },
    autonomyLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: c.textSecondary },
    autonomyDesc: { fontSize: 9, color: c.textTertiary, textAlign: C },
    toggleRow: { flexDirection: R, alignItems: C, justifyContent: SB, paddingVertical: spacing.xs },
    toggleInfo: { flex: 1, marginRight: spacing.sm },
    toggleTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: c.text },
    toggleDesc: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 2 },
    postsTotal: { backgroundColor: c.primary + '15', borderRadius: borderRadius.md, padding: spacing.sm, alignItems: C },
    postsTotalNum: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.primary },
    postsTotalLabel: { fontSize: fontSize.xs, color: c.textSecondary },
    navBar: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, flexDirection: R, justifyContent: SB, alignItems: C, padding: spacing.md, paddingBottom: Platform.OS === 'ios' ? 34 : spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
    navBtn: { flexDirection: R, alignItems: C, gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full, borderWidth: 1, borderColor: c.border },
    navBtnPrimary: { backgroundColor: c.primary, borderColor: c.primary },
    navBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: c.textSecondary },
    navBtnTextPrimary: { color: '#fff' },
    loader: { flex: 1, justifyContent: C, alignItems: C },
  }));

  // ── Shared sub-renderers ─────────────────────────────────────────────────

  const renderStepIndicator = () => (
    <View style={s.stepRow}>
      {[0, 1, 2].map((i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={[s.stepLine, step > i - 1 && s.stepLineDone]} />}
          <TouchableOpacity
            style={[s.stepCircle, step === i && s.stepCircleActive, step > i && s.stepCircleDone]}
            onPress={() => setStep(i)}
          >
            {step > i
              ? <Check size={16} color="#fff" weight="bold" />
              : <Text style={[s.stepNum, (step >= i && step === i) && s.stepNumActive]}>{i + 1}</Text>}
          </TouchableOpacity>
        </React.Fragment>
      ))}
    </View>
  );

  const renderPctRow = (
    items: { key: string; label: string }[],
    data: Record<string, number>,
    setData: (v: Record<string, number>) => void,
    barColor: string,
  ) => (
    <>
      {items.map(({ key, label }) => (
        <View key={key} style={s.pctRow}>
          <Text style={s.pctLabel}>{label}</Text>
          <View style={s.pctBarBg}>
            <View style={{ width: `${clamp(data[key] || 0, 0, 100)}%`, height: '100%', backgroundColor: barColor, borderRadius: 4 }} />
          </View>
          <Text style={s.pctValue}>{data[key] || 0}%</Text>
          <View style={s.pctBtns}>
            <TouchableOpacity style={s.pctBtn} onPress={() => setData(adjustPct(data, key, -5))}>
              <Text style={s.pctBtnText}>-</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.pctBtn} onPress={() => setData(adjustPct(data, key, 5))}>
              <Text style={s.pctBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <View style={s.totalRow}>
        <Text style={s.totalLabel}>Totaal</Text>
        <Text style={totalPct(data) === 100 ? s.totalLabel : s.totalWarn}>
          {totalPct(data)}%{totalPct(data) !== 100 ? ' (moet 100% zijn)' : ''}
        </Text>
      </View>
    </>
  );

  const renderStepper = (value: number, onChange: (v: number) => void, min: number, max: number, label?: string) => (
    <View style={s.stepper}>
      <TouchableOpacity style={s.stepperBtn} onPress={() => onChange(clamp(value - 1, min, max))}>
        <Text style={s.pctBtnText}>-</Text>
      </TouchableOpacity>
      <Text style={s.stepperVal}>{value}</Text>
      <TouchableOpacity style={s.stepperBtn} onPress={() => onChange(clamp(value + 1, min, max))}>
        <Text style={s.pctBtnText}>+</Text>
      </TouchableOpacity>
      {label ? <Text style={s.stepperLabel}>{label}</Text> : null}
    </View>
  );

  // ── Step 1: Doelen & Budget ──────────────────────────────────────────────

  const renderStep1 = () => (
    <>
      <View style={s.section}>
        <Text style={s.sectionTitle}>Doelen</Text>
        <Text style={s.sectionSub}>Selecteer je marketingdoelen</Text>
        <View style={s.goalsGrid}>
          {GOALS.map(g => {
            const sel = goals.includes(g.key);
            return (
              <TouchableOpacity key={g.key} style={[s.goalChip, sel && { borderColor: g.color, backgroundColor: g.color + '15' }]} onPress={() => toggleGoal(g.key)}>
                <MaterialCommunityIcons name={g.icon} size={18} color={sel ? g.color : colors.textTertiary} />
                <Text style={[s.goalLabel, sel && { color: g.color }]}>{g.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {goals.length > 1 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Primair Doel</Text>
          {goals.map(gKey => {
            const g = GOALS.find(x => x.key === gKey);
            if (!g) return null;
            const sel = primaryGoal === gKey;
            return (
              <TouchableOpacity key={gKey} style={s.radioRow} onPress={() => setPrimaryGoal(gKey)}>
                <View style={[s.radioOuter, sel && { borderColor: g.color }]}>
                  {sel && <View style={[s.radioInner, { backgroundColor: g.color }]} />}
                </View>
                <Text style={s.radioLabel}>{g.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Maandelijks Budget</Text>
        <View style={s.budgetRow}>
          <Text style={s.euroSign}>&euro;</Text>
          <TextInput style={s.budgetInput} value={monthlyBudget} onChangeText={setMonthlyBudget} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textTertiary} />
        </View>
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>Budget Verdeling</Text>
        {renderPctRow(BUDGET_CATS, budgetAlloc, setBudgetAlloc, colors.primary)}
      </View>
    </>
  );

  // ── Step 2: Kanalen & Content ────────────────────────────────────────────

  const renderStep2 = () => (
    <>
      <View style={s.section}>
        <Text style={s.sectionTitle}>Kanalen</Text>
        {CHANNELS.map(ch => {
          const cfg = channels[ch.key] || { active: false, posts_per_week: 3, budget_pct: 20 };
          return (
            <View key={ch.key} style={[s.channelCard, cfg.active && { borderColor: ch.color }]}>
              <View style={s.channelHeader}>
                <View style={s.channelLeft}>
                  <MaterialCommunityIcons name={ch.icon} size={20} color={cfg.active ? ch.color : colors.textTertiary} />
                  <Text style={s.channelName}>{ch.label}</Text>
                </View>
                <Switch value={cfg.active} onValueChange={(v) => updateChannel(ch.key, { active: v })} trackColor={{ false: colors.border, true: ch.color + '60' }} thumbColor={cfg.active ? ch.color : colors.textTertiary} />
              </View>
              {cfg.active && (
                <View style={{ gap: spacing.xs, paddingTop: spacing.xs }}>
                  {renderStepper(cfg.posts_per_week, (v) => updateChannel(ch.key, { posts_per_week: v }), 1, 14, 'posts/week')}
                  <View style={s.pctRow}>
                    <Text style={s.pctLabel}>Budget %</Text>
                    <View style={s.pctBtns}>
                      <TouchableOpacity style={s.pctBtn} onPress={() => updateChannel(ch.key, { budget_pct: clamp(cfg.budget_pct - 5, 0, 100) })}>
                        <Text style={s.pctBtnText}>-</Text>
                      </TouchableOpacity>
                      <Text style={s.pctValue}>{cfg.budget_pct}%</Text>
                      <TouchableOpacity style={s.pctBtn} onPress={() => updateChannel(ch.key, { budget_pct: clamp(cfg.budget_pct + 5, 0, 100) })}>
                        <Text style={s.pctBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>Content Mix</Text>
        {renderPctRow(CONTENT_MIX, contentMix, setContentMix, '#9333EA')}
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>Doelgroep persona's</Text>
        <Text style={[s.sectionHint, { color: colors.textSecondary }]}>
          Beschrijf wie je bereikt per kanaal — gebruikt door de channel-fit check op posts.
        </Text>
        <TouchableOpacity
          style={[s.personasBtn, { borderColor: colors.border }]}
          onPress={() => navigation.navigate('Personas')}
        >
          <UsersThree size={20} color={colors.primary} weight="duotone" />
          <Text style={[s.personasBtnText, { color: colors.text }]}>
            {existing?.personas?.length
              ? `${existing.personas.length} persona${existing.personas.length === 1 ? '' : "'s"} ingesteld`
              : "Persona's beheren"}
          </Text>
          <Text style={[s.personasBtnArrow, { color: colors.primary }]}>→</Text>
        </TouchableOpacity>
      </View>
      <View style={s.postsTotal}>
        <Text style={s.postsTotalNum}>{totalPostsPerWeek}</Text>
        <Text style={s.postsTotalLabel}>Totaal posts per week</Text>
      </View>
    </>
  );

  // ── Step 3: Planning & Autonomie ─────────────────────────────────────────

  const renderStep3 = () => (
    <>
      <View style={s.section}>
        <Text style={s.sectionTitle}>Piekmaanden</Text>
        <View style={s.chipsWrap}>
          {MONTHS.map(m => {
            const sel = peakMonths.includes(m.key);
            return (
              <TouchableOpacity key={m.key} style={[s.chip, sel && { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]} onPress={() => setPeakMonths(toggleMulti(peakMonths, m.key))}>
                <Text style={[s.chipLabel, sel && { color: colors.primary, ...s.chipLabelActive }]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>Postdagen</Text>
        <View style={s.chipsWrap}>
          {DAYS.map(d => {
            const sel = postingDays.includes(d.key);
            return (
              <TouchableOpacity key={d.key} style={[s.chip, sel && { borderColor: '#3B82F6', backgroundColor: '#3B82F620' }]} onPress={() => setPostingDays(toggleMulti(postingDays, d.key))}>
                <Text style={[s.chipLabel, sel && { color: '#3B82F6', ...s.chipLabelActive }]}>{d.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>Events per Kwartaal</Text>
        {renderStepper(eventsPerQuarter, setEventsPerQuarter, 0, 10)}
      </View>
      <View style={s.section}>
        <Text style={s.sectionTitle}>Autonomie Niveau</Text>
        <View style={s.autonomyRow}>
          {AUTONOMY_OPTIONS.map(opt => {
            const sel = autonomyLevel === opt.key;
            return (
              <TouchableOpacity key={opt.key} style={[s.autonomyBtn, sel && { borderColor: opt.color, backgroundColor: opt.color + '15' }]} onPress={() => setAutonomyLevel(opt.key)}>
                <MaterialCommunityIcons name={opt.key === 'conservative' ? 'shield-check' : opt.key === 'balanced' ? 'scale-balance' : 'rocket-launch'} size={22} color={sel ? opt.color : colors.textTertiary} />
                <Text style={[s.autonomyLabel, sel && { color: opt.color }]}>{opt.label}</Text>
                <Text style={s.autonomyDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={s.section}>
        <View style={s.toggleRow}>
          <View style={s.toggleInfo}>
            <Text style={s.toggleTitle}>Automatisch Publiceren</Text>
            <Text style={s.toggleDesc}>Posts worden automatisch gepubliceerd op schema</Text>
          </View>
          <Switch value={autoPublish} onValueChange={setAutoPublish} trackColor={{ false: colors.border, true: colors.primary + '60' }} thumbColor={autoPublish ? colors.primary : colors.textTertiary} />
        </View>
        <View style={s.toggleRow}>
          <View style={s.toggleInfo}>
            <Text style={s.toggleTitle}>Goedkeuring Vereist</Text>
            <Text style={s.toggleDesc}>Beoordeel content voordat het live gaat</Text>
          </View>
          <Switch value={requireApproval} onValueChange={setRequireApproval} trackColor={{ false: colors.border, true: colors.primary + '60' }} thumbColor={requireApproval ? colors.primary : colors.textTertiary} />
        </View>
      </View>
      {/* ── Goal Mode CTA (Tier-2) ────────────────────────────────────── */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          // Map strategy primary_goal → Goal Mode metric. Per design risk #1
          // there is no 'leads' metric in v1, so lead_gen falls back to undef
          // (the wizard defaults to event_attendees).
          const metricMap: Record<string, 'event_attendees' | 'revenue_eur' | 'posts_published' | 'roas' | 'followers'> = {
            event_promo: 'event_attendees',
            sales: 'revenue_eur',
            brand_awareness: 'followers',
            community: 'followers',
            thought_leadership: 'posts_published',
          };
          const metric = metricMap[primaryGoal];
          // Quarter spans 3 months → roughly 3× monthly budget.
          const budget3mo = Math.max(0, (Number(monthlyBudget) || 0) * 3);
          // Map strategy autonomy → Goal autonomy (1:1 keys).
          const autonomy: 'conservative' | 'balanced' | 'aggressive' = autonomyLevel;
          // Active strategy channels → agent kinds (loose mapping).
          const hasActiveChannel = Object.values(channels).some(ch => ch.active);
          const agentKinds: Array<'ads' | 'content' | 'social' | 'analytics' | 'lead'> =
            hasActiveChannel ? ['ads', 'content', 'social'] : ['content', 'social'];

          const today = new Date();
          const q = Math.floor(today.getMonth() / 3);
          const ps = new Date(today.getFullYear(), q * 3, 1);
          const pe = new Date(today.getFullYear(), q * 3 + 3, 0);
          const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

          navigation.navigate('GoalSetup', {
            prefill: {
              metric,
              budget_eur: budget3mo,
              period_start: fmt(ps),
              period_end: fmt(pe),
              agent_kinds: agentKinds,
              autonomy_level: autonomy,
            },
          });
        }}
        style={[
          s.section,
          {
            borderWidth: 1.5, borderColor: '#F97316',
            backgroundColor: '#F9731612',
            flexDirection: R, alignItems: C, gap: spacing.sm,
          },
        ]}
      >
        <View style={{
          width: 36, height: 36, borderRadius: 10,
          backgroundColor: '#F9731622',
          justifyContent: C, alignItems: C,
        }}>
          <FlagCheckered size={20} color="#F97316" weight="fill" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.sectionTitle, { color: '#EA580C' }]}>
            Activeer Goal Mode
          </Text>
          <Text style={s.sectionSub}>
            Eén kwartaaldoel met automatische agent inzet binnen je budget.
          </Text>
        </View>
        <CaretRight size={22} color="#F97316" weight="bold" />
      </TouchableOpacity>
    </>
  );

  // ── Main render ──────────────────────────────────────────────────────────

  if (isLoading) {
    return <View style={[s.container, s.loader]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

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
      </ScrollView>
      <View style={s.navBar}>
        {step > 0 ? (
          <TouchableOpacity style={s.navBtn} onPress={() => setStep(step - 1)}>
            <CaretLeft size={18} color={colors.textSecondary} weight="bold" />
            <Text style={s.navBtnText}>Vorige</Text>
          </TouchableOpacity>
        ) : <View />}
        {step < 2 ? (
          <TouchableOpacity style={[s.navBtn, s.navBtnPrimary]} onPress={() => setStep(step + 1)}>
            <Text style={[s.navBtnText, s.navBtnTextPrimary]}>Volgende</Text>
            <CaretRight size={18} color="#fff" weight="bold" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.navBtn, s.navBtnPrimary]} onPress={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={[s.navBtnText, s.navBtnTextPrimary]}>Opslaan</Text>}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
