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
  /** Units this person has claimed for themselves alone (shows the blue "for me" badge). */
  readonly forMeUnits?: number;
  /** Units this person shares with others (shows the yellow "shared" badge). */
  readonly sharedUnits?: number;
  readonly isMine?: boolean;
  /** In the "shared" tab, highlights the card border when the group includes the current person. */
  readonly includesSelf?: boolean;
  /** Delays the first appearance when this card is part of a newly loaded list. */
  readonly entryDelay?: number;
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
  forMeUnits = 0,
  sharedUnits = 0,
  isMine = false,
  includesSelf = false,
  entryDelay,
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

  const badges = (
    <>
      {forMeUnits > 0 && (
        <span className="rounded-full border border-primary bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
          {formatUnits(forMeUnits)}x {messages.forMe}
        </span>
      )}
      {sharedUnits > 0 && (
        <span className="rounded-full border border-gold-foreground bg-gold-soft px-1.5 py-0.5 text-[10px] font-semibold text-gold-foreground">
          {formatUnits(sharedUnits)}x {messages.tabShared}
        </span>
      )}
    </>
  );

  return (
    <motion.article
      layout="position"
      initial={
        entryDelay === undefined ? false : { opacity: 0, y: 12, scale: 0.99 }
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 430,
        damping: 34,
        delay: entryDelay,
      }}
      className={`w-full overflow-hidden rounded-xl border bg-background shadow-sm transition-[border-color,box-shadow,transform] duration-200 ${
        isMine
          ? "border-primary shadow-[0_8px_20px_-16px_var(--primary)]"
          : includesSelf
          ? "border-gold shadow-[0_8px_20px_-16px_var(--gold)]"
          : forMeUnits > 0 || sharedUnits > 0
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
              {badges}
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
              {badges}
            </span>
          </span>
        </div>
      )}

      {showGroups && groups.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-primary/20 px-3 py-2">
          {groups.map((group) => (
            <div
              key={group.groupId}
              className="flex max-w-full flex-wrap items-center gap-1 rounded-lg px-2 py-1 bg-primary/5"
            >
              {group.memberNames.map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-primary bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                >
                  {name}
                </span>
              ))}
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
