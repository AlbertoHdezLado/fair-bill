import { describe, expect, it } from "vitest";
import { parseReceipt } from "./parser";
import type { OcrWord } from "@/lib/ocr/types";

let nextY = 0;

/** Builds fake OCR words for a line of text, each word getting a distinct x range. */
function lineWords(text: string): OcrWord[] {
  const y0 = nextY;
  const y1 = nextY + 20;
  nextY += 30;

  return text.split(" ").map((word, index) => ({
    text: word,
    confidence: 95,
    bbox: { x0: index * 60, y0, x1: index * 60 + 50, y1 },
  }));
}

function receiptWords(lines: string[]): OcrWord[] {
  nextY = 0;
  return lines.flatMap(lineWords);
}

describe("parseReceipt", () => {
  it("parses simple qty/description/price lines", () => {
    const words = receiptWords([
      "1 Cerveza 2,50",
      "2 Patatas 4,00",
      "SUBTOTAL 6,50",
      "TOTAL 6,50",
    ]);

    const result = parseReceipt(words);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      name: "CERVEZA",
      quantity: 1,
      unitPriceCents: 250,
      totalCents: 250,
    });
    expect(result.items[1]).toMatchObject({
      name: "PATATAS",
      quantity: 2,
      unitPriceCents: 200,
      totalCents: 400,
    });
    expect(result.itemsSubtotalCents).toBe(650);
    expect(result.detectedTotalCents).toBe(650);
    expect(result.mismatch).toBe(false);
  });

  it("parses 'qty x price' patterns", () => {
    const words = receiptWords(["2 x 4,50 Vino"]);

    const result = parseReceipt(words);

    expect(result.items[0]).toMatchObject({
      quantity: 2,
      unitPriceCents: 450,
      totalCents: 900,
    });
  });

  it("flags a mismatch against the detected total", () => {
    const words = receiptWords([
      "1 Cafe 1,50",
      "1 Tostada 2,00",
      "TOTAL 10,00",
    ]);

    const result = parseReceipt(words);

    expect(result.itemsSubtotalCents).toBe(350);
    expect(result.detectedTotalCents).toBe(1000);
    expect(result.mismatch).toBe(true);
    expect(result.mismatchDeltaCents).toBe(650);
  });

  it("drops the worst-scored item when that alone reconciles the total", () => {
    const words = receiptWords([
      "1 Cafe 1,50",
      "1 Tostada 2,00",
      "999 3,00 9,00",
      "TOTAL 3,50",
    ]);

    const result = parseReceipt(words);

    expect(result.items).toHaveLength(2);
    expect(result.items.map((i) => i.name)).toEqual(["CAFE", "TOSTADA"]);
    expect(result.itemsSubtotalCents).toBe(350);
    expect(result.mismatch).toBe(false);
    expect(result.mismatchDeltaCents).toBe(0);
  });

  it("keeps every item when no single one can fix the mismatch", () => {
    const words = receiptWords([
      "1 Cafe 1,50",
      "1 Tostada 2,00",
      "TOTAL 10,00",
    ]);

    const result = parseReceipt(words);

    expect(result.items).toHaveLength(2);
    expect(result.mismatch).toBe(true);
  });

  it("separates tax, tip and discount from products", () => {
    const words = receiptWords([
      "1 Menu 10,00",
      "IVA 1,00",
      "PROPINA 1,00",
      "DESCUENTO 0,50",
      "TOTAL 11,50",
    ]);

    const result = parseReceipt(words);

    expect(result.items).toHaveLength(1);
    expect(result.summary.map((s) => s.kind)).toEqual(
      expect.arrayContaining(["tax", "tip", "discount", "total"]),
    );
    expect(result.mismatch).toBe(false);
  });

  it("does not mistake the base/quota lines between products and TOTAL for the grand total", () => {
    const words = receiptWords([
      "1 Menu 10,00",
      "BASE IMPONIBLE 10,00",
      "TOTAL IVA 10% 1,00",
      "TOTAL 11,00",
    ]);

    const result = parseReceipt(words);

    expect(result.items).toHaveLength(1);
    expect(result.summary.map((s) => s.kind)).toEqual([
      "subtotal",
      "tax",
      "total",
    ]);
    expect(result.detectedTotalCents).toBe(1100);
    expect(result.mismatch).toBe(false);
  });

  it("strips a unit marker attached to a leading quantity", () => {
    const words = receiptWords(["2x Cerveza 4,00", "2 Uds Vino 8,00"]);

    const result = parseReceipt(words);

    expect(result.items[0]).toMatchObject({
      name: "CERVEZA",
      quantity: 2,
      unitPriceCents: 200,
      totalCents: 400,
    });
    expect(result.items[1]).toMatchObject({
      name: "VINO",
      quantity: 2,
      unitPriceCents: 400,
      totalCents: 800,
    });
  });

  it("keeps letters, numbers, and periods in detected product names", () => {
    const words = receiptWords(["1 Cafe. !#2* 3,50"]);

    const result = parseReceipt(words);

    expect(result.items[0].name).toBe("CAFE. 2");
  });

  it("reads a decimal-formatted leading quantity (e.g. '4,00') as a unit count", () => {
    const words = receiptWords(["4,00 Cerveza 2,50", "1,00 Cafe 1,20"]);

    const result = parseReceipt(words);

    expect(result.items[0]).toMatchObject({
      name: "CERVEZA",
      quantity: 4,
      totalCents: 250,
      unitPriceCents: 63,
    });
    expect(result.items[1]).toMatchObject({
      name: "CAFE",
      quantity: 1,
      totalCents: 120,
      unitPriceCents: 120,
    });
  });

  it("detects the total by magnitude + bottom-right position when its keyword wasn't recognized", () => {
    const words = receiptWords([
      "1 Cerveza 2,50",
      "2 Patatas 4,00",
      "1 Menu 6,00",
    ]);
    // Grand total, badly OCR'd (no "TOTAL" keyword survives), placed on its
    // own line at the bottom, further right than the product lines above.
    words.push({
      text: "12,50",
      confidence: 90,
      bbox: { x0: 260, y0: 90, x1: 320, y1: 110 },
    });

    const result = parseReceipt(words);

    expect(result.items).toHaveLength(3);
    expect(result.summary).toEqual([
      expect.objectContaining({ kind: "total", amountCents: 1250 }),
    ]);
    expect(result.detectedTotalCents).toBe(1250);
  });
});
