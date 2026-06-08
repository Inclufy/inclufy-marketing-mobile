import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, Text, StyleSheet, Platform } from 'react-native';
import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { initSentry } from './src/lib/sentry';
import { supabase } from './src/services/supabase';
import AppNavigator from './src/navigation/AppNavigator';
import BiometricScreen from './src/screens/BiometricScreen';
import { I18nContext, useI18nProvider } from './src/i18n';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useShakeToReport } from './src/hooks/useShakeToReport';
import { ShakeReportSheet } from './src/components/ShakeReportSheet';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { startOfflineCache, rehydrateOfflineCache } from './src/lib/offlineCache';
import { useOnlineStatus } from './src/hooks/useOnlineStatus';
import { flushQueue } from './src/lib/mutationQueue';

// Initialize Sentry as early as possible
initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
      // Closes P0-5 cache-rehydrate edge case: when we restore from
      // AsyncStorage we mark queries as 'success' immediately; React Query
      // will still refetch in the background if isStale. networkMode
      // 'offlineFirst' means a query returns cached data even when
      // offline, instead of staying in 'pending' forever.
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

// Kick off the offline-cache rehydrate + snapshot loop. This runs once
// at module scope so it's set up before React mounts. The rehydrate
// promise resolves before the first render so the user sees their last
// data even without network. The snapshot loop persists every 30s.
let offlineReady: Promise<void> = rehydrateOfflineCache(queryClient).then(() => {
  startOfflineCache(queryClient);
}).catch((e) => {
  console.warn('[offlineCache] init failed:', e);
});

const BIOMETRIC_ENABLED_KEY = 'inclufy_go_biometric_enabled';

/** Safe biometric check — returns false on error */
async function checkBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const LocalAuth = await import('expo-local-authentication');
    const hasHardware = await LocalAuth.hasHardwareAsync();
    const isEnrolled = await LocalAuth.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

// ─── Inner App (has access to ThemeContext) ──────────────────────────
function AppInner({ session, biometricPassed, showBiometric, onBiometricSuccess, onBiometricSkip }: {
  session: Session | null;
  biometricPassed: boolean;
  showBiometric: boolean;
  onBiometricSuccess: () => void;
  onBiometricSkip: () => void;
}) {
  const { isDark, themeKey, colors } = useTheme();
  const navigationRef = useNavigationContainerRef();
  const [routeName, setRouteName] = useState<string | null>(null);
  const [shakeSheetVisible, setShakeSheetVisible] = useState(false);
  const routeNameRef = useRef<string | null>(null);

  // Shake-to-report — only active when signed in & sheet is closed.
  useShakeToReport({
    enabled: !!session && !shakeSheetVisible && biometricPassed,
    onShake: () => setShakeSheetVisible(true),
  });

  // Native push registration — fires once per logged-in user, idempotent.
  usePushNotifications(session);

  // P0-5 — flush the offline mutation queue whenever we detect a
  // reconnect. The hook polls a heartbeat every 15s + on AppState change,
  // so the user doesn't need to manually kick a sync.
  const { isOnline } = useOnlineStatus();
  const wasOfflineRef = useRef(false);
  useEffect(() => {
    if (!session) return;
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }
    // We just transitioned from offline→online — flush
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      flushQueue().then((res) => {
        if (res.attempted > 0) {
          console.log(`[mutationQueue] flushed ${res.succeeded}/${res.attempted}, ${res.remaining} pending`);
        }
      }).catch((e) => console.warn('[mutationQueue] flush failed:', e));
    }
  }, [isOnline, session]);

  if (session && showBiometric && !biometricPassed) {
    return (
      <BiometricScreen
        onSuccess={onBiometricSuccess}
        onSkip={onBiometricSkip}
      />
    );
  }

  return (
    // key={themeKey} forces NavigationContainer + all screens to remount on theme change
    // This makes ALL StyleSheet.create() calls pick up new colors immediately
    <>
      <NavigationContainer
        key={themeKey}
        ref={navigationRef}
        onReady={() => {
          const r = navigationRef.getCurrentRoute()?.name ?? null;
          routeNameRef.current = r;
          setRouteName(r);
        }}
        onStateChange={() => {
          const r = navigationRef.getCurrentRoute()?.name ?? null;
          if (r !== routeNameRef.current) {
            routeNameRef.current = r;
            setRouteName(r);
          }
        }}
      >
        <AppNavigator isLoggedIn={!!session} />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </NavigationContainer>
      <ShakeReportSheet
        visible={shakeSheetVisible}
        onClose={() => setShakeSheetVisible(false)}
        routeName={routeName}
      />
    </>
  );
}

// ─── Error Boundary ──────────────────────────────────────────────────
interface ErrorBoundaryState { hasError: boolean; error: Error | null }

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('AppErrorBoundary caught:', error, errorInfo);
    // Sentry will auto-capture if initialized, but log explicitly too
    try {
      const Sentry = require('@sentry/react-native');
      Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Er ging iets mis</Text>
          <Text style={styles.errorMessage}>
            {this.state.error?.message || 'Onbekende fout'}
          </Text>
          <Text
            style={styles.errorRetry}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            Opnieuw proberen
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Root App ────────────────────────────────────────────────────────
export default function App() {
  const i18n = useI18nProvider();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBiometric, setShowBiometric] = useState(false);
  const [biometricPassed, setBiometricPassed] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      clearTimeout(timeout);

      if (session) {
        try {
          const biometricEnabled = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
          const available = await checkBiometricAvailable();
          if (biometricEnabled === 'true' && available) {
            setShowBiometric(true);
          } else {
            setBiometricPassed(true);
          }
        } catch {
          setBiometricPassed(true);
        }
      } else {
        setBiometricPassed(true);
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
      clearTimeout(timeout);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session && _event === 'SIGNED_IN') {
        try {
          const available = await checkBiometricAvailable();
          if (available) {
            const biometricEnabled = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
            if (biometricEnabled === null) {
              setShowBiometric(true);
              setBiometricPassed(false);
              return;
            }
          }
        } catch {}
        setBiometricPassed(true);
      }
      if (!session) {
        setBiometricPassed(false);
        setShowBiometric(false);
      }
    });

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#A855F7" />
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nContext.Provider value={i18n}>
            <QueryClientProvider client={queryClient}>
              <AppInner
                session={session}
                biometricPassed={biometricPassed}
                showBiometric={showBiometric}
                onBiometricSuccess={async () => {
                  try { await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true'); } catch {}
                  setBiometricPassed(true);
                  setShowBiometric(false);
                }}
                onBiometricSkip={async () => {
                  try { await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'false'); } catch {}
                  setBiometricPassed(true);
                  setShowBiometric(false);
                }}
              />
            </QueryClientProvider>
          </I18nContext.Provider>
        </ThemeProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#09090F',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D1428',
    padding: 32,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F4F0FF',
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 14,
    color: '#8890B8',
    textAlign: 'center',
    marginBottom: 24,
  },
  errorRetry: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E8317A',
    padding: 12,
  },
});
