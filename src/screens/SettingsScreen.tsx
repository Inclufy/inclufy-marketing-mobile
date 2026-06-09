// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: field.icon as any> | Ionicons name=<dynamic: icon> | Ionicons name=<dynamic: isConnected ? 'checkmark-circle-outline' : (platform as any).manualOnly ? 'hand-left-outline' : 'link-outline'> | Ionicons name=<dynamic: platform.icon as any>
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Share,
  Linking,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../services/supabase';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { useTranslation, LOCALE_LABELS, type Locale } from '../i18n';
import { useAIConsent } from '../hooks/useAIConsent';
import AIConsentModal from '../components/AIConsentModal';
import type { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { useLocation, formatRegion, type RegionData } from '../hooks/useLocation';
import { useIsSuperadmin } from '../utils/superadmin';
import TierSwitcher from '../components/TierSwitcher';
import WatermarkPreview from '../components/WatermarkPreview';
import WatermarkSettings from '../components/WatermarkSettings';
import WatermarkAdminEditor from '../components/WatermarkAdminEditor';

import { ArrowsClockwise, CaretRight, Info, ShieldCheck, SignOut, Sparkle } from 'phosphor-react-native';
const BIOMETRIC_KEY = 'amos_biometric_enabled';

const SOCIAL_PLATFORMS = [
  { key: 'linkedin',  label: 'LinkedIn',    icon: 'logo-linkedin'  as keyof typeof Ionicons.glyphMap, color: '#0077B5', supported: true,  manualOnly: false },
  { key: 'instagram', label: 'Instagram',   icon: 'logo-instagram' as keyof typeof Ionicons.glyphMap, color: '#E4405F', supported: true,  manualOnly: false },
  { key: 'facebook',  label: 'Facebook',    icon: 'logo-facebook'  as keyof typeof Ionicons.glyphMap, color: '#1877F2', supported: true,  manualOnly: false },
  { key: 'tiktok',    label: 'TikTok',      icon: 'musical-notes'  as keyof typeof Ionicons.glyphMap, color: '#000000', supported: true,  manualOnly: false },
  { key: 'pinterest', label: 'Pinterest',   icon: 'logo-pinterest' as keyof typeof Ionicons.glyphMap, color: '#E60023', supported: true,  manualOnly: false },
  { key: 'threads',   label: 'Threads',     icon: 'at-circle'      as keyof typeof Ionicons.glyphMap, color: '#000000', supported: true,  manualOnly: false },
  { key: 'snapchat',  label: 'Snapchat',    icon: 'logo-snapchat'  as keyof typeof Ionicons.glyphMap, color: '#FFFC00', supported: true,  manualOnly: true  },
  { key: 'whatsapp',  label: 'WhatsApp',    icon: 'logo-whatsapp'  as keyof typeof Ionicons.glyphMap, color: '#25D366', supported: true,  manualOnly: true  },
  { key: 'x',         label: 'X / Twitter', icon: 'logo-twitter'   as keyof typeof Ionicons.glyphMap, color: '#1DA1F2', supported: false, manualOnly: false },
] as const;


// ─── Component ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { t, locale, setLocale } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { scheme, setScheme, colors } = useTheme();
  const { isSuperadmin } = useIsSuperadmin();

  const [email, setEmail]                         = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [biometricEnabled, setBiometricEnabled]   = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [exportLoading, setExportLoading]         = useState(false);
  const { hasConsent: aiConsentGiven, revokeConsent, requestConsent: grantAIConsent, showModal: showAIConsentModal, onAccept: onAIConsentAccept, onDecline: onAIConsentDecline } = useAIConsent();

  // ─── QR Card Profile ──────────────────────────────────────────────
  const [qrProfile, setQrProfile] = useState({
    full_name: '', email: '', phone: '', company: '', title: '', website: '',
    linkedin: '', instagram: '', twitter: '', facebook: '', whatsapp: '',
  });
  const [qrFields, setQrFields] = useState<Record<string, boolean>>({
    share_email: true, share_phone: true, share_company: true, share_title: true,
    share_website: true, share_linkedin: true, share_instagram: true,
    share_twitter: true, share_facebook: true, share_whatsapp: true,
  });
  const [showQrEditor, setShowQrEditor] = useState(false);
  const [qrSaving, setQrSaving] = useState(false);

  const loadQrProfile = useCallback(async () => {
    try {
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase
        .from('profiles')
        .select('full_name, email, phone, company, title, website, linkedin, instagram, twitter, facebook, whatsapp, qr_fields')
        .eq('id', user.id)
        .maybeSingle();
      if (p) {
        setQrProfile({
          full_name: p.full_name ?? '', email: p.email ?? user.email ?? '',
          phone: p.phone ?? '', company: p.company ?? '', title: p.title ?? '',
          website: p.website ?? '', linkedin: p.linkedin ?? '', instagram: p.instagram ?? '',
          twitter: p.twitter ?? '', facebook: p.facebook ?? '', whatsapp: p.whatsapp ?? '',
        });
        if (p.qr_fields && typeof p.qr_fields === 'object') {
          setQrFields(prev => ({ ...prev, ...(p.qr_fields as Record<string, boolean>) }));
        }
      } else {
        // No profile row yet — use auth email
        setQrProfile(prev => ({ ...prev, email: user.email ?? '' }));
      }
    } catch {}
  }, []);

  useEffect(() => { loadQrProfile(); }, [loadQrProfile]);

  const handleSaveQrProfile = async () => {
    setQrSaving(true);
    try {
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const profileData = {
        full_name: qrProfile.full_name,
        email: qrProfile.email,
        phone: qrProfile.phone,
        company: qrProfile.company,
        title: qrProfile.title,
        website: qrProfile.website,
        linkedin: qrProfile.linkedin,
        instagram: qrProfile.instagram,
        twitter: qrProfile.twitter,
        facebook: qrProfile.facebook,
        whatsapp: qrProfile.whatsapp,
        qr_fields: qrFields,
      };

      // Try update first (existing profile row)
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      let error;
      if (existing) {
        // Update existing row
        ({ error } = await supabase
          .from('profiles')
          .update(profileData)
          .eq('id', user.id));
      } else {
        // Insert new row
        ({ error } = await supabase
          .from('profiles')
          .insert({ id: user.id, ...profileData }));
      }

      if (error) throw error;
      setShowQrEditor(false);
      Alert.alert('✅ Opgeslagen', 'Je QR-kaart profiel is bijgewerkt.');
    } catch (err: any) {
      Alert.alert('Fout', err?.message ?? 'Kon profiel niet opslaan.');
    } finally {
      setQrSaving(false);
    }
  };

  // ─── Location ──────────────────────────────────────────────────────
  const gpsLocation = useLocation(false); // Don't auto-detect on mount
  const [savedLocation, setSavedLocation] = useState<RegionData | null>(null);

  // Load saved location from user metadata
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } = {} as any } = await supabase.auth.getUser();
        const meta = user?.user_metadata;
        if (meta?.location_city || meta?.location_country) {
          setSavedLocation({
            city: meta.location_city || '',
            province: meta.location_province || '',
            country: meta.location_country || '',
            countryCode: meta.location_country_code || '',
            continent: meta.location_continent || '',
          });
        }
      } catch {}
    })();
  }, []);

  const handleDetectLocation = async () => {
    await gpsLocation.refresh();
  };

  useEffect(() => {
    if (gpsLocation.region) {
      setSavedLocation(gpsLocation.region);
      // Persist to Supabase user metadata
      supabase.auth.updateUser({
        data: {
          location_city: gpsLocation.region.city,
          location_province: gpsLocation.region.province,
          location_country: gpsLocation.region.country,
          location_country_code: gpsLocation.region.countryCode,
          location_continent: gpsLocation.region.continent,
        },
      }).catch(() => {});
    }
  }, [gpsLocation.region]);

  // ── Styles ──────────────────────────────────────────────────────────────
  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      backgroundColor: c.surface,
      paddingTop: 60,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text },
    scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
    sectionLabel: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.textSecondary,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
    },
    card: { backgroundColor: c.surface, borderRadius: borderRadius.lg, ...subtleShadow },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    rowIconWrap: {
      width: 36, height: 36, borderRadius: borderRadius.md,
      justifyContent: 'center' as const, alignItems: 'center' as const,
    },
    rowContent: { flex: 1 },
    rowLabel: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: c.text },
    rowValue: { fontSize: fontSize.sm, color: c.textSecondary, marginTop: 2 },
    separator: {
      height: 1,
      backgroundColor: c.borderLight,
      marginLeft: spacing.md + 36 + spacing.md,
    },
  }));

  // ── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      // Load user email
      const { data } = await supabase.auth.getUser();
      setEmail(data?.user?.email ?? null);

      // Check biometric hardware + stored preference
      const [hasBio, storedBio] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        AsyncStorage.getItem(BIOMETRIC_KEY),
      ]);
      setBiometricAvailable(hasBio);
      if (storedBio === 'true') setBiometricEnabled(true);

      // Check notification permission (iOS)
      const { status } = await Linking.canOpenURL('app-settings:')
        .then(() => ({ status: 'granted' }))
        .catch(() => ({ status: 'denied' }));
      // We'll just reflect user's saved preference
      const savedNotif = await AsyncStorage.getItem('amos_notifications_enabled');
      setNotificationsEnabled(savedNotif !== 'false'); // default ON
    };
    init();
  }, []);

  // ── Social accounts ──────────────────────────────────────────────────────
  const { data: socialAccounts = [], refetch: refetchSocial } = useQuery({
    queryKey: ['social-accounts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('social_accounts')
        .select('id, platform, account_name, platform_account_id, status, profile_image_url');
      return (data || []) as Array<{
        id: string;
        platform: string;
        account_name: string | null;
        platform_account_id: string | null;
        status: string;
        profile_image_url: string | null;
        is_active?: boolean;
      }>;
    },
    staleTime: 30_000,
  });


  // ── Brand Kit ────────────────────────────────────────────────────────────
  const { data: brandKits = [], refetch: refetchBrandKits } = useQuery({
    queryKey: ['brand-kits-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('brand_kits')
        .select('id, name, is_active')
        .order('is_active', { ascending: false });
      return data || [];
    },
    staleTime: 0,
  });

  const activeBrandKit = (brandKits as any[]).find((bk: any) => bk.is_active);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleDeleteAccount = () => {
    Alert.alert(
      'Account verwijderen',
      'Typ "VERWIJDER" om je account permanent te verwijderen. Dit kan niet ongedaan worden gemaakt.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Doorgaan',
          style: 'destructive',
          onPress: () => {
            Alert.prompt(
              'Bevestig verwijdering',
              'Typ VERWIJDER om door te gaan',
              async (input) => {
                if (input?.trim() !== 'VERWIJDER') {
                  Alert.alert('Geannuleerd', 'De tekst komt niet overeen. Account is niet verwijderd.');
                  return;
                }
                try {
                  const { data: { user } = {} as any } = await supabase.auth.getUser();
                  if (!user) throw new Error('Niet ingelogd');

                  // GDPR Art. 17 — controlled deletion via edge function.
                  // The previous flow tried delete_user RPC (which doesn't exist
                  // — it was never created) then fell back to profiles.delete()
                  // which only removed one row, leaving dangling FKs in 30+
                  // AMOS content tables. The edge function hard-deletes all
                  // user content + revokes OAuth tokens + anonymizes profile
                  // + bans the auth user.
                  const { data, error } = await supabase.functions.invoke(
                    'gdpr-account-delete',
                    { method: 'POST' },
                  );

                  if (error) throw error;
                  if (!data || data.status !== 'deleted') {
                    throw new Error('Onverwacht antwoord van server');
                  }

                  await supabase.auth.signOut();
                } catch (err: any) {
                  Alert.alert('Fout', err?.message ?? 'Account kon niet worden verwijderd.');
                }
              },
              'plain-text',
            );
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert(
      t.settings.logout,
      t.settings.logoutConfirm,
      [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.settings.logout, style: 'destructive', onPress: async () => supabase.auth.signOut() },
      ],
    );
  };

  const handleThemeSwitch = () => {
    Alert.alert('Weergave', 'Kies een thema', [
      { text: '☀️  Licht',   onPress: () => setScheme('light') },
      { text: '🌙  Donker',  onPress: () => setScheme('dark') },
      { text: '⚙️  Systeem', onPress: () => setScheme('system') },
      { text: 'Annuleren', style: 'cancel' },
    ]);
  };

  const handleLanguageSwitch = () => {
    const locales: Locale[] = ['nl', 'en', 'fr'];
    Alert.alert(t.settings.language, undefined, [
      ...locales.map((loc) => ({
        text: `${LOCALE_LABELS[loc]}${loc === locale ? ' ✓' : ''}`,
        onPress: () => setLocale(loc),
      })),
      { text: t.common.cancel, style: 'cancel' as const },
    ]);
  };

  const handleToggleNotifications = async (value: boolean) => {
    setNotificationsEnabled(value);
    await AsyncStorage.setItem('amos_notifications_enabled', value ? 'true' : 'false');
    if (!value) return;
    // Open iOS notification settings so user can enable system-level permission
    Alert.alert(
      '🔔 Meldingen',
      'Zorg dat meldingen zijn ingeschakeld in je iPhone Instellingen voor AMOS.',
      [
        { text: 'Open Instellingen', onPress: () => Linking.openURL('app-settings:') },
        { text: 'Later', style: 'cancel' },
      ],
    );
  };

  const handleToggleBiometric = async (value: boolean) => {
    if (value) {
      // Authenticate first before enabling
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Bevestig je identiteit om biometrische login in te schakelen',
        fallbackLabel: 'Gebruik wachtwoord',
        cancelLabel: 'Annuleren',
      });
      if (!result.success) {
        Alert.alert('Authenticatie mislukt', 'Biometrische login niet ingeschakeld.');
        return;
      }
    }
    setBiometricEnabled(value);
    await AsyncStorage.setItem(BIOMETRIC_KEY, value ? 'true' : 'false');
  };

  const handleBrandKit = () => {
    navigation.navigate('BrandKit' as any);
  };

  const handlePushNotifications = async () => {
    // Open the app's specific settings page in iOS Settings so the user
    // can enable / disable notifications and other per-app permissions.
    const canOpen = await Linking.canOpenURL('app-settings:');
    if (canOpen) {
      Alert.alert(
        '🔔 Push Notificaties',
        'Beheer push-notificaties voor AMOS in iPhone Instellingen → Meldingen.',
        [
          { text: 'Open Instellingen', onPress: () => Linking.openURL('app-settings:') },
          { text: 'Sluiten', style: 'cancel' },
        ],
      );
    } else {
      Alert.alert(
        '🔔 Push Notificaties',
        'Ga naar Instellingen → AMOS → Meldingen om push-notificaties in te schakelen.',
        [{ text: 'OK' }],
      );
    }
  };

  const handleDataExport = async () => {
    setExportLoading(true);
    try {
      // GDPR Art. 15 — full data export via server-side edge function.
      // The previous client-side implementation only covered 4 tables (events,
      // captures, posts, brand_kits) and relied on RLS. The edge function
      // exports ~30 user-scoped tables with controlled access via service_role
      // and audit-logs every export. OAuth tokens are REDACTED in the export
      // (the user is entitled to know what platforms are connected, but the
      // raw access/refresh tokens would be a security risk if the file leaks).
      const { data, error } = await supabase.functions.invoke('gdpr-export', {
        method: 'POST',
      });
      if (error) throw error;
      if (!data) throw new Error('Geen data ontvangen van server');

      const exportData = data as any;

      // Build a friendly summary from the new envelope shape.
      const tables = exportData?.tables ?? {};
      const eventsCount    = tables.go_events?.count    ?? 0;
      const capturesCount  = tables.go_captures?.count  ?? 0;
      const postsCount     = tables.go_posts?.count     ?? 0;
      const brandKitsCount = tables.brand_voice_profiles?.count ?? 0;
      const totalTables    = Object.keys(tables).length;
      const warningCount   = (exportData?.warnings ?? []).length;

      const json = JSON.stringify(exportData, null, 2);
      const summary =
        `✅ Export klaar\n\n` +
        `• ${eventsCount} event(s)\n` +
        `• ${capturesCount} capture(s)\n` +
        `• ${postsCount} post(s)\n` +
        `• ${brandKitsCount} brand voice profile(s)\n` +
        `• ${totalTables} totaal tabellen` +
        (warningCount ? `\n• ${warningCount} waarschuwing(en) — zie 'warnings' veld` : '');

      const result = await Share.share({
        message: json,
        title: `AMOS export — ${new Date().toLocaleDateString('nl-NL')}`,
      });

      if (result.action !== Share.dismissedAction) {
        Alert.alert('Export', summary);
      }
    } catch (err: any) {
      Alert.alert('Fout bij export', err?.message ?? 'Onbekende fout. Probeer opnieuw.');
    } finally {
      setExportLoading(false);
    }
  };

  // ── Manual connect state ────────────────────────────────────────────
  const [showManualConnect, setShowManualConnect] = useState(false);
  const [manualPlatform, setManualPlatform] = useState('');
  const [manualAccountName, setManualAccountName] = useState('');
  const [manualAccountUrl, setManualAccountUrl] = useState('');
  const [manualConnecting, setManualConnecting] = useState(false);

  const handleManualConnect = async () => {
    if (!manualAccountName.trim()) {
      Alert.alert('Vul een accountnaam in');
      return;
    }
    setManualConnecting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Niet ingelogd');

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mpxkugfqzmxydxnlxqoj.supabase.co';
      const res = await fetch(`${supabaseUrl}/functions/v1/oauth-callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          platform: manualPlatform,
          accountName: manualAccountName.trim(),
          accountUrl: manualAccountUrl.trim() || undefined,
          accountType: 'manual',
        }),
      });

      if (!res.ok) throw new Error('Kon niet verbinden');

      Alert.alert('✅ Verbonden', `${manualAccountName} is gekoppeld.`);
      setShowManualConnect(false);
      setManualAccountName('');
      setManualAccountUrl('');
      refetchSocial();
    } catch (err: any) {
      Alert.alert('Fout', err?.message ?? 'Verbinding mislukt');
    } finally {
      setManualConnecting(false);
    }
  };

  // Connect social media via OAuth or manual
  const handleConnectSocial = async (platformKey: string) => {
    const pf = SOCIAL_PLATFORMS.find(p => p.key === platformKey);
    const label = pf?.label ?? platformKey;

    if (!pf?.supported) {
      Alert.alert(t.common?.comingSoon ?? 'Binnenkort beschikbaar', `${label} wordt binnenkort ondersteund.`);
      return;
    }

    const connectedAccounts = (socialAccounts as any[]).filter(
      (a: any) => a.platform === platformKey && (a.is_active || a.status === 'active'),
    );

    // Show options: OAuth, manual, or manage if already connected
    const options: any[] = [];

    if (connectedAccounts.length > 0) {
      options.push({
        text: '🔄 Opnieuw verbinden (OAuth)',
        onPress: () => startOAuth(platformKey, label),
      });
      options.push({
        text: '➕ Extra account toevoegen',
        onPress: () => {
          setManualPlatform(platformKey);
          setShowManualConnect(true);
        },
      });
      options.push({
        text: '🔌 Account ontkoppelen',
        style: 'destructive',
        onPress: () => handleDisconnectSocial(platformKey, label, connectedAccounts),
      });
    } else {
      options.push({
        text: '🔗 Verbinden via OAuth',
        onPress: () => startOAuth(platformKey, label),
      });
      options.push({
        text: '✏️ Handmatig koppelen',
        onPress: () => {
          setManualPlatform(platformKey);
          setShowManualConnect(true);
        },
      });
    }

    options.push({ text: 'Annuleren', style: 'cancel' });

    Alert.alert(
      connectedAccounts.length > 0 ? `${label} beheren` : `${label} koppelen`,
      connectedAccounts.length > 0 ? 'Kies een actie:' : 'Kies hoe je wilt verbinden:',
      options,
    );
  };

  // Disconnect a social account — removes OAuth tokens + metadata from our DB.
  // Required for GDPR compliance + LinkedIn LMDP / Meta App Review anti-abuse claims.
  const handleDisconnectSocial = async (
    platformKey: string,
    label: string,
    connectedAccounts: any[],
  ) => {
    // Single connected account → direct confirmation
    if (connectedAccounts.length === 1) {
      const acc = connectedAccounts[0];
      Alert.alert(
        'Account ontkoppelen',
        `Weet je zeker dat je "${acc.account_name || label}" wilt ontkoppelen?\n\nOAuth-tokens en gecachte ${label}-gegevens worden binnen enkele seconden verwijderd uit onze database. Je kunt later opnieuw verbinden.`,
        [
          { text: 'Annuleren', style: 'cancel' },
          {
            text: 'Ontkoppelen',
            style: 'destructive',
            onPress: () => performDisconnect([acc.id], acc.account_name || label),
          },
        ],
      );
      return;
    }

    // Multiple accounts → picker to choose which (or all)
    const options: any[] = connectedAccounts.map((acc: any) => ({
      text: `🔌 ${acc.account_name || acc.platform_account_id || 'Onbekend'}`,
      style: 'destructive',
      onPress: () => performDisconnect([acc.id], acc.account_name || label),
    }));
    options.push({
      text: `🔌 Alle ${connectedAccounts.length} accounts ontkoppelen`,
      style: 'destructive',
      onPress: () =>
        Alert.alert(
          'Alles ontkoppelen?',
          `${connectedAccounts.length} ${label}-accounts worden ontkoppeld. OAuth-tokens worden verwijderd. Dit kan niet ongedaan worden gemaakt.`,
          [
            { text: 'Annuleren', style: 'cancel' },
            {
              text: 'Alles ontkoppelen',
              style: 'destructive',
              onPress: () => performDisconnect(connectedAccounts.map((a: any) => a.id), `${connectedAccounts.length} accounts`),
            },
          ],
        ),
    });
    options.push({ text: 'Annuleren', style: 'cancel' });

    Alert.alert(
      `${label} ontkoppelen`,
      'Welke account wil je ontkoppelen?',
      options,
    );
  };

  const performDisconnect = async (accountIds: string[], displayName: string) => {
    try {
      const { error } = await supabase
        .from('social_accounts')
        .delete()
        .in('id', accountIds);

      if (error) throw error;

      await refetchSocial();
      Alert.alert(
        '✅ Ontkoppeld',
        `${displayName} is ontkoppeld. OAuth-tokens en gecachte gegevens zijn verwijderd uit onze database.`,
      );
    } catch (err: any) {
      Alert.alert(
        'Fout bij ontkoppelen',
        err?.message ?? 'Kon account niet ontkoppelen. Probeer opnieuw of neem contact op met support.',
      );
    }
  };

  const startOAuth = async (platformKey: string, label: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert('Error', 'Je bent niet ingelogd.');
      return;
    }

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mpxkugfqzmxydxnlxqoj.supabase.co';
    const redirectUri = `${supabaseUrl}/functions/v1/oauth-callback`;
    // Resolve real organization_id for OAuth state
    let orgIdForState = user.id; // fallback
    try {
      const { data: goOrg } = await supabase
        .from('go_organization')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (goOrg?.organization_id) orgIdForState = goOrg.organization_id;
    } catch {}
    const state = `${user.id}:${orgIdForState}:${platformKey}`;

    let authUrl = '';

    if (platformKey === 'linkedin') {
      const clientId = process.env.EXPO_PUBLIC_LINKEDIN_CLIENT_ID || '789493c65q6j5e';
      // LinkedIn scopes — driven by EXPO_PUBLIC_LINKEDIN_LMDP env flag.
      //
      // Basic (default, works for any LinkedIn app without review):
      //   openid profile email          — Sign In with LinkedIn
      //   w_member_social               — post to personal feed
      //
      // LMDP (requires LinkedIn Marketing Developer Platform approval):
      //   r_organization_social         — read company page data
      //   w_organization_social         — publish as company page
      //   rw_organization_admin         — admin verification
      //
      // Requesting LMDP scopes before approval causes LinkedIn to reject the
      // entire auth request with "Er ging iets fout" (no per-scope error).
      //
      // After LMDP approval:
      //   1. Set EXPO_PUBLIC_LINKEDIN_LMDP=true in .env.local + EAS secrets
      //   2. New EAS build
      //   3. oauth-callback (server side) is already ready — it calls
      //      /v2/organizationAcls on every LinkedIn OAuth and stores each
      //      admin-org as a separate social_account row with
      //      account_type='company'. Graceful 403 fallback if scope missing.
      const lmdpEnabled = process.env.EXPO_PUBLIC_LINKEDIN_LMDP === 'true';
      const basicScopes = 'openid profile email w_member_social';
      const lmdpScopes = ' r_organization_social w_organization_social rw_organization_admin';
      const scopes = basicScopes + (lmdpEnabled ? lmdpScopes : '');
      authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;
    } else if (platformKey === 'facebook' || platformKey === 'instagram') {
      const metaAppId = process.env.EXPO_PUBLIC_META_APP_ID || '947950264797942';
      // Scopes:
      //   pages_show_list             — enumerate user's FB pages
      //   pages_manage_posts          — publish to FB pages
      //   pages_read_engagement       — read page metadata (required to discover IG business link)
      //   instagram_basic             — read IG business profile
      //   instagram_content_publish   — publish to IG business account (requires Meta App Review for production)
      //   public_profile              — basic identity
      // NOTES on scope choices:
      // - `instagram_basic` was deprecated by Meta (2024) — removed.
      // - `email` requires "Authenticate with Facebook Login" use case
      //   which this app doesn't have configured — removed.
      // - IG Business is auto-discovered via FB Pages flow.
      const scope = 'pages_show_list,pages_manage_posts,pages_read_engagement,instagram_content_publish,business_management,public_profile,ads_management';
      authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&state=${encodeURIComponent(state)}`;
    } else if (platformKey === 'tiktok') {
      const tiktokClientKey = process.env.EXPO_PUBLIC_TIKTOK_CLIENT_KEY || 'sbaw0n7p637do602ql';
      authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${tiktokClientKey}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent('user.info.basic,video.publish')}&response_type=code&state=${encodeURIComponent(state)}`;
    } else if (platformKey === 'pinterest') {
      // Pinterest OAuth — Trial-Access apps still use the same UI domain
      // (www.pinterest.com/oauth/) but the token-exchange happens against
      // api-sandbox.pinterest.com (configured server-side via PINTEREST_API_BASE).
      const pinClientId = process.env.EXPO_PUBLIC_PINTEREST_CLIENT_ID || '1568759';
      const pinScopes = 'pins:read,pins:write,boards:read,boards:write,user_accounts:read';
      authUrl = `https://www.pinterest.com/oauth/?response_type=code&client_id=${pinClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(pinScopes)}&state=${encodeURIComponent(state)}`;
    } else if (platformKey === 'threads') {
      // Threads OAuth — separate THREADS_APP_ID (NOT same as META_APP_ID).
      // graph.threads.net for token exchange (handled in oauth-callback).
      const threadsAppId = process.env.EXPO_PUBLIC_THREADS_APP_ID || '952201194080195';
      const threadsScopes = 'threads_basic,threads_content_publish,threads_manage_replies,threads_read_replies';
      authUrl = `https://threads.net/oauth/authorize?client_id=${threadsAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(threadsScopes)}&response_type=code&state=${encodeURIComponent(state)}`;
    }

    if (authUrl) {
      try {
        // Use openBrowserAsync (NOT openAuthSessionAsync) so the browser does NOT
        // intercept the redirect to the edge function — the edge function needs to
        // receive the OAuth code, exchange it for a token, and store the account.
        // openAuthSessionAsync was intercepting the redirect before it reached the server.
        const result = await WebBrowser.openBrowserAsync(authUrl, {
          dismissButtonStyle: 'done',
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
        console.log('OAuth browser result:', result.type);
        // After the browser is dismissed, refresh social accounts
        // Small delay to let the edge function finish processing
        setTimeout(() => refetchSocial(), 1500);
        setTimeout(() => refetchSocial(), 4000);
      } catch (err: any) {
        // Fallback to Linking if WebBrowser fails
        console.log('WebBrowser failed, falling back to Linking:', err.message);
        try {
          await Linking.openURL(authUrl);
          // Also refetch after some time when using Linking
          setTimeout(() => refetchSocial(), 5000);
        } catch (linkErr: any) {
          Alert.alert('Error', linkErr?.message ?? 'Kon de browser niet openen.');
        }
      }
    }
  };

  const handleOpenMediaPermissions = async () => {
    const canOpen = await Linking.canOpenURL('app-settings:');
    if (canOpen) {
      Linking.openURL('app-settings:');
    } else {
      Alert.alert(
        'Toestemmingen',
        'Open Instellingen → Privacy & Beveiliging → Foto\'s om AMOS toegang te geven tot je fotobibliotheek.',
        [{ text: 'OK' }],
      );
    }
  };

  // ── Row Component ────────────────────────────────────────────────────────
  const themeLabel = scheme === 'light' ? 'Licht ☀️' : scheme === 'dark' ? 'Donker 🌙' : 'Systeem ⚙️';

  const SettingsRow = ({
    icon, iconColor = colors.text, label, value, onPress, showChevron = true, rightElement,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    iconColor?: string;
    label: string;
    value?: string;
    onPress?: () => void;
    showChevron?: boolean;
    rightElement?: React.ReactNode;
  }) => (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={[styles.rowIconWrap, { backgroundColor: iconColor + '15' }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      {rightElement ?? (showChevron && onPress ? (
        <CaretRight size={18} color={colors.textTertiary} weight="bold" />
      ) : null)}
    </TouchableOpacity>
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.settings.title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Account ───────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>{t.settings.account}</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="person-outline"
            iconColor={colors.primary}
            label={t.settings.loggedInAs}
            value={email ?? t.common.loading}
            showChevron={false}
          />
          <View style={styles.separator} />
          {/* Sessions — web ↔ mobile parity (P1 closed 2026-06-09) */}
          <SettingsRow
            icon="phone-portrait-outline"
            iconColor={colors.primary}
            label="Sessies & apparaten"
            value="Op alle apparaten uitloggen"
            onPress={() => navigation.navigate('Sessions' as any)}
          />
          <View style={styles.separator} />
          <TouchableOpacity style={styles.row} onPress={handleLogout} activeOpacity={0.7}>
            <View style={[styles.rowIconWrap, { backgroundColor: colors.error + '15' }]}>
              <SignOut size={20} color={colors.error} weight="duotone" />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowLabel, { color: colors.error }]}>{t.settings.logout}</Text>
            </View>
            <CaretRight size={18} color={colors.textTertiary} weight="bold" />
          </TouchableOpacity>
        </View>

        {/* ── Watermerk-instellingen (alle users) ──────────────────────
            Free tier krijgt automatisch het AMOS-watermerk; iedereen kan
            kiezen WAAR het terechtkomt op je foto's. Server-side bake
            resolveert per request via:
              post.engagement.watermark_position
                → profiles.watermark_positions_by_channel[channel]
                  → profiles.watermark_position
                    → 'top-left'                                          */}
        <Text style={styles.sectionLabel}>Watermerk</Text>
        <View style={styles.card}>
          <WatermarkSettings />
        </View>

        {/* ── Developer Tools (superadmin-only) ─────────────────────────
            Tier-switcher + WatermarkPreview voor QA-testen. Alleen
            zichtbaar voor emails in SUPERADMIN_EMAILS. */}
        {isSuperadmin && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, marginTop: spacing.md, marginBottom: 4 }}>
              <ShieldCheck size={12} color={colors.primary} weight="fill" />
              <Text style={[styles.sectionLabel, { marginTop: 0, marginBottom: 0 }]}>
                DEVELOPER TOOLS
              </Text>
            </View>
            <View style={styles.card}>
              <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 4 }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
                  Tier switcher
                </Text>
              </View>
              <View style={styles.separator} />
              <TierSwitcher />
              <View style={styles.separator} />
              <WatermarkAdminEditor />
              <View style={styles.separator} />
              <WatermarkPreview />
            </View>
          </>
        )}

        {/* ── Mijn QR-kaart ─────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Mijn QR-kaart</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="qr-code-outline"
            iconColor={colors.primary}
            label="Profiel bewerken"
            value={qrProfile.full_name || 'Vul je gegevens in'}
            onPress={() => setShowQrEditor(true)}
          />
          <View style={styles.separator} />
          <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
            <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>
              Deze gegevens worden gedeeld via je QR-code en digitale visitekaart.
            </Text>
          </View>
        </View>

        {/* QR Profile Editor Modal */}
        <Modal visible={showQrEditor} animationType="slide" presentationStyle="pageSheet">
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
              <TouchableOpacity onPress={() => setShowQrEditor(false)}>
                <Text style={{ fontSize: fontSize.md, color: colors.textSecondary }}>Annuleren</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>QR Profiel</Text>
              <TouchableOpacity onPress={handleSaveQrProfile} disabled={qrSaving}>
                {qrSaving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primary }}>Opslaan</Text>
                )}
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md }}>
              {/* Contact fields */}
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm }}>Contactgegevens</Text>
              <View style={{ backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg }}>
                {[
                  { key: 'full_name', label: 'Volledige naam', placeholder: 'Jan Jansen', icon: 'person-outline' },
                  { key: 'email', label: 'E-mail', placeholder: 'jan@bedrijf.nl', icon: 'mail-outline' },
                  { key: 'phone', label: 'Telefoon', placeholder: '+31 6 12345678', icon: 'call-outline' },
                  { key: 'company', label: 'Bedrijf', placeholder: 'Inclufy', icon: 'business-outline' },
                  { key: 'title', label: 'Functie', placeholder: 'Marketing Manager', icon: 'briefcase-outline' },
                  { key: 'website', label: 'Website', placeholder: 'https://inclufy.com', icon: 'globe-outline' },
                ].map((field, i) => (
                  <View key={field.key} style={{ marginBottom: i < 5 ? spacing.sm : 0 }}>
                    <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 4 }}>{field.label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm }}>
                      <Ionicons name={field.icon as any} size={16} color={colors.textTertiary} />
                      <TextInput
                        style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: fontSize.sm, color: colors.text }}
                        value={(qrProfile as any)[field.key]}
                        onChangeText={(v) => setQrProfile(p => ({ ...p, [field.key]: v }))}
                        placeholder={field.placeholder}
                        placeholderTextColor={colors.textTertiary}
                        autoCapitalize={field.key === 'email' || field.key === 'website' ? 'none' : 'words'}
                        keyboardType={field.key === 'email' ? 'email-address' : field.key === 'phone' ? 'phone-pad' : field.key === 'website' ? 'url' : 'default'}
                      />
                    </View>
                  </View>
                ))}
              </View>

              {/* Social Media */}
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm }}>Social Media</Text>
              <View style={{ backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg }}>
                {[
                  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/janjansen', icon: 'logo-linkedin', color: '#0077B5' },
                  { key: 'instagram', label: 'Instagram', placeholder: '@janjansen', icon: 'logo-instagram', color: '#E4405F' },
                  { key: 'twitter', label: 'X / Twitter', placeholder: '@janjansen', icon: 'logo-twitter', color: '#1DA1F2' },
                  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/janjansen', icon: 'logo-facebook', color: '#1877F2' },
                  { key: 'whatsapp', label: 'WhatsApp', placeholder: '+31 6 12345678', icon: 'logo-whatsapp', color: '#25D366' },
                ].map((field, i) => (
                  <View key={field.key} style={{ marginBottom: i < 4 ? spacing.sm : 0 }}>
                    <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 4 }}>{field.label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm }}>
                      <Ionicons name={field.icon as any} size={16} color={field.color} />
                      <TextInput
                        style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: fontSize.sm, color: colors.text }}
                        value={(qrProfile as any)[field.key]}
                        onChangeText={(v) => setQrProfile(p => ({ ...p, [field.key]: v }))}
                        placeholder={field.placeholder}
                        placeholderTextColor={colors.textTertiary}
                        autoCapitalize="none"
                      />
                    </View>
                  </View>
                ))}
              </View>

              {/* Sharing toggles */}
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm }}>Delen via QR-code</Text>
              <View style={{ backgroundColor: colors.surface, borderRadius: borderRadius.lg, marginBottom: spacing.lg }}>
                {[
                  { key: 'share_email', label: 'E-mail' },
                  { key: 'share_phone', label: 'Telefoon' },
                  { key: 'share_company', label: 'Bedrijf' },
                  { key: 'share_title', label: 'Functie' },
                  { key: 'share_website', label: 'Website' },
                  { key: 'share_linkedin', label: 'LinkedIn' },
                  { key: 'share_instagram', label: 'Instagram' },
                  { key: 'share_twitter', label: 'X / Twitter' },
                  { key: 'share_facebook', label: 'Facebook' },
                  { key: 'share_whatsapp', label: 'WhatsApp' },
                ].map((toggle, i, arr) => (
                  <React.Fragment key={toggle.key}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12 }}>
                      <Text style={{ fontSize: fontSize.sm, color: colors.text }}>{toggle.label}</Text>
                      <Switch
                        value={qrFields[toggle.key] !== false}
                        onValueChange={(v) => setQrFields(prev => ({ ...prev, [toggle.key]: v }))}
                        trackColor={{ false: colors.border, true: colors.primaryLight }}
                        thumbColor={qrFields[toggle.key] !== false ? colors.primary : colors.textTertiary}
                      />
                    </View>
                    {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: colors.borderLight, marginLeft: spacing.md }} />}
                  </React.Fragment>
                ))}
              </View>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </Modal>

        {/* ── Voorkeuren ────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>{t.settings.preferences}</Text>
        <View style={styles.card}>
          {/* Photo library & camera access shortcuts */}
          <SettingsRow
            icon="images-outline"
            iconColor="#E4405F"
            label="Fotobibliotheek toegang"
            value="Open Instellingen → AMOS → Foto's"
            onPress={handleOpenMediaPermissions}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="camera-outline"
            iconColor="#0077B5"
            label="Camera toegang"
            value="Open Instellingen → AMOS → Camera"
            onPress={() => Linking.openURL('app-settings:')}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="notifications-outline"
            iconColor={colors.info}
            label={t.settings.notificationsLabel}
            showChevron={false}
            rightElement={
              <Switch
                value={notificationsEnabled}
                onValueChange={handleToggleNotifications}
                trackColor={{ false: colors.border, true: colors.primaryLight }}
                thumbColor={notificationsEnabled ? colors.primary : colors.textTertiary}
              />
            }
          />
          {biometricAvailable && (
            <>
              <View style={styles.separator} />
              <SettingsRow
                icon="finger-print-outline"
                iconColor={colors.secondary}
                label={t.settings.biometricLogin}
                showChevron={false}
                rightElement={
                  <Switch
                    value={biometricEnabled}
                    onValueChange={handleToggleBiometric}
                    trackColor={{ false: colors.border, true: colors.primaryLight }}
                    thumbColor={biometricEnabled ? colors.primary : colors.textTertiary}
                  />
                }
              />
            </>
          )}
          <View style={styles.separator} />
          <SettingsRow
            icon="moon-outline"
            iconColor="#8B5CF6"
            label="Weergave / Thema"
            value={themeLabel}
            onPress={handleThemeSwitch}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="language-outline"
            iconColor={colors.accent}
            label={t.settings.language}
            value={LOCALE_LABELS[locale]}
            onPress={handleLanguageSwitch}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="shield-checkmark-outline"
            iconColor="#10B981"
            label={t.aiConsent?.settingsLabel ?? 'AI Data Processing'}
            value={aiConsentGiven ? (t.aiConsent?.consentGiven ?? 'Consent given') : (t.aiConsent?.consentRevoked ?? 'Consent revoked')}
            showChevron={false}
            rightElement={
              <Switch
                value={aiConsentGiven}
                onValueChange={(value) => {
                  if (value) {
                    grantAIConsent();
                  } else {
                    revokeConsent();
                  }
                }}
                trackColor={{ false: colors.border, true: '#10B981' + '60' }}
                thumbColor={aiConsentGiven ? '#10B981' : colors.textTertiary}
              />
            }
          />
        </View>

        {/* ── My Location ─────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>{t.regionScanner?.myLocation ?? 'Mijn locatie'}</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="location-outline"
            iconColor={colors.primary}
            label={t.regionScanner?.currentLocation ?? 'Huidige locatie'}
            value={savedLocation ? formatRegion(savedLocation, 'short') : (t.regionScanner?.noLocationAvailable ?? 'Geen locatie beschikbaar')}
            onPress={handleDetectLocation}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="navigate-outline"
            iconColor={colors.success}
            label={t.regionScanner?.autoDetect ?? 'Auto-detectie'}
            onPress={handleDetectLocation}
            rightElement={
              gpsLocation.loading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : undefined
            }
          />
          {savedLocation && (
            <>
              <View style={styles.separator} />
              <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>
                  {formatRegion(savedLocation, 'full')}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* ── App ───────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>{t.settings.app}</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="color-palette-outline"
            iconColor={colors.primary}
            label={t.settings.brandKitManage}
            onPress={() => navigation.navigate('BrandKit')}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="notifications-circle-outline"
            iconColor={colors.info}
            label={t.settings.pushNotifications}
            value="iPhone Instellingen"
            onPress={handlePushNotifications}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="download-outline"
            iconColor={colors.success}
            label={t.settings.dataExport}
            value={exportLoading ? 'Exporteren...' : 'Events, captures & posts'}
            onPress={exportLoading ? undefined : handleDataExport}
          />
        </View>

        {/* ── Social Media ──────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Social Media</Text>

        {/* Wizard CTA — vervangt eventueel Alert.alert flow voor nieuwe users */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.navigate('SocialMediaWizard', undefined)}
          style={{
            backgroundColor: colors.primary + '12',
            borderWidth: 1,
            borderColor: colors.primary + '40',
            borderRadius: borderRadius.md,
            padding: spacing.md,
            marginBottom: spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <Sparkle size={22} color={colors.primary} weight="fill" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.primary }}>
              Verbind via wizard
            </Text>
            <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 }}>
              Gegidste flow met AI-merkstem analyse — aanbevolen
            </Text>
          </View>
          <CaretRight size={18} color={colors.primary} weight="bold" />
        </TouchableOpacity>

        <View style={styles.card}>
          {SOCIAL_PLATFORMS.map((platform, index) => {
            const connectedAccounts = (socialAccounts as any[]).filter(
              (a: any) => a.platform === platform.key && (a.status === 'active' || a.is_active),
            );
            const isConnected = connectedAccounts.length > 0;
            return (
              <React.Fragment key={platform.key}>
                {index > 0 && <View style={styles.separator} />}
                <TouchableOpacity style={styles.row} onPress={() => handleConnectSocial(platform.key)} activeOpacity={0.7}>
                  <View style={[styles.rowIconWrap, { backgroundColor: platform.color + '18' }]}>
                    <Ionicons name={platform.icon as any} size={20} color={platform.color} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>{platform.label}</Text>
                    {connectedAccounts.map((acc: any, i: number) => (
                      <View key={acc.id || i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success }} />
                        <Text style={{ fontSize: fontSize.xs, color: colors.success }} numberOfLines={1}>
                          {acc.account_name || 'Verbonden'}
                          {acc.account_type === 'page' ? ' 🏢' : acc.account_type === 'business' ? ' 💼' : ''}
                        </Text>
                      </View>
                    ))}
                    {!platform.supported && !isConnected && (
                      <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 2 }}>Binnenkort</Text>
                    )}
                    {(platform as any).manualOnly && !isConnected && (
                      <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 }}>
                        Manueel delen — geen koppeling nodig
                      </Text>
                    )}
                  </View>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: isConnected
                      ? colors.success + '12'
                      : (platform as any).manualOnly
                        ? colors.success + '12'
                        : colors.primary + '12',
                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
                  }}>
                    <Ionicons
                      name={
                        isConnected ? 'checkmark-circle-outline' :
                        (platform as any).manualOnly ? 'hand-left-outline' :
                        'link-outline'
                      }
                      size={14}
                      color={
                        isConnected ? colors.success :
                        (platform as any).manualOnly ? colors.success :
                        colors.primary
                      }
                    />
                    <Text style={{
                      fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
                      color: isConnected
                        ? colors.success
                        : (platform as any).manualOnly
                          ? colors.success
                          : colors.primary,
                    }}>
                      {isConnected
                        ? `${connectedAccounts.length} verbonden`
                        : (platform as any).manualOnly
                          ? 'Klaar'
                          : 'Verbinden'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
          <View style={styles.separator} />
          <TouchableOpacity style={styles.row} onPress={() => refetchSocial()} activeOpacity={0.7}>
            <View style={[styles.rowIconWrap, { backgroundColor: colors.info + '15' }]}>
              <ArrowsClockwise size={20} color={colors.info} weight="bold" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Status vernieuwen</Text>
              <Text style={styles.rowValue}>Laad verbindingen opnieuw</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Manual Connect Modal */}
        <Modal visible={showManualConnect} animationType="slide" presentationStyle="pageSheet">
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }}>
              <TouchableOpacity onPress={() => setShowManualConnect(false)}>
                <Text style={{ fontSize: fontSize.md, color: colors.textSecondary }}>Annuleren</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>
                {SOCIAL_PLATFORMS.find(p => p.key === manualPlatform)?.label || 'Social'} koppelen
              </Text>
              <TouchableOpacity onPress={handleManualConnect} disabled={manualConnecting}>
                {manualConnecting ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primary }}>Opslaan</Text>
                )}
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md }}>
              <View style={{ backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm }}>
                  Accountnaam of paginanaam
                </Text>
                <View style={{ backgroundColor: colors.background, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, marginBottom: spacing.md }}>
                  <TextInput
                    style={{ paddingVertical: 12, fontSize: fontSize.sm, color: colors.text }}
                    value={manualAccountName}
                    onChangeText={setManualAccountName}
                    placeholder="bijv. Inclufy of @inclufy"
                    placeholderTextColor={colors.textTertiary}
                    autoFocus
                  />
                </View>

                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm }}>
                  Profiel URL (optioneel)
                </Text>
                <View style={{ backgroundColor: colors.background, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm }}>
                  <TextInput
                    style={{ paddingVertical: 12, fontSize: fontSize.sm, color: colors.text }}
                    value={manualAccountUrl}
                    onChangeText={setManualAccountUrl}
                    placeholder="https://..."
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                </View>
              </View>

              <View style={{ backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Info size={18} color={colors.info} weight="regular" />
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>Handmatige koppeling</Text>
                </View>
                <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 18 }}>
                  Met handmatig koppelen kun je je account of bedrijfspagina toevoegen zonder OAuth.
                  Dit is handig voor bedrijfspagina's of accounts die je alleen wilt tracken.
                  {'\n\n'}
                  Voor volledige API-toegang (automatisch posten, statistieken) gebruik je de OAuth koppeling via het hoofdmenu.
                </Text>
              </View>
            </ScrollView>
          </View>
        </Modal>

        {/* ── WhatsApp Business ─────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>WhatsApp Business</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="logo-whatsapp"
            iconColor="#25D366"
            label="WhatsApp Business API"
            value="Templates, ontvangers & verzendingen"
            onPress={() => navigation.navigate('WhatsAppSettings' as any)}
          />
        </View>

        {/* ── Demo ──────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>{t.settings.demo ?? 'DEMO'}</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="sparkles-outline"
            iconColor={colors.accent}
            label={t.settings.demoEnvironment ?? 'Demo Omgeving'}
            value={t.settings.demoEnvironmentDesc ?? 'Genereer demo-events'}
            onPress={() => navigation.navigate('DemoEnvironment')}
          />
        </View>

        {/* ── Gegevensbeheer ────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Gegevensbeheer</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="download-outline"
            iconColor={colors.success}
            label="Mijn data exporteren"
            value={exportLoading ? 'Exporteren...' : 'Posts, captures & events als JSON'}
            onPress={exportLoading ? undefined : handleDataExport}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="trash-outline"
            iconColor={colors.error}
            label="Account verwijderen"
            value="Verwijder account en alle data"
            onPress={handleDeleteAccount}
          />
        </View>

        {/* ── Over ──────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>{t.settings.about}</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="information-circle-outline"
            iconColor={colors.textSecondary}
            label={t.settings.appVersion}
            value="1.0.0 (Build 32)"
            showChevron={false}
          />
          <View style={styles.separator} />
          <SettingsRow
            icon="globe-outline"
            iconColor={colors.primary}
            label="inclufy.com"
            value="Open web dashboard"
            onPress={() => Linking.openURL('https://inclufy.com')}
          />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* AI Consent Modal (shown when toggling consent ON from settings) */}
      {showAIConsentModal && (
        <AIConsentModal visible={showAIConsentModal} onAccept={onAIConsentAccept} onDecline={onAIConsentDecline} />
      )}
    </View>
  );
}
