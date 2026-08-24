import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_EXTRAS } from "@/lib/receipt/editable";
import { ReceiptEditor } from "./ReceiptEditor";

describe("ReceiptEditor", () => {
  it("opens a modal when the receipt total is missing", () => {
    render(
      <ReceiptEditor
        items={[]}
        extras={EMPTY_EXTRAS}
        onItemsChange={vi.fn()}
        onExtrasChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog").textContent).toMatch(
      /no se detectó el total/i,
    );

    fireEvent.click(screen.getByRole("button", { name: /cerrar aviso/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a modal when the detected total does not match", () => {
    render(
      <ReceiptEditor
        items={[
          {
            id: "item-1",
            name: "Café",
            quantity: 1,
            unitPriceCents: 300,
            state: "editado",
          },
        ]}
        extras={{ ...EMPTY_EXTRAS, detectedTotalCents: 500 }}
        onItemsChange={vi.fn()}
        onExtrasChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog").textContent).toMatch(
      /no cuadra con las líneas/i,
    );

    fireEvent.click(screen.getByRole("button", { name: /cerrar aviso/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /ver aviso de desajuste/i }),
    );

    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("adds a new item without forcing quantity to 1", () => {
    const onItemsChange = vi.fn();

    render(
      <ReceiptEditor
        items={[]}
        extras={EMPTY_EXTRAS}
        onItemsChange={onItemsChange}
        onExtrasChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /agregar producto/i }));

    expect(onItemsChange).toHaveBeenCalledTimes(1);
    const [item] = onItemsChange.mock.calls[0][0];
    expect(item.quantity).toBe(0);
  });
});
