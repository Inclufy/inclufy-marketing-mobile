// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: meta.icon> | Ionicons name=<dynamic: stateIcon as any>
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import type { PlatformKey, ConnectionStatus } from '../../hooks/useSocialWizard';

import { CaretRight } from 'phosphor-react-native';
const PLATFORM_META: Record<PlatformKey, { label: string; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; color: string }> = {
  facebook:  { label: 'Facebook',  icon: 'logo-facebook',  color: '#1877F2' },
  instagram: { label: 'Instagram', icon: 'logo-instagram', color: '#E4405F' },
  linkedin:  { label: 'LinkedIn',  icon: 'logo-linkedin',  color: '#0077B5' },
  tiktok:    { label: 'TikTok',    icon: 'musical-notes',  color: '#FE2C55' },
  pinterest: { label: 'Pinterest', icon: 'logo-pinterest', color: '#E60023' },
  threads:   { label: 'Threads',   icon: 'at-circle',      color: '#000000' },
  snapchat:  { label: 'Snapchat',  icon: 'logo-snapchat',  color: '#FFFC00' },
  whatsapp:  { label: 'WhatsApp',  icon: 'logo-whatsapp',  color: '#25D366' },
};

type SocialAccount = {
  id: string;
  platform: string;
  account_name: string | null;
  account_type: string;
  status: string;
};

type Props = {
  selectedPlatforms: PlatformKey[];
  socialAccounts: SocialAccount[];
  goNext: () => void;
  goBack: () => void;
};

function getPlatformState(p: PlatformKey, accounts: SocialAccount[]): {
  state: 'connected' | 'partial' | 'pending' | 'lmdp_pending' | 'manual';
  message: string;
  details: string;
} {
  const platformAccounts = accounts.filter(a => a.platform === p && a.status === 'active');

  if (p === 'snapchat') {
    return {
      state: 'manual',
      message: 'Manueel delen',
      details: 'Geen API beschikbaar — AMOS opent de Snap-app met je content klaar om te delen',
    };
  }

  if (p === 'whatsapp') {
    return {
      state: 'manual',
      message: 'Manueel delen',
      details: 'WhatsApp Status / Channel via deep-link — AMOS opent WhatsApp met je content gereed',
    };
  }

  if (p === 'facebook') {
    const hasPage = platformAccounts.some(a => a.account_type === 'page');
    if (hasPage) {
      const pageNames = platformAccounts.filter(a => a.account_type === 'page').map(a => a.account_name).filter(Boolean);
      return { state: 'connected', message: 'Verbonden', details: pageNames.join(', ') || 'Page actief' };
    }
    return { state: 'pending', message: 'Niet verbonden', details: 'Facebook Page nodig om te publiceren' };
  }

  if (p === 'instagram') {
    const hasBusiness = platformAccounts.some(a => a.account_type === 'business');
    if (hasBusiness) {
      const handles = platformAccounts.filter(a => a.account_type === 'business').map(a => a.account_name).filter(Boolean);
      return { state: 'connected', message: 'Verbonden', details: handles.join(', ') || 'Business actief' };
    }
    if (platformAccounts.length > 0) {
      return { state: 'partial', message: 'Onvolledig', details: 'Instagram Business of Creator account nodig (niet personal)' };
    }
    return { state: 'pending', message: 'Niet verbonden', details: 'Vereist Business + Facebook Page' };
  }

  if (p === 'linkedin') {
    const hasPersonal = platformAccounts.some(a => a.account_type === 'personal');
    const hasCompany = platformAccounts.some(a => a.account_type === 'company');
    if (hasCompany) {
      return { state: 'connected', message: 'Verbonden', details: 'Persoonlijk + Company Pages' };
    }
    if (hasPersonal) {
      return { state: 'lmdp_pending', message: 'Persoonlijk verbonden', details: 'Company Pages wachten op LinkedIn-goedkeuring (LMDP)' };
    }
    return { state: 'pending', message: 'Niet verbonden', details: 'Persoonlijk profiel kan direct, Company Pages na approval' };
  }

  if (p === 'tiktok') {
    return { state: 'pending', message: 'Niet verbonden', details: 'TikTok publishing in Beta — beperkt tot 5 videos/dag' };
  }

  return { state: 'pending', message: 'Niet beschikbaar', details: 'Geen publieke API beschikbaar' };
}

export default function StepStatus({ selectedPlatforms, socialAccounts, goNext, goBack }: Props) {
  const { colors } = useTheme();

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={{ fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm }}>
        Status van je accounts
      </Text>
      <Text style={{ fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.lg }}>
        Hier zie je welke kanalen al verbonden zijn en wat er nog moet gebeuren.
      </Text>

      <View style={{ gap: spacing.sm }}>
        {selectedPlatforms.map((p) => {
          const meta = PLATFORM_META[p];
          const status = getPlatformState(p, socialAccounts);

          const stateColor =
            status.state === 'connected' ? colors.success :
            status.state === 'manual' ? colors.success :
            status.state === 'lmdp_pending' ? '#F59E0B' :
            status.state === 'partial' ? '#F59E0B' :
            colors.textTertiary;

          const stateIcon =
            status.state === 'connected' ? 'checkmark-circle' :
            status.state === 'manual' ? 'hand-left' :
            status.state === 'lmdp_pending' ? 'time' :
            status.state === 'partial' ? 'warning' :
            'ellipse-outline';

          return (
            <View
              key={p}
              style={{
                padding: spacing.md,
                borderRadius: borderRadius.md,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: meta.color + '20',
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: spacing.md,
                }}>
                  <Ionicons name={meta.icon} size={20} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                    {meta.label}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Ionicons name={stateIcon as any} size={14} color={stateColor} />
                    <Text style={{ fontSize: fontSize.sm, color: stateColor, fontWeight: fontWeight.medium }}>
                      {status.message}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginLeft: 48 }}>
                {status.details}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Navigation */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
        <TouchableOpacity
          onPress={goBack}
          activeOpacity={0.7}
          style={{
            flex: 1,
            padding: spacing.md,
            borderRadius: borderRadius.md,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.medium }}>Terug</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={goNext}
          activeOpacity={0.7}
          style={{
            flex: 2,
            padding: spacing.md,
            borderRadius: borderRadius.md,
            backgroundColor: colors.primary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
          }}
        >
          <Text style={{ color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>Verder met verbinden</Text>
          <CaretRight size={18} color="#fff" weight="bold" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
