// src/screens/ContentCalendarScreen.tsx
// Content Calendar — week/month view of scheduled proposals and campaigns

import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, SafeAreaView, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { useContentProposals } from '../hooks/useContentProposals';
import { useCampaigns } from '../hooks/useCampaigns';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';

import { CaretLeft, CaretRight } from 'phosphor-react-native';
const DAYS_NL = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
const MONTHS_NL = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];

const CHANNEL_COLORS: Record<string, string> = {
  linkedin: '#0A66C2', instagram: '#E4405F', facebook: '#1877F2',
  tiktok: '#000000', x: '#1DA1F2', email: '#10B981',
};

export default function ContentCalendarScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(() => ({ container: { flex: 1 } as const }));
  const { data: proposals } = useContentProposals();
  const { data: campaigns } = useCampaigns();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Build calendar events from proposals + campaigns
  const events = useMemo(() => {
    const items: Array<{ id: string; title: string; date: string; channel?: string; type: 'proposal' | 'campaign'; status: string }> = [];
    (proposals || []).forEach(p => {
      if (p.scheduled_for) {
        items.push({ id: p.id, title: p.title, date: p.scheduled_for, channel: p.channel, type: 'proposal', status: p.status });
      }
    });
    (campaigns || []).forEach(c => {
      if (c.start_date) {
        items.push({ id: c.id, title: c.name, date: c.start_date, type: 'campaign', status: c.status });
      }
    });
    return items;
  }, [proposals, campaigns]);

  // Get days for current view
  const getDaysInMonth = () => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days: Date[] = [];
    // Pad start
    const startDay = first.getDay();
    for (let i = startDay - 1; i >= 0; i--) {
      days.push(new Date(year, month, -i));
    }
    // Month days
    for (let d = 1; d <= last.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  };

  const getWeekDays = () => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay() + 1); // Monday
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const days = viewMode === 'week' ? getWeekDays() : getDaysInMonth();

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return events.filter(e => e.date.startsWith(dateStr));
  };

  const navigatePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };

  const navigateNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: spacing.xs }}>
          <CaretLeft size={24} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: fontSize.lg, fontWeight: fontWeight.bold as any, color: colors.text }}>
          Content Kalender
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Month/Week Toggle + Navigation */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
        <TouchableOpacity onPress={navigatePrev} style={{ padding: spacing.xs }}>
          <CaretLeft size={20} color={colors.textSecondary} weight="bold" />
        </TouchableOpacity>
        <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold as any, color: colors.text }}>
          {MONTHS_NL[month]} {year}
        </Text>
        <TouchableOpacity onPress={navigateNext} style={{ padding: spacing.xs }}>
          <CaretRight size={20} color={colors.textSecondary} weight="bold" />
        </TouchableOpacity>
      </View>

      {/* View Mode Toggle */}
      <View style={{ flexDirection: 'row', marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: borderRadius.lg, backgroundColor: colors.surface, overflow: 'hidden' }}>
        {(['week', 'month'] as const).map(mode => (
          <TouchableOpacity
            key={mode}
            onPress={() => setViewMode(mode)}
            style={{ flex: 1, paddingVertical: spacing.sm, alignItems: 'center', backgroundColor: viewMode === mode ? colors.primary : 'transparent', borderRadius: borderRadius.lg }}
          >
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium as any, color: viewMode === mode ? '#FFF' : colors.textSecondary }}>
              {mode === 'week' ? 'Week' : 'Maand'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Day Headers */}
      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.xs }}>
        {DAYS_NL.map(d => (
          <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: fontWeight.medium as any, color: colors.textSecondary }}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <ScrollView style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.xs }}>
          {days.map((day, i) => {
            const dateStr = day.toISOString().split('T')[0];
            const isToday = dateStr === today;
            const isCurrentMonth = day.getMonth() === month;
            const dayEvents = getEventsForDate(day);

            return (
              <View
                key={i}
                style={{
                  width: viewMode === 'week' ? '14.28%' : '14.28%',
                  minHeight: viewMode === 'week' ? 120 : 80,
                  borderWidth: 0.5, borderColor: colors.border,
                  padding: 3,
                  backgroundColor: isToday ? colors.primary + '10' : 'transparent',
                }}
              >
                <Text style={{
                  fontSize: 12, fontWeight: isToday ? (fontWeight.bold as any) : (fontWeight.normal as any),
                  color: isToday ? colors.primary : isCurrentMonth ? colors.text : colors.textSecondary + '60',
                  textAlign: 'center', marginBottom: 2,
                }}>
                  {day.getDate()}
                </Text>
                {dayEvents.slice(0, viewMode === 'week' ? 5 : 2).map(evt => (
                  <View key={evt.id} style={{
                    backgroundColor: evt.type === 'campaign' ? '#8B5CF6' + '20' : (CHANNEL_COLORS[evt.channel || ''] || colors.primary) + '20',
                    borderLeftWidth: 2,
                    borderLeftColor: evt.type === 'campaign' ? '#8B5CF6' : (CHANNEL_COLORS[evt.channel || ''] || colors.primary),
                    borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1, marginBottom: 1,
                  }}>
                    <Text numberOfLines={1} style={{ fontSize: 9, color: colors.text }}>{evt.title}</Text>
                  </View>
                ))}
                {dayEvents.length > (viewMode === 'week' ? 5 : 2) && (
                  <Text style={{ fontSize: 9, color: colors.textSecondary, textAlign: 'center' }}>+{dayEvents.length - (viewMode === 'week' ? 5 : 2)}</Text>
                )}
              </View>
            );
          })}
        </View>

        {/* Upcoming list */}
        <View style={{ padding: spacing.md }}>
          <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold as any, color: colors.text, marginBottom: spacing.sm }}>
            Aankomend
          </Text>
          {events
            .filter(e => new Date(e.date) >= new Date())
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 10)
            .map(evt => (
              <View key={evt.id} style={{
                flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                padding: spacing.sm, borderRadius: borderRadius.md,
                backgroundColor: colors.surface, marginBottom: spacing.xs,
              }}>
                <View style={{
                  width: 4, height: 36, borderRadius: 2,
                  backgroundColor: evt.type === 'campaign' ? '#8B5CF6' : (CHANNEL_COLORS[evt.channel || ''] || colors.primary),
                }} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium as any, color: colors.text }}>{evt.title}</Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                    {new Date(evt.date).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {evt.channel ? ` · ${evt.channel}` : ''}
                  </Text>
                </View>
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
                  backgroundColor: evt.status === 'published' ? '#10B981' + '20' : evt.status === 'approved' ? '#3B82F6' + '20' : '#F59E0B' + '20',
                }}>
                  <Text style={{ fontSize: 10, color: evt.status === 'published' ? '#10B981' : evt.status === 'approved' ? '#3B82F6' : '#F59E0B' }}>{evt.status}</Text>
                </View>
              </View>
            ))}
          {events.filter(e => new Date(e.date) >= new Date()).length === 0 && (
            <Text style={{ textAlign: 'center', color: colors.textSecondary, paddingVertical: spacing.lg }}>
              Geen aankomende items. Genereer content voorstellen!
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
