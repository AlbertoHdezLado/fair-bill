/** Small local cache of the last rooms this device visited, for quick re-entry. */

const STORAGE_KEY = "reasypt.recentRooms";
const MAX_ENTRIES = 5;

export interface RecentRoom {
  readonly code: string;
  readonly merchantName: string;
  readonly visitedAt: number;
}

function readAll(): RecentRoom[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentRoom =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as RecentRoom).code === "string" &&
        typeof (entry as RecentRoom).visitedAt === "number",
    );
  } catch {
    return [];
  }
}

export function getRecentRooms(): RecentRoom[] {
  return readAll().sort((a, b) => b.visitedAt - a.visitedAt);
}

export function rememberRoom(code: string, merchantName: string): void {
  if (typeof window === "undefined") return;
  const rest = readAll().filter((entry) => entry.code !== code);
  const next = [{ code, merchantName, visitedAt: Date.now() }, ...rest].slice(
    0,
    MAX_ENTRIES,
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function forgetRoom(code: string): void {
  if (typeof window === "undefined") return;
  const next = readAll().filter((entry) => entry.code !== code);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
