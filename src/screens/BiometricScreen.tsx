// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: isFaceId ? 'scan-outline' : 'finger-print-outline'>
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';

interface Props {
  onSuccess: () => void;
  onSkip: () => void;
}

export default function BiometricScreen({ onSuccess, onSkip }: Props) {
  const { colors } = useTheme();
  const [biometricType, setBiometricType] = useState<string>('Biometrie');
  const [isAvailable, setIsAvailable] = useState(false);

  const styles = useThemedStyles((c) => ({
    container: {
      flex: 1,
      backgroundColor: c.background,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      paddingHorizontal: spacing.xl,
    },
    iconContainer: {
      marginBottom: spacing.xl,
    },
    iconCircle: {
      width: 100,
      height: 100,
      borderRadius: 28,
      backgroundColor: c.primary + '12',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    biometricIcon: {
      fontSize: 48,
    },
    title: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      color: c.text,
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: fontSize.md,
      color: c.textSecondary,
      textAlign: 'center' as const,
      marginBottom: spacing.xxl,
      paddingHorizontal: spacing.lg,
    },
    actions: {
      width: '100%',
      gap: spacing.md,
      alignItems: 'center' as const,
    },
    biometricButton: {
      backgroundColor: c.primary,
      paddingVertical: 16,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.md,
      minWidth: 220,
      alignItems: 'center' as const,
    },
    biometricButtonText: {
      color: c.textOnPrimary,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.semibold,
    },
    skipButton: {
      paddingVertical: spacing.md,
    },
    skipText: {
      fontSize: fontSize.md,
      color: c.textSecondary,
    },
  }));

  const checkBiometrics = useCallback(async () => {
    try {
      const LocalAuth = await import('expo-local-authentication');
      const compatible = await LocalAuth.hasHardwareAsync();
      const enrolled = await LocalAuth.isEnrolledAsync();
      setIsAvailable(compatible && enrolled);

      if (compatible) {
        const types = await LocalAuth.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('Face ID');
        } else if (types.includes(LocalAuth.AuthenticationType.FINGERPRINT)) {
          setBiometricType('Touch ID');
        }
      }
    } catch {
      // Biometric not available
      setIsAvailable(false);
    }
  }, []);

  useEffect(() => {
    checkBiometrics();
  }, [checkBiometrics]);

  const handleAuthenticate = useCallback(async () => {
    try {
      const LocalAuth = await import('expo-local-authentication');
      const result = await LocalAuth.authenticateAsync({
        promptMessage: `Log in met ${biometricType}`,
        cancelLabel: 'Annuleren',
        disableDeviceFallback: false,
        fallbackLabel: 'Gebruik wachtwoord',
      });

      if (result.success) {
        onSuccess();
      }
    } catch {
      // Authentication failed silently
    }
  }, [biometricType, onSuccess]);

  // Auto-trigger on mount if available
  useEffect(() => {
    if (isAvailable) {
      // Small delay to let the screen render first
      const timer = setTimeout(() => { void handleAuthenticate(); }, 500);
      return () => clearTimeout(timer);
    }
  }, [isAvailable, handleAuthenticate]);

  const isFaceId = biometricType === 'Face ID';

  return (
    <View style={styles.container}>
      {/* Biometric Icon */}
      <View style={styles.iconContainer}>
        <View style={styles.iconCircle}>
          <Ionicons name={isFaceId ? 'scan-outline' : 'finger-print-outline'} size={48} color={colors.primary} />
        </View>
      </View>

      {/* Title */}
      <Text style={styles.title}>AMOS by Inclufy</Text>
      <Text style={styles.subtitle}>
        Gebruik {biometricType} om de app te ontgrendelen
      </Text>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.biometricButton}
          onPress={handleAuthenticate}
        >
          <Text style={styles.biometricButtonText}>
            {biometricType} Gebruiken
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
          <Text style={styles.skipText}>Overslaan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
