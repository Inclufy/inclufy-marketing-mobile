import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import type { PlatformKey, BrandVoiceProfile } from '../../hooks/useSocialWizard';

import { CaretRight, ChartBar, CheckCircle, Sparkle } from 'phosphor-react-native';
const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
};

type SocialAccount = {
  id: string;
  platform: string;
  account_name: string | null;
  account_type: string;
  status: string;
};

type Props = {
  socialAccounts: SocialAccount[];
  brandVoiceProfile: BrandVoiceProfile | null;
  analyzeBrandVoice: (socialAccountId: string) => Promise<BrandVoiceProfile | null>;
  goNext: () => void;
  goBack: () => void;
};

export default function StepBrandVoice({ socialAccounts, brandVoiceProfile, analyzeBrandVoice, goNext, goBack }: Props) {
  const { colors } = useTheme();
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Eligible accounts for brand voice analysis
  const eligibleAccounts = socialAccounts.filter(
    a => a.status === 'active' &&
    ((a.platform === 'facebook' && a.account_type === 'page') ||
     (a.platform === 'instagram' && a.account_type === 'business') ||
     (a.platform === 'linkedin' && a.account_type === 'personal')),
  );

  const runAnalysis = async (accountId: string) => {
    setAnalyzing(true);
    setError(null);
    setSelectedAccountId(accountId);
    try {
      const profile = await analyzeBrandVoice(accountId);
      if (!profile) {
        setError('Geen profiel teruggekregen. Probeer een ander account of sla over.');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Analyse mislukt');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
        <Sparkle size={28} color={colors.primary} weight="fill" />
        <Text style={{ fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text }}>
          Leer je merkstem
        </Text>
      </View>
      <Text style={{ fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 22 }}>
        AMOS analyseert je laatste 20 posts om je tone-of-voice, structuur en hashtag-stijl te leren. Daarna klinken AI-gegenereerde posts als jou.
      </Text>

      {/* Profile result */}
      {brandVoiceProfile ? (
        <View
          style={{
            padding: spacing.md,
            borderRadius: borderRadius.md,
            backgroundColor: colors.primary + '10',
            borderWidth: 1,
            borderColor: colors.primary + '40',
            marginBottom: spacing.lg,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
            <CheckCircle size={18} color={colors.success} weight="fill" />
            <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>
              Merkstem-profiel klaar
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            <Row label="Toon" value={brandVoiceProfile.tone} colors={colors} />
            <Row label="Gemiddelde lengte" value={`${brandVoiceProfile.avg_post_length} characters`} colors={colors} />
            <Row label="Structuur" value={brandVoiceProfile.post_structure} colors={colors} />
            <Row label="Emoji-gebruik" value={brandVoiceProfile.emoji_usage} colors={colors} />
            <Row label="Taal" value={brandVoiceProfile.primary_language} colors={colors} />
            <Row label="Posts geanalyseerd" value={String(brandVoiceProfile.posts_analyzed)} colors={colors} />

            {brandVoiceProfile.voice_descriptors?.length > 0 ? (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: 4 }}>Stem-descriptors:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {brandVoiceProfile.voice_descriptors.map((d, i) => (
                    <View key={i} style={{
                      paddingHorizontal: 8, paddingVertical: 2,
                      backgroundColor: colors.primary + '20',
                      borderRadius: 4,
                    }}>
                      <Text style={{ fontSize: fontSize.xs, color: colors.primary }}>{d}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {brandVoiceProfile.common_hashtags?.length > 0 ? (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: 4 }}>Top hashtags:</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {brandVoiceProfile.common_hashtags.map((h, i) => (
                    <Text key={i} style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                      #{h}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Eligible accounts list */}
      {!brandVoiceProfile && (
        <>
          {analyzing ? (
            <View style={{
              padding: spacing.lg,
              backgroundColor: colors.surface,
              borderRadius: borderRadius.md,
              alignItems: 'center',
              marginBottom: spacing.lg,
            }}>
              <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.sm }} />
              <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>
                Analyseren van je posts…
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 }}>
                Dit duurt 10-30 seconden
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>
                Kies een account om te analyseren:
              </Text>
              <View style={{ gap: spacing.sm }}>
                {eligibleAccounts.length === 0 ? (
                  <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary, fontStyle: 'italic', padding: spacing.md, textAlign: 'center' }}>
                    Geen geschikte accounts gevonden. Brand voice analyse werkt voor Facebook Pages, Instagram Business en LinkedIn personal.
                  </Text>
                ) : (
                  eligibleAccounts.map(acc => (
                    <TouchableOpacity
                      key={acc.id}
                      onPress={() => runAnalysis(acc.id)}
                      activeOpacity={0.7}
                      style={{
                        padding: spacing.md,
                        borderRadius: borderRadius.md,
                        backgroundColor: colors.surface,
                        borderWidth: 1,
                        borderColor: colors.border,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.sm,
                      }}
                    >
                      <ChartBar size={20} color={colors.primary} weight="duotone" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                          {acc.account_name || 'Onbekend'}
                        </Text>
                        <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                          {PLATFORM_LABEL[acc.platform]} · {acc.account_type}
                        </Text>
                      </View>
                      <CaretRight size={18} color={colors.textTertiary} weight="bold" />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </>
          )}
        </>
      )}

      {error ? (
        <Text style={{ color: '#EF4444', fontSize: fontSize.sm, marginTop: spacing.sm }}>
          {error}
        </Text>
      ) : null}

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
            {brandVoiceProfile ? 'Verder' : 'Sla over'}
          </Text>
          <CaretRight size={18} color="#fff" weight="bold" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Row({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium }}>{value}</Text>
    </View>
  );
}
