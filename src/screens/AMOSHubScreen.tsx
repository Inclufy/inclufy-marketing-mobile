// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: (m.icon + (m.iconLib === 'ionicons' ? '-outline' : '')) as any> | MaterialCommunityIcons name=<dynamic: m.icon as any>
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import type { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { useTranslation } from '../i18n';

import { CaretLeft, CaretRight, Robot } from 'phosphor-react-native';
type Nav = NativeStackNavigationProp<RootStackParamList>;

// ─── Module Definitions ──────────────────────────────────────────────────────

type SectionKey =
  | 'today'
  | 'capture'
  | 'content'
  | 'ads'
  | 'intelligence'
  | 'setup';

interface AMOSModule {
  id: string;
  name: string;
  nameNl: string;
  description: string;
  descriptionNl: string;
  icon: string;
  iconLib: 'ionicons' | 'mci';
  color: string;
  gradientColors: [string, string];
  // Honest status:
  //  - 'active'  → real DB read+write or real edge fn calls flowing in/out
  //  - 'beta'    → screen renders but is partial (read-only display, no app-side mutations,
  //                or single edge-fn barely wired)
  //  - 'coming'  → mostly UI mock, no DB writes / static data only
  status: 'active' | 'beta' | 'coming';
  route: keyof RootStackParamList | string | null;
  section: SectionKey;
}

// ─── Single source of truth — all modules in display order ──────────────────
// Sections are rendered in this order: today → capture → content → ads → intelligence → setup
const ALL_MODULES: AMOSModule[] = [
  // ── TODAY ─────────────────────────────────────────────────────────────────
  {
    id: 'multiagent',
    name: 'Multi-Agent System',
    nameNl: 'Multi-Agent Systeem',
    description: 'Autonomous AI agent network',
    descriptionNl: 'AI-agentennetwerk',
    icon: 'git-network',
    iconLib: 'ionicons',
    color: '#A855F7',
    gradientColors: ['#9333EA', '#A855F7'],
    // DB tables (agents, agent_runs, agent_run_messages) live + orchestrator
    // and agent-ads edge functions deployed; AgentDetailScreen does real DB
    // reads + writes (kill switch, runs list). Mark 'beta' until in-app
    // dispatch is tap-tested on a real device end-to-end.
    status: 'beta',
    route: 'MultiAgent',
    section: 'today',
  },
  {
    id: 'goalmode',
    name: 'Goal Mode',
    nameNl: 'Doel-modus',
    description: 'Quarterly outcome targets with autonomous agent dispatch',
    descriptionNl: 'Kwartaaldoelen met autonome agent inzet',
    // 'flag-checkered' is in MaterialCommunityIcons.
    icon: 'flag-checkered',
    iconLib: 'mci',
    color: '#F97316',
    gradientColors: ['#EA580C', '#F97316'],
    // Backend (agent_goals + cron + orchestrator/run_goals) is deployed,
    // but in-app dispatch from the wizard hasn't been field-tested e2e.
    status: 'beta',
    // New users → wizard. Users with an active goal are redirected to the
    // detail screen by GoalSetupScreen logic / GoalModeTile tap.
    route: 'GoalSetup',
    section: 'today',
  },
  {
    id: 'analytics',
    name: 'Analytics & Reporting',
    nameNl: 'Analytics & Rapportage',
    description: 'Deep insights & ROI tracking',
    descriptionNl: 'Diepgaande inzichten',
    icon: 'bar-chart',
    iconLib: 'ionicons',
    color: '#84CC16',
    gradientColors: ['#65A30D', '#84CC16'],
    // Read-only dashboard — no writes from this screen
    status: 'beta',
    route: 'Analytics',
    section: 'today',
  },
  {
    id: 'opportunity',
    name: 'Opportunity Feed',
    nameNl: 'Kansen Feed',
    description: 'AI-detected market opportunities & signals',
    descriptionNl: 'AI-gedetecteerde marktkansen',
    icon: 'radio',
    iconLib: 'ionicons',
    color: '#F59E0B',
    gradientColors: ['#D97706', '#F59E0B'],
    status: 'active',
    route: 'OpportunityFeed',
    section: 'today',
  },

  // ── CAPTURE ───────────────────────────────────────────────────────────────
  {
    id: 'event',
    name: 'Event Intelligence',
    nameNl: 'Event Intelligence',
    description: 'Capture, AI-generate & publish live from events',
    descriptionNl: 'Capture, AI-post & publiceer live op events',
    icon: 'calendar',
    iconLib: 'ionicons',
    color: '#9333EA',
    gradientColors: ['#6D28D9', '#9333EA'],
    status: 'active',
    route: 'EventIntelligence',
    section: 'capture',
  },
  {
    id: 'library',
    name: 'Content Library',
    nameNl: 'Content Library',
    description: 'Pre-designed product posts',
    descriptionNl: 'Vooraf ontworpen productposts',
    icon: 'images',
    iconLib: 'ionicons',
    color: '#10B981',
    gradientColors: ['#059669', '#10B981'],
    status: 'active',
    route: 'Library',
    section: 'capture',
  },
  {
    id: 'proposals',
    name: 'Content Proposals',
    nameNl: 'Content Voorstellen',
    description: 'Review & approve AI content',
    descriptionNl: 'Beoordeel & keur AI content goed',
    icon: 'file-document-check-outline',
    iconLib: 'mci',
    color: '#F59E0B',
    gradientColors: ['#D97706', '#F59E0B'],
    status: 'active',
    route: 'ContentProposals',
    section: 'capture',
  },

  // ── CONTENT ───────────────────────────────────────────────────────────────
  {
    id: 'content',
    name: 'Content Intelligence',
    nameNl: 'Content Intelligence',
    description: 'AI content creation & strategy',
    descriptionNl: 'AI contentcreatie & strategie',
    icon: 'create',
    iconLib: 'ionicons',
    color: '#EC4899',
    gradientColors: ['#DB2777', '#EC4899'],
    status: 'active',
    route: 'ContentCreator',
    section: 'content',
  },
  {
    id: 'calendar',
    name: 'Content Calendar',
    nameNl: 'Content Kalender',
    description: 'Week & month planning view',
    descriptionNl: 'Week- & maandplanning',
    icon: 'calendar-month',
    iconLib: 'mci',
    color: '#9333EA',
    gradientColors: ['#7C3AED', '#9333EA'],
    // Read-only display of proposals/campaigns; no writes
    status: 'beta',
    route: 'ContentCalendar',
    section: 'content',
  },
  {
    id: 'ai',
    name: 'AI Copilot',
    nameNl: 'AI Copiloot',
    description: 'Your AI marketing assistant',
    descriptionNl: 'Jouw AI marketing-assistent',
    icon: 'robot-outline',
    iconLib: 'mci',
    color: '#8B5CF6',
    gradientColors: ['#7C3AED', '#8B5CF6'],
    status: 'active',
    route: 'AICommand',
    section: 'content',
  },
  {
    id: 'automation',
    name: 'Marketing Automation',
    nameNl: 'Automatisering',
    description: 'Trigger-based workflows',
    descriptionNl: 'Trigger-gebaseerde flows',
    icon: 'rocket',
    iconLib: 'ionicons',
    color: '#6366F1',
    gradientColors: ['#4F46E5', '#6366F1'],
    status: 'active',
    route: 'MarketingAutomation',
    section: 'content',
  },

  // ── ADS ───────────────────────────────────────────────────────────────────
  {
    id: 'boost',
    name: 'Boost a Post',
    nameNl: 'Promoot een post',
    description: 'Pick a post → Boost it into a paid campaign',
    descriptionNl: 'Kies een post → maak er een betaalde campagne van',
    icon: 'rocket-launch-outline',
    iconLib: 'mci',
    color: '#FF6B35',
    gradientColors: ['#C2410C', '#FF6B35'],
    // BoostFlowScreen exists but the agent integration is pending; from the Hub we
    // intentionally land users on AllPosts so they pick a post first (BoostFlow
    // requires { postId, channel } params and would crash if opened bare).
    status: 'beta',
    route: 'AllPosts',
    section: 'ads',
  },
  {
    id: 'campaign',
    name: 'Campaign Engine',
    nameNl: 'Campaign Engine',
    description: 'Multi-channel campaigns',
    descriptionNl: 'Multi-channel campagnes',
    icon: 'megaphone',
    iconLib: 'ionicons',
    color: '#3B82F6',
    gradientColors: ['#2563EB', '#3B82F6'],
    status: 'active',
    route: 'CampaignList',
    section: 'ads',
  },
  {
    id: 'budget',
    name: 'Budget Monitor',
    nameNl: 'Budget Monitor',
    description: 'Track & optimize marketing spend',
    descriptionNl: 'Beheer marketingbudget',
    icon: 'card',
    iconLib: 'ionicons',
    color: '#EF4444',
    gradientColors: ['#DC2626', '#EF4444'],
    // Read-only display of analytics + campaigns
    status: 'beta',
    route: 'BudgetMonitor',
    section: 'ads',
  },
  {
    id: 'strategy',
    name: 'Marketing Strategy',
    nameNl: 'Marketing Strategie',
    description: 'Plan goals, budget & content strategy',
    descriptionNl: 'Plan doelen, budget & contentstrategie',
    icon: 'chart-timeline-variant-shimmer',
    iconLib: 'mci',
    color: '#059669',
    gradientColors: ['#047857', '#059669'],
    status: 'active',
    route: 'MarketingStrategy',
    section: 'ads',
  },

  // ── INTELLIGENCE ──────────────────────────────────────────────────────────
  {
    id: 'networking',
    name: 'Networking Engine',
    nameNl: 'Networking Engine',
    description: 'Contacts via QR/NFC',
    descriptionNl: 'Contacten via QR/NFC',
    icon: 'account-network',
    iconLib: 'mci',
    color: '#10B981',
    gradientColors: ['#059669', '#10B981'],
    status: 'active',
    route: 'NetworkingEngine',
    section: 'intelligence',
  },
  {
    id: 'lead',
    name: 'Lead Intelligence',
    nameNl: 'Lead Intelligence',
    description: 'Capture & qualify leads with AI',
    descriptionNl: 'AI-kwalificatie van leads',
    icon: 'people',
    iconLib: 'ionicons',
    color: '#14B8A6',
    gradientColors: ['#0D9488', '#14B8A6'],
    status: 'active',
    route: 'SmartLead',
    section: 'intelligence',
  },

  // ── TEAM & SETUP ──────────────────────────────────────────────────────────
  {
    id: 'products',
    name: 'Products',
    nameNl: 'Producten',
    description: 'Manage products & services catalog',
    descriptionNl: 'Beheer producten & diensten catalogus',
    icon: 'package-variant-closed',
    iconLib: 'mci',
    color: '#3B82F6',
    gradientColors: ['#2563EB', '#3B82F6'],
    status: 'active',
    route: 'Products',
    section: 'setup',
  },
  {
    id: 'team',
    name: 'Team Directory',
    nameNl: 'Team',
    description: 'Team members & expertise',
    descriptionNl: 'Teamleden & expertise',
    icon: 'account-group',
    iconLib: 'mci',
    color: '#8B5CF6',
    gradientColors: ['#7C3AED', '#8B5CF6'],
    status: 'active',
    route: 'TeamDirectory',
    section: 'setup',
  },
  {
    id: 'organization',
    name: 'Organization',
    nameNl: 'Organisatie',
    description: 'Company profile, pitch & boilerplate',
    descriptionNl: 'Bedrijfsprofiel, pitch & boilerplate',
    icon: 'office-building',
    iconLib: 'mci',
    color: '#F97316',
    gradientColors: ['#EA580C', '#F97316'],
    status: 'active',
    route: 'Organization',
    section: 'setup',
  },
  {
    id: 'integrations',
    name: 'Integrations',
    nameNl: 'Integraties',
    description: 'Connect your tools & platforms',
    descriptionNl: 'Verbind je tools & platformen',
    icon: 'link',
    iconLib: 'ionicons',
    color: '#64748B',
    gradientColors: ['#475569', '#64748B'],
    // Hardcoded integration list, all `connected: false`, no OAuth/persist logic in screen
    status: 'coming',
    route: 'Integrations',
    section: 'setup',
  },
  {
    id: 'autonomous',
    name: 'Autonomous Hub',
    nameNl: 'Autonoom Hub',
    description: 'AI autonomous marketing ops',
    descriptionNl: 'Autonome AI marketingoperaties',
    icon: 'brain',
    iconLib: 'mci',
    color: '#7C3AED',
    gradientColors: ['#6D28D9', '#7C3AED'],
    // Dashboard reads via hooks but no app-side autonomous engine writes
    status: 'beta',
    route: 'AutonomousHub',
    section: 'setup',
  },
  {
    id: 'onboarding',
    name: 'Onboarding Wizard',
    nameNl: 'Installatie Wizard',
    description: 'Setup your marketing platform',
    descriptionNl: 'Stel je platform in',
    icon: 'rocket-launch',
    iconLib: 'mci',
    color: '#EC4899',
    gradientColors: ['#DB2777', '#EC4899'],
    // Imports supabase but never calls it — wizard not yet wired to persistence
    status: 'coming',
    route: 'Onboarding',
    section: 'setup',
  },
];

// Section order + bilingual labels (inline to avoid touching i18n files)
const SECTION_ORDER: SectionKey[] = [
  'today',
  'capture',
  'content',
  'ads',
  'intelligence',
  'setup',
];

const SECTION_LABELS: Record<SectionKey, { en: string; nl: string }> = {
  today:        { en: 'Today',          nl: 'Vandaag' },
  capture:      { en: 'Capture',        nl: 'Vastleggen' },
  content:      { en: 'Content',        nl: 'Content' },
  ads:          { en: 'Ads',            nl: 'Advertenties' },
  intelligence: { en: 'Intelligence',   nl: 'Intelligence' },
  setup:        { en: 'Team & Setup',   nl: 'Team & Setup' },
};

const ACTIVE_COUNT = ALL_MODULES.filter((m) => m.status === 'active').length;
const BETA_COUNT = ALL_MODULES.filter((m) => m.status === 'beta').length;
const COMING_COUNT = ALL_MODULES.filter((m) => m.status === 'coming').length;
const TOTAL_COUNT = ALL_MODULES.length;

// ─── Component ───────────────────────────────────────────────────────────────

export default function AMOSHubScreen() {
  const navigation = useNavigation<Nav>();
  const { locale, t } = useTranslation();
  const { colors, isDark } = useTheme();
  const isNl = locale === 'nl';

  const styles = useThemedStyles((c) => ({
    container: { flex: 1 },

    // Header
    header: {
      paddingTop: Platform.OS === 'ios' ? 56 : 36,
      paddingBottom: spacing.lg,
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
    },
    headerWithBack: {
      paddingTop: Platform.OS === 'ios' ? 106 : 72,
    },
    amosLogoRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.md,
    },
    amosLogoCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: 'rgba(255,255,255,0.15)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.25)',
    },
    amosTitle: {
      fontSize: 24,
      fontWeight: fontWeight.bold as any,
      color: '#fff',
      letterSpacing: 2,
    },
    amosSubtitle: {
      fontSize: fontSize.xs,
      color: 'rgba(255,255,255,0.6)',
      letterSpacing: 0.3,
    },
    statsPill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: 'rgba(255,255,255,0.10)',
      borderRadius: borderRadius.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    statItem: { flex: 1, alignItems: 'center' as const },
    statValue: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold as any,
      color: '#fff',
    },
    statLabel: {
      fontSize: 10,
      color: 'rgba(255,255,255,0.55)',
      marginTop: 1,
    },
    statDivider: {
      width: 1,
      height: 28,
      backgroundColor: 'rgba(255,255,255,0.2)',
      marginHorizontal: spacing.sm,
    },

    // Scroll
    scrollContent: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      gap: spacing.sm,
    },

    // Section header
    sectionRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
      marginTop: spacing.md,
      marginBottom: 6,
    },
    sectionLine: { flex: 1, height: 1 },
    sectionLabel: {
      fontSize: 10,
      fontWeight: fontWeight.bold as any,
      letterSpacing: 1.2,
    },

    // Grid cards (2-col)
    grid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: spacing.sm,
    },
    gridCard: {
      width: '48.5%' as any,
      borderRadius: borderRadius.xl,
      borderWidth: 1,
      overflow: 'hidden' as const,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 3,
    },
    gridAccent: {
      height: 3,
      width: '100%',
    },
    gridBody: {
      padding: spacing.md,
      gap: spacing.xs,
    },
    gridIconWrap: {
      width: 42,
      height: 42,
      borderRadius: borderRadius.md,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      marginBottom: spacing.xs,
    },
    gridName: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold as any,
      lineHeight: 18,
    },
    gridDesc: {
      fontSize: fontSize.xs,
      lineHeight: 15,
      flex: 1,
    },
    gridFooter: {
      marginTop: spacing.sm,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
    },
    badge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: borderRadius.full,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: fontWeight.semibold as any,
    },
    arrowChip: {
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },

    // Engine status
    engineCard: {
      marginTop: spacing.lg,
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      borderLeftWidth: 3,
      borderLeftColor: '#10D9A0',
      padding: spacing.md,
      gap: 4,
    },
    engineRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    engineDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#10D9A0',
    },
    engineTitle: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold as any,
    },
    engineSub: {
      fontSize: fontSize.xs,
      marginLeft: 8 + spacing.sm,
      lineHeight: 16,
    },
  }));

  const getName = (m: AMOSModule) => (isNl ? m.nameNl : m.name);
  const getDesc = (m: AMOSModule) => (isNl ? m.descriptionNl : m.description);
  const getSectionLabel = (key: SectionKey) =>
    isNl ? SECTION_LABELS[key].nl : SECTION_LABELS[key].en;

  const navigate = (m: AMOSModule) => {
    if (!m.route || m.status === 'coming') return;
    try {
      navigation.navigate(m.route as any);
    } catch (e) {
      // Try parent navigator if not found in current stack
      try { (navigation as any).getParent()?.navigate(m.route); } catch {}
    }
  };

  // ── Status badge label ─────────────────────────────────────────────────────
  const getBadgeLabel = (m: AMOSModule): string | null => {
    if (m.status === 'coming') return t.amosHub.comingSoon;
    if (m.status === 'beta') return isNl ? 'Bèta' : 'Beta';
    return null;
  };

  // ── Grid card (half-width) ─────────────────────────────────────────────────
  const renderGridCard = (m: AMOSModule) => {
    const isComingSoon = m.status === 'coming';
    const isBeta = m.status === 'beta';
    const badgeLabel = getBadgeLabel(m);

    return (
      <TouchableOpacity
        key={m.id}
        style={[
          styles.gridCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: m.color,
            opacity: isComingSoon ? 0.55 : 1,
          },
        ]}
        onPress={() => navigate(m)}
        activeOpacity={isComingSoon ? 1 : 0.78}
      >
        {/* Color accent bar */}
        <View style={[styles.gridAccent, { backgroundColor: m.color }]} />

        <View style={styles.gridBody}>
          {/* Icon */}
          <View style={[styles.gridIconWrap, { backgroundColor: m.color + '18' }]}>
            {m.iconLib === 'mci' ? (
              <MaterialCommunityIcons
                name={m.icon as any}
                size={22}
                color={isComingSoon ? colors.textTertiary : m.color}
              />
            ) : (
              <Ionicons
                name={(m.icon + (m.iconLib === 'ionicons' ? '-outline' : '')) as any}
                size={22}
                color={isComingSoon ? colors.textTertiary : m.color}
              />
            )}
          </View>

          <Text
            style={[styles.gridName, { color: isComingSoon ? colors.textSecondary : colors.text }]}
            numberOfLines={2}
          >
            {getName(m)}
          </Text>
          <Text style={[styles.gridDesc, { color: colors.textSecondary }]} numberOfLines={2}>
            {getDesc(m)}
          </Text>

          {/* Footer */}
          <View style={styles.gridFooter}>
            {badgeLabel ? (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: isBeta ? '#F59E0B22' : colors.borderLight,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: isBeta ? '#B45309' : colors.textTertiary },
                  ]}
                >
                  {badgeLabel}
                </Text>
              </View>
            ) : null}
            {!isComingSoon && (
              <View style={[styles.arrowChip, { backgroundColor: m.color + '18' }]}>
                <CaretRight size={12} color={m.color} weight="bold" />
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Section header ─────────────────────────────────────────────────────────
  const renderSectionHeader = (label: string) => (
    <View style={styles.sectionRow}>
      <View style={[styles.sectionLine, { backgroundColor: colors.border }]} />
      <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>
        {label.toUpperCase()}
      </Text>
      <View style={[styles.sectionLine, { backgroundColor: colors.border }]} />
    </View>
  );

  // ── Group modules by section, preserving SECTION_ORDER ─────────────────────
  const sectionsToRender = SECTION_ORDER.map((key) => ({
    key,
    label: getSectionLabel(key),
    modules: ALL_MODULES.filter((m) => m.section === key),
  })).filter((s) => s.modules.length > 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ─── Gradient Header ─────────────────────────────────────────── */}
      <LinearGradient
        colors={['#C01D60', '#E8317A', '#F7941D']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, navigation.canGoBack() && styles.headerWithBack]}
      >
        {/* Back button — only when navigated from stack (not as tab) */}
        {navigation.canGoBack() && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ position: 'absolute' as const, top: Platform.OS === 'ios' ? 54 : 16, left: 16, zIndex: 10, padding: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' }}
            activeOpacity={0.7}
          >
            <CaretLeft size={22} color="#fff" weight="bold" />
          </TouchableOpacity>
        )}

        {/* Logo row */}
        <View style={styles.amosLogoRow}>
          <View style={styles.amosLogoCircle}>
            <Robot size={22} color="#fff" weight="fill" />
          </View>
          <View>
            <Text style={styles.amosTitle}>AMOS</Text>
            <Text style={styles.amosSubtitle}>{t.amosHub.subtitle}</Text>
          </View>
        </View>

        {/* Stats pill */}
        <View style={styles.statsPill}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{ACTIVE_COUNT}</Text>
            <Text style={styles.statLabel}>{t.amosHub.statActive}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{BETA_COUNT}</Text>
            <Text style={styles.statLabel}>{isNl ? 'Bèta' : 'Beta'}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{COMING_COUNT}</Text>
            <Text style={styles.statLabel}>{t.amosHub.statComing}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{TOTAL_COUNT}</Text>
            <Text style={styles.statLabel}>{t.amosHub.statTotal}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ─── Scroll ──────────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {sectionsToRender.map((s) => (
          <View key={s.key}>
            {renderSectionHeader(s.label)}
            <View style={styles.grid}>
              {s.modules.map(renderGridCard)}
            </View>
          </View>
        ))}

        {/* ── AMOS Engine status ──────────────────────────────────────── */}
        <View style={[styles.engineCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.engineRow}>
            <View style={styles.engineDot} />
            <Text style={[styles.engineTitle, { color: colors.text }]}>{t.amosHub.engineOnline}</Text>
          </View>
          <Text style={[styles.engineSub, { color: colors.textSecondary }]}>
            {t.amosHub.engineStack}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
