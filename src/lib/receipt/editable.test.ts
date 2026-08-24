import { describe, expect, it } from "vitest";
import {
  EMPTY_EXTRAS,
  editorGrandTotalCents,
  editorSubtotalCents,
  itemTotalCents,
  newItemId,
  type EditableItem,
} from "./editable";

const beer: EditableItem = {
  id: "i1",
  name: "Cerveza",
  quantity: 2,
  unitPriceCents: 250,
  state: "editado",
};

describe("itemTotalCents", () => {
  it("multiplies quantity by unit price", () => {
    expect(itemTotalCents(beer)).toBe(500);
  });
});

describe("editorSubtotalCents", () => {
  it("sums the total of every item", () => {
    const items = [beer, { ...beer, id: "i2", quantity: 1, unitPriceCents: 400 }];
    expect(editorSubtotalCents(items)).toBe(900);
  });

  it("is 0 for an empty list", () => {
    expect(editorSubtotalCents([])).toBe(0);
  });
});

describe("editorGrandTotalCents", () => {
  it("adds tax, tip and service, and subtracts the discount", () => {
    const total = editorGrandTotalCents([beer], {
      ...EMPTY_EXTRAS,
      taxCents: 50,
      tipCents: 100,
      serviceCents: 25,
      discountCents: 75,
    });
    expect(total).toBe(500 + 50 + 100 + 25 - 75);
  });
});

describe("newItemId", () => {
  it("generates unique, non-empty ids", () => {
    const ids = new Set(Array.from({ length: 20 }, () => newItemId()));
    expect(ids.size).toBe(20);
    for (const id of ids) expect(id.length).toBeGreaterThan(0);
  });
});
