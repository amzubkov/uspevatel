import { convertFileSrc } from '@tauri-apps/api/core';
import { getSyncFolder } from './db';

/**
 * Convert a relative image path from SQLite (e.g. "task_images/uuid.jpg")
 * to a webview-accessible URL using Tauri's convertFileSrc.
 * Returns undefined if no syncFolder or no relativePath.
 */
export function resolveImageSrc(relativePath: string | null | undefined): string | undefined {
  if (!relativePath) return undefined;
  const folder = getSyncFolder();
  if (!folder) return undefined;
  // Already absolute or data URI — return as-is
  if (relativePath.startsWith('http') || relativePath.startsWith('data:')) return relativePath;
  const absPath = `${folder}/${relativePath}`;
  return convertFileSrc(absPath);
}
