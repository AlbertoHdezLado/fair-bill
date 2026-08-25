import type { EditableExtras, EditableItem } from "@/lib/receipt/editable";

/** Hands the captured bill from the home screen to the newly created room. */
export type PendingCapture =
  | "manual"
  | {
      items: EditableItem[];
      extras: EditableExtras;
    };

let pending: PendingCapture | null = null;

export function setPendingCapture(value: PendingCapture): void {
  pending = value;
}

export function takePendingCapture(): PendingCapture | null {
  const value = pending;
  pending = null;
  return value;
}
