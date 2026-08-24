import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PersonClaimStep } from "./PersonClaimStep";
import type { LocalClaims } from "@/lib/local-claims";
import type { EditableItem } from "@/lib/receipt/editable";

describe("PersonClaimStep", () => {
  it("shows available units on item cards instead of total units", () => {
    const item: EditableItem = {
      id: "i1",
      name: "Tortilla",
      quantity: 3,
      unitPriceCents: 1000,
      state: "editado",
    };
    const claims: LocalClaims = {
      p2: { i1: [{ owner: "p2", choice: { mode: "units", count: 1 } }] },
    };

    render(
      <PersonClaimStep
        participantKey="p1"
        participantName="Ana"
        participants={[
          { key: "p1", name: "Ana" },
          { key: "p2", name: "Luis" },
        ]}
        items={[item]}
        claims={claims}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(
      screen.getByText((content) => content.startsWith("2 × 10,00")),
    ).toBeTruthy();
    expect(
      screen.queryByText((content) => content.startsWith("3 × 10,00")),
    ).toBeNull();
  });
});