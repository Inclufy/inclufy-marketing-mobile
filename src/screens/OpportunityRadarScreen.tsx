import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';

import { CaretRight, Radioactive, X } from 'phosphor-react-native';
type OpportunityType = 'trending' | 'event' | 'budget' | 'lead' | 'content' | 'channel' | 'gap';

interface Opportunity {
  id: string;
  type: OpportunityType;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  action: string;
  route?: string;
  timeAgo: string;
  estimatedValue?: number;
  cost?: number;
  revenue?: number;
}

const TYPE_CONFIG: Record<OpportunityType, { icon: string; color: string; bg: string; lib: string }> = {
  trending: { icon: 'trending-up', color: '#9333EA', bg: '#F3E8FF', lib: 'Ionicons' },
  event: { icon: 'calendar-star', color: '#DB2777', bg: '#FCE7F3', lib: 'MaterialCommunityIcons' },
  budget: { icon: 'cash-outline', color: '#D97706', bg: '#FEF3C7', lib: 'Ionicons' },
  lead: { icon: 'people-outline', color: '#10b981', bg: '#D1FAE5', lib: 'Ionicons' },
  content: { icon: 'create-outline', color: '#3b82f6', bg: '#EFF6FF', lib: 'Ionicons' },
  channel: { icon: 'bar-chart-outline', color: '#0077b5', bg: '#E0F2FE', lib: 'Ionicons' },
  gap: { icon: 'warning-outline', color: '#FF6B35', bg: '#FFF7ED', lib: 'Ionicons' },
};

const IMPACT_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981',
};

const IMPACT_LABELS: Record<string, string> = {
  high: 'High impact',
  medium: 'Medium',
  low: 'Low',
};

function ImpactDot({ level }: { level: 'high' | 'medium' | 'low' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{
        width: 7, height: 7, borderRadius: 4,
        backgroundColor: IMPACT_COLORS[level],
      }} />
      <Text style={{ fontSize: 11, color: IMPACT_COLORS[level], fontWeight: '600' }}>
        {IMPACT_LABELS[level]}
      </Text>
    </View>
  );
}

function formatValue(val: number) {
  if (!val) return '€0';
  if (val >= 1000) return `€${Math.round(val / 1000)}K`;
  return `€${val}`;
}

export default function OpportunityRadarScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const qc = useQueryClient();
  const { colors } = useTheme();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [filter, setFilter] = useState<OpportunityType | 'all'>('all');

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      backgroundColor: c.surface,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    radarBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 5,
      backgroundColor: '#F3E8FF',
      alignSelf: 'flex-start' as const,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      marginBottom: spacing.xs,
    },
    radarBadgeText: { fontSize: 11, color: c.primary, fontWeight: fontWeight.semibold },
    headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text },
    headerSub: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: 2 },
    filterRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: '#F4F4F5',
      borderWidth: 1.5,
      borderColor: '#E4E4E7',
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: '#3f3f46' },
    chipTextActive: { color: '#fff' },
    list: { padding: spacing.md, gap: spacing.sm },
    card: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    cardTop: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: spacing.sm },
    typeIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center' as const, alignItems: 'center' as const },
    cardMeta: { alignItems: 'flex-end' as const, gap: 4 },
    timeAgo: { fontSize: 10, color: c.textTertiary },
    cardTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: c.text, marginBottom: 6 },
    cardDesc: { fontSize: fontSize.sm, color: c.textSecondary, lineHeight: 20, marginBottom: spacing.sm },
    metricsRow: { flexDirection: 'row' as const, gap: spacing.xs, flexWrap: 'wrap' as const, marginBottom: spacing.sm },
    metricBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    cardActions: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
    dismissBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingVertical: 6, paddingHorizontal: 2 },
    dismissText: { fontSize: fontSize.xs, color: c.textTertiary },
    actionBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 5,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
    },
    actionBtnText: { color: '#fff', fontWeight: fontWeight.semibold, fontSize: fontSize.xs },
    empty: { alignItems: 'center' as const, paddingTop: 60, gap: spacing.sm },
    emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: c.text },
    emptySub: { fontSize: fontSize.sm, color: c.textSecondary, textAlign: 'center' as const },
  }));

  // ── Fetch real data from multiple sources ─────────────────────────────
  const { data: opportunities = [], isLoading, refetch } = useQuery<Opportunity[]>({
    queryKey: ['radar_opportunities'],
    queryFn: async () => {
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      if (!user) return [];

      const opps: Opportunity[] = [];

      // 1) Discovered events as opportunities
      try {
        const { data: events } = await supabase
          .from('discovered_events')
          .select('*')
          .eq('user_id', user.id)
          .neq('status', 'registered')
          .order('priority_score', { ascending: false })
          .limit(5);

        (events ?? []).forEach(e => {
          const now = new Date();
          const eventDate = new Date(e.date_start);
          const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / 86400000);
          if (daysUntil < 0) return;

          const score = e.priority_score ?? 0;
          const ticketCost = typeof e.cost === 'object' ? (e.cost?.total ?? 0) : (e.cost ?? 0);
          opps.push({
            id: `radar-event-${e.id}`,
            type: 'event',
            title: e.name,
            description: `${e.city || e.location || ''} · ${daysUntil} dagen · Match: ${e.target_audience_match ?? 0}%. ${e.ai_recommendation || ''}`,
            impact: score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low',
            action: 'Bekijk event',
            route: 'EventIntelligence',
            timeAgo: `${daysUntil}d`,
            estimatedValue: (e.estimated_leads ?? 0) * 150,
            cost: ticketCost,
            revenue: (e.estimated_leads ?? 0) * 150,
          });
        });
      } catch {}

      // 2) Feed items as opportunities
      try {
        const { data: feedItems } = await supabase
          .from('feed_items')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_actioned', false)
          .order('created_at', { ascending: false })
          .limit(8);

        (feedItems ?? []).forEach(fi => {
          const typeMap: Record<string, OpportunityType> = {
            lead_signal: 'lead',
            trend_alert: 'trending',
            campaign_trigger: 'content',
            event_opportunity: 'event',
            competitor_move: 'channel',
            content_opportunity: 'content',
            budget_optimization: 'budget',
          };
          opps.push({
            id: `radar-feed-${fi.id}`,
            type: typeMap[fi.type] || 'lead',
            title: fi.title,
            description: fi.description || '',
            impact: fi.urgency === 'immediate' ? 'high' : fi.urgency === 'today' ? 'high' : 'medium',
            action: fi.suggested_action?.label || 'Bekijken',
            route: fi.type === 'event_opportunity' ? 'EventIntelligence' : fi.type === 'lead_signal' ? 'LeadCapture' : undefined,
            timeAgo: formatTimeShort(fi.created_at || fi.timestamp),
            estimatedValue: fi.estimated_value ?? 0,
            revenue: fi.impact_metrics?.revenue,
            cost: fi.impact_metrics?.cost,
          });
        });
      } catch {}

      // 3) Marketing gaps
      try {
        const { data: profile } = await supabase.from('profiles').select('linkedin, instagram, website').eq('id', user.id).maybeSingle();
        const { count: contactCount } = await supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', user.id);

        if (!profile?.linkedin && !profile?.instagram) {
          opps.push({
            id: 'radar-gap-social',
            type: 'gap',
            title: 'Social media profielen ontbreken',
            description: 'Voeg LinkedIn of Instagram toe om je bereik te vergroten.',
            impact: 'medium',
            action: 'Profiel aanvullen',
            route: 'Settings',
            timeAgo: 'nu',
            estimatedValue: 2000,
          });
        }
        if ((contactCount ?? 0) < 10) {
          opps.push({
            id: 'radar-gap-contacts',
            type: 'gap',
            title: `Nog maar ${contactCount ?? 0} contacten`,
            description: 'Gebruik QR, NFC of visitekaartjes om je netwerk uit te breiden.',
            impact: 'medium',
            action: 'Deel QR',
            route: 'MyDigitalCard',
            timeAgo: 'nu',
            estimatedValue: 1500,
          });
        }
        if (!profile?.website) {
          opps.push({
            id: 'radar-gap-website',
            type: 'gap',
            title: 'Website ontbreekt',
            description: 'Contacten kunnen niet naar je site navigeren.',
            impact: 'low',
            action: 'Toevoegen',
            route: 'Settings',
            timeAgo: 'nu',
            estimatedValue: 800,
          });
        }
      } catch {}

      return opps;
    },
    staleTime: 60_000,
  });

  const visible = opportunities.filter(o =>
    !dismissed.includes(o.id) &&
    (filter === 'all' || o.type === filter)
  );

  const highCount = visible.filter(o => o.impact === 'high').length;

  const handleDismiss = (id: string) => {
    setDismissed(prev => [...prev, id]);
  };

  const handleAction = (opp: Opportunity) => {
    if (opp.route) {
      navigation.navigate(opp.route as any);
    }
  };

  const FILTERS: Array<{ key: OpportunityType | 'all'; label: string }> = [
    { key: 'all', label: 'Alle' },
    { key: 'event', label: 'Events' },
    { key: 'lead', label: 'Leads' },
    { key: 'gap', label: 'Gaps' },
    { key: 'trending', label: 'Trending' },
    { key: 'budget', label: 'Budget' },
    { key: 'content', label: 'Content' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.radarBadge}>
          <Radioactive size={18} color={colors.primary} weight="duotone" />
          <Text style={styles.radarBadgeText}>{t.radar?.live ?? 'Live AI Radar'}</Text>
        </View>
        <Text style={styles.headerTitle}>{t.radar?.title ?? 'Opportunity Radar'}</Text>
        <Text style={styles.headerSub}>
          {highCount > 0
            ? `${highCount} ${t.radar?.highImpact ?? 'high-impact opportunities'}`
            : t.radar?.noHighImpact ?? 'Alle kansen beoordeeld'}
        </Text>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => { refetch(); setDismissed([]); }} tintColor={colors.primary} />}
      >
        {isLoading && visible.length === 0 && (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}

        {!isLoading && visible.length === 0 && (
          <View style={styles.empty}>
            <Radioactive size={52} color={colors.textTertiary} weight="duotone" />
            <Text style={styles.emptyTitle}>{t.radar?.allClear ?? 'Alles in orde!'}</Text>
            <Text style={styles.emptySub}>{t.radar?.allClearSub ?? 'Geen kansen op dit moment. Trek om te vernieuwen.'}</Text>
          </View>
        )}

        {visible.map(opp => {
          const cfg = TYPE_CONFIG[opp.type];
          const IconComp = cfg.lib === 'Ionicons' ? Ionicons : MaterialCommunityIcons;
          return (
            <View key={opp.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.typeIcon, { backgroundColor: cfg.bg }]}>
                  <IconComp name={cfg.icon as any} size={20} color={cfg.color} />
                </View>
                <View style={styles.cardMeta}>
                  <ImpactDot level={opp.impact} />
                  <Text style={styles.timeAgo}>{opp.timeAgo}</Text>
                </View>
              </View>

              <Text style={styles.cardTitle}>{opp.title}</Text>
              <Text style={styles.cardDesc}>{opp.description}</Text>

              {/* Financial metrics */}
              {(opp.estimatedValue || opp.cost || opp.revenue) ? (
                <View style={styles.metricsRow}>
                  {opp.revenue ? (
                    <View style={[styles.metricBadge, { backgroundColor: '#F0FDF4' }]}>
                      <Text style={{ fontSize: 11, color: '#166534' }}>💰 {formatValue(opp.revenue)} opbrengst</Text>
                    </View>
                  ) : null}
                  {opp.cost ? (
                    <View style={[styles.metricBadge, { backgroundColor: '#FEF2F2' }]}>
                      <Text style={{ fontSize: 11, color: '#991B1B' }}>📊 {formatValue(opp.cost)} kosten</Text>
                    </View>
                  ) : null}
                  {opp.estimatedValue && !opp.revenue ? (
                    <View style={[styles.metricBadge, { backgroundColor: '#F0FDF4' }]}>
                      <Text style={{ fontSize: 11, color: '#166534' }}>💎 {formatValue(opp.estimatedValue)} potentieel</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.dismissBtn} onPress={() => handleDismiss(opp.id)}>
                  <X size={14} color={colors.textTertiary} weight="bold" />
                  <Text style={styles.dismissText}>{t.radar?.dismiss ?? 'Negeer'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: cfg.color }]}
                  onPress={() => handleAction(opp)}
                >
                  <Text style={styles.actionBtnText}>{opp.action}</Text>
                  <CaretRight size={14} color="#fff" weight="bold" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function formatTimeShort(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'nu';
    if (h < 24) return `${h}u`;
    return `${Math.floor(h / 24)}d`;
  } catch { return ''; }
}
