import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { _syncThemeColors } from '../theme';
import { useUserSettings, useSetTheme } from '../hooks/useUserSettings';

// ─── Light Colors — AMOS Brand (pink #E8317A + orange #F7941D) ─────────────
export const lightColors = {
  primary:       '#E8317A',  // AMOS hot pink
  primaryLight:  '#F06A9D',  // lighter pink
  primaryDark:   '#C01D60',  // deep pink
  secondary:     '#F7941D',  // AMOS orange
  secondaryLight:'#FBA94E',  // lighter orange
  accent:        '#F7941D',  // same orange for accent
  accentLight:   '#FBA94E',

  background:    '#FFF8FA',  // very subtle warm white
  surface:       '#FFFFFF',
  surfaceElevated:'#FFF0F5', // soft pink tint
  surfaceDark:   '#FFE4EE',
  backgroundDark:'#FFE4EE',

  text:          '#0F0A1E',
  textSecondary: '#5C5070',
  textTertiary:  '#9B8FA8',
  textOnPrimary: '#FFFFFF',
  textOnDark:    '#0F0A1E',

  border:        '#F0D8E4',
  borderLight:   '#FAF0F4',

  success: '#059669',
  warning: '#D97706',
  error:   '#DC2626',
  info:    '#2563EB',

  linkedin:  '#0077B5',
  instagram: '#E4405F',
  x:         '#000000',
  facebook:  '#1877F2',

  draft:     '#6B7280',
  approved:  '#059669',
  scheduled: '#2563EB',
  published: '#E8317A',  // AMOS pink
  failed:    '#DC2626',
  in_review: '#F7941D',  // AMOS orange
};

// ─── Dark Colors — AMOS Brand (navy #1B2756 bg, pink #E8317A primary) ───────
export const darkColors = {
  primary:       '#E8317A',  // AMOS hot pink
  primaryLight:  '#F06A9D',  // lighter pink
  primaryDark:   '#C01D60',  // deep pink
  secondary:     '#F7941D',  // AMOS orange
  secondaryLight:'#FBA94E',  // lighter orange
  accent:        '#F59E0B',
  accentLight:   '#FCD34D',

  background:    '#0D1428',  // deep AMOS navy
  surface:       '#1B2756',  // AMOS navy surface
  surfaceElevated:'#243166', // slightly lighter navy
  surfaceDark:   '#090E1C',
  backgroundDark:'#090E1C',

  text:          '#F4F0FF',
  textSecondary: '#8890B8',
  textTertiary:  '#4E5880',
  textOnPrimary: '#FFFFFF',
  textOnDark:    '#F4F0FF',

  border:        '#2A3566',
  borderLight:   '#1E2A55',

  success: '#10D9A0',
  warning: '#FBBF24',
  error:   '#F87171',
  info:    '#60A5FA',

  linkedin:  '#0A8FC7',
  instagram: '#E4405F',
  x:         '#E7E7E7',
  facebook:  '#4267D1',

  draft:     '#6B7280',
  approved:  '#10D9A0',
  scheduled: '#60A5FA',
  published: '#E8317A',  // AMOS pink
  failed:    '#F87171',
  in_review: '#F7941D',  // AMOS orange
};

// ─── Context ───────────────────────────────────────────────────────────────

type ColorScheme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  scheme: ColorScheme;
  isDark: boolean;
  colors: typeof darkColors;
  themeKey: string;        // changes on every theme switch → use as key prop to force re-render
  setScheme: (s: ColorScheme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  scheme: 'dark',
  isDark: true,
  colors: darkColors,
  themeKey: 'dark',
  setScheme: () => {},
});

const STORAGE_KEY = '@inclufy_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [scheme, setSchemeState] = useState<ColorScheme>('dark');
  const [themeKey, setThemeKey] = useState('dark');

  // Cross-device sync: hydrate from shared user_settings.theme so a
  // theme switch on marketing-web shows up here on next foreground.
  // AsyncStorage stays as fast-path so first paint isn't blocked on the
  // DB round-trip.
  const { data: serverSettings } = useUserSettings();
  const setThemeInDb = useSetTheme();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(stored => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        const isDark = stored === 'system' ? (systemScheme === 'dark') : stored === 'dark';
        _syncThemeColors(isDark);
        setSchemeState(stored);
        applyNativeScheme(stored, (systemScheme === 'dark' ? 'dark' : 'light'));
        setThemeKey(`${stored}-init`);
      }
    });
  }, []);

  // Whenever the DB-side theme resolves (or changes-on-other-device),
  // adopt it. Skip when it matches what we already have to avoid loops.
  useEffect(() => {
    const serverTheme = serverSettings?.theme;
    if (!serverTheme || serverTheme === scheme) return;
    setSchemeState(serverTheme);
    AsyncStorage.setItem(STORAGE_KEY, serverTheme);
    applyNativeScheme(serverTheme, (systemScheme === 'dark' ? 'dark' : 'light'));
    const willBeDark = serverTheme === 'system' ? (systemScheme === 'dark') : serverTheme === 'dark';
    _syncThemeColors(willBeDark);
    setThemeKey(`${serverTheme}-${Date.now()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSettings?.theme]);

  const applyNativeScheme = (s: ColorScheme, sys: 'light' | 'dark') => {
    // Tell the OS which color scheme to use — this makes native components
    // (status bar, keyboard, pickers, alerts) respect the theme immediately
    if (s === 'system') {
      Appearance.setColorScheme(null as any);      // follow system
    } else {
      Appearance.setColorScheme(s);         // force light or dark
    }
  };

  const setScheme = (s: ColorScheme) => {
    setSchemeState(s);
    applyNativeScheme(s, (systemScheme === 'dark' ? 'dark' : 'light'));
    AsyncStorage.setItem(STORAGE_KEY, s);
    // Persist to user_settings so web + other devices pick it up.
    setThemeInDb(s).catch((e: any) => {
      console.warn('[ThemeContext] persist failed (UI still updated):', e?.message);
    });
    // Sync the static colors object in theme/index.ts BEFORE bumping themeKey
    // so that when NavigationContainer remounts all screens, inline colors.xxx
    // refs already read the correct palette.
    const willBeDark = s === 'system' ? (systemScheme === 'dark') : s === 'dark';
    _syncThemeColors(willBeDark);
    // Bump themeKey to trigger NavigationContainer re-mount → all screens re-render
    setThemeKey(`${s}-${Date.now()}`);
  };

  const resolvedDark = scheme === 'system'
    ? systemScheme === 'dark'
    : scheme === 'dark';

  const colors = resolvedDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ scheme, isDark: resolvedDark, colors, themeKey, setScheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
