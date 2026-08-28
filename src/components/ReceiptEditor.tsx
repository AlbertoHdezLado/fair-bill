"use client";

import { Pencil, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  function updateItem(index: number, next: EditableItem) {
    onItemsChange(items.map((item, i) => (i === index ? next : item)));
  }

  function removeItem(index: number) {
    onItemsChange(items.filter((_, i) => i !== index));
  }

  function addItem() {
    const newItem = {
      id: newItemId(),
      name: "",
      quantity: 0,
      unitPriceCents: 0,
      state: "editado" as const,
    };
    onItemsChange([...items, newItem]);
    setEditingItemId(newItem.id);
  }

  // El nombre no se propaga hasta salir del campo o cerrar la edición del
  // ticket, para no reescribir la sala en cada pulsación.
  const extrasRef = useRef(extras);
  const onExtrasChangeRef = useRef(onExtrasChange);
  useEffect(() => {
    extrasRef.current = extras;
    onExtrasChangeRef.current = onExtrasChange;
  });
  const [merchantDraft, setMerchantDraft] = useState(
    extras.merchantName || extras.receiptHeader[0] || "",
  );
  const [merchantFocused, setMerchantFocused] = useState(false);
  const merchantDraftRef = useRef(merchantDraft);
  useEffect(() => {
    merchantDraftRef.current = merchantDraft;
  });
  useEffect(() => {
    if (!merchantFocused)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ver useMoneyField
      setMerchantDraft(extras.merchantName || extras.receiptHeader[0] || "");
  }, [extras.merchantName, extras.receiptHeader, merchantFocused]);

  function commitMerchantName(name: string) {
    const merchantName = name.trim();
    const currentExtras = extrasRef.current;
    const remainingHeader = currentExtras.receiptHeader.slice(1);
    onExtrasChangeRef.current({
      ...currentExtras,
      merchantName,
      receiptHeader:
        merchantName || remainingHeader.length > 0
          ? [merchantName, ...remainingHeader].filter(Boolean)
          : [],
    });
  }

  useEffect(() => {
    // Vuelca cualquier cambio pendiente si el editor del ticket se cierra
    // (el input se desmonta al ocultar el modal).
    return () => commitMerchantName(merchantDraftRef.current);
  }, []);

  return (
    <div className="flex flex-col gap-1 text-[13px]">
      <div className="ticket-paper mx-auto w-full max-w-md px-4 pb-6 pt-5 shadow-lg">
        <div className="pb-3 text-center font-mono text-[11px] uppercase">
          <input
            type="text"
            value={merchantDraft}
            onFocus={() => setMerchantFocused(true)}
            onChange={(event) => setMerchantDraft(event.target.value)}
            onBlur={() => {
              setMerchantFocused(false);
              commitMerchantName(merchantDraft);
            }}
            placeholder={messages.merchantNamePlaceholder}
            className="w-full border-b border-dashed border-primary/35 bg-transparent px-1 py-1 text-center font-mono text-sm font-semibold uppercase outline-none placeholder:font-sans placeholder:font-normal placeholder:normal-case placeholder:text-muted-foreground/70 focus:border-primary"
          />
          {extras.receiptHeader.slice(1).map((line, index) => (
            <p key={`${line}-${index}`} className="mt-1 leading-5">
              {line}
            </p>
          ))}
        </div>
        <div className="flex flex-col gap-0 border-b border-dashed border-primary/35">
        {items.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            onChange={(next) => updateItem(index, next)}
            onRemove={() => removeItem(index)}
            forceOpen={editingItemId === item.id}
            onOpenChange={(open) => setEditingItemId(open ? item.id : null)}
            messages={itemRowMessages}
          />
        ))}
        <button
          type="button"
          onClick={addItem}
          className="mt-1 flex items-center justify-center gap-1 rounded border border-dashed border-primary/50 py-1.5 text-xs text-primary hover:border-primary hover:bg-primary/10"
        >
          + {messages.addProduct}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-y-0.5 border-b border-dashed border-primary/35 py-3 text-[12px] sm:grid-cols-2 sm:gap-x-4 sm:gap-y-1">
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

      <div className="flex flex-col gap-0.5 border-b border-dashed border-primary/35 pb-2 pt-3 text-[12px]">
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
        <div className="flex items-center justify-between border-t-2 border-primary/50 px-1 py-3 font-semibold">
          <span>Total</span>
          <TotalField
            cents={extras.detectedTotalCents ?? grandTotalCents}
            onChange={(cents) =>
              onExtrasChange({ ...extras, detectedTotalCents: cents })
            }
            editLabel={messages.editTotal}
            saveLabel={messages.saveTotal}
          />
        </div>

      </div>
      </div>

      {isTotalWarningOpen && (
        <div
          role="dialog"
          aria-modal="true"
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
              className={`mt-3 text-xs ${
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
        </div>
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
    <label className="flex min-w-0 items-center justify-between gap-2 py-1">
      <span className="truncate text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        {...field}
        className="w-20 shrink-0 rounded border border-border bg-transparent px-2 py-1 text-right"
      />
    </label>
  );
}

function TotalField({
  cents,
  onChange,
  editLabel,
  saveLabel,
}: {
  readonly cents: number;
  readonly onChange: (cents: number) => void;
  readonly editLabel: string;
  readonly saveLabel: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  // El total no se propaga hasta salir del campo o pulsar guardar, para que
  // el resto de la app (reparto, barra inferior) no "baile" en cada dígito.
  const [pendingCents, setPendingCents] = useState(cents);
  const field = useMoneyField(pendingCents, setPendingCents);

  function commit() {
    onChange(pendingCents);
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <span className="flex items-center gap-2 font-mono text-xl tabular-nums">
        {formatCents(cents)}
        <button
          type="button"
          onClick={() => {
            setPendingCents(cents);
            setIsEditing(true);
          }}
          aria-label={editLabel}
          title={editLabel}
          className="flex h-8 w-8 items-center justify-center rounded border border-primary/30 text-primary hover:bg-primary/10"
        >
          <Pencil aria-hidden="true" size={13} />
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <input
        type="text"
        inputMode="decimal"
        {...field}
        onBlur={() => {
          field.onBlur();
          commit();
        }}
        autoFocus
        className="w-24 rounded border border-border bg-transparent px-2 py-1 text-right text-lg tabular-nums"
      />
      <button
        type="button"
        onClick={commit}
        aria-label={saveLabel}
        className="rounded border border-primary px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
      >
        {saveLabel}
      </button>
    </span>
  );
}

