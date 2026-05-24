// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: item.media_type === 'video' ? 'videocam-outline' : item.media_type === 'audio' ? 'mic-outline' : 'document-text-outline'>
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEvent, useUpdateEvent } from '../hooks/useEvents';
import { useCaptures, useDeleteCapture } from '../hooks/useCaptures';
import { useEventPosts } from '../hooks/useEventPosts';
import type { RootStackParamList, EventCapture, EventPost, EventStatus } from '../types';
import { Ionicons } from '@expo/vector-icons';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow, fabShadow } from '../utils/shadows';
import { useTranslation } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';

import { Calendar, Camera, CaretRight, FileText, GitBranch, MapPin, Scan, ShareNetwork, Sparkle, Trash, UserPlus, Users } from 'phosphor-react-native';
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'EventDashboard'>;

export default function EventDashboardScreen() {
  const { t, locale } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { eventId } = route.params;

  const { data: event } = useEvent(eventId);
  const { data: captures = [] } = useCaptures(eventId);
  const { data: posts = [] } = useEventPosts(eventId);
  const updateEvent = useUpdateEvent();
  const deleteCapture = useDeleteCapture();

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      backgroundColor: c.surface,
      padding: spacing.md,
      gap: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTop: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
    },
    eventName: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text, flex: 1 },
    editBtn: { color: c.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
    metaRow: { flexDirection: 'row' as const, gap: spacing.md },
    metaText: { fontSize: fontSize.sm, color: c.textSecondary },
    statusBadge: {
      alignSelf: 'flex-start' as const,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
    },
    statusText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
    stats: {
      flexDirection: 'row' as const,
      backgroundColor: c.surface,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    statItem: { flex: 1, alignItems: 'center' as const },
    statValue: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text },
    statLabel: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 2 },
    quickActions: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    quickActionsRow: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
    },
    quickActionBtn: {
      width: 72,
      alignItems: 'center' as const,
      paddingVertical: spacing.sm,
      paddingHorizontal: 4,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      gap: 2,
    },
    quickActionLabel: {
      fontSize: 10,
      fontWeight: fontWeight.medium,
      color: c.textSecondary,
      textAlign: 'center' as const,
    },
    sectionTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.text,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    timeline: { paddingHorizontal: spacing.md, paddingBottom: 100 },
    captureCard: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      ...subtleShadow,
    },
    captureRow: { flexDirection: 'row' as const, gap: spacing.md, alignItems: 'center' as const },
    thumbnail: {
      width: 56,
      height: 56,
      borderRadius: borderRadius.sm,
    },
    thumbnailPlaceholder: {
      backgroundColor: c.borderLight,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    captureInfo: { flex: 1, gap: 2 },
    captureTime: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: c.text },
    captureTags: { fontSize: fontSize.xs, color: c.primary },
    aiTags: { fontSize: fontSize.xs, color: c.info, fontStyle: 'italic' as const },
    captureNote: { fontSize: fontSize.xs, color: c.textSecondary },
    postStatuses: { gap: 4 },
    postStatusDot: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    empty: { alignItems: 'center' as const, paddingTop: spacing.xxl },
    emptyText: { fontSize: fontSize.md, color: c.textSecondary },
    emptySubtext: { fontSize: fontSize.sm, color: c.textTertiary, marginTop: spacing.xs },
    captureFab: {
      position: 'absolute' as const,
      bottom: 30,
      left: spacing.lg,
      right: spacing.lg,
      backgroundColor: c.primary,
      borderRadius: borderRadius.lg,
      paddingVertical: 16,
      alignItems: 'center' as const,
      ...fabShadow(c.primary),
    },
    captureFabText: {
      color: c.textOnPrimary,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
    },
  }));

  const publishedCount = posts.filter((p) => p.status === 'published').length;
  const scheduledCount = posts.filter((p) => p.status === 'scheduled').length;
  const draftCount = posts.filter((p) => p.status === 'draft').length;

  const statusColors: Record<EventStatus, string> = {
    upcoming: colors.info,
    active: colors.success,
    completed: colors.textSecondary,
    archived: colors.textTertiary,
  };

  const toggleStatus = () => {
    if (!event) return;
    const nextStatus: Record<EventStatus, EventStatus> = {
      upcoming: 'active',
      active: 'completed',
      completed: 'archived',
      archived: 'upcoming',
    };
    updateEvent.mutate({ id: event.id, status: nextStatus[event.status] });
  };

  const getPostsForCapture = (captureId: string): EventPost[] =>
    posts.filter((p) => p.capture_id === captureId);

  const handleDeleteCapture = (item: EventCapture) => {
    Alert.alert(
      'Capture verwijderen',
      'Weet je zeker dat je deze capture en alle bijbehorende posts wilt verwijderen?',
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCapture.mutateAsync({
                captureId: item.id,
                storagePath: item.storage_path ?? null,
                eventId,
              });
            } catch {
              Alert.alert(t.common.error, 'Kon capture niet verwijderen.');
            }
          },
        },
      ],
    );
  };

  const renderCapture = ({ item }: { item: EventCapture }) => {
    const capturePosts = getPostsForCapture(item.id);
    return (
      <TouchableOpacity
        style={styles.captureCard}
        onPress={() => navigation.navigate('PostReview', { captureId: item.id, eventId })}
        activeOpacity={0.8}
      >
        <View style={styles.captureRow}>
          {/* Thumbnail */}
          {item.media_type === 'photo' && item.thumbnail_url ? (
            <Image source={{ uri: item.thumbnail_url }} style={styles.thumbnail} />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Ionicons
                name={item.media_type === 'video' ? 'videocam-outline' : item.media_type === 'audio' ? 'mic-outline' : 'document-text-outline'}
                size={24}
                color={colors.textSecondary}
              />
            </View>
          )}

          {/* Info */}
          <View style={styles.captureInfo}>
            <Text style={styles.captureTime}>
              {new Date(item.captured_at).toLocaleTimeString(locale === 'nl' ? 'nl-NL' : locale === 'fr' ? 'fr-FR' : 'en-US', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            {(item.tags?.length ?? 0) > 0 && (
              <Text style={styles.captureTags} numberOfLines={1}>
                {(item.tags || []).join(', ')}
              </Text>
            )}
            {/* AI-detected tags — guard against non-array or missing label props */}
            {Array.isArray((item as any).ai_tags) && (item as any).ai_tags.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Sparkle size={12} color={colors.info} weight="fill" />
                <Text style={styles.aiTags} numberOfLines={1}>
                  {(item as any).ai_tags
                    .slice(0, 3)
                    .map((tg: any) => (typeof tg === 'string' ? tg : tg?.label ?? ''))
                    .filter(Boolean)
                    .join(' \u2022 ')}
                </Text>
              </View>
            )}
            {item.note ? (
              <Text style={styles.captureNote} numberOfLines={1}>{item.note}</Text>
            ) : null}
          </View>

          {/* Post status icons */}
          <View style={styles.postStatuses}>
            {capturePosts.map((p) => (
              <View key={p.id} style={styles.postStatusDot}>
                <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                  {p.channel === 'linkedin' ? 'LI' : p.channel === 'instagram' ? 'IG' : p.channel === 'x' ? 'X' : p.channel === 'tiktok' ? 'TT' : 'FB'}
                </Text>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        p.status === 'published' ? colors.success
                        : p.status === 'scheduled' ? colors.info
                        : p.status === 'failed' ? colors.error
                        : colors.draft,
                    },
                  ]}
                />
              </View>
            ))}
          </View>

          {/* Delete button */}
          <TouchableOpacity
            style={{ padding: 8, marginLeft: 4 }}
            onPress={(e) => { e.stopPropagation(); handleDeleteCapture(item); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Trash size={18} color={colors.error} weight="duotone" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (!event) return null;

  return (
    <View style={styles.container}>
      {/* Event Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.eventName}>{event.name}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('EventSetup', { eventId })}>
            <Text style={styles.editBtn}>{t.common.edit}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metaRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MapPin size={14} color={colors.textSecondary} weight="duotone" />
            <Text style={styles.metaText}>{event.location || t.common.noLocation}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Calendar size={14} color={colors.textSecondary} weight="duotone" />
            <Text style={styles.metaText}>{new Date(event.event_date).toLocaleDateString(locale === 'nl' ? 'nl-NL' : locale === 'fr' ? 'fr-FR' : 'en-US')}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.statusBadge, { backgroundColor: statusColors[event.status] + '20' }]}
          onPress={toggleStatus}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={[styles.statusText, { color: statusColors[event.status] }]}>
              {event.status}
            </Text>
            <CaretRight size={14} color={statusColors[event.status]} weight="bold" />
            <Text style={[styles.statusText, { color: statusColors[event.status] }]}>
              {t.eventDashboard.tapToChange}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{captures.length}</Text>
          <Text style={styles.statLabel}>{t.eventDashboard.captures}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{posts.length}</Text>
          <Text style={styles.statLabel}>{t.eventDashboard.posts}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.success }]}>{publishedCount}</Text>
          <Text style={styles.statLabel}>{t.eventDashboard.published}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.info }]}>{scheduledCount}</Text>
          <Text style={styles.statLabel}>{t.eventDashboard.scheduled}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: colors.draft }]}>{draftCount}</Text>
          <Text style={styles.statLabel}>{t.eventDashboard.drafts}</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionsRow}>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => navigation.navigate('StoryArc', { eventId })}
          >
            <GitBranch size={20} color={colors.primary} weight="duotone" />
            <Text style={styles.quickActionLabel} numberOfLines={1}>Story</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => navigation.navigate('EventRecap', { eventId })}
          >
            <FileText size={20} color={colors.primary} weight="duotone" />
            <Text style={styles.quickActionLabel} numberOfLines={1}>Recap</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => navigation.navigate('TeamManage', { eventId })}
          >
            <Users size={20} color={colors.primary} weight="duotone" />
            <Text style={styles.quickActionLabel} numberOfLines={1}>Team</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => navigation.navigate('LiveCapture', { eventId })}
          >
            <Camera size={20} color={colors.primary} weight="duotone" />
            <Text style={styles.quickActionLabel} numberOfLines={1}>Foto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => navigation.navigate('EventScanner', { eventId })}
          >
            <Scan size={20} color={colors.success} weight="regular" />
            <Text style={[styles.quickActionLabel, { color: colors.success }]} numberOfLines={1}>Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => navigation.navigate('EventAttendees', { eventId })}
          >
            <UserPlus size={20} color={colors.info} weight="duotone" />
            <Text style={[styles.quickActionLabel, { color: colors.info }]} numberOfLines={1}>Gasten</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => navigation.navigate('EventShare', { eventId })}
          >
            <ShareNetwork size={20} color={colors.secondary} weight="duotone" />
            <Text style={[styles.quickActionLabel, { color: colors.secondary }]} numberOfLines={1}>Delen</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Timeline */}
      <Text style={styles.sectionTitle}>{t.eventDashboard.timeline}</Text>
      <FlatList
        data={captures}
        keyExtractor={(item) => item.id}
        renderItem={renderCapture}
        contentContainerStyle={styles.timeline}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t.eventDashboard.noCaptures}</Text>
            <Text style={styles.emptySubtext}>{t.eventDashboard.startCapturing}</Text>
          </View>
        }
      />

      {/* Start Capture FAB */}
      <TouchableOpacity
        style={styles.captureFab}
        onPress={() => navigation.navigate('LiveCapture', { eventId })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Camera size={20} color={colors.textOnPrimary} weight="duotone" />
          <Text style={styles.captureFabText}>{t.eventDashboard.startCapture}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}
