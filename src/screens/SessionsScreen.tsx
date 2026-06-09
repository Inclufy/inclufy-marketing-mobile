// src/screens/SessionsScreen.tsx
// Mobile counterpart of the web Settings → Sessions card.
// Closes P1 parity gap from the 2026-06-09 audit (Marketing-web ↔ AMOS).
//
// Mobile is the surface most likely to be lost or stolen, so users need
// to be able to revoke this device or sign out of every device from
// here. Native iOS/Android offer no built-in mechanism for that —
// Supabase's `signOut({scope:'global'})` rotates all refresh tokens
// across every session bound to the account, immediately invalidating
// any other device.
//
// We do NOT enumerate every individual session client-side — Supabase
// Auth doesn't expose other users' sessions via the JS client. The web
// counterpart has the same constraint. For per-session enumeration you
// need the `user_sessions` audit table which is populated by the
// auth-event webhook (separate from THIS app's webhook platform —
// internal Supabase signal). That's wired on web; mobile inherits when
// the user signs in to the web with the same account.

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, StyleSheet, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Application from 'expo-application';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { useTheme } from '../context/ThemeContext';

interface SessionInfo {
  email: string | null;
  user_id: string | null;
  last_sign_in_at: string | null;
  aal: 'aal1' | 'aal2';
  device_label: string;
  app_version: string;
}

export default function SessionsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled || !session) return;
        const aal: 'aal1' | 'aal2' = (session as any).aal2 ? 'aal2' : 'aal1';
        // We avoid expo-device (extra dep) — use Platform + Application
        // for what we have access to. The model name isn't surfaced
        // without expo-device, so we settle for OS + version.
        const os = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS;
        const osVer = String(Platform.Version ?? '');
        setInfo({
          email: session.user?.email ?? null,
          user_id: session.user?.id ?? null,
          last_sign_in_at: session.user?.last_sign_in_at ?? null,
          aal,
          device_label: `${os}${osVer ? ' ' + osVer : ''} · AMOS`,
          app_version: Application.nativeApplicationVersion ?? '?',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleSignOutEverywhere = async () => {
    Alert.alert(
      'Op ALLE apparaten uitloggen?',
      'Je wordt op elk apparaat uitgelogd en moet opnieuw inloggen. Ook deze app sluit terug naar het login-scherm.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Uitloggen overal',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            try {
              const { error } = await supabase.auth.signOut({ scope: 'global' });
              if (error) throw error;
              // AuthContext listens for SIGNED_OUT and routes to Login
            } catch (e: any) {
              Alert.alert('Uitloggen mislukt', e?.message ?? 'Onbekende fout');
            } finally {
              setSigningOut(false);
            }
          },
        },
      ],
    );
  };

  const handleSignOutCurrent = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e: any) {
      Alert.alert('Uitloggen mislukt', e?.message ?? 'Onbekende fout');
    } finally {
      setSigningOut(false);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 },
    title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 4 },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 16 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardCurrent: {
      borderColor: '#10B981',
      backgroundColor: (colors as any).surface,
    },
    deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    iconWrap: {
      width: 40, height: 40, borderRadius: 8,
      backgroundColor: '#10B98120',
      alignItems: 'center', justifyContent: 'center',
    },
    deviceLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
    badgeRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
    badge: {
      paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
      borderWidth: 1, borderColor: '#10B981',
    },
    badgeText: { fontSize: 11, color: '#10B981', fontWeight: '600' },
    badge2fa: { borderColor: '#A855F7', backgroundColor: '#A855F720', flexDirection: 'row', alignItems: 'center', gap: 3 },
    badge2faText: { fontSize: 11, color: '#A855F7', fontWeight: '600' },
    meta: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: 16, marginBottom: 8, textTransform: 'uppercase' as const },
    actionBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
      borderWidth: 1, borderColor: colors.border,
      marginBottom: 8,
    },
    actionBtnDanger: { borderColor: '#EF4444' },
    actionText: { fontSize: 15, fontWeight: '600', color: colors.text },
    actionTextDanger: { color: '#EF4444' },
    infoText: { fontSize: 12, color: colors.textSecondary, marginTop: 12, lineHeight: 18 },
  });

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Sessies</Text>
      <Text style={styles.subtitle}>
        Beheer waar je bent ingelogd. Bij verlies of diefstal kun je je
        op alle apparaten uitloggen.
      </Text>

      <Text style={styles.sectionTitle}>Dit apparaat</Text>
      <View style={[styles.card, styles.cardCurrent]}>
        <View style={styles.deviceRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="phone-portrait" size={22} color="#10B981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.deviceLabel}>{info?.device_label ?? 'mobile'}</Text>
            <View style={styles.badgeRow}>
              <View style={styles.badge}><Text style={styles.badgeText}>Huidig</Text></View>
              {info?.aal === 'aal2' && (
                <View style={styles.badge2fa}>
                  <Ionicons name="shield-checkmark" size={11} color="#A855F7" />
                  <Text style={styles.badge2faText}>2FA</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <Text style={styles.meta}>{info?.email}</Text>
        {info?.last_sign_in_at && (
          <Text style={styles.meta}>
            Laatst ingelogd: {new Date(info.last_sign_in_at).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}
          </Text>
        )}
        <Text style={styles.meta}>App-versie: {info?.app_version}</Text>
      </View>

      <Text style={styles.sectionTitle}>Acties</Text>
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={handleSignOutCurrent}
        disabled={signingOut}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.text} />
        <Text style={styles.actionText}>
          {signingOut ? 'Uitloggen…' : 'Uitloggen op dit apparaat'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionBtn, styles.actionBtnDanger]}
        onPress={handleSignOutEverywhere}
        disabled={signingOut}
        activeOpacity={0.7}
      >
        <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
        <Text style={[styles.actionText, styles.actionTextDanger]}>
          Uitloggen op ALLE apparaten
        </Text>
      </TouchableOpacity>

      <Text style={styles.infoText}>
        Bij "Uitloggen op alle apparaten" worden alle vernieuwingstokens
        van je account ingetrokken. Webbrowsers, andere telefoons en
        TestFlight-builds moeten daarna opnieuw inloggen. Gebruik dit
        bij verlies, diefstal of als je vermoedt dat iemand toegang heeft.
      </Text>
    </ScrollView>
  );
}
