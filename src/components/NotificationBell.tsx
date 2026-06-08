// src/components/NotificationBell.tsx
// Header bell with unread-count badge. Tap → NotificationsScreen.
//
// Closes Phase D of P0-3 (mobile NotificationBell parity with web).
// Until today AMOS had a NotificationsScreen but no bell entry-point in
// the home/main header — users only saw alerts via push or by navigating
// to the screen directly. This component drops into any screen header.

import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet, AccessibilityInfo } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '../hooks/useNotifications';
import { useTheme } from '../context/ThemeContext';

interface Props {
  size?: number;
  color?: string;
}

export function NotificationBell({ size = 22, color }: Props) {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { data: notifications = [] } = useNotifications();

  const unreadCount = notifications.filter((n: any) => !n.read).length;
  const iconColor = color ?? colors.text;
  const badgeMax = 9;

  const handlePress = () => {
    try {
      AccessibilityInfo.announceForAccessibility?.(
        unreadCount > 0 ? `${unreadCount} ongelezen meldingen` : 'Geen ongelezen meldingen',
      );
    } catch {}
    navigation.navigate('Notifications' as never);
  };

  const styles = StyleSheet.create({
    btn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    badge: {
      position: 'absolute',
      top: 4,
      right: 4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      backgroundColor: colors.error,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.background,
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '700',
      lineHeight: 12,
    },
  });

  return (
    <TouchableOpacity
      style={styles.btn}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Meldingen${unreadCount > 0 ? `, ${unreadCount} ongelezen` : ''}`}
    >
      <Ionicons
        name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
        size={size}
        color={iconColor}
      />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > badgeMax ? `${badgeMax}+` : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
