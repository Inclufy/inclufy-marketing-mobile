// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: item.icon>
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { aiConsentService } from '../services/ai-consent.service';

import { Buildings, CheckCircle, Lightbulb, ShieldCheck, UploadSimple } from 'phosphor-react-native';
interface AIConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const PRIVACY_POLICY_URL = 'https://inclufy.com/privacy';

export default function AIConsentModal({ visible, onAccept, onDecline }: AIConsentModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const c = t.aiConsent;

  const handleAccept = async () => {
    await aiConsentService.grantConsent();
    onAccept();
  };

  const dataItems = [
    { icon: 'camera-outline' as const, text: c.dataItems.photos },
    { icon: 'mic-outline' as const, text: c.dataItems.audio },
    { icon: 'document-text-outline' as const, text: c.dataItems.text },
    { icon: 'color-palette-outline' as const, text: c.dataItems.brand },
    { icon: 'card-outline' as const, text: c.dataItems.cards },
  ];

  const purposeItems = [
    c.purposeItems.posts,
    c.purposeItems.transcribe,
    c.purposeItems.tags,
    c.purposeItems.translate,
    c.purposeItems.recap,
    c.purposeItems.audience,
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDecline}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.surface }]}>
          {/* Drag handle */}
          <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight + '20' }]}>
                <ShieldCheck size={32} color={colors.primary} weight="fill" />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>
                {c.title}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {c.subtitle}
              </Text>
            </View>

            {/* What data is sent */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                <UploadSimple size={16} color={colors.primary} weight="duotone" />
                {'  '}{c.dataSentTitle}
              </Text>
              {dataItems.map((item, i) => (
                <View key={i} style={styles.listItem}>
                  <Ionicons name={item.icon} size={18} color={colors.textSecondary} />
                  <Text style={[styles.listText, { color: colors.textSecondary }]}>
                    {item.text}
                  </Text>
                </View>
              ))}
            </View>

            {/* Who receives the data */}
            <View style={[styles.section, styles.highlightSection, { backgroundColor: colors.surfaceElevated }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                <Buildings size={16} color={colors.primary} weight="duotone" />
                {'  '}{c.recipientTitle}
              </Text>
              <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
                {c.recipientDesc}
              </Text>
            </View>

            {/* Purpose */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                <Lightbulb size={16} color={colors.primary} weight="duotone" />
                {'  '}{c.purposeTitle}
              </Text>
              {purposeItems.map((item, i) => (
                <View key={i} style={styles.listItem}>
                  <CheckCircle size={16} color={colors.primary} weight="fill" />
                  <Text style={[styles.listText, { color: colors.textSecondary }]}>
                    {item}
                  </Text>
                </View>
              ))}
            </View>

            {/* Privacy note */}
            <Text style={[styles.privacyNote, { color: colors.textTertiary }]}>
              {c.privacyNote}
            </Text>
            <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
              <Text style={[styles.privacyLink, { color: colors.primary }]}>
                {c.privacyPolicy} →
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Buttons */}
          <View style={styles.buttons}>
            <TouchableOpacity
              testID="consent-accept"
              style={[styles.acceptButton, { backgroundColor: colors.primary }]}
              onPress={handleAccept}
            >
              <ShieldCheck size={20} color="#FFF" weight="fill" />
              <Text style={styles.acceptText}>{c.accept}</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="consent-decline" style={styles.declineButton} onPress={onDecline}>
              <Text style={[styles.declineText, { color: colors.textSecondary }]}>
                {c.decline}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 34,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  scroll: {
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  section: {
    marginTop: 20,
  },
  highlightSection: {
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  listText: {
    fontSize: 14,
    flex: 1,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  privacyNote: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
    textAlign: 'center',
  },
  privacyLink: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 8,
  },
  buttons: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 10,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  acceptText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  declineButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  declineText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
