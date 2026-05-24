import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  Modal,
  Platform,
  Linking,
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { ArrowLeft, LinkedinLogo, Plus, UsersThree, X } from 'phosphor-react-native';
import {
  useTeamDirectory,
  useAddTeamDirectoryMember,
  useUpdateTeamDirectoryMember,
  useRemoveTeamDirectoryMember,
  TeamDirectoryMember,
} from '../hooks/useTeamDirectory';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const AVATAR_COLORS = ['#9333EA', '#3B82F6', '#10B981', '#EC4899', '#F59E0B', '#06B6D4', '#EF4444'];
const TAG_COLORS = ['#9333EA', '#3B82F6', '#10B981', '#EC4899', '#F59E0B', '#06B6D4'];

function getInitials(name: string) {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const EMPTY_FORM = {
  name: '',
  role: '',
  email: '',
  phone: '',
  linkedin_url: '',
  bio: '',
  expertise: '',
  is_active: true,
};

export default function TeamDirectoryScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();

  const { data: members = [], isLoading, refetch, isRefetching } = useTeamDirectory();
  const addMember = useAddTeamDirectoryMember();
  const updateMember = useUpdateTeamDirectoryMember();
  const removeMember = useRemoveTeamDirectoryMember();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamDirectoryMember | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: spacing.lg,
      paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingBottom: spacing.md,
      backgroundColor: c.surface,
      gap: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    backBtn: { padding: 4 },
    headerInfo: { flex: 1 },
    title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: c.text },
    subtitle: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 2 },
    listContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 100 },
    card: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      ...subtleShadow,
    },
    cardRow: { flexDirection: 'row' as const, alignItems: 'center' as const },
    avatar: {
      width: 52, height: 52, borderRadius: 26,
      justifyContent: 'center' as const, alignItems: 'center' as const, overflow: 'hidden' as const,
    },
    avatarImage: { width: 52, height: 52, borderRadius: 26 },
    avatarText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: '#fff' },
    cardInfo: { flex: 1, marginLeft: spacing.sm },
    cardName: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: c.text },
    cardRole: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: 1 },
    tagsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4, marginTop: spacing.xs },
    tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.full },
    tagText: { fontSize: 10, fontWeight: fontWeight.medium },
    iconsRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs, marginLeft: spacing.xs },
    iconBtn: { padding: 6, borderRadius: borderRadius.sm },
    statusBadge: {
      paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.full, marginLeft: spacing.xs,
    },
    statusText: { fontSize: 10, fontWeight: fontWeight.semibold },
    fab: {
      position: 'absolute' as const, right: spacing.md, bottom: spacing.lg,
      width: 56, height: 56, borderRadius: 28, backgroundColor: c.primary,
      justifyContent: 'center' as const, alignItems: 'center' as const,
      ...subtleShadow, elevation: 6,
    },
    loadingContainer: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const },
    emptyContainer: { alignItems: 'center' as const, paddingTop: spacing.xxl, paddingHorizontal: spacing.lg },
    emptyText: { fontSize: fontSize.md, color: c.textSecondary, fontWeight: fontWeight.medium, marginTop: spacing.md },
    emptySubtext: { fontSize: fontSize.sm, color: c.textTertiary, marginTop: spacing.xs, textAlign: 'center' as const },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' as const },
    modalContent: { backgroundColor: c.surface, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, maxHeight: '90%' as any },
    modalHeader: {
      flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: c.text },
    modalBody: { padding: spacing.md, gap: spacing.sm },
    inputLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: c.text, marginBottom: 4 },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md, paddingVertical: Platform.OS === 'ios' ? 12 : 10,
      fontSize: fontSize.md, color: c.text, backgroundColor: c.background,
    },
    textArea: {
      borderWidth: 1, borderColor: c.border, borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md, paddingVertical: Platform.OS === 'ios' ? 12 : 10,
      fontSize: fontSize.md, color: c.text, backgroundColor: c.background,
      minHeight: 80, textAlignVertical: 'top' as const,
    },
    toggleRow: {
      flexDirection: 'row' as const, alignItems: 'center' as const,
      justifyContent: 'space-between' as const, paddingVertical: spacing.xs,
    },
    modalSubmitBtn: {
      backgroundColor: c.primary, borderRadius: borderRadius.md,
      paddingVertical: 14, alignItems: 'center' as const, marginTop: spacing.sm,
    },
    modalSubmitText: { color: c.textOnPrimary, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  }));

  const openAddModal = () => {
    setEditingMember(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEditModal = (member: TeamDirectoryMember) => {
    setEditingMember(member);
    setForm({
      name: member.name,
      role: member.role || '',
      email: member.email || '',
      phone: member.phone || '',
      linkedin_url: member.linkedin_url || '',
      bio: member.bio || '',
      expertise: (member.expertise || []).join(', '),
      is_active: member.is_active,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) { Alert.alert('Verplicht', 'Voer een naam in.'); return; }

    const expertiseArr = form.expertise.split(',').map((s) => s.trim()).filter(Boolean);
    const payload: Partial<TeamDirectoryMember> = {
      name: trimmedName, role: form.role.trim(),
      email: form.email.trim() || null, phone: form.phone.trim() || null,
      linkedin_url: form.linkedin_url.trim() || null,
      bio: form.bio.trim(), expertise: expertiseArr, is_active: form.is_active,
    };

    try {
      if (editingMember) {
        await updateMember.mutateAsync({ id: editingMember.id, ...payload });
      } else {
        await addMember.mutateAsync(payload);
      }
      setModalVisible(false);
      setForm(EMPTY_FORM);
      setEditingMember(null);
    } catch (error: any) {
      Alert.alert('Fout', error?.message || 'Er ging iets mis.');
    }
  };

  const handleDelete = (member: TeamDirectoryMember) => {
    Alert.alert('Lid verwijderen', `${member.name} verwijderen uit de teamdirectory?`, [
      { text: 'Annuleren', style: 'cancel' },
      { text: 'Verwijderen', style: 'destructive', onPress: () => removeMember.mutate(member.id) },
    ]);
  };

  const openLinkedIn = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert('Fout', 'Kan LinkedIn-profiel niet openen.'));
  };

  const renderMember = ({ item }: { item: TeamDirectoryMember }) => {
    const avatarBg = getAvatarColor(item.name);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => openEditModal(item)}
        onLongPress={() => handleDelete(item)}
      >
        <View style={styles.cardRow}>
          {item.photo_url ? (
            <Image source={{ uri: item.photo_url }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
              <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
            </View>
          )}

          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
            {!!item.role && <Text style={styles.cardRole} numberOfLines={1}>{item.role}</Text>}

            {item.expertise && item.expertise.length > 0 && (
              <View style={styles.tagsRow}>
                {item.expertise.slice(0, 3).map((tag, idx) => {
                  const tagColor = TAG_COLORS[idx % TAG_COLORS.length];
                  return (
                    <View key={tag} style={[styles.tag, { backgroundColor: tagColor + '18' }]}>
                      <Text style={[styles.tagText, { color: tagColor }]}>{tag}</Text>
                    </View>
                  );
                })}
                {item.expertise.length > 3 && (
                  <View style={[styles.tag, { backgroundColor: colors.textTertiary + '18' }]}>
                    <Text style={[styles.tagText, { color: colors.textTertiary }]}>
                      +{item.expertise.length - 3}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={styles.iconsRow}>
            {!!item.linkedin_url && (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => openLinkedIn(item.linkedin_url!)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <LinkedinLogo size={20} color="#0A66C2" weight="fill" />
              </TouchableOpacity>
            )}
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: item.is_active ? '#22C55E20' : '#9CA3AF20' },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  { color: item.is_active ? '#22C55E' : '#9CA3AF' },
                ]}
              >
                {item.is_active ? 'Actief' : 'Inactief'}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const isSaving = addMember.isPending || updateMember.isPending;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>Team Directory</Text>
          <Text style={styles.subtitle}>
            {members.length} {members.length === 1 ? 'teamlid' : 'teamleden'}
          </Text>
        </View>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={renderMember}
          contentContainerStyle={styles.listContent}
          refreshing={isRefetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <UsersThree size={64} color={colors.textTertiary} weight="duotone" />
              <Text style={styles.emptyText}>Nog geen teamleden</Text>
              <Text style={styles.emptySubtext}>
                Voeg teamleden toe om contactgegevens, expertise en rollen op een plek te bewaren.
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openAddModal} activeOpacity={0.8}>
        <Plus size={28} color={colors.textOnPrimary} weight="bold" />
      </TouchableOpacity>

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingMember ? 'Lid bewerken' : 'Lid toevoegen'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color={colors.textSecondary} weight="bold" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <View>
                <Text style={styles.inputLabel}>Naam *</Text>
                <TextInput
                  style={styles.input} value={form.name}
                  onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                  placeholder="Volledige naam" placeholderTextColor={colors.textTertiary} autoCapitalize="words"
                />
              </View>
              <View>
                <Text style={styles.inputLabel}>Rol</Text>
                <TextInput
                  style={styles.input} value={form.role}
                  onChangeText={(v) => setForm((f) => ({ ...f, role: v }))}
                  placeholder="bijv. Marketing Lead" placeholderTextColor={colors.textTertiary}
                />
              </View>
              <View>
                <Text style={styles.inputLabel}>E-mail</Text>
                <TextInput
                  style={styles.input} value={form.email}
                  onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                  placeholder="email@voorbeeld.com" placeholderTextColor={colors.textTertiary}
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
                />
              </View>
              <View>
                <Text style={styles.inputLabel}>Telefoon</Text>
                <TextInput
                  style={styles.input} value={form.phone}
                  onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                  placeholder="+31 6 12345678" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad"
                />
              </View>
              <View>
                <Text style={styles.inputLabel}>LinkedIn URL</Text>
                <TextInput
                  style={styles.input} value={form.linkedin_url}
                  onChangeText={(v) => setForm((f) => ({ ...f, linkedin_url: v }))}
                  placeholder="https://linkedin.com/in/..." placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none" autoCorrect={false} keyboardType="url"
                />
              </View>
              <View>
                <Text style={styles.inputLabel}>Bio</Text>
                <TextInput
                  style={styles.textArea} value={form.bio}
                  onChangeText={(v) => setForm((f) => ({ ...f, bio: v }))}
                  placeholder="Korte bio of notities..." placeholderTextColor={colors.textTertiary}
                  multiline numberOfLines={3}
                />
              </View>
              <View>
                <Text style={styles.inputLabel}>Expertise (kommagescheiden)</Text>
                <TextInput
                  style={styles.input} value={form.expertise}
                  onChangeText={(v) => setForm((f) => ({ ...f, expertise: v }))}
                  placeholder="Design, Strategie, Analytics" placeholderTextColor={colors.textTertiary}
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.inputLabel}>Actief</Text>
                <Switch
                  value={form.is_active}
                  onValueChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                  trackColor={{ false: '#9CA3AF', true: '#22C55E80' }}
                  thumbColor={form.is_active ? '#22C55E' : '#f4f3f4'}
                />
              </View>

              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleSubmit} disabled={isSaving}>
                {isSaving ? (
                  <ActivityIndicator color={colors.textOnPrimary} size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>
                    {editingMember ? 'Opslaan' : 'Toevoegen'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
