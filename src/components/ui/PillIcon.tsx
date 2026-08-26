import React from 'react';
import Svg, { G, Path, Rect } from 'react-native-svg';

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
