// Food lookup: bundled offline catalog first, then Open Food Facts (free, no key,
// crowd-sourced, has RU products + barcodes). AI stays as the last-resort fallback.

import { getDb } from '../db/database';

export type FoodSource = 'RU' | 'USDA' | 'OFF';

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

/** Search the bundled offline catalog by RU or EN name. */
export async function searchLocalFood(query: string, limit = 12): Promise<FoodHit[]> {
  const q = query.trim();
  if (!q) return [];
  const db = await getDb();
  const like = `%${q.toLowerCase()}%`;
  const rows = await db.getAllAsync<CatalogRow>(
    `SELECT name, name_en, kcal_per_100, protein_per_100, fat_per_100, carbs_per_100, source
       FROM food_catalog
      WHERE lower(name) LIKE ? OR lower(name_en) LIKE ?
      ORDER BY CASE WHEN lower(name) LIKE ? THEN 0 ELSE 1 END, length(name)
      LIMIT ?`,
    [like, like, `${q.toLowerCase()}%`, limit],
  );
  return rows.map((r) => ({
    name: r.name,
    kcalPer100: r.kcal_per_100,
    proteinPer100: r.protein_per_100,
    fatPer100: r.fat_per_100,
    carbsPer100: r.carbs_per_100,
    source: (r.source as FoodSource) || 'RU',
  }));
}

const OFF_SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';

/** Search Open Food Facts by name (online). Returns items with complete macros. */
export async function searchOpenFoodFacts(query: string, limit = 12): Promise<FoodHit[]> {
  const q = query.trim();
  if (!q) return [];
  const url =
    `${OFF_SEARCH}?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1` +
    `&fields=product_name,product_name_ru,brands,nutriments&page_size=${limit}&lc=ru`;
  const res = await fetch(url, { headers: { 'User-Agent': 'UspevatelApp/1.0 (personal)' } });
  if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
  const data = await res.json();
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

/** Offline catalog first; top up with Open Food Facts, de-duplicated by name. */
export async function searchFood(query: string, limit = 12): Promise<FoodHit[]> {
  const local = await searchLocalFood(query, limit);
  const seen = new Set(local.map((h) => h.name.toLowerCase()));
  let remote: FoodHit[] = [];
  try {
    remote = await searchOpenFoodFacts(query, limit);
  } catch {
    // offline / OFF down — local results are still fine
  }
  for (const hit of remote) {
    const key = hit.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    local.push(hit);
    if (local.length >= limit * 2) break;
  }
  return local;
}
