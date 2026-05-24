// src/screens/IntegrationsScreen.tsx
// Integrations — Connect your tools & platforms
//
// Social integrations (linkedin / instagram / facebook) read live state from
// `social_accounts` via useConnectedChannels and route Connect → SocialMediaWizard.
// Non-social integrations (analytics / email / CRM) are still in-flight on the
// backend; they render as "Coming soon" badges instead of broken Connect buttons.

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { useConnectedChannels } from '../hooks/useConnectedChannels';
import type { Channel } from '../types';

import { CaretLeft, CheckCircle, Info, PuzzlePiece } from 'phosphor-react-native';
// ─── Integration Definitions ────────────────────────────────────────────────

interface IntegrationDef {
  id: string;
  name: string;
  description: string;
  descriptionNl: string;
  icon: string;
  iconLib: 'ion' | 'mci';
  color: string;
  category: 'social' | 'analytics' | 'email' | 'crm';
  /** Channel key in social_accounts (only for social-category items). */
  channelKey?: Channel;
  /** True when backend integration isn't wired yet — UI renders as "Coming soon". */
  comingSoon?: boolean;
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'linkedin',
    name: 'LinkedIn',
    description: 'Professional network — posts, articles & company pages',
    descriptionNl: 'Professioneel netwerk — posts, artikelen & bedrijfspagina\'s',
    icon: 'logo-linkedin',
    iconLib: 'ion',
    color: '#0A66C2',
    category: 'social',
    channelKey: 'linkedin',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Visual content — stories, reels & feed posts',
    descriptionNl: 'Visuele content — stories, reels & feed posts',
    icon: 'logo-instagram',
    iconLib: 'ion',
    color: '#E4405F',
    category: 'social',
    channelKey: 'instagram',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    description: 'Pages, groups & ad campaigns',
    descriptionNl: 'Pagina\'s, groepen & advertentiecampagnes',
    icon: 'logo-facebook',
    iconLib: 'ion',
    color: '#1877F2',
    category: 'social',
    channelKey: 'facebook',
  },
  {
    id: 'google_analytics',
    name: 'Google Analytics',
    description: 'Website traffic, conversions & audience insights',
    descriptionNl: 'Websiteverkeer, conversies & doelgroepinzichten',
    icon: 'google-analytics',
    iconLib: 'mci',
    color: '#E37400',
    category: 'analytics',
    comingSoon: true,
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    description: 'Email campaigns, automations & subscriber lists',
    descriptionNl: 'E-mailcampagnes, automations & abonneelijsten',
    icon: 'email-outline',
    iconLib: 'mci',
    color: '#FFE01B',
    category: 'email',
    comingSoon: true,
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'CRM, contacts, deals & marketing automation',
    descriptionNl: 'CRM, contacten, deals & marketingautomation',
    icon: 'hubspot',
    iconLib: 'mci',
    color: '#FF7A59',
    category: 'crm',
    comingSoon: true,
  },
];

// ─── Category helpers ───────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, { en: string; nl: string }> = {
  social: { en: 'Social Media', nl: 'Social Media' },
  analytics: { en: 'Analytics', nl: 'Analytics' },
  email: { en: 'Email Marketing', nl: 'E-mailmarketing' },
  crm: { en: 'CRM', nl: 'CRM' },
};

export default function IntegrationsScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { t, locale } = useTranslation();
  const isNl = locale === 'nl';

  // Live OAuth status from social_accounts table.
  const { oauthChannels, loading: channelsLoading } = useConnectedChannels();
  const isConnected = (def: IntegrationDef): boolean => {
    if (def.comingSoon) return false;
    if (def.channelKey) return oauthChannels.includes(def.channelKey);
    return false;
  };

  const handleConnect = (def: IntegrationDef) => {
    if (def.comingSoon) return;
    if (def.category === 'social') {
      navigation.navigate('SocialMediaWizard');
    }
  };

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
    statsRow: {
      flexDirection: 'row' as const,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      marginTop: spacing.md,
    },
    statItem: { flex: 1, alignItems: 'center' as const },
    statValue: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: '#fff' },
    statLabel: { fontSize: 9, color: 'rgba(255,255,255,0.65)', marginTop: 2, textAlign: 'center' as const },
    content: { padding: spacing.md, gap: spacing.md },
    categoryLabel: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: c.textSecondary,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
      marginTop: spacing.xs,
    },
    integrationCard: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 14,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    integrationInfo: { flex: 1 },
    integrationName: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    integrationDesc: {
      fontSize: fontSize.xs,
      color: c.textSecondary,
      marginTop: 2,
      lineHeight: 16,
    },
    connectBtn: {
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderWidth: 1.5,
    },
    connectBtnText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
    },
    connectedBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      backgroundColor: '#10B98118',
    },
    connectedText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      color: '#10B981',
    },
    comingSoonBadge: {
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      backgroundColor: c.borderLight,
    },
    comingSoonText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.textSecondary,
    },
    infoCard: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
      marginTop: spacing.xs,
    },
    infoTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    infoDesc: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
      lineHeight: 20,
    },
  }));

  const connectedCount = INTEGRATIONS.filter(i => isConnected(i)).length;
  const availableCount = INTEGRATIONS.filter(i => !i.comingSoon).length - connectedCount;
  const categories = [...new Set(INTEGRATIONS.map(i => i.category))];

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Gradient Header */}
        <LinearGradient
          colors={['#334155', '#475569', '#64748B']}
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
              <PuzzlePiece size={24} color="#fff" weight="duotone" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>
                {isNl ? 'Integraties' : 'Integrations'}
              </Text>
            </View>
          </View>
          <Text style={styles.headerSubtitle}>
            {isNl
              ? 'Verbind je tools & platforms voor naadloze marketing'
              : 'Connect your tools & platforms for seamless marketing'}
          </Text>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              {channelsLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.statValue}>{connectedCount}</Text>
              )}
              <Text style={styles.statLabel}>{isNl ? 'Verbonden' : 'Connected'}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{availableCount}</Text>
              <Text style={styles.statLabel}>{isNl ? 'Beschikbaar' : 'Available'}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{INTEGRATIONS.length}</Text>
              <Text style={styles.statLabel}>{isNl ? 'Totaal' : 'Total'}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* Integration Cards by Category */}
          {categories.map((cat) => {
            const catIntegrations = INTEGRATIONS.filter(i => i.category === cat);
            const catLabel = CATEGORY_LABELS[cat];
            return (
              <View key={cat} style={{ gap: spacing.sm }}>
                <Text style={styles.categoryLabel}>
                  {isNl ? catLabel.nl : catLabel.en}
                </Text>
                {catIntegrations.map((integration) => {
                  const Icon = integration.iconLib === 'ion' ? Ionicons : MaterialCommunityIcons;
                  const connected = isConnected(integration);
                  return (
                    <View key={integration.id} style={styles.integrationCard}>
                      <View style={[styles.iconWrap, { backgroundColor: integration.color + '18' }]}>
                        <Icon name={integration.icon as any} size={24} color={integration.color} />
                      </View>
                      <View style={styles.integrationInfo}>
                        <Text style={styles.integrationName}>{integration.name}</Text>
                        <Text style={styles.integrationDesc}>
                          {isNl ? integration.descriptionNl : integration.description}
                        </Text>
                      </View>
                      {integration.comingSoon ? (
                        <View style={styles.comingSoonBadge}>
                          <Text style={styles.comingSoonText}>
                            {isNl ? 'Binnenkort' : 'Coming soon'}
                          </Text>
                        </View>
                      ) : connected ? (
                        <View style={styles.connectedBadge}>
                          <CheckCircle size={14} color="#10B981" weight="fill" />
                          <Text style={styles.connectedText}>
                            {isNl ? 'Verbonden' : 'Connected'}
                          </Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[styles.connectBtn, { borderColor: integration.color + '60' }]}
                          activeOpacity={0.7}
                          onPress={() => handleConnect(integration)}
                        >
                          <Text style={[styles.connectBtnText, { color: integration.color }]}>
                            {isNl ? 'Verbinden' : 'Connect'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}

          {/* Info Card */}
          <View style={styles.infoCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: '#64748B18',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Info size={20} color="#64748B" weight="regular" />
              </View>
              <Text style={styles.infoTitle}>
                {isNl ? 'Meer integraties binnenkort' : 'More integrations coming soon'}
              </Text>
            </View>
            <Text style={styles.infoDesc}>
              {isNl
                ? 'We werken aan integraties met Slack, Zapier, Notion, WordPress en meer. Verbind je favoriete tools voor een compleet marketingplatform.'
                : 'We are working on integrations with Slack, Zapier, Notion, WordPress and more. Connect your favorite tools for a complete marketing platform.'}
            </Text>
          </View>

          <View style={{ height: spacing.xl }} />
        </View>
      </ScrollView>
    </View>
  );
}
