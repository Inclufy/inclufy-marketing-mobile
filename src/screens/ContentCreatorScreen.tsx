// TODO: migrate to Phosphor — unmapped icons: MaterialCommunityIcons name=<dynamic: (currentPlatform?.icon || 'card-text') as any> | MaterialCommunityIcons name=<dynamic: ct.icon as any> | MaterialCommunityIcons name=<dynamic: editMode ? 'check' : 'pencil'> | MaterialCommunityIcons name=<dynamic: isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'> | MaterialCommunityIcons name=<dynamic: opt.value ? 'check-circle' : 'circle-outline'> | MaterialCommunityIcons name=<dynamic: p.icon as any> | MaterialCommunityIcons name=<dynamic: s.icon as any>
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
  Animated,
  Linking,
  Platform as RNPlatform,
  Dimensions,
  Image,
  KeyboardAvoidingView,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import api from '../services/api';
import { supabase } from '../services/supabase';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { subtleShadow } from '../utils/shadows';
import { useTranslation } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../types';
import AIConsentModal from '../components/AIConsentModal';
import { useAIConsent } from '../hooks/useAIConsent';
import { useConnectedChannels } from '../hooks/useConnectedChannels';

import { ArrowLeft, ArrowRight, ArrowsClockwise, ArrowsOut, Camera, CaretLeft, CaretRight, Check, ClipboardText, Copy, FloppyDisk, ImageSquare, Images, MagnifyingGlass, PaperPlaneTilt, ShareNetwork, Sparkle, X, XCircle } from 'phosphor-react-native';
const { width: SCREEN_W } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────────────────
type ContentType = 'social' | 'caption' | 'blog' | 'email' | 'ad';
type PlatformKey = 'linkedin' | 'instagram' | 'x' | 'facebook' | 'tiktok' | 'pinterest' | 'threads' | 'snapchat' | 'whatsapp';
type Tone = 'professional' | 'casual' | 'community' | 'inspirerend' | 'urgent' | 'storytelling';
type ContentLength = 'short' | 'medium' | 'long';
type WizardStep = 1 | 2 | 3 | 4;

// ─── Data ────────────────────────────────────────────────────────────
const CONTENT_TYPES: Array<{ key: ContentType; label: string; icon: string; emoji: string; desc: string }> = [
  { key: 'social', label: 'Social Post', icon: 'card-text', emoji: '📱', desc: 'Post voor social media' },
  { key: 'caption', label: 'Caption', icon: 'format-quote-close', emoji: '✍️', desc: 'Afbeelding caption' },
  { key: 'blog', label: 'Blog', icon: 'notebook-edit', emoji: '📝', desc: 'Blog artikel' },
  { key: 'email', label: 'E-mail', icon: 'email-fast', emoji: '📧', desc: 'Marketing e-mail' },
  { key: 'ad', label: 'Advertentie', icon: 'bullhorn', emoji: '📣', desc: 'Ad copy' },
];

// All 9 platforms with their per-channel constraints for AI generation.
// Filtered at render time via useConnectedChannels — only the user's
// actually-connected platforms appear in selector UIs, but all 9 stay
// in this array so any post can be regenerated for any platform later.
const PLATFORMS: Array<{ key: PlatformKey; label: string; icon: string; color: string; maxChars: number; aspectRatio: string }> = [
  { key: 'linkedin',  label: 'LinkedIn',  icon: 'linkedin',     color: '#0A66C2', maxChars: 3000,  aspectRatio: '1.91:1' },
  { key: 'instagram', label: 'Instagram', icon: 'instagram',    color: '#E1306C', maxChars: 2200,  aspectRatio: '1:1'    },
  { key: 'facebook',  label: 'Facebook',  icon: 'facebook',     color: '#1877F2', maxChars: 63206, aspectRatio: '1.91:1' },
  { key: 'tiktok',    label: 'TikTok',    icon: 'music-note',   color: '#000000', maxChars: 2200,  aspectRatio: '9:16'   },
  { key: 'pinterest', label: 'Pinterest', icon: 'pinterest',    color: '#E60023', maxChars: 500,   aspectRatio: '2:3'    },
  { key: 'threads',   label: 'Threads',   icon: 'at',           color: '#000000', maxChars: 500,   aspectRatio: '1:1'    },
  { key: 'snapchat',  label: 'Snapchat',  icon: 'snapchat',     color: '#FFFC00', maxChars: 250,   aspectRatio: '9:16'   },
  { key: 'whatsapp',  label: 'WhatsApp',  icon: 'whatsapp',     color: '#25D366', maxChars: 1024,  aspectRatio: '1:1'    },
  { key: 'x',         label: 'X',         icon: 'twitter',      color: '#1DA1F2', maxChars: 280,   aspectRatio: '16:9'   },
];

const TONES: Array<{ key: Tone; label: string; emoji: string }> = [
  { key: 'professional', label: 'Professioneel', emoji: '👔' },
  { key: 'casual', label: 'Casual', emoji: '😎' },
  { key: 'community', label: 'Community', emoji: '🤝' },
  { key: 'inspirerend', label: 'Inspirerend', emoji: '✨' },
  { key: 'urgent', label: 'Urgent', emoji: '🔥' },
  { key: 'storytelling', label: 'Storytelling', emoji: '📖' },
];

const LENGTHS: Array<{ key: ContentLength; label: string; desc: string }> = [
  { key: 'short', label: 'Kort', desc: '~50 woorden' },
  { key: 'medium', label: 'Medium', desc: '~150 woorden' },
  { key: 'long', label: 'Lang', desc: '~300 woorden' },
];

const QUICK_PROMPTS = [
  'Nieuw product lancering',
  'Event uitnodiging',
  'Klant testimonial',
  'Team spotlight',
  'Thought leadership',
  'Case study',
];

const STEP_LABELS = [
  { num: 1, label: 'Configureer', icon: 'tune-variant' },
  { num: 2, label: 'Bewerken', icon: 'pencil-ruler' },
  { num: 3, label: 'Media', icon: 'image-plus' },
  { num: 4, label: 'Publiceren', icon: 'send-check' },
];

// ─── Component ───────────────────────────────────────────────────────
export default function ContentCreatorScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const route = useRoute<RouteProp<RootStackParamList, 'ContentCreator'>>();
  const scrollRef = useRef<ScrollView>(null);
  const { hasConsent, showModal: showConsentModal, requestConsent, onAccept: onConsentAccept, onDecline: onConsentDecline } = useAIConsent();

  // Receive image preview from PostReview / LiveCapture
  const passedImageUri = (route.params as any)?.imageUri as string | undefined;
  const passedImageUrls = (route.params as any)?.imageUrls as string[] | undefined;

  // Wizard step
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 - Config
  const [contentType, setContentType] = useState<ContentType>('social');
  const [platform, setPlatform] = useState<PlatformKey>('linkedin');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<Tone>('professional');
  const [contentLength, setContentLength] = useState<ContentLength>('medium');
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [includeEmoji, setIncludeEmoji] = useState(true);
  const [includeCTA, setIncludeCTA] = useState(true);

  // Step 2 - Edit
  const [generatedContent, setGeneratedContent] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [contentHistory, setContentHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Step 3 - Media
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

  // Seed selectedImages from navigation params (once)
  useEffect(() => {
    const incoming = passedImageUrls ?? (passedImageUri ? [passedImageUri] : []);
    if (incoming.length > 0) {
      setSelectedImages((prev) => prev.length === 0 ? incoming : prev);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [showAiImageSearch, setShowAiImageSearch] = useState(false);
  const [aiImageQuery, setAiImageQuery] = useState('');
  const [aiImageResults, setAiImageResults] = useState<Array<{ id: string; url: string; thumb: string; author: string; source: string }>>([]);
  const [aiImageLoading, setAiImageLoading] = useState(false);

  // Step 4 - Publish
  const [publishPlatforms, setPublishPlatforms] = useState<PlatformKey[]>([platform]);
  const [scheduleType, setScheduleType] = useState<'now' | 'later'>('now');
  const [publishing, setPublishing] = useState(false);
  const [savedAsDraft, setSavedAsDraft] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ─── Helpers ─────────────────────────────────────────────────────
  const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
  const charCount = (text: string) => text.length;
  const extractHashtags = (text: string): string[] => {
    const matches = text.match(/#\w+/g);
    return matches ? [...new Set(matches)] : [];
  };

  const displayContent = editMode ? editedContent : generatedContent;
  const currentPlatform = PLATFORMS.find(p => p.key === platform);

  // Filter PLATFORMS to only those the user has connected (OAuth) or can manually
  // share to. Falls back to full list if user has no connections yet (so they can
  // still preview / generate content even before connecting accounts).
  const { allChannels: connectedChannels } = useConnectedChannels();
  const visiblePlatforms = connectedChannels.length > 0
    ? PLATFORMS.filter(p => connectedChannels.includes(p.key as any))
    : PLATFORMS;

  const goToStep = (s: WizardStep) => {
    setStep(s);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  // ─── Generate ────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!hasConsent) {
      requestConsent(() => { handleGenerate(); });
      return;
    }
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      Alert.alert('Onderwerp vereist', 'Voer een onderwerp in om content te genereren.');
      return;
    }

    setLoading(true);
    setGeneratedContent('');
    setGeneratedHashtags([]);
    setEditMode(false);

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.95, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    ).start();

    try {
      let result = '';
      const payload = {
        action: contentType === 'social' ? 'social-content' : 'content-write',
        topic: trimmedTopic,
        platform,
        tone,
        type: contentType,
        length: contentLength,
        includeHashtags,
        includeEmoji,
        includeCTA,
      };

      try {
        const endpoint = contentType === 'social' ? '/content/social' : '/content/write';
        const { data } = await api.post(endpoint, payload);
        result = data?.content ?? data?.text ?? data?.post ?? '';
      } catch {}

      if (!result) {
        const { data: fnData, error: fnError } = await supabase.functions.invoke(
          'event-studio-ai',
          { body: payload },
        );
        if (fnError) throw fnError;
        const r = fnData?.result || fnData;
        result = r?.content ?? r?.text ?? 'Geen content ontvangen.';
      }

      setGeneratedContent(result);
      setEditedContent(result);
      setGeneratedHashtags(extractHashtags(result));
      setContentHistory(prev => [...prev, result]);
      setHistoryIndex(contentHistory.length);

      // Auto-navigate to step 2
      setTimeout(() => goToStep(2), 400);
    } catch {
      Alert.alert('Fout', 'Content genereren mislukt. Probeer opnieuw.');
    } finally {
      setLoading(false);
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  };

  // ─── Media handlers ──────────────────────────────────────────────
  const pickImage = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera toegang', 'Geef toegang tot de camera in je instellingen.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          quality: 0.8,
        });
        if (!result.canceled && result.assets?.[0]) {
          setSelectedImages(prev => [...prev, result.assets[0].uri]);
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Galerij toegang', 'Geef toegang tot je foto\'s in je instellingen.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          allowsMultipleSelection: true,
          selectionLimit: 4,
          quality: 0.8,
        });
        if (!result.canceled && result.assets) {
          setSelectedImages(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 4));
        }
      }
    } catch (err: any) {
      Alert.alert('Fout', err?.message || 'Afbeelding selectie mislukt.');
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  // ─── AI Image Search (Pexels — free, verified working) ─────────────
  const searchAiImages = async (query?: string) => {
    const q = (query || aiImageQuery).trim();
    if (!q) return;
    setAiImageLoading(true);
    setAiImageResults([]);
    try {
      const PEXELS_KEY = 'OZ3RwgGzshIZJdyEHY6QjUDl05wPImtlO6hEcYuBx9zJNaetpJK6n0A4';
      const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=12&orientation=landscape`;
      console.log('[AI Image] Searching Pexels:', q);
      const res = await fetch(pexelsUrl, {
        headers: { Authorization: PEXELS_KEY },
      });
      console.log('[AI Image] Pexels status:', res.status);

      if (res.ok) {
        const data = await res.json();
        console.log('[AI Image] Pexels total:', data.total_results);
        const results = (data.photos || []).map((img: any) => ({
          id: String(img.id),
          url: img.src?.large || img.src?.medium || img.src?.original,
          thumb: img.src?.tiny || img.src?.small || img.src?.medium,
          author: img.photographer || 'Pexels',
          source: 'Pexels',
        }));
        setAiImageResults(results);

        if (results.length === 0) {
          // Try broader English search
          const fbRes = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(q + ' business professional')}&per_page=12`,
            { headers: { Authorization: PEXELS_KEY } }
          );
          if (fbRes.ok) {
            const fbData = await fbRes.json();
            const fbResults = (fbData.photos || []).map((img: any) => ({
              id: String(img.id),
              url: img.src?.large || img.src?.medium,
              thumb: img.src?.tiny || img.src?.small,
              author: img.photographer || 'Pexels',
              source: 'Pexels',
            }));
            setAiImageResults(fbResults);
          }
        }
      } else {
        const errText = await res.text();
        console.warn('[AI Image] Pexels error:', res.status, errText);
        Alert.alert('Zoeken mislukt', 'API fout. Probeer het later opnieuw.');
      }
    } catch (err: any) {
      console.warn('[AI Image] Search failed:', err?.message);
      Alert.alert('Zoeken mislukt', `${err?.message || 'Netwerk probleem'}. Check je internetverbinding.`);
    } finally {
      setAiImageLoading(false);
    }
  };

  const selectAiImage = (url: string) => {
    if (selectedImages.length >= 4) {
      Alert.alert('Maximum bereikt', 'Je kunt maximaal 4 afbeeldingen toevoegen.');
      return;
    }
    setSelectedImages(prev => [...prev, url]);
  };

  // ─── Publish handlers ────────────────────────────────────────────
  const togglePublishPlatform = (key: PlatformKey) => {
    setPublishPlatforms(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
    );
  };

  const handlePublish = async () => {
    const text = editMode ? editedContent : generatedContent;
    if (!text) return;

    setPublishing(true);
    try {
      // Save to Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('content_posts').insert({
          user_id: user.id,
          content_type: contentType,
          platform: publishPlatforms.join(','),
          content: text,
          hashtags: generatedHashtags,
          tone,
          status: scheduleType === 'now' ? 'published' : 'scheduled',
          media_urls: selectedImages,
          created_at: new Date().toISOString(),
        }).then(() => {});
      }

      // Open native share or platform-specific
      if (publishPlatforms.length === 1) {
        const p = publishPlatforms[0];
        const encodedText = encodeURIComponent(text);
        const urls: Record<string, string> = {
          linkedin: `https://www.linkedin.com/feed/?shareActive=true&text=${encodedText}`,
          facebook: `https://www.facebook.com/sharer/sharer.php?quote=${encodedText}`,
          x: `https://twitter.com/intent/tweet?text=${encodedText}`,
        };
        if (urls[p]) {
          await Linking.openURL(urls[p]);
        } else {
          await Share.share({ message: text });
        }
      } else {
        await Share.share({ message: text });
      }

      Alert.alert('🎉 Gepubliceerd!', 'Je content is gedeeld.');
    } catch (err: any) {
      // Fallback to share sheet
      try {
        await Share.share({ message: text });
      } catch {}
    } finally {
      setPublishing(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('content_posts').insert({
          user_id: user.id,
          content_type: contentType,
          platform: platform,
          content: editMode ? editedContent : generatedContent,
          hashtags: generatedHashtags,
          tone,
          status: 'draft',
          media_urls: selectedImages,
          created_at: new Date().toISOString(),
        });
      }
      setSavedAsDraft(true);
      Alert.alert('💾 Opgeslagen', 'Content opgeslagen als concept.');
    } catch {
      Alert.alert('Fout', 'Opslaan mislukt.');
    }
  };

  const handleCopy = async () => {
    const text = editMode ? editedContent : generatedContent;
    if (!text) return;
    await Clipboard.setStringAsync(text);
    Alert.alert('Gekopieerd', 'Content gekopieerd naar klembord.');
  };

  const handleShare = async () => {
    const text = editMode ? editedContent : generatedContent;
    if (!text) return;
    try { await Share.share({ message: text }); } catch {}
  };

  const navigateHistory = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' ? historyIndex - 1 : historyIndex + 1;
    if (newIndex < 0 || newIndex >= contentHistory.length) return;
    setHistoryIndex(newIndex);
    setGeneratedContent(contentHistory[newIndex]);
    setEditedContent(contentHistory[newIndex]);
    setGeneratedHashtags(extractHashtags(contentHistory[newIndex]));
  };

  // ─── Styles ────────────────────────────────────────────────────────
  const card = {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...subtleShadow,
  };

  // ─── Step Progress Bar ─────────────────────────────────────────────
  const renderProgressBar = () => (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      backgroundColor: colors.surface,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    }}>
      {STEP_LABELS.map((s, i) => {
        const isActive = step === s.num;
        const isDone = step > s.num;
        const isLast = i === STEP_LABELS.length - 1;
        return (
          <React.Fragment key={s.num}>
            <TouchableOpacity
              style={{ alignItems: 'center', flex: 1 }}
              onPress={() => {
                // Allow going back to completed steps, or forward only if content is generated
                if (s.num <= step || (s.num === 2 && generatedContent)) goToStep(s.num as WizardStep);
              }}
              disabled={s.num > step && !generatedContent}
            >
              <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: isDone ? colors.success : isActive ? colors.primary : colors.borderLight,
                justifyContent: 'center', alignItems: 'center',
                marginBottom: 4,
              }}>
                {isDone ? (
                  <Check size={16} color="#fff" weight="bold" />
                ) : (
                  <MaterialCommunityIcons name={s.icon as any} size={16} color={isActive ? '#fff' : colors.textTertiary} />
                )}
              </View>
              <Text style={{
                fontSize: 10,
                fontWeight: isActive ? fontWeight.bold : fontWeight.medium,
                color: isActive ? colors.primary : isDone ? colors.success : colors.textTertiary,
              }}>
                {s.label}
              </Text>
            </TouchableOpacity>
            {!isLast && (
              <View style={{
                height: 2, flex: 0.5, marginBottom: 16,
                backgroundColor: isDone ? colors.success : colors.borderLight,
                borderRadius: 1,
              }} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );

  // ─── STEP 1: Configure ─────────────────────────────────────────────
  const renderStep1 = () => (
    <>
      {/* Content Type */}
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs }}>
        Type content
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xs }}>
        {CONTENT_TYPES.map(ct => {
          const isActive = contentType === ct.key;
          return (
            <TouchableOpacity
              key={ct.key}
              style={{
                width: 100, paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
                backgroundColor: colors.surface, borderRadius: borderRadius.lg,
                borderWidth: 1.5, borderColor: isActive ? colors.primary : colors.border,
                alignItems: 'center', gap: 6,
                ...(isActive ? { backgroundColor: colors.primary + '0A' } : {}),
                ...subtleShadow,
              }}
              onPress={() => setContentType(ct.key)}
            >
              <View style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: isActive ? colors.primary + '15' : colors.borderLight,
                justifyContent: 'center', alignItems: 'center',
              }}>
                <MaterialCommunityIcons name={ct.icon as any} size={20} color={isActive ? colors.primary : colors.textSecondary} />
              </View>
              <Text style={{ fontSize: 11, fontWeight: isActive ? fontWeight.bold : fontWeight.medium, color: isActive ? colors.primary : colors.textSecondary, textAlign: 'center' }}>
                {ct.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Platform */}
      {(contentType === 'social' || contentType === 'caption' || contentType === 'ad') && (
        <>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.xs }}>
            Platform
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {visiblePlatforms.map(p => {
              const isActive = platform === p.key;
              return (
                <TouchableOpacity
                  key={p.key}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
                    borderRadius: borderRadius.md, borderWidth: 1.5,
                    borderColor: isActive ? p.color : colors.border,
                    backgroundColor: isActive ? p.color + '12' : colors.surface,
                    ...subtleShadow,
                  }}
                  onPress={() => setPlatform(p.key)}
                >
                  <MaterialCommunityIcons name={p.icon as any} size={18} color={isActive ? p.color : colors.textSecondary} />
                  <Text style={{ fontSize: fontSize.sm, fontWeight: isActive ? fontWeight.bold : fontWeight.medium, color: isActive ? p.color : colors.textSecondary }}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* Quick Prompts */}
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.xs }}>
        Snelstart
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {QUICK_PROMPTS.map(prompt => (
          <TouchableOpacity
            key={prompt}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: borderRadius.full, backgroundColor: colors.borderLight }}
            onPress={() => setTopic(prompt)}
          >
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>{prompt}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Topic Input */}
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.xs }}>
        Onderwerp
      </Text>
      <View style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <TextInput
          style={{ padding: spacing.md, fontSize: fontSize.md, color: colors.text, minHeight: 110, textAlignVertical: 'top' }}
          value={topic}
          onChangeText={setTopic}
          placeholder="Beschrijf waar je content over wilt..."
          placeholderTextColor={colors.textTertiary}
          multiline
          numberOfLines={4}
          maxLength={1000}
        />
        <View style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.borderLight,
        }}>
          <Text style={{ fontSize: 10, color: colors.textTertiary }}>{topic.length}/1000 tekens</Text>
          {topic.length > 0 && (
            <TouchableOpacity onPress={() => setTopic('')}>
              <XCircle size={16} color={colors.textTertiary} weight="fill" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tone */}
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.xs }}>
        Toon
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {TONES.map(tn => {
          const isActive = tone === tn.key;
          return (
            <TouchableOpacity
              key={tn.key}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
                borderRadius: borderRadius.full, borderWidth: 1.5,
                borderColor: isActive ? colors.primary : colors.border,
                backgroundColor: isActive ? colors.primary + '12' : colors.surface,
              }}
              onPress={() => setTone(tn.key)}
            >
              <Text style={{ fontSize: 14 }}>{tn.emoji}</Text>
              <Text style={{ fontSize: fontSize.sm, fontWeight: isActive ? fontWeight.semibold : fontWeight.medium, color: isActive ? colors.primary : colors.textSecondary }}>
                {tn.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Length */}
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.xs }}>
        Lengte
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {LENGTHS.map(l => {
          const isActive = contentLength === l.key;
          return (
            <TouchableOpacity
              key={l.key}
              style={{
                flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
                borderRadius: borderRadius.md, borderWidth: 1.5,
                borderColor: isActive ? colors.primary : colors.border,
                backgroundColor: isActive ? colors.primary + '0A' : colors.surface,
              }}
              onPress={() => setContentLength(l.key)}
            >
              <Text style={{ fontSize: fontSize.sm, fontWeight: isActive ? fontWeight.bold : fontWeight.medium, color: isActive ? colors.primary : colors.textSecondary }}>
                {l.label}
              </Text>
              <Text style={{ fontSize: 9, color: colors.textTertiary, marginTop: 1 }}>{l.desc}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Options */}
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.xs }}>
        Opties
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {[
          { key: 'hashtags', label: '#Hashtags', value: includeHashtags, toggle: () => setIncludeHashtags(!includeHashtags) },
          { key: 'emoji', label: 'Emoji', value: includeEmoji, toggle: () => setIncludeEmoji(!includeEmoji) },
          { key: 'cta', label: 'Call-to-Action', value: includeCTA, toggle: () => setIncludeCTA(!includeCTA) },
        ].map(opt => (
          <TouchableOpacity
            key={opt.key}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 12, paddingVertical: 8,
              borderRadius: borderRadius.full, borderWidth: 1.5,
              borderColor: opt.value ? colors.success : colors.border,
              backgroundColor: opt.value ? colors.success + '12' : colors.surface,
            }}
            onPress={opt.toggle}
          >
            <MaterialCommunityIcons
              name={opt.value ? 'check-circle' : 'circle-outline'}
              size={16}
              color={opt.value ? colors.success : colors.textTertiary}
            />
            <Text style={{ fontSize: 12, fontWeight: opt.value ? fontWeight.semibold : fontWeight.medium, color: opt.value ? colors.success : colors.textSecondary }}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Generate Button */}
      <Animated.View style={{ transform: [{ scale: loading ? pulseAnim : 1 }], marginTop: spacing.xl }}>
        <TouchableOpacity
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.primary, borderRadius: borderRadius.lg,
            paddingVertical: 16, gap: spacing.sm,
            shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
            opacity: loading ? 0.6 : 1,
          }}
          onPress={handleGenerate}
          disabled={loading}
        >
          {loading ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={{ color: '#fff', fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>Genereren...</Text>
            </>
          ) : (
            <>
              <Sparkle size={22} color="#fff" weight="fill" />
              <Text style={{ color: '#fff', fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>Genereer Content</Text>
            </>
          )}
        </TouchableOpacity>
      </Animated.View>
    </>
  );

  // ─── STEP 2: Edit & Format ─────────────────────────────────────────
  const renderStep2 = () => (
    <>
      {/* Platform preview badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md }}>
        <MaterialCommunityIcons name={(currentPlatform?.icon || 'card-text') as any} size={20} color={currentPlatform?.color || colors.primary} />
        <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>
          {currentPlatform?.label || 'Content'} Preview
        </Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingHorizontal: 10, paddingVertical: 5,
            borderRadius: borderRadius.full,
            backgroundColor: colors.primary + '15',
          }}
          onPress={handleGenerate}
        >
          <ArrowsClockwise size={14} color={colors.primary} weight="bold" />
          <Text style={{ fontSize: 11, color: colors.primary, fontWeight: fontWeight.semibold }}>Opnieuw</Text>
        </TouchableOpacity>
      </View>

      {/* Content Card */}
      <View style={{ ...card, padding: 0, overflow: 'hidden', borderColor: colors.primary + '25' }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          backgroundColor: colors.primary + '10', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
          borderBottomWidth: 1, borderBottomColor: colors.primary + '15',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Sparkle size={16} color={colors.primary} weight="fill" />
            <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primary }}>
              Gegenereerde Content
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <TouchableOpacity
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center' }}
              onPress={() => {
                setEditMode(!editMode);
                if (!editMode) setEditedContent(generatedContent);
              }}
            >
              <MaterialCommunityIcons name={editMode ? 'check' : 'pencil'} size={16} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center' }}
              onPress={handleCopy}
            >
              <Copy size={16} color={colors.primary} weight="duotone" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Body */}
        <View style={{ padding: spacing.md }}>
          {editMode ? (
            <TextInput
              style={{ fontSize: fontSize.md, color: colors.text, lineHeight: 24, minHeight: 150, textAlignVertical: 'top' }}
              value={editedContent}
              onChangeText={setEditedContent}
              multiline
              autoFocus
            />
          ) : (
            <Text style={{ fontSize: fontSize.md, color: colors.text, lineHeight: 24 }} selectable>
              {displayContent}
            </Text>
          )}
        </View>

        {/* Stats */}
        <View style={{
          flexDirection: 'row', justifyContent: 'space-around',
          paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
          backgroundColor: colors.borderLight, borderTopWidth: 1, borderTopColor: colors.border,
        }}>
          {[
            { val: String(wordCount(displayContent)), label: 'woorden' },
            { val: String(charCount(displayContent)), label: 'tekens' },
            ...(currentPlatform ? [{
              val: String(currentPlatform.maxChars - charCount(displayContent)),
              label: 'resterend',
              color: charCount(displayContent) > currentPlatform.maxChars ? colors.error : colors.success,
            }] : []),
            { val: String(generatedHashtags.length), label: 'hashtags' },
          ].map((s: any) => (
            <View key={s.label} style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: s.color || colors.text }}>{s.val}</Text>
              <Text style={{ fontSize: 9, color: colors.textTertiary, marginTop: 1 }}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Hashtags */}
      {generatedHashtags.length > 0 && (
        <View style={{ ...card, marginTop: spacing.sm }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm }}>Hashtags</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {generatedHashtags.map(tag => (
              <TouchableOpacity
                key={tag}
                style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: borderRadius.full, backgroundColor: colors.primary + '10' }}
                onPress={async () => {
                  await Clipboard.setStringAsync(tag);
                  Alert.alert('Gekopieerd', `${tag} gekopieerd`);
                }}
              >
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: fontWeight.medium }}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* History navigation */}
      {contentHistory.length > 1 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginTop: spacing.sm }}>
          <TouchableOpacity
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.borderLight, justifyContent: 'center', alignItems: 'center', opacity: historyIndex <= 0 ? 0.3 : 1 }}
            onPress={() => navigateHistory('prev')}
            disabled={historyIndex <= 0}
          >
            <CaretLeft size={18} color={colors.textSecondary} weight="bold" />
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>Versie {historyIndex + 1}/{contentHistory.length}</Text>
          <TouchableOpacity
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.borderLight, justifyContent: 'center', alignItems: 'center', opacity: historyIndex >= contentHistory.length - 1 ? 0.3 : 1 }}
            onPress={() => navigateHistory('next')}
            disabled={historyIndex >= contentHistory.length - 1}
          >
            <CaretRight size={18} color={colors.textSecondary} weight="bold" />
          </TouchableOpacity>
        </View>
      )}

      {/* Quick Actions */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: borderRadius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 6 }}
          onPress={() => {
            setContentLength(contentLength === 'short' ? 'medium' : contentLength === 'medium' ? 'long' : 'short');
            handleGenerate();
          }}
        >
          <ArrowsOut size={16} color={colors.text} weight="bold" />
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>Andere lengte</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: borderRadius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 6 }}
          onPress={async () => {
            const allHashtags = generatedHashtags.join(' ');
            const fullText = `${displayContent}\n\n${allHashtags}`;
            await Clipboard.setStringAsync(fullText);
            Alert.alert('Gekopieerd', 'Content + hashtags gekopieerd');
          }}
        >
          <ClipboardText size={16} color={colors.text} weight="duotone" />
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>Kopieer alles</Text>
        </TouchableOpacity>
      </View>

      {/* Next Step */}
      <TouchableOpacity
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.primary, borderRadius: borderRadius.lg,
          paddingVertical: 16, gap: spacing.sm, marginTop: spacing.lg,
        }}
        onPress={() => goToStep(3)}
      >
        <ImageSquare size={20} color="#fff" weight="duotone" />
        <Text style={{ color: '#fff', fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>Volgende: Media toevoegen</Text>
        <ArrowRight size={20} color="#fff" weight="bold" />
      </TouchableOpacity>

      {/* Skip to publish */}
      <TouchableOpacity
        style={{ alignItems: 'center', marginTop: spacing.sm }}
        onPress={() => goToStep(4)}
      >
        <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>Overslaan → direct publiceren</Text>
      </TouchableOpacity>
    </>
  );

  // ─── STEP 3: Media ─────────────────────────────────────────────────
  const renderStep3 = () => (
    <>
      <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs }}>
        Media toevoegen
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md }}>
        Voeg foto's toe om je post visueel aantrekkelijker te maken
      </Text>

      {/* Media source buttons — 3 columns */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        <TouchableOpacity
          style={{
            flex: 1, alignItems: 'center', gap: spacing.xs,
            paddingVertical: spacing.md, borderRadius: borderRadius.lg,
            backgroundColor: colors.primary + '08', borderWidth: 1.5,
            borderColor: colors.primary + '30', borderStyle: 'dashed',
          }}
          onPress={() => pickImage('camera')}
        >
          <View style={{
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: colors.primary + '15',
            justifyContent: 'center', alignItems: 'center',
          }}>
            <Camera size={24} color={colors.primary} weight="duotone" />
          </View>
          <Text style={{ fontSize: 12, fontWeight: fontWeight.bold, color: colors.primary }}>Foto maken</Text>
          <Text style={{ fontSize: 9, color: colors.textSecondary }}>Camera</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flex: 1, alignItems: 'center', gap: spacing.xs,
            paddingVertical: spacing.md, borderRadius: borderRadius.lg,
            backgroundColor: colors.success + '08', borderWidth: 1.5,
            borderColor: colors.success + '30', borderStyle: 'dashed',
          }}
          onPress={() => pickImage('library')}
        >
          <View style={{
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: colors.success + '15',
            justifyContent: 'center', alignItems: 'center',
          }}>
            <Images size={24} color={colors.success} weight="duotone" />
          </View>
          <Text style={{ fontSize: 12, fontWeight: fontWeight.bold, color: colors.success }}>Galerij</Text>
          <Text style={{ fontSize: 9, color: colors.textSecondary }}>Tot 4 foto's</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flex: 1, alignItems: 'center', gap: spacing.xs,
            paddingVertical: spacing.md, borderRadius: borderRadius.lg,
            backgroundColor: '#8B5CF6' + '08', borderWidth: 1.5,
            borderColor: '#8B5CF6' + '30', borderStyle: 'dashed',
          }}
          onPress={() => {
            setShowAiImageSearch(true);
            // Auto-fill search with topic
            if (!aiImageQuery && topic) setAiImageQuery(topic);
          }}
        >
          <View style={{
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: '#8B5CF6' + '15',
            justifyContent: 'center', alignItems: 'center',
          }}>
            <Sparkle size={24} color="#8B5CF6" weight="fill" />
          </View>
          <Text style={{ fontSize: 12, fontWeight: fontWeight.bold, color: '#8B5CF6' }}>AI Zoeken</Text>
          <Text style={{ fontSize: 9, color: colors.textSecondary }}>Stock foto's</Text>
        </TouchableOpacity>
      </View>

      {/* AI Image Search Panel */}
      {showAiImageSearch && (
        <View style={{
          backgroundColor: colors.surface, borderRadius: borderRadius.lg,
          padding: spacing.md, marginBottom: spacing.md,
          borderWidth: 1, borderColor: '#8B5CF6' + '30',
          ...subtleShadow,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Sparkle size={18} color="#8B5CF6" weight="fill" />
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text }}>AI Afbeelding zoeken</Text>
            </View>
            <TouchableOpacity onPress={() => setShowAiImageSearch(false)}>
              <X size={20} color={colors.textSecondary} weight="bold" />
            </TouchableOpacity>
          </View>

          {/* Search input */}
          <View style={{
            flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm,
          }}>
            <TextInput
              style={{
                flex: 1, backgroundColor: colors.background, borderRadius: borderRadius.md,
                paddingHorizontal: spacing.sm, paddingVertical: 10,
                fontSize: fontSize.sm, color: colors.text,
                borderWidth: 1, borderColor: colors.border,
              }}
              value={aiImageQuery}
              onChangeText={setAiImageQuery}
              placeholder="Zoek bijv. 'marketing team meeting'..."
              placeholderTextColor={colors.textSecondary}
              onSubmitEditing={() => searchAiImages()}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={{
                backgroundColor: '#8B5CF6', borderRadius: borderRadius.md,
                paddingHorizontal: spacing.md, justifyContent: 'center',
                opacity: aiImageLoading ? 0.6 : 1,
              }}
              onPress={() => searchAiImages()}
              disabled={aiImageLoading}
            >
              {aiImageLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <MagnifyingGlass size={20} color="#fff" weight="bold" />}
            </TouchableOpacity>
          </View>

          {/* Quick search suggestions */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: spacing.sm }}>
            {['marketing', 'business meeting', 'product launch', 'team work', 'technology', 'conference', 'startup', 'social media'].map(s => (
              <TouchableOpacity
                key={s}
                style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
                  backgroundColor: '#8B5CF6' + '12', borderWidth: 1, borderColor: '#8B5CF6' + '25',
                }}
                onPress={() => { setAiImageQuery(s); searchAiImages(s); }}
              >
                <Text style={{ fontSize: 11, color: '#8B5CF6' }}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Results grid */}
          {aiImageResults.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {aiImageResults.map(img => {
                const isSelected = selectedImages.includes(img.url);
                return (
                  <TouchableOpacity
                    key={img.id}
                    style={{
                      width: (SCREEN_W - spacing.md * 4 - spacing.xs * 2) / 3,
                      height: 80, borderRadius: borderRadius.sm,
                      overflow: 'hidden', borderWidth: isSelected ? 2 : 0,
                      borderColor: isSelected ? '#8B5CF6' : 'transparent',
                    }}
                    onPress={() => isSelected
                      ? setSelectedImages(prev => prev.filter(u => u !== img.url))
                      : selectAiImage(img.url)
                    }
                  >
                    <Image source={{ uri: img.thumb }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    {isSelected && (
                      <View style={{
                        position: 'absolute', top: 2, right: 2,
                        width: 20, height: 20, borderRadius: 10,
                        backgroundColor: '#8B5CF6', justifyContent: 'center', alignItems: 'center',
                      }}>
                        <Check size={14} color="#fff" weight="bold" />
                      </View>
                    )}
                    <Text style={{
                      position: 'absolute', bottom: 1, left: 2,
                      fontSize: 7, color: '#fff',
                      textShadowColor: '#000', textShadowRadius: 2,
                    }}>
                      {img.author}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {aiImageResults.length > 0 && (
            <Text style={{ fontSize: 9, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' }}>
              Gratis stock foto's van {aiImageResults[0]?.source || 'Unsplash'} • Klik om te selecteren
            </Text>
          )}
        </View>
      )}

      {/* Selected images */}
      {selectedImages.length > 0 && (
        <View style={{ marginBottom: spacing.md }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm }}>
            Geselecteerd ({selectedImages.length}/4)
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {selectedImages.map((uri, i) => (
              <View key={uri + i} style={{ position: 'relative' }}>
                <Image
                  source={{ uri }}
                  style={{
                    width: 120, height: 120, borderRadius: borderRadius.md,
                    borderWidth: 1, borderColor: colors.border,
                  }}
                />
                <TouchableOpacity
                  style={{
                    position: 'absolute', top: -6, right: -6,
                    width: 24, height: 24, borderRadius: 12,
                    backgroundColor: colors.error, justifyContent: 'center', alignItems: 'center',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3,
                  }}
                  onPress={() => removeImage(i)}
                >
                  <X size={14} color="#fff" weight="bold" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Platform format info */}
      <View style={{ ...card, marginBottom: spacing.md }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm }}>
          📐 Platform formaten
        </Text>
        {visiblePlatforms.map(p => (
          <View key={p.key} style={{
            flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
            paddingVertical: 6, borderBottomWidth: p.key !== 'tiktok' ? 1 : 0, borderBottomColor: colors.border + '40',
          }}>
            <MaterialCommunityIcons name={p.icon as any} size={16} color={p.color} />
            <Text style={{ fontSize: 12, color: colors.text, flex: 1 }}>{p.label}</Text>
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>{p.aspectRatio}</Text>
          </View>
        ))}
      </View>

      {/* Content preview with media */}
      {(generatedContent || selectedImages.length > 0) && (
        <View style={{ ...card, marginBottom: spacing.md }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm }}>
            📱 Preview
          </Text>
          {selectedImages.length > 0 && (
            <Image
              source={{ uri: selectedImages[0] }}
              style={{ width: '100%', height: 200, borderRadius: borderRadius.md, marginBottom: spacing.sm }}
              resizeMode="cover"
            />
          )}
          <Text style={{ fontSize: fontSize.sm, color: colors.text, lineHeight: 20 }} numberOfLines={5}>
            {displayContent}
          </Text>
          {generatedHashtags.length > 0 && (
            <Text style={{ fontSize: 11, color: colors.primary, marginTop: spacing.xs }}>
              {generatedHashtags.slice(0, 5).join(' ')}
            </Text>
          )}
        </View>
      )}

      {/* Navigation */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
        <TouchableOpacity
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            paddingVertical: 14, borderRadius: borderRadius.lg,
            backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, gap: 6,
          }}
          onPress={() => goToStep(2)}
        >
          <ArrowLeft size={18} color={colors.text} weight="bold" />
          <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>Terug</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{
            flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            paddingVertical: 14, borderRadius: borderRadius.lg,
            backgroundColor: colors.primary, gap: 6,
          }}
          onPress={() => goToStep(4)}
        >
          <PaperPlaneTilt size={18} color="#fff" weight="fill" />
          <Text style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: '#fff' }}>Volgende: Publiceren</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  // ─── STEP 4: Publish ───────────────────────────────────────────────
  const renderStep4 = () => (
    <>
      <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs }}>
        Publiceren
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md }}>
        Kies waar je wilt publiceren
      </Text>

      {/* Platform selection */}
      <View style={{ ...card, marginBottom: spacing.md }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm }}>
          Platforms
        </Text>
        {visiblePlatforms.map(p => {
          const isSelected = publishPlatforms.includes(p.key);
          return (
            <TouchableOpacity
              key={p.key}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                paddingVertical: spacing.sm,
                borderBottomWidth: p.key !== 'tiktok' ? 1 : 0, borderBottomColor: colors.border + '40',
              }}
              onPress={() => togglePublishPlatform(p.key)}
            >
              <View style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: p.color + '15',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <MaterialCommunityIcons name={p.icon as any} size={20} color={p.color} />
              </View>
              <Text style={{ fontSize: fontSize.md, color: colors.text, flex: 1, fontWeight: fontWeight.medium }}>{p.label}</Text>
              <MaterialCommunityIcons
                name={isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                size={24}
                color={isSelected ? colors.success : colors.textTertiary}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Schedule */}
      <View style={{ ...card, marginBottom: spacing.md }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm }}>
          Wanneer
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[
            { key: 'now' as const, label: 'Nu publiceren', icon: 'send', emoji: '🚀' },
            { key: 'later' as const, label: 'Inplannen', icon: 'clock-outline', emoji: '⏰' },
          ].map(opt => {
            const isActive = scheduleType === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  paddingVertical: spacing.sm, borderRadius: borderRadius.md,
                  borderWidth: 1.5, gap: 6,
                  borderColor: isActive ? colors.primary : colors.border,
                  backgroundColor: isActive ? colors.primary + '10' : colors.surface,
                }}
                onPress={() => setScheduleType(opt.key)}
              >
                <Text style={{ fontSize: 16 }}>{opt.emoji}</Text>
                <Text style={{
                  fontSize: fontSize.sm,
                  fontWeight: isActive ? fontWeight.bold : fontWeight.medium,
                  color: isActive ? colors.primary : colors.textSecondary,
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Final Preview */}
      <View style={{ ...card, marginBottom: spacing.md, borderColor: colors.primary + '30' }}>
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.sm }}>
          📱 Finale preview
        </Text>
        {selectedImages.length > 0 && (
          <Image
            source={{ uri: selectedImages[0] }}
            style={{ width: '100%', height: 180, borderRadius: borderRadius.md, marginBottom: spacing.sm }}
            resizeMode="cover"
          />
        )}
        <Text style={{ fontSize: fontSize.sm, color: colors.text, lineHeight: 20 }} numberOfLines={8}>
          {displayContent}
        </Text>
        {generatedHashtags.length > 0 && (
          <Text style={{ fontSize: 11, color: colors.primary, marginTop: spacing.xs }}>
            {generatedHashtags.join(' ')}
          </Text>
        )}
        <View style={{
          flexDirection: 'row', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap',
        }}>
          {publishPlatforms.map(pk => {
            const p = PLATFORMS.find(pl => pl.key === pk);
            if (!p) return null;
            return (
              <View key={pk} style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 8, paddingVertical: 3,
                borderRadius: borderRadius.full, backgroundColor: p.color + '15',
              }}>
                <MaterialCommunityIcons name={p.icon as any} size={12} color={p.color} />
                <Text style={{ fontSize: 10, color: p.color, fontWeight: fontWeight.semibold }}>{p.label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Action buttons */}
      <View style={{ gap: spacing.sm }}>
        <TouchableOpacity
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.primary, borderRadius: borderRadius.lg,
            paddingVertical: 16, gap: spacing.sm,
            shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3, shadowRadius: 8,
            opacity: publishing ? 0.6 : 1,
          }}
          onPress={handlePublish}
          disabled={publishing || publishPlatforms.length === 0}
        >
          {publishing ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={{ color: '#fff', fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>Publiceren...</Text>
            </>
          ) : (
            <>
              <PaperPlaneTilt size={20} color="#fff" weight="duotone" />
              <Text style={{ color: '#fff', fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>
                Publiceren naar {publishPlatforms.length} platform{publishPlatforms.length !== 1 ? 's' : ''}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TouchableOpacity
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingVertical: 12, borderRadius: borderRadius.md,
              backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 6,
            }}
            onPress={handleSaveDraft}
          >
            <FloppyDisk size={16} color={colors.text} weight="duotone" />
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
              {savedAsDraft ? '✓ Opgeslagen' : 'Opslaan als concept'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              paddingVertical: 12, borderRadius: borderRadius.md,
              backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 6,
            }}
            onPress={handleShare}
          >
            <ShareNetwork size={16} color={colors.text} weight="duotone" />
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>Delen</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={{ alignItems: 'center', marginTop: spacing.xs }}
          onPress={() => goToStep(3)}
        >
          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>← Terug naar media</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  // ─── Main Render ───────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        paddingHorizontal: spacing.lg, paddingTop: 60, paddingBottom: spacing.sm,
        backgroundColor: colors.surface, borderBottomWidth: 0,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text }}>Content Creator</Text>
          <View style={{ backgroundColor: colors.primary + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: borderRadius.sm }}>
            <Text style={{ fontSize: 10, fontWeight: fontWeight.bold, color: colors.primary }}>AI</Text>
          </View>
        </View>
        <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 }}>
          AI-gegenereerde marketing content
        </Text>
      </View>

      {/* Progress Bar */}
      {renderProgressBar()}

      {/* Content */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={RNPlatform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </ScrollView>
      </KeyboardAvoidingView>
      <AIConsentModal visible={showConsentModal} onAccept={onConsentAccept} onDecline={onConsentDecline} />
    </View>
  );
}
