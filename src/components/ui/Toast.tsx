import React, { useEffect } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastProps {
  message: string;
  type?: ToastType;
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
  /** Optional trailing action button (e.g. Undo) */
  action?: ToastAction;
}

const ICON_MAP: Record<ToastType, keyof typeof MaterialCommunityIcons.glyphMap> = {
  success: 'check-circle-outline',
  error: 'alert-circle-outline',
  warning: 'alert-outline',
  info: 'information-outline',
};

export function Toast({
  message,
  type = 'info',
  visible,
  onDismiss,
  duration = 4000,
  action,
}: ToastProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(10);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Calm entrance: gentle fade with a soft 10px rise into place, no bounce.
      // Reduced-motion users get a plain fade with no movement.
      if (reducedMotion) {
        translateY.value = 0;
      } else {
        translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      }
      opacity.value = withTiming(1, { duration: 180 });

      const timer = setTimeout(onDismiss, duration);
      return () => clearTimeout(timer);
    } else {
      translateY.value = withTiming(8, { duration: 160, easing: Easing.in(Easing.quad) });
      opacity.value = withTiming(0, { duration: 160 });
    }
  }, [visible, duration, onDismiss, translateY, opacity, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
    opacity: opacity.value,
  }));

  // Swipe left or right to dismiss: the toast follows the finger and fades
  // with distance; past the threshold (or on a confident flick) it flings
  // off-screen and dismisses, otherwise it springs back into place.
  const swipeDismiss = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onUpdate((e) => {
      'worklet';
      translateX.value = e.translationX;
      opacity.value = Math.max(0.25, 1 - Math.abs(e.translationX) / 240);
    })
    .onEnd((e) => {
      'worklet';
      const shouldDismiss = Math.abs(e.translationX) > 96 || Math.abs(e.velocityX) > 600;
      if (shouldDismiss && reducedMotion) {
        // Reduced-motion: no fling, just drop the toast instantly
        runOnJS(onDismiss)();
        return;
      }
      if (shouldDismiss) {
        const dir = e.translationX > 0 ? 1 : -1;
        translateX.value = withTiming(dir * 480, { duration: 200, easing: Easing.in(Easing.quad) });
        opacity.value = withTiming(0, { duration: 200 }, (finished) => {
          if (finished) runOnJS(onDismiss)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 22, stiffness: 300 });
        opacity.value = withTiming(1, { duration: 150 });
      }
    });

  const colorMap: Record<ToastType, string> = {
    success: colors.success,
    error: colors.error,
    warning: colors.warning,
    info: colors.info,
  };

  const iconColor = colorMap[type];

  return (
    <GestureDetector gesture={swipeDismiss}>
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.background.surface,
          borderColor: colors.border.default,
          borderRadius: borderRadius.md,
          padding: spacing.base,
          bottom: insets.bottom + 76,
        },
        animatedStyle,
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <TouchableOpacity
        style={[styles.content, action ? { flex: 1 } : null]}
        onPress={onDismiss}
        activeOpacity={0.8}
        accessibilityLabel={`${type}: ${message}. Tap or swipe to dismiss.`}
      >
        <MaterialCommunityIcons name={ICON_MAP[type]} size={22} color={iconColor} />
        <Text style={[typography.body.sm, { color: colors.text.primary, flex: 1, marginStart: spacing.sm }]}>
          {message}
        </Text>
      </TouchableOpacity>
      {action && (
        <TouchableOpacity
          onPress={() => {
            action.onPress();
            onDismiss();
          }}
          style={{ paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, marginStart: spacing.xs }}
          accessibilityLabel={action.label}
        >
          <Text style={[typography.label.base, { color: colors.accent.primary, fontFamily: typography.families.bold }]}>
            {action.label.toUpperCase()}
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
