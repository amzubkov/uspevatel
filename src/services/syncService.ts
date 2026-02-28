import { Task, SyncResult } from '../types';
import { RoutineItem } from '../store/routineStore';

const TASK_FIELDS: (keyof Task)[] = [
  'id', 'subject', 'action', 'category', 'contextCategory', 'project',
  'notes', 'startDate', 'priority', 'isRecurring', 'completed',
  'completedAt', 'createdAt', 'updatedAt', 'reminderAt',
];

export async function fetchRemoteTasks(url: string): Promise<Task[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('Expected array of tasks from remote');
  }
  return data.map(normalizeRemoteTask);
}

export async function pushChanges(
  url: string,
  upsert: Task[],
  deleteIds: string[]
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upsert, deleteIds }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Push failed: ${res.status} ${text}`);
  }
}

export function computeSync(
  localTasks: Task[],
  remoteTasks: Task[],
  knownSyncIds: string[]
): SyncResult {
  const localMap = new Map(localTasks.map((t) => [t.id, t]));
  const remoteMap = new Map(remoteTasks.map((t) => [t.id, t]));
  const knownSet = new Set(knownSyncIds);

  const toExport: Task[] = [];
  const toImport: Task[] = [];
  const toDeleteFromSheet: string[] = [];
  const conflicts = [];

  for (const local of localTasks) {
    if (!remoteMap.has(local.id)) {
      toExport.push(local);
    }
  }

  for (const remote of remoteTasks) {
    if (!localMap.has(remote.id)) {
      if (knownSet.has(remote.id)) {
        toDeleteFromSheet.push(remote.id);
      } else {
        toImport.push(remote);
      }
    }
  }

  for (const local of localTasks) {
    const remote = remoteMap.get(local.id);
    if (!remote) continue;
    if (local.updatedAt !== remote.updatedAt) {
      const diffFields = findDiffFields(local, remote);
      if (diffFields.length > 0) {
        conflicts.push({ localTask: local, remoteTask: remote, diffFields });
      }
    }
  }

  return { toExport, toImport, toDeleteFromSheet, conflicts };
}

export interface RoutineLogEntry {
  date: string;
  itemId: string;
  title: string;
  completed: boolean;
}

export async function pushRoutineLog(
  url: string,
  items: RoutineItem[],
  completedToday: Record<string, string>
): Promise<void> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const entries: RoutineLogEntry[] = items.map((item) => ({
    date: dateStr,
    itemId: item.id,
    title: item.title,
    completed: completedToday[item.id] === dateStr,
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routineLog: entries }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Routine push failed: ${res.status} ${text}`);
  }
}

function findDiffFields(a: Task, b: Task): string[] {
  const diff: string[] = [];
  for (const key of TASK_FIELDS) {
    if (key === 'id' || key === 'updatedAt') continue;
    const va = a[key];
    const vb = b[key];
    if (String(va ?? '') !== String(vb ?? '')) {
      diff.push(key);
    }
  }
  return diff;
}

function normalizeRemoteTask(raw: Record<string, unknown>): Task {
  return {
    id: String(raw.id ?? ''),
    subject: String(raw.subject ?? ''),
    action: String(raw.action ?? ''),
    category: (['IN', 'DAY', 'LATER', 'CONTROL', 'MAYBE'].includes(String(raw.category))
      ? String(raw.category)
      : 'IN') as Task['category'],
    contextCategory: raw.contextCategory ? String(raw.contextCategory) : undefined,
    project: raw.project ? String(raw.project) : undefined,
    notes: String(raw.notes ?? ''),
    startDate: raw.startDate ? String(raw.startDate) : undefined,
    priority: (['high', 'normal', 'low'].includes(String(raw.priority))
      ? String(raw.priority)
      : 'normal') as Task['priority'],
    isRecurring: raw.isRecurring === true || raw.isRecurring === 'true',
    recurDays: Array.isArray(raw.recurDays) ? raw.recurDays as number[] : undefined,
    completed: raw.completed === true || raw.completed === 'true',
    completedAt: raw.completedAt ? String(raw.completedAt) : undefined,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    reminderAt: raw.reminderAt ? String(raw.reminderAt) : undefined,
  };
}
