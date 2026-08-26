import React from 'react';
import Svg, { G, Path, Rect, Circle } from 'react-native-svg';

interface PillIconProps {
  /** Rendered width/height in dp */
  size?: number;
  /** Primary color: outline, divider and the filled capsule half */
  color?: string;
  /**
   * Fill of the second capsule half. When omitted the icon renders as a
   * monochrome outline glyph (what the tab bar and muted states need),
   * so a single component covers both light and dark themes via theming.
   */
  contrastColor?: string;
  strokeWidth?: number;
}

/**
 * The Nusxa capsule mark: a two-tone capsule tilted diagonally, matching
 * the app icon silhouette (assets/icon.png). Drawn once in a 24x24 viewBox
 * and rotated 45°, so it scales cleanly at any size.
 */
export function PillIcon({ size = 24, color = '#1B3A7B', contrastColor, strokeWidth = 1.6 }: PillIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G transform="rotate(45 12 12)">
        {/* Upper half — always filled with the primary color */}
        <Path d="M8 12 V6 a4 4 0 0 1 8 0 V12 Z" fill={color} />
        {/* Lower half — contrast fill when duotone, otherwise left hollow */}
        {contrastColor ? <Path d="M8 12 h8 v6 a4 4 0 0 1 -8 0 Z" fill={contrastColor} /> : null}
        {/* Capsule outline */}
        <Rect x={8} y={2} width={8} height={20} rx={4} stroke={color} strokeWidth={strokeWidth} />
        {/* Divider between the two halves */}
        <Path d="M8 12 h8" stroke={color} strokeWidth={strokeWidth} />
      </G>
    </Svg>
  );
}

/* ------------------------------------------------------------------------ */
/* Per-medicine-form icons                                                   */
/* ------------------------------------------------------------------------ */

export type NormalizedMedicineForm =
  | 'tablet'
  | 'capsule'
  | 'syrup'
  | 'injection'
  | 'cream'
  | 'drops'
  | 'inhaler'
  | 'patch'
  | 'other';

/** Map free-text form values coming from the AI (or the DB) to a known glyph. */
export function normalizeMedicineForm(form: string | null | undefined): NormalizedMedicineForm {
  if (!form) return 'capsule';
  const f = form.toLowerCase();
  if (f.includes('capsul')) return 'capsule';
  if (f.includes('tablet') || f.includes(' tab')) return 'tablet';
  if (f.includes('syrup') || f.includes('suspension') || f.includes('solution')) return 'syrup';
  if (f.includes('inject') || f.includes('ampoule') || f.includes('ampule') || f.includes('vial')) return 'injection';
  if (f.includes('cream') || f.includes('ointment') || f.includes('gel') || f.includes('lotion') || f.includes('balm')) return 'cream';
  if (f.includes('drop')) return 'drops';
  if (f.includes('inhal')) return 'inhaler';
  if (f.includes('patch')) return 'patch';
  return 'other';
}

interface MedicineFormIconProps extends PillIconProps {
  /** Free-text or enum form of the medicine; unknown values fall back to a lozenge glyph */
  form?: string | null;
}

/**
 * Distinct glyph per medicine form, all drawn in the same 24x24 viewBox with
 * the same duotone idiom as PillIcon so they sit consistently in every list.
 * The capsule glyph is intentionally the existing Nusxa capsule mark.
 */
export function MedicineFormIcon({
  form,
  size = 24,
  color = '#1B3A7B',
  contrastColor,
  strokeWidth = 1.6,
}: MedicineFormIconProps) {
  const normalized = normalizeMedicineForm(form);

  switch (normalized) {
    case 'capsule':
      return <PillIcon size={size} color={color} contrastColor={contrastColor} strokeWidth={strokeWidth} />;

    case 'tablet':
      // Round tablet with a score line, tilted slightly for the same energy as the capsule
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <G transform="rotate(-18 12 12)">
            {contrastColor ? <Path d="M4.5 12 a7.5 7.5 0 0 1 15 0 Z" fill={contrastColor} /> : null}
            <Circle cx={12} cy={12} r={7.5} stroke={color} strokeWidth={strokeWidth} />
            <Path d="M4.5 12 h15" stroke={color} strokeWidth={strokeWidth} />
          </G>
        </Svg>
      );

    case 'syrup':
      // Bottle with cap, liquid level and measure marks
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {contrastColor ? (
            <Path d="M6.8 14.5 h10.4 V19 a1.6 1.6 0 0 1 -1.6 1.6 H8.4 a1.6 1.6 0 0 1 -1.6 -1.6 Z" fill={contrastColor} />
          ) : null}
          <Rect x={9} y={2.5} width={6} height={3.5} rx={1} fill={color} />
          <Path
            d="M9.5 6 h5 v2.5 h1.5 a2 2 0 0 1 2 2 V19 a2 2 0 0 1 -2 2 H8 a2 2 0 0 1 -2 -2 v-8.5 a2 2 0 0 1 2 -2 h1.5 Z"
            stroke={color}
            strokeWidth={strokeWidth}
          />
          <Path d="M9.2 12 h3 M9.2 15.5 h3" stroke={color} strokeWidth={strokeWidth * 0.8} />
        </Svg>
      );

    case 'injection':
      // Syringe tilted like the capsule mark
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <G transform="rotate(45 12 12)">
            {contrastColor ? <Rect x={9.5} y={11} width={5} height={4} fill={contrastColor} /> : null}
            <Path d="M12 2.5 v4" stroke={color} strokeWidth={strokeWidth} />
            <Rect x={9.5} y={6.5} width={5} height={8.5} rx={1} stroke={color} strokeWidth={strokeWidth} />
            <Path d="M9.5 9.5 h2.2 M9.5 12 h2.2" stroke={color} strokeWidth={strokeWidth * 0.7} />
            <Path d="M12 15 v4 M9.2 19 h5.6" stroke={color} strokeWidth={strokeWidth} />
          </G>
        </Svg>
      );

    case 'cream':
      // Tube with cap and crimped bottom
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {contrastColor ? <Path d="M8.4 12.5 h7.2 l0.6 3.5 H7.8 Z" fill={contrastColor} /> : null}
          <Rect x={9.5} y={2.5} width={5} height={3} rx={1} fill={color} />
          <Path
            d="M9.5 5.5 h5 v2.5 l1.7 10 a1 1 0 0 1 -1 1.2 H8.8 a1 1 0 0 1 -1 -1.2 l1.7 -10 Z"
            stroke={color}
            strokeWidth={strokeWidth}
          />
          <Path d="M7.6 21 h8.8" stroke={color} strokeWidth={strokeWidth} />
        </Svg>
      );

    case 'drops':
      // Dropper releasing a single drop
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x={10} y={2.5} width={4} height={3} rx={1.5} fill={color} />
          <Path d="M10.6 5.5 h2.8 v2 h-2.8 Z" stroke={color} strokeWidth={strokeWidth * 0.8} />
          <Path d="M10.9 7.5 h2.2 l-0.6 4.8 h-1 Z" stroke={color} strokeWidth={strokeWidth * 0.8} />
          <Path
            d="M12 14 c2.2 2.6 3.2 4 3.2 5.4 a3.2 3.2 0 0 1 -6.4 0 c0 -1.4 1 -2.8 3.2 -5.4 Z"
            fill={contrastColor ?? color}
            stroke={color}
            strokeWidth={strokeWidth * 0.7}
          />
        </Svg>
      );

    case 'inhaler':
      // Metered-dose inhaler: canister seated in an L-shaped body with mouthpiece
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {contrastColor ? <Rect x={8.8} y={3.3} width={4.4} height={3.4} rx={1} fill={contrastColor} /> : null}
          <Rect x={8} y={2.5} width={6} height={10} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
          <Path
            d="M7 12.5 h7 v3 h4.5 a1.5 1.5 0 0 1 1.5 1.5 v1.5 a1.5 1.5 0 0 1 -1.5 1.5 H9 a2 2 0 0 1 -2 -2 Z"
            stroke={color}
            strokeWidth={strokeWidth}
          />
        </Svg>
      );

    case 'patch':
      // Transdermal patch: adhesive square with the medicated core
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x={4} y={4} width={16} height={16} rx={4.5} stroke={color} strokeWidth={strokeWidth} />
          <Rect
            x={7.5}
            y={7.5}
            width={9}
            height={9}
            rx={2.5}
            fill={contrastColor ?? 'none'}
            stroke={color}
            strokeWidth={strokeWidth * 0.8}
          />
        </Svg>
      );

    case 'other':
    default:
      // Lozenge-shaped pill as the generic fallback
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <G transform="rotate(45 12 12)">
            {contrastColor ? (
              <Path d="M6.5 12 v-2 a3.5 3.5 0 0 1 3.5 -3.5 h4 a3.5 3.5 0 0 1 3.5 3.5 v2 Z" fill={contrastColor} />
            ) : null}
            <Rect x={6.5} y={6.5} width={11} height={11} rx={3.5} stroke={color} strokeWidth={strokeWidth} />
            <Path d="M6.5 12 h11" stroke={color} strokeWidth={strokeWidth} />
          </G>
        </Svg>
      );
  }
}
