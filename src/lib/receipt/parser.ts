import type { OcrBoundingBox, OcrWord } from "@/lib/ocr/types";
import type {
  ItemParseConfidence,
  ParsedItemLine,
  ParsedReceipt,
  ParsedSummaryLine,
  ReceiptLineKind,
} from "./types";

// Rule-based parser: groups OCR words into visual lines, then matches each
// line against "quantity? description price" patterns and a set of keywords
// (TOTAL, SUBTOTAL, IVA, PROPINA, SERVICIO, DESCUENTO) that separate summary
// figures from actual products. Always fallible by design — the line editor
// is the safety net for whatever this misses.

const MISMATCH_TOLERANCE_CENTS = 2;

/** Matches money tokens with exactly 2 decimal digits, comma or dot separated. */
const MONEY_TOKEN_RE = /\d{1,3}(?:[ .]\d{3})*,\d{2}|\d+\.\d{2}/g;

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
// misclassified as the receipt's final total.
const KEYWORD_PATTERNS: [RegExp, Exclude<ReceiptLineKind, "item">][] = [
  [/SUBTOTAL/, "subtotal"],
  [/BASE\s*IMPONIBLE|\bBASE\b/, "subtotal"],
  [/CUOTA|\bIVA\b/, "tax"],
  [/PROPINA/, "tip"],
  [/SERVICIO/, "service"],
  [/DESCUENTO/, "discount"],
  [/\bTOTAL\b/, "total"],
];

export function parseReceipt(words: OcrWord[]): ParsedReceipt {
  const groupedLines = groupWordsIntoLines(words);
  const pageBounds = unionBoundingBox(words);

  const items: ParsedItemLine[] = [];
  const itemScores: number[] = [];
  const summary: ParsedSummaryLine[] = [];
  const unmatchedLines: string[] = [];

  // Amount + on-page position of every item and bare-number line, so a
  // fallback pass can spot the grand total even when its keyword ("TOTAL"
  // etc.) wasn't recognized by OCR — see findPositionalTotal below.
  const numericCandidates: NumericCandidate[] = [];

  let itemCounter = 0;
  let summaryCounter = 0;

  for (const lineWords of groupedLines) {
    const line = lineWords
      .map((w) => w.text)
      .join(" ")
      .trim();
    if (!line) continue;

    const keyword = detectKeyword(line);
    const priceTokens = findMoneyTokens(line);

    if (keyword) {
      // Lines like "TOTAL ARTÍCULOS: 4" (item count, not money) also match a
      // keyword but carry no money token; treating them as a real summary
      // line would wrongly overwrite the actual TOTAL with a 0 (or with the
      // wrong figure), since `detectedTotalCents` trusts the *last* "total"
      // line found. Skip keyword lines that have no money amount instead.
      if (priceTokens.length === 0) {
        unmatchedLines.push(line);
        continue;
      }
      const amountCents = priceTokens.at(-1)!;
      summary.push({
        id: `summary-${summaryCounter++}`,
        kind: keyword,
        raw: line,
        amountCents,
      });
      continue;
    }

    const item = parseItemLine(line, priceTokens, lineWords);
    if (item) {
      const { score, ...itemFields } = item;
      items.push({
        ...itemFields,
        id: `item-${itemCounter++}`,
        confidence: "medium",
      });
      itemScores.push(score);
      numericCandidates.push({
        amountCents: item.totalCents,
        bbox: unionBoundingBox(lineWords),
        raw: line,
        itemIndex: items.length - 1,
      });
    } else {
      unmatchedLines.push(line);
      // A bare number with no product name is often the grand total when
      // its keyword wasn't recognized (e.g. "TOTAL" misread as garbage).
      if (priceTokens.length === 1) {
        numericCandidates.push({
          amountCents: priceTokens[0],
          bbox: unionBoundingBox(lineWords),
          raw: line,
        });
      }
    }
  }

  // Only fall back to position-based detection when no "TOTAL" keyword line
  // was found at all — a correctly recognized keyword always wins.
  if (!summary.some((s) => s.kind === "total")) {
    const positionalTotal = findPositionalTotal(numericCandidates, pageBounds);
    if (positionalTotal) {
      if (positionalTotal.itemIndex !== undefined) {
        items.splice(positionalTotal.itemIndex, 1);
      }
      summary.push({
        id: `summary-${summaryCounter++}`,
        kind: "total",
        raw: positionalTotal.raw,
        amountCents: positionalTotal.amountCents,
      });
    }
  }

  // Receipts often print more than one "total"-labelled line (e.g. a partial
  // total before extras); the grand total is the last one that appears.
  const totalLines = summary.filter((s) => s.kind === "total");
  const detectedTotalCents = totalLines.at(-1)?.amountCents ?? null;

  const extrasCents = summary
    .filter((s) => s.kind === "tax" || s.kind === "tip" || s.kind === "service")
    .reduce((sum, s) => sum + s.amountCents, 0);
  const discountCents = summary
    .filter((s) => s.kind === "discount")
    .reduce((sum, s) => sum + s.amountCents, 0);

  let itemsSubtotalCents = items.reduce((sum, i) => sum + i.totalCents, 0);
  let mismatch = false;
  let mismatchDeltaCents = 0;

  if (detectedTotalCents !== null) {
    const expected = itemsSubtotalCents + extrasCents - discountCents;
    mismatchDeltaCents = detectedTotalCents - expected;
    mismatch = Math.abs(mismatchDeltaCents) > MISMATCH_TOLERANCE_CENTS;

    // A mismatch is often a single bogus item line (e.g. a stray price OCR
    // misread as a product). If dropping the single worst-scored item would
    // reconcile the total, assume that's what happened and drop it;
    // otherwise leave every item as parsed and let the user resolve it.
    if (mismatch && items.length > 0) {
      const worstIndex = itemScores.reduce(
        (worst, score, index) => (score < itemScores[worst] ? index : worst),
        0,
      );
      const candidateSubtotal =
        itemsSubtotalCents - items[worstIndex].totalCents;
      const candidateDelta =
        detectedTotalCents - (candidateSubtotal + extrasCents - discountCents);

      if (Math.abs(candidateDelta) <= MISMATCH_TOLERANCE_CENTS) {
        items.splice(worstIndex, 1);
        itemScores.splice(worstIndex, 1);
        itemsSubtotalCents = candidateSubtotal;
        mismatchDeltaCents = candidateDelta;
        mismatch = false;
      }
    }
  }

  const confidences = assignConfidenceByScore(itemScores);
  items.forEach((item, index) => {
    item.confidence = confidences[index];
  });

  return {
    items,
    summary,
    unmatchedLines,
    itemsSubtotalCents,
    detectedTotalCents,
    mismatch,
    mismatchDeltaCents,
  };
}

function parseItemLine(
  line: string,
  priceTokens: number[],
  lineWords: OcrWord[],
): (Omit<ParsedItemLine, "id" | "confidence"> & { score: number }) | null {
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
    const score = computeItemScore({
      name,
      quantity,
      unitPriceCents,
      totalCents,
      priceTokens,
      lineWords,
      hasExplicitQuantity: true,
    });
    return {
      kind: "item",
      raw: line,
      name,
      quantity,
      unitPriceCents,
      totalCents,
      score,
    };
  }

  const leadingQtyMatch = LEADING_QTY_RE.exec(line);
  const quantity = leadingQtyMatch ? parseQuantityToken(leadingQtyMatch[1]) : 1;

  // The leading quantity may itself look like a money token (e.g. "4,00"),
  // so re-derive the price from whatever comes after it rather than trusting
  // the whole-line price tokens (which would include the quantity itself).
  let totalCents = priceTokens.at(-1)!;
  if (leadingQtyMatch) {
    const remainderTokens = findMoneyTokens(
      line.slice(leadingQtyMatch[0].length),
    );
    if (remainderTokens.length > 0) totalCents = remainderTokens.at(-1)!;
  }
  const unitPriceCents = Math.round(totalCents / quantity);

  const strip = leadingQtyMatch ? [leadingQtyMatch[0]] : [];
  const name = stripMatchedTokens(line, strip).toUpperCase();

  if (!name) return null;

  const score = computeItemScore({
    name,
    quantity,
    unitPriceCents,
    totalCents,
    priceTokens,
    lineWords,
    hasExplicitQuantity: leadingQtyMatch !== null,
  });

  return {
    kind: "item",
    raw: line,
    name,
    quantity,
    unitPriceCents,
    totalCents,
    score,
  };
}

/**
 * Scores how trustworthy a parsed item line is, from the shape of the match
 * (explicit "N x price"/"N Ud." quantity markers, a single unambiguous price
 * token, a description that isn't just leftover digits, exact quantity*price
 * reconciliation) plus the OCR engine's own average word confidence. Purely
 * heuristic — the raw score is later bucketed into fixed confidence levels
 * (see assignConfidenceByScore),
 * used to color-code lines in the editor so the user knows which ones are
 * worth double-checking, never to hide or auto-correct anything.
 */
function computeItemScore(params: {
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  priceTokens: number[];
  lineWords: OcrWord[];
  hasExplicitQuantity: boolean;
}): number {
  const {
    name,
    quantity,
    unitPriceCents,
    totalCents,
    priceTokens,
    lineWords,
    hasExplicitQuantity,
  } = params;

  let score = 0;

  score += hasExplicitQuantity ? 2 : 0;
  score += priceTokens.length === 1 ? 1 : priceTokens.length > 2 ? -1 : 0;
  score += quantity * unitPriceCents === totalCents ? 1 : 0;
  score += name.length >= 3 && !/\d/.test(name) ? 1 : -1;

  if (lineWords.length > 0) {
    const avgOcrConfidence =
      lineWords.reduce((sum, w) => sum + w.confidence, 0) / lineWords.length;
    score += avgOcrConfidence >= 90 ? 1 : avgOcrConfidence < 70 ? -1 : 0;
  }

  return score;
}

/**
 * Maps absolute item scores (-3 through 6) to confidence levels. A receipt's
 * lines are evaluated independently, so a clean line stays reliable even if
 * the rest of the ticket was poorly recognized, and vice versa.
 */
function assignConfidenceByScore(scores: number[]): ItemParseConfidence[] {
  return scores.map((score) => {
    if (score >= 5) return "high";
    if (score >= 3) return "medium";
    if (score >= 1) return "low";
    return "very-low";
  });
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
  bbox: OcrBoundingBox;
  raw: string;
  /** Present when this candidate came from `items` (index to splice out if promoted). */
  itemIndex?: number;
}

const TOTAL_MIN_RATIO_OVER_RUNNER_UP = 1.4;
const TOTAL_MIN_RELATIVE_Y = 0.55;
const TOTAL_MIN_RELATIVE_X = 0.35;

/**
 * Fallback for tickets whose grand total wasn't recognized via keyword (e.g.
 * "TOTAL" misread by OCR): the total is usually the largest money amount on
 * the receipt and sits in the bottom-right area, below and to the right of
 * the individual product lines.
 */
function findPositionalTotal(
  candidates: NumericCandidate[],
  pageBounds: OcrBoundingBox,
): NumericCandidate | null {
  // Require at least two other numbers to compare against — with only one
  // "other" candidate, a legitimately larger second item (e.g. "2 Vino 8,00"
  // after "1 Cerveza 4,00") is too easily mistaken for the total.
  if (candidates.length < 3) return null;

  const [top, ...rest] = [...candidates].sort(
    (a, b) => b.amountCents - a.amountCents,
  );
  const runnerUpCents = Math.max(...rest.map((c) => c.amountCents));
  if (
    runnerUpCents <= 0 ||
    top.amountCents < runnerUpCents * TOTAL_MIN_RATIO_OVER_RUNNER_UP
  ) {
    return null;
  }

  const width = pageBounds.x1 - pageBounds.x0 || 1;
  const height = pageBounds.y1 - pageBounds.y0 || 1;
  const relativeX = (top.bbox.x1 - pageBounds.x0) / width;
  const relativeY = ((top.bbox.y0 + top.bbox.y1) / 2 - pageBounds.y0) / height;

  if (relativeY < TOTAL_MIN_RELATIVE_Y || relativeX < TOTAL_MIN_RELATIVE_X) {
    return null;
  }

  return top;
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
