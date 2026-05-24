// src/components/WatermarkPreview.tsx
// ────────────────────────────────────────────────────────────────────────
// Superadmin-only dev tool: shows the most recent baked watermark image
// for the current user (output of supabase/functions/_shared/watermark.ts).
//
// Lives in Settings → DEVELOPER TOOLS card, just below the TierSwitcher.
// Workflow:
//   1. Use TierSwitcher to set yourself to 'free'
//   2. Publish a post to Snapchat (manual channel — no live API)
//   3. Switch tier back to 'enterprise'
//   4. Tap "Refresh" here → see the freshly-baked image
//
// Implementation notes:
//   - Lists `branded/<userId>/` in the `media` bucket via Storage API
//     (sorted by created_at DESC, limit 5)
//   - Generates a 5-minute signed URL for the most recent file
//   - Renders the image inline with size + timestamp metadata
//   - On error / no files: shows a friendly empty state with hint
// ────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Pressable,
  Linking,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { supabase } from '../services/supabase';

import {
  ArrowSquareOut, ArrowsClockwise, Clock, Image as ImageIcon, XCircle,
  MapPin, Ruler, CheckCircle, WarningCircle,
} from 'phosphor-react-native';

interface BakedFile {
  name: string;          // full storage path, e.g. branded/<uid>/1763123456_abc.jpg
  signedUrl: string;
  createdAt: string;     // ISO
  sizeKb: number | null;
}

interface CurrentSettings {
  position: string;      // raw enum value from profiles
  size: string;          // raw enum value from profiles
  savedAt: number;       // ms epoch — when these settings were last fetched
}

const STORAGE_BUCKET = 'media';
const SIGNED_URL_TTL_SEC = 60 * 5; // 5 minutes — enough to look + share

// Human-readable labels (NL) for position/size enum values
const POSITION_LABELS: Record<string, string> = {
  'top-left': 'Linksboven',     'top-center': 'Boven midden',     'top-right': 'Rechtsboven',
  'middle-left': 'Midden links', 'middle-center': 'Centrum',       'middle-right': 'Midden rechts',
  'bottom-left': 'Linksonder',   'bottom-center': 'Onder midden',  'bottom-right': 'Rechtsonder',
};
const SIZE_LABELS: Record<string, string> = {
  small: 'Klein', medium: 'Medium', large: 'Groot', xlarge: 'Extra groot',
};

export default function WatermarkPreview() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<BakedFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const [current, setCurrent] = useState<CurrentSettings | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        setError('Niet ingelogd.');
        setFiles([]);
        return;
      }

      // 0. Fetch current watermark settings so the user can verify what the
      // NEXT bake will use + compare to the timestamps below to see whether
      // recent bakes reflect the current settings or older ones.
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('watermark_position, watermark_size')
          .eq('id', user.id)
          .maybeSingle();
        setCurrent({
          position: (prof as any)?.watermark_position ?? 'top-left',
          size: (prof as any)?.watermark_size ?? 'medium',
          savedAt: Date.now(),
        });
      } catch { /* non-blocking */ }

      // 1. List the user's branded/ folder, newest first
      const folder = `branded/${user.id}`;
      const { data: list, error: listErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(folder, {
          limit: 5,
          sortBy: { column: 'created_at', order: 'desc' },
        });

      if (listErr) {
        // RLS or missing-folder — treat as empty rather than blocking error
        if (/not found|does not exist/i.test(listErr.message)) {
          setFiles([]);
          return;
        }
        throw listErr;
      }
      if (!list || list.length === 0) {
        setFiles([]);
        return;
      }

      // 2. Sign a URL for each (top 5). Parallelised for speed.
      const signed = await Promise.all(
        list.map(async (f) => {
          const path = `${folder}/${f.name}`;
          const { data: signData } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(path, SIGNED_URL_TTL_SEC);
          const sizeRaw = (f.metadata as any)?.size as number | undefined;
          return {
            name: path,
            signedUrl: signData?.signedUrl ?? '',
            createdAt: f.created_at ?? '',
            sizeKb: typeof sizeRaw === 'number' ? Math.round(sizeRaw / 102.4) / 10 : null,
          };
        }),
      );

      setFiles(signed.filter((f) => f.signedUrl));
    } catch (err: any) {
      setError(err?.message ?? 'Onbekende fout.');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on first mount so the user sees something immediately.
  useEffect(() => {
    void load();
  }, [load]);

  const formatWhen = (iso: string): string => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = Date.now();
      const diffMin = Math.round((now - d.getTime()) / 60000);
      if (diffMin < 1) return 'zojuist';
      if (diffMin < 60) return `${diffMin}m geleden`;
      const diffH = Math.round(diffMin / 60);
      if (diffH < 24) return `${diffH}u geleden`;
      return d.toLocaleString('nl-NL', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso.slice(0, 16).replace('T', ' ');
    }
  };

  // ── Header (always shown) ─────────────────────────────────────────────
  const Header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: 4,
        gap: 6,
      }}
    >
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, flex: 1 }}>
        Laatste watermerk-bakes
      </Text>
      <TouchableOpacity
        onPress={load}
        disabled={loading}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ opacity: loading ? 0.4 : 1 }}
      >
        <ArrowsClockwise size={16} color={colors.primary} weight="bold" />
      </TouchableOpacity>
    </View>
  );

  // Recent-bake threshold: any image baked within this window of the current
  // settings being fetched is assumed to use those settings. Picked generously
  // (5 min) so the user has time to flip tier → publish → return here.
  const RECENT_BAKE_MS = 5 * 60 * 1000;

  return (
    <View style={{ paddingBottom: spacing.sm }}>
      {Header}

      {/* ── Current-settings strip ─────────────────────────────────────
          Reflects profiles.watermark_position + watermark_size so the
          user can verify that the NEXT publish (and recent bakes within
          the last 5 min) will use these exact settings. */}
      {current && (
        <View
          style={{
            marginHorizontal: spacing.md,
            marginBottom: spacing.xs,
            padding: spacing.sm,
            borderRadius: borderRadius.md,
            backgroundColor: colors.primary + '10',
            borderWidth: 1,
            borderColor: colors.primary + '30',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
            <MapPin size={13} color={colors.primary} weight="duotone" />
            <Text style={{ fontSize: fontSize.xs, color: colors.text, fontWeight: fontWeight.semibold }}>
              {POSITION_LABELS[current.position] ?? current.position}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
            <Ruler size={13} color={colors.primary} weight="duotone" />
            <Text style={{ fontSize: fontSize.xs, color: colors.text, fontWeight: fontWeight.semibold }}>
              {SIZE_LABELS[current.size] ?? current.size}
            </Text>
          </View>
        </View>
      )}
      {current && (
        <Text style={{ fontSize: 10, color: colors.textTertiary, paddingHorizontal: spacing.md, marginBottom: spacing.xs, fontStyle: 'italic' }}>
          Volgende publish gebruikt deze instellingen.
        </Text>
      )}

      <View style={{ paddingHorizontal: spacing.md, paddingTop: 4 }}>
        {loading && files === null && (
          <View style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}

        {error && (
          <View
            style={{
              padding: spacing.sm,
              borderRadius: borderRadius.sm,
              backgroundColor: colors.error + '12',
              borderWidth: 1,
              borderColor: colors.error + '30',
              marginBottom: spacing.xs,
            }}
          >
            <Text style={{ fontSize: fontSize.xs, color: colors.error }}>
              {error}
            </Text>
          </View>
        )}

        {files && files.length === 0 && !loading && (
          <View
            style={{
              padding: spacing.sm,
              borderRadius: borderRadius.sm,
              backgroundColor: colors.background,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <ImageIcon size={18} color={colors.textSecondary} style={{ marginTop: 1 }} weight="duotone" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.xs, color: colors.text, fontWeight: fontWeight.semibold }}>
                Nog geen baked images
              </Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2, lineHeight: 16 }}>
                Zet je tier op "Free" hierboven, publiceer een post naar Snapchat (handmatig — geen live API), en tik dan op het refresh-icoon.
              </Text>
            </View>
          </View>
        )}

        {files && files.length > 0 && (
          <>
            {files.map((f, idx) => {
              // Compare each baked image's createdAt against current.savedAt
              // to indicate whether the image likely reflects current settings.
              // RECENT_BAKE_MS (5 min) is the trust window — anything baked
              // within that window of the settings fetch is assumed current.
              const bakedAt = f.createdAt ? new Date(f.createdAt).getTime() : 0;
              const isRecent = !!current && bakedAt > 0 && (current.savedAt - bakedAt) < RECENT_BAKE_MS;
              return (
              <View
                key={f.name}
                style={{
                  marginBottom: idx === files.length - 1 ? 0 : spacing.sm,
                  borderRadius: borderRadius.md,
                  borderWidth: 1,
                  borderColor: isRecent ? '#10B981' + '60' : colors.border,
                  overflow: 'hidden',
                  backgroundColor: colors.background,
                }}
              >
                <Pressable onPress={() => setZoomedUrl(f.signedUrl)}>
                  <Image
                    source={{ uri: f.signedUrl }}
                    style={{
                      width: '100%',
                      aspectRatio: 1,
                      backgroundColor: '#000',
                    }}
                    resizeMode="contain"
                  />
                  {/* Settings-match badge over the image */}
                  {current && (
                    <View
                      style={{
                        position: 'absolute',
                        top: 8, right: 8,
                        backgroundColor: isRecent ? 'rgba(16,185,129,0.95)' : 'rgba(245,158,11,0.95)',
                        paddingHorizontal: 8, paddingVertical: 4,
                        borderRadius: 6,
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                      }}
                    >
                      {isRecent
                        ? <CheckCircle size={11} color="#fff" weight="fill" />
                        : <WarningCircle size={11} color="#fff" weight="fill" />}
                      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                        {isRecent ? 'Huidige settings' : 'Andere settings'}
                      </Text>
                    </View>
                  )}
                </Pressable>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 6,
                    gap: 6,
                  }}
                >
                  <Clock size={11} color={colors.textSecondary} weight="duotone" />
                  <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                    {formatWhen(f.createdAt)}
                  </Text>
                  {f.sizeKb !== null && (
                    <>
                      <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>·</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                        {f.sizeKb < 1024 ? `${f.sizeKb} KB` : `${(f.sizeKb / 1024).toFixed(1)} MB`}
                      </Text>
                    </>
                  )}
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity
                    onPress={() => Linking.openURL(f.signedUrl)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <ArrowSquareOut size={14} color={colors.primary} weight="duotone" />
                  </TouchableOpacity>
                </View>
              </View>
              );
            })}
            <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 4, fontStyle: 'italic' }}>
              Signed URLs verlopen na 5 minuten — refresh om nieuwe te krijgen.
              {current && ' Groen = met huidige settings · Geel = met andere settings.'}
            </Text>
          </>
        )}
      </View>

      {/* ── Zoom modal ─────────────────────────────────────────────── */}
      <Modal
        visible={!!zoomedUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomedUrl(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.92)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: spacing.md,
          }}
          onPress={() => setZoomedUrl(null)}
        >
          {zoomedUrl && (
            <Image
              source={{ uri: zoomedUrl }}
              style={{ width: '100%', height: '85%' }}
              resizeMode="contain"
            />
          )}
          <View style={{ position: 'absolute', top: 50, right: 20 }}>
            <XCircle size={32} color="#ffffff" weight="fill" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
