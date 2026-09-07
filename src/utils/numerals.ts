/**
 * Eastern Arabic (Urdu) numeral helpers.
 * Numeral style follows the app language — Urdu always renders digits as
 * ۰۱۲۳۴۵۶۷۸۹ (the settings store derives `easternNumerals` from language).
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
