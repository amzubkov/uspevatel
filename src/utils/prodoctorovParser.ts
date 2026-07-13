// Parser for prodoctorov.ru pages: fetch + extract title/og-tags.
// Returns whatever we managed to find. Manual fallback in UI when this returns null.

export interface ProdoctorovData {
  name?: string;
  specialty?: string;
  city?: string;
  clinic?: string;
  url: string;
  rawTitle?: string; // for debugging — what we actually fetched
}

const TITLE_RE = /<title>([\s\S]*?)<\/title>/i;
const META_OG_TITLE_RE = /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i;
const META_OG_DESC_RE = /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i;
const META_DESC_RE = /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i;

const NOISE_RE = /^(отзывы|цены|контакты|рейтинг|запись на приём|запись на прием|запись|услуги|приём|прием|стаж|расписание|телефон|адрес|стоимость|\d+\s*отзыв)/i;

// og:title on prodoctorov is often the generic site tagline, not the page title.
const GENERIC_OG_RE = /(сайт отзывов|№\s*1\s+в\s+росси|prodoctorov\s*[–—-])/i;

const SPECIALTY_RE = /(врач[- ]|олог\b|хирург|терапевт|педиатр|стоматолог|невро|кардио|гастро|эндокри|психо|травма|уролог|гинеколог|отоларин|рентген|диетолог|сомнолог|косметолог|дерматолог|фтизиатр|онколог|нарколог|маммолог|нейро|сурдолог|логопед|ортодонт|массажист|фельдшер)/i;

const CLOUDFLARE_RE = /just a moment|cloudflare|attention required|access denied|verifying you/i;
const FETCH_TIMEOUT_MS = 15_000;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function extract(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  return m ? decodeEntities(m[1].trim()) : undefined;
}

// Split a segment that fuses specialty + name like "Невролог Иванов Иван Иванович"
// into specialty="Невролог", name="Иванов Иван Иванович".
function splitFusedSpecialtyName(seg: string): { specialty: string; name: string } | null {
  const tokens = seg.split(/\s+/);
  if (tokens.length < 2) return null;
  // Try first 1-2 tokens as specialty if they match SPECIALTY_RE; rest as name
  for (let take = 2; take >= 1; take--) {
    if (tokens.length < take + 1) continue;
    const head = tokens.slice(0, take).join(' ');
    const tail = tokens.slice(take).join(' ');
    if (SPECIALTY_RE.test(head) && /^[А-ЯЁA-Z]/.test(tail)) {
      return { specialty: head, name: tail };
    }
  }
  return null;
}

function parseProdoctorovTitle(raw: string): { name?: string; specialty?: string; city?: string; clinic?: string } {
  let s = raw.trim();
  // Strip site-name suffix
  s = s.replace(/\s*[—–\-|]\s*ПроДокторов.*$/i, '').trim();
  s = s.replace(/\s*[—–\-|]\s*prodoctorov.*$/i, '').trim();

  // Split on em/en dashes, pipe, comma, and " - " (space-hyphen-space) — never plain hyphen
  // to keep "Санкт-Петербург" intact.
  const parts = s.split(/\s*[—–|,]\s*|\s-\s/).map((p) => p.trim()).filter(Boolean);
  // Drop noisy segments (отзывы / цены / запись / etc)
  const filtered = parts.filter((p) => !NOISE_RE.test(p));
  if (filtered.length === 0) return {};

  const out: { name?: string; specialty?: string; city?: string; clinic?: string } = {};

  // Index of the segment that looks like a specialty
  let spIdx = -1;
  for (let i = 0; i < filtered.length; i++) {
    if (SPECIALTY_RE.test(filtered[i])) { spIdx = i; break; }
  }

  if (spIdx === 0) {
    // Specialty fused with name in first segment, or first segment is pure specialty
    const fused = splitFusedSpecialtyName(filtered[0]);
    if (fused) {
      out.specialty = fused.specialty;
      out.name = fused.name;
    } else {
      out.specialty = filtered[0];
      if (filtered.length > 1) out.name = filtered[1];
    }
  } else if (spIdx > 0) {
    out.name = filtered[0];
    out.specialty = filtered[spIdx];
  } else {
    out.name = filtered[0];
  }

  // Detect "X в клинике Y" inside specialty
  if (out.specialty) {
    const inClinic = out.specialty.match(/^(.+?)\s+в\s+клинике\s+(.+)$/i);
    if (inClinic) {
      out.specialty = inClinic[1].trim();
      out.clinic = inClinic[2].trim();
    }
  }

  // City: take last filtered segment if it isn't already used and looks like a place
  const last = filtered[filtered.length - 1];
  if (last && last !== out.name && last !== out.specialty && last !== out.clinic && !SPECIALTY_RE.test(last)) {
    out.city = last;
  }

  return out;
}

export async function fetchProdoctorov(url: string): Promise<ProdoctorovData | null> {
  if (!/prodoctorov\.ru/i.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; RMX3706) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) return { url, rawTitle: `HTTP ${res.status}` };
    const html = await res.text();
    const ogTitle = extract(html, META_OG_TITLE_RE);
    const title = extract(html, TITLE_RE);
    const desc = extract(html, META_OG_DESC_RE) || extract(html, META_DESC_RE);
    // Prefer <title> on prodoctorov; og:title is usually the generic site tagline.
    const ogUsable = ogTitle && !GENERIC_OG_RE.test(ogTitle) ? ogTitle : undefined;
    const source = title || ogUsable || ogTitle;
    if (!source) return { url, rawTitle: '(no title)' };
    if (CLOUDFLARE_RE.test(source)) return { url, rawTitle: source }; // blocked
    const parsed = parseProdoctorovTitle(source);
    if (!parsed.clinic && desc) {
      const m = desc.match(/в\s+клинике\s+([^.,]+)/i);
      if (m) parsed.clinic = m[1].trim();
    }
    return { ...parsed, url, rawTitle: source };
  } catch (e: any) {
    if (controller.signal.aborted) {
      return { url, rawTitle: `timeout: ${FETCH_TIMEOUT_MS / 1000}s` };
    }
    return { url, rawTitle: `error: ${e?.message || e}` };
  } finally {
    clearTimeout(timer);
  }
}

// Extract a prodoctorov URL (if any) from a free-text message
export function extractProdoctorovUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s]*prodoctorov\.ru\/[^\s]*/i);
  return m ? m[0] : null;
}
