// src/components/BulkActionBar.tsx
// Mobile RN counterpart of web BulkActionToolbar.
// Sticky bottom bar that appears when 1+ items are selected.
//
// Usage:
//   <BulkActionBar
//     count={sel.count}
//     onClear={sel.clear}
//     actions={[
//       { label: 'Verwijder', icon: 'trash-outline', variant: 'destructive', onPress: bulkDelete },
//       { label: 'Dupliceer', icon: 'copy-outline', onPress: bulkDuplicate },
//     ]}
//   />

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

export interface BulkAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  variant?: 'default' | 'destructive';
  onPress: () => void;
  disabled?: boolean;
}

interface Props {
  count: number;
  onClear: () => void;
  actions: BulkAction[];
}

export function BulkActionBar({ count, onClear, actions }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (count === 0) return null;

  const styles = StyleSheet.create({
    bar: {
      position: 'absolute' as const,
      bottom: insets.bottom + 8, left: 16, right: 16,
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8,
      backgroundColor: colors.background,
      borderRadius: 24,
      borderWidth: 1, borderColor: colors.border,
      paddingVertical: 10, paddingHorizontal: 12,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        },
        android: {
          elevation: 8,
        },
      }),
    },
    closeBtn: {
      width: 30, height: 30, borderRadius: 15,
      alignItems: 'center' as const, justifyContent: 'center' as const,
    },
    countText: {
      color: colors.text,
      fontWeight: '600' as const,
      fontSize: 14,
      paddingHorizontal: 4,
    },
    divider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 4 },
    actions: { flexDirection: 'row' as const, gap: 4, flex: 1, justifyContent: 'flex-end' as const, flexWrap: 'wrap' as const },
    actionBtn: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
      paddingVertical: 6, paddingHorizontal: 10,
      borderRadius: 16,
      backgroundColor: colors.surface,
    },
    actionBtnDestructive: {
      backgroundColor: '#EF4444' + '15',
    },
    actionLabel: {
      color: colors.text,
      fontSize: 13, fontWeight: '600' as const,
    },
    actionLabelDestructive: { color: '#EF4444' },
  });

  return (
    <View
      style={styles.bar}
      accessibilityRole="toolbar"
      accessibilityLabel={`${count} geselecteerd, bulk acties`}
    >
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={onClear}
        accessibilityLabel="Selectie wissen"
      >
        <Ionicons name="close" size={18} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.countText}>{count} geselecteerd</Text>
      <View style={styles.divider} />
      <View style={styles.actions}>
        {actions.map((a, i) => {
          const isDestructive = a.variant === 'destructive';
          return (
            <TouchableOpacity
              key={`${a.label}-${i}`}
              style={[styles.actionBtn, isDestructive && styles.actionBtnDestructive, a.disabled && { opacity: 0.4 }]}
              onPress={a.onPress}
              disabled={a.disabled}
            >
              <Ionicons
                name={a.icon}
                size={15}
                color={isDestructive ? '#EF4444' : colors.text}
              />
              <Text style={[styles.actionLabel, isDestructive && styles.actionLabelDestructive]}>
                {a.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
