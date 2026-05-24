// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: conf.icon as any> | Ionicons name=<dynamic: statusConf.icon as any>
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../i18n';
import { colors as themeColors, fontWeight as fw, spacing, borderRadius, fontSize } from '../theme';
import {
  useEventAttendees,
  useAttendeeStats,
  useAddAttendee,
  useUpdateAttendee,
  useRemoveAttendee,
  type EventAttendee,
  type AttendeeStatus,
  type TicketType,
} from '../hooks/useEventAttendees';
import type { RootStackParamList } from '../types';

import { Checks, Trash, UserPlus, Users } from 'phosphor-react-native';
type Route = RouteProp<RootStackParamList, 'EventAttendees'>;

// ─── Status Config ──────────────────────────────────────────────────
const STATUS_CONFIG: Record<AttendeeStatus, { icon: string; color: string }> = {
  registered: { icon: 'person-add-outline', color: '#60A5FA' },
  confirmed: { icon: 'checkmark-circle-outline', color: '#10D9A0' },
  attended: { icon: 'checkmark-done-outline', color: '#A855F7' },
  cancelled: { icon: 'close-circle-outline', color: '#F87171' },
  no_show: { icon: 'alert-circle-outline', color: '#FBBF24' },
};

const TICKET_TYPES: TicketType[] = ['general', 'vip', 'speaker', 'sponsor', 'staff', 'press'];
const STATUSES: AttendeeStatus[] = ['registered', 'confirmed', 'attended', 'cancelled', 'no_show'];

export default function EventAttendeesScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const att = t.attendees;
  const route = useRoute<Route>();
  const eventId = route.params?.eventId;

  // Data
  const { data: attendees = [], isLoading } = useEventAttendees(eventId);
  const stats = useAttendeeStats(eventId);
  const addMutation = useAddAttendee();
  const updateMutation = useUpdateAttendee();
  const removeMutation = useRemoveAttendee();

  // Filter
  const [filterStatus, setFilterStatus] = useState<AttendeeStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formJobTitle, setFormJobTitle] = useState('');
  const [formTicketType, setFormTicketType] = useState<TicketType>('general');

  // Filtered list
  const filtered = useMemo(() => {
    let list = attendees;
    if (filterStatus !== 'all') {
      list = list.filter(a => a.status === filterStatus);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.company.toLowerCase().includes(q),
      );
    }
    return list;
  }, [attendees, filterStatus, searchQuery]);

  // ─── Handlers ───────────────────────────────────────────────────
  const openAdd = useCallback(() => {
    setFormName('');
    setFormEmail('');
    setFormCompany('');
    setFormPhone('');
    setFormJobTitle('');
    setFormTicketType('general');
    setModalVisible(true);
  }, []);

  const handleAdd = useCallback(async () => {
    if (!formName.trim()) {
      Alert.alert(att.nameRequired);
      return;
    }
    try {
      await addMutation.mutateAsync({
        event_id: eventId,
        name: formName.trim(),
        email: formEmail.trim(),
        company: formCompany.trim(),
        phone: formPhone.trim(),
        job_title: formJobTitle.trim(),
        ticket_type: formTicketType,
        source: 'manual',
      });
      setModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }, [eventId, formName, formEmail, formCompany, formPhone, formJobTitle, formTicketType, att]);

  const handleStatusChange = useCallback((attendee: EventAttendee, newStatus: AttendeeStatus) => {
    updateMutation.mutate({
      id: attendee.id,
      eventId: attendee.event_id,
      status: newStatus,
    });
  }, []);

  const handleDelete = useCallback((attendee: EventAttendee) => {
    Alert.alert(att.removeAttendee, att.removeConfirm, [
      { text: att.cancel, style: 'cancel' },
      {
        text: att.remove,
        style: 'destructive',
        onPress: () => removeMutation.mutate({ id: attendee.id, eventId: attendee.event_id }),
      },
    ]);
  }, [att]);

  // ─── Render Attendee Card ──────────────────────────────────────
  const renderAttendee = ({ item }: { item: EventAttendee }) => {
    const statusConf = STATUS_CONFIG[item.status];
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardInfo}>
            <View style={styles.nameRow}>
              <Text style={[styles.attendeeName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.ticket_type !== 'general' && (
                <View style={[styles.ticketBadge, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={[styles.ticketBadgeText, { color: colors.primary }]}>
                    {item.ticket_type.toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            {item.company ? (
              <Text style={[styles.detail, { color: colors.textSecondary }]}>
                {item.company}{item.job_title ? ` · ${item.job_title}` : ''}
              </Text>
            ) : null}
            {item.email ? (
              <Text style={[styles.detail, { color: colors.textTertiary }]}>{item.email}</Text>
            ) : null}
          </View>

          {/* Status badge */}
          <TouchableOpacity
            style={[styles.statusBadge, { backgroundColor: statusConf.color + '20' }]}
            onPress={() => {
              // Cycle to next status
              const idx = STATUSES.indexOf(item.status);
              const next = STATUSES[(idx + 1) % STATUSES.length];
              handleStatusChange(item, next);
            }}
          >
            <Ionicons name={statusConf.icon as any} size={16} color={statusConf.color} />
            <Text style={[styles.statusText, { color: statusConf.color }]}>
              {att[item.status] || item.status}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick actions */}
        <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
          {item.status !== 'attended' && (
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => handleStatusChange(item, 'attended')}
            >
              <Checks size={16} color={colors.success} weight="bold" />
              <Text style={[styles.quickActionText, { color: colors.success }]}>{att.markAttended}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => handleDelete(item)}
          >
            <Trash size={16} color={colors.error} weight="duotone" />
            <Text style={[styles.quickActionText, { color: colors.error }]}>{att.remove}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── Stats Bar ─────────────────────────────────────────────────
  const StatBox = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <View style={[styles.statBox, { backgroundColor: color + '15' }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Stats row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsRow}>
        <StatBox label={att.total} value={stats.total} color={colors.text} />
        <StatBox label={att.registered} value={stats.registered} color="#60A5FA" />
        <StatBox label={att.confirmed} value={stats.confirmed} color="#10D9A0" />
        <StatBox label={att.attended} value={stats.attended} color="#A855F7" />
        <StatBox label={att.cancelled} value={stats.cancelled} color="#F87171" />
      </ScrollView>

      {/* Search + Filter */}
      <View style={styles.filterRow}>
        <TextInput
          style={[styles.searchInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={att.searchPlaceholder}
          placeholderTextColor={colors.textTertiary}
        />
      </View>

      {/* Status filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        <TouchableOpacity
          style={[
            styles.filterChip,
            { borderColor: colors.border },
            filterStatus === 'all' && { backgroundColor: colors.primary + '15', borderColor: colors.primary },
          ]}
          onPress={() => setFilterStatus('all')}
        >
          <Text style={[styles.filterChipText, filterStatus === 'all' && { color: colors.primary }]}>
            {att.all} ({stats.total})
          </Text>
        </TouchableOpacity>
        {STATUSES.map(s => {
          const conf = STATUS_CONFIG[s];
          const count = attendees.filter(a => a.status === s).length;
          return (
            <TouchableOpacity
              key={s}
              style={[
                styles.filterChip,
                { borderColor: colors.border },
                filterStatus === s && { backgroundColor: conf.color + '15', borderColor: conf.color },
              ]}
              onPress={() => setFilterStatus(s)}
            >
              <Ionicons name={conf.icon as any} size={14} color={filterStatus === s ? conf.color : colors.textTertiary} />
              <Text style={[styles.filterChipText, filterStatus === s && { color: conf.color }]}>
                {att[s] || s} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderAttendee}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Users size={56} color={colors.textTertiary} weight="duotone" />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{att.noAttendees}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB — Add Attendee */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={openAdd}
        activeOpacity={0.85}
      >
        <UserPlus size={24} color="#fff" weight="duotone" />
      </TouchableOpacity>

      {/* ─── Add Attendee Modal ──────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={[styles.modalHeaderBtn, { color: colors.textSecondary }]}>{att.cancel}</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{att.addAttendee}</Text>
            <TouchableOpacity onPress={handleAdd} disabled={addMutation.isPending}>
              {addMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.modalHeaderBtn, { color: colors.primary }]}>{att.save}</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            {/* Name */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{att.name} *</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
              value={formName}
              onChangeText={setFormName}
              placeholder={att.namePlaceholder}
              placeholderTextColor={colors.textTertiary}
            />

            {/* Email */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{att.email}</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
              value={formEmail}
              onChangeText={setFormEmail}
              placeholder={att.emailPlaceholder}
              placeholderTextColor={colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {/* Company */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{att.company}</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
              value={formCompany}
              onChangeText={setFormCompany}
              placeholder={att.companyPlaceholder}
              placeholderTextColor={colors.textTertiary}
            />

            {/* Phone */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{att.phone}</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
              value={formPhone}
              onChangeText={setFormPhone}
              placeholder="+32 ..."
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
            />

            {/* Job Title */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{att.jobTitle}</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
              value={formJobTitle}
              onChangeText={setFormJobTitle}
              placeholder={att.jobTitlePlaceholder}
              placeholderTextColor={colors.textTertiary}
            />

            {/* Ticket Type */}
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{att.ticketType}</Text>
            <View style={styles.ticketRow}>
              {TICKET_TYPES.map(tt => (
                <TouchableOpacity
                  key={tt}
                  style={[
                    styles.ticketChip,
                    { borderColor: colors.border, backgroundColor: colors.surfaceElevated },
                    formTicketType === tt && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
                  ]}
                  onPress={() => setFormTicketType(tt)}
                >
                  <Text
                    style={[
                      styles.ticketChipText,
                      { color: formTicketType === tt ? colors.primary : colors.textSecondary },
                    ]}
                  >
                    {tt.charAt(0).toUpperCase() + tt.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Stats
  statsRow: {
    flexGrow: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statBox: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    marginRight: 8,
    alignItems: 'center',
    minWidth: 70,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: fw.bold as any,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },

  // Filter
  filterRow: {
    paddingHorizontal: spacing.md,
    paddingBottom: 8,
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  chipScroll: {
    flexGrow: 0,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    marginRight: 6,
  },
  filterChipText: {
    fontSize: 12,
    color: themeColors.textSecondary,
  },

  // List
  listContent: {
    padding: spacing.md,
    paddingBottom: 100,
  },

  // Card
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  cardInfo: { flex: 1, marginRight: spacing.sm },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attendeeName: {
    fontSize: 15,
    fontWeight: fw.semibold as any,
  },
  ticketBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ticketBadgeText: {
    fontSize: 9,
    fontWeight: fw.bold as any,
    letterSpacing: 0.5,
  },
  detail: {
    fontSize: 13,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontSize: 11,
    fontWeight: fw.medium as any,
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: fw.medium as any,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalHeaderBtn: { fontSize: 16 },
  modalTitle: {
    fontSize: 17,
    fontWeight: fw.semibold as any,
  },
  modalBody: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: fw.medium as any,
    marginBottom: 6,
    marginTop: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  ticketRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  ticketChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  ticketChipText: {
    fontSize: 13,
    fontWeight: fw.medium as any,
  },
});
