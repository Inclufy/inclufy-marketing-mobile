// TODO: migrate to Phosphor — unmapped icons: MaterialCommunityIcons name=<dynamic: strategy.auto_publish ? 'rocket-launch' : 'shield-check-outline'>
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, ActivityIndicator, RefreshControl, Platform, StatusBar,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { useTranslation } from '../i18n';
import { useMarketingStrategy } from '../hooks/useMarketingStrategy';
import { useProposalStats, useTrustScore } from '../hooks/useContentProposals';
import { useAutomationStats } from '../hooks/useAutomations';

import { Brain, CaretLeft, CaretRight, ChartLineUp, Megaphone, NotePencil, PencilLine, PencilSimple, RadioButton, Radioactive, Robot, SealCheck } from 'phosphor-react-native';
interface Decision {
  id: string;
  type: string;
  title: string;
  description: string;
  impact: string;
  status: string;
  created_at: string;
}

interface ActiveCampaign {
  id: string;
  name: string;
  status: string;
  ai_generated: boolean;
}

function formatDate(iso: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

export default function AutonomousHubScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [systemActive, setSystemActive] = useState(true);
  const { data: strategy } = useMarketingStrategy();
  const { data: proposalStats } = useProposalStats();
  const { data: autoStats } = useAutomationStats();
  const { data: trust } = useTrustScore();
  const [autonomyLevel, setAutonomyLevel] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');

  // ── Real health & success rate calculation ──
  // Health = weighted score: strategy (25%) + channels (25%) + proposals pipeline (25%) + automations (25%)
  const healthScore = (() => {
    let score = 0;
    // Has strategy? +25
    if (strategy) score += 25;
    // Has active channels? +25
    const activeChannels = strategy ? Object.values(strategy.channels ?? {}).filter((c: any) => c.active).length : 0;
    if (activeChannels > 0) score += 25;
    // Has proposals in pipeline? +25
    const proposalPipeline = (proposalStats?.pending ?? 0) + (proposalStats?.approved ?? 0);
    if (proposalPipeline > 0) score += 25;
    // Has active automations? +25
    if ((autoStats?.activeCount ?? 0) > 0) score += 25;
    return score;
  })();

  // Success rate from automation stats
  const successRate = autoStats?.successRate ?? 0;

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: { padding: spacing.md, gap: spacing.sm, paddingTop: 0 },
    headerTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
    headerIcon: {
      width: 44, height: 44, borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.15)',
      justifyContent: 'center' as const, alignItems: 'center' as const,
    },
    headerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: '#fff' },
    headerSub: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.7)' },
    systemToggle: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
    systemLabel: { fontSize: fontSize.xs, color: '#fff', fontWeight: fontWeight.medium },
    statsRow: { flexDirection: 'row' as const, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: borderRadius.md, padding: spacing.sm },
    statItem: { flex: 1, alignItems: 'center' as const },
    statValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: '#fff' },
    statLabel: { fontSize: 9, color: 'rgba(255,255,255,0.65)', marginTop: 2, textAlign: 'center' as const },
    content: { padding: spacing.md, gap: spacing.md },
    section: {
      backgroundColor: c.surface, borderRadius: borderRadius.lg,
      padding: spacing.md, gap: spacing.sm, ...subtleShadow,
    },
    sectionHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
    sectionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: c.text },
    seeAll: { fontSize: fontSize.sm, color: c.primary, fontWeight: fontWeight.medium },
    autonomyRow: { flexDirection: 'row' as const, gap: spacing.xs },
    autonomyBtn: {
      flex: 1, borderWidth: 1.5, borderColor: c.border,
      borderRadius: borderRadius.md, padding: spacing.sm, alignItems: 'center' as const, gap: 2,
    },
    autonomyLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: c.textSecondary },
    autonomyDesc: { fontSize: 9, color: c.textTertiary, textAlign: 'center' as const },
    decisionCard: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm,
      backgroundColor: c.background, borderRadius: borderRadius.sm, padding: spacing.sm,
    },
    decisionLeft: { flex: 1, flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: spacing.xs },
    urgencyDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
    decisionTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: c.text, lineHeight: 18 },
    decisionDesc: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 2 },
    decisionValue: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: c.success },
    emptySmall: { alignItems: 'center' as const, gap: spacing.sm, padding: spacing.sm },
    emptySmallText: { fontSize: fontSize.sm, color: c.textSecondary, textAlign: 'center' as const },
    createBtn: {
      backgroundColor: c.primary, borderRadius: borderRadius.full,
      paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    },
    createBtnText: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.sm },
    campaignRow: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm,
      backgroundColor: c.background, borderRadius: borderRadius.sm, padding: spacing.sm,
    },
    campaignStatus: { width: 8, height: 8, borderRadius: 4 },
    campaignName: { flex: 1, fontSize: fontSize.sm, color: c.text, fontWeight: fontWeight.medium },
    campaignBadges: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
    aiBadge: { backgroundColor: c.primary + '20', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
    aiBadgeText: { fontSize: 9, color: c.primary, fontWeight: fontWeight.bold },
    campaignStatusText: { fontSize: fontSize.xs, color: c.textSecondary },
    modulesGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
    moduleCard: {
      width: '47%', backgroundColor: c.background,
      borderRadius: borderRadius.md, padding: spacing.sm, gap: 4,
    },
    moduleInactive: { opacity: 0.55 },
    moduleIcon: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center' as const, alignItems: 'center' as const },
    moduleName: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: c.text },
    moduleNameInactive: { color: c.textTertiary },
    moduleDesc: { fontSize: 10, color: c.textSecondary },
    moduleStatus: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' as const },
    moduleDot: { width: 5, height: 5, borderRadius: 3 },
    moduleStatusText: { fontSize: 9, fontWeight: fontWeight.semibold },
    quickActions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
    quickBtn: {
      width: '47%', flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs,
      backgroundColor: c.background, borderRadius: borderRadius.md,
      padding: spacing.sm, borderWidth: 1, borderColor: c.border,
    },
    quickBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: c.text, flex: 1 },
    navRow: {
      flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const,
      paddingTop: Platform.OS === 'ios' ? 48 : (StatusBar.currentHeight || 24) + 8,
      paddingHorizontal: 4,
    },
    backBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2, padding: 8 },
    backLabel: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.medium },
    strategyBanner: {
      backgroundColor: c.surface, borderRadius: borderRadius.lg,
      padding: spacing.md, ...subtleShadow, borderLeftWidth: 4, borderLeftColor: '#059669',
    },
    strategyBannerTitle: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
    strategyBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
    strategyStats: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.sm },
    strategyStat: { flex: 1, backgroundColor: c.background, borderRadius: borderRadius.md, padding: spacing.sm, alignItems: 'center' as const },
    strategyStatValue: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: c.text },
    strategyStatLabel: { fontSize: 10, color: c.textSecondary, marginTop: 2 },
    strategyCta: {
      backgroundColor: '#05966918', borderRadius: borderRadius.lg, borderWidth: 1.5, borderColor: '#05966940',
      padding: spacing.md, alignItems: 'center' as const, gap: spacing.sm,
    },
  }));

  // Navigate to a screen — try current navigator first, fall back to parent (root stack)
  const navigateTo = (screen: string, params?: object) => {
    try {
      navigation.navigate(screen as any, params as any);
    } catch {
      try { (navigation.getParent() as any)?.navigate(screen, params); } catch { /* noop */ }
    }
  };

  // Fetch real data from Supabase
  const { data: campaigns = [], isLoading: loadingCampaigns, refetch } = useQuery({
    queryKey: ['autonomous_campaigns'],
    queryFn: async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return [];
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, status, ai_generated')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) return [];
      return (data || []) as ActiveCampaign[];
    },
  });

  const { data: feedItems = [] } = useQuery({
    queryKey: ['feed_items_hub'],
    queryFn: async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return [];
      const { data } = await supabase
        .from('feed_items')
        .select('id, type, title, description, urgency, estimated_value, is_actioned, timestamp')
        .eq('user_id', user.id)
        .eq('urgency', 'immediate')
        .eq('is_actioned', false)
        .order('created_at', { ascending: false })
        .limit(3);
      return data || [];
    },
  });

  const actionedCount = feedItems.filter((f: any) => f.is_actioned).length;
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;

  const AUTONOMY_OPTIONS = [
    { key: 'conservative', label: t.autonomousHub.conservative, desc: t.autonomousHub.conservativeDesc, color: '#10B981' },
    { key: 'balanced', label: t.autonomousHub.balanced, desc: t.autonomousHub.balancedDesc, color: '#3B82F6' },
    { key: 'aggressive', label: t.autonomousHub.aggressive, desc: t.autonomousHub.aggressiveDesc, color: '#9333EA' },
  ] as const;

  const AI_MODULES = [
    { icon: 'trending-up', label: t.autonomousHub.modTrendMonitoring, desc: t.autonomousHub.modTrendMonitoringDesc, active: true, color: '#EC4899', lib: 'ion' as const },
    { icon: 'megaphone', label: t.autonomousHub.modCampaignEngine, desc: `${activeCampaigns} ${t.autonomousHub.modCampaignEngineDesc}`, active: activeCampaigns > 0, color: '#3B82F6', lib: 'ion' as const },
    { icon: 'people', label: t.autonomousHub.modLeadScoring, desc: t.autonomousHub.modLeadScoringDesc, active: true, color: '#8B5CF6', lib: 'ion' as const },
    { icon: 'calendar', label: t.autonomousHub.modEventIntelligence, desc: t.autonomousHub.modEventIntelligenceDesc, active: true, color: '#10B981', lib: 'ion' as const },
    { icon: 'robot-outline', label: t.autonomousHub.modContentAI, desc: t.autonomousHub.modContentAIDesc, active: true, color: '#F59E0B', lib: 'mci' as const },
    { icon: 'bar-chart', label: t.autonomousHub.modBudgetOptimizer, desc: t.autonomousHub.modBudgetOptimizerDesc, active: false, color: '#06B6D4', lib: 'ion' as const },
  ];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loadingCampaigns} onRefresh={refetch} tintColor={colors.primary} />}
    >
      {/* Gradient Header */}
      <LinearGradient
        colors={['#1E0A4E', '#4C1D95', '#7C3AED']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        {/* Back button row */}
        <View style={styles.navRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <CaretLeft size={20} color="#fff" weight="bold" />
            <Text style={styles.backLabel}>{t.common.back}</Text>
          </TouchableOpacity>
          <View style={styles.systemToggle}>
            <Text style={styles.systemLabel}>{systemActive ? t.autonomousHub.active : t.autonomousHub.off}</Text>
            <Switch
              value={systemActive}
              onValueChange={setSystemActive}
              trackColor={{ true: '#10B981', false: '#374151' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <View style={styles.headerTop}>
          <View style={styles.headerIcon}>
            <Brain size={24} color="#fff" weight="duotone" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{t.autonomousHub.title}</Text>
            <Text style={styles.headerSub}>{t.autonomousHub.sub}</Text>
          </View>
        </View>

        {/* Stats — shortened labels to prevent wrapping */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{healthScore}%</Text>
            <Text style={styles.statLabel}>{t.autonomousHub.health}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{feedItems.length + (proposalStats?.pending ?? 0)}</Text>
            <Text style={styles.statLabel}>{t.autonomousHub.actions}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{activeCampaigns}</Text>
            <Text style={styles.statLabel}>{t.autonomousHub.campaigns}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{successRate}%</Text>
            <Text style={styles.statLabel}>{t.autonomousHub.successRate}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.content}>
        {/* Strategy Banner */}
        {strategy ? (
          <TouchableOpacity style={styles.strategyBanner} onPress={() => navigateTo('MarketingStrategy')} activeOpacity={0.7}>
            <View style={styles.strategyBannerTitle}>
              <View style={styles.strategyBadge}>
                <SealCheck size={18} color="#059669" weight="fill" />
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: '#059669' }}>Marketing Strategie Actief</Text>
              </View>
              <PencilSimple size={16} color={colors.textTertiary} weight="duotone" />
            </View>
            <View style={styles.strategyStats}>
              <View style={styles.strategyStat}>
                <Text style={styles.strategyStatValue}>€{strategy.monthly_budget?.toLocaleString() ?? '0'}</Text>
                <Text style={styles.strategyStatLabel}>Budget/mnd</Text>
              </View>
              <View style={styles.strategyStat}>
                <Text style={styles.strategyStatValue}>{strategy.posts_per_week ?? 0}</Text>
                <Text style={styles.strategyStatLabel}>Posts/week</Text>
              </View>
              <View style={styles.strategyStat}>
                <Text style={styles.strategyStatValue}>{Object.values(strategy.channels ?? {}).filter((c: any) => c.active).length}</Text>
                <Text style={styles.strategyStatLabel}>Kanalen</Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.strategyCta} onPress={() => navigateTo('MarketingStrategy')} activeOpacity={0.7}>
            <ChartLineUp size={32} color="#059669" weight="duotone" />
            <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>Stel je Marketing Strategie in</Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' }}>AMOS heeft een strategie nodig om autonoom te werken — doelen, budget, kanalen & planning.</Text>
            <View style={{ backgroundColor: '#059669', borderRadius: borderRadius.full, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
              <Text style={{ color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.sm }}>Strategie Instellen</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Content Proposals Banner */}
        {(proposalStats?.pending ?? 0) > 0 ? (
          <TouchableOpacity
            style={[styles.section, { borderLeftWidth: 4, borderLeftColor: '#F59E0B' }]}
            onPress={() => navigateTo('ContentProposals')}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <NotePencil size={20} color="#F59E0B" weight="duotone" />
                <Text style={[styles.sectionTitle, { color: '#F59E0B' }]}>
                  {proposalStats?.pending ?? 0} {(proposalStats?.pending ?? 0) === 1 ? 'voorstel wacht' : 'voorstellen wachten'} op goedkeuring
                </Text>
              </View>
              <CaretRight size={18} color={colors.textTertiary} weight="bold" />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>{proposalStats?.approved ?? 0} goedgekeurd</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F6' }} />
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>{proposalStats?.scheduled ?? 0} ingepland</Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : strategy ? (
          <TouchableOpacity
            style={[styles.section, { alignItems: 'center', gap: spacing.sm }]}
            onPress={() => navigateTo('ContentProposals')}
            activeOpacity={0.7}
          >
            <Robot size={32} color={colors.textTertiary} weight="duotone" />
            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' }}>
              Laat AMOS content voorstellen genereren op basis van je strategie.
            </Text>
            <View style={{ backgroundColor: colors.primary, borderRadius: borderRadius.full, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs }}>
              <Text style={{ color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.sm }}>Voorstellen Genereren</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Autonomy Trust Indicator */}
        {strategy && (
          <TouchableOpacity
            style={styles.section}
            onPress={() => navigateTo('ContentProposals')}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons
                  name={strategy.auto_publish ? 'rocket-launch' : 'shield-check-outline'}
                  size={20}
                  color={strategy.auto_publish ? '#10B981' : '#F59E0B'}
                />
                <Text style={styles.sectionTitle}>
                  {strategy.auto_publish ? 'Autopilot' : strategy.autonomy_level === 'aggressive' ? 'Hoge autonomie' : strategy.autonomy_level === 'balanced' ? 'Begeleide modus' : 'Handmatig'}
                </Text>
              </View>
              <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, fontWeight: fontWeight.semibold }}>
                Vertrouwen: {trust?.overallScore ?? 0}%
              </Text>
            </View>
            {/* Trust progress */}
            <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: spacing.xs, overflow: 'hidden' as const }}>
              <View style={{
                height: 4,
                borderRadius: 2,
                width: `${Math.min(100, trust?.overallScore ?? 0)}%` as any,
                backgroundColor: (trust?.overallScore ?? 0) >= 70 ? '#10B981' : (trust?.overallScore ?? 0) >= 40 ? '#F59E0B' : '#EF4444',
              }} />
            </View>
            <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4 }}>
              {strategy.auto_publish
                ? `${trust?.totalPublished ?? 0} posts gepubliceerd · Autopilot actief`
                : trust?.autoPublishReady
                  ? `${trust?.totalPublished ?? 0} posts gepubliceerd · Klaar voor autopilot`
                  : `${trust?.totalPublished ?? 0} van ${5} posts nodig voor autopilot`
              }
            </Text>
          </TouchableOpacity>
        )}

        {/* Autonomy Level */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.autonomousHub.autonomyLevel}</Text>
          <View style={styles.autonomyRow}>
            {AUTONOMY_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.autonomyBtn, autonomyLevel === opt.key && { borderColor: opt.color, backgroundColor: opt.color + '15' }]}
                onPress={() => setAutonomyLevel(opt.key)}
              >
                <Text style={[styles.autonomyLabel, autonomyLevel === opt.key && { color: opt.color }]}>{opt.label}</Text>
                <Text style={styles.autonomyDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Pending Actions */}
        {feedItems.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t.autonomousHub.pendingActions}</Text>
              <TouchableOpacity onPress={() => navigateTo('OpportunityFeed')}>
                <Text style={styles.seeAll}>{t.autonomousHub.seeAll}</Text>
              </TouchableOpacity>
            </View>
            {feedItems.map((item: any) => (
              <View key={item.id} style={styles.decisionCard}>
                <View style={styles.decisionLeft}>
                  <View style={[styles.urgencyDot, { backgroundColor: '#EF4444' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.decisionTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.decisionDesc} numberOfLines={1}>{item.description}</Text>
                  </View>
                </View>
                {(item.estimated_value || 0) > 0 && (
                  <Text style={styles.decisionValue}>€{Math.round(item.estimated_value / 1000)}K</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Active Campaigns */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t.autonomousHub.activeCampaigns}</Text>
            <TouchableOpacity onPress={() => navigateTo('CampaignsTab')}>
              <Text style={styles.seeAll}>{t.autonomousHub.seeAll}</Text>
            </TouchableOpacity>
          </View>
          {loadingCampaigns ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : campaigns.length === 0 ? (
            <View style={styles.emptySmall}>
              <Text style={styles.emptySmallText}>{t.autonomousHub.noCampaigns}</Text>
              <TouchableOpacity
                style={styles.createBtn}
                onPress={() => navigateTo('CampaignCreate')}
              >
                <Text style={styles.createBtnText}>{t.autonomousHub.startCampaign}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            campaigns.map(c => (
              <View key={c.id} style={styles.campaignRow}>
                <View style={[styles.campaignStatus, { backgroundColor: c.status === 'active' ? '#10B981' : '#6B7280' }]} />
                <Text style={styles.campaignName} numberOfLines={1}>{c.name}</Text>
                <View style={styles.campaignBadges}>
                  {c.ai_generated && (
                    <View style={styles.aiBadge}>
                      <Text style={styles.aiBadgeText}>AI</Text>
                    </View>
                  )}
                  <Text style={styles.campaignStatusText}>{c.status}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* AI Module Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.autonomousHub.moduleStatus}</Text>
          <View style={styles.modulesGrid}>
            {AI_MODULES.map((mod, i) => {
              const IconComp = mod.lib === 'mci' ? MaterialCommunityIcons : Ionicons;
              return (
                <View key={i} style={[styles.moduleCard, !mod.active && styles.moduleInactive]}>
                  <View style={[styles.moduleIcon, { backgroundColor: mod.color + '20' }]}>
                    <IconComp name={mod.icon as any} size={20} color={mod.active ? mod.color : colors.textTertiary} />
                  </View>
                  <Text style={[styles.moduleName, !mod.active && styles.moduleNameInactive]}>{mod.label}</Text>
                  <Text style={styles.moduleDesc} numberOfLines={1}>{mod.desc}</Text>
                  <View style={[styles.moduleStatus, { backgroundColor: mod.active ? '#10B98120' : '#6B728020' }]}>
                    <View style={[styles.moduleDot, { backgroundColor: mod.active ? '#10B981' : '#6B7280' }]} />
                    <Text style={[styles.moduleStatusText, { color: mod.active ? '#10B981' : '#6B7280' }]}>
                      {mod.active ? 'Online' : 'Offline'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.autonomousHub.quickActions}</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigateTo('ContentCreator')}>
              <PencilLine size={20} color={colors.primary} weight="duotone" />
              <Text style={styles.quickBtnText}>{t.autonomousHub.generateContent}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigateTo('EventIntelligence')}>
              <Radioactive size={20} color={colors.primary} weight="duotone" />
              <Text style={styles.quickBtnText}>{t.autonomousHub.scanEvents}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigateTo('OpportunityFeed')}>
              <RadioButton size={20} color={colors.primary} weight="fill" />
              <Text style={styles.quickBtnText}>{t.autonomousHub.opportunityFeed}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigateTo('CampaignCreate')}>
              <Megaphone size={20} color={colors.primary} weight="duotone" />
              <Text style={styles.quickBtnText}>{t.autonomousHub.startCampaignShort}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </View>
    </ScrollView>
  );
}
