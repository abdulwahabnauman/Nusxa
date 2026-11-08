/**
 * IsometricScanCard — 3D Holographic Prescription Scanning Card.
 * Renders an angled, levitating document with a glowing laser sweep
 * and holographic shimmer during OCR processing, snapping upright on completion.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import Svg, { Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { PipelineStage } from '../../ai/types';

interface IsometricScanCardProps {
  stage: PipelineStage;
  thumbnailUri?: string | null;
  width?: number;
  height?: number;
}

export function IsometricScanCard({
  stage,
  thumbnailUri,
  width = 190,
  height = 250,
}: IsometricScanCardProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  // 3D physics shared values
  const floatY = useSharedValue(0);
  const tiltProgress = useSharedValue(stage === 'complete' ? 0 : 1);
  const laserY = useSharedValue(0);
  const laserOpacity = useSharedValue(0.85);

  const isScanning = stage === 'preparing' || stage === 'reading' || stage === 'validating';

  useEffect(() => {
    if (stage === 'complete') {
      tiltProgress.value = reducedMotion ? 0 : withSpring(0, { damping: 16, stiffness: 140 });
      floatY.value = reducedMotion ? 0 : withSpring(0);
      return;
    }

    if (reducedMotion) {
      tiltProgress.value = 0;
      floatY.value = 0;
      laserY.value = height * 0.45;
      laserOpacity.value = 0.5;
      return;
    }

    tiltProgress.value = withSpring(1, { damping: 14, stiffness: 120 });

    // Floating levitation
    floatY.value = withRepeat(
      withSequence(
        withTiming(-7, { duration: 1900, easing: Easing.inOut(Easing.quad) }),
        withTiming(7, { duration: 1900, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );

    // Laser beam vertical sweep
    laserY.value = withRepeat(
      withSequence(
        withTiming(height - 20, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
        withTiming(4, { duration: 1700, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );

    // Subtle laser breath
    laserOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 850 }),
        withTiming(0.6, { duration: 850 })
      ),
      -1,
      true
    );
  }, [stage, reducedMotion, height, tiltProgress, floatY, laserY, laserOpacity]);

  const card3DStyle = useAnimatedStyle(() => {
    const rotateX = `${interpolate(tiltProgress.value, [0, 1], [0, 20])}deg`;
    const rotateZ = `${interpolate(tiltProgress.value, [0, 1], [0, -7])}deg`;
    return {
      transform: [
        { perspective: 900 },
        { translateY: floatY.value },
        { rotateX },
        { rotateZ },
      ],
    };
  });

  const laserStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: laserY.value }],
    opacity: isScanning ? laserOpacity.value : 0,
  }));

  const cardBorderColor =
    stage === 'complete' ? colors.success
    : stage === 'error' ? colors.error
    : colors.accent.primary;

  return (
    <View style={[styles.outerContainer, { width: width + 40, height: height + 40 }]}>
      {/* Soft ground shadow */}
      <Animated.View
        style={[
          styles.groundShadow,
          {
            width: width * 0.85,
            height: 18,
            borderRadius: 9,
            backgroundColor: stage === 'error' ? colors.error : colors.accent.primary,
          },
        ]}
      />

      {/* Isometric 3D Levitating Card */}
      <Animated.View
        style={[
          styles.card,
          {
            width,
            height,
            backgroundColor: colors.background.surface,
            borderColor: cardBorderColor,
          },
          card3DStyle,
        ]}
      >
        {/* Optional preview thumbnail background with dark scrim */}
        {thumbnailUri ? (
          <Image
            source={{ uri: thumbnailUri }}
            style={[StyleSheet.absoluteFillObject, { opacity: 0.16, borderRadius: 14 }]}
            resizeMode="cover"
          />
        ) : null}

        {/* Prescription Document Mock Skeleton */}
        <View style={styles.docHeader}>
          <View style={[styles.rxBadge, { backgroundColor: colors.accent.subtle }]}>
            <MaterialCommunityIcons name="medical-bag" size={14} color={colors.accent.primary} />
          </View>
          <View style={{ flex: 1, marginStart: 8 }}>
            <View style={[styles.skeletonLine, { width: '60%', height: 6, backgroundColor: colors.text.disabled + '44' }]} />
            <View style={[styles.skeletonLine, { width: '40%', height: 4, marginTop: 4, backgroundColor: colors.border.strong }]} />
          </View>
        </View>

        <View style={styles.docBody}>
          <View style={[styles.skeletonLine, { width: '85%', height: 5, backgroundColor: colors.border.strong }]} />
          <View style={[styles.skeletonLine, { width: '92%', height: 5, marginTop: 8, backgroundColor: colors.border.strong }]} />
          <View style={[styles.skeletonLine, { width: '70%', height: 5, marginTop: 8, backgroundColor: colors.border.strong }]} />
          <View style={[styles.skeletonLine, { width: '80%', height: 5, marginTop: 8, backgroundColor: colors.border.strong }]} />
          <View style={[styles.skeletonLine, { width: '60%', height: 5, marginTop: 8, backgroundColor: colors.border.strong }]} />
        </View>

        {/* Doctor stamp circular imprint */}
        <View style={[styles.doctorStamp, { borderColor: colors.accent.primary + '33' }]}>
          <MaterialCommunityIcons name="check-decagram-outline" size={20} color={colors.accent.primary + '55'} />
        </View>

        {/* Holographic Laser Sweep Beam */}
        <Animated.View style={[styles.laserBeamWrap, laserStyle]}>
          <Svg width={width} height={14}>
            <Defs>
              <LinearGradient id="laserGrad" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0%" stopColor="#10B981" stopOpacity="0.1" />
                <Stop offset="50%" stopColor="#10B981" stopOpacity="0.95" />
                <Stop offset="100%" stopColor="#10B981" stopOpacity="0.1" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="5" width={width} height="4" rx="2" fill="url(#laserGrad)" />
          </Svg>
        </Animated.View>

        {/* Corner guide brackets */}
        <View style={[styles.corner, styles.cTL, { borderColor: cardBorderColor }]} />
        <View style={[styles.corner, styles.cTR, { borderColor: cardBorderColor }]} />
        <View style={[styles.corner, styles.cBL, { borderColor: cardBorderColor }]} />
        <View style={[styles.corner, styles.cBR, { borderColor: cardBorderColor }]} />

        {/* Status Center Badge upon completion */}
        {stage === 'complete' && (
          <View style={[styles.completeBadge, { backgroundColor: colors.success }]}>
            <MaterialCommunityIcons name="check" size={28} color={colors.onStatus} />
          </View>
        )}

        {stage === 'error' && (
          <View style={[styles.completeBadge, { backgroundColor: colors.error }]}>
            <MaterialCommunityIcons name="alert-circle" size={28} color={colors.onStatus} />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  groundShadow: {
    position: 'absolute',
    bottom: 8,
    opacity: 0.15,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  docHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  rxBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonLine: {
    borderRadius: 3,
  },
  docBody: {
    marginTop: 6,
  },
  doctorStamp: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  laserBeamWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  corner: {
    position: 'absolute',
    width: 14,
    height: 14,
  },
  cTL: {
    top: 4,
    left: 4,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderTopLeftRadius: 6,
  },
  cTR: {
    top: 4,
    right: 4,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
    borderTopRightRadius: 6,
  },
  cBL: {
    bottom: 4,
    left: 4,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderBottomLeftRadius: 6,
  },
  cBR: {
    bottom: 4,
    right: 4,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
    borderBottomRightRadius: 6,
  },
  completeBadge: {
    position: 'absolute',
    alignSelf: 'center',
    top: '38%',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
});
