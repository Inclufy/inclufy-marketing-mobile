// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: isExpanded ? 'chevron-up' : 'chevron-down'>
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { api } from '../services/api';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';

import { ArrowsClockwise, CaretRight, CheckCircle, RadioButton, Radioactive } from 'phosphor-react-native';
type FeedItemType = 'lead_signal' | 'trend_alert' | 'event_opportunity' | 'partnership_match' | 'campaign_trigger' | 'competitor_move' | 'content_opportunity' | 'budget_optimization' | 'marketing_gap';

interface FeedItem {
  id: string;
  type: FeedItemType;
  title: string;
  description: string;
  urgency: string;
  confidence: number;
  estimated_value: number;
  source: string;
  timestamp: string;
  is_read: boolean;
  is_actioned: boolean;
  suggested_action: { label: string; action_type: string };
  impact_metrics: { reach?: number; leads?: number; revenue?: number; roi?: number; cost?: number };
  tags: string[];
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string; lib: 'ion' | 'mci' }> = {
  lead_signal:         { icon: 'person-add',       color: '#8B5CF6', label: 'Lead Signaal',        lib: 'ion' },
  trend_alert:         { icon: 'trending-up',       color: '#EC4899', label: 'Trend Alert',         lib: 'ion' },
  campaign_trigger:    { icon: 'megaphone',          color: '#3B82F6', label: 'Campagne Trigger',    lib: 'ion' },
  event_opportunity:   { icon: 'calendar-star',      color: '#10B981', label: 'Event Kans',          lib: 'mci' },
  competitor_move:     { icon: 'shield-alert',       color: '#F59E0B', label: 'Concurrent',          lib: 'mci' },
  partnership_match:   { icon: 'handshake',          color: '#14B8A6', label: 'Partnership',         lib: 'mci' },
  content_opportunity: { icon: 'create',             color: '#06B6D4', label: 'Content Kans',        lib: 'ion' },
  budget_optimization: { icon: 'cash',               color: '#EF4444', label: 'Budget',              lib: 'ion' },
  marketing_gap:       { icon: 'warning',            color: '#FF6B35', label: 'Marketing Gap',       lib: 'ion' },
};

const URGENCY_COLORS: Record<string, string> = {
  immediate: '#EF4444',
  today:     '#F59E0B',
  this_week: '#3B82F6',
  this_month:'#10B981',
};

const URGENCY_LABELS: Record<string, string> = {
  immediate: 'Direct',
  today:     'Vandaag',
  this_week: 'Deze Week',
  this_month:'Deze Maand',
};

function formatTime(iso: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'Zojuist';
    if (h < 24) return `${h}u geleden`;
    return `${Math.floor(h / 24)}d geleden`;
  } catch { return ''; }
}

function formatValue(val: number) {
  if (!val) return '€0';
  if (val >= 1000) return `€${Math.round(val / 1000)}K`;
  return `€${val}`;
}

// ── Dynamic opportunity generators (from real data, not hardcoded) ──────

function generateEventOpportunities(discoveredEvents: any[]): Partial<FeedItem>[] {
  const now = new Date();
  return discoveredEvents
    .filter(e => {
      const d = new Date(e.date_start);
      return d > now && (e.status === 'discovered' || !e.status);
    })
    .slice(0, 5)
    .map(e => {
      const daysUntil = Math.ceil((new Date(e.date_start).getTime() - now.getTime()) / 86400000);
      const urgency = daysUntil <= 3 ? 'immediate' : daysUntil <= 7 ? 'today' : daysUntil <= 30 ? 'this_week' : 'this_month';
      const ticketCost = typeof e.cost === 'object' ? (e.cost?.total ?? 0) : (e.cost ?? 0);
      const estRevenue = (e.estimated_leads ?? 10) * 150;
      return {
        id: `event-${e.id || e.name}`,
        type: 'event_opportunity' as FeedItemType,
        title: `${e.name} — over ${daysUntil} dagen`,
        description: `${e.description || ''}\n📍 ${e.city || e.location || ''} · Match: ${e.target_audience_match ?? 0}%`,
        urgency,
        confidence: e.target_audience_match ?? 70,
        estimated_value: estRevenue,
        source: 'event_intelligence',
        timestamp: new Date().toISOString(),
        is_read: false,
        is_actioned: e.status === 'registered',
        suggested_action: { label: 'Bekijk event', action_type: 'navigate_event' },
        impact_metrics: {
          leads: e.estimated_leads ?? 0,
          revenue: estRevenue,
          cost: ticketCost,
          roi: typeof e.estimated_roi === 'number' ? e.estimated_roi : 0,
        },
        tags: e.tags ?? [],
      };
    });
}

function generateMarketingGaps(profile: any, contacts: number, events: number): Partial<FeedItem>[] {
  const gaps: Partial<FeedItem>[] = [];
  const now = new Date().toISOString();

  if (!profile?.linkedin && !profile?.instagram) {
    gaps.push({
      id: 'gap-social',
      type: 'marketing_gap' as FeedItemType,
      title: 'Social media profielen ontbreken',
      description: 'Geen LinkedIn of Instagram ingesteld. Dit beperkt je bereik en lead generatie via social kanalen.',
      urgency: 'this_week',
      confidence: 90,
      estimated_value: 2000,
      source: 'profile_analysis',
      timestamp: now,
      is_read: false,
      is_actioned: false,
      suggested_action: { label: 'Profiel aanvullen', action_type: 'navigate_settings' },
      impact_metrics: { leads: 5, revenue: 750, roi: 200 },
      tags: ['social', 'profiel', 'gap'],
    });
  }

  if (contacts < 10) {
    gaps.push({
      id: 'gap-contacts',
      type: 'marketing_gap' as FeedItemType,
      title: `Nog maar ${contacts} contacten — groei je netwerk`,
      description: 'Scan visitekaartjes, gebruik NFC of deel je QR-code om je netwerk sneller op te bouwen.',
      urgency: 'this_week',
      confidence: 85,
      estimated_value: 1500,
      source: 'network_analysis',
      timestamp: now,
      is_read: false,
      is_actioned: false,
      suggested_action: { label: 'QR delen', action_type: 'navigate_qr' },
      impact_metrics: { leads: 10, revenue: 1500 },
      tags: ['contacten', 'netwerk', 'gap'],
    });
  }

  if (events < 2) {
    gaps.push({
      id: 'gap-events',
      type: 'marketing_gap' as FeedItemType,
      title: 'Geen events bezocht — mis je kansen?',
      description: 'Events zijn de #1 bron voor B2B leads. Ontdek relevante events via Event Intelligence.',
      urgency: 'this_month',
      confidence: 80,
      estimated_value: 3000,
      source: 'event_analysis',
      timestamp: now,
      is_read: false,
      is_actioned: false,
      suggested_action: { label: 'Scan events', action_type: 'navigate_intelligence' },
      impact_metrics: { leads: 20, revenue: 3000, cost: 500, roi: 300 },
      tags: ['events', 'leads', 'gap'],
    });
  }

  if (!profile?.website) {
    gaps.push({
      id: 'gap-website',
      type: 'marketing_gap' as FeedItemType,
      title: 'Website ontbreekt in je profiel',
      description: 'Contacten via QR of NFC kunnen niet naar je site navigeren. Voeg je website toe.',
      urgency: 'this_month',
      confidence: 70,
      estimated_value: 800,
      source: 'profile_analysis',
      timestamp: now,
      is_read: false,
      is_actioned: false,
      suggested_action: { label: 'Profiel bewerken', action_type: 'navigate_settings' },
      impact_metrics: { reach: 50, leads: 3 },
      tags: ['website', 'profiel', 'gap'],
    });
  }

  return gaps;
}

// ── Main Component ─────────────────────────────────────────────────────

export default function OpportunityFeedScreen() {
  const navigation = useNavigation<any>();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FeedItemType | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const { colors } = useTheme();

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      backgroundColor: c.surface, padding: spacing.md,
      borderBottomWidth: 1, borderBottomColor: c.border, gap: spacing.sm,
    },
    headerTop: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-start' as const },
    headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text },
    headerSub: { fontSize: fontSize.sm, color: c.textSecondary },
    refreshBtn: { padding: spacing.xs },
    statsRow: { flexDirection: 'row' as const },
    stat: { flex: 1, alignItems: 'center' as const },
    statVal: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: c.text },
    statLbl: { fontSize: 10, color: c.textSecondary, marginTop: 1 },
    filterList: { flexGrow: 0, flexShrink: 0, maxHeight: 52 },
    filterRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs, alignItems: 'center' as const },
    chip: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      backgroundColor: '#F4F4F5', borderWidth: 1.5, borderColor: '#E4E4E7',
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: c.textSecondary },
    chipTextActive: { color: '#fff' },
    loading: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const },
    empty: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const, gap: spacing.sm, padding: spacing.xl },
    emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: c.text },
    emptySub: { fontSize: fontSize.sm, color: c.textSecondary, textAlign: 'center' as const },
    list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 40 },
    card: {
      backgroundColor: c.surface, borderRadius: borderRadius.lg,
      padding: spacing.md, ...subtleShadow,
    },
    cardUnread: { borderLeftWidth: 3, borderLeftColor: c.primary },
    cardTop: { flexDirection: 'row' as const, gap: spacing.sm, alignItems: 'flex-start' as const },
    typeIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center' as const, alignItems: 'center' as const },
    cardMeta: { flex: 1, gap: 5 },
    badgeRow: { flexDirection: 'row' as const, gap: 5 },
    urgencyBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    urgencyText: { fontSize: 10, fontWeight: fontWeight.bold },
    typeBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    typeText: { fontSize: 10, fontWeight: fontWeight.semibold },
    cardTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: c.text, lineHeight: 18 },
    rightCol: { alignItems: 'flex-end' as const, gap: 4 },
    timeAgo: { fontSize: 10, color: c.textTertiary },
    value: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: c.success },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary },
    expanded: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.sm, gap: spacing.sm, marginTop: spacing.sm },
    description: { fontSize: fontSize.sm, color: c.textSecondary, lineHeight: 20 },
    impactRow: { flexDirection: 'row' as const, gap: spacing.xs, flexWrap: 'wrap' as const },
    impactBadge: { backgroundColor: '#F0FDF4', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    impactText: { fontSize: 11, color: '#166534' },
    gapBadge: { backgroundColor: '#FFF7ED', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    gapText: { fontSize: 11, color: '#9A3412' },
    costBadge: { backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    costText: { fontSize: 11, color: '#991B1B' },
    actionBtn: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, borderRadius: borderRadius.full,
      paddingHorizontal: spacing.md, paddingVertical: spacing.xs, alignSelf: 'flex-end' as const,
    },
    actionBtnText: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.xs },
    actionedRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, alignSelf: 'flex-end' as const },
    actionedText: { fontSize: fontSize.xs, color: c.success },
    chevronRow: { alignItems: 'center' as const, marginTop: spacing.xs },
    scanBtn: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
      backgroundColor: c.primary, borderRadius: borderRadius.full,
      paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
      alignSelf: 'flex-start' as const, marginTop: spacing.xs,
    },
    scanBtnText: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.xs },
  }));

  // ── Fetch DB feed items ─────────────────────────────────────────────────
  const { data: dbItems = [], isLoading, refetch } = useQuery({
    queryKey: ['feed_items'],
    queryFn: async () => {
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from('feed_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as FeedItem[];
    },
  });

  // ── Fetch discovered events for event opportunities ─────────────────────
  const { data: discoveredEvents = [] } = useQuery({
    queryKey: ['discovered_events'],
    queryFn: async () => {
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from('discovered_events')
        .select('*')
        .eq('user_id', user.id)
        .order('priority_score', { ascending: false });
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // ── Fetch profile + contacts + events count for gap analysis ────────────
  const { data: gapData } = useQuery({
    queryKey: ['opportunity_gaps'],
    queryFn: async () => {
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      if (!user) return { profile: null, contactCount: 0, eventCount: 0 };

      const [profileRes, contactRes, eventRes] = await Promise.all([
        supabase.from('profiles').select('linkedin, instagram, website, company').eq('id', user.id).maybeSingle(),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('discovered_events').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'registered'),
      ]);

      return {
        profile: profileRes.data,
        contactCount: contactRes.count ?? 0,
        eventCount: eventRes.count ?? 0,
      };
    },
    staleTime: 120_000,
  });

  // ── Combine: DB items + dynamic event opportunities + marketing gaps ────
  const eventOpps = generateEventOpportunities(discoveredEvents);
  const marketingGaps = gapData
    ? generateMarketingGaps(gapData.profile, gapData.contactCount, gapData.eventCount)
    : [];

  const dbIds = new Set(dbItems.map(i => i.id));
  const allItems: FeedItem[] = [
    ...dbItems,
    ...eventOpps.filter(i => !dbIds.has(i.id!)) as FeedItem[],
    ...marketingGaps.filter(i => !dbIds.has(i.id!)) as FeedItem[],
  ];

  // Sort by urgency priority
  const urgencyOrder: Record<string, number> = { immediate: 0, today: 1, this_week: 2, this_month: 3 };
  allItems.sort((a, b) => {
    const ua = urgencyOrder[a.urgency] ?? 4;
    const ub = urgencyOrder[b.urgency] ?? 4;
    if (ua !== ub) return ua - ub;
    return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      if (id.startsWith('event-') || id.startsWith('gap-')) return;
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      await supabase.from('feed_items').update({ is_read: true }).eq('id', id).eq('user_id', user!.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed_items'] }),
  });

  const actionItem = useMutation({
    mutationFn: async (id: string) => {
      if (id.startsWith('event-') || id.startsWith('gap-')) return;
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      await supabase.from('feed_items').update({ is_actioned: true, is_read: true }).eq('id', id).eq('user_id', user!.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed_items'] }),
  });

  const handleScan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    try {
      await api.post('/api/opportunities/scan', {});
    } catch {}
    await refetch();
    qc.invalidateQueries({ queryKey: ['discovered_events'] });
    qc.invalidateQueries({ queryKey: ['opportunity_gaps'] });
    setScanning(false);
  }, [scanning, refetch, qc]);

  const filtered = filter === 'all' ? allItems : allItems.filter(i => i.type === filter);
  const unread = allItems.filter(i => !i.is_read).length;
  const totalValue = allItems.reduce((s, i) => s + (i.estimated_value || 0), 0);
  const gapCount = allItems.filter(i => i.type === 'marketing_gap' || i.id?.startsWith('gap-')).length;

  const FILTERS = [
    { key: 'all', label: 'Alle' },
    { key: 'lead_signal', label: 'Leads' },
    { key: 'event_opportunity', label: 'Events' },
    { key: 'marketing_gap', label: `Gaps${gapCount > 0 ? ` (${gapCount})` : ''}` },
    { key: 'trend_alert', label: 'Trends' },
    { key: 'campaign_trigger', label: 'Campagnes' },
    { key: 'content_opportunity', label: 'Content' },
    { key: 'budget_optimization', label: 'Budget' },
  ] as { key: FeedItemType | 'all'; label: string }[];

  const handleAction = (item: FeedItem) => {
    const action = item.suggested_action?.action_type;
    if (action === 'navigate_event' || action === 'navigate_intelligence') {
      navigation.navigate('EventIntelligence');
    } else if (action === 'navigate_settings') {
      navigation.navigate('Settings');
    } else if (action === 'navigate_qr') {
      navigation.navigate('MyDigitalCard');
    } else if (action === 'navigate_brandkit') {
      navigation.navigate('BrandKit');
    } else {
      actionItem.mutate(item.id);
    }
  };

  const renderItem = ({ item }: { item: FeedItem }) => {
    const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.lead_signal;
    const isExpanded = expandedId === item.id;
    const urgencyColor = URGENCY_COLORS[item.urgency] || colors.textSecondary;
    const IconComp = cfg.lib === 'mci' ? MaterialCommunityIcons : Ionicons;
    const isGap = item.type === 'marketing_gap' || item.id?.startsWith('gap-');

    return (
      <TouchableOpacity
        style={[styles.card, !item.is_read && styles.cardUnread, isGap && { borderLeftColor: '#FF6B35' }]}
        onPress={() => {
          setExpandedId(isExpanded ? null : item.id);
          if (!item.is_read) markRead.mutate(item.id);
        }}
        activeOpacity={0.85}
      >
        <View style={styles.cardTop}>
          <View style={[styles.typeIcon, { backgroundColor: cfg.color + '18' }]}>
            <IconComp name={cfg.icon as any} size={20} color={cfg.color} />
          </View>
          <View style={styles.cardMeta}>
            <View style={styles.badgeRow}>
              <View style={[styles.urgencyBadge, { backgroundColor: urgencyColor + '20' }]}>
                <Text style={[styles.urgencyText, { color: urgencyColor }]}>
                  {URGENCY_LABELS[item.urgency] || item.urgency}
                </Text>
              </View>
              <View style={[styles.typeBadge, { backgroundColor: cfg.color + '15' }]}>
                <Text style={[styles.typeText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            </View>
            <Text style={styles.cardTitle} numberOfLines={isExpanded ? 4 : 2}>{item.title}</Text>
          </View>
          <View style={styles.rightCol}>
            {formatTime(item.timestamp) ? (
              <Text style={styles.timeAgo}>{formatTime(item.timestamp)}</Text>
            ) : null}
            {(item.estimated_value || 0) > 0 && (
              <Text style={styles.value}>{formatValue(item.estimated_value)}</Text>
            )}
            {!item.is_read && <View style={styles.unreadDot} />}
          </View>
        </View>

        {isExpanded && (
          <View style={styles.expanded}>
            <Text style={styles.description}>{item.description}</Text>

            {(item.impact_metrics?.leads || item.impact_metrics?.revenue || item.impact_metrics?.roi || item.impact_metrics?.cost) ? (
              <View style={styles.impactRow}>
                {item.impact_metrics?.leads ? (
                  <View style={isGap ? styles.gapBadge : styles.impactBadge}>
                    <Text style={isGap ? styles.gapText : styles.impactText}>👥 {item.impact_metrics.leads} leads</Text>
                  </View>
                ) : null}
                {item.impact_metrics?.revenue ? (
                  <View style={styles.impactBadge}>
                    <Text style={styles.impactText}>💰 €{item.impact_metrics.revenue} opbrengst</Text>
                  </View>
                ) : null}
                {item.impact_metrics?.cost ? (
                  <View style={styles.costBadge}>
                    <Text style={styles.costText}>📊 €{item.impact_metrics.cost} kosten</Text>
                  </View>
                ) : null}
                {item.impact_metrics?.roi ? (
                  <View style={isGap ? styles.gapBadge : styles.impactBadge}>
                    <Text style={isGap ? styles.gapText : styles.impactText}>📈 {item.impact_metrics.roi}% ROI</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {!!item.suggested_action?.label && !item.is_actioned && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: cfg.color }]}
                onPress={() => handleAction(item)}
              >
                <Text style={styles.actionBtnText}>{item.suggested_action.label}</Text>
                <CaretRight size={14} color="#fff" weight="bold" />
              </TouchableOpacity>
            )}
            {item.is_actioned && (
              <View style={styles.actionedRow}>
                <CheckCircle size={14} color={colors.success} weight="fill" />
                <Text style={styles.actionedText}>Actie ondernomen</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.chevronRow}>
          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textTertiary} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>AI Opportunity Feed</Text>
            <Text style={styles.headerSub}>Events, leads, gaps en kosten — dynamisch</Text>
          </View>
          <TouchableOpacity onPress={() => { refetch(); qc.invalidateQueries({ queryKey: ['discovered_events'] }); qc.invalidateQueries({ queryKey: ['opportunity_gaps'] }); }} style={styles.refreshBtn}>
            <ArrowsClockwise size={18} color={colors.primary} weight="bold" />
          </TouchableOpacity>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statVal}>{allItems.length}</Text>
            <Text style={styles.statLbl}>Totaal</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: '#EF4444' }]}>{unread}</Text>
            <Text style={styles.statLbl}>Ongelezen</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: '#FF6B35' }]}>{gapCount}</Text>
            <Text style={styles.statLbl}>Gaps</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: colors.success }]}>{formatValue(totalValue)}</Text>
            <Text style={styles.statLbl}>Potentieel</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.scanBtn, { opacity: scanning ? 0.6 : 1 }]}
          onPress={handleScan}
          disabled={scanning}
        >
          {scanning ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Radioactive size={16} color="#fff" weight="duotone" />
          )}
          <Text style={styles.scanBtnText}>{scanning ? 'Scannen...' : 'Scan kansen'}</Text>
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={f => f.key}
        showsHorizontalScrollIndicator={false}
        style={styles.filterList}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        )}
      />

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <RadioButton size={52} color={colors.textTertiary} weight="regular" />
          <Text style={styles.emptyTitle}>Geen kansen gevonden</Text>
          <Text style={styles.emptySub}>Tik op "Scan kansen" of ga naar Event Intelligence om events te ontdekken.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => { refetch(); qc.invalidateQueries({ queryKey: ['discovered_events'] }); qc.invalidateQueries({ queryKey: ['opportunity_gaps'] }); }} tintColor={colors.primary} />}
        />
      )}
    </View>
  );
}
