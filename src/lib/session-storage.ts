import type { SplitResult } from "@/lib/split";
import type { EditableExtras, EditableItem } from "@/lib/receipt/editable";
import type { LocalClaims } from "@/lib/local-claims";

const STORAGE_KEY = "fairBill.session.v2";

export type PersistedSession = {
  items: EditableItem[];
  extras: EditableExtras;
  showEditor: boolean;
  localStage: "bill" | "names" | "identity" | "board" | "results";
  participants: { key: string; name: string }[];
  claims: LocalClaims;
  selfKey: string | null;
  localResult: SplitResult | null;
};

export function loadSession(): PersistedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed as PersistedSession;
  } catch {
    return null;
  }
}

export function saveSession(session: PersistedSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage lleno o bloqueado: la sesión simplemente no se conserva.
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignorado a propósito.
  }
}
