import { fetchUpdates } from '../telegramService';

describe('telegramService timeouts', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('aborts a stalled request and reports a clear timeout error', async () => {
    jest.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    global.fetch = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal || undefined;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }) as typeof fetch;

    const request = fetchUpdates('test-token', 0);
    const assertion = expect(request).rejects.toThrow(
      'Получение обновлений Telegram: превышено время ожидания (15 с)',
    );
    await jest.advanceTimersByTimeAsync(15_000);

    await assertion;
    expect(requestSignal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});
