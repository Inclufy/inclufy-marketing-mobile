// src/hooks/useUserSettings.ts
// AMOS-mobile counterpart of marketing-web's useUserSettings hook.
// Same `user_settings` table on shared Supabase project mpxkugfqzmxydxnlxqoj
// → any change made on mobile shows up on web (and vice-versa).
//
// Web hook lives at:
//   inclufy-marketing-web/src/hooks/queries/useUserSettings.ts
// Keep the two file shapes in sync — same column names + same default
// notification_preferences JSONB shape.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';

// ─── Types ──────────────────────────────────────────────────────────

export type Theme = 'light' | 'dark' | 'system';
export type Language = 'nl' | 'en' | 'fr' | 'ar';

export interface NotificationChannelPrefs {
  digest?: boolean;
  mentions?: boolean;
  approvals?: boolean;
  errors?: boolean;
  campaign_alerts?: boolean;
  weekly_report?: boolean;
}

export interface NotificationPreferences {
  email?: NotificationChannelPrefs;
  push?: NotificationChannelPrefs;
  in_app?: NotificationChannelPrefs;
}

export interface UserSettings {
  user_id: string;
  theme: Theme;
  language: Language;
  notification_preferences: NotificationPreferences;
  ai_consent_granted: boolean;
  ai_consent_at: string | null;
  ai_consent_version: string | null;
  default_brand_kit_id: string | null;
  default_tone: string | null;
  default_channels: string[];
  location: Record<string, any>;
  timezone: string | null;
  currency: string | null;
  telemetry_opt_in: boolean;
  sentry_opt_in: boolean;
  capture_default: 'camera' | 'voice' | 'quote' | 'event';
  approval_flow: 'auto_publish' | 'require_approval';
  created_at: string;
  updated_at: string;
}

const DEFAULT_SETTINGS: UserSettings = {
  user_id: '',
  theme: 'system',
  language: 'nl',
  notification_preferences: {
    email: { digest: true, mentions: true, approvals: true, errors: true, campaign_alerts: true, weekly_report: true },
    push: { mentions: true, approvals: true, errors: true, campaign_alerts: true },
    in_app: { mentions: true, approvals: true, errors: true },
  },
  ai_consent_granted: false,
  ai_consent_at: null,
  ai_consent_version: null,
  default_brand_kit_id: null,
  default_tone: null,
  default_channels: [],
  location: {},
  timezone: null,
  currency: null,
  telemetry_opt_in: true,
  sentry_opt_in: true,
  capture_default: 'camera',
  approval_flow: 'require_approval',
  created_at: '',
  updated_at: '',
};

// ─── Hook ───────────────────────────────────────────────────────────

const QUERY_KEY = ['user-settings'] as const;

export function useUserSettings() {
  return useQuery<UserSettings>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return DEFAULT_SETTINGS;

      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.warn('[useUserSettings] load failed:', error.message);
        return { ...DEFAULT_SETTINGS, user_id: user.id };
      }
      if (!data) {
        await supabase.from('user_settings').insert({ user_id: user.id });
        return { ...DEFAULT_SETTINGS, user_id: user.id };
      }
      return data as UserSettings;
    },
    staleTime: 60_000,
  });
}

export function useUpdateUserSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<UserSettings>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_settings')
        .upsert(
          { user_id: user.id, ...patch },
          { onConflict: 'user_id' },
        )
        .select()
        .maybeSingle();
      if (error) throw error;
      return data as UserSettings;
    },
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, data);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

// ─── Convenience setters used by contexts ───────────────────────────

export function useSetTheme() {
  const { mutateAsync } = useUpdateUserSettings();
  return (theme: Theme) => mutateAsync({ theme });
}

export function useSetLanguage() {
  const { mutateAsync } = useUpdateUserSettings();
  return (language: Language) => mutateAsync({ language });
}

export function useSetNotificationPrefs() {
  const { mutateAsync } = useUpdateUserSettings();
  return (notification_preferences: NotificationPreferences) =>
    mutateAsync({ notification_preferences });
}

export function useSetAiConsent() {
  const { mutateAsync } = useUpdateUserSettings();
  return (granted: boolean, version = '2026-05-24') =>
    mutateAsync({
      ai_consent_granted: granted,
      ai_consent_at: granted ? new Date().toISOString() : null,
      ai_consent_version: granted ? version : null,
    });
}
