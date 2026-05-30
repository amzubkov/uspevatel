// Body-weight aware calorie estimates for exercises and daily sport activities.
// Formula basis: kcal = MET × bodyWeight(kg) × time(h).
// For rep-based exercises we precompute kcal per kg per rep using typical rep duration.

import { Exercise } from '../store/exerciseStore';
import { SportEntry } from '../store/sportStore';

// kcal per kg of body weight per rep, by exercise category.
// Pullup: MET 8.0, ~4s/rep    -> 8 × (4/3600) ≈ 0.0089 → real-world ≈ 0.005 (efficiency)
// Pushup/triceps: MET 8.0, ~3s -> 0.004
// Dips/parallel bars: same    -> 0.004
// Squat bodyweight: MET 5.0, ~3s -> 0.004
// Lunges: MET 5.0, ~4s        -> 0.005
// Abs/crunch: MET 3.8, ~2s    -> 0.003
// Burpee: MET 8.0, ~5s        -> 0.011
// Jumping jacks: MET 8.0, ~1s -> 0.0022 per rep
// Plank/static: not rep-based, skip
// Generic bodyweight calisthenics fallback: 0.004
const KCAL_PER_KG_REP_BODYWEIGHT_DEFAULT = 0.004;

interface NamePattern {
  re: RegExp;
  kcalPerKgRep: number;
}

const NAME_PATTERNS: NamePattern[] = [
  { re: /подтяг|pull[\s-]?up/i, kcalPerKgRep: 0.005 },
  { re: /бёрпи|бурпи|burpee/i, kcalPerKgRep: 0.011 },
  { re: /выпад|lunge/i, kcalPerKgRep: 0.005 },
  { re: /присед|squat/i, kcalPerKgRep: 0.004 },
  { re: /отжим|push[\s-]?up|жим\s*от\s*пола/i, kcalPerKgRep: 0.004 },
  { re: /брус|dip\b/i, kcalPerKgRep: 0.004 },
  { re: /трицепс|triceps/i, kcalPerKgRep: 0.004 },
  { re: /пресс|crunch|sit[\s-]?up|abs\b/i, kcalPerKgRep: 0.003 },
  { re: /планка|plank/i, kcalPerKgRep: 0 }, // static — not rep-based
  { re: /прыж|jumping[\s-]?jack/i, kcalPerKgRep: 0.0022 },
  { re: /бег\b|run\b/i, kcalPerKgRep: 0.005 }, // treadmill reps unusual; legacy
];

// Heuristic: figure out kcal per kg per rep from exercise name.
// Returns 0 if no match (caller falls back to flat caloriesPerRep).
export function inferKcalPerKgRep(ex: Pick<Exercise, 'name' | 'weightType'>): number {
  const name = ex.name || '';
  for (const p of NAME_PATTERNS) if (p.re.test(name)) return p.kcalPerKgRep;
  // Generic bodyweight assumption if no per-rep weight is tracked.
  if (ex.weightType === 0) return KCAL_PER_KG_REP_BODYWEIGHT_DEFAULT;
  return 0;
}

// Physics-based kcal per kg of lifted weight per rep for weighted exercises.
// W_lift = m × g × h  (h = 0.4 m typical amplitude)
// Eccentric phase ~half cost → total factor 1.5
// Body mechanical efficiency η ≈ 0.22
// 1 kcal = 4184 J
// → kcal/kg/rep = (9.81 × 0.4 × 1.5) / 0.22 / 4184 ≈ 0.0064
const KCAL_PER_KG_LIFTED_REP = (9.81 * 0.4 * 1.5) / 0.22 / 4184;

// Calories burned by a number of reps of an exercise.
// Order of preference:
//   1) weighted exercise with lifted weight: physics-based (weight × reps × amplitude)
//   2) name/weightType-inferred MET-based formula × body weight
//   3) flat caloriesPerRep stored on the exercise (legacy)
export function exerciseKcal(
  ex: Pick<Exercise, 'name' | 'weightType' | 'caloriesPerRep'>,
  totalReps: number,
  bodyWeightKg: number,
  liftedWeightKg?: number,
): number {
  if (totalReps <= 0) return 0;
  if (ex.weightType > 0 && liftedWeightKg && liftedWeightKg > 0) {
    return totalReps * liftedWeightKg * KCAL_PER_KG_LIFTED_REP;
  }
  const perKgRep = inferKcalPerKgRep(ex);
  if (perKgRep > 0 && bodyWeightKg > 0) return totalReps * perKgRep * bodyWeightKg;
  if (ex.caloriesPerRep && ex.caloriesPerRep > 0) return totalReps * ex.caloriesPerRep;
  return 0;
}

// Lookup table used for daily sport entries (legacy 5km/10km/20km labels and football).
const CAL_RUN_PER_KG: Record<string, number> = { football: 7, '5km': 5, '10km': 10, '20km': 20 };
const DAILY_PER_REP_PER_KG: Record<string, number> = {
  pullups: 0.005,
  abs: 0.003,
  triceps: 0.004,
  squats: 0.004,
};

// Calories for one daily sport entry (sportStore SportEntry).
// Shared by SportScreen and DayReview.
export function calcDailyEntryKcal(entry: SportEntry, bodyWeightKg: number): number {
  if (bodyWeightKg <= 0) return 0;
  if (entry.type === 'run') {
    if (entry.label && CAL_RUN_PER_KG[entry.label] !== undefined) {
      return Math.round(CAL_RUN_PER_KG[entry.label] * bodyWeightKg);
    }
    return Math.round(entry.count * bodyWeightKg); // ~1 kcal/kg/km
  }
  if (entry.type === 'bike') return Math.round(entry.count * 0.375 * bodyWeightKg); // MET 7.5
  if (entry.type === 'football') return Math.round((entry.count * 7 * bodyWeightKg) / 60); // MET 7, minutes
  if (entry.type === 'swim') return Math.round((entry.count * 6 * bodyWeightKg) / 60); // MET 6, minutes
  const perRepPerKg = DAILY_PER_REP_PER_KG[entry.type];
  if (perRepPerKg) return Math.round(entry.count * perRepPerKg * bodyWeightKg);
  return 0;
}

export function calcDailyEntriesKcal(entries: SportEntry[], bodyWeightKg: number): number {
  return entries.reduce((sum, e) => sum + calcDailyEntryKcal(e, bodyWeightKg), 0);
}

// Body weight at a given date (last 'weight' entry on or before the date).
// Falls back to the earliest known weight, then to `fallbackKg`.
export function getBodyWeightAt(entries: SportEntry[], date: string, fallbackKg = 80): number {
  const weights = entries
    .filter((e) => e.type === 'weight')
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  if (weights.length === 0) return fallbackKg;
  const on = weights.find((w) => w.date <= date);
  if (on) return on.count;
  return weights[weights.length - 1].count;
}
