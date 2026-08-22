/** Calculate remaining quantity based on initial quantity and daily consumption */
export function calculateRemaining(
  initialQuantity: number,
  dailyConsumption: number,
  daysSinceStart: number
): number {
  const consumed = dailyConsumption * daysSinceStart;
  return Math.max(0, initialQuantity - consumed);
}

/** Estimate days until medicine runs out */
export function estimateDaysUntilRefill(
  remainingQuantity: number,
  dailyConsumption: number
): number | null {
  if (dailyConsumption <= 0 || remainingQuantity <= 0) return null;
  return Math.floor(remainingQuantity / dailyConsumption);
}

/** Parse duration string to number of days */
export function parseDurationToDays(duration: string): number | null {
  if (!duration) return null;
  const lower = duration.toLowerCase().trim();

  // Match patterns like "7 days", "2 weeks", "1 month"
  const dayMatch = lower.match(/(\d+)\s*(day|days|d)/);
  if (dayMatch) return parseInt(dayMatch[1]!, 10);

  const weekMatch = lower.match(/(\d+)\s*(week|weeks|w)/);
  if (weekMatch) return parseInt(weekMatch[1]!, 10) * 7;

  const monthMatch = lower.match(/(\d+)\s*(month|months|m)/);
  if (monthMatch) return parseInt(monthMatch[1]!, 10) * 30;

  // Try to parse as just a number (assume days)
  const numOnly = parseInt(lower, 10);
  return isNaN(numOnly) ? null : numOnly;
}

/** Convert a frequency string to daily dose count */
export function frequencyToDailyCount(frequency: string | null): number {
  if (!frequency) return 1;
  const lower = frequency.toLowerCase().trim();

  if (lower.includes('four') || lower.includes('qid') || lower.includes('qds') || lower.includes('every 6 hour')) return 4;
  if (lower.includes('three') || lower.includes('tid') || lower.includes('tds') || lower.includes('every 8 hour')) return 3;
  if (lower.includes('twice') || lower.includes('bid') || lower.includes('every 12 hour')) return 2;
  if (lower.includes('every 4 hour')) return 6;
  if (lower.includes('once') || lower.includes('od') || lower.includes('bedtime') || lower.includes('morning') || lower.includes('night')) return 1;
  if (lower.includes('as needed') || lower.includes('prn') || lower.includes('sos')) return 0;

  // Try to parse "X times daily" or "X/day"
  const timesMatch = lower.match(/(\d+)\s*(?:times?|x)\s*(?:daily|per day|\/day)/);
  if (timesMatch) return parseInt(timesMatch[1]!, 10);

  return 1; // Default to once daily
}

/** Estimate days until refill using frequency string */
export function estimateDaysUntilRefillFromFrequency(
  remainingQuantity: number,
  frequency: string | null
): number | null {
  const dailyCount = frequencyToDailyCount(frequency);
  return estimateDaysUntilRefill(remainingQuantity, dailyCount);
}
