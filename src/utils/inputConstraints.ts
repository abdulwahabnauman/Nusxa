/** Character-class constraints for the shared Input component, applied at the
 *  component boundary so every form filters the same way without per-screen
 *  regexes. Eastern Arabic digits (Urdu/Persian and Arabic-Indic keyboards)
 *  are normalized to ASCII because DB validation and schedule math expect
 *  ASCII digits. */
export type InputConstraint = 'numeric' | 'alpha' | 'time' | 'date' | 'phone';

const EASTERN_DIGIT_MAP: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

const normalizeDigits = (text: string): string =>
  text.replace(/[۰-۹٠-٩]/g, (d) => EASTERN_DIGIT_MAP[d] ?? d);

export function applyInputConstraint(text: string, constraint: InputConstraint): string {
  const normalized = normalizeDigits(text);
  switch (constraint) {
    case 'numeric':
      return normalized.replace(/[^0-9]/g, '');
    case 'alpha':
      // Person/place names: never digits; letters from any script pass through.
      return normalized.replace(/[0-9]/g, '');
    case 'time':
      return normalized.replace(/[^0-9:]/g, '');
    case 'date':
      return normalized.replace(/[^0-9\-/.]/g, '');
    case 'phone':
      return normalized.replace(/[^0-9+\s\-()]/g, '');
  }
}
