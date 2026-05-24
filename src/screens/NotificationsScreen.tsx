// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: cfg.icon as any>
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { useTranslation } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useRespondToInvite,
  type AppNotification,
} from '../hooks/useNotifications';
import { useProcessApproval } from '../hooks/usePostApproval';

import { BellSlash, Calendar, Check, Users, X } from 'phosphor-react-native';
type Nav = NativeStackNavigationProp<RootStackParamList>;

type NotifConfig = { icon: string; color: string };

const TYPE_CONFIG: Record<string, NotifConfig> = {
  team_invite:           { icon: 'people',             color: '#7c3aed' },
  ai_suggestion:         { icon: 'sparkles',           color: '#9333EA' },
  post_published:        { icon: 'checkmark-circle',   color: '#10B981' },
  event_update:          { icon: 'calendar',           color: '#3B82F6' },
  boost_candidate:       { icon: 'rocket',             color: '#F59E0B' }, // Capture-to-Ad top-performer
  post_approval_needed:  { icon: 'shield-checkmark',   color: '#ED1D96' }, // Brand magenta — admin action required
  post_approval_decided: { icon: 'document-text',      color: '#0EA5E9' }, // submitter-side decision result
  system:                { icon: 'notifications',      color: '#6B7280' },
};

const ROLE_LABELS: Record<string, string> = {
  editor:      'Editor',
  contributor: 'Bijdrager',
  viewer:      'Kijker',
  owner:       'Eigenaar',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Zojuist';
  if (mins < 60) return `${mins}m geleden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}u geleden`;
  const days = Math.floor(hours / 24);
  return `${days}d geleden`;
}

// ─── Main Screen ─────────────────────────────────────────────────

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },

    // Header
    header: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      backgroundColor: c.surface,
      paddingTop: 60,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    unreadPill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 5,
      marginTop: 3,
    },
    unreadDotSmall: {
      width: 7, height: 7, borderRadius: 4,
      backgroundColor: c.primary,
    },
    unreadPillText: {
      fontSize: fontSize.xs,
      color: c.primary,
      fontWeight: fontWeight.semibold,
    },
    markAllBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    markAllText: {
      fontSize: fontSize.xs,
      color: c.primary,
      fontWeight: fontWeight.semibold,
    },

    // Loading
    loadingContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    loadingText: { fontSize: fontSize.sm, color: c.textSecondary },

    // List
    list: { padding: spacing.md, paddingBottom: 100 },

    // Section header
    sectionHeader: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      color: c.textSecondary,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.6,
      paddingVertical: spacing.sm,
      paddingHorizontal: 2,
    },

    // Cards
    card: {
      flexDirection: 'row' as const,
      backgroundColor: c.surface,
      borderRadius: borderRadius.md,
      marginBottom: spacing.sm,
      overflow: 'hidden' as const,
      ...subtleShadow,
    },
    inviteCard: {
      flexDirection: 'row' as const,
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      marginBottom: spacing.sm,
      overflow: 'hidden' as const,
      ...subtleShadow,
    },
    cardUnread: {
      backgroundColor: c.primary + '08',
      borderLeftWidth: 0,
    },
    accentBar: { width: 4, alignSelf: 'stretch' as const },
    cardContent: { flex: 1, padding: spacing.md },
    cardHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    iconCircle: {
      width: 36, height: 36, borderRadius: 18,
      justifyContent: 'center' as const, alignItems: 'center' as const,
      flexShrink: 0,
    },
    cardTitleRow: {
      flex: 1,
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
    },
    cardTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.medium,
      color: c.text,
      flex: 1,
    },
    cardTitleUnread: { fontWeight: fontWeight.semibold },
    cardTime: {
      fontSize: fontSize.xs,
      color: c.textTertiary,
      marginLeft: spacing.xs,
    },
    cardBody: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
      lineHeight: 20,
      marginBottom: spacing.sm,
    },
    unreadDot: {
      position: 'absolute' as const,
      top: spacing.md,
      right: spacing.md,
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: c.primary,
    },

    // Team invite
    inviteEventBox: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 5,
      backgroundColor: '#f3e8ff',
      borderRadius: borderRadius.sm,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginBottom: spacing.sm,
      alignSelf: 'flex-start' as const,
    },
    inviteEventName: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: '#7c3aed',
    },
    inviteActions: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: 4 },
    acceptBtn: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 5,
      backgroundColor: '#7c3aed',
      borderRadius: borderRadius.md,
      paddingVertical: 10,
    },
    acceptBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
    declineBtn: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderRadius: borderRadius.md,
      paddingVertical: 10,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    declineBtnText: { color: c.textSecondary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
    respondedText: { fontSize: fontSize.xs, color: c.success, fontWeight: fontWeight.medium },

    // Empty state
    emptyContainer: { alignItems: 'center' as const, paddingTop: 80, gap: spacing.sm },
    emptyIconCircle: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: c.surfaceElevated,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      marginBottom: spacing.sm,
    },
    emptyTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: c.text },
    emptySub: { fontSize: fontSize.sm, color: c.textSecondary, textAlign: 'center' as const },

    // Invited by text helper
    invitedByBold: { fontWeight: fontWeight.semibold, color: c.text },
  }));

  const { data: notifications = [], isLoading, refetch } = useNotifications();
  const markRead       = useMarkNotificationRead();
  const markAllRead    = useMarkAllNotificationsRead();
  const respondInvite  = useRespondToInvite();
  const processApproval = useProcessApproval();

  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [refreshing,   setRefreshing]   = useState(false);
  // For post_approval_needed: when user taps "Afkeuren" on Android we render
  // an inline TextInput (Alert.prompt is iOS-only). Tracks which notification
  // is currently in "rejection-reason input" mode + the reason text.
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const unreadCount = notifications.filter((n) => !n.read).length;
  const invites  = notifications.filter((n) => n.type === 'team_invite' && !n.read);
  const rest     = notifications.filter((n) => !(n.type === 'team_invite' && !n.read));

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleAccept = async (notification: AppNotification) => {
    const { member_id, event_id } = notification.data;
    if (!member_id || !event_id) return;
    setRespondingId(notification.id);
    try {
      await respondInvite.mutateAsync({
        notificationId: notification.id,
        memberId: member_id as string,
        eventId:  event_id as string,
        action:   'accept',
      });
      Alert.alert('Geaccepteerd! 🎉', 'Je bent nu lid van het event team.');
    } catch (err: any) {
      Alert.alert('Fout', err.message || 'Kon de uitnodiging niet accepteren');
    } finally {
      setRespondingId(null);
    }
  };

  const handleDecline = async (notification: AppNotification) => {
    const { member_id, event_id, event_name } = notification.data;
    if (!member_id || !event_id) return;
    Alert.alert(
      'Uitnodiging weigeren',
      `Wil je de uitnodiging voor ${event_name} weigeren?`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Weigeren',
          style: 'destructive',
          onPress: async () => {
            setRespondingId(notification.id);
            try {
              await respondInvite.mutateAsync({
                notificationId: notification.id,
                memberId: member_id as string,
                eventId:  event_id as string,
                action:   'decline',
              });
            } catch (err: any) {
              Alert.alert('Fout', err.message || 'Kon de uitnodiging niet weigeren');
            } finally {
              setRespondingId(null);
            }
          },
        },
      ],
    );
  };

  // ─── Post approval handlers ────────────────────────────────────────
  const finalizeApproval = async (
    notification: AppNotification,
    decision: 'approve' | 'reject',
    reason?: string,
  ) => {
    const postId = notification.data?.post_id as string | undefined;
    if (!postId) {
      Alert.alert(t.common.error, 'post_id ontbreekt in melding');
      return;
    }
    setRespondingId(notification.id);
    try {
      await processApproval.mutateAsync({ post_id: postId, decision, reason });
      // Mark notification as read so the action buttons disappear
      await markRead.mutateAsync(notification.id);
      Alert.alert(decision === 'approve' ? t.postApproval.approved : t.postApproval.rejected);
    } catch (err: any) {
      Alert.alert(t.postApproval.decisionError, err?.message || t.common.error);
    } finally {
      setRespondingId(null);
      setRejectingId(null);
      setRejectReason('');
    }
  };

  const handleApprovePost = (notification: AppNotification) => {
    Alert.alert(
      t.postApproval.confirmApprove,
      undefined,
      [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.postApproval.approve, onPress: () => finalizeApproval(notification, 'approve') },
      ],
    );
  };

  const handleRejectPost = (notification: AppNotification) => {
    if (Platform.OS === 'ios' && (Alert as any).prompt) {
      (Alert as any).prompt(
        t.postApproval.rejectPromptTitle,
        t.postApproval.rejectPromptMsg,
        [
          { text: t.common.cancel, style: 'cancel' },
          {
            text: t.postApproval.reject,
            style: 'destructive',
            onPress: (reason?: string) => {
              const trimmed = (reason || '').trim();
              if (!trimmed) {
                Alert.alert(t.postApproval.rejectReasonPlaceholder);
                return;
              }
              finalizeApproval(notification, 'reject', trimmed);
            },
          },
        ],
        'plain-text',
      );
    } else {
      // Android — inline TextInput in the card
      setRejectingId(notification.id);
      setRejectReason('');
    }
  };

  const handleGenericPress = (notification: AppNotification) => {
    markRead.mutate(notification.id);

    // Capture-to-Ad: boost_candidate notifications open BoostFlow wizard
    // for the related post. Inserted by ad-performance-monitor cron when a
    // post is detected as top-performer (3x baseline engagement).
    // Reads post_id from notification.data (go_notifications schema).
    if (notification.type === 'boost_candidate') {
      const postId = notification.data?.post_id;
      const channel = notification.data?.channel === 'instagram' ? 'instagram' : 'facebook';
      if (postId) {
        navigation.navigate('BoostFlow', {
          postId: String(postId),
          channel,
        });
        return;
      }
    }

    if (notification.data.route) {
      navigation.navigate(notification.data.route as any);
    }
  };

  type ListItem =
    | { kind: 'header'; label: string; key: string }
    | { kind: 'invite'; notification: AppNotification; key: string }
    | { kind: 'notif';  notification: AppNotification; key: string }
    | { kind: 'empty';  key: string };

  const listItems: ListItem[] = [];

  if (invites.length > 0) {
    listItems.push({ kind: 'header', label: `Uitnodigingen (${invites.length})`, key: 'h-invites' });
    invites.forEach((n) => listItems.push({ kind: 'invite', notification: n, key: n.id }));
  }

  if (rest.length > 0) {
    if (invites.length > 0) listItems.push({ kind: 'header', label: 'Meldingen', key: 'h-rest' });
    rest.forEach((n) => listItems.push({ kind: 'notif', notification: n, key: n.id }));
  }

  if (listItems.length === 0 && !isLoading) {
    listItems.push({ kind: 'empty', key: 'empty' });
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t.notifications.title}</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadPill}>
              <View style={styles.unreadDotSmall} />
              <Text style={styles.unreadPillText}>{unreadCount} ongelezen</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity
            onPress={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            style={styles.markAllBtn}
          >
            {markAllRead.isPending
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={styles.markAllText}>Alles gelezen</Text>
            }
          </TouchableOpacity>
        )}
      </View>

      {isLoading && notifications.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Meldingen laden...</Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return <Text style={styles.sectionHeader}>{item.label}</Text>;
            }

            if (item.kind === 'invite') {
              const n = item.notification;
              const role = ROLE_LABELS[n.data.role || ''] || n.data.role || 'Bijdrager';
              return (
                <View style={[styles.inviteCard, !n.read && styles.cardUnread]}>
                  <View style={[styles.accentBar, { backgroundColor: '#7c3aed' }]} />
                  <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.iconCircle, { backgroundColor: '#f3e8ff' }]}>
                        <Users size={18} color="#7c3aed" weight="duotone" />
                      </View>
                      <View style={styles.cardTitleRow}>
                        <Text style={[styles.cardTitle, styles.cardTitleUnread]} numberOfLines={1}>
                          {n.title}
                        </Text>
                        <Text style={styles.cardTime}>{timeAgo(n.created_at)}</Text>
                      </View>
                    </View>
                    <View style={styles.inviteEventBox}>
                      <Calendar size={13} color="#7c3aed" weight="duotone" />
                      <Text style={styles.inviteEventName} numberOfLines={1}>{n.data.event_name}</Text>
                    </View>
                    <Text style={styles.cardBody}>
                      <Text style={styles.invitedByBold}>{n.data.invited_by}</Text>
                      {' nodigt je uit als '}
                      <Text style={{ fontWeight: fontWeight.semibold, color: '#7c3aed' }}>{role}</Text>
                    </Text>
                    {!n.read && (
                      <View style={styles.inviteActions}>
                        {respondingId === n.id ? (
                          <ActivityIndicator size="small" color="#7c3aed" />
                        ) : (
                          <>
                            <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(n)}>
                              <Check size={14} color="#fff" weight="bold" />
                              <Text style={styles.acceptBtnText}>Accepteren</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(n)}>
                              <Text style={styles.declineBtnText}>Weigeren</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    )}
                    {n.read && <Text style={styles.respondedText}>✓ Beantwoord</Text>}
                  </View>
                </View>
              );
            }

            if (item.kind === 'notif') {
              const n = item.notification;
              const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.system;
              const isApprovalRequest = n.type === 'post_approval_needed' && !n.read;
              const isRejectingThis = rejectingId === n.id;
              return (
                <TouchableOpacity
                  style={[styles.card, !n.read && styles.cardUnread]}
                  onPress={() => {
                    // Don't toggle navigation while user is typing a rejection reason
                    if (isApprovalRequest || isRejectingThis) return;
                    handleGenericPress(n);
                  }}
                  activeOpacity={isApprovalRequest ? 1 : 0.75}
                >
                  <View style={[styles.accentBar, { backgroundColor: cfg.color }]} />
                  <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.iconCircle, { backgroundColor: cfg.color + '18' }]}>
                        <Ionicons name={cfg.icon as any} size={18} color={cfg.color} />
                      </View>
                      <View style={styles.cardTitleRow}>
                        <Text style={[styles.cardTitle, !n.read && styles.cardTitleUnread]} numberOfLines={1}>
                          {n.title}
                        </Text>
                        <Text style={styles.cardTime}>{timeAgo(n.created_at)}</Text>
                      </View>
                    </View>
                    {n.body ? <Text style={styles.cardBody}>{n.body}</Text> : null}
                    {/* Inline approve/reject buttons for post_approval_needed */}
                    {isApprovalRequest && (
                      <>
                        {isRejectingThis ? (
                          <View style={{ gap: spacing.sm, marginTop: 4 }}>
                            <TextInput
                              style={{
                                borderWidth: 1,
                                borderColor: colors.border,
                                borderRadius: borderRadius.md,
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                fontSize: fontSize.sm,
                                color: colors.text,
                                backgroundColor: colors.background,
                                minHeight: 60,
                                textAlignVertical: 'top',
                              }}
                              value={rejectReason}
                              onChangeText={setRejectReason}
                              placeholder={t.postApproval.rejectReasonPlaceholder}
                              placeholderTextColor={colors.textTertiary}
                              multiline
                              autoFocus
                            />
                            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                              <TouchableOpacity
                                style={{
                                  flex: 1,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: borderRadius.md,
                                  paddingVertical: 10,
                                  borderWidth: 1.5,
                                  borderColor: colors.border,
                                }}
                                onPress={() => { setRejectingId(null); setRejectReason(''); }}
                              >
                                <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>
                                  {t.common.cancel}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={{
                                  flex: 1,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: borderRadius.md,
                                  paddingVertical: 10,
                                  backgroundColor: '#EF4444',
                                  opacity: rejectReason.trim().length === 0 ? 0.5 : 1,
                                }}
                                disabled={rejectReason.trim().length === 0 || respondingId === n.id}
                                onPress={() => finalizeApproval(n, 'reject', rejectReason.trim())}
                              >
                                {respondingId === n.id
                                  ? <ActivityIndicator size="small" color="#fff" />
                                  : <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>
                                      {t.postApproval.reject}
                                    </Text>}
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: 4 }}>
                            {respondingId === n.id ? (
                              <ActivityIndicator size="small" color={cfg.color} />
                            ) : (
                              <>
                                <TouchableOpacity
                                  style={{
                                    flex: 1,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 5,
                                    backgroundColor: '#10B981',
                                    borderRadius: borderRadius.md,
                                    paddingVertical: 10,
                                  }}
                                  onPress={() => handleApprovePost(n)}
                                >
                                  <Check size={14} color="#fff" weight="bold" />
                                  <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>
                                    {t.postApproval.approve}
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={{
                                    flex: 1,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 5,
                                    backgroundColor: '#EF4444',
                                    borderRadius: borderRadius.md,
                                    paddingVertical: 10,
                                  }}
                                  onPress={() => handleRejectPost(n)}
                                >
                                  <X size={14} color="#fff" weight="bold" />
                                  <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>
                                    {t.postApproval.reject}
                                  </Text>
                                </TouchableOpacity>
                              </>
                            )}
                          </View>
                        )}
                      </>
                    )}
                    {!n.read && !isApprovalRequest && <View style={styles.unreadDot} />}
                  </View>
                </TouchableOpacity>
              );
            }

            // Empty state
            return (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <BellSlash size={36} color={colors.textTertiary} weight="duotone" />
                </View>
                <Text style={styles.emptyTitle}>{t.notifications.noNotifications}</Text>
                <Text style={styles.emptySub}>{t.notifications.allCaughtUp}</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
