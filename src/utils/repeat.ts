import type { Schedule } from '../types/models';

/**
 * Recurrence helpers for schedules that are not taken every day.
 *
 * A schedule's repeat is stored as two columns:
 * - `days_of_week`: CSV of weekday numbers (0 = Sunday … 6 = Saturday).
 *   Empty/NULL means "any weekday".
 * - `interval_days`: minimum spacing between doses (1 = daily, 2 = alternate
 *   days, 7 = weekly, …). Ignored when `days_of_week` is set.
 */

export type RepeatKind = 'daily' | 'weekdays' | 'interval';

export interface RepeatPattern {
  kind: RepeatKind;
  daysOfWeek: number[];
  intervalDays: number;
}

/** Weekday indexes in display order (Sunday first, matching JS getDay) */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function normalizeDaysOfWeek(days: number[] | null | undefined): number[] {
  if (!days) return [];
  return [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
    (a, b) => a - b,
  );
}

/** DB representation: null when the medicine runs every day */
export function serializeDaysOfWeek(days: number[] | null | undefined): string | null {
  const normalized = normalizeDaysOfWeek(days);
  if (normalized.length === 0 || normalized.length === 7) return null;
  return normalized.join(',');
}

export function parseDaysOfWeek(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return normalizeDaysOfWeek(raw.split(',').map((v) => parseInt(v, 10)));
}

/** Whole days between two YYYY-MM-DD dates, immune to DST shifts */
export function daysBetweenISO(startISO: string, endISO: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((toUtc(endISO) - toUtc(startISO)) / 86_400_000);
}

export function weekdayOfISO(dateISO: string): number {
  const [y, m, d] = dateISO.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

export function isDailyRepeat(
  daysOfWeek: number[] | null | undefined,
  intervalDays: number | null | undefined,
): boolean {
  return normalizeDaysOfWeek(daysOfWeek).length === 0 && Math.max(1, intervalDays ?? 1) === 1;
}

export interface OccurrenceRule {
  startDate: string;
  endDate?: string | null;
  daysOfWeek?: number[] | null;
  intervalDays?: number | null;
}

/** Whether a schedule with this recurrence is due on the given date */
export function occursOnDate(rule: OccurrenceRule, dateISO: string): boolean {
  const date = dateISO.slice(0, 10);
  if (date < rule.startDate.slice(0, 10)) return false;
  if (rule.endDate && date > rule.endDate.slice(0, 10)) return false;

  const days = normalizeDaysOfWeek(rule.daysOfWeek);
  if (days.length > 0) {
    return days.includes(weekdayOfISO(date));
  }

  const interval = Math.max(1, rule.intervalDays ?? 1);
  if (interval > 1) {
    const diff = daysBetweenISO(rule.startDate, date);
    return diff >= 0 && diff % interval === 0;
  }
  return true;
}

export function scheduleOccursOn(schedule: Schedule, dateISO: string): boolean {
  return occursOnDate(
    {
      startDate: schedule.start_date,
      endDate: schedule.end_date,
      daysOfWeek: parseDaysOfWeek(schedule.days_of_week),
      intervalDays: schedule.interval_days,
    },
    dateISO,
  );
}

/** How many times a single time-slot schedule fires in a week */
export function occurrencesPerWeek(
  daysOfWeek: number[] | null | undefined,
  intervalDays: number | null | undefined,
): number {
  const days = normalizeDaysOfWeek(daysOfWeek);
  if (days.length > 0) return days.length;
  return 7 / Math.max(1, intervalDays ?? 1);
}

/** Repeat pattern from a saved schedule row */
export function repeatFromSchedule(
  schedule: Pick<Schedule, 'days_of_week' | 'interval_days'>,
): RepeatPattern {
  const daysOfWeek = parseDaysOfWeek(schedule.days_of_week);
  const intervalDays = Math.max(1, schedule.interval_days ?? 1);
  return {
    kind: daysOfWeek.length > 0 ? 'weekdays' : intervalDays > 1 ? 'interval' : 'daily',
    daysOfWeek,
    intervalDays,
  };
}

/** Next `daysAhead` dates (including today) on which the rule fires */
export function occurrenceDates(
  rule: OccurrenceRule,
  fromISO: string,
  daysAhead: number,
): string[] {
  const out: string[] = [];
  const [y, m, d] = fromISO.split('-').map(Number);
  const start = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));

  for (let i = 0; i <= daysAhead; i++) {
    const day = new Date(start.getTime() + i * 86_400_000);
    const iso = day.toISOString().slice(0, 10);
    if (occursOnDate(rule, iso)) out.push(iso);
  }
  return out;
}

/** Ordered short weekday labels for the locale (index 0 = Sunday) */
export function weekdayShortLabels(locale = 'en-US'): string[] {
  // 2024-01-07 is a Sunday — a fixed anchor week keeps indexes stable.
  try {
    return WEEKDAYS.map((_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
        new Date(Date.UTC(2024, 0, 7 + i)),
      ),
    );
  } catch {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  }
}

const DAILY_COUNT_LABELS: Record<'en' | 'ur', string[]> = {
  en: ['Once daily', 'Twice daily', 'Three times daily', 'Four times daily'],
  ur: ['روزانہ ایک بار', 'روزانہ دو بار', 'روزانہ تین بار', 'روزانہ چار بار'],
};

/**
 * Human label stored as `schedules.frequency` so the detail screen can show
 * "Mon, Wed" or "Every other day" — frequency alone (e.g. "Once weekly")
 * loses which day the user picked.
 */
export function repeatFrequencyLabel(
  daysOfWeek: number[] | null | undefined,
  intervalDays: number | null | undefined,
  timesPerDay: number,
  language: 'en' | 'ur' = 'en',
): string {
  const days = normalizeDaysOfWeek(daysOfWeek);
  if (days.length > 0) {
    const labels = weekdayShortLabels(language === 'ur' ? 'ur-PK' : 'en-US');
    return days.map((d) => labels[d]).join(', ');
  }

  const interval = Math.max(1, intervalDays ?? 1);
  if (interval === 1) {
    const labels = DAILY_COUNT_LABELS[language];
    const index = Math.min(Math.max(timesPerDay, 1), 4) - 1;
    return labels[index] ?? labels[0]!;
  }
  if (interval === 2) return language === 'ur' ? 'ہر دوسرے دن' : 'Every other day';
  if (interval === 7) return language === 'ur' ? 'ہفتے میں ایک بار' : 'Once weekly';
  return language === 'ur' ? `ہر ${interval} دن بعد` : `Every ${interval} days`;
}

/** Short chip label, e.g. "Mon, Wed" or "Every 2 days" */
export function repeatShortLabel(
  pattern: RepeatPattern,
  language: 'en' | 'ur' = 'en',
): string {
  if (pattern.kind === 'weekdays' && pattern.daysOfWeek.length > 0) {
    const labels = weekdayShortLabels(language === 'ur' ? 'ur-PK' : 'en-US');
    return pattern.daysOfWeek.map((d) => labels[d]).join(', ');
  }
  if (pattern.kind === 'interval' && pattern.intervalDays > 1) {
    if (pattern.intervalDays === 2) return language === 'ur' ? 'ہر دوسرے دن' : 'Every other day';
    return language === 'ur'
      ? `ہر ${pattern.intervalDays} دن بعد`
      : `Every ${pattern.intervalDays} days`;
  }
  return language === 'ur' ? 'روزانہ' : 'Every day';
}
