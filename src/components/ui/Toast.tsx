import React, { useEffect } from 'react';
import { Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
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
}: ToastProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const translateY = useSharedValue(-10);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Calm entrance: gentle fade with a soft 10px settle — no bounce
      translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      opacity.value = withTiming(1, { duration: 180 });

      const timer = setTimeout(onDismiss, duration);
      return () => clearTimeout(timer);
    } else {
      translateY.value = withTiming(-8, { duration: 160, easing: Easing.in(Easing.quad) });
      opacity.value = withTiming(0, { duration: 160 });
    }
  }, [visible, duration, onDismiss, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const colorMap: Record<ToastType, string> = {
    success: colors.success,
    error: colors.error,
    warning: colors.warning,
    info: colors.info,
  };

  const iconColor = colorMap[type];

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.background.surface,
          borderColor: colors.border.default,
          borderRadius: borderRadius.md,
          padding: spacing.base,
        },
        animatedStyle,
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <TouchableOpacity
        style={styles.content}
        onPress={onDismiss}
        activeOpacity={0.8}
        accessibilityLabel={`${type}: ${message}. Tap to dismiss.`}
      >
        <MaterialCommunityIcons name={ICON_MAP[type]} size={22} color={iconColor} />
        <Text style={[typography.body.sm, { color: colors.text.primary, flex: 1, marginStart: spacing.sm }]}>
          {message}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 9999,
    borderWidth: 1,
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
