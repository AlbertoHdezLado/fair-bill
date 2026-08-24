"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { formatCents, useMoneyField } from "@/lib/money";
import type { EditableItem } from "@/lib/receipt/editable";
import type { ClaimChoice } from "@/lib/local-claims";
import { formatUnits } from "./ProductCard";
import type { Messages } from "@/i18n";

export type SheetMode = "select" | "divide" | "edit";

interface Participant {
  readonly key: string;
  readonly name: string;
}

interface ItemActionSheetProps {
  readonly mode: SheetMode;
  readonly item: EditableItem;
  readonly selfKey: string;
  readonly others: readonly Participant[];
  /** Units still free for this person, already excluding their own current choice. */
  readonly availableUnits: number;
  readonly currentChoice: ClaimChoice | null;
  readonly onClose: () => void;
  readonly onApplyClaim: (
    participantKeys: readonly string[],
    choice: ClaimChoice | null,
  ) => void;
  readonly onEditItem: (item: EditableItem) => void;
  readonly onRemoveItem: () => void;
  readonly messages: Messages["board"];
}

export function ItemActionSheet(props: ItemActionSheetProps) {
  const { item, mode, onClose, messages } = props;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label={messages.close}
        onClick={onClose}
        className="absolute inset-0 bg-ink/70"
      />
      <div className="relative flex w-full max-w-md flex-col gap-4 rounded-t-2xl border border-primary/40 bg-background p-4 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-lg font-bold text-primary">
            {item.name || messages.unnamedItem}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={messages.close}
            className="-mr-1 -mt-1 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        {mode === "edit" ? <EditForm {...props} /> : <ClaimForm {...props} />}
      </div>
    </div>
  );
}

function ClaimForm({
  mode,
  item,
  selfKey,
  others,
  availableUnits,
  currentChoice,
  onApplyClaim,
  messages,
}: ItemActionSheetProps) {
  const existingGroup = (
    currentChoice?.mode === "units" ? (currentChoice.group ?? []) : []
  ).filter((key) => key !== selfKey);

  const [units, setUnits] = useState(() =>
    Math.min(
      Math.max(1, currentChoice?.mode === "units" ? currentChoice.count : 1),
      Math.max(availableUnits, 1),
    ),
  );
  const [sharedWith, setSharedWith] = useState<string[]>(existingGroup);

  const isDivide = mode === "divide";
  const groupSize = isDivide ? sharedWith.length + 1 : 1;
  const canConfirm =
    availableUnits > 0 && units > 0 && (!isDivide || sharedWith.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          {messages.units}
        </p>
        <div className="flex items-center gap-4">
          <StepperButton
            label="−"
            disabled={units <= 1}
            onClick={() => setUnits((prev) => Math.max(1, prev - 1))}
          />
          <span className="w-14 text-center text-2xl font-bold tabular-nums text-primary">
            {formatUnits(units)}
          </span>
          <StepperButton
            label="+"
            disabled={units >= availableUnits}
            onClick={() =>
              setUnits((prev) => Math.min(availableUnits, prev + 1))
            }
          />
        </div>
        <button
          type="button"
          disabled={units >= availableUnits || availableUnits <= 0}
          onClick={() => setUnits(availableUnits)}
          className="rounded-full border border-gold px-3 py-1 text-xs text-gold disabled:opacity-40"
        >
          {messages.takeAll}
        </button>
      </div>

      {isDivide && (
        <div className="flex flex-col gap-2">
          <p className="text-center text-xs text-muted-foreground">
            {messages.shareWith}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {others.map((person) => {
              const isSelected = sharedWith.includes(person.key);
              return (
                <button
                  key={person.key}
                  type="button"
                  onClick={() =>
                    setSharedWith((prev) =>
                      prev.includes(person.key)
                        ? prev.filter((k) => k !== person.key)
                        : [...prev, person.key],
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-foreground"
                  }`}
                >
                  {person.name}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={sharedWith.length === others.length}
            onClick={() => setSharedWith(others.map((p) => p.key))}
            className="self-center rounded-full border border-gold px-3 py-1 text-xs text-gold disabled:opacity-40"
          >
            {messages.everyone}
          </button>
        </div>
      )}

      <p className="text-center text-sm tabular-nums text-muted-foreground">
        {formatCents(Math.round((units * item.unitPriceCents) / groupSize))}
      </p>

      <button
        type="button"
        disabled={!canConfirm}
        onClick={() =>
          onApplyClaim(
            isDivide ? [selfKey, ...sharedWith] : [selfKey],
            isDivide
              ? { mode: "units", count: units, group: [selfKey, ...sharedWith] }
              : { mode: "units", count: units },
          )
        }
        className="rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        {messages.confirm}
      </button>

      {currentChoice && (
        <button
          type="button"
          onClick={() => onApplyClaim([selfKey], null)}
          className="rounded-full border border-primary/50 px-4 py-2 text-sm text-primary hover:bg-primary/10"
        >
          {messages.removeSelection}
        </button>
      )}
    </div>
  );
}

function EditForm({
  item,
  onEditItem,
  onRemoveItem,
  onClose,
  messages,
}: ItemActionSheetProps) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unitPriceCents, setUnitPriceCents] = useState(item.unitPriceCents);
  const priceField = useMoneyField(unitPriceCents, setUnitPriceCents);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {messages.productName}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          className="rounded border border-border bg-transparent px-3 py-2 text-base uppercase text-foreground"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {messages.quantity}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="rounded border border-border bg-transparent px-3 py-2 text-base text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {messages.unitPrice}
          <input
            type="text"
            inputMode="decimal"
            {...priceField}
            className="rounded border border-border bg-transparent px-3 py-2 text-right text-base tabular-nums text-foreground"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={() => {
          const parsedQuantity = Number.parseInt(quantity, 10);
          onEditItem({
            ...item,
            name,
            quantity:
              Number.isFinite(parsedQuantity) && parsedQuantity >= 0
                ? parsedQuantity
                : 0,
            unitPriceCents,
            state: "editado",
          });
          onClose();
        }}
        className="rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
      >
        {messages.confirm}
      </button>

      <button
        type="button"
        onClick={onRemoveItem}
        className="rounded-full border border-gold px-4 py-2 text-sm text-gold hover:bg-gold/10"
      >
        {messages.removeItem}
      </button>
    </div>
  );
}

function StepperButton({
  label,
  disabled,
  onClick,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-12 w-12 items-center justify-center rounded-full border border-primary text-xl font-semibold text-primary disabled:opacity-40"
    >
      {label}
    </button>
  );
}
