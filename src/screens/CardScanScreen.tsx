import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { useCreateContact } from '../hooks/useContacts';
import { supabase } from '../services/supabase';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import AIConsentModal from '../components/AIConsentModal';
import { useAIConsent } from '../hooks/useAIConsent';

import { Camera, CaretLeft, Sparkle } from 'phosphor-react-native';
interface ParsedContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  title: string;
}

export default function CardScanScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [capturing, setCapturing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [parsed, setParsed] = useState<ParsedContact>({
    firstName: '', lastName: '', email: '', phone: '', company: '', title: '',
  });
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const createContact = useCreateContact();
  const { hasConsent, showModal: showConsentModal, requestConsent, onAccept: onConsentAccept, onDecline: onConsentDecline } = useAIConsent();

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: '#000' },
    center: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const, gap: spacing.md, padding: spacing.xl },
    processingOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center' as const, alignItems: 'center' as const, gap: spacing.md },
    processingText: { color: '#fff', fontSize: fontSize.md, opacity: 0.9 },
    overlay: { flex: 1 },
    topHint: { paddingTop: 80, paddingHorizontal: spacing.xl, alignItems: 'center' as const },
    hintText: { color: '#fff', fontSize: fontSize.sm, textAlign: 'center' as const, opacity: 0.9 },
    frameArea: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const },
    cardFrame: {
      width: 300,
      height: 185,
      position: 'relative' as const,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    corner: { position: 'absolute' as const, width: CORNER, height: CORNER, borderColor: '#fff' },
    cornerTL: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER, borderTopLeftRadius: 4 },
    cornerTR: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER, borderTopRightRadius: 4 },
    cornerBL: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER, borderBottomLeftRadius: 4 },
    cornerBR: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER, borderBottomRightRadius: 4 },
    frameLabel: { color: 'rgba(255,255,255,0.5)', fontSize: fontSize.xs, letterSpacing: 2, textTransform: 'uppercase' as const },
    bottomBar: { paddingBottom: 60, alignItems: 'center' as const, gap: spacing.sm },
    captureBtn: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: '#fff',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      borderWidth: 4,
      borderColor: 'rgba(255,255,255,0.5)',
    },
    captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
    captureHint: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs },
    permText: { color: c.textSecondary, fontSize: fontSize.md, textAlign: 'center' as const },
    permBtn: { backgroundColor: c.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: borderRadius.full },
    permBtnText: { color: '#fff', fontWeight: fontWeight.semibold },
    modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' as const },
    modalCard: { backgroundColor: c.surface, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.lg, paddingBottom: 40 },
    modalHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginBottom: spacing.md },
    modalIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F3E8FF', justifyContent: 'center' as const, alignItems: 'center' as const },
    modalTitle: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: c.text },
    modalSub: { fontSize: fontSize.xs, color: c.textSecondary },
    modalActions: { flexDirection: 'row' as const, gap: spacing.sm, marginTop: spacing.md },
    rescanBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: c.border, alignItems: 'center' as const },
    rescanText: { color: c.textSecondary, fontWeight: fontWeight.semibold },
    saveBtn: { flex: 2, paddingVertical: spacing.md, borderRadius: borderRadius.md, backgroundColor: c.primary, alignItems: 'center' as const },
    saveBtnText: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.sm },
  }));

  const handleCapture = async () => {
    if (!hasConsent) {
      requestConsent(() => { handleCapture(); });
      return;
    }
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.85,
      });
      setProcessing(true);
      // Send to Supabase Edge Function for AI OCR
      try {
        const base64Data = photo?.base64;
        if (!base64Data) throw new Error('No image data');
        const { data, error } = await supabase.functions.invoke('event-studio-ai', {
          body: {
            action: 'ocr-card',
            image_base64: base64Data,
          },
        });

        if (error) throw error;

        // Edge function returns result.first_name, result.last_name etc.
        const result = data?.result ?? data ?? {};
        const p = typeof result === 'string' ? JSON.parse(result) : result;

        setParsed({
          firstName: p.first_name ?? '',
          lastName: p.last_name ?? '',
          email: p.email ?? '',
          phone: p.phone ?? '',
          company: p.company ?? '',
          title: p.title ?? '',
        });
      } catch {
        // AI OCR failed — show empty form for manual entry
        setParsed({ firstName: '', lastName: '', email: '', phone: '', company: '', title: '' });
      }
      setShowModal(true);
    } catch (e) {
      Alert.alert('Error', 'Could not capture photo');
    } finally {
      setCapturing(false);
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    // Require at least one identifying field
    const hasData = parsed.firstName || parsed.lastName || parsed.email || parsed.phone || parsed.company;
    if (!hasData) {
      Alert.alert('Vul gegevens in', 'Voer minimaal een naam, e-mail of telefoonnummer in.');
      return;
    }
    setSaving(true);
    try {
      await createContact.mutateAsync({
        first_name: parsed.firstName || null,
        last_name: parsed.lastName || null,
        email: parsed.email || null,
        phone: parsed.phone || null,
        source: 'business_card',
        tags: ['card-scan'],
        // Pass company and title as top-level fields — useCreateContact handles them
        ...(parsed.company ? { company: parsed.company } : {}),
        ...(parsed.title ? { title: parsed.title } : {}),
        attributes: {
          company: parsed.company || undefined,
          title: parsed.title || undefined,
          captured_via: 'card_scan',
        },
      } as any);
      setShowModal(false);
      Alert.alert('✅ Opgeslagen', `Contact ${[parsed.firstName, parsed.lastName].filter(Boolean).join(' ') || parsed.email || 'opgeslagen'}.`);
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Fout', err?.message || 'Kon contact niet opslaan. Controleer je verbinding.');
    } finally {
      setSaving(false);
    }
  };

  if (!permission) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Camera size={48} color={colors.textTertiary} weight="duotone" />
        <Text style={styles.permText}>{t.cardScan?.needCamera ?? 'Camera permission required'}</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>{t.cardScan?.grantPerm ?? 'Grant permission'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {processing ? (
        <View style={styles.processingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.processingText}>{t.cardScan?.processing ?? 'AI is reading the card...'}</Text>
        </View>
      ) : (
        <>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

          {/* Overlay */}
          <View style={styles.overlay}>
            {/* Back button */}
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{ position: 'absolute' as const, top: Platform.OS === 'ios' ? 54 : 16, left: 16, zIndex: 20, padding: 10, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)' }}
              activeOpacity={0.7}
            >
              <CaretLeft size={22} color="#fff" weight="bold" />
            </TouchableOpacity>

            {/* Top hint */}
            <View style={styles.topHint}>
              <Text style={styles.hintText}>
                {t.cardScan?.hint ?? 'Position business card in frame — AI will extract the details'}
              </Text>
            </View>

            {/* Card Frame Guide */}
            <View style={styles.frameArea}>
              <View style={styles.cardFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
                <Text style={styles.frameLabel}>{t.cardScan?.frameLabel ?? 'Business Card'}</Text>
              </View>
            </View>

            {/* Capture Button */}
            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={styles.captureBtn}
                onPress={handleCapture}
                disabled={capturing}
                activeOpacity={0.8}
              >
                {capturing ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <View style={styles.captureInner} />
                )}
              </TouchableOpacity>
              <Text style={styles.captureHint}>{t.cardScan?.captureBtn ?? 'Tap to capture'}</Text>
            </View>
          </View>
        </>
      )}

      {/* Contact Confirm Modal */}
      <Modal visible={showModal} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIcon}>
                <Sparkle size={22} color={colors.primary} weight="fill" />
              </View>
              <View>
                <Text style={styles.modalTitle}>{t.cardScan?.aiExtracted ?? 'AI extracted'}</Text>
                <Text style={styles.modalSub}>{t.cardScan?.reviewDetails ?? 'Review and edit if needed'}</Text>
              </View>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <EditRow label={t.leadCapture?.firstName ?? 'First name'} value={parsed.firstName} onChangeText={(v) => setParsed(p => ({ ...p, firstName: v }))} />
              <EditRow label={t.leadCapture?.lastName ?? 'Last name'} value={parsed.lastName} onChangeText={(v) => setParsed(p => ({ ...p, lastName: v }))} />
              <EditRow label={t.leadCapture?.email ?? 'Email'} value={parsed.email} onChangeText={(v) => setParsed(p => ({ ...p, email: v }))} keyboardType="email-address" />
              <EditRow label={t.leadCapture?.phone ?? 'Phone'} value={parsed.phone} onChangeText={(v) => setParsed(p => ({ ...p, phone: v }))} keyboardType="phone-pad" />
              <EditRow label={t.leadCapture?.company ?? 'Company'} value={parsed.company} onChangeText={(v) => setParsed(p => ({ ...p, company: v }))} />
              <EditRow label="Title" value={parsed.title} onChangeText={(v) => setParsed(p => ({ ...p, title: v }))} />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.rescanBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.rescanText}>{t.cardScan?.rescan ?? 'Retake'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>{t.cardScan?.saveContact ?? 'Save Contact'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <AIConsentModal visible={showConsentModal} onAccept={onConsentAccept} onDecline={onConsentDecline} />
    </View>
  );
}

function EditRow({
  label, value, onChangeText, keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: any;
}) {
  const { colors } = useTheme();
  const editStyles = useThemedStyles((c) => ({
    row: { marginBottom: spacing.sm },
    label: { fontSize: fontSize.xs, color: c.textTertiary, fontWeight: fontWeight.medium, marginBottom: 4 },
    input: {
      backgroundColor: c.background,
      borderRadius: borderRadius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      fontSize: fontSize.sm,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
    },
  }));

  return (
    <View style={editStyles.row}>
      <Text style={editStyles.label}>{label}</Text>
      <TextInput
        style={editStyles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize="none"
        placeholderTextColor={colors.textTertiary}
      />
    </View>
  );
}

const CORNER = 18;
const BORDER = 2.5;
