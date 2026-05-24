// TODO: migrate to Phosphor — unmapped icons: Ionicons name=<dynamic: cap.media_type === 'video' ? 'videocam-outline' : cap.media_type === 'audio' ? 'mic-outline' : 'document-text-outline'> | Ionicons name=<dynamic: ch.icon as any> | Ionicons name=<dynamic: tab.icon as any> | MaterialCommunityIcons name=<dynamic: product.category === 'service' ? 'hand-heart-outline' : 'package-variant-closed'> | MaterialCommunityIcons name=<dynamic: saveToLibrary ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'>
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';

import CameraCapture from '../components/CameraCapture';
import AudioCapture from '../components/AudioCapture';
import QuoteCapture from '../components/QuoteCapture';
import TagSelector from '../components/TagSelector';

import { useEvent } from '../hooks/useEvents';
import { useCaptures, useCreateCapture, uploadMedia } from '../hooks/useCaptures';
import { useCreatePosts } from '../hooks/useEventPosts';
import { useBrandMemory, toBrandContext } from '../hooks/useBrandMemory';
import { useProducts, Product } from '../hooks/useProducts';
import { useTeamDirectory, TeamDirectoryMember } from '../hooks/useTeamDirectory';
import { aiService } from '../services/ai.service';
import { supabase } from '../services/supabase';
import { fetchConnectedChannels } from '../hooks/useConnectedChannels';

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { RootStackParamList, MediaType, Channel } from '../types';
import { CAPTURE_TAG_PRESETS } from '../types';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import AIConsentModal from '../components/AIConsentModal';
import { useAIConsent } from '../hooks/useAIConsent';

import { Calendar, Camera, CaretRight, Check, FolderOpen, Image as ImageIcon, Package, User, UsersThree, X } from 'phosphor-react-native';
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'LiveCapture'>;

type CaptureMode = 'photo' | 'video' | 'audio' | 'quote' | 'upload';

/**
 * Fix photo orientation using EXIF data.
 * iOS cameras store portrait photos as landscape pixels with EXIF orientation flag.
 * expo-image-manipulator doesn't always apply EXIF rotation automatically.
 */
async function normalizeImageOrientation(uri: string, exif?: Record<string, any>): Promise<string> {
  // Empirical lesson 2026-05-07 (Sami's "still flipped" report on build 216):
  //
  // expo-image-manipulator on iOS auto-applies EXIF orientation when reading
  // the source image. Plus expo-camera with skipProcessing:false bakes
  // orientation into pixels before returning the URI. Both layers normalise
  // orientation. Adding our OWN explicit switch on top caused DOUBLE rotation
  // — pixels rotated once by iOS/manipulator, then rotated again by our code.
  //
  // The fix: trust the lib + iOS. Just pass through ImageManipulator with
  // resize-only to force a JPEG re-encode, which strips the EXIF orientation
  // flag from the output so downstream <Image> components see clean pixels.
  //
  // The exif parameter is kept in the signature for backwards compatibility
  // and Sentry-breadcrumb logging — we no longer act on it.
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1920 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );

    // Sentry breadcrumb for any future "still rotated" report — captures the
    // raw EXIF and the result URI so we can diagnose without shipping a
    // logging build.
    try {
      const SentryRN = require('@sentry/react-native');
      SentryRN.addBreadcrumb({
        category: 'image-orientation',
        level: 'info',
        message: 'normalizeImageOrientation completed',
        data: {
          source_uri: uri,
          result_uri: result.uri,
          exif_orientation: exif?.Orientation ?? exif?.orientation ?? 'missing',
          exif_keys: exif ? Object.keys(exif).slice(0, 12) : [],
        },
      });
    } catch { /* Sentry not initialised in dev — ignore */ }

    return result.uri;
  } catch (err) {
    console.warn('[normalizeImageOrientation] failed for', uri, err);
    return uri;
  }
}

export default function LiveCaptureScreen() {
  const { t } = useTranslation();

  const MODE_TABS: { key: CaptureMode; label: string; icon: string }[] = [
    { key: 'photo', label: t.liveCapture.photo, icon: 'camera-outline' },
    { key: 'video', label: t.liveCapture.video, icon: 'videocam-outline' },
    { key: 'audio', label: t.liveCapture.audio, icon: 'mic-outline' },
    { key: 'quote', label: t.liveCapture.quote, icon: 'document-text-outline' },
    { key: 'upload', label: 'Upload', icon: 'image-outline' },
  ];

  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  // params may be undefined when navigated from the tab bar without an event
  const eventId: string = (route.params as any)?.eventId ?? '';
  const captureCategory: string = (route.params as any)?.captureCategory ?? 'event';

  const { data: event } = useEvent(eventId || undefined);
  const { data: captures = [] } = useCaptures(eventId || undefined);
  const { data: brandMemory } = useBrandMemory();
  const createCapture = useCreateCapture();
  const createPosts = useCreatePosts();

  const [mode, setMode] = useState<CaptureMode>('photo');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [saveToLibrary, setSaveToLibrary] = useState(true); // save photos to phone library

  // Ref to pass extra image URLs from multi-photo upload to processCapture/processFreeCapture
  const pendingExtraImagesRef = React.useRef<string[] | null>(null);

  // Per-capture channel selection — defaults to the event's channels, user can override
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>([]);

  // Context selection for product/behind_scenes captures
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedMember, setSelectedMember] = useState<TeamDirectoryMember | null>(null);
  const { data: products = [] } = useProducts();
  const { data: teamMembers = [] } = useTeamDirectory();
  const needsProductSelection = captureCategory === 'product' && !selectedProduct && products.length > 0;
  const needsMemberSelection = captureCategory === 'behind_scenes' && !selectedMember && teamMembers.length > 0;

  const { hasConsent, showModal: showConsentModal, requestConsent, onAccept: onConsentAccept, onDecline: onConsentDecline } = useAIConsent();

  // Sync with event channels when the event loads (only if user hasn't manually changed them)
  useEffect(() => {
    if (event?.channels?.length) {
      setSelectedChannels(event.channels as Channel[]);
    }
  }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleChannel = (ch: Channel) =>
    setSelectedChannels((prev) =>
      prev.includes(ch) ? (prev.length > 1 ? prev.filter((c) => c !== ch) : prev) : [...prev, ch],
    );

  // Full 8-platform list to match wizard goal-step. Earlier hardcoded subset
  // of 4 channels caused PostReview to only show 4 tabs even when user had
  // 6 OAuth + 2 manual platforms connected.
  const CHANNEL_OPTIONS: { key: Channel; label: string; color: string; icon: string }[] = [
    { key: 'linkedin',  label: 'LinkedIn',  color: '#0077B5', icon: 'logo-linkedin'  },
    { key: 'instagram', label: 'Instagram', color: '#E4405F', icon: 'logo-instagram' },
    { key: 'facebook',  label: 'Facebook',  color: '#1877F2', icon: 'logo-facebook'  },
    { key: 'tiktok',    label: 'TikTok',    color: '#000000', icon: 'musical-notes'  },
    { key: 'pinterest', label: 'Pinterest', color: '#E60023', icon: 'logo-pinterest' },
    { key: 'threads',   label: 'Threads',   color: '#000000', icon: 'at-circle'      },
    { key: 'snapchat',  label: 'Snapchat',  color: '#FFFC00', icon: 'logo-snapchat'  },
    { key: 'whatsapp',  label: 'WhatsApp',  color: '#25D366', icon: 'logo-whatsapp'  },
  ];

  // Guard flags — actual early returns are placed AFTER all hooks to satisfy React rules
  const needsEvent = captureCategory === 'event' || captureCategory === 'quick';
  const showEventGuard = !eventId && needsEvent;

  // Guard screens are rendered below (after all hooks) to satisfy React rules of hooks

  const tags = event?.default_tags?.length
    ? event.default_tags
    : CAPTURE_TAG_PRESETS.map(String);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  // ── Free capture (no event required) — create capture + AI posts, navigate to PostReview ──
  const processFreeCapture = useCallback(
    async (mediaUri: string, mediaType: MediaType, exif?: Record<string, any>, transcript?: string) => {
      if (!hasConsent) {
        requestConsent(() => { processFreeCapture(mediaUri, mediaType, exif, transcript); });
        return;
      }
      setProcessing(true);
      try {
        // 1. Normalise photo orientation using EXIF data
        let finalUri = mediaUri;
        if (mediaType === 'photo') {
          finalUri = await normalizeImageOrientation(mediaUri, exif);
        }

        // 2. Save to phone library
        if (saveToLibrary && (mediaType === 'photo' || mediaType === 'video') && finalUri) {
          try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status === 'granted') {
              await MediaLibrary.saveToLibraryAsync(finalUri);
            }
          } catch (libErr) {
            console.warn('[processFreeCapture] Save to library failed (non-fatal):', libErr);
          }
        }

        // 3. Upload to Supabase Storage
        let uploadUrl: string | null = null;
        let uploadPath: string | null = null;
        if (mediaType !== 'quote') {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const ext = mediaType === 'photo' ? 'jpg' : mediaType === 'video' ? 'mp4' : 'm4a';
              const fileName = `${captureCategory}_${Date.now()}.${ext}`;
              const storagePath = `content/${user.id}/${fileName}`;
              const fileBase64 = await FileSystem.readAsStringAsync(finalUri, { encoding: 'base64' as any });
              const { error: upErr } = await supabase.storage
                .from('media')
                .upload(storagePath, Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0)), {
                  contentType: mediaType === 'photo' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'audio/m4a',
                  upsert: true,
                });
              if (!upErr) {
                const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath);
                uploadUrl = urlData?.publicUrl ?? null;
                uploadPath = storagePath;
              }
            }
          } catch (uploadErr) {
            console.warn('[processFreeCapture] Upload failed (non-fatal):', uploadErr);
          }
        }

        // 4. Create capture record (event_id is null for free captures)
        const capture = await createCapture.mutateAsync({
          event_id: null,
          media_type: mediaType,
          media_url: uploadUrl ?? '',
          storage_path: uploadPath ?? '',
          thumbnail_url: mediaType === 'photo' ? uploadUrl : null,
          tags: selectedTags,
          note: note.trim(),
          ai_status: 'processing',
          ai_description: null,
          duration_seconds: null,
          transcript: transcript || null,
          captured_at: new Date().toISOString(),
        } as any);

        // 5. Generate AI posts for default channels
        let imageBase64: string | undefined;
        if (mediaType === 'photo') {
          try {
            imageBase64 = await FileSystem.readAsStringAsync(finalUri, { encoding: 'base64' as any });
          } catch {}
        }

        const brandCtx = toBrandContext(brandMemory);
        if (brandCtx) aiService.setBrandContext(brandCtx);

        // For audio captures, use the transcript as AI context
        const aiText = transcript || note.trim() || undefined;

        // Resolve channels for free-capture flow:
        //   1. Explicit picker selection (selectedChannels)
        //   2. Dynamic — every connected OAuth platform + manual-share
        //      (snapchat/whatsapp). No hardcoded 4-channel fallback —
        //      Sami had 6 OAuth + 2 manual connected and was only seeing
        //      4 tabs because of the static fallback.
        let activeChannels: Channel[];
        if (selectedChannels.length) {
          activeChannels = selectedChannels;
        } else {
          const { allChannels } = await fetchConnectedChannels();
          activeChannels = allChannels.length
            ? allChannels
            : (['snapchat', 'whatsapp'] as Channel[]);
        }

        let results: Record<string, any> = {};
        try {
          results = await aiService.generateAllChannelPosts(
            activeChannels,
            imageBase64,
            aiText,
            {
              name: captureCategory === 'product' ? (selectedProduct?.name || 'Product') :
                    captureCategory === 'behind_scenes' ? (selectedMember?.name || 'Behind the Scenes') :
                    captureCategory === 'inspiration' ? 'Inspiratie' : 'Content',
              description: '',
              hashtags: [],
              location: '',
            },
            note.trim(),
            selectedTags,
          );
        } catch {
          for (const channel of activeChannels) {
            results[channel] = {
              text: note.trim() || captureCategory,
              hashtags: [],
              image_description: '',
              optimal_post_time: '',
            };
          }
        }

        // 6. Save generated posts (include extra_images if multi-photo upload)
        const pendingExtras = pendingExtraImagesRef.current || [];
        const postRows = Object.entries(results).map(([channel, result]) => ({
          capture_id: capture.id,
          event_id: null,
          channel: channel as any,
          text_content: result.text,
          hashtags: result.hashtags,
          branded_image_url: mediaType === 'photo' ? uploadUrl : null,
          video_url: mediaType === 'video' ? uploadUrl : null,
          media_type: mediaType,
          image_format: channel === 'instagram' ? 'square' as const : 'landscape' as const,
          status: 'draft' as const,
          published_at: null,
          scheduled_at: null,
          publish_error: null,
          engagement: {
            likes: 0, comments: 0, shares: 0,
            // Store the capture category so PostReviewScreen can apply
            // per-category account preferences (e.g. product→page, inspiratie→personal).
            category: captureCategory,
            ...(pendingExtras.length > 0 ? { extra_images: pendingExtras } : {}),
          },
        }));

        await createPosts.mutateAsync(postRows);

        // 7. Mark AI as completed
        supabase.from('go_captures').update({ ai_status: 'completed' }).eq('id', capture.id).then(() => {});

        // 8. Navigate to PostReview (with overlay/mirror support + extra images)
        const extraImageUrlsToPass = pendingExtraImagesRef.current || [];
        setNote('');
        setSelectedTags([]);
        navigation.navigate('PostReview', {
          captureId: capture.id,
          localMediaUri: (mediaType === 'photo' || mediaType === 'video') ? finalUri : undefined,
          ...(extraImageUrlsToPass.length > 0 ? { extraImageUrls: extraImageUrlsToPass } : {}),
        } as any);
      } catch (error: any) {
        Alert.alert('Fout', error.message || 'Vastleggen mislukt.');
      } finally {
        setProcessing(false);
      }
    },
    [captureCategory, saveToLibrary, selectedTags, selectedChannels, note, brandMemory, selectedProduct, selectedMember, createCapture, createPosts, navigation, hasConsent, requestConsent],
  );

  const processCapture = useCallback(
    async (mediaUri: string, mediaType: MediaType, transcript?: string, exif?: Record<string, any>) => {
      if (!event) return;
      if (!hasConsent) {
        requestConsent(() => { processCapture(mediaUri, mediaType, transcript, exif); });
        return;
      }
      setProcessing(true);

      try {
        // 1. Normalise photo orientation using EXIF data
        let finalUri = mediaUri;
        if (mediaType === 'photo') {
          finalUri = await normalizeImageOrientation(mediaUri, exif);
        }

        // 1b. Optionally save to phone photo library
        if (saveToLibrary && mediaType === 'photo' && finalUri) {
          try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status === 'granted') {
              await MediaLibrary.saveToLibraryAsync(finalUri);
            }
          } catch (libErr) {
            console.warn('[processCapture] Save to library failed (non-fatal):', libErr);
          }
        }

        // 2. Upload media to Supabase Storage — skip for text/quote captures
        let uploadUrl: string | null = null;
        let uploadPath: string | null = null;
        if (mediaType !== 'quote') {
          try {
            const uploaded = await uploadMedia(finalUri, eventId, mediaType as any);
            uploadUrl = uploaded.url;
            uploadPath = uploaded.path;
          } catch (uploadErr: any) {
            if (mediaType === 'audio') {
              // Audio upload is non-fatal — we still have the transcript for AI generation
              console.warn('[processCapture] Audio upload failed (non-fatal):', uploadErr?.message);
            } else {
              throw uploadErr; // Photo / video upload failure IS fatal
            }
          }
        }

        // 3. Create capture record
        // media_url and storage_path have NOT NULL DB constraints — use empty string as fallback
        const capture = await createCapture.mutateAsync({
          event_id: eventId,
          media_type: mediaType,
          media_url: uploadUrl ?? '',
          storage_path: uploadPath ?? '',
          thumbnail_url: mediaType === 'photo' ? uploadUrl : null,
          tags: selectedTags,
          note: note.trim(),
          ai_status: 'processing',
          ai_description: null,
          duration_seconds: null,
          transcript: transcript || null,
          captured_at: new Date().toISOString(),
        } as any);

        // 4. Generate AI posts for all channels
        let imageBase64: string | undefined;
        if (mediaType === 'photo') {
          // Use finalUri (orientation-corrected) so the AI also sees the upright image
          try {
            const base64 = await FileSystem.readAsStringAsync(finalUri, {
              encoding: 'base64' as any,
            });
            imageBase64 = base64;
          } catch (readErr) {
            console.warn('[processCapture] Could not read photo as base64:', readErr);
          }
        }

        const brandCtx = toBrandContext(brandMemory);
        if (brandCtx) aiService.setBrandContext(brandCtx);

        // For non-photo captures, use the transcript or note as text context for the AI
        const aiTranscript = transcript || (mediaType !== 'photo' ? note.trim() : undefined);

        // Resolve which channels to generate posts for. Priority:
        //   1. Explicit selectedChannels (user picked in capture screen)
        //   2. Event-level configured channels
        //   3. Dynamic — every connected OAuth platform (social_accounts) +
        //      manual-share (snapchat/whatsapp). Single source of truth via
        //      fetchConnectedChannels() helper — same hook the rest of the
        //      app uses, so picker / PostReview / Library stay in sync.
        //   4. Final safety net: manual-share only (never hardcode the 4
        //      OAuth platforms — that was the bug Sami hit when he had 6
        //      OAuth + 2 manual connected and only saw 4 tabs).
        const resolveActiveChannels = async (): Promise<Channel[]> => {
          if (selectedChannels.length) return selectedChannels;
          if (event.channels?.length) return event.channels as Channel[];
          const { allChannels } = await fetchConnectedChannels();
          if (allChannels.length) return allChannels;
          return ['snapchat', 'whatsapp'] as Channel[];
        };
        const activeChannels: Channel[] = await resolveActiveChannels();

        let results: Record<string, any> = {};
        try {
          results = await aiService.generateAllChannelPosts(
            activeChannels,
            imageBase64,
            aiTranscript,
            {
              name: event.name,
              description: event.description,
              hashtags: event.hashtags,
              location: event.location,
            },
            note.trim(),
            selectedTags,
          );
        } catch (aiErr) {
          // AI generation failed (timeout, Edge Function error, etc.)
          // Create placeholder posts so user can still navigate to PostReview and edit manually
          console.warn('[processCapture] AI generation failed, using placeholders:', aiErr);
          for (const channel of activeChannels) {
            results[channel] = {
              text: note.trim() || event.name,
              hashtags: event.hashtags || [],
              image_description: '',
              optimal_post_time: '',
            };
          }
        }

        // 5. Save generated posts
        const postRows = Object.entries(results).map(([channel, result]) => ({
          capture_id: capture.id,
          event_id: eventId,
          channel: channel as any,
          text_content: result.text,
          hashtags: result.hashtags,
          branded_image_url: mediaType === 'photo' ? uploadUrl : null,
          video_url: mediaType === 'video' ? uploadUrl : null,
          media_type: mediaType,
          image_format: channel === 'instagram' ? 'square' as const : 'landscape' as const,
          status: 'draft' as const,
          published_at: null,
          scheduled_at: null,
          publish_error: null,
          engagement: { likes: 0, comments: 0, shares: 0, category: captureCategory },
        }));

        await createPosts.mutateAsync(postRows);

        // 6. Auto-tag the image in the background (non-blocking)
        if (imageBase64) {
          aiService.autoTagImage({
            image_base64: imageBase64,
            existing_tags: selectedTags,
          }).then((tagResult) => {
            // Store AI tags on the capture record
            supabase
              .from('go_captures')
              .update({
                ai_tags: tagResult.tags,
                ai_description: tagResult.scene_description,
                ai_status: 'completed',
              })
              .eq('id', capture.id)
              .then(() => {
                console.log('Auto-tags saved for capture', capture.id);
              });
          }).catch((err) => {
            console.warn('Auto-tagging failed (non-critical):', err);
            // Still mark as completed since posts were generated
            supabase
              .from('go_captures')
              .update({ ai_status: 'completed' })
              .eq('id', capture.id)
              .then(() => {});
          });
        } else {
          // Non-photo captures: just mark as completed
          supabase
            .from('go_captures')
            .update({ ai_status: 'completed' })
            .eq('id', capture.id)
            .then(() => {});
        }

        // 6. Attach pending extra images from multi-photo upload
        const pendingExtra = pendingExtraImagesRef.current;
        if (pendingExtra && pendingExtra.length > 0) {
          // Save extra images to all posts of this capture
          try {
            const { data: capturePosts } = await supabase
              .from('go_posts')
              .select('id, engagement')
              .eq('capture_id', capture.id);
            if (capturePosts) {
              for (const p of capturePosts) {
                const eng = { ...(p.engagement ?? { likes: 0, comments: 0, shares: 0 }), extra_images: pendingExtra };
                await supabase.from('go_posts').update({ engagement: eng }).eq('id', p.id);
              }
            }
          } catch (extraErr) {
            console.warn('[processCapture] Extra images attach failed:', extraErr);
          }
        }

        // 7. Navigate to review
        setNote('');
        setSelectedTags([]);
        navigation.navigate('PostReview', {
          captureId: capture.id,
          eventId,
          localMediaUri: (mediaType === 'photo' || mediaType === 'video') ? finalUri : undefined,
          extraImageUrls: pendingExtra || undefined,
        });
      } catch (error: any) {
        Alert.alert(t.common.error, error.message || t.liveCapture.processingError);
      } finally {
        setProcessing(false);
      }
    },
    [event, eventId, selectedTags, selectedChannels, note, brandMemory, createCapture, createPosts, navigation, hasConsent, requestConsent],
  );

  // Use free capture flow when no event is linked
  const isFreeCapture = !eventId && !needsEvent;

  const handlePhotoCapture = (uri: string, exif?: Record<string, any>) =>
    isFreeCapture ? processFreeCapture(uri, 'photo', exif) : processCapture(uri, 'photo', undefined, exif);

  const handleVideoEnd = (uri: string) =>
    isFreeCapture ? processFreeCapture(uri, 'video') : processCapture(uri, 'video');

  const handleAudioComplete = async (uri: string) => {
    if (!hasConsent) {
      requestConsent(() => { handleAudioComplete(uri); });
      return;
    }
    setProcessing(true);
    // Transcribe audio for both free and event captures
    let transcript = '';
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64' as any,
      });
      const result = await aiService.transcribeAudio(base64);
      transcript = result.transcript;
    } catch (transcribeErr) {
      console.warn('[AudioCapture] transcription failed (non-fatal):', transcribeErr);
    }
    if (isFreeCapture) {
      setProcessing(false);
      await processFreeCapture(uri, 'audio', undefined, transcript || note.trim() || undefined);
      return;
    }
    await processCapture(uri, 'audio', transcript || note.trim() || undefined);
  };

  const handleUploadFromLibrary = async () => {
    // Check AI consent before opening picker — avoids stale closure after modal dismiss
    if (!hasConsent) {
      requestConsent(() => { handleUploadFromLibrary(); });
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Geen toegang', 'Geef toegang tot je fotobibliotheek om een afbeelding te uploaden.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.85,
      allowsEditing: false,
      exif: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      if (result.assets.length === 1) {
        // Single photo — normalize orientation with EXIF, then process
        const asset = result.assets[0];
        const normalizedUri = await normalizeImageOrientation(asset.uri, asset.exif ?? undefined);
        isFreeCapture
          ? await processFreeCapture(normalizedUri, 'photo')
          : await processCapture(normalizedUri, 'photo');
      } else {
        // Multi-photo — process first as primary, upload extras, then navigate with extraImageUrls
        setProcessing(true);
        try {
          // Normalize primary photo orientation
          const primaryAsset = result.assets[0];
          const primaryUri = await normalizeImageOrientation(primaryAsset.uri, primaryAsset.exif ?? undefined);

          // 1. Upload extra images first (normalize each with EXIF)
          const extraUrls: string[] = [];
          for (const asset of result.assets.slice(1)) {
            const normalizedUri = await normalizeImageOrientation(asset.uri, asset.exif ?? undefined);
            const uploaded = await uploadMedia(normalizedUri, eventId || '', 'photo');
            extraUrls.push(uploaded.url);
          }

          // 2. Store extra URLs in ref so processFreeCapture/processCapture can access them
          pendingExtraImagesRef.current = extraUrls;
          if (isFreeCapture) {
            await processFreeCapture(primaryUri, 'photo');
          } else {
            await processCapture(primaryUri, 'photo');
          }
        } catch (err: any) {
          Alert.alert('Fout', err?.message || 'Multi-foto verwerking mislukt');
        } finally {
          pendingExtraImagesRef.current = null;
          setProcessing(false);
        }
      }
    }
  };

  const handleQuoteSubmit = async (quote: string, speaker: string) => {
    const text = speaker ? `"${quote}" \u2014 ${speaker}` : `"${quote}"`;
    setNote(text);
    if (isFreeCapture) {
      // For free captures, save quote as content draft directly
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('content_posts').insert({
            user_id: user.id,
            content_type: captureCategory,
            platform: 'linkedin',
            content: text,
            hashtags: selectedTags,
            tone: 'professional',
            status: 'draft',
            media_urls: [],
          });
        }
      } catch {}
      Alert.alert('✅ Vastgelegd!', 'Quote opgeslagen als draft.', [
        { text: 'Nog een', style: 'cancel' },
        { text: 'Content maken →', onPress: () => navigation.navigate('ContentCreator' as any, {}) },
      ]);
      return;
    }
    await processCapture('', 'quote', text);
  };

  // ── Guard: Event required but no eventId ──
  if (showEventGuard) {
    const goBack = () => {
      if (navigation.canGoBack()) navigation.goBack();
      else (navigation as any).navigate('Main');
    };
    const goToEvents = () => {
      try { (navigation as any).navigate('Main', { screen: 'EventsTab' }); }
      catch { navigation.goBack(); }
    };
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <TouchableOpacity onPress={goBack} style={{ position: 'absolute', top: 56, left: 20, zIndex: 10, padding: 8 }}>
          <X size={28} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surfaceElevated, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
            <Camera size={40} color={colors.primary} weight="duotone" />
          </View>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' }}>Selecteer een event</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 15, marginTop: 10, textAlign: 'center', lineHeight: 22 }}>
            Open een event vanuit de Events-tab en tik op{' '}
            <Text style={{ color: colors.primary, fontWeight: '600' }}>"Capture"</Text>{' '}om te starten.
          </Text>
          <TouchableOpacity onPress={goToEvents} style={{ marginTop: 32, backgroundColor: colors.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 28, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} color="#fff" weight="duotone" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Naar Events</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goBack} style={{ marginTop: 16, paddingHorizontal: 32, paddingVertical: 12 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Annuleer</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Guard: Product Capture — select a product/service first ──
  if (needsProductSelection) {
    const goBack = () => navigation.canGoBack() ? navigation.goBack() : (navigation as any).navigate('Main');
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <TouchableOpacity onPress={goBack} style={{ position: 'absolute', top: 56, left: 20, zIndex: 10, padding: 8 }}>
          <X size={28} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <View style={{ flex: 1, paddingTop: 100, paddingHorizontal: 20 }}>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#3B82F615', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              <Package size={32} color="#3B82F6" weight="duotone" />
            </View>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' }}>Kies een product of dienst</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 6, textAlign: 'center' }}>Selecteer waar deze content over gaat</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {products.filter((p) => p.status === 'active').map((product) => (
              <TouchableOpacity key={product.id} onPress={() => setSelectedProduct(product)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceElevated, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border }}>
                {product.image_url ? (
                  <Image source={{ uri: product.image_url }} style={{ width: 48, height: 48, borderRadius: 10 }} />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#3B82F615', justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialCommunityIcons name={product.category === 'service' ? 'hand-heart-outline' : 'package-variant-closed'} size={24} color="#3B82F6" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{product.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {product.category === 'service' ? 'Dienst' : product.category === 'solution' ? 'Oplossing' : 'Product'}
                    {product.description ? ` · ${product.description}` : ''}
                  </Text>
                </View>
                <CaretRight size={18} color={colors.textTertiary} weight="bold" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setSelectedProduct({ id: 'none', name: 'Algemeen', category: 'product' } as any)} style={{ alignItems: 'center', padding: 14, marginTop: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Overslaan — algemene product content</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    );
  }

  // ── Guard: Behind the Scenes — select a team member first ──
  if (needsMemberSelection) {
    const goBack = () => navigation.canGoBack() ? navigation.goBack() : (navigation as any).navigate('Main');
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <TouchableOpacity onPress={goBack} style={{ position: 'absolute', top: 56, left: 20, zIndex: 10, padding: 8 }}>
          <X size={28} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <View style={{ flex: 1, paddingTop: 100, paddingHorizontal: 20 }}>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#10B98115', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
              <UsersThree size={32} color="#10B981" weight="duotone" />
            </View>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' }}>Wie staat centraal?</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 6, textAlign: 'center' }}>Selecteer het teamlid voor deze behind-the-scenes content</Text>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {teamMembers.filter((m) => m.is_active).map((member) => (
              <TouchableOpacity key={member.id} onPress={() => setSelectedMember(member)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceElevated, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border }}>
                {member.photo_url ? (
                  <Image source={{ uri: member.photo_url }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#10B98115', justifyContent: 'center', alignItems: 'center' }}>
                    <User size={24} color="#10B981" weight="duotone" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{member.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {member.role}{member.expertise?.length ? ` · ${member.expertise[0]}` : ''}
                  </Text>
                </View>
                <CaretRight size={18} color={colors.textTertiary} weight="bold" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setSelectedMember({ id: 'none', name: 'Team algemeen' } as any)} style={{ alignItems: 'center', padding: 14, marginTop: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Overslaan — algemene team content</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    );
  }

  if (processing) {
    return (
      <View style={styles.processingOverlay}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.processingText}>{t.liveCapture.aiGenerating}</Text>
        <Text style={styles.processingSubtext}>
          {t.liveCapture.aiGeneratingSubtext}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header overlay */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'\u2039'} {t.common.back}</Text>
        </TouchableOpacity>
        <Text style={styles.eventName} numberOfLines={1}>
          {event?.name || (isFreeCapture
            ? captureCategory === 'product' ? '📦 Product Capture'
            : captureCategory === 'inspiration' ? '💡 Inspiratie'
            : captureCategory === 'behind_scenes' ? '🎬 Behind the Scenes'
            : 'Capture'
            : 'Event')}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Camera / Audio / Quote / Upload View — flex:1, fills remaining space */}
      <View style={styles.captureArea}>
        {mode === 'photo' && <CameraCapture mode="photo" onCapture={handlePhotoCapture} />}
        {mode === 'video' && (
          <CameraCapture mode="video" onCapture={() => {}} onVideoEnd={handleVideoEnd} />
        )}
        {mode === 'audio' && <AudioCapture onRecordingComplete={handleAudioComplete} />}
        {mode === 'quote' && <QuoteCapture onSubmit={handleQuoteSubmit} />}
        {mode === 'upload' && (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20, padding: 32, backgroundColor: '#000' }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(124,58,237,0.2)', justifyContent: 'center', alignItems: 'center' }}>
              <ImageIcon size={40} color={colors.primary} weight="duotone" />
            </View>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>
              Upload afbeelding
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
              Kies een foto uit je bibliotheek. AI analyseert de afbeelding en genereert posts per kanaal.
            </Text>
            <TouchableOpacity
              onPress={handleUploadFromLibrary}
              style={{ backgroundColor: colors.primary, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 28, flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <FolderOpen size={20} color="#fff" weight="duotone" />
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Kies uit bibliotheek</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Bottom controls — NOT absolute, sits between camera and mode tabs */}
      {(mode === 'photo' || mode === 'video') && (
        <View style={styles.bottomControls}>
          {/* Tags */}
          <TagSelector tags={tags} selected={selectedTags} onToggle={toggleTag} />

          {/* Note */}
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder={t.liveCapture.notePlaceholder}
            placeholderTextColor="rgba(255,255,255,0.4)"
            returnKeyType="done"
          />

          {/* Save to library toggle */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
            onPress={() => setSaveToLibrary(!saveToLibrary)}
          >
            <MaterialCommunityIcons
              name={saveToLibrary ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
              size={18}
              color={saveToLibrary ? '#10B981' : 'rgba(255,255,255,0.4)'}
            />
            <Text style={{ fontSize: 12, color: saveToLibrary ? '#10B981' : 'rgba(255,255,255,0.5)' }}>
              Opslaan in fotobibliotheek
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Per-capture channel selector ─────────────────────────────────── */}
      {event && (
        <View style={styles.channelBar}>
          <Text style={styles.channelBarLabel}>Kanalen:</Text>
          <View style={styles.channelChips}>
            {CHANNEL_OPTIONS.map((ch) => {
              const active = selectedChannels.includes(ch.key);
              return (
                <TouchableOpacity
                  key={ch.key}
                  onPress={() => toggleChannel(ch.key)}
                  style={[
                    styles.channelChip,
                    active && { backgroundColor: ch.color + '25', borderColor: ch.color },
                  ]}
                >
                  <Ionicons
                    name={ch.icon as any}
                    size={13}
                    color={active ? ch.color : 'rgba(255,255,255,0.35)'}
                  />
                  <Text style={[styles.channelChipText, active && { color: ch.color }]}>
                    {ch.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Mode Tabs */}
      <View style={styles.modeTabs}>
        {MODE_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.modeTab, mode === tab.key && styles.modeTabActive]}
            onPress={() => setMode(tab.key)}
          >
            <Ionicons name={tab.icon as any} size={20} color={mode === tab.key ? colors.textOnPrimary : colors.textSecondary} />
            <Text
              style={[styles.modeLabel, mode === tab.key && styles.modeLabelActive]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent captures strip */}
      {captures.length > 0 && (
        <ScrollView
          horizontal
          style={styles.recentStrip}
          contentContainerStyle={styles.recentStripContent}
          showsHorizontalScrollIndicator={false}
        >
          {captures.slice(0, 10).map((cap) => (
            <TouchableOpacity
              key={cap.id}
              onPress={() =>
                navigation.navigate('PostReview', { captureId: cap.id, eventId })
              }
            >
              {cap.media_type === 'photo' && cap.thumbnail_url ? (
                <Image source={{ uri: cap.thumbnail_url }} style={styles.thumbnail} />
              ) : (
                <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                  <Ionicons
                    name={cap.media_type === 'video' ? 'videocam-outline' : cap.media_type === 'audio' ? 'mic-outline' : 'document-text-outline'}
                    size={16}
                    color={colors.textSecondary}
                  />
                </View>
              )}
              {cap.ai_status === 'completed' && (
                <View style={styles.thumbnailBadge}>
                  <Check size={8} color="#fff" weight="bold" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <AIConsentModal visible={showConsentModal} onAccept={onConsentAccept} onDecline={onConsentDecline} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  backBtn: { padding: spacing.xs },
  backText: { color: '#fff', fontSize: fontSize.md },
  eventName: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    flex: 1,
    textAlign: 'center',
  },
  captureArea: { flex: 1 },
  bottomControls: {
    backgroundColor: '#111',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  noteInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    color: '#fff',
    fontSize: fontSize.sm,
  },
  channelBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    gap: 8,
  },
  channelBarLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  channelChips: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  channelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'transparent',
  },
  channelChipText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: fontWeight.medium,
  },
  modeTabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  modeTab: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  modeTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  modeIcon: { fontSize: 20 },
  modeLabel: { fontSize: fontSize.xs, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  modeLabelActive: { color: colors.primary, fontWeight: fontWeight.semibold },
  recentStrip: {
    backgroundColor: 'rgba(0,0,0,0.9)',
    maxHeight: 70,
  },
  recentStripContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.sm,
  },
  thumbnailPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingOverlay: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  processingText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  processingSubtext: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
