// src/components/wizard/Step2Edit.tsx
// Step 2: edit captured image — overlay text/logo, watermark position.
//
// CRITICAL: this step explicitly bakes the overlay into the image and
// updates `wiz.edit.brandedImageUrl`. Step 5 reads that URL for its
// preview thumbnail and passes it to publish-social, so the overlay
// CANNOT silently disappear (the bug in the old PostReviewScreen flow).
//
// "Bake & Preview" button is required before "Volgende stap →" enables.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as ImagePicker from 'expo-image-picker';
import {
  TextT, MapPin, Image as PhImage, ArrowsClockwise, ArrowRight, CheckCircle, MagicWand,
  Buildings, Calendar, UploadSimple, X,
} from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../context/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight, brandGradient } from '../../theme';
import { useWizardState, type LogoCorner } from '../../hooks/useWizardState';
import { useBrandKits } from '../../hooks/useBrandMemory';
import { uploadMedia } from '../../hooks/useCaptures';
import { supabase } from '../../services/supabase';
import WatermarkPositionPicker, { type WatermarkPosition } from '../WatermarkPositionPicker';

const WATERMARK_POS_TO_CORNER: Record<WatermarkPosition, { top?: number | string; bottom?: number; left?: number; right?: number; alignSelf?: 'flex-start' | 'center' | 'flex-end' }> = {
  'top-left':       { top: 10, left: 10 },
  'top-center':     { top: 10, alignSelf: 'center' },
  'top-right':      { top: 10, right: 10 },
  'middle-left':    { top: '45%', left: 10 },
  'middle-center':  { top: '45%', alignSelf: 'center' },
  'middle-right':   { top: '45%', right: 10 },
  'bottom-left':    { bottom: 10, left: 10 },
  'bottom-center':  { bottom: 10, alignSelf: 'center' },
  'bottom-right':   { bottom: 10, right: 10 },
};

const CORNER_LABEL: Record<LogoCorner, string> = {
  'top-left': '↖ Linksboven',
  'top-right': '↗ Rechtsboven',
  'bottom-left': '↙ Linksonder',
  'bottom-right': '↘ Rechtsonder',
};
const CORNER_STYLE: Record<LogoCorner, any> = {
  'top-left':     { top: 12, left: 12 },
  'top-right':    { top: 12, right: 12 },
  'bottom-left':  { bottom: 12, left: 12 },
  'bottom-right': { bottom: 12, right: 12 },
};
const NEXT_CORNER: Record<LogoCorner, LogoCorner> = {
  'top-left': 'top-right',
  'top-right': 'bottom-right',
  'bottom-right': 'bottom-left',
  'bottom-left': 'top-left',
};

export default function Step2Edit() {
  const { colors } = useTheme();
  const wiz = useWizardState();
  const viewShotRef = useRef<any>(null);
  const [baking, setBaking] = useState(false);
  const [bakeFailedOnce, setBakeFailedOnce] = useState(false);
  const [position, setPosition] = useState<WatermarkPosition>('bottom-right');

  // Brand kit logo (slot 1) — independent from custom logo (slot 3)
  const { data: brandKits = [] } = useBrandKits();
  const selectedKit =
    (wiz.edit.selectedBrandKitId && brandKits.find((k: any) => k.id === wiz.edit.selectedBrandKitId)) ||
    brandKits.find((k: any) => k.is_default) ||
    brandKits[0];
  const brandLogoUrl: string | null = selectedKit?.logo_url ?? null;
  const [uploadingCustom, setUploadingCustom] = useState(false);

  async function pickCustomLogo() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Toestemming nodig', 'Geef AMOS toegang tot je foto-bibliotheek.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setUploadingCustom(true);
      try {
        // Upload to Supabase so the URL is reachable from publish-social server-bake.
        // Fallback to local URI if upload fails — preview still works.
        const { url } = await uploadMedia(result.assets[0].uri, wiz.capture.eventId ?? 'wizard-logo', 'photo');
        wiz.setEdit({
          customLogoUri: url,
          showCustomLogo: true,
          brandedImageUrl: null,
        });
      } catch (upErr: any) {
        console.warn('[Step2.customLogo] upload failed, using local URI', upErr?.message);
        wiz.setEdit({
          customLogoUri: result.assets[0].uri,
          showCustomLogo: true,
          brandedImageUrl: null,
        });
      }
    } finally {
      setUploadingCustom(false);
    }
  }

  // Event logo via events.cover_image_url (only if a capture is event-bound)
  const eventId = wiz.capture.eventId ?? null;
  const { data: eventLogoUrl } = useQuery<string | null>({
    queryKey: ['wizard-event-logo', eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const { data } = await supabase
        .from('events')
        .select('cover_image_url')
        .eq('id', eventId)
        .maybeSingle();
      return (data as any)?.cover_image_url ?? null;
    },
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000,
  });

  // Load user's saved watermark position default
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return;
        const { data } = await supabase
          .from('profiles')
          .select('watermark_position')
          .eq('id', user.id)
          .maybeSingle();
        if ((data as any)?.watermark_position) {
          setPosition((data as any).watermark_position as WatermarkPosition);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  async function bake() {
    if (!viewShotRef.current) {
      Alert.alert('Wacht even', 'Preview is nog niet geladen.');
      return;
    }
    setBaking(true);
    try {
      // Capture the live preview (image + overlay text + logo) — what you
      // see is what gets published. Saved per-post watermark_position is
      // also written so the server-side bake respects this single overrride.
      const uri = await captureRef(viewShotRef.current, { format: 'jpg', quality: 0.92 });
      if (!uri) throw new Error('Snapshot mislukt');

      // Upload to Supabase. Falls back to original capture URI if upload
      // path is unavailable (e.g. offline) — Step 5 will warn the user.
      let brandedUrl: string | null = null;
      try {
        const eventId = wiz.capture.eventId ?? 'wizard-temp';
        const { url } = await uploadMedia(uri, eventId, 'photo');
        brandedUrl = url;
      } catch (upErr: any) {
        console.warn('[Step2.bake] upload failed, using local URI', upErr?.message);
        setBakeFailedOnce(true);
      }

      wiz.setEdit({
        brandedImageUrl: brandedUrl,
        livePreviewUri: uri,
      });

      Alert.alert(
        brandedUrl ? '✅ Baked' : '⚠️ Upload mislukt',
        brandedUrl
          ? 'Overlay is opgeslagen in de afbeelding. Klik "Volgende stap" om channels te kiezen.'
          : 'Snapshot is gemaakt maar upload faalde. Probeer opnieuw, of sla bake over (overlay wordt dan niet gepubliceerd).',
      );
    } catch (err: any) {
      Alert.alert('Mislukt', err?.message ?? 'Kon overlay niet vastleggen.');
    } finally {
      setBaking(false);
    }
  }

  const sourceUri = wiz.edit.livePreviewUri ?? wiz.capture.mediaUri;
  const brandLogoActive  = wiz.edit.showBrandLogo  && !!brandLogoUrl;
  const eventLogoActive  = wiz.edit.showEventLogo  && !!eventLogoUrl;
  const customLogoActive = wiz.edit.showCustomLogo && !!wiz.edit.customLogoUri;
  const activeLogoCount = (brandLogoActive ? 1 : 0) + (eventLogoActive ? 1 : 0) + (customLogoActive ? 1 : 0);
  const hasOverlay = !!(wiz.edit.overlayText || brandLogoActive || eventLogoActive || customLogoActive);
  const isBaked = !!wiz.edit.brandedImageUrl;

  const cycleCorner = (current: LogoCorner): LogoCorner => NEXT_CORNER[current];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: colors.text }}>
        Bewerk je content
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
        Tekst, logo, watermerk — wat je hier ziet wordt gepubliceerd.
      </Text>

      {/* Live preview inside ViewShot — exact pixels that get baked */}
      <ViewShot
        ref={viewShotRef}
        options={{ format: 'jpg', quality: 0.92 }}
        style={{
          borderRadius: borderRadius.lg,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        {sourceUri ? (
          <View>
            <Image
              source={{ uri: sourceUri }}
              style={{ width: '100%', aspectRatio: 1 }}
              resizeMode="cover"
            />
            {/* Overlay text — top */}
            {!!wiz.edit.overlayText && wiz.edit.overlayTextPosition === 'top' && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.52)', paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ color: '#fff', fontSize: fontSize.md, fontWeight: '700' }} numberOfLines={2}>
                  {wiz.edit.overlayText}
                </Text>
              </View>
            )}
            {/* Overlay text — bottom */}
            {!!wiz.edit.overlayText && wiz.edit.overlayTextPosition === 'bottom' && (
              <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.52)', paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ color: '#fff', fontSize: fontSize.md, fontWeight: '700' }} numberOfLines={2}>
                  {wiz.edit.overlayText}
                </Text>
              </View>
            )}
            {/* Brand logo overlay */}
            {brandLogoActive && (
              <View
                style={{
                  position: 'absolute',
                  ...CORNER_STYLE[wiz.edit.brandLogoPosition],
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  borderRadius: 8,
                  padding: 3,
                  shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
                }}
              >
                <Image
                  source={{ uri: brandLogoUrl as string }}
                  style={{ width: 28, height: 28, borderRadius: 4 }}
                  resizeMode="contain"
                />
              </View>
            )}
            {/* Event logo overlay — only when capture is event-bound */}
            {eventLogoActive && (
              <View
                style={{
                  position: 'absolute',
                  ...CORNER_STYLE[wiz.edit.eventLogoPosition],
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  borderRadius: 8,
                  padding: 3,
                  shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
                }}
              >
                <Image
                  source={{ uri: eventLogoUrl as string }}
                  style={{ width: 28, height: 28, borderRadius: 4 }}
                  resizeMode="cover"
                />
              </View>
            )}
            {/* Custom logo overlay (slot 3) — independent from brand kit + event */}
            {customLogoActive && (
              <View
                style={{
                  position: 'absolute',
                  ...CORNER_STYLE[wiz.edit.customLogoPosition],
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  borderRadius: 8,
                  padding: 3,
                  shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
                }}
              >
                <Image
                  source={{ uri: wiz.edit.customLogoUri as string }}
                  style={{ width: 28, height: 28, borderRadius: 4 }}
                  resizeMode="contain"
                />
              </View>
            )}
            {/* AMOS chip preview — informational; server still bakes the real chip on publish */}
            <View
              style={{
                position: 'absolute',
                ...(WATERMARK_POS_TO_CORNER[position] as any),
                paddingHorizontal: 8, paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: 'rgba(232,49,122,0.92)',
                flexDirection: 'row', alignItems: 'center', gap: 4,
                shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
              }}
              pointerEvents="none"
            >
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>AMOS</Text>
            </View>
          </View>
        ) : (
          <View style={{ width: '100%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: '#999' }}>Geen capture geselecteerd — ga terug naar stap 1.</Text>
          </View>
        )}
      </ViewShot>

      {/* Bake status banner */}
      {isBaked && (
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            padding: spacing.sm, borderRadius: borderRadius.md,
            backgroundColor: colors.primary + '12',
            borderWidth: 1, borderColor: colors.primary + '30',
          }}
        >
          <CheckCircle size={16} color={colors.primary} weight="fill" />
          <Text style={{ flex: 1, fontSize: fontSize.xs, color: colors.text }}>
            Overlay is vastgelegd. Stap 5 toont de gebakken preview per channel.
          </Text>
        </View>
      )}

      {/* Overlay text input */}
      <View style={{ marginTop: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <TextT size={16} color={colors.text} weight="bold" />
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>Overlay tekst</Text>
        </View>
        <TextInput
          value={wiz.edit.overlayText}
          onChangeText={(v) => { wiz.setEdit({ overlayText: v, brandedImageUrl: null }); }}
          placeholder="Bijv. quote, eventnaam, CTA…"
          placeholderTextColor={colors.textTertiary}
          maxLength={80}
          style={{
            backgroundColor: colors.background,
            borderWidth: 1, borderColor: colors.border,
            borderRadius: borderRadius.md,
            paddingHorizontal: 12, paddingVertical: 10,
            fontSize: fontSize.md, color: colors.text,
          }}
        />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {(['top', 'bottom'] as const).map(pos => {
            const active = wiz.edit.overlayTextPosition === pos;
            return (
              <TouchableOpacity
                key={pos}
                onPress={() => { wiz.setEdit({ overlayTextPosition: pos, brandedImageUrl: null }); }}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: borderRadius.md,
                  borderWidth: 1.5, borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary + '15' : 'transparent',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: fontSize.xs, color: active ? colors.primary : colors.textSecondary, fontWeight: fontWeight.medium }}>
                  {pos === 'top' ? 'Bovenaan' : 'Onderaan'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Logo's op foto — brand + event, independently togglable */}
      <View style={{ marginTop: spacing.md, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <PhImage size={16} color={colors.text} weight="bold" />
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>Logo's op foto</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textTertiary }}>· {activeLogoCount}/3 actief</Text>
        </View>

        {/* Brand logo block — kit picker + custom upload + toggle/position */}
        <View
          style={{
            padding: spacing.sm, borderRadius: borderRadius.md,
            backgroundColor: brandLogoActive ? colors.primary + '10' : colors.surface,
            borderWidth: 1, borderColor: brandLogoActive ? colors.primary + '40' : colors.border,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
              {brandLogoUrl
                ? <Image source={{ uri: brandLogoUrl }} style={{ width: 36, height: 36 }} resizeMode="contain" />
                : <Buildings size={20} color={colors.textTertiary} weight="duotone" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>Brand logo</Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }} numberOfLines={1}>
                {(selectedKit as any)?.name
                  ? `Kit: ${(selectedKit as any).name}`
                  : brandLogoUrl
                    ? 'Default kit'
                    : 'Geen brand logo — voeg toe in BrandKit'}
              </Text>
            </View>
            {brandLogoActive && (
              <TouchableOpacity
                onPress={() => wiz.setEdit({ brandLogoPosition: cycleCorner(wiz.edit.brandLogoPosition), brandedImageUrl: null })}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '40' }}
              >
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }}>{CORNER_LABEL[wiz.edit.brandLogoPosition]}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              disabled={!brandLogoUrl}
              onPress={() => wiz.setEdit({ showBrandLogo: !wiz.edit.showBrandLogo, brandedImageUrl: null })}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                backgroundColor: brandLogoActive ? colors.primary : colors.background,
                borderWidth: 1, borderColor: brandLogoActive ? colors.primary : colors.border,
                opacity: brandLogoUrl ? 1 : 0.4,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: brandLogoActive ? '#fff' : colors.textSecondary }}>
                {brandLogoActive ? 'Aan' : 'Uit'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Kit picker chips (horizontaal scrollable) — only switches brand slot, doesn't touch custom */}
          {brandKits.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
              {brandKits.map((kit: any) => {
                const isPicked = (wiz.edit.selectedBrandKitId === kit.id) ||
                                  (wiz.edit.selectedBrandKitId == null && kit.is_default);
                return (
                  <TouchableOpacity
                    key={kit.id}
                    onPress={() => wiz.setEdit({
                      selectedBrandKitId: kit.id,
                      brandedImageUrl: null,
                    })}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 9, paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: isPicked ? colors.primary + '20' : colors.background,
                      borderWidth: 1, borderColor: isPicked ? colors.primary : colors.border,
                    }}
                  >
                    {kit.logo_url
                      ? <Image source={{ uri: kit.logo_url }} style={{ width: 16, height: 16, borderRadius: 3 }} resizeMode="contain" />
                      : <Buildings size={12} color={colors.textTertiary} weight="duotone" />}
                    <Text style={{ fontSize: 11, fontWeight: '700', color: isPicked ? colors.primary : colors.textSecondary }} numberOfLines={1}>
                      {kit.name || 'Kit'}
                    </Text>
                    {kit.is_default && (
                      <Text style={{ fontSize: 9, color: colors.textTertiary }}>· default</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Event logo row */}
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            padding: spacing.sm, borderRadius: borderRadius.md,
            backgroundColor: eventLogoActive ? colors.primary + '10' : colors.surface,
            borderWidth: 1, borderColor: eventLogoActive ? colors.primary + '40' : colors.border,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
            {eventLogoUrl
              ? <Image source={{ uri: eventLogoUrl }} style={{ width: 36, height: 36 }} resizeMode="cover" />
              : <Calendar size={20} color={colors.textTertiary} weight="duotone" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>Event logo</Text>
            <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
              {eventId
                ? (eventLogoUrl ? 'Cover image van je event' : 'Event heeft geen cover image')
                : 'Capture is niet aan een event gekoppeld'}
            </Text>
          </View>
          {eventLogoActive && (
            <TouchableOpacity
              onPress={() => {
                wiz.setEdit({ eventLogoPosition: cycleCorner(wiz.edit.eventLogoPosition), brandedImageUrl: null });
              }}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '40' }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }}>{CORNER_LABEL[wiz.edit.eventLogoPosition]}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            disabled={!eventLogoUrl}
            onPress={() => wiz.setEdit({ showEventLogo: !wiz.edit.showEventLogo, brandedImageUrl: null })}
            style={{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
              backgroundColor: eventLogoActive ? colors.primary : colors.background,
              borderWidth: 1, borderColor: eventLogoActive ? colors.primary : colors.border,
              opacity: eventLogoUrl ? 1 : 0.4,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: eventLogoActive ? '#fff' : colors.textSecondary }}>
              {eventLogoActive ? 'Aan' : 'Uit'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Custom logo row (slot 3) — onafhankelijk van brand kit + event */}
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            padding: spacing.sm, borderRadius: borderRadius.md,
            backgroundColor: customLogoActive ? colors.primary + '10' : colors.surface,
            borderWidth: 1, borderColor: customLogoActive ? colors.primary + '40' : colors.border,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
            {wiz.edit.customLogoUri
              ? <Image source={{ uri: wiz.edit.customLogoUri }} style={{ width: 36, height: 36 }} resizeMode="contain" />
              : <UploadSimple size={20} color={colors.textTertiary} weight="duotone" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>Custom logo</Text>
            <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }} numberOfLines={1}>
              {wiz.edit.customLogoUri ? 'Eigen upload (alleen deze post)' : 'Upload eigen logo voor deze post'}
            </Text>
          </View>
          {customLogoActive && (
            <TouchableOpacity
              onPress={() => wiz.setEdit({ customLogoPosition: cycleCorner(wiz.edit.customLogoPosition), brandedImageUrl: null })}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '40' }}
            >
              <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }}>{CORNER_LABEL[wiz.edit.customLogoPosition]}</Text>
            </TouchableOpacity>
          )}
          {/* If no custom uploaded yet → show Upload button. If uploaded → Aan/Uit + ✕ to remove. */}
          {!wiz.edit.customLogoUri ? (
            <TouchableOpacity
              onPress={pickCustomLogo}
              disabled={uploadingCustom}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border,
                backgroundColor: colors.background,
                opacity: uploadingCustom ? 0.5 : 1,
              }}
            >
              {uploadingCustom
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <UploadSimple size={11} color={colors.primary} weight="bold" />}
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>
                {uploadingCustom ? 'Uploaden…' : 'Upload'}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => wiz.setEdit({ showCustomLogo: !wiz.edit.showCustomLogo, brandedImageUrl: null })}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                  backgroundColor: customLogoActive ? colors.primary : colors.background,
                  borderWidth: 1, borderColor: customLogoActive ? colors.primary : colors.border,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: customLogoActive ? '#fff' : colors.textSecondary }}>
                  {customLogoActive ? 'Aan' : 'Uit'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => wiz.setEdit({ customLogoUri: null, showCustomLogo: false, brandedImageUrl: null })}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }}
              >
                <X size={11} color={colors.textSecondary} weight="bold" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Watermark position picker */}
      <View style={{ marginTop: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <MapPin size={16} color={colors.text} weight="bold" />
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>AMOS-watermerk positie</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <WatermarkPositionPicker
            value={position}
            onChange={async (p) => {
              setPosition(p);
              // Save per-post override into the captured wizard state via
              // a virtual engagement key — Step5 forwards it to publish-social.
              wiz.setEdit({ brandedImageUrl: null }); // invalidate bake
              const { data: { user } } = await supabase.auth.getUser();
              if (user?.id) {
                await supabase.from('profiles').update({ watermark_position: p }).eq('id', user.id);
              }
            }}
          />
          <View style={{ flex: 1, paddingTop: 18 }}>
            <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 18 }}>
              Waar het AMOS-chip op je foto landt. Server bakt 'm op publish.
            </Text>
          </View>
        </View>
      </View>

      {/* Bake button — required before next */}
      <TouchableOpacity
        onPress={bake}
        disabled={baking || !sourceUri}
        activeOpacity={0.85}
        style={{ marginTop: spacing.md, borderRadius: borderRadius.lg, overflow: 'hidden' }}
      >
        <LinearGradient
          colors={brandGradient.light as unknown as [string, string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            paddingVertical: 14, alignItems: 'center',
            flexDirection: 'row', justifyContent: 'center', gap: 8,
            opacity: baking ? 0.6 : 1,
          }}
        >
          {baking ? <ActivityIndicator color="#fff" /> : <MagicWand size={18} color="#fff" weight="duotone" />}
          <Text style={{ color: '#fff', fontWeight: fontWeight.bold, fontSize: fontSize.md }}>
            {baking ? 'Bezig met bakken…' : isBaked ? 'Opnieuw bakken' : 'Bake & preview'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Next button — disabled until baked */}
      <TouchableOpacity
        onPress={() => wiz.next()}
        disabled={!isBaked && hasOverlay}
        activeOpacity={0.8}
        style={{
          marginTop: spacing.xs,
          paddingVertical: 12,
          alignItems: 'center',
          flexDirection: 'row', justifyContent: 'center', gap: 6,
          opacity: (!isBaked && hasOverlay) ? 0.4 : 1,
        }}
      >
        <Text style={{ color: colors.primary, fontWeight: fontWeight.bold, fontSize: fontSize.md }}>
          Volgende stap
        </Text>
        <ArrowRight size={16} color={colors.primary} weight="bold" />
      </TouchableOpacity>
      {hasOverlay && !isBaked && (
        <Text style={{ fontSize: 10, color: colors.textTertiary, textAlign: 'center', marginTop: -spacing.xs }}>
          Bake eerst je overlay voor je doorgaat
        </Text>
      )}

      {/* Escape route: if bake repeatedly fails (offline / Supabase issue),
          let the user proceed without the overlay rather than getting stuck.
          Only shown after at least 1 failed bake attempt. */}
      {hasOverlay && !isBaked && bakeFailedOnce && (
        <TouchableOpacity
          onPress={() => {
            // Clear overlay state — Step5 will publish the original image
            // without the user overlay. Watermark is still server-baked.
            wiz.setEdit({
              overlayText: '',
              showLogo: false,
              brandedImageUrl: null,
            });
            wiz.next();
          }}
          style={{ paddingVertical: 10, alignItems: 'center' }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: fontWeight.medium, textDecorationLine: 'underline' }}>
            Sla overlay over en ga door
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}
