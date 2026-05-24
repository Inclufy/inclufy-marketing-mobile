// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: item.is_default ? 'star' : 'star-outline'>
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../i18n';
import { colors as themeColors, fontWeight as fw, spacing, borderRadius } from '../theme';
import {
  useBrandKits,
  useCreateBrandKit,
  useUpdateBrandKit,
  useDeleteBrandKit,
  useSetDefaultBrandKit,
  type BrandKitInput,
} from '../hooks/useBrandMemory';
import type { BrandKit } from '../types';
import { pickAndUploadLogo } from '../utils/uploadLogo';
import { supabase } from '../services/supabase';

import { Diamond, Image as ImageIcon, Palette, PencilSimple, Plus, Trash, UploadSimple } from 'phosphor-react-native';
// ─── Color Presets ──────────────────────────────────────────────────
const COLOR_PRESETS = [
  '#DB2777', // Pink
  '#7C3AED', // Purple
  '#2563EB', // Blue
  '#059669', // Green
  '#D97706', // Amber
  '#DC2626', // Red
  '#0891B2', // Cyan
  '#4F46E5', // Indigo
];

const FONT_OPTIONS = [
  'system-ui',
  'Inter',
  'Roboto',
  'Montserrat',
  'Playfair Display',
  'Poppins',
  'Open Sans',
  'Lato',
];

// ─── Empty Form ─────────────────────────────────────────────────────
const EMPTY_FORM: BrandKitInput = {
  name: '',
  primary_color: '#7C3AED',
  secondary_color: '#DB2777',
  font_family: 'system-ui',
  logo_url: null,
  tagline: null,
  is_default: false,
};

// ─── Logo Image with error handling ─────────────────────────────────
function LogoImage({ uri, style, fallbackColor }: { uri: string; style: any; fallbackColor?: string }) {
  const [failed, setFailed] = React.useState(false);
  const [resolvedUri, setResolvedUri] = React.useState(uri);
  const { colors } = useTheme();

  React.useEffect(() => {
    setFailed(false);
    // If URL looks like a Supabase storage path (no signed token), try to get a signed URL
    if (uri && uri.includes('/storage/v1/object/public/')) {
      const path = uri.split('/storage/v1/object/public/media/')[1];
      if (path) {
        supabase.storage.from('media').createSignedUrl(path, 60 * 60 * 24 * 365)
          .then(({ data }) => {
            if (data?.signedUrl) setResolvedUri(data.signedUrl);
          })
          .catch(() => {});
      }
    } else {
      setResolvedUri(uri);
    }
  }, [uri]);

  if (failed || !uri) {
    return (
      <View style={[style, { justifyContent: 'center', alignItems: 'center', backgroundColor: (fallbackColor || colors.primary) + '20' }]}>
        <ImageIcon size={Math.min(style.width || 40, style.height || 40) / 2} color={fallbackColor || colors.primary} weight="duotone" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: resolvedUri }}
      style={style}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

// ─── Component ──────────────────────────────────────────────────────

export default function BrandKitScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const bk = t.brandKit;

  // Data
  const { data: brandKits = [], isLoading } = useBrandKits();
  const createMutation = useCreateBrandKit();
  const updateMutation = useUpdateBrandKit();
  const deleteMutation = useDeleteBrandKit();
  const setDefaultMutation = useSetDefaultBrandKit();

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingKit, setEditingKit] = useState<BrandKit | null>(null);
  const [form, setForm] = useState<BrandKitInput>(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);

  // ─── Handlers ───────────────────────────────────────────────────
  const openCreate = useCallback(() => {
    setEditingKit(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }, []);

  const openEdit = useCallback((kit: BrandKit) => {
    setEditingKit(kit);
    setForm({
      name: kit.name,
      primary_color: kit.primary_color,
      secondary_color: kit.secondary_color,
      font_family: kit.font_family,
      logo_url: kit.logo_url,
      tagline: kit.tagline,
      is_default: kit.is_default,
    });
    setModalVisible(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      Alert.alert(bk.nameRequired);
      return;
    }
    const hexRegex = /^#[0-9A-Fa-f]{6}$/;
    if (!hexRegex.test(form.primary_color) || !hexRegex.test(form.secondary_color)) {
      Alert.alert(bk.colorInvalid);
      return;
    }

    try {
      if (editingKit) {
        await updateMutation.mutateAsync({ id: editingKit.id, ...form });
      } else {
        await createMutation.mutateAsync(form);
      }
      setModalVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }, [form, editingKit, bk]);

  const handleDelete = useCallback((kit: BrandKit) => {
    Alert.alert(
      bk.deleteKit,
      bk.confirmDelete,
      [
        { text: bk.cancel, style: 'cancel' },
        {
          text: bk.deleteKit,
          style: 'destructive',
          onPress: () => deleteMutation.mutate(kit.id),
        },
      ],
    );
  }, [bk]);

  const handleSetDefault = useCallback((kit: BrandKit) => {
    if (!kit.is_default) {
      setDefaultMutation.mutate(kit.id);
    }
  }, []);

  const handlePickLogo = useCallback(async () => {
    try {
      setUploading(true);
      const url = await pickAndUploadLogo();
      if (url) {
        setForm(prev => ({ ...prev, logo_url: url }));
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setUploading(false);
    }
  }, []);

  // ─── Render Kit Card ────────────────────────────────────────────
  const renderKit = ({ item }: { item: BrandKit }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => openEdit(item)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          {item.logo_url ? (
            <LogoImage uri={item.logo_url} style={styles.logoThumb} fallbackColor={item.primary_color} />
          ) : (
            <View style={[styles.logoPlaceholder, { backgroundColor: item.primary_color + '20' }]}>
              <Palette size={20} color={item.primary_color} weight="fill" />
            </View>
          )}
          <View style={styles.cardText}>
            <View style={styles.nameRow}>
              <Text style={[styles.kitName, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.is_default && (
                <View style={[styles.defaultBadge, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={[styles.defaultBadgeText, { color: colors.primary }]}>Default</Text>
                </View>
              )}
            </View>
            {item.tagline ? (
              <Text style={[styles.tagline, { color: colors.textSecondary }]} numberOfLines={1}>
                {item.tagline}
              </Text>
            ) : null}
            <Text style={[styles.fontLabel, { color: colors.textTertiary }]}>
              {item.font_family}
            </Text>
          </View>
        </View>

        <View style={styles.cardRight}>
          <View style={styles.colorDots}>
            <View style={[styles.colorDot, { backgroundColor: item.primary_color }]} />
            <View style={[styles.colorDot, { backgroundColor: item.secondary_color, marginLeft: -6 }]} />
          </View>
        </View>
      </View>

      {/* Action buttons */}
      <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => handleSetDefault(item)}
        >
          <Ionicons
            name={item.is_default ? 'star' : 'star-outline'}
            size={18}
            color={item.is_default ? colors.accent : colors.textTertiary}
          />
          <Text style={[styles.actionText, { color: item.is_default ? colors.accent : colors.textTertiary }]}>
            {bk.setAsDefault}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => openEdit(item)}
        >
          <PencilSimple size={18} color={colors.textSecondary} weight="duotone" />
          <Text style={[styles.actionText, { color: colors.textSecondary }]}>
            {bk.editKit}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => handleDelete(item)}
        >
          <Trash size={18} color={colors.error} weight="duotone" />
          <Text style={[styles.actionText, { color: colors.error }]}>
            {bk.deleteKit}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  // ─── Empty State ────────────────────────────────────────────────
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Palette size={64} color={colors.textTertiary} weight="duotone" />
      <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{bk.noKits}</Text>
      <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>{bk.createFirst}</Text>
    </View>
  );

  // ─── Color Selector ────────────────────────────────────────────
  const ColorSelector = ({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) => (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.colorRow}>
        {COLOR_PRESETS.map(c => (
          <TouchableOpacity
            key={c}
            style={[
              styles.colorOption,
              { backgroundColor: c },
              value === c && { borderColor: colors.text, borderWidth: 3 },
            ]}
            onPress={() => onChange(c)}
          />
        ))}
      </View>
      <TextInput
        style={[styles.hexInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
        value={value}
        onChangeText={onChange}
        placeholder="#000000"
        placeholderTextColor={colors.textTertiary}
        maxLength={7}
        autoCapitalize="none"
      />
    </View>
  );

  // ─── Main Render ────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={brandKits}
          keyExtractor={item => item.id}
          renderItem={renderKit}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB — Add Brand Kit */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={openCreate}
        activeOpacity={0.85}
      >
        <Plus size={28} color="#fff" weight="bold" />
      </TouchableOpacity>

      {/* ─── Create / Edit Modal ───────────────────────────────── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          {/* Modal Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={[styles.modalCancel, { color: colors.textSecondary }]}>{bk.cancel}</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editingKit ? bk.editKit : bk.addKit}
            </Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.modalSave, { color: colors.primary }]}>{bk.save}</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Name */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{bk.kitName} *</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
                value={form.name}
                onChangeText={v => setForm(prev => ({ ...prev, name: v }))}
                placeholder={bk.kitName}
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            {/* Tagline */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{bk.tagline}</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
                value={form.tagline || ''}
                onChangeText={v => setForm(prev => ({ ...prev, tagline: v || null }))}
                placeholder={bk.tagline}
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            {/* Logo */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{bk.logo}</Text>
              <TouchableOpacity
                style={[styles.logoUploadBtn, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
                onPress={handlePickLogo}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : form.logo_url ? (
                  <LogoImage uri={form.logo_url} style={styles.logoPreview} />
                ) : (
                  <>
                    <UploadSimple size={28} color={colors.textTertiary} weight="duotone" />
                    <Text style={[styles.uploadText, { color: colors.textTertiary }]}>{bk.uploadLogo}</Text>
                  </>
                )}
              </TouchableOpacity>
              {form.logo_url && (
                <TouchableOpacity
                  style={styles.removeLogo}
                  onPress={() => setForm(prev => ({ ...prev, logo_url: null }))}
                >
                  <Text style={{ color: colors.error }}>{bk.removeLogo}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Primary Color */}
            <ColorSelector
              label={bk.primaryColor}
              value={form.primary_color}
              onChange={v => setForm(prev => ({ ...prev, primary_color: v }))}
            />

            {/* Secondary Color */}
            <ColorSelector
              label={bk.secondaryColor}
              value={form.secondary_color}
              onChange={v => setForm(prev => ({ ...prev, secondary_color: v }))}
            />

            {/* Font Family */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{bk.fontFamily}</Text>
              <View style={styles.fontGrid}>
                {FONT_OPTIONS.map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.fontChip,
                      { borderColor: colors.border, backgroundColor: colors.surfaceElevated },
                      form.font_family === f && { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
                    ]}
                    onPress={() => setForm(prev => ({ ...prev, font_family: f }))}
                  >
                    <Text
                      style={[
                        styles.fontChipText,
                        { color: form.font_family === f ? colors.primary : colors.textSecondary },
                      ]}
                    >
                      {f}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Default toggle */}
            <View style={[styles.fieldGroup, styles.switchRow]}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 0 }]}>
                {bk.isDefault}
              </Text>
              <Switch
                value={form.is_default}
                onValueChange={v => setForm(prev => ({ ...prev, is_default: v }))}
                trackColor={{ false: colors.border, true: colors.primary + '60' }}
                thumbColor={form.is_default ? colors.primary : colors.textTertiary}
              />
            </View>

            {/* Preview */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Preview</Text>
              <View
                style={[
                  styles.previewCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: form.primary_color,
                  },
                ]}
              >
                <View style={[styles.previewGradient, { backgroundColor: form.primary_color }]}>
                  {form.logo_url ? (
                    <LogoImage uri={form.logo_url} style={styles.previewLogo} />
                  ) : (
                    <Diamond size={24} color="#fff" weight="fill" />
                  )}
                </View>
                <View style={styles.previewBody}>
                  <Text style={[styles.previewName, { color: colors.text }]}>
                    {form.name || 'Brand Name'}
                  </Text>
                  {form.tagline ? (
                    <Text style={[styles.previewTagline, { color: colors.textSecondary }]}>
                      {form.tagline}
                    </Text>
                  ) : null}
                  <View style={styles.previewColors}>
                    <View style={[styles.previewColorBar, { backgroundColor: form.primary_color }]} />
                    <View style={[styles.previewColorBar, { backgroundColor: form.secondary_color }]} />
                  </View>
                </View>
              </View>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: 100,
  },

  // Card
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  logoThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  logoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardText: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kitName: {
    fontSize: 16,
    fontWeight: fw.semibold as any,
  },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  defaultBadgeText: {
    fontSize: 11,
    fontWeight: fw.semibold as any,
  },
  tagline: {
    fontSize: 13,
    marginTop: 2,
  },
  fontLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  cardRight: {
    marginLeft: spacing.sm,
  },
  colorDots: {
    flexDirection: 'row',
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: fw.medium as any,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: fw.semibold as any,
  },
  emptySubtitle: {
    fontSize: 14,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },

  // Modal
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalCancel: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: fw.semibold as any,
  },
  modalSave: {
    fontSize: 16,
    fontWeight: fw.semibold as any,
  },
  modalBody: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },

  // Fields
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: fw.medium as any,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: 14,
    fontSize: 16,
  },

  // Color
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  hexInput: {
    height: 40,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    fontSize: 14,
    width: 120,
  },

  // Font
  fontGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fontChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  fontChipText: {
    fontSize: 13,
    fontWeight: fw.medium as any,
  },

  // Logo
  logoUploadBtn: {
    height: 100,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  logoPreview: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  uploadText: {
    fontSize: 13,
  },
  removeLogo: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },

  // Switch row
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // Preview
  previewCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    overflow: 'hidden',
  },
  previewGradient: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  previewBody: {
    padding: spacing.md,
  },
  previewName: {
    fontSize: 16,
    fontWeight: fw.semibold as any,
  },
  previewTagline: {
    fontSize: 13,
    marginTop: 2,
  },
  previewColors: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  previewColorBar: {
    height: 6,
    flex: 1,
    borderRadius: 3,
  },
});
