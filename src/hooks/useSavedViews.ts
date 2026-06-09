// src/hooks/useSavedViews.ts
// Mobile counterpart of inclufy-marketing-web/src/hooks/queries/useSavedViews.ts.
// Same polymorphic saved_views table on the shared Supabase project —
// views created on web appear on mobile and vice versa.
//
// Closes P1 parity gap #8 from docs/COMMON_FEATURES_AUDIT_2026-06-09.md.
// The consumer's filter-shape is opaque to this layer — host owns the
// shape, here we only persist a JSONB blob.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';

export interface SavedView<F = Record<string, unknown>> {
  id: string;
  user_id: string;
  organization_id: string | null;
  entity_type: string;
  name: string;
  filters: F;
  sort: { column?: string; direction?: 'asc' | 'desc' };
  visible_columns: string[] | null;
  shared: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const key = (entityType: string) => ['saved-views', entityType] as const;

export function useSavedViews<F = Record<string, unknown>>(entityType: string) {
  return useQuery<SavedView<F>[]>({
    queryKey: key(entityType),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_views')
        .select('*')
        .eq('entity_type', entityType)
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SavedView<F>[];
    },
    staleTime: 5 * 60_000,
    networkMode: 'offlineFirst',
  });
}

export function useSaveView<F = Record<string, unknown>>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<SavedView<F>> & {
      entity_type: string; name: string; filters: F;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: org } = await supabase
        .from('organization_members').select('organization_id').eq('user_id', user.id).maybeSingle();

      const payload: Record<string, unknown> = {
        user_id: user.id,
        organization_id: org?.organization_id ?? null,
        entity_type: input.entity_type,
        name: input.name,
        filters: input.filters,
        sort: input.sort ?? {},
        visible_columns: input.visible_columns ?? null,
        shared: input.shared ?? false,
        is_default: input.is_default ?? false,
      };

      if (payload.is_default) {
        await supabase.from('saved_views')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .eq('entity_type', input.entity_type);
      }

      if (input.id) {
        const { data, error } = await supabase
          .from('saved_views').update(payload).eq('id', input.id).select().single();
        if (error) throw error;
        return data as SavedView<F>;
      }
      const { data, error } = await supabase
        .from('saved_views').insert(payload).select().single();
      if (error) throw error;
      return data as SavedView<F>;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: key(vars.entity_type) });
    },
    networkMode: 'offlineFirst',
  });
}

export function useDeleteSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; entity_type: string }) => {
      const { error } = await supabase.from('saved_views').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: key(vars.entity_type) }),
    networkMode: 'offlineFirst',
  });
}
