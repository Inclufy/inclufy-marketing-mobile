// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: meta.icon>
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import type { PlatformKey } from '../../hooks/useSocialWizard';

import { CaretRight, CheckCircle, Warning } from 'phosphor-react-native';
const PLATFORM_META: Record<string, { label: string; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; color: string }> = {
  facebook:  { label: 'Facebook',  icon: 'logo-facebook',  color: '#1877F2' },
  instagram: { label: 'Instagram', icon: 'logo-instagram', color: '#E4405F' },
  linkedin:  { label: 'LinkedIn',  icon: 'logo-linkedin',  color: '#0077B5' },
  tiktok:    { label: 'TikTok',    icon: 'musical-notes',  color: '#FE2C55' },
};

const ACCOUNT_TYPE_BADGE: Record<string, { label: string; emoji: string }> = {
  page:     { label: 'Pagina',      emoji: '🏢' },
  business: { label: 'Business',    emoji: '💼' },
  personal: { label: 'Persoonlijk', emoji: '👤' },
  company:  { label: 'Bedrijf',     emoji: '🏛️' },
  manual:   { label: 'Handmatig',   emoji: '✏️' },
};

type SocialAccount = {
  id: string;
  platform: string;
  account_name: string | null;
  account_type: string;
  status: string;
  profile_image_url: string | null;
};

type Props = {
  selectedPlatforms: PlatformKey[];
  socialAccounts: SocialAccount[];
  goNext: () => void;
  goBack: () => void;
};

export default function StepVerify({ selectedPlatforms, socialAccounts, goNext, goBack }: Props) {
  const { colors } = useTheme();

  const activeAccounts = socialAccounts.filter(a =>
    a.status === 'active' &&
    selectedPlatforms.includes(a.platform as PlatformKey),
  );

  // Group by platform
  const grouped: Record<string, SocialAccount[]> = {};
  for (const acc of activeAccounts) {
    if (!grouped[acc.platform]) grouped[acc.platform] = [];
    grouped[acc.platform].push(acc);
  }

  // Detect issues per platform
  const issues: Array<{ platform: string; issue: string }> = [];
  for (const p of selectedPlatforms) {
    const accs = grouped[p] ?? [];
    if (p === 'instagram' && !accs.some(a => a.account_type === 'business')) {
      issues.push({
        platform: 'instagram',
        issue: 'Geen Instagram Business gevonden. Controleer of je IG-account omgezet is naar Business én gekoppeld aan een Facebook Page.',
      });
    }
    if (p === 'facebook' && !accs.some(a => a.account_type === 'page')) {
      issues.push({
        platform: 'facebook',
        issue: 'Geen Facebook Page gevonden. Controleer of je admin-rol hebt op minstens één Page.',
      });
    }
  }

  const allGood = issues.length === 0 && activeAccounts.length > 0;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={{ fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm }}>
        {allGood ? 'Alles staat klaar' : 'Verifiëren'}
      </Text>
      <Text style={{ fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.lg }}>
        Hieronder zie je wat AMOS heeft ontdekt na de OAuth-flow.
      </Text>

      {/* Issues banner */}
      {issues.length > 0 ? (
        <View style={{
          backgroundColor: '#F59E0B' + '15',
          padding: spacing.md,
          borderRadius: borderRadius.md,
          marginBottom: spacing.lg,
          borderWidth: 1,
          borderColor: '#F59E0B' + '40',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Warning size={16} color="#F59E0B" weight="fill" />
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: '#F59E0B' }}>
              {issues.length} aandachtspunt{issues.length > 1 ? 'en' : ''}
            </Text>
          </View>
          {issues.map((i, idx) => (
            <Text key={idx} style={{ fontSize: fontSize.sm, color: colors.text, marginTop: 4, lineHeight: 18 }}>
              • {i.issue}
            </Text>
          ))}
        </View>
      ) : null}

      {/* Per-platform accounts */}
      {selectedPlatforms.map((p) => {
        const meta = PLATFORM_META[p];
        if (!meta) return null;
        const accs = grouped[p] ?? [];

        return (
          <View key={p} style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
              <Ionicons name={meta.icon} size={18} color={meta.color} />
              <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                {meta.label}
              </Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary }}>
                ({accs.length} account{accs.length !== 1 ? 's' : ''})
              </Text>
            </View>

            {accs.length === 0 ? (
              <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary, marginLeft: 26, fontStyle: 'italic' }}>
                Geen accounts ontdekt
              </Text>
            ) : (
              <View style={{ gap: 4, marginLeft: 26 }}>
                {accs.map((acc) => {
                  const badge = ACCOUNT_TYPE_BADGE[acc.account_type] ?? { label: acc.account_type, emoji: '•' };
                  return (
                    <View
                      key={acc.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        padding: spacing.sm,
                        backgroundColor: colors.surface,
                        borderRadius: borderRadius.sm,
                      }}
                    >
                      <Text style={{ fontSize: fontSize.md }}>{badge.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium }}>
                          {acc.account_name || 'Onbekend'}
                        </Text>
                        <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                          {badge.label}
                        </Text>
                      </View>
                      <CheckCircle size={18} color={colors.success} weight="fill" />
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}

      {/* Navigation */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
        <TouchableOpacity
          onPress={goBack}
          activeOpacity={0.7}
          style={{ flex: 1, padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
        >
          <Text style={{ color: colors.text, fontSize: fontSize.md }}>Terug</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={goNext}
          activeOpacity={0.7}
          style={{ flex: 2, padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.primary, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}
        >
          <Text style={{ color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>
            {allGood ? 'Volgende: merkstem leren' : 'Toch verder'}
          </Text>
          <CaretRight size={18} color="#fff" weight="bold" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
