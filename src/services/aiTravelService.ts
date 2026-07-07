// AI parser for travel documents: photo of a ticket / booking confirmation →
// structured flight/hotel items ready for flightStore.

import { ollamaChatJson, VISION_MODEL } from './ollamaClient';

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
  const items: ParsedTravelItem[] = (parsed.items || []).filter(
    (i: any) => i && i.title && /^\d{4}-\d{2}-\d{2}$/.test(i.departDate || '') && (i.kind === 'flight' || i.kind === 'hotel')
  );
  if (items.length === 0) throw new Error('На фото не распознано билетов или броней');
  return items;
}
