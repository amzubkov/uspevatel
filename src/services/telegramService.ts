const BASE = 'https://api.telegram.org/bot';
const TELEGRAM_API_TIMEOUT_MS = 15_000;

async function withTelegramTimeout<T>(label: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_API_TIMEOUT_MS);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label}: превышено время ожидания (${TELEGRAM_API_TIMEOUT_MS / 1000} с)`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export interface TgPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TgDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TgMessage {
  message_id: number;
  chat: { id: number; title?: string };
  date: number;
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  document?: TgDocument;
}

export interface TgUpdate {
  update_id: number;
  channel_post?: TgMessage;
  message?: TgMessage;
}

export interface TgResult {
  ok: boolean;
  result: TgUpdate[];
}

export async function fetchUpdates(token: string, offset: number): Promise<TgUpdate[]> {
  const url = `${BASE}${token}/getUpdates?offset=${offset}&limit=100&allowed_updates=["channel_post","message"]`;
  return withTelegramTimeout('Получение обновлений Telegram', async (signal) => {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Telegram API ${res.status}: ${await res.text()}`);
    const data: TgResult = await res.json();
    if (!data.ok) throw new Error('Telegram API returned ok=false');
    return data.result;
  });
}

export async function getFileUrl(token: string, fileId: string): Promise<string> {
  return withTelegramTimeout('Получение ссылки на файл Telegram', async (signal) => {
    const res = await fetch(`${BASE}${token}/getFile?file_id=${fileId}`, { signal });
    if (!res.ok) throw new Error(`getFile failed: ${res.status}`);
    const data = await res.json();
    if (!data.ok || !data.result?.file_path) throw new Error('getFile: no file_path');
    return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
  });
}

export async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  await withTelegramTimeout('Отправка сообщения Telegram', async (signal) => {
    const res = await fetch(`${BASE}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal,
    });
    if (!res.ok) throw new Error(`sendMessage failed: ${res.status}: ${await res.text()}`);
  });
}

export async function validateToken(token: string): Promise<string> {
  return withTelegramTimeout('Проверка токена Telegram', async (signal) => {
    const res = await fetch(`${BASE}${token}/getMe`, { signal });
    if (!res.ok) throw new Error(`Неверный токен (${res.status})`);
    const data = await res.json();
    if (!data.ok) throw new Error('Неверный токен');
    return data.result.first_name || data.result.username || 'Bot';
  });
}
