/**
 * UndoToast — bottom-anchored toast with an Undo action.
 * Replaces blocking Alerts for reversible destructive actions
 * (dose skip/take, archive, delete) per the UX roadmap.
 *
 * Usage:
 *   const { showUndoToast, undoToastElement } = useUndoToast();
 *   showUndoToast('Prescription archived', () => restore());
 *   ...
 *   {undoToastElement}
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/provider';
import { useI18n } from '../../i18n';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const TOAST_DURATION = 5000;

interface UndoToastState {
  message: string;
  onUndo: () => void;
  visible: boolean;
}

interface UndoToastProps {
  state: UndoToastState;
  onDismiss: () => void;
}

function UndoToast({ state, onDismiss }: UndoToastProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(120);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (state.visible) {
      // A reused toast may still carry a leftover swipe offset — reset it
      translateX.value = 0;
      // Calm entrance: deceleration slide-up that lands with no bounce.
      // Reduced-motion users get a plain fade with no movement.
      if (reducedMotion) {
        translateY.value = 0;
      } else {
        translateY.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
      }
      opacity.value = withTiming(1, { duration: 180 });

      const timer = setTimeout(onDismiss, TOAST_DURATION);
      return () => clearTimeout(timer);
    } else {
      translateY.value = withTiming(120, { duration: 160, easing: Easing.in(Easing.quad) });
      opacity.value = withTiming(0, { duration: 160 });
    }
  }, [state.visible, onDismiss, translateY, translateX, opacity, reducedMotion]);

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

  const handleUndo = () => {
    state.onUndo();
    onDismiss();
  };

  return (
    <GestureDetector gesture={swipeDismiss}>
    <Animated.View
      style={[
        styles.container,
        {
          bottom: insets.bottom + 12,
          backgroundColor: colors.text.primary,
          borderRadius: borderRadius.md,
          paddingVertical: spacing.sm,
          paddingLeft: spacing.base,
          paddingRight: spacing.xs,
        },
        animatedStyle,
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <MaterialCommunityIcons name="information-outline" size={18} color={colors.background.primary} />
      <Text
        numberOfLines={2}
        style={[typography.body.sm, { color: colors.background.primary, flex: 1, marginHorizontal: spacing.sm }]}
      >
        {state.message}
      </Text>
      <TouchableOpacity
        onPress={handleUndo}
        style={{
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          borderRadius: borderRadius.sm,
        }}
        accessibilityLabel="Undo last action"
      >
        <Text style={[typography.label.base, { color: colors.accent.primary, fontWeight: '700' }]}>
          {t.common.undo.toUpperCase()}
        </Text>
      </TouchableOpacity>
    </Animated.View>
    </GestureDetector>
  );
}

/** Hook that manages a single undo toast instance */
export function useUndoToast() {
  const [state, setState] = useState<UndoToastState>({
    message: '',
    onUndo: () => {},
    visible: false,
  });

  const showUndoToast = useCallback((message: string, onUndo: () => void) => {
    setState({ message, onUndo, visible: true });
  }, []);

  const dismiss = useCallback(() => {
    setState((current) => ({ ...current, visible: false }));
  }, []);

  const undoToastElement = <UndoToast state={state} onDismiss={dismiss} />;

  return { showUndoToast, undoToastElement };
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
});
