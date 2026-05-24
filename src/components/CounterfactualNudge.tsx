// src/components/CounterfactualNudge.tsx
// Tier-1 Suggestion #6: "Left on the table" / "Linker op tafel" nudge.
//
// Calls the agent-counterfactual edge function and renders a yellow-orange
// gradient banner showing the estimated euro value that's still on the table
// because the user skipped or hasn't approved recent ad-runs. Tap → navigates
// to the MultiAgent screen so the user can take action.
//
// Mounting on HomeScreen:
//   <CounterfactualNudge organizationId={org?.id} />
// Renders nothing while loading, on error, or when there's nothing to nudge.

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { supabase } from '../services/supabase';

import { CaretRight, TrendUp } from 'phosphor-react-native';
// ─── Config ─────────────────────────────────────────────────────────────────
// Same Supabase URL/key pattern as `src/services/supabase.ts` — these mirror
// the EXPO_PUBLIC env vars that other screens (AICommandScreen) use.
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://mpxkugfqzmxydxnlxqoj.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1weGt1Z2Zxem14eWR4bmx4cW9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0NzY5MDEsImV4cCI6MjA4MjA1MjkwMX0.17YXD9I9fZulQGoGZFFFzQ-f-LW4E1lsT3SSpDC_GA0';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CounterfactualResponse {
  window_days: number;
  missed_runs: number;
  missed_kinds: Record<string, number>;
  est_eur_left_on_table: number;
  methodology: string;
}

export interface CounterfactualNudgeProps {
  /** The org whose counterfactual to compute. Hides when absent. */
  organizationId?: string | null;
  /** Days to look back. Default: 7. */
  windowDays?: number;
  /** Optional override — defaults to navigating to MultiAgent screen. */
  onPress?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

const GRADIENT: readonly [string, string] = ['#F59E0B', '#FB923C'];

export default function CounterfactualNudge({
  organizationId,
  windowDays = 7,
  onPress,
}: CounterfactualNudgeProps) {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { locale } = useTranslation();
  const isNl = locale === 'nl';

  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<CounterfactualResponse | null>(null);
  // Auto-resolve org if no prop was passed (drop-in pattern, mirrors
  // AgentActivityTile.tsx). Prefers the prop when supplied.
  const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(organizationId ?? null);

  useEffect(() => {
    if (organizationId) { setResolvedOrgId(organizationId); return; }
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: row } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (!cancelled) setResolvedOrgId(row?.organization_id ?? null);
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    if (!resolvedOrgId) {
      setLoading(false);
      setData(null);
      return;
    }

    (async () => {
      try {
        // Auth pattern mirrors AgentDetailScreen / AICommandScreen.
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? SUPABASE_ANON_KEY;

        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/agent-counterfactual`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              organization_id: resolvedOrgId,
              window_days: windowDays,
            }),
          },
        );

        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !json || typeof json !== 'object') {
          setData(null);
        } else {
          setData(json as CounterfactualResponse);
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedOrgId, windowDays]);

  const styles = useThemedStyles(() => ({
    wrapper: {
      borderRadius: borderRadius.lg,
      overflow: 'hidden' as const,
      marginVertical: spacing.sm,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    gradient: {
      padding: spacing.md,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.18)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    body: { flex: 1 },
    title: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: '#fff',
      marginBottom: 2,
    },
    subtitle: {
      fontSize: fontSize.sm,
      color: 'rgba(255,255,255,0.92)',
      lineHeight: 18,
    },
    chevronWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: 'rgba(255,255,255,0.18)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    loadingWrap: {
      padding: spacing.md,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    loadingText: {
      color: '#fff',
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
    },
  }));

  // Hide while we don't yet have an org id; brief loader otherwise.
  if (!resolvedOrgId) return null;

  if (loading) {
    return (
      <View style={styles.wrapper}>
        <LinearGradient
          colors={GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.loadingWrap}
        >
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.loadingText}>
            {isNl ? 'Kansen analyseren...' : 'Analyzing opportunities...'}
          </Text>
        </LinearGradient>
      </View>
    );
  }

  if (!data) return null;
  if (data.missed_runs === 0 || data.est_eur_left_on_table === 0) return null;

  const adRuns = data.missed_kinds?.ads ?? 0;
  const eur = Math.round(data.est_eur_left_on_table);
  const formattedEur = `€${eur.toLocaleString(isNl ? 'nl-NL' : 'en-US')}`;

  // Pick the most relevant count for the body copy: ad-runs if any,
  // otherwise the total missed runs.
  const runCount = adRuns > 0 ? adRuns : data.missed_runs;
  const useAdsCopy = adRuns > 0;

  const title = isNl ? 'Linker op tafel' : 'Left on the table';
  const subtitle = isNl
    ? useAdsCopy
      ? `Als je deze week ${runCount} ad-${runCount === 1 ? 'run' : 'runs'} had goedgekeurd, geschat +${formattedEur} omzet.`
      : `Je hebt ${runCount} agent-${runCount === 1 ? 'run' : 'runs'} laten liggen, geschat +${formattedEur} omzet.`
    : useAdsCopy
      ? `If you'd approved ${runCount} ad-${runCount === 1 ? 'run' : 'runs'} this week, est. +${formattedEur} revenue.`
      : `${runCount} agent ${runCount === 1 ? 'run' : 'runs'} left pending, est. +${formattedEur} revenue.`;

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    try {
      navigation.navigate('MultiAgent' as never);
    } catch {
      // No-op when navigation context is missing (e.g. in tests).
    }
  };

  return (
    <TouchableOpacity
      style={styles.wrapper}
      onPress={handlePress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <LinearGradient
        colors={GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        <View style={styles.iconWrap}>
          <TrendUp size={22} color="#fff" weight="bold" />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.chevronWrap}>
          <CaretRight size={16} color="#fff" weight="bold" />
        </View>
        {/* `colors` referenced so the themedStyles hook re-runs on theme change
             without needing a full prop. */}
        {colors ? null : null}
      </LinearGradient>
    </TouchableOpacity>
  );
}
