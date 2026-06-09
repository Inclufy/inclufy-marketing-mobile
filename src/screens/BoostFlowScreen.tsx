/**
 * BoostFlowScreen — Capture-to-Ad campaign wizard.
 *
 * Roadmap §4.3 step "AMOS AI suggests: 3 creative variants" + multi-step
 * flow for budget / audience / variant review / confirm.
 *
 * Steps:
 *   1. Budget + Duration (slider + chips)
 *   2. Audience preset (lookalike Page volgers / interest / geo-only)
 *   3. AI Variants review (3 cards, pick winner via radio)
 *   4. Confirm + Push (calls boost-post edge fn)
 *
 * On submit:
 *   - boost-post creates ad_campaigns row with chosen config
 *   - ai-ad-variants generates 3 creatives → user reviews
 *   - If META_ADS_API_LIVE=true server-side → ad pushed to Meta Marketing API
 *   - Else → DRY-RUN; user can still open Meta Ads Manager via fallback
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing, fontSize, fontWeight, borderRadius } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../services/supabase';
import type { RootStackParamList } from '../types';

import { CaretLeft, CheckCircle, Sparkle } from 'phosphor-react-native';
import { CommentThread } from '../components/CommentThread';
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'BoostFlow'>;

type BudgetPreset = { label: string; cents: number; days: number };
const BUDGET_PRESETS: BudgetPreset[] = [
  { label: '€15 / 3 dagen', cents: 1500, days: 3 },
  { label: '€25 / 3 dagen', cents: 2500, days: 3 },
  { label: '€50 / 5 dagen', cents: 5000, days: 5 },
  { label: '€100 / 7 dagen', cents: 10000, days: 7 },
  { label: '€250 / 14 dagen', cents: 25000, days: 14 },
];

type AudiencePreset = {
  key: string;
  label: string;
  description: string;
  config: Record<string, unknown>;
};
const AUDIENCE_PRESETS: AudiencePreset[] = [
  {
    key: 'lookalike_followers',
    label: 'Lookalike: Page volgers',
    description: 'Mensen vergelijkbaar met je huidige Inclufy Page volgers. Meta zoekt 1-2% lookalike binnen Nederland.',
    config: { type: 'lookalike', source: 'page_followers', country: 'NL', size: '1%' },
  },
  {
    key: 'esg_dei_interest',
    label: 'Interest: ESG / DEI / Inclusion',
    description: 'Doelgroep met expliciete interesses in duurzaamheid, diversiteit en inclusion. NL, leeftijd 25-55.',
    config: { type: 'interest', interests: ['ESG', 'DEI', 'inclusion', 'sustainability'], age: [25, 55], country: 'NL' },
  },
  {
    key: 'business_decisionmakers',
    label: 'Business decision-makers',
    description: 'HR-managers, CEO\'s, Operations leads in mid-large bedrijven. Voor B2B AMOS sales-positioning.',
    config: { type: 'job_title', job_titles: ['HR', 'CEO', 'COO', 'Director', 'Manager'], company_size: ['51-200', '201-500', '500+'], country: 'NL' },
  },
  {
    key: 'geo_only',
    label: 'Alleen geografisch',
    description: 'Iedereen in Nederland — Meta optimaliseert op basis van post performance.',
    config: { type: 'geo', country: 'NL' },
  },
];

type Variant = {
  id?: string;
  variant_label: string;
  headline?: string;
  primary_text: string;
  description?: string;
  call_to_action?: string;
  ai_rationale?: string;
  ai_target_emotion?: string;
};

export default function BoostFlowScreen() {
  const { params } = useRoute<Rt>();
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();

  // ── Prefill from Ads Agent (Tier-1 #3 connection) ─────────────────
  // If the route was opened by AgentRunDetail "Approve", these params
  // carry the agent's recommended pacing + audience. Otherwise fall
  // back to the safe defaults the manual flow has always used.
  const initialBudget = useMemo<BudgetPreset>(() => {
    const cents = params.prefillBudgetCents;
    const days  = params.prefillDurationDays;
    if (!cents || !days) return BUDGET_PRESETS[1];
    // Pick the closest preset by cents+days (within 30% tolerance) to
    // avoid creating a custom row that breaks the chip UI.
    const closest = BUDGET_PRESETS
      .map(p => ({ p, score: Math.abs(p.cents - cents) + Math.abs(p.days - days) * 100 }))
      .sort((a, b) => a.score - b.score)[0];
    return closest?.p ?? BUDGET_PRESETS[1];
  }, [params.prefillBudgetCents, params.prefillDurationDays]);

  const initialAudience = useMemo<AudiencePreset>(() => {
    const key = params.prefillAudienceKey;
    if (!key) return AUDIENCE_PRESETS[0];
    return AUDIENCE_PRESETS.find(a => a.key === key) ?? AUDIENCE_PRESETS[0];
  }, [params.prefillAudienceKey]);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [budget, setBudget] = useState<BudgetPreset>(initialBudget);
  const [audience, setAudience] = useState<AudiencePreset>(initialAudience);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [chosenVariant, setChosenVariant] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Generate variants when entering step 3
  useEffect(() => {
    if (step !== 3 || variants.length > 0) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('boost-post', {
          body: {
            post_id: params.postId,
            channel: params.channel === 'facebook' || params.channel === 'instagram' ? 'meta' : params.channel,
            budget_cents: budget.cents,
            duration_days: budget.days,
            audience_config: audience.config,
            objective: 'POST_ENGAGEMENT',
            auto_generate_variants: true,
            dry_run: true, // changes to false when META_ADS_API_LIVE=true server-side
          },
        });
        if (error) throw error;
        setCampaignId(data?.campaign?.id ?? null);
        setVariants(data?.variants ?? []);
        if ((data?.variants ?? []).length > 0) {
          setChosenVariant((data.variants[0] as Variant).variant_label);
        }
      } catch (e: any) {
        Alert.alert('AI variants genereren mislukt', e.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [step]);

  const onConfirm = async () => {
    if (!campaignId || !chosenVariant) return;
    setLoading(true);
    try {
      // Mark winning variant
      await supabase
        .from('campaign_creatives')
        .update({ is_winner: true })
        .eq('campaign_id', campaignId)
        .eq('variant_label', chosenVariant);

      // Update campaign status — ready for platform push
      // (in DRY-RUN this just stays draft; when META_ADS_API_LIVE flag flips
      //  the boost-post handler picks up draft campaigns and pushes them)
      // BUG-NEW-06 fix: populate started_at so the cron's duration
      // detection works. approved_at marks user confirmation moment;
      // started_at marks when the campaign clock begins.
      const now = new Date().toISOString();
      await supabase
        .from('ad_campaigns')
        .update({
          status: 'pending_approval',
          approved_at: now,
          started_at: now,
        })
        .eq('id', campaignId);

      setSubmitted(true);
    } catch (e: any) {
      Alert.alert('Bevestigen mislukt', e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const onOpenAdsManager = () => {
    const url = `https://www.facebook.com/ads/manager/manage/ads/?post_id=${params.postId}&boost=1`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Ads Manager', 'Open business.facebook.com/adsmanager handmatig');
    });
  };

  const accent = '#F59E0B'; // amber — Boost branding color

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.lg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: spacing.md }}>
          <CaretLeft size={24} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text }}>
            🚀 Boost
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
            Capture-to-Ad — stap {step} van 4
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={{ flexDirection: 'row', gap: 4, marginBottom: spacing.xl }}>
        {[1, 2, 3, 4].map((s) => (
          <View
            key={s}
            style={{
              flex: 1, height: 4, borderRadius: 2,
              backgroundColor: s <= step ? accent : colors.border,
            }}
          />
        ))}
      </View>

      {/* Agent-suggested badge — only when prefill is supplied. */}
      {params.prefillSourceLabel && (
        <View style={{
          backgroundColor: '#A855F722',
          borderRadius: borderRadius.md,
          paddingVertical: 6, paddingHorizontal: spacing.sm,
          marginBottom: spacing.md,
          flexDirection: 'row', alignItems: 'center', gap: 6,
        }}>
          <Sparkle size={14} color="#A855F7" weight="fill" />
          <Text style={{ fontSize: fontSize.sm, color: '#A855F7', fontWeight: fontWeight.semibold }}>
            {params.prefillSourceLabel}
          </Text>
        </View>
      )}

      {/* Step 1: Budget */}
      {step === 1 && (
        <View>
          <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.md }}>
            Hoeveel wil je investeren?
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg }}>
            Tip: €25 over 3 dagen geeft genoeg signaal om Meta's algoritme te trainen, zonder hoog risico.
          </Text>
          <View style={{ gap: spacing.sm }}>
            {BUDGET_PRESETS.map((p) => {
              const selected = budget.cents === p.cents;
              return (
                <TouchableOpacity
                  key={p.label}
                  onPress={() => setBudget(p)}
                  style={{
                    padding: spacing.md, borderRadius: borderRadius.md,
                    backgroundColor: selected ? accent + '15' : colors.surface,
                    borderWidth: 2, borderColor: selected ? accent : colors.border,
                    flexDirection: 'row', alignItems: 'center',
                  }}
                >
                  <Text style={{ flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                    {p.label}
                  </Text>
                  {selected && <CheckCircle size={22} color={accent} weight="fill" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Step 2: Audience */}
      {step === 2 && (
        <View>
          <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.md }}>
            Wie wil je bereiken?
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg }}>
            Kies een doelgroep-preset. Je kunt later in Meta Ads Manager verder verfijnen.
          </Text>
          <View style={{ gap: spacing.sm }}>
            {AUDIENCE_PRESETS.map((a) => {
              const selected = audience.key === a.key;
              return (
                <TouchableOpacity
                  key={a.key}
                  onPress={() => setAudience(a)}
                  style={{
                    padding: spacing.md, borderRadius: borderRadius.md,
                    backgroundColor: selected ? accent + '15' : colors.surface,
                    borderWidth: 2, borderColor: selected ? accent : colors.border,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                      {a.label}
                    </Text>
                    {selected && <CheckCircle size={22} color={accent} weight="fill" />}
                  </View>
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 18 }}>
                    {a.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Step 3: AI Variants */}
      {step === 3 && (
        <View>
          <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.md }}>
            AI-gegenereerde varianten
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg }}>
            Kies welke versie je als ad wilt gebruiken. Ze targetten verschillende emoties.
          </Text>
          {loading && (
            <View style={{ padding: spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={accent} />
              <Text style={{ marginTop: spacing.md, color: colors.textSecondary }}>3 varianten genereren…</Text>
            </View>
          )}
          {!loading && variants.length === 0 && (
            <Text style={{ color: colors.error }}>Geen varianten beschikbaar. Probeer opnieuw.</Text>
          )}
          {!loading && variants.length > 0 && (
            <View style={{ gap: spacing.md }}>
              {variants.map((v) => {
                const selected = chosenVariant === v.variant_label;
                return (
                  <TouchableOpacity
                    key={v.variant_label}
                    onPress={() => setChosenVariant(v.variant_label)}
                    style={{
                      padding: spacing.md, borderRadius: borderRadius.md,
                      backgroundColor: selected ? accent + '15' : colors.surface,
                      borderWidth: 2, borderColor: selected ? accent : colors.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                      <View style={{
                        width: 32, height: 32, borderRadius: 16,
                        backgroundColor: accent, justifyContent: 'center', alignItems: 'center',
                        marginRight: spacing.md,
                      }}>
                        <Text style={{ color: '#fff', fontWeight: fontWeight.bold }}>{v.variant_label}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
                          {v.ai_target_emotion?.replace('_', ' ').toUpperCase() ?? 'Variant'}
                        </Text>
                        <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>
                          {v.ai_rationale}
                        </Text>
                      </View>
                      {selected && <CheckCircle size={22} color={accent} weight="fill" />}
                    </View>
                    {v.headline ? (
                      <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: 4 }}>
                        {v.headline}
                      </Text>
                    ) : null}
                    <Text style={{ fontSize: fontSize.sm, color: colors.text, lineHeight: 20 }}>
                      {v.primary_text}
                    </Text>
                    {v.call_to_action ? (
                      <View style={{
                        alignSelf: 'flex-start', marginTop: spacing.sm,
                        paddingHorizontal: 8, paddingVertical: 4,
                        borderRadius: 4, backgroundColor: colors.primary + '15',
                      }}>
                        <Text style={{ fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.semibold }}>
                          {v.call_to_action.replace(/_/g, ' ')}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* Step 4: Confirm */}
      {step === 4 && (
        <View>
          <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.md }}>
            {submitted ? '✅ Boost ingediend' : 'Bevestig boost'}
          </Text>
          {submitted ? (
            <View>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 }}>
                Je campagne staat klaar in dry-run mode. Zodra Meta de ads_management scope goedkeurt voor AMOS,
                gaat hij automatisch live. Tot dan kun je hem ook handmatig in Meta Ads Manager pushen.
              </Text>
              <TouchableOpacity
                onPress={onOpenAdsManager}
                style={{
                  padding: spacing.md, borderRadius: borderRadius.md,
                  backgroundColor: accent, alignItems: 'center', marginBottom: spacing.md,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: fontWeight.semibold }}>
                  Open Meta Ads Manager
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={{
                  padding: spacing.md, borderRadius: borderRadius.md,
                  borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
                }}
              >
                <Text style={{ color: colors.text, fontWeight: fontWeight.semibold }}>Sluiten</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              <View style={{ padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 4 }}>BUDGET</Text>
                <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                  {budget.label}
                </Text>
              </View>
              <View style={{ padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 4 }}>DOELGROEP</Text>
                <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                  {audience.label}
                </Text>
              </View>
              <View style={{ padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 4 }}>WINNENDE VARIANT</Text>
                <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                  Variant {chosenVariant}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onConfirm}
                disabled={loading || !chosenVariant}
                style={{
                  padding: spacing.md, borderRadius: borderRadius.md,
                  backgroundColor: accent, alignItems: 'center',
                  opacity: loading || !chosenVariant ? 0.5 : 1,
                  marginTop: spacing.md,
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: fontWeight.semibold }}>
                    Bevestig + boost
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Team discussion on this campaign — only when we have a campaign id.
          Mirrors the web PostBoostFlow CommentThread card. Closes P1 #7
          parity gap from the 2026-06-09 audit. */}
      {step === 4 && campaignId && (
        <View style={{
          marginTop: spacing.lg,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: borderRadius.lg,
          overflow: 'hidden',
        }}>
          <View style={{
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}>
            <Text style={{ color: colors.text, fontWeight: '600' as const, fontSize: fontSize.md }}>
              Discussie
            </Text>
          </View>
          <CommentThread entityType="campaign" entityId={campaignId} />
        </View>
      )}

      {/* Bottom nav: Back + Next */}
      {!submitted && (
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
          {step > 1 && (
            <TouchableOpacity
              onPress={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))}
              style={{
                flex: 1, padding: spacing.md, borderRadius: borderRadius.md,
                borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.text, fontWeight: fontWeight.semibold }}>Terug</Text>
            </TouchableOpacity>
          )}
          {step < 4 && (
            <TouchableOpacity
              onPress={() => setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s))}
              disabled={step === 3 && (loading || !chosenVariant)}
              style={{
                flex: 2, padding: spacing.md, borderRadius: borderRadius.md,
                backgroundColor: accent, alignItems: 'center',
                opacity: step === 3 && (loading || !chosenVariant) ? 0.5 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: fontWeight.semibold }}>Volgende</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );
}
