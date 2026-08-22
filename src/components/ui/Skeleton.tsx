import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/provider';

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
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          backgroundColor: colors.background.subtle,
          borderRadius: br ?? borderRadius.md,
          opacity,
        },
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
