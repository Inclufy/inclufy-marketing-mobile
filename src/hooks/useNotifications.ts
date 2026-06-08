import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabase';

// ─── Types ───────────────────────────────────────────────────────────

export type NotificationType =
  | 'team_invite'
  | 'system'
  | 'ai_suggestion'
  | 'post_published'
  | 'event_update'
  // Capture-to-Ad lifecycle types — written by ad-performance-monitor cron
  | 'boost_candidate'  // top-performer detected → suggest Boost
  | 'boost_completed'  // ad campaign duration ended
  | 'boost_failed'     // Meta Marketing API rejection
  // Post approval lifecycle — written by submit-post-for-approval / process-post-approval edge fns
  | 'post_approval_needed'   // sent to admins when a user submits a draft for review
  | 'post_approval_decided'  // sent to submitter when an admin approves/rejects
  // Comment + @mention lifecycle — written by entity_comments_extract_mentions
  // DB trigger (see 20260524140000_entity_comments.sql)
  | 'mention'                // user @-mentioned in an entity comment
  | 'comment_reply';         // someone replied to a thread the user started

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: {
    // team_invite
    event_id?: string;
    member_id?: string;
    event_name?: string;
    invited_by?: string;
    role?: string;
    // boost_candidate / boost_completed / boost_failed
    post_id?: string;
    channel?: string;
    multiplier?: number;
    engagement_score?: number;
    baseline_score?: number;
    campaign_id?: string;
    action_url?: string;
    // generic
    route?: string;
    [key: string]: unknown;
  };
  read: boolean;
  created_at: string;
}

// ─── Hooks ───────────────────────────────────────────────────────────

/** Fetch all notifications for the current user, newest first. */
export function useNotifications() {
  const qc = useQueryClient();

  const query = useQuery<AppNotification[]>({
    queryKey: ['go-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('go_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(60);

      if (error) throw error;
      return (data || []) as AppNotification[];
    },
    staleTime: 30_000,
  });

  // ── Realtime subscription ──────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('go-notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'go_notifications',
        },
        () => {
          // Re-fetch when a new notification arrives
          qc.invalidateQueries({ queryKey: ['go-notifications'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return query;
}

/** Count of unread notifications — use for badge. */
export function useUnreadNotificationCount(): number {
  const { data = [] } = useNotifications();
  return data.filter((n) => !n.read).length;
}

/** Mark a single notification as read. */
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('go_notifications')
        .update({ read: true })
        .eq('id', id);
      if (error) throw error;
    },
    // Optimistic update: immediately mark as read in cache
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['go-notifications'] });
      const prev = qc.getQueryData<AppNotification[]>(['go-notifications']);
      qc.setQueryData<AppNotification[]>(
        ['go-notifications'],
        (old) => (old || []).map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['go-notifications'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['go-notifications'] });
    },
  });
}

/** Mark ALL notifications as read. */
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: { user } = {} as any } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('go_notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['go-notifications'] });
    },
  });
}

/**
 * Accept or decline a team invite from a notification.
 * Updates go_event_members AND marks the notification as read.
 */
export function useRespondToInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      notificationId,
      memberId,
      eventId,
      action,
    }: {
      notificationId: string;
      memberId: string;
      eventId: string;
      action: 'accept' | 'decline';
    }) => {
      const status = action === 'accept' ? 'accepted' : 'declined';
      const patch: Record<string, unknown> = { status };
      if (action === 'accept') {
        patch.accepted_at = new Date().toISOString();
      }

      // Update membership status
      const { error: memberError } = await supabase
        .from('go_event_members')
        .update(patch)
        .eq('id', memberId);

      if (memberError) throw memberError;

      // Mark notification as read
      await supabase
        .from('go_notifications')
        .update({ read: true })
        .eq('id', notificationId);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['go-notifications'] });
      qc.invalidateQueries({ queryKey: ['team-members'] });
      qc.invalidateQueries({ queryKey: ['team-invitations'] });
      qc.invalidateQueries({ queryKey: ['events'] });
    },
  });
}
