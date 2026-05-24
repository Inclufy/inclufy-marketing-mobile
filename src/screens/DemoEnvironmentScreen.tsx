// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: activeConfig.icon> | Ionicons name=<dynamic: industry.icon>
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow, cardShadow } from '../utils/shadows';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';

import { CheckCircle, Info, RadioButton, Sparkle, Trash } from 'phosphor-react-native';
// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'demo_active_industry_go';

interface IndustryConfig {
  id: string;
  label: string;
  company: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  events: Array<{
    name: string;
    description: string;
    location: string;
    channels: string[];
    hashtags: string[];
    goals: string[];
  }>;
}

const INDUSTRIES: IndustryConfig[] = [
  {
    id: 'healthcare',
    label: 'Healthcare',
    company: 'MedFlow Solutions',
    color: '#0EA5E9',
    icon: 'heart-outline',
    events: [
      {
        name: 'MedFlow Zorgcongres 2026',
        description: 'Jaarlijks zorgcongres voor zorgprofessionals en innovators.',
        location: 'Amsterdam RAI',
        channels: ['linkedin', 'instagram'],
        hashtags: ['MedFlow', 'Zorgcongres', 'HealthTech', 'Innovatie'],
        goals: ['brand_awareness', 'lead_generation'],
      },
      {
        name: 'Digital Health Summit',
        description: 'Top-event over digitalisering in de zorg.',
        location: 'Utrecht',
        channels: ['linkedin', 'x'],
        hashtags: ['DigitalHealth', 'MedFlowSolutions', 'eHealth'],
        goals: ['thought_leadership'],
      },
    ],
  },
  {
    id: 'construction',
    label: 'Construction',
    company: 'BuildRight Group',
    color: '#F59E0B',
    icon: 'construct-outline',
    events: [
      {
        name: 'BuildRight Projectlancering — Sloterdijk',
        description: 'Officiële lancering van ons grootste bouwproject van 2026.',
        location: 'Amsterdam Sloterdijk',
        channels: ['linkedin', 'instagram'],
        hashtags: ['BuildRight', 'Bouw', 'Vastgoed', 'Sloterdijk'],
        goals: ['brand_awareness', 'community'],
      },
      {
        name: 'Duurzaam Bouwen Beurs',
        description: 'Vakbeurs voor duurzame bouw en circulaire architectuur.',
        location: 'Jaarbeurs Utrecht',
        channels: ['linkedin', 'facebook'],
        hashtags: ['DuurzaamBouwen', 'BuildRight', 'CirculaireEconomie'],
        goals: ['lead_generation'],
      },
    ],
  },
  {
    id: 'it',
    label: 'IT / SaaS',
    company: 'CloudNexus Technologies',
    color: '#8B5CF6',
    icon: 'cloud-outline',
    events: [
      {
        name: 'CloudNexus Developer Conference',
        description: 'Jaarlijkse conferentie voor developers en tech-leaders.',
        location: 'TQ Amsterdam',
        channels: ['linkedin', 'x', 'instagram'],
        hashtags: ['CloudNexus', 'DevConf', 'SaaS', 'CloudFirst'],
        goals: ['thought_leadership', 'lead_generation'],
      },
      {
        name: 'Product Launch: Nexus AI 3.0',
        description: 'Lancering van onze nieuwe AI-platform versie.',
        location: 'Online + Live',
        channels: ['linkedin', 'x'],
        hashtags: ['NexusAI', 'ProductLaunch', 'CloudNexus', 'AI'],
        goals: ['brand_awareness', 'sales'],
      },
    ],
  },
  {
    id: 'real-estate',
    label: 'Real Estate',
    company: 'Prestige Properties',
    color: '#10B981',
    icon: 'business-outline',
    events: [
      {
        name: 'Prestige Open Huis — Jordaan',
        description: 'Exclusieve open huis dag in ons nieuwste object.',
        location: 'Jordaan, Amsterdam',
        channels: ['instagram', 'facebook'],
        hashtags: ['PrestigeProperties', 'OpenHuis', 'Jordaan', 'Luxe'],
        goals: ['lead_generation', 'brand_awareness'],
      },
      {
        name: 'Investeerders Avond Q2 2026',
        description: 'Netwerkevent voor vastgoedinvesteerders en makelaars.',
        location: 'Amsterdam Zuid',
        channels: ['linkedin'],
        hashtags: ['Vastgoed', 'Investeren', 'PrestigeProperties'],
        goals: ['networking', 'lead_generation'],
      },
    ],
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing',
    company: 'Apex Industries',
    color: '#EF4444',
    icon: 'cog-outline',
    events: [
      {
        name: 'Apex Productielijn Opening',
        description: 'Officiële opening van de nieuwe geautomatiseerde productielijn.',
        location: 'Apex Fabriek, Eindhoven',
        channels: ['linkedin', 'instagram'],
        hashtags: ['ApexIndustries', 'Manufacturing', 'Automatisering', 'Industrie40'],
        goals: ['brand_awareness', 'recruitment'],
      },
      {
        name: 'Industry 4.0 Expo',
        description: 'Toonaangevende beurs voor slimme productietechnologie.',
        location: 'Eindhoven',
        channels: ['linkedin', 'x'],
        hashtags: ['Industrie40', 'SmartFactory', 'ApexIndustries'],
        goals: ['thought_leadership', 'lead_generation'],
      },
    ],
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function DemoEnvironmentScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [activeIndustry, setActiveIndustry] = useState<string | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<'seed' | 'reset' | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      backgroundColor: c.surface,
      paddingTop: 60,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text },
    headerSubtitle: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: spacing.xs },
    scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
    sectionLabel: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.textSecondary,
      letterSpacing: 0.8,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
    },
    statusCard: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      borderLeftWidth: 4,
      borderLeftColor: c.textTertiary,
      ...cardShadow,
    },
    statusRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md },
    statusDot: { width: 10, height: 10, borderRadius: borderRadius.full },
    statusContent: { flex: 1 },
    statusLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: c.text },
    statusValue: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: 2 },
    statusHint: { fontSize: fontSize.sm, color: c.textTertiary, marginTop: 2 },
    statusIconWrap: {
      width: 40, height: 40, borderRadius: borderRadius.md,
      justifyContent: 'center' as const, alignItems: 'center' as const,
    },
    loadingCard: {
      backgroundColor: c.primary + '08',
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.md,
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: c.primary + '20',
    },
    loadingText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: c.primary, flex: 1 },
    industryCard: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      marginBottom: spacing.sm,
      overflow: 'hidden' as const,
      borderWidth: 1,
      borderColor: c.border,
      ...subtleShadow,
    },
    industryCardActive: { borderColor: colors.success, borderWidth: 2 },
    industryRow: {
      flexDirection: 'row' as const, alignItems: 'center' as const,
      padding: spacing.md, gap: spacing.md,
    },
    industryIconWrap: {
      width: 48, height: 48, borderRadius: borderRadius.md,
      justifyContent: 'center' as const, alignItems: 'center' as const,
    },
    industryContent: { flex: 1 },
    industryCompany: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: c.text },
    industryLabel: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: 2 },
    industryBadges: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs,
    },
    activeBadge: {
      flexDirection: 'row' as const, alignItems: 'center' as const,
      paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
      borderRadius: borderRadius.full, gap: 4,
    },
    badgeText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
    industryAccent: { height: 3, width: '100%' as const },
    actionsCard: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      gap: spacing.sm,
      ...subtleShadow,
    },
    actionButton: {
      flexDirection: 'row' as const, alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: 14, paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.md, gap: spacing.sm,
    },
    actionButtonPrimary: { backgroundColor: c.primary },
    actionButtonPrimaryText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: c.textOnPrimary },
    actionButtonDanger: { backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.error },
    actionButtonDangerText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: c.error },
    actionButtonDisabled: { backgroundColor: c.textTertiary, opacity: 0.5 },
    actionButtonDisabledOutline: { opacity: 0.4 },
    infoCard: {
      backgroundColor: c.info + '08',
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      flexDirection: 'row' as const,
      gap: spacing.sm,
      marginTop: spacing.lg,
      borderWidth: 1,
      borderColor: c.info + '20',
    },
    infoText: { fontSize: fontSize.sm, color: c.textSecondary, flex: 1, lineHeight: 20 },
  }));

  // ─── Load persisted state ───────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      try {
        const [storedIndustry, { data }] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          supabase.auth.getUser(),
        ]);
        if (storedIndustry) {
          setActiveIndustry(storedIndustry);
          setSelectedIndustry(storedIndustry);
        }
        if (data?.user?.id) setUserId(data.user.id);
      } catch (err) {
        console.warn('DemoEnvironmentScreen init error', err);
      }
    };
    init();
  }, []);

  // ─── Helpers ────────────────────────────────────────────────────────────

  const getActiveConfig = () => INDUSTRIES.find((i) => i.id === activeIndustry);
  const isProcessing = loading || loadingAction !== null;

  const getFutureDate = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString().split('T')[0];
  };

  // ─── Actions ────────────────────────────────────────────────────────────

  const handleSeedDemo = async () => {
    if (!selectedIndustry) {
      Alert.alert('Selecteer een branche', 'Kies eerst een branche.');
      return;
    }
    if (!userId) {
      Alert.alert('Niet ingelogd', 'Log eerst in.');
      return;
    }
    if (activeIndustry) {
      Alert.alert('Demo al actief', `Er is al een demo actief voor ${getActiveConfig()?.company}.`);
      return;
    }

    setLoading(true);
    setLoadingAction('seed');

    try {
      const config = INDUSTRIES.find((i) => i.id === selectedIndustry)!;

      // Insert demo events directly into go_events
      const rows = config.events.map((ev, idx) => ({
        user_id: userId,
        name: ev.name,
        description: ev.description,
        location: ev.location,
        event_date: getFutureDate(7 + idx * 14),
        channels: ev.channels,
        hashtags: ev.hashtags,
        goals: ev.goals,
        status: 'upcoming',
        settings: { is_demo: true, industry: selectedIndustry },
      }));

      const { error } = await supabase.from('go_events').insert(rows);
      if (error) throw error;

      await AsyncStorage.setItem(STORAGE_KEY, selectedIndustry);
      setActiveIndustry(selectedIndustry);
      qc.invalidateQueries({ queryKey: ['events'] });

      Alert.alert(
        '✅ Demo Gegenereerd',
        `${config.events.length} demo-events aangemaakt voor ${config.company}. Open "Events" om ze te bekijken.`,
      );
    } catch (err: any) {
      Alert.alert('Fout bij genereren', err?.message ?? 'Onbekende fout.');
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  };

  const handleResetDemo = () => {
    if (!activeIndustry) {
      Alert.alert('Geen demo actief', 'Er is geen demo actief.');
      return;
    }

    const config = getActiveConfig();

    Alert.alert(
      'Demo Resetten',
      `Weet je zeker dat je de demo voor ${config?.company ?? activeIndustry} wilt resetten? Demo-events worden verwijderd.`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Resetten',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            setLoadingAction('reset');
            try {
              // Delete demo events (marked with settings->is_demo)
              const { error } = await supabase
                .from('go_events')
                .delete()
                .eq('user_id', userId)
                .contains('settings', { is_demo: true, industry: activeIndustry });

              if (error) throw error;

              await AsyncStorage.removeItem(STORAGE_KEY);
              setActiveIndustry(null);
              setSelectedIndustry(null);
              qc.invalidateQueries({ queryKey: ['events'] });

              Alert.alert('✅ Demo Gereset', 'Demo-events zijn verwijderd.');
            } catch (err: any) {
              Alert.alert('Fout bij resetten', err?.message ?? 'Onbekende fout.');
            } finally {
              setLoading(false);
              setLoadingAction(null);
            }
          },
        },
      ],
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  const activeConfig = getActiveConfig();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Demo Omgeving</Text>
        <Text style={styles.headerSubtitle}>Genereer realistische demo-events voor je branche</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Status Card ────────────────────────────────────────────── */}
        <View style={[styles.statusCard, activeConfig && { borderLeftColor: activeConfig.color }]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: activeConfig ? colors.success : colors.textTertiary }]} />
            <View style={styles.statusContent}>
              <Text style={styles.statusLabel}>{activeConfig ? 'Demo Actief' : 'Geen demo actief'}</Text>
              {activeConfig ? (
                <Text style={styles.statusValue}>{activeConfig.company} — {activeConfig.events.length} events</Text>
              ) : (
                <Text style={styles.statusHint}>Selecteer een branche hieronder</Text>
              )}
            </View>
            {activeConfig && (
              <View style={[styles.statusIconWrap, { backgroundColor: activeConfig.color + '15' }]}>
                <Ionicons name={activeConfig.icon} size={22} color={activeConfig.color} />
              </View>
            )}
          </View>
        </View>

        {/* ── Loading ─────────────────────────────────────────────────── */}
        {isProcessing && (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>
              {loadingAction === 'seed' ? 'Demo-events worden aangemaakt...' :
               loadingAction === 'reset' ? 'Demo wordt gereset...' : 'Bezig...'}
            </Text>
          </View>
        )}

        {/* ── Industry Cards ─────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>KIES EEN BRANCHE</Text>

        {INDUSTRIES.map((industry) => {
          const isActive   = activeIndustry   === industry.id;
          const isSelected = selectedIndustry === industry.id;

          return (
            <TouchableOpacity
              key={industry.id}
              style={[
                styles.industryCard,
                isSelected && { borderColor: industry.color, borderWidth: 2 },
                isActive   && styles.industryCardActive,
              ]}
              activeOpacity={0.7}
              onPress={() => !isProcessing && setSelectedIndustry(industry.id)}
              disabled={isProcessing}
            >
              <View style={styles.industryRow}>
                <View style={[styles.industryIconWrap, { backgroundColor: industry.color + '15' }]}>
                  <Ionicons name={industry.icon} size={26} color={industry.color} />
                </View>
                <View style={styles.industryContent}>
                  <Text style={styles.industryCompany}>{industry.company}</Text>
                  <Text style={styles.industryLabel}>{industry.label} · {industry.events.length} events</Text>
                </View>
                <View style={styles.industryBadges}>
                  {isActive && (
                    <View style={[styles.activeBadge, { backgroundColor: colors.success + '15' }]}>
                      <CheckCircle size={16} color={colors.success} weight="fill" />
                      <Text style={[styles.badgeText, { color: colors.success }]}>Actief</Text>
                    </View>
                  )}
                  {isSelected && !isActive && (
                    <View style={[styles.activeBadge, { backgroundColor: industry.color + '15' }]}>
                      <RadioButton size={14} color={industry.color} weight="fill" />
                    </View>
                  )}
                </View>
              </View>
              <View style={[styles.industryAccent, { backgroundColor: industry.color }]} />
            </TouchableOpacity>
          );
        })}

        {/* ── Action Buttons ──────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>ACTIES</Text>

        <View style={styles.actionsCard}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.actionButtonPrimary,
              (isProcessing || !selectedIndustry || !!activeIndustry) && styles.actionButtonDisabled,
            ]}
            onPress={handleSeedDemo}
            activeOpacity={0.7}
            disabled={isProcessing || !selectedIndustry || !!activeIndustry}
          >
            {loadingAction === 'seed' ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Sparkle size={20} color={colors.textOnPrimary} weight="regular" />
            )}
            <Text style={styles.actionButtonPrimaryText}>Demo Genereren</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.actionButtonDanger,
              (isProcessing || !activeIndustry) && styles.actionButtonDisabledOutline,
            ]}
            onPress={handleResetDemo}
            activeOpacity={0.7}
            disabled={isProcessing || !activeIndustry}
          >
            {loadingAction === 'reset' ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Trash size={20} color={colors.error} weight="duotone" />
            )}
            <Text style={styles.actionButtonDangerText}>Demo Resetten</Text>
          </TouchableOpacity>
        </View>

        {/* ── Info Card ───────────────────────────────────────────────── */}
        <View style={styles.infoCard}>
          <Info size={20} color={colors.info} weight="regular" />
          <Text style={styles.infoText}>
            Genereert realistische demo-events voor de geselecteerde branche, direct in je Events-tab.
            Geen externe services nodig. Je kunt de demo op elk moment resetten.
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}
