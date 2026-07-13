import { shiftDateStr } from './date';

export type Recurrence = 'once' | 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new Error(`Некорректная дата: ${dateStr}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const maxDay = new Date(year, month, 0).getDate();
  if (month < 1 || month > 12 || day < 1 || day > maxDay) {
    throw new Error(`Некорректная дата: ${dateStr}`);
  }
  return { year, month, day };
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthsPerPeriod(recurrence: Recurrence): number {
  if (recurrence === 'monthly') return 1;
  if (recurrence === 'quarterly') return 3;
  if (recurrence === 'semiannual') return 6;
  if (recurrence === 'yearly') return 12;
  throw new Error(`Некорректный период повторения: ${String(recurrence)}`);
}

/**
 * Returns an occurrence relative to the original due date. Reusing the
 * original day is important: Jan 31 -> Feb 28 -> Mar 31, not Mar 28.
 */
export function recurrenceOccurrence(
  anchorDate: string,
  recurrence: Recurrence,
  occurrence: number,
): string {
  if (!Number.isInteger(occurrence) || occurrence < 0) {
    throw new Error('Номер повторения должен быть целым неотрицательным числом');
  }
  parseDate(anchorDate);
  if (occurrence === 0 || recurrence === 'once') return anchorDate;
  if (recurrence === 'weekly') return shiftDateStr(anchorDate, occurrence * 7);

  const { year, month, day } = parseDate(anchorDate);
  const absoluteMonth = year * 12 + (month - 1) + monthsPerPeriod(recurrence) * occurrence;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonthZero = absoluteMonth % 12;
  const targetDay = Math.min(day, new Date(targetYear, targetMonthZero + 1, 0).getDate());
  return formatDate(targetYear, targetMonthZero + 1, targetDay);
}

/** Advance one calendar-aware recurrence period. */
export function nextDueDate(dateStr: string, recurrence: Recurrence): string {
  return recurrenceOccurrence(dateStr, recurrence, 1);
}

/**
 * Find the first occurrence after today, anchored to the stored due date.
 * This catches up overdue payments without moving their calendar anchor.
 */
export function nextFutureDueDate(
  dueDate: string,
  recurrence: Exclude<Recurrence, 'once'>,
  today: string,
): string {
  parseDate(dueDate);
  parseDate(today);
  let occurrence = 1;
  let candidate = recurrenceOccurrence(dueDate, recurrence, occurrence);
  while (candidate <= today) {
    occurrence += 1;
    candidate = recurrenceOccurrence(dueDate, recurrence, occurrence);
  }
  return candidate;
}

/**
 * Advance a persisted payment schedule. The current due date prevents an
 * early mark from returning the same occurrence; the immutable anchor keeps
 * end-of-month intent across consecutive marks.
 */
export function nextAnchoredDueDate(
  anchorDate: string,
  currentDueDate: string,
  recurrence: Exclude<Recurrence, 'once'>,
  today: string,
): string {
  parseDate(anchorDate);
  parseDate(currentDueDate);
  parseDate(today);
  const after = currentDueDate > today ? currentDueDate : today;
  return nextFutureDueDate(anchorDate, recurrence, after);
}
