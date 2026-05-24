import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  Alert,
  StyleSheet,
  PanResponder,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import type { CameraMode } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../theme';

import { Camera, CameraRotate, Microphone, Scan } from 'phosphor-react-native';
interface Props {
  onCapture: (uri: string, exif?: Record<string, any>) => void;
  onVideoStart?: () => void;
  onVideoEnd?: (uri: string) => void;
  mode: 'photo' | 'video';
}

// Map our internal mode to the CameraView's expected CameraMode type
// expo-camera uses 'picture' for still photos, not 'photo'
const toCameraMode = (m: 'photo' | 'video'): CameraMode =>
  m === 'photo' ? 'picture' : 'video';

export default function CameraCapture({ onCapture, onVideoStart, onVideoEnd, mode }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [recording, setRecording] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  // ── Zoom ────────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(0);
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const zoomIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPinchDistance = useRef<number | null>(null);

  const showZoom = useCallback(() => {
    setShowZoomIndicator(true);
    if (zoomIndicatorTimer.current) clearTimeout(zoomIndicatorTimer.current);
    zoomIndicatorTimer.current = setTimeout(() => setShowZoomIndicator(false), 1500);
  }, []);

  // Pinch-to-zoom via PanResponder (works when isPinchToZoomEnabled is false
  // so we control zoom state manually and show a visual indicator)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onPanResponderGrant: (e) => {
        if (e.nativeEvent.touches.length === 2) {
          const [t1, t2] = e.nativeEvent.touches;
          const dx = t1.pageX - t2.pageX;
          const dy = t1.pageY - t2.pageY;
          lastPinchDistance.current = Math.sqrt(dx * dx + dy * dy);
        }
      },
      onPanResponderMove: (e) => {
        if (e.nativeEvent.touches.length !== 2) return;
        const [t1, t2] = e.nativeEvent.touches;
        const dx = t1.pageX - t2.pageX;
        const dy = t1.pageY - t2.pageY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (lastPinchDistance.current !== null) {
          const delta = (dist - lastPinchDistance.current) / 300;
          setZoom((prev) => {
            const next = Math.min(1, Math.max(0, prev + delta));
            return next;
          });
          showZoom();
        }
        lastPinchDistance.current = dist;
      },
      onPanResponderRelease: () => {
        lastPinchDistance.current = null;
      },
    }),
  ).current;

  // ── Permission guard ─────────────────────────────────────────────────────
  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Camera size={48} color="rgba(255,255,255,0.4)" weight="duotone" />
        <Text style={styles.permissionText}>Camera toegang nodig</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Geef toegang</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // For video mode: microphone permission is required for iOS to initialise the
  // camera in video mode. Without it the preview stays black.
  if (mode === 'video' && micPermission && !micPermission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Microphone size={48} color="rgba(255,255,255,0.4)" weight="duotone" />
        <Text style={styles.permissionText}>Microfoon toegang nodig voor video</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestMicPermission}>
          <Text style={styles.permissionBtnText}>Geef toegang</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Capture handlers ─────────────────────────────────────────────────────
  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      // skipProcessing: false → iOS bakes EXIF orientation into pixels before
      // returning the URI. Without this flag, the URI points at a temp file
      // whose pixel orientation does NOT match what's displayed in the iOS
      // Photos app — leading to "rotated" previews in our React Native side.
      // exif: true → still return the EXIF dictionary so normalizeImage-
      // Orientation can apply a fallback rotation if pixel-baking somehow
      // failed on a particular device.
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        exif: true,
        skipProcessing: false,
      });
      if (!photo) return;

      // Pass raw URI + EXIF to parent so orientation can be corrected
      onCapture(photo.uri, photo.exif ?? undefined);
    } catch {
      Alert.alert('Fout', 'Kon geen foto maken. Probeer opnieuw.');
    }
  };

  const toggleRecording = async () => {
    if (!cameraRef.current) return;

    if (recording) {
      cameraRef.current.stopRecording();
      setRecording(false);
    } else {
      setRecording(true);
      onVideoStart?.();
      try {
        const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
        if (video) onVideoEnd?.(video.uri);
      } catch {
        Alert.alert('Fout', 'Kon video niet opnemen. Probeer opnieuw.');
      }
      setRecording(false);
    }
  };

  const zoomPercent = Math.round(zoom * 100);

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode={toCameraMode(mode)}
        zoom={zoom}
      />

      {/* Zoom level indicator */}
      {showZoomIndicator && (
        <View style={styles.zoomBadge}>
          <Text style={styles.zoomText}>
            {zoom < 0.01 ? '1×' : `${(1 + zoom * 9).toFixed(1)}×`}
          </Text>
        </View>
      )}

      {/* Zoom reset pill — tap to reset to 1× */}
      {zoom > 0.02 && !showZoomIndicator && (
        <TouchableOpacity
          style={styles.zoomResetBtn}
          onPress={() => { setZoom(0); showZoom(); }}
        >
          <Text style={styles.zoomResetText}>
            {(1 + zoom * 9).toFixed(1)}× — tik om terug te zetten
          </Text>
        </TouchableOpacity>
      )}

      {/* Controls overlay */}
      <View style={styles.controls}>
        {/* Flip camera */}
        <TouchableOpacity
          style={styles.flipBtn}
          onPress={() => setFacing((prev) => (prev === 'back' ? 'front' : 'back'))}
          activeOpacity={0.7}
        >
          <CameraRotate size={24} color="#fff" weight="duotone" />
        </TouchableOpacity>

        {/* Capture button */}
        <TouchableOpacity
          style={[
            styles.captureBtn,
            mode === 'video' && recording && styles.captureBtnRecording,
          ]}
          onPress={mode === 'photo' ? takePhoto : toggleRecording}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.captureBtnInner,
              mode === 'video' && recording && styles.captureBtnInnerRecording,
            ]}
          />
        </TouchableOpacity>

        {/* Flash / zoom reset placeholder for symmetry */}
        <TouchableOpacity
          style={styles.flipBtn}
          onPress={() => { setZoom(0); }}
          activeOpacity={0.7}
        >
          <Scan size={22} color={zoom > 0 ? colors.primary : 'rgba(255,255,255,0.5)'} weight="regular" />
        </TouchableOpacity>
      </View>

      {/* Recording duration hint */}
      {mode === 'video' && recording && (
        <View style={styles.recordingBadge}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>REC</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },

  // ── Permission ──────────────────────────────────────────────────────────
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    gap: spacing.md,
  },
  permissionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  permissionBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  permissionBtnText: {
    color: '#fff',
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.md,
  },

  // ── Zoom ────────────────────────────────────────────────────────────────
  zoomBadge: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  zoomText: {
    color: '#fff',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  zoomResetBtn: {
    position: 'absolute',
    top: 80,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  zoomResetText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },

  // ── Controls ────────────────────────────────────────────────────────────
  controls: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  flipBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureBtnRecording: { borderColor: colors.error },
  captureBtnInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#fff',
  },
  captureBtnInnerRecording: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: colors.error,
  },

  // ── Recording indicator ──────────────────────────────────────────────────
  recordingBadge: {
    position: 'absolute',
    top: 70,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  recordingText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.5,
  },
});
