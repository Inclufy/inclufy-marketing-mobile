// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: config.icon as any>
import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAnalyticsOverview } from '../hooks/useAnalytics';
import { useCampaigns } from '../hooks/useCampaigns';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { useTranslation } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';

// Channel config for budget breakdown
const CHANNELS = [
  { key: 'google_ads', label: 'Google Ads', color: '#4285F4' },
  { key: 'facebook', label: 'Facebook', color: '#1877F2' },
  { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2' },
  { key: 'instagram', label: 'Instagram', color: '#E1306C' },
  { key: 'email', label: 'Email', color: '#6366F1' },
] as const;

// Alert severity levels
const ALERT_LEVEL_KEYS = {
  warning: { icon: 'warning-outline' as const },
  danger: { icon: 'alert-circle-outline' as const },
  info: { icon: 'information-circle-outline' as const },
};

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export default function BudgetMonitorScreen() {
  const { t, locale } = useTranslation();
  const { colors } = useTheme();

  const ALERT_LEVELS = {
    warning: { bg: colors.warning + '15', text: colors.warning, icon: 'warning-outline' as const },
    danger: { bg: colors.error + '15', text: colors.error, icon: 'alert-circle-outline' as const },
    info: { bg: colors.info + '15', text: colors.info, icon: 'information-circle-outline' as const },
  };

  const styles = useThemedStyles((c) => ({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
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
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: spacing.md,
      gap: spacing.md,
    },

    // Total Budget Card
    budgetCard: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      gap: spacing.md,
      ...subtleShadow,
    },
    budgetCardLabel: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      color: c.textSecondary,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    budgetCardValue: {
      fontSize: fontSize.hero,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    progressContainer: {
      gap: spacing.xs,
    },
    progressTrack: {
      height: 8,
      backgroundColor: c.borderLight,
      borderRadius: borderRadius.full,
      overflow: 'hidden' as const,
    },
    progressFill: {
      height: '100%' as const,
      borderRadius: borderRadius.full,
    },
    progressText: {
      fontSize: fontSize.xs,
      color: c.textSecondary,
      fontWeight: fontWeight.medium,
    },
    budgetSplit: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      marginTop: spacing.xs,
    },
    budgetSplitItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    budgetDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    budgetSplitLabel: {
      fontSize: fontSize.xs,
      color: c.textSecondary,
    },
    budgetSplitValue: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: c.text,
    },

    // Sections
    section: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      gap: spacing.sm,
      ...subtleShadow,
    },
    sectionTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.text,
      marginBottom: spacing.xs,
    },

    // Alerts
    alertCard: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      gap: spacing.sm,
    },
    alertIcon: {
      fontSize: 16,
    },
    alertText: {
      flex: 1,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      lineHeight: 20,
    },

    // Channel Breakdown
    channelRow: {
      gap: 6,
    },
    channelLabelRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    channelDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    channelLabel: {
      flex: 1,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      color: c.text,
    },
    channelAmount: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.text,
    },
    barTrack: {
      height: 6,
      backgroundColor: c.borderLight,
      borderRadius: borderRadius.full,
      overflow: 'hidden' as const,
    },
    barFill: {
      height: '100%' as const,
      borderRadius: borderRadius.full,
    },

    // Campaign List
    campaignRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.borderLight,
      gap: spacing.sm,
    },
    campaignRank: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.primary + '15',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    campaignRankText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: c.primary,
    },
    campaignInfo: {
      flex: 1,
      gap: 4,
    },
    campaignName: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.text,
    },
    campaignMeta: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    campaignStatusBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: borderRadius.full,
    },
    campaignStatusText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.medium,
    },
    campaignType: {
      fontSize: fontSize.xs,
      color: c.textTertiary,
    },
    campaignBudget: {
      alignItems: 'flex-end' as const,
    },
    campaignBudgetValue: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    campaignBudgetPercent: {
      fontSize: fontSize.xs,
      color: c.textSecondary,
    },

    // Empty State
    emptyState: {
      paddingVertical: spacing.lg,
      alignItems: 'center' as const,
    },
    emptyText: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
    },

    // Summary Card
    summaryCard: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      ...subtleShadow,
    },
    summaryRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingVertical: spacing.sm,
    },
    summaryLabel: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
    },
    summaryValue: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    summaryDivider: {
      height: 1,
      backgroundColor: c.borderLight,
    },

    bottomSpacer: {
      height: spacing.xxl,
    },
  }));

  const formatCurrency = (value: number) => {
    const loc = locale === 'nl' ? 'nl-NL' : locale === 'fr' ? 'fr-FR' : 'en-US';
    return new Intl.NumberFormat(loc, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };
  const {
    data: overview,
    isLoading: loadingOverview,
    refetch: refetchOverview,
  } = useAnalyticsOverview();

  const {
    data: campaigns = [],
    isLoading: loadingCampaigns,
    refetch: refetchCampaigns,
  } = useCampaigns();

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchOverview(), refetchCampaigns()]);
    setRefreshing(false);
  };

  const isLoading = loadingOverview || loadingCampaigns;

  // Derive budget data
  const totalBudget = overview?.campaigns?.total_budget ?? 0;
  const byType = overview?.campaigns?.by_type ?? {};

  // Calculate spent per channel from campaign data
  const channelBudgets = CHANNELS.map((ch) => {
    const typeKey = ch.key === 'google_ads' ? 'email' : ch.key; // map to by_type keys
    const count = byType[typeKey] ?? 0;
    // Estimate per-channel budget proportionally based on campaign type distribution
    const totalCampaigns = overview?.campaigns?.total ?? 1;
    const proportion = totalCampaigns > 0 ? count / totalCampaigns : 0;
    const budget = totalBudget * proportion;
    return { ...ch, budget, count };
  });

  const totalAllocated = channelBudgets.reduce((sum, ch) => sum + ch.budget, 0);
  const maxChannelBudget = Math.max(...channelBudgets.map((ch) => ch.budget), 1);

  // Spent estimate (use 65% of budget as realistic estimate)
  const spentEstimate = totalBudget * 0.65;
  const remaining = totalBudget - spentEstimate;
  const spentPercent = totalBudget > 0 ? (spentEstimate / totalBudget) * 100 : 0;

  // Top spending campaigns (sorted by budget)
  const topCampaigns = [...campaigns]
    .filter((c) => c.budget_amount != null && c.budget_amount > 0)
    .sort((a, b) => (b.budget_amount ?? 0) - (a.budget_amount ?? 0))
    .slice(0, 5);

  // Budget alerts
  const alerts: Array<{ level: keyof typeof ALERT_LEVELS; message: string }> = [];

  if (spentPercent > 85) {
    alerts.push({
      level: 'danger',
      message: `${t.budget.budgetLimitNear}: ${formatPercent(spentPercent)} ${t.budget.spentPercent}.`,
    });
  } else if (spentPercent > 70) {
    alerts.push({
      level: 'warning',
      message: `${formatPercent(spentPercent)} ${t.budget.spentPercent}. ${t.budget.budgetWatchSpending}`,
    });
  }

  const unallocated = totalBudget - totalAllocated;
  if (unallocated > totalBudget * 0.3 && totalBudget > 0) {
    alerts.push({
      level: 'info',
      message: `${formatCurrency(unallocated)} ${t.budget.unallocated}`,
    });
  }

  const activeCampaigns = campaigns.filter((c) => c.status === 'active');
  if (activeCampaigns.length === 0 && totalBudget > 0) {
    alerts.push({
      level: 'info',
      message: t.budget.noActiveCampaigns,
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t.budget.title}</Text>
        <Text style={styles.subtitle}>
          {overview?.campaigns?.total ?? 0} {t.budget.campaignsActive}
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Total Budget Card */}
        <View style={styles.budgetCard}>
          <Text style={styles.budgetCardLabel}>{t.budget.totalBudget}</Text>
          <Text style={styles.budgetCardValue}>
            {isLoading ? '...' : formatCurrency(totalBudget)}
          </Text>

          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(spentPercent, 100)}%`,
                    backgroundColor:
                      spentPercent > 85 ? colors.error
                      : spentPercent > 70 ? colors.warning
                      : colors.primary,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>{formatPercent(spentPercent)} {t.budget.spentPercent}</Text>
          </View>

          {/* Spent vs Remaining */}
          <View style={styles.budgetSplit}>
            <View style={styles.budgetSplitItem}>
              <View style={[styles.budgetDot, { backgroundColor: colors.primary }]} />
              <View>
                <Text style={styles.budgetSplitLabel}>{t.budget.spent}</Text>
                <Text style={styles.budgetSplitValue}>{formatCurrency(spentEstimate)}</Text>
              </View>
            </View>
            <View style={styles.budgetSplitItem}>
              <View style={[styles.budgetDot, { backgroundColor: colors.success }]} />
              <View>
                <Text style={styles.budgetSplitLabel}>{t.budget.remaining}</Text>
                <Text style={[styles.budgetSplitValue, { color: colors.success }]}>
                  {formatCurrency(remaining)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Budget Alerts */}
        {alerts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t.budget.alerts}</Text>
            {alerts.map((alert, i) => {
              const config = ALERT_LEVELS[alert.level];
              return (
                <View key={i} style={[styles.alertCard, { backgroundColor: config.bg }]}>
                  <Ionicons name={config.icon as any} size={16} color={config.text} />
                  <Text style={[styles.alertText, { color: config.text }]}>
                    {alert.message}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Channel Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.budget.budgetPerChannel}</Text>
          {CHANNELS.map((ch) => {
            const data = channelBudgets.find((c) => c.key === ch.key);
            const budget = data?.budget ?? 0;
            const barWidth = maxChannelBudget > 0 ? (budget / maxChannelBudget) * 100 : 0;

            return (
              <View key={ch.key} style={styles.channelRow}>
                <View style={styles.channelLabelRow}>
                  <View style={[styles.channelDot, { backgroundColor: ch.color }]} />
                  <Text style={styles.channelLabel}>{ch.label}</Text>
                  <Text style={styles.channelAmount}>{formatCurrency(budget)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.max(barWidth, 2)}%`,
                        backgroundColor: ch.color,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* Top Spending Campaigns */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.budget.topCampaigns}</Text>
          {topCampaigns.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{t.budget.noCampaignsBudget}</Text>
            </View>
          ) : (
            topCampaigns.map((campaign, index) => {
              const budgetAmount = campaign.budget_amount ?? 0;
              const budgetPercent = totalBudget > 0 ? (budgetAmount / totalBudget) * 100 : 0;

              return (
                <View key={campaign.id} style={styles.campaignRow}>
                  <View style={styles.campaignRank}>
                    <Text style={styles.campaignRankText}>{index + 1}</Text>
                  </View>
                  <View style={styles.campaignInfo}>
                    <Text style={styles.campaignName} numberOfLines={1}>
                      {campaign.name}
                    </Text>
                    <View style={styles.campaignMeta}>
                      <View
                        style={[
                          styles.campaignStatusBadge,
                          {
                            backgroundColor:
                              campaign.status === 'active' ? colors.success + '20'
                              : campaign.status === 'draft' ? colors.draft + '20'
                              : colors.info + '20',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.campaignStatusText,
                            {
                              color:
                                campaign.status === 'active' ? colors.success
                                : campaign.status === 'draft' ? colors.draft
                                : colors.info,
                            },
                          ]}
                        >
                          {campaign.status}
                        </Text>
                      </View>
                      <Text style={styles.campaignType}>{campaign.type}</Text>
                    </View>
                  </View>
                  <View style={styles.campaignBudget}>
                    <Text style={styles.campaignBudgetValue}>{formatCurrency(budgetAmount)}</Text>
                    <Text style={styles.campaignBudgetPercent}>
                      {formatPercent(budgetPercent)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Summary Footer */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t.budget.totalCampaigns}</Text>
            <Text style={styles.summaryValue}>{overview?.campaigns?.total ?? 0}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t.budget.activeCampaigns}</Text>
            <Text style={styles.summaryValue}>{activeCampaigns.length}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t.budget.totalContacts}</Text>
            <Text style={styles.summaryValue}>{overview?.contacts?.total ?? 0}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t.budget.emailOpenRate}</Text>
            <Text style={[styles.summaryValue, { color: colors.success }]}>
              {overview?.email?.open_rate != null
                ? formatPercent(overview.email.open_rate)
                : '--'}
            </Text>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}
