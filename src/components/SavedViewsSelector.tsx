// src/components/SavedViewsSelector.tsx
// Mobile RN counterpart of inclufy-marketing-web/src/components/SavedViewsSelector.tsx.
// Drop-in selector for the polymorphic saved_views table.
//
// Pattern:
//   const [filters, setFilters] = useState<MyShape>(DEFAULTS);
//   <SavedViewsSelector
//     entityType="opportunity"
//     currentFilters={filters}
//     onApply={(v) => setFilters(v.filters as MyShape)}
//   />
//
// Renders as a chip-row of saved views with a "+ save" affordance.
// On mobile we trade the web's dropdown menu for a horizontal scroll
// because dropdowns are awkward in touch contexts.

import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Modal,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useSavedViews, useSaveView, useDeleteSavedView,
  type SavedView,
} from '../hooks/useSavedViews';
import { useTheme } from '../context/ThemeContext';

interface Props<F> {
  entityType: string;
  currentFilters: F;
  onApply: (view: SavedView<F>) => void;
  /** Optional label rendered to the left of the chip-row. */
  label?: string;
}

export function SavedViewsSelector<F = Record<string, unknown>>({
  entityType, currentFilters, onApply, label,
}: Props<F>) {
  const { colors } = useTheme();
  const { data: views = [], isLoading } = useSavedViews<F>(entityType);
  const save = useSaveView<F>();
  const del = useDeleteSavedView();

  const [modalOpen, setModalOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [currentId, setCurrentId] = useState<string | null>(null);

  // Use the user's default as initial selection if no manual pick yet.
  const effectiveId = currentId ?? views.find((v) => v.is_default)?.id ?? null;

  const handlePick = (v: SavedView<F>) => {
    setCurrentId(v.id);
    onApply(v);
  };

  const handleSave = async () => {
    const name = draftName.trim();
    if (!name) return;
    try {
      const v = await save.mutateAsync({
        entity_type: entityType,
        name,
        filters: currentFilters,
      });
      setCurrentId(v.id);
      setModalOpen(false);
      setDraftName('');
    } catch (e: any) {
      Alert.alert('Opslaan mislukt', e?.message ?? 'Onbekende fout');
    }
  };

  const handleSetDefault = async (v: SavedView<F>) => {
    try {
      await save.mutateAsync({ ...v, is_default: true });
    } catch (e: any) {
      Alert.alert('Mislukt', e?.message ?? '?');
    }
  };

  const handleDelete = (v: SavedView<F>) => {
    Alert.alert(
      'Weergave verwijderen?',
      v.name,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijder',
          style: 'destructive',
          onPress: async () => {
            try {
              await del.mutateAsync({ id: v.id, entity_type: entityType });
              if (currentId === v.id) setCurrentId(null);
            } catch (e: any) {
              Alert.alert('Mislukt', e?.message ?? '?');
            }
          },
        },
      ],
    );
  };

  const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
    label: { fontSize: 12, color: colors.textSecondary, marginRight: 4 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.border,
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: { color: colors.text, fontSize: 13, fontWeight: '500' as const },
    chipTextActive: { color: '#fff' },
    saveChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary,
    },
    saveChipText: { color: colors.primary, fontSize: 13, fontWeight: '500' as const },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
    modalCard: {
      backgroundColor: colors.background, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: colors.border,
    },
    modalTitle: { color: colors.text, fontSize: 16, fontWeight: '600' as const, marginBottom: 12 },
    input: {
      backgroundColor: colors.surface, borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 10,
      color: colors.text, fontSize: 14,
      borderWidth: 1, borderColor: colors.border,
      marginBottom: 8,
    },
    modalListTitle: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' as const, marginTop: 8, marginBottom: 6, textTransform: 'uppercase' as const },
    listRow: {
      flexDirection: 'row' as const, alignItems: 'center' as const,
      paddingVertical: 8, paddingHorizontal: 4, gap: 8,
    },
    listName: { flex: 1, color: colors.text, fontSize: 14 },
    btnRow: { flexDirection: 'row' as const, gap: 8, marginTop: 8 },
    btnPrimary: {
      flex: 1, backgroundColor: colors.primary,
      paddingVertical: 10, borderRadius: 8, alignItems: 'center' as const,
    },
    btnSecondary: {
      flex: 1, backgroundColor: colors.surface,
      paddingVertical: 10, borderRadius: 8, alignItems: 'center' as const,
      borderWidth: 1, borderColor: colors.border,
    },
    btnText: { color: '#fff', fontSize: 14, fontWeight: '600' as const },
    btnTextSecondary: { color: colors.text, fontSize: 14, fontWeight: '600' as const },
  });

  const sortedViews = useMemo(
    () => [...views].sort((a, b) => Number(b.is_default) - Number(a.is_default)),
    [views],
  );

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {label && <Text style={styles.label}>{label}</Text>}

        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <>
            {sortedViews.map((v) => {
              const active = v.id === effectiveId;
              return (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => handlePick(v)}
                  onLongPress={() => setModalOpen(true)}
                >
                  {v.is_default && (
                    <Ionicons name="star" size={11} color={active ? '#fff' : '#F59E0B'} />
                  )}
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{v.name}</Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.saveChip} onPress={() => setModalOpen(true)}>
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={styles.saveChipText}>Opslaan</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Modal for save + manage */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Opgeslagen weergaven</Text>

            <TextInput
              style={styles.input}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Naam voor deze weergave"
              placeholderTextColor={colors.textSecondary}
              autoFocus
            />
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.btnPrimary, (!draftName.trim() || save.isPending) && { opacity: 0.5 }]}
                onPress={handleSave}
                disabled={!draftName.trim() || save.isPending}
              >
                {save.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Opslaan</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={() => { setModalOpen(false); setDraftName(''); }}>
                <Text style={styles.btnTextSecondary}>Sluiten</Text>
              </TouchableOpacity>
            </View>

            {sortedViews.length > 0 && (
              <>
                <Text style={styles.modalListTitle}>Bestaande</Text>
                <ScrollView style={{ maxHeight: 200 }}>
                  {sortedViews.map((v) => (
                    <View key={v.id} style={styles.listRow}>
                      <TouchableOpacity onPress={() => handleSetDefault(v)}>
                        <Ionicons
                          name={v.is_default ? 'star' : 'star-outline'}
                          size={18}
                          color={v.is_default ? '#F59E0B' : colors.textSecondary}
                        />
                      </TouchableOpacity>
                      <Text style={styles.listName}>{v.name}</Text>
                      <TouchableOpacity onPress={() => handleDelete(v)}>
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
