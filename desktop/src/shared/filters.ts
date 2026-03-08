import { Task } from './types';

export function applyFilters(
  tasks: Task[],
  deadlineFilter: 'all' | 'today',
  projectFilter: string | null,
  subjectFilter: string | null
): Task[] {
  let result = tasks;
  if (deadlineFilter === 'today') {
    const today = new Date().toISOString().slice(0, 10);
    result = result.filter((t) => t.deadline && t.deadline.slice(0, 10) <= today);
  }
  if (projectFilter) {
    result = result.filter((t) => t.project === projectFilter);
  }
  if (subjectFilter) {
    result = result.filter((t) => t.subject === subjectFilter);
  }
  return result;
}

export function sortByPriorityDeadline(tasks: Task[]): Task[] {
  const priorityOrder = { high: 0, normal: 1, low: 2 };
  return [...tasks].sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 1;
    const pb = priorityOrder[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });
}

export function hideOldCompleted(tasks: Task[]): Task[] {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const cutoff = weekAgo.toISOString();
  return tasks.filter((t) => {
    if (!t.completed) return true;
    if (!t.completedAt) return true;
    return t.completedAt >= cutoff;
  });
}

export function searchTasks(tasks: Task[], query: string): Task[] {
  if (!query.trim()) return tasks;
  const q = query.toLowerCase();
  return tasks.filter(
    (t) =>
      t.action.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      (t.project || '').toLowerCase().includes(q) ||
      t.notes.toLowerCase().includes(q)
  );
}
