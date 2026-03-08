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
  return extractJson(text, res.status);
}

async function gasPost(url: string, payload: unknown): Promise<void> {
  const body = JSON.stringify(payload);
  log(`POST payload: ${body.substring(0, 300)}`);

  // Google Apps Script redirect issue:
  // POST → 302 → browser converts to GET → body lost
  // Solution: redirect:'manual', check for opaque redirect = success
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body,
      redirect: 'manual',
    });
    log(`POST response: status=${res.status} type=${res.type} redirected=${res.redirected}`);

    // opaqueredirect (status 0) = Google received our POST and sent 302 = SUCCESS
    if (res.type === 'opaqueredirect' || res.status === 302 || res.status === 0) {
      log('POST OK (redirect = script processed it)');
      return;
    }
    // 200 = direct response (no redirect, unlikely but fine)
    if (res.ok) {
      const text = await res.text();
      log(`POST OK: ${text.substring(0, 200)}`);
      return;
    }
    log(`POST unexpected: status=${res.status}`);
  } catch (err) {
    log(`POST error: ${err}`);
    // Fallback: no-cors (fire and forget)
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body,
        mode: 'no-cors',
      });
      log('POST fallback (no-cors) sent');
    } catch (err2) {
      log(`POST fallback also failed: ${err2}`);
      throw err2;
    }
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
