// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: (channelIcons[item.channel] || 'phone-portrait-outline') as any> | Ionicons name=<dynamic: (contentTypeIcons[item.content_type] || 'camera-outline') as any> | Ionicons name=<dynamic: (phaseIcons[item.phase] || 'ellipse-outline') as any>
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from '../hooks/useEvents';
import { useCaptures } from '../hooks/useCaptures';
import { aiService, type StoryArcPost } from '../services/ai.service';
import { useBrandMemory, toBrandContext } from '../hooks/useBrandMemory';
import type { RootStackParamList } from '../types';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { cardShadow } from '../utils/shadows';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import AIConsentModal from '../components/AIConsentModal';
import { useAIConsent } from '../hooks/useAIConsent';

import { ArrowsClockwise, Camera, GitBranch, Lightbulb } from 'phosphor-react-native';
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'StoryArc'>;

// Map phases/channels to Ionicons names
const phaseIcons: Record<string, string> = {
  arrival: 'walk-outline',
  keynote: 'mic-outline',
  networking: 'people-outline',
  demo: 'laptop-outline',
  highlights: 'star-outline',
  wrapup: 'checkmark-circle-outline',
  panel: 'chatbubbles-outline',
  workshop: 'construct-outline',
};

const channelIcons: Record<string, string> = {
  linkedin: 'briefcase-outline',
  instagram: 'camera-outline',
  x: 'logo-twitter',
  facebook: 'logo-facebook',
  tiktok: 'musical-notes-outline',
};

const contentTypeIcons: Record<string, string> = {
  photo: 'camera-outline',
  video: 'videocam-outline',
  audio: 'mic-outline',
  quote: 'chatbox-ellipses-outline',
  reel: 'play-circle-outline',
};

export default function StoryArcScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { eventId } = route.params;
  const { colors } = useTheme();

  const { data: event } = useEvent(eventId);
  const { data: capturesData } = useCaptures(eventId);
  const { data: brandMemory } = useBrandMemory();
  const { hasConsent, showModal: showConsentModal, requestConsent, onAccept: onConsentAccept, onDecline: onConsentDecline } = useAIConsent();

  const [arc, setArc] = useState<StoryArcPost[]>([]);
  const [narrative, setNarrative] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      backgroundColor: c.background,
      gap: spacing.sm,
    },
    loadingText: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.semibold,
      color: c.text,
      marginTop: spacing.md,
    },
    loadingSubtext: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
    },
    header: { marginBottom: spacing.lg },
    headerRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
      marginBottom: 4,
    },
    headerIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: c.primary + '15',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    headerTitle: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    headerEvent: {
      fontSize: fontSize.sm,
      color: c.primary,
      fontWeight: fontWeight.medium,
    },
    narrative: {
      fontSize: fontSize.md,
      color: c.textSecondary,
      marginTop: spacing.sm,
      fontStyle: 'italic' as const,
      lineHeight: 22,
    },
    errorContainer: {
      alignItems: 'center' as const,
      padding: spacing.lg,
      gap: spacing.md,
    },
    errorText: {
      fontSize: fontSize.md,
      color: c.error,
      textAlign: 'center' as const,
    },
    retryBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
    },
    retryText: {
      color: c.textOnPrimary,
      fontWeight: fontWeight.semibold,
    },
    timeline: { gap: 0 },
    timelineItem: {
      flexDirection: 'row' as const,
      gap: spacing.md,
    },
    timelineLine: {
      width: 24,
      alignItems: 'center' as const,
    },
    timelineDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginTop: 16,
    },
    timelineConnector: {
      width: 2,
      flex: 1,
      backgroundColor: c.borderLight,
      marginVertical: 4,
    },
    arcCard: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: c.borderLight,
      ...cardShadow,
    },
    cardHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: spacing.sm,
    },
    cardTime: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: c.primary,
    },
    cardBadges: {
      flexDirection: 'row' as const,
      gap: spacing.xs,
    },
    badgeRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 3,
      backgroundColor: c.borderLight,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: borderRadius.sm,
    },
    badgeText: {
      fontSize: fontSize.xs,
      color: c.textSecondary,
      textTransform: 'capitalize' as const,
    },
    cardBody: {
      gap: 6,
      marginBottom: spacing.sm,
    },
    phaseRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 5,
    },
    cardPhase: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.text,
      textTransform: 'capitalize' as const,
    },
    cardTheme: {
      fontSize: fontSize.md,
      color: c.text,
      fontWeight: fontWeight.medium,
    },
    tipRow: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: 5,
      marginTop: 2,
    },
    cardTip: {
      flex: 1,
      fontSize: fontSize.sm,
      color: c.textSecondary,
      lineHeight: 18,
    },
    templateBox: {
      backgroundColor: c.background,
      borderRadius: borderRadius.sm,
      padding: spacing.sm,
      marginBottom: spacing.sm,
    },
    templateLabel: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.textTertiary,
      marginBottom: 2,
    },
    templateText: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
      fontStyle: 'italic' as const,
    },
    captureBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: c.primary + '40',
      backgroundColor: c.primary + '08',
    },
    captureBtnText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.primary,
    },
    regenerateBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: spacing.sm,
      paddingVertical: spacing.md,
      marginTop: spacing.md,
    },
    regenerateText: {
      fontSize: fontSize.md,
      color: c.primary,
      fontWeight: fontWeight.medium,
    },
  }));

  useEffect(() => {
    if (event && brandMemory) {
      generateArc();
    }
  }, [event, brandMemory]);

  const generateArc = async () => {
    if (!hasConsent) {
      requestConsent(() => { generateArc(); });
      return;
    }
    if (!event) return;

    setLoading(true);
    setError('');

    try {
      if (brandMemory) {
        const bCtx = toBrandContext(brandMemory!);
        if (bCtx) aiService.setBrandContext(bCtx);
      }

      const result = await aiService.generateStoryArc({
        event_name: event.name,
        event_date: event.event_date,
        event_start_time: event.event_start_time || '09:00',
        event_end_time: event.event_end_time || '18:00',
        channels: event.channels || ['linkedin', 'instagram'],
        hashtags: event.hashtags || [],
        goals: event.goals || [],
        captures_so_far: (capturesData as any)?.captures?.length || (capturesData as any)?.length || 0,
      });

      setArc(result.arc || []);
      setNarrative(result.narrative_summary || '');
    } catch (e) {
      setError('Kon Story Arc niet genereren. Probeer opnieuw.');
      console.error('Story arc error:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>AI plant je dag...</Text>
        <Text style={styles.loadingSubtext}>Story Arc wordt gegenereerd</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <GitBranch size={22} color={colors.primary} weight="duotone" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Story Arc</Text>
            <Text style={styles.headerEvent}>{event?.name}</Text>
          </View>
        </View>
        {narrative ? (
          <Text style={styles.narrative}>{narrative}</Text>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={generateArc}>
            <Text style={styles.retryText}>Opnieuw proberen</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Timeline */}
      <View style={styles.timeline}>
        {arc.map((item, index) => (
          <View key={index} style={styles.timelineItem}>
            {/* Timeline line */}
            <View style={styles.timelineLine}>
              <View style={[styles.timelineDot, { backgroundColor: colors.primary }]} />
              {index < arc.length - 1 && <View style={styles.timelineConnector} />}
            </View>

            {/* Card */}
            <View style={styles.arcCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTime}>{item.time}</Text>
                <View style={styles.cardBadges}>
                  <View style={styles.badgeRow}>
                    <Ionicons name={(channelIcons[item.channel] || 'phone-portrait-outline') as any} size={12} color={colors.textSecondary} />
                    <Text style={styles.badgeText}>{item.channel}</Text>
                  </View>
                  <View style={styles.badgeRow}>
                    <Ionicons name={(contentTypeIcons[item.content_type] || 'camera-outline') as any} size={12} color={colors.textSecondary} />
                    <Text style={styles.badgeText}>{item.content_type}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.cardBody}>
                <View style={styles.phaseRow}>
                  <Ionicons name={(phaseIcons[item.phase] || 'ellipse-outline') as any} size={14} color={colors.primary} />
                  <Text style={styles.cardPhase}>{item.phase}</Text>
                </View>
                <Text style={styles.cardTheme}>{item.theme}</Text>
                <View style={styles.tipRow}>
                  <Lightbulb size={13} color={colors.textSecondary} weight="duotone" />
                  <Text style={styles.cardTip}>{item.tip}</Text>
                </View>
              </View>

              {item.caption_template ? (
                <View style={styles.templateBox}>
                  <Text style={styles.templateLabel}>Template:</Text>
                  <Text style={styles.templateText}>{item.caption_template}</Text>
                </View>
              ) : null}

              {/* Action: Navigate to capture */}
              <TouchableOpacity
                style={styles.captureBtn}
                onPress={() => navigation.navigate('LiveCapture', { eventId })}
              >
                <Camera size={15} color={colors.primary} weight="duotone" />
                <Text style={styles.captureBtnText}>Vastleggen</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {/* Regenerate */}
      <TouchableOpacity style={styles.regenerateBtn} onPress={generateArc}>
        <ArrowsClockwise size={16} color={colors.primary} weight="bold" />
        <Text style={styles.regenerateText}>Nieuwe Story Arc genereren</Text>
      </TouchableOpacity>
      <AIConsentModal visible={showConsentModal} onAccept={onConsentAccept} onDecline={onConsentDecline} />
    </ScrollView>
  );
}
