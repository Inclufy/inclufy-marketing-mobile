// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: calendarSynced ? 'checkmark-circle' : 'chevron-forward'> | Ionicons name=<dynamic: site.icon as any>
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Share,
  Switch,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, RouteProp } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../i18n';
import { colors as themeColors, fontWeight as fw, spacing, borderRadius, fontSize } from '../theme';
import { useEvent, useUpdateEvent } from '../hooks/useEvents';
import { useAttendeeStats } from '../hooks/useEventAttendees';
import { useCalendarSync } from '../hooks/useCalendarSync';
import type { RootStackParamList, Event } from '../types';

import { ArrowSquareOut, Calendar, MapPin, ShareNetwork, Users } from 'phosphor-react-native';
type Route = RouteProp<RootStackParamList, 'EventShare'>;

// ─── External Event Sites ───────────────────────────────────────────
const EVENT_SITES = [
  {
    key: 'linkedin',
    name: 'LinkedIn Event',
    icon: 'logo-linkedin',
    color: '#0A66C2',
    getUrl: (e: Event) =>
      `https://www.linkedin.com/events/create/?name=${enc(e.name)}&description=${enc(e.description)}&location=${enc(e.location)}`,
  },
  {
    key: 'facebook',
    name: 'Facebook Event',
    icon: 'logo-facebook',
    color: '#1877F2',
    getUrl: (e: Event) =>
      `https://www.facebook.com/events/create/?name=${enc(e.name)}`,
  },
  {
    key: 'eventbrite',
    name: 'Eventbrite',
    icon: 'ticket-outline',
    color: '#F05537',
    getUrl: () => 'https://www.eventbrite.com/create',
  },
  {
    key: 'meetup',
    name: 'Meetup',
    icon: 'people-outline',
    color: '#ED1C40',
    getUrl: () => 'https://www.meetup.com/create/',
  },
];

function enc(s: string) {
  return encodeURIComponent(s || '');
}

export default function EventShareScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const sh = t.eventShare;
  const route = useRoute<Route>();
  const eventId = route.params?.eventId;

  const { data: event } = useEvent(eventId);
  const stats = useAttendeeStats(eventId);
  const updateEvent = useUpdateEvent();
  const calendar = useCalendarSync();

  const [calendarSynced, setCalendarSynced] = useState(false);
  const [calendarEventId, setCalendarEventId] = useState<string | null>(null);

  // Registration link — points to Supabase edge function that serves a registration form
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mpxkugfqzmxydxnlxqoj.supabase.co';
  const registrationUrl = event
    ? `${supabaseUrl}/functions/v1/event-register?id=${event.id}`
    : '';

  // ─── Share event ──────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    if (!event) return;
    try {
      await Share.share({
        title: event.name,
        message: [
          event.name,
          event.description ? `\n${event.description}` : '',
          event.location ? `\n📍 ${event.location}` : '',
          event.event_date ? `\n📅 ${event.event_date}` : '',
          event.hashtags?.length ? `\n${event.hashtags.map(h => `#${h}`).join(' ')}` : '',
          `\n\n${sh.registerHere}: ${registrationUrl}`,
        ].join(''),
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        Alert.alert('Error', err.message);
      }
    }
  }, [event, registrationUrl, sh]);

  // ─── Add to calendar ──────────────────────────────────────────
  const handleCalendarSync = useCallback(async () => {
    if (!event) return;

    if (calendarSynced && calendarEventId) {
      await calendar.removeFromCalendar(calendarEventId);
      setCalendarSynced(false);
      setCalendarEventId(null);
      return;
    }

    const id = await calendar.addToCalendar(event);
    if (id) {
      setCalendarSynced(true);
      setCalendarEventId(id);

      // Schedule reminders: 1 hour and 1 day before
      await calendar.scheduleReminder(event, 60);
      await calendar.scheduleReminder(event, 1440);

      Alert.alert(sh.calendarAdded, sh.calendarAddedMsg);
    }
  }, [event, calendarSynced, calendarEventId, calendar, sh]);

  // ─── Toggle registration ──────────────────────────────────────
  const handleToggleRegistration = useCallback(async (enabled: boolean) => {
    if (!eventId) return;
    try {
      await updateEvent.mutateAsync({
        id: eventId,
        registration_enabled: enabled,
      } as any);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }, [eventId]);

  // ─── Open external site ───────────────────────────────────────
  const handleOpenSite = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Could not open URL');
    }
  }, []);

  if (!event) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Event Summary */}
      <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.eventName, { color: colors.text }]}>{event.name}</Text>
        <View style={styles.metaRow}>
          <Calendar size={14} color={colors.textSecondary} weight="duotone" />
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>{event.event_date}</Text>
        </View>
        {event.location ? (
          <View style={styles.metaRow}>
            <MapPin size={14} color={colors.textSecondary} weight="duotone" />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{event.location}</Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Users size={14} color={colors.textSecondary} weight="duotone" />
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {stats.total} {sh.attendees}
          </Text>
        </View>
      </View>

      {/* ─── Registration QR ───────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{sh.registrationQR}</Text>
        <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>{sh.registrationQRSub}</Text>

        <View style={styles.qrContainer}>
          <View style={styles.qrBox}>
            <QRCode
              value={registrationUrl}
              size={180}
              backgroundColor="#ffffff"
              color="#000000"
            />
          </View>
        </View>

        {/* Enable registration toggle */}
        <View style={styles.toggleRow}>
          <View>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>{sh.enableRegistration}</Text>
            <Text style={[styles.toggleSub, { color: colors.textTertiary }]}>{sh.enableRegistrationSub}</Text>
          </View>
          <Switch
            value={(event as any).registration_enabled || false}
            onValueChange={handleToggleRegistration}
            trackColor={{ false: colors.border, true: colors.primary + '60' }}
            thumbColor={(event as any).registration_enabled ? colors.primary : colors.textTertiary}
          />
        </View>
      </View>

      {/* ─── Calendar & Reminders ─────────────────────────── */}
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{sh.calendarReminders}</Text>

        <TouchableOpacity
          style={[styles.actionRow, { borderColor: colors.border }]}
          onPress={handleCalendarSync}
          disabled={calendar.syncing}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#10D9A0' + '20' }]}>
            <Calendar size={20} color="#10D9A0" weight="duotone" />
          </View>
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, { color: colors.text }]}>
              {calendarSynced ? sh.removeFromCalendar : sh.addToCalendar}
            </Text>
            <Text style={[styles.actionSub, { color: colors.textTertiary }]}>
              {sh.calendarSyncSub}
            </Text>
          </View>
          {calendar.syncing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons
              name={calendarSynced ? 'checkmark-circle' : 'chevron-forward'}
              size={20}
              color={calendarSynced ? '#10D9A0' : colors.textTertiary}
            />
          )}
        </TouchableOpacity>
      </View>

      {/* ─── Share ────────────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{sh.shareEvent}</Text>

        <TouchableOpacity
          style={[styles.shareBtn, { backgroundColor: colors.primary }]}
          onPress={handleShare}
        >
          <ShareNetwork size={20} color="#fff" weight="duotone" />
          <Text style={styles.shareBtnText}>{sh.shareNow}</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Publish to External Sites ────────────────────── */}
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{sh.publishToSites}</Text>
        <Text style={[styles.sectionSub, { color: colors.textSecondary }]}>{sh.publishToSitesSub}</Text>

        {EVENT_SITES.map(site => (
          <TouchableOpacity
            key={site.key}
            style={[styles.actionRow, { borderColor: colors.border }]}
            onPress={() => handleOpenSite(site.getUrl(event))}
          >
            <View style={[styles.actionIcon, { backgroundColor: site.color + '20' }]}>
              <Ionicons name={site.icon as any} size={20} color={site.color} />
            </View>
            <View style={styles.actionText}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>{site.name}</Text>
            </View>
            <ArrowSquareOut size={18} color={colors.textTertiary} weight="duotone" />
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },

  // Summary
  summaryCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  eventName: {
    fontSize: fontSize.lg,
    fontWeight: fw.bold as any,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  metaText: { fontSize: 13 },

  // Section
  section: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fw.semibold as any,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 13,
    marginBottom: spacing.md,
  },

  // QR
  qrContainer: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  qrBox: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: borderRadius.lg,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: fw.medium as any,
  },
  toggleSub: {
    fontSize: 12,
    marginTop: 2,
  },

  // Action rows
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: { flex: 1 },
  actionTitle: {
    fontSize: 14,
    fontWeight: fw.medium as any,
  },
  actionSub: {
    fontSize: 12,
    marginTop: 1,
  },

  // Share button
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    marginTop: 8,
  },
  shareBtnText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: fw.semibold as any,
  },
});
