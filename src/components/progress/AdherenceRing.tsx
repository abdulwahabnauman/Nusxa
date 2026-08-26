import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/provider';

interface AdherenceRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export function AdherenceRing({
  percentage,
  size = 100,
  strokeWidth = 8,
  label,
}: AdherenceRingProps) {
  const { colors, typography } = useTheme();

  const clampedPercentage = Math.min(100, Math.max(0, percentage));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedPercentage / 100) * circumference;

  const ringColor =
    clampedPercentage >= 80 ? colors.success
    : clampedPercentage >= 50 ? colors.warning
    : colors.error;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: colors.background.subtle,
          },
        ]}
      >
        <View
          style={[
            styles.progressOverlay,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: strokeWidth,
              borderColor: ringColor,
              borderTopColor: clampedPercentage >= 50 ? ringColor : 'transparent',
              borderRightColor: clampedPercentage >= 25 ? ringColor : 'transparent',
              borderBottomColor: clampedPercentage >= 75 ? ringColor : 'transparent',
              borderLeftColor: clampedPercentage < 25 ? ringColor : 'transparent',
              transform: [{ rotate: '-90deg' }],
            },
          ]}
        />
        <View style={styles.center}>
          <Text
            style={[
              typography.heading.h2,
              {
                color: colors.text.primary,
                textAlign: 'center',
                // Compact, ring-relative sizing so both the percentage and the
                // label fit inside the circle even in tall Nastaliq script.
                fontSize: size * 0.22,
                lineHeight: size * 0.26,
              },
            ]}
            accessibilityLabel={`${clampedPercentage}% adherence`}
          >
            {Math.round(clampedPercentage)}%
          </Text>
          {label && (
            <Text
              style={[
                typography.body.xs,
                {
                  color: colors.text.secondary,
                  textAlign: 'center',
                  marginTop: 0,
                  fontSize: Math.max(8, size * 0.11),
                  lineHeight: Math.max(10, size * 0.15),
                },
              ]}
            >
              {label}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressOverlay: {
    position: 'absolute',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
