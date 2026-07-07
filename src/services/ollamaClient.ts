// Shared Ollama Cloud client for all AI features (planner, health, travel).
// Single source of truth for URL, models, settings keys and response parsing.

import { getDb } from '../db/database';
import { getSecret, setSecret } from './secrets';

const OLLAMA_URL = 'https://ollama.com/api/chat';
export const DEFAULT_MODEL = 'deepseek-v4-flash';
export const VISION_MODEL = 'gemma3:27b';
export const SUGGESTED_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro', 'glm-5', 'qwen3.5:397b', 'kimi-k2.6', 'gpt-oss:120b'];

export async function getSetting(key: string): Promise<string> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value || '';
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (value.trim()) await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value.trim()]);
  else await db.runAsync('DELETE FROM settings WHERE key = ?', [key]);
}

export const getOllamaKey = () => getSecret('ollamaApiKey');
export const setOllamaKey = (k: string) => setSecret('ollamaApiKey', k);
export const getOllamaModel = async () => (await getSetting('ollamaModel')) || DEFAULT_MODEL;
export const setOllamaModel = (m: string) => setSetting('ollamaModel', m || DEFAULT_MODEL);

// Models sometimes ignore the format schema and wrap JSON in markdown/prose —
// dig it out of whatever came back.
export function extractJson(s: string): any {
  try { return JSON.parse(s); } catch {}
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(s.slice(i, j + 1)); } catch {} }
  throw new Error('Модель вернула не-JSON: ' + s.slice(0, 120));
}

interface OllamaChatOpts {
  model?: string;          // default: user's configured model
  system?: string;
  user: string;
  images?: string[];       // base64; forces vision usage on caller's model choice
  format?: object;         // JSON schema hint (not all models honor it)
}

// Sends one chat request and returns the parsed JSON object from the reply.
export async function ollamaChatJson(opts: OllamaChatOpts): Promise<any> {
  const key = await getOllamaKey();
  if (!key) throw new Error('Ollama API ключ не задан (Настройки → AI-планировщик)');
  const model = opts.model || (await getOllamaModel());

  const messages: any[] = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: opts.user, ...(opts.images ? { images: opts.images } : {}) });

  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, stream: false, ...(opts.format ? { format: opts.format } : {}), messages }),
  });
  if (!res.ok) throw new Error(`Ollama API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return extractJson(String(data?.message?.content || ''));
}
