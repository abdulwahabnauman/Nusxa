import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Image,
  Platform,
  Linking,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView as ExpoCameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { withLockExemption } from '../src/utils/appLock';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useTheme } from '../src/theme/provider';
import { Button } from '../src/components/ui/Button';
import { showToast } from '../src/components/ui/GlobalToast';
import { selectionHaptic } from '../src/utils/haptics';
import { useI18n } from '../src/i18n';
import { ensurePermission } from '../src/utils/permissions';
import { measureSharpness, isBlurry } from '../src/utils/sharpness';
import { MAX_PRESCRIPTION_PAGES } from '../src/constants/config';

// Focus-box (scan frame) geometry — must stay in sync with styles.scanFrame
// and styles.overlayMiddle. The frame is centered in the camera view, which
// lets captures be cropped to exactly this box without any measurement.
const SCAN_FRAME_WIDTH = 280;
const SCAN_FRAME_HEIGHT = 320;

// Rectangular crop box: minimum selectable size and the drag-handle footprint.
const MIN_CROP_SIZE = 48;
const HANDLE_SIZE = 28;

type CropRect = { x: number; y: number; w: number; h: number };
// Handle ids encode which edges they move (combinations of t/b/l/r).
type HandleId = 'tl' | 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l';
const HANDLE_IDS: HandleId[] = ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'];

type FlashMode = 'off' | 'auto' | 'on';
const FLASH_ORDER: FlashMode[] = ['off', 'auto', 'on'];

/**
 * Low-light heuristic from the captured photo's EXIF: a negative-ish
 * BrightnessValue (APEX) or a heavily-boosted ISO both mean the sensor was
 * starved of light, which degrades OCR quality. Best-effort — devices that
 * omit these tags simply produce no warning.
 */
function looksDim(exif: Record<string, unknown> | undefined): boolean {
  if (!exif) return false;
  const bv = Number(exif.BrightnessValue ?? exif.brightnessValue);
  if (!Number.isNaN(bv) && exif.BrightnessValue !== undefined) return bv < 1.5;
  let isoRaw = exif.ISOSpeedRatings ?? exif.ISO ?? exif.iso;
  if (Array.isArray(isoRaw)) isoRaw = isoRaw[0];
  const iso = Number(isoRaw);
  if (!Number.isNaN(iso) && iso > 0) return iso >= 800;
  return false;
}

export default function ScanScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const router = useRouter();
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  // Set when the captured photo's EXIF suggests low light — surfaces a
  // non-blocking banner on the preview screen (audit UX12).
  const [lowLight, setLowLight] = useState(false);
  // Set when the on-device Laplacian sharpness check flags the capture as
  // blurry: Process is gated so a bad photo never spends an OCR API call,
  // with a "process anyway" escape hatch for false positives.
  const [blurry, setBlurry] = useState(false);
  // Brief one-shot guidance shown when the camera first opens
  const [showFocusHint, setShowFocusHint] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{x: number, y: number} | null>(null);
  // Toggling autofocus 'on' forces the camera to run one fresh AF pass
  // (expo-camera exposes no coordinate-based tap-focus API), then flipping
  // back to 'off' returns it to focus-as-needed. This is what makes a tap
  // actually re-focus instead of just showing a ring.
  const [focusBoost, setFocusBoost] = useState(false);
  const focusBoostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRef = useRef<ExpoCameraView>(null);
  // Tracks the image currently on the preview so an in-flight sharpness
  // measurement for a stale capture can't flag the wrong photo.
  const capturedRef = useRef<string | null>(null);

  /** Measure sharpness on-device and gate the process step when blurry */
  const checkSharpness = async (uri: string) => {
    setBlurry(false);
    const result = await measureSharpness(uri);
    if (capturedRef.current === uri) {
      setBlurry(isBlurry(result));
    }
  };
  // Live camera view size — maps the centered focus box onto the captured
  // photo's pixel dimensions so everything outside the box is discarded.
  const cameraContainerLayout = useRef<{ width: number; height: number } | null>(null);

  // ---- In-app crop state -------------------------------------------------
  // The OS crop UI (allowsEditing) can't be restyled and its CROP button is
  // tiny, so cropping happens here: a standard rectangular crop box whose
  // edges and corners the user drags, applied with expo-image-manipulator.
  const [cropStage, setCropStage] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const cropDragStart = useRef<CropRect | null>(null);
  // Multi-page prescriptions: confirmed pages parked here while the current
  // capture lives in capturedImage. All of them go to OCR as one document.
  const [pages, setPages] = useState<string[]>([]);

  const baseSize = useMemo(() => {
    if (!viewport || !imageDims) return null;
    const ratio = Math.min(viewport.width / imageDims.width, viewport.height / imageDims.height);
    return { width: imageDims.width * ratio, height: imageDims.height * ratio };
  }, [viewport, imageDims]);

  // The fitted image's frame inside the viewport — crop coordinates live in
  // the same space and map to source pixels via a simple ratio.
  const imageRect = useMemo(() => {
    if (!viewport || !baseSize) return null;
    return {
      x: (viewport.width - baseSize.width) / 2,
      y: (viewport.height - baseSize.height) / 2,
      w: baseSize.width,
      h: baseSize.height,
    };
  }, [viewport, baseSize]);

  // A fresh crop box covers the whole image each time the stage opens
  useEffect(() => {
    if (cropStage && imageRect && !cropRect) setCropRect(imageRect);
  }, [cropStage, imageRect, cropRect]);

  const resetCropRect = () => {
    if (imageRect) setCropRect(imageRect);
  };

  // One pan gesture per handle; the id encodes which edges move, so a single
  // updater covers all eight. The rect at drag start is the source of truth —
  // translations are applied against it, never accumulated per event.
  // Gesture callbacks run as UI-thread worklets, so every React state access
  // lives in these JS-thread helpers, reached via runOnJS.
  const beginHandleDrag = () => {
    cropDragStart.current = cropRect;
  };

  const moveHandleDrag = (id: HandleId, translationX: number, translationY: number) => {
    const start = cropDragStart.current;
    if (!start || !imageRect) return;
    let { x, y, w, h } = start;
    const maxX = imageRect.x + imageRect.w;
    const maxY = imageRect.y + imageRect.h;
    if (id.includes('l')) {
      const nx = Math.min(
        Math.max(imageRect.x, start.x + translationX),
        start.x + start.w - MIN_CROP_SIZE,
      );
      w = start.w - (nx - start.x);
      x = nx;
    }
    if (id.includes('r')) {
      w = Math.min(Math.max(MIN_CROP_SIZE, start.w + translationX), maxX - start.x);
    }
    if (id.includes('t')) {
      const ny = Math.min(
        Math.max(imageRect.y, start.y + translationY),
        start.y + start.h - MIN_CROP_SIZE,
      );
      h = start.h - (ny - start.y);
      y = ny;
    }
    if (id.includes('b')) {
      h = Math.min(Math.max(MIN_CROP_SIZE, start.h + translationY), maxY - start.y);
    }
    setCropRect({ x, y, w, h });
  };

  const makeHandleGesture = (id: HandleId) =>
    Gesture.Pan()
      .onStart(() => {
        'worklet';
        runOnJS(beginHandleDrag)();
      })
      .onUpdate((e) => {
        'worklet';
        runOnJS(moveHandleDrag)(id, e.translationX, e.translationY);
      });

  // Show the focus/light guidance for a few seconds when the camera opens
  useEffect(() => {
    if (!cameraActive) return;
    setShowFocusHint(true);
    const timer = setTimeout(() => setShowFocusHint(false), 4000);
    return () => clearTimeout(timer);
  }, [cameraActive]);

  const handleRequestCamera = async () => {
    // Shared retry gate: while the OS still allows asking (canAskAgain),
    // every tap on this button re-shows the prompt — no "asked once"
    // bookkeeping. Only once canAskAgain turns false does the Open Settings
    // fallback below render (existing permanently-denied check).
    const result = await ensurePermission(permission, requestPermission);
    if (result.granted) {
      setCameraActive(true);
    } else {
      // Denied — still re-askable: the next attempt prompts again. Once
      // permanently denied, the Open Settings button renders instead.
      showToast(t.scanner.cameraNeededTitle, 'warning');
    }
  };

  /** Copy a temp image to the document directory so it survives screen changes */
  const persistImage = async (sourceUri: string): Promise<string | null> => {
    try {
      // Clean up old scan images first, keeping enough headroom for a full
      // multi-page session plus the capture currently in progress
      const dir = FileSystem.documentDirectory;
      if (dir) {
        const files = await FileSystem.readDirectoryAsync(dir);
        const oldScans = files
          .filter((f) => f.startsWith('nusxa_scan_') && f.endsWith('.jpg'))
          .sort();
        // Delete everything beyond the retention window
        const keep = MAX_PRESCRIPTION_PAGES + 2;
        for (const old of oldScans.slice(0, Math.max(0, oldScans.length - keep))) {
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
        exif: true,
      });
      if (photo?.uri) {
        selectionHaptic();
        setLowLight(looksDim(photo.exif as Record<string, unknown> | undefined));
        // Camera shots are cropped to the focus box: everything outside the
        // guide frame is discarded. Any failure keeps the full photo so a
        // capture is never lost.
        let uri = photo.uri;
        const container = cameraContainerLayout.current;
        if (
          container &&
          container.width > SCAN_FRAME_WIDTH &&
          container.height > SCAN_FRAME_HEIGHT
        ) {
          try {
            const dims = await getImageDims(photo.uri);
            if (dims) {
              const frameX = (container.width - SCAN_FRAME_WIDTH) / 2;
              const frameY = (container.height - SCAN_FRAME_HEIGHT) / 2;
              let originX = Math.round((frameX / container.width) * dims.width);
              let originY = Math.round((frameY / container.height) * dims.height);
              let width = Math.round((SCAN_FRAME_WIDTH / container.width) * dims.width);
              let height = Math.round((SCAN_FRAME_HEIGHT / container.height) * dims.height);
              originX = Math.min(Math.max(originX, 0), dims.width - 1);
              originY = Math.min(Math.max(originY, 0), dims.height - 1);
              width = Math.min(Math.max(width, 32), dims.width - originX);
              height = Math.min(Math.max(height, 32), dims.height - originY);
              const cropped = await ImageManipulator.manipulateAsync(
                photo.uri,
                [{ crop: { originX, originY, width, height } }],
                { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 },
              );
              uri = cropped.uri;
            }
          } catch (cropError) {
            console.warn('Focus-box crop failed, keeping the full photo:', cropError);
          }
        }
        const persistentUri = await persistImage(uri);
        const finalUri = persistentUri ?? uri;
        setImageDims(null);
        setCapturedImage(finalUri);
        capturedRef.current = finalUri;
        setCameraActive(false);
        void checkSharpness(finalUri);
      }
    } catch (error) {
      showToast(t.toasts.captureFailed, 'error');
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
      const result = await withLockExemption(() =>
        ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          // No OS crop UI (allowsEditing) — cropping happens in-app where the
          // controls match the theme and the apply button is unmistakable.
          allowsEditing: false,
          quality: 0.8,
        })
      );
      if (!result.canceled && result.assets[0]?.uri) {
        const normalizedUri = await normalizeToScanAspect(result.assets[0].uri);
        const persistentUri = await persistImage(normalizedUri);
        const finalUri = persistentUri ?? normalizedUri;
        setImageDims(null);
        setLowLight(false);
        setCapturedImage(finalUri);
        capturedRef.current = finalUri;
        void checkSharpness(finalUri);
      }
    } catch (error) {
      showToast(t.toasts.imagePickFailed, 'error');
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    capturedRef.current = null;
    setImageDims(null);
    setCropStage(false);
    setCropRect(null);
    setLowLight(false);
    setBlurry(false);
  };

  const handleProcess = () => {
    const allUris = capturedImage ? [...pages, capturedImage] : pages;
    if (allUris.length === 0) return;
    router.push({
      pathname: '/processing',
      params: {
        imageUri: allUris[0],
        imageUris: JSON.stringify(allUris),
      },
    });
  };

  /** Park the current capture as a confirmed page, then capture the next one */
  const handleAddPage = () => {
    if (!capturedImage || pages.length + 1 >= MAX_PRESCRIPTION_PAGES) return;
    selectionHaptic();
    setPages((prev) => [...prev, capturedImage]);
    handleRetake();
  };

  const handleRemovePage = (index: number) => {
    selectionHaptic();
    setPages((prev) => prev.filter((_, i) => i !== index));
  };

  /** Enter the in-app crop stage (lazy dimension read on first entry) */
  const handleAdjustCrop = async () => {
    if (!capturedImage) return;
    if (!imageDims) {
      const dims = await getImageDims(capturedImage);
      if (!dims) {
        showToast(t.toasts.cropLoadFailed, 'error');
        return;
      }
      setImageDims(dims);
    }
    setCropRect(null);
    setCropStage(true);
  };

  /** Apply the drag-adjusted crop rectangle as the new image */
  const handleApplyCrop = async () => {
    if (!capturedImage || !imageDims || !imageRect || !cropRect || cropping) return;

    // Nothing meaningfully changed — just leave the crop stage
    const unchanged =
      Math.abs(cropRect.x - imageRect.x) < 2 &&
      Math.abs(cropRect.y - imageRect.y) < 2 &&
      Math.abs(cropRect.w - imageRect.w) < 2 &&
      Math.abs(cropRect.h - imageRect.h) < 2;
    if (unchanged) {
      setCropStage(false);
      return;
    }

    setCropping(true);
    try {
      // Convert the crop rectangle from viewport points to source pixels
      const pxPerPtX = imageDims.width / imageRect.w;
      const pxPerPtY = imageDims.height / imageRect.h;
      let originX = Math.round((cropRect.x - imageRect.x) * pxPerPtX);
      let originY = Math.round((cropRect.y - imageRect.y) * pxPerPtY);
      let width = Math.round(cropRect.w * pxPerPtX);
      let height = Math.round(cropRect.h * pxPerPtY);

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
      const finalUri = persistentUri ?? result.uri;
      setCapturedImage(finalUri);
      capturedRef.current = finalUri;
      setImageDims({ width, height });
      setCropRect(null);
      setCropStage(false);
      void checkSharpness(finalUri);
    } catch (error) {
      console.error('Crop failed:', error);
      showToast(t.toasts.cropFailed, 'error');
    } finally {
      setCropping(false);
    }
  };

  // Handle tap to focus: the ring appears exactly where the finger tapped
  // (locationX/Y are view-relative — no magic offsets), and the autofocus
  // mode toggle forces the camera to run a fresh focus pass.
  const handleCameraTap = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });

    if (focusBoostTimer.current) clearTimeout(focusBoostTimer.current);
    setFocusBoost(true);
    focusBoostTimer.current = setTimeout(() => setFocusBoost(false), 1200);

    // Hide indicator after animation
    setTimeout(() => setFocusPoint(null), 800);
  };

  /** Small thumbnails of confirmed pages, each with a remove button */
  const renderPageThumbs = () =>
    pages.map((uri, idx) => (
      <View key={uri} style={styles.pageThumbWrap}>
        <Image source={{ uri }} style={[styles.pageThumb, { borderColor: colors.border.default }]} />
        <TouchableOpacity
          style={styles.pageRemoveBtn}
          onPress={() => handleRemovePage(idx)}
          accessibilityLabel={t.scanner.removePage}
        >
          <MaterialCommunityIcons name="close-circle" size={22} color={colors.error} />
        </TouchableOpacity>
        <Text style={[typography.body.xs, { color: colors.text.secondary, textAlign: 'center', marginTop: 4 }]}>
          {idx + 1}
        </Text>
      </View>
    ));

  // Ready to scan: permission never asked, or already granted. Once granted,
  // the primary action opens the camera straight away — no "grant" wording.
  // Also shown whenever confirmed pages exist, even if the camera is denied,
  // since the gallery path still works.
  if (!capturedImage && !cameraActive && ((!permission || permission.granted) || pages.length > 0)) {
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
          {/* Confirmed pages so far: visible, removable, and processable
              right here without capturing another page */}
          {pages.length > 0 && (
            <View style={{ width: '100%', marginTop: spacing.lg }}>
              <Text style={[typography.body.sm, { color: colors.text.secondary, textAlign: 'center', marginBottom: spacing.sm }]}>
                {t.scanner.pagesAdded
                  .replace('{count}', String(pages.length))
                  .replace('{max}', String(MAX_PRESCRIPTION_PAGES))}
              </Text>
              <View style={styles.pagesStrip}>{renderPageThumbs()}</View>
              <Button
                title={t.scanner.processPages.replace('{count}', String(pages.length))}
                onPress={handleProcess}
                icon={<MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />}
                style={{ ...styles.fullWidthBtn, marginTop: spacing.sm }}
              />
            </View>
          )}
          <View style={[styles.buttonGroup, { marginTop: spacing.xl }]}>
            <Button
              title={permission?.granted ? t.scanner.capture : t.scanner.openCamera}
              onPress={permission?.granted ? () => setCameraActive(true) : handleRequestCamera}
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
    const handlePos: Record<HandleId, { x: number; y: number }> | null = cropRect
      ? {
          tl: { x: cropRect.x, y: cropRect.y },
          t: { x: cropRect.x + cropRect.w / 2, y: cropRect.y },
          tr: { x: cropRect.x + cropRect.w, y: cropRect.y },
          r: { x: cropRect.x + cropRect.w, y: cropRect.y + cropRect.h / 2 },
          br: { x: cropRect.x + cropRect.w, y: cropRect.y + cropRect.h },
          b: { x: cropRect.x + cropRect.w / 2, y: cropRect.y + cropRect.h },
          bl: { x: cropRect.x, y: cropRect.y + cropRect.h },
          l: { x: cropRect.x, y: cropRect.y + cropRect.h / 2 },
        }
      : null;

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
            {baseSize && imageRect && cropRect && handlePos ? (
              <>
                <Image
                  source={{ uri: capturedImage }}
                  style={{
                    position: 'absolute',
                    left: imageRect.x,
                    top: imageRect.y,
                    width: imageRect.w,
                    height: imageRect.h,
                  }}
                />
                {/* Dim everything outside the crop rectangle */}
                <View style={[styles.cropDim, { left: imageRect.x, top: imageRect.y, width: imageRect.w, height: Math.max(0, cropRect.y - imageRect.y) }]} />
                <View style={[styles.cropDim, { left: imageRect.x, top: cropRect.y + cropRect.h, width: imageRect.w, height: Math.max(0, imageRect.y + imageRect.h - cropRect.y - cropRect.h) }]} />
                <View style={[styles.cropDim, { left: imageRect.x, top: cropRect.y, width: Math.max(0, cropRect.x - imageRect.x), height: cropRect.h }]} />
                <View style={[styles.cropDim, { left: cropRect.x + cropRect.w, top: cropRect.y, width: Math.max(0, imageRect.x + imageRect.w - cropRect.x - cropRect.w), height: cropRect.h }]} />
                <View
                  style={[
                    styles.cropFrame,
                    {
                      left: cropRect.x,
                      top: cropRect.y,
                      width: cropRect.w,
                      height: cropRect.h,
                      borderColor: colors.accent.primary,
                    },
                  ]}
                />
                {HANDLE_IDS.map((id) => (
                  <GestureDetector key={id} gesture={makeHandleGesture(id)}>
                    <View
                      style={[
                        styles.cropHandle,
                        { left: handlePos[id].x - HANDLE_SIZE / 2, top: handlePos[id].y - HANDLE_SIZE / 2 },
                      ]}
                    />
                  </GestureDetector>
                ))}
              </>
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
              onPress={resetCropRect}
              variant="secondary"
              style={{ flex: 1 }}
            />
            <Button
              title={t.common.cancel}
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
          {/* Non-blocking quality warning when EXIF suggests low light */}
          {lowLight && (
            <View style={[styles.lowLightBanner, { backgroundColor: colors.warning + '1A', borderColor: colors.warning, marginHorizontal: spacing.base }]}>
              <MaterialCommunityIcons name="lightbulb-outline" size={18} color={colors.warning} />
              <Text style={[typography.body.xs, { color: colors.text.primary, flex: 1, marginLeft: 8 }]}>
                {t.scanner.lowLightHint}
              </Text>
            </View>
          )}
          {/* Blur gate: measured on-device, blocks Process so a bad photo
              never spends an OCR API call */}
          {blurry && (
            <View style={[styles.lowLightBanner, { backgroundColor: colors.error + '1A', borderColor: colors.error, marginHorizontal: spacing.base }]}>
              <MaterialCommunityIcons name="blur" size={18} color={colors.error} />
              <Text style={[typography.body.xs, { color: colors.text.primary, flex: 1, marginLeft: 8 }]}>
                {t.scanner.blurryHint}
              </Text>
            </View>
          )}
          <Image
            source={{ uri: capturedImage }}
            style={[styles.previewImage, { backgroundColor: colors.background.subtle }]}
            resizeMode="contain"
          />
          <View style={[styles.previewActions, { paddingHorizontal: spacing.base }]}>
            {/* Confirmed pages strip — shows this is a multi-page session */}
            {pages.length > 0 && (
              <View style={styles.pagesStrip}>{renderPageThumbs()}</View>
            )}
            {/* Prominent crop entry — themed and impossible to miss */}
            <Button
              title={t.scanner.adjustCrop}
              onPress={handleAdjustCrop}
              variant="secondary"
              size="lg"
              icon={<MaterialCommunityIcons name="crop" size={22} color={colors.accent.primary} />}
              style={styles.fullWidthBtn}
            />
            {/* Multi-page: park this capture and add the next page */}
            {pages.length + 1 < MAX_PRESCRIPTION_PAGES && (
              <Button
                title={t.scanner.addPage}
                onPress={handleAddPage}
                variant="secondary"
                icon={<MaterialCommunityIcons name="plus-box-outline" size={22} color={colors.accent.primary} />}
                style={styles.fullWidthBtn}
              />
            )}
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
                title={
                  pages.length > 0
                    ? t.scanner.processPages.replace('{count}', String(pages.length + 1))
                    : t.scanner.process
                }
                onPress={handleProcess}
                disabled={blurry}
                icon={<MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />}
                style={styles.previewHalfBtn}
              />
            </View>
            {/* Escape hatch for false positives: the heuristic is strict on
                purpose, but a user who insists must never be trapped */}
            {blurry && (
              <Button
                title={t.scanner.processAnyway}
                onPress={handleProcess}
                variant="ghost"
                style={{ marginTop: 4 }}
              />
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Camera active
  if (cameraActive && permission?.granted) {
    return (
      <View
        style={styles.cameraContainer}
        onLayout={(e) => {
          cameraContainerLayout.current = {
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          };
        }}
      >
        {/* CameraView doesn't accept children — overlays are absolutely-positioned siblings */}
        <ExpoCameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          flash={flashMode}
          autofocus={focusBoost ? 'on' : 'off'}
        />
        {/* Tap to focus handler — Pressable exposes the tap coordinates */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleCameraTap}
        />
        {/* Overlay guide */}
        <View style={styles.overlay}>
          <View style={styles.overlayTop}>
            {/* One-shot guidance: steady + good light + tap to focus */}
            {showFocusHint && (
              <View style={styles.hintBar} pointerEvents="none">
                <MaterialCommunityIcons name="image-filter-center-focus" size={16} color="#FFFFFF" />
                <Text style={[styles.focusHintText, { fontFamily: typography.families.regular }]}>{t.scanner.focusHint}</Text>
              </View>
            )}
          </View>
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={[styles.scanFrame, { borderColor: colors.accent.primary }]}>
              {/* Corner guides — classic scanner brackets at each corner */}
              <View style={[styles.cornerGuide, styles.cornerTL, { borderColor: '#FFFFFF' }]} />
              <View style={[styles.cornerGuide, styles.cornerTR, { borderColor: '#FFFFFF' }]} />
              <View style={[styles.cornerGuide, styles.cornerBL, { borderColor: '#FFFFFF' }]} />
              <View style={[styles.cornerGuide, styles.cornerBR, { borderColor: '#FFFFFF' }]} />
              <Text style={[styles.scanHint, { color: '#FFFFFF', fontFamily: typography.families.regular }]}>
                {t.scanner.alignGuide}
              </Text>
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom}>
            {/* Flash cycle: off → auto → on (low-light rescues blurry-ish dim shots) */}
            <TouchableOpacity
              style={[styles.flashButton, { backgroundColor: flashMode === 'off' ? 'rgba(255,255,255,0.15)' : colors.accent.primary }]}
              onPress={() => {
                const next = FLASH_ORDER[(FLASH_ORDER.indexOf(flashMode) + 1) % FLASH_ORDER.length] ?? flashMode;
                setFlashMode(next);
              }}
              accessibilityLabel={t.scanner.flash}
            >
              <MaterialCommunityIcons
                name={flashMode === 'off' ? 'flash-off' : flashMode === 'auto' ? 'flash-auto' : 'flash'}
                size={22}
                color="#FFFFFF"
              />
            </TouchableOpacity>
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

        {/* Focus Indicator Overlay — ring sits exactly on the tap point */}
        {focusPoint && (
          <View style={styles.focusOverlay}>
            <View style={[styles.focusCircle, { left: focusPoint.x - 40, top: focusPoint.y - 40, borderColor: colors.accent.primary }]}>
              <View style={[styles.crosshairHorizontal, { backgroundColor: colors.accent.primary }]} />
              <View style={[styles.crosshairVertical, { backgroundColor: colors.accent.primary }]} />
            </View>
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
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
  },
  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 24,
  },
  focusHintText: {
    color: '#FFFFFF',
    fontSize: 13,
    flexShrink: 1,
    textAlign: 'center',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: SCAN_FRAME_HEIGHT,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scanFrame: {
    width: SCAN_FRAME_WIDTH,
    height: SCAN_FRAME_HEIGHT,
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
  cornerGuide: {
    position: 'absolute',
    width: 28,
    height: 28,
  },
  cornerTL: {
    top: -2,
    left: -2,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  flashButton: {
    position: 'absolute',
    top: 16,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lowLightBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 4,
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
  // Same footprint as the live scan frame: captures are cropped to that box,
  // so the preview shows exactly what was framed in the camera.
  previewImage: {
    width: SCAN_FRAME_WIDTH,
    height: SCAN_FRAME_HEIGHT,
    alignSelf: 'center',
    marginVertical: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewActions: {
    gap: 12,
  },
  cropDim: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cropFrame: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 8,
  },
  cropHandle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.3)',
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
  pagesStrip: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  pageThumbWrap: {
    position: 'relative',
    alignItems: 'center',
  },
  pageThumb: {
    width: 56,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
  },
  pageRemoveBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
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
  },
  crosshairVertical: {
    width: 2,
    height: '100%',
    position: 'absolute',
  },
});
