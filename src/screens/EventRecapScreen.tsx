// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: isEditing ? 'checkmark-outline' : 'create-outline'> | Ionicons name=<dynamic: opt.ionicon as any> | Ionicons name=<dynamic: t.ionicon as any>
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Share,
  TextInput,
  Image,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from '../hooks/useEvents';
import { useCaptures } from '../hooks/useCaptures';
import { useEventPosts } from '../hooks/useEventPosts';
import { aiService, type EventRecapResponse } from '../services/ai.service';
import { useBrandMemory, toBrandContext } from '../hooks/useBrandMemory';
import type { RootStackParamList } from '../types';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { cardShadow } from '../utils/shadows';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import AIConsentModal from '../components/AIConsentModal';
import { useAIConsent } from '../hooks/useAIConsent';

import { CheckCircle, FileText, Hand, Images, Megaphone, Newspaper, ShareNetwork, Sparkle, Star, WarningCircle, XCircle } from 'phosphor-react-native';
type Route = RouteProp<RootStackParamList, 'EventRecap'>;

type OutputFormat = 'blog' | 'newsletter' | 'linkedin_article';
type Language = 'nl' | 'en' | 'fr';
type Tone = 'compact' | 'standard' | 'detailed';

// ─── Constants ───────────────────────────────────────────────────────

const FORMAT_OPTIONS: Array<{ key: OutputFormat; label: string; ionicon: string }> = [
  { key: 'blog',             label: 'Blog',       ionicon: 'create-outline' },
  { key: 'newsletter',       label: 'Newsletter',  ionicon: 'mail-outline' },
  { key: 'linkedin_article', label: 'LinkedIn',    ionicon: 'briefcase-outline' },
];

const LANGUAGES: Array<{ key: Language; flag: string; label: string }> = [
  { key: 'nl', flag: '🇳🇱', label: 'NL' },
  { key: 'en', flag: '🇬🇧', label: 'EN' },
  { key: 'fr', flag: '🇫🇷', label: 'FR' },
];

const TONES: Array<{ key: Tone; label: string; ionicon: string }> = [
  { key: 'compact',  label: 'Compact',   ionicon: 'contract-outline' },
  { key: 'standard', label: 'Standaard', ionicon: 'reorder-three-outline' },
  { key: 'detailed', label: 'Uitgebreid', ionicon: 'expand-outline' },
];

// ─── Component ───────────────────────────────────────────────────────

export default function EventRecapScreen() {
  const route = useRoute<Route>();
  const { eventId } = route.params;
  const { colors } = useTheme();

  const { data: event }       = useEvent(eventId);
  const { data: capturesData } = useCaptures(eventId);
  const { data: postsData }   = useEventPosts(eventId);
  const { data: brandMemory } = useBrandMemory();
  const { hasConsent, showModal: showConsentModal, requestConsent, onAccept: onConsentAccept, onDecline: onConsentDecline } = useAIConsent();

  const styles = useThemedStyles((c) => ({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },

    // Header
    header: {
      marginBottom: spacing.xs,
    },
    headerRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
      marginBottom: 4,
    },
    headerIcon: {
      width: 44,
      height: 44,
      borderRadius: 13,
      backgroundColor: c.primary + '15',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    headerTitle: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      color: c.text,
      lineHeight: 24,
    },
    headerEvent: {
      fontSize: fontSize.sm,
      color: c.primary,
      fontWeight: fontWeight.medium,
    },
    headerStats: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
      marginTop: 4,
    },

    // Section
    section: {
      gap: spacing.xs,
    },
    sectionLabel: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.textSecondary,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.6,
    },
    sectionLabelCount: {
      color: c.primary,
      fontWeight: fontWeight.bold,
    },

    // Format selector
    formatSelector: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
    },
    formatOption: {
      flex: 1,
      alignItems: 'center' as const,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.surface,
      gap: 5,
    },
    formatOptionActive: {
      borderColor: c.primary,
      backgroundColor: c.primary + '10',
    },
    formatLabel: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.medium,
      color: c.textSecondary,
    },
    formatLabelActive: {
      color: c.primary,
      fontWeight: fontWeight.semibold,
    },

    // Language buttons
    langRow: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
    },
    langBtn: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 6,
      paddingVertical: 10,
      borderRadius: borderRadius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    langBtnActive: {
      borderColor: c.primary,
      backgroundColor: c.primary + '12',
    },
    langFlag: {
      fontSize: 18,
    },
    langLabel: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.textSecondary,
    },
    langLabelActive: {
      color: c.primary,
    },
    cachedDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.success,
    },

    // Tone buttons
    toneRow: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
    },
    toneBtn: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 5,
      paddingVertical: 9,
      borderRadius: borderRadius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    toneBtnActive: {
      borderColor: c.primary,
      backgroundColor: c.primary + '10',
    },
    toneLabel: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.textSecondary,
    },
    toneLabelActive: {
      color: c.primary,
    },

    // Photo picker
    photoScroll: {
      gap: spacing.sm,
      paddingVertical: 4,
    },
    photoThumb: {
      width: 72,
      height: 72,
      borderRadius: borderRadius.md,
      overflow: 'hidden' as const,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    photoThumbSelected: {
      borderColor: c.primary,
    },
    photoImg: {
      width: '100%',
      height: '100%',
    },
    photoCheckOverlay: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(109, 40, 217, 0.4)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },

    // Generate button
    generateBtn: {
      backgroundColor: c.primary,
      paddingVertical: 16,
      borderRadius: borderRadius.lg,
      alignItems: 'center' as const,
    },
    generateBtnDisabled: {
      opacity: 0.6,
    },
    generateBtnInner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    generateBtnText: {
      color: c.textOnPrimary,
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
    },

    // Error
    errorBox: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
      backgroundColor: c.error + '12',
      borderRadius: borderRadius.md,
      padding: spacing.sm,
    },
    errorText: {
      color: c.error,
      fontSize: fontSize.sm,
      flex: 1,
    },

    // Translating
    translatingRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
      justifyContent: 'center' as const,
      paddingVertical: spacing.sm,
    },
    translatingText: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
    },

    // Recap result
    recapResult: {
      gap: spacing.md,
      marginTop: spacing.sm,
    },

    // Recap toolbar
    recapToolbar: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
      backgroundColor: c.surface,
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    toolbarLangs: {
      flexDirection: 'row' as const,
      gap: 6,
      flex: 1,
    },
    toolbarLangBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: borderRadius.sm,
      borderWidth: 1.5,
      borderColor: 'transparent',
      backgroundColor: c.background,
    },
    toolbarLangBtnActive: {
      borderColor: c.primary,
      backgroundColor: c.primary + '12',
    },
    toolbarLangFlag: {
      fontSize: 16,
    },
    editToggleBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: borderRadius.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.background,
    },
    editToggleBtnActive: {
      backgroundColor: c.success,
      borderColor: c.success,
    },
    editToggleText: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.textSecondary,
    },
    editToggleTextActive: {
      color: '#fff',
    },
    cancelEditBtn: {
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    cancelEditText: {
      fontSize: fontSize.xs,
      color: c.error,
      fontWeight: fontWeight.medium,
    },

    // Recap content
    recapTitle: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      color: c.text,
      lineHeight: 28,
    },
    teaserBox: {
      backgroundColor: c.primary + '10',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderLeftWidth: 3,
      borderLeftColor: c.primary,
      gap: 6,
    },
    sectionTitleRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginBottom: 4,
    },
    teaserLabel: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.primary,
    },
    teaserText: {
      fontSize: fontSize.md,
      color: c.text,
      fontStyle: 'italic' as const,
      lineHeight: 22,
    },
    highlightsBox: {
      gap: spacing.sm,
    },
    sectionTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.text,
    },
    highlightItem: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
      paddingLeft: spacing.sm,
      alignItems: 'flex-start' as const,
    },
    highlightBulletDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: c.primary,
      marginTop: 7,
      flexShrink: 0,
    },
    highlightText: {
      flex: 1,
      fontSize: fontSize.md,
      color: c.text,
      lineHeight: 22,
    },
    contentBox: {
      backgroundColor: c.surface,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: c.borderLight,
      gap: spacing.xs,
    },
    recapContent: {
      fontSize: fontSize.md,
      color: c.text,
      lineHeight: 24,
      marginTop: spacing.xs,
    },

    // Edit inputs
    editTextInput: {
      fontSize: fontSize.md,
      color: c.text,
      lineHeight: 22,
      borderWidth: 1.5,
      borderColor: c.primary + '60',
      borderRadius: borderRadius.sm,
      padding: spacing.sm,
      backgroundColor: c.background,
      marginTop: 4,
    },
    editContentInput: {
      minHeight: 200,
      textAlignVertical: 'top' as const,
    },

    // CTA
    ctaBox: {
      backgroundColor: c.accent + '12',
      padding: spacing.md,
      borderRadius: borderRadius.md,
      gap: 6,
    },
    ctaLabel: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.accent,
    },
    ctaText: {
      fontSize: fontSize.md,
      color: c.text,
      lineHeight: 22,
    },

    // Selected photos
    selectedPhotosBox: {
      gap: spacing.sm,
    },
    selectedPhotoScroll: {
      flexDirection: 'row' as const,
    },
    selectedPhotoImg: {
      width: 80,
      height: 80,
      borderRadius: borderRadius.md,
      marginRight: spacing.sm,
    },
    removePhotoBtn: {
      position: 'absolute' as const,
      top: -6,
      right: spacing.sm - 6,
      backgroundColor: '#fff',
      borderRadius: 10,
    },

    // Share
    shareBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: spacing.sm,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      borderWidth: 1.5,
      borderColor: c.primary,
      backgroundColor: c.primary + '08',
    },
    shareBtnText: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.primary,
    },
  }));

  // ── Generation settings
  const [selectedFormat, setSelectedFormat] = useState<OutputFormat>('blog');
  const [language, setLanguage]             = useState<Language>('nl');
  const [tone, setTone]                     = useState<Tone>('standard');

  // ── Photo picker (from event captures)
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);

  // ── Results cache: one recap per language
  const [recaps, setRecaps] = useState<Partial<Record<Language, EventRecapResponse>>>({});
  const recap = recaps[language] ?? null;

  // ── Loading / error states
  const [loading, setLoading]       = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError]           = useState('');

  // ── Edit mode
  const [isEditing, setIsEditing]     = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editedTeaser, setEditedTeaser]   = useState('');

  // ─── Photo captures (only photo type with thumbnail)
  const captures = Array.isArray(capturesData) ? capturesData : [];
  const photosAvailable = captures.filter(
    (c: any) => c.media_type === 'photo' && c.thumbnail_url,
  );

  const togglePhoto = (url: string) => {
    setSelectedPhotos((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    );
  };

  // ─── Generate recap ──────────────────────────────────────────────
  const generateRecap = async (overrideLang?: Language, overrideTone?: Tone) => {
    if (!hasConsent) {
      requestConsent(() => { generateRecap(overrideLang, overrideTone); });
      return;
    }
    if (!event) return;

    const genLang = overrideLang ?? language;
    const genTone = overrideTone ?? tone;

    setLoading(true);
    setError('');
    setIsEditing(false);

    try {
      if (brandMemory) {
        const bCtx = toBrandContext(brandMemory!);
        if (bCtx) aiService.setBrandContext(bCtx);
      }

      const posts = (postsData || []).map((p: any) => ({
        channel: p.channel,
        text_content: p.text_content,
        hashtags: p.hashtags || [],
        status: p.status,
      }));

      const publishedCount = posts.filter((p: any) => p.status === 'published').length;

      const result = await aiService.generateEventRecap({
        event_name:     event.name,
        event_date:     event.event_date,
        location:       event.location || '',
        posts,
        captures_count: captures.length,
        published_count: publishedCount,
        output_format:  selectedFormat,
        language:       genLang,
        tone:           genTone,
      });

      setRecaps((prev) => ({ ...prev, [genLang]: result }));
      // If switching language, also update the active language
      if (overrideLang) setLanguage(overrideLang);
      if (overrideTone) setTone(overrideTone);
    } catch (e) {
      setError('Kan recap niet genereren. Controleer je verbinding en probeer opnieuw.');
      console.error('Recap error:', e);
    } finally {
      setLoading(false);
    }
  };

  // ─── Switch language (translate on demand) ───────────────────────
  const switchLanguage = async (lang: Language) => {
    if (lang === language) return;
    if (recaps[lang]) {
      // Already cached
      setLanguage(lang);
      setIsEditing(false);
      return;
    }
    // Need to generate in the new language
    if (!recaps[language] && !loading) {
      // Nothing generated yet — just switch preference
      setLanguage(lang);
      return;
    }
    // Translate: regenerate in target language with same format/tone
    setTranslating(true);
    setIsEditing(false);
    await generateRecap(lang, tone);
    setTranslating(false);
  };

  // ─── Change tone (re-generate) ───────────────────────────────────
  const changeTone = async (newTone: Tone) => {
    if (newTone === tone) return;
    setTone(newTone);
    if (recap) {
      // Re-generate with new tone
      await generateRecap(language, newTone);
    }
  };

  // ─── Edit mode ───────────────────────────────────────────────────
  const startEditing = () => {
    if (!recap) return;
    setEditedContent(recap.content);
    setEditedTeaser(recap.social_teaser);
    setIsEditing(true);
  };

  const saveEdits = () => {
    if (!recap) return;
    setRecaps((prev) => ({
      ...prev,
      [language]: {
        ...recap,
        content:      editedContent,
        social_teaser: editedTeaser,
      },
    }));
    setIsEditing(false);
  };

  const cancelEdits = () => {
    setIsEditing(false);
  };

  // ─── Share ───────────────────────────────────────────────────────
  const handleShare = async () => {
    if (!recap) return;
    const content = isEditing ? editedContent : recap.content;
    const teaser  = isEditing ? editedTeaser  : recap.social_teaser;
    try {
      await Share.share({
        title:   recap.title,
        message: `${recap.title}\n\n${teaser}\n\n${content}`,
      });
    } catch {
      // Share cancelled
    }
  };

  // ─── Helpers ─────────────────────────────────────────────────────
  const displayContent = isEditing ? editedContent : recap?.content ?? '';
  const displayTeaser  = isEditing ? editedTeaser  : recap?.social_teaser ?? '';

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <Newspaper size={22} color={colors.primary} weight="duotone" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Event Recap</Text>
            <Text style={styles.headerEvent}>{event?.name}</Text>
          </View>
        </View>
        <Text style={styles.headerStats}>
          {captures.length} captures • {(postsData || []).length} posts
        </Text>
      </View>

      {/* ── Format selector ────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Type</Text>
        <View style={styles.formatSelector}>
          {FORMAT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.formatOption, selectedFormat === opt.key && styles.formatOptionActive]}
              onPress={() => setSelectedFormat(opt.key)}
            >
              <Ionicons
                name={opt.ionicon as any}
                size={20}
                color={selectedFormat === opt.key ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.formatLabel, selectedFormat === opt.key && styles.formatLabelActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Language selector ──────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Taal</Text>
        <View style={styles.langRow}>
          {LANGUAGES.map((lang) => {
            const isActive   = language === lang.key;
            const isCached   = !!recaps[lang.key];
            return (
              <TouchableOpacity
                key={lang.key}
                style={[styles.langBtn, isActive && styles.langBtnActive]}
                onPress={() => switchLanguage(lang.key)}
                disabled={translating || loading}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <Text style={[styles.langLabel, isActive && styles.langLabelActive]}>
                  {lang.label}
                </Text>
                {isCached && !isActive && (
                  <View style={styles.cachedDot} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Tone selector ──────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Toon</Text>
        <View style={styles.toneRow}>
          {TONES.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.toneBtn, tone === t.key && styles.toneBtnActive]}
              onPress={() => changeTone(t.key)}
              disabled={loading}
            >
              <Ionicons
                name={t.ionicon as any}
                size={16}
                color={tone === t.key ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.toneLabel, tone === t.key && styles.toneLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Photo picker ───────────────────────────────────────── */}
      {photosAvailable.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            Foto's toevoegen
            {selectedPhotos.length > 0 && (
              <Text style={styles.sectionLabelCount}> ({selectedPhotos.length} geselecteerd)</Text>
            )}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoScroll}
          >
            {photosAvailable.map((cap: any) => {
              const isSelected = selectedPhotos.includes(cap.thumbnail_url);
              return (
                <TouchableOpacity
                  key={cap.id}
                  style={[styles.photoThumb, isSelected && styles.photoThumbSelected]}
                  onPress={() => togglePhoto(cap.thumbnail_url)}
                >
                  <Image source={{ uri: cap.thumbnail_url }} style={styles.photoImg} />
                  {isSelected && (
                    <View style={styles.photoCheckOverlay}>
                      <CheckCircle size={24} color="#fff" weight="fill" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Generate button ────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.generateBtn, (loading || translating) && styles.generateBtnDisabled]}
        onPress={() => generateRecap()}
        disabled={loading || translating}
      >
        {loading ? (
          <ActivityIndicator color={colors.textOnPrimary} />
        ) : (
          <View style={styles.generateBtnInner}>
            <Sparkle size={18} color={colors.textOnPrimary} weight="regular" />
            <Text style={styles.generateBtnText}>
              {recap ? 'Opnieuw genereren' : `Genereer ${FORMAT_OPTIONS.find((f) => f.key === selectedFormat)?.label}`}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Error */}
      {error ? (
        <View style={styles.errorBox}>
          <WarningCircle size={18} color={colors.error} weight="regular" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Translating indicator */}
      {translating && (
        <View style={styles.translatingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.translatingText}>Vertalen...</Text>
        </View>
      )}

      {/* ── Recap result ───────────────────────────────────────── */}
      {recap ? (
        <View style={styles.recapResult}>

          {/* Language + Tone quick-action bar */}
          <View style={styles.recapToolbar}>
            {/* Language tabs */}
            <View style={styles.toolbarLangs}>
              {LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.key}
                  style={[styles.toolbarLangBtn, language === lang.key && styles.toolbarLangBtnActive]}
                  onPress={() => switchLanguage(lang.key)}
                  disabled={translating || loading}
                >
                  <Text style={styles.toolbarLangFlag}>{lang.flag}</Text>
                  {!!recaps[lang.key] && language !== lang.key && (
                    <View style={styles.cachedDot} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Edit toggle */}
            <TouchableOpacity
              style={[styles.editToggleBtn, isEditing && styles.editToggleBtnActive]}
              onPress={isEditing ? saveEdits : startEditing}
            >
              <Ionicons
                name={isEditing ? 'checkmark-outline' : 'create-outline'}
                size={15}
                color={isEditing ? '#fff' : colors.textSecondary}
              />
              <Text style={[styles.editToggleText, isEditing && styles.editToggleTextActive]}>
                {isEditing ? 'Opslaan' : 'Bewerken'}
              </Text>
            </TouchableOpacity>

            {isEditing && (
              <TouchableOpacity style={styles.cancelEditBtn} onPress={cancelEdits}>
                <Text style={styles.cancelEditText}>Annuleren</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Title */}
          <Text style={styles.recapTitle}>{recap.title}</Text>

          {/* Social teaser */}
          <View style={[styles.teaserBox, cardShadow]}>
            <View style={styles.sectionTitleRow}>
              <Megaphone size={15} color={colors.primary} weight="duotone" />
              <Text style={styles.teaserLabel}>Social Teaser</Text>
            </View>
            {isEditing ? (
              <TextInput
                style={styles.editTextInput}
                value={editedTeaser}
                onChangeText={setEditedTeaser}
                multiline
                placeholder="Social teaser..."
                placeholderTextColor={colors.textTertiary}
              />
            ) : (
              <Text style={styles.teaserText}>{displayTeaser}</Text>
            )}
          </View>

          {/* Key highlights */}
          {(recap.key_highlights?.length ?? 0) > 0 && (
            <View style={styles.highlightsBox}>
              <View style={styles.sectionTitleRow}>
                <Star size={18} color={colors.primary} weight="duotone" />
                <Text style={styles.sectionTitle}>Key Highlights</Text>
              </View>
              {recap.key_highlights.map((h, i) => (
                <View key={i} style={styles.highlightItem}>
                  <View style={styles.highlightBulletDot} />
                  <Text style={styles.highlightText}>{h}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Full content */}
          <View style={styles.contentBox}>
            <View style={styles.sectionTitleRow}>
              <FileText size={18} color={colors.textSecondary} weight="duotone" />
              <Text style={styles.sectionTitle}>Volledige Tekst</Text>
            </View>
            {isEditing ? (
              <TextInput
                style={[styles.editTextInput, styles.editContentInput]}
                value={editedContent}
                onChangeText={setEditedContent}
                multiline
                placeholder="Inhoud bewerken..."
                placeholderTextColor={colors.textTertiary}
              />
            ) : (
              <Text style={styles.recapContent}>{displayContent}</Text>
            )}
          </View>

          {/* CTA */}
          {recap.suggested_cta ? (
            <View style={styles.ctaBox}>
              <View style={styles.sectionTitleRow}>
                <Hand size={15} color={colors.accent} weight="duotone" />
                <Text style={styles.ctaLabel}>Suggested CTA</Text>
              </View>
              <Text style={styles.ctaText}>{recap.suggested_cta}</Text>
            </View>
          ) : null}

          {/* Selected photos preview */}
          {selectedPhotos.length > 0 && (
            <View style={styles.selectedPhotosBox}>
              <View style={styles.sectionTitleRow}>
                <Images size={16} color={colors.textSecondary} weight="duotone" />
                <Text style={styles.sectionTitle}>Bijgevoegde foto's ({selectedPhotos.length})</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectedPhotoScroll}>
                {selectedPhotos.map((url) => (
                  <TouchableOpacity key={url} onPress={() => togglePhoto(url)}>
                    <Image source={{ uri: url }} style={styles.selectedPhotoImg} />
                    <View style={styles.removePhotoBtn}>
                      <XCircle size={18} color={colors.error} weight="fill" />
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Share */}
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <ShareNetwork size={18} color={colors.primary} weight="duotone" />
            <Text style={styles.shareBtnText}>Deel Recap</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={{ height: 40 }} />
      <AIConsentModal visible={showConsentModal} onAccept={onConsentAccept} onDecline={onConsentDecline} />
    </ScrollView>
  );
}
