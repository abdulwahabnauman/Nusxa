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
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/provider';

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
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(120);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (state.visible) {
      translateY.value = withSpring(0, { damping: 16, stiffness: 200 });
      opacity.value = withTiming(1, { duration: 200 });

      const timer = setTimeout(onDismiss, TOAST_DURATION);
      return () => clearTimeout(timer);
    } else {
      translateY.value = withTiming(120, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [state.visible, onDismiss, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const handleUndo = () => {
    state.onUndo();
    onDismiss();
  };

  return (
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
          UNDO
        </Text>
      </TouchableOpacity>
    </Animated.View>
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
