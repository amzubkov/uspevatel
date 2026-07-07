// Shared date helpers. All date strings are LOCAL-timezone YYYY-MM-DD —
// never toISOString().slice(): that flips the day near midnight.

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, d + days));
}

// Indexed by Date.getDay() (Sunday-first)
export const WEEKDAYS_SUN = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const WEEKDAYS_SUN_LOWER = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
// Calendar-grid order (Monday-first)
export const WEEKDAYS_MON = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
