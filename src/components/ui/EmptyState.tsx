import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/provider';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Button } from './Button';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const isIconName = (value: IconName | React.ReactNode): value is IconName =>
  typeof value === 'string';

interface EmptyStateProps {
  /** Icon name, or a custom rendered node (e.g. the shared PillIcon) */
  icon?: IconName | React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = 'inbox-outline',
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { colors, typography, spacing } = useTheme();
  const reducedMotion = useReducedMotion();

  // Gentle floating so empty states feel alive without being distracting
  const floatY = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    floatY.value = withRepeat(withTiming(-5, { duration: 1800 }), -1, true);
  }, [reducedMotion, floatY]);
  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  return (
    <View style={styles.container} accessibilityRole="text">
      <Animated.View style={floatStyle}>
        {isIconName(icon) ? (
          <MaterialCommunityIcons
            name={icon}
            size={56}
            color={colors.text.disabled}
          />
        ) : (
          icon
        )}
      </Animated.View>
      <Text
        style={[
          typography.heading.h3,
          { color: colors.text.primary, marginTop: spacing.base },
        ]}
      >
        {title}
      </Text>
      {description && (
        <Text
          style={[
            typography.body.base,
            {
              color: colors.text.secondary,
              marginTop: spacing.sm,
              textAlign: 'center',
            },
          ]}
        >
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <View style={{ marginTop: spacing.xl }}>
          <Button title={actionLabel} onPress={onAction} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 32,
  },
});
