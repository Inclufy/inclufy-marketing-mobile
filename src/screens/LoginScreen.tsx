// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: biometricType === 'Face ID' ? 'scan-outline' : 'finger-print-outline'> | Ionicons name=<dynamic: showPassword ? 'eye-outline' : 'eye-off-outline'>
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { colors, brandGradient, spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';

import { Lock } from 'phosphor-react-native';
export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState('Face ID');
  // MFA inline state — when Supabase requires AAL2 escalation after a
  // successful password sign-in, we capture the factorId here and show
  // a 6-digit code input instead of the email/password form.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  const checkBiometrics = useCallback(async () => {
    try {
      const LocalAuth = await import('expo-local-authentication');
      const compatible = await LocalAuth.hasHardwareAsync();
      const enrolled = await LocalAuth.isEnrolledAsync();
      if (compatible && enrolled) {
        const types = await LocalAuth.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('Face ID');
        } else if (types.includes(LocalAuth.AuthenticationType.FINGERPRINT)) {
          setBiometricType('Touch ID');
        }
        setBiometricAvailable(true);
      }
    } catch {
      setBiometricAvailable(false);
    }
  }, []);

  useEffect(() => {
    checkBiometrics();
  }, [checkBiometrics]);

  const handleBiometricLogin = useCallback(async () => {
    try {
      const LocalAuth = await import('expo-local-authentication');
      const result = await LocalAuth.authenticateAsync({
        promptMessage: `${t.login.biometricLogin} ${biometricType}`,
        cancelLabel: t.common.cancel,
        disableDeviceFallback: false,
      });
      if (result.success) {
        setLoading(true);
        const { error } = await supabase.auth.refreshSession();
        setLoading(false);
        if (error) {
          Alert.alert(t.common.error, t.login.biometricNoSession);
        }
      }
    } catch {
      setLoading(false);
    }
  }, [biometricType, t]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t.login.fillEmailPassword);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      Alert.alert(t.login.loginFailed, error.message);
      return;
    }

    // MFA gate — if the user has a verified TOTP factor, Supabase puts the
    // session at AAL1 and we need AAL2. Render the inline challenge form
    // instead of advancing to the authenticated stack.
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const verifiedFactor = factors?.totp?.find((f) => f.status === 'verified');
        if (verifiedFactor) {
          setMfaFactorId(verifiedFactor.id);
          return;
        }
      }
    } catch (e) {
      console.warn('[LoginScreen] MFA gate check failed:', e);
      // Fail-open — AAL2 check is best-effort.
    }

    // Lazy org sync (fire-and-forget)
    import('../utils/resolveOrganizationId').then(m => m.resolveOrganizationId()).catch(() => {});
  };

  // ─── MFA inline challenge handlers ─────────────────────────────
  const handleMfaVerify = async () => {
    if (!mfaFactorId || mfaCode.length !== 6) return;
    setLoading(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challenge.error) throw challenge.error;
      const verify = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.data.id,
        code: mfaCode,
      });
      if (verify.error) throw verify.error;
      // AAL2 reached — proceed to authenticated stack
      setMfaFactorId(null);
      setMfaCode('');
      import('../utils/resolveOrganizationId').then(m => m.resolveOrganizationId()).catch(() => {});
    } catch (e: any) {
      Alert.alert('MFA', e?.message ?? 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaCancel = async () => {
    // Sign out the AAL1 session so the unauth'd-user can't bypass.
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    setMfaFactorId(null);
    setMfaCode('');
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert(t.login.fillEmailFirst, t.login.resetLinkSent);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'https://app.inclufy.com/reset-password',
    });
    setLoading(false);
    if (error) {
      Alert.alert(t.common.error, error.message);
    } else {
      Alert.alert(t.login.checkEmail, t.login.resetLinkSentMsg);
    }
  };


  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* MFA inline challenge — covers the whole login form when
            Supabase returns AAL1 and the user has a verified TOTP. */}
        {mfaFactorId && (
          <View style={{ width: '100%', maxWidth: 360, alignSelf: 'center', paddingTop: 60 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 8 }}>
              2FA verificatie
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 24 }}>
              Voer de 6-cijferige code uit je Authenticator-app in.
            </Text>
            <TextInput
              value={mfaCode}
              onChangeText={(s) => setMfaCode(s.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor={colors.textTertiary}
              maxLength={6}
              autoFocus
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1, borderColor: colors.border,
                borderRadius: 12, padding: 16, fontSize: 24,
                color: colors.text, textAlign: 'center',
                letterSpacing: 8, fontFamily: 'Menlo', marginBottom: 16,
              }}
            />
            <TouchableOpacity
              onPress={handleMfaVerify}
              disabled={loading || mfaCode.length !== 6}
              style={{ backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', opacity: mfaCode.length === 6 ? 1 : 0.5 }}
            >
              {loading
                ? <ActivityIndicator color={colors.textOnPrimary} />
                : <Text style={{ color: colors.textOnPrimary, fontSize: 16, fontWeight: '600' }}>Verifiëren</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleMfaCancel} style={{ padding: 16, alignItems: 'center', marginTop: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Annuleren</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Normal login form — hidden while MFA challenge is open */}
        {!mfaFactorId && <>
        {/* Logo / Brand */}
        <View style={styles.logoContainer}>
          <LinearGradient
            colors={brandGradient.light as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logoIcon}
          >
            {/* Bars icon */}
            <View style={styles.barsContainer}>
              <View style={[styles.bar, styles.barShort]} />
              <View style={[styles.bar, styles.barTall]} />
              <View style={[styles.bar, styles.barMedium]} />
            </View>
          </LinearGradient>

          <View style={styles.titleRow}>
            <Text style={styles.title}>Inclufy</Text>
            <Text style={styles.titleDot}>.</Text>
          </View>
          <Text style={styles.subtitleBrand}>AI MARKETING</Text>
          <Text style={styles.subtitleGo}>on the go</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Email field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t.login.email}</Text>
            <View style={styles.inputWrapper}>
              <View style={styles.inputIcon}>
                <Text style={styles.iconText}>{'\u2709'}</Text>
              </View>
              <View style={styles.inputSeparator} />
              <TextInput
                testID="email-input"
                style={styles.input}
                placeholder={t.login.emailPlaceholder}
                placeholderTextColor={colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>
          </View>

          {/* Password field */}
          <View style={styles.fieldGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{t.login.password}</Text>
              <TouchableOpacity onPress={handleForgotPassword}>
                <Text style={styles.forgotText}>{t.login.forgot}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.inputWrapper}>
              <View style={styles.inputIcon}>
                <Lock size={18} color={colors.textSecondary} weight="duotone" />
              </View>
              <View style={styles.inputSeparator} />
              <TextInput
                testID="password-input"
                style={styles.input}
                placeholder={t.login.passwordPlaceholder}
                placeholderTextColor={colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Login Button */}
          <LinearGradient
            colors={brandGradient.deep as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.loginButton, loading && styles.buttonDisabled]}
          >
            <TouchableOpacity
              testID="login-button"
              style={styles.loginButtonInner}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text style={styles.loginButtonText}>{t.login.loginButton}</Text>
              )}
            </TouchableOpacity>
          </LinearGradient>

          {/* Face ID / Biometric Login */}
          {biometricAvailable && (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t.common.or}</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.biometricButton}
                onPress={handleBiometricLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={biometricType === 'Face ID' ? 'scan-outline' : 'finger-print-outline'}
                  size={22}
                  color={colors.primary}
                />
                <Text style={styles.biometricButtonText}>
                  {t.login.biometricLogin} {biometricType}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {t.login.termsPrefix}
          </Text>
          <View style={styles.footerLinks}>
            <TouchableOpacity>
              <Text style={styles.footerLink}>{t.login.terms}</Text>
            </TouchableOpacity>
            <Text style={styles.footerText}>{t.login.and}</Text>
            <TouchableOpacity>
              <Text style={styles.footerLink}>{t.login.privacy}</Text>
            </TouchableOpacity>
          </View>
        </View>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },

  // Logo
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoIcon: {
    width: 90,
    height: 90,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 42,
  },
  bar: {
    width: 11,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 3,
  },
  barShort: { height: 18 },
  barTall: { height: 38 },
  barMedium: { height: 28 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  title: {
    fontSize: 30,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  titleDot: {
    fontSize: 30,
    fontWeight: fontWeight.bold,
    color: colors.secondary,
  },
  subtitleBrand: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    letterSpacing: 3,
    marginTop: 2,
  },
  subtitleGo: {
    fontSize: 16,
    fontStyle: 'italic',
    color: colors.secondary,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 1,
  },

  // Form
  form: {
    gap: spacing.md,
  },
  fieldGroup: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  forgotText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.medium,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  inputIcon: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 18,
    opacity: 0.4,
  },
  inputSeparator: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: fontSize.md,
    color: colors.text,
  },
  eyeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  eyeIcon: {
    fontSize: 18,
    opacity: 0.4,
  },

  // Buttons
  loginButton: {
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  loginButtonInner: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.xs,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },

  // Biometric login button
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 16,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  biometricButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.primary,
  },

  // Footer
  footer: {
    alignItems: 'center',
    marginTop: 32,
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerText: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  footerLink: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: fontWeight.medium,
  },
});
