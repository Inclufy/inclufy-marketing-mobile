// src/components/CommentThread.tsx
// Mobile (React Native) counterpart of the web CommentThread component.
// Closes P1 parity gap #7 from docs/COMMON_FEATURES_AUDIT_2026-06-09.md.
//
// Usage:
//   <CommentThread entityType="capture" entityId={captureId} />
//
// @mention support: typing @ shows a picker of org members. Selecting a
// person inlines `@[Name](uuid)` which the DB trigger
// `entity_comments_extract_mentions` parses → entity_mentions +
// go_notifications rows. Identical contract to web.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useEntityComments, useAddEntityComment, useDeleteEntityComment,
  type EntityType, type EntityComment,
} from '../hooks/useEntityComments';
import { supabase } from '../services/supabase';
import { useTheme } from '../context/ThemeContext';

interface Props {
  entityType: EntityType;
  entityId: string;
  organizationId?: string | null;
  /** Max body height in px. Default 320. */
  maxHeight?: number;
}

interface MentionMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  email: string;
}

export function CommentThread({ entityType, entityId, organizationId, maxHeight = 320 }: Props) {
  const { colors } = useTheme();
  const [body, setBody] = useState('');
  const [me, setMe] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [members, setMembers] = useState<MentionMember[]>([]);
  const [orgId, setOrgId] = useState<string | null>(organizationId ?? null);
  const inputRef = useRef<TextInput>(null);

  const { data: comments = [], isLoading, refetch } = useEntityComments(entityType, entityId);
  const add = useAddEntityComment();
  const del = useDeleteEntityComment();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMe(user?.id ?? null));
  }, []);

  // Resolve org + cache org members for the @mention picker
  useEffect(() => {
    if (orgId) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: m } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (m?.organization_id) setOrgId(m.organization_id);
    });
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    supabase
      .from('organization_members')
      .select('user_id, profiles(id, full_name, avatar_url, email)')
      .eq('organization_id', orgId)
      .then(({ data }) => {
        const rows = ((data ?? []) as any[])
          .map((r) => r.profiles)
          .filter(Boolean) as MentionMember[];
        setMembers(rows);
      });
  }, [orgId]);

  const filteredMembers = useMemo(() => {
    if (!mentionQuery) return members.slice(0, 6);
    const q = mentionQuery.toLowerCase();
    return members
      .filter((m) =>
        (m.full_name?.toLowerCase().includes(q)) ||
        (m.email?.toLowerCase().includes(q)),
      )
      .slice(0, 6);
  }, [members, mentionQuery]);

  const handleBodyChange = (txt: string) => {
    setBody(txt);
    // Detect mention trigger: @ followed by non-space chars at the end
    const m = txt.match(/@([^\s@]*)$/);
    if (m) {
      setMentionQuery(m[1]);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
      setMentionQuery('');
    }
  };

  const handlePickMention = (member: MentionMember) => {
    // Replace the trailing @query with @[Name](uuid)
    const next = body.replace(/@[^\s@]*$/, `@[${member.full_name}](${member.id}) `);
    setBody(next);
    setMentionOpen(false);
    setMentionQuery('');
    inputRef.current?.focus();
  };

  const handleSubmit = async () => {
    const txt = body.trim();
    if (!txt) return;
    try {
      await add.mutateAsync({
        entity_type: entityType,
        entity_id: entityId,
        body: txt,
        organization_id: orgId,
      });
      setBody('');
      refetch();
    } catch (e: any) {
      Alert.alert('Plaatsen mislukt', e?.message ?? 'Onbekende fout');
    }
  };

  const handleDelete = (c: EntityComment) => {
    Alert.alert('Comment verwijderen?', '', [
      { text: 'Annuleren', style: 'cancel' },
      {
        text: 'Verwijder',
        style: 'destructive',
        onPress: () => del.mutate({ id: c.id, entity_type: entityType, entity_id: entityId }),
      },
    ]);
  };

  /** Render @[Name](uuid) as bolded "@Name" inline in plain Text. */
  const renderBody = (raw: string) => {
    const parts: React.ReactNode[] = [];
    const re = /@\[([^\]]+)\]\(([0-9a-f-]+)\)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = re.exec(raw)) !== null) {
      if (m.index > last) parts.push(<Text key={`t${idx++}`}>{raw.slice(last, m.index)}</Text>);
      parts.push(
        <Text key={`m${idx++}`} style={{ color: colors.primary, fontWeight: '600' }}>
          @{m[1]}
        </Text>,
      );
      last = m.index + m[0].length;
    }
    if (last < raw.length) parts.push(<Text key={`t${idx++}`}>{raw.slice(last)}</Text>);
    return parts.length > 0 ? parts : raw;
  };

  const fmtDate = (s: string) => {
    const d = new Date(s);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000) return 'net';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}u`;
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
  };

  const styles = StyleSheet.create({
    wrap: { backgroundColor: colors.background },
    list: { maxHeight, minHeight: 80 },
    empty: { padding: 16, alignItems: 'center' as const },
    emptyText: { color: colors.textSecondary, fontSize: 13 },
    row: {
      flexDirection: 'row' as const,
      paddingHorizontal: 12, paddingVertical: 10,
      gap: 10,
    },
    avatar: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.surface,
      alignItems: 'center' as const, justifyContent: 'center' as const,
    },
    avatarImg: { width: 32, height: 32, borderRadius: 16 },
    bubble: { flex: 1 },
    headerLine: { flexDirection: 'row' as const, alignItems: 'baseline' as const, gap: 6 },
    name: { fontWeight: '600' as const, color: colors.text, fontSize: 13 },
    time: { color: colors.textSecondary, fontSize: 11 },
    body: { color: colors.text, fontSize: 14, lineHeight: 19, marginTop: 1 },
    deleteBtn: { padding: 4 },
    composer: {
      borderTopWidth: 1, borderTopColor: colors.border,
      flexDirection: 'row' as const, gap: 8,
      padding: 10, alignItems: 'flex-end' as const,
    },
    input: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 18,
      paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 8,
      color: colors.text, fontSize: 14, maxHeight: 120,
    },
    sendBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center' as const, justifyContent: 'center' as const,
    },
    sendDisabled: { opacity: 0.4 },
    mentionsPopup: {
      borderTopWidth: 1, borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    mentionRow: {
      flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    mentionName: { color: colors.text, fontSize: 14 },
  });

  return (
    <View style={styles.wrap}>
      {isLoading ? (
        <View style={styles.empty}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : comments.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubble-outline" size={28} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { marginTop: 6 }]}>
            Nog geen reacties. Begin de discussie ↓
          </Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={comments}
          keyExtractor={(c) => c.id}
          renderItem={({ item: c }) => (
            <View style={styles.row}>
              <View style={styles.avatar}>
                {c.author_avatar ? (
                  <Image source={{ uri: c.author_avatar }} style={styles.avatarImg} />
                ) : (
                  <Text style={{ color: colors.text, fontWeight: '700' }}>
                    {(c.author_name ?? '?').slice(0, 1).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={styles.bubble}>
                <View style={styles.headerLine}>
                  <Text style={styles.name}>{c.author_name}</Text>
                  <Text style={styles.time}>{fmtDate(c.created_at)}</Text>
                </View>
                <Text style={styles.body}>{renderBody(c.body)}</Text>
              </View>
              {c.user_id === me && (
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(c)}>
                  <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      {/* @mention picker */}
      {mentionOpen && filteredMembers.length > 0 && (
        <View style={styles.mentionsPopup}>
          {filteredMembers.map((m) => (
            <TouchableOpacity key={m.id} style={styles.mentionRow} onPress={() => handlePickMention(m)}>
              <View style={styles.avatar}>
                {m.avatar_url ? (
                  <Image source={{ uri: m.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <Text style={{ color: colors.text, fontWeight: '700' }}>
                    {m.full_name?.slice(0, 1).toUpperCase() ?? '?'}
                  </Text>
                )}
              </View>
              <Text style={styles.mentionName}>{m.full_name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Composer */}
      <View style={styles.composer}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={body}
          onChangeText={handleBodyChange}
          placeholder="Reageer of @noem iemand…"
          placeholderTextColor={colors.textSecondary}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!body.trim() || add.isPending) && styles.sendDisabled]}
          onPress={handleSubmit}
          disabled={!body.trim() || add.isPending}
        >
          {add.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={16} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
