"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { formatCents } from "@/lib/money";
import {
  buildSplitClaims,
  claimedUnits,
  ownChoice,
  unitsTakenByAll,
  unitsTakenExcludingOwner,
  type ClaimChoice,
  type LocalClaims,
} from "@/lib/local-claims";
import {
  editorSubtotalCents,
  itemTotalCents,
  type EditableExtras,
  type EditableItem,
} from "@/lib/receipt/editable";
import { computeSplit } from "@/lib/split";
import { AssignedBar } from "./AssignedBar";
import { BillProgress, type BoardTab } from "./BillProgress";
import { ItemActionSheet, type SheetMode } from "./ItemActionSheet";
import { ProductCard, formatUnits } from "./ProductCard";
import type { Messages } from "@/i18n";

interface Participant {
  readonly key: string;
  readonly name: string;
}

interface SplitBoardProps {
  readonly items: readonly EditableItem[];
  readonly extras: EditableExtras;
  readonly participants: readonly Participant[];
  readonly claims: LocalClaims;
  readonly selfKey: string;
  readonly onItemsChange: (items: EditableItem[]) => void;
  readonly onClaimChange: (
    itemId: string,
    participantKeys: readonly string[],
    choice: ClaimChoice | null,
  ) => void;
  readonly onSwitchUser: () => void;
  readonly onFinish: () => void;
  readonly messages: Messages;
}

export function SplitBoard({
  items,
  extras,
  participants,
  claims,
  selfKey,
  onItemsChange,
  onClaimChange,
  onSwitchUser,
  onFinish,
  messages,
}: SplitBoardProps) {
  const t = messages.board;
  const [tab, setTab] = useState<BoardTab>("remaining");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{
    itemId: string;
    mode: SheetMode;
  } | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [tableBillOpen, setTableBillOpen] = useState(false);

  const totalCents = editorSubtotalCents([...items]);
  const assignedCents = items.reduce(
    (sum, item) =>
      sum +
      Math.round(
        Math.min(unitsTakenByAll(item, claims), item.quantity) *
          item.unitPriceCents,
      ),
    0,
  );
  const fullyAssignedCount = items.filter(
    (item) => unitsTakenByAll(item, claims) >= item.quantity,
  ).length;

  const split = computeSplit({
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
    claims: buildSplitClaims(
      [...items],
      participants.map((p) => p.key),
      claims,
    ),
    participants: participants.map((p) => ({ id: p.key, name: p.name })),
    extras: {
      taxCents: extras.taxCents,
      tipCents: extras.tipCents + extras.serviceCents,
      discountCents: extras.discountCents,
    },
  });

  const visibleItems = items.filter((item) =>
    tab === "mine"
      ? claimedUnits(item, claims, selfKey) > 0
      : unitsTakenByAll(item, claims) < item.quantity,
  );

  const sheetItem = sheet
    ? (items.find((item) => item.id === sheet.itemId) ?? null)
    : null;

  return (
    <div className="flex flex-col gap-3 pb-24">
      <BillProgress
        assignedCents={assignedCents}
        totalCents={totalCents}
        assignedItems={fullyAssignedCount}
        totalItems={items.length}
        tab={tab}
        onTabChange={setTab}
        onOpenTableBill={() => setTableBillOpen(true)}
        messages={t}
      />

      <div className="flex flex-col gap-2">
        {visibleItems.map((item) => (
          <ProductCard
            key={item.id}
            item={item}
            remainingUnits={Math.max(
              0,
              item.quantity - unitsTakenByAll(item, claims),
            )}
            myUnits={claimedUnits(item, claims, selfKey)}
            expanded={expandedId === item.id}
            onToggle={() =>
              setExpandedId((prev) => (prev === item.id ? null : item.id))
            }
            onSelect={() => setSheet({ itemId: item.id, mode: "select" })}
            onDivide={() => setSheet({ itemId: item.id, mode: "divide" })}
            onEdit={() => setSheet({ itemId: item.id, mode: "edit" })}
            messages={t}
          />
        ))}
        {visibleItems.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {tab === "mine" ? t.nothingAssigned : t.nothingRemaining}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onFinish}
        className="self-center rounded-full border border-primary px-5 py-2 text-sm font-medium text-primary hover:bg-primary/10"
      >
        {t.finish}
      </button>

      <button
        type="button"
        onClick={onSwitchUser}
        className="self-center text-xs text-primary underline"
      >
        {t.switchUser}
      </button>

      {sheetItem && sheet && (
        <ItemActionSheet
          mode={sheet.mode}
          item={sheetItem}
          selfKey={selfKey}
          others={participants.filter((p) => p.key !== selfKey)}
          availableUnits={Math.max(
            0,
            sheetItem.quantity -
              unitsTakenExcludingOwner(sheetItem, claims, selfKey),
          )}
          currentChoice={ownChoice(claims, selfKey, sheetItem.id)}
          onClose={() => setSheet(null)}
          onApplyClaim={(participantKeys, choice) => {
            const previous = ownChoice(claims, selfKey, sheetItem.id);
            const previousGroup =
              previous?.mode === "units"
                ? (previous.group ?? [selfKey])
                : [selfKey];
            const staleKeys = previousGroup.filter(
              (key) => !participantKeys.includes(key),
            );
            if (staleKeys.length > 0)
              onClaimChange(sheetItem.id, staleKeys, null);
            onClaimChange(sheetItem.id, participantKeys, choice);
            setSheet(null);
          }}
          onEditItem={(next) =>
            onItemsChange(
              items.map((item) => (item.id === next.id ? next : item)),
            )
          }
          onRemoveItem={() => {
            onItemsChange(items.filter((item) => item.id !== sheetItem.id));
            setSheet(null);
          }}
          messages={t}
        />
      )}

      {tableBillOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={t.close}
            onClick={() => setTableBillOpen(false)}
            className="absolute inset-0 bg-ink/70"
          />
          <div className="relative flex max-h-[80vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl border border-primary/40 bg-background p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <p className="text-lg font-bold text-primary">
                {t.tableBillTitle}
              </p>
              <button
                type="button"
                onClick={() => setTableBillOpen(false)}
                aria-label={t.close}
                className="-mr-1 -mt-1 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {items.map((item) => (
                <li key={item.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {item.name || t.unnamedItem} ×{formatUnits(item.quantity)}
                  </span>
                  <span className="tabular-nums">
                    {formatCents(itemTotalCents(item))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-2 border-t border-primary/20 pt-2 font-bold">
              <span>{messages.receiptEditor.total}</span>
              <span className="tabular-nums">
                {formatCents(split.grandTotalCents)}
              </span>
            </div>
          </div>
        </div>
      )}

      <AssignedBar
        split={split}
        selfKey={selfKey}
        open={breakdownOpen}
        onToggle={() => setBreakdownOpen((prev) => !prev)}
        messages={t}
        totalsMessages={messages.totals}
      />
    </div>
  );
}
