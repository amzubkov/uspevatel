import {
  calendarDayDiff,
  canonicalWeekStart,
  isValidDateStr,
  isValidTimeStr,
  parseLocalDate,
  parseStoredDate,
  startOfLocalWeek,
  startOfLocalWeekStr,
  toDateStr,
} from '../date';
import {
  calculateCorrectionAmount,
  filterAlreadyImportedTransactions,
  recurringPaymentTransactionId,
  timestampForEditedDate,
} from '../moneyLogic';
import { nextAnchoredDueDate, nextDueDate, nextFutureDueDate, recurrenceOccurrence } from '../recurrence';
import { normalizeWorkoutPlan } from '../aiValidation';
import { safeFileExtension } from '../files';

describe('local calendar logic', () => {
  it('uses the previous Monday when called on Sunday', () => {
    const sunday = new Date(2026, 6, 12, 18, 30);
    expect(toDateStr(startOfLocalWeek(sunday))).toBe('2026-07-06');
    expect(startOfLocalWeekStr(sunday)).toBe('2026-07-06');
  });

  it('keeps Monday as the start of its own week', () => {
    expect(startOfLocalWeekStr(new Date(2026, 6, 13, 1, 0))).toBe('2026-07-13');
  });

  it('rejects impossible model-provided dates and times', () => {
    expect(isValidDateStr('2026-02-29')).toBe(false);
    expect(isValidDateStr('2024-02-29')).toBe(true);
    expect(isValidTimeStr('24:00')).toBe(false);
    expect(isValidTimeStr('23:59')).toBe(true);
  });

  it('parses date-only values locally and compares calendar days across DST', () => {
    const monday = parseLocalDate('2026-07-13');
    expect([monday.getFullYear(), monday.getMonth(), monday.getDate(), monday.getDay()])
      .toEqual([2026, 6, 13, 1]);
    expect(calendarDayDiff('2026-03-30', '2026-03-28')).toBe(2);
  });

  it('keeps ISO timestamps while parsing date-only values locally', () => {
    expect(parseStoredDate('2026-07-13').getHours()).toBe(0);
    expect(parseStoredDate('2026-07-13T19:59:00.000Z').toISOString()).toBe('2026-07-13T19:59:00.000Z');
  });

  it('canonicalizes legacy UTC and local week keys to the same Monday', () => {
    const legacyUtcKey = new Date(2026, 6, 6, 0, 0, 0, 0).toISOString();
    expect(canonicalWeekStart(legacyUtcKey)).toBe('2026-07-06T00:00:00');
    expect(canonicalWeekStart('2026-07-06T00:00:00')).toBe('2026-07-06T00:00:00');
  });
});

describe('calendar-clamped recurrence', () => {
  it('clamps the end of month and preserves the original anchor afterwards', () => {
    expect(nextDueDate('2025-01-31', 'monthly')).toBe('2025-02-28');
    expect(recurrenceOccurrence('2025-01-31', 'monthly', 2)).toBe('2025-03-31');
  });

  it('handles leap-day yearly payments', () => {
    expect(nextDueDate('2024-02-29', 'yearly')).toBe('2025-02-28');
  });

  it('catches up overdue payments from their due-date anchor', () => {
    expect(nextFutureDueDate('2025-01-31', 'monthly', '2025-03-05')).toBe('2025-03-31');
    expect(nextFutureDueDate('2025-01-06', 'weekly', '2025-01-20')).toBe('2025-01-27');
  });

  it('preserves a persisted month-end anchor across consecutive marks', () => {
    const anchor = '2025-01-31';
    const february = nextAnchoredDueDate(anchor, anchor, 'monthly', '2025-01-31');
    const march = nextAnchoredDueDate(anchor, february, 'monthly', '2025-02-28');
    const april = nextAnchoredDueDate(anchor, march, 'monthly', '2025-03-31');

    expect([february, march, april]).toEqual(['2025-02-28', '2025-03-31', '2025-04-30']);
    expect(nextAnchoredDueDate(february, february, 'monthly', february)).toBe('2025-03-28');
  });
});

describe('ledger idempotency', () => {
  it('calculates a correction without counting an existing correction', () => {
    const transactions = [
      { amount: 80, isCorrection: false },
      { amount: 20, isCorrection: true },
    ];
    expect(calculateCorrectionAmount(100, transactions)).toBe(20);
    expect(calculateCorrectionAmount(100, transactions)).toBe(20);
  });

  it('uses a stable id for a recurring-payment occurrence', () => {
    expect(recurringPaymentTransactionId('abc', '2026-07-13'))
      .toBe(recurringPaymentTransactionId('abc', '2026-07-13'));
    expect(recurringPaymentTransactionId('abc', '2026-07-14'))
      .not.toBe(recurringPaymentTransactionId('abc', '2026-07-13'));
  });

  it('preserves legitimate identical statement rows and is idempotent as a multiset', () => {
    const twin = { date: '2026-07-13', timestamp: '2026-07-13T15:30:00', amount: -100, comment: 'Кофе' };
    const statement = [{ ...twin }, { ...twin }];

    expect(filterAlreadyImportedTransactions([], statement)).toHaveLength(2);
    expect(filterAlreadyImportedTransactions([twin], statement)).toHaveLength(1);
    expect(filterAlreadyImportedTransactions(statement, statement)).toHaveLength(0);
  });

  it('keeps the imported clock time when an edited transaction changes date', () => {
    expect(timestampForEditedDate('2026-07-13', '2026-07-13T15:30:45', '2026-07-14'))
      .toBe('2026-07-14T15:30:45');
    expect(timestampForEditedDate('2026-07-13', '2026-07-13T15:30:45', '2026-07-13'))
      .toBeUndefined();
  });
});

describe('AI runtime validation', () => {
  it('keeps only known exercises with safe numeric ranges', () => {
    const plan = normalizeWorkoutPlan({
      summary: 'План',
      items: [
        { exerciseId: 1, sets: 3, reps: 8, weight: 70, reason: 'База' },
        { exerciseId: 2, sets: 0, reps: 8, weight: 10, reason: 'Неверные подходы' },
        { exerciseId: 999, sets: 3, reps: 8, weight: 10, reason: 'Выдуманный id' },
        { exerciseId: 1, sets: 4, reps: 10, weight: 60, reason: 'Дубликат' },
      ],
    }, new Set([1, 2]));

    expect(plan).toEqual({
      summary: 'План',
      items: [{ exerciseId: 1, sets: 3, reps: 8, weight: 70, reason: 'База' }],
    });
  });
});

describe('managed file names', () => {
  it('keeps only short alphanumeric extensions', () => {
    expect(safeFileExtension('report.PDF')).toBe('pdf');
    expect(safeFileExtension('content://picker/photo.jpg?token=1', 'jpg')).toBe('jpg');
    expect(safeFileExtension('photo.jpg/../../database', 'jpg')).toBe('jpg');
    expect(safeFileExtension('file.%2F..%2Fsecret', 'bin')).toBe('bin');
  });
});
