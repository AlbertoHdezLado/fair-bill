"use client";

import { useEffect, useState } from "react";
import { useMoneyField } from "@/lib/money";
import {
  itemTotalCents,
  type EditableItem,
  type ItemState,
} from "@/lib/receipt/editable";
import { defaultMessages, type Messages } from "@/i18n";

interface ItemRowProps {
  readonly item: EditableItem;
  readonly onChange: (item: EditableItem) => void;
  readonly onRemove: () => void;
  readonly messages?: Messages["itemRow"];
}

// Estilos de tarjeta por estado del item:
// - "probable" (success): confianza media del parser
// - "revisa" (warning): necesita revisión
// - "editado" (info): editado manualmente por el usuario
export const STATE_CARD_CLASS: Record<ItemState, string> = {
  probable: "bg-success-card-bg border-success-solid",
  revisa: "bg-warning-card-bg border-warning-solid",
  editado: "bg-info-card-bg border-info-solid",
};

// Bordes de los inputs dentro de tarjetas por estado. Se incluye el color de
// foco explícitamente para que no aparezca el amarillo del anillo de foco
// por defecto del navegador al pulsar sobre el input.
const STATE_INPUT_BORDER_CLASS: Record<ItemState, string> = {
  probable: "border-success-foreground/60 focus:outline-success-foreground/60",
  revisa: "border-warning-foreground/60 focus:outline-warning-foreground/60",
  editado: "border-info-foreground/60 focus:outline-info-foreground/60",
};

// Mismo color que el borde de los inputs, para la cruz de borrar la línea
const STATE_REMOVE_BUTTON_CLASS: Record<ItemState, string> = {
  probable: "text-success-foreground/60",
  revisa: "text-warning-foreground/60",
  editado: "text-info-foreground/60",
};

export function ItemRow({
  item,
  onChange,
  onRemove,
  messages = defaultMessages.itemRow,
}: ItemRowProps) {
  // When user edits, transition the item to "editado" state
  function edit(patch: Partial<EditableItem>) {
    onChange({
      ...item,
      ...patch,
      state: "editado",
      confidence: undefined,
    });
  }

  const unitPriceField = useMoneyField(item.unitPriceCents, (unitPriceCents) =>
    edit({ unitPriceCents }),
  );

  // Igual que los campos de dinero: se guarda el texto propio mientras el
  // input tiene el foco para poder borrarlo del todo, y si se deja vacío se
  // reaplica el valor 0 sin forzarlo a 1.
  const [quantityText, setQuantityText] = useState(String(item.quantity));
  const [quantityFocused, setQuantityFocused] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see useMoneyField for rationale
    if (!quantityFocused) setQuantityText(String(item.quantity));
  }, [item.quantity, quantityFocused]);
  const totalField = useMoneyField(itemTotalCents(item), (totalCents) => {
    const unitPriceCents =
      item.quantity > 0 ? Math.round(totalCents / item.quantity) : totalCents;
    edit({ unitPriceCents });
  });

  const isEmpty = item.name === "";

  let mutedClasses: string;
  if (isEmpty) {
    mutedClasses =
      "border-zinc-100 text-zinc-300 focus:outline-zinc-300 dark:border-zinc-900 dark:text-zinc-600 dark:focus:outline-zinc-600";
  } else {
    mutedClasses = STATE_INPUT_BORDER_CLASS[item.state];
  }

  const cardClasses = isEmpty
    ? "bg-background border-zinc-200 dark:border-zinc-800"
    : STATE_CARD_CLASS[item.state];

  const removeButtonClasses = isEmpty
    ? "text-zinc-300 dark:text-zinc-600"
    : STATE_REMOVE_BUTTON_CLASS[item.state];

  let nameInputBorder: string;
  if (isEmpty) {
    nameInputBorder =
      "border-zinc-100 text-zinc-300 placeholder:text-zinc-250 focus:outline-zinc-300 dark:border-zinc-900 dark:text-zinc-600 dark:placeholder:text-zinc-700 dark:focus:outline-zinc-600";
  } else {
    nameInputBorder = `${STATE_INPUT_BORDER_CLASS[item.state]} placeholder:text-zinc-400`;
  }

  return (
    <div
      className={`mb-2 flex flex-col gap-2 rounded-xl border-2 px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:gap-2 sm:py-2 ${cardClasses} ${
        isEmpty ? "opacity-70" : ""
      }`}
    >
      {/* En móvil el nombre ocupa toda la fila para poder leerlo bien */}
      <input
        type="text"
        value={item.name}
        onChange={(e) => edit({ name: e.target.value.toUpperCase() })}
        placeholder={messages.descriptionPlaceholder}
        className={`min-w-0 flex-1 rounded border px-2 py-2 text-base uppercase bg-transparent sm:py-1 sm:text-sm ${nameInputBorder}`}
      />

      {/* Uds./precio/total/borrar: en móvil van en su propia fila con
          etiquetas, ya que en el header no caben cuando la pantalla es
          estrecha. Se alinean por abajo (items-end) para que la cruz de
          borrar quede a la altura de los inputs y no de sus etiquetas. */}
      <div className="flex items-end gap-2 sm:items-center">
        <div className="flex flex-1 flex-col items-center gap-0.5 sm:contents">
          <span className="text-[10px] text-zinc-400 sm:hidden">Uds.</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={quantityText}
            onFocus={() => setQuantityFocused(true)}
            onChange={(e) => {
              const value = e.target.value;
              setQuantityText(value);
              const parsed = Number.parseInt(value, 10);
              if (Number.isFinite(parsed) && parsed >= 0)
                edit({ quantity: parsed });
            }}
            onBlur={() => {
              setQuantityFocused(false);
              const parsed = Number.parseInt(quantityText, 10);
              const quantity =
                Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
              setQuantityText(String(quantity));
              if (quantity !== item.quantity) edit({ quantity });
            }}
            className={`w-full rounded border bg-transparent px-2 py-2 text-base sm:w-14 sm:py-1 sm:text-sm ${mutedClasses}`}
          />
        </div>
        <div className="flex flex-1 flex-col items-center gap-0.5 sm:contents">
          <span className="text-[10px] text-zinc-400 sm:hidden">Precio</span>
          <input
            type="text"
            inputMode="decimal"
            {...unitPriceField}
            className={`w-full rounded border bg-transparent px-2 py-2 text-base sm:w-20 sm:py-1 sm:text-sm ${mutedClasses}`}
          />
        </div>
        <div className="flex flex-1 flex-col items-center gap-0.5 sm:contents">
          <span className="text-[10px] text-zinc-400 sm:hidden">Total</span>
          <input
            type="text"
            inputMode="decimal"
            {...totalField}
            className={`w-full shrink-0 rounded border bg-transparent px-2 py-2 text-right text-base tabular-nums sm:w-20 sm:py-1 sm:text-sm ${mutedClasses}`}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={messages.removeLineLabel}
          className={`shrink-0 rounded px-2 py-1 text-lg font-semibold hover:bg-error-bg hover:text-error-foreground ${removeButtonClasses}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
