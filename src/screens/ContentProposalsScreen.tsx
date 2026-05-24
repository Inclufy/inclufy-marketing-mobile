// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: item.status === 'approved' ? 'checkmark-circle' : item.status === 'rejected' ? 'close-circle' : item.status === 'published' ? 'rocket' : 'time'> | MaterialCommunityIcons name=<dynamic: autoPublishEnabled ? 'rocket-launch' : 'shield-check-outline'> | MaterialCommunityIcons name=<dynamic: opt.icon as any> | MaterialCommunityIcons name=<dynamic: plat.icon as any> | MaterialCommunityIcons name=<dynamic: platform.icon as any>
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import {
  useContentProposals,
  useApproveProposal,
  useRejectProposal,
  useUpdateProposal,
  useDeleteProposal,
  useGenerateProposals,
  useProposalStats,
  usePublishProposal,
  useTrustScore,
  TRUST_THRESHOLD,
  ContentProposal,
} from '../hooks/useContentProposals';
import { useMarketingStrategy, useUpdateMarketingStrategy } from '../hooks/useMarketingStrategy';

import { CaretLeft, CheckCircle, PaperPlaneTilt, PencilLine, Robot, Sparkle, XCircle } from 'phosphor-react-native';
// ═══════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════

const PLATFORM_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  linkedin: { icon: 'linkedin', color: '#0A66C2', label: 'LinkedIn' },
  instagram: { icon: 'instagram', color: '#E4405F', label: 'Instagram' },
  x: { icon: 'twitter', color: '#1DA1F2', label: 'X' },
  facebook: { icon: 'facebook', color: '#1877F2', label: 'Facebook' },
  tiktok: { icon: 'music-note', color: '#000000', label: 'TikTok' },
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  approved: '#10B981',
  rejected: '#EF4444',
  scheduled: '#3B82F6',
  published: '#8B5CF6',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Wachtend',
  approved: 'Goedgekeurd',
  rejected: 'Afgewezen',
  scheduled: 'Ingepland',
  published: 'Gepubliceerd',
};

const MIX_LABELS: Record<string, string> = {
  educational: 'Educatief',
  promotional: 'Promotioneel',
  behind_scenes: 'Behind the Scenes',
  thought_leadership: 'Thought Leadership',
  user_generated: 'User Generated',
};

type FilterTab = 'pending' | 'approved' | 'rejected' | 'all';
const FILTER_TABS: Array<{ key: FilterTab; label: string }> = [
  { key: 'pending', label: 'Wachtend' },
  { key: 'approved', label: 'Goedgekeurd' },
  { key: 'rejected', label: 'Afgewezen' },
  { key: 'all', label: 'Alle' },
];

const CHANNEL_OPTIONS = Object.entries(PLATFORM_CONFIG).map(([key, cfg]) => ({
  value: key,
  label: cfg.label,
  icon: cfg.icon,
  color: cfg.color,
}));

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

function formatScheduledDate(dateStr: string | null): string {
  if (!dateStr) return 'Niet ingepland';
  const d = new Date(dateStr);
  const days = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} \u00B7 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatReviewedAt(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════

export default function ContentProposalsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation<any>();

  // State
  const [filter, setFilter] = useState<FilterTab>('pending');
  const [refreshing, setRefreshing] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editItem, setEditItem] = useState<ContentProposal | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editChannel, setEditChannel] = useState('');

  // Data hooks
  const statusFilter = filter === 'all' ? undefined : filter;
  const { data: proposals, isLoading, refetch } = useContentProposals(statusFilter ?? 'all');
  const { data: stats } = useProposalStats();
  const approveMut = useApproveProposal();
  const rejectMut = useRejectProposal();
  const updateMut = useUpdateProposal();
  const deleteMut = useDeleteProposal();
  const generateMut = useGenerateProposals();
  const publishMut = usePublishProposal();
  const { data: trust } = useTrustScore();
  const { data: strategy } = useMarketingStrategy();
  const updateStrategy = useUpdateMarketingStrategy();
  const autoPublishEnabled = strategy?.auto_publish === true;

  const handlePublish = (proposal: ContentProposal) => {
    Alert.alert(
      'Publiceren',
      `Wil je deze post publiceren op ${PLATFORM_CONFIG[proposal.channel]?.label || proposal.channel}?`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Publiceren',
          onPress: () => {
            publishMut.mutate(proposal.id, {
              onSuccess: (result) => {
                if (result.manual) {
                  Alert.alert('📋 Klaar om te kopiëren', result.message || 'Kopieer de tekst naar je social media.');
                } else if (result.published) {
                  Alert.alert('✅ Gepubliceerd!', `Post is live op ${result.channel}!`);
                }
              },
              onError: (err: any) => {
                const data = err?.data;
                if (data?.action === 'connect_account') {
                  Alert.alert(
                    'Account niet gekoppeld',
                    `Koppel je ${data.channel} account in Instellingen → Social Media.`,
                    [
                      { text: 'Later' },
                      { text: 'Instellingen', onPress: () => navigation.navigate('Settings' as any) },
                    ],
                  );
                } else {
                  Alert.alert('Publicatie mislukt', err?.message || 'Probeer het later opnieuw.');
                }
              },
            });
          },
        },
      ],
    );
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleApprove = (proposal: ContentProposal) => {
    const channelTrust = trust?.channels?.find((c) => c.channel === proposal.channel);
    const shouldAutoPublish = autoPublishEnabled && channelTrust?.trustReady;

    approveMut.mutate(
      { id: proposal.id },
      {
        onSuccess: () => {
          if (shouldAutoPublish) {
            // Auto-publish after approval — trust is high enough
            publishMut.mutate(proposal.id, {
              onSuccess: (result) => {
                if (result.manual) {
                  Alert.alert('📋 Goedgekeurd & klaar', result.message || 'Kopieer de tekst naar je social media.');
                } else if (result.published) {
                  Alert.alert('🚀 Auto-gepubliceerd!', `Goedgekeurd en automatisch gepubliceerd op ${result.channel}!`);
                }
              },
              onError: () => {
                Alert.alert('✅ Goedgekeurd', 'Voorstel is goedgekeurd maar automatisch publiceren is mislukt. Probeer handmatig.');
              },
            });
          }
        },
      },
    );
  };

  const handleReject = (proposal: ContentProposal) => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Reden voor afwijzing',
        'Waarom wijs je dit voorstel af?',
        [
          { text: 'Annuleren', style: 'cancel' },
          {
            text: 'Afwijzen',
            style: 'destructive',
            onPress: (reason: string | undefined) => rejectMut.mutate({ id: proposal.id, note: reason || 'Afgewezen' }),
          },
        ],
        'plain-text',
        '',
        'default',
      );
    } else {
      Alert.alert(
        'Voorstel afwijzen',
        `Weet je zeker dat je "${proposal.title}" wilt afwijzen?`,
        [
          { text: 'Annuleren', style: 'cancel' },
          { text: 'Afwijzen', style: 'destructive', onPress: () => rejectMut.mutate({ id: proposal.id, note: 'Afgewezen' }) },
        ],
      );
    }
  };

  const handleDelete = (proposal: ContentProposal) => {
    Alert.alert(
      'Voorstel verwijderen',
      `Weet je zeker dat je "${proposal.title}" wilt verwijderen?`,
      [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Verwijderen', style: 'destructive', onPress: () => deleteMut.mutate(proposal.id) },
      ],
    );
  };

  const openEditModal = (proposal: ContentProposal) => {
    setEditItem(proposal);
    setEditTitle(proposal.title);
    setEditContent(proposal.content_text);
    setEditChannel(proposal.channel);
    setEditModal(true);
  };

  const handleSave = () => {
    if (!editItem) return;
    updateMut.mutate(
      { id: editItem.id, title: editTitle.trim(), content_text: editContent.trim(), channel: editChannel },
      { onSuccess: () => setEditModal(false) },
    );
  };

  const handleSaveAndApprove = () => {
    if (!editItem) return;
    updateMut.mutate(
      { id: editItem.id, title: editTitle.trim(), content_text: editContent.trim(), channel: editChannel },
      {
        onSuccess: (updated) => {
          approveMut.mutate({ id: editItem.id });
          setEditModal(false);
        },
      },
    );
  };

  const handleGenerate = () => {
    generateMut.mutate();
  };

  const list = proposals ?? [];
  const pendingCount = stats?.pending ?? 0;
  const approvedCount = stats?.approved ?? 0;
  const scheduledCount = stats?.scheduled ?? 0;

  // ═══════════════════════════════════════════════════════
  // Styles
  // ═══════════════════════════════════════════════════════

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    loading: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const },
    navRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    backBtn: {
      width: 36,
      height: 36,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    navTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
    // Stats
    statsRow: {
      flexDirection: 'row' as const,
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
    },
    statBox: { flex: 1, alignItems: 'center' as const },
    statNum: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text },
    statLbl: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 2 },
    statDivider: { width: 1, backgroundColor: c.border, marginHorizontal: spacing.xs },
    // Filter tabs
    filterRow: {
      flexDirection: 'row' as const,
      paddingHorizontal: spacing.md,
      marginTop: spacing.md,
      gap: spacing.xs,
    },
    filterChip: {
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 6,
      borderRadius: borderRadius.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    filterChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    filterChipText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: c.textSecondary },
    filterChipTextActive: { color: '#fff' },
    // Generate button (header area)
    generateBtnSmall: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      backgroundColor: c.primary + '15',
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
      borderRadius: 12,
    },
    generateBtnSmallText: { fontSize: fontSize.xs, color: c.primary, fontWeight: fontWeight.bold },
    // Header row
    headerRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingHorizontal: spacing.md,
      marginTop: spacing.md,
      marginBottom: spacing.xs,
    },
    sectionLabel: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      color: c.textTertiary,
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
    },
    // Card
    card: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardTop: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: spacing.sm },
    platformCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      flexShrink: 0,
    },
    cardContent: { flex: 1 },
    cardTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: c.text, marginBottom: 4 },
    cardText: { fontSize: fontSize.sm, color: c.textSecondary, lineHeight: 20 },
    // Meta row
    metaRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      flexWrap: 'wrap' as const,
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: c.background,
    },
    badgeText: { fontSize: 10, fontWeight: fontWeight.semibold, color: c.textTertiary },
    metaDate: { fontSize: fontSize.xs, color: c.textTertiary },
    // Hashtags
    hashtagRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4, marginTop: spacing.xs },
    hashtagText: { fontSize: 11, color: c.textTertiary },
    // Action row
    actionRow: {
      flexDirection: 'row' as const,
      gap: spacing.xs,
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.borderLight,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 4,
      paddingVertical: 8,
      borderRadius: borderRadius.md,
    },
    approveBtn: { backgroundColor: '#10B981' },
    editBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#3B82F6' },
    rejectBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EF4444' },
    approveBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#fff' },
    editBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#3B82F6' },
    rejectBtnText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#EF4444' },
    // Status badge on reviewed cards
    statusBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
      alignSelf: 'flex-start' as const,
      marginTop: spacing.sm,
    },
    statusBadgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#fff' },
    reviewedAt: { fontSize: 11, color: c.textTertiary, marginTop: 4 },
    // Empty state
    emptyState: { alignItems: 'center' as const, paddingVertical: spacing.xl * 2, paddingHorizontal: spacing.lg },
    emptyIcon: { marginBottom: spacing.md },
    emptyTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: c.text, textAlign: 'center' as const, marginBottom: spacing.xs },
    emptyText: { fontSize: fontSize.sm, color: c.textTertiary, textAlign: 'center' as const, marginBottom: spacing.lg, lineHeight: 20 },
    generateBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: spacing.xs,
      backgroundColor: c.primary,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.sm + 2,
      borderRadius: borderRadius.lg,
    },
    generateBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: '#fff' },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' as const },
    modalContent: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: spacing.lg,
      maxHeight: '85%' as any,
    },
    modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: c.text, marginBottom: spacing.md },
    inputLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: c.textSecondary, marginBottom: 4, marginTop: spacing.sm },
    input: {
      backgroundColor: c.background,
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      fontSize: fontSize.sm,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
    },
    channelRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs, marginTop: spacing.xs },
    channelChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
    },
    channelChipActive: { borderColor: c.primary, backgroundColor: c.primary + '15' },
    channelChipText: { fontSize: fontSize.xs, color: c.textSecondary },
    channelChipTextActive: { color: c.primary, fontWeight: fontWeight.bold },
    modalBtnRow: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.lg },
    modalBtn: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      borderRadius: borderRadius.md,
      alignItems: 'center' as const,
    },
    modalBtnPrimary: { backgroundColor: c.primary },
    modalBtnSuccess: { backgroundColor: '#10B981' },
    modalBtnSecondary: { backgroundColor: c.background, borderWidth: 1, borderColor: c.border },
    modalBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
    listContent: { paddingTop: spacing.sm, paddingBottom: 32 },
    // Trust banner
    trustBanner: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    trustBannerLeft: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    trustIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    trustBannerTitle: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    trustBannerSub: {
      fontSize: fontSize.xs,
      color: c.textTertiary,
      marginTop: 2,
    },
    trustProgressBar: {
      height: 4,
      backgroundColor: c.border,
      borderRadius: 2,
      marginTop: spacing.sm,
      overflow: 'hidden' as const,
    },
    trustProgressFill: {
      height: 4,
      borderRadius: 2,
    },
    trustChannelRow: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    trustChannelChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 3,
    },
    trustChannelText: {
      fontSize: 11,
      fontWeight: fontWeight.semibold,
    },
  }));

  // ═══════════════════════════════════════════════════════
  // Renders
  // ═══════════════════════════════════════════════════════

  const renderProposal = ({ item }: { item: ContentProposal }) => {
    const platform = PLATFORM_CONFIG[item.channel] ?? PLATFORM_CONFIG.linkedin;
    const mixType = item.based_on?.content_mix_type;
    const isPending = item.status === 'pending';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onLongPress={() => handleDelete(item)}
      >
        <View style={styles.cardTop}>
          <View style={[styles.platformCircle, { backgroundColor: platform.color + '20' }]}>
            <MaterialCommunityIcons name={platform.icon as any} size={20} color={platform.color} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardText} numberOfLines={3}>{item.content_text}</Text>
          </View>
        </View>

        {/* Meta row */}
        <View style={styles.metaRow}>
          <View style={[styles.badge, { backgroundColor: platform.color + '15' }]}>
            <Text style={[styles.badgeText, { color: platform.color }]}>{platform.label}</Text>
          </View>
          <Text style={styles.metaDate}>{formatScheduledDate(item.scheduled_for)}</Text>
          {mixType && MIX_LABELS[mixType] ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{MIX_LABELS[mixType]}</Text>
            </View>
          ) : null}
        </View>

        {/* Hashtags */}
        {item.hashtags && item.hashtags.length > 0 ? (
          <View style={styles.hashtagRow}>
            {item.hashtags.map((tag, i) => (
              <Text key={i} style={styles.hashtagText}>{tag}</Text>
            ))}
          </View>
        ) : null}

        {/* Actions or status badge */}
        {isPending ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={() => handleApprove(item)}
              disabled={approveMut.isPending}
            >
              <CheckCircle size={16} color="#fff" weight="fill" />
              <Text style={styles.approveBtnText}>Goedkeuren</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.editBtn]}
              onPress={() => openEditModal(item)}
            >
              <PencilLine size={16} color="#3B82F6" weight="duotone" />
              <Text style={styles.editBtnText}>Bewerken</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => handleReject(item)}
              disabled={rejectMut.isPending}
            >
              <XCircle size={16} color="#EF4444" weight="fill" />
              <Text style={styles.rejectBtnText}>Afwijzen</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ marginTop: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] ?? '#6B7280' }]}>
                <Ionicons
                  name={item.status === 'approved' ? 'checkmark-circle' : item.status === 'rejected' ? 'close-circle' : item.status === 'published' ? 'rocket' : 'time'}
                  size={14}
                  color="#fff"
                />
                <Text style={styles.statusBadgeText}>{STATUS_LABELS[item.status] ?? item.status}</Text>
              </View>
              {item.status === 'approved' && (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: '#7C3AED',
                    borderRadius: borderRadius.full,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 6,
                  }}
                  onPress={() => handlePublish(item)}
                  disabled={publishMut.isPending}
                >
                  {publishMut.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <PaperPlaneTilt size={14} color="#fff" weight="fill" />
                      <Text style={{ color: '#fff', fontSize: fontSize.xs, fontWeight: fontWeight.bold }}>Publiceren</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
            {item.reviewed_at ? (
              <Text style={styles.reviewedAt}>Beoordeeld op {formatReviewedAt(item.reviewed_at)}</Text>
            ) : null}
            {item.review_note ? (
              <Text style={[styles.reviewedAt, { fontStyle: 'italic' }]}>{item.review_note}</Text>
            ) : null}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Robot
        size={64}
        color={colors.textTertiary}
        style={styles.emptyIcon as any} weight="duotone" />
      <Text style={styles.emptyTitle}>AMOS heeft nog geen voorstellen gegenereerd.</Text>
      <Text style={styles.emptyText}>
        Genereer voorstellen op basis van je marketing strategie.
      </Text>
      <TouchableOpacity
        style={[styles.generateBtn, generateMut.isPending && { opacity: 0.6 }]}
        onPress={handleGenerate}
        disabled={generateMut.isPending}
      >
        {generateMut.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Sparkle size={18} color="#fff" weight="fill" />
            <Text style={styles.generateBtnText}>Voorstellen Genereren</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  const handleToggleAutoPublish = () => {
    if (!trust?.autoPublishReady && !autoPublishEnabled) {
      Alert.alert(
        'Nog niet beschikbaar',
        `Publiceer minimaal ${TRUST_THRESHOLD} posts per kanaal om automatisch publiceren te ontgrendelen. AMOS leert van je goedkeuringen.`,
      );
      return;
    }
    const newValue = !autoPublishEnabled;
    Alert.alert(
      newValue ? '🚀 Autopilot inschakelen?' : 'Autopilot uitschakelen?',
      newValue
        ? 'Goedgekeurde voorstellen worden automatisch gepubliceerd op kanalen met voldoende vertrouwen.'
        : 'Je moet voortaan handmatig op "Publiceren" klikken na goedkeuring.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: newValue ? 'Inschakelen' : 'Uitschakelen',
          onPress: () => updateStrategy.mutate({ auto_publish: newValue }),
        },
      ],
    );
  };

  const renderHeader = () => (
    <View>
      {/* Trust & Autonomy Banner */}
      <TouchableOpacity style={styles.trustBanner} onPress={handleToggleAutoPublish} activeOpacity={0.7}>
        <View style={styles.trustBannerLeft}>
          <View style={[styles.trustIconCircle, { backgroundColor: autoPublishEnabled ? '#10B981' + '20' : '#F59E0B' + '20' }]}>
            <MaterialCommunityIcons
              name={autoPublishEnabled ? 'rocket-launch' : 'shield-check-outline'}
              size={20}
              color={autoPublishEnabled ? '#10B981' : '#F59E0B'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.trustBannerTitle}>
              {autoPublishEnabled ? 'Autopilot actief' : 'Handmatige controle'}
            </Text>
            <Text style={styles.trustBannerSub}>
              {autoPublishEnabled
                ? 'Goedgekeurd = automatisch gepubliceerd'
                : trust?.autoPublishReady
                  ? 'Voldoende vertrouwen — tik om autopilot in te schakelen'
                  : `Nog ${Math.max(0, TRUST_THRESHOLD - (trust?.totalPublished ?? 0))} publicaties nodig voor autopilot`
              }
            </Text>
          </View>
        </View>
        {/* Trust progress bar */}
        <View style={styles.trustProgressBar}>
          <View style={[styles.trustProgressFill, {
            width: `${Math.min(100, trust?.overallScore ?? 0)}%` as any,
            backgroundColor: (trust?.overallScore ?? 0) >= 70 ? '#10B981' : (trust?.overallScore ?? 0) >= 40 ? '#F59E0B' : '#EF4444',
          }]} />
        </View>
        <View style={styles.trustChannelRow}>
          {(trust?.channels ?? []).map((ch) => {
            const plat = PLATFORM_CONFIG[ch.channel];
            if (!plat) return null;
            return (
              <View key={ch.channel} style={styles.trustChannelChip}>
                <MaterialCommunityIcons name={plat.icon as any} size={12} color={plat.color} />
                <Text style={[styles.trustChannelText, { color: ch.trustReady ? '#10B981' : colors.textTertiary }]}>
                  {ch.publishedCount}/{TRUST_THRESHOLD}
                </Text>
                {ch.trustReady && <CheckCircle size={12} color="#10B981" weight="fill" />}
              </View>
            );
          })}
        </View>
      </TouchableOpacity>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: STATUS_COLORS.pending }]}>{pendingCount}</Text>
          <Text style={styles.statLbl}>Wachtend</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: STATUS_COLORS.approved }]}>{approvedCount}</Text>
          <Text style={styles.statLbl}>Goedgekeurd</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: STATUS_COLORS.scheduled }]}>{scheduledCount}</Text>
          <Text style={styles.statLbl}>Ingepland</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterChip, filter === tab.key && styles.filterChipActive]}
            onPress={() => setFilter(tab.key)}
          >
            <Text style={[styles.filterChipText, filter === tab.key && styles.filterChipTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Section header with generate button */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>VOORSTELLEN</Text>
        <TouchableOpacity
          style={[styles.generateBtnSmall, generateMut.isPending && { opacity: 0.6 }]}
          onPress={handleGenerate}
          disabled={generateMut.isPending}
        >
          {generateMut.isPending ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <Sparkle size={14} color={colors.primary} weight="fill" />
              <Text style={styles.generateBtnSmallText}>Genereren</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  // ═══════════════════════════════════════════════════════
  // Main Render
  // ═══════════════════════════════════════════════════════

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loading]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Navigation Header */}
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <CaretLeft size={24} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Content Voorstellen</Text>
        <View style={{ width: 36 }} />
      </View>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        renderItem={renderProposal}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      />

    {/* Edit Modal */}
      <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditModal(false)}>
          <TouchableOpacity style={styles.modalContent} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.modalTitle}>Voorstel Bewerken</Text>

            <Text style={styles.inputLabel}>Titel</Text>
            <TextInput
              style={styles.input}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Titel van het voorstel"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={styles.inputLabel}>Inhoud</Text>
            <TextInput
              style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
              value={editContent}
              onChangeText={setEditContent}
              placeholder="Inhoud van het voorstel"
              placeholderTextColor={colors.textTertiary}
              multiline
            />

            <Text style={styles.inputLabel}>Kanaal</Text>
            <View style={styles.channelRow}>
              {CHANNEL_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.channelChip, editChannel === opt.value && styles.channelChipActive]}
                  onPress={() => setEditChannel(opt.value)}
                >
                  <MaterialCommunityIcons
                    name={opt.icon as any}
                    size={14}
                    color={editChannel === opt.value ? opt.color : colors.textTertiary}
                  />
                  <Text style={[styles.channelChipText, editChannel === opt.value && styles.channelChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                onPress={() => setEditModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, (!editTitle.trim() || updateMut.isPending) && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={!editTitle.trim() || updateMut.isPending}
              >
                {updateMut.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Opslaan</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.modalBtn,
                styles.modalBtnSuccess,
                { marginTop: spacing.xs },
                (!editTitle.trim() || updateMut.isPending || approveMut.isPending) && { opacity: 0.5 },
              ]}
              onPress={handleSaveAndApprove}
              disabled={!editTitle.trim() || updateMut.isPending || approveMut.isPending}
            >
              <Text style={[styles.modalBtnText, { color: '#fff' }]}>Opslaan & Goedkeuren</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
