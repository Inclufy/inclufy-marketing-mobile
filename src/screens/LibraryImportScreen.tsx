import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useImportLibraryZip } from '../hooks/useLibraryPosts';
import { useProducts } from '../hooks/useProducts';
import type { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';

import { CaretLeft, CheckCircle, Download, Info, Package, UploadSimple, XCircle } from 'phosphor-react-native';
// Lazy-loaded native modules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DocumentPicker: any = null;
try { DocumentPicker = require('expo-document-picker'); } catch { /* not available */ }

type Nav = NativeStackNavigationProp<RootStackParamList>;
type R = RouteProp<RootStackParamList, 'LibraryImport'>;

interface PickedFile {
  uri: string;
  name: string;
  size?: number;
}

export default function LibraryImportScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { colors } = useTheme();

  const { data: products = [] } = useProducts();
  const importMutation = useImportLibraryZip();

  const [productId, setProductId] = useState<string | null>(route.params?.productId ?? null);
  const [campaign, setCampaign] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ postsCreated: number; importId: string; campaign: string | null } | null>(null);

  async function pickFile() {
    if (!DocumentPicker) {
      Alert.alert('Niet beschikbaar', 'expo-document-picker is niet geïnstalleerd in deze build.');
      return;
    }
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'application/x-zip-compressed', '*/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset) return;
    if (!asset.name.toLowerCase().endsWith('.zip')) {
      Alert.alert('Verkeerd bestand', 'Selecteer een .zip bestand.');
      return;
    }
    setFile({ uri: asset.uri, name: asset.name, size: asset.size });
    setResult(null);
  }

  async function startImport() {
    if (!file) return;
    setProgress(0);
    setResult(null);

    try {
      const r = await importMutation.mutateAsync({
        fileUri: file.uri,
        fileName: file.name,
        productId,
        campaign: campaign.trim() || null,
        onUploadProgress: setProgress,
      });
      setResult(r);
    } catch (e) {
      Alert.alert('Import mislukt', (e as Error).message);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <CaretLeft size={24} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Library import</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Info card */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Info size={20} color={colors.primary} weight="regular" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>ZIP structuur</Text>
            <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
              {'manifest.json (verplicht)\nimages/<filename>.png|jpg|webp\n\nDe manifest beschrijft posts, talen, kanalen, captions en hashtags.'}
            </Text>
          </View>
        </View>

        {/* Product selection */}
        <Text style={[styles.label, { color: colors.text }]}>Product (optioneel)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <TouchableOpacity
            style={[styles.chip, !productId && { backgroundColor: colors.primary, borderColor: colors.primary }]}
            onPress={() => setProductId(null)}
          >
            <Text style={[styles.chipText, !productId && { color: '#fff' }]}>Geen</Text>
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

        {/* Campaign label (override) */}
        <Text style={[styles.label, { color: colors.text }]}>Campagne label (optioneel)</Text>
        <TextInput
          value={campaign}
          onChangeText={setCampaign}
          placeholder="Bijv. 2026-Q2-launch (manifest wint)"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
        />

        {/* File picker */}
        <Text style={[styles.label, { color: colors.text }]}>ZIP bestand</Text>
        <TouchableOpacity
          style={[styles.fileBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={pickFile}
          activeOpacity={0.7}
        >
          {file ? (
            <View style={styles.fileBoxRow}>
              <Package size={28} color={colors.primary} weight="duotone" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{file.name}</Text>
                <Text style={[styles.fileSize, { color: colors.textSecondary }]}>
                  {file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setFile(null)}>
                <XCircle size={22} color={colors.textSecondary} weight="fill" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.fileBoxEmpty}>
              <UploadSimple size={32} color={colors.primary} weight="duotone" />
              <Text style={[styles.fileEmptyText, { color: colors.text }]}>Tik om ZIP te selecteren</Text>
              <Text style={[styles.fileEmptyHint, { color: colors.textSecondary }]}>Max 100 MB</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Action button */}
        <TouchableOpacity
          style={[
            styles.startBtn,
            { backgroundColor: file ? colors.primary : colors.border },
            importMutation.isPending && { opacity: 0.6 },
          ]}
          onPress={startImport}
          disabled={!file || importMutation.isPending}
        >
          {importMutation.isPending ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={styles.startBtnText}>Importeren ({Math.round(progress * 100)}%)</Text>
            </>
          ) : (
            <>
              <Download size={20} color="#fff" weight="duotone" />
              <Text style={styles.startBtnText}>Start import</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Result */}
        {result && (
          <View style={[styles.resultCard, { backgroundColor: '#10B98120', borderColor: '#10B981' }]}>
            <CheckCircle size={28} color="#10B981" weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.resultTitle, { color: '#10B981' }]}>Import gelukt</Text>
              <Text style={[styles.resultBody, { color: colors.text }]}>
                {result.postsCreated} posts toegevoegd{result.campaign ? ` in campagne "${result.campaign}"` : ''}.
              </Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Library', { productId: productId ?? undefined })}>
              <Text style={[styles.resultLink, { color: colors.primary }]}>Bekijk →</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold as '700' },
  content: { padding: spacing.lg, gap: spacing.lg },

  infoCard: {
    flexDirection: 'row', gap: spacing.sm,
    padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1,
  },
  infoTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold as '600', marginBottom: 4 },
  infoBody: { fontSize: fontSize.xs, lineHeight: 16 },

  label: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold as '600', marginTop: spacing.md },

  chipsRow: { gap: spacing.sm, paddingVertical: 4 },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  chipText: { fontSize: fontSize.sm, color: '#475569' },

  input: {
    borderWidth: 1, borderRadius: borderRadius.md,
    padding: spacing.md, fontSize: fontSize.md,
  },

  fileBox: {
    borderWidth: 2, borderStyle: 'dashed',
    borderRadius: borderRadius.md, padding: spacing.lg,
  },
  fileBoxEmpty: { alignItems: 'center', gap: spacing.sm },
  fileEmptyText: { fontSize: fontSize.md, fontWeight: fontWeight.medium as '500' },
  fileEmptyHint: { fontSize: fontSize.xs },
  fileBoxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fileName: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold as '600' },
  fileSize: { fontSize: fontSize.xs, marginTop: 2 },

  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: borderRadius.full,
  },
  startBtnText: { color: '#fff', fontWeight: fontWeight.semibold as '600', fontSize: fontSize.md },

  resultCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1,
  },
  resultTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold as '700' },
  resultBody: { fontSize: fontSize.sm, marginTop: 2 },
  resultLink: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold as '600' },
});
