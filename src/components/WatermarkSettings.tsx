// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: ch.icon as any> | Ionicons name=<dynamic: expanded ? 'chevron-up' : 'chevron-down'>
// src/components/WatermarkSettings.tsx
// ────────────────────────────────────────────────────────────────────────
// Settings panel for the AMOS watermark position.
//
// Two-level UI:
//   1. User default (3x3 grid) — applies to all channels unless overridden
//   2. Per-channel overrides (collapsible) — TikTok / IG / LinkedIn / FB /
//      Pinterest / Snapchat / WhatsApp can each have their own position
//
// Writes go directly to profiles.watermark_position and
// profiles.watermark_positions_by_channel. RLS ensures users can only
// mutate their own row.
//
// Resolution at publish-time (server-side, in publish-social/index.ts):
//   post.engagement.watermark_position
//     → profiles.watermark_positions_by_channel[channel]
//       → profiles.watermark_position
//         → 'top-left'
// ────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { supabase } from '../services/supabase';
import { Warning, XCircle } from 'phosphor-react-native';
import WatermarkPositionPicker, {
  type WatermarkPosition,
  RISKY_POSITIONS_BY_CHANNEL,
  labelOf,
} from './WatermarkPositionPicker';

// Icon names are typed as keyof typeof Ionicons.glyphMap implicitly via the
// component prop — we keep these as untyped string literals here and rely on
// the JSX cast at the call site to avoid pulling in the namespace import.
const CHANNELS: Array<{ key: string; label: string; icon: string; color: string }> = [
  { key: 'facebook',  label: 'Facebook',  icon: 'logo-facebook',  color: '#1877F2' },
  { key: 'instagram', label: 'Instagram', icon: 'logo-instagram', color: '#E1306C' },
  { key: 'linkedin',  label: 'LinkedIn',  icon: 'logo-linkedin',  color: '#0A66C2' },
  { key: 'tiktok',    label: 'TikTok',    icon: 'logo-tiktok',    color: '#000000' },
  { key: 'pinterest', label: 'Pinterest', icon: 'logo-pinterest', color: '#E60023' },
  { key: 'snapchat',  label: 'Snapchat',  icon: 'logo-snapchat',  color: '#FFFC00' },
];

export default function WatermarkSettings() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultPos, setDefaultPos] = useState<WatermarkPosition>('top-left');
  const [byChannel, setByChannel] = useState<Record<string, WatermarkPosition>>({});
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) { setLoading(false); return; }
      const { data } = await supabase
        .from('profiles')
        .select('watermark_position, watermark_positions_by_channel')
        .eq('id', user.id)
        .maybeSingle();
      const d = (data as any) ?? {};
      setDefaultPos((d.watermark_position as WatermarkPosition) ?? 'top-left');
      setByChannel((d.watermark_positions_by_channel as Record<string, WatermarkPosition>) ?? {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveDefault = async (next: WatermarkPosition) => {
    setDefaultPos(next);
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;
      await supabase
        .from('profiles')
        .update({ watermark_position: next })
        .eq('id', user.id);
    } finally {
      setSaving(false);
    }
  };

  const saveChannel = async (channel: string, next: WatermarkPosition | null) => {
    const nextMap = { ...byChannel };
    if (next === null) delete nextMap[channel];
    else nextMap[channel] = next;
    setByChannel(nextMap);
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;
      await supabase
        .from('profiles')
        .update({ watermark_positions_by_channel: nextMap })
        .eq('id', user.id);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ paddingVertical: spacing.sm }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <View
        style={{
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.xs,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, flex: 1 }}>
          AMOS-watermerk positie
        </Text>
        {saving && <ActivityIndicator size="small" color={colors.primary} />}
      </View>

      {/* ── User-default 3x3 picker ────────────────────────────────── */}
      <View
        style={{
          paddingHorizontal: spacing.md,
          paddingTop: 4,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.md,
        }}
      >
        <WatermarkPositionPicker
          value={defaultPos}
          onChange={saveDefault}
          label="Standaard"
        />
        <View style={{ flex: 1, paddingTop: 18 }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 18 }}>
            Geldt voor alle kanalen, tenzij je hieronder een per-kanaal voorkeur instelt.
          </Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 6, fontStyle: 'italic' }}>
            Huidige: {labelOf(defaultPos)}
          </Text>
        </View>
      </View>

      {/* ── Per-channel overrides (collapsible list) ────────────────── */}
      <View style={{ marginTop: spacing.md, paddingHorizontal: spacing.md }}>
        <Text
          style={{
            fontSize: 10,
            fontWeight: fontWeight.semibold,
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 6,
          }}
        >
          Per kanaal (optioneel)
        </Text>
        <View
          style={{
            borderRadius: borderRadius.md,
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          {CHANNELS.map((ch, idx) => {
            const override = byChannel[ch.key];
            const expanded = expandedChannel === ch.key;
            return (
              <View
                key={ch.key}
                style={{
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: colors.border + '60',
                }}
              >
                <TouchableOpacity
                  onPress={() => setExpandedChannel(expanded ? null : ch.key)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 11,
                  }}
                >
                  <View
                    style={{
                      width: 24, height: 24, borderRadius: 12,
                      backgroundColor: ch.color + '18',
                      justifyContent: 'center', alignItems: 'center',
                    }}
                  >
                    <Ionicons name={ch.icon as any} size={13} color={ch.color === '#000000' ? colors.text : ch.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.semibold }}>
                      {ch.label}
                    </Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 }}>
                      {override ? `Override: ${labelOf(override)}` : `Standaard: ${labelOf(defaultPos)}`}
                    </Text>
                  </View>
                  {override && (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); void saveChannel(ch.key, null); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <XCircle size={18} color={colors.textTertiary} weight="fill" />
                    </TouchableOpacity>
                  )}
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>
                {expanded && (
                  <View
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingBottom: spacing.sm,
                      alignItems: 'center',
                    }}
                  >
                    <WatermarkPositionPicker
                      value={override ?? defaultPos}
                      onChange={(p) => void saveChannel(ch.key, p)}
                      warnPositions={RISKY_POSITIONS_BY_CHANNEL[ch.key]}
                    />
                    {!!RISKY_POSITIONS_BY_CHANNEL[ch.key]?.size && (
                      <View
                        style={{
                          marginTop: 8,
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          gap: 4,
                          paddingHorizontal: 4,
                        }}
                      >
                        <Warning size={11} color="#F59E0B" style={{ marginTop: 1 }} weight="fill" />
                        <Text style={{ fontSize: 10, color: colors.textSecondary, flex: 1, lineHeight: 14 }}>
                          ⚠️ Posities wordt mogelijk bedekt door {ch.label} UI (likes / caption / username).
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
