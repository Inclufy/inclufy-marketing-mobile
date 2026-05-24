// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: trend >= 0 ? 'trending-up' : 'trending-down'>
// src/screens/AnalyticsScreen.tsx
// Analytics & Reports — marketing performance overview

import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, SafeAreaView, Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { useContentProposals, useProposalStats } from '../hooks/useContentProposals';
import { useCampaigns } from '../hooks/useCampaigns';
import { useEvents } from '../hooks/useEvents';
import { useAutomations, useAutomationStats } from '../hooks/useAutomations';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';

import { CaretLeft } from 'phosphor-react-native';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  iconLib?: 'ion' | 'mci';
  color: string;
  trend?: number;
  bg: string;
}

function StatCard({ label, value, icon, iconLib = 'mci', color, trend, bg }: StatCardProps) {
  const { colors } = useTheme();
  const Icon = iconLib === 'ion' ? Ionicons : MaterialCommunityIcons;
  return (
    <View style={{
      flex: 1, backgroundColor: bg, borderRadius: borderRadius.lg,
      padding: spacing.md, minWidth: (SCREEN_WIDTH - spacing.md * 3) / 2,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <Icon name={icon as any} size={22} color={color} />
        {trend !== undefined && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name={trend >= 0 ? 'trending-up' : 'trending-down'} size={14} color={trend >= 0 ? '#10B981' : '#EF4444'} />
            <Text style={{ fontSize: 11, color: trend >= 0 ? '#10B981' : '#EF4444', marginLeft: 2 }}>{Math.abs(trend)}%</Text>
          </View>
        )}
      </View>
      <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold as any, color: colors.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function BarItem({ label, value, maxValue, color }: { label: string; value: number; maxValue: number; color: string }) {
  const { colors } = useTheme();
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
      <Text style={{ width: 80, fontSize: 12, color: colors.textSecondary }}>{label}</Text>
      <View style={{ flex: 1, height: 20, backgroundColor: colors.border, borderRadius: 10, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 10 }} />
      </View>
      <Text style={{ width: 35, textAlign: 'right', fontSize: 12, fontWeight: fontWeight.medium as any, color: colors.text }}>{value}</Text>
    </View>
  );
}

export default function AnalyticsScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(() => ({ container: { flex: 1 } as const }));

  const { data: proposals } = useContentProposals();
  const { data: proposalStats } = useProposalStats();
  const { data: campaigns } = useCampaigns();
  const { data: events } = useEvents();
  const { data: autoStats } = useAutomationStats();

  // Derived stats
  const campaignStats = useMemo(() => {
    const c = campaigns || [];
    return {
      total: c.length,
      active: c.filter(x => x.status === 'active').length,
      totalBudget: c.reduce((s, x) => s + (x.budget_amount || 0), 0),
      totalSpent: c.reduce((s, x) => s + (x.spent_amount || 0), 0),
    };
  }, [campaigns]);

  const eventStats = useMemo(() => {
    const e = events || [];
    return {
      total: e.length,
      upcoming: e.filter(x => x.status === 'upcoming').length,
      active: e.filter(x => x.status === 'active').length,
      completed: e.filter(x => x.status === 'completed').length,
    };
  }, [events]);

  // Content by channel
  const channelBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    (proposals || []).forEach(p => { counts[p.channel] = (counts[p.channel] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [proposals]);

  const maxChannelCount = channelBreakdown.length > 0 ? channelBreakdown[0][1] : 1;

  const CHANNEL_COLORS: Record<string, string> = {
    linkedin: '#0A66C2', instagram: '#E4405F', facebook: '#1877F2',
    tiktok: '#000000', x: '#1DA1F2',
  };

  // Health score
  const healthScore = useMemo(() => {
    let score = 0;
    if ((eventStats.total) > 0) score += 25;
    if ((campaignStats.active) > 0) score += 25;
    if ((proposalStats?.pending ?? 0) + (proposalStats?.approved ?? 0) > 0) score += 25;
    if ((autoStats?.activeCount ?? 0) > 0) score += 25;
    return score;
  }, [eventStats, campaignStats, proposalStats, autoStats]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: spacing.xs }}>
          <CaretLeft size={24} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: fontSize.lg, fontWeight: fontWeight.bold as any, color: colors.text }}>
          Analytics & Rapportage
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {/* Health Score */}
        <View style={{
          borderRadius: borderRadius.xl, padding: spacing.lg,
          backgroundColor: colors.primary, overflow: 'hidden',
        }}>
          <Text style={{ fontSize: fontSize.sm, color: '#FFF', opacity: 0.8 }}>Marketing Health Score</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: spacing.xs }}>
            <Text style={{ fontSize: 48, fontWeight: fontWeight.bold as any, color: '#FFF' }}>{healthScore}%</Text>
            <Text style={{ fontSize: fontSize.sm, color: '#FFF', opacity: 0.7, marginBottom: spacing.sm }}>
              {healthScore === 100 ? 'Optimaal!' : healthScore >= 75 ? 'Bijna volledig' : healthScore >= 50 ? 'Goede start' : 'Begin met setup'}
            </Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: '#FFFFFF30', marginTop: spacing.sm }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: '#FFF', width: `${healthScore}%` }} />
          </View>
        </View>

        {/* Key Metrics Grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <StatCard label="Events" value={eventStats.total} icon="calendar" color="#3B82F6" bg="#3B82F615" />
          <StatCard label="Campagnes" value={campaignStats.total} icon="rocket-launch" color="#8B5CF6" bg="#8B5CF615" />
          <StatCard label="Content" value={proposalStats?.total ?? 0} icon="file-document-outline" color="#F59E0B" bg="#F59E0B15" />
          <StatCard label="Automations" value={autoStats?.activeCount ?? 0} icon="lightning-bolt" color="#10B981" bg="#10B98115" />
        </View>

        {/* Campaign Performance */}
        <View style={{ backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md }}>
          <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold as any, color: colors.text, marginBottom: spacing.md }}>
            Campagne Prestaties
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold as any, color: '#10B981' }}>{campaignStats.active}</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>Actief</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold as any, color: colors.text }}>
                €{(campaignStats.totalBudget / 1000).toFixed(1)}K
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>Budget</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold as any, color: '#F59E0B' }}>
                €{(campaignStats.totalSpent / 1000).toFixed(1)}K
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>Besteed</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold as any, color: colors.primary }}>
                {autoStats?.successRate ?? 0}%
              </Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>Succes</Text>
            </View>
          </View>
        </View>

        {/* Content Pipeline */}
        <View style={{ backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md }}>
          <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold as any, color: colors.text, marginBottom: spacing.md }}>
            Content Pipeline
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.md }}>
            {[
              { label: 'Wachtend', value: proposalStats?.pending ?? 0, color: '#F59E0B' },
              { label: 'Goedgekeurd', value: proposalStats?.approved ?? 0, color: '#10B981' },
              { label: 'Afgewezen', value: proposalStats?.rejected ?? 0, color: '#EF4444' },
              { label: 'Gepubliceerd', value: proposalStats?.published ?? 0, color: '#6366F1' },
            ].map(item => (
              <View key={item.label} style={{ alignItems: 'center' }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: item.color + '20', justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold as any, color: item.color }}>{item.value}</Text>
                </View>
                <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 4 }}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Channel Breakdown */}
        <View style={{ backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md }}>
          <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold as any, color: colors.text, marginBottom: spacing.md }}>
            Content per Kanaal
          </Text>
          {channelBreakdown.length === 0 ? (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.md }}>Nog geen content</Text>
          ) : (
            channelBreakdown.map(([channel, count]) => (
              <BarItem key={channel} label={channel} value={count} maxValue={maxChannelCount} color={CHANNEL_COLORS[channel] || colors.primary} />
            ))
          )}
        </View>

        {/* Event Stats */}
        <View style={{ backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md }}>
          <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold as any, color: colors.text, marginBottom: spacing.md }}>
            Event Overzicht
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {[
              { label: 'Aankomend', value: eventStats.upcoming, color: '#3B82F6' },
              { label: 'Actief', value: eventStats.active, color: '#10B981' },
              { label: 'Voltooid', value: eventStats.completed, color: '#6B7280' },
            ].map(item => (
              <View key={item.label} style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold as any, color: item.color }}>{item.value}</Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}
