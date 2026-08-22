import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView as ExpoCameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/provider';
import { Button } from '../src/components/ui/Button';

export default function ScanScreen() {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const cameraRef = useRef<ExpoCameraView>(null);

  const handleRequestCamera = async () => {
    const result = await requestPermission();
    if (result.granted) {
      setCameraActive(true);
    } else {
      Alert.alert(
        'Camera access needed',
        'Nusxa needs camera access to scan prescriptions. You can enable it in your device settings, or upload an image from your gallery.',
        [{ text: 'OK' }]
      );
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
        if (persistentUri) {
          setCapturedImage(persistentUri);
        } else {
          // Fallback: use the original URI if copy fails
          setCapturedImage(photo.uri);
        }
        setCameraActive(false);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        aspect: [3, 4],
      });
      if (!result.canceled && result.assets[0]?.uri) {
        const persistentUri = await persistImage(result.assets[0].uri);
        if (persistentUri) {
          setCapturedImage(persistentUri);
        } else {
          // Fallback: use the original URI if copy fails
          setCapturedImage(result.assets[0].uri);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
  };

  const handleProcess = () => {
    if (capturedImage) {
      router.push({ pathname: '/processing', params: { imageUri: capturedImage } });
    }
  };

  // Permission not yet requested
  if (!permission && !capturedImage) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.centered}>
          <MaterialCommunityIcons name="camera-outline" size={64} color={colors.accent.primary} />
          <Text style={[typography.heading.h3, { color: colors.text.primary, marginTop: spacing.lg, textAlign: 'center' }]}>
            Scan your prescription
          </Text>
          <Text style={[typography.body.base, { color: colors.text.secondary, marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: 32 }]}>
            Point your camera at a prescription to extract medicine information, or upload an image.
          </Text>
          <View style={[styles.buttonGroup, { marginTop: spacing.xl }]}>
            <Button
              title="Open camera"
              onPress={handleRequestCamera}
              icon={<MaterialCommunityIcons name="camera" size={20} color="#FFFFFF" />}
            />
            <Button
              title="Upload image"
              onPress={handlePickImage}
              variant="secondary"
              icon={<MaterialCommunityIcons name="image-outline" size={20} color={colors.accent.primary} />}
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
            <Button
              title="Retake"
              onPress={handleRetake}
              variant="secondary"
              icon={<MaterialCommunityIcons name="refresh" size={20} color={colors.accent.primary} />}
            />
            <Button
              title="Process prescription"
              onPress={handleProcess}
              icon={<MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Camera active
  if (cameraActive && permission?.granted) {
    return (
      <View style={styles.cameraContainer}>
        <ExpoCameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={false}
        >
          {/* Overlay guide */}
          <View style={styles.overlay}>
            <View style={styles.overlayTop} />
            <View style={styles.overlayMiddle}>
              <View style={styles.overlaySide} />
              <View style={[styles.scanFrame, { borderColor: colors.accent.primary }]}>
                <Text style={[styles.scanHint, { color: '#FFFFFF' }]}>
                  Position prescription within frame
                </Text>
              </View>
              <View style={styles.overlaySide} />
            </View>
            <View style={styles.overlayBottom}>
              <TouchableOpacity
                style={[styles.captureButton, { backgroundColor: colors.accent.primary }]}
                onPress={handleTakePhoto}
                accessibilityLabel="Take photo"
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
        </ExpoCameraView>
      </View>
    );
  }

  // Permission denied
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={styles.centered}>
        <MaterialCommunityIcons name="camera-off-outline" size={64} color={colors.text.disabled} />
        <Text style={[typography.heading.h3, { color: colors.text.primary, marginTop: spacing.lg, textAlign: 'center' }]}>
          Camera access needed
        </Text>
        <Text style={[typography.body.base, { color: colors.text.secondary, marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: 32 }]}>
          Please enable camera access in your device settings to scan prescriptions, or upload an image instead.
        </Text>
        <View style={[styles.buttonGroup, { marginTop: spacing.xl }]}>
          <Button
            title="Upload image"
            onPress={handlePickImage}
            icon={<MaterialCommunityIcons name="image-outline" size={20} color="#FFFFFF" />}
          />
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
  cameraContainer: {
    flex: 1,
  },
  overlay: {
    flex: 1,
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
    paddingBottom: 32,
  },
  previewImage: {
    flex: 1,
    width: '100%',
    marginVertical: 16,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
});
