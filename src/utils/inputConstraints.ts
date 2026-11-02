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

/** Ceiling per field class, generous enough for real data but small enough to
 *  keep a stuck/pasted value from becoming unreadable (e.g. "82888828282" in
 *  a HH:MM field). Enforced here as well as via maxLength because paste and
 *  autofill can bypass the native limit on some Android keyboards. */
const MAX_LENGTH: Record<InputConstraint, number> = {
  numeric: 6,
  alpha: 60,
  time: 5,
  date: 10,
  phone: 20,
};

export const maxLengthFor = (constraint: InputConstraint): number => MAX_LENGTH[constraint];

/** Cap for free-text fields (medicine names, hospital, allergies, …) that have
 *  no character-class constraint but still should not grow without bound. */
export const DEFAULT_TEXT_MAX_LENGTH = 120;

export function applyInputConstraint(text: string, constraint: InputConstraint): string {
  const limit = maxLengthFor(constraint);
  const normalized = normalizeDigits(text);
  switch (constraint) {
    case 'numeric':
      return normalized.replace(/[^0-9]/g, '').slice(0, limit);
    case 'alpha':
      // Person/place names: never digits; letters from any script pass through.
      return normalized.replace(/[0-9]/g, '').slice(0, limit);
    case 'time':
      return normalized.replace(/[^0-9:]/g, '').slice(0, limit);
    case 'date':
      return normalized.replace(/[^0-9\-/.]/g, '').slice(0, limit);
    case 'phone':
      return normalized.replace(/[^0-9+\s\-()]/g, '').slice(0, limit);
  }
}
