// Food lookup: bundled offline catalog first, then FatSecret (if keys are set)
// and Open Food Facts (free, no key, crowd-sourced, has RU products + barcodes)
// in parallel. AI stays as the last-resort fallback.

import { getDb } from '../db/database';

export type FoodSource = 'RU' | 'USDA' | 'OFF' | 'FS';

export interface FoodHit {
  name: string;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbsPer100: number;
  source: FoodSource;
}

interface CatalogRow {
  name: string;
  name_en: string;
  kcal_per_100: number;
  protein_per_100: number;
  fat_per_100: number;
  carbs_per_100: number;
  source: string;
}

const num = (v: any): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function rowToFoodHit(row: CatalogRow): FoodHit {
  return {
    name: row.name,
    kcalPer100: row.kcal_per_100,
    proteinPer100: row.protein_per_100,
    fatPer100: row.fat_per_100,
    carbsPer100: row.carbs_per_100,
    source: (row.source as FoodSource) || 'RU',
  };
}

// The catalog is static at runtime (seed + offline imports), so it is loaded
// once and searched in JS: SQLite's lower()/LIKE are ASCII-only and miss
// case-insensitive Cyrillic matches («гречка» vs «Гречка»).
let catalogCache: { hits: FoodHit[]; keys: string[] } | null = null;

async function loadCatalog(): Promise<{ hits: FoodHit[]; keys: string[] }> {
  if (catalogCache) return catalogCache;
  const db = await getDb();
  const rows = await db.getAllAsync<CatalogRow>(
    `SELECT name, name_en, kcal_per_100, protein_per_100, fat_per_100, carbs_per_100, source
       FROM food_catalog
      ORDER BY name COLLATE NOCASE`,
  );
  const hits = rows.map(rowToFoodHit);
  catalogCache = {
    hits,
    keys: rows.map((row) => `${row.name}\n${row.name_en || ''}`.toLowerCase()),
  };
  return catalogCache;
}

/** Read the bundled catalog without making a network request. */
export async function listLocalFoods(): Promise<FoodHit[]> {
  return (await loadCatalog()).hits;
}

/** Search the bundled offline catalog by RU or EN name (Cyrillic case-insensitive). */
export async function searchLocalFood(query: string, limit = 12): Promise<FoodHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const { hits, keys } = await loadCatalog();
  const matched: { hit: FoodHit; prefix: boolean }[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    const at = keys[i].indexOf(q);
    if (at === -1) continue;
    matched.push({ hit: hits[i], prefix: at === 0 });
  }
  return matched
    .sort((a, b) => Number(b.prefix) - Number(a.prefix) || a.hit.name.length - b.hit.name.length)
    .slice(0, limit)
    .map((m) => m.hit);
}

const OFF_SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';
const OFF_TIMEOUT_MS = 15_000;

/** Search Open Food Facts by name (online). Returns items with complete macros. */
export async function searchOpenFoodFacts(query: string, limit = 12): Promise<FoodHit[]> {
  const q = query.trim();
  if (!q) return [];
  const url =
    `${OFF_SEARCH}?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1` +
    `&fields=product_name,product_name_ru,brands,nutriments&page_size=${limit}&lc=ru`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  let data: any;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'UspevatelApp/1.0 (personal)' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
    data = await res.json();
  } catch (error: any) {
    if (controller.signal.aborted) throw new Error(`Open Food Facts timeout (${OFF_TIMEOUT_MS / 1000}s)`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const products: any[] = Array.isArray(data?.products) ? data.products : [];
  const hits: FoodHit[] = [];
  for (const p of products) {
    const n = p?.nutriments || {};
    const kcal = num(n['energy-kcal_100g']);
    const protein = num(n.proteins_100g);
    const fat = num(n.fat_100g);
    const carbs = num(n.carbohydrates_100g);
    if (kcal === 0 && protein === 0 && fat === 0 && carbs === 0) continue;
    const rawName = String(p.product_name_ru || p.product_name || '').trim();
    if (!rawName) continue;
    const brand = String(p.brands || '').split(',')[0]?.trim();
    hits.push({
      name: brand && !rawName.toLowerCase().includes(brand.toLowerCase()) ? `${rawName} (${brand})` : rawName,
      kcalPer100: kcal,
      proteinPer100: protein,
      fatPer100: fat,
      carbsPer100: carbs,
      source: 'OFF',
    });
  }
  return hits;
}

/** Offline catalog first; top up with FatSecret and Open Food Facts, de-duplicated by name. */
export async function searchFood(query: string, limit = 12): Promise<FoodHit[]> {
  const local = await searchLocalFood(query, limit);
  const seen = new Set(local.map((h) => h.name.toLowerCase()));
  const { hasFatSecretKeys, searchFatSecret } = await import('./fatSecretService');
  const [fs, off] = await Promise.allSettled([
    hasFatSecretKeys().then((ok) => (ok ? searchFatSecret(query, limit) : [])),
    searchOpenFoodFacts(query, limit),
  ]);
  // FatSecret data is curated — merge it before crowd-sourced OFF.
  const remote = [
    ...(fs.status === 'fulfilled' ? fs.value : []),
    ...(off.status === 'fulfilled' ? off.value : []),
  ];
  for (const hit of remote) {
    const key = hit.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    local.push(hit);
    if (local.length >= limit * 2) break;
  }
  return local;
}
