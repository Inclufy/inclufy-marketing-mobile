import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../theme';

import { FileText } from 'phosphor-react-native';
interface Props {
  onSubmit: (quote: string, speaker: string) => void;
}

export default function QuoteCapture({ onSubmit }: Props) {
  const [quote, setQuote] = useState('');
  const [speaker, setSpeaker] = useState('');

  const handleSubmit = () => {
    if (!quote.trim()) return;
    onSubmit(quote.trim(), speaker.trim());
    setQuote('');
    setSpeaker('');
  };

  return (
    <View style={styles.container}>
      <FileText size={32} color={colors.primary} weight="duotone" />
      <Text style={styles.title}>Quote Capture</Text>
      <Text style={styles.subtitle}>Typ een quote en AI maakt er een branded post van</Text>

      <TextInput
        style={styles.quoteInput}
        value={quote}
        onChangeText={setQuote}
        placeholder={'"AI is niet de toekomst \u2014 het is nu."'}
        placeholderTextColor="rgba(255,255,255,0.3)"
        multiline
        numberOfLines={4}
      />

      <TextInput
        style={styles.speakerInput}
        value={speaker}
        onChangeText={setSpeaker}
        placeholder="Spreker naam (optioneel)"
        placeholderTextColor="rgba(255,255,255,0.3)"
      />

      <TouchableOpacity
        style={[styles.submitBtn, !quote.trim() && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!quote.trim()}
      >
        <Text style={styles.submitText}>Quote opslaan & genereren</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  icon: { fontSize: 48 },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: '#fff',
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  quoteInput: {
    width: '100%',
    minHeight: 120,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.lg,
    color: '#fff',
    fontStyle: 'italic',
    textAlignVertical: 'top',
  },
  speakerInput: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.md,
    color: '#fff',
  },
  submitBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
});
