/**
 * A fixed-window limit per caller for the events route. The caller's address is
 * only ever a key in this in-memory map, for at most one window: it is never
 * written to the database or a log (`docs/product/privacy-policy-inputs.md`).
 * Per server instance, so it is a floor under the host's own proxy limit, not a
 * replacement for it.
 */

export const EVENTS_PER_WINDOW = 120;
export const WINDOW_MS = 60_000;
/** Above this many callers in one window, expired entries are swept out. */
const MAX_KEYS = 10_000;

export interface RateLimiter {
  /** Counts one request from `key`; false when it is over the limit. */
  allow: (key: string, now?: number) => boolean;
}

export const createRateLimiter = (
  limit: number = EVENTS_PER_WINDOW,
  windowMs: number = WINDOW_MS,
): RateLimiter => {
  const windows = new Map<string, { start: number; count: number }>();

  const sweep = (now: number) => {
    for (const [key, entry] of windows) {
      if (now - entry.start >= windowMs) windows.delete(key);
    }
  };

  return {
    allow: (key, now = Date.now()) => {
      const held = windows.get(key);
      if (!held || now - held.start >= windowMs) {
        if (windows.size >= MAX_KEYS) sweep(now);
        // Still full of live callers after a sweep: keep memory bounded by
        // letting the newcomer through uncounted rather than growing the map.
        if (windows.size < MAX_KEYS) windows.set(key, { start: now, count: 1 });
        return true;
      }
      held.count += 1;
      return held.count <= limit;
    },
  };
};

/**
 * The caller's address as a trusted proxy reports it, or null when there is
 * none (local development), in which case nothing can be keyed and nothing is
 * limited.
 */
export const callerKey = (headers: Headers): string | null => {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || headers.get("x-real-ip")?.trim();
  return key ? key.slice(0, 64) : null;
};
