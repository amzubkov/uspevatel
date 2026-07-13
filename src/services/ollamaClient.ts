// Shared Ollama Cloud client for all AI features (planner, health, travel).
// Single source of truth for URL, models, settings keys and response parsing.

import { getDb } from '../db/database';
import { getSecret, setSecret } from './secrets';

const OLLAMA_URL = 'https://ollama.com/api/chat';
export const DEFAULT_MODEL = 'glm-5.2';
export const VISION_MODEL = 'gemma4';
export const SUGGESTED_MODELS = ['glm-5.2', 'qwen3.5', 'gemma4'];

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

// Models retired or now behind a paid plan — auto-heal a stale saved setting.
const LEGACY_MODELS = new Set([
  'kimi-k2.6', 'gemma3:27b', 'deepseek-v4-flash', 'deepseek-v4-pro', 'glm-5', 'qwen3.5:397b', 'gpt-oss:120b',
]);
export const getOllamaModel = async () => {
  const saved = await getSetting('ollamaModel');
  return !saved || LEGACY_MODELS.has(saved) ? DEFAULT_MODEL : saved;
};
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
  timeoutMs?: number;      // abort if no response within this window (default 120s)
}

// Sends one chat request and returns the parsed JSON object from the reply.
export async function ollamaChatJson(opts: OllamaChatOpts): Promise<any> {
  const key = await getOllamaKey();
  if (!key) throw new Error('Ollama API ключ не задан (Настройки → AI-планировщик)');
  const model = opts.model || (await getOllamaModel());

  const messages: any[] = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: opts.user, ...(opts.images ? { images: opts.images } : {}) });

  // Abort if the model stalls, so callers fail with a clear error instead of spinning forever.
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 120000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  let responseText: string;
  try {
    res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, stream: false, ...(opts.format ? { format: opts.format } : {}), messages }),
      signal: controller.signal,
    });
    // Keep the abort timer alive while the body is downloading too. fetch()
    // resolves as soon as headers arrive, which is not the end of a response.
    responseText = await res.text();
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`Модель «${model}» не ответила за ${Math.round(timeoutMs / 1000)} с. Попробуйте другую модель (Спорт → 🤖 План) или повторите.`);
    throw new Error(`Сеть недоступна: ${String(e?.message || e)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Ollama API ${res.status}: ${responseText.slice(0, 200)}`);
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`Ollama API вернул некорректный ответ: ${responseText.slice(0, 120)}`);
  }
  return extractJson(String(data?.message?.content || ''));
}
