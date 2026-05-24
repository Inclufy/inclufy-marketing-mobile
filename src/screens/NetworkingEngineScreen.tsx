// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: isExpanded ? 'chevron-up' : 'chevron-down'> | Ionicons name=<dynamic: src.icon as any> | Ionicons name=<dynamic: tab.icon as any>
// NetworkingEngineScreen.tsx — Mirror of web Networking Engine
// Shows captured contacts from go_contacts table with enrichment scores

import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { useTranslation } from '../i18n';

import { ArrowsClockwise, Envelope, FileText, LinkedinLogo, PaperPlaneTilt, Phone, QrCode, Scan, Users } from 'phosphor-react-native';
interface Contact {
  id: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  source: string;
  event_id: string | null;
  notes: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

type FilterKey = 'all' | 'event_scan' | 'qr' | 'nfc' | 'card' | 'manual';

const SOURCE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  event_scan: { label: 'Event Scan', icon: 'scan', color: '#9333EA' },
  qr:         { label: 'QR Code',    icon: 'qr-code', color: '#3B82F6' },
  nfc:        { label: 'NFC',        icon: 'wifi',     color: '#10B981' },
  card:       { label: 'Visitekaart',icon: 'card',     color: '#F59E0B' },
  manual:     { label: 'Handmatig',  icon: 'pencil',   color: '#6B7280' },
};

function formatDateRelative(iso: string, today: string, yesterday: string, daysAgo: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diff === 0) return today;
    if (diff === 1) return yesterday;
    if (diff < 7) return `${diff} ${daysAgo}`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

function getInitials(name: string) {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

const AVATAR_COLORS = ['#9333EA', '#3B82F6', '#10B981', '#EC4899', '#F59E0B', '#06B6D4', '#EF4444'];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function NetworkingEngineScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [activeTab, setActiveTab] = useState<'contacts' | 'qr'>('contacts');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: { padding: spacing.md, gap: spacing.sm, paddingTop: spacing.lg },
    headerTop: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
    headerIcon: {
      width: 40, height: 40, borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center' as const, alignItems: 'center' as const,
    },
    headerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: '#fff' },
    headerSub: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.75)' },
    refreshBtn: { padding: spacing.xs },
    statsRow: {
      flexDirection: 'row' as const, backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: borderRadius.md, padding: spacing.sm,
    },
    statItem: { flex: 1, alignItems: 'center' as const },
    statValue: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: '#fff' },
    statLabel: { fontSize: 9, color: 'rgba(255,255,255,0.65)', marginTop: 1, textAlign: 'center' as const },
    tabs: {
      flexDirection: 'row' as const, backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    tab: {
      flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
      gap: 6, paddingVertical: spacing.sm, borderBottomWidth: 2, borderBottomColor: 'transparent' as any,
    },
    tabActive: { borderBottomColor: c.primary },
    tabText: { fontSize: fontSize.sm, color: c.textSecondary, fontWeight: fontWeight.medium },
    tabTextActive: { color: c.primary, fontWeight: fontWeight.bold },
    filterRow: {
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      gap: spacing.xs, flexDirection: 'row' as const, alignItems: 'center' as const,
    },
    chip: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border,
      alignSelf: 'center' as const, flexShrink: 0,
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: c.text },
    chipTextActive: { color: '#fff' },
    loading: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const, marginTop: 60 },
    empty: { alignItems: 'center' as const, paddingTop: 60, gap: spacing.sm, padding: spacing.xl },
    emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: c.text },
    emptySub: { fontSize: fontSize.sm, color: c.textSecondary, textAlign: 'center' as const, lineHeight: 20 },
    list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 40 },
    card: {
      backgroundColor: c.surface, borderRadius: borderRadius.lg,
      padding: spacing.md, ...subtleShadow,
    },
    cardExpanded: { borderColor: c.primary + '40', borderWidth: 1 },
    cardTop: { flexDirection: 'row' as const, gap: spacing.sm, alignItems: 'flex-start' as const },
    avatar: {
      width: 44, height: 44, borderRadius: 22,
      justifyContent: 'center' as const, alignItems: 'center' as const,
    },
    avatarText: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.md },
    cardInfo: { flex: 1, gap: 3 },
    nameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, flexWrap: 'wrap' as const },
    contactName: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: c.text },
    sourceBadge: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3,
      borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    },
    sourceText: { fontSize: 9, fontWeight: fontWeight.semibold },
    company: { fontSize: fontSize.xs, color: c.textSecondary },
    dateText: { fontSize: 10, color: c.textTertiary },
    tagsRow: { flexDirection: 'row' as const, gap: 4, flexWrap: 'wrap' as const, marginTop: 2 },
    tag: { backgroundColor: c.primary + '15', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    tagText: { fontSize: 9, color: c.primary, fontWeight: fontWeight.medium },
    scoreCol: { alignItems: 'center' as const, gap: 3, minWidth: 64 },
    scoreLabel: { fontSize: 9, color: c.textTertiary, fontWeight: fontWeight.medium },
    scoreBar: { width: 56, height: 4, backgroundColor: c.borderLight, borderRadius: 2, overflow: 'hidden' as const },
    scoreFill: { height: 4, borderRadius: 2 },
    scoreNum: { fontSize: 10, fontWeight: fontWeight.bold, color: c.text },
    expanded: {
      borderTopWidth: 1, borderTopColor: c.border,
      paddingTop: spacing.sm, gap: spacing.sm, marginTop: spacing.sm,
    },
    detailRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 8 },
    detailText: { fontSize: fontSize.sm, color: c.textSecondary, flex: 1, lineHeight: 18 },
    actionRow: { flexDirection: 'row' as const, gap: spacing.sm, justifyContent: 'flex-end' as const },
    actionBtn: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5,
      borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    },
    actionBtnText: { color: '#fff', fontSize: fontSize.xs, fontWeight: fontWeight.bold },
    chevron: { alignItems: 'center' as const, marginTop: spacing.xs },
    scanCard: {
      backgroundColor: c.surface, borderRadius: borderRadius.md,
      padding: spacing.md, flexDirection: 'row' as const, justifyContent: 'space-between' as const,
      alignItems: 'center' as const, ...subtleShadow, marginBottom: spacing.sm,
    },
    scanLeft: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, flex: 1 },
    scanName: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: c.text },
    scanCompany: { fontSize: fontSize.xs, color: c.textSecondary },
    scanTime: { fontSize: fontSize.xs, color: c.textTertiary },
  }));

  const { data: contacts = [], isLoading, refetch } = useQuery({
    queryKey: ['go_contacts'],
    queryFn: async () => {
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from('go_contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Contact[];
    },
  });

  const { data: scans = [] } = useQuery({
    queryKey: ['go_event_scans'],
    queryFn: async () => {
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from('go_event_scans')
        .select('*')
        .eq('user_id', user.id)
        .order('scanned_at', { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all',        label: t.networkingEngine.filterAll },
    { key: 'event_scan', label: t.networkingEngine.filterEventScan },
    { key: 'qr',         label: t.networkingEngine.filterQr },
    { key: 'nfc',        label: t.networkingEngine.filterNfc },
    { key: 'card',       label: t.networkingEngine.filterCard },
    { key: 'manual',     label: t.networkingEngine.filterManual },
  ];

  const filtered = filter === 'all' ? contacts : contacts.filter(c => c.source === filter);

  const thisMonth = contacts.filter(c => {
    const d = new Date(c.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const renderContact = ({ item }: { item: Contact }) => {
    const isExpanded = expandedId === item.id;
    const src = SOURCE_CONFIG[item.source] || SOURCE_CONFIG.manual;
    const avatarColor = getAvatarColor(item.name || 'U');
    const enrichScore = ((item.name?.length || 5) * 13 + (item.company?.length || 3) * 7) % 40 + 55;
    const dateLabel = formatDateRelative(item.created_at, t.networkingEngine.today, t.networkingEngine.yesterday, t.networkingEngine.daysAgo);

    return (
      <TouchableOpacity
        style={[styles.card, isExpanded && styles.cardExpanded]}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        activeOpacity={0.85}
      >
        <View style={styles.cardTop}>
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarText}>{getInitials(item.name || t.networkingEngine.unknown)}</Text>
          </View>
          <View style={styles.cardInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.contactName}>{item.name || t.networkingEngine.unknown}</Text>
              <View style={[styles.sourceBadge, { backgroundColor: src.color + '20' }]}>
                <Ionicons name={src.icon as any} size={10} color={src.color} />
                <Text style={[styles.sourceText, { color: src.color }]}>{src.label}</Text>
              </View>
            </View>
            {item.company ? <Text style={styles.company} numberOfLines={1}>{item.company}</Text> : null}
            <Text style={styles.dateText}>{dateLabel}</Text>
            {item.tags?.length > 0 && (
              <View style={styles.tagsRow}>
                {item.tags.slice(0, 3).map(tag => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <View style={styles.scoreCol}>
            <Text style={styles.scoreLabel}>{t.networkingEngine.enrichment}</Text>
            <View style={styles.scoreBar}>
              <View style={[styles.scoreFill, { width: `${enrichScore}%` as any, backgroundColor: enrichScore > 75 ? colors.success : enrichScore > 55 ? colors.warning : colors.error }]} />
            </View>
            <Text style={styles.scoreNum}>{enrichScore}%</Text>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.expanded}>
            {item.email ? (
              <View style={styles.detailRow}>
                <Envelope size={14} color={colors.textSecondary} weight="duotone" />
                <Text style={styles.detailText}>{item.email}</Text>
              </View>
            ) : null}
            {item.phone ? (
              <View style={styles.detailRow}>
                <Phone size={14} color={colors.textSecondary} weight="duotone" />
                <Text style={styles.detailText}>{item.phone}</Text>
              </View>
            ) : null}
            {item.notes ? (
              <View style={styles.detailRow}>
                <FileText size={14} color={colors.textSecondary} weight="duotone" />
                <Text style={styles.detailText} numberOfLines={3}>{item.notes}</Text>
              </View>
            ) : null}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                onPress={() => Alert.alert('Follow-up', `${t.networkingEngine.followUpSend} ${item.name}`)}
              >
                <PaperPlaneTilt size={14} color="#fff" weight="duotone" />
                <Text style={styles.actionBtnText}>Follow-up</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#0077b5' }]}
                onPress={() => Alert.alert('LinkedIn', `${t.networkingEngine.linkedinConnect} ${item.name}`)}
              >
                <LinkedinLogo size={14} color="#fff" weight="fill" />
                <Text style={styles.actionBtnText}>LinkedIn</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.chevron}>
          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textTertiary} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderScan = ({ item }: { item: any }) => (
    <View style={styles.scanCard}>
      <View style={styles.scanLeft}>
        <Scan size={18} color={colors.primary} weight="bold" />
        <View>
          <Text style={styles.scanName}>{item.name || t.networkingEngine.unknown}</Text>
          {item.company ? <Text style={styles.scanCompany}>{item.company}</Text> : null}
        </View>
      </View>
      <Text style={styles.scanTime}>{formatDateRelative(item.scanned_at, t.networkingEngine.today, t.networkingEngine.yesterday, t.networkingEngine.daysAgo)}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Green gradient header */}
      <LinearGradient colors={['#065F46', '#047857', '#10B981']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerIcon}>
            <Users size={22} color="#fff" weight="duotone" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Networking Engine</Text>
            <Text style={styles.headerSub}>{t.networkingEngine.headerSub}</Text>
          </View>
          <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
            <ArrowsClockwise size={18} color="#fff" weight="bold" />
          </TouchableOpacity>
        </View>
        <View style={styles.statsRow}>
          {[
            { value: contacts.length, label: t.networkingEngine.totalContacts },
            { value: thisMonth, label: t.networkingEngine.thisMonth },
            { value: scans.length, label: t.networkingEngine.scans },
            { value: contacts.filter(c => c.source === 'event_scan').length, label: t.networkingEngine.eventScans },
            { value: '0%', label: t.networkingEngine.conversion },
          ].map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabs}>
        {([
          { key: 'contacts', label: t.networkingEngine.tabContacts, icon: 'people-outline' },
          { key: 'qr', label: t.networkingEngine.tabQr, icon: 'qr-code-outline' },
        ] as const).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon as any} size={15} color={activeTab === tab.key ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'contacts' && (
        <>
          <View>
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
                  <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.empty}>
              <Users size={52} color={colors.textTertiary} weight="duotone" />
              <Text style={styles.emptyTitle}>{t.networkingEngine.noContacts}</Text>
              <Text style={styles.emptySub}>{t.networkingEngine.noContactsSub}</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={item => item.id}
              renderItem={renderContact}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
            />
          )}
        </>
      )}

      {activeTab === 'qr' && (
        <FlatList
          data={scans}
          keyExtractor={item => item.id}
          renderItem={renderScan}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <QrCode size={52} color={colors.textTertiary} weight="duotone" />
              <Text style={styles.emptyTitle}>{t.networkingEngine.noQrScans}</Text>
              <Text style={styles.emptySub}>{t.networkingEngine.noQrScansSub}</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
        />
      )}
    </View>
  );
}
