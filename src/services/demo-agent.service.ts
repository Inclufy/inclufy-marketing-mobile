// src/services/demo-agent.service.ts
// Mobile demo agent service for AMOS by Inclufy (React Native + Expo).
//
// This service does NOT contain seeder logic — the shared Supabase backend
// is populated by the web Marketing dashboard or server-side Edge Functions.
// Instead it provides lightweight helpers to check demo status, read/write
// the active industry preference, and trigger seed/reset via Edge Functions.

import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Type definitions (inline — no separate type files for mobile) ────────

/** Supported demo industries, matching the web Marketing dashboard. */
export type IndustryType =
  | 'healthcare'
  | 'construction'
  | 'it'
  | 'real-estate'
  | 'manufacturing';

/** Metadata returned by `getAvailableIndustries()`. */
export interface IndustryInfo {
  id: IndustryType;
  name: string;
  /** Hex color used for chips / badges in the mobile UI. */
  color: string;
  /** Ionicons icon name (compatible with `@expo/vector-icons`). */
  iconName: string;
}

/** Lightweight status object returned by `getDemoStatus()`. */
export interface DemoStatus {
  hasData: boolean;
  activeIndustry: IndustryType | null;
}

// ── Constants ────────────────────────────────────────────────────────────

/** AsyncStorage key — intentionally the same key the web app uses in
 *  localStorage so the user sees a consistent "active industry" if they
 *  switch between web and mobile on the same device (PWA scenario). */
const STORAGE_KEY = 'demo_active_industry_marketing';

/** Static catalogue of supported industries with Ionicons icon names. */
const INDUSTRIES: IndustryInfo[] = [
  { id: 'healthcare',    name: 'Healthcare',    color: '#0EA5E9', iconName: 'heart-outline' },
  { id: 'construction',  name: 'Construction',  color: '#F59E0B', iconName: 'construct-outline' },
  { id: 'it',            name: 'IT / SaaS',     color: '#8B5CF6', iconName: 'cloud-outline' },
  { id: 'real-estate',   name: 'Real Estate',   color: '#10B981', iconName: 'business-outline' },
  { id: 'manufacturing', name: 'Manufacturing', color: '#EF4444', iconName: 'cog-outline' },
];

// ── Service class ────────────────────────────────────────────────────────

class MobileDemoService {
  // In-memory cache so we don't hit AsyncStorage on every render.
  private cachedIndustry: IndustryType | null = null;
  private cacheLoaded = false;

  // ── Industry catalogue ───────────────────────────────────────────────

  /** Return the static list of demo industries with colours and icons. */
  getAvailableIndustries(): IndustryInfo[] {
    return INDUSTRIES;
  }

  // ── Active industry preference (AsyncStorage) ────────────────────────

  /** Read the currently active demo industry from AsyncStorage. */
  async getActiveIndustry(): Promise<IndustryType | null> {
    if (this.cacheLoaded) return this.cachedIndustry;

    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.cachedIndustry = stored as IndustryType;
      }
    } catch (err) {
      console.warn('[MobileDemoService] Failed to read active industry:', err);
    }

    this.cacheLoaded = true;
    return this.cachedIndustry;
  }

  /** Persist the active demo industry to AsyncStorage (or clear it). */
  async setActiveIndustry(industry: IndustryType | null): Promise<void> {
    this.cachedIndustry = industry;
    this.cacheLoaded = true;

    try {
      if (industry) {
        await AsyncStorage.setItem(STORAGE_KEY, industry);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.warn('[MobileDemoService] Failed to save active industry:', err);
    }
  }

  // ── Demo data checks (Supabase) ──────────────────────────────────────

  /**
   * Quick check: does this user already have demo data in the shared
   * Supabase `ai_agents` table?  Uses a HEAD-style count query so no
   * row data is transferred.
   */
  async hasDemoData(userId: string): Promise<boolean> {
    try {
      const { count, error } = await supabase
        .from('ai_agents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (error) {
        console.warn('[MobileDemoService] hasDemoData query failed:', error.message);
        return false;
      }

      return (count ?? 0) > 0;
    } catch (err) {
      console.error('[MobileDemoService] hasDemoData error:', err);
      return false;
    }
  }

  // ── Edge Function triggers ───────────────────────────────────────────

  /**
   * Ask the Supabase Edge Function to seed demo data for a given industry.
   *
   * The heavy seeding logic lives server-side (or in the web admin panel);
   * the mobile app simply kicks off the process and waits for completion.
   */
  async triggerSeedFromMobile(
    userId: string,
    industry: IndustryType,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('seed-demo-data', {
        body: { userId, industry },
      });

      if (error) {
        console.error('[MobileDemoService] seed Edge Function error:', error);
        return { success: false, error: error.message };
      }

      // Persist the active industry locally so the UI reflects the change.
      await this.setActiveIndustry(industry);

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[MobileDemoService] triggerSeedFromMobile error:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Ask the Supabase Edge Function to wipe all demo data for this user.
   */
  async triggerResetFromMobile(
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('reset-demo-data', {
        body: { userId },
      });

      if (error) {
        console.error('[MobileDemoService] reset Edge Function error:', error);
        return { success: false, error: error.message };
      }

      // Clear the local preference so the UI shows "no demo active".
      await this.setActiveIndustry(null);

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[MobileDemoService] triggerResetFromMobile error:', message);
      return { success: false, error: message };
    }
  }

  // ── Composite status helper ──────────────────────────────────────────

  /**
   * One-call convenience: returns both whether demo data exists in
   * Supabase and which industry (if any) is stored locally.
   */
  async getDemoStatus(userId: string): Promise<DemoStatus> {
    const [hasData, activeIndustry] = await Promise.all([
      this.hasDemoData(userId),
      this.getActiveIndustry(),
    ]);

    return { hasData, activeIndustry };
  }
}

// ── Singleton export ─────────────────────────────────────────────────────

export const mobileDemoService = new MobileDemoService();
export default mobileDemoService;
