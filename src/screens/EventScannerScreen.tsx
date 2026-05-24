// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: flash ? 'flash' : 'flash-outline'> | Ionicons name=<dynamic: locationSource === 'gps' ? 'navigate' : locationSource === 'event' ? 'location' : 'search'> | Ionicons name=<dynamic: opt.icon as any>
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../services/supabase';
import type { RootStackParamList } from '../types';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { useTranslation } from '../i18n';
import { useLocation, formatRegion, type RegionData } from '../hooks/useLocation';

import { ArrowsClockwise, Buildings, Camera, Check, Envelope, Globe, MapPin, MapTrifold, PencilLine, Phone, QrCode, Scan, User, UserPlus } from 'phosphor-react-native';
// ─── Types ───────────────────────────────────────────────────────────────────

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'EventScanner'>;

type LocationSource = 'gps' | 'event' | 'manual';

interface ScannedContact {
  id: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  scanned_at: string;
  city?: string;
  country?: string;
  raw: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse QR code data into a contact object.
 *  Supports: vCard (BEGIN:VCARD), JSON, plain email, plain text */
function parseQRContact(raw: string): Partial<ScannedContact> {
  const trimmed = raw.trim();

  // Try JSON
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      return {
        name: obj.name || obj.full_name || obj.displayName || '',
        email: obj.email || obj.mail || '',
        company: obj.company || obj.organization || obj.org || '',
        phone: obj.phone || obj.tel || obj.mobile || '',
      };
    } catch { /* fall through */ }
  }

  // Try vCard
  if (trimmed.toUpperCase().includes('BEGIN:VCARD')) {
    const lines = trimmed.split(/\r?\n/);
    const get = (key: string): string => {
      const line = lines.find((l) => l.toUpperCase().startsWith(key.toUpperCase() + ':'));
      return line ? line.substring(key.length + 1).trim() : '';
    };
    const getFN = (): string => {
      const fn = get('FN');
      if (fn) return fn;
      const n = get('N');
      if (n) {
        const parts = n.split(';');
        return [parts[1], parts[0]].filter(Boolean).join(' ');
      }
      return '';
    };
    const getEmail = (): string => {
      const line = lines.find((l) => l.toUpperCase().includes('EMAIL'));
      return line ? line.split(':').slice(1).join(':').trim() : '';
    };
    const getTel = (): string => {
      const line = lines.find((l) => l.toUpperCase().includes('TEL'));
      return line ? line.split(':').slice(1).join(':').trim() : '';
    };
    const getOrg = (): string => {
      const line = lines.find((l) => l.toUpperCase().startsWith('ORG:'));
      return line ? line.substring(4).trim() : '';
    };

    return {
      name: getFN(),
      email: getEmail(),
      company: getOrg(),
      phone: getTel(),
    };
  }

  // Try plain email
  const emailMatch = trimmed.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    return { email: emailMatch[0], name: '' };
  }

  // Plain text: use as name
  return { name: trimmed };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EventScannerScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { eventId } = route.params;
  const { colors } = useTheme();
  const { t, locale } = useTranslation();

  const dateLocale = locale === 'nl' ? 'nl-NL' : locale === 'fr' ? 'fr-FR' : 'en-US';

  // ─── Location state ──────────────────────────────────────────
  const gpsLocation = useLocation(true);
  const [locationSource, setLocationSource] = useState<LocationSource>('gps');
  const [sessionRegion, setSessionRegion] = useState<RegionData | null>(null);
  const [eventRegion, setEventRegion] = useState<RegionData | null>(null);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualCity, setManualCity] = useState('');
  const [manualProvince, setManualProvince] = useState('');
  const [manualCountry, setManualCountry] = useState('');

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scannedList, setScannedList] = useState<ScannedContact[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editContact, setEditContact] = useState<Partial<ScannedContact>>({});
  const [manualMode, setManualMode] = useState(false);
  const [flash, setFlash] = useState(false);

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: '#000' },

    // Permission
    permissionContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      backgroundColor: c.background,
      padding: spacing.xl,
      gap: spacing.md,
    },
    permissionTitle: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    permissionSub: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
      textAlign: 'center' as const,
    },
    permissionBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      marginTop: spacing.sm,
    },
    permissionBtnText: { color: '#fff', fontWeight: fontWeight.semibold },

    // Camera
    cameraContainer: {
      height: '40%' as any,
      position: 'relative' as const,
      backgroundColor: '#111',
    },
    manualOverlay: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    manualOverlayText: {
      color: 'rgba(255,255,255,0.4)',
      fontSize: fontSize.md,
    },
    scanFrame: {
      position: 'absolute' as const,
      top: '50%',
      left: '50%',
      width: 200,
      height: 200,
      marginTop: -100,
      marginLeft: -100,
    },
    corner: {
      position: 'absolute' as const,
      width: 24,
      height: 24,
      borderColor: c.primary,
      borderWidth: 3,
    },
    cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderRadius: 4 },
    cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderRadius: 4 },
    cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderRadius: 4 },
    cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderRadius: 4 },
    cameraControls: {
      position: 'absolute' as const,
      bottom: spacing.md,
      left: spacing.md,
      right: spacing.md,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    },
    cameraCtrlBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    cameraCtrlBtnActive: {
      backgroundColor: c.primary,
    },
    scanHintPill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
    },
    scanHintText: {
      color: 'rgba(255,255,255,0.8)',
      fontSize: fontSize.xs,
      fontWeight: fontWeight.medium,
    },

    // List
    listContainer: {
      flex: 1,
      backgroundColor: c.background,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    listHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: spacing.sm,
    },
    listTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    emptyList: {
      alignItems: 'center' as const,
      paddingVertical: spacing.xl,
      gap: spacing.sm,
    },
    emptyListText: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.medium,
      color: c.textSecondary,
    },
    emptyListSub: {
      fontSize: fontSize.sm,
      color: c.textTertiary,
    },
    contactRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.borderLight,
      gap: spacing.sm,
    },
    contactAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: c.primary + '20',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    contactAvatarText: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: c.primary,
    },
    contactInfo: { flex: 1 },
    contactName: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.text,
    },
    contactMeta: {
      fontSize: fontSize.xs,
      color: c.textSecondary,
      marginTop: 1,
    },
    contactTime: {
      fontSize: fontSize.xs,
      color: c.textTertiary,
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end' as const,
    },
    modalSheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: spacing.lg,
      paddingBottom: 40,
      paddingTop: spacing.md,
    },
    modalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      alignSelf: 'center' as const,
      marginBottom: spacing.md,
    },
    modalTitle: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      color: c.text,
      marginBottom: spacing.lg,
    },
    modalFields: { gap: spacing.sm },
    fieldRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: c.borderLight,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    fieldInput: {
      flex: 1,
      fontSize: fontSize.md,
      color: c.text,
      padding: 0,
    },
    modalActions: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
      marginTop: spacing.xl,
    },
    modalCancelBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: c.borderLight,
      alignItems: 'center' as const,
    },
    modalCancelText: {
      color: c.textSecondary,
      fontWeight: fontWeight.semibold,
    },
    modalSaveBtn: {
      flex: 2,
      flexDirection: 'row' as const,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      backgroundColor: c.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: spacing.sm,
    },
    modalSaveText: {
      color: '#fff',
      fontWeight: fontWeight.bold,
      fontSize: fontSize.md,
    },

    // Location bar
    locationBar: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.borderLight,
      gap: spacing.xs,
    },
    locationInfo: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
    },
    locationText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      flex: 1,
      color: c.text,
    },
    locationChips: {
      flexDirection: 'row' as const,
      gap: spacing.xs,
    },
    locationChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: c.border,
    },
    locationChipText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.medium,
    },
    locationChipActive: {
      backgroundColor: c.primary + '15',
      borderColor: c.primary,
    },
    contactLocationRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 3,
      marginTop: 2,
    },
    contactLocationText: {
      fontSize: 10,
      color: c.textTertiary,
    },
    locationPreview: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      backgroundColor: c.primary + '10',
      borderColor: c.primary + '30',
      marginTop: spacing.sm,
    },
    locationPreviewText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      color: c.primary,
    },
  }));

  // ─── Sync GPS region to session ──────────────────────────────
  useEffect(() => {
    if (gpsLocation.region && locationSource === 'gps') {
      setSessionRegion(gpsLocation.region);
    }
  }, [gpsLocation.region, locationSource]);

  // ─── Load event location ─────────────────────────────────────
  useEffect(() => {
    loadEventLocation();
  }, [eventId]);

  const loadEventLocation = async () => {
    try {
      const { data } = await supabase
        .from('go_events')
        .select('location')
        .eq('id', eventId)
        .single();
      if (data?.location) {
        const parts = data.location.split(',').map((s: string) => s.trim());
        const city = parts.length > 1 ? parts[parts.length - 1] : parts[0];
        setEventRegion({
          city: city || '',
          province: '',
          country: '',
          countryCode: '',
          continent: '',
        });
      }
    } catch {
      // Event location not available
    }
  };

  const handleLocationSourceChange = (source: LocationSource) => {
    setLocationSource(source);
    if (source === 'gps' && gpsLocation.region) {
      setSessionRegion(gpsLocation.region);
    } else if (source === 'event' && eventRegion) {
      setSessionRegion(eventRegion);
    } else if (source === 'manual') {
      setManualModalVisible(true);
    }
  };

  const applyManualLocation = () => {
    const manual: RegionData = {
      city: manualCity.trim(),
      province: manualProvince.trim(),
      country: manualCountry.trim(),
      countryCode: '',
      continent: '',
    };
    setSessionRegion(manual);
    setManualModalVisible(false);
  };

  useEffect(() => {
    if (!permission?.granted) requestPermission();
    loadExistingScans();
  }, []);

  const loadExistingScans = async () => {
    const { data: { user } = {} as any } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('go_event_scans')
      .select('*')
      .eq('event_id', eventId)
      .order('scanned_at', { ascending: false })
      .limit(20);
    if (data) setScannedList(data as any);
  };

  const handleBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (!scanning) return;
      setScanning(false);
      const parsed = parseQRContact(data);
      setEditContact({ ...parsed, raw: data });
      setModalVisible(true);
    },
    [scanning],
  );

  const saveContact = async () => {
    if (!editContact.name && !editContact.email) {
      Alert.alert(t.eventScanner.requiredField, t.eventScanner.requiredMsg);
      return;
    }
    setSaving(true);
    try {
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('go_event_scans')
        .insert({
          event_id: eventId,
          user_id: user.id,
          name: editContact.name || '',
          email: editContact.email || '',
          company: editContact.company || '',
          phone: editContact.phone || '',
          raw_data: editContact.raw || '',
          scanned_at: new Date().toISOString(),
          // Session location
          city: sessionRegion?.city || '',
          province: sessionRegion?.province || '',
          country: sessionRegion?.country || '',
          continent: sessionRegion?.continent || '',
          location_source: locationSource,
        })
        .select()
        .single();

      if (error) throw error;

      // Also create a contact in go_contacts if email provided
      if (editContact.email) {
        await supabase.from('go_contacts').upsert({
          user_id: user.id,
          name: editContact.name || editContact.email,
          email: editContact.email,
          company: editContact.company || '',
          phone: editContact.phone || '',
          source: 'event_scan',
          event_id: eventId,
          city: sessionRegion?.city || '',
          province: sessionRegion?.province || '',
          country: sessionRegion?.country || '',
        }, { onConflict: 'user_id,email' });
      }

      setScannedList((prev) => [data as any, ...prev]);
      setModalVisible(false);
      setEditContact({});
    } catch (err: any) {
      Alert.alert(t.common.error, err.message || t.eventScanner.saveError);
    } finally {
      setSaving(false);
      // Resume scanning after 1.5s
      setTimeout(() => setScanning(true), 1500);
    }
  };

  const dismissModal = () => {
    setModalVisible(false);
    setEditContact({});
    setTimeout(() => setScanning(true), 500);
  };

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Camera size={48} color={colors.primary} weight="duotone" />
        <Text style={styles.permissionTitle}>{t.eventScanner.needCamera}</Text>
        <Text style={styles.permissionSub}>
          {t.eventScanner.needCameraSub}
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>{t.eventScanner.grantPerm}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera viewfinder */}
      <View style={styles.cameraContainer}>
        {!manualMode && (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            enableTorch={flash}
            onBarcodeScanned={scanning ? handleBarcodeScanned : undefined}
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'pdf417', 'code128', 'datamatrix'] }}
          />
        )}

        {manualMode && (
          <View style={styles.manualOverlay}>
            <UserPlus size={48} color="rgba(255,255,255,0.4)" weight="duotone" />
            <Text style={styles.manualOverlayText}>{t.eventScanner.manualEntry}</Text>
          </View>
        )}

        {/* Scan frame */}
        {!manualMode && (
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        )}

        {/* Camera controls row */}
        <View style={styles.cameraControls}>
          <TouchableOpacity
            style={[styles.cameraCtrlBtn, flash && styles.cameraCtrlBtnActive]}
            onPress={() => setFlash(!flash)}
          >
            <Ionicons name={flash ? 'flash' : 'flash-outline'} size={20} color="#fff" />
          </TouchableOpacity>

          <View style={styles.scanHintPill}>
            <QrCode size={14} color="rgba(255,255,255,0.8)" weight="duotone" />
            <Text style={styles.scanHintText}>
              {scanning ? t.eventScanner.scanHint : t.eventScanner.processing}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.cameraCtrlBtn, manualMode && styles.cameraCtrlBtnActive]}
            onPress={() => {
              setManualMode(!manualMode);
              if (!manualMode) {
                setEditContact({});
                setModalVisible(true);
              }
            }}
          >
            <PencilLine size={20} color="#fff" weight="duotone" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Location Source Bar ─────────────────────────────────── */}
      <View style={styles.locationBar}>
        {/* Location display */}
        <View style={styles.locationInfo}>
          <Ionicons
            name={locationSource === 'gps' ? 'navigate' : locationSource === 'event' ? 'location' : 'search'}
            size={14}
            color={colors.primary}
          />
          <Text style={styles.locationText} numberOfLines={1}>
            {sessionRegion
              ? formatRegion(sessionRegion, 'full')
              : gpsLocation.loading
                ? t.regionScanner.detectingLocation
                : t.regionScanner.noLocationAvailable}
          </Text>
          {gpsLocation.loading && <ActivityIndicator size="small" color={colors.primary} />}
        </View>

        {/* Source chips */}
        <View style={styles.locationChips}>
          {([
            { key: 'gps' as LocationSource, icon: 'navigate-outline', label: 'GPS' },
            { key: 'event' as LocationSource, icon: 'location-outline', label: 'Event' },
            { key: 'manual' as LocationSource, icon: 'search-outline', label: t.regionScanner.manualSearch },
          ]).map((opt) => {
            const active = locationSource === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.locationChip,
                  active && styles.locationChipActive,
                ]}
                onPress={() => handleLocationSourceChange(opt.key)}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={12}
                  color={active ? colors.primary : colors.textSecondary}
                />
                <Text style={[
                  styles.locationChipText,
                  { color: active ? colors.primary : colors.textSecondary },
                  active && { fontWeight: fontWeight.semibold as any },
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Scanned list */}
      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {t.eventScanner.scannedToday} ({scannedList.length})
          </Text>
          {scannedList.length > 0 && (
            <TouchableOpacity onPress={loadExistingScans}>
              <ArrowsClockwise size={18} color={colors.primary} weight="bold" />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {scannedList.length === 0 ? (
            <View style={styles.emptyList}>
              <Scan size={32} color={colors.textTertiary} weight="regular" />
              <Text style={styles.emptyListText}>{t.eventScanner.noScansYet}</Text>
              <Text style={styles.emptyListSub}>{t.eventScanner.noScansSub}</Text>
            </View>
          ) : (
            scannedList.map((c) => {
              const contactLocation = [c.city, c.country].filter(Boolean).join(', ');
              return (
                <View key={c.id} style={styles.contactRow}>
                  <View style={styles.contactAvatar}>
                    <Text style={styles.contactAvatarText}>
                      {(c.name || c.email || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{c.name || c.email || t.eventScanner.unknown}</Text>
                    {c.email ? (
                      <Text style={styles.contactMeta}>{c.email}</Text>
                    ) : null}
                    {c.company ? (
                      <Text style={styles.contactMeta}>{c.company}</Text>
                    ) : null}
                    {contactLocation ? (
                      <View style={styles.contactLocationRow}>
                        <MapPin size={10} color={colors.textTertiary} weight="duotone" />
                        <Text style={styles.contactLocationText}>
                          {contactLocation}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.contactTime}>
                    {new Date(c.scanned_at).toLocaleTimeString(dateLocale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              );
            })
          )}
          <View style={{ height: 20 }} />
        </ScrollView>
      </View>

      {/* Contact detail / edit modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={dismissModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitle}>
              {editContact.name || editContact.email
                ? t.eventScanner.confirmContact
                : t.eventScanner.newContact}
            </Text>

            {/* Parsed preview / edit fields */}
            <View style={styles.modalFields}>
              <View style={styles.fieldRow}>
                <User size={18} color={colors.textSecondary} weight="duotone" />
                <TextInput
                  style={styles.fieldInput}
                  value={editContact.name || ''}
                  onChangeText={(v) => setEditContact((p) => ({ ...p, name: v }))}
                  placeholder={t.eventScanner.namePlaceholder}
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
              <View style={styles.fieldRow}>
                <Envelope size={18} color={colors.textSecondary} weight="duotone" />
                <TextInput
                  style={styles.fieldInput}
                  value={editContact.email || ''}
                  onChangeText={(v) => setEditContact((p) => ({ ...p, email: v }))}
                  placeholder={t.eventScanner.emailPlaceholder}
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.fieldRow}>
                <Buildings size={18} color={colors.textSecondary} weight="duotone" />
                <TextInput
                  style={styles.fieldInput}
                  value={editContact.company || ''}
                  onChangeText={(v) => setEditContact((p) => ({ ...p, company: v }))}
                  placeholder={t.eventScanner.companyPlaceholder}
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
              <View style={styles.fieldRow}>
                <Phone size={18} color={colors.textSecondary} weight="duotone" />
                <TextInput
                  style={styles.fieldInput}
                  value={editContact.phone || ''}
                  onChangeText={(v) => setEditContact((p) => ({ ...p, phone: v }))}
                  placeholder={t.eventScanner.phonePlaceholder}
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            {/* Location preview in modal */}
            {sessionRegion && (
              <View style={styles.locationPreview}>
                <MapPin size={14} color={colors.primary} weight="duotone" />
                <Text style={styles.locationPreviewText}>
                  {formatRegion(sessionRegion, 'short')}
                </Text>
              </View>
            )}

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={dismissModal}>
                <Text style={styles.modalCancelText}>{t.eventScanner.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={saveContact}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Check size={18} color="#fff" weight="bold" />
                    <Text style={styles.modalSaveText}>{t.eventScanner.save}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manual location modal */}
      <Modal
        visible={manualModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setManualModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {t.regionScanner.selectLocation}
            </Text>

            <View style={styles.modalFields}>
              <View style={styles.fieldRow}>
                <Buildings size={18} color={colors.textSecondary} weight="duotone" />
                <TextInput
                  style={styles.fieldInput}
                  value={manualCity}
                  onChangeText={setManualCity}
                  placeholder={t.regionScanner.manualCity}
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.fieldRow}>
                <MapTrifold size={18} color={colors.textSecondary} weight="duotone" />
                <TextInput
                  style={styles.fieldInput}
                  value={manualProvince}
                  onChangeText={setManualProvince}
                  placeholder={t.regionScanner.manualProvince}
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="words"
                />
              </View>
              <View style={styles.fieldRow}>
                <Globe size={18} color={colors.textSecondary} weight="duotone" />
                <TextInput
                  style={styles.fieldInput}
                  value={manualCountry}
                  onChangeText={setManualCountry}
                  placeholder={t.regionScanner.manualCountry}
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setManualModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>{t.eventScanner.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={applyManualLocation}
              >
                <Check size={18} color="#fff" weight="bold" />
                <Text style={styles.modalSaveText}>{t.regionScanner.apply}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
