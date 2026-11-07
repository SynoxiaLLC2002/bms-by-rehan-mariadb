// Stale-while-revalidate for a value read on every request in front of the
// site (middleware: redirects, the content-language set, the LiteSpeed cache
// setting) — see the comments in redirects.ts / edgeLanguages.ts / lscache.ts
// this replaced for the reasoning. Awaiting a reload on every TTL expiry meant
// one visitor per window paid a full database round trip before any HTML
// started; this answers a warm cache immediately and refreshes behind the
// response, collapsing concurrent refreshes onto one in-flight load.

export interface StaleCache<T> {
  /** The cached value, refreshing in the background if the TTL has lapsed. */
  get(): Promise<T>;
  /** Drops the cached value — effective only in the process that calls it. */
  invalidate(): void;
}

/**
 * @param load Fetches a fresh value. A rejection is swallowed: the last good
 *   value (or `fallback` when there has never been one) is kept instead, so an
 *   unreachable database cannot take every request down with it.
 * @param fallback Returned when `load` fails before anything has ever loaded.
 * @param ttlMs How long a cached value is served before a background refresh
 *   is kicked off. A stale value is still returned immediately either way.
 */
export function staleWhileRevalidate<T>(
  load: () => Promise<T>,
  fallback: T,
  ttlMs: number
): StaleCache<T> {
  let cache: T | null = null;
  let loadedAt = 0;
  let inFlight: Promise<T> | null = null;

  function refresh(): Promise<T> {
    if (!inFlight) {
      inFlight = load()
        .then((value) => {
          cache = value;
          loadedAt = Date.now();
          return value;
        })
        .catch(() => cache ?? fallback)
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  }

  return {
    async get(): Promise<T> {
      if (!cache) return refresh();
      if (Date.now() - loadedAt >= ttlMs) void refresh();
      return cache;
    },
    invalidate(): void {
      cache = null;
      loadedAt = 0;
    },
  };
}
