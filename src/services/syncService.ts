import { Task, SyncResult } from '../types';
import { RoutineItem } from '../store/routineStore';

const TASK_FIELDS: (keyof Task)[] = [
  'id', 'subject', 'action', 'category', 'contextCategory', 'project',
  'notes', 'startDate', 'priority', 'isRecurring', 'recurDays', 'completed',
  'completedAt', 'deadline', 'createdAt', 'updatedAt', 'reminderAt',
];

async function gasFetch(url: string, options?: RequestInit): Promise<string> {
  // Simple approach: let browser handle redirects
  const res = await fetch(url, { ...options, redirect: 'follow' });
  const text = await res.text();
  console.log('[SYNC]', options?.method || 'GET', 'status:', res.status, 'body:', text.substring(0, 500));
  return extractJson(text, res.status);
}

function extractJson(text: string, status: number): string {
  const trimmed = text.trim();
  // Clean JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;
  // Google XSSI prefix like )]}'\n or )]}';\n
  const xssiClean = trimmed.replace(/^\)\]\}['";,\s]*/, '').trim();
  if (xssiClean.startsWith('{') || xssiClean.startsWith('[')) return xssiClean;
  // Try to extract JSON from HTML
  const match = trimmed.match(/(\{[^<]*\}|\[[^<]*\])/);
  if (match) return match[0];
  throw new Error(`Not JSON (status ${status}): ${trimmed.substring(0, 300)}`);
}

export async function fetchRemoteTasks(url: string): Promise<Task[]> {
  const text = await gasFetch(url);
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    if (data && Array.isArray(data.tasks)) return data.tasks.map(normalizeRemoteTask);
    // Empty object {} means empty sheet — treat as no tasks
    if (data && typeof data === 'object' && Object.keys(data).length === 0) return [];
    throw new Error(`Expected array, got: ${text.substring(0, 300)}`);
  }
  return data.map(normalizeRemoteTask);
}

export async function pushChanges(
  url: string,
  upsert: Task[],
  deleteIds: string[]
): Promise<void> {
  await gasFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ upsert, deleteIds }),
  });
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

  await gasFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ routineLog: entries }),
  });
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
    recurDays: Array.isArray(raw.recurDays)
      ? raw.recurDays as number[]
      : typeof raw.recurDays === 'string' && raw.recurDays
        ? JSON.parse(raw.recurDays as string)
        : undefined,
    completed: raw.completed === true || raw.completed === 'true',
    completedAt: raw.completedAt ? String(raw.completedAt) : undefined,
    deadline: raw.deadline ? String(raw.deadline) : undefined,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    reminderAt: raw.reminderAt ? String(raw.reminderAt) : undefined,
  };
}
