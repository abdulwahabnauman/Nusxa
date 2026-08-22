import React, { useEffect, useRef } from 'react';
import { Animated, Text, View, StyleSheet, TouchableOpacity } from 'react-native';
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
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 60,
          friction: 8,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(onDismiss, duration);
      return () => clearTimeout(timer);
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -100,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, duration, onDismiss, translateY, opacity]);

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
          transform: [{ translateY }],
          opacity,
        },
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
        <Text style={[typography.body.sm, { color: colors.text.primary, flex: 1, marginLeft: spacing.sm }]}>
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
