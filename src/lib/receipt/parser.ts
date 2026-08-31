import type { OcrBoundingBox, OcrWord } from "@/lib/ocr/types";
import type {
  ParsedItemLine,
  ParsedReceipt,
  ParsedSummaryLine,
  ReceiptLineKind,
} from "./types";

// Rule-based parser: groups OCR words into visual lines, then walks them as
// the four sections a receipt is normally printed in — business/contact
// header, product lines, tax breakdown (base/quota/VAT/discount) and the
// grand total. Only the second section can yield products; the others are
// matched against keywords (TOTAL, SUBTOTAL, IVA, PROPINA, SERVICIO,
// DESCUENTO). Always fallible by design — the line editor is the safety net
// for whatever this misses.

const MISMATCH_TOLERANCE_CENTS = 2;

/** Matches money tokens with exactly 2 decimal digits, comma or dot separated. */
const MONEY_TOKEN_RE = /\d{1,3}(?:[ .]\d{3})*,\d{2}|\d+\.\d{2}/g;

/**
 * Three-part dates ("12.05.2024") and clock times ("21:30"): they are only
 * ever header data, but "12.05" alone would otherwise read as a price. Two
 * part numbers are left alone precisely because they usually are prices.
 */
const DATE_RE = /\b\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b/g;
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;

/** Fields printed above the product list: business, contact, date, table, waiter. */
const HEADER_PATTERNS = [
  /\bFECHA\b/,
  /\bHORA\b/,
  /\bMESA\b/,
  /\bCAMARER[OA]\b/,
  /\bMOZO\b/,
  /\bCOMENSALES\b/,
  /\bATENDID[OA]\b/,
  /\bFACTURA\b/,
  /\bTICKET\b/,
  /\bC\.?I\.?F\.?\b/,
  /\bN\.?I\.?F\.?\b/,
  /\bTEL(?:F|EFONO)?\.?\b/,
  /\bTFNO\.?\b/,
];

/** Matches "2 x 4,50" / "2x4.50" style quantity+unit-price patterns. */
const QTY_PRICE_RE = /(\d+)\s?[x×X]\s?(\d+(?:[.,]\d{2})?)/;

/**
 * Leading standalone quantity, e.g. "2 Cerveza 4,00" or "1,00 Cerveza 2,50"
 * (receipts often print the unit count formatted like a money amount, with
 * two decimals), optionally followed by a unit marker ("2x Cerveza",
 * "2 Ud Cerveza", "2 Uds. Cerveza").
 */
const LEADING_QTY_RE =
  /^(\d+(?:[.,]\d+)?)\s*(?:[x×]|uds?\.?|und\.?|unid\.?)?\s+(?=\D)/i;

// Order matters: more specific keywords (BASE/CUOTA/IVA, etc.) must be
// checked before the generic TOTAL pattern, because lines like "TOTAL IVA"
// or "BASE IMPONIBLE" (the pre-tax amount + applied tax quota that usually
// sit between the last product and the grand total) would otherwise be
const KEYWORD_PATTERNS: [RegExp, Exclude<ReceiptLineKind, "item">][] = [
  [/SUBTOTAL/, "subtotal"],
  [/BASE\s*IMPONIBLE|\bBASE\b/, "subtotal"],
  [/CUOTA|\bIVA\b/, "tax"],
  [/PROPINA/, "tip"],
  [/SERVICIO/, "service"],
  [/DESCUENTO/, "discount"],
  [/\bTOTAL\b/, "total"],
];

/** Keywords that mark the start of the tax/total sections: no product follows them. */
const TOTALS_SECTION_KINDS = new Set<Exclude<ReceiptLineKind, "item">>([
  "subtotal",
  "tax",
  "total",
]);

export function parseReceipt(words: OcrWord[]): ParsedReceipt {
  const groupedLines = groupWordsIntoLines(words);
  const items: ParsedItemLine[] = [];
  const headerLines: string[] = [];
  const summary: ParsedSummaryLine[] = [];
  const unmatchedLines: string[] = [];

  // Amount of every priced line, kept in OCR order so the final one is the
  // ticket total even when its label is classified as another summary kind.
  const numericCandidates: NumericCandidate[] = [];

  let itemCounter = 0;
  let summaryCounter = 0;
  let inTotalsSection = false;
  let seenFirstItem = false;

  for (const lineWords of groupedLines) {
    const raw = lineWords
      .map((w) => w.text)
      .join(" ")
      .trim();
    if (!raw) continue;

    const line = stripDatesAndTimes(raw);
    const keyword = detectKeyword(line);
    const priceTokens = findMoneyTokens(line);

    if (keyword) {
      // Lines like "TOTAL ARTÍCULOS: 4" (item count, not money) also match a
      // keyword but carry no money token; treating them as a real summary
      // line would wrongly overwrite the actual TOTAL with a 0 (or with the
      // wrong figure), since `detectedTotalCents` trusts the *last* "total"
      // line found. Skip keyword lines that have no money amount instead.
      if (priceTokens.length === 0) {
        unmatchedLines.push(raw);
        if (!seenFirstItem) headerLines.push(raw);
        continue;
      }
      if (TOTALS_SECTION_KINDS.has(keyword)) inTotalsSection = true;
      const amountCents = priceTokens.at(-1)!;
      summary.push({
        id: `summary-${summaryCounter++}`,
        kind: keyword,
        raw,
        amountCents,
      });
      numericCandidates.push({ amountCents, raw });
      continue;
    }

    // Neither the header nor the tax/total sections ever contain products,
    // whatever shape their lines happen to have (percentages, phone numbers,
    // table numbers…).
    if (inTotalsSection || (!seenFirstItem && isHeaderLine(line))) {
      unmatchedLines.push(raw);
      if (!seenFirstItem) headerLines.push(raw);
      // The last amount below the tax breakdown is the ticket total even if
      // its keyword was lost or the line contains other monetary values.
      if (inTotalsSection && priceTokens.length > 0) {
        numericCandidates.push({
          amountCents: priceTokens.at(-1)!,
          raw,
        });
      }
      continue;
    }

    const item = parseItemLine(line, priceTokens);
    if (item) {
      seenFirstItem = true;
      items.push({
        ...item,
        id: `item-${itemCounter++}`,
      });
      numericCandidates.push({
        amountCents: item.totalCents,
        raw,
        itemIndex: items.length - 1,
      });
    } else {
      unmatchedLines.push(raw);
      if (!seenFirstItem) headerLines.push(raw);
      // The last amount on an unclassified line is often the grand total
      // when its keyword wasn't recognized (e.g. "TOTAL" misread as garbage).
      if (priceTokens.length > 0) {
        numericCandidates.push({
          amountCents: priceTokens.at(-1)!,
          raw,
        });
      }
    }
  }

  const lastPricedLine = numericCandidates.at(-1);
  const hasSummaryTotal = summary.some((s) => s.kind === "total");
  if (lastPricedLine?.itemIndex !== undefined && hasSummaryTotal) {
    items.splice(lastPricedLine.itemIndex, 1);
  }

  if (
    !hasSummaryTotal &&
    lastPricedLine &&
    lastPricedLine.itemIndex === undefined
  ) {
    summary.push({
      id: `summary-${summaryCounter++}`,
      kind: "total",
      raw: lastPricedLine.raw,
      amountCents: lastPricedLine.amountCents,
    });
  }

  // Receipt totals are conventionally the last monetary value printed,
  // whether or not OCR preserved a preceding "TOTAL" label.
  const detectedTotalCents = lastPricedLine?.amountCents ?? null;

  const itemsSubtotalCents = items.reduce((sum, i) => sum + i.totalCents, 0);

  const taxCents = summary
    .filter((s) => s.kind === "tax")
    .reduce((sum, s) => sum + s.amountCents, 0);

  // When the product lines already add up to the printed total, the
  // base/quota section is just a breakdown of a tax-inclusive price (the
  // usual Spanish layout); adding the quota again would double-count it.
  const taxIncludedInItems =
    taxCents > 0 &&
    detectedTotalCents !== null &&
    Math.abs(itemsSubtotalCents - detectedTotalCents) <=
      MISMATCH_TOLERANCE_CENTS;

  const extrasCents =
    (taxIncludedInItems ? 0 : taxCents) +
    summary
      .filter((s) => s.kind === "tip" || s.kind === "service")
      .reduce((sum, s) => sum + s.amountCents, 0);
  const discountCents = summary
    .filter((s) => s.kind === "discount")
    .reduce((sum, s) => sum + s.amountCents, 0);

  let mismatch = false;
  let mismatchDeltaCents = 0;

  if (detectedTotalCents !== null) {
    const expected = itemsSubtotalCents + extrasCents - discountCents;
    mismatchDeltaCents = detectedTotalCents - expected;
    mismatch = Math.abs(mismatchDeltaCents) > MISMATCH_TOLERANCE_CENTS;

  }

  return {
    headerLines,
    items,
    summary,
    unmatchedLines,
    itemsSubtotalCents,
    detectedTotalCents,
    taxIncludedInItems,
    mismatch,
    mismatchDeltaCents,
  };
}

function parseItemLine(
  line: string,
  priceTokens: number[],
): Omit<ParsedItemLine, "id"> | null {
  if (priceTokens.length === 0) return null;

  const qtyPriceMatch = QTY_PRICE_RE.exec(line);
  if (qtyPriceMatch) {
    const quantity = Number.parseInt(qtyPriceMatch[1], 10);
    const unitPriceCents = parseMoneyToken(qtyPriceMatch[2]);
    const lastToken = priceTokens.at(-1)!;
    // If a trailing line-total is also present and differs from the unit
    // price, trust it as the total; otherwise derive it from qty * price.
    const totalCents =
      priceTokens.length > 1 && lastToken !== unitPriceCents
        ? lastToken
        : quantity * unitPriceCents;
    const name = stripMatchedTokens(line, [qtyPriceMatch[0]]).toUpperCase();
    return {
      kind: "item",
      raw: line,
      name,
      quantity,
      unitPriceCents,
      totalCents,
    };
  }

  const leadingQtyMatch = LEADING_QTY_RE.exec(line);
  const quantity = leadingQtyMatch ? parseQuantityToken(leadingQtyMatch[1]) : 1;

  // The leading quantity may itself look like a money token (e.g. "4,00"),
  // so re-derive the price(s) from whatever comes after it rather than
  // trusting the whole-line price tokens (which would include the quantity
  // itself).
  let totalCents = priceTokens.at(-1)!;
  let unitPriceCents = Math.round(totalCents / quantity);
  if (leadingQtyMatch) {
    const remainderTokens = findMoneyTokens(
      line.slice(leadingQtyMatch[0].length),
    );
    if (remainderTokens.length >= 2) {
      // "qty name unitPrice consumedPrice": the consumed amount can be lower
      // than qty * unitPrice (e.g. partially shared items), so it must be
      // read directly rather than derived.
      unitPriceCents = remainderTokens[0];
      totalCents = remainderTokens.at(-1)!;
    } else if (remainderTokens.length === 1) {
      totalCents = remainderTokens[0];
      unitPriceCents = Math.round(totalCents / quantity);
    }
  }

  const strip = leadingQtyMatch ? [leadingQtyMatch[0]] : [];
  const name = stripMatchedTokens(line, strip).toUpperCase();

  if (!name) return null;

  return {
    kind: "item",
    raw: line,
    name,
    quantity,
    unitPriceCents,
    totalCents,
  };
}

/** Parses a possibly-decimal quantity token like "2", "1,00" or "4.00". */
function parseQuantityToken(token: string): number {
  const value = Number.parseFloat(token.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function stripMatchedTokens(
  line: string,
  extraTokensToStrip: string[],
): string {
  let result = line;
  for (const token of extraTokensToStrip) {
    result = result.replace(token, " ");
  }
  // Remove every money-looking token (prices), keeping the description text.
  result = result.replace(MONEY_TOKEN_RE, " ");
  // Product names may contain OCR punctuation and symbols; retain only text
  // characters, digits, periods, and their word separators.
  result = result.replace(/[^\p{L}\p{N}.\s]/gu, " ").replace(/\s+/g, " ").trim();
  return result;
}

interface NumericCandidate {
  amountCents: number;
  raw: string;
  /** Present when this candidate came from `items` (index to splice out if promoted). */
  itemIndex?: number;
}

/** Smallest bounding box that contains every given word (or line of words). */
function unionBoundingBox(words: OcrWord[]): OcrBoundingBox {
  return words.reduce(
    (bounds, w) => ({
      x0: Math.min(bounds.x0, w.bbox.x0),
      y0: Math.min(bounds.y0, w.bbox.y0),
      x1: Math.max(bounds.x1, w.bbox.x1),
      y1: Math.max(bounds.y1, w.bbox.y1),
    }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
  );
}

function detectKeyword(line: string): Exclude<ReceiptLineKind, "item"> | null {
  const upper = normalizeForMatching(line);
  for (const [pattern, kind] of KEYWORD_PATTERNS) {
    if (pattern.test(upper)) return kind;
  }
  return null;
}

function isHeaderLine(line: string): boolean {
  const upper = normalizeForMatching(line);
  return HEADER_PATTERNS.some((pattern) => pattern.test(upper));
}

function stripDatesAndTimes(line: string): string {
  return line.replace(DATE_RE, " ").replace(TIME_RE, " ");
}

function normalizeForMatching(line: string): string {
  return line
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function findMoneyTokens(line: string): number[] {
  const tokens: number[] = [];
  for (const match of line.matchAll(MONEY_TOKEN_RE)) {
    tokens.push(parseMoneyToken(match[0]));
  }
  return tokens;
}

/** Converts a token like "1.234,56", "12,50" or "12.50" into integer cents. */
function parseMoneyToken(token: string): number {
  const cleaned = token.trim().replace(/\s/g, "");
  const commaIdx = cleaned.lastIndexOf(",");
  const dotIdx = cleaned.lastIndexOf(".");
  const decimalSepIdx = Math.max(commaIdx, dotIdx);

  if (decimalSepIdx === -1) {
    return Math.round(Number.parseFloat(cleaned) * 100) || 0;
  }

  const integerPart = cleaned.slice(0, decimalSepIdx).replace(/[.,]/g, "");
  const decimalPart = cleaned
    .slice(decimalSepIdx + 1)
    .replace(/\D/g, "")
    .padEnd(2, "0")
    .slice(0, 2);

  const integerValue = Number.parseInt(integerPart || "0", 10);
  const decimalValue = Number.parseInt(decimalPart || "0", 10);

  return integerValue * 100 + decimalValue;
}

/**
 * Groups words into visual lines using their vertical (Y) position: words
 * whose center falls within the same band as an existing line join it.
 */
function groupWordsIntoLines(words: OcrWord[]): OcrWord[][] {
  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0);

  const lines: OcrWord[][] = [];
  const lineCenters: number[] = [];

  for (const word of sorted) {
    const height = Math.max(1, word.bbox.y1 - word.bbox.y0);
    const center = (word.bbox.y0 + word.bbox.y1) / 2;

    const lineIndex = lineCenters.findIndex(
      (lineCenter) => Math.abs(center - lineCenter) < height * 0.6,
    );

    if (lineIndex === -1) {
      lines.push([word]);
      lineCenters.push(center);
    } else {
      const line = lines[lineIndex];
      line.push(word);
      lineCenters[lineIndex] =
        (lineCenters[lineIndex] * (line.length - 1) + center) / line.length;
    }
  }

  const order = lines
    .map((line, index) => ({ line, center: lineCenters[index] }))
    .sort((a, b) => a.center - b.center);

  return order.map(({ line }) =>
    [...line].sort((a, b) => a.bbox.x0 - b.bbox.x0),
  );
}
