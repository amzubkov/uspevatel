import type { Task } from "./types";

export interface TaskMergeResult {
  tasks: Task[];
  retryUpserts: Task[];
}

function timestamp(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Merge a server snapshot with local data.
 *
 * - Explicit local tombstones always hide a remote row until deletion is acked.
 * - Dirty local rows win and remain eligible for retry.
 * - Otherwise the newest updatedAt wins.
 * - After an established baseline, a clean local row absent remotely is a
 *   remote deletion. During first sync it is uploaded instead.
 */
export function mergeRemoteTasks(
  remote: Task[],
  local: Task[],
  dirtyIds: ReadonlySet<string>,
  tombstones: ReadonlySet<string>,
  remoteMissingMeansDeleted = true,
): TaskMergeResult {
  const localById = new Map(local.map((task) => [task.id, task]));
  const remoteIds = new Set<string>();
  const tasks: Task[] = [];
  const retryById = new Map<string, Task>();

  for (const remoteTask of remote) {
    if (!remoteTask.id || tombstones.has(remoteTask.id)) continue;
    remoteIds.add(remoteTask.id);
    const localTask = localById.get(remoteTask.id);
    if (!localTask) {
      tasks.push(remoteTask);
      continue;
    }

    if (
      dirtyIds.has(localTask.id) ||
      timestamp(localTask.updatedAt) > timestamp(remoteTask.updatedAt)
    ) {
      tasks.push(localTask);
      retryById.set(localTask.id, localTask);
    } else {
      tasks.push(remoteTask);
    }
  }

  for (const localTask of local) {
    if (
      remoteIds.has(localTask.id) ||
      tombstones.has(localTask.id) ||
      (!dirtyIds.has(localTask.id) && remoteMissingMeansDeleted)
    ) {
      continue;
    }
    tasks.push(localTask);
    retryById.set(localTask.id, localTask);
  }

  return { tasks, retryUpserts: [...retryById.values()] };
}
