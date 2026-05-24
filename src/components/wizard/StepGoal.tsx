// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: p.icon> | Ionicons name=<dynamic: selected ? 'checkmark-circle' : 'ellipse-outline'>
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../services/supabase';
import type { PlatformKey } from '../../hooks/useSocialWizard';

import { CaretRight, Sparkle } from 'phosphor-react-native';
const PLATFORMS: Array<{
  key: PlatformKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  status: 'ready' | 'beta' | 'manual' | 'unsupported';
  hint?: string;
}> = [
  { key: 'facebook',  label: 'Facebook',  icon: 'logo-facebook',  color: '#1877F2', status: 'ready' },
  { key: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E4405F', status: 'ready' },
  { key: 'linkedin',  label: 'LinkedIn',  icon: 'logo-linkedin',  color: '#0077B5', status: 'ready' },
  { key: 'tiktok',    label: 'TikTok',    icon: 'musical-notes',  color: '#FE2C55', status: 'beta',   hint: 'Beperkt: 5 video\'s/dag' },
  { key: 'pinterest', label: 'Pinterest', icon: 'logo-pinterest', color: '#E60023', status: 'ready',  hint: 'Sterk voor F&B + product visuals' },
  { key: 'threads',   label: 'Threads',   icon: 'at-circle',      color: '#000000', status: 'ready',  hint: 'Tekst-first kanaal, gekoppeld aan IG' },
  { key: 'snapchat',  label: 'Snapchat',  icon: 'logo-snapchat',  color: '#FFFC00', status: 'manual', hint: 'Manueel delen via Snap-app' },
  { key: 'whatsapp',  label: 'WhatsApp',  icon: 'logo-whatsapp',  color: '#25D366', status: 'manual', hint: 'Status / Channel via WhatsApp deep-link' },
];

type Props = {
  selectedPlatforms: PlatformKey[];
  togglePlatform: (p: PlatformKey) => void;
  fetchRecommendations: (industry: string, audience: string, language?: string) => Promise<{ recommended: PlatformKey[]; reason: string }>;
  goNext: () => void;
};

export default function StepGoal({ selectedPlatforms, togglePlatform, fetchRecommendations, goNext }: Props) {
  const { colors } = useTheme();
  const [aiReason, setAiReason] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Fetch user's company from profiles (used as industry hint).
        // industry + audience columns don't exist on profiles — AI handles
        // missing context gracefully via fallback path.
        const { data: profile } = await supabase
          .from('profiles')
          .select('company, title')
          .maybeSingle();

        const industry = profile?.company ?? '';
        const audience = profile?.title ?? '';
        const result = await fetchRecommendations(industry, audience, 'nl');
        setAiReason(result.reason);
      } catch {
        // ignore
      } finally {
        setAiLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={{ fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm }}>
        Welke kanalen wil je gebruiken?
      </Text>
      <Text style={{ fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.lg }}>
        Selecteer de social media platforms waarnaar AMOS voor jou gaat publiceren.
      </Text>

      {/* AI recommendation banner */}
      {aiLoading ? (
        <View style={{
          backgroundColor: colors.primary + '12',
          padding: spacing.md,
          borderRadius: borderRadius.md,
          marginBottom: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>AMOS analyseert je profiel…</Text>
        </View>
      ) : aiReason ? (
        <View style={{
          backgroundColor: colors.primary + '12',
          padding: spacing.md,
          borderRadius: borderRadius.md,
          marginBottom: spacing.lg,
          flexDirection: 'row',
          gap: spacing.sm,
        }}>
          <Sparkle size={20} color={colors.primary} weight="fill" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, marginBottom: 2 }}>
              AMOS adviseert
            </Text>
            <Text style={{ color: colors.text, fontSize: fontSize.sm }}>{aiReason}</Text>
          </View>
        </View>
      ) : null}

      {/* Platform tiles */}
      <View style={{ gap: spacing.sm }}>
        {PLATFORMS.map((p) => {
          const selected = selectedPlatforms.includes(p.key);
          const disabled = p.status === 'unsupported';

          return (
            <TouchableOpacity
              key={p.key}
              disabled={disabled}
              activeOpacity={0.7}
              onPress={() => togglePlatform(p.key)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: spacing.md,
                borderRadius: borderRadius.md,
                backgroundColor: selected ? p.color + '12' : colors.surface,
                borderWidth: 2,
                borderColor: selected ? p.color : colors.border,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <View style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: p.color + '20',
                alignItems: 'center', justifyContent: 'center',
                marginRight: spacing.md,
              }}>
                <Ionicons name={p.icon} size={22} color={p.color} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                  {p.label}
                </Text>
                {p.hint ? (
                  <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
                    {p.hint}
                  </Text>
                ) : null}
              </View>

              {p.status === 'beta' ? (
                <View style={{ backgroundColor: '#F59E0B' + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginRight: spacing.sm }}>
                  <Text style={{ fontSize: fontSize.xs, color: '#F59E0B', fontWeight: fontWeight.semibold }}>BETA</Text>
                </View>
              ) : null}

              {p.status === 'manual' ? (
                <View style={{ backgroundColor: colors.success + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginRight: spacing.sm }}>
                  <Text style={{ fontSize: fontSize.xs, color: colors.success, fontWeight: fontWeight.semibold }}>MANUEEL</Text>
                </View>
              ) : null}

              {p.status === 'unsupported' ? (
                <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginRight: spacing.sm }}>
                  Niet beschikbaar
                </Text>
              ) : (
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={selected ? p.color : colors.border}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Next button */}
      <TouchableOpacity
        disabled={selectedPlatforms.length === 0}
        onPress={goNext}
        activeOpacity={0.7}
        style={{
          marginTop: spacing.xl,
          backgroundColor: selectedPlatforms.length === 0 ? colors.border : colors.primary,
          padding: spacing.md,
          borderRadius: borderRadius.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
        }}
      >
        <Text style={{
          color: selectedPlatforms.length === 0 ? colors.textTertiary : '#fff',
          fontSize: fontSize.md,
          fontWeight: fontWeight.semibold,
        }}>
          Verder ({selectedPlatforms.length} {selectedPlatforms.length === 1 ? 'kanaal' : 'kanalen'})
        </Text>
        <CaretRight size={18} color={selectedPlatforms.length === 0 ? colors.textTertiary : '#fff'} weight="bold" />
      </TouchableOpacity>
    </ScrollView>
  );
}
