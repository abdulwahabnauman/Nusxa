import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../theme/provider';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius: br,
  style,
}: SkeletonProps) {
  const { colors, borderRadius } = useTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(reducedMotion ? 0.7 : 0.3);

  useEffect(() => {
    if (reducedMotion) return;
    // Gentle shimmer loop while content loads
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1
    );
  }, [reducedMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          backgroundColor: colors.background.subtle,
          borderRadius: br ?? borderRadius.md,
        },
        animatedStyle,
        style,
      ]}
      accessibilityLabel="Loading"
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? '60%' : '100%'}
          height={14}
        />
      ))}
    </View>
  );
}

export function SkeletonCard() {
  const { spacing, borderRadius } = useTheme();
  const { colors } = useTheme();
  return (
    <View
      style={{
        padding: spacing.base,
        backgroundColor: colors.background.surface,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: colors.border.default,
        gap: spacing.sm,
      }}
    >
      <Skeleton width="40%" height={20} />
      <Skeleton width="100%" height={14} />
      <Skeleton width="70%" height={14} />
    </View>
  );
}
