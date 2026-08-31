import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PersonTotals } from "./PersonTotals";

describe("PersonTotals", () => {
  it("marks unclaimed-share items with the gold accent", () => {
    render(
      <PersonTotals
        person={{
          participantId: "p1",
          name: "Ana",
          items: [
            {
              itemId: "i1",
              itemName: "Cerveza",
              claimedUnits: 2,
              effectiveUnits: 2,
              hasUnclaimedShare: true,
              shareCents: 1200,
              itemTotalCents: 2400,
            },
          ],
          subtotalCents: 1200,
          taxCents: 0,
          tipCents: 0,
          discountCents: 0,
          totalCents: 1200,
          participantCount: 1,
        }}
        currency="EUR"
        hasPaid={false}
        isOwn={false}
      />,
    );

    const itemRow = screen.getByText("Cerveza").closest("div");

    expect(itemRow).not.toBeNull();
    expect(itemRow?.className).toContain("font-medium");
    expect(itemRow?.className).toContain("text-gold");
  });
});
