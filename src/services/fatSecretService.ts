// FatSecret Platform API: OAuth2 client-credentials token + foods.search.
// Keys (Client ID/Secret from platform.fatsecret.com) live in SecureStore.
// Basic tier: search is English-leaning, macros come from food_description
// strings like "Per 100g - Calories: 52kcal | Fat: 0.17g | ...".

import { getSecret } from './secrets';
import type { FoodHit } from './foodDatabase';

const TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const API_URL = 'https://platform.fatsecret.com/rest/server.api';
const TIMEOUT_MS = 15_000;

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function hasFatSecretKeys(): Promise<boolean> {
  return !!(await getSecret('fatSecretClientId')) && !!(await getSecret('fatSecretClientSecret'));
}

// Hermes has no btoa; keys are ASCII so a minimal base64 encoder is enough.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64Ascii(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i += 3) {
    const a = s.charCodeAt(i);
    const b = i + 1 < s.length ? s.charCodeAt(i + 1) : NaN;
    const c = i + 2 < s.length ? s.charCodeAt(i + 2) : NaN;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (Number.isNaN(b) ? 0 : b >> 4)];
    out += Number.isNaN(b) ? '=' : B64[((b & 15) << 2) | (Number.isNaN(c) ? 0 : c >> 6)];
    out += Number.isNaN(c) ? '=' : B64[c & 63];
  }
  return out;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error: any) {
    if (controller.signal.aborted) throw new Error(`FatSecret timeout (${TIMEOUT_MS / 1000}s)`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value;
  const id = await getSecret('fatSecretClientId');
  const secret = await getSecret('fatSecretClientSecret');
  if (!id || !secret) throw new Error('FatSecret: ключи не заданы (Настройки → FatSecret)');
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + base64Ascii(`${id}:${secret}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=basic',
  });
  if (!res.ok) throw new Error(`FatSecret auth ${res.status}: проверьте Client ID/Secret`);
  const data = await res.json();
  if (!data?.access_token) throw new Error('FatSecret auth: пустой токен');
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

// "Per 100g - Calories: 52kcal | Fat: 0.17g | Carbs: 13.81g | Protein: 0.26g"
const DESC_RE = /Per\s+(.+?)\s*-\s*Calories:\s*([\d.]+)kcal\s*\|\s*Fat:\s*([\d.]+)g\s*\|\s*Carbs:\s*([\d.]+)g\s*\|\s*Protein:\s*([\d.]+)g/i;

/** Search FatSecret by name; returns only entries with per-100g macros. */
export async function searchFatSecret(query: string, limit = 12): Promise<FoodHit[]> {
  const q = query.trim();
  if (!q) return [];
  const token = await getToken();
  const params =
    `method=foods.search&search_expression=${encodeURIComponent(q)}` +
    `&format=json&max_results=${Math.min(limit * 2, 50)}`;
  const res = await fetchWithTimeout(`${API_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`FatSecret ${res.status}`);
  const data = await res.json();
  if (data?.error) {
    // Code 21 = caller IP is not whitelisted in the FatSecret console.
    if (Number(data.error.code) === 21) {
      throw new Error('FatSecret: IP не в белом списке (platform.fatsecret.com → IP Restrictions)');
    }
    throw new Error(`FatSecret: ${data.error.message || data.error.code}`);
  }
  const raw = data?.foods?.food;
  const foods: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const hits: FoodHit[] = [];
  for (const f of foods) {
    const m = DESC_RE.exec(String(f?.food_description || ''));
    if (!m || !/^100\s*g$/i.test(m[1].trim())) continue; // only per-100g entries
    const name = String(f?.food_name || '').trim();
    if (!name) continue;
    const brand = String(f?.brand_name || '').trim();
    hits.push({
      name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name,
      kcalPer100: Number(m[2]) || 0,
      fatPer100: Number(m[3]) || 0,
      carbsPer100: Number(m[4]) || 0,
      proteinPer100: Number(m[5]) || 0,
      source: 'FS',
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
