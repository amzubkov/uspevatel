import type { SQLiteDatabase } from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * One-time migration from AsyncStorage (Zustand persist) to SQLite.
 * Reads existing data from AsyncStorage keys and inserts into SQLite tables.
 * After successful migration, clears the old AsyncStorage keys.
 */
export async function migrateFromAsyncStorage(db: SQLiteDatabase) {
  const keys = [
    'task-storage',
    'project-storage',
    'settings-storage',
    'routine-storage',
    'checklist-storage',
    'sport-storage',
    'exercise-storage',
  ];

  const migrated: string[] = [];

  try {
    // Tasks
    const taskRaw = await AsyncStorage.getItem('task-storage');
    if (taskRaw) {
      const data = JSON.parse(taskRaw);
      const state = data.state || data;
      if (state.tasks?.length) {
        for (const t of state.tasks) {
          await db.runAsync(
            `INSERT OR IGNORE INTO tasks (id, subject, action, category, context_category, project, notes, start_date, deadline, reminder_at, priority, is_recurring, recur_days, completed, completed_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [t.id, t.subject || '', t.action || '', t.category || 'IN', t.contextCategory || null, t.project || null,
             t.notes || '', t.startDate || null, t.deadline || null, t.reminderAt || null,
             t.priority || 'normal', t.isRecurring ? 1 : 0, t.recurDays ? JSON.stringify(t.recurDays) : null,
             t.completed ? 1 : 0, t.completedAt || null, t.createdAt || new Date().toISOString(), t.updatedAt || new Date().toISOString()]
          );
        }
      }
      if (state.weekStats?.length) {
        for (const ws of state.weekStats) {
          await db.runAsync(
            'INSERT OR IGNORE INTO week_stats (week_start, total_completed, project_completed, ratio, diary_entry) VALUES (?, ?, ?, ?, ?)',
            [ws.weekStart, ws.totalCompleted || 0, ws.projectCompleted || 0, ws.ratio || 0, ws.diaryEntry || '']
          );
        }
      }
      migrated.push('task-storage');
    }

    // Projects
    const projRaw = await AsyncStorage.getItem('project-storage');
    if (projRaw) {
      const data = JSON.parse(projRaw);
      const state = data.state || data;
      if (state.projects?.length) {
        for (const p of state.projects) {
          await db.runAsync(
            'INSERT OR IGNORE INTO projects (id, name, is_current, notes) VALUES (?, ?, ?, ?)',
            [p.id, p.name || '', p.isCurrent ? 1 : 0, p.notes || '']
          );
        }
      }
      migrated.push('project-storage');
    }

    // Settings
    const settRaw = await AsyncStorage.getItem('settings-storage');
    if (settRaw) {
      const data = JSON.parse(settRaw);
      const state = data.state || data;
      const pairs: [string, string][] = [
        ['contextCategories', JSON.stringify(state.contextCategories || [])],
        ['dailyReminderTime', state.dailyReminderTime || '09:00'],
        ['weeklyReminderTime', state.weeklyReminderTime || '10:00'],
        ['weeklyReminderDay', String(state.weeklyReminderDay ?? 0)],
        ['theme', state.theme || 'dark'],
        ['fontSize', String(state.fontSize ?? 15)],
        ['syncUrl', state.syncUrl || ''],
        ['lastSyncAt', state.lastSyncAt || ''],
        ['knownSyncIds', JSON.stringify(state.knownSyncIds || [])],
      ];
      for (const [k, v] of pairs) {
        await db.runAsync('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]);
      }
      migrated.push('settings-storage');
    }

    // Routines
    const routRaw = await AsyncStorage.getItem('routine-storage');
    if (routRaw) {
      const data = JSON.parse(routRaw);
      const state = data.state || data;
      if (state.items?.length) {
        for (const item of state.items) {
          await db.runAsync(
            'INSERT OR IGNORE INTO routines (id, title, sort_order) VALUES (?, ?, ?)',
            [item.id, item.title || '', item.order ?? 0]
          );
        }
      }
      if (state.completedToday) {
        for (const [itemId, date] of Object.entries(state.completedToday)) {
          if (date) {
            await db.runAsync(
              'INSERT OR IGNORE INTO routine_completions (routine_id, date) VALUES (?, ?)',
              [itemId, date as string]
            );
          }
        }
      }
      migrated.push('routine-storage');
    }

    // Checklist
    const checkRaw = await AsyncStorage.getItem('checklist-storage');
    if (checkRaw) {
      const data = JSON.parse(checkRaw);
      const state = data.state || data;
      if (state.items?.length) {
        for (const item of state.items) {
          await db.runAsync(
            'INSERT OR IGNORE INTO checklist (id, title, done, created_at) VALUES (?, ?, ?, ?)',
            [item.id, item.title || '', item.done ? 1 : 0, item.createdAt || new Date().toISOString()]
          );
        }
      }
      migrated.push('checklist-storage');
    }

    // Sport entries
    const sportRaw = await AsyncStorage.getItem('sport-storage');
    if (sportRaw) {
      const data = JSON.parse(sportRaw);
      const state = data.state || data;
      const entries = state.entries || [];
      for (const e of entries) {
        await db.runAsync(
          'INSERT OR IGNORE INTO sport_entries (id, type, label, count, date, time) VALUES (?, ?, ?, ?, ?, ?)',
          [e.id, e.type, e.label || null, e.count, e.date, e.time]
        );
      }
      migrated.push('sport-storage');
    }

    // Exercise store (user-created exercises and logs, NOT presets)
    const exRaw = await AsyncStorage.getItem('exercise-storage');
    if (exRaw) {
      const data = JSON.parse(exRaw);
      const state = data.state || data;
      if (state.exercises?.length) {
        for (const ex of state.exercises) {
          if (ex.isPreset) continue; // Skip presets, they'll be seeded
          const wt = ex.weightType === 'barbell' ? 100 : ex.weightType === 'dumbbells' ? 10 : 0;
          await db.runAsync(
            'INSERT OR IGNORE INTO exercises (name, description, image_uri, tag, weight_type, is_preset) VALUES (?, ?, ?, ?, ?, 0)',
            [ex.name, ex.description || null, ex.imageUri || null, ex.tag || null, wt]
          );
        }
      }
      if (state.logs?.length) {
        // Map old string exerciseId (UUID) to new integer IDs
        // For user exercises that were just migrated, look up by name
        for (const log of state.logs) {
          const ex = state.exercises?.find((e: any) => e.id === log.exerciseId);
          if (!ex) continue;
          const dbEx = await db.getFirstAsync<{ id: number }>('SELECT id FROM exercises WHERE name = ?', [ex.name]);
          if (!dbEx) continue;
          await db.runAsync(
            'INSERT INTO workout_logs (exercise_id, weight, reps, set_num, date, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [dbEx.id, log.weight || 0, log.reps || 0, log.sets || 1, log.date, `${log.date} ${log.time}`]
          );
        }
      }
      migrated.push('exercise-storage');
    }

    // Clear migrated AsyncStorage keys
    if (migrated.length > 0) {
      await AsyncStorage.multiRemove(migrated);
    }
  } catch (e) {
    console.warn('AsyncStorage migration error (non-fatal):', e);
  }
}
