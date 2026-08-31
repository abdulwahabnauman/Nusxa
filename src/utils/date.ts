import { format, parse, isValid, startOfDay, endOfDay, addDays, differenceInDays, differenceInYears } from 'date-fns';
import { toEasternNumerals } from './numerals';

/** Format a date to YYYY-MM-DD */
export function formatDateISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Format a date to a human-readable string */
export function formatDateReadable(date: Date): string {
  return format(date, 'MMM d, yyyy');
}

/** Localized human-readable date from a YYYY-MM-DD string (audit UX3) */
export function formatDateLocalized(isoDate: string, locale = 'en-US'): string {
  const parsed = parse(isoDate, 'yyyy-MM-dd', new Date());
  if (!isValid(parsed)) return isoDate;
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
  } catch {
    return formatDateReadable(parsed);
  }
}

/** Format time string (HH:mm) to 12-hour format */
export function formatTime12h(time24: string, language: 'en' | 'ur' = 'en'): string {
  const [h, m] = time24.split(':').map(Number);
  if (h == null || m == null) return time24;
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const clock = `${hour12}:${String(m).padStart(2, '0')}`;
  if (language === 'ur') {
    // Fully-RTL token (Eastern digits + Urdu day-part word) so time ranges
    // don't get shuffled by bidi inside RTL sentences.
    return `${toEasternNumerals(clock)} ${urduDayPart(h)}`;
  }
  return `${clock} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Urdu day-part word from the 24h clock: morning / afternoon / evening */
function urduDayPart(hour24: number): string {
  if (hour24 < 12) return 'صبح';
  if (hour24 < 17) return 'دوپہر';
  return 'شام';
}

/** Add minutes to an HH:mm time, wrapping past midnight */
export function addMinutesToTime(time24: string, minutes: number): string {
  const [h, m] = time24.split(':').map(Number);
  if (h == null || m == null) return time24;
  const total = (h * 60 + m + minutes) % (24 * 60);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

/** 12-hour [start, end] pair for a reminder window (start time + window minutes) */
export function getTimeRangeParts(
  time24: string,
  windowMinutes: number,
  language: 'en' | 'ur' = 'en',
): [string, string] {
  return [formatTime12h(time24, language), formatTime12h(addMinutesToTime(time24, windowMinutes), language)];
}

/** Get today's date string in ISO format */
export function getTodayISO(): string {
  return formatDateISO(new Date());
}

/** Get start and end of today as tuple for adherence stats */
export function getTodayRange(): [string, string] {
  const now = new Date();
  return [
    format(startOfDay(now), "yyyy-MM-dd'T'HH:mm:ss"),
    format(endOfDay(now), "yyyy-MM-dd'T'HH:mm:ss"),
  ];
}

/** Get date range for the last N days */
export function getDateRange(days: number): { start: string; end: string } {
  const now = new Date();
  const start = addDays(now, -days);
  return {
    start: format(startOfDay(start), "yyyy-MM-dd'T'HH:mm:ss"),
    end: format(endOfDay(now), "yyyy-MM-dd'T'HH:mm:ss"),
  };
}

/** Get the last 7 days with label and ISO date (weekday labels localized) */
export function getLast7Days(locale = 'en-US'): { label: string; iso: string }[] {
  const days: { label: string; iso: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(new Date(), -i);
    days.push({
      label: d.toLocaleDateString(locale, { weekday: 'short' }),
      iso: formatDateISO(d),
    });
  }
  return days;
}

/** ISO date string for N days before today */
export function getDaysAgoISO(days: number): string {
  return formatDateISO(addDays(new Date(), -days));
}

/** Check if a date string is valid */
export function isValidDate(dateStr: string): boolean {
  const parsed = parse(dateStr, 'yyyy-MM-dd', new Date());
  return isValid(parsed);
}

/** Whole-year age from a YYYY-MM-DD date of birth, or null when unparseable */
export function calculateAge(dateOfBirth: string): number | null {
  const dob = parse(dateOfBirth, 'yyyy-MM-dd', new Date());
  if (!isValid(dob)) return null;
  return differenceInYears(new Date(), dob);
}

/** Get device timezone */
export function getTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Calculate days remaining in a treatment based on start date and duration */
export function calculateDaysRemaining(startDate: string, durationDays: number): number {
  const start = parse(startDate, 'yyyy-MM-dd', new Date());
  if (!isValid(start)) return 0;
  const end = addDays(start, durationDays);
  const remaining = differenceInDays(end, new Date());
  return Math.max(0, remaining);
}
