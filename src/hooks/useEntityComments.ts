// src/hooks/useEntityComments.ts
// Mobile counterpart of inclufy-marketing-web/src/hooks/queries/useEntityComments.ts
// Uses the shared entity_comments table on the shared Supabase project
// (mpxkugfqzmxydxnlxqoj). Comments posted from web are visible on
// mobile and vice-versa.
//
// Closes P1 parity gap #7 from docs/COMMON_FEATURES_AUDIT_2026-06-09.md.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';

export type EntityType =
  | 'post' | 'capture' | 'campaign' | 'event'
  | 'contact' | 'content_item' | 'content_proposal'
  | 'opportunity' | 'lead' | 'agent_run' | 'training' | 'invoice';

export interface EntityComment {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  organization_id: string | null;
  parent_id: string | null;
  user_id: string;
  body: string;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined display fields
  author_name?: string;
  author_avatar?: string | null;
}

const key = (entityType: EntityType, entityId: string) =>
  ['entity-comments', entityType, entityId] as const;

export function useEntityComments(entityType: EntityType, entityId: string | null | undefined) {
  return useQuery<EntityComment[]>({
    queryKey: key(entityType, entityId ?? ''),
    enabled: !!entityId,
    queryFn: async () => {
      if (!entityId) return [];
      const { data, error } = await supabase
        .from('entity_comments')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as EntityComment[];

      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      if (userIds.length === 0) return rows;
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, email')
        .in('id', userIds);
      const byId = new Map<string, { name: string; avatar: string | null }>();
      (profs ?? []).forEach((p: any) =>
        byId.set(p.id, { name: p.full_name || p.email || 'Onbekend', avatar: p.avatar_url ?? null }),
      );
      return rows.map((r) => ({
        ...r,
        author_name: byId.get(r.user_id)?.name ?? 'Onbekend',
        author_avatar: byId.get(r.user_id)?.avatar ?? null,
      }));
    },
    staleTime: 30_000,
    // P0-5 — surveys offline cache pipeline handles persistence
    networkMode: 'offlineFirst',
  });
}

export function useAddEntityComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entity_type: EntityType;
      entity_id: string;
      body: string;
      parent_id?: string | null;
      organization_id?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase.from('entity_comments').insert({
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        organization_id: input.organization_id ?? null,
        parent_id: input.parent_id ?? null,
        user_id: user.id,
        body: input.body,
      }).select().single();
      if (error) throw error;
      return data as EntityComment;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: key(vars.entity_type, vars.entity_id) });
      qc.invalidateQueries({ queryKey: ['go-notifications'] });
    },
    networkMode: 'offlineFirst',
  });
}

export function useDeleteEntityComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; entity_type: EntityType; entity_id: string }) => {
      const { error } = await supabase
        .from('entity_comments')
        .update({ deleted_at: new Date().toISOString(), body: '' })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: key(vars.entity_type, vars.entity_id) });
    },
    networkMode: 'offlineFirst',
  });
}
