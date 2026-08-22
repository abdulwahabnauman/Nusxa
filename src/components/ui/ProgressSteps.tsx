import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';

interface Step {
  label: string;
  status: 'completed' | 'active' | 'pending' | 'error';
}

interface ProgressStepsProps {
  steps: Step[];
}

export function ProgressSteps({ steps }: ProgressStepsProps) {
  const { colors, typography, spacing } = useTheme();

  return (
    <View style={styles.container} accessibilityRole="progressbar">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        let iconColor: string;
        let iconName: keyof typeof MaterialCommunityIcons.glyphMap;

        switch (step.status) {
          case 'completed':
            iconColor = colors.success;
            iconName = 'check-circle';
            break;
          case 'active':
            iconColor = colors.accent.primary;
            iconName = 'progress-clock';
            break;
          case 'error':
            iconColor = colors.error;
            iconName = 'alert-circle';
            break;
          default:
            iconColor = colors.text.disabled;
            iconName = 'circle-outline';
        }

        return (
          <View key={index} style={styles.stepContainer}>
            <View style={styles.stepRow}>
              <MaterialCommunityIcons
                name={iconName}
                size={20}
                color={iconColor}
              />
              <Text
                style={[
                  typography.body.sm,
                  {
                    color:
                      step.status === 'pending'
                        ? colors.text.disabled
                        : colors.text.primary,
                    marginLeft: spacing.sm,
                  },
                ]}
              >
                {step.label}
              </Text>
            </View>
            {!isLast && (
              <View
                style={[
                  styles.connector,
                  {
                    backgroundColor:
                      step.status === 'completed'
                        ? colors.success
                        : colors.border.default,
                    marginLeft: 9,
                  },
                ]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  stepContainer: {
    flexDirection: 'column',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  connector: {
    width: 2,
    height: 20,
    marginVertical: 2,
  },
});
