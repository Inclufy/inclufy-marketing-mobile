// TODO: migrate to Phosphor — unmapped icons: MaterialCommunityIcons name=<dynamic: "nfc-off" as any>
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';
import { supabase } from '../services/supabase';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { useCreateContact } from '../hooks/useContacts';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';

import { CheckCircle, CreditCard, Download, QrCode, XCircle } from 'phosphor-react-native';
type NFCMode = 'idle' | 'sharing' | 'receiving' | 'success' | 'error' | 'unsupported';

export default function NFCShareScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [mode, setMode] = useState<NFCMode>('idle');
  const [nfcSupported, setNfcSupported] = useState<boolean | null>(null);
  const [myVCard, setMyVCard] = useState('');
  const createContact = useCreateContact();

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background, alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.xl },
    center: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const, gap: spacing.md, padding: spacing.xl },
    nfcZone: { width: 220, height: 220, justifyContent: 'center' as const, alignItems: 'center' as const, marginBottom: spacing.xl },
    ring: {
      position: 'absolute' as const,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    ring1: { width: 120, height: 120 },
    ring2: { width: 160, height: 160 },
    ring3: { width: 210, height: 210 },
    ringActive: { borderColor: c.primaryLight, opacity: 0.5 },
    nfcIconWrap: { justifyContent: 'center' as const, alignItems: 'center' as const },
    statusTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: c.text, textAlign: 'center' as const, marginBottom: spacing.xs },
    statusSub: { fontSize: fontSize.sm, color: c.textSecondary, textAlign: 'center' as const, maxWidth: 280, lineHeight: 20, marginBottom: spacing.xl },
    actions: { width: '100%', gap: spacing.sm },
    shareBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: spacing.sm,
      backgroundColor: c.primary,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    shareBtnText: { color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.md },
    receiveBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: spacing.sm,
      backgroundColor: c.surface,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1.5,
      borderColor: c.primary,
    },
    receiveBtnText: { color: c.primary, fontWeight: fontWeight.bold, fontSize: fontSize.md },
    cancelBtn: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
    cancelText: { color: c.textSecondary, fontSize: fontSize.md },
    altHint: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, marginTop: spacing.lg, opacity: 0.75 },
    altHintText: { fontSize: fontSize.xs, color: c.textTertiary },
    altHintLink: { fontSize: fontSize.xs, color: c.primary, fontWeight: fontWeight.semibold },
    unsupportedTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: c.text, textAlign: 'center' as const },
    unsupportedSub: { fontSize: fontSize.sm, color: c.textSecondary, textAlign: 'center' as const, maxWidth: 280 },
    backBtn: { backgroundColor: c.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: borderRadius.full, marginTop: spacing.sm },
    backBtnText: { color: '#fff', fontWeight: fontWeight.semibold },
  }));

  useEffect(() => {
    initNFC();
    loadMyCard();
    return () => { NfcManager.cancelTechnologyRequest().catch(() => {}); };
  }, []);

  const initNFC = async () => {
    try {
      const supported = await NfcManager.isSupported();
      setNfcSupported(supported);
      if (supported) await NfcManager.start();
    } catch {
      setNfcSupported(false);
    }
  };

  const loadMyCard = async () => {
    try {
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      if (!user) return;

      // Load from profiles table (same source as QR card)
      const { data: p } = await supabase
        .from('profiles')
        .select('full_name, email, phone, company, title, website, linkedin, instagram, twitter, facebook, whatsapp, qr_fields')
        .eq('id', user.id)
        .maybeSingle();

      const qf = (p?.qr_fields ?? {}) as Record<string, boolean>;
      const name = p?.full_name || 'Inclufy User';
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`];

      const nameParts = name.split(' ');
      lines.push(`N:${nameParts.slice(1).join(' ') || ''};${nameParts[0] || ''};;;`);

      if (qf.share_email !== false && (p?.email || user.email)) lines.push(`EMAIL:${p?.email || user.email}`);
      if (qf.share_phone !== false && p?.phone) lines.push(`TEL:${p.phone}`);
      if (qf.share_company !== false && p?.company) lines.push(`ORG:${p.company}`);
      if (qf.share_title !== false && p?.title) lines.push(`TITLE:${p.title}`);
      if (qf.share_website !== false && p?.website) lines.push(`URL:${p.website}`);
      if (qf.share_linkedin !== false && p?.linkedin) lines.push(`URL;type=LinkedIn:${p.linkedin}`);
      if (qf.share_instagram !== false && p?.instagram) lines.push(`URL;type=Instagram:https://instagram.com/${p.instagram.replace('@', '')}`);
      if (qf.share_twitter !== false && p?.twitter) lines.push(`URL;type=Twitter:https://x.com/${p.twitter.replace('@', '')}`);
      if (qf.share_facebook !== false && p?.facebook) lines.push(`URL;type=Facebook:${p.facebook}`);
      if (qf.share_whatsapp !== false && p?.whatsapp) lines.push(`TEL;type=WhatsApp:${p.whatsapp}`);

      lines.push('END:VCARD');
      setMyVCard(lines.join('\n'));
    } catch {}
  };

  const handleShare = async () => {
    if (!nfcSupported) { Alert.alert('NFC not supported', 'Your device does not support NFC.'); return; }
    setMode('sharing');
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const bytes = Ndef.encodeMessage([Ndef.textRecord(myVCard)]);
      if (bytes) await NfcManager.ndefHandler.writeNdefMessage(bytes);
      setMode('success');
      setTimeout(() => setMode('idle'), 3000);
    } catch (e: any) {
      if (e.message !== 'cancelled') setMode('error');
      else setMode('idle');
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  };

  const handleReceive = async () => {
    if (!nfcSupported) { Alert.alert('NFC not supported', 'Your device does not support NFC.'); return; }
    setMode('receiving');
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      const records = tag?.ndefMessage ?? [];
      for (const record of records) {
        const text = Ndef.text.decodePayload(record.payload as unknown as Uint8Array);
        if (text?.startsWith('BEGIN:VCARD')) {
          const lines = text.split('\n');
          const get = (prefix: string) => lines.find(l => l.toUpperCase().startsWith(prefix))?.split(':').slice(1).join(':').trim();
          const fn = get('FN:') ?? '';
          const email = get('EMAIL') ?? '';
          const phone = get('TEL') ?? '';
          const org = get('ORG:') ?? '';
          const title = get('TITLE:') ?? '';
          const website = get('URL:') ?? '';
          // Collect social URLs
          const urlLines = lines.filter(l => l.toUpperCase().startsWith('URL'));
          const linkedin = urlLines.find(l => l.includes('LinkedIn'))?.split(':').slice(1).join(':').trim() ?? '';
          const instagram = urlLines.find(l => l.includes('Instagram'))?.split(':').slice(1).join(':').trim() ?? '';
          const twitter = urlLines.find(l => l.includes('Twitter'))?.split(':').slice(1).join(':').trim() ?? '';
          const facebook = urlLines.find(l => l.includes('Facebook'))?.split(':').slice(1).join(':').trim() ?? '';

          const nameParts = fn.split(' ');
          await createContact.mutateAsync({
            first_name: nameParts[0] || null,
            last_name: nameParts.slice(1).join(' ') || null,
            email: email || null,
            phone: phone || null,
            source: 'nfc',
            tags: ['nfc-tap'],
            attributes: {
              company: org || undefined,
              title: title || undefined,
              website: website || undefined,
              linkedin: linkedin || undefined,
              instagram: instagram || undefined,
              twitter: twitter || undefined,
              facebook: facebook || undefined,
              captured_via: 'nfc',
            },
          });
          setMode('success');
          setTimeout(() => navigation.goBack(), 2500);
          return;
        }
      }
      setMode('error');
    } catch (e: any) {
      if (e.message !== 'cancelled') setMode('error');
      else setMode('idle');
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  };

  const cancel = () => {
    NfcManager.cancelTechnologyRequest().catch(() => {});
    setMode('idle');
  };

  // Unsupported
  if (nfcSupported === false) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons name={"nfc-off" as any} size={64} color={colors.textTertiary} />
        <Text style={styles.unsupportedTitle}>{t.nfc?.unsupported ?? 'NFC not supported'}</Text>
        <Text style={styles.unsupportedSub}>{t.nfc?.unsupportedSub ?? 'Your device does not support NFC tap-to-share.'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>{t.common?.goBack ?? 'Go back'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Animated ring indicator */}
      <View style={styles.nfcZone}>
        <View style={[styles.ring, styles.ring3, mode === 'sharing' || mode === 'receiving' ? styles.ringActive : {}]} />
        <View style={[styles.ring, styles.ring2, mode === 'sharing' || mode === 'receiving' ? styles.ringActive : {}]} />
        <View style={[styles.ring, styles.ring1]} />
        <View style={styles.nfcIconWrap}>
          {mode === 'success' ? (
            <CheckCircle size={52} color={colors.success} weight="fill" />
          ) : mode === 'error' ? (
            <XCircle size={52} color={colors.error} weight="fill" />
          ) : (
            <CreditCard
              size={52}
              color={mode === 'sharing' || mode === 'receiving' ? colors.primary : colors.textTertiary} weight="duotone" />
          )}
        </View>
      </View>

      {/* Status text */}
      <Text style={styles.statusTitle}>
        {mode === 'idle' ? (t.nfc?.title ?? 'NFC Contact Exchange') :
         mode === 'sharing' ? (t.nfc?.sharing ?? 'Hold phones together...') :
         mode === 'receiving' ? (t.nfc?.receiving ?? 'Waiting for contact...') :
         mode === 'success' ? (t.nfc?.success ?? 'Contact exchanged!') :
         (t.nfc?.error ?? 'Something went wrong')}
      </Text>
      <Text style={styles.statusSub}>
        {mode === 'idle' ? (t.nfc?.sub ?? 'Share your contact or receive from another device') :
         mode === 'sharing' ? (t.nfc?.sharingSub ?? 'Bring your phones close together \u2014 back to back') :
         mode === 'receiving' ? (t.nfc?.receivingSub ?? 'Bring phones close together to receive') :
         mode === 'success' ? (t.nfc?.successSub ?? 'Contact saved successfully') :
         (t.nfc?.errorSub ?? 'Try again or use QR code instead')}
      </Text>

      {/* Actions */}
      {(mode === 'idle' || mode === 'error') && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
            <CreditCard size={22} color="#fff" weight="duotone" />
            <Text style={styles.shareBtnText}>{t.nfc?.shareBtn ?? 'Share my contact'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.receiveBtn} onPress={handleReceive} activeOpacity={0.85}>
            <Download size={22} color={colors.primary} weight="duotone" />
            <Text style={styles.receiveBtnText}>{t.nfc?.receiveBtn ?? 'Receive contact'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {(mode === 'sharing' || mode === 'receiving') && (
        <TouchableOpacity style={styles.cancelBtn} onPress={cancel}>
          <Text style={styles.cancelText}>{t.common?.cancel ?? 'Cancel'}</Text>
        </TouchableOpacity>
      )}

      {mode === 'idle' && (
        <View style={styles.altHint}>
          <QrCode size={16} color={colors.textTertiary} weight="duotone" />
          <Text style={styles.altHintText}>{t.nfc?.orUseQR ?? 'Or scan a QR code instead'}</Text>
          <TouchableOpacity onPress={() => (navigation as any).navigate('QRScan')}>
            <Text style={styles.altHintLink}>{t.nfc?.openQR ?? 'Open scanner'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
