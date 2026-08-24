import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultMessages } from "@/i18n";
import { EMPTY_EXTRAS, type EditableItem } from "@/lib/receipt/editable";
import type { LocalClaims } from "@/lib/local-claims";
import { SplitBoard } from "./SplitBoard";

const items: EditableItem[] = [
  {
    id: "i1",
    name: "CERVEZA",
    quantity: 4,
    unitPriceCents: 250,
    state: "leido",
  },
  {
    id: "i2",
    name: "TORTILLA",
    quantity: 1,
    unitPriceCents: 800,
    state: "leido",
  },
];

const participants = [
  { key: "p1", name: "ANA" },
  { key: "p2", name: "LUIS" },
];

function renderBoard(claims: LocalClaims = {}, overrides = {}) {
  const onClaimChange = vi.fn();
  render(
    <SplitBoard
      items={items}
      extras={EMPTY_EXTRAS}
      participants={participants}
      claims={claims}
      selfKey="p1"
      onItemsChange={vi.fn()}
      onClaimChange={onClaimChange}
      onSwitchUser={vi.fn()}
      onFinish={vi.fn()}
      messages={defaultMessages}
      {...overrides}
    />,
  );
  return { onClaimChange };
}

describe("SplitBoard", () => {
  it("shows how many units of each product are still unassigned", () => {
    renderBoard({
      p2: { i1: [{ owner: "p2", choice: { mode: "units", count: 1 } }] },
    });

    expect(screen.getByText(/CERVEZA/).closest("article")?.textContent).toMatch(
      /Quedan 3/,
    );
  });

  it("reveals select, divide and edit only once the card is expanded", () => {
    renderBoard();

    expect(screen.queryByRole("button", { name: "Divide" })).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "Ver opciones" })[0]);

    expect(screen.getByRole("button", { name: "Selecciona" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Divide" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Editar" })).toBeTruthy();
  });

  it("lists only the user's own products in the 'mine' tab", () => {
    renderBoard({
      p1: { i2: [{ owner: "p1", choice: { mode: "units", count: 1 } }] },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Lo mío" }));

    expect(screen.getByText(/TORTILLA/)).toBeTruthy();
    expect(screen.queryByText(/CERVEZA/)).toBeNull();
  });

  it("keeps the user's own total in the floating bar", () => {
    renderBoard({
      p1: { i2: [{ owner: "p1", choice: { mode: "units", count: 1 } }] },
    });

    const bar = screen.getByText("Tu total").closest("button")!;

    expect(bar.textContent).toMatch(/13,00/);
  });

  it("opens the breakdown with the lines behind each person's total", () => {
    renderBoard({
      p1: { i2: [{ owner: "p1", choice: { mode: "units", count: 1 } }] },
    });

    fireEvent.click(screen.getByText("Tu total"));

    expect(document.body.textContent).toMatch(/De dónde sale tu total/);
    expect(document.body.textContent).toMatch(/Resto de la mesa/);
    expect(document.body.textContent).toMatch(/LUIS/);
  });

  it("claims the chosen number of units for the current user", () => {
    const { onClaimChange } = renderBoard();

    fireEvent.click(screen.getAllByRole("button", { name: "Ver opciones" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Selecciona" }));
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onClaimChange).toHaveBeenCalledWith("i1", ["p1"], {
      mode: "units",
      count: 2,
    });
  });
});
