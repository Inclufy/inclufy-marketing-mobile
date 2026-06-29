// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: cfg.icon as any> | Ionicons name=<dynamic: channelConfig[connectPlatform as Channel]?.icon as any || 'link-outline'> | Ionicons name=<dynamic: config?.icon as any> | Ionicons name=<dynamic: icon as any> | Ionicons name=<dynamic: icon> | Ionicons name=<dynamic: icons[corner]> | Ionicons name=<dynamic: isExpanded ? 'chevron-up-outline' : 'chevron-down-outline'> | Ionicons name=<dynamic: isLuxury ? 'sparkles' : 'text-outline'> | Ionicons name=<dynamic: isPreviewVideo ? 'videocam-outline' : 'image-outline'> | Ionicons name=<dynamic: opt.icon> | Ionicons name=<dynamic: pos === 'top' ? 'arrow-up-outline' : 'arrow-down-outline'>
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  Alert,
  ActivityIndicator,
  Modal,
  StatusBar,
  Platform,
  Linking,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useCapturePosts, useUpdatePost, usePublishPost, useBatchPublish, useDeletePost } from '../hooks/useEventPosts';
import { useRequiresApproval, useSubmitForApproval } from '../hooks/usePostApproval';
import { uploadMedia } from '../hooks/useCaptures';
import * as ImageManipulator from 'expo-image-manipulator';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEvent } from '../hooks/useEvents';
import { aiService } from '../services/ai.service';
import { supabase } from '../services/supabase';
import type { RootStackParamList, EventPost, Channel } from '../types';
import { Ionicons } from '@expo/vector-icons';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { useUserTier, canBoostMeta, canHideWatermark, postsPerDayLimit, channelsPerPostLimit } from '../utils/userTier';
import { AmosWatermark } from '../components/AmosWatermark';
import AIConsentModal from '../components/AIConsentModal';
import { useAIConsent } from '../hooks/useAIConsent';
import ViewShot, { captureRef } from 'react-native-view-shot';

import { ArrowsClockwise, ArrowsLeftRight, ArrowsOutSimple, Bookmark, Buildings, Calendar, CaretRight, ChatCircle, Check, Crosshair, DotsThree, Eye, Globe, Heart, Hourglass, Image as ImageIcon, Images, Info, InstagramLogo, Lock, Microphone, PaintBrush, PaperPlaneTilt, PencilLine, Plus, Rocket, Trash, UploadSimple, User, UserCircle, X, XCircle } from 'phosphor-react-native';
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'PostReview'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const channelConfig: Record<Channel, { label: string; color: string; icon: string }> = {
  linkedin: { label: 'LinkedIn', color: '#0077B5', icon: 'logo-linkedin' },
  instagram: { label: 'Instagram', color: '#E4405F', icon: 'logo-instagram' },
  x: { label: 'X', color: '#000000', icon: 'logo-twitter' },
  facebook: { label: 'Facebook', color: '#1877F2', icon: 'logo-facebook' },
  tiktok: { label: 'TikTok', color: '#000000', icon: 'logo-tiktok' },
  whatsapp: { label: 'WhatsApp', color: '#25D366', icon: 'logo-whatsapp' },
  pinterest: { label: 'Pinterest', color: '#E60023', icon: 'logo-pinterest' },
  threads: { label: 'Threads', color: '#000000', icon: 'at-circle' },
  snapchat: { label: 'Snapchat', color: '#FFFC00', icon: 'logo-snapchat' },
};

// Inline video preview — uses expo-video. Defined at module level so the hook
// has a stable identity across renders.
function VideoPreview({
  source,
  style,
}: {
  source: string;
  style?: any;
}) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
  });
  return (
    <VideoView
      player={player}
      style={style}
      contentFit="cover"
      nativeControls
      allowsPictureInPicture={false}
    />
  );
}

export default function PostReviewScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { captureId, eventId, localMediaUri: routeLocalMediaUri, extraImageUrls } = route.params ?? {} as any;
  const [localMediaUri, setLocalMediaUri] = useState<string | null>(routeLocalMediaUri ?? null);
  const safeEventId = eventId ?? '';
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { hasConsent, showModal: showConsentModal, requestConsent, onAccept: onConsentAccept, onDecline: onConsentDecline } = useAIConsent();

  const { data: posts = [], isLoading } = useCapturePosts(captureId);
  const updatePost = useUpdatePost();
  const publishPost = usePublishPost();
  const { tier: userTier } = useUserTier();
  const batchPublish = useBatchPublish();
  const deletePost = useDeletePost();
  const { data: requiresApproval = false } = useRequiresApproval();
  const submitForApproval = useSubmitForApproval();
  const [flippingImage, setFlippingImage] = useState(false);
  const [rotatingImage, setRotatingImage] = useState(false);

  // ViewShot refs for baking overlay into image before publishing
  const viewShotRefs = useRef<Record<string, ViewShot | null>>({});

  // Fetch raw capture data to get storage_path for signed URL
  const { data: capture, isFetching: captureFetching } = useQuery({
    queryKey: ['capture', captureId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('go_captures')
        .select('id, storage_path, media_type, media_url')
        .eq('id', captureId)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!captureId,
    staleTime: 60_000,
  });

  const hasCapture = capture !== undefined; // undefined = still loading
  const storagePath = (capture as any)?.storage_path as string | null | undefined;
  const mediaType  = (capture as any)?.media_type  as string | null | undefined;
  const mediaUrl   = (capture as any)?.media_url   as string | null | undefined;
  const hasMedia   = !!(storagePath || mediaUrl);

  // Get a usable image URL — signed URL works for both public and private Supabase buckets
  const { data: captureImageUrl, isFetching: urlFetching } = useQuery({
    queryKey: ['capture-image-url', captureId, storagePath],
    queryFn: async () => {
      // Only photos and videos have a preview ('image' is accepted as alias for 'photo')
      if (mediaType && !['photo', 'video', 'image'].includes(mediaType)) return null;

      // 1) Signed URL from storage_path — works for BOTH public and private buckets
      if (storagePath) {
        const { data: signData } = await supabase.storage
          .from('media')
          .createSignedUrl(storagePath, 3600);
        if (signData?.signedUrl) return signData.signedUrl;
      }

      // 2) Fall back to direct media_url (works when bucket is public)
      return mediaUrl ?? null;
    },
    enabled: hasCapture && hasMedia,
    staleTime: 50 * 60 * 1000, // 50 min — before signed-URL expiry
    retry: 2,
  });

  // Show loading spinner while: capture query is in-flight, OR signed-URL is being created
  const imageIsLoading = captureFetching || (hasMedia && urlFetching);

  // When captureImageUrl refreshes to a new URL, clear it from failedUrls so the Image retries
  const prevCaptureUrlRef = React.useRef<string | null | undefined>(undefined);
  React.useEffect(() => {
    if (captureImageUrl && captureImageUrl !== prevCaptureUrlRef.current) {
      prevCaptureUrlRef.current = captureImageUrl;
      setFailedUrls((prev) => {
        if (!prev.has(captureImageUrl)) return prev;
        const next = new Set(prev);
        next.delete(captureImageUrl);
        return next;
      });
    }
  }, [captureImageUrl]);

  const { data: event } = useEvent(safeEventId || undefined);

  const [activeIndex, setActiveIndex] = useState(0);
  const [editingText, setEditingText] = useState<Record<string, string>>({});
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // ── Text style: luxury icons vs plain text ───────────────────────────────
  const [textStyle, setTextStyle] = useState<Record<string, 'luxury' | 'plain'>>({});
  const getTextStyle = (postId: string) => textStyle[postId] ?? 'luxury';

  // Map of luxury icon replacements for common marketing keywords
  const LUXURY_ICONS: Record<string, string> = {
    'event': '🎯', 'marketing': '📣', 'strategy': '🧠', 'growth': '📈',
    'team': '👥', 'innovation': '💡', 'success': '🏆', 'creative': '🎨',
    'connect': '🤝', 'launch': '🚀', 'analytics': '📊', 'brand': '✨',
    'social': '📱', 'content': '📝', 'campaign': '🎪', 'meeting': '💬',
    'workshop': '🔧', 'networking': '🌐', 'design': '🖌️', 'insight': '🔍',
    'goal': '🎯', 'deadline': '⏰', 'milestone': '🏁', 'budget': '💰',
    'presentation': '🎤', 'feedback': '💭', 'collaboration': '🤝', 'training': '📚',
  };

  const addLuxuryIcons = (text: string): string => {
    let result = text;
    // Add bullet-point style icons at line starts
    result = result.replace(/^[-•]\s*/gm, '✦ ');
    // Add sparkle to hashtags
    result = result.replace(/#(\w+)/g, '✨ #$1');
    return result;
  };

  const removeLuxuryIcons = (text: string): string => {
    // Remove common luxury emoji prefixes
    let result = text;
    result = result.replace(/(?:✦|✨|🎯|📣|🧠|📈|👥|💡|🏆|🎨|🤝|🚀|📊|📱|📝|🎪|💬|🔧|🌐|🖌️|🔍|⏰|🏁|💰|🎤|💭|📚)\s*/gu, '');
    // Restore bullet points
    result = result.replace(/^\s*(?=#)/gm, '');
    return result;
  };

  const toggleTextStyle = (post: EventPost) => {
    const currentStyle = getTextStyle(post.id);
    const newStyle = currentStyle === 'luxury' ? 'plain' : 'luxury';
    setTextStyle((prev) => ({ ...prev, [post.id]: newStyle }));

    const currentText = editingText[post.id] ?? post.text_content ?? '';
    const newText = newStyle === 'luxury' ? addLuxuryIcons(currentText) : removeLuxuryIcons(currentText);
    handleTextChange(post.id, newText);
  };

  // ── Language select ───────────────────────────────────────────────────────
  const [postLang, setPostLang] = useState<Record<string, string>>({});

  // Detect language of free text via marker-word frequency. Returns one of the
  // supported codes (nl/en/fr/de/es). Used to initialise the language flag so it
  // visually matches the AI-generated content (Bug 7) instead of always defaulting
  // to 'nl' when the AI in fact produced English.
  const detectLang = React.useCallback((text: string | null | undefined): string => {
    const s = (text || '').toLowerCase();
    if (s.length < 10) return 'nl';
    const markers: Record<string, RegExp[]> = {
      nl: [/\b(de|het|een|en|maar|wij|onze|jouw|voor|met|dat|niet|wel|ook)\b/g],
      en: [/\b(the|and|with|our|your|for|that|not|this|are|to|of|in|is)\b/g],
      fr: [/\b(le|la|les|un|une|de|et|nous|notre|votre|pour|avec|que|pas)\b/g],
      de: [/\b(der|die|das|und|mit|unser|euer|für|nicht|ist|wir)\b/g],
      es: [/\b(el|la|los|las|un|una|y|nuestro|para|con|que|no|es)\b/g],
    };
    let best: string = 'nl';
    let bestCount = 0;
    for (const [code, regexes] of Object.entries(markers)) {
      const count = regexes.reduce((acc, re) => acc + (s.match(re)?.length ?? 0), 0);
      if (count > bestCount) {
        bestCount = count;
        best = code;
      }
    }
    return best;
  }, []);

  // Initialise postLang based on detected language of each post on first render.
  // Only sets keys we don't already have (so explicit user choice is preserved).
  React.useEffect(() => {
    if (!posts || posts.length === 0) return;
    setPostLang((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const p of posts) {
        if (!next[p.id]) {
          next[p.id] = detectLang(p.text_content);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // posts is stable per query; intentionally only depend on length to avoid
    // re-running every time the query refetches the same data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts?.length]);
  const [translating, setTranslating] = useState<string | null>(null); // postId

  // ── First comment draft ───────────────────────────────────────────────────
  // Keyed by post.id; seeded from post.first_comment on load
  const [firstCommentDraft, setFirstCommentDraft] = useState<Record<string, string>>({});
  const [firstCommentExpanded, setFirstCommentExpanded] = useState<Record<string, boolean>>({});

  // Max character limits per platform for the first comment
  const FIRST_COMMENT_MAX: Record<string, number> = {
    linkedin: 1250,
    instagram: 2200,
    facebook: 8000,
  };

  // ── WhatsApp CTA ─────────────────────────────────────────────────────────
  // Keyed by post.id; seeded from post.whatsapp_cta_* fields on load
  const [whatsappCtaExpanded, setWhatsappCtaExpanded] = useState<Record<string, boolean>>({});
  const [whatsappCtaEnabled, setWhatsappCtaEnabled] = useState<Record<string, boolean>>({});
  const [whatsappCtaPhone, setWhatsappCtaPhone] = useState<Record<string, string>>({});
  const [whatsappCtaMessage, setWhatsappCtaMessage] = useState<Record<string, string>>({});

  // Helper function to validate E164 phone format
  const isValidE164 = (phone: string): boolean => {
    return /^\+\d{7,15}$/.test(phone.trim());
  };

  // ── Schedule ─────────────────────────────────────────────────────────────
  const [schedulingPost, setSchedulingPost] = useState<EventPost | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduling, setScheduling] = useState(false);

  // ── Preview ──────────────────────────────────────────────────────────────
  const [previewPost, setPreviewPost] = useState<EventPost | null>(null);
  // Isolated image-load state for the preview modal — does NOT share failedUrls
  // from the main cards so a transient network error never permanently hides the image
  // Track failed URLs individually so we can fall back to the next candidate automatically
  const [previewFailedUrls, setPreviewFailedUrls] = useState<Set<string>>(new Set());
  const [previewImgLoaded, setPreviewImgLoaded] = useState(false);
  const [previewSlideIdx, setPreviewSlideIdx] = useState(0);
  useEffect(() => {
    // Reset image state every time a new post is opened for preview
    setPreviewFailedUrls(new Set());
    setPreviewImgLoaded(false);
    setPreviewSlideIdx(0);
  }, [previewPost?.id]);

  // ── Brand kit logo fetch ─────────────────────────────────────────────────
  // Try event's brand_kit_id first; if no event, load the user's default brand kit
  const { data: brandKit } = useQuery({
    queryKey: ['brand-kit', (event as any)?.brand_kit_id ?? 'default'],
    queryFn: async () => {
      const bkId = (event as any)?.brand_kit_id;
      if (bkId) {
        const { data } = await supabase
          .from('brand_kits')
          .select('logo_url, name')
          .eq('id', bkId)
          .single();
        return data ?? null;
      }
      // No event — load user's default brand kit
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('brand_kits')
        .select('logo_url, name')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .single();
      return data ?? null;
    },
    staleTime: 10 * 60_000,
  });
  const brandLogoUrl: string | null = (brandKit as any)?.logo_url ?? null;
  const eventLogoUrl: string | null = (event as any)?.cover_image_url ?? null;

  // ── Image Overlay Editor ──────────────────────────────────────────────────
  // Stores per-post overlay config: text label + logo position + logo type
  // Initialized from engagement.overlay_config (persisted) when posts load
  const [overlayConfig, setOverlayConfig] = useState<Record<string, {
    text: string;
    textPosition: 'top' | 'bottom';
    showLogo: boolean;
    logoType: 'brand' | 'event' | 'both';
    logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    /** Sponsor / partner / co-organizer logos appended after brand+event. */
    extraLogos?: string[];
  }>>({});
  const [editingOverlay, setEditingOverlay] = useState<string | null>(null); // postId being edited
  const [overlayDraft, setOverlayDraft] = useState<{
    text: string;
    textPosition: 'top' | 'bottom';
    showLogo: boolean;
    logoType: 'brand' | 'event' | 'both';
    logoPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    extraLogos?: string[];
  }>({ text: '', textPosition: 'bottom', showLogo: false, logoType: 'brand', logoPosition: 'bottom-right', extraLogos: [] });
  // Track upload-in-progress for the extra-logo picker (disables the add button)
  const [extraLogoUploading, setExtraLogoUploading] = useState(false);

  // ── Instagram format picker (feed / story / reel) ────────────────────
  const [igFormatDraft, setIgFormatDraft] = useState<Record<string, 'feed' | 'story' | 'reel'>>({});

  // Seed igFormatDraft from DB once posts load
  useEffect(() => {
    if (!posts.length) return;
    setIgFormatDraft((prev) => {
      const next = { ...prev };
      for (const post of posts) {
        if (next[post.id] === undefined) {
          next[post.id] = ((post as any).ig_format as 'feed' | 'story' | 'reel') ?? 'feed';
        }
      }
      return next;
    });
  }, [posts]);

  const handleIgFormatChange = async (post: EventPost, value: 'feed' | 'story' | 'reel') => {
    setIgFormatDraft((prev) => ({ ...prev, [post.id]: value }));
    try {
      await updatePost.mutateAsync({ id: post.id, ...(({ ig_format: value } as any)) });
    } catch {
      // non-critical — revert optimistic update
      setIgFormatDraft((prev) => ({ ...prev, [post.id]: ((post as any).ig_format as 'feed' | 'story' | 'reel') ?? 'feed' }));
    }
  };

  // ── Account selection for publishing ─────────────────────────────────
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set());
  const [pendingPublishPost, setPendingPublishPost] = useState<EventPost | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<any[]>([]);
  // Track which account was used to publish each post (postId → account info)
  const [publishedAccounts, setPublishedAccounts] = useState<Record<string, { name: string; type: string; imageUrl?: string }>>({});
  // Inline account connect modal (shown when no accounts exist for a channel)
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectPlatform, setConnectPlatform] = useState('');
  const [connectAccountName, setConnectAccountName] = useState('');
  const [connectAccountUrl, setConnectAccountUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [pendingPublishAll, setPendingPublishAll] = useState(false);

  const fetchAccountsForChannel = async (channel: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      // Filter out account types that cannot actually publish via API:
      // - any 'manual' — no OAuth token, can't API-publish
      // NOTE: Instagram 'personal' rows are now SHOWN with a warning badge in the
      // picker (rather than hidden) because legacy OAuth runs may have miscoded
      // a Business account as 'personal'. The picker surfaces a warning and the
      // user can decide whether to attempt publishing — Meta Graph API will
      // reject it with a clear error if it really is a personal account.
      const isPublishable = (acc: any) => acc.account_type !== 'manual';
      // Sort: pages/business first, then personal. Used as default preference
      // when the user has multiple accounts connected for a channel.
      const accountPriority = (t: string | null) => {
        if (t === 'page' || t === 'business') return 0;
        if (t === 'personal') return 1;
        return 2;
      };
      const sortByPriority = (a: any, b: any) => accountPriority(a.account_type) - accountPriority(b.account_type);
      // First try with status = 'active'
      const { data: activeData } = await supabase
        .from('social_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('platform', channel)
        .eq('status', 'active');
      const activeFiltered = (activeData || []).filter(isPublishable).sort(sortByPriority);
      if (activeFiltered.length > 0) return activeFiltered;
      // Fallback: no status filter (catches 'connected' and other values)
      const { data: fallbackData } = await supabase
        .from('social_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('platform', channel);
      return (fallbackData || []).filter(isPublishable).sort(sortByPriority);
    } catch { return []; }
  };

  // Seed overlayConfig, firstCommentDraft, and whatsappCta from DB once posts load
  useEffect(() => {
    if (!posts.length) return;
    setOverlayConfig((prev) => {
      const next = { ...prev };
      for (const post of posts) {
        if (!next[post.id]) {
          const saved = (post.engagement as any)?.overlay_config;
          if (saved?.text || saved?.showLogo) next[post.id] = saved;
        }
      }
      return next;
    });
    setFirstCommentDraft((prev) => {
      const next = { ...prev };
      for (const post of posts) {
        // Only seed if we don't already have an in-progress draft for this post
        if (!(post.id in next)) {
          next[post.id] = (post as any).first_comment ?? '';
        }
      }
      return next;
    });
    // Seed WhatsApp CTA fields
    setWhatsappCtaEnabled((prev) => {
      const next = { ...prev };
      for (const post of posts) {
        if (!(post.id in next)) {
          next[post.id] = (post as any).whatsapp_cta_enabled ?? false;
        }
      }
      return next;
    });
    setWhatsappCtaPhone((prev) => {
      const next = { ...prev };
      for (const post of posts) {
        if (!(post.id in next)) {
          next[post.id] = (post as any).whatsapp_cta_phone ?? '';
        }
      }
      return next;
    });
    setWhatsappCtaMessage((prev) => {
      const next = { ...prev };
      for (const post of posts) {
        if (!(post.id in next)) {
          next[post.id] = (post as any).whatsapp_cta_message ?? 'Hi, ik zag je post';
        }
      }
      return next;
    });
  }, [posts]);

  const openOverlayEditor = (post: EventPost) => {
    const existing = overlayConfig[post.id] ?? {
      text: '', textPosition: 'bottom' as const, showLogo: false, logoType: 'brand' as const, logoPosition: 'bottom-right' as const, extraLogos: [],
    };
    setOverlayDraft({ ...existing, extraLogos: existing.extraLogos ?? [] });
    setEditingOverlay(post.id);
  };

  // ── Multi-logo helpers (sponsors / partners) ──────────────────────────
  // Maximum 4 extras alongside brand + event = 6 logos max per overlay.
  // More than that crowds the image and reads as visual noise on a phone.
  const EXTRA_LOGOS_MAX = 4;

  const addExtraLogo = async () => {
    if (extraLogoUploading) return;
    if ((overlayDraft.extraLogos ?? []).length >= EXTRA_LOGOS_MAX) {
      Alert.alert('Maximum bereikt', `Je kunt maximaal ${EXTRA_LOGOS_MAX} extra logo's toevoegen.`);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Geen toegang', 'AMOS heeft toegang tot je fotobibliotheek nodig om een logo te selecteren.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    try {
      setExtraLogoUploading(true);
      const { url } = await uploadMedia(result.assets[0].uri, safeEventId, 'photo');
      setOverlayDraft((d) => ({
        ...d,
        extraLogos: [...(d.extraLogos ?? []), url],
      }));
    } catch (e: any) {
      Alert.alert('Upload mislukt', e?.message ?? 'Kon logo niet uploaden.');
    } finally {
      setExtraLogoUploading(false);
    }
  };

  const removeExtraLogo = (idx: number) => {
    setOverlayDraft((d) => ({
      ...d,
      extraLogos: (d.extraLogos ?? []).filter((_, i) => i !== idx),
    }));
  };

  const saveOverlay = async (postId: string) => {
    // Update local state immediately for instant UI feedback
    setOverlayConfig((prev) => ({ ...prev, [postId]: { ...overlayDraft } }));
    setEditingOverlay(null);
    // Persist to DB inside engagement JSONB so it survives navigation
    const post = posts.find((p) => p.id === postId);
    if (post) {
      try {
        await updatePost.mutateAsync({
          id: postId,
          engagement: {
            ...(post.engagement ?? { likes: 0, comments: 0, shares: 0 }),
            overlay_config: { ...overlayDraft },
          } as any,
        });
      } catch {
        // Non-critical — overlay is still shown locally even if DB save fails
      }
    }
  };

  const clearOverlay = async (postId: string) => {
    setOverlayConfig((prev) => {
      const next = { ...prev };
      delete next[postId];
      return next;
    });
    setEditingOverlay(null);
    // Remove from DB too
    const post = posts.find((p) => p.id === postId);
    if (post) {
      try {
        const eng = { ...(post.engagement ?? { likes: 0, comments: 0, shares: 0 }) };
        delete (eng as any).overlay_config;
        await updatePost.mutateAsync({ id: postId, engagement: eng });
      } catch { /* non-critical */ }
    }
  };

  // ── Regenerate ───────────────────────────────────────────────────────────
  const [regenerating, setRegenerating] = useState<string | null>(null); // postId

  // ── Multi-image strip ─────────────────────────────────────────────────────
  // Tracks which image index is currently displayed for each post
  const [activeImageIndex, setActiveImageIndex] = useState<Record<string, number>>({});

  // Returns all image URLs for a post: fallbackUrl (freshness-aware) first, then extras.
  const getPostImages = (post: EventPost, fallbackUrl: string | null | undefined): string[] => {
    const images: string[] = [];
    const primary = fallbackUrl || '';
    if (primary) images.push(primary);
    // Use extra_images from DB, or from navigation params as fallback
    const extra = post.engagement?.extra_images;
    const extraSource = Array.isArray(extra) && extra.length > 0 ? extra : extraImageUrls;
    if (Array.isArray(extraSource)) {
      extraSource.forEach((url: string) => { if (url && !images.includes(url)) images.push(url); });
    }
    return images;
  };

  // Refresh signed URLs for extra images that may have expired
  const [refreshedUrls, setRefreshedUrls] = useState<Record<string, string>>({});

  const refreshSignedUrl = async (originalUrl: string): Promise<string> => {
    if (refreshedUrls[originalUrl]) return refreshedUrls[originalUrl];
    try {
      // Extract storage path from Supabase URL
      const pathMatch = originalUrl.match(/\/media\/(.+?)(\?|$)/);
      if (pathMatch) {
        const { data } = await supabase.storage.from('media').createSignedUrl(pathMatch[1], 3600);
        if (data?.signedUrl) {
          setRefreshedUrls(prev => ({ ...prev, [originalUrl]: data.signedUrl }));
          return data.signedUrl;
        }
      }
    } catch {}
    return originalUrl;
  };

  // Proactively refresh signed URLs for all extra images when posts load
  const refreshedExtraRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!posts.length) return;
    const allExtraUrls: string[] = [];
    for (const post of posts) {
      const extras = post.engagement?.extra_images;
      if (Array.isArray(extras)) {
        for (const url of extras) {
          if (url && !refreshedExtraRef.current.has(url) && !refreshedUrls[url]) {
            allExtraUrls.push(url);
          }
        }
      }
    }
    if (allExtraUrls.length === 0) return;
    // Mark as in-flight to avoid duplicate refreshes
    for (const url of allExtraUrls) refreshedExtraRef.current.add(url);

    // Batch-sign all extra image paths at once
    const storagePaths: { url: string; path: string }[] = [];
    for (const url of allExtraUrls) {
      const pathMatch = url.match(/\/media\/(.+?)(\?|$)/);
      if (pathMatch) storagePaths.push({ url, path: pathMatch[1] });
    }
    if (storagePaths.length === 0) return;

    (async () => {
      try {
        const { data } = await supabase.storage.from('media').createSignedUrls(
          storagePaths.map(p => p.path),
          3600,
        );
        if (data && data.length > 0) {
          const newMap: Record<string, string> = {};
          data.forEach((item, idx) => {
            if (item.signedUrl) {
              newMap[storagePaths[idx].url] = item.signedUrl;
            }
          });
          if (Object.keys(newMap).length > 0) {
            setRefreshedUrls(prev => ({ ...prev, ...newMap }));
            // Clear any of these URLs from failedUrls so images retry
            setFailedUrls(prev => {
              const next = new Set(prev);
              let changed = false;
              for (const origUrl of Object.keys(newMap)) {
                if (next.has(origUrl)) { next.delete(origUrl); changed = true; }
              }
              return changed ? next : prev;
            });
          }
        }
      } catch {
        // Signing failed — thumbnails will attempt individual refresh on error
      }
    })();
  }, [posts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Upload one or more extra images and append them to engagement.extra_images
  const handleAddExtraImage = async (post: EventPost) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Geen toegang', 'Geef toegang tot je fotobibliotheek om afbeeldingen toe te voegen.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets.length) return;

    setUploadingImage(true);
    try {
      const uploadedUrls: string[] = [];
      for (const asset of result.assets) {
        const { url } = await uploadMedia(asset.uri, safeEventId, 'photo');
        uploadedUrls.push(url);
      }
      const currentExtra: string[] = post.engagement?.extra_images ?? [];
      const newExtra = [...currentExtra, ...uploadedUrls];
      await updatePost.mutateAsync({
        id: post.id,
        engagement: { ...(post.engagement ?? { likes: 0, comments: 0, shares: 0 }), extra_images: newExtra },
      });
      // Jump to the first newly added image
      const existingCount = (post.branded_image_url ? 1 : 0) + currentExtra.length;
      setActiveImageIndex((prev) => ({ ...prev, [post.id]: existingCount }));
    } catch {
      Alert.alert('Fout', 'Uploaden mislukt. Controleer je internetverbinding en probeer opnieuw.');
    } finally {
      setUploadingImage(false);
    }
  };

  // Allow the user to attach/replace the post image by picking from the photo library.
  // Updates ALL posts for this capture (all channels share the same source photo).
  const handleAddImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Geen toegang', 'Geef toegang tot je fotobibliotheek om een afbeelding toe te voegen.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets.length) return;

    setUploadingImage(true);
    try {
      const { url, path } = await uploadMedia(result.assets[0].uri, safeEventId, 'photo');

      // Update capture row with new media info so signed URLs work on reload
      await supabase
        .from('go_captures')
        .update({ media_url: url, storage_path: path, media_type: 'photo', thumbnail_url: url })
        .eq('id', captureId);

      // Stamp all posts for this capture with the new branded image URL
      await Promise.all(
        posts.map((p) => updatePost.mutateAsync({ id: p.id, branded_image_url: url }))
      );

      // Invalidate queries so the new URL is picked up immediately
      queryClient.invalidateQueries({ queryKey: ['capture', captureId] });
      queryClient.invalidateQueries({ queryKey: ['capture-image-url', captureId] });
    } catch {
      Alert.alert('Fout', 'Uploaden mislukt. Controleer je internetverbinding en probeer opnieuw.');
    } finally {
      setUploadingImage(false);
    }
  };

  // ── Delete post ──────────────────────────────────────────────────────────
  const handleDeletePost = (post: EventPost) => {
    Alert.alert(
      'Post verwijderen?',
      `Verwijder de ${channelConfig[post.channel]?.label ?? post.channel} post. Dit kan niet ongedaan worden gemaakt.`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePost.mutateAsync(post.id);
              // If this was the only/last post, go back
              if (posts.length <= 1) navigation.goBack();
            } catch {
              Alert.alert('Fout', 'Kon post niet verwijderen.');
            }
          },
        },
      ],
    );
  };

  // ── Boost post (Capture-to-Ad) ─────────────────────────────────────────
  // Two-step flow:
  //   1. Create ad_campaigns row + AI-generated creative variants
  //      (in DRY-RUN until Meta App Review approves ads_management).
  //   2. Open Meta Ads Manager with this post pre-filled so user can
  //      configure budget/audience in Meta UI.
  //
  // Once Meta ads_management scope is approved, set META_ADS_API_LIVE=true
  // server-side and the campaign auto-pushes to Marketing API instead.
  const handleBoost = (post: EventPost) => {
    // Navigate to the in-app BoostFlow wizard instead of jumping straight
    // to Meta Ads Manager. The wizard handles budget/audience/variants
    // and creates the ad_campaigns row internally. User can still open
    // Meta Ads Manager from the final step if needed.
    navigation.navigate('BoostFlow', {
      postId: post.id,
      channel: post.channel === 'instagram' ? 'instagram' : 'facebook',
    });
  };

  // ── Flip image ────────────────────────────────────────────────────────────
  // Always operate on the RAW capture image (not the branded one) — otherwise
  // any baked-in text/logo overlay gets mirror-flipped (looks like backwards text).
  // After flipping the raw, clear branded_image_url so the next render re-bakes
  // the overlay fresh on top of the flipped image.
  const handleFlipImage = async (post: EventPost, imageUrl: string) => {
    if (flippingImage) return;
    setFlippingImage(true);
    try {
      // Source priority: localMediaUri (latest local file from prev manip) →
      // cloud signed URL → prop. Same reasoning as handleRotateImage —
      // prevents flip-only-works-once after my atomic-state fix in 401fdb6.
      const sourceUrl = localMediaUri ?? captureImageUrl ?? imageUrl;
      const result = await ImageManipulator.manipulateAsync(
        sourceUrl,
        [{ flip: ImageManipulator.FlipType.Horizontal }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      const { url, path } = await uploadMedia(result.uri, safeEventId, 'photo');
      await supabase
        .from('go_captures')
        .update({ media_url: url, storage_path: path, thumbnail_url: url })
        .eq('id', captureId);
      // Clear branded URLs so overlay re-bakes on top of the flipped raw image
      await Promise.all(
        posts.map((p) => updatePost.mutateAsync({ id: p.id, branded_image_url: null })),
      );
      // Keep the preview alive by pointing localMediaUri at the just-flipped
      // local file. This survives the gap between invalidating the cached
      // signed-URL and the new one being fetched. The next render of the
      // PostReview screen will show the correct flipped image immediately.
      setLocalMediaUri(result.uri);
      queryClient.invalidateQueries({ queryKey: ['capture', captureId] });
      queryClient.invalidateQueries({ queryKey: ['capture-image-url', captureId] });
    } catch {
      Alert.alert('Fout', 'Afbeelding omdraaien mislukt.');
    } finally {
      setFlippingImage(false);
    }
  };

  // ── Rotate image 90° ─────────────────────────────────────────────────────
  // Same pattern as flip: rotate raw, clear branded so overlay re-bakes.
  const handleRotateImage = async (post: EventPost, imageUrl: string) => {
    if (rotatingImage) return;
    setRotatingImage(true);
    try {
      // Source priority: localMediaUri (just-rotated local file) → cloud signed
      // URL → prop. Reading localMediaUri first prevents the 2nd-rotate bug
      // where captureImageUrl is still stale right after a first rotate (the
      // signed-URL query invalidation is async; user can tap before refetch
      // completes → operates on pre-rotation image → result is identical to
      // 1st rotate, looks like Draaien works only once).
      const sourceUrl = localMediaUri ?? captureImageUrl ?? imageUrl;
      const result = await ImageManipulator.manipulateAsync(
        sourceUrl,
        [{ rotate: 90 }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      const { url, path } = await uploadMedia(result.uri, safeEventId, 'photo');
      await supabase
        .from('go_captures')
        .update({ media_url: url, storage_path: path, thumbnail_url: url })
        .eq('id', captureId);
      await Promise.all(
        posts.map((p) => updatePost.mutateAsync({ id: p.id, branded_image_url: null })),
      );
      // Keep preview alive — see flip handler for the same pattern.
      setLocalMediaUri(result.uri);
      queryClient.invalidateQueries({ queryKey: ['capture', captureId] });
      queryClient.invalidateQueries({ queryKey: ['capture-image-url', captureId] });
    } catch {
      Alert.alert('Fout', 'Afbeelding draaien mislukt.');
    } finally {
      setRotatingImage(false);
    }
  };

  // ── Translate to language ─────────────────────────────────────────────────
  const LANG_OPTIONS = [
    { code: 'nl', label: 'NL', flag: '🇳🇱' },
    { code: 'en', label: 'EN', flag: '🇬🇧' },
    { code: 'de', label: 'DE', flag: '🇩🇪' },
    { code: 'fr', label: 'FR', flag: '🇫🇷' },
    { code: 'es', label: 'ES', flag: '🇪🇸' },
  ];

  const handleSelectLang = async (post: EventPost, lang: string) => {
    if (postLang[post.id] === lang) return; // already this lang
    if (!hasConsent) {
      requestConsent(() => { handleSelectLang(post, lang) });
      return;
    }
    setTranslating(post.id);
    try {
      const currentText = editingText[post.id] ?? post.text_content;
      const result = await aiService.translateContent({
        text: currentText,
        source_language: postLang[post.id] || 'nl',
        target_languages: [lang],
        platform: post.channel,
      });
      const translated = result.translations?.[lang];
      if (translated?.text) {
        setEditingText((prev) => ({ ...prev, [post.id]: translated.text }));
        // Auto-save translated text
        await updatePost.mutateAsync({ id: post.id, text_content: translated.text });
      }
      setPostLang((prev) => ({ ...prev, [post.id]: lang }));
    } catch {
      Alert.alert(t.common.error, 'Vertaling mislukt. Controleer je verbinding.');
    } finally {
      setTranslating(null);
    }
  };

  // ── Regenerate post ────────────────────────────────────────────────────
  const handleRegenerate = async (post: EventPost) => {
    if (!hasConsent) {
      requestConsent(() => { handleRegenerate(post) });
      return;
    }
    setRegenerating(post.id);
    try {
      const result = await aiService.generateEventPost({
        platform: post.channel as any,
        event_context: {
          name: event?.name || 'Content',
          description: event?.description || '',
          hashtags: event?.hashtags || [],
          location: event?.location || '',
        },
        capture_note: post.text_content?.slice(0, 100) || '',
        capture_tags: [],
      });
      if (result.text) {
        setEditingText((prev) => ({ ...prev, [post.id]: result.text }));
        await updatePost.mutateAsync({ id: post.id, text_content: result.text });
      }
    } catch {
      Alert.alert(t.common.error, 'Regeneratie mislukt. Controleer je verbinding.');
    } finally {
      setRegenerating(null);
    }
  };

  // ── Schedule confirm ──────────────────────────────────────────────────────
  const handleScheduleConfirm = async () => {
    if (!schedulingPost || !scheduleDate.trim()) return;
    setScheduling(true);
    try {
      const timeStr = scheduleTime.trim() || '09:00';
      const scheduled_at = `${scheduleDate.trim()}T${timeStr}:00`;
      // Save any pending text first
      if (editingText[schedulingPost.id]) {
        await updatePost.mutateAsync({ id: schedulingPost.id, text_content: editingText[schedulingPost.id] });
      }
      await updatePost.mutateAsync({ id: schedulingPost.id, status: 'scheduled', scheduled_at } as any);
      setSchedulingPost(null);
      setScheduleDate('');
      setScheduleTime('09:00');
      Alert.alert('✅ Ingepland', `Post ingepland voor ${scheduleDate} om ${timeStr}.`);
    } catch {
      Alert.alert(t.common.error, 'Inplannen mislukt. Controleer de datum (JJJJ-MM-DD).');
    } finally {
      setScheduling(false);
    }
  };

  const styles = useThemedStyles((c) => ({
    container: { flex: 1, backgroundColor: c.background },
    loading: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const },
    emptyText: { color: c.textSecondary, fontSize: fontSize.md },
    channelTabs: {
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    channelTabsContent: {
      // Horizontal scroll: each tab gets its natural width so long labels
      // (Facebook, Instagram, Pinterest, Snapchat, WhatsApp) fit on one line.
      paddingHorizontal: spacing.xs,
    },
    channelTab: {
      minWidth: 76,
      alignItems: 'center' as const,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent' as const,
    },
    channelLabel: {
      fontSize: fontSize.xs,
      color: c.textSecondary,
      marginTop: 2,
      textAlign: 'center' as const,
    },
    postContent: {
      padding: spacing.md,
      gap: spacing.md,
      paddingBottom: 100,
    },
    postImage: {
      width: '100%' as const,
      height: 250,
      borderRadius: borderRadius.lg,
      backgroundColor: c.surfaceElevated,
    },
    postImageWrapper: {
      position: 'relative' as const,
    },
    zoomHint: {
      position: 'absolute' as const,
      bottom: 8,
      right: 8,
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: borderRadius.full,
      padding: 5,
    },
    imagePlaceholder: {
      width: '100%' as const,
      height: 250,
      borderRadius: borderRadius.lg,
      backgroundColor: c.surfaceElevated,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    imagePlaceholderText: {
      fontSize: fontSize.sm,
      color: c.textTertiary,
      marginTop: spacing.xs,
    },
    addImageBtn: {
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderRadius: borderRadius.full,
      borderWidth: 1.5,
      borderColor: c.primary,
    },
    addImageBtnText: {
      fontSize: fontSize.sm,
      color: c.primary,
      fontWeight: fontWeight.semibold,
    },
    statusRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.sm,
    },
    statusBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
    },
    statusText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
    channelBadge: {
      fontSize: fontSize.xs,
      color: c.textTertiary,
    },
    textEdit: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      fontSize: fontSize.md,
      color: c.text,
      minHeight: 120,
      textAlignVertical: 'top' as const,
    },
    hashtags: {
      fontSize: fontSize.sm,
      color: c.primary,
    },
    actions: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
      alignItems: 'center' as const,
    },
    actionBtn: {
      flex: 1,
      borderRadius: borderRadius.md,
      paddingVertical: 14,
      alignItems: 'center' as const,
    },
    actionBtnText: {
      color: c.textOnPrimary,
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
    },
    actionBtnDisabledText: {
      color: c.textOnPrimary,
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      opacity: 0.7,
    },
    translateBtn: {
      borderRadius: borderRadius.md,
      paddingVertical: 12,
      alignItems: 'center' as const,
      borderWidth: 1.5,
      borderColor: c.info,
      backgroundColor: c.info + '10',
    },
    translateBtnText: {
      color: c.info,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
    },
    audienceBtn: {
      borderRadius: borderRadius.md,
      paddingVertical: 12,
      alignItems: 'center' as const,
      borderWidth: 1.5,
      borderColor: c.success,
      backgroundColor: c.success + '10',
    },
    audienceBtnText: {
      color: c.success,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
    },
    publishAllBtn: {
      position: 'absolute' as const,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: c.primary,
      paddingVertical: 18,
      paddingBottom: 34,
      alignItems: 'center' as const,
    },
    publishAllText: {
      color: c.textOnPrimary,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
    },
  }));

  const activePost = posts[activeIndex];

  const getEditedText = (post: EventPost) => editingText[post.id] ?? post.text_content;

  const handleTextChange = (postId: string, text: string) => {
    setEditingText((prev) => ({ ...prev, [postId]: text }));
  };

  const handleSaveText = async (post: EventPost) => {
    const newText = editingText[post.id];
    if (!newText || newText === post.text_content) return;

    try {
      await updatePost.mutateAsync({ id: post.id, text_content: newText });
      Alert.alert(t.postReview.saved);
    } catch {
      Alert.alert(t.common.error, t.postReview.saveError);
    }
  };

  // ── Submit-for-review (approval gate) ────────────────────────────────
  const handleSubmitForApproval = async (post: EventPost) => {
    try {
      // Persist any pending text edits first so admins review the latest copy
      const pendingText = editingText[post.id];
      if (pendingText && pendingText !== post.text_content) {
        await updatePost.mutateAsync({ id: post.id, text_content: pendingText });
      }
      await submitForApproval.mutateAsync({ post_id: post.id });
      Alert.alert(t.postApproval.submitted, t.postApproval.submittedBody);
    } catch (err: any) {
      Alert.alert(t.postApproval.submitError, err?.message || t.common.error);
    }
  };

  const handleConnectAccount = async () => {
    if (!connectAccountName.trim()) {
      Alert.alert('Vul een accountnaam in');
      return;
    }
    setConnecting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Niet ingelogd');
      const accountId = connectAccountUrl.trim() || connectAccountName.trim();
      // Check if account already exists, then update or insert accordingly
      const { data: existingAccount } = await supabase
        .from('social_accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('platform', connectPlatform)
        .eq('platform_account_id', accountId)
        .maybeSingle();

      if (existingAccount) {
        // Update existing account
        const { error: updateErr } = await supabase
          .from('social_accounts')
          .update({
            account_name: connectAccountName.trim(),
            account_type: 'manual',
            status: 'active',
          })
          .eq('id', existingAccount.id);
        if (updateErr) {
          console.error('[connect] Update failed:', updateErr);
          throw new Error(updateErr.message || 'Kon niet verbinden');
        }
      } else {
        // Insert new account
        const { error: insertErr } = await supabase
          .from('social_accounts')
          .insert({
            user_id: user.id,
            platform: connectPlatform,
            account_name: connectAccountName.trim(),
            platform_account_id: accountId,
            account_type: 'manual',
            status: 'active',
          });
        if (insertErr) {
          console.error('[connect] Insert failed:', insertErr);
          throw new Error(insertErr.message || 'Kon niet verbinden');
        }
      }
      Alert.alert('✅ Verbonden', `${connectAccountName} is gekoppeld aan ${channelConfig[connectPlatform as Channel]?.label || connectPlatform}.`);
      setShowConnectModal(false);
      setConnectAccountName('');
      setConnectAccountUrl('');
      // Retry publish with the new account
      if (pendingPublishAll) {
        setPendingPublishAll(false);
        // Re-run Publiceer Alles to check remaining channels
        setTimeout(() => { void handlePublishAll(); }, 500);
      } else if (pendingPublishPost) {
        const accounts = await fetchAccountsForChannel(pendingPublishPost.channel);
        const acc = accounts[0];
        if (acc) doPublish(pendingPublishPost, acc.id, acc);
      }
    } catch (err: any) {
      Alert.alert('Fout', err?.message ?? 'Verbinding mislukt');
    } finally {
      setConnecting(false);
    }
  };

  // ── Bake overlay into image before publishing ─────────────────────────
  // Captures the ViewShot (image + overlay) as a new image, uploads it,
  // and updates the post's branded_image_url with the baked version.
  const bakeOverlayIntoImage = async (post: EventPost): Promise<string | null> => {
    const config = overlayConfig[post.id];
    const needsAmosWatermark = !canHideWatermark(userTier);
    if (!config || (!config.text && !config.showLogo)) {
      // No user-configured overlay — but on free tier we STILL bake the
      // AMOS watermark into the image. Pro+ tiers skip baking entirely.
      if (!needsAmosWatermark) {
        return post.branded_image_url || null;
      }
      // Fall through: bake just the watermark, no user overlay.
    }

    // Wait for ViewShot ref to be available. On duplicated or freshly-
    // inserted posts, the ViewShot may not be mounted yet at the moment
    // the user taps publish — a silent null here meant the post published
    // without the overlay. Retry up to 1s (10×100ms) before giving up.
    let viewShotRef = viewShotRefs.current[post.id];
    if (!viewShotRef) {
      for (let attempt = 0; attempt < 10 && !viewShotRef; attempt++) {
        await new Promise((r) => setTimeout(r, 100));
        viewShotRef = viewShotRefs.current[post.id];
      }
    }
    if (!viewShotRef) {
      console.error('[bakeOverlay] ViewShot ref still null after retry for post', post.id);
      // Fail loudly instead of silently publishing without overlay.
      throw new Error('Overlay kon niet worden verwerkt: preview is nog niet geladen. Scroll naar de post en probeer opnieuw.');
    }

    try {
      // Capture the ViewShot as a local URI
      const uri = await captureRef(viewShotRef as any, {
        format: 'jpg',
        quality: 0.9,
      });

      if (!uri) {
        console.error('[bakeOverlay] captureRef returned empty URI for post', post.id);
        throw new Error('Overlay-snapshot mislukt. Probeer opnieuw.');
      }

      // Upload the baked image to Supabase Storage
      const { url } = await uploadMedia(uri, safeEventId, 'photo');

      // Update the post's branded_image_url with the baked version
      await updatePost.mutateAsync({ id: post.id, branded_image_url: url });

      console.log('[bakeOverlay] Success — baked overlay into image for post', post.id);
      return url;
    } catch (err: any) {
      console.error('[bakeOverlay] Failed:', err.message);
      // Re-throw so doPublish knows the overlay failed and can surface it to the user
      // instead of silently publishing without overlay.
      throw err;
    }
  };

  // Per-category account preference. Driven by captureCategory stored in
  // post.engagement.category at post-creation time (LiveCaptureScreen).
  // Returns 'page' | 'personal' | 'any' indicating which account type to auto-pick.
  const preferredAccountTypeForPost = (post: EventPost): 'page' | 'personal' | 'any' => {
    const cat = (post.engagement as any)?.category;
    if (cat === 'product' || cat === 'organisation' || cat === 'organization') return 'page';
    if (cat === 'inspiration' || cat === 'inspiratie') return 'personal';
    // events, quick, behind_scenes, content, or undefined → no strong preference
    return 'any';
  };

  const handlePublish = async (post: EventPost) => {
    // Check if user has accounts for this channel
    const accounts = await fetchAccountsForChannel(post.channel);
    if (accounts.length === 0) {
      // No accounts — offer to connect one
      setPendingPublishPost(post);
      setPendingPublishAll(false);
      setConnectPlatform(post.channel);
      setShowConnectModal(true);
      return;
    }
    if (accounts.length === 1) {
      // Single account — publish directly
      const acc = accounts[0];
      doPublish(post, acc?.id, acc);
      return;
    }
    // Multiple accounts — ALWAYS show picker so user can consciously choose
    // (the per-category preference is now used to pre-highlight the suggested
    // account in the picker UI, but never to auto-publish without consent).
    setPendingPublishPost(post);
    setAvailableAccounts(accounts);
    setPickerSelectedIds(new Set()); // reset multi-select on each open
    setShowAccountPicker(true);
  };

  // ── Free-tier storage retention: nuke media after successful publish ──
  // Free tier doesn't get a content library. Once the post is live on the
  // social platform, the AMOS-internal copy is deleted to keep Supabase
  // storage costs predictable. Paid tiers retain everything (the archive
  // IS one of the value props of upgrading).
  //
  // Order matters: do this AFTER the publish API call succeeds (so the
  // image URL was reachable by the upstream provider) and AFTER any
  // manual-share deep-link flow (which depends on the URL to still
  // resolve in the user's browser). We skip cleanup entirely for manual
  // channels (snapchat / whatsapp) — those rely on the URL post-publish.
  const cleanupFreeStoragePostPublish = async (post: EventPost) => {
    if (canHideWatermark(userTier)) return; // paid tiers keep their archive
    // Skip cleanup for manual-share platforms — the URL must keep
    // resolving so the user can deep-link share into Snapchat / WhatsApp.
    if (post.channel === 'snapchat' || post.channel === 'whatsapp') return;

    const extractPath = (url: string | null | undefined): string | null => {
      if (!url) return null;
      // Matches both signed (/storage/v1/object/sign/<bucket>/<path>?token=...)
      // and public (/storage/v1/object/public/<bucket>/<path>) URLs.
      const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/media\/([^?]+)/);
      return m?.[1] ?? null;
    };

    const extras: string[] =
      (post.engagement as any)?.extra_images ?? [];
    const urls: (string | null | undefined)[] = [
      post.branded_image_url,
      (post as any).image_url ?? null,
      (post as any).cover_image_url ?? null,
      ...extras,
    ];
    const paths = urls.map(extractPath).filter((p): p is string => !!p);
    if (paths.length === 0) return;

    try {
      const { error } = await supabase.storage.from('media').remove(paths);
      if (error) {
        console.warn('[cleanupFreeStorage] storage.remove returned error:', error.message);
        return; // don't null URLs if delete failed — avoids ghost-broken posts
      }
      // Null out URLs on the post so the UI can render an "archived" tile
      // instead of a broken image. The post itself stays — only the media
      // pointer is wiped.
      await updatePost.mutateAsync({
        id: post.id,
        branded_image_url: null,
      } as any);
      console.log(`[cleanupFreeStorage] removed ${paths.length} object(s) for post ${post.id}`);
    } catch (err: any) {
      console.warn('[cleanupFreeStorage] threw:', err?.message);
      // Fail-open: storage cleanup is best-effort, never blocks publish.
    }
  };

  const doPublish = async (post: EventPost, accountId?: string, account?: any) => {
    // ── Free-tier daily publish cap ─────────────────────────────────────
    // Enforce BEFORE the confirm Alert so the user doesn't see a publish
    // dialog that's going to fail. Server-side mirror should be added to
    // publish-social edge fn for bypass-proof enforcement.
    const dailyCap = postsPerDayLimit(userTier);
    if (dailyCap > 0) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          const todayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { count, error } = await supabase
            .from('event_posts')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('status', 'published')
            .gte('published_at', todayIso);
          if (!error && (count ?? 0) >= dailyCap) {
            Alert.alert(
              'Dagelijkse limiet bereikt',
              dailyCap === 1
                ? 'Je free-tier abonnement staat 1 post per dag toe (op maximaal 3 channels). Upgrade naar Pro voor ongelimiteerd publiceren.'
                : `Je free-tier abonnement staat ${dailyCap} posts per dag toe. Upgrade naar Pro voor ongelimiteerd publiceren.`,
              [
                { text: 'Sluiten', style: 'cancel' },
                {
                  text: 'Upgrade',
                  onPress: () => Linking.openURL('https://marketing.inclufy.com/pricing?upgrade=daily-cap'),
                },
              ],
            );
            return;
          }
        }
      } catch {
        // Fail-open on count errors — Postgres outage shouldn't block paid users
        // by blocking the count query that returns nothing meaningful anyway.
      }
    }

    const accountLabel = account?.account_name || account?.platform_account_id;
    const confirmMsg = accountLabel
      ? `Publiceren op ${channelConfig[post.channel]?.label} als "${accountLabel}"?`
      : `${t.postReview.publishOn} ${channelConfig[post.channel]?.label}?`;
    Alert.alert(
      confirmMsg,
      t.postReview.publishConfirm,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.postReview.publishButton,
          onPress: async () => {
            try {
              // Bake overlay into image before publishing (if configured)
              await bakeOverlayIntoImage(post);

              // Save any pending text changes first
              if (editingText[post.id]) {
                await updatePost.mutateAsync({ id: post.id, text_content: editingText[post.id] });
              }
              // Save account info in engagement for display
              if (account) {
                const eng = { ...(post.engagement ?? { likes: 0, comments: 0, shares: 0 }) };
                (eng as any).published_account = {
                  id: account.id,
                  name: account.account_name || account.platform_account_id,
                  type: account.account_type,
                  image_url: account.profile_image_url,
                };
                await updatePost.mutateAsync({ id: post.id, engagement: eng });
                setPublishedAccounts((prev) => ({
                  ...prev,
                  [post.id]: {
                    name: account.account_name || account.platform_account_id,
                    type: account.account_type,
                    imageUrl: account.profile_image_url,
                  },
                }));
              }
              const pubResult = await publishPost.mutateAsync(post.id);
              if ((pubResult as any)?.manual) {
                // Build the post text once for clipboard + deep-link reuse
                const postText = post.text_content + ((post.hashtags?.length ?? 0) > 0 ? '\n\n' + post.hashtags.join(' ') : '');
                const platformLabel = channelConfig[post.channel]?.label ?? post.channel;

                // Per-channel manual-share configuration
                type ManualConfig = {
                  appUrl?: string;        // native deep-link (preferred)
                  webFallback: string;    // browser fallback
                  buttonLabel: string;
                  copyOnTap: boolean;     // copy text to clipboard before opening app
                };
                const MANUAL_CONFIG: Record<string, ManualConfig | undefined> = {
                  whatsapp: {
                    appUrl: `whatsapp://send?text=${encodeURIComponent(postText)}`,
                    webFallback: `https://wa.me/?text=${encodeURIComponent(postText)}`,
                    buttonLabel: 'Open WhatsApp',
                    copyOnTap: false,
                  },
                  snapchat: {
                    // Snap Kit Creative Kit SDK was deprecated 2023; pure URL-scheme
                    // can only open the app. We copy the post text to clipboard so
                    // user can paste it as a Snap text/sticker after Snap opens.
                    appUrl: 'snapchat://',
                    webFallback: 'https://www.snapchat.com/',
                    buttonLabel: 'Open Snapchat',
                    copyOnTap: true,
                  },
                };
                const manualConfig = MANUAL_CONFIG[post.channel];

                if (manualConfig) {
                  const manualMsg = manualConfig.copyOnTap
                    ? `Post-tekst is naar je klembord gekopieerd. ${platformLabel} opent nu — plak de tekst in je nieuwe post.`
                    : `Post is opgeslagen als gepubliceerd. Tap "${manualConfig.buttonLabel}" om de tekst te delen.`;
                  Alert.alert(
                    '📋 Klaar om te delen',
                    manualMsg,
                    [
                      { text: 'OK', style: 'cancel' },
                      {
                        text: manualConfig.buttonLabel,
                        onPress: async () => {
                          try {
                            if (manualConfig.copyOnTap) {
                              const Clipboard = await import('expo-clipboard');
                              await Clipboard.setStringAsync(postText);
                            }
                            const url = manualConfig.appUrl ?? manualConfig.webFallback;
                            const supported = await Linking.canOpenURL(url);
                            await Linking.openURL(supported ? url : manualConfig.webFallback);
                          } catch (e) {
                            await Linking.openURL(manualConfig.webFallback).catch(() => {});
                          }
                        },
                      },
                    ],
                  );
                } else {
                  // Generic fallback for any future manual-share platform without specific deep-link
                  const manualMsg = `Post is opgeslagen als gepubliceerd. Kopieer de tekst en plak deze handmatig op ${platformLabel}.\n\nVoor automatisch publiceren: koppel je account via OAuth in Instellingen.`;
                  Alert.alert('📋 Klaar om te posten', manualMsg);
                }
              } else {
                // Feature B: build live URL button for every supported channel.
                // Prefers the platform-supplied permalink/liveUrl from the edge function;
                // otherwise falls back to a deterministic URL constructed from postId.
                const publishedPostId: string | null | undefined = (pubResult as any)?.postId ?? null;
                const serverLiveUrl: string | null = (pubResult as any)?.liveUrl ?? (pubResult as any)?.permalink ?? null;
                const liveUrl = (() => {
                  if (serverLiveUrl) return serverLiveUrl;
                  if (!publishedPostId) return null;
                  const ch = post.channel?.toLowerCase();
                  if (ch === 'linkedin') return `https://www.linkedin.com/feed/update/urn:li:activity:${publishedPostId}/`;
                  if (ch === 'facebook') return `https://www.facebook.com/${publishedPostId}`;
                  if (ch === 'pinterest') return `https://www.pinterest.com/pin/${publishedPostId}/`;
                  // IG, Threads, TikTok rely on platform-supplied permalink/liveUrl.
                  return null;
                })();
                const platformLabel = channelConfig[post.channel]?.label ?? post.channel;
                // Build success message, appending first-comment status if relevant
                const firstCommentStatus: string | undefined = (pubResult as any)?.firstComment;
                let successMsg = `Post is gepubliceerd op ${platformLabel}${accountLabel ? ` als "${accountLabel}"` : ''}.`;
                if (firstCommentStatus === 'posted') {
                  successMsg += '\n\n\uD83D\uDCAC Eerste reactie geplaatst.';
                } else if (firstCommentStatus === 'failed') {
                  successMsg += '\n\n\u26A0\uFE0F Eerste reactie mislukt \u2014 plaats handmatig.';
                }
                if (liveUrl) {
                  Alert.alert('✅ Gepubliceerd', successMsg, [
                    { text: 'OK', style: 'cancel' },
                    {
                      text: `Bekijk op ${platformLabel}`,
                      onPress: () => Linking.openURL(liveUrl),
                    },
                  ]);
                } else {
                  Alert.alert('✅ Gepubliceerd', successMsg);
                }
                // Fire-and-forget: free-tier storage cleanup. Runs after the
                // success alert so the user is not blocked by network latency.
                void cleanupFreeStoragePostPublish(post);
              }
            } catch (err: any) {
              if (err?.message === 'SOCIAL_NOT_CONNECTED') {
                Alert.alert(
                  '⚠️ Geen sociale media verbinding',
                  `Post is opgeslagen als "Goedgekeurd" maar nog niet gepubliceerd op ${channelConfig[post.channel]?.label}.\n\nVerbind je social media accounts via Instellingen → Social Media om automatisch te publiceren.`,
                  [{ text: 'OK' }]
                );
              } else if (
                err?.message === 'TOKEN_EXPIRED' ||
                err?.message?.includes('TOKEN_EXPIRED') ||
                err?.message?.includes('reconnect') ||
                err?.message?.includes('verlopen')
              ) {
                Alert.alert(
                  '🔑 Token verlopen',
                  err?.userMessage ||
                  `Je ${channelConfig[post.channel]?.label} verbinding is verlopen.\n\nGa naar Instellingen → Social Media en koppel je account opnieuw.`,
                  [{ text: 'OK' }]
                );
              } else if (err?.message?.includes('afbeelding') || err?.message?.includes('image')) {
                Alert.alert(
                  '📸 Afbeelding vereist',
                  `Instagram vereist een afbeelding bij elke post.\n\nVoeg een foto toe en probeer opnieuw.`,
                  [{ text: 'OK' }]
                );
              } else {
                Alert.alert(
                  t.common.error,
                  err?.message || t.postReview.publishError,
                );
              }
            }
          },
        },
      ],
    );
  };

  const handlePublishAll = async () => {
    const draftPosts = posts.filter((p) => p.status === 'draft' || p.status === 'approved');
    if (draftPosts.length === 0) {
      Alert.alert(t.postReview.noDrafts);
      return;
    }

    // ─── Removed pre-flight blockade ────────────────────────────────────────
    // The previous version checked all channels for accounts and aborted the
    // ENTIRE publish-all if any one was missing. That meant tapping "Later" on
    // (e.g.) the Snapchat connect-modal cancelled Facebook + LinkedIn + IG too.
    // New behaviour: per-post check inside the loop, missing-account becomes a
    // recorded failure with canReconnect=true, other channels still publish.

    Alert.alert(
      `${t.postReview.publishAll} ${draftPosts.length} posts?`,
      t.postReview.publishAllConfirm,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.postReview.publishAll,
          onPress: async () => {
            // Feature A: iterate every post individually; one failure must not abort the rest.
            const succeeded: EventPost[] = [];
            const failed: Array<{ post: EventPost; error: string; canReconnect: boolean }> = [];

            for (const post of draftPosts) {
              try {
                // Per-post pre-flight: skip channels with no account, record as failure.
                const accountsForPost = await fetchAccountsForChannel(post.channel);
                if (accountsForPost.length === 0) {
                  const label = channelConfig[post.channel]?.label ?? post.channel;
                  failed.push({
                    post,
                    error: `Geen ${label} account gekoppeld`,
                    canReconnect: true,
                  });
                  continue;
                }
                // Bake overlay (throws on hard failure; non-critical path already returns null)
                await bakeOverlayIntoImage(post);
                // Save any pending text edit before publishing
                if (editingText[post.id]) {
                  await updatePost.mutateAsync({ id: post.id, text_content: editingText[post.id] });
                }
                await publishPost.mutateAsync(post.id);
                succeeded.push(post);
              } catch (err: any) {
                // Fetch the publish_error from DB for a richer message (may be null, use err.message fallback)
                let errMsg: string = err?.message || 'Onbekende fout';
                try {
                  const { data: dbPost } = await supabase
                    .from('go_posts')
                    .select('publish_error')
                    .eq('id', post.id)
                    .single();
                  if (dbPost?.publish_error) errMsg = dbPost.publish_error;
                } catch { /* ignore — use errMsg already set */ }
                // Token-related errors are also reconnectable.
                const lower = errMsg.toLowerCase();
                const canReconnect =
                  lower.includes('token') ||
                  lower.includes('oauth') ||
                  lower.includes('expired') ||
                  lower.includes('verlopen') ||
                  lower.includes('account') ||
                  lower.includes('verbinding');
                failed.push({ post, error: errMsg, canReconnect });
              }
            }

            // Manual-share-only channels (no OAuth API): Snapchat + WhatsApp.
            // These shouldn't appear as "Mislukte posts" — they're a separate
            // class that needs the user to copy/paste or use a deep-link.
            const MANUAL_ONLY_CHANNELS = new Set(['snapchat', 'whatsapp']);
            const manualPending = failed.filter((f) => MANUAL_ONLY_CHANNELS.has(f.post.channel));
            const realFailed = failed.filter((f) => !MANUAL_ONLY_CHANNELS.has(f.post.channel));

            const total = draftPosts.length;
            const nOk = succeeded.length;
            const nFail = realFailed.length;
            const nManual = manualPending.length;

            // ─── Always show summary (no auto-open connect modal on all-fail) ──
            const buildDetails = () =>
              realFailed
                .map((f) => `• ${channelConfig[f.post.channel]?.label ?? f.post.channel}: ${f.error}`)
                .join('\n');

            const reconnectableFailures = realFailed.filter((f) => f.canReconnect);

            const showFailedDetailsWithReconnect = () => {
              const details = buildDetails();
              if (reconnectableFailures.length === 0) {
                Alert.alert('Mislukte posts', details || 'Geen API-fouten.');
                return;
              }
              const first = reconnectableFailures[0];
              const firstLabel = channelConfig[first.post.channel]?.label ?? first.post.channel;
              Alert.alert(
                'Mislukte posts',
                `${details}\n\n${reconnectableFailures.length === 1
                  ? `Wil je ${firstLabel} nu koppelen?`
                  : `${reconnectableFailures.length} kanalen kunnen opnieuw verbonden worden. Wil je beginnen met ${firstLabel}?`}`,
                [
                  { text: 'Sluiten', style: 'cancel' },
                  {
                    text: `${firstLabel} koppelen`,
                    onPress: () => {
                      setPendingPublishPost(first.post);
                      setPendingPublishAll(false); // user explicitly chose this single channel
                      setConnectPlatform(first.post.channel);
                      setShowConnectModal(true);
                    },
                  },
                ],
              );
            };

            // Build a status line that includes manual-pending separately
            // so users see "3 gepubliceerd, 1 mislukt, 2 klaar voor handmatig delen"
            // instead of the confusing all-in-one count.
            const statusLine =
              `${nOk}/${total} gepubliceerd`
              + (nFail > 0 ? `, ${nFail} mislukt` : '')
              + (nManual > 0 ? `, ${nManual} klaar voor handmatig delen` : '')
              + '.';

            const buttons: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }> = [
              { text: 'OK', style: 'cancel' },
            ];
            if (nFail > 0) {
              buttons.push({ text: 'Bekijk fouten', onPress: showFailedDetailsWithReconnect });
            }
            if (nManual > 0) {
              buttons.push({
                text: `Handmatig delen (${nManual})`,
                onPress: () => {
                  // Open the first manual channel; user can then come back for the next.
                  const firstManual = manualPending[0];
                  // Trigger the existing single-post manual share path by re-invoking
                  // publish flow on this post; the post-level logic already handles
                  // snapchat/whatsapp via deep-link/clipboard.
                  publishPost.mutateAsync(firstManual.post.id).catch(() => {
                    // Best-effort — single-post publish opens the right share UI.
                  });
                },
              });
            }

            if (nFail === 0 && nManual === 0) {
              // All succeeded
              Alert.alert(t.postReview.publishAllSuccess);
            } else if (nOk === 0 && nFail > 0) {
              // No API publishes worked
              Alert.alert(
                t.common.error,
                `0/${total} gepubliceerd. ${nFail} mislukt${nManual > 0 ? `, ${nManual} klaar voor handmatig delen` : ''}.`,
                buttons,
              );
            } else {
              // Mixed success / partial
              Alert.alert(statusLine, undefined, buttons);
            }
          },
        },
      ],
    );
  };

  const scrollToIndex = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    setActiveIndex(index);
  };

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View style={styles.loading}>
        <Text style={styles.emptyText}>{t.postReview.noPostsFound}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Channel Tabs — horizontal scroll so each tab fits its label on one line */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.channelTabs}
        contentContainerStyle={styles.channelTabsContent}
      >
        {posts.map((post, index) => {
          const config = channelConfig[post.channel];
          const isActive = index === activeIndex;
          return (
            <TouchableOpacity
              key={post.id}
              style={[
                styles.channelTab,
                isActive && { borderBottomColor: config?.color || colors.primary },
              ]}
              onPress={() => scrollToIndex(index)}
            >
              <Ionicons name={config?.icon as any} size={18} color={config?.color || colors.textSecondary} />
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[
                  styles.channelLabel,
                  isActive && { color: config?.color, fontWeight: fontWeight.semibold },
                ]}
              >
                {config?.label || post.channel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Horizontal Pager */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setActiveIndex(index);
        }}
      >
        {posts.map((post) => {
          const config = channelConfig[post.channel];
          const isVideo = mediaType === 'video';
          const isAudio = mediaType === 'audio';

          // For photos: try localMediaUri → branded_image_url → captureImageUrl
          // For video/audio: no image to show — render a dedicated media card instead
          const brandedOk = post.branded_image_url && !failedUrls.has(post.branded_image_url);
          const fallbackImageUrl = isVideo || isAudio
            ? null
            : (localMediaUri ||
               (brandedOk ? post.branded_image_url : null) ||
               captureImageUrl ||
               null);

          // Multi-image: build ordered list and pick the active one
          const postImages = isVideo || isAudio ? [] : getPostImages(post, fallbackImageUrl).map(
            url => refreshedUrls[url] || url // Use refreshed signed URL if available
          );
          const currentImgIdx = activeImageIndex[post.id] ?? 0;
          const safeIdx = Math.min(currentImgIdx, Math.max(0, postImages.length - 1));
          const imageUrl = postImages[safeIdx] ?? null;
          const imageFailed = imageUrl ? failedUrls.has(imageUrl) : false;

          return (
            <ScrollView
              key={post.id}
              style={{ width: SCREEN_WIDTH }}
              contentContainerStyle={styles.postContent}
            >
              {/* Media preview */}
              {isVideo ? (
                captureImageUrl ? (
                  <View style={[styles.imagePlaceholder, { backgroundColor: '#000', padding: 0, overflow: 'hidden' }]}>
                    <VideoPreview source={captureImageUrl} style={{ width: '100%', height: '100%' }} />
                    <TouchableOpacity
                      style={[styles.addImageBtn, { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.6)' }]}
                      onPress={() => handleAddExtraImage(post)}
                      disabled={uploadingImage}
                    >
                      {uploadingImage
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <ImageIcon size={15} color="#fff" weight="duotone" />
                            <Text style={[styles.addImageBtnText, { color: '#fff' }]}>Thumbnail</Text>
                          </View>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={[styles.imagePlaceholder, { backgroundColor: '#0a0a0a' }]}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.imagePlaceholderText, { color: 'rgba(255,255,255,0.6)', marginTop: 8 }]}>
                      Video laden...
                    </Text>
                  </View>
                )
              ) : isAudio ? (
                // Audio capture — show a branded audio card
                <View style={[styles.imagePlaceholder, { backgroundColor: '#0a0a0a' }]}>
                  <View style={{
                    width: 64, height: 64, borderRadius: 32,
                    backgroundColor: 'rgba(124,58,237,0.2)',
                    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
                  }}>
                    <Microphone size={32} color={colors.primary} weight="duotone" />
                  </View>
                  <Text style={[styles.imagePlaceholderText, { color: '#fff', fontWeight: fontWeight.semibold, fontSize: fontSize.md }]}>
                    Audio opname
                  </Text>
                  <Text style={[styles.imagePlaceholderText, { color: 'rgba(255,255,255,0.5)' }]}>
                    Voeg optioneel een afbeelding toe
                  </Text>
                  <TouchableOpacity style={styles.addImageBtn} onPress={() => handleAddExtraImage(post)} disabled={uploadingImage}>
                    {uploadingImage
                      ? <ActivityIndicator size="small" color={colors.primary} />
                      : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <ImageIcon size={15} color={colors.primary} weight="duotone" />
                          <Text style={styles.addImageBtnText}>Afbeelding toevoegen</Text>
                        </View>}
                  </TouchableOpacity>
                </View>
              ) : imageUrl && !imageFailed ? (
                <>
                  <ViewShot
                    ref={(ref: ViewShot | null) => { viewShotRefs.current[post.id] = ref; }}
                    options={{ format: 'jpg', quality: 0.9 }}
                  >
                  <TouchableOpacity
                    style={styles.postImageWrapper}
                    activeOpacity={0.92}
                    onPress={() => setZoomImageUrl(imageUrl)}
                  >
                    <Image
                      source={{ uri: imageUrl }}
                      style={styles.postImage}
                      resizeMode="cover"
                      onError={async () => {
                        // Try refreshing signed URL before marking as failed
                        if (imageUrl.includes('supabase') && !refreshedUrls[imageUrl]) {
                          const freshUrl = await refreshSignedUrl(imageUrl);
                          if (freshUrl !== imageUrl) return; // Will re-render with fresh URL
                        }
                        setFailedUrls((prev) => new Set([...prev, imageUrl]));
                        if (imageUrl === captureImageUrl) {
                          queryClient.invalidateQueries({ queryKey: ['capture-image-url', captureId, storagePath] });
                        }
                      }}
                    />
                    {/* Image count badge */}
                    {postImages.length > 1 && (
                      <View style={{
                        position: 'absolute', top: 8, left: 8,
                        backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10,
                        paddingHorizontal: 8, paddingVertical: 3,
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                      }}>
                        <Images size={11} color="#fff" weight="duotone" />
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>
                          {safeIdx + 1}/{postImages.length}
                        </Text>
                      </View>
                    )}
                    {/* ── Overlay rendering ── */}
                    {overlayConfig[post.id] && (
                      <>
                        {overlayConfig[post.id].text && overlayConfig[post.id].textPosition === 'top' && (
                          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.52)', paddingHorizontal: 10, paddingVertical: 7, borderTopLeftRadius: borderRadius.lg, borderTopRightRadius: borderRadius.lg }}>
                            <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold }} numberOfLines={2}>{overlayConfig[post.id].text}</Text>
                          </View>
                        )}
                        {overlayConfig[post.id].showLogo && (() => {
                          const lp = overlayConfig[post.id].logoPosition;
                          const lt = overlayConfig[post.id].logoType ?? 'brand';
                          const posStyle = lp === 'top-left' ? { top: 8, left: 8 } :
                                           lp === 'top-right' ? { top: 8, right: 8 } :
                                           lp === 'bottom-left' ? { bottom: 28, left: 8 } :
                                           { bottom: 28, right: 8 };
                          const logos: string[] = [];
                          if ((lt === 'brand' || lt === 'both') && brandLogoUrl) logos.push(brandLogoUrl);
                          if ((lt === 'event' || lt === 'both') && eventLogoUrl) logos.push(eventLogoUrl);
                          // Sponsor / partner logos appended after brand+event
                          const extras = overlayConfig[post.id].extraLogos ?? [];
                          extras.forEach((u) => { if (u) logos.push(u); });
                          return (
                            <View style={{ position: 'absolute', ...posStyle, flexDirection: 'row', gap: 4, flexWrap: 'wrap', maxWidth: '70%' }}>
                              {logos.length > 0 ? logos.map((lurl, li) => (
                                <Image key={`${lurl}-${li}`} source={{ uri: lurl }} style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.4)' }} resizeMode="contain" />
                              )) : (
                                <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: 6 }}>
                                  <Buildings size={16} color="#fff" weight="duotone" />
                                </View>
                              )}
                            </View>
                          );
                        })()}
                        {overlayConfig[post.id].text && overlayConfig[post.id].textPosition === 'bottom' && (
                          <View style={{ position: 'absolute', bottom: 22, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.52)', paddingHorizontal: 10, paddingVertical: 7 }}>
                            <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold }} numberOfLines={2}>{overlayConfig[post.id].text}</Text>
                          </View>
                        )}
                      </>
                    )}
                    {/* ── AMOS watermark — DISABLED 2026-05-18 ──
                        Multiple iterations (V1 require+image, V2 inline text,
                        V3 minimal View+Text) all crashed PostReview render on
                        iOS Hermes with TypeError "undefined is not a function".
                        Root cause not pinpointed without source-maps.
                        Re-enable via image-bake (ImageManipulator + hosted
                        watermark PNG) in a future sprint — bypasses JSX
                        render path entirely. */}
                  </TouchableOpacity>
                  </ViewShot>
                  {/* Zoom-hint intentionally rendered OUTSIDE the ViewShot so it
                      is NOT baked into the published image. */}
                  <View style={[styles.zoomHint, { position: 'absolute', right: 8, bottom: 8 }]} pointerEvents="none">
                    <ArrowsOutSimple size={14} color="#fff" weight="bold" />
                  </View>

                  {/* ── Thumbnail strip ────────────────────────────────── */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}
                  >
                    {postImages.map((thumbUrl, i) => (
                      <TouchableOpacity
                        key={`${thumbUrl}-${i}`}
                        onPress={() => setActiveImageIndex((prev) => ({ ...prev, [post.id]: i }))}
                        activeOpacity={0.8}
                      >
                        <Image
                          source={{ uri: thumbUrl }}
                          style={{
                            width: 58, height: 58,
                            borderRadius: 8,
                            borderWidth: i === safeIdx ? 2.5 : 1,
                            borderColor: i === safeIdx ? (config?.color || colors.primary) : colors.border,
                            opacity: failedUrls.has(thumbUrl) ? 0.3 : 1,
                          }}
                          resizeMode="cover"
                          onError={async () => {
                            // Try refreshing the signed URL before marking as failed
                            if (thumbUrl.includes('supabase') && !refreshedUrls[thumbUrl]) {
                              const freshUrl = await refreshSignedUrl(thumbUrl);
                              if (freshUrl !== thumbUrl) return; // Will re-render with fresh URL
                            }
                            setFailedUrls((prev) => new Set([...prev, thumbUrl]));
                          }}
                        />
                        {i === safeIdx && (
                          <View style={{
                            position: 'absolute', bottom: 3, right: 3,
                            backgroundColor: config?.color || colors.primary,
                            borderRadius: 6, width: 12, height: 12,
                            justifyContent: 'center', alignItems: 'center',
                          }}>
                            <Check size={8} color="#fff" weight="bold" />
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                    {/* Add more images button */}
                    <TouchableOpacity
                      onPress={() => handleAddExtraImage(post)}
                      disabled={uploadingImage}
                      style={{
                        width: 58, height: 58, borderRadius: 8,
                        borderWidth: 1.5, borderColor: colors.primary + '60',
                        borderStyle: 'dashed',
                        justifyContent: 'center', alignItems: 'center',
                        backgroundColor: colors.primary + '08',
                      }}
                    >
                      {uploadingImage
                        ? <ActivityIndicator size="small" color={colors.primary} />
                        : <Plus size={22} color={colors.primary} weight="bold" />}
                    </TouchableOpacity>
                  </ScrollView>
                </>
              ) : imageIsLoading ? (
                <View style={styles.imagePlaceholder}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.imagePlaceholderText}>Afbeelding laden...</Text>
                </View>
              ) : (
                // No image yet — let user attach from the library
                <View style={styles.imagePlaceholder}>
                  <ImageIcon size={40} color={colors.textTertiary} weight="duotone" />
                  <Text style={styles.imagePlaceholderText}>Geen afbeelding beschikbaar</Text>
                  <TouchableOpacity
                    style={styles.addImageBtn}
                    onPress={() => handleAddExtraImage(post)}
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <UploadSimple size={15} color={colors.primary} weight="duotone" />
                        <Text style={styles.addImageBtnText}>Voeg afbeelding toe</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* ── Image toolbar: overlay editor + flip (photo only) ── */}
              {/* Overlay & flip available for all capture types with images */}
              {(
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {/* Overlay editor */}
                  <TouchableOpacity
                    onPress={() => openOverlayEditor(post)}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      borderWidth: 1.5, borderColor: colors.primary + '70', borderRadius: borderRadius.md,
                      paddingVertical: 9, backgroundColor: colors.primary + '08',
                    }}
                  >
                    <PencilLine size={15} color={colors.primary} weight="duotone" />
                    <Text style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold }}>
                      {overlayConfig[post.id]?.text || overlayConfig[post.id]?.showLogo
                        ? 'Overlay aanpassen'
                        : 'Tekst / logo toevoegen'}
                    </Text>
                    {(overlayConfig[post.id]?.text || overlayConfig[post.id]?.showLogo) && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
                    )}
                  </TouchableOpacity>

                  {/* Rotate + Flip image */}
                  {imageUrl ? (
                    <>
                      <TouchableOpacity
                        onPress={() => handleRotateImage(post, imageUrl)}
                        disabled={rotatingImage}
                        style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                          borderWidth: 1.5, borderColor: colors.border, borderRadius: borderRadius.md,
                          paddingVertical: 9, paddingHorizontal: 14,
                          backgroundColor: colors.surface,
                        }}
                      >
                        {rotatingImage
                          ? <ActivityIndicator size="small" color={colors.primary} />
                          : <>
                              <ArrowsClockwise size={15} color={colors.textSecondary} weight="bold" />
                              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium }}>Draaien</Text>
                            </>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleFlipImage(post, imageUrl)}
                        disabled={flippingImage}
                        style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                          borderWidth: 1.5, borderColor: colors.border, borderRadius: borderRadius.md,
                          paddingVertical: 9, paddingHorizontal: 14,
                          backgroundColor: colors.surface,
                        }}
                      >
                        {flippingImage
                          ? <ActivityIndicator size="small" color={colors.primary} />
                          : <>
                              <ArrowsLeftRight size={15} color={colors.textSecondary} weight="regular" />
                              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium }}>Spiegelen</Text>
                            </>}
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>
              )}

              {/* Status badge + account info */}
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: (colors as any)[post.status] + '20' },
                  ]}
                >
                  <Text style={[styles.statusText, { color: (colors as any)[post.status] }]}>
                    {post.status}
                  </Text>
                </View>
                <Text style={styles.channelBadge}>
                  {config?.label || post.channel}
                </Text>
                {/* Show which account was used */}
                {(() => {
                  const acc = publishedAccounts[post.id] || (post.engagement as any)?.published_account;
                  if (!acc) return null;
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                      <Text style={{ color: colors.textTertiary, fontSize: fontSize.xs }}>·</Text>
                      {(acc.imageUrl || (acc as any).image_url) ? (
                        <Image source={{ uri: acc.imageUrl || (acc as any).image_url }} style={{ width: 14, height: 14, borderRadius: 7 }} />
                      ) : (
                        <UserCircle size={14} color={colors.textTertiary} weight="duotone" />
                      )}
                      <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: fontWeight.medium }}>
                        {acc.name}
                      </Text>
                      <Text style={{ color: colors.textTertiary, fontSize: 9 }}>
                        {acc.type === 'page' ? '🏢' : acc.type === 'business' ? '💼' : '👤'}
                      </Text>
                    </View>
                  );
                })()}
              </View>

              {/* ── Rejection banner (when admin rejected a previously-submitted post) ── */}
              {(() => {
                const rejReason = (post as any).rejection_reason as string | null | undefined;
                const rejAt = (post as any).rejected_at as string | null | undefined;
                if (post.status !== 'draft' || !rejReason) return null;
                const rejDateLabel = rejAt
                  ? new Date(rejAt).toLocaleDateString()
                  : '';
                return (
                  <View
                    style={{
                      backgroundColor: colors.error + '15',
                      borderLeftWidth: 4,
                      borderLeftColor: colors.error,
                      borderRadius: borderRadius.md,
                      padding: spacing.sm,
                      marginVertical: spacing.xs,
                      gap: 4,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <XCircle size={16} color={colors.error} weight="fill" />
                      <Text style={{ color: colors.error, fontSize: fontSize.sm, fontWeight: fontWeight.bold }}>
                        {t.postApproval.rejected}{rejDateLabel ? ` · ${rejDateLabel}` : ''}
                      </Text>
                    </View>
                    <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>
                      {t.postApproval.rejectionReason}:
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 18 }}>
                      {rejReason}
                    </Text>
                    <Text style={{ color: colors.textTertiary, fontSize: fontSize.xs, fontStyle: 'italic', marginTop: 2 }}>
                      {t.postApproval.editAndResubmit}
                    </Text>
                  </View>
                );
              })()}

              {/* ── Language select ─────────────────────────────────── */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Globe size={14} color={colors.textTertiary} weight="duotone" />
                {LANG_OPTIONS.map((lang) => {
                  const isActive = (postLang[post.id] || 'nl') === lang.code;
                  const isLoading = translating === post.id && isActive;
                  return (
                    <TouchableOpacity
                      key={lang.code}
                      onPress={() => handleSelectLang(post, lang.code)}
                      disabled={translating === post.id}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: isActive ? config?.color || colors.primary : colors.border,
                        backgroundColor: isActive ? (config?.color || colors.primary) + '18' : 'transparent',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      {isLoading
                        ? <ActivityIndicator size={10} color={config?.color || colors.primary} />
                        : <Text style={{ fontSize: 11 }}>{lang.flag}</Text>}
                      <Text style={{
                        fontSize: 11,
                        fontWeight: isActive ? fontWeight.bold : fontWeight.medium,
                        color: isActive ? config?.color || colors.primary : colors.textSecondary,
                      }}>{lang.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Editable text */}
              <TextInput
                style={styles.textEdit}
                value={getEditedText(post)}
                onChangeText={(text) => handleTextChange(post.id, text)}
                onBlur={() => handleSaveText(post)}
                multiline
                placeholder={t.postReview.postTextPlaceholder}
                placeholderTextColor={colors.textTertiary}
              />

              {/* ── Tagging toolbar ──────────────────────────────────── */}
              {(() => {
                const isLinkedIn = post.channel === 'linkedin';
                const isInstagram = post.channel === 'instagram';
                const tagItems = [
                  ...(isLinkedIn || isInstagram ? [
                    { icon: 'person-outline' as const, label: 'Persoon', insert: '@' },
                  ] : []),
                  ...(isLinkedIn ? [
                    { icon: 'business-outline' as const, label: 'Bedrijf', insert: '@' },
                  ] : []),
                  { icon: 'location-outline' as const, label: 'Locatie', insert: '📍 ' },
                  { icon: 'at-outline' as const, label: 'Hashtag', insert: '#' },
                ];
                const isLuxury = getTextStyle(post.id) === 'luxury';
                return (
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 4, marginTop: 2 }}>
                    {tagItems.map(({ icon, label, insert }) => (
                      <TouchableOpacity
                        key={label}
                        onPress={() => {
                          const current = editingText[post.id] ?? post.text_content ?? '';
                          const needsSpace = current.length > 0 && !current.endsWith(' ') && !current.endsWith('\n');
                          handleTextChange(post.id, current + (needsSpace ? ' ' : '') + insert);
                        }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          paddingHorizontal: 10, paddingVertical: 5,
                          borderRadius: borderRadius.full,
                          backgroundColor: colors.surface,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Ionicons name={icon} size={13} color={config?.color || colors.primary} />
                        <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: fontWeight.medium }}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {/* Luxury icons toggle */}
                    <TouchableOpacity
                      onPress={() => toggleTextStyle(post)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        paddingHorizontal: 10, paddingVertical: 5,
                        borderRadius: borderRadius.full,
                        backgroundColor: isLuxury ? (config?.color || colors.primary) + '18' : colors.surface,
                        borderWidth: 1,
                        borderColor: isLuxury ? (config?.color || colors.primary) : colors.border,
                      }}
                    >
                      <Ionicons
                        name={isLuxury ? 'sparkles' : 'text-outline'}
                        size={13}
                        color={isLuxury ? (config?.color || colors.primary) : colors.textSecondary}
                      />
                      <Text style={{
                        fontSize: 11,
                        fontWeight: isLuxury ? fontWeight.bold : fontWeight.medium,
                        color: isLuxury ? (config?.color || colors.primary) : colors.textSecondary,
                      }}>
                        {isLuxury ? '✨ Luxe' : 'Plat'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}

              {/* ── Instagram format picker (feed / story / reel) ────── */}
              {post.channel === 'instagram' && (() => {
                const igFmt = igFormatDraft[post.id] ?? 'feed';
                // Reel REQUIRES a video; disable the chip when capture is photo/audio.
                // Story works with both image+video, so always allowed.
                const reelDisabled = mediaType !== 'video';
                const IG_FORMATS: Array<{ value: 'feed' | 'story' | 'reel'; label: string; icon: string; disabled?: boolean; disabledReason?: string }> = [
                  { value: 'feed', label: 'Feed', icon: 'grid-outline' },
                  { value: 'story', label: 'Story', icon: 'phone-portrait-outline' },
                  {
                    value: 'reel',
                    label: 'Reel',
                    icon: 'film-outline',
                    disabled: reelDisabled,
                    disabledReason: 'Reel vereist video',
                  },
                ];
                const hint = igFmt === 'story'
                  ? 'Story: geen caption, alleen afbeelding of video'
                  : igFmt === 'reel'
                  ? 'Reel: alleen video (15-90s)'
                  : null;
                return (
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <InstagramLogo size={14} color={config?.color || '#E4405F'} weight="fill" />
                      <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: fontWeight.medium }}>
                        Formaat
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {IG_FORMATS.map(({ value, label, icon, disabled, disabledReason }) => {
                        const isActive = igFmt === value;
                        const isDisabled = !!disabled;
                        return (
                          <TouchableOpacity
                            key={value}
                            disabled={isDisabled}
                            onPress={() => {
                              if (isDisabled) {
                                Alert.alert(
                                  `${label} niet beschikbaar`,
                                  disabledReason || `${label} is niet beschikbaar voor dit mediatype.`,
                                );
                                return;
                              }
                              handleIgFormatChange(post, value);
                            }}
                            style={{
                              flex: 1,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4,
                              paddingVertical: 7,
                              borderRadius: borderRadius.md,
                              borderWidth: 1.5,
                              borderColor: isActive ? (config?.color || '#E4405F') : colors.border,
                              backgroundColor: isActive ? (config?.color || '#E4405F') + '18' : 'transparent',
                              opacity: isDisabled ? 0.4 : 1,
                            }}
                          >
                            <Ionicons
                              name={icon as any}
                              size={13}
                              color={isActive ? (config?.color || '#E4405F') : colors.textSecondary}
                            />
                            <Text style={{
                              fontSize: 11,
                              fontWeight: isActive ? fontWeight.bold : fontWeight.medium,
                              color: isActive ? (config?.color || '#E4405F') : colors.textSecondary,
                            }}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {hint && (
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        backgroundColor: (config?.color || '#E4405F') + '12',
                        borderRadius: borderRadius.sm,
                        paddingHorizontal: 10, paddingVertical: 6,
                      }}>
                        <Info size={13} color={config?.color || '#E4405F'} weight="regular" />
                        <Text style={{ fontSize: 11, color: config?.color || '#E4405F', fontWeight: fontWeight.medium }}>
                          {hint}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* Hashtags — strip any leading # already present before adding one */}
              {(post.hashtags?.length ?? 0) > 0 && (
                <Text style={styles.hashtags}>
                  {(post.hashtags || []).map((h) => `#${h.replace(/^#+/, '')}`).join(' ')}
                </Text>
              )}

              {/* ── Eerste reactie (first comment) ───────────────────── */}
              {(() => {
                const isExpanded = !!firstCommentExpanded[post.id];
                const draft = firstCommentDraft[post.id] ?? '';
                const maxLen = FIRST_COMMENT_MAX[post.channel] ?? 1250;
                const charCount = draft.length;
                const isOverLimit = charCount > maxLen;
                const hasComment = draft.trim().length > 0;
                return (
                  <View>
                    {/* Toggle button */}
                    <TouchableOpacity
                      onPress={() =>
                        setFirstCommentExpanded((prev) => ({ ...prev, [post.id]: !isExpanded }))
                      }
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 8,
                        paddingHorizontal: 2,
                      }}
                    >
                      <Ionicons
                        name={isExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                        size={14}
                        color={hasComment ? colors.success : colors.textSecondary}
                      />
                      <Text style={{
                        fontSize: fontSize.sm,
                        color: hasComment ? colors.success : colors.textSecondary,
                        fontWeight: hasComment ? fontWeight.semibold : fontWeight.medium,
                      }}>
                        {`\uD83D\uDCAC Eerste reactie toevoegen (optioneel)`}
                      </Text>
                      {hasComment && !isExpanded && (
                        <View style={{
                          width: 8, height: 8, borderRadius: 4,
                          backgroundColor: colors.success, marginLeft: 2,
                        }} />
                      )}
                    </TouchableOpacity>

                    {/* Expanded editor */}
                    {isExpanded && (
                      <View style={{
                        borderWidth: 1,
                        borderColor: isOverLimit ? colors.error : colors.border,
                        borderRadius: borderRadius.md,
                        backgroundColor: colors.surface,
                        padding: spacing.md,
                        gap: 6,
                      }}>
                        <TextInput
                          style={{
                            fontSize: fontSize.sm,
                            color: colors.text,
                            minHeight: 80,
                            textAlignVertical: 'top',
                          }}
                          value={draft}
                          onChangeText={(val) =>
                            setFirstCommentDraft((prev) => ({ ...prev, [post.id]: val }))
                          }
                          onBlur={async () => {
                            const value = (firstCommentDraft[post.id] ?? '').trim();
                            // Save to DB (accepts null to clear the field)
                            try {
                              await updatePost.mutateAsync({
                                id: post.id,
                                first_comment: value || null,
                              } as any);
                            } catch {
                              // Non-fatal — draft stays in local state
                            }
                          }}
                          multiline
                          placeholder="Bijv. hashtags of een CTA die je uit de hoofdtekst wilt houden…"
                          placeholderTextColor={colors.textTertiary}
                        />
                        {/* Character counter */}
                        <Text style={{
                          fontSize: 11,
                          color: isOverLimit ? colors.error : colors.textTertiary,
                          alignSelf: 'flex-end',
                        }}>
                          {charCount}/{maxLen}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })()}


              {/* ── WhatsApp CTA ────────────────────────────────────── */}
              {(() => {
                const isExpanded = !!whatsappCtaExpanded[post.id];
                const isEnabled = whatsappCtaEnabled[post.id] ?? false;
                const phone = whatsappCtaPhone[post.id] ?? '';
                const message = whatsappCtaMessage[post.id] ?? 'Hi, ik zag je post';
                const isPhoneValid = isEnabled && phone.trim() && isValidE164(phone);
                const waLink = isPhoneValid
                  ? `https://wa.me/${phone.replace(/^\+/, '').replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
                  : null;

                return (
                  <View>
                    {/* Toggle button */}
                    <TouchableOpacity
                      onPress={() =>
                        setWhatsappCtaExpanded((prev) => ({ ...prev, [post.id]: !isExpanded }))
                      }
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 8,
                        paddingHorizontal: 2,
                      }}
                    >
                      <Ionicons
                        name={isExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                        size={14}
                        color={isEnabled ? colors.success : colors.textSecondary}
                      />
                      <Text style={{
                        fontSize: fontSize.sm,
                        color: isEnabled ? colors.success : colors.textSecondary,
                        fontWeight: isEnabled ? fontWeight.semibold : fontWeight.medium,
                      }}>
                        {`💬 WhatsApp CTA toevoegen`}
                      </Text>
                      {isEnabled && !isExpanded && (
                        <View style={{
                          width: 8, height: 8, borderRadius: 4,
                          backgroundColor: colors.success, marginLeft: 2,
                        }} />
                      )}
                    </TouchableOpacity>

                    {/* Expanded editor */}
                    {isExpanded && (
                      <View style={{
                        borderWidth: 1,
                        borderColor: !isPhoneValid && isEnabled ? colors.error : colors.border,
                        borderRadius: borderRadius.md,
                        backgroundColor: colors.surface,
                        padding: spacing.md,
                        gap: 12,
                      }}>
                        {/* Toggle enable/disable */}
                        <TouchableOpacity
                          onPress={() => {
                            const newEnabled = !isEnabled;
                            setWhatsappCtaEnabled((prev) => ({ ...prev, [post.id]: newEnabled }));
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Text style={{
                            fontSize: fontSize.sm,
                            color: colors.text,
                            fontWeight: fontWeight.medium,
                          }}>
                            CTA inschakelen
                          </Text>
                          <View style={{
                            width: 50,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: isEnabled ? colors.success + '30' : colors.textTertiary + '20',
                            borderWidth: 1,
                            borderColor: isEnabled ? colors.success : colors.border,
                            justifyContent: 'center',
                            paddingHorizontal: 2,
                          }}>
                            <View
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: 12,
                                backgroundColor: isEnabled ? colors.success : colors.textTertiary,
                                alignSelf: isEnabled ? 'flex-end' : 'flex-start',
                              }}
                            />
                          </View>
                        </TouchableOpacity>

                        {/* Phone and message fields (visible only when enabled) */}
                        {isEnabled && (
                          <>
                            {/* Phone number input */}
                            <View style={{ gap: 4 }}>
                              <Text style={{
                                fontSize: fontSize.xs,
                                color: colors.textSecondary,
                                fontWeight: fontWeight.semibold,
                              }}>
                                Telefoonnummer (E164 formaat)
                              </Text>
                              <TextInput
                                style={{
                                  fontSize: fontSize.sm,
                                  color: colors.text,
                                  borderWidth: 1,
                                  borderColor: !isPhoneValid && phone.trim() ? colors.error : colors.border,
                                  borderRadius: borderRadius.sm,
                                  paddingHorizontal: spacing.sm,
                                  paddingVertical: spacing.xs,
                                  backgroundColor: colors.surface,
                                }}
                                value={phone}
                                onChangeText={(val) =>
                                  setWhatsappCtaPhone((prev) => ({ ...prev, [post.id]: val }))
                                }
                                placeholder="+31612345678"
                                placeholderTextColor={colors.textTertiary}
                                keyboardType="phone-pad"
                              />
                              {phone.trim() && !isValidE164(phone) && (
                                <Text style={{
                                  fontSize: 11,
                                  color: colors.error,
                                }}>
                                  Ongeldig format. Gebruik +1234567890 of +31612345678
                                </Text>
                              )}
                            </View>

                            {/* Prefill message input */}
                            <View style={{ gap: 4 }}>
                              <Text style={{
                                fontSize: fontSize.xs,
                                color: colors.textSecondary,
                                fontWeight: fontWeight.semibold,
                              }}>
                                Voorgevulde bericht (optioneel)
                              </Text>
                              <TextInput
                                style={{
                                  fontSize: fontSize.sm,
                                  color: colors.text,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  borderRadius: borderRadius.sm,
                                  paddingHorizontal: spacing.sm,
                                  paddingVertical: spacing.xs,
                                  backgroundColor: colors.surface,
                                  minHeight: 60,
                                  textAlignVertical: 'top',
                                }}
                                value={message}
                                onChangeText={(val) =>
                                  setWhatsappCtaMessage((prev) => ({ ...prev, [post.id]: val }))
                                }
                                placeholder="Bijv. Hi, ik zag je post op LinkedIn"
                                placeholderTextColor={colors.textTertiary}
                                multiline
                              />
                            </View>

                            {/* Preview WhatsApp link */}
                            {waLink && (
                              <View style={{
                                backgroundColor: colors.success + '10',
                                borderRadius: borderRadius.sm,
                                padding: spacing.sm,
                                borderLeftWidth: 3,
                                borderLeftColor: colors.success,
                              }}>
                                <Text style={{
                                  fontSize: 10,
                                  color: colors.textSecondary,
                                  marginBottom: 4,
                                }}>
                                  Preview link:
                                </Text>
                                <Text style={{
                                  fontSize: 11,
                                  color: colors.info,
                                  fontFamily: 'Courier New',
                                  fontWeight: fontWeight.medium,
                                }}>
                                  {waLink}
                                </Text>
                              </View>
                            )}

                            {/* Save button */}
                            <TouchableOpacity
                              style={{
                                backgroundColor: colors.primary,
                                borderRadius: borderRadius.sm,
                                paddingVertical: 8,
                                alignItems: 'center',
                                opacity: isPhoneValid ? 1 : 0.5,
                              }}
                              onPress={async () => {
                                try {
                                  await updatePost.mutateAsync({
                                    id: post.id,
                                    whatsapp_cta_enabled: isEnabled,
                                    whatsapp_cta_phone: isPhoneValid ? phone : null,
                                    whatsapp_cta_message: isPhoneValid ? message : null,
                                  } as any);
                                } catch {
                                  // Non-fatal — draft stays in local state
                                }
                              }}
                              disabled={!isPhoneValid}
                            >
                              <Text style={{
                                fontSize: fontSize.sm,
                                color: isPhoneValid ? colors.surface : colors.textTertiary,
                                fontWeight: fontWeight.semibold,
                              }}>
                                {isPhoneValid ? 'Opslaan' : 'Voer geldig nummer in'}
                              </Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* ── 2-column utility buttons ────────────────────────── */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {/* Preview */}
                <TouchableOpacity
                  style={[styles.translateBtn, { flex: 1 }]}
                  onPress={() => setPreviewPost(post)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Eye size={14} color={colors.info} weight="duotone" />
                    <Text style={styles.translateBtnText}>Preview</Text>
                  </View>
                </TouchableOpacity>

                {/* Regenerate */}
                <TouchableOpacity
                  style={[styles.translateBtn, { flex: 1, borderColor: colors.primary + '80', backgroundColor: colors.primary + '10' }]}
                  onPress={() => handleRegenerate(post)}
                  disabled={regenerating === post.id}
                >
                  {regenerating === post.id
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <ArrowsClockwise size={14} color={colors.primary} weight="bold" />
                        <Text style={[styles.translateBtnText, { color: colors.primary }]}>Regenereer</Text>
                      </View>}
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                {/* Schedule */}
                <TouchableOpacity
                  style={[styles.translateBtn, { flex: 1, borderColor: colors.info + '80', backgroundColor: colors.info + '10' }]}
                  onPress={() => {
                    setSchedulingPost(post);
                    // Pre-fill today's date in DD-MM-YYYY format
                    const today = new Date();
                    setScheduleDate(
                      `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`
                    );
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Calendar size={14} color={colors.info} weight="duotone" />
                    <Text style={[styles.translateBtnText, { color: colors.info }]}>
                      {post.status === 'scheduled' ? '📅 Ingepland' : 'Inplannen'}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Audience */}
                <TouchableOpacity
                  style={[styles.audienceBtn, { flex: 1 }]}
                  onPress={async () => {
                    if (!hasConsent) {
                      requestConsent(() => {});
                      return;
                    }
                    try {
                      const result = await aiService.suggestAudience({
                        text_content: getEditedText(post),
                        channel: post.channel,
                        hashtags: post.hashtags,
                      });
                      const msg = [
                        `${t.postReview.primary}: ${result.primary}`,
                        `${t.postReview.secondary}: ${result.secondary}`,
                        `\n${result.reasoning}`,
                        `\n${t.postReview.demographics}: ${result.demographics}`,
                        `${t.postReview.optimalTime}: ${result.optimal_time}`,
                        result.engagement_tips?.length
                          ? `\n${t.postReview.tips}:\n${result.engagement_tips.map((tip) => `  - ${tip}`).join('\n')}`
                          : '',
                      ].filter(Boolean).join('\n');
                      Alert.alert(t.postReview.audienceAnalysis, msg);
                    } catch {
                      Alert.alert(t.common.error, t.postReview.audienceError);
                    }
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Crosshair size={14} color={colors.success} weight="duotone" />
                    <Text style={styles.audienceBtnText}>Doelgroep</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* ── Content Creator with image ─────────────────────── */}
              <TouchableOpacity
                style={[styles.translateBtn, { borderColor: '#8B5CF6' + '80', backgroundColor: '#8B5CF680' + '10' }]}
                onPress={() => {
                  const allImages = getPostImages(post, imageUrl);
                  navigation.navigate('ContentCreator' as any, {
                    imageUri: imageUrl || undefined,
                    imageUrls: allImages.length > 0 ? allImages : undefined,
                  });
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <PaintBrush size={14} color="#8B5CF6" weight="duotone" />
                  <Text style={[styles.translateBtnText, { color: '#8B5CF6' }]}>Content Creator</Text>
                </View>
              </TouchableOpacity>

              {/* ── Publish + Boost + Delete ─────────────────────────── */}
              <View style={styles.actions}>
                {/* Approval-gated CTA:
                    - org.requires_post_approval=true + draft → Submit for review (magenta)
                    - status='in_review' → non-clickable info pill
                    - everything else (incl. requires_post_approval=false) → original Publish button */}
                {requiresApproval && post.status === 'draft' ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#ED1D96' }]}
                    onPress={() => handleSubmitForApproval(post)}
                    disabled={submitForApproval.isPending}
                  >
                    {submitForApproval.isPending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={[styles.actionBtnText, { color: '#fff' }]}>
                        {t.postApproval.submit}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : post.status === 'in_review' ? (
                  <View
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: colors.surfaceElevated,
                        borderWidth: 1.5,
                        borderColor: colors.border,
                        flexDirection: 'row',
                        justifyContent: 'center',
                        gap: 6,
                      },
                    ]}
                  >
                    <Hourglass size={16} color={colors.textSecondary} weight="duotone" />
                    <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>
                      {t.postApproval.inReview}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: config?.color || colors.primary }]}
                    onPress={() => handlePublish(post)}
                    disabled={post.status === 'published' || publishPost.isPending}
                  >
                    {publishPost.isPending ? (
                      <ActivityIndicator color={colors.textOnPrimary} />
                    ) : (
                      <Text style={post.status === 'published' ? styles.actionBtnDisabledText : styles.actionBtnText}>
                        {post.status === 'published' ? t.status.published : `${t.postReview.publishOn} ${config?.label}`}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}

                {/* Boost button — shows for published Meta posts (FB/IG).
                    Tier-gated: requires tier ≥ promote (read via useUserTier hook
                    in component scope above). Lower tiers see an "Upgrade"
                    pill that links to /pricing on marketing.inclufy.com. */}
                {post.status === 'published' && (post.channel === 'facebook' || post.channel === 'instagram') && (
                  canBoostMeta(userTier) ? (
                    <TouchableOpacity
                      onPress={() => handleBoost(post)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: spacing.md, paddingVertical: 12,
                        borderRadius: borderRadius.md,
                        backgroundColor: '#F59E0B' + '15',
                        borderWidth: 1.5, borderColor: '#F59E0B',
                      }}
                    >
                      <Rocket size={16} color="#F59E0B" weight="duotone" />
                      <Text style={{ color: '#F59E0B', fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>
                        Boost
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => Linking.openURL('https://marketing.inclufy.com/pricing?upgrade=promote')}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: spacing.md, paddingVertical: 12,
                        borderRadius: borderRadius.md,
                        backgroundColor: colors.textTertiary + '15',
                        borderWidth: 1.5, borderColor: colors.textTertiary,
                      }}
                    >
                      <Lock size={14} color={colors.textTertiary} weight="duotone" />
                      <Text style={{ color: colors.textTertiary, fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>
                        Boost (Promote tier)
                      </Text>
                    </TouchableOpacity>
                  )
                )}

                {/* Delete post */}
                <TouchableOpacity
                  onPress={() => handleDeletePost(post)}
                  disabled={deletePost.isPending}
                  style={{
                    width: 44, height: 44, borderRadius: borderRadius.md,
                    borderWidth: 1.5, borderColor: colors.error + '60',
                    justifyContent: 'center', alignItems: 'center',
                    backgroundColor: colors.error + '08',
                  }}
                >
                  {deletePost.isPending
                    ? <ActivityIndicator size="small" color={colors.error} />
                    : <Trash size={18} color={colors.error} weight="duotone" />}
                </TouchableOpacity>
              </View>
            </ScrollView>
          );
        })}
      </ScrollView>

      {/* Bottom: Publish All */}
      <TouchableOpacity
        style={styles.publishAllBtn}
        onPress={handlePublishAll}
        disabled={batchPublish.isPending}
      >
        {batchPublish.isPending ? (
          <ActivityIndicator color={colors.textOnPrimary} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Rocket size={18} color={colors.textOnPrimary} weight="duotone" />
            <Text style={styles.publishAllText}>
              {t.postReview.publishAllButton} ({posts.filter((p) => p.status === 'draft').length} {t.postReview.channels})
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ── Schedule modal ────────────────────────────────────────────────── */}
      <Modal
        visible={!!schedulingPost}
        transparent
        animationType="slide"
        onRequestClose={() => setSchedulingPost(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={1}
          onPress={() => setSchedulingPost(null)}
        >
          <View style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 24,
            paddingBottom: Platform.OS === 'ios' ? 40 : 24,
            gap: 16,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
                📅 Post inplannen
              </Text>
              <TouchableOpacity onPress={() => setSchedulingPost(null)}>
                <X size={22} color={colors.textSecondary} weight="bold" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
              {schedulingPost ? `${channelConfig[schedulingPost.channel]?.label} post` : ''}
            </Text>

            {/* Date — EU format DD-MM-YYYY */}
            <View>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: 6 }}>
                Datum (DD-MM-JJJJ)
              </Text>
              <TextInput
                style={{
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: borderRadius.md,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: fontSize.md,
                  color: colors.text,
                  letterSpacing: 1,
                }}
                value={scheduleDate}
                onChangeText={setScheduleDate}
                placeholder="15-03-2026"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </View>

            {/* Time */}
            <View>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: 6 }}>
                Tijd (UU:MM)
              </Text>
              <TextInput
                style={{
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: borderRadius.md,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: fontSize.md,
                  color: colors.text,
                  letterSpacing: 1,
                }}
                value={scheduleTime}
                onChangeText={setScheduleTime}
                placeholder="09:00"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>

            {/* Quick time presets */}
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {['08:00', '09:00', '12:00', '17:00', '19:00', '21:00'].map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setScheduleTime(t)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: scheduleTime === t ? colors.primary : colors.border,
                    backgroundColor: scheduleTime === t ? colors.primary + '15' : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: fontSize.xs, color: scheduleTime === t ? colors.primary : colors.textSecondary, fontWeight: fontWeight.medium }}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={{
                backgroundColor: colors.primary,
                borderRadius: borderRadius.md,
                paddingVertical: 14,
                alignItems: 'center',
                opacity: scheduling ? 0.7 : 1,
              }}
              onPress={handleScheduleConfirm}
              disabled={scheduling}
            >
              {scheduling
                ? <ActivityIndicator color={colors.textOnPrimary} />
                : <Text style={{ color: colors.textOnPrimary, fontWeight: fontWeight.bold, fontSize: fontSize.md }}>
                    Bevestig inplannen
                  </Text>}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Per-channel preview modal ─────────────────────────────────────── */}
      <Modal
        visible={!!previewPost}
        transparent
        animationType="slide"
        onRequestClose={() => setPreviewPost(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: Platform.OS === 'ios' ? 54 : 24, right: 16, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 8 }}
            onPress={() => setPreviewPost(null)}
          >
            <X size={22} color="#fff" weight="bold" />
          </TouchableOpacity>

          {previewPost && (() => {
            const p = previewPost;
            const cfg = channelConfig[p.channel];
            const rawText = editingText[p.id] ?? p.text_content;
            // Guard against null hashtags (DB may return null for older rows)
            const tags = (p.hashtags || []).map((h: string) => `#${h.replace(/^#+/, '')}`).join(' ');
            // Strip hashtags from text if they're already rendered separately below
            const text = tags
              ? rawText.replace(/(?:\s*#\w+)+\s*$/, '').trim()
              : rawText;

            // Build an ordered candidate list for the preview image.
            // Priority: local file → branded_image_url (processed output, most reliable)
            //           → signed captureImageUrl (storage fallback)
            // For video/audio captures the signed URL points to a media file, not an image —
            // we guard against that below when choosing what to render.
            const isPreviewVideo = mediaType === 'video';
            const isPreviewAudio = mediaType === 'audio';
            const extraImages: string[] = Array.isArray((p.engagement as any)?.extra_images)
              ? (p.engagement as any).extra_images.filter(Boolean)
              : [];
            // Only collect image candidates when the capture is a photo (not video/audio)
            const imageCandidates: string[] = isPreviewVideo || isPreviewAudio
              ? []
              : [
                  localMediaUri,
                  p.branded_image_url,
                  captureImageUrl,
                  ...extraImages,
                ].filter((u): u is string => !!u);
            // Deduplicate while preserving order
            const previewImages: string[] = [...new Set(imageCandidates)];

            const previewIdx = activeImageIndex[p.id] ?? 0;
            const safePreviewIdx = Math.min(previewIdx, Math.max(0, previewImages.length - 1));
            // Pick the first non-failed URL at or after the active index
            const imgUrl: string | null =
              previewImages.slice(safePreviewIdx).find(u => !previewFailedUrls.has(u))
              ?? previewImages.find(u => !previewFailedUrls.has(u))
              ?? null;
            // Image is renderable if we have a URL that hasn't already failed
            const previewImgOk = !!imgUrl && !previewFailedUrls.has(imgUrl);

            // Overlay elements to layer on top of the image in mock cards.
            // IMPORTANT: sizes/positions/fonts MUST match the ViewShot-wrapped
            // feed render (lines ~1381-1417). That ViewShot IS what gets baked
            // into the published image via bakeOverlayIntoImage(). If these
            // diverge, the modal preview shows something different from what
            // actually gets posted to LinkedIn/FB/IG.
            const ov = overlayConfig[p.id];
            const PreviewOverlay = () => {
              if (!ov) return null;
              const lp = ov.logoPosition ?? 'bottom-right';
              const lt = ov.logoType ?? 'brand';
              const logos: string[] = [];
              if ((lt === 'brand' || lt === 'both') && brandLogoUrl) logos.push(brandLogoUrl);
              if ((lt === 'event' || lt === 'both') && eventLogoUrl) logos.push(eventLogoUrl);
              const posStyle = lp === 'top-left'    ? { top: 8, left: 8 }    :
                               lp === 'top-right'   ? { top: 8, right: 8 }   :
                               lp === 'bottom-left' ? { bottom: 8, left: 8 } :
                                                      { bottom: 8, right: 8 };
              return (
                <>
                  {/* Top text — matches ViewShot style */}
                  {ov.text && ov.textPosition === 'top' && (
                    <View style={{
                      position: 'absolute', top: 0, left: 0, right: 0,
                      backgroundColor: 'rgba(0,0,0,0.52)',
                      paddingHorizontal: 10, paddingVertical: 7,
                    }}>
                      <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold }} numberOfLines={2}>
                        {ov.text}
                      </Text>
                    </View>
                  )}
                  {/* Logo — matches ViewShot: 32x32, borderRadius 6 */}
                  {ov.showLogo && (
                    <View style={{ position: 'absolute', flexDirection: 'row', gap: 4, ...posStyle }}>
                      {logos.length > 0 ? logos.map((lu, li) => (
                        <Image key={li} source={{ uri: lu }}
                          style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.4)' }}
                          resizeMode="contain"
                        />
                      )) : (
                        <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: 6 }}>
                          <Buildings size={16} color="#fff" weight="duotone" />
                        </View>
                      )}
                    </View>
                  )}
                  {/* Bottom text — matches ViewShot style */}
                  {ov.text && ov.textPosition === 'bottom' && (
                    <View style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      backgroundColor: 'rgba(0,0,0,0.52)',
                      paddingHorizontal: 10, paddingVertical: 7,
                    }}>
                      <Text style={{ color: '#fff', fontSize: fontSize.sm, fontWeight: fontWeight.semibold }} numberOfLines={2}>
                        {ov.text}
                      </Text>
                    </View>
                  )}
                </>
              );
            };

            // Shared image renderer with swipeable carousel for multi-image
            const PreviewImage = ({ height, borderRadius: br }: { height: number; borderRadius?: number }) => {
              // For video captures, render the inline video player instead of an image.
              // captureImageUrl resolves to the video signed URL when mediaType === 'video'.
              if (isPreviewVideo && captureImageUrl) {
                return (
                  <View style={{ width: '100%', height, borderRadius: br ?? 0, overflow: 'hidden', backgroundColor: '#000' }}>
                    <VideoPreview source={captureImageUrl} style={{ width: '100%', height: '100%' }} />
                  </View>
                );
              }
              // Deduplicated preview images (already computed above)
              const imgs = previewImages.length > 0 ? previewImages : [];
              const hasMultiple = imgs.length > 1;

              if (imgs.length === 0) {
                return (
                  <View style={{ width: '100%', height, borderRadius: br ?? 0, overflow: 'hidden', backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={isPreviewVideo ? 'videocam-outline' : 'image-outline'} size={44} color="#555" />
                    <Text style={{ fontSize: 12, color: '#555' }}>{isPreviewVideo ? 'Video laden...' : 'Geen afbeelding'}</Text>
                  </View>
                );
              }

              return (
                <View style={{ width: '100%', height, borderRadius: br ?? 0, overflow: 'hidden' }}>
                  {hasMultiple ? (
                    <>
                      <ScrollView
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={(e) => {
                          const idx = Math.round(e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width);
                          setPreviewSlideIdx(idx);
                        }}
                        style={{ width: '100%', height }}
                      >
                        {imgs.map((url, i) => (
                          <Image
                            key={`${url}-${i}`}
                            source={{ uri: url }}
                            style={{ width: Dimensions.get('window').width - 32, height }}
                            resizeMode="cover"
                            onError={() => setPreviewFailedUrls(prev => new Set([...prev, url]))}
                          />
                        ))}
                      </ScrollView>
                      {/* Slide indicator dots */}
                      <View style={{
                        position: 'absolute', bottom: 8, left: 0, right: 0,
                        flexDirection: 'row', justifyContent: 'center', gap: 5,
                      }}>
                        {imgs.map((_, i) => (
                          <View key={i} style={{
                            width: previewSlideIdx === i ? 18 : 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: previewSlideIdx === i ? '#fff' : 'rgba(255,255,255,0.5)',
                          }} />
                        ))}
                      </View>
                      {/* Image counter badge */}
                      <View style={{
                        position: 'absolute', top: 8, left: 8,
                        backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10,
                        paddingHorizontal: 8, paddingVertical: 3,
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                      }}>
                        <Images size={11} color="#fff" weight="duotone" />
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>
                          {previewSlideIdx + 1}/{imgs.length}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <Image
                      source={{ uri: imgs[0] }}
                      style={{ width: '100%', height }}
                      resizeMode="cover"
                      onLoad={() => setPreviewImgLoaded(true)}
                      onError={() => { if (imgs[0]) setPreviewFailedUrls(prev => new Set([...prev, imgs[0]])); }}
                    />
                  )}
                  <PreviewOverlay />
                </View>
              );
            };

            const MockCard = () => {
              if (p.channel === 'linkedin') {
                return (
                  <View style={{ backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden', margin: 16, marginTop: 80 }}>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', padding: 12, gap: 10, alignItems: 'flex-start' }}>
                      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#0077B5', justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>C</Text>
                      </View>
                      <View>
                        <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#000' }}>Company Page</Text>
                        <Text style={{ fontSize: 11, color: '#666' }}>1,234 volgers • Nu</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                          <Globe size={11} color="#666" weight="duotone" />
                          <Text style={{ fontSize: 10, color: '#666' }}>Zichtbaar voor iedereen</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={{ paddingHorizontal: 12, fontSize: 13, color: '#000', lineHeight: 20 }}>{text}</Text>
                    {tags ? <Text style={{ paddingHorizontal: 12, paddingTop: 4, fontSize: 12, color: '#0077B5' }}>{tags}</Text> : null}
                    {imgUrl ? <View style={{ marginTop: 8 }}><PreviewImage height={220} /></View> : null}
                    <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#e0e0e0', marginTop: 8, gap: 16 }}>
                      {['👍 Vind ik leuk', '💬 Reageren', '↗️ Delen'].map((a) => (
                        <Text key={a} style={{ fontSize: 12, color: '#666' }}>{a}</Text>
                      ))}
                    </View>
                  </View>
                );
              }

              if (p.channel === 'instagram') {
                return (
                  <View style={{ backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden', margin: 16, marginTop: 80 }}>
                    <View style={{ flexDirection: 'row', padding: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#E4405F', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#f09433' }}>
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>C</Text>
                        </View>
                        <Text style={{ fontWeight: 'bold', fontSize: 13, color: '#000' }}>company.page</Text>
                      </View>
                      <DotsThree size={20} color="#000" weight="bold" />
                    </View>
                    <PreviewImage height={SCREEN_WIDTH - 32} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 10 }}>
                      <View style={{ flexDirection: 'row', gap: 14 }}>
                        <Heart size={22} color="#000" weight="duotone" />
                        <ChatCircle size={22} color="#000" weight="duotone" />
                        <PaperPlaneTilt size={22} color="#000" weight="duotone" />
                      </View>
                      <Bookmark size={22} color="#000" weight="duotone" />
                    </View>
                    <Text style={{ paddingHorizontal: 10, fontSize: 12, fontWeight: 'bold', color: '#000' }}>1.234 vind-ik-leuks</Text>
                    <Text style={{ paddingHorizontal: 10, paddingTop: 2, fontSize: 12, color: '#000' }}><Text style={{ fontWeight: 'bold' }}>company.page</Text> {text}</Text>
                    {tags ? <Text style={{ paddingHorizontal: 10, paddingTop: 2, paddingBottom: 8, fontSize: 11, color: '#0095f6' }}>{tags}</Text> : null}
                  </View>
                );
              }

              if (p.channel === 'x') {
                return (
                  <View style={{ backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden', margin: 16, marginTop: 80, padding: 14 }}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>C</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <View>
                            <Text style={{ fontWeight: 'bold', fontSize: 13, color: '#000' }}>Company</Text>
                            <Text style={{ fontSize: 12, color: '#666' }}>@companypage · Nu</Text>
                          </View>
                          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#000' }}>𝕏</Text>
                        </View>
                        <Text style={{ fontSize: 13, color: '#000', marginTop: 6, lineHeight: 18 }}>{text} {tags}</Text>
                        {imgUrl ? <View style={{ marginTop: 8 }}><PreviewImage height={180} borderRadius={12} /></View> : null}
                        <View style={{ flexDirection: 'row', marginTop: 10, gap: 20 }}>
                          {['💬 0', '🔁 0', '♡ 0', '📤'].map((a) => (
                            <Text key={a} style={{ fontSize: 12, color: '#666' }}>{a}</Text>
                          ))}
                        </View>
                      </View>
                    </View>
                  </View>
                );
              }

              // Facebook
              return (
                <View style={{ backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden', margin: 16, marginTop: 80 }}>
                  <View style={{ flexDirection: 'row', padding: 12, gap: 10, alignItems: 'flex-start' }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#1877F2', justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>C</Text>
                    </View>
                    <View>
                      <Text style={{ fontWeight: 'bold', fontSize: 13, color: '#000' }}>Company Page</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 11, color: '#666' }}>Nu ·</Text>
                        <Globe size={11} color="#666" weight="duotone" />
                      </View>
                    </View>
                  </View>
                  <Text style={{ paddingHorizontal: 12, fontSize: 13, color: '#000', lineHeight: 20 }}>{text}</Text>
                  {tags ? <Text style={{ paddingHorizontal: 12, paddingTop: 4, fontSize: 12, color: '#1877F2' }}>{tags}</Text> : null}
                  {imgUrl
                    ? previewImgOk
                      ? <Image
                          source={{ uri: imgUrl }}
                          style={{ width: '100%', height: 220, marginTop: 8 }}
                          resizeMode="cover"
                          onLoad={() => setPreviewImgLoaded(true)}
                          onError={() => { if (imgUrl) setPreviewFailedUrls(prev => new Set([...prev, imgUrl])); }}
                        />
                      : <View style={{ width: '100%', height: 220, marginTop: 8, backgroundColor: '#e8e8e8', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                          <ImageIcon size={40} color="#aaa" weight="duotone" />
                          <Text style={{ fontSize: 11, color: '#aaa' }}>Afbeelding niet beschikbaar</Text>
                        </View>
                    : null}
                  <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e0e0e0', marginTop: 8, gap: 16 }}>
                    {['👍 Vind ik leuk', '💬 Reageren', '↗️ Delen'].map((a) => (
                      <Text key={a} style={{ fontSize: 12, color: '#666' }}>{a}</Text>
                    ))}
                  </View>
                </View>
              );
            };

            // Show a spinner while the signed URL is still being fetched AND we have no image
            // to display yet. Skip spinner entirely for video/audio (no image expected).
            if (!isPreviewVideo && !isPreviewAudio && imageIsLoading && previewImages.length === 0) {
              return (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                  <ActivityIndicator size="large" color="#fff" />
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Afbeelding laden...</Text>
                </View>
              );
            }

            return (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Channel header */}
                <View style={{ alignItems: 'center', marginTop: Platform.OS === 'ios' ? 100 : 70 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cfg.color, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16 }}>
                    <Ionicons name={cfg.icon as any} size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.sm }}>{cfg.label} Preview</Text>
                  </View>
                </View>
                <MockCard />
              </ScrollView>
            );
          })()}
        </View>
      </Modal>

      {/* ── Image Overlay Editor Modal ──────────────────────────────────────── */}
      <Modal
        visible={!!editingOverlay}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingOverlay(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={1}
          onPress={() => setEditingOverlay(null)}
        >
          {/* Wrap sheet in TouchableOpacity so taps on labels/text are absorbed
               and do NOT bubble up to the backdrop (which would close the modal) */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {/* absorb touch — keep sheet open */}}
            style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: Platform.OS === 'ios' ? 44 : 24,
              gap: 16,
            }}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
                Tekst / Logo overlay
              </Text>
              <TouchableOpacity onPress={() => setEditingOverlay(null)}>
                <X size={22} color={colors.textSecondary} weight="bold" />
              </TouchableOpacity>
            </View>

            {/* Overlay text input */}
            <View>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: 6 }}>
                Overlay tekst (optioneel)
              </Text>
              <TextInput
                style={{
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: borderRadius.md,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  fontSize: fontSize.md,
                  color: colors.text,
                }}
                value={overlayDraft.text}
                onChangeText={(v) => setOverlayDraft((d) => ({ ...d, text: v }))}
                placeholder="Bijv. eventnaam, quote, CTA..."
                placeholderTextColor={colors.textTertiary}
                maxLength={80}
              />
            </View>

            {/* Text position */}
            <View>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: 8 }}>
                Positie tekst
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(['top', 'bottom'] as const).map((pos) => (
                  <TouchableOpacity
                    key={pos}
                    onPress={() => setOverlayDraft((d) => ({ ...d, textPosition: pos }))}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: borderRadius.md,
                      borderWidth: 1.5,
                      borderColor: overlayDraft.textPosition === pos ? colors.primary : colors.border,
                      backgroundColor: overlayDraft.textPosition === pos ? colors.primary + '15' : 'transparent',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons
                      name={pos === 'top' ? 'arrow-up-outline' : 'arrow-down-outline'}
                      size={16}
                      color={overlayDraft.textPosition === pos ? colors.primary : colors.textSecondary}
                    />
                    <Text style={{ fontSize: fontSize.xs, marginTop: 3, color: overlayDraft.textPosition === pos ? colors.primary : colors.textSecondary, fontWeight: fontWeight.medium }}>
                      {pos === 'top' ? 'Bovenaan' : 'Onderaan'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Logo type selector */}
            <View>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: 8 }}>
                Logo op afbeelding
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {([
                  { key: 'none', label: 'Geen', icon: 'close-circle-outline' as const },
                  { key: 'brand', label: 'Brand logo', icon: 'briefcase-outline' as const },
                  { key: 'event', label: 'Event foto', icon: 'calendar-outline' as const },
                  { key: 'both', label: 'Beide', icon: 'layers-outline' as const },
                ] as const).map((opt) => {
                  const active = overlayDraft.showLogo ? overlayDraft.logoType === opt.key : opt.key === 'none';
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => setOverlayDraft((d) => ({ ...d, showLogo: opt.key !== 'none', logoType: opt.key === 'none' ? d.logoType : opt.key }))}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                        borderWidth: 1.5,
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary + '15' : 'transparent',
                      }}
                    >
                      <Ionicons name={opt.icon} size={14} color={active ? colors.primary : colors.textSecondary} />
                      <Text style={{ fontSize: fontSize.xs, color: active ? colors.primary : colors.textSecondary, fontWeight: active ? fontWeight.semibold : fontWeight.normal }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {overlayDraft.showLogo && !brandLogoUrl && !eventLogoUrl && (overlayDraft.extraLogos ?? []).length === 0 && (
                <Text style={{ fontSize: 11, color: colors.warning, marginTop: 6 }}>
                  ⚠️ Geen logo gevonden. Voeg een logo toe aan je Brand Kit, Event, of via "Extra logo's" hieronder.
                </Text>
              )}
            </View>

            {/* Extra logos: sponsors / partners / co-organizers */}
            {overlayDraft.showLogo && (
              <View>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: 4 }}>
                  Extra logo's (sponsors, partners)
                </Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 10 }}>
                  Max {EXTRA_LOGOS_MAX} extra logo's. Verschijnen naast brand + event logo.
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(overlayDraft.extraLogos ?? []).map((url, i) => (
                    <View key={`${url}-${i}`} style={{ position: 'relative' }}>
                      <Image
                        source={{ uri: url }}
                        style={{ width: 56, height: 56, borderRadius: borderRadius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                        resizeMode="contain"
                      />
                      <TouchableOpacity
                        onPress={() => removeExtraLogo(i)}
                        accessibilityLabel={`Verwijder logo ${i + 1}`}
                        style={{
                          position: 'absolute', top: -6, right: -6,
                          backgroundColor: '#ef4444',
                          borderRadius: 11, width: 22, height: 22,
                          alignItems: 'center', justifyContent: 'center',
                          borderWidth: 2, borderColor: colors.surface,
                        }}
                      >
                        <X size={13} color="#fff" weight="bold" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {(overlayDraft.extraLogos ?? []).length < EXTRA_LOGOS_MAX && (
                    <TouchableOpacity
                      onPress={addExtraLogo}
                      disabled={extraLogoUploading}
                      accessibilityLabel="Voeg extra logo toe"
                      style={{
                        width: 56, height: 56, borderRadius: borderRadius.md,
                        borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border,
                        alignItems: 'center', justifyContent: 'center',
                        opacity: extraLogoUploading ? 0.5 : 1,
                      }}
                    >
                      {extraLogoUploading
                        ? <ActivityIndicator size="small" color={colors.primary} />
                        : <Plus size={26} color={colors.textSecondary} weight="bold" />}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* Logo corner picker (only when logo is enabled) */}
            {overlayDraft.showLogo && (
            <View>
              <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: 8 }}>Positie logo</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => {
                  const labels: Record<string, string> = {
                    'top-left': 'Links boven', 'top-right': 'Rechts boven',
                    'bottom-left': 'Links onder', 'bottom-right': 'Rechts onder',
                  };
                  const icons: Record<string, any> = {
                    'top-left': 'arrow-back-outline', 'top-right': 'arrow-forward-outline',
                    'bottom-left': 'return-down-back-outline', 'bottom-right': 'return-down-forward-outline',
                  };
                  const active = overlayDraft.logoPosition === corner;
                  return (
                    <TouchableOpacity
                      key={corner}
                      onPress={() => setOverlayDraft((d) => ({ ...d, logoPosition: corner }))}
                      style={{
                        width: '47%', paddingVertical: 9, borderRadius: borderRadius.md,
                        borderWidth: 1.5,
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary + '15' : 'transparent',
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      <Ionicons name={icons[corner]} size={14} color={active ? colors.primary : colors.textSecondary} />
                      <Text style={{ fontSize: fontSize.xs, color: active ? colors.primary : colors.textSecondary, fontWeight: active ? fontWeight.semibold : fontWeight.normal }}>
                        {labels[corner]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            )}

            {/* Preview strip */}
            {(overlayDraft.text || overlayDraft.showLogo) && (
              <View style={{ borderRadius: borderRadius.md, overflow: 'hidden', height: 70, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' }}>
                {overlayDraft.text && overlayDraft.textPosition === 'top' && (
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{overlayDraft.text}</Text>
                  </View>
                )}
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>Voorbeeld overlay</Text>
                {overlayDraft.showLogo && (
                  <View style={{
                    position: 'absolute',
                    ...(overlayDraft.logoPosition === 'top-left' ? { top: 6, left: 8 } :
                        overlayDraft.logoPosition === 'top-right' ? { top: 6, right: 8 } :
                        overlayDraft.logoPosition === 'bottom-left' ? { bottom: 6, left: 8 } :
                        { bottom: 6, right: 8 }),
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    borderRadius: 6,
                    padding: 4,
                  }}>
                    <Buildings size={14} color="#fff" weight="duotone" />
                  </View>
                )}
                {overlayDraft.text && overlayDraft.textPosition === 'bottom' && (
                  <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{overlayDraft.text}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {editingOverlay && overlayConfig[editingOverlay] && (
                <TouchableOpacity
                  onPress={() => editingOverlay && clearOverlay(editingOverlay)}
                  style={{
                    flex: 1,
                    paddingVertical: 13,
                    borderRadius: borderRadius.md,
                    borderWidth: 1.5,
                    borderColor: colors.error,
                    backgroundColor: (colors as any).error + '10',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: colors.error, fontWeight: fontWeight.semibold, fontSize: fontSize.sm }}>
                    Overlay wissen
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => editingOverlay && saveOverlay(editingOverlay)}
                style={{
                  flex: 2,
                  paddingVertical: 13,
                  borderRadius: borderRadius.md,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: colors.textOnPrimary, fontWeight: fontWeight.bold, fontSize: fontSize.md }}>
                  Overlay toepassen
                </Text>
              </TouchableOpacity>
            </View>
            {/* Apply to all channels */}
            {posts.length > 1 && (
              <TouchableOpacity
                onPress={async () => {
                  if (!editingOverlay) return;
                  // Apply overlay to all posts
                  for (const p of posts) {
                    setOverlayConfig((prev) => ({ ...prev, [p.id]: { ...overlayDraft } }));
                    try {
                      await updatePost.mutateAsync({
                        id: p.id,
                        engagement: {
                          ...(p.engagement ?? { likes: 0, comments: 0, shares: 0 }),
                          overlay_config: { ...overlayDraft },
                        } as any,
                      });
                    } catch { /* non-critical */ }
                  }
                  setEditingOverlay(null);
                  Alert.alert('✅', `Overlay toegepast op alle ${posts.length} kanalen`);
                }}
                style={{
                  marginTop: 8,
                  paddingVertical: 11,
                  borderRadius: borderRadius.md,
                  borderWidth: 1.5,
                  borderColor: colors.secondary,
                  backgroundColor: (colors as any).secondary + '10',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: colors.secondary, fontWeight: fontWeight.semibold, fontSize: fontSize.sm }}>
                  Toepassen op alle kanalen ({posts.length})
                </Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Full-screen zoom modal — pinch to zoom, tap X to close */}
      <Modal
        visible={!!zoomImageUrl}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setZoomImageUrl(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' }}>
          <StatusBar hidden />
          {/* Close button */}
          <TouchableOpacity
            style={{
              position: 'absolute',
              top: Platform.OS === 'ios' ? 54 : 24,
              right: 18,
              zIndex: 20,
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderRadius: 20,
              padding: 8,
            }}
            onPress={() => setZoomImageUrl(null)}
          >
            <X size={24} color="#fff" weight="bold" />
          </TouchableOpacity>

          {/* Pinch-zoom via native ScrollView maximumZoomScale */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}
            maximumZoomScale={5}
            minimumZoomScale={1}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            centerContent
            bouncesZoom
          >
            <Image
              source={{ uri: zoomImageUrl ?? undefined }}
              style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH, borderRadius: 0 }}
              resizeMode="contain"
            />
          </ScrollView>

          {/* Zoom hint label */}
          <Text style={{
            position: 'absolute',
            bottom: 30,
            alignSelf: 'center',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 12,
          }}>
            Knijp om in te zoomen · Tik × om te sluiten
          </Text>
        </View>
      </Modal>

      {/* ── Account Picker Modal ── */}
      <Modal visible={showAccountPicker} transparent animationType="slide" onRequestClose={() => setShowAccountPicker(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowAccountPicker(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, paddingBottom: Platform.OS === 'ios' ? 40 : 20 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md }} />
              <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold as any, color: colors.text, marginBottom: 4 }}>
                Kies account
              </Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md }}>
                Tap een account om direct te publiceren, of vink meerdere aan om naar alle te posten.
              </Text>
              {availableAccounts.map((acc) => {
                const isSelected = pickerSelectedIds.has(acc.id);
                const isIgPersonalWarn = pendingPublishPost?.channel === 'instagram' && acc.account_type === 'personal';
                return (
                  <View
                    key={acc.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      backgroundColor: colors.background, borderRadius: borderRadius.md, padding: spacing.md,
                      marginBottom: 8, borderWidth: 1, borderColor: isSelected ? colors.primary : colors.border,
                    }}
                  >
                    {/* Multi-select checkbox */}
                    <TouchableOpacity
                      onPress={() => {
                        setPickerSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(acc.id)) next.delete(acc.id); else next.add(acc.id);
                          return next;
                        });
                      }}
                      style={{
                        width: 24, height: 24, borderRadius: 6,
                        borderWidth: 2,
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected ? colors.primary : 'transparent',
                        justifyContent: 'center', alignItems: 'center',
                      }}
                    >
                      {isSelected && <Check size={16} color="#fff" weight="bold" />}
                    </TouchableOpacity>
                    {/* Tap on the rest of the row = single direct publish */}
                    <TouchableOpacity
                      onPress={() => {
                        setShowAccountPicker(false);
                        if (pendingPublishPost) doPublish(pendingPublishPost, acc.id, acc);
                      }}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                    >
                      {acc.profile_image_url ? (
                        <Image source={{ uri: acc.profile_image_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                      ) : (
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '20', justifyContent: 'center', alignItems: 'center' }}>
                          <User size={20} color={colors.primary} weight="duotone" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: fontWeight.semibold as any }}>
                          {acc.account_name || acc.platform_account_id}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>
                          {acc.account_type === 'page' ? '🏢 Bedrijfspagina' : acc.account_type === 'business' ? '💼 Zakelijk' : '👤 Persoonlijk'}
                        </Text>
                        {isIgPersonalWarn && (
                          <Text style={{ color: '#E0A500', fontSize: fontSize.xs, marginTop: 2 }}>
                            ⚠️ Vereist Business + FB-koppeling om te publiceren
                          </Text>
                        )}
                      </View>
                      <CaretRight size={18} color={colors.textTertiary} weight="bold" />
                    </TouchableOpacity>
                  </View>
                );
              })}
              {/* Multi-publish button — appears when >0 accounts checked */}
              {pickerSelectedIds.size > 0 && (
                <TouchableOpacity
                  onPress={async () => {
                    if (!pendingPublishPost) return;
                    const post = pendingPublishPost;
                    const selected = availableAccounts.filter(a => pickerSelectedIds.has(a.id));
                    setShowAccountPicker(false);
                    // Publish sequentially. doPublish shows its own confirm Alert per call —
                    // for multi-publish we bypass that by inlining: we directly call publishPost
                    // for each selected account. Errors are surfaced after the loop.
                    const errs: string[] = [];
                    for (const acc of selected) {
                      try {
                        await publishPost.mutateAsync({ postId: post.id, accountId: acc.id });
                      } catch (e: any) {
                        errs.push(`${acc.account_name}: ${e?.userMessage || e?.message || 'fout'}`);
                      }
                    }
                    if (errs.length === 0) {
                      Alert.alert('✅ Gepubliceerd', `Naar ${selected.length} accounts.`);
                    } else {
                      Alert.alert(
                        errs.length === selected.length ? '❌ Mislukt' : '⚠️ Deels gelukt',
                        errs.join('\n\n'),
                      );
                    }
                  }}
                  style={{
                    backgroundColor: colors.primary,
                    paddingVertical: spacing.md, borderRadius: borderRadius.md,
                    alignItems: 'center', marginTop: 4, marginBottom: 4,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.bold as any }}>
                    Publiceer naar {pickerSelectedIds.size} accounts
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowAccountPicker(false)} style={{ alignItems: 'center', paddingVertical: spacing.sm, marginTop: 4 }}>
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>Annuleren</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Connect Account Modal (shown when no accounts for channel) ── */}
      <Modal visible={showConnectModal} transparent animationType="slide" onRequestClose={() => setShowConnectModal(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowConnectModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, paddingBottom: Platform.OS === 'ios' ? 40 : 20 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Ionicons name={channelConfig[connectPlatform as Channel]?.icon as any || 'link-outline'} size={22} color={channelConfig[connectPlatform as Channel]?.color || colors.primary} />
                <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold as any, color: colors.text }}>
                  {channelConfig[connectPlatform as Channel]?.label || connectPlatform} koppelen
                </Text>
              </View>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md }}>
                {connectPlatform === 'whatsapp'
                  ? 'Voeg je telefoonnummer of bedrijfsnaam toe. Posts worden handmatig gedeeld via WhatsApp.'
                  : `Je hebt nog geen ${channelConfig[connectPlatform as Channel]?.label} account gekoppeld. Voeg er een toe om direct te publiceren.`}
              </Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 6 }}>
                {connectPlatform === 'whatsapp' ? 'TELEFOONNUMMER OF NAAM *' : 'ACCOUNTNAAM *'}
              </Text>
              <TextInput
                style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.sm, fontSize: fontSize.md, color: colors.text, marginBottom: spacing.sm }}
                placeholder={connectPlatform === 'whatsapp' ? 'Bijv. "+31612345678" of "Inclufy Support"' : `Bijv. "Inclufy" of "@inclufy"`}
                placeholderTextColor={colors.textTertiary}
                value={connectAccountName}
                onChangeText={setConnectAccountName}
                autoFocus
              />
              <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary, marginBottom: 6 }}>PROFIEL URL (optioneel)</Text>
              <TextInput
                style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.sm, fontSize: fontSize.md, color: colors.text, marginBottom: spacing.md }}
                placeholder="https://..."
                placeholderTextColor={colors.textTertiary}
                value={connectAccountUrl}
                onChangeText={setConnectAccountUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
              <TouchableOpacity
                onPress={handleConnectAccount}
                disabled={connecting || !connectAccountName.trim()}
                style={{
                  backgroundColor: channelConfig[connectPlatform as Channel]?.color || colors.primary,
                  borderRadius: borderRadius.md, paddingVertical: 14, alignItems: 'center',
                  opacity: connecting || !connectAccountName.trim() ? 0.6 : 1,
                }}
              >
                {connecting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>
                    Koppelen & publiceren
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowConnectModal(false)} style={{ alignItems: 'center', paddingVertical: spacing.sm, marginTop: 4 }}>
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>Later</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      <AIConsentModal visible={showConsentModal} onAccept={onConsentAccept} onDecline={onConsentDecline} />
    </View>
  );
}
