import {
  parseLine,
  matchExerciseExact,
  matchDailyType,
  buildSets,
  groupSets,
  formatSetsLabel,
  replaceLineExercise,
  getLastReps,
} from '../workoutParser';
import type { Exercise, WorkoutLog } from '../../store/exerciseStore';

const ex = (id: number, name: string, weightType = 100): Exercise => ({
  id, name, weightType,
  description: null, imageUri: null, imageBase64: null,
  orderNum: 0, tag: null, caloriesPerRep: 0, priority: 5,
  mediaType: 'photo', isPreset: false,
});

const CATALOG: Exercise[] = [
  ex(1, 'Жим лежа', 100),
  ex(2, 'Жим лёжа средним хватом', 10),
  ex(3, 'Присед классический', 100),
  ex(4, 'Планка на локтях', 0),
  ex(5, 'Румынская тяга (RDL)', 100),
];

describe('parseLine', () => {
  it('parses "name weights (reps)" into nums and reps', () => {
    const p = parseLine('Жим лежа 60-70-75 (10-8-6)', 0, CATALOG)!;
    expect(p.matched?.id).toBe(1);
    expect(p.nums).toEqual([60, 70, 75]);
    expect(p.reps).toEqual([10, 8, 6]);
    expect(p.hasNumbers).toBe(true);
  });

  it('accepts comma as decimal separator', () => {
    const p = parseLine('Жим лежа 62,5 (8)', 0, CATALOG)!;
    expect(p.nums).toEqual([62.5]);
  });

  it('strips list prefixes like "1." and "2)"', () => {
    const p = parseLine('2) Жим лежа 100 (5)', 0, CATALOG)!;
    expect(p.matched?.id).toBe(1);
    expect(p.nums).toEqual([100]);
  });

  it('KNOWN QUIRK: "присед <anything>" is captured by the daily alias, not the catalog', () => {
    const p = parseLine('Присед классический 100 (5)', 0, CATALOG)!;
    expect(p.matchedDaily).toBe('squats');
    expect(p.matched).toBeNull();
  });

  it('routes daily aliases to matchedDaily, not exercises', () => {
    const p = parseLine('подтягивания 10-10-8', 0, CATALOG)!;
    expect(p.matchedDaily).toBe('pullups');
    expect(p.matched).toBeNull();
    expect(p.nums).toEqual([10, 10, 8]);
  });

  it('daily alias wins over catalog exercise with same prefix', () => {
    // "присед" is a daily alias even though catalog has "Присед классический"
    const p = parseLine('присед 20', 0, CATALOG)!;
    expect(p.matchedDaily).toBe('squats');
  });

  it('returns candidates when no exact match', () => {
    const p = parseLine('жимм 50', 0, CATALOG)!;
    expect(p.matched).toBeNull();
    expect(p.candidates.length).toBeGreaterThan(0);
  });

  it('returns null for empty lines', () => {
    expect(parseLine('   ', 0, CATALOG)).toBeNull();
  });
});

describe('matchExerciseExact', () => {
  it('prefers exact over startsWith over includes', () => {
    expect(matchExerciseExact('жим лежа', CATALOG)?.id).toBe(1);
    expect(matchExerciseExact('жим лёжа средним', CATALOG)?.id).toBe(2);
    expect(matchExerciseExact('классический', CATALOG)?.id).toBe(3);
  });
});

describe('matchDailyType', () => {
  it('matches only whole word or word boundary', () => {
    expect(matchDailyType('бег')).toBe('run');
    expect(matchDailyType('бегемот')).toBeNull();
    expect(matchDailyType('вода 500')).toBe('water');
  });
});

describe('buildSets', () => {
  it('pads missing reps with the last given, then default', () => {
    const p = parseLine('Жим лежа 60-70-75 (10-8)', 0, CATALOG)!;
    expect(buildSets(p, 12)).toEqual([
      { weight: 60, reps: 10 },
      { weight: 70, reps: 8 },
      { weight: 75, reps: 8 },
    ]);
  });

  it('uses defaultReps when no reps given', () => {
    const p = parseLine('Жим лежа 60-60', 0, CATALOG)!;
    expect(buildSets(p, 12)).toEqual([
      { weight: 60, reps: 12 },
      { weight: 60, reps: 12 },
    ]);
  });

  it('treats numbers as reps for bodyweight exercises', () => {
    const p = parseLine('Планка на локтях 40-45', 0, CATALOG)!;
    expect(buildSets(p, 10)).toEqual([
      { weight: 0, reps: 40 },
      { weight: 0, reps: 45 },
    ]);
  });
});

describe('groupSets / formatSetsLabel', () => {
  it('groups consecutive identical sets', () => {
    expect(groupSets([
      { weight: 70, reps: 8 }, { weight: 70, reps: 8 }, { weight: 75, reps: 6 },
    ])).toEqual([
      { weight: 70, reps: 8, count: 2 },
      { weight: 75, reps: 6, count: 1 },
    ]);
  });

  it('formats same-reps compactly', () => {
    const label = formatSetsLabel([{ weight: 70, reps: 8 }, { weight: 70, reps: 8 }], 100);
    expect(label).toBe('70кг×2 (8 повт.)');
  });
});

describe('replaceLineExercise', () => {
  it('swaps the exercise name and keeps numbers and prefix', () => {
    const text = '1. жимм 60-70 (10-8)\nприсед 20';
    const out = replaceLineExercise(text, 0, CATALOG[0]);
    expect(out.split('\n')[0]).toBe('1. Жим лежа 60-70 (10-8)');
    expect(out.split('\n')[1]).toBe('присед 20');
  });
});

describe('getLastReps', () => {
  it('takes reps of the most recent log or 10', () => {
    const logs: WorkoutLog[] = [
      { id: 2, exerciseId: 1, weight: 70, reps: 6, setNum: 1, date: '2026-07-05', createdAt: '' },
      { id: 1, exerciseId: 1, weight: 60, reps: 10, setNum: 1, date: '2026-07-01', createdAt: '' },
    ];
    expect(getLastReps(1, logs)).toBe(6);
    expect(getLastReps(99, logs)).toBe(10);
  });
});
