import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildSummaryShareUrl } from "./CaptureFlow";
import { PersonTotals } from "./PersonTotals";

describe("PersonTotals", () => {
  it("keeps unclaimed-share items visually subtle instead of prominent warning styling", () => {
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
        }}
        currency="EUR"
        hasPaid={false}
        isOwn={false}
      />,
    );

    const itemRow = screen.getByText("Cerveza").closest("div");

    expect(itemRow).not.toBeNull();
    expect(itemRow?.className).toContain("font-medium");
    expect(itemRow?.className).toContain("text-warning-solid");
    expect(itemRow?.className).not.toContain("text-warning-foreground/80");
  });

  it("builds a shareable URL with the final totals summary", () => {
    const summary = "Ana: 12,00 €\nLuis: 8,00 €";
    const url = buildSummaryShareUrl(summary);
    const params = new URL(url).searchParams;

    expect(params.get("summary")).toBe(summary);
  });
});
