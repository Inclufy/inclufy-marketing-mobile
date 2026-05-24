import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { useCreateContact } from '../hooks/useContacts';

import { Camera, UserPlus, X } from 'phosphor-react-native';
interface ParsedContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  url?: string;
}

function parseVCard(raw: string): ParsedContact {
  const contact: ParsedContact = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    const k = key?.split(';')[0]?.toUpperCase() ?? '';
    if (k === 'FN') {
      const parts = value.split(' ');
      contact.firstName = parts[0];
      contact.lastName = parts.slice(1).join(' ') || undefined;
    } else if (k === 'N') {
      const parts = value.split(';');
      if (parts[0]) contact.lastName = parts[0];
      if (parts[1]) contact.firstName = parts[1];
    } else if (k === 'EMAIL' || k.startsWith('EMAIL')) {
      contact.email = value;
    } else if (k === 'TEL' || k.startsWith('TEL')) {
      contact.phone = value;
    } else if (k === 'ORG') {
      contact.company = value.replace(';', ' ').trim();
    } else if (k === 'TITLE') {
      contact.title = value;
    } else if (k === 'URL') {
      contact.url = value;
    }
  }
  return contact;
}

function parseContactFromQR(data: string): ParsedContact {
  // vCard format
  if (data.startsWith('BEGIN:VCARD') || data.startsWith('MECARD:')) {
    if (data.startsWith('MECARD:')) {
      // MeCard format: MECARD:N:Doe,John;EMAIL:john@example.com;TEL:+1234;;
      const contact: ParsedContact = {};
      const fields = data.replace('MECARD:', '').split(';');
      for (const field of fields) {
        const [k, v] = field.split(':');
        if (!k || !v) continue;
        if (k === 'N') {
          const [last, first] = v.split(',');
          contact.lastName = last;
          contact.firstName = first;
        } else if (k === 'EMAIL') contact.email = v;
        else if (k === 'TEL') contact.phone = v;
        else if (k === 'ORG') contact.company = v;
        else if (k === 'URL') contact.url = v;
      }
      return contact;
    }
    return parseVCard(data);
  }
  // Plain email
  if (data.includes('@') && !data.startsWith('http')) {
    return { email: data };
  }
  // Plain phone
  if (/^\+?[\d\s\-()]{7,}$/.test(data)) {
    return { phone: data };
  }
  // URL — LinkedIn, website, or other profile link
  if (data.startsWith('http://') || data.startsWith('https://')) {
    const contact: ParsedContact = { url: data };
    // Extract name from LinkedIn URL if possible
    const linkedinMatch = data.match(/linkedin\.com\/in\/([^/?]+)/i);
    if (linkedinMatch) {
      const slug = decodeURIComponent(linkedinMatch[1]).replace(/-/g, ' ');
      const parts = slug.split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1));
      if (parts.length >= 2) {
        contact.firstName = parts[0];
        contact.lastName = parts.slice(1).join(' ');
      } else if (parts.length === 1) {
        contact.firstName = parts[0];
      }
      contact.company = 'LinkedIn';
    }
    return contact;
  }
  return {};
}

export default function QRScanScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [parsed, setParsed] = useState<ParsedContact | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const createContact = useCreateContact();
  const lastScan = useRef<string>('');

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, []);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned || data === lastScan.current) return;
    lastScan.current = data;
    setScanned(true);
    const contact = parseContactFromQR(data);
    if (Object.keys(contact).length === 0) {
      Alert.alert(
        t.qrScan?.unknownQR ?? 'Unknown QR',
        t.qrScan?.unknownQRMsg ?? 'This QR code does not contain contact information.',
        [{ text: 'OK', onPress: () => { setScanned(false); lastScan.current = ''; } }]
      );
      return;
    }
    setParsed(contact);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!parsed) return;
    setSaving(true);
    try {
      await createContact.mutateAsync({
        first_name: parsed.firstName ?? null,
        last_name: parsed.lastName ?? null,
        email: parsed.email ?? null,
        phone: parsed.phone ?? null,
        source: 'qr_scan',
        tags: ['qr-scan'],
        attributes: {
          company: parsed.company,
          title: parsed.title,
          url: parsed.url,
          captured_via: 'qr_scan',
        },
      });
      setShowModal(false);
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Could not save contact.');
    } finally {
      setSaving(false);
    }
  };

  const handleRescan = () => {
    setShowModal(false);
    setParsed(null);
    setScanned(false);
    lastScan.current = '';
  };

  if (!permission) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Camera size={48} color={colors.textTertiary} weight="duotone" />
        <Text style={styles.permText}>{t.qrScan?.needCamera ?? 'Camera permission required'}</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>{t.qrScan?.grantPerm ?? 'Grant permission'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'datamatrix'] }}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top hint */}
        <View style={styles.topHint}>
          <Text style={styles.hintText}>{t.qrScan?.hint ?? 'Point camera at a QR code or contact card'}</Text>
        </View>

        {/* Scan frame */}
        <View style={styles.frameArea}>
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>

        {/* Bottom */}
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <X size={20} color="#fff" weight="bold" />
            <Text style={styles.cancelText}>{t.common?.cancel ?? 'Cancel'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Contact Preview Modal */}
      <Modal visible={showModal} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIcon}>
                <UserPlus size={24} color={colors.primary} weight="duotone" />
              </View>
              <Text style={styles.modalTitle}>{t.qrScan?.contactFound ?? 'Contact found!'}</Text>
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              {parsed?.firstName && <InfoRow label={t.leadCapture?.firstName ?? 'First name'} value={`${parsed.firstName} ${parsed.lastName ?? ''}`} />}
              {parsed?.email && <InfoRow label={t.leadCapture?.email ?? 'Email'} value={parsed.email} />}
              {parsed?.phone && <InfoRow label={t.leadCapture?.phone ?? 'Phone'} value={parsed.phone} />}
              {parsed?.company && <InfoRow label={t.leadCapture?.company ?? 'Company'} value={parsed.company} />}
              {parsed?.title && <InfoRow label="Title" value={parsed.title} />}
              {parsed?.url && <InfoRow label="Website" value={parsed.url} />}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.rescanBtn} onPress={handleRescan}>
                <Text style={styles.rescanText}>{t.qrScan?.rescan ?? 'Rescan'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>{t.qrScan?.saveContact ?? 'Save Contact'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={infoStyles.value}>{value.trim()}</Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: { paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  label: { fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 2, fontWeight: fontWeight.medium },
  value: { fontSize: fontSize.sm, color: colors.text },
});

const FRAME = 240;
const CORNER = 20;
const BORDER = 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  overlay: { flex: 1 },
  topHint: {
    paddingTop: 80,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  hintText: { color: '#fff', fontSize: fontSize.sm, textAlign: 'center', opacity: 0.9 },
  frameArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frame: {
    width: FRAME,
    height: FRAME,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: '#fff',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER, borderBottomRightRadius: 4 },
  bottomBar: {
    paddingBottom: 50,
    alignItems: 'center',
  },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24 },
  cancelText: { color: '#fff', fontSize: fontSize.sm },
  permText: { color: colors.textSecondary, fontSize: fontSize.md, textAlign: 'center' },
  permBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: borderRadius.full },
  permBtnText: { color: '#fff', fontWeight: fontWeight.semibold },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: 40,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  modalIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3E8FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  rescanBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  rescanText: { color: colors.textSecondary, fontWeight: fontWeight.semibold },
  saveBtn: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.sm },
});
