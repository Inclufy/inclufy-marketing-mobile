// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: meta.icon>
/**
 * WizardToast — slide-in notificatie banner voor de wizard.
 *
 * Verschijnt vanaf de bovenrand met spring-animatie, blijft 3 seconden
 * staan, slidet daarna omhoog uit beeld. Tap dismist hem direct.
 *
 * Gebruik:
 *   {toast && <WizardToast message={toast} onDismiss={() => setToast(null)} />}
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, TouchableOpacity, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme';

type ToastType = 'success' | 'error' | 'info';

type Props = {
  message: string;
  type?: ToastType;
  duration?: number;
  onDismiss: () => void;
};

const TYPE_META: Record<ToastType, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  success: { icon: 'checkmark-circle', color: '#10B981' },
  error:   { icon: 'close-circle',     color: '#EF4444' },
  info:    { icon: 'information-circle', color: '#3B82F6' },
};

export default function WizardToast({
  message,
  type = 'success',
  duration = 3000,
  onDismiss,
}: Props) {
  const { colors } = useTheme();
  const translateY = useRef(new Animated.Value(-200)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const meta = TYPE_META[type];

  useEffect(() => {
    // Slide-in
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss
    const timer = setTimeout(() => {
      slideOut();
    }, duration);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const slideOut = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -200,
        duration: 250,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss());
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: Platform.OS === 'ios' ? 56 : 24,
        left: spacing.md,
        right: spacing.md,
        zIndex: 9999,
        transform: [{ translateY }],
        opacity,
      }}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={slideOut}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.background,
          borderRadius: borderRadius.lg,
          padding: spacing.md,
          gap: spacing.sm,
          borderWidth: 1,
          borderColor: meta.color + '40',
          // iOS-style shadow
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.12,
          shadowRadius: 24,
          elevation: 12,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: meta.color + '18',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Ionicons name={meta.icon} size={20} color={meta.color} />
        </View>
        <Text
          style={{
            flex: 1,
            fontSize: fontSize.md,
            fontWeight: fontWeight.semibold,
            color: colors.text,
            lineHeight: 20,
          }}
          numberOfLines={2}
        >
          {message}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
