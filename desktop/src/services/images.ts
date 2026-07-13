import { convertFileSrc } from '@tauri-apps/api/core';
import { getSnapshotAssetFolder } from './db';

const SNAPSHOT_ASSET_DIRECTORIES = new Set([
  'task_images',
  'flight_images',
  'exercise_images',
]);

/**
 * Convert a relative image path from SQLite (e.g. "task_images/uuid.jpg")
 * to a webview-accessible URL using Tauri's convertFileSrc.
 * Paths resolve only inside the app-local snapshot asset copy.
 * Returns undefined if there is no imported asset root or relativePath.
 */
export function resolveImageSrc(relativePath: string | null | undefined): string | undefined {
  if (!relativePath) return undefined;
  const folder = getSnapshotAssetFolder();
  if (!folder) return undefined;
  // Already absolute or data URI — return as-is
  if (relativePath.startsWith('http') || relativePath.startsWith('data:')) return relativePath;
  const normalized = relativePath.replace(/\\/g, '/');
  if (
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').some((part) => part === '..') ||
    !SNAPSHOT_ASSET_DIRECTORIES.has(normalized.split('/')[0])
  ) {
    return undefined;
  }
  const absPath = `${folder}/${normalized}`;
  return convertFileSrc(absPath);
}
