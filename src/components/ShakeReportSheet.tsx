/**
 * ShakeReportSheet — bottom-sheet modal triggered by a shake gesture (or by
 * a developer-menu button) that lets the user file a product-issue right
 * from the screen they're on.
 *
 * Auto-attaches:
 *   - module_context (current React Navigation route → AMOS area)
 *   - environment (platform, version, viewport, organization_id, ...)
 *
 * Optional: pick a screenshot from the photo library; encoded as a data-url
 * and shipped inline in `attachments[]`.
 */
import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File as FSFile } from 'expo-file-system';
import { Camera, Check, PaperPlaneTilt, Trash, Warning, X } from 'phosphor-react-native';
import {
  type IssueAttachmentInline,
  type IssueCategory,
  captureMobileEnvironment,
  createIssueFromMobile,
  detectAMOSMobileModule,
  fetchPrimaryOrgId,
} from '../services/issuesService';

interface ShakeReportSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Active React-Navigation route name. Used to auto-fill module_context. */
  routeName: string | null;
}

const CATEGORY_OPTIONS: { value: IssueCategory; label: string }[] = [
  { value: 'mobile', label: 'Mobiele app' },
  { value: 'ui', label: 'UI / Layout' },
  { value: 'data', label: 'Data / Database' },
  { value: 'auth', label: 'Login / Permissies' },
  { value: 'integration', label: 'Integratie (LinkedIn / Meta / TikTok)' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Anders' },
];

export function ShakeReportSheet({
  visible,
  onClose,
  routeName,
}: ShakeReportSheetProps) {
  const detectedModule = detectAMOSMobileModule(routeName);

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IssueCategory>('mobile');
  const [attachments, setAttachments] = useState<IssueAttachmentInline[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Lazy-load org once when sheet first becomes visible.
  useEffect(() => {
    if (!visible || organizationId) return;
    void fetchPrimaryOrgId().then((id) => setOrganizationId(id));
  }, [visible, organizationId]);

  function reset() {
    setTitle('');
    setDescription('');
    setCategory('mobile');
    setAttachments([]);
  }

  async function pickScreenshot() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Geen toegang', 'Geef toegang tot je fotobibliotheek.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: false,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    if (!asset) return;

    const file = new FSFile(asset.uri);
    const sizeBytes =
      (file as unknown as { size?: number }).size ?? asset.fileSize ?? 0;
    if (sizeBytes && sizeBytes > 5 * 1024 * 1024) {
      Alert.alert('Te groot', 'Bestand > 5 MB. Maak een kleinere screenshot.');
      return;
    }
    const base64 = await file.base64();
    const mime = asset.mimeType ?? 'image/jpeg';
    setAttachments((prev) => [
      ...prev,
      {
        name: asset.fileName ?? `screenshot-${Date.now()}.jpg`,
        data_url: `data:${mime};base64,${base64}`,
        mime,
        size_bytes: sizeBytes,
      },
    ]);
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit() {
    if (!organizationId) {
      Alert.alert(
        'Geen organisatie',
        'Login eerst en zorg dat je bij een organisatie hoort.'
      );
      return;
    }
    if (!title.trim()) {
      Alert.alert('Titel verplicht', 'Geef een korte titel.');
      return;
    }
    setSubmitting(true);
    try {
      const env = captureMobileEnvironment(routeName, organizationId);
      await createIssueFromMobile({
        organization_id: organizationId,
        title: title.trim(),
        description: description.trim(),
        category,
        module_context: detectedModule,
        environment: env,
        attachments,
        capture_method: 'auto_mobile_shake',
      });
      Alert.alert(
        'Probleem gemeld',
        'Onze AI-agent triageert het binnen enkele minuten.'
      );
      reset();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Versturen mislukt', msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheet}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Warning size={18} color="#d97706" weight="fill" />
              <Text style={styles.headerTitle}>Probleem melden</Text>
              {detectedModule ? (
                <View style={styles.moduleBadge}>
                  <Text style={styles.moduleBadgeText}>{detectedModule}</Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <X size={20} color="#64748b" weight="bold" />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            <Text style={styles.label}>Wat ging er mis? *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Bijv. 'Post wordt niet gepubliceerd op LinkedIn'"
              placeholderTextColor="#94a3b8"
              maxLength={255}
              style={styles.input}
            />

            <Text style={[styles.label, { marginTop: 16 }]}>Categorie</Text>
            <View style={styles.chipRow}>
              {CATEGORY_OPTIONS.map((opt) => {
                const active = category === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setCategory(opt.value)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    {active ? (
                      <Check size={12} color="#fff" weight="bold" />
                    ) : null}
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>Beschrijving</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Wat probeerde je te doen? Wat zag je?"
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={4}
              style={[styles.input, styles.textarea]}
            />

            <Text style={[styles.label, { marginTop: 16 }]}>
              Screenshot (optioneel)
            </Text>
            <TouchableOpacity onPress={pickScreenshot} style={styles.pickerButton}>
              <Camera size={14} color="#7c3aed" weight="duotone" />
              <Text style={styles.pickerButtonText}>Bestand kiezen</Text>
            </TouchableOpacity>
            {attachments.map((a, i) => (
              <View key={i} style={styles.attachmentRow}>
                <Text style={styles.attachmentName} numberOfLines={1}>
                  {a.name}
                </Text>
                <Text style={styles.attachmentSize}>
                  {Math.round(a.size_bytes / 1024)} KB
                </Text>
                <TouchableOpacity onPress={() => removeAttachment(i)} hitSlop={8}>
                  <Trash size={14} color="#dc2626" weight="duotone" />
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.envInfoBox}>
              <Text style={styles.envInfoText}>
                We voegen automatisch toe: route, platform, app-versie,
                schermresolutie en organisatie — voor sneller reproduceren.
              </Text>
            </View>

            <TouchableOpacity
              onPress={submit}
              disabled={submitting || !title.trim()}
              style={[
                styles.submit,
                (submitting || !title.trim()) && styles.submitDisabled,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <PaperPlaneTilt size={14} color="#fff" weight="duotone" />
                  <Text style={styles.submitText}>Verstuur probleem</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 18,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  moduleBadge: {
    backgroundColor: '#7c3aed15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  moduleBadgeText: { fontSize: 10, color: '#7c3aed', fontWeight: '600' },
  body: { marginTop: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1a1a2e',
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  chipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  chipText: { fontSize: 12, color: '#475569' },
  chipTextActive: { color: '#ffffff', fontWeight: '600' },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignSelf: 'flex-start',
  },
  pickerButtonText: { fontSize: 12, color: '#7c3aed', fontWeight: '600' },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 6,
  },
  attachmentName: { flex: 1, fontSize: 12, color: '#1a1a2e' },
  attachmentSize: { fontSize: 10, color: '#64748b' },
  envInfoBox: {
    marginTop: 16,
    backgroundColor: '#faf5ff',
    borderColor: '#e9d5ff',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 10,
  },
  envInfoText: { fontSize: 11, color: '#475569', lineHeight: 16 },
  submit: {
    marginTop: 18,
    backgroundColor: '#7c3aed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  submitDisabled: { backgroundColor: '#94a3b8' },
  submitText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
});
