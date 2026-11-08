/**
 * AudioEqualizer — Dancing 4-bar waveform animation.
 * Replaces static audio icons during TTS voice playback with lively,
 * organic equalizer waves that oscillate asynchronously.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface AudioEqualizerProps {
  color: string;
  size?: number;
  isPlaying?: boolean;
}

export function AudioEqualizer({
  color,
  size = 18,
  isPlaying = true,
}: AudioEqualizerProps) {
  const reducedMotion = useReducedMotion();

  // 4 asynchronous wave bar scales
  const h1 = useSharedValue(0.3);
  const h2 = useSharedValue(0.5);
  const h3 = useSharedValue(0.4);
  const h4 = useSharedValue(0.25);

  useEffect(() => {
    if (!isPlaying || reducedMotion) {
      h1.value = 0.3;
      h2.value = 0.5;
      h3.value = 0.4;
      h4.value = 0.25;
      return;
    }

    // Staggered asynchronous dancing frequencies
    h1.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 320, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.25, { duration: 320, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );

    h2.value = withRepeat(
      withSequence(
        withTiming(1.0, { duration: 250, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.35, { duration: 250, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );

    h3.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 390, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.3, { duration: 390, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );

    h4.value = withRepeat(
      withSequence(
        withTiming(0.75, { duration: 290, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.2, { duration: 290, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      true
    );
  }, [isPlaying, reducedMotion, h1, h2, h3, h4]);

  const bar1Style = useAnimatedStyle(() => ({
    height: Math.max(3, size * h1.value),
  }));

  const bar2Style = useAnimatedStyle(() => ({
    height: Math.max(3, size * h2.value),
  }));

  const bar3Style = useAnimatedStyle(() => ({
    height: Math.max(3, size * h3.value),
  }));

  const bar4Style = useAnimatedStyle(() => ({
    height: Math.max(3, size * h4.value),
  }));

  const barWidth = Math.max(2.5, size * 0.14);
  const barRadius = barWidth / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View style={[styles.bar, { width: barWidth, borderRadius: barRadius, backgroundColor: color }, bar1Style]} />
      <Animated.View style={[styles.bar, { width: barWidth, borderRadius: barRadius, backgroundColor: color }, bar2Style]} />
      <Animated.View style={[styles.bar, { width: barWidth, borderRadius: barRadius, backgroundColor: color }, bar3Style]} />
      <Animated.View style={[styles.bar, { width: barWidth, borderRadius: barRadius, backgroundColor: color }, bar4Style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 1,
  },
  bar: {
    alignSelf: 'center',
  },
});
