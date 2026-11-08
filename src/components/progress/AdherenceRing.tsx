/**
 * AdherenceRing with Liquid Fill Animation.
 * Renders an organic, translucent medical vial/capsule liquid level
 * with oscillating layered fluid waves that smoothly rise with spring physics.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/provider';
import { useSettingsStore } from '../../stores/settings-store';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { formatDigits } from '../../utils/numerals';

interface AdherenceRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export function AdherenceRing({
  percentage,
  size = 100,
  strokeWidth = 3,
  label,
}: AdherenceRingProps) {
  const { colors, typography } = useTheme();
  const easternNumerals = useSettingsStore((s) => s.easternNumerals);
  const reducedMotion = useReducedMotion();

  const clampedPercentage = Math.min(100, Math.max(0, percentage));

  // Fluid physics shared values
  const fillHeight = useSharedValue(clampedPercentage);
  const waveOffsetFront = useSharedValue(0);
  const waveOffsetBack = useSharedValue(0);

  useEffect(() => {
    fillHeight.value = reducedMotion
      ? clampedPercentage
      : withSpring(clampedPercentage, { damping: 18, stiffness: 120 });
  }, [clampedPercentage, reducedMotion, fillHeight]);

  useEffect(() => {
    if (reducedMotion) {
      waveOffsetFront.value = 0;
      waveOffsetBack.value = 0;
      return;
    }

    // Continuous smooth horizontal liquid wave translation
    waveOffsetFront.value = withRepeat(
      withTiming(-size, { duration: 3200, easing: Easing.linear }),
      -1,
      false
    );
    waveOffsetBack.value = withRepeat(
      withTiming(-size, { duration: 4600, easing: Easing.linear }),
      -1,
      false
    );
  }, [size, reducedMotion, waveOffsetFront, waveOffsetBack]);

  const waveHeight = Math.max(4, size * 0.06);

  // Animated styles for vertical liquid fill and horizontal wave sloshing
  const frontWaveStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      fillHeight.value,
      [0, 100],
      [size, -waveHeight],
      Extrapolation.CLAMP
    );
    return {
      transform: [
        { translateY },
        { translateX: waveOffsetFront.value },
      ],
    };
  });

  const backWaveStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      fillHeight.value,
      [0, 100],
      [size, -waveHeight - 1],
      Extrapolation.CLAMP
    );
    return {
      transform: [
        { translateY },
        { translateX: waveOffsetBack.value },
      ],
    };
  });

  const liquidColor =
    clampedPercentage >= 80 ? colors.success
    : clampedPercentage >= 50 ? colors.warning
    : colors.accent.primary;

  // Seamless 2x periodic sine wave path for continuous infinite looping
  const w = size;
  const h = waveHeight;
  const wavePath = `M 0 ${h} Q ${w * 0.25} 0, ${w * 0.5} ${h} T ${w} ${h} T ${w * 1.5} ${h} T ${w * 2} ${h} V ${size + 40} H 0 Z`;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Translucent glass vial background */}
      <View
        style={[
          styles.capsule,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: colors.border.default,
            backgroundColor: colors.background.surface,
          },
        ]}
      >
        {/* Layered Liquid Waves */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Back wave with soft depth */}
          <Animated.View style={[styles.waveWrap, backWaveStyle]}>
            <Svg width={size * 2} height={size + 40}>
              <Path d={wavePath} fill={liquidColor} opacity={0.35} />
            </Svg>
          </Animated.View>

          {/* Front wave with gradient sheen */}
          <Animated.View style={[styles.waveWrap, frontWaveStyle]}>
            <Svg width={size * 2} height={size + 40}>
              <Defs>
                <LinearGradient id="liquidGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={liquidColor} stopOpacity="0.85" />
                  <Stop offset="100%" stopColor={liquidColor} stopOpacity="0.65" />
                </LinearGradient>
              </Defs>
              <Path d={wavePath} fill="url(#liquidGrad)" />
            </Svg>
          </Animated.View>

          {/* Subtle top glass curvature reflection */}
          <View
            style={[
              styles.glassHighlight,
              {
                width: size * 0.65,
                height: size * 0.22,
                borderRadius: size * 0.15,
                top: strokeWidth + 2,
              },
            ]}
          />
        </View>

        {/* Central percentage readout with accessible legibility */}
        <View style={styles.center} pointerEvents="none">
          <Text
            style={[
              typography.heading.h2,
              {
                color: colors.text.primary,
                textAlign: 'center',
                fontSize: size * 0.22,
                lineHeight: size * 0.32,
                textShadowColor: colors.background.surface,
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 3,
              },
            ]}
            accessibilityLabel={`${clampedPercentage}% adherence`}
          >
            {formatDigits(Math.round(clampedPercentage), easternNumerals)}%
          </Text>
          {label && (
            <Text
              style={[
                typography.body.xs,
                {
                  color: colors.text.secondary,
                  textAlign: 'center',
                  marginTop: -2,
                  fontSize: Math.max(9, size * 0.11),
                  lineHeight: Math.max(12, size * 0.2),
                  textShadowColor: colors.background.surface,
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 2,
                },
              ]}
            >
              {label}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsule: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '200%',
  },
  glassHighlight: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
