import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

import { Camera, CheckCircle } from 'phosphor-react-native';
type Props = {
  connectedCount: number;
  onCreatePost: () => void;
  onClose: () => void;
};

export default function StepFirstPost({ connectedCount, onCreatePost, onClose }: Props) {
  const { colors } = useTheme();

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, alignItems: 'center', justifyContent: 'center', minHeight: 500 }}>
      {/* Hero icon */}
      <View
        style={{
          width: 96, height: 96, borderRadius: 48,
          backgroundColor: colors.primary + '20',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: spacing.lg,
        }}
      >
        <CheckCircle size={56} color={colors.success} weight="fill" />
      </View>

      <Text style={{ fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text, textAlign: 'center', marginBottom: spacing.sm }}>
        Je bent klaar! 🎉
      </Text>

      <Text style={{ fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 22 }}>
        {connectedCount} {connectedCount === 1 ? 'kanaal' : 'kanalen'} verbonden. AMOS kan nu voor jou publiceren — met jouw merkstem.
      </Text>

      {/* CTA: maak een post */}
      <TouchableOpacity
        onPress={onCreatePost}
        activeOpacity={0.7}
        style={{
          width: '100%',
          padding: spacing.lg,
          borderRadius: borderRadius.md,
          backgroundColor: colors.primary,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          marginBottom: spacing.md,
        }}
      >
        <Camera size={22} color="#fff" weight="duotone" />
        <Text style={{ color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>
          Maak nu een post
        </Text>
      </TouchableOpacity>

      {/* Skip */}
      <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={{ padding: spacing.md }}>
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.md }}>
          Sluit wizard
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
