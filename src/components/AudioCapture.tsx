import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import {
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorderState,
} from 'expo-audio';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../theme';

import { Microphone, RadioButton } from 'phosphor-react-native';
interface Props {
  onRecordingComplete: (uri: string) => void;
}

export default function AudioCapture({ onRecordingComplete }: Props) {
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const isRecording = recorderState.isRecording;
  const duration = Math.floor((recorderState.durationMillis || 0) / 1000);

  useEffect(() => {
    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        Alert.alert('Microfoon toegang nodig');
        return;
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
    })();
  }, []);

  const startRecording = async () => {
    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      Alert.alert('Fout', 'Kon opname niet starten');
    }
  };

  const stopRecording = async () => {
    await audioRecorder.stop();
    const uri = audioRecorder.uri;
    if (uri) {
      onRecordingComplete(uri);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {/* Waveform placeholder */}
      <View style={styles.waveform}>
        {isRecording ? (
          <>
            <RadioButton size={16} color={colors.error} weight="fill" />
            <Text style={styles.timer}>{formatTime(duration)}</Text>
            <Text style={styles.hint}>Opname bezig...</Text>
          </>
        ) : (
          <>
            <Microphone size={28} color={colors.primary} weight="duotone" />
            <Text style={styles.hint}>Tik om audio op te nemen</Text>
            <Text style={styles.subHint}>AI transcribeert en maakt er een post van</Text>
          </>
        )}
      </View>

      {/* Record button */}
      <TouchableOpacity
        style={[styles.recordBtn, isRecording && styles.recordBtnActive]}
        onPress={isRecording ? stopRecording : startRecording}
      >
        <View style={[styles.recordBtnInner, isRecording && styles.recordBtnInnerActive]} />
      </TouchableOpacity>

      <Text style={styles.label}>{isRecording ? 'Tik om te stoppen' : 'Opnemen'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    gap: spacing.lg,
  },
  waveform: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  micIcon: { fontSize: 64 },
  recordingDot: { fontSize: 32 },
  timer: {
    fontSize: 48,
    fontWeight: fontWeight.bold,
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.7)',
  },
  subHint: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.4)',
  },
  recordBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordBtnActive: { borderColor: colors.error },
  recordBtnInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.error,
  },
  recordBtnInnerActive: {
    width: 30,
    height: 30,
    borderRadius: 6,
  },
  label: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.6)',
  },
});
