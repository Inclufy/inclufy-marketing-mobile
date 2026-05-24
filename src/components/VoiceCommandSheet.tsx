// src/components/VoiceCommandSheet.tsx
//
// Tier-1 Suggestion #5 — Voice-to-orchestrator.
//
// A self-contained bottom-sheet modal that:
//   1. Records audio via expo-audio (already in package.json — verified).
//   2. Uploads the audio (base64) to the existing edge fn `event-studio-ai`
//      with `action: 'transcribe'`. Whisper returns `{ transcript }`.
//      We chose base64 because the edge fn already accepts `audio_base64`
//      directly (no storage upload needed, fewer round-trips, fewer
//      permissions to wire).
//   3. Sends the transcript as `goal` to the `orchestrator/dispatch`
//      edge fn — same fetch + auth pattern as `dispatchTestRun` in
//      AgentDetailScreen.tsx.
//   4. Calls `props.onDispatched(parentRunId)` so the parent (e.g. the
//      HomeScreen FAB long-press handler) can navigate to AgentRunDetail.
//
// No new dependencies. No edits to navigation, types, or any screen.
//
// Mounting (for the orchestrating session, NOT done here):
//   <VoiceCommandSheet
//     visible={voiceVisible}
//     onClose={() => setVoiceVisible(false)}
//     onDispatched={(runId) => {
//       setVoiceVisible(false);
//       navigation.navigate('AgentRunDetail', { runId });
//     }}
//   />
//
// TODO(orchestrating-session): wire the FAB long-press in HomeScreen.tsx
// to toggle `voiceVisible`.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  Alert,
  Platform,
} from 'react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../context/ThemeContext';
import { useThemedStyles } from '../utils/themedStyles';
import { spacing, borderRadius, fontSize, fontWeight } from '../theme';
import { useTranslation } from '../i18n';
import { supabase } from '../services/supabase';

import { ArrowsClockwise, Microphone, PaperPlaneTilt, Stop, WarningCircle, X } from 'phosphor-react-native';
// ─── Props ───────────────────────────────────────────────────────────
export interface VoiceCommandSheetProps {
  /** Controls modal visibility. Parent owns this state. */
  visible: boolean;
  /** User dismissed the sheet (back tap, close button, swipe). */
  onClose: () => void;
  /**
   * Fired AFTER the orchestrator dispatch returns successfully.
   * `parentRunId` is the `id` of the newly created `agent_runs` row,
   * suitable for navigating to AgentRunDetail.
   */
  onDispatched: (parentRunId: string) => void;
  /**
   * Optional override for org id. If omitted, the component resolves
   * the first `organization_members` row for the current user — same
   * pattern as AgentDetailScreen.
   */
  organizationId?: string;
}

// ─── Internal state machine ─────────────────────────────────────────
type Phase =
  | 'idle'           // waiting for user to tap record
  | 'recording'      // mic is open
  | 'transcribing'   // audio uploaded, waiting on Whisper
  | 'preview'        // transcript shown, user can Send / Re-record
  | 'dispatching'    // orchestrator request in flight
  | 'error';

export default function VoiceCommandSheet({
  visible,
  onClose,
  onDispatched,
  organizationId,
}: VoiceCommandSheetProps) {
  const { colors } = useTheme();
  const { locale } = useTranslation();
  const isNl = locale === 'nl';

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const isRecording = recorderState.isRecording;
  const durationSec = Math.floor((recorderState.durationMillis || 0) / 1000);

  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [resolvedOrgId, setResolvedOrgId] = useState<string | null>(
    organizationId ?? null,
  );

  // ── Pulsing red dot animation while recording ───────────────────
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    if (!isRecording) {
      pulse.setValue(0.4);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulse]);

  // ── Permissions on mount/visible ─────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (!status.granted) {
          setErrorMsg(
            isNl
              ? 'Microfoon-toegang is nodig om commando’s in te spreken.'
              : 'Microphone access is required to record voice commands.',
          );
          setPhase('error');
          return;
        }
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
        });
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Audio init failed');
        setPhase('error');
      }
    })();
  }, [visible, isNl]);

  // ── Resolve org id (same pattern as AgentDetailScreen) ───────────
  useEffect(() => {
    if (!visible) return;
    if (organizationId) {
      setResolvedOrgId(organizationId);
      return;
    }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setResolvedOrgId(null);
        return;
      }
      const { data: memberRow } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      setResolvedOrgId(memberRow?.organization_id ?? null);
    })();
  }, [visible, organizationId]);

  // ── Reset when sheet is dismissed/reopened ───────────────────────
  useEffect(() => {
    if (!visible) {
      setPhase('idle');
      setTranscript('');
      setErrorMsg('');
    }
  }, [visible]);

  // ─────────────────────────────────────────────────────────────────
  // Recording controls
  // ─────────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      setErrorMsg('');
      setTranscript('');
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setPhase('recording');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Could not start recording');
      setPhase('error');
    }
  }, [audioRecorder]);

  const stopAndTranscribe = useCallback(async () => {
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) {
        setErrorMsg(isNl ? 'Geen audio opgenomen.' : 'No audio captured.');
        setPhase('error');
        return;
      }
      setPhase('transcribing');

      // Read audio file as base64 — same pattern as LiveCaptureScreen.
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64' as any,
      });

      // Call event-studio-ai (action: 'transcribe').
      const { data, error } = await supabase.functions.invoke('event-studio-ai', {
        body: { action: 'transcribe', audio_base64: base64 },
      });
      if (error) throw error;

      const result = (data as { result?: { transcript?: string } } | null)?.result;
      const text = (result?.transcript ?? '').trim();
      if (!text) {
        setErrorMsg(
          isNl
            ? 'Geen tekst herkend. Probeer het opnieuw.'
            : 'No speech detected. Please try again.',
        );
        setPhase('error');
        return;
      }
      setTranscript(text);
      setPhase('preview');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Transcription failed');
      setPhase('error');
    }
  }, [audioRecorder, isNl]);

  // ─────────────────────────────────────────────────────────────────
  // Dispatch — same fetch + auth shape as AgentDetailScreen.dispatchTestRun
  // ─────────────────────────────────────────────────────────────────
  const dispatchToOrchestrator = useCallback(async () => {
    if (!resolvedOrgId) {
      setErrorMsg(
        isNl
          ? 'Geen organisatie gevonden voor deze gebruiker.'
          : 'No organization found for the current user.',
      );
      setPhase('error');
      return;
    }
    if (!transcript.trim()) return;

    setPhase('dispatching');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(
        `${(supabase as any).supabaseUrl}/functions/v1/orchestrator/dispatch`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: (supabase as any).supabaseKey,
          },
          body: JSON.stringify({
            organization_id: resolvedOrgId,
            goal: transcript.trim(),
            input: { voice: true },
          }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Dispatch failed');

      const parentRunId =
        (body?.parent_run_id as string | undefined) ??
        (body?.run_id as string | undefined) ??
        (body?.id as string | undefined) ??
        '';
      onDispatched(parentRunId);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Dispatch failed');
      setPhase('error');
    }
  }, [resolvedOrgId, transcript, isNl, onDispatched]);

  // ── Cancel an in-flight recording when user dismisses ────────────
  const handleClose = useCallback(async () => {
    if (isRecording) {
      try { await audioRecorder.stop(); } catch { /* ignore */ }
    }
    onClose();
  }, [audioRecorder, isRecording, onClose]);

  // ─── Styles ──────────────────────────────────────────────────────
  const styles = useThemedStyles((c) => ({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end' as const,
    },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.lg,
      gap: spacing.md,
      borderTopWidth: 1,
      borderColor: c.border,
    },
    handle: {
      alignSelf: 'center' as const,
      width: 44,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      marginBottom: spacing.xs,
    },
    headerRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    },
    title: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    subtitle: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
      marginTop: 2,
    },
    closeBtn: { padding: spacing.xs },

    // Idle / recording large mic button
    micCircleWrap: {
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    micCircle: {
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: c.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    micCircleRecording: {
      backgroundColor: c.error,
    },
    micHint: {
      fontSize: fontSize.sm,
      color: c.textSecondary,
      textAlign: 'center' as const,
    },

    // Recording indicator row
    recRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: spacing.sm,
    },
    recDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: c.error,
    },
    recLabel: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.text,
    },
    recTimer: {
      fontSize: fontSize.md,
      color: c.textSecondary,
      fontVariant: ['tabular-nums'] as ['tabular-nums'],
    },

    // Preview card
    previewCard: {
      backgroundColor: c.background,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    previewLabel: {
      fontSize: fontSize.xs,
      color: c.textSecondary,
      marginBottom: spacing.xs,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    previewText: {
      fontSize: fontSize.md,
      color: c.text,
      lineHeight: 22,
    },

    // Buttons
    actionsRow: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
    },
    primaryBtn: {
      flex: 1,
      backgroundColor: c.primary,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      alignItems: 'center' as const,
      flexDirection: 'row' as const,
      justifyContent: 'center' as const,
      gap: spacing.xs,
    },
    primaryBtnDisabled: { opacity: 0.5 },
    primaryBtnText: {
      color: '#fff',
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
    },
    secondaryBtn: {
      flex: 1,
      backgroundColor: 'transparent',
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.md,
      alignItems: 'center' as const,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: 'row' as const,
      justifyContent: 'center' as const,
      gap: spacing.xs,
    },
    secondaryBtnText: {
      color: c.text,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
    },

    // Status / error block
    statusBlock: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    statusText: {
      color: c.textSecondary,
      fontSize: fontSize.sm,
    },
    errorText: {
      color: c.error,
      fontSize: fontSize.sm,
      textAlign: 'center' as const,
    },
  }));

  // ─── Helpers ─────────────────────────────────────────────────────
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
  };

  const titleText =
    phase === 'recording'
      ? (isNl ? 'Spreek je commando in' : 'Speak your command')
      : phase === 'preview'
        ? (isNl ? 'Bevestig commando' : 'Confirm command')
        : (isNl ? 'Spraak naar orchestrator' : 'Voice to orchestrator');

  const subtitleText = isNl
    ? 'Tip: zeg bv. „Post morgen om 9 uur op LinkedIn over event X”'
    : 'Tip: say e.g. "Post on LinkedIn tomorrow 9am about event X"';

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      >
        {/* Inner pressable swallow — taps inside the sheet must NOT close it */}
        <TouchableOpacity activeOpacity={1} onPress={() => { /* swallow */ }}>
          <View style={styles.sheet}>
            <View style={styles.handle} />

            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{titleText}</Text>
                <Text style={styles.subtitle}>{subtitleText}</Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                <X size={24} color={colors.textSecondary} weight="bold" />
              </TouchableOpacity>
            </View>

            {/* ── Body ── */}
            {phase === 'idle' && (
              <View style={styles.micCircleWrap}>
                <TouchableOpacity
                  style={styles.micCircle}
                  onPress={startRecording}
                  accessibilityLabel={isNl ? 'Begin opname' : 'Start recording'}
                >
                  <Microphone size={40} color="#fff" weight="duotone" />
                </TouchableOpacity>
                <Text style={styles.micHint}>
                  {isNl ? 'Tik om op te nemen' : 'Tap to record'}
                </Text>
              </View>
            )}

            {phase === 'recording' && (
              <View style={styles.micCircleWrap}>
                <TouchableOpacity
                  style={[styles.micCircle, styles.micCircleRecording]}
                  onPress={stopAndTranscribe}
                  accessibilityLabel={isNl ? 'Stop opname' : 'Stop recording'}
                >
                  <Stop size={36} color="#fff" weight="fill" />
                </TouchableOpacity>
                <View style={styles.recRow}>
                  <Animated.View style={[styles.recDot, { opacity: pulse }]} />
                  <Text style={styles.recLabel}>
                    {isNl ? 'Opname…' : 'Recording…'}
                  </Text>
                  <Text style={styles.recTimer}>{formatTime(durationSec)}</Text>
                </View>
                <Text style={styles.micHint}>
                  {isNl ? 'Tik om te stoppen' : 'Tap to stop'}
                </Text>
              </View>
            )}

            {phase === 'transcribing' && (
              <View style={styles.statusBlock}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.statusText}>
                  {isNl ? 'Audio transcriberen…' : 'Transcribing audio…'}
                </Text>
              </View>
            )}

            {phase === 'preview' && (
              <>
                <View style={styles.previewCard}>
                  <Text style={styles.previewLabel}>
                    {isNl ? 'Herkende tekst' : 'Transcribed text'}
                  </Text>
                  <Text style={styles.previewText}>{transcript}</Text>
                </View>
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={startRecording}
                  >
                    <ArrowsClockwise size={16} color={colors.text} weight="bold" />
                    <Text style={styles.secondaryBtnText}>
                      {isNl ? 'Opnieuw' : 'Re-record'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      !transcript.trim() && styles.primaryBtnDisabled,
                    ]}
                    onPress={dispatchToOrchestrator}
                    disabled={!transcript.trim()}
                  >
                    <PaperPlaneTilt size={16} color="#fff" weight="duotone" />
                    <Text style={styles.primaryBtnText}>
                      {isNl ? 'Versturen' : 'Send'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {phase === 'dispatching' && (
              <View style={styles.statusBlock}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.statusText}>
                  {isNl ? 'Orchestrator starten…' : 'Starting orchestrator…'}
                </Text>
              </View>
            )}

            {phase === 'error' && (
              <>
                <View style={styles.statusBlock}>
                  <WarningCircle size={20} color={colors.error} weight="fill" />
                  <Text style={styles.errorText}>
                    {errorMsg ||
                      (isNl ? 'Er ging iets mis.' : 'Something went wrong.')}
                  </Text>
                </View>
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={handleClose}
                  >
                    <Text style={styles.secondaryBtnText}>
                      {isNl ? 'Sluiten' : 'Close'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => {
                      setErrorMsg('');
                      setPhase('idle');
                    }}
                  >
                    <ArrowsClockwise size={16} color="#fff" weight="bold" />
                    <Text style={styles.primaryBtnText}>
                      {isNl ? 'Probeer opnieuw' : 'Try again'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// Suppress unused-import warning for Alert (kept available for future
// non-blocking confirmations without re-importing).
void Alert;
