import { Task } from './types';

// Visible debug log — shows in Settings screen
export const syncLog: string[] = [];
function log(msg: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(line);
  syncLog.push(line);
  if (syncLog.length > 50) syncLog.shift();
}

async function gasGet(url: string): Promise<string> {
  log(`GET ${url.substring(0, 60)}...`);
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  log(`GET response: status=${res.status} type=${res.type} body=${text.substring(0, 200)}`);
  if (!res.ok) {
    throw new Error(`GET failed (${res.status}): ${text.substring(0, 300)}`);
  }
  return extractJson(text, res.status);
}

async function gasPost(url: string, payload: unknown): Promise<void> {
  const body = JSON.stringify(payload);
  log(`POST payload: ${body.substring(0, 300)}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body,
    redirect: 'follow',
  });
  const text = await res.text();
  log(`POST response: status=${res.status} type=${res.type} body=${text.substring(0, 200)}`);
  if (!res.ok) {
    throw new Error(`POST failed (${res.status}): ${text.substring(0, 300)}`);
  }
  const parsed = JSON.parse(extractJson(text, res.status));
  if (!parsed || parsed.status !== 'ok') {
    throw new Error(`POST was not acknowledged: ${text.substring(0, 300)}`);
  }
}

function extractJson(text: string, status: number): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;
  // Google XSSI prefix like )]}'\n
  const xssiClean = trimmed.replace(/^\)\]\}['";,\s]*/, '').trim();
  if (xssiClean.startsWith('{') || xssiClean.startsWith('[')) return xssiClean;
  // Try to extract JSON from HTML wrapper
  const match = trimmed.match(/(\{[^<]*\}|\[[^<]*\])/);
  if (match) return match[0];
  throw new Error(`Not JSON (status ${status}): ${trimmed.substring(0, 300)}`);
}

export async function fetchRemoteTasks(url: string): Promise<Task[]> {
  const text = await gasGet(url);
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    if (data && Array.isArray(data.tasks)) return data.tasks.map(normalizeRemoteTask);
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
  if (upsert.length === 0 && deleteIds.length === 0) return;
  await gasPost(url, { upsert, deleteIds });
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
    priority: (['super', 'high', 'normal', 'low'].includes(String(raw.priority))
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
