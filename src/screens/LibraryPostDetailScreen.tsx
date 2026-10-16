// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: iconName as 'checkmark-circle'> | Ionicons name=<dynamic: selected ? 'checkmark-circle' : 'ellipse-outline'>
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import {
  useLibraryPost,
  useScheduleLibraryPost,
  usePublishLibraryPost,
  useDeleteLibraryPost,
} from '../hooks/useLibraryPosts';
import { useStrategyAlignment, type ChannelScore } from '../hooks/useStrategyAlignment';
import { channelLabel } from '../lib/channelRules';
import type { RootStackParamList, LibraryLanguage, Channel, LibraryPost } from '../types';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import ChannelPreview from '../components/ChannelPreview';

import { CaretLeft, ImageBroken, Rocket, Trash, X } from 'phosphor-react-native';
type Nav = NativeStackNavigationProp<RootStackParamList>;
type R = RouteProp<RootStackParamList, 'LibraryPostDetail'>;

const LANGS: LibraryLanguage[] = ['nl', 'en', 'fr'];

export default function LibraryPostDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { colors } = useTheme();

  const { data: post, isLoading } = useLibraryPost(route.params.postId);
  const scheduleMut = useScheduleLibraryPost();
  const publishMut = usePublishLibraryPost();

  // Map of platform → account_name for channel previews
  const { data: accountMap = {} } = useQuery({
    queryKey: ['social-accounts-map'],
    queryFn: async () => {
      const { data } = await supabase
        .from('social_accounts')
        .select('platform, account_name');
      const m: Record<string, string> = {};
      (data ?? []).forEach((a: { platform: string; account_name: string }) => {
        m[a.platform.toLowerCase()] = a.account_name;
      });
      return m;
    },
    staleTime: 5 * 60 * 1000,
  });
  const deleteMut = useDeleteLibraryPost();

  const [language, setLanguage] = useState<LibraryLanguage>('nl');

  // Channel picker modal — opens before publish so user can override
  // post.channels (default = whatever's in the DB) with any subset of
  // their connected platforms.
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);
  const [pickerChannels, setPickerChannels] = useState<Channel[]>([]);

  // Fetch user's connected platforms so picker shows everything they can publish to
  const { data: connectedChannels = [] } = useQuery<Channel[]>({
    queryKey: ['connected-channels-for-publish'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as Channel[];
      const { data: accounts } = await supabase
        .from('social_accounts')
        .select('platform')
        .eq('user_id', user.id)
        .in('status', ['active', 'connected']);
      const oauth = Array.from(new Set((accounts ?? []).map((a: any) => a.platform as Channel)));
      // Always include manual-share platforms
      return Array.from(new Set([...oauth, 'snapchat' as Channel, 'whatsapp' as Channel]));
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (!post) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Post niet gevonden</Text>
      </SafeAreaView>
    );
  }

  const tr = post.translations[language] ?? post.translations[post.primary_language];
  const availableLangs = LANGS.filter((l) => post.translations[l]);

  function publishNow() {
    if (!post) return;
    // Pre-fill with whatever's already on the post; user can add/remove
    setPickerChannels([...post.channels]);
    setChannelPickerOpen(true);
  }

  async function executePublish(chosen: Channel[]) {
    if (!post) return;
    if (chosen.length === 0) {
      Alert.alert('Geen kanalen', 'Kies minstens één kanaal om te publiceren.');
      return;
    }
    setChannelPickerOpen(false);
    Alert.alert(
      'Nu publiceren',
      `Post wordt direct gepubliceerd op: ${chosen.join(', ')} (${language.toUpperCase()})`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Publiceren',
          style: 'default',
          onPress: async () => {
            try {
              const r = await publishMut.mutateAsync({ postId: post.id, language, channels: chosen });
              if (r.ok) {
                Alert.alert('Gepubliceerd', 'Post staat live op alle gekozen kanalen.');
              } else {
                const errors = Object.entries(r.results)
                  .filter(([, v]) => v.error)
                  .map(([k, v]) => `${k}: ${v.error}`)
                  .join('\n');
                Alert.alert('Deels mislukt', errors || 'Onbekende fout');
              }
            } catch (e) {
              Alert.alert('Fout', (e as Error).message);
            }
          },
        },
      ],
    );
  }

  async function unschedule() {
    try {
      await scheduleMut.mutateAsync({ postId: post!.id, scheduledFor: null });
    } catch (e) {
      Alert.alert('Fout', (e as Error).message);
    }
  }

  async function scheduleIn(minutes: number) {
    const dt = new Date(Date.now() + minutes * 60_000).toISOString();
    try {
      await scheduleMut.mutateAsync({ postId: post!.id, scheduledFor: dt });
    } catch (e) {
      Alert.alert('Fout', (e as Error).message);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Post verwijderen?',
      'Deze actie kan niet ongedaan worden gemaakt.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijder',
          style: 'destructive',
          onPress: async () => {
            await deleteMut.mutateAsync(post!.id);
            navigation.goBack();
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <CaretLeft size={24} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {post.external_id ?? 'Library post'}
        </Text>
        <TouchableOpacity onPress={confirmDelete}>
          <Trash size={22} color={colors.textSecondary} weight="duotone" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Image preview */}
        {tr?.image_url ? (
          <Image source={{ uri: tr.image_url }} style={styles.preview} resizeMode="cover" />
        ) : (
          <View style={[styles.preview, styles.previewEmpty]}>
            <ImageBroken size={40} color="#CBD5E1" weight="duotone" />
          </View>
        )}

        {/* Language switcher */}
        <View style={styles.langRow}>
          {availableLangs.map((l) => (
            <TouchableOpacity
              key={l}
              style={[styles.langBtn, language === l && { backgroundColor: colors.primary }]}
              onPress={() => setLanguage(l)}
            >
              <Text style={[styles.langText, language === l && { color: '#fff' }]}>{l.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Caption */}
        <Text style={[styles.caption, { color: colors.text }]}>{tr?.caption || '(geen caption)'}</Text>
        {tr?.hashtags && tr.hashtags.length > 0 && (
          <Text style={[styles.hashtags, { color: colors.primary }]}>{tr.hashtags.join(' ')}</Text>
        )}
        {!!tr?.cta && (
          <View style={[styles.ctaBox, { backgroundColor: colors.primary }]}>
            <Text style={styles.ctaText}>{tr.cta}</Text>
          </View>
        )}

        {/* Meta info */}
        <View style={[styles.metaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Row label="Status" value={post.status} />
          <Row label="Type" value={post.post_type} />
          <Row label="Kanalen" value={post.channels.join(', ')} />
          {post.campaign && <Row label="Campagne" value={post.campaign} />}
          {post.scheduled_for && <Row label="Gepland" value={new Date(post.scheduled_for).toLocaleString('nl-NL')} />}
          {post.published_at && <Row label="Gepubliceerd" value={new Date(post.published_at).toLocaleString('nl-NL')} />}
        </View>

        {/* Channel previews */}
        {post.channels.length > 0 && (
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Preview per kanaal</Text>
            {post.channels.map((ch) => (
              <ChannelPreview
                key={ch}
                channel={ch}
                accountName={accountMap[String(ch).toLowerCase()]}
                imageUrl={tr?.image_url}
                caption={tr?.caption}
                hashtags={tr?.hashtags}
              />
            ))}
          </View>
        )}

        {/* Strategy alignment banner (soft warnings) */}
        {post.status !== 'published' && <AlignmentBanner post={post} />}

        {/* Actions */}
        {post.status !== 'published' && (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={publishNow}
              disabled={publishMut.isPending}
            >
              {publishMut.isPending ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Rocket size={18} color="#fff" weight="duotone" />
                  <Text style={styles.actionBtnText}>Nu publiceren</Text>
                </>
              )}
            </TouchableOpacity>

            {post.status === 'scheduled' ? (
              <TouchableOpacity style={[styles.actionBtnSecondary, { borderColor: colors.border }]} onPress={unschedule}>
                <Text style={{ color: colors.text }}>Schedule annuleren</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.scheduleRow}>
                <TouchableOpacity style={[styles.scheduleChip, { borderColor: colors.border }]} onPress={() => scheduleIn(60)}>
                  <Text style={{ color: colors.text }}>+1u</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.scheduleChip, { borderColor: colors.border }]} onPress={() => scheduleIn(60 * 24)}>
                  <Text style={{ color: colors.text }}>+1d</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.scheduleChip, { borderColor: colors.border }]} onPress={() => scheduleIn(60 * 24 * 7)}>
                  <Text style={{ color: colors.text }}>+1w</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* Publish results */}
        {Object.keys(post.publish_results).length > 0 && (
          <View style={[styles.metaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.metaTitle, { color: colors.text }]}>Publish resultaten</Text>
            {Object.entries(post.publish_results).map(([ch, r]) => (
              <Row
                key={ch}
                label={ch}
                value={r.error ? `❌ ${r.error}` : `✅ ${r.url ?? r.post_id ?? 'OK'}`}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Channel picker modal — opens from publishNow() */}
      <Modal visible={channelPickerOpen} animationType="slide" transparent onRequestClose={() => setChannelPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: spacing.lg, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={{ flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
                Kies kanalen
              </Text>
              <TouchableOpacity onPress={() => setChannelPickerOpen(false)}>
                <X size={24} color={colors.textSecondary} weight="bold" />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md }}>
              Selecteer waar je deze post wilt publiceren. Standaard: kanalen uit de post.
            </Text>
            <ScrollView>
              {connectedChannels.map((ch) => {
                const selected = pickerChannels.includes(ch);
                return (
                  <TouchableOpacity
                    key={ch}
                    onPress={() => setPickerChannels((prev) => (selected ? prev.filter((x) => x !== ch) : [...prev, ch]))}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                      padding: spacing.md, borderRadius: borderRadius.md, marginBottom: 6,
                      backgroundColor: selected ? colors.primary + '15' : colors.surface,
                      borderWidth: 1.5, borderColor: selected ? colors.primary : colors.border,
                    }}
                  >
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={selected ? colors.primary : colors.textTertiary}
                    />
                    <Text style={{ flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                      {channelLabel(ch)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {connectedChannels.length === 0 && (
                <Text style={{ color: colors.textSecondary, padding: spacing.md }}>
                  Geen verbonden kanalen gevonden. Verbind eerst social-accounts via Instellingen.
                </Text>
              )}
            </ScrollView>
            <TouchableOpacity
              onPress={() => executePublish(pickerChannels)}
              disabled={pickerChannels.length === 0}
              style={{
                marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.md,
                backgroundColor: pickerChannels.length === 0 ? colors.border : colors.primary,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>
                Publiceer op {pickerChannels.length} kanalen
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function paletteForScore(score: number, colors: { text: string }) {
  if (score >= 80) return { bg: '#10B98115', border: '#10B981', icon: '#10B981', text: '#065F46' };
  if (score >= 50) return { bg: '#F59E0B15', border: '#F59E0B', icon: '#F59E0B', text: colors.text };
  return { bg: '#EF444415', border: '#EF4444', icon: '#EF4444', text: colors.text };
}

function AlignmentBanner({ post }: { post: LibraryPost }) {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const alignment = useStrategyAlignment(post);
  const [expanded, setExpanded] = useState(false);

  const palette =
    alignment.status === 'no_strategy'
      ? { bg: '#94A3B815', border: '#94A3B8', icon: '#475569', text: colors.text }
      : paletteForScore(alignment.overallScore, colors);

  const iconName =
    alignment.status === 'ok' ? 'checkmark-circle'
    : alignment.status === 'no_strategy' ? 'information-circle'
    : alignment.overallScore >= 50 ? 'warning' : 'alert-circle';

  const headline =
    alignment.status === 'no_strategy'
      ? 'Geen actieve strategie'
      : alignment.status === 'ok'
      ? `Aligned met strategie · ${alignment.alignedChannels.length}/${post.channels.length} kanalen`
      : `Channel-fit: ${alignment.overallScore}/100 · ${alignment.warnings.length} waarschuwing${alignment.warnings.length === 1 ? '' : 'en'}`;

  return (
    <View style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <View style={styles.bannerHeader}>
        <Ionicons name={iconName as 'checkmark-circle'} size={20} color={palette.icon} />
        <Text style={[styles.bannerHeadline, { color: palette.text }]}>{headline}</Text>
      </View>

      {/* Per-channel score chips */}
      {alignment.channelScores.length > 0 && (
        <View style={styles.scoreRow}>
          {alignment.channelScores.map((cs) => (
            <ChannelScoreChip key={cs.channel} score={cs} />
          ))}
        </View>
      )}

      {alignment.warnings.length > 0 && (
        <TouchableOpacity onPress={() => setExpanded((e) => !e)} activeOpacity={0.7}>
          <Text style={[styles.bannerToggle, { color: palette.icon }]}>
            {expanded ? '▾ Verberg details' : `▸ Toon details (${alignment.warnings.length})`}
          </Text>
        </TouchableOpacity>
      )}

      {expanded && alignment.warnings.length > 0 && (
        <View style={styles.bannerWarnings}>
          {alignment.warnings.map((w, i) => (
            <Text key={i} style={[styles.bannerWarning, { color: palette.text }]}>
              • {w.message}
            </Text>
          ))}
        </View>
      )}

      {alignment.status !== 'ok' && (
        <View style={styles.bannerCtaRow}>
          <TouchableOpacity
            style={[styles.bannerCta, { borderColor: palette.border }]}
            onPress={() => navigation.navigate('MarketingStrategy')}
          >
            <Text style={[styles.bannerCtaText, { color: palette.icon }]}>
              {alignment.needsSetup ? 'Strategie instellen →' : 'Strategie aanpassen →'}
            </Text>
          </TouchableOpacity>
          {!alignment.needsSetup && (
            <TouchableOpacity
              style={[styles.bannerCta, { borderColor: palette.border }]}
              onPress={() => navigation.navigate('Personas')}
            >
              <Text style={[styles.bannerCtaText, { color: palette.icon }]}>Persona's beheren →</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Text style={[styles.bannerHint, { color: colors.textSecondary }]}>
        Dit is een waarschuwing — je kunt nog steeds publiceren.
      </Text>
    </View>
  );
}

function ChannelScoreChip({ score }: { score: ChannelScore }) {
  const { colors } = useTheme();
  const p = paletteForScore(score.score, colors);
  return (
    <View style={[styles.scoreChip, { backgroundColor: p.bg, borderColor: p.border }]}>
      <Text style={[styles.scoreChipChannel, { color: p.text }]}>{channelLabel(score.channel)}</Text>
      <Text style={[styles.scoreChipScore, { color: p.icon }]}>{score.score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.bold as '700' },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },

  preview: { width: '100%', aspectRatio: 1, borderRadius: borderRadius.md, backgroundColor: '#F1F5F9' },
  previewEmpty: { alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold as '600', marginBottom: spacing.xs },

  langRow: { flexDirection: 'row', gap: spacing.sm },
  langBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm, borderWidth: 1, borderColor: '#E2E8F0',
  },
  langText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold as '600', color: '#475569' },

  caption: { fontSize: fontSize.md, lineHeight: 22 },
  hashtags: { fontSize: fontSize.sm },
  ctaBox: { padding: spacing.md, borderRadius: borderRadius.full, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: fontWeight.semibold as '600' },

  metaCard: {
    padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, gap: spacing.sm,
  },
  metaTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold as '600', marginBottom: 4 },
  row: { flexDirection: 'row', gap: spacing.md },
  rowLabel: { fontSize: fontSize.sm, width: 100 },
  rowValue: { fontSize: fontSize.sm, flex: 1, fontWeight: fontWeight.medium as '500' },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: borderRadius.full,
  },
  actionBtnText: { color: '#fff', fontWeight: fontWeight.semibold as '600' },
  actionBtnSecondary: {
    paddingVertical: spacing.md, borderRadius: borderRadius.full,
    borderWidth: 1, alignItems: 'center',
  },
  scheduleRow: { flexDirection: 'row', gap: spacing.sm },
  scheduleChip: {
    flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.full,
    borderWidth: 1, alignItems: 'center',
  },

  banner: {
    padding: spacing.md, borderRadius: borderRadius.md,
    borderWidth: 1, gap: spacing.sm,
  },
  bannerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bannerHeadline: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold as '600', flex: 1 },
  bannerWarnings: { gap: 4, paddingLeft: spacing.lg },
  bannerWarning: { fontSize: fontSize.xs, lineHeight: 16 },
  bannerCta: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: borderRadius.full, borderWidth: 1,
    marginTop: 4,
  },
  bannerCtaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  bannerCtaText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold as '600' },
  bannerHint: { fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  bannerToggle: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold as '600', marginTop: 4 },
  scoreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  scoreChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: borderRadius.full, borderWidth: 1,
  },
  scoreChipChannel: { fontSize: 11, fontWeight: fontWeight.medium as '500' },
  scoreChipScore: { fontSize: 13, fontWeight: fontWeight.bold as '700' },
});
