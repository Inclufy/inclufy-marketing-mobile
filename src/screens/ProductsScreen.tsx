// TODO: migrate to Phosphor — unmapped icons: MaterialCommunityIcons name=<dynamic: CAT_ICONS[cat]> | MaterialCommunityIcons name=<dynamic: CAT_ICONS[item.category] || 'package-variant'>
import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Alert,
  ActivityIndicator, ScrollView, Image, Modal, Platform, Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import {
  useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, Product,
} from '../hooks/useProducts';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../services/supabase';

import { ArrowLeft, CameraPlus, MagnifyingGlass, Package, Plus, SealCheck, XCircle } from 'phosphor-react-native';
// ── Upload product image ──────────────────────────────────────────────────────

async function uploadProductImage(localUri: string): Promise<string> {
  const { data: { user } = {} as any } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const ext = localUri.split('.').pop()?.split('?')[0] || 'jpg';
  const storagePath = `products/${user.id}/product_${Date.now()}.${ext}`;
  const response = await fetch(localUri);
  const blob = await response.blob();
  const contentType = blob.type || 'image/jpeg';
  const { error } = await supabase.storage
    .from('media').upload(storagePath, blob, { contentType, upsert: true });
  if (error) throw error;
  const { data: signData } = await supabase.storage.from('media').createSignedUrl(storagePath, 60 * 60 * 24 * 365);
  if (signData?.signedUrl) return signData.signedUrl;
  const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath);
  return urlData.publicUrl;
}

type CategoryFilter = 'all' | 'product' | 'service' | 'solution';
const FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'Alle' }, { key: 'product', label: 'Producten' },
  { key: 'service', label: 'Services' }, { key: 'solution', label: 'Solutions' },
];
const CAT_COLORS: Record<string, string> = { product: '#3B82F6', service: '#8B5CF6', solution: '#F59E0B' };
const CAT_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  product: 'cube-outline', service: 'cog-outline', solution: 'lightbulb-outline',
};
const EMPTY_FORM = {
  name: '', description: '', category: 'product' as Product['category'],
  price: '', usps: '', tags: '', website_url: '', image_url: null as string | null,
  status: 'active' as Product['status'],
};
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ProductsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const s = useThemedStyles((c) => ({
    root: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row' as const, alignItems: 'center' as const,
      paddingHorizontal: spacing.lg, paddingTop: Platform.OS === 'ios' ? 60 : 40,
      paddingBottom: spacing.md, backgroundColor: c.surface, gap: spacing.sm,
    },
    filterRow: {
      flexDirection: 'row' as const, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      backgroundColor: c.surface, gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    searchRow: {
      flexDirection: 'row' as const, alignItems: 'center' as const, marginHorizontal: spacing.md,
      marginTop: spacing.md, marginBottom: spacing.xs, backgroundColor: c.surface,
      borderRadius: borderRadius.md, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: spacing.sm, height: 44,
    },
    card: {
      backgroundColor: c.surface, borderRadius: borderRadius.lg, overflow: 'hidden' as const,
      flex: 1, margin: spacing.xs, maxWidth: '50%' as unknown as number, ...subtleShadow,
    },
    fab: {
      position: 'absolute' as const, bottom: 24, right: 24, width: 56, height: 56,
      borderRadius: 28, backgroundColor: c.primary, justifyContent: 'center' as const,
      alignItems: 'center' as const, elevation: 6, shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12,
    },
    modalHead: {
      flexDirection: 'row' as const, justifyContent: 'space-between' as const,
      alignItems: 'center' as const, paddingHorizontal: spacing.md, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface,
    },
    label: {
      fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: c.textSecondary,
      marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: 0.5,
    },
    input: {
      height: 48, borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: 14,
      fontSize: fontSize.md, color: c.text, borderColor: c.border, backgroundColor: c.surfaceElevated,
    },
    multiInput: {
      minHeight: 80, borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: 14,
      paddingVertical: 12, fontSize: fontSize.sm, color: c.text, borderColor: c.border,
      backgroundColor: c.surfaceElevated, textAlignVertical: 'top' as const,
    },
  }));

  const { data: products = [], isLoading, refetch, isRefetching } = useProducts();
  const createM = useCreateProduct();
  const updateM = useUpdateProduct();
  const deleteM = useDeleteProduct();

  const [catFilter, setCatFilter] = useState<CategoryFilter>('all');
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const filtered = products.filter((p) => {
    if (catFilter !== 'all' && p.category !== catFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      || p.tags.some((t) => t.toLowerCase().includes(q));
  });

  const openCreate = useCallback(() => { setEditing(null); setForm(EMPTY_FORM); setModalVisible(true); }, []);

  const openEdit = useCallback((p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, description: p.description, category: p.category, price: p.price,
      usps: p.usps.join(', '), tags: p.tags.join(', '),
      website_url: p.website_url || '', image_url: p.image_url, status: p.status,
    });
    setModalVisible(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { Alert.alert('Fout', 'Naam is verplicht'); return; }

    // Upload local image to Supabase storage before saving
    let finalImageUrl = form.image_url;
    if (finalImageUrl && finalImageUrl.startsWith('file://')) {
      try {
        finalImageUrl = await uploadProductImage(finalImageUrl);
      } catch (e: any) {
        Alert.alert('Upload mislukt', e.message || 'Afbeelding kon niet worden geüpload.');
        return;
      }
    }

    const payload: Partial<Product> = {
      name: form.name.trim(), description: form.description.trim(), category: form.category,
      price: form.price.trim(), status: form.status,
      usps: form.usps.split(',').map((x) => x.trim()).filter(Boolean),
      tags: form.tags.split(',').map((x) => x.trim()).filter(Boolean),
      website_url: form.website_url.trim() || null, image_url: finalImageUrl,
    };
    try {
      if (editing) await updateM.mutateAsync({ id: editing.id, ...payload });
      else await createM.mutateAsync(payload);
      setModalVisible(false);
    } catch (e: any) { Alert.alert('Error', e.message); }
  }, [form, editing]);

  const handleDelete = useCallback((p: Product) => {
    Alert.alert('Verwijderen', `Weet je zeker dat je "${p.name}" wilt verwijderen?`, [
      { text: 'Annuleren', style: 'cancel' },
      { text: 'Verwijderen', style: 'destructive', onPress: () => deleteM.mutate(p.id) },
    ]);
  }, []);

  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Toestemming vereist', 'Geef toegang tot je fotobibliotheek.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!res.canceled && res.assets[0]) setForm((p) => ({ ...p, image_url: res.assets[0].uri }));
  }, []);

  const upd = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  // ─── Render helpers ───────────────────────────────────────────────

  const renderCard = ({ item }: { item: Product }) => {
    const cc = CAT_COLORS[item.category] || colors.primary;
    return (
      <TouchableOpacity style={s.card} onPress={() => openEdit(item)}
        onLongPress={() => handleDelete(item)} activeOpacity={0.8}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }}
            style={{ width: '100%', height: 120, backgroundColor: colors.surfaceElevated }} resizeMode="cover" />
        ) : (
          <View style={{ width: '100%', height: 120, backgroundColor: cc + '15',
            justifyContent: 'center', alignItems: 'center' }}>
            <MaterialCommunityIcons name={CAT_ICONS[item.category] || 'package-variant'} size={40} color={cc} />
          </View>
        )}
        <View style={{ padding: spacing.sm }}>
          <View style={{ backgroundColor: cc + '20', paddingHorizontal: 8, paddingVertical: 2,
            borderRadius: borderRadius.sm, alignSelf: 'flex-start', marginBottom: 6 }}>
            <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: cc }}>
              {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
            </Text>
          </View>
          <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}
            numberOfLines={1}>{item.name}</Text>
          {item.price ? <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold,
            color: colors.primary, marginTop: 4 }}>{item.price}</Text> : null}
          {item.usps.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceElevated,
              paddingHorizontal: 6, paddingVertical: 2, borderRadius: borderRadius.sm,
              marginTop: 6, alignSelf: 'flex-start', gap: 3 }}>
              <SealCheck size={12} color={colors.success} weight="fill" />
              <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                {item.usps.length} USP{item.usps.length !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={{ alignItems: 'center', paddingTop: 80, gap: 12, paddingHorizontal: spacing.lg }}>
      <Package size={64} color={colors.textTertiary} weight="duotone" />
      <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textSecondary }}>
        Nog geen producten
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary, textAlign: 'center' }}>
        Voeg je eerste product of service toe om te beginnen.
      </Text>
      <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary,
        paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.full,
        gap: 6, marginTop: spacing.sm }} onPress={openCreate}>
        <Plus size={20} color="#fff" weight="bold" />
        <Text style={{ color: '#fff', fontWeight: fontWeight.semibold, fontSize: fontSize.sm }}>
          Product toevoegen
        </Text>
      </TouchableOpacity>
    </View>
  );

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );

  // ─── Return ───────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: spacing.xs }}>
          <ArrowLeft size={24} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <Package size={28} color={colors.primary} weight="duotone" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text }}>
            Producten & Services
          </Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
            {products.length} item{products.length !== 1 ? 's' : ''} in je catalogus
          </Text>
        </View>
      </View>

      {/* Filter Chips */}
      <View style={s.filterRow}>
        {FILTERS.map((f) => {
          const active = catFilter === f.key;
          return (
            <TouchableOpacity key={f.key} style={{ paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs + 2, borderRadius: borderRadius.full,
              backgroundColor: active ? colors.primary : colors.borderLight }}
              onPress={() => setCatFilter(f.key)}>
              <Text style={{ fontSize: fontSize.sm, color: active ? colors.textOnPrimary : colors.textSecondary,
                fontWeight: active ? fontWeight.semibold : fontWeight.normal }}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <MagnifyingGlass size={20} color={colors.textTertiary} weight="bold" />
        <TextInput style={{ flex: 1, marginLeft: 8, fontSize: fontSize.sm, color: colors.text }}
          placeholder="Zoek producten, services..." placeholderTextColor={colors.textTertiary}
          value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <XCircle size={18} color={colors.textTertiary} weight="fill" />
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList data={filtered} keyExtractor={(i) => i.id} renderItem={renderCard}
          numColumns={2} contentContainerStyle={{ padding: spacing.xs, paddingBottom: 100 }}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          ListEmptyComponent={renderEmpty} showsVerticalScrollIndicator={false}
          refreshing={isRefetching} onRefresh={refetch} />
      )}

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={openCreate} activeOpacity={0.85}>
        <Plus size={28} color="#fff" weight="bold" />
      </TouchableOpacity>

      {/* ─── Edit Modal ──────────────────────────────────────────── */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={s.modalHead}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={{ fontSize: fontSize.md, color: colors.textSecondary }}>Annuleren</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: fontWeight.semibold, color: colors.text }}>
              {editing ? 'Product bewerken' : 'Nieuw product'}
            </Text>
            <TouchableOpacity onPress={handleSave} disabled={createM.isPending || updateM.isPending}>
              {createM.isPending || updateM.isPending
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold,
                    color: colors.primary }}>Opslaan</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md }}
            showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Image */}
            <Field label="Afbeelding">
              <TouchableOpacity style={{ height: 140, borderWidth: 1, borderRadius: borderRadius.md,
                borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surfaceElevated,
                justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }} onPress={pickImage}>
                {form.image_url
                  ? <Image source={{ uri: form.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  : <>
                      <CameraPlus size={32} color={colors.textTertiary} weight="duotone" />
                      <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 6 }}>
                        Tik om afbeelding te kiezen
                      </Text>
                    </>}
              </TouchableOpacity>
              {form.image_url && (
                <TouchableOpacity style={{ marginTop: 8 }}
                  onPress={() => setForm((p) => ({ ...p, image_url: null }))}>
                  <Text style={{ color: colors.error, fontSize: fontSize.xs }}>Afbeelding verwijderen</Text>
                </TouchableOpacity>
              )}
            </Field>

            <Field label="Naam *">
              <TextInput style={s.input} value={form.name} onChangeText={(v) => upd('name', v)}
                placeholder="Productnaam" placeholderTextColor={colors.textTertiary} />
            </Field>

            <Field label="Beschrijving">
              <TextInput style={s.multiInput} value={form.description}
                onChangeText={(v) => upd('description', v)}
                placeholder="Beschrijf je product of service..." placeholderTextColor={colors.textTertiary}
                multiline numberOfLines={4} />
            </Field>

            {/* Category Picker */}
            <Field label="Categorie">
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {(['product', 'service', 'solution'] as const).map((cat) => {
                  const active = form.category === cat;
                  const cc = CAT_COLORS[cat];
                  return (
                    <TouchableOpacity key={cat} style={{ flex: 1, paddingVertical: spacing.sm,
                      borderRadius: borderRadius.md, borderWidth: 1, alignItems: 'center',
                      borderColor: active ? cc : colors.border,
                      backgroundColor: active ? cc + '15' : colors.surfaceElevated }}
                      onPress={() => setForm((p) => ({ ...p, category: cat }))}>
                      <MaterialCommunityIcons name={CAT_ICONS[cat]} size={20}
                        color={active ? cc : colors.textTertiary} />
                      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium,
                        color: active ? cc : colors.textSecondary, marginTop: 4 }}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>

            <Field label="Prijs">
              <TextInput style={s.input} value={form.price} onChangeText={(v) => upd('price', v)}
                placeholder="bijv. vanaf 499/maand" placeholderTextColor={colors.textTertiary} />
            </Field>

            <Field label="USPs (kommagescheiden)">
              <TextInput style={[s.multiInput, { minHeight: 60 }]} value={form.usps}
                onChangeText={(v) => upd('usps', v)} placeholder="USP 1, USP 2, USP 3"
                placeholderTextColor={colors.textTertiary} multiline />
            </Field>

            <Field label="Tags (kommagescheiden)">
              <TextInput style={s.input} value={form.tags} onChangeText={(v) => upd('tags', v)}
                placeholder="SaaS, B2B, Marketing" placeholderTextColor={colors.textTertiary} />
            </Field>

            <Field label="Website URL">
              <TextInput style={s.input} value={form.website_url}
                onChangeText={(v) => upd('website_url', v)} placeholder="https://www.voorbeeld.nl"
                placeholderTextColor={colors.textTertiary} keyboardType="url"
                autoCapitalize="none" autoCorrect={false} />
            </Field>

            {/* Status Toggle */}
            <Field label="Status">
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: colors.surfaceElevated, borderRadius: borderRadius.md,
                borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 }}>
                <Text style={{ fontSize: fontSize.sm, color: colors.text }}>
                  {form.status === 'active' ? 'Actief' : 'Gearchiveerd'}
                </Text>
                <Switch value={form.status === 'active'}
                  onValueChange={(v) => setForm((p) => ({ ...p, status: v ? 'active' : 'archived' }))}
                  trackColor={{ false: colors.border, true: colors.primary + '60' }}
                  thumbColor={form.status === 'active' ? colors.primary : colors.textTertiary} />
              </View>
            </Field>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
