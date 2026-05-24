// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: statusCfg.icon> | Ionicons name=<dynamic: step.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'>
// src/screens/SetupWizardScreen.tsx
// Setup Wizard — Set up your AMOS platform step by step

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform, StatusBar } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';

import { CaretLeft, Check, MagicWand } from 'phosphor-react-native';
// ─── Setup Step Definitions ─────────────────────────────────────────────────

interface SetupStep {
  id: string;
  step: number;
  title: string;
  titleNl: string;
  description: string;
  descriptionNl: string;
  icon: string;
  iconLib: 'ion' | 'mci';
  color: string;
  status: 'completed' | 'current' | 'locked';
  tasks: string[];
  tasksNl: string[];
}

const SETUP_STEPS: SetupStep[] = [
  {
    id: 'profile',
    step: 1,
    title: 'Organisation Profile',
    titleNl: 'Organisatie Profiel',
    description: 'Set up your brand identity, mission statement and target audience for AI-powered marketing.',
    descriptionNl: 'Stel je merkidentiteit, missie en doelgroep in voor AI-gestuurde marketing.',
    icon: 'business-outline',
    iconLib: 'ion',
    color: '#EC4899',
    status: 'current',
    tasks: ['Company name & logo', 'Brand voice & tone', 'Target audience', 'Core values'],
    tasksNl: ['Bedrijfsnaam & logo', 'Merkstem & tone', 'Doelgroep', 'Kernwaarden'],
  },
  {
    id: 'channels',
    step: 2,
    title: 'Connect Channels',
    titleNl: 'Kanalen Verbinden',
    description: 'Link your social media accounts and marketing channels for automated publishing.',
    descriptionNl: 'Koppel je social media-accounts en marketingkanalen voor geautomatiseerd publiceren.',
    icon: 'share-social-outline',
    iconLib: 'ion',
    color: '#3B82F6',
    status: 'locked',
    tasks: ['LinkedIn', 'Instagram', 'Facebook', 'Email platform'],
    tasksNl: ['LinkedIn', 'Instagram', 'Facebook', 'E-mailplatform'],
  },
  {
    id: 'strategy',
    step: 3,
    title: 'Content Strategy',
    titleNl: 'Content Strategie',
    description: 'Define your content pillars, posting frequency and editorial calendar preferences.',
    descriptionNl: 'Definieer je contentpijlers, postfrequentie en redactionele kalendervoorkeuren.',
    icon: 'document-text-outline',
    iconLib: 'ion',
    color: '#10B981',
    status: 'locked',
    tasks: ['Content pillars', 'Posting schedule', 'Content types', 'Approval workflow'],
    tasksNl: ['Contentpijlers', 'Publicatieschema', 'Contenttypes', 'Goedkeuringsworkflow'],
  },
  {
    id: 'team',
    step: 4,
    title: 'Add Team',
    titleNl: 'Team Toevoegen',
    description: 'Invite team members and assign roles for collaborative marketing management.',
    descriptionNl: 'Nodig teamleden uit en wijs rollen toe voor gezamenlijk marketingbeheer.',
    icon: 'people-outline',
    iconLib: 'ion',
    color: '#8B5CF6',
    status: 'locked',
    tasks: ['Invite members', 'Set roles', 'Approval permissions', 'Notifications'],
    tasksNl: ['Leden uitnodigen', 'Rollen instellen', 'Goedkeuringsrechten', 'Notificaties'],
  },
  {
    id: 'campaign',
    step: 5,
    title: 'First Campaign',
    titleNl: 'Eerste Campagne',
    description: 'Launch your first AI-powered marketing campaign and see AMOS in action.',
    descriptionNl: 'Lanceer je eerste AI-gestuurde marketingcampagne en zie AMOS in actie.',
    icon: 'rocket-outline',
    iconLib: 'ion',
    color: '#F59E0B',
    status: 'locked',
    tasks: ['Choose objective', 'Select channels', 'Generate content', 'Review & launch'],
    tasksNl: ['Kies doelstelling', 'Selecteer kanalen', 'Genereer content', 'Bekijk & lanceer'],
  },
];

// ─── Status helpers ─────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  completed: { label: 'Completed', labelNl: 'Voltooid', icon: 'checkmark-circle' as const, color: '#10B981' },
  current: { label: 'In Progress', labelNl: 'Bezig', icon: 'ellipse' as const, color: '#EC4899' },
  locked: { label: 'Locked', labelNl: 'Vergrendeld', icon: 'lock-closed' as const, color: '#6B7280' },
};

export default function SetupWizardScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { t, locale } = useTranslation();
  const isNl = locale === 'nl';

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      paddingTop: Platform.OS === 'ios' ? 52 : (StatusBar.currentHeight || 24) + 12,
      paddingBottom: spacing.lg,
      paddingHorizontal: spacing.md,
    },
    navRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      marginBottom: spacing.md,
    },
    backBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 2,
      padding: 8,
    },
    backLabel: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.medium },
    headerTitle: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      color: '#fff',
    },
    headerSubtitle: {
      fontSize: fontSize.sm,
      color: 'rgba(255,255,255,0.7)',
      marginTop: spacing.xs,
      lineHeight: 20,
    },
    progressSection: {
      marginTop: spacing.md,
    },
    progressLabel: {
      fontSize: fontSize.xs,
      color: 'rgba(255,255,255,0.7)',
      marginBottom: spacing.xs,
    },
    progressBar: {
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    progressFill: {
      height: 6,
      borderRadius: 3,
      backgroundColor: '#fff',
    },
    progressText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: '#fff',
      marginTop: spacing.xs,
    },
    content: { padding: spacing.md, gap: spacing.md },
    sectionTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: c.text,
      marginBottom: spacing.xs,
    },
    stepCard: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    stepLocked: { opacity: 0.5 },
    stepHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    stepNumberCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    stepNumberText: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: '#fff',
    },
    stepTitleRow: {
      flex: 1,
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
    },
    stepTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    stepDesc: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
      lineHeight: 20,
    },
    divider: {
      height: 1,
      backgroundColor: c.border,
      marginVertical: spacing.xs,
    },
    tasksGrid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: spacing.xs,
    },
    taskChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      backgroundColor: c.background,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: c.border,
    },
    taskText: {
      fontSize: 11,
      color: c.textSecondary,
    },
    statusIndicator: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
    },
    statusText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
    },
    actionBtn: {
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginTop: spacing.xs,
    },
    actionBtnText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: '#fff',
    },
    connector: {
      width: 2,
      height: 20,
      backgroundColor: c.border,
      marginLeft: 19,
    },
  }));

  const completedCount = SETUP_STEPS.filter(s => s.status === 'completed').length;
  const progressPct = (completedCount / SETUP_STEPS.length) * 100;

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Gradient Header */}
        <LinearGradient
          colors={['#BE185D', '#EC4899', '#F472B6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          {/* Nav */}
          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <CaretLeft size={20} color="#fff" weight="bold" />
              <Text style={styles.backLabel}>{isNl ? 'Terug' : 'Back'}</Text>
            </TouchableOpacity>
            <View style={{ width: 40 }} />
          </View>

          {/* Title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{
              width: 44, height: 44, borderRadius: 12,
              backgroundColor: 'rgba(255,255,255,0.15)',
              justifyContent: 'center', alignItems: 'center',
            }}>
              <MagicWand size={24} color="#fff" weight="duotone" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>
                {isNl ? 'Installatie Wizard' : 'Setup Wizard'}
              </Text>
            </View>
          </View>
          <Text style={styles.headerSubtitle}>
            {isNl
              ? 'Stel je AMOS platform stap voor stap in'
              : 'Set up your AMOS platform step by step'}
          </Text>

          {/* Progress */}
          <View style={styles.progressSection}>
            <Text style={styles.progressLabel}>
              {isNl
                ? `${completedCount} van ${SETUP_STEPS.length} stappen voltooid`
                : `${completedCount} of ${SETUP_STEPS.length} steps completed`}
            </Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>
            <Text style={styles.progressText}>{Math.round(progressPct)}%</Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* Section Title */}
          <Text style={styles.sectionTitle}>
            {isNl ? 'Installatiestappen' : 'Setup Steps'}
          </Text>

          {/* Step Cards */}
          {SETUP_STEPS.map((step, idx) => {
            const Icon = step.iconLib === 'ion' ? Ionicons : MaterialCommunityIcons;
            const statusCfg = STATUS_CONFIG[step.status];
            const tasks = isNl ? step.tasksNl : step.tasks;
            const isLocked = step.status === 'locked';
            const isCurrent = step.status === 'current';

            return (
              <React.Fragment key={step.id}>
                {/* Connector line between steps */}
                {idx > 0 && <View style={styles.connector} />}

                <View style={[
                  styles.stepCard,
                  isLocked && styles.stepLocked,
                  isCurrent && { borderColor: step.color + '60', borderWidth: 1.5 },
                ]}>
                  {/* Step Header */}
                  <View style={styles.stepHeader}>
                    <View style={[styles.stepNumberCircle, { backgroundColor: step.color }]}>
                      {step.status === 'completed' ? (
                        <Check size={20} color="#fff" weight="bold" />
                      ) : (
                        <Text style={styles.stepNumberText}>{step.step}</Text>
                      )}
                    </View>
                    <View style={styles.stepTitleRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stepTitle}>
                          {isNl ? step.titleNl : step.title}
                        </Text>
                      </View>
                      <View style={styles.statusIndicator}>
                        <Ionicons
                          name={statusCfg.icon}
                          size={14}
                          color={statusCfg.color}
                        />
                        <Text style={[styles.statusText, { color: statusCfg.color }]}>
                          {isNl ? statusCfg.labelNl : statusCfg.label}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Description */}
                  <Text style={styles.stepDesc}>
                    {isNl ? step.descriptionNl : step.description}
                  </Text>

                  {/* Divider */}
                  <View style={styles.divider} />

                  {/* Tasks */}
                  <View style={styles.tasksGrid}>
                    {tasks.map((task, i) => (
                      <View key={i} style={styles.taskChip}>
                        <Ionicons
                          name={step.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'}
                          size={12}
                          color={step.status === 'completed' ? '#10B981' : colors.textSecondary}
                        />
                        <Text style={styles.taskText}>{task}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Action button for current step */}
                  {isCurrent && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: step.color }]}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.actionBtnText}>
                        {isNl ? 'Starten' : 'Start'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </React.Fragment>
            );
          })}

          <View style={{ height: spacing.xl }} />
        </View>
      </ScrollView>
    </View>
  );
}
