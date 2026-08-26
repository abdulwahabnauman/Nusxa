export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

// Enhanced spacing for elderly mode (larger touch targets)
export const elderlySpacing = {
  xs: 12,   // Doubled from 8
  sm: 16,   // Increased from 12
  md: 20,   // Increased from 16
  base: 24, // Increased from 20
  lg: 32,   // Increased from 24
  xl: 40,   // Increased from 32
  '2xl': 48, // Increased from 40
  '3xl': 64, // Increased from 56
} as const;

/**
 * Capped spacing scale for buttons in elderly mode.
 * Buttons already get the elderly font-size bump, so applying the full
 * elderlySpacing on top compounds into disproportionately huge buttons.
 * This smaller bump keeps the ≥44pt touch target without oversizing.
 */
export const elderlyButtonSpacing = {
  xs: 8,
  sm: 10,
  md: 14,
  base: 20,
  lg: 24,
  xl: 28,
  '2xl': 36,
  '3xl': 52,
} as const;

export type SpacingKey = keyof typeof spacing;

export const borderRadius = {
  sm: 8,  // Slightly larger for elderly mode compatibility
  md: 12, // Increased from 8
  lg: 16, // Increased from 12
  xl: 20, // Increased from 16
  full: 9999,
} as const;

export type BorderRadiusKey = keyof typeof borderRadius;

// Enhanced border radius for elderly mode (easier-to-tap buttons)
export const elderlyBorderRadius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 9999,
} as const;
