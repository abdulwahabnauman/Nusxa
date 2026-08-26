/**
 * Celebration — short full-screen celebration overlay for milestones
 * (7/30-day streaks, all doses done). Auto-dismisses, reduced-motion aware.
 */

import React, { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  FadeIn,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/provider';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface CelebrationProps {
  title: string;
  subtitle: string;
  onDismiss: () => void;
  /** Auto-dismiss delay in ms */
  duration?: number;
}

export function Celebration({ title, subtitle, onDismiss, duration = 2600 }: CelebrationProps) {
  const { colors, typography, spacing } = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(reducedMotion ? 1 : 0.5);
  const iconRotate = useSharedValue(reducedMotion ? 0 : -20);

  useEffect(() => {
    if (!reducedMotion) {
      // Fast pop-in: stiff spring with a touch of overshoot, settles ~300ms
      scale.value = withSpring(1, { damping: 15, stiffness: 400 });
      iconRotate.value = withSequence(
        withTiming(15, { duration: 110 }),
        withTiming(-10, { duration: 110 }),
        withSpring(0, { damping: 14, stiffness: 300 })
      );
    }
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [reducedMotion, duration, onDismiss, scale, iconRotate]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${iconRotate.value}deg` }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(140)}
      style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
      pointerEvents="box-none"
    >
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: colors.background.surface,
            borderColor: colors.accent.primary + '66',
            padding: spacing.xl,
          },
          cardStyle,
        ]}
      >
        <Animated.View style={iconStyle}>
          <MaterialCommunityIcons name="party-popper" size={52} color={colors.accent.primary} />
        </Animated.View>
        <Text style={[typography.heading.h3, { color: colors.text.primary, marginTop: spacing.md, textAlign: 'center' }]}>
          {title}
        </Text>
        <Text style={[typography.body.base, { color: colors.text.secondary, marginTop: spacing.xs, textAlign: 'center' }]}>
          {subtitle}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    marginHorizontal: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
});
