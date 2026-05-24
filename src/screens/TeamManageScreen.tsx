// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: config?.icon as any> | Ionicons name=<dynamic: roleConfig.icon as any>
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  useTeamMembers,
  useInviteTeamMember,
  useUpdateTeamMember,
  useRemoveTeamMember,
  type TeamMember,
} from '../hooks/useTeamMembers';
import { useEvent } from '../hooks/useEvents';
import { useTranslation } from '../i18n';
import type { RootStackParamList } from '../types';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';

import { Users, X } from 'phosphor-react-native';
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'TeamManage'>;

const ROLE_OPTIONS = ['editor', 'contributor', 'viewer'];

export default function TeamManageScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { eventId } = route.params;
  const { colors } = useTheme();

  const { data: event } = useEvent(eventId);
  const { data: members = [], isLoading } = useTeamMembers(eventId);
  const inviteMember = useInviteTeamMember();
  const updateMember = useUpdateTeamMember();
  const removeMember = useRemoveTeamMember();

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      backgroundColor: c.surface,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    title: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    subtitle: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
      marginTop: 2,
    },
    inviteSection: {
      backgroundColor: c.surface,
      padding: spacing.md,
      marginTop: spacing.sm,
      marginHorizontal: spacing.md,
      borderRadius: borderRadius.lg,
      gap: spacing.sm,
      ...subtleShadow,
    },
    sectionTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.text,
      marginBottom: spacing.xs,
    },
    inviteRow: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
    },
    emailInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      fontSize: fontSize.md,
      color: c.text,
      backgroundColor: c.background,
    },
    roleSelector: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
    },
    roleOption: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 4,
      paddingVertical: 8,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.background,
    },
    roleOptionSelected: {
      borderColor: c.primary,
      backgroundColor: c.primary + '10',
    },
    roleOptionIcon: { fontSize: 14 },
    roleOptionText: {
      fontSize: fontSize.xs,
      color: c.textSecondary,
    },
    inviteBtn: {
      backgroundColor: c.primary,
      borderRadius: borderRadius.md,
      paddingVertical: 12,
      alignItems: 'center' as const,
    },
    inviteBtnText: {
      color: c.textOnPrimary,
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
    },
    membersList: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
    },
    memberCard: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: c.surface,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      ...subtleShadow,
    },
    memberInfo: { flex: 1, gap: 6 },
    memberHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    memberIcon: { fontSize: 18 },
    memberEmail: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.medium,
      color: c.text,
      flex: 1,
    },
    memberMeta: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
      flexWrap: 'wrap' as const,
    },
    roleBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
    },
    roleBadgeText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.medium,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
    },
    statusBadgeText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.medium,
    },
    memberActions: {
      flexDirection: 'row' as const,
      gap: spacing.xs,
      marginLeft: spacing.sm,
    },
    memberActionBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: borderRadius.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    memberActionText: {
      fontSize: fontSize.xs,
      color: c.textSecondary,
      fontWeight: fontWeight.medium,
    },
    removeBtn: {
      borderColor: c.error + '40',
      backgroundColor: c.error + '08',
    },
    removeText: {
      color: c.error,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    emptyContainer: {
      alignItems: 'center' as const,
      paddingTop: spacing.xxl,
    },
    emptyIcon: { fontSize: 48, marginBottom: spacing.md },
    emptyText: {
      fontSize: fontSize.md,
      color: c.textSecondary,
      fontWeight: fontWeight.medium,
    },
    emptySubtext: {
      fontSize: fontSize.sm,
      color: c.textTertiary,
      marginTop: spacing.xs,
      textAlign: 'center' as const,
    },
  }));

  const ROLE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
    owner: { label: t.teamManage.owner, icon: 'shield', color: '#D97706' },
    editor: { label: t.teamManage.editor, icon: 'create-outline', color: colors.info },
    contributor: { label: t.teamManage.contributor, icon: 'camera-outline', color: colors.success },
    viewer: { label: t.teamManage.viewer, icon: 'eye-outline', color: colors.textSecondary },
  };

  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState('contributor');

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      Alert.alert(t.teamManage.invalidEmail, t.teamManage.invalidEmailMsg);
      return;
    }

    try {
      await inviteMember.mutateAsync({
        eventId,
        email,
        role: selectedRole,
      });
      setInviteEmail('');
      Alert.alert(t.teamManage.invited, `${email} ${t.teamManage.invitedAs} ${ROLE_LABELS[selectedRole]?.label || selectedRole}`);
    } catch (error: any) {
      const detail = error?.message || t.teamManage.inviteFailed;
      Alert.alert(t.common.error, detail);
    }
  };

  const handleChangeRole = (member: TeamMember) => {
    const options = ROLE_OPTIONS.filter((r) => r !== member.role);
    Alert.alert(
      t.teamManage.changeRole,
      `${t.teamManage.currentRole}: ${ROLE_LABELS[member.role]?.label || member.role}`,
      [
        ...options.map((role) => ({
          text: ROLE_LABELS[role]?.label || role,
          onPress: () => {
            updateMember.mutate({
              eventId,
              memberId: member.id,
              role,
            });
          },
        })),
        { text: t.common.cancel, style: 'cancel' as const },
      ],
    );
  };

  const handleRemove = (member: TeamMember) => {
    Alert.alert(
      t.teamManage.removeTitle,
      `${member.email || member.user_id.slice(0, 8)} ${t.teamManage.removeMsg}`,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: () => removeMember.mutate({ eventId, memberId: member.id }),
        },
      ],
    );
  };

  const renderMember = ({ item }: { item: TeamMember }) => {
    const roleConfig = ROLE_LABELS[item.role] || ROLE_LABELS.viewer;
    const isPending = item.status === 'pending';
    const isDeclined = item.status === 'declined';

    return (
      <View style={styles.memberCard}>
        <View style={styles.memberInfo}>
          <View style={styles.memberHeader}>
            <Ionicons name={roleConfig.icon as any} size={18} color={roleConfig.color} />
            <Text style={styles.memberEmail} numberOfLines={1}>
              {item.email || `${item.user_id.slice(0, 8)}...`}
            </Text>
          </View>

          <View style={styles.memberMeta}>
            <View style={[styles.roleBadge, { backgroundColor: roleConfig.color + '20' }]}>
              <Text style={[styles.roleBadgeText, { color: roleConfig.color }]}>
                {roleConfig.label}
              </Text>
            </View>

            {isPending && (
              <View style={[styles.statusBadge, { backgroundColor: colors.warning + '20' }]}>
                <Text style={[styles.statusBadgeText, { color: colors.warning }]}>
                  {t.teamManage.pendingAcceptance}
                </Text>
              </View>
            )}

            {isDeclined && (
              <View style={[styles.statusBadge, { backgroundColor: colors.error + '20' }]}>
                <Text style={[styles.statusBadgeText, { color: colors.error }]}>
                  {t.teamManage.declined}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.memberActions}>
          <TouchableOpacity
            style={styles.memberActionBtn}
            onPress={() => handleChangeRole(item)}
          >
            <Text style={styles.memberActionText}>{t.teamManage.role}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.memberActionBtn, styles.removeBtn]}
            onPress={() => handleRemove(item)}
          >
            <X size={14} color={colors.error} weight="bold" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t.teamManage.title}</Text>
        <Text style={styles.subtitle}>{event?.name || 'Event'}</Text>
      </View>

      {/* Invite Section */}
      <View style={styles.inviteSection}>
        <Text style={styles.sectionTitle}>{t.teamManage.inviteTitle}</Text>

        <View style={styles.inviteRow}>
          <TextInput
            style={styles.emailInput}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder={t.teamManage.emailPlaceholder}
            placeholderTextColor={colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Role selector */}
        <View style={styles.roleSelector}>
          {ROLE_OPTIONS.map((role) => {
            const config = ROLE_LABELS[role];
            const isSelected = selectedRole === role;
            return (
              <TouchableOpacity
                key={role}
                style={[styles.roleOption, isSelected && styles.roleOptionSelected]}
                onPress={() => setSelectedRole(role)}
              >
                <Ionicons name={config?.icon as any} size={14} color={isSelected ? colors.primary : colors.textSecondary} />
                <Text
                  style={[
                    styles.roleOptionText,
                    isSelected && { color: colors.primary, fontWeight: fontWeight.semibold },
                  ]}
                >
                  {config?.label || role}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.inviteBtn}
          onPress={handleInvite}
          disabled={inviteMember.isPending}
        >
          {inviteMember.isPending ? (
            <ActivityIndicator color={colors.textOnPrimary} size="small" />
          ) : (
            <Text style={styles.inviteBtnText}>{t.teamManage.invite}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Members List */}
      <Text style={[styles.sectionTitle, { paddingHorizontal: spacing.md }]}>
        {t.teamManage.teamMembers} ({members.length})
      </Text>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={renderMember}
          contentContainerStyle={styles.membersList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Users size={48} color={colors.textSecondary} weight="duotone" />
              <Text style={styles.emptyText}>{t.teamManage.noMembers}</Text>
              <Text style={styles.emptySubtext}>
                {t.teamManage.noMembersDesc}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
