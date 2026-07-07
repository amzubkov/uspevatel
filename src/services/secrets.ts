// Secrets (bot token, AI keys) live in Android Keystore via expo-secure-store,
// not in the plain SQLite settings table. Reads lazily migrate old values.

import * as SecureStore from 'expo-secure-store';
import { getDb } from '../db/database';

// SecureStore forbids some characters in keys — our keys are simple ASCII.
const secureKey = (key: string) => `secret_${key}`;

export async function getSecret(key: string): Promise<string> {
  try {
    const v = await SecureStore.getItemAsync(secureKey(key));
    if (v) return v;
  } catch {}
  // migrate from the old plaintext settings row, then remove it
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  if (row?.value) {
    try {
      await SecureStore.setItemAsync(secureKey(key), row.value);
      await db.runAsync('DELETE FROM settings WHERE key = ?', [key]);
    } catch {}
    return row.value;
  }
  return '';
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (value.trim()) {
    await SecureStore.setItemAsync(secureKey(key), value.trim());
  } else {
    await deleteSecret(key);
  }
}

export async function deleteSecret(key: string): Promise<void> {
  try { await SecureStore.deleteItemAsync(secureKey(key)); } catch {}
  const db = await getDb();
  await db.runAsync('DELETE FROM settings WHERE key = ?', [key]);
}
