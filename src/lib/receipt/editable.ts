// Editable state for the receipt editor: a plain, serializable shape decoupled
// from the OCR/parser output so manually added rows look the same as parsed ones.

/** Whether a line is still as the parser read it, or the user has touched it. */
export type ItemState = "leido" | "editado";

export interface EditableItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  state: ItemState;
}

export interface EditableExtras {
  taxCents: number;
  tipCents: number;
  serviceCents: number;
  discountCents: number;
  /** TOTAL line detected on the receipt, if any; used only to show the mismatch check. */
  detectedTotalCents: number | null;
}

export const EMPTY_EXTRAS: EditableExtras = {
  taxCents: 0,
  tipCents: 0,
  serviceCents: 0,
  discountCents: 0,
  detectedTotalCents: null,
};

export function itemTotalCents(item: EditableItem): number {
  return item.quantity * item.unitPriceCents;
}

export function editorSubtotalCents(items: EditableItem[]): number {
  return items.reduce((sum, item) => sum + itemTotalCents(item), 0);
}

export function editorGrandTotalCents(
  items: EditableItem[],
  extras: EditableExtras,
): number {
  return (
    editorSubtotalCents(items) +
    extras.taxCents +
    extras.tipCents +
    extras.serviceCents -
    extras.discountCents
  );
}

let counter = 0;
export function newItemId(): string {
  counter += 1;
  return `new-${Date.now()}-${counter}`;
}
