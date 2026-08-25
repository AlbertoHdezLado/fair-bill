"use client";

import { Users } from "lucide-react";
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
  readonly remainingUnits: number;
  readonly myUnits: number;
  readonly groups: readonly ProductCardGroup[];
  /** The "mine" tab lists every group of the line with its members and price. */
  readonly showGroups: boolean;
  readonly onSelect: () => void;
  readonly messages: Messages["board"];
}

export function ProductCard({
  item,
  remainingUnits,
  myUnits,
  groups,
  showGroups,
  onSelect,
  messages,
}: ProductCardProps) {
  const isMine = myUnits > 0;

  return (
    <article
      className={`w-full overflow-hidden rounded-xl border-2 bg-background shadow-sm ${
        isMine ? "border-gold" : "border-primary/45"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
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

        <span className="flex shrink-0 items-center gap-2">
          {groups.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
              <Users aria-hidden="true" size={12} />
              {groups.length}
            </span>
          )}
          {isMine && (
            <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gold-foreground">
              {formatUnits(myUnits)}
            </span>
          )}
        </span>
      </button>

      {showGroups && groups.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-primary/20 px-3 py-2">
          {groups.map((group) => (
            <li
              key={group.groupId}
              className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs ${
                group.includesSelf ? "bg-gold/15" : "bg-primary/5"
              }`}
            >
              <span className="min-w-0 truncate">
                {group.memberNames.join(", ")}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {messages.groupUnits.replace(
                  "{{count}}",
                  formatUnits(group.units),
                )}
                {" · "}
                {messages.perPerson.replace(
                  "{{amount}}",
                  formatCents(
                    perPersonCents(item, group.units, group.memberNames.length),
                  ),
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
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
