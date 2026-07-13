import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "./types.ts";
import { mergeRemoteTasks } from "./syncMerge.ts";

const task = (id: string, updatedAt: string, action = id): Task => ({
  id,
  subject: "",
  action,
  category: "IN",
  notes: "",
  priority: "normal",
  isRecurring: false,
  completed: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt,
});

test("a clean local task missing remotely is deleted", () => {
  const result = mergeRemoteTasks(
    [],
    [task("gone", "2026-01-02T00:00:00.000Z")],
    new Set(),
    new Set(),
  );
  assert.deepEqual(result.tasks, []);
});

test("first sync keeps and uploads a local task missing remotely", () => {
  const local = task("local", "2026-01-02T00:00:00.000Z");
  const result = mergeRemoteTasks([], [local], new Set(), new Set(), false);

  assert.deepEqual(result.tasks, [local]);
  assert.deepEqual(result.retryUpserts, [local]);
});

test("dirty local data wins and is queued for retry", () => {
  const local = task("same", "2026-01-03T00:00:00.000Z", "local");
  const remote = task("same", "2026-01-04T00:00:00.000Z", "remote");
  const result = mergeRemoteTasks(
    [remote],
    [local],
    new Set(["same"]),
    new Set(),
  );
  assert.equal(result.tasks[0].action, "local");
  assert.deepEqual(result.retryUpserts.map((item) => item.id), ["same"]);
});

test("a newer clean remote row wins", () => {
  const local = task("same", "2026-01-03T00:00:00.000Z", "local");
  const remote = task("same", "2026-01-04T00:00:00.000Z", "remote");
  const result = mergeRemoteTasks(
    [remote],
    [local],
    new Set(),
    new Set(),
  );
  assert.equal(result.tasks[0].action, "remote");
  assert.deepEqual(result.retryUpserts, []);
});

test("a tombstone suppresses a stale remote row", () => {
  const result = mergeRemoteTasks(
    [task("deleted", "2026-01-04T00:00:00.000Z")],
    [],
    new Set(),
    new Set(["deleted"]),
  );
  assert.deepEqual(result.tasks, []);
});
