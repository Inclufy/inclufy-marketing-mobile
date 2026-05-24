// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: icon> | Ionicons name=<dynamic: meta.icon>
// src/components/ChannelPreview.tsx
// Mock preview of how a Library post will render on each social channel.
// Used in LibraryPostDetailScreen to give the user a sense of the final look
// before tapping "Nu publiceren".

import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import type { Channel } from '../types';

import { Bookmark, ChatCircle, DotsThree, Heart, ImageBroken, PaperPlaneTilt } from 'phosphor-react-native';
const CHANNEL_META: Record<string, { name: string; color: string; icon: keyof typeof Ionicons.glyphMap | null; faIcon?: string }> = {
  linkedin:  { name: 'LinkedIn',  color: '#0A66C2', icon: 'logo-linkedin' },
  instagram: { name: 'Instagram', color: '#E1306C', icon: 'logo-instagram' },
  facebook:  { name: 'Facebook',  color: '#1877F2', icon: 'logo-facebook' },
  x:         { name: 'X',         color: '#000000', icon: 'logo-twitter' },
  tiktok:    { name: 'TikTok',    color: '#000000', icon: null, faIcon: 'tiktok' },
  whatsapp:  { name: 'WhatsApp',  color: '#25D366', icon: 'logo-whatsapp' },
};

interface Props {
  channel: Channel;
  accountName?: string | null;
  imageUrl?: string | null;
  caption?: string | null;
  hashtags?: string[];
}

export default function ChannelPreview({ channel, accountName, imageUrl, caption, hashtags }: Props) {
  const meta = CHANNEL_META[channel as string] ?? { name: channel, color: '#64748B', icon: null };
  const handleName = accountName ?? meta.name;
  const captionLine = caption ?? '';
  const tagsLine = hashtags && hashtags.length > 0 ? hashtags.join(' ') : '';

  // Channel-specific layouts
  if (channel === 'instagram') {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <ChannelBadge meta={meta} />
          <View style={styles.handleCol}>
            <Text style={styles.handle}>{handleName}</Text>
            <Text style={styles.subhandle}>Sponsored · Now</Text>
          </View>
        </View>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.imageSquare} resizeMode="cover" /> : <ImagePlaceholder />}
        <View style={styles.actionsRow}>
          <Heart size={22} color="#0F172A" weight="duotone" />
          <ChatCircle size={20} color="#0F172A" weight="duotone" />
          <PaperPlaneTilt size={20} color="#0F172A" weight="duotone" />
          <View style={{ flex: 1 }} />
          <Bookmark size={22} color="#0F172A" weight="duotone" />
        </View>
        <View style={styles.bodyPad}>
          <Text style={styles.igCaption}>
            <Text style={styles.handleInline}>{handleName} </Text>
            {captionLine}
          </Text>
          {tagsLine ? <Text style={styles.igHashtags}>{tagsLine}</Text> : null}
        </View>
      </View>
    );
  }

  if (channel === 'facebook') {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <ChannelBadge meta={meta} />
          <View style={styles.handleCol}>
            <Text style={styles.handle}>{handleName}</Text>
            <Text style={styles.subhandle}>Just now · 🌍</Text>
          </View>
          <DotsThree size={18} color="#64748B" weight="bold" />
        </View>
        <View style={styles.bodyPad}>
          {captionLine ? <Text style={styles.fbBody}>{captionLine}</Text> : null}
          {tagsLine ? <Text style={[styles.fbBody, styles.tagsBlue]}>{tagsLine}</Text> : null}
        </View>
        {imageUrl ? <NaturalImage uri={imageUrl} /> : <ImagePlaceholder />}
        <View style={styles.fbActions}>
          <ActionPill icon="thumbs-up-outline" label="Vind ik leuk" />
          <ActionPill icon="chatbubble-outline" label="Reageer" />
          <ActionPill icon="arrow-redo-outline" label="Deel" />
        </View>
      </View>
    );
  }

  // LinkedIn (default for unknown channels)
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <ChannelBadge meta={meta} />
        <View style={styles.handleCol}>
          <Text style={styles.handle}>{handleName}</Text>
          <Text style={styles.subhandle}>1u · 🌐</Text>
        </View>
        <DotsThree size={18} color="#64748B" weight="bold" />
      </View>
      <View style={styles.bodyPad}>
        {captionLine ? <Text style={styles.liBody}>{captionLine}</Text> : null}
        {tagsLine ? <Text style={[styles.liBody, styles.tagsBlue]}>{tagsLine}</Text> : null}
      </View>
      {imageUrl ? <NaturalImage uri={imageUrl} /> : <ImagePlaceholder />}
      <View style={styles.liActions}>
        <ActionPill icon="thumbs-up-outline" label="Like" />
        <ActionPill icon="chatbubble-outline" label="Comment" />
        <ActionPill icon="arrow-redo-outline" label="Repost" />
        <ActionPill icon="paper-plane-outline" label="Send" />
      </View>
    </View>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function ChannelBadge({ meta }: { meta: { name: string; color: string; icon: keyof typeof Ionicons.glyphMap | null; faIcon?: string } }) {
  return (
    <View style={[styles.badge, { backgroundColor: meta.color }]}>
      {meta.icon ? (
        <Ionicons name={meta.icon} size={20} color="#fff" />
      ) : meta.faIcon ? (
        <FontAwesome5 name={meta.faIcon as any} size={16} color="#fff" />
      ) : (
        <Text style={{ color: '#fff', fontWeight: '700' }}>{meta.name.charAt(0)}</Text>
      )}
    </View>
  );
}

function ActionPill({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.actionPill}>
      <Ionicons name={icon} size={16} color="#475569" />
      <Text style={styles.actionPillText}>{label}</Text>
    </View>
  );
}

function ImagePlaceholder() {
  return (
    <View style={[styles.imageWide, { backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }]}>
      <ImageBroken size={32} color="#CBD5E1" weight="duotone" />
    </View>
  );
}

// Image whose container matches the source's natural aspect ratio.
// LinkedIn and Facebook preserve uploaded image ratio in feed; mirror that here
// so the preview doesn't letterbox a non-square asset.
function NaturalImage({ uri, style }: { uri: string; style?: StyleProp<ImageStyle> }) {
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setErrored(false);
    setAspectRatio(null);
    if (!uri) {
      setErrored(true);
      return;
    }
    Image.getSize(
      uri,
      (w, h) => { if (!cancelled && w > 0 && h > 0) setAspectRatio(w / h); },
      (err) => {
        if (!cancelled) {
          // Surface failures instead of silently falling back to 1:1 — the parent
          // can render a placeholder via onError. Log so we keep visibility.
          console.warn('[ChannelPreview.NaturalImage] getSize failed for', uri, err);
          setErrored(true);
          setAspectRatio(1);
        }
      },
    );
    return () => { cancelled = true; };
  }, [uri]);
  return (
    <Image
      source={{ uri }}
      style={[styles.imageNatural, { aspectRatio: aspectRatio ?? 1 }, style]}
      resizeMode="cover"
      onError={(e) => {
        console.warn('[ChannelPreview.NaturalImage] image render failed', uri, e?.nativeEvent?.error);
        setErrored(true);
      }}
    />
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleCol: { flex: 1 },
  handle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  subhandle: { fontSize: 11, color: '#64748B', marginTop: 1 },
  handleInline: { fontWeight: '700', color: '#0F172A' },

  bodyPad: { paddingHorizontal: 12, paddingVertical: 8 },

  liBody: { fontSize: 13, lineHeight: 18, color: '#0F172A', marginBottom: 4 },
  fbBody: { fontSize: 13, lineHeight: 18, color: '#0F172A', marginBottom: 4 },
  tagsBlue: { color: '#0A66C2' },

  igCaption: { fontSize: 13, lineHeight: 18, color: '#0F172A' },
  igHashtags: { fontSize: 12, color: '#3B5998', marginTop: 4 },

  imageWide: { width: '100%', aspectRatio: 1, backgroundColor: '#F1F5F9' }, // legacy (placeholder only)
  imageSquare: { width: '100%', aspectRatio: 1, backgroundColor: '#F1F5F9' },
  imageNatural: { width: '100%', backgroundColor: '#F1F5F9' }, // aspectRatio set dynamically by NaturalImage

  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  liActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 4,
    paddingVertical: 4,
    justifyContent: 'space-around',
  },
  fbActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 4,
    paddingVertical: 4,
    justifyContent: 'space-around',
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actionPillText: { fontSize: 12, color: '#475569', fontWeight: '500' },
});
