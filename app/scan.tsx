import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView as ExpoCameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  createAnimatedComponent,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from '../src/theme/provider';
import { Button } from '../src/components/ui/Button';
import { showToast } from '../src/components/ui/GlobalToast';
import { useI18n } from '../src/i18n';

const AnimatedImage = createAnimatedComponent(Image);

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export default function ScanScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const router = useRouter();
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<{x: number, y: number} | null>(null);
  const cameraRef = useRef<ExpoCameraView>(null);

  // ---- In-app crop state -------------------------------------------------
  // The OS crop UI (allowsEditing) can't be restyled and its CROP button is
  // tiny, so cropping happens here: pan + pinch the preview, then apply the
  // visible region with expo-image-manipulator.
  const [cropStage, setCropStage] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startScale = useRef(1);
  const startTx = useRef(0);
  const startTy = useRef(0);

  const baseSize = useMemo(() => {
    if (!viewport || !imageDims) return null;
    const ratio = Math.min(viewport.width / imageDims.width, viewport.height / imageDims.height);
    return { width: imageDims.width * ratio, height: imageDims.height * ratio };
  }, [viewport, imageDims]);

  const resetCropTransform = () => {
    scale.value = withTiming(MIN_ZOOM, { duration: 200 });
    tx.value = withTiming(0, { duration: 200 });
    ty.value = withTiming(0, { duration: 200 });
  };

  const panGesture = Gesture.Pan()
    .minDistance(4)
    .onStart(() => {
      startTx.current = tx.value;
      startTy.current = ty.value;
    })
    .onUpdate((e) => {
      tx.value = startTx.current + e.translationX;
      ty.value = startTy.current + e.translationY;
    })
    .onEnd(() => {
      // Keep the image covering the viewport as much as possible
      if (viewport && baseSize) {
        const renderedW = baseSize.width * scale.value;
        const renderedH = baseSize.height * scale.value;
        const maxOffX = Math.max(0, (renderedW - viewport.width) / 2 + 24);
        const maxOffY = Math.max(0, (renderedH - viewport.height) / 2 + 24);
        tx.value = withTiming(Math.min(Math.max(tx.value, -maxOffX), maxOffX), { duration: 200 });
        ty.value = withTiming(Math.min(Math.max(ty.value, -maxOffY), maxOffY), { duration: 200 });
      }
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      startScale.current = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, startScale.current * e.scale));
    })
    .onEnd(() => {
      if (scale.value < MIN_ZOOM) scale.value = withTiming(MIN_ZOOM, { duration: 200 });
    });

  const cropGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const cropTransformStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  const handleRequestCamera = async () => {
    const result = await requestPermission();
    if (result.granted) {
      setCameraActive(true);
    } else {
      showToast(t.scanner.cameraNeededTitle, 'warning');
    }
  };

  /** Copy a temp image to the document directory so it survives screen changes */
  const persistImage = async (sourceUri: string): Promise<string | null> => {
    try {
      // Clean up old scan images first (keep only the most recent 3)
      const dir = FileSystem.documentDirectory;
      if (dir) {
        const files = await FileSystem.readDirectoryAsync(dir);
        const oldScans = files
          .filter((f) => f.startsWith('nusxa_scan_') && f.endsWith('.jpg'))
          .sort();
        // Delete all but the 3 most recent
        for (const old of oldScans.slice(0, Math.max(0, oldScans.length - 3))) {
          try {
            await FileSystem.deleteAsync(dir + old, { idempotent: true });
          } catch {
            // Ignore cleanup failures
          }
        }
      }

      const filename = `nusxa_scan_${Date.now()}.jpg`;
      const destUri = FileSystem.documentDirectory + filename;
      await FileSystem.copyAsync({ from: sourceUri, to: destUri });
      return destUri;
    } catch (error) {
      console.error('Failed to persist image:', error);
      return null;
    }
  };

  /** True pixel dimensions of an image (EXIF orientation already baked in) */
  const getImageDims = async (uri: string): Promise<{ width: number; height: number } | null> => {
    try {
      const info = await ImageManipulator.manipulateAsync(uri, [], {
        format: ImageManipulator.SaveFormat.JPEG,
        compress: 0.95,
      });
      return { width: info.width, height: info.height };
    } catch (error) {
      console.warn('Could not read image dimensions:', error);
      return null;
    }
  };

  const handleTakePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        skipProcessing: false,
      });
      if (photo?.uri) {
        const persistentUri = await persistImage(photo.uri);
        setImageDims(null);
        setCapturedImage(persistentUri ?? photo.uri);
        setCameraActive(false);
      }
    } catch (error) {
      showToast('Failed to capture photo. Please try again.', 'error');
    }
  };

  /**
   * Normalize a picked image toward the scan aspect ratio (3:4 portrait)
   * WITHOUT ever cutting content away.
   *
   * Aspect correction is done here — after the pick — instead of via the
   * OS crop UI, because forcing `aspect` in the picker hard-crops the photo
   * on Android (slicing off real prescription content) while iOS pads with
   * white instead. Cropping itself is handled in-app (crop stage), where the
   * controls are themed and the apply button is prominent.
   *
   * Note: expo-image-manipulator's `extent` (white-background padding)
   * action is only implemented for web in SDK 54 — there is no native
   * padding action on iOS/Android. On web we pad to exactly 3:4; on native
   * we keep the image fully intact instead (the preview and the AI pipeline
   * accept any ratio, so nothing downstream depends on an exact 3:4).
   */
  const normalizeToScanAspect = async (uri: string): Promise<string> => {
    try {
      // A no-op manipulation returns the image's true pixel dimensions and
      // bakes EXIF orientation into the saved output.
      const info = await ImageManipulator.manipulateAsync(uri, [], {
        format: ImageManipulator.SaveFormat.JPEG,
        compress: 0.9,
      });
      const { width, height } = info;
      const target = 3 / 4;
      const current = width / height;

      // Close enough to 3:4 — nothing to correct
      if (Math.abs(current - target) < 0.02) return info.uri;

      if (Platform.OS === 'web') {
        // Pad with white to reach exactly 3:4 without cropping
        const canvasWidth = current > target ? width : Math.round(height * target);
        const canvasHeight = current > target ? Math.round(width / target) : height;
        const originX = Math.round((canvasWidth - width) / 2);
        const originY = Math.round((canvasHeight - height) / 2);
        const padded = await ImageManipulator.manipulateAsync(
          info.uri,
          [{
            extent: {
              width: canvasWidth,
              height: canvasHeight,
              originX,
              originY,
              backgroundColor: '#FFFFFF',
            },
          }],
          { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 }
        );
        return padded.uri;
      }

      // Native: padding action unavailable — never crop, keep every pixel
      return info.uri;
    } catch (error) {
      console.warn('Aspect normalization failed, using original image:', error);
      return uri;
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        // No OS crop UI (allowsEditing) — cropping happens in-app where the
        // controls match the theme and the apply button is unmistakable.
        allowsEditing: false,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        const normalizedUri = await normalizeToScanAspect(result.assets[0].uri);
        const persistentUri = await persistImage(normalizedUri);
        setImageDims(null);
        setCapturedImage(persistentUri ?? normalizedUri);
      }
    } catch (error) {
      showToast('Failed to select image. Please try again.', 'error');
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setImageDims(null);
    setCropStage(false);
    scale.value = MIN_ZOOM;
    tx.value = 0;
    ty.value = 0;
  };

  const handleProcess = () => {
    if (capturedImage) {
      router.push({ pathname: '/processing', params: { imageUri: capturedImage } });
    }
  };

  /** Enter the in-app crop stage (lazy dimension read on first entry) */
  const handleAdjustCrop = async () => {
    if (!capturedImage) return;
    if (!imageDims) {
      const dims = await getImageDims(capturedImage);
      if (!dims) {
        showToast('Failed to load the image for cropping.', 'error');
        return;
      }
      setImageDims(dims);
    }
    scale.value = MIN_ZOOM;
    tx.value = 0;
    ty.value = 0;
    setCropStage(true);
  };

  /** Apply the visible region of the pan/zoom preview as the new image */
  const handleApplyCrop = async () => {
    if (!capturedImage || !imageDims || !viewport || !baseSize || cropping) return;
    const s = scale.value;
    const ox = tx.value;
    const oy = ty.value;

    // Nothing meaningfully changed — just leave the crop stage
    if (Math.abs(s - 1) < 0.02 && Math.abs(ox) < 4 && Math.abs(oy) < 4) {
      setCropStage(false);
      return;
    }

    setCropping(true);
    try {
      const renderedW = baseSize.width * s;
      const renderedH = baseSize.height * s;
      // Rendered image's top-left relative to the viewport
      const left = (viewport.width - renderedW) / 2 + ox;
      const top = (viewport.height - renderedH) / 2 + oy;
      // Portion of the rendered image actually visible (letterbox-aware)
      const visibleW = Math.min(viewport.width, renderedW);
      const visibleH = Math.min(viewport.height, renderedH);
      const offX = Math.min(Math.max(-left, 0), Math.max(0, renderedW - visibleW));
      const offY = Math.min(Math.max(-top, 0), Math.max(0, renderedH - visibleH));

      // Convert visible region from rendered points to source pixels
      const pxPerPtX = imageDims.width / renderedW;
      const pxPerPtY = imageDims.height / renderedH;
      let originX = Math.round(offX * pxPerPtX);
      let originY = Math.round(offY * pxPerPtY);
      let width = Math.round(visibleW * pxPerPtX);
      let height = Math.round(visibleH * pxPerPtY);

      // Clamp inside the source image with a sane minimum size
      originX = Math.min(Math.max(originX, 0), imageDims.width - 1);
      originY = Math.min(Math.max(originY, 0), imageDims.height - 1);
      width = Math.min(Math.max(width, 32), imageDims.width - originX);
      height = Math.min(Math.max(height, 32), imageDims.height - originY);

      const result = await ImageManipulator.manipulateAsync(
        capturedImage,
        [{ crop: { originX, originY, width, height } }],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 },
      );
      const persistentUri = await persistImage(result.uri);
      setCapturedImage(persistentUri ?? result.uri);
      setImageDims({ width, height });
      scale.value = MIN_ZOOM;
      tx.value = 0;
      ty.value = 0;
      setCropStage(false);
    } catch (error) {
      console.error('Crop failed:', error);
      showToast('Failed to crop the image. Please try again.', 'error');
    } finally {
      setCropping(false);
    }
  };

  // Handle tap to focus
  const handleCameraTap = (e: any) => {
    if (!cameraRef.current) return;
    
    const layout = (e.nativeEvent as any).layout;
    
    // Show focus indicator
    setFocusPoint({ x: layout.x + layout.width / 2, y: layout.y + 100 });
    
    // Focus on tapped area
    try {
      (cameraRef.current as unknown as { focusAsync?: () => Promise<void> }).focusAsync?.();
    } catch (error) {
      console.log('Auto-focus not supported on this device');
    }
    
    // Hide indicator after animation
    setTimeout(() => setFocusPoint(null), 800);
  };

  // Permission not yet requested
  if (!permission && !capturedImage) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.centered}>
          <MaterialCommunityIcons name="camera-outline" size={64} color={colors.accent.primary} />
          <Text style={[typography.heading.h3, { color: colors.text.primary, marginTop: spacing.lg, textAlign: 'center' }]}>
            {t.scanner.title}
          </Text>
          <Text style={[typography.body.base, { color: colors.text.secondary, marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: 32 }]}>
            {t.scanner.scanSubtitle}
          </Text>
          <View style={[styles.buttonGroup, { marginTop: spacing.xl }]}>
            <Button
              title={t.scanner.openCamera}
              onPress={handleRequestCamera}
              icon={<MaterialCommunityIcons name="camera" size={20} color="#FFFFFF" />}
              style={styles.fullWidthBtn}
            />
            <Button
              title={t.scanner.uploadImage}
              onPress={handlePickImage}
              variant="secondary"
              icon={<MaterialCommunityIcons name="image-outline" size={20} color={colors.accent.primary} />}
              style={styles.fullWidthBtn}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // In-app crop stage
  if (capturedImage && cropStage) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={[styles.cropContainer, { paddingHorizontal: spacing.base }]}>
          <Text style={[typography.body.sm, { color: colors.text.secondary, textAlign: 'center', marginBottom: spacing.sm }]}>
            {t.scanner.cropHint}
          </Text>
          <View
            style={[styles.cropViewport, { backgroundColor: colors.background.subtle, borderRadius: borderRadius.md }]}
            onLayout={(e) => setViewport({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          >
            {baseSize ? (
              <GestureDetector gesture={cropGesture}>
                <AnimatedImage
                  source={{ uri: capturedImage }}
                  style={[{ width: baseSize.width, height: baseSize.height }, cropTransformStyle]}
                  resizeMode="contain"
                />
              </GestureDetector>
            ) : null}
          </View>
          {/* Prominent, full-width apply button so cropping is unmistakable */}
          <Button
            title={t.scanner.applyCrop}
            onPress={handleApplyCrop}
            loading={cropping}
            size="lg"
            icon={<MaterialCommunityIcons name="crop" size={22} color="#FFFFFF" />}
            style={{ ...styles.fullWidthBtn, marginTop: spacing.md }}
            accessibilityHint={t.scanner.cropHint}
          />
          <View style={[styles.cropSecondaryActions, { marginTop: spacing.sm }]}>
            <Button
              title={t.scanner.resetCrop}
              onPress={resetCropTransform}
              variant="secondary"
              style={{ flex: 1 }}
            />
            <Button
              title={t.scanner.skipCrop}
              onPress={() => setCropStage(false)}
              variant="ghost"
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Image captured — preview
  if (capturedImage) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.previewContainer}>
          <Image
            source={{ uri: capturedImage }}
            style={styles.previewImage}
            resizeMode="contain"
          />
          <View style={[styles.previewActions, { paddingHorizontal: spacing.base }]}>
            {/* Prominent crop entry — themed and impossible to miss */}
            <Button
              title={t.scanner.adjustCrop}
              onPress={handleAdjustCrop}
              variant="secondary"
              size="lg"
              icon={<MaterialCommunityIcons name="crop" size={22} color={colors.accent.primary} />}
              style={{ ...styles.fullWidthBtn, ...styles.cropEntryBtn, borderColor: colors.accent.primary, borderWidth: 2 }}
            />
            {/* flexWrap keeps elderly-mode buttons from overflowing the row */}
            <View style={styles.previewRow}>
              <Button
                title={t.scanner.retake}
                onPress={handleRetake}
                variant="secondary"
                icon={<MaterialCommunityIcons name="refresh" size={20} color={colors.accent.primary} />}
                style={styles.previewHalfBtn}
              />
              <Button
                title={t.scanner.process}
                onPress={handleProcess}
                icon={<MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />}
                style={styles.previewHalfBtn}
              />
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Camera active
  if (cameraActive && permission?.granted) {
    return (
      <View style={styles.cameraContainer}>
        {/* CameraView doesn't accept children — overlays are absolutely-positioned siblings */}
        <ExpoCameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={false}
        />
        {/* Tap to focus handler */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={handleCameraTap}
          activeOpacity={1}
        />
        {/* Overlay guide */}
        <View style={styles.overlay}>
          <View style={styles.overlayTop} />
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={[styles.scanFrame, { borderColor: colors.accent.primary }]}>
              <Text style={[styles.scanHint, { color: '#FFFFFF' }]}>
                {t.scanner.alignGuide}
              </Text>
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom}>
            <TouchableOpacity
              style={[styles.captureButton, { backgroundColor: colors.accent.primary }]}
              onPress={handleTakePhoto}
              accessibilityLabel={t.scanner.capture}
            >
              <MaterialCommunityIcons name="camera" size={32} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setCameraActive(false)}
              accessibilityLabel="Close camera"
            >
              <MaterialCommunityIcons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Focus Indicator Overlay */}
        {focusPoint && (
          <View style={styles.focusOverlay}>
            <View style={[styles.focusCircle, { left: focusPoint.x - 40, top: focusPoint.y - 40 }]}>
              <View style={styles.crosshairHorizontal} />
              <View style={styles.crosshairVertical} />
            </View>
            <Text style={styles.focusHint}>{t.scanner.tapToFocus}</Text>
          </View>
        )}
      </View>
    );
  }

  // Permission denied / blocked — grant access right here on the page
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={styles.centered}>
        <MaterialCommunityIcons name="camera-off-outline" size={64} color={colors.text.disabled} />
        <Text style={[typography.heading.h3, { color: colors.text.primary, marginTop: spacing.lg, textAlign: 'center' }]}>
          {t.scanner.cameraNeededTitle}
        </Text>
        <Text style={[typography.body.base, { color: colors.text.secondary, marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: 32 }]}>
          {t.scanner.cameraDeniedDesc}
        </Text>
        <View style={[styles.buttonGroup, { marginTop: spacing.xl }]}>
          <Button
            title={t.scanner.grantCamera}
            onPress={handleRequestCamera}
            icon={<MaterialCommunityIcons name="camera" size={20} color="#FFFFFF" />}
            style={styles.fullWidthBtn}
          />
          <Button
            title={t.scanner.uploadImage}
            onPress={handlePickImage}
            variant="secondary"
            icon={<MaterialCommunityIcons name="image-outline" size={20} color={colors.accent.primary} />}
            style={styles.fullWidthBtn}
          />
          {permission && !permission.canAskAgain && (
            <Button
              title={t.scanner.openSettings}
              onPress={() => Linking.openSettings().catch(() => {})}
              variant="ghost"
              style={styles.fullWidthBtn}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  buttonGroup: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  fullWidthBtn: {
    width: '100%',
  },
  cameraContainer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: 320,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scanFrame: {
    width: 280,
    height: 320,
    borderWidth: 2,
    borderRadius: 12,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 16,
  },
  scanHint: {
    fontSize: 13,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    overflow: 'hidden',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    padding: 8,
  },
  previewContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 24,
  },
  previewImage: {
    flex: 1,
    width: '100%',
    marginVertical: 16,
  },
  previewActions: {
    gap: 12,
  },
  cropEntryBtn: {
    minHeight: 52,
  },
  // Wrapping row: in elderly mode the two buttons can outgrow the screen
  // width, so they flow onto a second line instead of clipping off-screen.
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  previewHalfBtn: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 150,
  },
  cropContainer: {
    flex: 1,
    paddingTop: 12,
    paddingBottom: 12,
  },
  cropViewport: {
    flex: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.3)',
  },
  cropSecondaryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  focusOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  focusCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  crosshairHorizontal: {
    width: '100%',
    height: 2,
    backgroundColor: '#FF4400',
  },
  crosshairVertical: {
    width: 2,
    height: '100%',
    backgroundColor: '#FF4400',
    position: 'absolute',
  },
  focusHint: {
    marginTop: 60,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
});
