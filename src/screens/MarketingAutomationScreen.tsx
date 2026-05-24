// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: opt.icon as any> | MaterialCommunityIcons name=<dynamic: iconName as any> | MaterialCommunityIcons name=<dynamic: opt.icon as any>
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import {
  useAutomations,
  useToggleAutomation,
  useCreateAutomation,
  useDeleteAutomation,
  useSeedAutomations,
  useAutomationLogs,
  useAutomationStats,
  Automation,
  AutomationLog,
} from '../hooks/useAutomations';
import { useMarketingStrategy } from '../hooks/useMarketingStrategy';

import { CaretRight, ChartLineUp, Lightning, Plus, Robot, WarningCircle } from 'phosphor-react-native';
type AutopilotMode = 'manual' | 'assisted' | 'autopilot';

const AUTOPILOT_OPTIONS: Array<{ mode: AutopilotMode; label: string; desc: string; icon: string }> = [
  { mode: 'manual', label: 'Manual', desc: 'Jij beslist alles', icon: 'hand-left-outline' },
  { mode: 'assisted', label: 'Assisted', desc: 'AI stelt voor, jij keurt goed', icon: 'sparkles-outline' },
  { mode: 'autopilot', label: 'Autopilot', desc: 'AI handelt automatisch', icon: 'rocket-outline' },
];

const TRIGGER_TYPE_OPTIONS = [
  { value: 'new_lead', label: 'Nieuwe lead', icon: 'account-plus', color: '#10B981' },
  { value: 'event_reminder', label: 'Event herinnering', icon: 'calendar-clock', color: '#F59E0B' },
  { value: 'engagement_spike', label: 'Engagement piek', icon: 'trending-up', color: '#8B5CF6' },
  { value: 'budget_threshold', label: 'Budget drempel', icon: 'cash-remove', color: '#EF4444' },
  { value: 'campaign_end', label: 'Campagne afgelopen', icon: 'flag-checkered', color: '#06B6D4' },
  { value: 'content_scheduled', label: 'Content gepland', icon: 'clock-check', color: '#3B82F6' },
  { value: 'new_follower', label: 'Nieuwe volger', icon: 'account-heart', color: '#EC4899' },
  { value: 'manual', label: 'Handmatig', icon: 'play-circle', color: '#6B7280' },
];

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Nog niet';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Zojuist';
  if (mins < 60) return `${mins}m geleden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}u geleden`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d geleden`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w geleden`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'success': return '#10B981';
    case 'failed': return '#EF4444';
    case 'running': return '#3B82F6';
    case 'skipped': return '#F59E0B';
    default: return '#6B7280';
  }
}

export default function MarketingAutomationScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation<any>();

  // Data hooks
  const { data: automations, isLoading: loadingAutos, refetch: refetchAutos } = useAutomations();
  const { data: logs, isLoading: loadingLogs, refetch: refetchLogs } = useAutomationLogs();
  const { data: stats } = useAutomationStats();
  const { data: strategy } = useMarketingStrategy();
  const toggleMut = useToggleAutomation();
  const seedMut = useSeedAutomations();
  const createMut = useCreateAutomation();
  const deleteMut = useDeleteAutomation();

  // State
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTrigger, setNewTrigger] = useState('manual');

  // Derive autopilot from strategy or default
  const autopilotFromStrategy = strategy?.autonomy_level ?? 'balanced';
  const autopilotMap: Record<string, AutopilotMode> = {
    conservative: 'manual',
    balanced: 'assisted',
    aggressive: 'autopilot',
  };
  const autopilot = autopilotMap[autopilotFromStrategy] ?? 'assisted';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAutos(), refetchLogs()]);
    setRefreshing(false);
  }, [refetchAutos, refetchLogs]);

  // Seed defaults if no automations exist and user has loaded
  useEffect(() => {
    if (!loadingAutos && automations && automations.length === 0) {
      // Auto-seed default automations
      seedMut.mutate();
    }
  }, [loadingAutos, automations?.length]);

  const handleToggle = (auto: Automation) => {
    toggleMut.mutate({ id: auto.id, is_active: !auto.is_active });
  };

  const handleDelete = (auto: Automation) => {
    Alert.alert(
      'Automatisering verwijderen',
      `Weet je zeker dat je "${auto.name}" wilt verwijderen?`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: () => deleteMut.mutate(auto.id),
        },
      ]
    );
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    const triggerOpt = TRIGGER_TYPE_OPTIONS.find(t => t.value === newTrigger);
    createMut.mutate(
      {
        name: newName.trim(),
        description: newDesc.trim(),
        trigger_type: newTrigger,
        icon: triggerOpt?.icon ?? 'lightning-bolt',
        color: triggerOpt?.color ?? '#3B82F6',
        actions: [],
        autopilot_mode: autopilot,
      },
      {
        onSuccess: () => {
          setShowCreateModal(false);
          setNewName('');
          setNewDesc('');
          setNewTrigger('manual');
        },
      }
    );
  };

  const handleAutopilotChange = (mode: AutopilotMode) => {
    // Navigate to strategy screen to change autonomy level
    Alert.alert(
      'Autopilot Modus',
      'De autopilot modus wordt bepaald door je Marketing Strategie. Wil je je strategie aanpassen?',
      [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Strategie Bewerken', onPress: () => navigation.navigate('MarketingStrategy') },
      ]
    );
  };

  const activeCount = stats?.activeCount ?? 0;
  const totalRuns = stats?.totalRuns ?? 0;
  const timeSaved = stats?.timeSavedHours ?? 0;

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.md },
    loading: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const },
    section: { marginBottom: spacing.lg },
    sectionHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: spacing.sm },
    sectionLabel: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      color: c.textTertiary,
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
      marginBottom: spacing.sm,
    },
    // Strategy link banner
    strategyLink: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: c.border,
      gap: spacing.sm,
    },
    strategyLinkText: { flex: 1, fontSize: fontSize.sm, color: c.text },
    strategyLinkBold: { fontWeight: fontWeight.bold, color: c.primary },
    noStrategy: {
      backgroundColor: '#FEF3C7',
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
      alignItems: 'center' as const,
      gap: spacing.xs,
    },
    noStrategyText: { fontSize: fontSize.sm, color: '#92400E', textAlign: 'center' as const },
    noStrategyBtn: {
      backgroundColor: '#F59E0B',
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      marginTop: spacing.xs,
    },
    noStrategyBtnText: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.sm },
    // Autopilot
    modeRow: { flexDirection: 'row' as const, gap: spacing.xs },
    modeCard: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.sm,
      alignItems: 'center' as const,
      borderWidth: 1.5,
      borderColor: c.border,
      gap: 4,
    },
    modeCardActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    modeLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: c.text },
    modeLabelActive: { color: '#fff' },
    modeDesc: { fontSize: 10, color: c.textTertiary, textAlign: 'center' as const },
    modeDescActive: { color: 'rgba(255,255,255,0.75)' },
    // Stats
    statsRow: {
      flexDirection: 'row' as const,
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    statBox: { flex: 1, alignItems: 'center' as const },
    statNum: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text },
    statLbl: { fontSize: fontSize.xs, color: c.textSecondary, marginTop: 2 },
    statDivider: { width: 1, backgroundColor: c.border, marginHorizontal: spacing.xs },
    // Add button
    addBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      backgroundColor: '#F3E8FF',
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: 12,
    },
    addBtnText: { fontSize: fontSize.xs, color: c.primary, fontWeight: fontWeight.semibold },
    // Automation cards
    autoCard: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.xs,
      borderWidth: 1,
      borderColor: c.border,
    },
    autoCardDisabled: { opacity: 0.55 },
    autoTop: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: spacing.sm },
    autoIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center' as const, alignItems: 'center' as const, flexShrink: 0 },
    autoInfo: { flex: 1 },
    autoName: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: c.text, marginBottom: 2 },
    autoDesc: { fontSize: fontSize.xs, color: c.textSecondary, lineHeight: 16 },
    autoTriggerBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      backgroundColor: c.background,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      marginTop: 6,
      alignSelf: 'flex-start' as const,
    },
    autoTriggerText: { fontSize: 10, color: c.textTertiary, fontWeight: fontWeight.semibold },
    autoMeta: { marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: c.borderLight, flexDirection: 'row' as const, justifyContent: 'space-between' as const },
    autoMetaText: { fontSize: fontSize.xs, color: c.textTertiary },
    autoModeBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    autoModeBadgeText: { fontSize: 9, fontWeight: fontWeight.bold },
    // Log rows
    logRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: spacing.sm, marginBottom: spacing.sm },
    logDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
    logInfo: { flex: 1 },
    logHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
    logName: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: c.text },
    logStatus: { fontSize: 9, fontWeight: fontWeight.bold, textTransform: 'uppercase' as const },
    logMsg: { fontSize: fontSize.sm, color: c.text, lineHeight: 18 },
    logTime: { fontSize: fontSize.xs, color: c.textTertiary, marginTop: 2 },
    // Empty state
    emptyState: { alignItems: 'center' as const, paddingVertical: spacing.xl },
    emptyIcon: { marginBottom: spacing.sm },
    emptyText: { fontSize: fontSize.sm, color: c.textTertiary, textAlign: 'center' as const },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' as const },
    modalContent: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: spacing.lg,
      maxHeight: '80%' as any,
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
    triggerGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.xs, marginTop: spacing.xs },
    triggerChip: {
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
    triggerChipActive: { borderColor: c.primary, backgroundColor: c.primary + '15' },
    triggerChipText: { fontSize: fontSize.xs, color: c.textSecondary },
    triggerChipTextActive: { color: c.primary, fontWeight: fontWeight.bold },
    modalBtnRow: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.lg },
    modalBtn: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      borderRadius: borderRadius.md,
      alignItems: 'center' as const,
    },
    modalBtnPrimary: { backgroundColor: c.primary },
    modalBtnSecondary: { backgroundColor: c.background, borderWidth: 1, borderColor: c.border },
    modalBtnText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  }));

  if (loadingAutos) {
    return (
      <View style={[styles.container, styles.loading]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const autoList = automations ?? [];
  const logList = (logs ?? []).slice(0, 10);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Strategy Link */}
        {strategy ? (
          <TouchableOpacity
            style={styles.strategyLink}
            onPress={() => navigation.navigate('MarketingStrategy')}
          >
            <ChartLineUp size={24} color={colors.primary} weight="duotone" />
            <Text style={styles.strategyLinkText}>
              <Text style={styles.strategyLinkBold}>Strategie actief</Text>
              {' · '}€{strategy.monthly_budget}/mnd · {strategy.posts_per_week} posts/week
            </Text>
            <CaretRight size={18} color={colors.textTertiary} weight="bold" />
          </TouchableOpacity>
        ) : (
          <View style={styles.noStrategy}>
            <WarningCircle size={28} color="#D97706" weight="regular" />
            <Text style={styles.noStrategyText}>
              Stel eerst je Marketing Strategie in zodat AMOS weet wat, wanneer en hoeveel te automatiseren.
            </Text>
            <TouchableOpacity
              style={styles.noStrategyBtn}
              onPress={() => navigation.navigate('MarketingStrategy')}
            >
              <Text style={styles.noStrategyBtnText}>Strategie Instellen</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Autopilot Mode Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>AUTOPILOT MODUS</Text>
          <View style={styles.modeRow}>
            {AUTOPILOT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.mode}
                style={[styles.modeCard, autopilot === opt.mode && styles.modeCardActive]}
                onPress={() => handleAutopilotChange(opt.mode)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={22}
                  color={autopilot === opt.mode ? '#fff' : colors.textSecondary}
                />
                <Text style={[styles.modeLabel, autopilot === opt.mode && styles.modeLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={[styles.modeDesc, autopilot === opt.mode && styles.modeDescActive]}>
                  {opt.desc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Stats row — now from real data */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{activeCount}</Text>
            <Text style={styles.statLbl}>Actief</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{totalRuns}</Text>
            <Text style={styles.statLbl}>Totaal runs</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{timeSaved}u</Text>
            <Text style={styles.statLbl}>Tijd bespaard</Text>
          </View>
        </View>

        {/* Automations List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>AUTOMATISERINGEN</Text>
            <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.addBtn}>
              <Plus size={16} color={colors.primary} weight="bold" />
              <Text style={styles.addBtnText}>Toevoegen</Text>
            </TouchableOpacity>
          </View>

          {autoList.length === 0 ? (
            <View style={styles.emptyState}>
              <Robot size={48} color={colors.textTertiary} style={styles.emptyIcon as any} weight="duotone" />
              <Text style={styles.emptyText}>
                Geen automatiseringen gevonden.{'\n'}Standaard workflows worden aangemaakt...
              </Text>
            </View>
          ) : (
            autoList.map(auto => {
              const triggerOpt = TRIGGER_TYPE_OPTIONS.find(t => t.value === auto.trigger_type);
              const iconName = auto.icon || triggerOpt?.icon || 'lightning-bolt';
              const iconColor = auto.color || triggerOpt?.color || '#3B82F6';
              const bgColor = iconColor + '20';
              const modeColors: Record<string, { bg: string; text: string }> = {
                manual: { bg: '#F3F4F6', text: '#6B7280' },
                assisted: { bg: '#EFF6FF', text: '#3B82F6' },
                autopilot: { bg: '#F0FDF4', text: '#16A34A' },
              };
              const mc = modeColors[auto.autopilot_mode] ?? modeColors.assisted;

              return (
                <TouchableOpacity
                  key={auto.id}
                  style={[styles.autoCard, !auto.is_active && styles.autoCardDisabled]}
                  onLongPress={() => handleDelete(auto)}
                  activeOpacity={0.7}
                >
                  <View style={styles.autoTop}>
                    <View style={[styles.autoIcon, { backgroundColor: bgColor }]}>
                      <MaterialCommunityIcons name={iconName as any} size={18} color={iconColor} />
                    </View>
                    <View style={styles.autoInfo}>
                      <Text style={styles.autoName}>{auto.name}</Text>
                      {auto.description ? (
                        <Text style={styles.autoDesc} numberOfLines={2}>{auto.description}</Text>
                      ) : null}
                      <View style={styles.autoTriggerBadge}>
                        <Lightning size={10} color={colors.textTertiary} weight="fill" />
                        <Text style={styles.autoTriggerText}>
                          {triggerOpt?.label ?? auto.trigger_type}
                        </Text>
                      </View>
                    </View>
                    <Switch
                      value={auto.is_active}
                      onValueChange={() => handleToggle(auto)}
                      trackColor={{ false: colors.border, true: colors.primary + '60' }}
                      thumbColor={auto.is_active ? colors.primary : '#f4f3f4'}
                    />
                  </View>
                  <View style={styles.autoMeta}>
                    <Text style={styles.autoMetaText}>
                      {auto.total_runs} runs · {formatTimeAgo(auto.last_run_at)}
                    </Text>
                    <View style={[styles.autoModeBadge, { backgroundColor: mc.bg }]}>
                      <Text style={[styles.autoModeBadgeText, { color: mc.text }]}>
                        {auto.autopilot_mode.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Activity Log — from real logs */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RECENTE ACTIVITEIT</Text>
          {logList.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nog geen activiteit gelogd.</Text>
            </View>
          ) : (
            logList.map((log) => {
              const statusColor = getStatusColor(log.status);
              const autoName = (log.automation as any)?.name ?? 'Onbekend';
              return (
                <View key={log.id} style={styles.logRow}>
                  <View style={[styles.logDot, { backgroundColor: statusColor }]} />
                  <View style={styles.logInfo}>
                    <View style={styles.logHeader}>
                      <Text style={styles.logName}>{autoName}</Text>
                      <Text style={[styles.logStatus, { color: statusColor }]}>{log.status}</Text>
                    </View>
                    {log.error_message ? (
                      <Text style={[styles.logMsg, { color: '#EF4444' }]} numberOfLines={2}>
                        {log.error_message}
                      </Text>
                    ) : (
                      <Text style={styles.logMsg} numberOfLines={1}>
                        {log.actions_executed?.length ?? 0} acties uitgevoerd
                        {log.duration_ms ? ` · ${log.duration_ms}ms` : ''}
                      </Text>
                    )}
                    <Text style={styles.logTime}>{formatTimeAgo(log.created_at)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Create Automation Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCreateModal(false)}>
          <TouchableOpacity style={styles.modalContent} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.modalTitle}>Nieuwe Automatisering</Text>

            <Text style={styles.inputLabel}>Naam</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="bijv. Welkomstmail nieuwe lead"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={styles.inputLabel}>Beschrijving (optioneel)</Text>
            <TextInput
              style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
              value={newDesc}
              onChangeText={setNewDesc}
              placeholder="Wat doet deze automatisering?"
              placeholderTextColor={colors.textTertiary}
              multiline
            />

            <Text style={styles.inputLabel}>Trigger</Text>
            <View style={styles.triggerGrid}>
              {TRIGGER_TYPE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.triggerChip, newTrigger === opt.value && styles.triggerChipActive]}
                  onPress={() => setNewTrigger(opt.value)}
                >
                  <MaterialCommunityIcons name={opt.icon as any} size={14} color={newTrigger === opt.value ? opt.color : colors.textTertiary} />
                  <Text style={[styles.triggerChipText, newTrigger === opt.value && styles.triggerChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnSecondary]}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Annuleren</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary, !newName.trim() && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={!newName.trim() || createMut.isPending}
              >
                {createMut.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Aanmaken</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
