"use client";

import { Divide, Pencil, SquareCheckBig } from "lucide-react";
import { formatCents } from "@/lib/money";
import type { EditableItem } from "@/lib/receipt/editable";
import type { Messages } from "@/i18n";

interface ProductCardProps {
  readonly item: EditableItem;
  readonly remainingUnits: number;
  readonly myUnits: number;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onSelect: () => void;
  readonly onDivide: () => void;
  readonly onEdit: () => void;
  readonly messages: Messages["board"];
}

export function ProductCard({
  item,
  remainingUnits,
  myUnits,
  expanded,
  onToggle,
  onSelect,
  onDivide,
  onEdit,
  messages,
}: ProductCardProps) {
  const isMine = myUnits > 0;

  return (
    <article
      className={`w-full overflow-hidden rounded-xl border-2 bg-surface ${
        isMine ? "border-gold" : "border-primary/30"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={expanded ? messages.collapseLabel : messages.expandLabel}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {item.name || messages.unnamedItem}
          </span>
          <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
            {formatUnits(item.quantity)} × {formatCents(item.unitPriceCents)}
            {" · "}
            {remainingUnits > 0
              ? messages.remainingUnits.replace(
                  "{{count}}",
                  formatUnits(remainingUnits),
                )
              : messages.allAssigned}
          </span>
        </span>

        {isMine && (
          <span className="shrink-0 rounded-full bg-gold px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gold-foreground">
            {messages.yoursUnits.replace("{{count}}", formatUnits(myUnits))}
          </span>
        )}

        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary text-lg font-semibold leading-none text-primary"
        >
          {expanded ? "−" : "+"}
        </span>
      </button>

      {expanded && (
        <div className="grid grid-cols-3 gap-2 border-t border-primary/20 px-4 py-3">
          <CardAction
            icon={<SquareCheckBig aria-hidden="true" size={18} />}
            label={messages.select}
            onClick={onSelect}
          />
          <CardAction
            icon={<Divide aria-hidden="true" size={18} />}
            label={messages.divide}
            onClick={onDivide}
          />
          <CardAction
            icon={<Pencil aria-hidden="true" size={18} />}
            label={messages.edit}
            onClick={onEdit}
          />
        </div>
      )}
    </article>
  );
}

function CardAction({
  icon,
  label,
  onClick,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg border border-primary/40 py-2 text-xs font-medium text-primary hover:bg-primary/10"
    >
      {icon}
      {label}
    </button>
  );
}

/** Units can be fractional after a split, so trailing zeros are dropped. */
export function formatUnits(units: number): string {
  return String(Math.round(units * 100) / 100);
}
