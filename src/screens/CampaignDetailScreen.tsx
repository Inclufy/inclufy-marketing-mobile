// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: (cat?.icon || 'ellipsis-horizontal') as any> | Ionicons name=<dynamic: (src?.icon || 'cash-outline') as any> | Ionicons name=<dynamic: campaign.status === 'paused' ? 'play-outline' : 'pause-outline'> | Ionicons name=<dynamic: cfg.icon as any> | Ionicons name=<dynamic: ch.icon as any> | Ionicons name=<dynamic: roi > 0 ? 'trending-up' : 'trending-down'> | Ionicons name=<dynamic: typeIcon as any>
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Linking,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, RouteProp } from '@react-navigation/native';
import {
  useCampaign, useUpdateCampaign, useCampaignMetrics,
  useCampaignCosts, useAddCampaignCost, useDeleteCampaignCost,
  useCampaignRevenue, useAddCampaignRevenue, useDeleteCampaignRevenue,
  useCampaignROI, useConnectedChannels,
  type CampaignCost, type CampaignRevenue,
} from '../hooks/useCampaigns';
import type { RootStackParamList } from '../types';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';

import { CaretRight, ChartBar, Checks, PaperPlaneTilt, PlusCircle, Rocket, ShareNetwork } from 'phosphor-react-native';
type Route = RouteProp<RootStackParamList, 'CampaignDetail'>;

const statusLabels: Record<string, string> = { active: 'Actief', draft: 'Concept', completed: 'Voltooid', paused: 'Gepauzeerd' };
const typeIcons: Record<string, string> = { email: 'mail-outline', sms: 'chatbubble-outline', push: 'notifications-outline', 'multi-channel': 'radio-outline' };

const COST_CATEGORIES: Array<{ key: CampaignCost['category']; icon: string; label: string; color: string }> = [
  { key: 'ads', icon: 'megaphone-outline', label: 'Advertenties', color: '#6366F1' },
  { key: 'events', icon: 'calendar-outline', label: 'Events', color: '#EC4899' },
  { key: 'tools', icon: 'construct-outline', label: 'Tools', color: '#F59E0B' },
  { key: 'personnel', icon: 'people-outline', label: 'Personeel', color: '#059669' },
  { key: 'travel', icon: 'airplane-outline', label: 'Reiskosten', color: '#0EA5E9' },
  { key: 'content', icon: 'document-text-outline', label: 'Content', color: '#8B5CF6' },
  { key: 'other', icon: 'ellipsis-horizontal', label: 'Overig', color: '#6B7280' },
];

const REVENUE_SOURCES: Array<{ key: CampaignRevenue['source']; icon: string; label: string; color: string }> = [
  { key: 'lead_conversion', icon: 'people-outline', label: 'Lead conversie', color: '#059669' },
  { key: 'direct_sale', icon: 'cart-outline', label: 'Directe verkoop', color: '#2563EB' },
  { key: 'event_ticket', icon: 'ticket-outline', label: 'Event ticket', color: '#EC4899' },
  { key: 'subscription', icon: 'repeat-outline', label: 'Abonnement', color: '#7C3AED' },
  { key: 'referral', icon: 'share-social-outline', label: 'Referral', color: '#F59E0B' },
  { key: 'other', icon: 'ellipsis-horizontal', label: 'Overig', color: '#6B7280' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatBudget(amount: number | null): string {
  if (amount == null) return '€ 0';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
}

function formatNumber(n: number | undefined | null): string {
  if (n == null) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function formatPercent(n: number | undefined | null): string {
  if (n == null) return '0%';
  return `${n.toFixed(1)}%`;
}

export default function CampaignDetailScreen() {
  const route = useRoute<Route>();
  const { campaignId } = route.params as { campaignId: string };

  const { data: campaign } = useCampaign(campaignId);
  const { data: metrics } = useCampaignMetrics(campaignId);
  const { data: costs = [] } = useCampaignCosts(campaignId);
  const { data: revenues = [] } = useCampaignRevenue(campaignId);
  const { data: roiData } = useCampaignROI(campaignId);
  const { data: connectedAccounts = [] } = useConnectedChannels();
  const updateCampaign = useUpdateCampaign();
  const addCost = useAddCampaignCost();
  const deleteCost = useDeleteCampaignCost();
  const addRevenue = useAddCampaignRevenue();
  const deleteRevenue = useDeleteCampaignRevenue();
  const { colors } = useTheme();

  // Modal states
  const [showCostModal, setShowCostModal] = useState(false);
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [costCategory, setCostCategory] = useState<CampaignCost['category']>('ads');
  const [costDesc, setCostDesc] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [revSource, setRevSource] = useState<CampaignRevenue['source']>('lead_conversion');
  const [revDesc, setRevDesc] = useState('');
  const [revAmount, setRevAmount] = useState('');

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    loadingContainer: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const, backgroundColor: c.background },
    loadingText: { fontSize: fontSize.md, color: c.textSecondary },
    // Cards
    card: { backgroundColor: c.surface, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm, ...subtleShadow },
    sectionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: c.text },
    // Header
    headerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
    headerInfo: { flex: 1 },
    campaignName: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text },
    dateRange: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: 2 },
    statusBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, alignSelf: 'flex-start' as const, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full, gap: 5 },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
    description: { fontSize: fontSize.sm, color: c.textSecondary, lineHeight: 20 },
    // Channels
    channelRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: spacing.xs },
    channelBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    channelBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
    // Financial overview
    finRow: { flexDirection: 'row' as const },
    finItem: { flex: 1, alignItems: 'center' as const, gap: 2 },
    finValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
    finLabel: { fontSize: fontSize.xs, color: c.textSecondary },
    roiBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, alignSelf: 'center' as const, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.full, marginTop: spacing.xs, gap: 6 },
    roiText: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
    // Stats
    statsGrid: { flexDirection: 'row' as const },
    statItem: { flex: 1, alignItems: 'center' as const },
    statValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text },
    statLabel: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 2 },
    // Cost/Revenue list
    itemRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.borderLight },
    itemIconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center' as const, alignItems: 'center' as const },
    itemInfo: { flex: 1 },
    itemCategory: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: c.text },
    itemDesc: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 1 },
    itemAmount: { fontSize: fontSize.md, fontWeight: fontWeight.bold },
    addBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1, borderStyle: 'dashed' as const, borderColor: c.primary, marginTop: spacing.xs },
    addBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: c.primary },
    // Actions
    actionsRow: { flexDirection: 'row' as const, gap: spacing.sm },
    actionBtn: { flex: 1, alignItems: 'center' as const, paddingVertical: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, gap: spacing.xs },
    actionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: c.textSecondary },
    // Budget
    budgetRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: spacing.lg, marginTop: spacing.xs },
    budgetValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text, textAlign: 'center' as const },
    budgetSubtext: { fontSize: fontSize.xs, color: c.textTertiary, textAlign: 'center' as const, marginTop: 2 },
    budgetSeparator: { width: 1, height: 36, backgroundColor: c.border },
    budgetTrack: { height: 8, backgroundColor: c.borderLight, borderRadius: borderRadius.full, overflow: 'hidden' as const, marginTop: spacing.xs },
    budgetFill: { height: '100%' as const, borderRadius: borderRadius.full },
    budgetPercent: { fontSize: fontSize.xs, color: c.textTertiary, textAlign: 'center' as const },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' as const },
    modalSheet: { backgroundColor: c.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, maxHeight: '80%' as const },
    modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: c.text, marginBottom: spacing.md },
    modalLabel: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: spacing.sm, marginBottom: 4 },
    modalInput: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: fontSize.md, color: c.text },
    modalChipRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
    modalChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    modalChipSelected: { borderColor: c.primary, backgroundColor: c.primary + '15' },
    modalChipText: { fontSize: fontSize.xs, color: c.textSecondary },
    modalChipTextSelected: { color: c.primary, fontWeight: fontWeight.semibold },
    modalSaveBtn: { backgroundColor: c.primary, borderRadius: borderRadius.md, paddingVertical: 14, alignItems: 'center' as const, marginTop: spacing.lg },
    modalSaveBtnText: { color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  }));

  if (!campaign) {
    return <View style={styles.loadingContainer}><Text style={styles.loadingText}>Campagne laden...</Text></View>;
  }

  const statusColors: Record<string, string> = { active: colors.success, draft: colors.draft, completed: colors.textSecondary, paused: colors.warning };
  const statusColor = statusColors[campaign.status] || colors.textSecondary;
  const typeIcon = typeIcons[campaign.type] || 'mail-outline';

  const sent = metrics?.sent ?? 0;
  const opened = metrics?.opened ?? 0;
  const clicked = metrics?.clicked ?? 0;
  const openRate = sent > 0 ? (opened / sent) * 100 : (metrics?.open_rate ?? 0);

  const totalCosts = roiData?.totalCosts ?? 0;
  const totalRevenue = roiData?.totalRevenue ?? 0;
  const roi = roiData?.roi ?? 0;
  const roiColor = roi > 100 ? colors.success : roi > 0 ? '#F59E0B' : colors.error;

  const budgetTotal = campaign.budget_amount ?? 0;
  const budgetPercent = budgetTotal > 0 ? Math.min((totalCosts / budgetTotal) * 100, 100) : 0;

  const channels = (campaign.settings as any)?.channels as string[] | undefined;

  const channelConfig: Record<string, { icon: string; color: string; label: string }> = {
    linkedin: { icon: 'logo-linkedin', color: '#0077B5', label: 'LinkedIn' },
    facebook: { icon: 'logo-facebook', color: '#1877F2', label: 'Facebook' },
    instagram: { icon: 'logo-instagram', color: '#E4405F', label: 'Instagram' },
    tiktok: { icon: 'musical-notes', color: '#000000', label: 'TikTok' },
    email: { icon: 'mail-outline', color: '#6366F1', label: 'E-mail' },
    sms: { icon: 'chatbubble-outline', color: '#059669', label: 'SMS' },
  };

  // ─── Handlers ─────────────────────────────────────────────────────

  const handlePause = () => {
    const next = campaign.status === 'paused' ? 'active' : 'paused';
    Alert.alert(`Campagne ${next === 'paused' ? 'pauzeren' : 'hervatten'}?`, undefined, [
      { text: 'Annuleren', style: 'cancel' },
      { text: 'OK', onPress: () => updateCampaign.mutate({ id: campaign.id, status: next }) },
    ]);
  };

  const handleSaveCost = async () => {
    const amount = parseFloat(costAmount);
    if (!amount || amount <= 0) { Alert.alert('Voer een geldig bedrag in'); return; }
    try {
      await addCost.mutateAsync({ campaign_id: campaignId, category: costCategory, description: costDesc, amount });
      setShowCostModal(false);
      setCostDesc(''); setCostAmount('');
    } catch (err: any) { Alert.alert('Fout', err.message); }
  };

  const handleSaveRevenue = async () => {
    const amount = parseFloat(revAmount);
    if (!amount || amount <= 0) { Alert.alert('Voer een geldig bedrag in'); return; }
    try {
      await addRevenue.mutateAsync({ campaign_id: campaignId, source: revSource, description: revDesc, amount });
      setShowRevenueModal(false);
      setRevDesc(''); setRevAmount('');
    } catch (err: any) { Alert.alert('Fout', err.message); }
  };

  const handleDeleteCost = (item: CampaignCost) => {
    Alert.alert('Kosten verwijderen?', `${item.description || item.category} — €${item.amount}`, [
      { text: 'Annuleren', style: 'cancel' },
      { text: 'Verwijderen', style: 'destructive', onPress: () => deleteCost.mutate({ id: item.id, campaign_id: campaignId }) },
    ]);
  };

  const handleDeleteRevenue = (item: CampaignRevenue) => {
    Alert.alert('Revenue verwijderen?', `${item.description || item.source} — €${item.amount}`, [
      { text: 'Annuleren', style: 'cancel' },
      { text: 'Verwijderen', style: 'destructive', onPress: () => deleteRevenue.mutate({ id: item.id, campaign_id: campaignId }) },
    ]);
  };

  // ─── Publish to channel ─────────────────────────────────────────────
  const enc = (s: string) => encodeURIComponent(s || '');
  const campaignText = [
    campaign?.name,
    campaign?.description ? `\n${campaign.description}` : '',
    campaign?.start_date ? `\n📅 ${formatDate(campaign.start_date)}` : '',
  ].join('');

  const PUBLISH_CHANNELS = [
    {
      key: 'linkedin', icon: 'logo-linkedin', label: 'LinkedIn', color: '#0077B5',
      getUrl: () => `https://www.linkedin.com/sharing/share-offsite/?url=${enc('https://inclufy.com')}&title=${enc(campaign?.name || '')}&summary=${enc(campaign?.description || '')}`,
    },
    {
      key: 'facebook', icon: 'logo-facebook', label: 'Facebook', color: '#1877F2',
      getUrl: () => `https://www.facebook.com/sharer/sharer.php?quote=${enc(campaignText)}`,
    },
    {
      key: 'instagram', icon: 'logo-instagram', label: 'Instagram', color: '#E4405F',
      getUrl: () => null, // Instagram doesn't support URL sharing, use native share
    },
    {
      key: 'tiktok', icon: 'musical-notes', label: 'TikTok', color: '#000000',
      getUrl: () => null,
    },
    {
      key: 'email', icon: 'mail-outline', label: 'E-mail', color: '#6366F1',
      getUrl: () => `mailto:?subject=${enc(campaign?.name || '')}&body=${enc(campaignText)}`,
    },
  ];

  const handlePublishToChannel = async (channel: typeof PUBLISH_CHANNELS[0]) => {
    setPublishing(channel.key);
    try {
      const url = channel.getUrl();
      if (url) {
        await Linking.openURL(url);
      } else {
        // Fallback to native share sheet (for Instagram, TikTok, etc.)
        await Share.share({
          title: campaign?.name || 'Campagne',
          message: campaignText,
        });
      }

      // Update campaign status to active if still draft
      if (campaign?.status === 'draft') {
        updateCampaign.mutate({ id: campaign.id, status: 'active' });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        Alert.alert('Fout', 'Kon niet openen. Probeer opnieuw.');
      }
    } finally {
      setPublishing(null);
    }
  };

  const handleShareCampaign = async () => {
    try {
      await Share.share({
        title: campaign?.name || 'Campagne',
        message: campaignText,
      });
    } catch {}
  };

  const handleActivate = () => {
    if (campaign?.status === 'active') {
      Alert.alert('Al actief', 'Deze campagne is al actief.');
      return;
    }
    Alert.alert(
      'Campagne activeren?',
      `${campaign?.name} wordt geactiveerd en is klaar om te publiceren.`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Activeren',
          onPress: () => {
            updateCampaign.mutate({ id: campaign!.id, status: 'active' });
            Alert.alert('✅ Geactiveerd', 'Je campagne is nu actief! Publiceer naar kanalen om te starten.');
          },
        },
      ]
    );
  };

  const handleComplete = () => {
    Alert.alert(
      'Campagne afronden?',
      'Markeer deze campagne als voltooid.',
      [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Afronden', onPress: () => updateCampaign.mutate({ id: campaign!.id, status: 'completed' }) },
      ]
    );
  };

  const handleReport = () => {
    const report = [
      `📊 Rapport: ${campaign?.name}`,
      `\nStatus: ${statusLabels[campaign?.status || ''] || campaign?.status}`,
      `Budget: ${formatBudget(budgetTotal)} (${budgetPercent.toFixed(0)}% besteed)`,
      `Kosten: ${formatBudget(totalCosts)}`,
      `Revenue: ${formatBudget(totalRevenue)}`,
      `ROI: ${roi.toFixed(0)}%`,
      `\nVerzonden: ${sent} | Geopend: ${opened} | Geklikt: ${clicked}`,
      openRate > 0 ? `Open Rate: ${openRate.toFixed(1)}%` : '',
      channels?.length ? `\nKanalen: ${channels.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    Alert.alert('📊 Campagne Rapport', report, [
      { text: 'Sluiten' },
      { text: 'Delen', onPress: () => Share.share({ title: `Rapport: ${campaign?.name}`, message: report }).catch(() => {}) },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Ionicons name={typeIcon as any} size={28} color={colors.primary} />
          <View style={styles.headerInfo}>
            <Text style={styles.campaignName}>{campaign.name}</Text>
            <Text style={styles.dateRange}>{formatDate(campaign.start_date)}{campaign.end_date ? ` – ${formatDate(campaign.end_date)}` : ''}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabels[campaign.status] || campaign.status}</Text>
        </View>
        {campaign.description ? <Text style={styles.description} numberOfLines={3}>{campaign.description}</Text> : null}

        {/* Channels */}
        {channels && channels.length > 0 && (
          <View style={styles.channelRow}>
            {channels.map(ch => {
              const cfg = channelConfig[ch];
              if (!cfg) return null;
              return (
                <View key={ch} style={[styles.channelBadge, { backgroundColor: cfg.color + '18' }]}>
                  <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
                  <Text style={[styles.channelBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Financial Overview */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>💰 Financieel Overzicht</Text>
        <View style={styles.finRow}>
          <View style={styles.finItem}>
            <Text style={[styles.finValue, { color: colors.error }]}>{formatBudget(totalCosts)}</Text>
            <Text style={styles.finLabel}>Totaal kosten</Text>
          </View>
          <View style={styles.finItem}>
            <Text style={[styles.finValue, { color: colors.success }]}>{formatBudget(totalRevenue)}</Text>
            <Text style={styles.finLabel}>Totaal revenue</Text>
          </View>
        </View>
        <View style={[styles.roiBadge, { backgroundColor: roiColor + '15' }]}>
          <Ionicons name={roi > 0 ? 'trending-up' : 'trending-down'} size={20} color={roiColor} />
          <Text style={[styles.roiText, { color: roiColor }]}>ROI: {roi.toFixed(0)}%</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Statistieken</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatNumber(sent)}</Text>
            <Text style={styles.statLabel}>Verzonden</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.info }]}>{formatNumber(opened)}</Text>
            <Text style={styles.statLabel}>Geopend</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.success }]}>{formatNumber(clicked)}</Text>
            <Text style={styles.statLabel}>Geklikt</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{formatPercent(openRate)}</Text>
            <Text style={styles.statLabel}>Open Rate</Text>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Snelle acties</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={handlePause}>
            <Ionicons name={campaign.status === 'paused' ? 'play-outline' : 'pause-outline'} size={22} color={colors.primary} />
            <Text style={styles.actionLabel}>{campaign.status === 'paused' ? 'Hervatten' : 'Pauzeren'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleActivate}>
            <Rocket size={22} color={colors.success} weight="duotone" />
            <Text style={styles.actionLabel}>Activeren</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleReport}>
            <ChartBar size={22} color={colors.primary} weight="duotone" />
            <Text style={styles.actionLabel}>Rapport</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.actionsRow, { marginTop: spacing.xs }]}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowPublishModal(true)}>
            <PaperPlaneTilt size={22} color="#E8317A" weight="duotone" />
            <Text style={styles.actionLabel}>Publiceren</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShareCampaign}>
            <ShareNetwork size={22} color={colors.primary} weight="duotone" />
            <Text style={styles.actionLabel}>Delen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleComplete}>
            <Checks size={22} color={colors.textSecondary} weight="bold" />
            <Text style={styles.actionLabel}>Afronden</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Publish to Channels ──────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📢 Publiceren naar kanalen</Text>
        {(!channels || channels.length === 0) && (
          <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: spacing.xs }}>
            Selecteer kanalen bij het aanmaken van een campagne om hier te publiceren.
          </Text>
        )}
        {PUBLISH_CHANNELS.filter(ch => !channels || channels.length === 0 || channels.includes(ch.key)).map(ch => {
          const isConnected = connectedAccounts.some(a => a.platform === ch.key);
          const connectedAccount = connectedAccounts.find(a => a.platform === ch.key);
          const isPublishing = publishing === ch.key;
          return (
            <TouchableOpacity
              key={ch.key}
              style={[styles.itemRow, { borderBottomColor: colors.borderLight }]}
              onPress={() => handlePublishToChannel(ch)}
              disabled={!!publishing}
            >
              <View style={[styles.itemIconWrap, { backgroundColor: ch.color + '18' }]}>
                <Ionicons name={ch.icon as any} size={20} color={ch.color} />
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemCategory}>{ch.label}</Text>
                <Text style={{ fontSize: fontSize.xs, color: isConnected ? colors.success : colors.textTertiary, marginTop: 1 }}>
                  {isConnected ? `● ${connectedAccount?.account_name || 'Verbonden'}` : '○ Niet verbonden'}
                </Text>
              </View>
              {isPublishing ? (
                <ActivityIndicator size="small" color={ch.color} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: ch.color + '15', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }}>
                  <PaperPlaneTilt size={12} color={ch.color} weight="duotone" />
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: ch.color }}>Publiceer</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Budget */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Budget</Text>
        <View style={styles.budgetRow}>
          <View>
            <Text style={styles.budgetValue}>{formatBudget(totalCosts)}</Text>
            <Text style={styles.budgetSubtext}>besteed</Text>
          </View>
          <View style={styles.budgetSeparator} />
          <View>
            <Text style={[styles.budgetValue, { color: colors.textSecondary }]}>{formatBudget(budgetTotal)}</Text>
            <Text style={styles.budgetSubtext}>totaal</Text>
          </View>
        </View>
        <View style={styles.budgetTrack}>
          <View style={[styles.budgetFill, { width: `${budgetPercent}%`, backgroundColor: budgetPercent > 90 ? colors.error : budgetPercent > 70 ? colors.warning : colors.success }]} />
        </View>
        <Text style={styles.budgetPercent}>{budgetPercent.toFixed(0)}% van budget gebruikt</Text>
      </View>

      {/* Costs */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📊 Kosten ({costs.length})</Text>
        {costs.map(item => {
          const cat = COST_CATEGORIES.find(c => c.key === item.category);
          return (
            <TouchableOpacity key={item.id} style={styles.itemRow} onLongPress={() => handleDeleteCost(item)}>
              <View style={[styles.itemIconWrap, { backgroundColor: (cat?.color || '#6B7280') + '18' }]}>
                <Ionicons name={(cat?.icon || 'ellipsis-horizontal') as any} size={18} color={cat?.color || '#6B7280'} />
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemCategory}>{cat?.label || item.category}</Text>
                {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
              </View>
              <Text style={[styles.itemAmount, { color: colors.error }]}>-€{Number(item.amount).toLocaleString()}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCostModal(true)}>
          <PlusCircle size={18} color={colors.primary} weight="regular" />
          <Text style={styles.addBtnText}>Kosten toevoegen</Text>
        </TouchableOpacity>
      </View>

      {/* Revenue */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>💰 Revenue ({revenues.length})</Text>
        {revenues.map(item => {
          const src = REVENUE_SOURCES.find(s => s.key === item.source);
          return (
            <TouchableOpacity key={item.id} style={styles.itemRow} onLongPress={() => handleDeleteRevenue(item)}>
              <View style={[styles.itemIconWrap, { backgroundColor: (src?.color || '#059669') + '18' }]}>
                <Ionicons name={(src?.icon || 'cash-outline') as any} size={18} color={src?.color || '#059669'} />
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemCategory}>{src?.label || item.source}</Text>
                {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
              </View>
              <Text style={[styles.itemAmount, { color: colors.success }]}>+€{Number(item.amount).toLocaleString()}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowRevenueModal(true)}>
          <PlusCircle size={18} color={colors.primary} weight="regular" />
          <Text style={styles.addBtnText}>Revenue toevoegen</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Cost Modal ────────────────────────────────────────────── */}
      <Modal visible={showCostModal} transparent animationType="slide" onRequestClose={() => setShowCostModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCostModal(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Kosten toevoegen</Text>
            <Text style={styles.modalLabel}>Categorie</Text>
            <View style={styles.modalChipRow}>
              {COST_CATEGORIES.map(cat => (
                <TouchableOpacity key={cat.key} style={[styles.modalChip, costCategory === cat.key && styles.modalChipSelected]} onPress={() => setCostCategory(cat.key)}>
                  <Text style={[styles.modalChipText, costCategory === cat.key && styles.modalChipTextSelected]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Beschrijving</Text>
            <TextInput style={styles.modalInput} value={costDesc} onChangeText={setCostDesc} placeholder="bijv. Google Ads campagne" placeholderTextColor={colors.textTertiary} />
            <Text style={styles.modalLabel}>Bedrag (€)</Text>
            <TextInput style={styles.modalInput} value={costAmount} onChangeText={setCostAmount} placeholder="0" keyboardType="numeric" placeholderTextColor={colors.textTertiary} />
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveCost} disabled={addCost.isPending}>
              {addCost.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveBtnText}>Opslaan</Text>}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── Revenue Modal ──────────────────────────────────────────── */}
      <Modal visible={showRevenueModal} transparent animationType="slide" onRequestClose={() => setShowRevenueModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowRevenueModal(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Revenue toevoegen</Text>
            <Text style={styles.modalLabel}>Bron</Text>
            <View style={styles.modalChipRow}>
              {REVENUE_SOURCES.map(src => (
                <TouchableOpacity key={src.key} style={[styles.modalChip, revSource === src.key && styles.modalChipSelected]} onPress={() => setRevSource(src.key)}>
                  <Text style={[styles.modalChipText, revSource === src.key && styles.modalChipTextSelected]}>{src.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Beschrijving</Text>
            <TextInput style={styles.modalInput} value={revDesc} onChangeText={setRevDesc} placeholder="bijv. Event ticket sales" placeholderTextColor={colors.textTertiary} />
            <Text style={styles.modalLabel}>Bedrag (€)</Text>
            <TextInput style={styles.modalInput} value={revAmount} onChangeText={setRevAmount} placeholder="0" keyboardType="numeric" placeholderTextColor={colors.textTertiary} />
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveRevenue} disabled={addRevenue.isPending}>
              {addRevenue.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveBtnText}>Opslaan</Text>}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── Publish Modal ─────────────────────────────────────────── */}
      <Modal visible={showPublishModal} transparent animationType="slide" onRequestClose={() => setShowPublishModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPublishModal(false)}>
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>📢 Publiceer Campagne</Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md }}>
              Deel "{campaign.name}" op je kanalen
            </Text>

            {PUBLISH_CHANNELS.map(ch => {
              const isConnected = connectedAccounts.some(a => a.platform === ch.key);
              const isPublishing = publishing === ch.key;
              return (
                <TouchableOpacity
                  key={ch.key}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
                  }}
                  onPress={() => handlePublishToChannel(ch)}
                  disabled={!!publishing}
                >
                  <View style={[styles.itemIconWrap, { backgroundColor: ch.color + '18' }]}>
                    <Ionicons name={ch.icon as any} size={22} color={ch.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.medium, color: colors.text }}>{ch.label}</Text>
                    <Text style={{ fontSize: fontSize.xs, color: isConnected ? colors.success : colors.textTertiary }}>
                      {isConnected ? '● Verbonden' : '○ Niet verbonden — opent browser'}
                    </Text>
                  </View>
                  {isPublishing ? (
                    <ActivityIndicator size="small" color={ch.color} />
                  ) : (
                    <CaretRight size={18} color={colors.textTertiary} weight="bold" />
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.modalSaveBtn, { backgroundColor: colors.primary, marginTop: spacing.lg }]}
              onPress={handleShareCampaign}
            >
              <Text style={styles.modalSaveBtnText}>📤 Deel via andere app</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}
