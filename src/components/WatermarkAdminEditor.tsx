// src/components/WatermarkAdminEditor.tsx
// ────────────────────────────────────────────────────────────────────────
// Superadmin-only global watermark editor.
//
// Lives inside Settings → DEVELOPER TOOLS card. Reads + writes the
// `app_settings` row keyed 'watermark'. Three fields:
//   - image_url: superadmin-uploaded PNG/JPEG in media/global/watermark/.
//                When null/empty the edge function falls back to its
//                inlined default polygonal-A AMOS logo.
//   - opacity:   0..1, multiplied into every pixel's alpha just before
//                the badge is composited onto a publish.
//   - size:      small|medium|large|xlarge — watermark width as % of the
//                photo. Overrides the per-post/profile size in the bake.
//
// A live preview composites the watermark onto a simulated photo using the
// real position/size (from the user's profile) + opacity (global), so the
// effect is visible immediately — no publish needed.
//
// RLS on app_settings + storage.objects enforces 'sami@inclufy.com' on the
// server. The UI gate via useIsSuperadmin() is purely cosmetic.
// ────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { supabase } from '../services/supabase';
import {
  CloudArrowUp,
  Eyedropper,
  FloppyDisk,
  ArrowCounterClockwise,
  Image as ImageIcon,
} from 'phosphor-react-native';

const STORAGE_BUCKET = 'media';
const STORAGE_PREFIX = 'global/watermark';
const PRESETS = [25, 50, 75, 100] as const;

// Mirrors SIZE_PCT in supabase/functions/_shared/watermark.ts — keep in sync.
// Used by the live preview to size the watermark exactly as the bake will.
const SIZE_PCT: Record<string, number> = {
  small: 0.06, medium: 0.10, large: 0.14, xlarge: 0.20,
};
const MARGIN_PCT = 0.025; // mirrors BADGE_MARGIN_PCT

// Size options — value matches the WatermarkSize enum in the edge function
// + the profiles.watermark_size CHECK constraint.
const SIZE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'small',  label: 'Klein' },
  { value: 'medium', label: 'Medium' },
  { value: 'large',  label: 'Groot' },
  { value: 'xlarge', label: 'Extra groot' },
];

interface WatermarkValue {
  image_url: string | null;
  opacity: number; // 0..1
  size?: string | null; // small|medium|large|xlarge — null → per-profile fallback
}

export default function WatermarkAdminEditor() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [opacityPct, setOpacityPct] = useState<number>(100); // 0..100 in UI
  const [dirty, setDirty] = useState(false);
  // `size` is a GLOBAL setting (app_settings) editable here. `position` is
  // still per-user (profiles) — pulled only so the live preview is faithful.
  const [position, setPosition] = useState<string>('top-left');
  const [size, setSize] = useState<string>('medium');

  // ── Load current settings ────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'watermark')
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? {}) as Partial<WatermarkValue>;
      setImageUrl(typeof v.image_url === 'string' && v.image_url.length > 0 ? v.image_url : null);
      const op = typeof v.opacity === 'number' ? v.opacity : 1.0;
      setOpacityPct(Math.round(Math.max(0, Math.min(1, op)) * 100));

      const validSizes = SIZE_OPTIONS.map((s) => s.value);
      const globalSize = typeof v.size === 'string' && validSizes.includes(v.size)
        ? v.size
        : null;

      // Pull this superadmin's own profile for: position (preview only) and
      // watermark_size as a fallback when the global size isn't set yet.
      const { data: { user } } = await supabase.auth.getUser();
      let profileSize = 'medium';
      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('watermark_position, watermark_size')
          .eq('id', user.id)
          .maybeSingle();
        setPosition((prof as any)?.watermark_position ?? 'top-left');
        if (validSizes.includes((prof as any)?.watermark_size)) {
          profileSize = (prof as any).watermark_size;
        }
      }
      // Global size wins; else fall back to the profile size.
      setSize(globalSize ?? profileSize);
      setDirty(false);
    } catch (err: any) {
      Alert.alert('Fout', `Kon watermerk-instellingen niet laden: ${err?.message ?? err}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Pick + upload a new global watermark image ────────────────────────
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Geen toegang', 'Geef toegang tot de fotobibliotheek om een watermerk te kiezen.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1, // keep PNG transparency intact
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      const uri = result.assets[0].uri;
      const isPng = uri.toLowerCase().includes('.png');
      const ext = isPng ? 'png' : 'jpg';
      const contentType = isPng ? 'image/png' : 'image/jpeg';
      const fileName = `${Date.now()}.${ext}`;
      const path = `${STORAGE_PREFIX}/${fileName}`;

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, bytes, { contentType, upsert: true });
      if (upErr) throw upErr;

      // 1-year signed URL — edge function caches the decoded image per-URL
      // in module scope, so this URL is requested at most once per cold start.
      const { data: signed, error: signErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr || !signed?.signedUrl) throw signErr ?? new Error('no signed URL');

      setImageUrl(signed.signedUrl);
      setDirty(true);
    } catch (err: any) {
      Alert.alert('Upload mislukt', err?.message ?? String(err));
    } finally {
      setUploading(false);
    }
  };

  // ── Reset to default (inlined AMOS logo) ─────────────────────────────
  const resetToDefault = () => {
    Alert.alert(
      'Terug naar standaard?',
      'Verwijdert de custom afbeelding. Free-tier publishes krijgen weer het standaard AMOS-logo.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            setImageUrl(null);
            setDirty(true);
          },
        },
      ],
    );
  };

  // ── Save back to app_settings ────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const value: WatermarkValue = {
        image_url: imageUrl,
        opacity: Math.max(0, Math.min(1, opacityPct / 100)),
        size,
      };
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          { key: 'watermark', value, updated_at: new Date().toISOString(), updated_by: user?.id },
          { onConflict: 'key' },
        );
      if (error) throw error;
      setDirty(false);
      Alert.alert('Opgeslagen', 'Volgende publish gebruikt de nieuwe instellingen.');
    } catch (err: any) {
      Alert.alert('Opslaan mislukt', err?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  // ── Opacity input handlers ───────────────────────────────────────────
  const setOpacityFromText = (txt: string) => {
    const n = parseInt(txt.replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(n)) {
      setOpacityPct(Math.max(0, Math.min(100, n)));
      setDirty(true);
    }
  };

  if (loading) {
    return (
      <View style={{ padding: spacing.md, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Eyedropper size={14} color={colors.primary} weight="duotone" />
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, flex: 1 }}>
          Watermerk (globaal)
        </Text>
      </View>
      <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, fontStyle: 'italic' }}>
        Geldt voor alle free-tier publishes. Wijzigingen actief vanaf de eerstvolgende publish (edge function cache cold-start ~5 min).
      </Text>

      {/* ── Afbeelding-preview + upload ──────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.sm,
          backgroundColor: colors.background,
          borderRadius: borderRadius.md,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View
          style={{
            width: 56, height: 56, borderRadius: 8,
            backgroundColor: '#0008',
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {imageUrl ? (
            // key={imageUrl} forces remount on URL change — RN Image's native
            // cache otherwise keeps showing the previous bitmap even after the
            // source URI prop has changed.
            <Image
              key={imageUrl}
              source={{ uri: imageUrl }}
              style={{ width: 56, height: 56 }}
              resizeMode="contain"
            />
          ) : (
            <ImageIcon size={26} color="#fff" weight="duotone" />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.text, fontWeight: fontWeight.medium }}>
            {imageUrl ? 'Custom afbeelding' : 'Standaard AMOS-logo (ingebouwd)'}
          </Text>
          <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }} numberOfLines={1}>
            {imageUrl ? imageUrl.split('/').pop()?.split('?')[0] : 'Geen custom upload actief'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={pickImage}
          disabled={uploading}
          style={{
            paddingHorizontal: spacing.sm, paddingVertical: 6,
            borderRadius: borderRadius.sm,
            backgroundColor: colors.primary,
            opacity: uploading ? 0.6 : 1,
            flexDirection: 'row', alignItems: 'center', gap: 4,
          }}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <CloudArrowUp size={14} color="#fff" weight="bold" />
          )}
          <Text style={{ color: '#fff', fontSize: fontSize.xs, fontWeight: fontWeight.semibold }}>
            {uploading ? 'Bezig...' : 'Upload'}
          </Text>
        </TouchableOpacity>
        {imageUrl && (
          <TouchableOpacity
            onPress={resetToDefault}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowCounterClockwise size={18} color={colors.textSecondary} weight="bold" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Opacity / transparantie ──────────────────────────────────── */}
      <View
        style={{
          padding: spacing.sm,
          backgroundColor: colors.background,
          borderRadius: borderRadius.md,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 6,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.text, fontWeight: fontWeight.semibold, flex: 1 }}>
            Transparantie
          </Text>
          <TextInput
            value={String(opacityPct)}
            onChangeText={setOpacityFromText}
            keyboardType="number-pad"
            maxLength={3}
            style={{
              width: 56, paddingHorizontal: 8, paddingVertical: 4,
              borderRadius: 6, borderWidth: 1, borderColor: colors.border,
              color: colors.text, fontSize: fontSize.sm, textAlign: 'right',
              backgroundColor: colors.surface,
            }}
          />
          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>%</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {PRESETS.map((p) => {
            const active = opacityPct === p;
            return (
              <TouchableOpacity
                key={p}
                onPress={() => { setOpacityPct(p); setDirty(true); }}
                style={{
                  flex: 1, paddingVertical: 6,
                  borderRadius: borderRadius.sm,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary + '20' : 'transparent',
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  fontSize: fontSize.xs,
                  color: active ? colors.primary : colors.textSecondary,
                  fontWeight: active ? fontWeight.semibold : fontWeight.medium,
                }}>
                  {p}%
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={{ fontSize: 10, color: colors.textTertiary, fontStyle: 'italic' }}>
          100% = volledig zichtbaar · 0% = volledig transparant (watermerk effectief verborgen)
        </Text>
      </View>

      {/* ── Grootte / size ───────────────────────────────────────────
          Global size — overrides the per-post/profile size in the bake. */}
      <View
        style={{
          padding: spacing.sm,
          backgroundColor: colors.background,
          borderRadius: borderRadius.md,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 6,
        }}
      >
        <Text style={{ fontSize: fontSize.xs, color: colors.text, fontWeight: fontWeight.semibold }}>
          Grootte
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {SIZE_OPTIONS.map((opt) => {
            const active = size === opt.value;
            const pct = Math.round((SIZE_PCT[opt.value] ?? 0.1) * 100);
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => { setSize(opt.value); setDirty(true); }}
                style={{
                  flex: 1, paddingVertical: 6,
                  borderRadius: borderRadius.sm,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary + '20' : 'transparent',
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  fontSize: fontSize.xs,
                  color: active ? colors.primary : colors.textSecondary,
                  fontWeight: active ? fontWeight.semibold : fontWeight.medium,
                }}>
                  {opt.label}
                </Text>
                <Text style={{ fontSize: 9, color: colors.textTertiary }}>{pct}%</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={{ fontSize: 10, color: colors.textTertiary, fontStyle: 'italic' }}>
          Breedte van het watermerk als % van de foto. Geldt globaal voor alle free-tier publishes.
        </Text>
      </View>

      {/* ── Live preview ─────────────────────────────────────────────
          Composites the watermark onto a simulated photo using the exact
          position/size (from profile) + opacity (from app_settings) that
          the server-side bake will use — so the superadmin sees the real
          result without having to publish a post. */}
      {(() => {
        const [vert, horiz] = position.split('-');
        const wPct = (SIZE_PCT[size] ?? 0.10) * 100;
        const marginPct = MARGIN_PCT * 100;
        const wmStyle = {
          position: 'absolute' as const,
          width: `${wPct}%` as `${number}%`,
          aspectRatio: 1,
          opacity: opacityPct / 100,
          ...(vert === 'top'
            ? { top: `${marginPct}%` as `${number}%` }
            : vert === 'bottom'
            ? { bottom: `${marginPct}%` as `${number}%` }
            : { top: `${(100 - wPct) / 2}%` as `${number}%` }),
          ...(horiz === 'left'
            ? { left: `${marginPct}%` as `${number}%` }
            : horiz === 'right'
            ? { right: `${marginPct}%` as `${number}%` }
            : { left: `${(100 - wPct) / 2}%` as `${number}%` }),
        };
        return (
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: fontSize.xs, color: colors.text, fontWeight: fontWeight.semibold }}>
              Voorbeeld
            </Text>
            <View
              style={{
                aspectRatio: 1,
                borderRadius: borderRadius.md,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              {/* Simulated photo background */}
              <LinearGradient
                colors={['#7c5cbf', '#3a4b8a', '#243056']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              />
              {/* Watermark composited at real position/size/opacity */}
              <Image
                key={`${imageUrl ?? 'default'}-${position}-${size}-${opacityPct}`}
                source={
                  imageUrl
                    ? { uri: imageUrl }
                    : require('../../assets/amos-logo-transparent.png')
                }
                resizeMode="contain"
                style={wmStyle}
              />
            </View>
            <Text style={{ fontSize: 10, color: colors.textTertiary, fontStyle: 'italic' }}>
              Afbeelding, transparantie en grootte zijn globaal (hierboven). Positie ({position})
              komt uit je profiel · Watermerk-instellingen.
            </Text>
          </View>
        );
      })()}

      {/* ── Save button ──────────────────────────────────────────────── */}
      <TouchableOpacity
        onPress={save}
        disabled={!dirty || saving}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          paddingVertical: 10, borderRadius: borderRadius.full,
          backgroundColor: dirty ? colors.primary : colors.border,
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <FloppyDisk size={16} color={dirty ? '#fff' : colors.textTertiary} weight="duotone" />
        )}
        <Text style={{
          color: dirty ? '#fff' : colors.textTertiary,
          fontSize: fontSize.sm,
          fontWeight: fontWeight.semibold,
        }}>
          {saving ? 'Opslaan...' : dirty ? 'Opslaan' : 'Geen wijzigingen'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
