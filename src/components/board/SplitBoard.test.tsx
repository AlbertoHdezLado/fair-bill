import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultMessages } from "@/i18n";
import { EMPTY_EXTRAS, type EditableItem } from "@/lib/receipt/editable";
import type { LocalClaims } from "@/lib/local-claims";
import { SplitBoard } from "./SplitBoard";

// jsdom does not implement ResizeObserver, used by BillProgress's sticky header.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

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
  const onSaveGroup = vi.fn();
  render(
    <SplitBoard
      items={items}
      extras={EMPTY_EXTRAS}
      participants={participants}
      claims={claims}
      selfKey="p1"
      onItemsChange={vi.fn()}
      onExtrasChange={vi.fn()}
      onSaveGroup={onSaveGroup}
      tableLabel="Table AB12CD"
      onToggleShare={vi.fn()}
      messages={defaultMessages}
      {...overrides}
    />,
  );
  return { onSaveGroup };
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

  it("keeps every product listed in the 'all' tab", () => {
    renderBoard({
      p1: { i1: [{ owner: "p1", choice: { mode: "units", count: 4 } }] },
    });

    expect(screen.getByText(/CERVEZA/)).toBeTruthy();
    expect(screen.getByText(/TORTILLA/)).toBeTruthy();
    expect(
      screen.getByText(/CERVEZA/).closest("article")?.textContent,
    ).toMatch(/Todo asignado/);
  });

  it("lists the existing groups of a product when it is tapped", () => {
    renderBoard({
      p2: {
        i1: [
          {
            owner: "p2",
            choice: { mode: "units", count: 1, group: ["p2"] },
          },
        ],
      },
    });

    fireEvent.click(screen.getByText("CERVEZA"));

    expect(screen.getByText("LUIS")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unirme al grupo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Para mí" })).toBeTruthy();
  });

  it("lists only the products the user takes part in on the 'mine' tab", () => {
    renderBoard({
      p1: { i2: [{ owner: "p1", choice: { mode: "units", count: 1 } }] },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Lo mío" }));

    expect(screen.getByText(/TORTILLA/)).toBeTruthy();
    expect(screen.queryByText(/CERVEZA/)).toBeNull();
  });

  it("shows the members, units and price of each group on the 'mine' tab", () => {
    renderBoard({
      p1: {
        i1: [
          {
            owner: "p1",
            choice: { mode: "units", count: 2, group: ["p1", "p2"] },
          },
        ],
      },
      p2: {
        i1: [
          {
            owner: "p1",
            choice: { mode: "units", count: 2, group: ["p1", "p2"] },
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Lo mío" }));

    const card = screen.getByText(/CERVEZA/).closest("article")!;

    expect(card.textContent).toMatch(/ANA, LUIS/);
    expect(card.textContent).toMatch(/2 uds\./);
    expect(card.textContent).toMatch(/2,50\s?€ por persona/);
  });

  it("keeps the user's own total in the floating bar", () => {
    renderBoard({
      p1: { i2: [{ owner: "p1", choice: { mode: "units", count: 1 } }] },
    });

    const bar = screen.getByText(defaultMessages.board.yourTotal).closest("button")!;

    expect(bar.textContent).toMatch(/8,00/);
  });

  it("does not render the final split button", () => {
    renderBoard();

    expect(
      screen.queryByRole("button", { name: "Ver el reparto final" }),
    ).toBeNull();
  });

  it("opens the breakdown with the lines behind each person's total", () => {
    renderBoard({
      p1: { i2: [{ owner: "p1", choice: { mode: "units", count: 1 } }] },
    });

    fireEvent.click(screen.getByText(defaultMessages.board.yourTotal));

    expect(document.body.textContent).toMatch(/De dónde sale tu total/);
    expect(document.body.textContent).toMatch(/Resto de la sala/);
    expect(document.body.textContent).toMatch(/LUIS/);
  });

  it("creates a group of one with the chosen number of units", () => {
    const { onSaveGroup } = renderBoard();

    fireEvent.click(screen.getByText("CERVEZA"));
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: "Para mí" }));

    expect(onSaveGroup).toHaveBeenCalledWith(
      "i1",
      expect.any(String),
      "p1",
      ["p1"],
      2,
    );
  });

  it("joins an existing group without changing its units", () => {
    const { onSaveGroup } = renderBoard({
      p2: {
        i1: [
          {
            owner: "p2",
            choice: { mode: "units", count: 2, group: ["p2"] },
          },
        ],
      },
    });

    fireEvent.click(screen.getByText("CERVEZA"));
    fireEvent.click(screen.getByRole("button", { name: "Unirme al grupo" }));

    expect(onSaveGroup).toHaveBeenCalledWith("i1", "p2", "p2", ["p2", "p1"], 2);
  });

  it("still offers more units when the user already owns a group", () => {
    const { onSaveGroup } = renderBoard({
      p1: {
        i1: [
          {
            owner: "p1",
            groupId: "g1",
            choice: { mode: "units", count: 1, group: ["p1"] },
          },
        ],
      },
    });

    fireEvent.click(screen.getByText("CERVEZA"));

    expect(screen.getByText("Ya estás")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Para mí" }));

    // A brand new group, kept apart from the one the user already owns.
    expect(onSaveGroup).toHaveBeenCalledWith(
      "i1",
      expect.not.stringMatching(/^g1$/),
      "p1",
      ["p1"],
      1,
    );
  });

  it("updates the units of a group from the 'mine' tab", () => {
    const { onSaveGroup } = renderBoard({
      p1: {
        i1: [
          {
            owner: "p1",
            choice: { mode: "units", count: 1, group: ["p1"] },
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Lo mío" }));
    fireEvent.click(screen.getByText("CERVEZA"));
    fireEvent.click(screen.getAllByRole("button", { name: "+" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onSaveGroup).toHaveBeenCalledWith("i1", "p1", "p1", ["p1"], 2);
  });

  it("keeps several groups of the same person apart on one product", () => {
    renderBoard({
      p1: {
        i1: [
          {
            owner: "p1",
            groupId: "g1",
            choice: { mode: "units", count: 1, group: ["p1"] },
          },
          {
            owner: "p1",
            groupId: "g2",
            choice: { mode: "units", count: 2, group: ["p1", "p2"] },
          },
        ],
      },
      p2: {
        i1: [
          {
            owner: "p1",
            groupId: "g2",
            choice: { mode: "units", count: 2, group: ["p1", "p2"] },
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Lo mío" }));

    const card = screen.getByText(/CERVEZA/).closest("article")!;

    expect(card.textContent).toMatch(/Quedan 1/);
    expect(card.textContent).toMatch(/ANA1 uds\./);
    expect(card.textContent).toMatch(/ANA, LUIS2 uds\./);

    fireEvent.click(screen.getByText("CERVEZA"));

    expect(screen.getAllByRole("button", { name: "Guardar" })).toHaveLength(2);
  });

  it("shrinks the group by the leaving member's share", () => {
    const shared = {
      owner: "p1",
      choice: { mode: "units" as const, count: 2, group: ["p1", "p2"] },
    };
    const { onSaveGroup } = renderBoard({
      p1: { i1: [shared] },
      p2: { i1: [shared] },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Lo mío" }));
    fireEvent.click(screen.getByText("CERVEZA"));
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));

    expect(onSaveGroup).toHaveBeenCalledWith("i1", "p1", "p1", ["p2"], 1);
  });

  it("drops the group when its last member leaves", () => {
    const { onSaveGroup } = renderBoard({
      p1: {
        i1: [
          {
            owner: "p1",
            choice: { mode: "units", count: 1, group: ["p1"] },
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Lo mío" }));
    fireEvent.click(screen.getByText("CERVEZA"));
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));

    expect(onSaveGroup).toHaveBeenCalledWith("i1", "p1", "p1", [], null);
  });

  it("alerts the rest of the group when someone else changes it", () => {
    const before = {
      owner: "p2",
      choice: { mode: "units" as const, count: 2, group: ["p1", "p2"] },
    };
    const { rerender } = renderTree({ p1: { i1: [before] }, p2: { i1: [before] } });

    const after = {
      owner: "p2",
      choice: { mode: "units" as const, count: 4, group: ["p1", "p2"] },
    };
    rerender({ p1: { i1: [after] }, p2: { i1: [after] } });

    fireEvent.click(screen.getByRole("button", { name: "Avisos, 1 sin leer" }));

    expect(screen.getByRole("alert").textContent).toMatch(
      /CERVEZA: el grupo pasa a 4 uds\. entre 2 personas\./,
    );
  });
});

function renderTree(claims: LocalClaims) {
  const board = (next: LocalClaims) => (
    <SplitBoard
      items={items}
      extras={EMPTY_EXTRAS}
      participants={participants}
      claims={next}
      selfKey="p1"
      onItemsChange={vi.fn()}
      onExtrasChange={vi.fn()}
      onSaveGroup={vi.fn()}
      tableLabel="Table AB12CD"
      onToggleShare={vi.fn()}
      messages={defaultMessages}
    />
  );
  const view = render(board(claims));
  return { rerender: (next: LocalClaims) => view.rerender(board(next)) };
}
