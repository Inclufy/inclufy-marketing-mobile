// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: ch.icon as any>
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useEvent, useCreateEvent, useUpdateEvent } from '../hooks/useEvents';
import { useBrandKits } from '../hooks/useBrandMemory';
import { supabase } from '../services/supabase';
import type { RootStackParamList, Channel, EventInsert } from '../types';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { CAPTURE_TAG_PRESETS } from '../types';
import { useTranslation } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { Ionicons } from '@expo/vector-icons';
import { Calendar, Camera, Image as ImageIcon, MapPin } from 'phosphor-react-native';
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'EventSetup'>;

// ── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_KEYS: { key: Channel; label: string; lightColor: string; icon: string }[] = [
  { key: 'linkedin', label: 'LinkedIn', lightColor: '#0077B5', icon: 'logo-linkedin' },
  { key: 'instagram', label: 'Instagram', lightColor: '#E4405F', icon: 'logo-instagram' },
  { key: 'facebook', label: 'Facebook', lightColor: '#1877F2', icon: 'logo-facebook' },
  { key: 'whatsapp', label: 'WhatsApp', lightColor: '#25D366', icon: 'logo-whatsapp' },
];

const GOAL_PRESETS = [
  { key: 'naamsbekendheid', label: '📢 Naamsbekendheid' },
  { key: 'leads', label: '🎯 Leads genereren' },
  { key: 'community', label: '🤝 Community building' },
  { key: 'thought_leadership', label: '💡 Thought leadership' },
  { key: 'product', label: '🚀 Productlancering' },
  { key: 'relaties', label: '🤜 Relatiebeheer' },
  { key: 'engagement', label: '❤️ Engagement' },
  { key: 'media', label: '📰 Media-aandacht' },
];

// ── EU date helpers (DD-MM-YYYY <-> YYYY-MM-DD) ─────────────────────────────

const toEUDate = (iso: string): string => {
  if (!iso) return '';
  const p = iso.split('-');
  if (p.length !== 3) return iso;
  if (p[0].length <= 2) return iso; // already EU
  return `${p[2]}-${p[1]}-${p[0]}`;
};

const fromEUDate = (eu: string): string => {
  if (!eu) return '';
  const p = eu.split('-');
  if (p.length !== 3) return eu;
  if (p[0].length === 4) return eu; // already ISO
  return `${p[2]}-${p[1]}-${p[0]}`;
};

// ── Upload cover image ────────────────────────────────────────────────────────

async function uploadCoverImage(localUri: string): Promise<string> {
  const { data: { user } = {} as any } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const fileName = `cover_${Date.now()}.jpg`;
  const storagePath = `covers/${user.id}/${fileName}`;
  const response = await fetch(localUri);
  const blob = await response.blob();
  const { error } = await supabase.storage
    .from('media').upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data: signData } = await supabase.storage.from('media').createSignedUrl(storagePath, 60 * 60 * 24 * 365);
  if (signData?.signedUrl) return signData.signedUrl;
  const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath);
  return urlData.publicUrl;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EventSetupScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const eventId = route.params?.eventId;
  const isEditing = !!eventId;

  const { data: existingEvent } = useEvent(eventId);
  const { data: brandKits = [] } = useBrandKits();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [eventDate, setEventDate] = useState(''); // DD-MM-YYYY
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(['linkedin', 'instagram']);
  const [hashtags, setHashtags] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedBrandKit, setSelectedBrandKit] = useState<string | null>(null);
  const [coverImageUri, setCoverImageUri] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: spacing.lg, gap: spacing.xs, paddingBottom: 80 },
    sectionHeader: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.textSecondary,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.8,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    label: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.text,
      marginTop: spacing.sm,
    },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      fontSize: fontSize.md,
      color: c.text,
    },
    textArea: { minHeight: 80, textAlignVertical: 'top' as const },
    rowInputs: { flexDirection: 'row' as const, gap: spacing.sm },
    chipRow: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    chip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    chipSelected: { backgroundColor: c.primary + '15', borderColor: c.primary },
    chipText: { fontSize: fontSize.sm, color: c.textSecondary },
    chipTextSelected: { color: c.primary, fontWeight: fontWeight.medium },
    colorDot: { width: 12, height: 12, borderRadius: 6 },
    coverImageBox: {
      width: '100%' as const,
      height: 160,
      borderRadius: borderRadius.md,
      backgroundColor: c.surfaceElevated,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      borderWidth: 1,
      borderColor: c.border,
      borderStyle: 'dashed' as const,
      overflow: 'hidden' as const,
      marginTop: spacing.xs,
    },
    coverImage: { width: '100%' as const, height: '100%' as const },
    saveButton: {
      backgroundColor: c.primary,
      borderRadius: borderRadius.md,
      paddingVertical: 16,
      alignItems: 'center' as const,
      marginTop: spacing.lg,
    },
    buttonDisabled: { opacity: 0.6 },
    saveButtonText: { color: c.textOnPrimary, fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  }));

  useEffect(() => {
    if (existingEvent) {
      setName(existingEvent.name);
      setDescription(existingEvent.description);
      setLocation(existingEvent.location);
      setEventDate(toEUDate(existingEvent.event_date));
      setStartTime((existingEvent as any).event_start_time || '');
      setEndTime((existingEvent as any).event_end_time || '');
      setSelectedChannels(existingEvent.channels || ['linkedin', 'instagram']);
      setHashtags((existingEvent.hashtags || []).join(', '));
      setSelectedTags(existingEvent.default_tags || []);
      setSelectedGoals((existingEvent as any).goals || []);
      setSelectedBrandKit(existingEvent.brand_kit_id);
      if (existingEvent.cover_image_url) setCoverImageUri(existingEvent.cover_image_url);
    }
  }, [existingEvent]);

  const toggleChannel = (ch: Channel) =>
    setSelectedChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((tg) => tg !== tag) : [...prev, tag]);

  const toggleGoal = (goal: string) =>
    setSelectedGoals((prev) => prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]);

  const handlePickCoverImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Geen toegang', 'Geef toegang tot je fotobibliotheek.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (!result.canceled && result.assets.length > 0) {
      setCoverImageUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert(t.eventSetup.fillEventName); return; }
    if (!eventDate.trim()) { Alert.alert(t.eventSetup.fillDate); return; }
    if (selectedChannels.length === 0) { Alert.alert(t.eventSetup.selectChannel); return; }

    let coverUrl: string | null = null;
    if (coverImageUri && coverImageUri.startsWith('file://')) {
      setUploadingCover(true);
      try {
        coverUrl = await uploadCoverImage(coverImageUri);
      } catch {
        Alert.alert('Fout', 'Omslagfoto uploaden mislukt. Event wordt opgeslagen zonder foto.');
      } finally {
        setUploadingCover(false);
      }
    } else if (coverImageUri) {
      coverUrl = coverImageUri;
    }

    const input: EventInsert = {
      name: name.trim(),
      description: description.trim(),
      location: location.trim(),
      event_date: fromEUDate(eventDate.trim()),
      event_start_time: startTime.trim() || null,
      event_end_time: endTime.trim() || null,
      channels: selectedChannels,
      hashtags: hashtags.split(',').map((h) => h.trim()).filter(Boolean),
      default_tags: selectedTags,
      goals: selectedGoals,
      brand_kit_id: selectedBrandKit,
      status: 'upcoming',
      cover_image_url: coverUrl,
      settings: {},
    };

    try {
      if (isEditing && eventId) {
        await updateEvent.mutateAsync({ id: eventId, ...input });
      } else {
        await createEvent.mutateAsync(input);
      }
      navigation.goBack();
    } catch (error: any) {
      Alert.alert(t.common.error, error.message || t.eventSetup.saveError);
    }
  };

  const isSaving = createEvent.isPending || updateEvent.isPending || uploadingCover;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* Cover Image */}
      <Text style={styles.sectionHeader}>Omslagfoto</Text>
      <TouchableOpacity style={styles.coverImageBox} onPress={handlePickCoverImage}>
        {coverImageUri ? (
          <>
            <Image source={{ uri: coverImageUri }} style={styles.coverImage} resizeMode="cover" />
            <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: 6 }}>
              <Camera size={14} color="#fff" weight="duotone" />
            </View>
          </>
        ) : (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <ImageIcon size={32} color={colors.textTertiary} weight="duotone" />
            <Text style={{ fontSize: fontSize.sm, color: colors.textTertiary }}>Kies omslagfoto (optioneel)</Text>
            <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>Aanbevolen 16:9</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Basisinfo */}
      <Text style={styles.sectionHeader}>Basis informatie</Text>

      <Text style={styles.label}>{t.eventSetup.eventName}</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName}
        placeholder={t.eventSetup.eventNamePlaceholder} placeholderTextColor={colors.textTertiary} />

      <Text style={styles.label}>{t.eventSetup.location}</Text>
      <View style={{ position: 'relative' }}>
        <TextInput style={[styles.input, { paddingRight: 40 }]} value={location} onChangeText={setLocation}
          placeholder={t.eventSetup.locationPlaceholder} placeholderTextColor={colors.textTertiary} />
        <MapPin size={16} color={colors.textTertiary}
          style={{ position: 'absolute', right: 12, top: 14 }} weight="duotone" />
      </View>

      <Text style={styles.label}>{t.eventSetup.description}</Text>
      <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription}
        placeholder={t.eventSetup.descriptionPlaceholder} placeholderTextColor={colors.textTertiary}
        multiline numberOfLines={3} />

      {/* Datum & Tijd */}
      <Text style={styles.sectionHeader}>Datum & Tijd</Text>

      <Text style={styles.label}>{t.eventSetup.date} (DD-MM-JJJJ)</Text>
      <View style={{ position: 'relative' }}>
        <TextInput style={[styles.input, { paddingRight: 40 }]} value={eventDate} onChangeText={setEventDate}
          placeholder="15-03-2026" placeholderTextColor={colors.textTertiary}
          keyboardType="numbers-and-punctuation" maxLength={10} />
        <Calendar size={16} color={colors.textTertiary}
          style={{ position: 'absolute', right: 12, top: 14 }} weight="duotone" />
      </View>

      <View style={styles.rowInputs}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Starttijd</Text>
          <TextInput style={styles.input} value={startTime} onChangeText={setStartTime}
            placeholder="09:00" placeholderTextColor={colors.textTertiary}
            keyboardType="numbers-and-punctuation" maxLength={5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Eindtijd</Text>
          <TextInput style={styles.input} value={endTime} onChangeText={setEndTime}
            placeholder="17:00" placeholderTextColor={colors.textTertiary}
            keyboardType="numbers-and-punctuation" maxLength={5} />
        </View>
      </View>

      {/* Kanalen */}
      <Text style={styles.sectionHeader}>{t.eventSetup.channels}</Text>
      <View style={styles.chipRow}>
        {CHANNEL_KEYS.map((ch) => {
          const selected = selectedChannels.includes(ch.key);
          return (
            <TouchableOpacity key={ch.key}
              style={[styles.chip, selected && { backgroundColor: ch.lightColor + '20', borderColor: ch.lightColor }]}
              onPress={() => toggleChannel(ch.key)}>
              <Ionicons name={ch.icon as any} size={14} color={selected ? ch.lightColor : colors.textSecondary} />
              <Text style={[styles.chipText, selected && { color: ch.lightColor }]}>{ch.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Hashtags */}
      <Text style={styles.sectionHeader}>{t.eventSetup.hashtags}</Text>
      <TextInput style={styles.input} value={hashtags} onChangeText={setHashtags}
        placeholder="#TechSummit, #AIMarketing, #Inclufy" placeholderTextColor={colors.textTertiary} />

      {/* Event doelen */}
      <Text style={styles.sectionHeader}>Event doelen</Text>
      <View style={styles.chipRow}>
        {GOAL_PRESETS.map((goal) => {
          const selected = selectedGoals.includes(goal.key);
          return (
            <TouchableOpacity key={goal.key}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => toggleGoal(goal.key)}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{goal.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Default Tags */}
      <Text style={styles.sectionHeader}>{t.eventSetup.defaultTags}</Text>
      <View style={styles.chipRow}>
        {CAPTURE_TAG_PRESETS.map((tag) => {
          const selected = selectedTags.includes(tag);
          return (
            <TouchableOpacity key={tag}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => toggleTag(tag)}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{tag}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Brand Kit */}
      {brandKits.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>{t.eventSetup.brandKit}</Text>
          <View style={styles.chipRow}>
            {brandKits.map((kit: any) => {
              const selected = selectedBrandKit === kit.id;
              return (
                <TouchableOpacity key={kit.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setSelectedBrandKit(selected ? null : kit.id)}>
                  <View style={[styles.colorDot, { backgroundColor: kit.primary_color }]} />
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{kit.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Save */}
      <TouchableOpacity style={[styles.saveButton, isSaving && styles.buttonDisabled]}
        onPress={handleSave} disabled={isSaving}>
        {isSaving
          ? <ActivityIndicator color={colors.textOnPrimary} />
          : <Text style={styles.saveButtonText}>
              {isEditing ? t.eventSetup.updateEvent : t.eventSetup.createEvent}
            </Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}
