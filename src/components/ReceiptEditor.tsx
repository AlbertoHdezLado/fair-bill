"use client";

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
      <p className="text-center text-xl font-bold text-accent">
        {messages.title}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-1 text-xs text-zinc-500">
        <Legend
          color="bg-success-card-bg border-success-solid text-success-foreground"
          icon="✓"
          label={messages.highReliability}
        />
        <Legend
          color="bg-warning-card-bg border-warning-solid text-warning-foreground"
          icon="⚠"
          label={messages.lowReliability}
        />
        <Legend
          color="bg-info-card-bg border-info-solid text-info-foreground"
          icon="✎"
          label={messages.editedProduct}
        />
      </div>
      <div className="flex flex-col">
        {/* En móvil cada línea ya lleva sus propias etiquetas (Uds./Precio/Total) */}
        <div className="hidden items-center gap-2 px-3 pb-1 text-xs font-medium text-zinc-500 sm:flex">
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
          className="mt-2 flex items-center justify-center gap-1 rounded border border-dashed border-zinc-300 py-2 text-sm text-zinc-500 hover:border-primary hover:text-primary dark:border-zinc-700"
        >
          + {messages.addProduct}
        </button>
      </div>

      {extras.detectedTotalCents === null && (
        <div className="rounded bg-info-bg px-3 py-2 text-sm text-info-foreground">
          {messages.missingTotal}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-primary/20 bg-primary/15 p-3 text-sm dark:border-primary/25 dark:bg-primary/10">
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
          <span className="text-zinc-500">{messages.subtotalProducts}</span>
          <span className="flex items-center gap-1.5 tabular-nums">
            {mismatchDeltaCents !== null &&
              Math.abs(mismatchDeltaCents) > 2 && (
                <span aria-hidden="true">⚠️</span>
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

        {mismatchDeltaCents !== null && Math.abs(mismatchDeltaCents) > 2 && (
          <p className="mt-1 rounded bg-warning-bg px-2 py-1 text-warning-foreground">
            <span>
              {messages.mismatch
                .replace("{{total}}", formatCents(extras.detectedTotalCents!))
                .replace("{{delta}}", formatCents(Math.abs(mismatchDeltaCents)))}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

function Legend({
  color,
  icon,
  label,
}: {
  readonly color: string;
  readonly icon: string;
  readonly label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${color}`}
    >
      <span aria-hidden="true" className="text-sm leading-none">
        {icon}
      </span>
      {label}
    </span>
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
      <span className="text-zinc-500">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        {...field}
        className="w-20 self-end rounded border border-zinc-300 bg-transparent px-2 py-1 text-right sm:self-auto dark:border-zinc-700"
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
      className="w-24 rounded border border-zinc-300 bg-transparent px-2 py-1 text-right tabular-nums dark:border-zinc-700"
    />
  );
}
