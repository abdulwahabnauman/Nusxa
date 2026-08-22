import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  ViewStyle,
  TextInputProps,
} from 'react-native';
import { useTheme } from '../../theme/provider';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  helper?: string;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  helper,
  containerStyle,
  ...inputProps
}: InputProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text
          style={[
            typography.label.base,
            { color: colors.text.secondary, marginBottom: spacing.xs },
          ]}
        >
          {label}
        </Text>
      )}
      <TextInput
        style={[
          styles.input,
          typography.body.base,
          {
            backgroundColor: colors.background.surface,
            color: colors.text.primary,
            borderColor: error
              ? colors.error
              : isFocused
                ? colors.accent.primary
                : colors.border.default,
            borderRadius: borderRadius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
          },
        ]}
        placeholderTextColor={colors.text.disabled}
        onFocus={(e) => {
          setIsFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          inputProps.onBlur?.(e);
        }}
        accessibilityLabel={label}
        accessibilityState={{ disabled: inputProps.editable === false }}
        {...inputProps}
      />
      {error && (
        <Text
          style={[
            typography.body.xs,
            { color: colors.error, marginTop: spacing.xs },
          ]}
          accessibilityRole="alert"
        >
          {error}
        </Text>
      )}
      {helper && !error && (
        <Text
          style={[
            typography.body.xs,
            { color: colors.text.secondary, marginTop: spacing.xs },
          ]}
        >
          {helper}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  input: {
    borderWidth: 1,
    minHeight: 48,
  },
});
