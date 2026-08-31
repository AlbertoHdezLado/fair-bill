"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { formatCents } from "@/lib/money";
import type { EditableItem } from "@/lib/receipt/editable";
import type { Messages } from "@/i18n";

export interface ProductCardGroup {
  readonly groupId: string;
  readonly memberNames: readonly string[];
  readonly units: number;
  readonly includesSelf: boolean;
}

interface ProductCardProps {
  readonly item: EditableItem;
  readonly displayUnits?: number;
  readonly remainingUnits: number;
  readonly myUnits: number;
  readonly groups: readonly ProductCardGroup[];
  readonly isSelected?: boolean;
  /** The "shared" and "for me" tabs list the groups behind the line. */
  readonly showGroups: boolean;
  readonly onSelect?: () => void;
  readonly footer?: ReactNode;
  readonly messages: Messages["roomSplit"];
}

export function ProductCard({
  item,
  displayUnits = item.quantity,
  remainingUnits,
  myUnits,
  groups,
  isSelected = false,
  showGroups,
  onSelect,
  footer,
  messages,
}: ProductCardProps) {
  let quantityLine: ReactNode;
  if (showGroups) {
    quantityLine = (
      <>
        {formatUnits(displayUnits)} × {formatCents(item.unitPriceCents)}
      </>
    );
  } else if (remainingUnits > 0) {
    quantityLine = (
      <>
        {formatUnits(remainingUnits)} × {formatCents(item.unitPriceCents)}
      </>
    );
  } else {
    quantityLine = messages.allAssigned;
  }

  return (
    <motion.article
      layout="position"
      initial={{ y: 8, scale: 0.985 }}
      animate={{ y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 430, damping: 34 }}
      className={`w-full overflow-hidden rounded-xl border bg-background shadow-sm transition-[border-color,box-shadow,transform] duration-200 ${
        isSelected
          ? "border-primary shadow-[0_8px_20px_-16px_var(--primary)]"
          : "border-primary/35 hover:border-primary/65 hover:shadow-[0_8px_20px_-18px_var(--primary)]"
      }`}
    >
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {item.name || messages.unnamedItem}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
              <span>{quantityLine}</span>
              {isSelected && (
                <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {messages.selected}
                </span>
              )}
            </span>
          </span>
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 px-4 py-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {item.name || messages.unnamedItem}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
              <span>{quantityLine}</span>
              {isSelected && (
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {messages.selected}
                </span>
              )}
            </span>
          </span>
        </div>
      )}

      {showGroups && groups.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-primary/20 px-3 py-2">
          {groups.map((group) => (
            <div
              key={group.groupId}
              className={`inline-flex max-w-full items-center rounded-lg px-2 py-1 text-xs ${
                group.includesSelf ? "bg-gold/15" : "bg-primary/5"
              }`}
            >
              <span className="min-w-0 truncate whitespace-nowrap">
                {group.memberNames.join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}

      {footer && <div className="border-t border-primary/20 px-3 py-2">{footer}</div>}
    </motion.article>
  );
}

export function perPersonCents(
  item: EditableItem,
  units: number,
  people: number,
): number {
  return Math.round((units * item.unitPriceCents) / Math.max(people, 1));
}

/** Units can be fractional after a split, so trailing zeros are dropped. */
export function formatUnits(units: number): string {
  return String(Math.round(units * 100) / 100);
}
