"use client";

import { TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { ItemRow } from "@/components/ItemRow";
import { formatCents, useMoneyField } from "@/lib/money";
import {
  editorGrandTotalCents,
  editorSubtotalCents,
  newItemId,
  type EditableExtras,
  type EditableItem,
} from "@/lib/receipt/editable";
import { defaultMessages, type Messages } from "@/i18n";

interface ReceiptEditorProps {
  readonly items: EditableItem[];
  readonly extras: EditableExtras;
  readonly onItemsChange: (items: EditableItem[]) => void;
  readonly onExtrasChange: (extras: EditableExtras) => void;
  readonly messages?: Messages["receiptEditor"];
  readonly itemRowMessages?: Messages["itemRow"];
}

export function ReceiptEditor({
  items,
  extras,
  onItemsChange,
  onExtrasChange,
  messages = defaultMessages.receiptEditor,
  itemRowMessages = defaultMessages.itemRow,
}: ReceiptEditorProps) {
  const subtotalCents = editorSubtotalCents(items);
  const grandTotalCents = editorGrandTotalCents(items, extras);
  const mismatchDeltaCents =
    extras.detectedTotalCents === null
      ? null
      : extras.detectedTotalCents - grandTotalCents;
  const hasMismatch =
    mismatchDeltaCents !== null && Math.abs(mismatchDeltaCents) > 2;
  const [isTotalWarningOpen, setIsTotalWarningOpen] = useState(
    extras.detectedTotalCents === null || hasMismatch,
  );

  function updateItem(index: number, next: EditableItem) {
    onItemsChange(items.map((item, i) => (i === index ? next : item)));
  }

  function removeItem(index: number) {
    onItemsChange(items.filter((_, i) => i !== index));
  }

  function addItem() {
    onItemsChange([
      ...items,
      {
        id: newItemId(),
        name: "",
        quantity: 0,
        unitPriceCents: 0,
        state: "editado",
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-xl font-bold text-primary">
        {messages.title}
      </p>
      <div className="flex flex-col">
        {/* En móvil cada línea ya lleva sus propias etiquetas (Uds./Precio/Total) */}
        <div className="hidden items-center gap-2 px-3 pb-1 text-xs font-medium text-muted-foreground sm:flex">
          <span className="flex-1">{messages.product}</span>
          <span className="w-14 text-center">{messages.units}</span>
          <span className="w-20 text-right">{messages.price}</span>
          <span className="w-20 text-right">{messages.total}</span>
          <span className="w-7" />
        </div>
        {items.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            onChange={(next) => updateItem(index, next)}
            onRemove={() => removeItem(index)}
            messages={itemRowMessages}
          />
        ))}
        <button
          type="button"
          onClick={addItem}
          className="mt-2 flex items-center justify-center gap-1 rounded border border-dashed border-primary/50 py-2 text-sm text-primary hover:border-primary hover:bg-primary/10"
        >
          + {messages.addProduct}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-primary/25 bg-primary/10 p-3 text-sm">
        <ExtraField
          label={messages.tax}
          cents={extras.taxCents}
          onChange={(cents) => onExtrasChange({ ...extras, taxCents: cents })}
        />
        <ExtraField
          label={messages.tip}
          cents={extras.tipCents}
          onChange={(cents) => onExtrasChange({ ...extras, tipCents: cents })}
        />
        <ExtraField
          label={messages.service}
          cents={extras.serviceCents}
          onChange={(cents) =>
            onExtrasChange({ ...extras, serviceCents: cents })
          }
        />
        <ExtraField
          label={messages.discount}
          cents={extras.discountCents}
          onChange={(cents) =>
            onExtrasChange({ ...extras, discountCents: cents })
          }
        />
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            {messages.subtotalProducts}
          </span>
          <span className="flex items-center gap-1.5 tabular-nums">
            {hasMismatch && (
              <button
                type="button"
                onClick={() => setIsTotalWarningOpen(true)}
                aria-label={messages.openMismatchWarning}
                className="rounded text-gold hover:text-gold-hover"
              >
                <TriangleAlert aria-hidden="true" size={18} />
              </button>
            )}
            {formatCents(subtotalCents)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 font-semibold">
          <span>Total</span>
          <TotalField
            cents={extras.detectedTotalCents ?? grandTotalCents}
            onChange={(cents) =>
              onExtrasChange({ ...extras, detectedTotalCents: cents })
            }
          />
        </div>

      </div>

      {isTotalWarningOpen && (
        <dialog
          open
          aria-labelledby="total-warning-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
        >
          <div className="w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h2
                id="total-warning-title"
                className="text-lg font-bold text-primary"
              >
                {hasMismatch ? messages.mismatchTitle : messages.missingTotalTitle}
              </h2>
              <button
                type="button"
                onClick={() => setIsTotalWarningOpen(false)}
                aria-label={messages.closeWarning}
                className="-mr-1 -mt-1 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <p
              className={`mt-3 text-sm ${
                hasMismatch ? "text-gold" : "text-muted-foreground"
              }`}
            >
              {hasMismatch
                ? messages.mismatch
                    .replace("{{total}}", formatCents(extras.detectedTotalCents!))
                    .replace(
                      "{{delta}}",
                      formatCents(Math.abs(mismatchDeltaCents!)),
                    )
                : messages.missingTotal}
            </p>
          </div>
        </dialog>
      )}
    </div>
  );
}

function ExtraField({
  label,
  cents,
  onChange,
}: {
  readonly label: string;
  readonly cents: number;
  readonly onChange: (cents: number) => void;
}) {
  const field = useMoneyField(cents, onChange);
  return (
    <label className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        {...field}
        className="w-20 self-end rounded border border-border bg-transparent px-2 py-1 text-right sm:self-auto"
      />
    </label>
  );
}

function TotalField({
  cents,
  onChange,
}: {
  readonly cents: number;
  readonly onChange: (cents: number) => void;
}) {
  const field = useMoneyField(cents, onChange);
  return (
    <input
      type="text"
      inputMode="decimal"
      {...field}
      className="w-24 rounded border border-border bg-transparent px-2 py-1 text-right tabular-nums"
    />
  );
}
