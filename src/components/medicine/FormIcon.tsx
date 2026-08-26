/**
 * MedicineFormIcon — photo-style icon per medicine form (tablet/capsule/syrup/…)
 * plus a deterministic strength color helper for color-coded dosages.
 */

import React from 'react';
import { View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { MedicineForm } from '../../types/models';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Icon per form, restricted to glyphs known to exist in this
 * @expo/vector-icons version (falls back to "pill" when unknown).
 */
const FORM_ICONS: Record<string, IconName> = {
  tablet: 'pill',
  capsule: 'pill',
  syrup: 'bottle-tonic-outline',
  injection: 'needle',
  cream: 'lotion-outline',
  drops: 'eyedropper',
  inhaler: 'spray',
  patch: 'bandage',
  other: 'pill',
};

interface MedicineFormIconProps {
  form?: MedicineForm;
  size?: number;
  color: string;
  /** When set, renders the icon inside a tinted circular bubble */
  bubbleBackground?: string;
  style?: ViewStyle;
}

export function MedicineFormIcon({
  form,
  size = 22,
  color,
  bubbleBackground,
  style,
}: MedicineFormIconProps) {
  const requested = FORM_ICONS[form ?? 'other'] ?? 'pill';
  const name: IconName = requested in MaterialCommunityIcons.glyphMap ? requested : 'pill';

  const icon = <MaterialCommunityIcons name={name} size={size} color={color} />;

  if (!bubbleBackground) {
    return <View style={style}>{icon}</View>;
  }

  return (
    <View
      style={[
        {
          width: size * 1.9,
          height: size * 1.9,
          borderRadius: size * 0.95,
          backgroundColor: bubbleBackground,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
      accessibilityLabel={form ? `Form: ${form}` : 'Medicine'}
    >
      {icon}
    </View>
  );
}

const STRENGTH_COLORS = ['#2563EB', '#0891B2', '#B45309', '#B91C1C'];

/**
 * Deterministic color for a strength label ("500 mg", "10ml", …) so each
 * strength of the same medicine always renders with the same hue.
 */
export function strengthColor(strength: string | null | undefined): string | null {
  if (!strength) return null;
  const match = strength.match(/\d+/);
  if (!match) return STRENGTH_COLORS[0] ?? '#2563EB';
  const value = parseInt(match[0] ?? '0', 10);
  if (value < 100) return STRENGTH_COLORS[0] ?? '#2563EB';
  if (value < 500) return STRENGTH_COLORS[1] ?? '#0891B2';
  if (value < 1000) return STRENGTH_COLORS[2] ?? '#B45309';
  return STRENGTH_COLORS[3] ?? '#B91C1C';
}
