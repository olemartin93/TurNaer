/**
 * Tiny localStorage cache with expiry. Every access is wrapped in try/catch
 * because storage can be unavailable (private mode, blocked site data).
 */
const PREFIX = "turnaer:";

type Entry<T> = { expiresAt: number; value: T };

export function readCache<T>(key: string, { allowExpired = false } = {}): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (!allowExpired && entry.expiresAt < Date.now()) return null;
    return entry.value;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T, ttlMs: number): void {
  const entry: Entry<T> = { expiresAt: Date.now() + ttlMs, value };
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota exceeded or storage blocked: drop old weather entries and give up quietly.
    pruneCache("wx:");
  }
}

export function pruneCache(keyPrefix = ""): void {
  try {
    const now = Date.now();
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(PREFIX + keyPrefix)) continue;
      const raw = window.localStorage.getItem(key);
      try {
        const entry = raw ? (JSON.parse(raw) as Entry<unknown>) : null;
        if (!entry || entry.expiresAt < now || keyPrefix) window.localStorage.removeItem(key);
      } catch {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}

export function clearAllCache(): void {
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

/** Plain (non-expiring) preference storage. */
export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + "pref:" + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writePref<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(PREFIX + "pref:" + key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
