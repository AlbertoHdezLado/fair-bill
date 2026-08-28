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

/** Compressed copy of the scanned photo, handed off the same way as the parsed bill. */
let pendingImage: string | null = null;

export function setPendingReceiptImage(dataUrl: string): void {
  pendingImage = dataUrl;
}

export function takePendingReceiptImage(): string | null {
  const value = pendingImage;
  pendingImage = null;
  return value;
}
