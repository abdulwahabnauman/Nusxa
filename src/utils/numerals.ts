/**
 * Eastern Arabic (Urdu) numeral helpers.
 * When the user enables "Eastern Arabic numerals" in Settings, digits
 * throughout the app are rendered as ۰۱۲۳۴۵۶۷۸۹ instead of 0123456789.
 */

const EASTERN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** Convert every Western digit in a string/number to its Eastern Arabic form */
export function toEasternNumerals(value: string | number): string {
  return String(value).replace(/\d/g, (d) => EASTERN_DIGITS[Number(d)] ?? d);
}

/** Format a value, applying Eastern Arabic digits only when enabled */
export function formatDigits(value: string | number, useEastern: boolean): string {
  return useEastern ? toEasternNumerals(value) : String(value);
}
