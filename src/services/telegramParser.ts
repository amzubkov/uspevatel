export interface ParsedTask {
  type: 'task';
  subject: string;
  project?: string;
  deadline?: string; // YYYY-MM-DD
  photoFileId?: string;
  msgDate: number;   // unix ts from telegram
}

export interface ParsedFlight {
  type: 'flight';
  kind: 'flight' | 'hotel';
  title: string;       // SVO-KUF or hotel name
  city?: string;       // city for hotels
  departDate: string;  // YYYY-MM-DD (check-in for hotel)
  departTime?: string; // HH:MM
  arriveDate?: string; // (check-out for hotel)
  arriveTime?: string;
  notes?: string;
  price?: number;
  currency?: string;
  photoFileId?: string;
  msgDate: number;
}

export interface ParsedDoc {
  type: 'doc';
  name: string;
  photoFileId?: string; // largest photo file_id from telegram
  msgDate: number;
}

export interface ParsedHealth {
  type: 'health';
  results: { name: string; value: number; date?: string }[];
  metrics: { name: string; unit: string; refMin?: number; refMax?: number }[];
  date?: string;
  msgDate: number;
}

export type ParsedItem = ParsedTask | ParsedFlight | ParsedDoc | ParsedHealth;

// Normalise date: "14.04.2026" → "2026-04-14", "2026-04-14" stays as is
function normaliseDate(s: string): string | null {
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return null;
}

// Parse "14.04.2026 14:30" or "2026-04-14 14:30" or just date
function parseDatetime(s: string): { date: string; time?: string } | null {
  const parts = s.trim().split(/\s+/);
  const date = normaliseDate(parts[0]);
  if (!date) return null;
  const timeMatch = parts[1]?.match(/^(\d{1,2}):(\d{2})$/);
  return { date, time: timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : undefined };
}

// Parse text (or caption) + optional photo
export function parseMessage(text: string, msgDate: number, photoFileId?: string): ParsedItem | null {
  const trimmed = text.trim();

  // /task [project:XXX] <subject>[, <deadline>]
  const taskMatch = trimmed.match(/^\/task\s+(.+)/i);
  if (taskMatch) {
    let body = taskMatch[1].trim();
    // Extract project:XXX
    let project: string | undefined;
    const projMatch = body.match(/^project:(\S+)\s+/i);
    if (projMatch) {
      project = projMatch[1];
      body = body.substring(projMatch[0].length).trim();
    }
    const lastComma = body.lastIndexOf(',');
    if (lastComma > 0) {
      const maybeDateStr = body.substring(lastComma + 1).trim();
      const dt = parseDatetime(maybeDateStr);
      if (dt) {
        return { type: 'task', subject: body.substring(0, lastComma).trim(), project, deadline: dt.date, photoFileId, msgDate };
      }
    }
    return { type: 'task', subject: body, project, photoFileId, msgDate };
  }

  // /flight <route>, <depart_date> [time][, <arrive_date> [time]]
  // /hotel <city>, <name>, <check-in>, <check-out>  OR  /hotel <name>, <check-in>, <check-out>
  const flightMatch = trimmed.match(/^\/flight\s+(.+)/i);
  const hotelMatch = trimmed.match(/^\/hotel\s+(.+)/i);
  if (flightMatch || hotelMatch) {
    const isHotel = !!hotelMatch;
    const body = (flightMatch || hotelMatch)![1];
    const parts = body.split(',').map((p) => p.trim());
    if (parts.length < 2) return null;
    let dateIdx = -1;
    for (let i = 1; i < parts.length; i++) {
      if (parseDatetime(parts[i])) { dateIdx = i; break; }
    }
    if (dateIdx === -1) return null;

    let title: string;
    let city: string | undefined;
    if (isHotel && dateIdx >= 2) {
      city = parts.slice(0, dateIdx - 1).join(', ').trim();
      title = parts[dateIdx - 1].trim();
    } else {
      title = parts.slice(0, dateIdx).join(', ').trim();
    }
    const depart = parseDatetime(parts[dateIdx]);
    if (!depart || !title) return null;
    const arrive = parts[dateIdx + 1] ? parseDatetime(parts[dateIdx + 1]) : undefined;
    // Everything after dates: check for price (e.g. "150€", "5000₽", "200 EUR", "3000 RUB"), rest goes to notes
    const notesStartIdx = dateIdx + (arrive ? 2 : 1);
    const tail = parts.slice(notesStartIdx);
    let price: number | undefined;
    let currency: string | undefined;
    const notesParts: string[] = [];
    for (const p of tail) {
      const priceMatch = p.match(/^(\d+(?:[.,]\d+)?)\s*([€₽]|EUR|RUB)?$/i);
      if (priceMatch && !price) {
        price = parseFloat(priceMatch[1].replace(',', '.'));
        const cur = (priceMatch[2] || '').toUpperCase();
        currency = cur === '₽' || cur === 'RUB' ? 'RUB' : cur === '€' || cur === 'EUR' ? 'EUR' : undefined;
      } else {
        notesParts.push(p);
      }
    }
    const notes = notesParts.join(', ').trim() || undefined;
    return { type: 'flight', kind: isHotel ? 'hotel' : 'flight', title, city, departDate: depart.date, departTime: depart.time, arriveDate: arrive?.date, arriveTime: arrive?.time, notes, price, currency, photoFileId, msgDate };
  }

  // /doc <name> (with optional photo attached)
  const docMatch = trimmed.match(/^\/doc\s+(.+)/i);
  if (docMatch) {
    return { type: 'doc', name: docMatch[1].trim(), photoFileId, msgDate };
  }

  // /health - multi-line: each line "name, value[, unit, refMin, refMax]"
  // optional last line with date (YYYY-MM-DD or DD.MM.YYYY)
  const healthMatch = trimmed.match(/^\/health\s+([\s\S]+)/i);
  if (healthMatch) {
    const lines = healthMatch[1].split('\n').map((l) => l.trim()).filter(Boolean);
    const results: ParsedHealth['results'] = [];
    const metrics: ParsedHealth['metrics'] = [];
    let date: string | undefined;
    for (const line of lines) {
      if (line === '---') continue;
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      const maybeDate = normaliseDate(parts[0]);
      if (maybeDate && parts.length === 1) { date = maybeDate; continue; }
      if (parts.length < 2) continue;
      const maybeValue = parseFloat(parts[1].replace(',', '.'));
      if (!isNaN(maybeValue)) {
        // Result: name, value[, date]
        const inlineDate = parts[2] ? normaliseDate(parts[2]) : undefined;
        results.push({ name: parts[0], value: maybeValue, date: inlineDate || undefined });
      } else {
        // Metric def: name, unit, refMin, refMax
        const refMin = parts[2] ? parseFloat(parts[2].replace(',', '.')) : undefined;
        const refMax = parts[3] ? parseFloat(parts[3].replace(',', '.')) : undefined;
        metrics.push({ name: parts[0], unit: parts[1], refMin: isNaN(refMin as any) ? undefined : refMin, refMax: isNaN(refMax as any) ? undefined : refMax });
      }
    }
    if (results.length > 0 || metrics.length > 0) {
      return { type: 'health', results, metrics, date, msgDate };
    }
  }

  return null;
}
