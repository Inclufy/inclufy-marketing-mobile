import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useLibraryPosts } from '../hooks/useLibraryPosts';
import { useProducts } from '../hooks/useProducts';
import type { RootStackParamList, LibraryPost, LibraryLanguage, LibraryPostStatus } from '../types';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';

import { CaretLeft, Clock, ImageBroken, Images, UploadSimple } from 'phosphor-react-native';
type Nav = NativeStackNavigationProp<RootStackParamList>;
type R = RouteProp<RootStackParamList, 'Library'>;

const STATUS_TABS: Array<{ key: LibraryPostStatus | 'all'; label: string }> = [
  { key: 'all', label: 'Alle' },
  { key: 'draft', label: 'Concept' },
  { key: 'scheduled', label: 'Gepland' },
  { key: 'published', label: 'Gepubliceerd' },
];

const LANGS: LibraryLanguage[] = ['nl', 'en', 'fr'];

const STATUS_COLOR: Record<LibraryPostStatus, string> = {
  draft: '#94A3B8',
  scheduled: '#3B82F6',
  publishing: '#F59E0B',
  published: '#10B981',
  failed: '#EF4444',
  archived: '#64748B',
};

export default function LibraryScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { colors } = useTheme();

  const initialProductId = route.params?.productId ?? null;
  const [productId, setProductId] = useState<string | null>(initialProductId);
  const [statusFilter, setStatusFilter] = useState<LibraryPostStatus | 'all'>('all');
  const [language, setLanguage] = useState<LibraryLanguage>('nl');

  const { data: products = [] } = useProducts();
  const { data: posts = [], isLoading, refetch, isRefetching } = useLibraryPosts({
    productId: productId ?? undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: posts.length };
    for (const p of posts) out[p.status] = (out[p.status] ?? 0) + 1;
    return out;
  }, [posts]);

  const renderPost = ({ item }: { item: LibraryPost }) => {
    const tr = item.translations[language] ?? item.translations[item.primary_language];
    const imageUrl = tr?.image_url ?? null;

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => navigation.navigate('LibraryPostDetail', { postId: item.id })}
        activeOpacity={0.85}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <ImageBroken size={32} color="#CBD5E1" weight="duotone" />
          </View>
        )}

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[item.status] }]} />
            <Text style={[styles.statusLabel, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.status}{item.campaign ? ` · ${item.campaign}` : ''}
            </Text>
          </View>

          <Text style={[styles.caption, { color: colors.text }]} numberOfLines={2}>
            {tr?.caption || '(geen caption)'}
          </Text>

          <View style={styles.channelsRow}>
            {item.channels.slice(0, 4).map((ch) => (
              <View key={ch} style={[styles.channelBadge, { backgroundColor: colors.background }]}>
                <Text style={[styles.channelText, { color: colors.textSecondary }]}>{ch}</Text>
              </View>
            ))}
          </View>

          {item.scheduled_for && (
            <Text style={[styles.scheduledText, { color: colors.textSecondary }]}>
              <Clock size={11} weight="duotone" /> {new Date(item.scheduled_for).toLocaleString('nl-NL')}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <CaretLeft size={24} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Content Library</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('LibraryImport', { productId: productId ?? undefined })}
          style={[styles.importBtn, { backgroundColor: colors.primary }]}
        >
          <UploadSimple size={16} color="#fff" weight="duotone" />
          <Text style={styles.importBtnText}>Import ZIP</Text>
        </TouchableOpacity>
      </View>

      {/* Product filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        <TouchableOpacity
          style={[styles.chip, !productId && { backgroundColor: colors.primary, borderColor: colors.primary }]}
          onPress={() => setProductId(null)}
        >
          <Text style={[styles.chipText, !productId && { color: '#fff' }]}>Alle producten</Text>
        </TouchableOpacity>
        {products.map((p) => {
          const active = productId === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              style={[styles.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setProductId(p.id)}
            >
              <Text style={[styles.chipText, active && { color: '#fff' }]}>{p.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Status tabs */}
      <View style={[styles.tabsRow, { borderBottomColor: colors.border }]}>
        {STATUS_TABS.map((tab) => {
          const active = statusFilter === tab.key;
          const count = counts[tab.key] ?? 0;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, active && { borderBottomColor: colors.primary }]}
              onPress={() => setStatusFilter(tab.key)}
            >
              <Text style={[styles.tabText, { color: active ? colors.primary : colors.textSecondary }]}>
                {tab.label} {count > 0 ? `(${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Language selector */}
      <View style={styles.langRow}>
        <Text style={[styles.langLabel, { color: colors.textSecondary }]}>Taal:</Text>
        {LANGS.map((l) => (
          <TouchableOpacity
            key={l}
            style={[styles.langBtn, language === l && { backgroundColor: colors.primary }]}
            onPress={() => setLanguage(l)}
          >
            <Text style={[styles.langText, language === l && { color: '#fff' }]}>{l.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : posts.length === 0 ? (
        <View style={styles.center}>
          <Images size={56} color={colors.textSecondary} weight="duotone" />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Geen posts in library</Text>
          <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
            Importeer een ZIP-bestand met gegenereerde post visuals.
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('LibraryImport', { productId: productId ?? undefined })}
          >
            <Text style={styles.emptyBtnText}>Eerste import</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={renderPost}
          contentContainerStyle={styles.list}
          numColumns={2}
          columnWrapperStyle={styles.column}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  title: { flex: 1, fontSize: fontSize.xl, fontWeight: fontWeight.bold as '700' },
  importBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  importBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold as '600' },

  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm, alignItems: 'center' },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  chipText: { fontSize: fontSize.sm, color: '#475569' },

  tabsRow: {
    flexDirection: 'row', borderBottomWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  tab: {
    paddingVertical: spacing.md, marginRight: spacing.lg,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium as '500' },

  langRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  langLabel: { fontSize: fontSize.xs },
  langBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: borderRadius.sm, borderWidth: 1, borderColor: '#E2E8F0',
  },
  langText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold as '600', color: '#475569' },

  list: { padding: spacing.md, gap: spacing.md },
  column: { gap: spacing.md },
  card: {
    flex: 1, borderRadius: borderRadius.md, borderWidth: 1, overflow: 'hidden',
    marginBottom: spacing.md,
  },
  cardImage: { width: '100%', aspectRatio: 1, backgroundColor: '#F1F5F9' },
  cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: spacing.sm, gap: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: fontSize.xs, flex: 1 },
  caption: { fontSize: fontSize.sm, fontWeight: fontWeight.medium as '500' },
  channelsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  channelBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: borderRadius.sm },
  channelText: { fontSize: 10 },
  scheduledText: { fontSize: 11, marginTop: 4 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold as '600' },
  emptyBody: { fontSize: fontSize.sm, textAlign: 'center' },
  emptyBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: borderRadius.full },
  emptyBtnText: { color: '#fff', fontWeight: fontWeight.semibold as '600' },
});
