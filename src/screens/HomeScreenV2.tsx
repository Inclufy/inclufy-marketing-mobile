// ──────────────────────────────────────────────────────────────────────────
// HomeScreenV2 — premium redesign of the AMOS dashboard / hero screen.
//
// What's new vs HomeScreen v1:
//   • Time-aware greeting with morning/afternoon/evening emoji
//   • Streak chip powered by usePublishStreak() — "🔥 3 dagen op rij"
//   • Phosphor icon set with duotone weight for richer hierarchy
//   • Circular SVG progress rings on the stats grid
//   • Subtle "breathing" pulse on the AMOS Hub brain icon
//   • Tighter visual density, keeps existing data hooks 1:1
//
// All data wiring (campaigns, events, stats, AI alerts, notifications) is
// identical to HomeScreen.tsx — so this screen is a drop-in replacement and
// the old screen remains as a fallback.
// ──────────────────────────────────────────────────────────────────────────

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Bell,
  Gear,
  CaretRight,
  Lightning,
  Sparkle,
  Users,
  CurrencyEur,
  TrendUp,
  Brain,
  Megaphone,
  Calendar,
  MapPin,
  CalendarBlank,
  Rocket,
  MagicWand,
  Binoculars,
  UserPlus,
  QrCode,
  ChatCircleText,
  Package,
  Buildings,
  Palette,
  Flame,
  CheckCircle,
  XCircle,
  Clock,
  Lightbulb,
  ShareNetwork,
  FacebookLogo,
  InstagramLogo,
  LinkedinLogo,
  TiktokLogo,
  PinterestLogo,
  SnapchatLogo,
  Robot,
} from 'phosphor-react-native';

import { useDashboardStats } from '../hooks/useAnalytics';
import { useCampaigns } from '../hooks/useCampaigns';
import { useUnreadNotificationCount } from '../hooks/useNotifications';
import { useEvents } from '../hooks/useEvents';
import { usePublishStreak } from '../hooks/usePublishStreak';
import { useAllPosts } from '../hooks/useEventPosts';
import type { RootStackParamList } from '../types';
import { spacing, borderRadius, fontSize, fontWeight, brandGradient } from '../theme';
import { useThemedStyles } from '../utils/themedStyles';
import { useTheme } from '../context/ThemeContext';
import { subtleShadow, cardShadow } from '../utils/shadows';
import { useTranslation } from '../i18n';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import AgentActivityTile from '../components/AgentActivityTile';
import GoalModeTile from '../components/GoalModeTile';
import CounterfactualNudge from '../components/CounterfactualNudge';
import { SyncStatusBadge } from '../components/SyncStatusBadge';

// ─── Types ───────────────────────────────────────────────────────────────

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface AIAlert {
  id: string;
  iconKey: 'budget' | 'leads' | 'trend';
  title: string;
  description: string;
  type: 'budget' | 'engagement' | 'leads' | string;
  color: string;
}

type PhosphorIcon = React.ComponentType<{
  size?: number;
  color?: string;
  weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
}>;

interface QuickAction {
  label: string;
  Icon: PhosphorIcon;
  route: string;
  color: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function partOfDay(hour: number): { greetKey: 'morning' | 'afternoon' | 'evening'; emoji: string } {
  if (hour < 6)  return { greetKey: 'evening',   emoji: '🌙' };
  if (hour < 12) return { greetKey: 'morning',   emoji: '☕' };
  if (hour < 18) return { greetKey: 'afternoon', emoji: '🌅' };
  if (hour < 22) return { greetKey: 'evening',   emoji: '✨' };
  return { greetKey: 'evening', emoji: '🌙' };
}

function buildGreeting(locale: string, hour: number, firstName: string | null): { hello: string; emoji: string } {
  const { greetKey, emoji } = partOfDay(hour);
  const isNl = locale === 'nl';
  const isFr = locale === 'fr';

  const map = {
    morning:   isNl ? 'Goedemorgen' : isFr ? 'Bonjour'      : 'Good morning',
    afternoon: isNl ? 'Goedemiddag' : isFr ? 'Bon après-midi' : 'Good afternoon',
    evening:   isNl ? 'Goedenavond' : isFr ? 'Bonsoir'      : 'Good evening',
  };
  const base = map[greetKey];
  return { hello: firstName ? `${base} ${firstName}` : base, emoji };
}

function firstNameFrom(p: { full_name?: string | null; email?: string | null }): string | null {
  const name = (p?.full_name || '').trim();
  if (name) return name.split(/\s+/)[0];
  const email = (p?.email || '').trim();
  if (email.includes('@')) {
    const local = email.split('@')[0];
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return null;
}

function timeAgoShort(iso: string | Date, locale: string): string {
  const t = typeof iso === 'string' ? new Date(iso).getTime() : iso.getTime();
  if (Number.isNaN(t)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60) return locale === 'fr' ? "à l'instant" : locale === 'nl' ? 'net' : 'now';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return locale === 'fr' ? `il y a ${min}min` : `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return locale === 'fr' ? `il y a ${hr}h` : `${hr}u`;
  const day = Math.floor(hr / 24);
  if (day < 7) return locale === 'fr' ? `il y a ${day}j` : `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return locale === 'fr' ? `il y a ${wk}sem` : `${wk}w`;
  return new Date(t).toLocaleDateString(locale === 'fr' ? 'fr-FR' : locale === 'nl' ? 'nl-NL' : 'en-US', { day: '2-digit', month: 'short' });
}

function formatTokensCompact(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCostCompact(n: number): string {
  if (!n) return '€0';
  if (n < 0.01) return '<€0.01';
  if (n < 1) return `€${n.toFixed(2)}`;
  if (n < 100) return `€${n.toFixed(1)}`;
  return `€${Math.round(n)}`;
}

function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCurrency(n: number | undefined | null): string {
  if (n === undefined || n === null) return '€0';
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `€${(n / 1_000).toFixed(1)}K`;
  return `€${n}`;
}

// ─── Progress Ring (SVG) ─────────────────────────────────────────────────

interface ProgressRingProps {
  size?: number;
  stroke?: number;
  progress: number; // 0..1
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}

const ProgressRing: React.FC<ProgressRingProps> = ({
  size = 56,
  stroke = 5,
  progress,
  color,
  trackColor,
  children,
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const safeProgress = Math.max(0, Math.min(1, progress));
  const offset = c * (1 - safeProgress);
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: 'absolute', justifyContent: 'center', alignItems: 'center' }}>
        {children}
      </View>
    </View>
  );
};

// ─── Component ───────────────────────────────────────────────────────────

export default function HomeScreenV2() {
  const navigation = useNavigation<Nav>();
  const { t, locale } = useTranslation();
  const { colors } = useTheme();

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    scrollContent: { paddingBottom: spacing.xl + 60 },

    // Hero
    hero: {
      paddingHorizontal: spacing.lg,
      paddingTop: 60,
      paddingBottom: spacing.md,
      backgroundColor: c.surface,
    },
    heroTopRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
    },
    heroEmoji: { fontSize: 22, marginRight: 6 },
    heroGreetingWrap: { flexDirection: 'row' as const, alignItems: 'center' as const, flexWrap: 'wrap' as const },
    heroGreeting: {
      fontSize: fontSize.xxl,
      fontWeight: fontWeight.bold,
      color: c.text,
      letterSpacing: -0.5,
    },
    heroSub: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
      marginTop: 4,
      lineHeight: 19,
    },
    headerActions: {
      flexDirection: 'row' as const,
      gap: 8,
      marginLeft: spacing.sm,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.borderLight,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    notifBadge: {
      position: 'absolute' as const,
      top: -2,
      right: -2,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: '#ef4444',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 3,
      borderWidth: 1.5,
      borderColor: c.background,
    },
    notifBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' as const, letterSpacing: -0.2 },

    // Streak
    streakRow: {
      marginTop: spacing.md,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
    },
    streakChip: {
      borderRadius: borderRadius.full,
      overflow: 'hidden' as const,
      alignSelf: 'flex-start' as const,
      ...subtleShadow,
    },
    streakChipInner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    streakChipEmoji: { fontSize: 14 },
    streakChipText: {
      color: '#fff',
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      letterSpacing: 0.2,
    },
    streakMutedChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: borderRadius.full,
      backgroundColor: c.borderLight,
      alignSelf: 'flex-start' as const,
    },
    streakMutedText: {
      color: c.textSecondary,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
    },

    // AMOS aan het werk — combined hub + agent stats card (313)
    amosCard: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      borderRadius: borderRadius.xl,
      overflow: 'hidden' as const,
      ...cardShadow,
    },
    amosCardGradient: {
      padding: spacing.md,
      gap: spacing.md,
    },
    amosCardHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    amosCardTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: '#fff', letterSpacing: -0.3 },
    amosCardSub: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
    amosCardChevron: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.18)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    amosStatsGrid: {
      flexDirection: 'row' as const,
      gap: 8,
    },
    amosStatCell: {
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: borderRadius.md,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: 'center' as const,
    },
    amosStatCellHi: {
      backgroundColor: 'rgba(255,255,255,0.28)',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.6)',
    },
    amosStatValue: {
      fontSize: 22,
      fontWeight: '800' as const,
      color: '#fff',
      letterSpacing: -0.5,
    },
    amosStatLabel: {
      fontSize: 10,
      fontWeight: '600' as const,
      color: 'rgba(255,255,255,0.88)',
      marginTop: 2,
      letterSpacing: 0.2,
      textAlign: 'center' as const,
    },
    amosCtaRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      gap: 8,
    },
    amosCtaSecondary: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
    },
    amosCtaText: {
      fontSize: fontSize.xs,
      fontWeight: '700' as const,
      color: '#fff',
    },
    amosCtaBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: '#fff',
    },
    amosCtaBadgeText: {
      fontSize: 10,
      fontWeight: '800' as const,
      color: '#E8317A',
      letterSpacing: 0.3,
    },

    // ─── Legacy AMOS Hub banner (kept for back-compat — replaced by amosCard) ───
    amosBanner: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.lg,
      borderRadius: borderRadius.xl,
      overflow: 'hidden' as const,
      ...cardShadow,
    },
    amosBannerGradient: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      padding: spacing.md,
    },
    amosBannerLeft: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
      flex: 1,
    },
    amosBrainCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: 'rgba(255,255,255,0.22)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    amosBannerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: '#fff' },
    amosBannerSub: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
    amosBannerChevron: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.22)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },

    // Section
    section: { marginTop: spacing.lg },
    sectionHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    sectionTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
    sectionTitle: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.semibold,
      color: c.text,
    },
    sectionBadge: {
      backgroundColor: c.primary,
      color: c.textOnPrimary,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      textAlign: 'center' as const,
      lineHeight: 22,
      overflow: 'hidden' as const,
      paddingHorizontal: 6,
    },
    seeAllText: { fontSize: fontSize.sm, color: c.primary, fontWeight: fontWeight.medium },

    // Stats grid
    statsGrid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    statCard: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
      width: '48.5%' as const,
      flexGrow: 1,
      ...subtleShadow,
    },
    statTextBlock: { flex: 1 },
    statValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text, letterSpacing: -0.5 },
    statLabel: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 2 },
    statDelta: { fontSize: 10, fontWeight: fontWeight.semibold, marginTop: 4 },

    // Quick actions
    actionsGrid: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    actionsRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: spacing.sm },
    actionBtn: { flex: 1, alignItems: 'center' as const, gap: 6 },
    actionIconWrap: {
      width: 56,
      height: 56,
      borderRadius: borderRadius.lg,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    actionLabel: {
      fontSize: 10,
      fontWeight: fontWeight.medium,
      color: c.text,
      textAlign: 'center' as const,
    },

    // Events
    eventsScroll: { paddingHorizontal: spacing.lg, gap: spacing.sm },
    eventCard: {
      width: 220,
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      overflow: 'hidden' as const,
      ...subtleShadow,
    },
    eventCardAccent: { height: 3, borderRadius: 2, marginBottom: spacing.sm },
    eventName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: c.text, marginBottom: 4 },
    eventMeta: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 2, flex: 1 },
    eventMetaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: 2, gap: 4 },
    eventStatusBadge: {
      alignSelf: 'flex-start' as const,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: borderRadius.full,
      marginTop: spacing.sm,
    },
    eventStatusText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },

    // AI Suggestions
    suggestionsList: { marginHorizontal: spacing.lg, gap: spacing.sm },
    suggestionCard: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      overflow: 'hidden' as const,
      ...subtleShadow,
    },
    suggestionAccent: { height: 3, width: '100%' as const },
    suggestionContent: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      padding: spacing.md,
      gap: spacing.md,
    },
    suggestionIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    suggestionText: { flex: 1 },
    suggestionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: c.text },
    suggestionDesc: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: 2, lineHeight: 20 },
    suggestionActions: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    suggestionBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.sm },
    suggestionBtnAccept: { backgroundColor: c.primary },
    suggestionBtnAcceptText: { color: c.textOnPrimary, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
    suggestionBtnDismiss: { backgroundColor: c.borderLight },
    suggestionBtnDismissText: { color: c.textSecondary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },

    // Campaigns
    campaignList: {
      marginHorizontal: spacing.lg,
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      ...subtleShadow,
    },
    campaignCard: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      padding: spacing.md,
    },
    campaignCardBorder: { borderBottomWidth: 1, borderBottomColor: c.borderLight },
    campaignInfo: { flex: 1, marginRight: spacing.md },
    campaignName: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: c.text },
    campaignMeta: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 2, textTransform: 'capitalize' as const },
    campaignBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: borderRadius.full,
      gap: 4,
    },
    campaignBadgeDot: { width: 6, height: 6, borderRadius: 3 },
    campaignBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },

    // Empty / Loading
    loadingPlaceholder: { alignItems: 'center' as const, padding: spacing.xl },
    loadingText: { fontSize: fontSize.sm, color: c.textSecondary },
    emptyState: {
      alignItems: 'center' as const,
      marginHorizontal: spacing.lg,
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.xl,
      ...subtleShadow,
    },
    emptyTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: c.text, marginTop: spacing.sm },
    emptyDescription: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: spacing.xs, textAlign: 'center' as const },

    // 312: Recente publicaties feed
    emptyCta: {
      marginTop: spacing.md,
      borderRadius: borderRadius.full,
      overflow: 'hidden' as const,
    },
    emptyCtaInner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    emptyCtaText: { color: '#fff', fontSize: fontSize.xs, fontWeight: fontWeight.bold },
    feedRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      padding: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    feedIconWrap: {
      width: 36, height: 36, borderRadius: 18,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    feedPlatform: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: c.text },
    feedDot: { fontSize: fontSize.sm, color: c.textTertiary },
    feedTime: { fontSize: fontSize.xs, color: c.textSecondary },
    feedCaption: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 2 },
    feedStatus: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.3 },
  }));

  // ─── Data ───────────────────────────────────────────────────────────

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useDashboardStats();
  const { data: campaigns = [], isLoading: campaignsLoading, refetch: refetchCampaigns } = useCampaigns();
  const { data: allEvents = [], refetch: refetchEvents } = useEvents();
  const unreadNotifCount = useUnreadNotificationCount();
  const { data: streak, refetch: refetchStreak } = usePublishStreak();
  const { data: allPosts = [], refetch: refetchAllPosts } = useAllPosts();

  // Agent activity stats — powers the unified "AMOS aan het werk" card
  // (replaces the separate AMOS Hub banner + AgentActivityTile components).
  const { data: agentStats = { awaitingApproval: 0, blockedToday: 0, tokensToday: 0, costUsdToday: 0 } } = useQuery({
    queryKey: ['amos-agent-stats-today'],
    queryFn: async () => {
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
      const runs = (todayRuns ?? []) as any[];
      const blockedToday = runs.filter(r => r.status === 'blocked').length;
      const tokensToday  = runs.reduce((s, r) => s + (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0), 0);
      const costUsdToday = runs.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
      return { awaitingApproval: awaitingApproval ?? 0, blockedToday, tokensToday, costUsdToday };
    },
    staleTime: 60_000,
  });

  const { data: profile } = useQuery({
    queryKey: ['home_v2_profile'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { full_name: '', email: '' };
      const { data } = await supabase
        .from('qr_profiles')
        .select('full_name, email')
        .eq('user_id', user.id)
        .maybeSingle();
      return {
        full_name: (data as any)?.full_name ?? '',
        email: (data as any)?.email ?? user.email ?? '',
      };
    },
  });

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
        iconKey: item.type === 'budget' ? 'budget' : item.type === 'lead' ? 'leads' : 'trend',
        title: item.title,
        description: item.description,
        type: item.type,
        color:
          item.urgency === 'immediate' ? colors.error
          : item.urgency === 'high'    ? colors.warning
          : colors.info,
      } as AIAlert));
    },
  });

  // ─── Greeting + streak copy ─────────────────────────────────────────

  const firstName = useMemo(() => firstNameFrom(profile || {}), [profile]);
  const greeting = useMemo(
    () => buildGreeting(locale, new Date().getHours(), firstName),
    [locale, firstName],
  );

  const heroSub = useMemo(() => {
    if (locale === 'nl') return 'Hier is je marketing brein, klaar voor vandaag.';
    if (locale === 'fr') return "Voici votre cerveau marketing, prêt pour aujourd'hui.";
    return "Here's your marketing brain, ready for today.";
  }, [locale]);

  const streakCopy = useMemo(() => {
    const current = streak?.current ?? 0;
    const todayDone = !!streak?.todayDone;
    if (todayDone) {
      if (locale === 'fr') return { text: 'Publié aujourd\'hui', emoji: '✓', muted: false };
      if (locale === 'nl') return { text: 'Vandaag al gepost', emoji: '✓', muted: false };
      return { text: 'Posted today', emoji: '✓', muted: false };
    }
    if (current >= 2) {
      if (locale === 'fr') return { text: `${current} jours d'affilée`, emoji: '🔥', muted: false };
      if (locale === 'nl') return { text: `${current} dagen op rij`, emoji: '🔥', muted: false };
      return { text: `${current} day streak`, emoji: '🔥', muted: false };
    }
    if (locale === 'fr') return { text: "Lancez une série aujourd'hui", emoji: '✨', muted: true };
    if (locale === 'nl') return { text: 'Start vandaag een reeks', emoji: '✨', muted: true };
    return { text: 'Start a streak today', emoji: '✨', muted: true };
  }, [streak, locale]);

  // ─── Quick actions (Phosphor) ───────────────────────────────────────

  // 312: 6-tile grid (A+B mix). Wizard is the primary CTA — appears first.
  // Capture maps to LiveCapture for the "snel vastleggen" path (without wizard).
  // Trimmed: Lead Capture / QR Scan / Producten / Organisatie / Event Intel
  // (still reachable via search + deeper nav).
  const QUICK_ACTIONS_ROW1: QuickAction[] = [
    { label: 'Wizard',           Icon: MagicWand,        route: 'CaptureWizard',     color: colors.primary },
    { label: 'Capture',          Icon: UserPlus,         route: 'LiveCapture',       color: '#06B6D4' },
    { label: 'Posts',            Icon: ChatCircleText,   route: 'AllPosts',          color: '#8B5CF6' },
  ];

  const QUICK_ACTIONS_ROW2: QuickAction[] = [
    { label: 'Events',           Icon: Binoculars,       route: 'EventIntelligence', color: '#F97316' },
    { label: 'Content Creator',  Icon: Package,          route: 'ContentCreator',    color: '#3B82F6' },
    { label: 'Brand Kit',        Icon: Palette,          route: 'BrandKit',          color: '#EC4899' },
  ];

  // ─── Status maps ────────────────────────────────────────────────────

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

  // ─── Lists ──────────────────────────────────────────────────────────

  const upcomingEvents = allEvents
    .filter((e) => e.status === 'upcoming' || e.status === 'active')
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
    .slice(0, 5);

  const visibleAlerts = feedAlerts.filter((a) => !dismissedAlerts.has(a.id));
  const recentCampaigns = campaigns.slice(0, 3);

  // 312: last 5 publications (newest first) — drives the activity feed.
  // Sourced from go_posts (user-created social posts) — same table AllPosts reads.
  const recentPublications = [...allPosts]
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  // ─── Handlers ───────────────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refetchStats(),
      refetchCampaigns(),
      refetchFeed(),
      refetchEvents(),
      refetchStreak(),
      refetchAllPosts(),
    ]);
    setRefreshing(false);
  }, [refetchStats, refetchCampaigns, refetchFeed, refetchEvents, refetchStreak, refetchAllPosts]);

  const dismissAlert = (id: string) =>
    setDismissedAlerts((prev) => new Set(prev).add(id));

  // ─── Breathing pulse on AMOS brain ──────────────────────────────────

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const brainScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  // ─── Helpers (sub-render) ───────────────────────────────────────────

  const renderQuickAction = (action: QuickAction) => {
    const Icon = action.Icon;
    return (
      <TouchableOpacity
        key={action.route + action.label}
        style={styles.actionBtn}
        onPress={() => navigation.navigate(action.route as any)}
        activeOpacity={0.8}
      >
        <View style={[styles.actionIconWrap, { backgroundColor: action.color + '18' }]}>
          <Icon size={26} color={action.color} weight="duotone" />
        </View>
        <Text style={styles.actionLabel} numberOfLines={1}>{action.label}</Text>
      </TouchableOpacity>
    );
  };

  const renderStat = (opts: {
    valueText: string;
    label: string;
    Icon: PhosphorIcon;
    color: string;
    progress: number;     // 0..1
    delta?: string;       // e.g. "+3.2%"
    deltaColor?: string;
  }) => {
    const { valueText, label, Icon, color, progress, delta, deltaColor } = opts;
    return (
      <View style={styles.statCard}>
        <ProgressRing
          size={54}
          stroke={5}
          progress={progress}
          color={color}
          trackColor={colors.borderLight}
        >
          <Icon size={20} color={color} weight="duotone" />
        </ProgressRing>
        <View style={styles.statTextBlock}>
          <Text style={styles.statValue} numberOfLines={1}>{valueText}</Text>
          <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
          {delta ? (
            <Text style={[styles.statDelta, { color: deltaColor || color }]}>{delta}</Text>
          ) : null}
        </View>
      </View>
    );
  };

  const renderAlertIcon = (key: AIAlert['iconKey'], color: string) => {
    const Cmp: PhosphorIcon =
      key === 'budget' ? CurrencyEur :
      key === 'leads'  ? Users       :
      TrendUp;
    return <Cmp size={18} color={color} weight="duotone" />;
  };

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* ── HERO ─────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.heroGreetingWrap}>
                <Text style={styles.heroEmoji}>{greeting.emoji}</Text>
                <Text style={styles.heroGreeting} numberOfLines={1}>{greeting.hello}</Text>
              </View>
              <Text style={styles.heroSub}>{heroSub}</Text>
            </View>
            <View style={styles.headerActions}>
              {/* Silent when online + queue empty; shows offline / pending-write state otherwise */}
              <SyncStatusBadge />
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => navigation.navigate('Notifications' as any)}
                activeOpacity={0.8}
              >
                <Bell size={20} color={colors.text} weight="duotone" />
                {unreadNotifCount > 0 && (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText}>
                      {unreadNotifCount > 9 ? '9+' : String(unreadNotifCount)}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => navigation.navigate('Settings' as any)}
                activeOpacity={0.8}
              >
                <Gear size={20} color={colors.text} weight="duotone" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Streak chip */}
          <View style={styles.streakRow}>
            {streakCopy.muted ? (
              <View style={styles.streakMutedChip}>
                <Text style={styles.streakChipEmoji}>{streakCopy.emoji}</Text>
                <Text style={styles.streakMutedText}>{streakCopy.text}</Text>
              </View>
            ) : (
              <View style={styles.streakChip}>
                <LinearGradient
                  colors={brandGradient.deep as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.streakChipInner}
                >
                  {streak?.todayDone ? (
                    <CheckCircle size={14} color="#fff" weight="fill" />
                  ) : (
                    <Flame size={14} color="#fff" weight="fill" />
                  )}
                  <Text style={styles.streakChipText}>{streakCopy.text}</Text>
                </LinearGradient>
              </View>
            )}

            {(streak?.longest ?? 0) > (streak?.current ?? 0) && (streak?.longest ?? 0) >= 3 && (
              <View style={styles.streakMutedChip}>
                <Lightbulb size={12} color={colors.textSecondary} weight="duotone" />
                <Text style={styles.streakMutedText}>
                  {locale === 'fr' ? `Record: ${streak?.longest}j`
                    : locale === 'nl' ? `Record: ${streak?.longest}d`
                    : `Best: ${streak?.longest}d`}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── AMOS aan het werk — gecombineerde hub + agent-stats card ── */}
        <TouchableOpacity
          style={styles.amosCard}
          onPress={() => navigation.navigate('AMOSHub' as any)}
          activeOpacity={0.92}
        >
          <LinearGradient
            colors={brandGradient.deep as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.amosCardGradient}
          >
            {/* Header */}
            <View style={styles.amosCardHeader}>
              <Animated.View style={[styles.amosBrainCircle, { transform: [{ scale: brainScale }] }]}>
                <Brain size={28} color="#fff" weight="duotone" />
              </Animated.View>
              <View style={{ flex: 1 }}>
                <Text style={styles.amosCardTitle} numberOfLines={1}>AMOS aan het werk</Text>
                <Text style={styles.amosCardSub} numberOfLines={1}>Je AI marketing brein — 24/7 actief</Text>
              </View>
              <View style={styles.amosCardChevron}>
                <CaretRight size={16} color="#fff" weight="bold" />
              </View>
            </View>

            {/* Stats grid — each cell is tappable + deep-links into MultiAgent with filter */}
            <View style={styles.amosStatsGrid}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={(e) => { e.stopPropagation(); navigation.navigate('MultiAgent' as any, { filter: 'awaiting_approval' }); }}
                style={[styles.amosStatCell, agentStats.awaitingApproval > 0 && styles.amosStatCellHi]}
              >
                <Text style={styles.amosStatValue}>{agentStats.awaitingApproval}</Text>
                <Text style={styles.amosStatLabel}>Wacht op jou</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={(e) => { e.stopPropagation(); navigation.navigate('MultiAgent' as any, { filter: 'blocked' }); }}
                style={styles.amosStatCell}
              >
                <Text style={styles.amosStatValue}>{agentStats.blockedToday}</Text>
                <Text style={styles.amosStatLabel}>Geblokkeerd</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={(e) => { e.stopPropagation(); navigation.navigate('Analytics' as any); }}
                style={styles.amosStatCell}
              >
                <Text style={styles.amosStatValue}>{formatTokensCompact(agentStats.tokensToday)}</Text>
                <Text style={styles.amosStatLabel}>Tokens vandaag</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={(e) => { e.stopPropagation(); navigation.navigate('Analytics' as any); }}
                style={styles.amosStatCell}
              >
                <Text style={styles.amosStatValue}>{formatCostCompact(agentStats.costUsdToday)}</Text>
                <Text style={styles.amosStatLabel}>Kosten vandaag</Text>
              </TouchableOpacity>
            </View>

            {/* CTA row */}
            <View style={styles.amosCtaRow}>
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); navigation.navigate('MultiAgent' as any); }}
                activeOpacity={0.7}
                style={styles.amosCtaSecondary}
              >
                <Robot size={14} color="#fff" weight="duotone" />
                <Text style={styles.amosCtaText}>Agents beheren</Text>
              </TouchableOpacity>
              {agentStats.awaitingApproval > 0 && (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); navigation.navigate('MultiAgent' as any, { filter: 'awaiting_approval' }); }}
                  activeOpacity={0.8}
                  style={styles.amosCtaBadge}
                >
                  <Text style={styles.amosCtaBadgeText}>{agentStats.awaitingApproval} review{agentStats.awaitingApproval === 1 ? '' : 's'} →</Text>
                </TouchableOpacity>
              )}
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Goal Mode tile ──────────────────────────────────────── */}
        <GoalModeTile />

        {/* ── Counterfactual nudge ─────────────────────────────────── */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CounterfactualNudge />
        </View>

        {/* ── Quick Stats ──────────────────────────────────────────── */}
        <View style={[styles.statsGrid, { marginTop: spacing.md }]}>
          {renderStat({
            valueText: statsLoading ? '-' : formatNumber(stats?.active_campaigns),
            label: t.home.activeCampaigns,
            Icon: Rocket,
            color: colors.primary,
            progress: Math.min(1, (stats?.active_campaigns ?? 0) / 10),
            delta: t.home.live,
          })}
          {renderStat({
            valueText: statsLoading ? '-' : formatNumber(stats?.total_contacts),
            label: t.home.totalContacts,
            Icon: Users,
            color: colors.info,
            progress: Math.min(1, (stats?.total_contacts ?? 0) / 1000),
            delta: t.home.database,
          })}
          {renderStat({
            valueText: '24.8%',
            label: t.home.openRate,
            Icon: TrendUp,
            color: colors.success,
            progress: 0.248,
            delta: '+3.2%',
            deltaColor: colors.success,
          })}
          {renderStat({
            valueText: statsLoading ? '-' : formatCurrency(stats?.total_revenue),
            label: t.home.revenue,
            Icon: CurrencyEur,
            color: colors.secondary,
            progress: Math.min(1, (stats?.total_revenue ?? 0) / 100000),
            delta: '+12%',
            deltaColor: colors.success,
          })}
        </View>

        {/* ── Quick Actions ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Lightning size={18} color={colors.primary} weight="duotone" />
              <Text style={styles.sectionTitle}>{t.home.quickActions}</Text>
            </View>
          </View>
          <View style={styles.actionsGrid}>
            <View style={styles.actionsRow}>{QUICK_ACTIONS_ROW1.map(renderQuickAction)}</View>
            <View style={styles.actionsRow}>{QUICK_ACTIONS_ROW2.map(renderQuickAction)}</View>
          </View>
        </View>

        {/* ── Recente publicaties (A: activity-first feed) ───────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <ChatCircleText size={18} color={colors.primary} weight="duotone" />
              <Text style={styles.sectionTitle}>
                {locale === 'fr' ? 'Publications récentes' : locale === 'nl' ? 'Recente publicaties' : 'Recent publications'}
              </Text>
            </View>
            {recentPublications.length > 0 && (
              <TouchableOpacity onPress={() => navigation.navigate('AllPosts' as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.seeAllText}>
                  {locale === 'fr' ? 'Voir tout' : locale === 'nl' ? 'Alles bekijken' : 'View all'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {recentPublications.length === 0 ? (
            <View style={styles.emptyState}>
              <Sparkle size={28} color={colors.textTertiary} weight="duotone" />
              <Text style={styles.emptyTitle}>
                {locale === 'fr' ? 'Aucune publication' : locale === 'nl' ? 'Nog geen publicaties' : 'No publications yet'}
              </Text>
              <Text style={styles.emptyDescription}>
                {locale === 'fr' ? "Lancez le Wizard pour publier votre première post." : locale === 'nl' ? 'Start de Wizard om je eerste post te plaatsen.' : 'Start the Wizard to publish your first post.'}
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('CaptureWizard' as any)}
                activeOpacity={0.85}
                style={styles.emptyCta}
              >
                <LinearGradient
                  colors={brandGradient.deep as any}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.emptyCtaInner}
                >
                  <MagicWand size={14} color="#fff" weight="duotone" />
                  <Text style={styles.emptyCtaText}>Wizard</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {recentPublications.map((post: any) => {
                const platform = (post.channel ?? '').toString().toLowerCase();
                const Icon: React.ComponentType<any> =
                  platform === 'facebook'  ? FacebookLogo  :
                  platform === 'instagram' ? InstagramLogo :
                  platform === 'linkedin'  ? LinkedinLogo  :
                  platform === 'tiktok'    ? TiktokLogo    :
                  platform === 'pinterest' ? PinterestLogo :
                  platform === 'snapchat'  ? SnapchatLogo  : ShareNetwork;
                const platformColor: string =
                  platform === 'facebook'  ? '#1877F2' :
                  platform === 'instagram' ? '#E1306C' :
                  platform === 'linkedin'  ? '#0A66C2' :
                  platform === 'tiktok'    ? colors.text :
                  platform === 'pinterest' ? '#E60023' :
                  platform === 'snapchat'  ? '#FFFC00' : colors.primary;
                const status = (post.status ?? 'draft').toString();
                const StatusIcon =
                  status === 'published' ? CheckCircle :
                  status === 'failed'    ? XCircle     :
                  status === 'scheduled' ? Calendar    : Clock;
                const statusTint =
                  status === 'published' ? '#10B981' :
                  status === 'failed'    ? '#EF4444' :
                  status === 'scheduled' ? colors.info : colors.textTertiary;
                const when = post.published_at ?? post.scheduled_at ?? post.created_at;
                const ago = when ? timeAgoShort(when, locale) : '';
                const caption = (post.text_content ?? '').toString().trim();
                return (
                  <TouchableOpacity
                    key={post.id}
                    onPress={() => navigation.navigate('PostReview' as any, { captureId: post.capture_id, eventId: post.event_id || undefined })}
                    activeOpacity={0.85}
                    style={styles.feedRow}
                  >
                    <View style={[styles.feedIconWrap, { backgroundColor: platformColor + '18' }]}>
                      <Icon size={18} color={platformColor === colors.text ? colors.text : platformColor} weight="duotone" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.feedPlatform} numberOfLines={1}>
                          {/* Crash-fix 1.0.3: precedence bug — || 'Channel' only applied
                              to slice(1), not the whole expression. Null `platform` from
                              useConnectedChannels() would throw on .charAt(0). */}
                          {(platform || 'channel').charAt(0).toUpperCase() + (platform || 'channel').slice(1)}
                        </Text>
                        <Text style={styles.feedDot}>·</Text>
                        <Text style={styles.feedTime}>{ago}</Text>
                      </View>
                      {!!caption && (
                        <Text style={styles.feedCaption} numberOfLines={1}>{caption}</Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <StatusIcon size={14} color={statusTint} weight={status === 'published' ? 'fill' : 'bold'} />
                      <Text style={[styles.feedStatus, { color: statusTint }]}>
                        {status === 'published' ? (locale === 'fr' ? 'Publié' : 'Live')
                          : status === 'failed' ? (locale === 'fr' ? 'Échec' : locale === 'nl' ? 'Mislukt' : 'Failed')
                          : status === 'scheduled' ? (locale === 'fr' ? 'Plan.' : locale === 'nl' ? 'Plan.' : 'Sched.')
                          : status === 'draft' ? (locale === 'fr' ? 'Brouillon' : locale === 'nl' ? 'Concept' : 'Draft')
                          : status}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Upcoming Events ──────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Calendar size={18} color={colors.primary} weight="duotone" />
              <Text style={styles.sectionTitle}>{t.home.upcomingEvents}</Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate('Main', { screen: 'EventsTab' } as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.seeAllText}>{t.home.viewAllEvents}</Text>
            </TouchableOpacity>
          </View>

          {upcomingEvents.length === 0 ? (
            <View style={styles.emptyState}>
              <CalendarBlank size={32} color={colors.textSecondary} weight="duotone" />
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
                      <Text style={styles.eventMeta} numberOfLines={1}>{event.location || '—'}</Text>
                    </View>
                    <View style={styles.eventMetaRow}>
                      <Calendar size={11} color={colors.textSecondary} weight="duotone" />
                      <Text style={styles.eventMeta}>
                        {new Date(event.event_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      </Text>
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

        {/* ── Recent Campaigns ─────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Megaphone size={18} color={colors.primary} weight="duotone" />
              <Text style={styles.sectionTitle}>{t.home.recentCampaigns}</Text>
            </View>
            {campaigns.length > 3 && (
              <TouchableOpacity
                onPress={() => navigation.navigate('CampaignList' as any)}
                activeOpacity={0.8}
              >
                <Text style={styles.seeAllText}>{t.home.viewAll}</Text>
              </TouchableOpacity>
            )}
          </View>

          {campaignsLoading ? (
            <View style={styles.loadingPlaceholder}>
              <Text style={styles.loadingText}>{t.common.loading}</Text>
            </View>
          ) : recentCampaigns.length === 0 ? (
            <View style={styles.emptyState}>
              <Megaphone size={36} color={colors.textSecondary} weight="duotone" />
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
                    activeOpacity={0.8}
                  >
                    <View style={styles.campaignInfo}>
                      <Text style={styles.campaignName} numberOfLines={1}>{campaign.name}</Text>
                      <Text style={styles.campaignMeta}>
                        {campaign.type}
                        {campaign.start_date
                          ? ` • ${new Date(campaign.start_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}`
                          : ''}
                      </Text>
                    </View>
                    <View style={[styles.campaignBadge, { backgroundColor: badgeColor + '15' }]}>
                      <View style={[styles.campaignBadgeDot, { backgroundColor: badgeColor }]} />
                      <Text style={[styles.campaignBadgeText, { color: badgeColor }]}>
                        {statusLabel[status] || status}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ── AI Suggestions ───────────────────────────────────────── */}
        {visibleAlerts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Sparkle size={18} color={colors.primary} weight="duotone" />
                <Text style={styles.sectionTitle}>{t.home.aiSuggestions}</Text>
              </View>
              <Text style={styles.sectionBadge}>{visibleAlerts.length}</Text>
            </View>

            <View style={styles.suggestionsList}>
              {visibleAlerts.map((alert) => (
                <View key={alert.id} style={styles.suggestionCard}>
                  <View style={[styles.suggestionAccent, { backgroundColor: alert.color }]} />
                  <View style={styles.suggestionContent}>
                    <View style={[styles.suggestionIconWrap, { backgroundColor: alert.color + '20' }]}>
                      {renderAlertIcon(alert.iconKey, alert.color)}
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
                      activeOpacity={0.85}
                    >
                      <Text style={styles.suggestionBtnAcceptText}>{t.common.accept}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.suggestionBtn, styles.suggestionBtnDismiss]}
                      onPress={() => dismissAlert(alert.id)}
                      activeOpacity={0.85}
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
