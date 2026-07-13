import type { SQLiteDatabase } from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** AsyncStorage stores used by pre-SQLite releases. */
export const LEGACY_STORAGE_KEYS = [
  'task-storage',
  'project-storage',
  'settings-storage',
  'routine-storage',
  'checklist-storage',
  'sport-storage',
  'exercise-storage',
] as const;

type LegacyStorageKey = (typeof LEGACY_STORAGE_KEYS)[number];
export type LegacyStorageSnapshot = Partial<Record<LegacyStorageKey, unknown>>;

function unwrapState(value: unknown): any {
  if (!value || typeof value !== 'object') return {};
  const object = value as any;
  return object.state && typeof object.state === 'object' ? object.state : object;
}

function list(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Parse the complete legacy snapshot before opening a SQLite transaction.
 * Malformed JSON is deliberately fatal: silently advancing schema_version
 * would make that data impossible to retry or recover.
 */
export async function readLegacyStorage(): Promise<LegacyStorageSnapshot> {
  const snapshot: LegacyStorageSnapshot = {};
  const pairs = await AsyncStorage.multiGet([...LEGACY_STORAGE_KEYS]);
  for (const [key, raw] of pairs) {
    if (raw == null) continue;
    try {
      snapshot[key as LegacyStorageKey] = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Не удалось прочитать старые данные ${key}: ${String(error)}`);
    }
  }
  return snapshot;
}

/** Remove legacy keys only after the surrounding SQLite transaction commits. */
export async function clearLegacyStorage(keys: readonly string[]): Promise<void> {
  if (keys.length > 0) await AsyncStorage.multiRemove([...keys]);
}

/**
 * Import a pre-SQLite snapshot into an already-open transaction.
 * Every insert is idempotent so this also repairs databases left by the old,
 * non-transactional importer. The caller owns commit/rollback.
 */
export async function migrateFromAsyncStorage(
  db: SQLiteDatabase,
  snapshot: LegacyStorageSnapshot,
): Promise<string[]> {
  const migrated = LEGACY_STORAGE_KEYS.filter((key) => snapshot[key] !== undefined);
  const now = new Date().toISOString();

  const taskState = unwrapState(snapshot['task-storage']);
  for (const task of list(taskState.tasks)) {
    const allowedCategories = new Set(['IN', 'DAY', 'LATER', 'CONTROL', 'MAYBE']);
    const category = allowedCategories.has(task.category) ? task.category : 'IN';
    await db.runAsync(
      `INSERT OR IGNORE INTO tasks
       (id, subject, action, category, context_category, project, notes, start_date, deadline, reminder_at,
        priority, is_recurring, recur_days, completed, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id, task.subject || '', task.action || '', category, task.contextCategory || null,
        task.project || null, task.notes || '', task.startDate || null, task.deadline || null,
        task.reminderAt || null, task.priority || 'normal', task.isRecurring ? 1 : 0,
        task.recurDays ? JSON.stringify(task.recurDays) : null, task.completed ? 1 : 0,
        task.completedAt || null, task.createdAt || now, task.updatedAt || now,
      ],
    );
  }
  for (const stats of list(taskState.weekStats)) {
    await db.runAsync(
      `INSERT OR IGNORE INTO week_stats
       (week_start, total_completed, project_completed, ratio, diary_entry) VALUES (?, ?, ?, ?, ?)`,
      [stats.weekStart, stats.totalCompleted || 0, stats.projectCompleted || 0, stats.ratio || 0, stats.diaryEntry || ''],
    );
  }

  const projectState = unwrapState(snapshot['project-storage']);
  for (const project of list(projectState.projects)) {
    await db.runAsync(
      'INSERT OR IGNORE INTO projects (id, name, is_current, notes) VALUES (?, ?, ?, ?)',
      [project.id, project.name || '', project.isCurrent ? 1 : 0, project.notes || ''],
    );
  }

  const settingsState = unwrapState(snapshot['settings-storage']);
  if (snapshot['settings-storage'] !== undefined) {
    const pairs: [string, string][] = [
      ['contextCategories', JSON.stringify(settingsState.contextCategories || [])],
      ['dailyReminderTime', settingsState.dailyReminderTime || '09:00'],
      ['weeklyReminderTime', settingsState.weeklyReminderTime || '10:00'],
      ['weeklyReminderDay', String(settingsState.weeklyReminderDay ?? 0)],
      ['theme', settingsState.theme || 'dark'],
      ['fontSize', String(settingsState.fontSize ?? 15)],
    ];
    for (const [key, value] of pairs) {
      await db.runAsync('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }

  const routineState = unwrapState(snapshot['routine-storage']);
  for (const item of list(routineState.items)) {
    await db.runAsync(
      'INSERT OR IGNORE INTO routines (id, title, sort_order) VALUES (?, ?, ?)',
      [item.id, item.title || '', item.order ?? 0],
    );
  }
  if (routineState.completedToday && typeof routineState.completedToday === 'object') {
    for (const [itemId, date] of Object.entries(routineState.completedToday)) {
      if (date) {
        await db.runAsync(
          'INSERT OR IGNORE INTO routine_completions (routine_id, date) VALUES (?, ?)',
          [itemId, String(date)],
        );
      }
    }
  }

  // The FK target must exist before importing checklist items.
  await db.runAsync(
    "INSERT OR IGNORE INTO checklists (id, name, sort_order) VALUES ('default', 'Чеклист', 0)",
  );
  const checklistState = unwrapState(snapshot['checklist-storage']);
  for (const item of list(checklistState.items)) {
    await db.runAsync(
      'INSERT OR IGNORE INTO checklist (id, list_id, title, done, created_at) VALUES (?, ?, ?, ?, ?)',
      [item.id, 'default', item.title || '', item.done ? 1 : 0, item.createdAt || now],
    );
  }

  const sportState = unwrapState(snapshot['sport-storage']);
  for (const entry of list(sportState.entries)) {
    await db.runAsync(
      'INSERT OR IGNORE INTO sport_entries (id, type, label, count, date, time) VALUES (?, ?, ?, ?, ?, ?)',
      [entry.id, entry.type, entry.label || null, entry.count, entry.date, entry.time],
    );
  }

  const exerciseState = unwrapState(snapshot['exercise-storage']);
  const oldExercises = list(exerciseState.exercises);
  const exerciseIds = new Map<string, number>();
  for (const exercise of oldExercises) {
    const name = String(exercise.name || '').trim() || `Импортированное упражнение ${exercise.id}`;
    let row = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM exercises
       WHERE name = ? AND is_preset = ? ORDER BY id LIMIT 1`,
      [name, exercise.isPreset ? 1 : 0],
    );
    if (!row) {
      const weightType = exercise.weightType === 'barbell' ? 100 : exercise.weightType === 'dumbbells' ? 10 : 0;
      const result = await db.runAsync(
        `INSERT INTO exercises
         (name, description, image_uri, tag, weight_type, is_preset)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, exercise.description || null, exercise.imageUri || null, exercise.tag || null, weightType, exercise.isPreset ? 1 : 0],
      );
      row = { id: result.lastInsertRowId };
    }
    exerciseIds.set(String(exercise.id), row.id);
  }

  for (const log of list(exerciseState.logs)) {
    const oldId = String(log.exerciseId);
    let exerciseId = exerciseIds.get(oldId);
    if (exerciseId == null) {
      // Preserve orphaned logs instead of silently dropping them.
      const placeholderName = `Импортированное упражнение ${oldId}`;
      let row = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM exercises WHERE name = ? AND is_preset = 0 ORDER BY id LIMIT 1',
        [placeholderName],
      );
      if (!row) {
        const result = await db.runAsync(
          'INSERT INTO exercises (name, weight_type, is_preset) VALUES (?, 0, 0)',
          [placeholderName],
        );
        row = { id: result.lastInsertRowId };
      }
      exerciseId = row.id;
      exerciseIds.set(oldId, exerciseId);
    }
    const date = String(log.date || '').slice(0, 10);
    const createdAt = log.createdAt || [date, log.time].filter(Boolean).join(' ') || now;
    const weight = Number(log.weight) || 0;
    const reps = Number(log.reps) || 0;
    const setNum = Number(log.sets ?? log.setNum) || 1;
    await db.runAsync(
      `INSERT INTO workout_logs (exercise_id, weight, reps, set_num, date, created_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM workout_logs
         WHERE exercise_id = ? AND weight = ? AND reps = ? AND set_num = ? AND date = ? AND created_at = ?
       )`,
      [exerciseId, weight, reps, setNum, date, createdAt, exerciseId, weight, reps, setNum, date, createdAt],
    );
  }

  return migrated;
}
