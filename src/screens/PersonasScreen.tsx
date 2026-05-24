import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, Alert,
  SafeAreaView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import {
  useMarketingStrategy, useUpdateMarketingStrategy,
  type Persona, type PersonaTone,
} from '../hooks/useMarketingStrategy';
import type { RootStackParamList, Channel } from '../types';

import { CaretLeft, PencilLine, Plus, Trash, UsersThree, X } from 'phosphor-react-native';
type Nav = NativeStackNavigationProp<RootStackParamList>;

const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'x', label: 'X' },
  { key: 'tiktok', label: 'TikTok' },
];

const TONES: { key: PersonaTone; label: string; desc: string }[] = [
  { key: 'formal', label: 'Formeel', desc: 'B2B, professioneel, jargon-vrij maar zakelijk' },
  { key: 'casual', label: 'Casual', desc: 'Vriendelijk, conversational, emoji-vriendelijk' },
  { key: 'inspirational', label: 'Inspirerend', desc: 'Motiverend, visionair, storytelling' },
];

function newPersona(): Persona {
  return {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    role: '',
    pain_points: [],
    tone: 'formal',
    channels: [],
  };
}

export default function PersonasScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { data: strategy, isLoading } = useMarketingStrategy();
  const update = useUpdateMarketingStrategy();
  const [editing, setEditing] = useState<Persona | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);

  useEffect(() => {
    if (strategy?.personas) setPersonas(strategy.personas);
  }, [strategy?.personas]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const persistAll = async (next: Persona[]) => {
    setPersonas(next);
    try {
      await update.mutateAsync({ personas: next });
    } catch (e: any) {
      Alert.alert('Opslaan mislukt', e?.message ?? 'Onbekende fout');
    }
  };

  const removePersona = (id: string) => {
    Alert.alert('Verwijderen?', 'Deze persona wordt verwijderd.', [
      { text: 'Annuleer', style: 'cancel' },
      {
        text: 'Verwijder', style: 'destructive',
        onPress: () => persistAll(personas.filter((p) => p.id !== id)),
      },
    ]);
  };

  const savePersona = async (p: Persona) => {
    if (!p.name.trim()) { Alert.alert('Naam ontbreekt'); return; }
    if (p.channels.length === 0) { Alert.alert('Kies minstens één kanaal'); return; }
    const exists = personas.some((x) => x.id === p.id);
    const next = exists ? personas.map((x) => (x.id === p.id ? p : x)) : [...personas, p];
    await persistAll(next);
    setEditing(null);
  };

  if (editing) {
    return <PersonaEditor persona={editing} onSave={savePersona} onCancel={() => setEditing(null)} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <CaretLeft size={28} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Persona's</Text>
        <TouchableOpacity onPress={() => setEditing(newPersona())} hitSlop={10}>
          <Plus size={28} color={colors.text} weight="bold" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          Persona's beschrijven je doelgroepen per kanaal. De channel-fit check gebruikt deze om te kijken of een
          post de pijnpunten van je doelgroep raakt.
        </Text>

        {personas.length === 0 && (
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <UsersThree size={36} color={colors.textSecondary} weight="duotone" />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Nog geen persona's</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Voeg er één toe om channel-fit op doelgroep te beoordelen.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: '#EC4899' }]}
              onPress={() => setEditing(newPersona())}
            >
              <Text style={styles.primaryBtnText}>Voeg persona toe</Text>
            </TouchableOpacity>
          </View>
        )}

        {personas.map((p) => (
          <View key={p.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardName, { color: colors.text }]}>{p.name}</Text>
                {p.role ? <Text style={[styles.cardRole, { color: colors.textSecondary }]}>{p.role}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => setEditing(p)} hitSlop={10}>
                <PencilLine size={22} color={colors.text} weight="duotone" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removePersona(p.id)} hitSlop={10}>
                <Trash size={22} color="#EF4444" weight="duotone" />
              </TouchableOpacity>
            </View>

            <View style={styles.chipRow}>
              {p.channels.map((c) => (
                <View key={c} style={[styles.chip, { borderColor: colors.border }]}>
                  <Text style={[styles.chipText, { color: colors.text }]}>{labelFor(c)}</Text>
                </View>
              ))}
              <View style={[styles.chip, { borderColor: colors.border, backgroundColor: '#9333EA15' }]}>
                <Text style={[styles.chipText, { color: '#9333EA' }]}>{toneLabel(p.tone)}</Text>
              </View>
            </View>

            {p.pain_points.length > 0 && (
              <Text style={[styles.painPoints, { color: colors.textSecondary }]} numberOfLines={3}>
                {p.pain_points.join(' · ')}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function PersonaEditor({
  persona, onSave, onCancel,
}: { persona: Persona; onSave: (p: Persona) => void; onCancel: () => void }) {
  const { colors } = useTheme();
  const [name, setName] = useState(persona.name);
  const [role, setRole] = useState(persona.role);
  const [tone, setTone] = useState<PersonaTone>(persona.tone);
  const [channels, setChannels] = useState<Channel[]>(persona.channels);
  const [painPointsText, setPainPointsText] = useState(persona.pain_points.join('\n'));

  const toggleChannel = (c: Channel) =>
    setChannels((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  const handleSave = () => {
    const pain_points = painPointsText
      .split('\n').map((s) => s.trim()).filter(Boolean);
    onSave({ ...persona, name: name.trim(), role: role.trim(), tone, channels, pain_points });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} hitSlop={10}>
          <X size={28} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Persona bewerken</Text>
        <TouchableOpacity onPress={handleSave} hitSlop={10}>
          <Text style={[styles.saveText, { color: '#EC4899' }]}>Opslaan</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Naam" hint="Bijv. 'Sarah, MKB-eigenaar'">
          <TextInput
            value={name} onChangeText={setName}
            placeholder="Persona naam" placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />
        </Field>

        <Field label="Rol / functie" hint="Bijv. 'Marketing manager bij scale-up (50-200 fte)'">
          <TextInput
            value={role} onChangeText={setRole}
            placeholder="Functietitel + context" placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />
        </Field>

        <Field label="Pijnpunten" hint="Eén per regel — gebruik kernwoorden uit hoe ze zelf praten">
          <TextInput
            value={painPointsText} onChangeText={setPainPointsText}
            placeholder={'tijdgebrek\nbudget\nROI bewijzen\nteam te klein'}
            placeholderTextColor={colors.textSecondary}
            multiline numberOfLines={6}
            style={[styles.input, styles.inputMulti, { color: colors.text, borderColor: colors.border }]}
          />
        </Field>

        <Field label="Toon" hint="Welke schrijfstijl past bij deze persona?">
          <View style={{ gap: spacing.xs }}>
            {TONES.map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTone(t.key)}
                style={[
                  styles.toneOption,
                  { borderColor: tone === t.key ? '#EC4899' : colors.border, backgroundColor: tone === t.key ? '#EC489915' : 'transparent' },
                ]}
              >
                <Text style={[styles.toneLabel, { color: colors.text }]}>{t.label}</Text>
                <Text style={[styles.toneDesc, { color: colors.textSecondary }]}>{t.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        <Field label="Kanalen" hint="Op welke kanalen mik je deze persona?">
          <View style={styles.channelGrid}>
            {CHANNELS.map((c) => {
              const active = channels.includes(c.key);
              return (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => toggleChannel(c.key)}
                  style={[
                    styles.channelChip,
                    { borderColor: active ? '#EC4899' : colors.border, backgroundColor: active ? '#EC489915' : 'transparent' },
                  ]}
                >
                  <Text style={[styles.channelChipText, { color: active ? '#EC4899' : colors.text }]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      {hint && <Text style={[styles.fieldHint, { color: colors.textSecondary }]}>{hint}</Text>}
      {children}
    </View>
  );
}

function labelFor(c: Channel): string {
  return CHANNELS.find((x) => x.key === c)?.label ?? c;
}

function toneLabel(t: PersonaTone): string {
  return TONES.find((x) => x.key === t)?.label ?? t;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.bold as '700' },
  saveText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold as '600' },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },

  intro: { fontSize: fontSize.sm, lineHeight: 20 },

  empty: {
    alignItems: 'center', gap: spacing.sm,
    padding: spacing.lg, borderWidth: 1, borderStyle: 'dashed',
    borderRadius: borderRadius.md,
  },
  emptyTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold as '600' },
  emptyText: { fontSize: fontSize.sm, textAlign: 'center' },

  primaryBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full, marginTop: spacing.sm,
  },
  primaryBtnText: { color: '#fff', fontWeight: fontWeight.semibold as '600' },

  card: {
    padding: spacing.md, borderRadius: borderRadius.md,
    borderWidth: 1, gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardName: { fontSize: fontSize.md, fontWeight: fontWeight.semibold as '600' },
  cardRole: { fontSize: fontSize.sm, marginTop: 2 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: borderRadius.full, borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: fontWeight.medium as '500' },
  painPoints: { fontSize: fontSize.sm, lineHeight: 18, fontStyle: 'italic' },

  fieldLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold as '600' },
  fieldHint: { fontSize: 12 },
  input: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderRadius: borderRadius.md,
    fontSize: fontSize.md,
  },
  inputMulti: { minHeight: 120, textAlignVertical: 'top' },

  toneOption: {
    padding: spacing.md, borderWidth: 1, borderRadius: borderRadius.md, gap: 4,
  },
  toneLabel: { fontSize: fontSize.md, fontWeight: fontWeight.semibold as '600' },
  toneDesc: { fontSize: 12 },

  channelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  channelChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderWidth: 1, borderRadius: borderRadius.full,
  },
  channelChipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium as '500' },
});
