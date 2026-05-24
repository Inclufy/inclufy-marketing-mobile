import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import nl, { type Translations } from './locales/nl';
import en from './locales/en';
import fr from './locales/fr';
import { useUserSettings, useSetLanguage } from '../hooks/useUserSettings';

// ─── Locale Types ────────────────────────────────────────────────────────────

export type Locale = 'nl' | 'en' | 'fr';

export const LOCALE_LABELS: Record<Locale, string> = {
  nl: 'Nederlands',
  en: 'English',
  fr: 'Fran\u00E7ais',
};

const locales: Record<Locale, Translations> = { nl, en, fr };

const STORAGE_KEY = 'inclufy_go_locale';

// ─── Context ─────────────────────────────────────────────────────────────────

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
}

export const I18nContext = createContext<I18nContextType>({
  locale: 'nl',
  setLocale: () => {},
  t: nl,
});

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTranslation() {
  return useContext(I18nContext);
}

// ─── Provider (used in App.tsx) ──────────────────────────────────────────────

export function useI18nProvider() {
  const [locale, setLocaleState] = useState<Locale>('nl');

  // AsyncStorage fast-path so first paint isn't blocked on DB.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved && (saved === 'nl' || saved === 'en' || saved === 'fr')) {
        setLocaleState(saved as Locale);
      }
    }).catch(() => {});
  }, []);

  // Cross-device sync: hydrate from shared user_settings.language so a
  // language switch on marketing-web shows up here. Marketing-web uses
  // identical key in the same Supabase table.
  const { data: serverSettings } = useUserSettings();
  const setLanguageInDb = useSetLanguage();

  useEffect(() => {
    const serverLang = serverSettings?.language;
    if (!serverLang) return;
    if (serverLang !== 'nl' && serverLang !== 'en' && serverLang !== 'fr') return;
    if (serverLang === locale) return;
    setLocaleState(serverLang as Locale);
    AsyncStorage.setItem(STORAGE_KEY, serverLang).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSettings?.language]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    AsyncStorage.setItem(STORAGE_KEY, newLocale).catch(() => {});
    // Persist server-side so marketing-web + other devices pick it up.
    setLanguageInDb(newLocale).catch((e: any) => {
      console.warn('[i18n] persist failed (UI still updated):', e?.message);
    });
  }, [setLanguageInDb]);

  const t = locales[locale];

  return { locale, setLocale, t };
}

export type { Translations };
