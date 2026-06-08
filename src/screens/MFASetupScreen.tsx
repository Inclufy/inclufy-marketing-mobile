// src/screens/MFASetupScreen.tsx
// AMOS-side MFA enrollment, mirroring the web flow in
// marketing-web/src/pages/Settings.tsx:173-280.
//
// Flow:
//   1. enroll → Supabase returns { id, totp: { qr_code, secret, uri } }
//   2. User scans QR with Google Authenticator / 1Password / Authy
//      (or copy-pastes the secret if no QR scanner)
//   3. User types the 6-digit code
//   4. challenge + verify → factor goes from 'unverified' → 'verified'
//   5. AAL is now aal2 — required at next sign-in
//
// Web + mobile share the same auth.mfa_factors table. A factor enrolled
// here is honored on web login too (and vice-versa).

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  Alert, StyleSheet, Clipboard,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../services/supabase';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../i18n';

export default function MFASetupScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const { locale } = useTranslation();
  const nl = locale === 'nl';
  const fr = locale === 'fr';

  const [step, setStep] = useState<'enroll' | 'verify' | 'done'>('enroll');
  const [factorId, setFactorId] = useState<string>('');
  const [qrUri, setQrUri] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const startEnrollment = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `AMOS · ${new Date().toLocaleDateString()}`,
      });
      if (error) throw error;
      setFactorId(data.id);
      setQrUri(data.totp.uri ?? '');
      setSecret(data.totp.secret ?? '');
      setStep('verify');
    } catch (e: any) {
      Alert.alert(
        nl ? 'MFA fout' : fr ? 'Erreur MFA' : 'MFA error',
        e?.message ?? 'Failed to start enrollment',
      );
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!factorId || code.length !== 6) {
      Alert.alert(
        nl ? 'Vul 6-cijferige code in' : fr ? 'Saisissez le code à 6 chiffres' : 'Enter 6-digit code',
      );
      return;
    }
    setLoading(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code,
      });
      if (verify.error) throw verify.error;
      setStep('done');
    } catch (e: any) {
      Alert.alert(
        nl ? 'Code ongeldig' : fr ? 'Code invalide' : 'Invalid code',
        e?.message ?? 'Verification failed',
      );
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    if (factorId) {
      try { await supabase.auth.mfa.unenroll({ factorId }); } catch { /* ignore */ }
    }
    navigation.goBack();
  };

  const copySecret = () => {
    if (!secret) return;
    Clipboard.setString(secret);
    Alert.alert(nl ? 'Gekopieerd' : fr ? 'Copié' : 'Copied');
  };

  // ─── Rendering ──────────────────────────────────────────────

  const styles = makeStyles(colors, isDark);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {nl ? 'Twee-staps verificatie' : fr ? 'Vérification en deux étapes' : 'Two-factor authentication'}
      </Text>
      <Text style={styles.subtitle}>
        {nl ? 'Beveilig je account met een Authenticator-app (Google Authenticator, 1Password, Authy).'
          : fr ? 'Sécurisez votre compte avec une appli d\'authentification (Google Authenticator, 1Password, Authy).'
          : 'Secure your account with an authenticator app (Google Authenticator, 1Password, Authy).'}
      </Text>

      {step === 'enroll' && (
        <>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              {nl ? '1. Klik op "Start" hieronder\n2. Scan de QR-code met je Authenticator-app\n3. Voer de 6-cijferige code in'
                : fr ? '1. Cliquez sur "Démarrer"\n2. Scannez le QR avec votre appli d\'authentification\n3. Entrez le code à 6 chiffres'
                : '1. Tap "Start" below\n2. Scan the QR with your authenticator app\n3. Enter the 6-digit code'}
            </Text>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={startEnrollment} disabled={loading}>
            {loading
              ? <ActivityIndicator color={colors.textOnPrimary} />
              : <Text style={styles.primaryButtonText}>{nl ? 'Start' : fr ? 'Démarrer' : 'Start'}</Text>}
          </TouchableOpacity>
        </>
      )}

      {step === 'verify' && qrUri && (
        <>
          <View style={styles.qrBox}>
            <QRCode value={qrUri} size={200} backgroundColor="#fff" />
          </View>
          <Text style={styles.secretLabel}>
            {nl ? 'Of voer deze code handmatig in:' : fr ? 'Ou entrez ce code manuellement :' : 'Or enter this code manually:'}
          </Text>
          <TouchableOpacity onPress={copySecret} style={styles.secretBox}>
            <Text style={styles.secretText}>{secret}</Text>
            <Text style={styles.copyHint}>{nl ? 'Tik om te kopiëren' : fr ? 'Toucher pour copier' : 'Tap to copy'}</Text>
          </TouchableOpacity>
          <Text style={styles.inputLabel}>
            {nl ? '6-cijferige code uit je app' : fr ? 'Code à 6 chiffres de votre appli' : '6-digit code from your app'}
          </Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder="123456"
            placeholderTextColor={colors.textTertiary}
            maxLength={6}
            autoFocus
          />
          <TouchableOpacity style={styles.primaryButton} onPress={verifyCode} disabled={loading || code.length !== 6}>
            {loading
              ? <ActivityIndicator color={colors.textOnPrimary} />
              : <Text style={styles.primaryButtonText}>{nl ? 'Verifiëren' : fr ? 'Vérifier' : 'Verify'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={cancel}>
            <Text style={styles.secondaryButtonText}>{nl ? 'Annuleren' : fr ? 'Annuler' : 'Cancel'}</Text>
          </TouchableOpacity>
        </>
      )}

      {step === 'done' && (
        <View style={styles.successBox}>
          <Text style={styles.successTitle}>
            {nl ? '✅ MFA actief' : fr ? '✅ MFA activée' : '✅ MFA enabled'}
          </Text>
          <Text style={styles.successText}>
            {nl ? 'Vanaf nu vraagt AMOS bij login een code uit je Authenticator-app. Bewaar je telefoon veilig — als je hem kwijtraakt heb je geen toegang meer tot je account.'
              : fr ? 'AMOS demandera désormais un code de votre appli à chaque connexion. Gardez votre téléphone en sécurité.'
              : 'AMOS will now ask for a code from your authenticator app on every login. Keep your phone safe — if you lose it you cannot access your account.'}
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.primaryButtonText}>{nl ? 'Klaar' : fr ? 'Terminé' : 'Done'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
    title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 8 },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 24, lineHeight: 20 },
    infoBox: { backgroundColor: colors.surface, padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: colors.border },
    infoText: { fontSize: 14, color: colors.text, lineHeight: 22 },
    primaryButton: { backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
    primaryButtonText: { color: colors.textOnPrimary, fontSize: 16, fontWeight: '600' },
    secondaryButton: { padding: 16, alignItems: 'center', marginTop: 8 },
    secondaryButtonText: { color: colors.textSecondary, fontSize: 14 },
    qrBox: { alignSelf: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 20 },
    secretLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
    secretBox: { backgroundColor: colors.surface, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 20 },
    secretText: { fontFamily: 'Menlo', fontSize: 14, color: colors.text, letterSpacing: 2 },
    copyHint: { fontSize: 11, color: colors.textTertiary, marginTop: 4 },
    inputLabel: { fontSize: 14, color: colors.text, fontWeight: '600', marginBottom: 8 },
    codeInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, fontSize: 24, color: colors.text, textAlign: 'center', letterSpacing: 8, fontFamily: 'Menlo', marginBottom: 16 },
    successBox: { backgroundColor: colors.surface, padding: 24, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    successTitle: { fontSize: 22, fontWeight: '700', color: colors.success, marginBottom: 12 },
    successText: { fontSize: 14, color: colors.text, textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  });
}
