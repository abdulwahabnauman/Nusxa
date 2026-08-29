import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { spacing } from '../../theme/spacing';

interface PinKeypadProps {
  pinLength: number;
  entered: string;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}

/** Theme-aware PIN dots + numeric keypad, shared by the lock screen and setup */
export function PinKeypad({ pinLength, entered, onDigit, onBackspace, disabled = false }: PinKeypadProps) {
  const { colors, typography: typ } = useTheme();

  const keyStyle = [styles.key, { backgroundColor: colors.background.subtle }, disabled ? { opacity: 0.4 } : null];

  return (
    <View style={styles.wrap}>
      <View style={styles.dots}>
        {Array.from({ length: pinLength }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                borderColor: colors.border.default,
                backgroundColor: entered.length > i ? colors.accent.primary : 'transparent',
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.keypad}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <TouchableOpacity
            key={num}
            style={keyStyle}
            onPress={() => !disabled && onDigit(num.toString())}
            disabled={disabled}
            accessibilityLabel={`Digit ${num}`}
          >
            <Text style={[typ.heading.h4, { color: colors.text.primary }]}>{num}</Text>
          </TouchableOpacity>
        ))}

        {/* Empty corner keeps the grid centered */}
        <View style={[styles.key, { backgroundColor: 'transparent' }]} />

        <TouchableOpacity
          style={keyStyle}
          onPress={() => !disabled && onDigit('0')}
          disabled={disabled}
          accessibilityLabel="Digit 0"
        >
          <Text style={[typ.heading.h4, { color: colors.text.primary }]}>0</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={keyStyle}
          onPress={() => !disabled && onBackspace()}
          disabled={disabled}
          accessibilityLabel="Delete last digit"
        >
          <MaterialCommunityIcons name="backspace-outline" size={24} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    marginBottom: spacing.xl,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    marginHorizontal: 8,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 264,
    rowGap: spacing.sm,
    columnGap: spacing.sm,
  },
  key: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
