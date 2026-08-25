// Shared types for the receipt line parser and its editable state.
// Every money amount is an integer number of cents, never a float.

export type ReceiptLineKind =
  "item" | "subtotal" | "total" | "tax" | "tip" | "service" | "discount";

export interface ParsedItemLine {
  id: string;
  kind: "item";
  raw: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface ParsedSummaryLine {
  id: string;
  kind: Exclude<ReceiptLineKind, "item">;
  raw: string;
  amountCents: number;
}

export type ParsedLine = ParsedItemLine | ParsedSummaryLine;

export interface ParsedReceipt {
  /** Lines printed before the first product, usually venue and contact data. */
  headerLines: string[];
  items: ParsedItemLine[];
  summary: ParsedSummaryLine[];
  /** Lines that had no price token and could not be classified. */
  unmatchedLines: string[];
  /** Sum of every item's totalCents. */
  itemsSubtotalCents: number;
  /** Best-effort total the receipt claims to have (TOTAL line, if found). */
  detectedTotalCents: number | null;
  /** true when the VAT quota is already part of each item price, so it must not be added again. */
  taxIncludedInItems: boolean;
  /** true when itemsSubtotalCents (+ extras) doesn't reconcile with detectedTotalCents. */
  mismatch: boolean;
  mismatchDeltaCents: number;
}
