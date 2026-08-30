/**
 * Unit tests for src/utils/inventory.ts — stock math that drives the
 * low-stock banners and refill estimates on the medicine detail screen.
 */
import {
  calculateRemaining,
  estimateDaysUntilRefill,
  parseDurationToDays,
  frequencyToDailyCount,
  estimateDaysUntilRefillFromFrequency,
} from '../inventory';

describe('calculateRemaining', () => {
  it('subtracts daily consumption over elapsed days', () => {
    expect(calculateRemaining(30, 3, 5)).toBe(15);
  });

  it('never goes below zero', () => {
    expect(calculateRemaining(10, 2, 100)).toBe(0);
  });

  it('returns the full quantity before any days elapse', () => {
    expect(calculateRemaining(28, 2, 0)).toBe(28);
  });
});

describe('estimateDaysUntilRefill', () => {
  it('floors the division of stock by daily use', () => {
    expect(estimateDaysUntilRefill(10, 3)).toBe(3);
  });

  it('returns null when consumption is zero (PRN medicines)', () => {
    expect(estimateDaysUntilRefill(10, 0)).toBeNull();
  });

  it('returns null when nothing is left', () => {
    expect(estimateDaysUntilRefill(0, 2)).toBeNull();
  });
});

describe('parseDurationToDays', () => {
  it.each([
    ['7 days', 7],
    ['1 day', 1],
    ['2 weeks', 14],
    ['1 month', 30],
    ['3 months', 90],
    ['10d', 10],
    ['5', 5],
  ])('parses "%s" as %i days', (input, expected) => {
    expect(parseDurationToDays(input)).toBe(expected);
  });

  it('returns null for empty or unparseable input', () => {
    expect(parseDurationToDays('')).toBeNull();
    expect(parseDurationToDays('until finished')).toBeNull();
  });
});

describe('frequencyToDailyCount', () => {
  it.each([
    ['Once daily', 1],
    ['Twice daily', 2],
    ['BID', 2],
    ['Three times a day', 3],
    ['TDS', 3],
    ['Four times daily', 4],
    ['QID', 4],
    ['Every 8 hours', 3],
    ['Every 4 hours', 6],
    ['At bedtime', 1],
    ['2 times daily', 2],
    ['3x per day', 3],
  ])('maps "%s" to %i doses/day', (input, expected) => {
    expect(frequencyToDailyCount(input)).toBe(expected);
  });

  it('treats as-needed (PRN/SOS) as zero daily doses', () => {
    expect(frequencyToDailyCount('As needed')).toBe(0);
    expect(frequencyToDailyCount('PRN')).toBe(0);
  });

  it('defaults unknown or null frequencies to once daily', () => {
    expect(frequencyToDailyCount(null)).toBe(1);
    expect(frequencyToDailyCount('whenever')).toBe(1);
  });
});

describe('estimateDaysUntilRefillFromFrequency', () => {
  it('combines frequency parsing with stock math', () => {
    // 30 tablets at three times daily → 10 days
    expect(estimateDaysUntilRefillFromFrequency(30, 'Three times daily')).toBe(10);
  });

  it('never estimates for PRN medicines regardless of stock', () => {
    expect(estimateDaysUntilRefillFromFrequency(30, 'As needed')).toBeNull();
  });
});
