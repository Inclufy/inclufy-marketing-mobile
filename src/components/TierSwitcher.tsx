// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: t.icon>
// src/components/TierSwitcher.tsx
// ────────────────────────────────────────────────────────────────────────
// Superadmin-only dev tool: switch your own profiles.tier in one tap.
//
// Why this exists:
//   - QA the free-tier UpgradeModal without an SQL roundtrip
//   - Inspect Pro / Promote / Ads / Enterprise gated UI without flipping
//     accounts
//   - Verify the server-side watermark baker by toggling to free, doing
//     a manual-channel publish, then toggling back
//
// Security model:
//   - UI visibility is gated client-side via useIsSuperadmin()
//   - The UPDATE itself runs through Postgres RLS — only auth.uid()'s
//     own profile row is mutable. A non-superadmin who somehow renders
//     this component still can't escalate someone else's tier.
//   - The change is reversible: pick a different tier and re-Apply.
//
// Caveat:
//   - The current tier is reflected in profiles.tier IMMEDIATELY, but
//     useUserTier() caches for 60s. We invalidate the query after the
//     write so the next render sees the new value.
//   - Server-side enforcers (publish-social etc.) read tier per-request
//     from the DB, so they pick up the new tier on the very next API
//     call — no cache concerns there.
// ────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { supabase } from '../services/supabase';
import { useUserTier, type Tier } from '../utils/userTier';

import { ArrowsLeftRight, Check, Info } from 'phosphor-react-native';
const TIERS: Array<{
  key: Tier;
  label: string;
  hint: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'free',       label: 'Free',       hint: '1 post/day · 3 channels · AMOS watermark', color: '#9CA3AF', icon: 'leaf-outline' },
  { key: 'pro',        label: 'Pro',        hint: 'Unlimited posts · no watermark',           color: '#3B82F6', icon: 'rocket-outline' },
  { key: 'promote',    label: 'Promote',    hint: 'Pro + Meta ad boosts (1 incl.)',           color: '#8B5CF6', icon: 'megaphone-outline' },
  { key: 'ads',        label: 'Ads',        hint: 'Promote + TikTok/LinkedIn ads (5 incl.)',  color: '#EC4899', icon: 'flame-outline' },
  { key: 'enterprise', label: 'Enterprise', hint: 'Ads + white-label + unlimited boosts',     color: '#F59E0B', icon: 'star' },
];

export default function TierSwitcher() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { tier: currentTier, loading: tierLoading, refetch } = useUserTier();
  const [pending, setPending] = useState<Tier | null>(null);

  const applyTier = async (target: Tier) => {
    if (target === currentTier || pending) return;
    setPending(target);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        Alert.alert('Niet ingelogd', 'Log opnieuw in om je tier te wijzigen.');
        setPending(null);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ tier: target })
        .eq('id', user.id);

      if (error) {
        // Most likely cause: profiles row doesn't exist yet for this user.
        // The trigger that creates it on signup may have been skipped for
        // accounts predating the trigger. Fall back to upsert.
        if (error.code === 'PGRST116' || /no rows/i.test(error.message)) {
          const { error: upErr } = await supabase
            .from('profiles')
            .upsert({ id: user.id, tier: target }, { onConflict: 'id' });
          if (upErr) throw upErr;
        } else {
          throw error;
        }
      }

      // Invalidate any cached tier read so the next render reflects the change.
      await qc.invalidateQueries({ queryKey: ['user-tier'] });
      await refetch();

      Alert.alert(
        '✅ Tier gewijzigd',
        `Je tier staat nu op "${target}". Server-side checks pakken dit op de volgende API-call op.`,
      );
    } catch (err: any) {
      Alert.alert('Mislukt', err?.message ?? 'Kon tier niet wijzigen.');
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={{ paddingVertical: spacing.xs }}>
      {/* Helper text */}
      <View
        style={{
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.xs,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Info size={14} color={colors.textSecondary} weight="regular" />
        <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, flex: 1 }}>
          Wijzigt alleen je eigen profiel · Voor QA / preview
        </Text>
      </View>

      {TIERS.map((t, idx) => {
        const isActive = currentTier === t.key;
        const isPending = pending === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            activeOpacity={0.75}
            onPress={() => applyTier(t.key)}
            disabled={tierLoading || !!pending || isActive}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: spacing.md,
              paddingVertical: 11,
              borderTopWidth: idx === 0 ? 0 : 1,
              borderTopColor: colors.border + '60',
              backgroundColor: isActive ? t.color + '12' : 'transparent',
              opacity: !!pending && !isPending ? 0.5 : 1,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: t.color + '22',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Ionicons name={t.icon} size={15} color={t.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
                  {t.label}
                </Text>
                {isActive && (
                  <View
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                      backgroundColor: t.color,
                    }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.4 }}>
                      ACTIVE
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 }}>
                {t.hint}
              </Text>
            </View>
            {isPending ? (
              <ActivityIndicator size="small" color={t.color} />
            ) : isActive ? (
              <Check size={18} color={t.color} weight="bold" />
            ) : (
              <ArrowsLeftRight size={16} color={colors.textTertiary} weight="bold" />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
