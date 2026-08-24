"use client";

import { useEffect, useState } from "react";
import { useMoneyField } from "@/lib/money";
import { itemTotalCents, type EditableItem } from "@/lib/receipt/editable";
import { defaultMessages, type Messages } from "@/i18n";

interface ItemRowProps {
  readonly item: EditableItem;
  readonly onChange: (item: EditableItem) => void;
  readonly onRemove: () => void;
  readonly messages?: Messages["itemRow"];
}

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
  const isEdited = item.state === "editado";

  // Gold marks lines the user has touched; everything else stays blue.
  const accentBorder = isEdited ? "border-gold" : "border-primary/45";
  const inputBorder = isEmpty
    ? "border-border text-muted-foreground focus:outline-primary/60"
    : `${accentBorder} focus:outline-primary/70`;

  const cardClasses = isEmpty
    ? "bg-surface border-border"
    : `bg-surface ${isEdited ? "border-gold" : "border-primary/35"}`;

  const removeButtonClasses = isEdited
    ? "text-gold hover:bg-gold/15"
    : "text-primary/70 hover:bg-primary/10";

  const nameInputBorder = isEmpty
    ? `${inputBorder} placeholder:text-muted-foreground/70`
    : `${inputBorder} placeholder:text-muted-foreground`;

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
          <span className="text-[10px] text-muted-foreground sm:hidden">
            Uds.
          </span>
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
            className={`w-full rounded border bg-transparent px-2 py-2 text-base sm:w-14 sm:py-1 sm:text-sm ${inputBorder}`}
          />
        </div>
        <div className="flex flex-1 flex-col items-center gap-0.5 sm:contents">
          <span className="text-[10px] text-muted-foreground sm:hidden">
            Precio
          </span>
          <input
            type="text"
            inputMode="decimal"
            {...unitPriceField}
            className={`w-full rounded border bg-transparent px-2 py-2 text-base sm:w-20 sm:py-1 sm:text-sm ${inputBorder}`}
          />
        </div>
        <div className="flex flex-1 flex-col items-center gap-0.5 sm:contents">
          <span className="text-[10px] text-muted-foreground sm:hidden">
            Total
          </span>
          <input
            type="text"
            inputMode="decimal"
            {...totalField}
            className={`w-full shrink-0 rounded border bg-transparent px-2 py-2 text-right text-base tabular-nums sm:w-20 sm:py-1 sm:text-sm ${inputBorder}`}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={messages.removeLineLabel}
          className={`shrink-0 rounded px-2 py-1 text-lg font-semibold ${removeButtonClasses}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
