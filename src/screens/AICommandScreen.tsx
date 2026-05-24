import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../services/supabase';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';

import { ArrowUp, Sparkle } from 'phosphor-react-native';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

type Message = { role: 'user' | 'assistant'; content: string };

export default function AICommandScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      paddingHorizontal: spacing.lg,
      paddingTop: 60,
      paddingBottom: spacing.md,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: {
      fontSize: fontSize.xxl,
      fontWeight: fontWeight.bold,
      color: c.primary,
    },
    headerSubtitle: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
      marginTop: 2,
    },
    messageList: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    messageListEmpty: {
      flexGrow: 1,
      justifyContent: 'center' as const,
    },
    messageBubble: {
      maxWidth: '80%',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderRadius: borderRadius.lg,
      marginVertical: spacing.xs / 2,
    },
    userBubble: {
      alignSelf: 'flex-end' as const,
      backgroundColor: c.primary,
      borderBottomRightRadius: borderRadius.sm,
    },
    assistantBubble: {
      alignSelf: 'flex-start' as const,
      backgroundColor: c.surface,
      borderBottomLeftRadius: borderRadius.sm,
      borderWidth: 1,
      borderColor: c.borderLight,
    },
    roleLabel: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.primary,
      marginBottom: 2,
    },
    messageText: {
      fontSize: fontSize.md,
      lineHeight: 22,
    },
    userText: {
      color: c.textOnPrimary,
    },
    assistantText: {
      color: c.text,
    },
    emptyContainer: {
      alignItems: 'center' as const,
      paddingHorizontal: spacing.lg,
      // Inverted FlatList flips content, so rotate it back
      transform: [{ scaleY: -1 }],
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: spacing.md,
    },
    emptyTitle: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    emptySubtitle: {
      fontSize: fontSize.md,
      color: c.textSecondary,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    suggestionsGrid: {
      width: '100%',
      gap: spacing.sm,
    },
    suggestionChip: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.primary + '30',
      borderRadius: borderRadius.md,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
    },
    suggestionText: {
      fontSize: fontSize.sm,
      color: c.primary,
      fontWeight: fontWeight.medium,
    },
    loadingRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    loadingText: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
      fontStyle: 'italic' as const,
    },
    inputBar: {
      flexDirection: 'row' as const,
      alignItems: 'flex-end' as const,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      paddingBottom: Platform.OS === 'ios' ? 34 : spacing.md,
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: spacing.sm,
    },
    textInput: {
      flex: 1,
      backgroundColor: c.background,
      borderRadius: borderRadius.xl,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spacing.md,
      paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm,
      fontSize: fontSize.md,
      color: c.text,
      maxHeight: 100,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.full,
      backgroundColor: c.primary,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    sendButtonDisabled: {
      backgroundColor: c.textTertiary,
    },
    sendButtonText: {
      color: c.textOnPrimary,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
    },
  }));

  const SUGGESTED_PROMPTS = [
    t.aiCommand.prompt1,
    t.aiCommand.prompt2,
    t.aiCommand.prompt3,
    t.aiCommand.prompt4,
  ];

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList<Message>>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMessage: Message = { role: 'user', content: trimmed };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setInput('');
      setLoading(true);

      try {
        // Call Supabase Edge Function — works everywhere, no backend server needed
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? SUPABASE_ANON_KEY;

        const res = await fetch(`${SUPABASE_URL}/functions/v1/copilot-chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ messages: updatedMessages }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);

        const assistantContent = data?.response ?? data?.content ?? t.aiCommand.noResponse;
        setMessages((prev) => [...prev, { role: 'assistant', content: assistantContent }]);
      } catch (err: any) {
        const msg = err?.message ?? '';
        const friendly = msg.includes('OpenAI')
          ? 'De AI-service is tijdelijk niet beschikbaar. Probeer later opnieuw.'
          : msg.includes('network') || msg.includes('fetch') || msg.includes('Failed')
          ? 'Geen verbinding. Controleer je internet.'
          : t.aiCommand.errorMessage;
        setMessages((prev) => [...prev, { role: 'assistant', content: friendly }]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading],
  );

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      sendMessage(prompt);
    },
    [sendMessage],
  );

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isUser = item.role === 'user';
      return (
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          {!isUser && (
            <Text style={styles.roleLabel}>Inclufy AI</Text>
          )}
          <Text
            style={[
              styles.messageText,
              isUser ? styles.userText : styles.assistantText,
            ]}
          >
            {item.content}
          </Text>
        </View>
      );
    },
    [styles],
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <Sparkle size={48} color={colors.primary} weight="fill" />
        <Text style={styles.emptyTitle}>{t.aiCommand.emptyTitle}</Text>
        <Text style={styles.emptySubtitle}>
          {t.aiCommand.emptySubtitle}
        </Text>

        <View style={styles.suggestionsGrid}>
          {SUGGESTED_PROMPTS.map((prompt) => (
            <TouchableOpacity
              key={prompt}
              style={styles.suggestionChip}
              onPress={() => handleSuggestedPrompt(prompt)}
            >
              <Text style={styles.suggestionText}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    ),
    [styles, handleSuggestedPrompt],
  );

  const keyExtractor = useCallback(
    (_: Message, index: number) => `msg-${index}`,
    [],
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.aiCommand.title}</Text>
        <Text style={styles.headerSubtitle}>{t.aiCommand.subtitle}</Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        inverted
        contentContainerStyle={[
          styles.messageList,
          messages.length === 0 && styles.messageListEmpty,
        ]}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>{t.aiCommand.thinking}</Text>
        </View>
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder={t.aiCommand.inputPlaceholder}
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={2000}
          editable={!loading}
          onSubmitEditing={() => sendMessage(input)}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!input.trim() || loading) && styles.sendButtonDisabled,
          ]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || loading}
        >
          <ArrowUp size={20} color={colors.textOnPrimary} weight="bold" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
