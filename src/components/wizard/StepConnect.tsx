// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: meta.icon>
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, fontSize, fontWeight, borderRadius } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../services/supabase';
import * as WebBrowser from 'expo-web-browser';
import type { PlatformKey, ConnectionStatus } from '../../hooks/useSocialWizard';

import { CaretRight, CheckCircle, Hand, Info, Link, Sparkle } from 'phosphor-react-native';
const PLATFORM_META: Record<PlatformKey, { label: string; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; color: string }> = {
  facebook:  { label: 'Facebook',  icon: 'logo-facebook',  color: '#1877F2' },
  instagram: { label: 'Instagram', icon: 'logo-instagram', color: '#E4405F' },
  linkedin:  { label: 'LinkedIn',  icon: 'logo-linkedin',  color: '#0077B5' },
  tiktok:    { label: 'TikTok',    icon: 'musical-notes',  color: '#FE2C55' },
  pinterest: { label: 'Pinterest', icon: 'logo-pinterest', color: '#E60023' },
  threads:   { label: 'Threads',   icon: 'at-circle',      color: '#000000' },
  snapchat:  { label: 'Snapchat',  icon: 'logo-snapchat',  color: '#FFFC00' },
  whatsapp:  { label: 'WhatsApp',  icon: 'logo-whatsapp',  color: '#25D366' },
};

// Manual-share platforms — no OAuth, deep-link only
const MANUAL_PLATFORMS: Record<PlatformKey, { description: string } | undefined> = {
  facebook: undefined,
  instagram: undefined,
  linkedin: undefined,
  tiktok: undefined,
  pinterest: undefined,
  threads: undefined,
  snapchat: { description: 'Snapchat heeft geen publieke API voor automatische posts. Bij publiceren opent AMOS de Snap-app met je content — jij plaatst hem dan met één tik.' },
  whatsapp: { description: 'WhatsApp Status en Channels werken via deep-link. AMOS opent WhatsApp met je content gereed — jij kiest de status of channel.' },
};

const SCOPE_LIST: Record<PlatformKey, string[]> = {
  // instagram_basic deprecated 2024 — IG Business auto-discovered via FB Pages flow
  // email removed — requires "Authenticate with Facebook Login" use case not configured
  facebook: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'instagram_content_publish', 'business_management', 'public_profile', 'ads_management'],
  instagram: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'instagram_content_publish', 'business_management', 'public_profile', 'ads_management'],
  linkedin: ['openid', 'profile', 'email', 'w_member_social'],
  tiktok: ['user.info.basic', 'video.publish'],
  pinterest: ['pins:read', 'pins:write', 'boards:read', 'boards:write', 'user_accounts:read'],
  threads: ['threads_basic', 'threads_content_publish'],
  snapchat: [],
  whatsapp: [], // manual share — geen OAuth scopes
};

type SocialAccount = {
  id: string;
  platform: string;
  account_name: string | null;
  account_type: string;
  status: string;
};

type Props = {
  selectedPlatforms: PlatformKey[];
  socialAccounts: SocialAccount[];
  connectionStatuses: Record<string, ConnectionStatus>;
  setPlatformStatus: (p: PlatformKey, s: ConnectionStatus) => void;
  fetchPrerequisiteExplain: (p: PlatformKey, lang?: string) => Promise<string>;
  fetchScopeExplain: (p: PlatformKey, scope: string, lang?: string) => Promise<string>;
  fetchErrorTroubleshoot: (p: PlatformKey, err: string, lang?: string) => Promise<string>;
  refetchAccounts: () => Promise<unknown>;
  goNext: () => void;
  goBack: () => void;
};

export default function StepConnect({
  selectedPlatforms,
  socialAccounts,
  connectionStatuses,
  setPlatformStatus,
  fetchPrerequisiteExplain,
  fetchScopeExplain,
  fetchErrorTroubleshoot,
  refetchAccounts,
  goNext,
  goBack,
}: Props) {
  const { colors } = useTheme();
  const [prereqs, setPrereqs] = useState<Record<string, string>>({});
  const [scopeModal, setScopeModal] = useState<{ platform: PlatformKey; scope: string; explanation: string } | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [busyPlatform, setBusyPlatform] = useState<PlatformKey | null>(null);

  // Fetch prerequisite explanations on mount
  useEffect(() => {
    (async () => {
      for (const p of selectedPlatforms) {
        if (MANUAL_PLATFORMS[p]) continue; // skip Snapchat, WhatsApp
        const explanation = await fetchPrerequisiteExplain(p, 'nl');
        setPrereqs(prev => ({ ...prev, [p]: explanation }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlatforms.join(',')]);

  const isConnected = (p: PlatformKey) => {
    const accs = socialAccounts.filter(a => a.platform === p && a.status === 'active');
    if (p === 'facebook') return accs.some(a => a.account_type === 'page');
    if (p === 'instagram') return accs.some(a => a.account_type === 'business');
    if (p === 'linkedin') return accs.some(a => a.account_type === 'personal');
    return accs.length > 0;
  };

  const startOAuth = async (platformKey: PlatformKey) => {
    setBusyPlatform(platformKey);
    setPlatformStatus(platformKey, 'connecting');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Niet ingelogd');

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mpxkugfqzmxydxnlxqoj.supabase.co';
      const redirectUri = `${supabaseUrl}/functions/v1/oauth-callback`;
      let orgIdForState = user.id;
      try {
        const { data: goOrg } = await supabase.from('go_organizations').select('id').limit(1).maybeSingle();
        if (goOrg?.id) orgIdForState = goOrg.id;
      } catch { /* ignore */ }

      const state = `${user.id}:${orgIdForState}:${platformKey}`;
      let authUrl = '';

      if (platformKey === 'linkedin') {
        // LinkedIn restricts apps from combining "Sign In + Share" with
        // "Community Management API" in the same app. We maintain TWO apps:
        //   - AMOS         (789493c65q6j5e) — Share + Sign In = USER-FACING
        //                  All wizard OAuth flows go through THIS app.
        //   - AMOS Community (78sy9roeoz1143) — Community Mgmt API = LMDP-only
        //                  Separate app-registration purely for LinkedIn's
        //                  LMDP submission paperwork. NOT used for user OAuth.
        const clientId = process.env.EXPO_PUBLIC_LINKEDIN_CLIENT_ID || '789493c65q6j5e';
        const scopes = 'openid profile email w_member_social';
        authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;
      } else if (platformKey === 'facebook') {
        // Facebook OAuth via Meta — for FB Pages publishing only.
        // For Instagram we use a SEPARATE direct IG Login flow below
        // because Meta's Pages API does NOT expose IG-Page links made
        // via Account Center (verified empirically 2026-05-08).
        const metaAppId = process.env.EXPO_PUBLIC_META_APP_ID || '947950264797942';
        const scope = 'pages_show_list,pages_manage_posts,pages_read_engagement,business_management,public_profile';
        authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${metaAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&state=${encodeURIComponent(state)}`;
      } else if (platformKey === 'instagram') {
        // Instagram Direct Login (NEW 2024+ flow) — bypasses FB Pages.
        // User logs in DIRECTLY with their IG Business credentials at
        // instagram.com/oauth/authorize. Token works directly for IG
        // publishing without Pages API or Account Center dependency.
        //
        // GOTCHA: Instagram API with Instagram Login requires a SEPARATE
        // Instagram App ID — NOT the Meta App ID. This separate app sits
        // inside the Meta App's "Instagram API" use case and has its own
        // app_id + app_secret. Meta App ID (947950264797942) returns
        // "Invalid request: Parameters of the request are invalid" on IG.
        //
        // The state parameter uses 'instagram-direct' as platform key so
        // oauth-callback knows to use the IG-direct flow (api.instagram.com)
        // instead of the legacy Meta+Pages flow.
        const igAppId = process.env.EXPO_PUBLIC_INSTAGRAM_APP_ID || '2250348065370973';
        const igScope = 'instagram_business_basic,instagram_business_content_publish';
        // Override the state's platform suffix to flag IG-direct flow
        const igState = `${user.id}:${orgIdForState}:instagram-direct`;
        // Build 244 attempt:
        // - force_reauth=true: bypass any cached IG session state
        // - enable_fb_login=0: force IG-only flow (no FB Login fallback
        //   which can mis-evaluate Tester role under Business Manager)
        // - force_authentication=1: belt+braces against any auto-login
        const params = new URLSearchParams({
          force_reauth: 'true',
          enable_fb_login: '0',
          force_authentication: '1',
          client_id: igAppId,
          redirect_uri: redirectUri,
          scope: igScope,
          response_type: 'code',
          state: igState,
        });
        authUrl = `https://www.instagram.com/oauth/authorize?${params.toString()}`;
      } else if (platformKey === 'tiktok') {
        // TikTok AMOS app (Inclufy ownership, App ID 7617756854004910092).
        // Sandbox credentials (sbaw0n7p637do602ql) for development testing
        // until Production form approved. Sandbox enabled scopes match below.
        const tiktokClientKey = process.env.EXPO_PUBLIC_TIKTOK_CLIENT_KEY || 'sbaw0n7p637do602ql';
        // Scopes match Sandbox-activated set: user.info.basic + video.publish + video.upload.
        // We use video.publish for direct posting; video.upload allows draft uploads.
        const tiktokScope = 'user.info.basic,video.publish';
        authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${tiktokClientKey}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(tiktokScope)}&response_type=code&state=${encodeURIComponent(state)}`;
      } else if (platformKey === 'pinterest') {
        // Pinterest OAuth — App-ID 1568759 (AMOS by Inclufy).
        // Note: Trial approval pending (24-48u) — until then OAuth will
        // start but Pinterest's API may reject scopes. Standard access
        // unlocks pins:write after Pinterest's review.
        const pinClientId = process.env.EXPO_PUBLIC_PINTEREST_CLIENT_ID || '1568759';
        const pinScopes = 'pins:read,pins:write,boards:read,boards:write,user_accounts:read';
        authUrl = `https://www.pinterest.com/oauth/?response_type=code&client_id=${pinClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(pinScopes)}&state=${encodeURIComponent(state)}`;
      } else if (platformKey === 'threads') {
        // Threads use case has its OWN app_id + app_secret (same pattern
        // as Instagram API with Instagram Login). NOT the Meta App ID.
        // Found in Meta App → Use cases → Access the Threads API → Customize → Settings.
        const threadsAppId = process.env.EXPO_PUBLIC_THREADS_APP_ID || '952201194080195';
        const threadsScopes = 'threads_basic,threads_content_publish';
        authUrl = `https://www.threads.net/oauth/authorize?client_id=${threadsAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(threadsScopes)}&response_type=code&state=${encodeURIComponent(state)}`;
      } else if (platformKey === 'snapchat' || platformKey === 'whatsapp') {
        // Manual-share platforms — no public publish API.
        // The wizard renders these as info-cards (no OAuth button), so this
        // branch is only hit if someone calls connect() programmatically.
        // PostReview handles the actual share via deep-link (snapchat:// or wa.me/).
        throw new Error(`${platformKey === 'snapchat' ? 'Snapchat' : 'WhatsApp'} werkt via manueel delen — geen koppeling nodig.`);
      }

      if (!authUrl) throw new Error('OAuth niet beschikbaar voor dit platform');

      // Use openAuthSessionAsync — auto-dismisses when URL with the
      // app's URL scheme is loaded (e.g. inclufy-go://oauth-success
      // returned by oauth-callback after successful OAuth). This avoids
      // the "wizard hangs forever" bug where openBrowserAsync waits for
      // user to manually tap Done.
      //
      // Note: the OAuth provider (Meta/LinkedIn) redirects to our HTTPS
      // edge function URL — that's NOT intercepted by the auth session
      // because the scheme is https. Only when the edge function returns
      // a redirect to inclufy-go:// does the session detect the match
      // and dismiss.
      const authResult = await WebBrowser.openAuthSessionAsync(
        authUrl,
        'inclufy-go://oauth-success',
        {
          dismissButtonStyle: 'done',
          preferEphemeralSession: false,
        },
      );

      // After session ends: refetch accounts to detect new rows
      // (works regardless of whether user cancelled or completed)
      await new Promise(r => setTimeout(r, 800));
      await refetchAccounts();

      if (authResult.type === 'success') {
        setPlatformStatus(platformKey, 'connected');
      } else if (authResult.type === 'cancel' || authResult.type === 'dismiss') {
        // User cancelled — don't show error, just leave status as pending
        setPlatformStatus(platformKey, 'pending');
      } else {
        setPlatformStatus(platformKey, 'failed');
      }
    } catch (err: any) {
      setPlatformStatus(platformKey, 'failed');
      const friendlyMsg = await fetchErrorTroubleshoot(platformKey, err?.message ?? 'Unknown error', 'nl');
      Alert.alert('Verbinding mislukt', friendlyMsg);
    } finally {
      setBusyPlatform(null);
    }
  };

  const performDisconnect = async (platformKey: PlatformKey) => {
    setBusyPlatform(platformKey);
    try {
      const accIds = socialAccounts.filter(a => a.platform === platformKey).map(a => a.id);
      if (accIds.length === 0) return;
      const { error } = await supabase.from('social_accounts').delete().in('id', accIds);
      if (error) throw error;
      await refetchAccounts();
      setPlatformStatus(platformKey, 'pending');
      Alert.alert('✅ Ontkoppeld', `${PLATFORM_META[platformKey].label} is ontkoppeld. OAuth-tokens zijn verwijderd.`);
    } catch (err: any) {
      Alert.alert('Fout', err?.message ?? 'Kon niet ontkoppelen');
    } finally {
      setBusyPlatform(null);
    }
  };

  const showScopeExplain = async (platform: PlatformKey, scope: string) => {
    setScopeLoading(true);
    setScopeModal({ platform, scope, explanation: '' });
    const explanation = await fetchScopeExplain(platform, scope, 'nl');
    setScopeModal({ platform, scope, explanation });
    setScopeLoading(false);
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={{ fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm }}>
        Verbind je accounts
      </Text>
      <Text style={{ fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.lg }}>
        Per platform tik op "Verbinden". We openen een veilige OAuth-flow waarin jij toestemming geeft.
      </Text>

      <View style={{ gap: spacing.md }}>
        {selectedPlatforms.map((p) => {
          // Manual-share platforms (Snapchat, WhatsApp) — no OAuth, deep-link only
          const manualConfig = MANUAL_PLATFORMS[p];
          if (manualConfig) {
            const meta = PLATFORM_META[p];
            return (
              <View
                key={p}
                style={{
                  padding: spacing.md,
                  borderRadius: borderRadius.md,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.success,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: meta.color + '20',
                    alignItems: 'center', justifyContent: 'center',
                    marginRight: spacing.md,
                  }}>
                    <Ionicons name={meta.icon} size={20} color={meta.color === '#FFFC00' ? '#000' : meta.color} />
                  </View>
                  <Text style={{ flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                    {meta.label}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <CheckCircle size={18} color={colors.success} weight="fill" />
                    <Text style={{ color: colors.success, fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>Klaar</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: colors.background, padding: spacing.sm, borderRadius: borderRadius.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <Hand size={14} color={colors.textSecondary} weight="duotone" />
                    <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.semibold }}>
                      Manueel delen
                    </Text>
                  </View>
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 18 }}>
                    {manualConfig.description}
                  </Text>
                </View>
              </View>
            );
          }
          const meta = PLATFORM_META[p];
          const connected = isConnected(p);
          const busy = busyPlatform === p;
          const scopes = SCOPE_LIST[p] ?? [];

          return (
            <View
              key={p}
              style={{
                padding: spacing.md,
                borderRadius: borderRadius.md,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: connected ? colors.success : colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: meta.color + '20',
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: spacing.md,
                }}>
                  <Ionicons name={meta.icon} size={20} color={meta.color} />
                </View>
                <Text style={{ flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                  {meta.label}
                </Text>
                {connected ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <CheckCircle size={18} color={colors.success} weight="fill" />
                    <Text style={{ color: colors.success, fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>Verbonden</Text>
                  </View>
                ) : null}
              </View>

              {/* Prerequisites */}
              {prereqs[p] && !connected ? (
                <View style={{ backgroundColor: colors.background, padding: spacing.sm, borderRadius: borderRadius.sm, marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <Info size={14} color={colors.textSecondary} weight="regular" />
                    <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.semibold }}>
                      Vooraf nodig:
                    </Text>
                  </View>
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 18 }}>
                    {prereqs[p]}
                  </Text>
                </View>
              ) : null}

              {/* Scopes */}
              {scopes.length > 0 && !connected ? (
                <View style={{ marginBottom: spacing.sm }}>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 4 }}>
                    We vragen deze toegang (tik voor uitleg):
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {scopes.map(scope => (
                      <TouchableOpacity
                        key={scope}
                        onPress={() => showScopeExplain(p, scope)}
                        style={{
                          paddingHorizontal: 8, paddingVertical: 4,
                          backgroundColor: meta.color + '12',
                          borderRadius: 4,
                        }}
                      >
                        <Text style={{ fontSize: 11, color: meta.color, fontFamily: 'Menlo' }}>{scope}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Action button */}
              {connected ? (
                <TouchableOpacity
                  disabled={busy}
                  onPress={() =>
                    Alert.alert(
                      `${meta.label} ontkoppelen`,
                      'OAuth-tokens worden verwijderd. Je kunt later opnieuw verbinden.',
                      [
                        { text: 'Annuleren', style: 'cancel' },
                        { text: 'Ontkoppelen', style: 'destructive', onPress: () => performDisconnect(p) },
                      ],
                    )
                  }
                  style={{
                    padding: spacing.sm,
                    borderRadius: borderRadius.sm,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                  }}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <Text style={{ color: colors.text, fontSize: fontSize.sm }}>🔌 Ontkoppelen</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  disabled={busy}
                  onPress={() => startOAuth(p)}
                  style={{
                    padding: spacing.md,
                    borderRadius: borderRadius.sm,
                    backgroundColor: meta.color,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: spacing.sm,
                  }}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Link size={18} color="#fff" weight="duotone" />
                      <Text style={{ color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>
                        Verbind {meta.label}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      {/* Navigation */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
        <TouchableOpacity
          onPress={goBack}
          activeOpacity={0.7}
          style={{ flex: 1, padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }}
        >
          <Text style={{ color: colors.text, fontSize: fontSize.md }}>Terug</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={goNext}
          activeOpacity={0.7}
          style={{ flex: 2, padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.primary, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}
        >
          <Text style={{ color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>Verder</Text>
          <CaretRight size={18} color="#fff" weight="bold" />
        </TouchableOpacity>
      </View>

      {/* Scope explain modal */}
      <Modal visible={!!scopeModal} transparent animationType="fade" onRequestClose={() => setScopeModal(null)}>
        <View style={{ flex: 1, backgroundColor: '#00000080', justifyContent: 'center', padding: spacing.lg }}>
          <View style={{ backgroundColor: colors.background, padding: spacing.lg, borderRadius: borderRadius.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
              <Sparkle size={18} color={colors.primary} weight="fill" />
              <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>
                AMOS legt uit
              </Text>
            </View>
            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm, fontFamily: 'Menlo' }}>
              {scopeModal?.scope}
            </Text>
            {scopeLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: spacing.md }} />
            ) : (
              <Text style={{ fontSize: fontSize.md, color: colors.text, lineHeight: 22, marginBottom: spacing.lg }}>
                {scopeModal?.explanation || 'Geen uitleg beschikbaar.'}
              </Text>
            )}
            <TouchableOpacity
              onPress={() => setScopeModal(null)}
              style={{ padding: spacing.md, backgroundColor: colors.primary, borderRadius: borderRadius.md, alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>Ok, duidelijk</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
