import {
  daysBetweenISO,
  occurrenceDates,
  occurrencesPerWeek,
  occursOnDate,
  parseDaysOfWeek,
  repeatFrequencyLabel,
  serializeDaysOfWeek,
  weekdayOfISO,
} from '../repeat';

describe('daysBetweenISO / weekdayOfISO', () => {
  it('counts whole days regardless of month boundaries', () => {
    expect(daysBetweenISO('2026-01-30', '2026-02-02')).toBe(3);
    expect(daysBetweenISO('2026-03-01', '2026-03-01')).toBe(0);
  });

  it('maps dates to JS weekday indexes', () => {
    expect(weekdayOfISO('2026-10-25')).toBe(0); // Sunday
    expect(weekdayOfISO('2026-10-27')).toBe(2); // Tuesday
  });
});

describe('weekday serialization', () => {
  it('round-trips a selected day set', () => {
    expect(serializeDaysOfWeek([5, 1, 3])).toBe('1,3,5');
    expect(parseDaysOfWeek('1,3,5')).toEqual([1, 3, 5]);
  });

  it('treats every day as null so daily rows stay compact', () => {
    expect(serializeDaysOfWeek([0, 1, 2, 3, 4, 5, 6])).toBeNull();
    expect(serializeDaysOfWeek([])).toBeNull();
  });
});

describe('occursOnDate', () => {
  const base = { startDate: '2026-10-01', endDate: null };

  it('runs every day for a daily rule', () => {
    expect(occursOnDate({ ...base, intervalDays: 1 }, '2026-10-27')).toBe(true);
  });

  it('only runs on selected weekdays', () => {
    const rule = { ...base, daysOfWeek: [1, 4] }; // Monday + Thursday
    expect(occursOnDate(rule, '2026-10-26')).toBe(true); // Monday
    expect(occursOnDate(rule, '2026-10-27')).toBe(false); // Tuesday
    expect(occursOnDate(rule, '2026-10-29')).toBe(true); // Thursday
  });

  it('spaces doses across the interval from the start date', () => {
    const rule = { ...base, intervalDays: 2 };
    expect(occursOnDate(rule, '2026-10-01')).toBe(true);
    expect(occursOnDate(rule, '2026-10-02')).toBe(false);
    expect(occursOnDate(rule, '2026-10-03')).toBe(true);
    expect(occursOnDate(rule, '2026-10-07')).toBe(true);
  });

  it('respects start and end bounds', () => {
    const rule = { startDate: '2026-10-10', endDate: '2026-10-20', intervalDays: 1 };
    expect(occursOnDate(rule, '2026-10-09')).toBe(false);
    expect(occursOnDate(rule, '2026-10-21')).toBe(false);
    expect(occursOnDate(rule, '2026-10-15')).toBe(true);
  });
});

describe('occurrenceDates', () => {
  it('lists upcoming weekly occurrences including today', () => {
    const dates = occurrenceDates(
      { startDate: '2026-10-01', endDate: null, daysOfWeek: [2] }, // Tuesdays
      '2026-10-27',
      14,
    );
    expect(dates).toEqual(['2026-10-27', '2026-11-03', '2026-11-10']);
  });
});

describe('occurrencesPerWeek', () => {
  it('converts day sets and intervals to weekly counts', () => {
    expect(occurrencesPerWeek([1, 3, 5], 1)).toBe(3);
    expect(occurrencesPerWeek([], 1)).toBe(7);
    expect(occurrencesPerWeek([], 2)).toBe(3.5);
    expect(occurrencesPerWeek([], 7)).toBe(1);
  });
});

describe('repeatFrequencyLabel', () => {
  it('labels daily, weekday and interval schedules', () => {
    expect(repeatFrequencyLabel([], 1, 2)).toBe('Twice daily');
    expect(repeatFrequencyLabel([], 2, 1)).toBe('Every other day');
    expect(repeatFrequencyLabel([], 7, 1)).toBe('Once weekly');
    expect(repeatFrequencyLabel([1, 3], 1, 1)).toBe('Mon, Wed');
  });
});
