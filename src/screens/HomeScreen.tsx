// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: alert.icon> | MaterialCommunityIcons name=<dynamic: action.icon as any>
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDashboardStats } from '../hooks/useAnalytics';
import { useCampaigns } from '../hooks/useCampaigns';
import { useUnreadNotificationCount } from '../hooks/useNotifications';
import { useEvents } from '../hooks/useEvents';
import type { RootStackParamList } from '../types';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useThemedStyles } from '../utils/themedStyles';
import { useTheme } from '../context/ThemeContext';
import { subtleShadow } from '../utils/shadows';
import { useTranslation } from '../i18n';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import AgentActivityTile from '../components/AgentActivityTile';
import GoalModeTile from '../components/GoalModeTile';
import CounterfactualNudge from '../components/CounterfactualNudge';

import { ArrowUp, Bell, Brain, Calendar, CaretRight, Clipboard, Gear, MapPin, Rocket, Sparkle, Users } from 'phosphor-react-native';
// ─── Types ──────────────────────────────────────────────────────────────────

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface AIAlert {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  type: 'budget' | 'engagement' | 'leads';
  color: string;
}

interface QuickAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap | string;
  route: string;
  color: string;
  isMaterial?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { colors } = useTheme();

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    scrollContent: { paddingBottom: spacing.xl },

    // Header
    header: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingHorizontal: spacing.lg,
      paddingTop: 60,
      paddingBottom: spacing.lg,
      backgroundColor: c.surface,
    },
    headerRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
    headerIconBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: c.borderLight,
      justifyContent: 'center' as const, alignItems: 'center' as const,
    },
    notifBadge: {
      position: 'absolute' as const, top: -2, right: -2,
      minWidth: 18, height: 18, borderRadius: 9,
      backgroundColor: '#ef4444',
      justifyContent: 'center' as const, alignItems: 'center' as const,
      paddingHorizontal: 3, borderWidth: 1.5, borderColor: c.background,
    },
    notifBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' as any, letterSpacing: -0.2 },
    greeting: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: c.text },
    headerSubtitle: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: 2 },

    // AMOS Banner
    amosBanner: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
      borderRadius: borderRadius.xl,
      overflow: 'hidden' as const,
      ...subtleShadow,
    },
    amosBannerGradient: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      padding: spacing.lg,
    },
    amosBannerLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, flex: 1 },
    amosBrainCircle: {
      width: 50, height: 50, borderRadius: 25,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center' as const, alignItems: 'center' as const,
    },
    amosBannerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: '#fff' },
    amosBannerSub: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    amosBannerChevron: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center' as const, alignItems: 'center' as const,
    },

    // Stats
    statsGrid: {
      flexDirection: 'row' as const, flexWrap: 'wrap' as const,
      paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.sm,
    },
    statCard: {
      backgroundColor: c.surface, borderRadius: borderRadius.lg,
      padding: spacing.md, ...subtleShadow,
    },
    statCardHalf: { width: '48.5%' as any, flexGrow: 1 },
    statValue: { fontSize: fontSize.hero, fontWeight: fontWeight.bold, color: c.text },
    statLabel: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 2 },
    statIndicator: {
      alignSelf: 'flex-start' as const, paddingHorizontal: spacing.sm, paddingVertical: 2,
      borderRadius: borderRadius.full, marginTop: spacing.sm,
    },
    statIndicatorRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
    statIndicatorText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },

    // Sections
    section: { marginTop: spacing.lg },
    sectionHeader: {
      flexDirection: 'row' as const, justifyContent: 'space-between' as const,
      alignItems: 'center' as const, paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
    },
    sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: c.text, paddingHorizontal: spacing.lg },
    sectionBadge: {
      backgroundColor: c.primary, color: c.textOnPrimary,
      fontSize: fontSize.xs, fontWeight: fontWeight.bold,
      minWidth: 22, height: 22, borderRadius: 11,
      textAlign: 'center' as const, lineHeight: 22,
      overflow: 'hidden' as const, paddingHorizontal: 6,
    },
    seeAllText: { fontSize: fontSize.sm, color: c.primary, fontWeight: fontWeight.medium },

    // Quick Actions — 2 rows
    actionsGrid: {
      paddingHorizontal: spacing.lg,
      marginTop: spacing.sm,
      gap: spacing.sm,
    },
    actionsRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      gap: spacing.sm,
    },
    actionBtn: { flex: 1, alignItems: 'center' as const, gap: 6 },
    actionIconWrap: {
      width: 56, height: 56, borderRadius: borderRadius.lg,
      justifyContent: 'center' as const, alignItems: 'center' as const,
    },
    actionLabel: { fontSize: 10, fontWeight: fontWeight.medium, color: c.text, textAlign: 'center' as const },

    // Upcoming Events
    eventsScroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
    eventCard: {
      width: 220, backgroundColor: c.surface, borderRadius: borderRadius.lg,
      padding: spacing.md, overflow: 'hidden' as const, ...subtleShadow,
    },
    eventCardAccent: { height: 3, borderRadius: 2, marginBottom: spacing.sm },
    eventName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: c.text, marginBottom: 4 },
    eventMeta: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 2, flex: 1 },
    eventMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 2 },
    eventStatusBadge: {
      alignSelf: 'flex-start' as const,
      paddingHorizontal: spacing.sm, paddingVertical: 3,
      borderRadius: borderRadius.full, marginTop: spacing.sm,
    },
    eventStatusText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },

    // AI Suggestions
    suggestionsList: { marginHorizontal: spacing.lg, gap: spacing.sm },
    suggestionCard: {
      backgroundColor: c.surface, borderRadius: borderRadius.lg,
      overflow: 'hidden' as const, ...subtleShadow,
    },
    suggestionAccent: { height: 3, width: '100%' as any },
    suggestionContent: {
      flexDirection: 'row' as const, alignItems: 'flex-start' as const,
      padding: spacing.md, gap: spacing.md,
    },
    suggestionIconWrap: {
      width: 36, height: 36, borderRadius: 18,
      justifyContent: 'center' as const, alignItems: 'center' as const,
    },
    suggestionText: { flex: 1 },
    suggestionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: c.text },
    suggestionDesc: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: 2, lineHeight: 20 },
    suggestionActions: { flexDirection: 'row' as const, gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
    suggestionBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.sm },
    suggestionBtnAccept: { backgroundColor: c.primary },
    suggestionBtnAcceptText: { color: c.textOnPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
    suggestionBtnDismiss: { backgroundColor: c.borderLight },
    suggestionBtnDismissText: { color: c.textSecondary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },

    // Campaigns
    campaignList: { marginHorizontal: spacing.lg, backgroundColor: c.surface, borderRadius: borderRadius.lg, ...subtleShadow },
    campaignCard: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, padding: spacing.md },
    campaignCardBorder: { borderBottomWidth: 1, borderBottomColor: c.borderLight },
    campaignInfo: { flex: 1, marginRight: spacing.md },
    campaignName: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: c.text },
    campaignMeta: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 2, textTransform: 'capitalize' as const },
    campaignBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full, gap: 4 },
    campaignBadgeDot: { width: 6, height: 6, borderRadius: 3 },
    campaignBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },

    // Empty / Loading
    loadingPlaceholder: { alignItems: 'center' as const, padding: spacing.xl },
    loadingText: { fontSize: fontSize.sm, color: c.textSecondary },
    emptyState: { alignItems: 'center' as const, marginHorizontal: spacing.lg, backgroundColor: c.surface, borderRadius: borderRadius.lg, padding: spacing.xl, ...subtleShadow },
    emptyTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: c.text, marginTop: spacing.sm },
    emptyDescription: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: spacing.xs, textAlign: 'center' as const },
  }));

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useDashboardStats();
  const { data: campaigns = [], isLoading: campaignsLoading, refetch: refetchCampaigns } = useCampaigns();
  const { data: allEvents = [], refetch: refetchEvents } = useEvents();
  const unreadNotifCount = useUnreadNotificationCount();

  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const { data: feedAlerts = [], refetch: refetchFeed } = useQuery({
    queryKey: ['home_feed_alerts'],
    queryFn: async () => {
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from('feed_items')
        .select('id, type, title, description, urgency, estimated_value, is_read')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(5);
      return (data || []).map((item: any) => ({
        id: item.id,
        icon: item.type === 'budget' ? 'cash-outline' : item.type === 'lead' ? 'people-outline' : 'trending-up-outline',
        title: item.title,
        description: item.description,
        type: item.type,
        color: item.urgency === 'immediate' ? colors.error : item.urgency === 'high' ? colors.warning : colors.info,
      } as AIAlert));
    },
  });

  const statusColor: Record<string, string> = {
    draft:     colors.draft,
    active:    colors.success,
    paused:    colors.warning,
    completed: colors.textSecondary,
    scheduled: colors.info,
    upcoming:  colors.primary,
  };

  const statusLabel: Record<string, string> = {
    draft: t.status.draft, active: t.status.active, paused: t.status.paused,
    completed: t.status.completed, scheduled: t.status.scheduled,
    upcoming: t.status.upcoming ?? 'Upcoming',
  };

  // Quick Actions — features NOT in the tab bar but useful for fast access
  const QUICK_ACTIONS_ROW1: QuickAction[] = [
    { label: 'Content Creator',  icon: 'creation',               route: 'ContentCreator',    color: colors.primary, isMaterial: true },
    { label: 'Event Intel',      icon: 'radar',                  route: 'EventIntelligence', color: '#F97316', isMaterial: true },
    { label: 'Lead Capture',     icon: 'account-search',         route: 'LeadCapture',       color: '#06B6D4', isMaterial: true },
    { label: 'QR Scan',          icon: 'qrcode-scan',            route: 'QRScan',            color: colors.success, isMaterial: true },
  ];

  const QUICK_ACTIONS_ROW2: QuickAction[] = [
    { label: 'Alle Posts',       icon: 'post-outline',           route: 'AllPosts',          color: '#8B5CF6', isMaterial: true },
    { label: 'Producten',        icon: 'package-variant-closed', route: 'Products',          color: '#3B82F6', isMaterial: true },
    { label: 'Organisatie',      icon: 'office-building',        route: 'Organization',      color: '#F97316', isMaterial: true },
    { label: 'Brand Kit',        icon: 'palette-swatch-variant', route: 'BrandKit',          color: '#EC4899', isMaterial: true },
  ];

  const upcomingEvents = allEvents
    .filter((e) => e.status === 'upcoming' || e.status === 'active')
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
    .slice(0, 5);

  const visibleAlerts = feedAlerts.filter((a) => !dismissedAlerts.has(a.id));
  const recentCampaigns = campaigns.slice(0, 3);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchCampaigns(), refetchFeed(), refetchEvents()]);
    setRefreshing(false);
  }, [refetchStats, refetchCampaigns, refetchFeed, refetchEvents]);

  const dismissAlert = (id: string) => setDismissedAlerts((prev) => new Set(prev).add(id));

  const formatNumber = (n: number | undefined): string => {
    if (n === undefined || n === null) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const formatCurrency = (n: number | undefined): string => {
    if (n === undefined || n === null) return '\u20AC0';
    if (n >= 1_000_000) return `\u20AC${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `\u20AC${(n / 1_000).toFixed(1)}K`;
    return `\u20AC${n}`;
  };

  const renderQuickAction = (action: QuickAction) => (
    <TouchableOpacity
      key={action.route + action.label}
      style={styles.actionBtn}
      onPress={() => navigation.navigate(action.route as any)}
      activeOpacity={0.7}
    >
      <View style={[styles.actionIconWrap, { backgroundColor: action.color + '15' }]}>
        <MaterialCommunityIcons name={action.icon as any} size={24} color={action.color} />
      </View>
      <Text style={styles.actionLabel} numberOfLines={1}>{action.label}</Text>
    </TouchableOpacity>
  );

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {/* ── Welcome Header ─────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{t.home.greeting}</Text>
            <Text style={styles.headerSubtitle}>{t.home.subtitle}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate('Notifications' as any)}>
              <Bell size={22} color={colors.text} weight="duotone" />
              {unreadNotifCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadNotifCount > 9 ? '9+' : String(unreadNotifCount)}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => navigation.navigate('Settings' as any)}>
              <Gear size={22} color={colors.text} weight="duotone" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── AMOS Hub Banner ────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.amosBanner}
          onPress={() => navigation.navigate('AMOSHub' as any)}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={['#E8317A', '#F7941D', '#FBA94E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.amosBannerGradient}
          >
            <View style={styles.amosBannerLeft}>
              <View style={styles.amosBrainCircle}>
                <Brain size={26} color="#fff" weight="duotone" />
              </View>
              <View>
                <Text style={styles.amosBannerTitle}>{t.home.amosBannerTitle}</Text>
                <Text style={styles.amosBannerSub}>{t.home.amosBannerSub}</Text>
              </View>
            </View>
            <View style={styles.amosBannerChevron}>
              <CaretRight size={18} color="#fff" weight="bold" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Multi-Agent activity tile (Tier-1 #2) ─────────────────── */}
        <AgentActivityTile />

        {/* ── Goal Mode tile (Tier-2) ─────────────────────────────── */}
        <GoalModeTile />

        {/* ── Counterfactual nudge (Tier-1 #6) ──────────────────────── */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CounterfactualNudge />
        </View>

        {/* ── Quick Stats ────────────────────────────────────────────── */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, styles.statCardHalf]}>
            <Text style={styles.statValue}>{statsLoading ? '-' : formatNumber(stats?.active_campaigns)}</Text>
            <Text style={styles.statLabel}>{t.home.activeCampaigns}</Text>
            <View style={[styles.statIndicator, { backgroundColor: colors.primary + '20' }]}>
              <View style={styles.statIndicatorRow}>
                <Rocket size={12} color={colors.primary} weight="duotone" />
                <Text style={[styles.statIndicatorText, { color: colors.primary }]}> {t.home.live}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.statCard, styles.statCardHalf]}>
            <Text style={styles.statValue}>{statsLoading ? '-' : formatNumber(stats?.total_contacts)}</Text>
            <Text style={styles.statLabel}>{t.home.totalContacts}</Text>
            <View style={[styles.statIndicator, { backgroundColor: colors.info + '20' }]}>
              <View style={styles.statIndicatorRow}>
                <Users size={12} color={colors.info} weight="duotone" />
                <Text style={[styles.statIndicatorText, { color: colors.info }]}> {t.home.database}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.statCard, styles.statCardHalf]}>
            <Text style={styles.statValue}>24.8%</Text>
            <Text style={styles.statLabel}>{t.home.openRate}</Text>
            <View style={[styles.statIndicator, { backgroundColor: colors.success + '20' }]}>
              <View style={styles.statIndicatorRow}>
                <ArrowUp size={12} color={colors.success} weight="bold" />
                <Text style={[styles.statIndicatorText, { color: colors.success }]}> +3.2%</Text>
              </View>
            </View>
          </View>

          <View style={[styles.statCard, styles.statCardHalf]}>
            <Text style={styles.statValue}>{statsLoading ? '-' : formatCurrency(stats?.total_revenue)}</Text>
            <Text style={styles.statLabel}>{t.home.revenue}</Text>
            <View style={[styles.statIndicator, { backgroundColor: colors.success + '20' }]}>
              <View style={styles.statIndicatorRow}>
                <ArrowUp size={12} color={colors.success} weight="bold" />
                <Text style={[styles.statIndicatorText, { color: colors.success }]}> +12%</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Quick Actions ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.home.quickActions}</Text>
          <View style={styles.actionsGrid}>
            <View style={styles.actionsRow}>
              {QUICK_ACTIONS_ROW1.map(renderQuickAction)}
            </View>
            <View style={styles.actionsRow}>
              {QUICK_ACTIONS_ROW2.map(renderQuickAction)}
            </View>
          </View>
        </View>

        {/* ── Upcoming Events ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t.home.upcomingEvents}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'EventsTab' } as any)}>
              <Text style={styles.seeAllText}>{t.home.viewAllEvents}</Text>
            </TouchableOpacity>
          </View>

          {upcomingEvents.length === 0 ? (
            <View style={styles.emptyState}>
              <Calendar size={32} color={colors.textSecondary} weight="duotone" />
              <Text style={styles.emptyTitle}>{t.home.noEvents}</Text>
              <Text style={styles.emptyDescription}>{t.home.noEventsDesc}</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.eventsScroll}
              decelerationRate="fast"
            >
              {upcomingEvents.map((event) => {
                const accentColor = event.status === 'active' ? colors.success : colors.primary;
                return (
                  <TouchableOpacity
                    key={event.id}
                    style={styles.eventCard}
                    onPress={() => navigation.navigate('EventDashboard', { eventId: event.id })}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.eventCardAccent, { backgroundColor: accentColor }]} />
                    <Text style={styles.eventName} numberOfLines={1}>{event.name}</Text>
                    <View style={styles.eventMetaRow}>
                      <MapPin size={11} color={colors.textSecondary} weight="duotone" />
                      <Text style={styles.eventMeta} numberOfLines={1}> {event.location || '—'}</Text>
                    </View>
                    <View style={styles.eventMetaRow}>
                      <Calendar size={11} color={colors.textSecondary} weight="duotone" />
                      <Text style={styles.eventMeta}> {new Date(event.event_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</Text>
                    </View>
                    <View style={[styles.eventStatusBadge, { backgroundColor: accentColor + '20' }]}>
                      <Text style={[styles.eventStatusText, { color: accentColor }]}>
                        {statusLabel[event.status] || event.status}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* ── Recent Campaigns ────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t.home.recentCampaigns}</Text>
            {campaigns.length > 3 && (
              <TouchableOpacity onPress={() => navigation.navigate('CampaignList' as any)}>
                <Text style={styles.seeAllText}>{t.home.viewAll}</Text>
              </TouchableOpacity>
            )}
          </View>

          {campaignsLoading ? (
            <View style={styles.loadingPlaceholder}><Text style={styles.loadingText}>{t.common.loading}</Text></View>
          ) : recentCampaigns.length === 0 ? (
            <View style={styles.emptyState}>
              <Clipboard size={36} color={colors.textSecondary} weight="duotone" />
              <Text style={styles.emptyTitle}>{t.home.noCampaigns}</Text>
              <Text style={styles.emptyDescription}>{t.home.noCampaignsDesc}</Text>
            </View>
          ) : (
            <View style={styles.campaignList}>
              {recentCampaigns.map((campaign, index) => {
                const status = campaign.status || 'draft';
                const badgeColor = statusColor[status] || colors.textSecondary;
                return (
                  <TouchableOpacity
                    key={campaign.id}
                    style={[styles.campaignCard, index < recentCampaigns.length - 1 && styles.campaignCardBorder]}
                    onPress={() => navigation.navigate('CampaignDetail', { campaignId: campaign.id })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.campaignInfo}>
                      <Text style={styles.campaignName} numberOfLines={1}>{campaign.name}</Text>
                      <Text style={styles.campaignMeta}>
                        {campaign.type}{campaign.start_date ? ` \u2022 ${new Date(campaign.start_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.campaignBadge, { backgroundColor: badgeColor + '15' }]}>
                      <View style={[styles.campaignBadgeDot, { backgroundColor: badgeColor }]} />
                      <Text style={[styles.campaignBadgeText, { color: badgeColor }]}>{statusLabel[status] || status}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ── AI Suggestions ──────────────────────────────────────────── */}
        {visibleAlerts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.xs }}>
                <Sparkle size={16} color={colors.primary} weight="fill" />
                <Text style={[styles.sectionTitle, { paddingHorizontal: 0 }]}>{t.home.aiSuggestions}</Text>
              </View>
              <Text style={styles.sectionBadge}>{visibleAlerts.length}</Text>
            </View>

            <View style={styles.suggestionsList}>
              {visibleAlerts.map((alert) => (
                <View key={alert.id} style={styles.suggestionCard}>
                  <View style={[styles.suggestionAccent, { backgroundColor: alert.color }]} />
                  <View style={styles.suggestionContent}>
                    <View style={[styles.suggestionIconWrap, { backgroundColor: alert.color + '20' }]}>
                      <Ionicons name={alert.icon} size={18} color={alert.color} />
                    </View>
                    <View style={styles.suggestionText}>
                      <Text style={styles.suggestionTitle} numberOfLines={1}>{alert.title}</Text>
                      <Text style={styles.suggestionDesc} numberOfLines={2}>{alert.description}</Text>
                    </View>
                  </View>
                  <View style={styles.suggestionActions}>
                    <TouchableOpacity
                      style={[styles.suggestionBtn, styles.suggestionBtnAccept]}
                      onPress={() => dismissAlert(alert.id)}
                    >
                      <Text style={styles.suggestionBtnAcceptText}>{t.common.accept}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.suggestionBtn, styles.suggestionBtnDismiss]}
                      onPress={() => dismissAlert(alert.id)}
                    >
                      <Text style={styles.suggestionBtnDismissText}>{t.common.dismiss}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}
