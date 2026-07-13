export interface ValidWorkoutItem {
  exerciseId: number;
  sets: number;
  reps: number;
  weight: number;
  reason: string;
}

export interface ValidWorkoutPlan {
  summary: string;
  items: ValidWorkoutItem[];
}

/** Reject malformed/out-of-range model output before it reaches the stores. */
export function normalizeWorkoutPlan(raw: unknown, validExerciseIds: ReadonlySet<number>): ValidWorkoutPlan {
  if (!raw || typeof raw !== 'object') throw new Error('Модель вернула некорректный план');
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.items)) throw new Error('Модель вернула план без упражнений');
  const seen = new Set<number>();
  const items: ValidWorkoutItem[] = [];
  for (const candidate of value.items) {
    if (!candidate || typeof candidate !== 'object') continue;
    const item = candidate as Record<string, unknown>;
    const exerciseId = Number(item.exerciseId);
    const sets = Number(item.sets);
    const reps = Number(item.reps);
    const weight = Number(item.weight);
    const reason = typeof item.reason === 'string' ? item.reason.trim() : '';
    if (!Number.isInteger(exerciseId) || !validExerciseIds.has(exerciseId) || seen.has(exerciseId)) continue;
    if (!Number.isInteger(sets) || sets < 1 || sets > 20) continue;
    if (!Number.isInteger(reps) || reps < 1 || reps > 100) continue;
    if (!Number.isFinite(weight) || weight < 0 || weight > 1000) continue;
    if (!reason || reason.length > 500) continue;
    seen.add(exerciseId);
    items.push({ exerciseId, sets, reps, weight, reason });
  }
  const summary = typeof value.summary === 'string' ? value.summary.trim().slice(0, 2000) : '';
  return { summary, items };
}
