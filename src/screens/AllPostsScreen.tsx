// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: ch?.icon as any || 'globe-outline'> | Ionicons name=<dynamic: channelConfig[ch]?.icon as any>
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAllPosts, useDeletePost, useDuplicatePost, usePublishPost, useFetchEngagement } from '../hooks/useEventPosts';
import { useEvents } from '../hooks/useEvents';
import type { RootStackParamList, EventPost, Channel, PostStatus } from '../types';
import { Ionicons } from '@expo/vector-icons';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';

import { ArrowsClockwise, Article, Calendar, ChatCircle, Copy, FileText, Heart, PaperPlaneTilt, PencilLine, ShareNetwork, Trash } from 'phosphor-react-native';
import { SavedViewsSelector } from '../components/SavedViewsSelector';

// Filter-shape persisted into saved_views.filters JSONB. Keep in sync
// with the local filter state shape (status + channel).
interface PostsFilters {
  status?: PostStatus | null;
  channel?: Channel | null;
}
type Nav = NativeStackNavigationProp<RootStackParamList>;

const channelConfig: Record<Channel, { label: string; color: string; icon: string }> = {
  linkedin: { label: 'LinkedIn', color: '#0077B5', icon: 'logo-linkedin' },
  instagram: { label: 'Instagram', color: '#E4405F', icon: 'logo-instagram' },
  x: { label: 'X', color: '#1DA1F2', icon: 'logo-twitter' },
  facebook: { label: 'Facebook', color: '#1877F2', icon: 'logo-facebook' },
  tiktok: { label: 'TikTok', color: '#FF0050', icon: 'logo-tiktok' },
  whatsapp: { label: 'WhatsApp', color: '#25D366', icon: 'logo-whatsapp' },
  pinterest: { label: 'Pinterest', color: '#E60023', icon: 'logo-pinterest' },
  threads: { label: 'Threads', color: '#000000', icon: 'at-circle' },
  snapchat: { label: 'Snapchat', color: '#FFFC00', icon: 'logo-snapchat' },
};

const STATUS_FILTERS: (PostStatus | null)[] = [null, 'draft', 'approved', 'scheduled', 'published', 'failed'];
const CHANNEL_FILTERS: (Channel | null)[] = [null, 'linkedin', 'instagram', 'facebook', 'x', 'tiktok', 'whatsapp', 'pinterest', 'threads', 'snapchat'];

export default function AllPostsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const styles = useThemedStyles(createStyles);

  const [statusFilter, setStatusFilter] = useState<PostStatus | null>(null);
  const [channelFilter, setChannelFilter] = useState<Channel | null>(null);

  const filters = useMemo(() => ({
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(channelFilter ? { channel: channelFilter } : {}),
  }), [statusFilter, channelFilter]);

  const { data: posts = [], isLoading, refetch, isRefetching } = useAllPosts(
    Object.keys(filters).length > 0 ? filters : undefined,
  );
  const { data: events = [] } = useEvents();
  const deletePost = useDeletePost();
  const duplicatePost = useDuplicatePost();
  const publishPost = usePublishPost();
  const fetchEngagement = useFetchEngagement();

  // Track which post IDs are currently fetching engagement (for per-card spinner)
  const [fetchingEngagementIds, setFetchingEngagementIds] = useState<Set<string>>(new Set());

  const eventMap = useMemo(() => {
    const map: Record<string, string> = {};
    events.forEach((e: any) => { if (e.id && e.name) map[e.id] = e.name; });
    return map;
  }, [events]);

  const statusLabel = (s: PostStatus | null): string => {
    if (!s) return t.allPosts.filterAll;
    const map: Record<PostStatus, string> = {
      draft: t.allPosts.draft,
      approved: t.allPosts.approved,
      scheduled: t.allPosts.scheduled,
      published: t.allPosts.published,
      failed: t.allPosts.failed,
      in_review: t.allPosts.inReview,
    };
    return map[s] || s;
  };

  const statusColor = (s: PostStatus): string => {
    const map: Record<PostStatus, string> = {
      draft: '#6B7280',
      approved: '#10D9A0',
      scheduled: '#60A5FA',
      published: colors.primary,
      failed: '#F87171',
      in_review: '#F7941D',
    };
    return map[s] || '#6B7280';
  };

  const handleDelete = (post: EventPost) => {
    Alert.alert(
      t.allPosts.confirmDeleteTitle,
      t.allPosts.confirmDelete,
      [
        { text: t.common?.cancel || 'Annuleren', style: 'cancel' },
        {
          text: t.allPosts.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePost.mutateAsync(post.id);
            } catch {
              Alert.alert('Fout', 'Kon post niet verwijderen');
            }
          },
        },
      ],
    );
  };

  const handleCopy = async (post: EventPost) => {
    try {
      await duplicatePost.mutateAsync(post);
      Alert.alert(t.allPosts.copied);
    } catch {
      Alert.alert('Fout', 'Kon post niet kopiëren');
    }
  };

  const handleEdit = (post: EventPost) => {
    navigation.navigate('PostReview', {
      captureId: post.capture_id,
      eventId: post.event_id || undefined,
    });
  };

  const handlePublish = async (post: EventPost) => {
    try {
      await publishPost.mutateAsync(post.id);
      Alert.alert('✅', `Post gepubliceerd op ${channelConfig[post.channel]?.label}`);
    } catch {
      Alert.alert('⚠️', 'Publicatie mislukt. Verbind eerst je social media account.');
    }
  };

  const handleRefreshEngagement = async (post: EventPost) => {
    if (fetchingEngagementIds.has(post.id)) return;
    setFetchingEngagementIds((prev) => new Set(prev).add(post.id));
    try {
      const result = await fetchEngagement.mutateAsync(post.id);
      if (result?.action === 'reconnect') {
        Alert.alert('Account vernieuwen', `Je ${post.channel} account is verlopen. Ga naar Instellingen om het opnieuw te koppelen.`);
      }
    } catch {
      Alert.alert('Fout', 'Kon engagement niet ophalen. Probeer later opnieuw.');
    } finally {
      setFetchingEngagementIds((prev) => {
        const next = new Set(prev);
        next.delete(post.id);
        return next;
      });
    }
  };

  const renderPost = ({ item: post }: { item: EventPost }) => {
    const ch = channelConfig[post.channel];
    const eventName = post.event_id ? eventMap[post.event_id] : null;
    const dateStr = new Date(post.created_at).toLocaleDateString('nl-NL', {
      day: 'numeric', month: 'short',
    });
    const canPublish = post.status === 'draft' || post.status === 'approved';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => handleEdit(post)}
        accessibilityLabel="Open post"
      >
        {/* Color accent strip */}
        <View style={[styles.cardAccent, { backgroundColor: ch?.color || colors.primary }]} />

        <View style={styles.cardContent}>
          {/* Header: channel + status */}
          <View style={styles.cardHeader}>
            <View style={styles.channelRow}>
              <View style={[styles.channelIcon, { backgroundColor: (ch?.color || colors.primary) + '18' }]}>
                <Ionicons name={ch?.icon as any || 'globe-outline'} size={16} color={ch?.color || colors.text} />
              </View>
              <Text style={styles.channelLabel}>{ch?.label || post.channel}</Text>
              <Text style={styles.dateDot}>·</Text>
              <Text style={styles.dateText}>{dateStr}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor(post.status) + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(post.status) }]} />
              <Text style={[styles.statusText, { color: statusColor(post.status) }]}>
                {statusLabel(post.status)}
              </Text>
            </View>
          </View>

          {/* Text snippet */}
          <Text style={styles.postText} numberOfLines={2}>
            {post.text_content || '(geen tekst)'}
          </Text>

          {/* Meta: event name + hashtags */}
          <View style={styles.metaRow}>
            {eventName ? (
              <View style={styles.eventTag}>
                <Calendar size={11} color={colors.textSecondary} weight="duotone" />
                <Text style={styles.eventTagText} numberOfLines={1}>{eventName}</Text>
              </View>
            ) : (
              <View style={styles.eventTag}>
                <FileText size={11} color={colors.textTertiary} weight="duotone" />
                <Text style={[styles.eventTagText, { color: colors.textTertiary }]}>{t.allPosts.noEvent}</Text>
              </View>
            )}
            {post.hashtags && post.hashtags.length > 0 && (
              <Text style={styles.hashtagCount}>{post.hashtags.length} tags</Text>
            )}
          </View>

          {/* Engagement row — only for published posts with metrics */}
          {post.status === 'published' && (
            <View style={styles.engagementRow}>
              <View style={styles.engagementStat}>
                <Heart size={13} color={colors.textSecondary} weight="duotone" />
                <Text style={styles.engagementValue}>{post.engagement?.likes ?? 0}</Text>
              </View>
              <View style={styles.engagementStat}>
                <ChatCircle size={13} color={colors.textSecondary} weight="duotone" />
                <Text style={styles.engagementValue}>{post.engagement?.comments ?? 0}</Text>
              </View>
              <View style={styles.engagementStat}>
                <ShareNetwork size={13} color={colors.textSecondary} weight="duotone" />
                <Text style={styles.engagementValue}>{post.engagement?.shares ?? 0}</Text>
              </View>
              <View style={{ flex: 1 }} />
              {fetchingEngagementIds.has(post.id) ? (
                <ActivityIndicator size="small" color={colors.textSecondary} style={styles.engagementRefresh} />
              ) : (
                <TouchableOpacity
                  style={styles.engagementRefresh}
                  onPress={() => handleRefreshEngagement(post)}
                  accessibilityLabel="Engagement vernieuwen"
                >
                  <ArrowsClockwise size={15} color={colors.textSecondary} weight="bold" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Actions — icon buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleEdit(post)}>
              <PencilLine size={18} color={colors.primary} weight="duotone" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleCopy(post)}>
              <Copy size={18} color={colors.secondary} weight="duotone" />
            </TouchableOpacity>
            {canPublish && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => handlePublish(post)}>
                <PaperPlaneTilt size={18} color="#10D9A0" weight="duotone" />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(post)}>
              <Trash size={18} color="#F8717180" weight="duotone" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t.allPosts.title}</Text>
          <Text style={styles.headerCount}>{posts.length} posts</Text>
        </View>

        {/* Saved views — closes P1 #8 web↔mobile parity gap.
            Filters set here roundtrip with web's AllPosts via shared
            saved_views table. */}
        <SavedViewsSelector<PostsFilters>
          entityType="post"
          currentFilters={{ status: statusFilter, channel: channelFilter }}
          onApply={(v) => {
            setStatusFilter(v.filters?.status ?? null);
            setChannelFilter(v.filters?.channel ?? null);
          }}
          label="Weergaven"
        />

        {/* Filter bar */}
        <View style={styles.filterSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {STATUS_FILTERS.map((s) => {
              const active = statusFilter === s;
              const chipColor = s ? statusColor(s) : colors.primary;
              return (
                <TouchableOpacity
                  key={s || 'all-status'}
                  style={[styles.chip, active && { backgroundColor: chipColor, borderColor: chipColor }]}
                  onPress={() => setStatusFilter(s)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {statusLabel(s)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {CHANNEL_FILTERS.map((ch) => {
              const active = channelFilter === ch;
              const chipColor = ch ? channelConfig[ch]?.color : colors.primary;
              return (
                <TouchableOpacity
                  key={ch || 'all-channel'}
                  style={[styles.channelChip, active && { backgroundColor: chipColor + '20', borderColor: chipColor }]}
                  onPress={() => setChannelFilter(ch)}
                >
                  {ch && <Ionicons name={channelConfig[ch]?.icon as any} size={14} color={active ? chipColor : colors.textSecondary} />}
                  <Text style={[styles.chipText, active && { color: chipColor }]}>
                    {ch ? channelConfig[ch]?.label : t.allPosts.filterAll}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Post list */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : posts.length === 0 ? (
          <View style={styles.centered}>
            <View style={styles.emptyIcon}>
              <Article size={40} color={colors.textSecondary} weight="duotone" />
            </View>
            <Text style={styles.emptyTitle}>{t.allPosts.noPostsTitle}</Text>
            <Text style={styles.emptySubtitle}>{t.allPosts.noPostsSubtitle}</Text>
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            renderItem={renderPost}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  // Header
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold as any,
    color: colors.text,
  },
  headerCount: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  // Filters
  filterSection: {
    gap: 6,
    paddingBottom: spacing.xs,
  },
  filterRow: {
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  channelChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 5,
  },
  chipText: {
    fontSize: 12,
    fontWeight: fontWeight.medium as any,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: '#FFF',
    fontWeight: fontWeight.semibold as any,
  },
  // List
  list: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  // Card
  card: {
    flexDirection: 'row' as const,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden' as const,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardAccent: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  channelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  channelIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  channelLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    color: colors.text,
  },
  dateDot: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
  dateText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: fontWeight.semibold as any,
  },
  postText: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
  },
  eventTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  eventTagText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  hashtagCount: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: fontWeight.medium as any,
  },
  // Engagement
  engagementRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
    backgroundColor: colors.background,
    borderRadius: 6,
  },
  engagementStat: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
  },
  engagementValue: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium as any,
  },
  engagementRefresh: {
    padding: 3,
  },
  // Actions
  actionsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    gap: 16,
  },
  actionBtn: {
    padding: 4,
  },
  // Empty state
  centered: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surface,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    paddingHorizontal: spacing.xl,
  },
});
