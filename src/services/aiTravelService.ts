// AI parser for travel documents: photo of a ticket / booking confirmation →
// structured flight/hotel items ready for flightStore.

import { ollamaChatJson, VISION_MODEL } from './ollamaClient';
import { isValidDateStr, isValidTimeStr } from '../utils/date';

export interface ParsedTravelItem {
  kind: 'flight' | 'hotel';
  title: string;
  city?: string;
  address?: string;
  flightNumber?: string;
  departDate: string;  // YYYY-MM-DD
  departTime?: string; // HH:MM
  arriveDate?: string;
  arriveTime?: string;
  price?: number;
  currency?: string;
  notes?: string;
}

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['flight', 'hotel'] },
          title: { type: 'string' },
          city: { type: 'string' },
          address: { type: 'string' },
          flightNumber: { type: 'string' },
          departDate: { type: 'string' },
          departTime: { type: 'string' },
          arriveDate: { type: 'string' },
          arriveTime: { type: 'string' },
          price: { type: 'number' },
          currency: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['kind', 'title', 'departDate'],
      },
    },
  },
  required: ['items'],
};

const PROMPT = `Ты распознаёшь фото проездных документов: авиабилеты, посадочные талоны, брони отелей, ж/д билеты.
Для КАЖДОГО сегмента (пересадки = отдельные items):
- kind: "flight" (самолёт/поезд) или "hotel" (бронь жилья)
- title: перелёт — "Город1 — Город2" (города по-русски, если очевидно); отель — название отеля
- city: город (для отеля обязательно)
- address: для отеля — полный адрес с бланка (улица, дом, город), как написано; если есть координаты — "lat,lng"
- flightNumber: номер рейса (SU 123) если есть
- departDate: дата вылета/заезда YYYY-MM-DD; departTime: HH:MM если есть
- arriveDate/arriveTime: прилёт (для отеля arriveDate = дата выезда)
- price: число, currency: валюта (EUR/RUB/USD) — если указана цена
- notes: важное коротко (терминал, багаж, номер брони)
Ответ — только JSON: {"items":[{"kind":"flight","title":"Москва — Самара","departDate":"2026-07-10",...}]}
Без маркдауна. Если это не проездной документ — верни {"items":[]}.`;

export async function parseTravelPhoto(base64Image: string): Promise<ParsedTravelItem[]> {
  const parsed = await ollamaChatJson({ model: VISION_MODEL, user: PROMPT, images: [base64Image], format: SCHEMA });
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const items: ParsedTravelItem[] = rawItems.flatMap((raw: any) => {
    const kind = raw?.kind;
    const title = typeof raw?.title === 'string' ? raw.title.trim().slice(0, 300) : '';
    if ((kind !== 'flight' && kind !== 'hotel') || !title || !isValidDateStr(raw?.departDate)) return [];
    const price = raw?.price == null || raw.price === '' ? NaN : Number(raw.price);
    return [{
      kind,
      title,
      city: typeof raw.city === 'string' ? raw.city.trim().slice(0, 200) || undefined : undefined,
      address: typeof raw.address === 'string' ? raw.address.trim().slice(0, 500) || undefined : undefined,
      flightNumber: typeof raw.flightNumber === 'string' ? raw.flightNumber.trim().slice(0, 50) || undefined : undefined,
      departDate: raw.departDate,
      departTime: isValidTimeStr(raw.departTime) ? raw.departTime : undefined,
      arriveDate: isValidDateStr(raw.arriveDate) ? raw.arriveDate : undefined,
      arriveTime: isValidTimeStr(raw.arriveTime) ? raw.arriveTime : undefined,
      price: Number.isFinite(price) && price >= 0 && price <= 1_000_000_000 ? price : undefined,
      currency: typeof raw.currency === 'string' && /^[A-Za-zА-Яа-я]{2,8}$/.test(raw.currency.trim())
        ? raw.currency.trim().toUpperCase()
        : undefined,
      notes: typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 2000) || undefined : undefined,
    }];
  });
  if (items.length === 0) throw new Error('На фото не распознано билетов или броней');
  return items;
}
