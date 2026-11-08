/**
 * EcgTypingIndicator — Doctor Heartbeat / Clinical ECG Line Typing Indicator.
 * Renders an authentic clinical electrocardiogram (P-Q-R-S-T) waveform with an
 * animated phosphor tracer head and synchronized cardiac pulse.
 * Replaces generic typing dots with a clinical, diagnostic telemetry aesthetic.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { useI18n } from '../../i18n';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface EcgTypingIndicatorProps {
  label?: string;
}

const ECG_WIDTH = 130;
const ECG_HEIGHT = 30;
const BASELINE = 15;

/**
 * Mathematical piecewise function computing (X, Y) along an authentic
 * P-Q-R-S-T electrocardiogram curve.
 */
function getEcgCoordinates(normalizedProgress: number): { x: number; y: number } {
  'worklet';
  const x = normalizedProgress * ECG_WIDTH;
  let y = BASELINE;

  if (x < 20) {
    // Isoelectric baseline (resting)
    y = BASELINE;
  } else if (x <= 36) {
    // P-wave (atrial depolarization) — smooth dome
    y = BASELINE - 3.5 * Math.sin(((x - 20) / 16) * Math.PI);
  } else if (x <= 44) {
    // PR interval baseline
    y = BASELINE;
  } else if (x <= 48) {
    // Q-wave (septal depolarization) — small sharp downward deflection
    y = BASELINE + ((x - 44) / 4) * 3;
  } else if (x <= 54) {
    // R-wave (ventricular depolarization) — towering spike
    y = (BASELINE + 3) - ((x - 48) / 6) * 15;
  } else if (x <= 60) {
    // S-wave — deep negative deflection
    y = 3 + ((x - 54) / 6) * 23;
  } else if (x <= 64) {
    // J-point recovery to baseline
    y = 26 - ((x - 60) / 4) * 11;
  } else if (x <= 74) {
    // ST segment plateau
    y = BASELINE;
  } else if (x <= 96) {
    // T-wave (ventricular repolarization) — gentle upward dome
    y = BASELINE - 5 * Math.sin(((x - 74) / 22) * Math.PI);
  } else {
    // Isoelectric baseline to end
    y = BASELINE;
  }

  return { x, y };
}

// Complete SVG path string for the full P-Q-R-S-T cardiac cycle
const ECG_PATH =
  'M 0,15 L 20,15 ' +
  'C 24,15 26,11.5 28,11.5 C 30,11.5 32,15 36,15 ' +
  'L 44,15 ' +
  'L 48,18 ' +
  'L 54,3 ' +
  'L 60,26 ' +
  'L 64,15 ' +
  'L 74,15 ' +
  'C 78,15 81,10 85,10 C 89,10 92,15 96,15 ' +
  'L 130,15';

export function EcgTypingIndicator({ label }: EcgTypingIndicatorProps) {
  const { colors, typography, borderRadius } = useTheme();
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const displayLabel = label ?? t.chat.askingAI;

  // Progress shared value (0 -> 1 repeats every 1250ms, i.e. one cardiac sweep)
  const progress = useSharedValue(0);
  const heartScale = useSharedValue(1);
  const staticBreathe = useSharedValue(0.7);

  useEffect(() => {
    if (reducedMotion) {
      staticBreathe.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900 }),
          withTiming(0.6, { duration: 900 }),
        ),
        -1,
        true,
      );
      return;
    }

    // Cardiac wave sweep loop (1250ms per full P-Q-R-S-T cycle)
    progress.value = withRepeat(
      withTiming(1, {
        duration: 1250,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    // Heart icon synchronized double systolic tap ("lub-dub" right as R-wave peaks)
    heartScale.value = withRepeat(
      withSequence(
        withDelay(
          480,
          withSequence(
            withTiming(1.3, { duration: 70, easing: Easing.out(Easing.quad) }),
            withTiming(1.05, { duration: 60 }),
            withTiming(1.22, { duration: 70, easing: Easing.out(Easing.quad) }),
            withTiming(1, { duration: 120 }),
          ),
        ),
        withDelay(450, withTiming(1, { duration: 1 })),
      ),
      -1,
      false,
    );
  }, [reducedMotion, progress, heartScale, staticBreathe]);

  // Animated tracer head riding exactly along the ECG path
  const animatedTracerStyle = useAnimatedStyle(() => {
    'worklet';
    if (reducedMotion) {
      return { opacity: 0 };
    }

    const { x, y } = getEcgCoordinates(progress.value);

    // Soft fade in at start, fade out at end of sweep
    let opacity = 1;
    if (progress.value < 0.08) {
      opacity = progress.value / 0.08;
    } else if (progress.value > 0.92) {
      opacity = (1 - progress.value) / 0.08;
    }

    return {
      opacity,
      transform: [
        { translateX: x - 6 },
        { translateY: y - 6 },
      ],
    };
  });

  const animatedHeartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reducedMotion ? 1 : heartScale.value }],
    opacity: reducedMotion ? staticBreathe.value : 1,
  }));

  const staticTraceStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? staticBreathe.value : 1,
  }));

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background.surface,
          borderColor: colors.border.default,
          borderRadius: borderRadius.lg,
        },
      ]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t.chat.askingAI}
    >
      {/* Telemetry Header */}
      <View style={styles.headerRow}>
        <Animated.View style={[styles.heartIconWrap, animatedHeartStyle]}>
          <MaterialCommunityIcons
            name="heart-pulse"
            size={13}
            color={colors.accent.primary}
          />
        </Animated.View>
        <Text
          style={[
            typography.label.sm,
            styles.headerText,
            { color: colors.text.secondary },
          ]}
        >
          {displayLabel}
        </Text>
        <View
          style={[
            styles.liveIndicatorDot,
            { backgroundColor: colors.accent.primary },
          ]}
        />
      </View>

      {/* Waveform monitor box */}
      <Animated.View
        style={[
          styles.waveformBox,
          {
            backgroundColor: colors.background.subtle,
            borderColor: colors.border.default,
            borderRadius: borderRadius.sm,
          },
          staticTraceStyle,
        ]}
      >
        <Svg width={ECG_WIDTH} height={ECG_HEIGHT} viewBox={`0 0 ${ECG_WIDTH} ${ECG_HEIGHT}`}>
          <Defs>
            <LinearGradient id="ecgGlow" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.accent.primary} stopOpacity="0.25" />
              <Stop offset="0.45" stopColor={colors.accent.primary} stopOpacity="0.9" />
              <Stop offset="1" stopColor={colors.accent.primary} stopOpacity="0.25" />
            </LinearGradient>
          </Defs>

          {/* Reference baseline trace (always visible) */}
          <Path
            d={ECG_PATH}
            stroke={colors.accent.primary}
            strokeOpacity={0.28}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* Illuminated cardiac path */}
          <Path
            d={ECG_PATH}
            stroke="url(#ecgGlow)"
            strokeOpacity={0.75}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>

        {/* Animated phosphor sweeping tracer */}
        {!reducedMotion && (
          <Animated.View
            pointerEvents="none"
            style={[styles.tracerWrap, animatedTracerStyle]}
          >
            {/* Outer soft glowing halo */}
            <View
              style={[
                styles.tracerHalo,
                {
                  backgroundColor: colors.accent.primary,
                  shadowColor: colors.accent.primary,
                },
              ]}
            />
            {/* Bright phosphor core */}
            <View style={styles.tracerCore} />
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignSelf: 'flex-start',
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heartIconWrap: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  liveIndicatorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginLeft: 'auto',
    opacity: 0.8,
  },
  waveformBox: {
    position: 'relative',
    width: ECG_WIDTH,
    height: ECG_HEIGHT,
    borderWidth: 0.5,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tracerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 12,
    height: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tracerHalo: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    opacity: 0.45,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
    elevation: 3,
  },
  tracerCore: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: '#FFFFFF',
  },
});
