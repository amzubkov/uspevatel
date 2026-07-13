// Shared date helpers. All date strings are LOCAL-timezone YYYY-MM-DD —
// never toISOString().slice(): that flips the day near midnight.

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

/** Parse a date-only value at local midnight instead of treating it as UTC. */
export function parseLocalDate(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return new Date(Number.NaN);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Parse mixed legacy values: local date-only keys or real ISO timestamps. */
export function parseStoredDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseLocalDate(value) : new Date(value);
}

export function isValidDateStr(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = parseLocalDate(value);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isValidTimeStr(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return !!match && Number(match[1]) < 24 && Number(match[2]) < 60;
}

export function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

/** Whole calendar-day difference, independent of clock time and DST length. */
export function calendarDayDiff(laterDate: string, earlierDate: string): number {
  if (!isValidDateStr(laterDate) || !isValidDateStr(earlierDate)) return Number.NaN;
  const [laterYear, laterMonth, laterDay] = laterDate.split('-').map(Number);
  const [earlierYear, earlierMonth, earlierDay] = earlierDate.split('-').map(Number);
  return Math.round(
    (Date.UTC(laterYear, laterMonth - 1, laterDay) - Date.UTC(earlierYear, earlierMonth - 1, earlierDay))
      / 86_400_000,
  );
}

/** Monday 00:00 in the caller's local timezone (including Sundays). */
export function startOfLocalWeek(date: Date = new Date()): Date {
  const result = new Date(date);
  const daysSinceMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday);
  result.setHours(0, 0, 0, 0);
  return result;
}

/** Stable local calendar key for week_stats; avoids a UTC day shift. */
export function startOfLocalWeekStr(date: Date = new Date()): string {
  return toDateStr(startOfLocalWeek(date));
}

/** Normalize both legacy UTC timestamps and current local keys to local Monday. */
export function canonicalWeekStart(value: string): string {
  const date = parseStoredDate(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Некорректное начало недели: ${value}`);
  return `${startOfLocalWeekStr(date)}T00:00:00`;
}

// Indexed by Date.getDay() (Sunday-first)
export const WEEKDAYS_SUN = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const WEEKDAYS_SUN_LOWER = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
// Calendar-grid order (Monday-first)
export const WEEKDAYS_MON = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
