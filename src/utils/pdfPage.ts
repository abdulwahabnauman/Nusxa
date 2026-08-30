import { Platform } from 'react-native';
import type * as Print from 'expo-print';

/**
 * Shared page geometry for every PDF report.
 *
 * Android's WebView print adapter honors CSS `@page` rules, but the iOS
 * renderer (UIPrintPageRenderer + WKWebView print formatter) ignores them
 * entirely — without explicit native options, iOS PDFs came out on US Letter
 * paper with zero margins (content touching the page edges). The geometry is
 * therefore declared twice: as an `@page` rule for Android and as native
 * printToFileAsync options for iOS, both derived from the constants below so
 * the two platforms can never drift apart.
 */

/** A4 paper size in millimetres */
export const PAGE_SIZE_MM = { width: 210, height: 297 };

/** Page margins in millimetres (matches the historical @page rule) */
export const PAGE_MARGIN_MM = { top: 18, bottom: 18, left: 16, right: 16 };

const POINTS_PER_MM = 72 / 25.4;

/** Convert millimetres to PDF points (1pt = 1/72 inch), rounded */
export function mmToPoints(mm: number): number {
  return Math.round(mm * POINTS_PER_MM);
}

/** `@page` rule for renderers that honor it (Android WebView) */
export const PAGE_CSS = `@page { size: A4; margin: ${PAGE_MARGIN_MM.top}mm ${PAGE_MARGIN_MM.right}mm ${PAGE_MARGIN_MM.bottom}mm ${PAGE_MARGIN_MM.left}mm; }`;

/**
 * Extra options for expo-print's printToFileAsync. iOS needs the page size
 * and margins passed natively because it ignores `@page`; Android picks the
 * same geometry up from the CSS, so it gets no overrides.
 */
export function getPrintFileOptions(platform: string = Platform.OS): Print.FilePrintOptions {
  if (platform !== 'ios') return {};
  return {
    width: mmToPoints(PAGE_SIZE_MM.width),
    height: mmToPoints(PAGE_SIZE_MM.height),
    margins: {
      top: mmToPoints(PAGE_MARGIN_MM.top),
      right: mmToPoints(PAGE_MARGIN_MM.right),
      bottom: mmToPoints(PAGE_MARGIN_MM.bottom),
      left: mmToPoints(PAGE_MARGIN_MM.left),
    },
  };
}
