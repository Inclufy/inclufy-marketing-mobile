import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';
import type { Channel } from '../types';

export interface ChannelConfig {
  active: boolean;
  posts_per_week: number;
  budget_pct: number;
}

export type PersonaTone = 'formal' | 'casual' | 'inspirational';

export interface Persona {
  id: string;
  name: string;
  role: string;
  pain_points: string[];
  tone: PersonaTone;
  channels: Channel[];
}

export interface MarketingStrategy {
  id: string;
  user_id: string;
  // Goals
  goals: string[];
  primary_goal: string;
  // Channels
  channels: Record<string, ChannelConfig>;
  // Budget
  monthly_budget: number;
  budget_allocation: Record<string, number>;
  // Content
  content_mix: Record<string, number>;
  posts_per_week: number;
  // Events
  events_per_quarter: number;
  event_budget_pct: number;
  // Timing
  peak_months: string[];
  posting_days: string[];
  posting_times: Record<string, string>;
  // Autonomy
  autonomy_level: 'conservative' | 'balanced' | 'aggressive';
  auto_publish: boolean;
  require_approval: boolean;
  // Personas (target audience profiles for channel-fit alignment)
  personas: Persona[];
  // Status
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useMarketingStrategy() {
  return useQuery<MarketingStrategy | null>({
    queryKey: ['marketing-strategy'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from('go_marketing_strategy')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) { console.warn('[useMarketingStrategy] error:', error.message); return null; }
      if (!data) return null;

      // Fork-bridge: the marketing-web TargetAudience page writes personas
      // to a standalone `personas` table (per session 2026-05-23 decision
      // to keep the table). Merge those rows into MarketingStrategy.personas
      // so AMOS-mobile sees them regardless of whether the user filled
      // personas via the web wizard JSONB path or the standalone page.
      let extraPersonas: Persona[] = [];
      try {
        const { data: rows } = await supabase
          .from('personas')
          .select('id, name, demographics, psychographics, behavioral')
          .eq('user_id', user.id);
        if (rows?.length) {
          extraPersonas = rows.map((r: any) => ({
            id: r.id,
            name: r.name ?? 'Persona',
            role: r.demographics?.occupation ?? '',
            pain_points: r.behavioral?.pain_points
              ? (Array.isArray(r.behavioral.pain_points) ? r.behavioral.pain_points : [r.behavioral.pain_points])
              : [],
            tone: 'casual',
            channels: [],
          })) as Persona[];
        }
      } catch (e) {
        // Standalone personas table is best-effort; AMOS still works without it.
        console.warn('[useMarketingStrategy] standalone personas read failed:', e);
      }

      const jsonbPersonas = (data as any).personas ?? [];
      // Deduplicate by id when both sources have the same persona.
      const seenIds = new Set<string>();
      const mergedPersonas = [...jsonbPersonas, ...extraPersonas].filter((p: any) => {
        if (!p?.id) return true;
        if (seenIds.has(p.id)) return false;
        seenIds.add(p.id);
        return true;
      });

      return { ...(data as any), personas: mergedPersonas } as MarketingStrategy;
    },
    staleTime: 60_000,
  });
}

export function useUpdateMarketingStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Partial<MarketingStrategy>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('go_marketing_strategy')
        .upsert(
          { ...updates, user_id: user.id, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
        .select()
        .single();
      if (error) throw error;
      return data as MarketingStrategy;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketing-strategy'] }),
  });
}
