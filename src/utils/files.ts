/** Return a path-safe, bounded extension derived from a URI or display name. */
export function safeFileExtension(value: string | undefined, fallback = 'bin'): string {
  const withoutQuery = (value || '').split(/[?#]/, 1)[0];
  const candidate = (withoutQuery.split('.').pop() || '').toLowerCase();
  const safeFallback = /^[a-z0-9]{1,16}$/.test(fallback) ? fallback : 'bin';
  return /^[a-z0-9]{1,16}$/.test(candidate) ? candidate : safeFallback;
}
