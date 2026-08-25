"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  assignedUnits,
  buildSplitClaims,
  claimedUnits,
  itemGroups,
  type LocalClaims,
} from "@/lib/local-claims";
import {
  editorSubtotalCents,
  type EditableExtras,
  type EditableItem,
} from "@/lib/receipt/editable";
import { computeSplit } from "@/lib/split";
import { AssignedBar } from "./AssignedBar";
import { BillProgress, BoardTabs, type BoardTab } from "./BillProgress";
import { ItemActionSheet } from "./ItemActionSheet";
import { NotificationBell, type BoardNotification } from "./NotificationBell";
import { formatUnits, ProductCard } from "./ProductCard";
import { ReceiptEditor } from "@/components/ReceiptEditor";
import type { Messages } from "@/i18n";
import type { RoomEvent } from "@/lib/rooms/types";

interface Participant {
  readonly key: string;
  readonly name: string;
}

interface SplitBoardProps {
  readonly items: readonly EditableItem[];
  readonly extras: EditableExtras;
  readonly participants: readonly Participant[];
  readonly claims: LocalClaims;
  readonly events?: readonly RoomEvent[];
  readonly selfKey: string;
  readonly onItemsChange: (items: EditableItem[]) => void;
  readonly onExtrasChange: (extras: EditableExtras) => void;
  /** Creates, updates (`units`) or drops (`units === null`) one group of a line. */
  readonly onSaveGroup: (
    itemId: string,
    groupId: string,
    ownerId: string,
    memberIds: readonly string[],
    units: number | null,
  ) => void;
  readonly tableLabel: string;
  readonly onToggleShare: () => void;
  readonly onFinish?: () => void;
  readonly messages: Messages;
}

function toBoardNotification(
  event: RoomEvent,
  participants: readonly Participant[],
  messages: Messages["board"],
): BoardNotification {
  const actor =
    participants.find((participant) => participant.key === event.actorId)?.name ??
    event.actorId ??
    "?";
  const itemName = event.itemName || messages.unnamedItem;

  const text =
    event.kind === "group_removed"
      ? messages.groupRemovedBy
          .replace("{{actor}}", actor)
          .replace("{{item}}", itemName)
      : messages.groupChangedBy
          .replace("{{actor}}", actor)
          .replace("{{item}}", itemName)
          .replace("{{units}}", formatUnits(event.units ?? 0))
          .replace("{{people}}", String(event.peopleCount ?? 0));

  return {
    id: event.id,
    text,
    at: event.at,
    read: false,
  };
}

export function SplitBoard({
  items,
  extras,
  participants,
  claims,
  events = [],
  selfKey,
  onItemsChange,
  onExtrasChange,
  onSaveGroup,
  tableLabel,
  onToggleShare,
  onFinish,
  messages,
}: SplitBoardProps) {
  const t = messages.board;
  const [tab, setTab] = useState<BoardTab>("all");
  const [sheet, setSheet] = useState<{ itemId: string } | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [tableBillOpen, setTableBillOpen] = useState(false);
  const [notifications, setNotifications] = useState<
    readonly BoardNotification[]
  >([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const nameOf = (key: string) =>
    participants.find((participant) => participant.key === key)?.name ?? key;

  const groupsByItem = useMemo(() => {
    const map = new Map<string, ReturnType<typeof itemGroups>>();
    for (const item of items) map.set(item.id, itemGroups(item, claims));
    return map;
  }, [items, claims]);

  const totalCents = editorSubtotalCents([...items]);
  const assignedCents = items.reduce(
    (sum, item) =>
      sum +
      Math.round(
        Math.min(assignedUnits(item, claims), item.quantity) *
          item.unitPriceCents,
      ),
    0,
  );
  const fullyAssignedCount = items.filter(
    (item) => assignedUnits(item, claims) >= item.quantity,
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
    distributeUnclaimed: false,
  });

  useEffect(() => {
    // Keeps read/unread flags for already seen events while reflecting
    // persisted history from the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza avisos locales con historial remoto persistido
    setNotifications((previous) => {
      const previousById = new Map(previous.map((notice) => [notice.id, notice]));
      return events.map((event) => {
        const next = toBoardNotification(event, participants, t);
        return previousById.get(next.id)
          ? { ...next, read: previousById.get(next.id)!.read }
          : next;
      });
    });
  }, [events, participants, t]);

  const saveGroup = (
    itemId: string,
    groupId: string,
    ownerId: string,
    memberIds: readonly string[],
    units: number | null,
  ) => {
    onSaveGroup(itemId, groupId, ownerId, memberIds, units);
    setSheet(null);
  };

  const visibleItems =
    tab === "mine"
      ? items.filter((item) => claimedUnits(item, claims, selfKey) > 0)
      : items;

  const sheetItem = sheet
    ? (items.find((item) => item.id === sheet.itemId) ?? null)
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex min-h-0 flex-col">
          <div className="sticky top-0 z-20 flex shrink-0 flex-col gap-3 bg-background pb-0 shadow-sm">
            <BillProgress
              assignedCents={assignedCents}
              totalCents={totalCents}
              assignedItems={fullyAssignedCount}
              totalItems={items.length}
              onOpenTableBill={() => setTableBillOpen(true)}
              tableLabel={tableLabel}
              onToggleShare={onToggleShare}
              notifications={
                <NotificationBell
                  notifications={notifications}
                  open={notificationsOpen}
                  onToggle={() => {
                    setNotificationsOpen((prev) => !prev);
                    setNotifications((prev) =>
                      prev.map((notification) => ({
                        ...notification,
                        read: true,
                      })),
                    );
                  }}
                  onClose={() => setNotificationsOpen(false)}
                  onClear={() => setNotifications([])}
                  messages={t}
                />
              }
              messages={t}
            />
            <BoardTabs tab={tab} onTabChange={setTab} messages={t} />
          </div>
          <div className="min-h-0 space-y-2 overflow-y-auto rounded-b-2xl border-x border-b border-primary/20 bg-surface p-2">
            {visibleItems.map((item) => {
              const groups = groupsByItem.get(item.id) ?? [];
              return (
                <ProductCard
                  key={item.id}
                  item={item}
                  remainingUnits={Math.max(
                    0,
                    item.quantity - assignedUnits(item, claims),
                  )}
                  myUnits={claimedUnits(item, claims, selfKey)}
                  groups={groups.map((group) => ({
                    groupId: group.groupId,
                    memberNames: group.memberIds.map(nameOf),
                    units: group.units,
                    includesSelf: group.memberIds.includes(selfKey),
                  }))}
                  showGroups={tab === "mine"}
                  onSelect={() => setSheet({ itemId: item.id })}
                  messages={t}
                />
              );
            })}
            {visibleItems.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {tab === "mine" ? t.nothingAssigned : t.nothingRemaining}
              </p>
            )}
          </div>
        </div>
        <div className="mt-auto">
          <AssignedBar
            split={split}
            selfKey={selfKey}
            open={breakdownOpen}
            onToggle={() => setBreakdownOpen((prev) => !prev)}
            messages={t}
            totalsMessages={messages.totals}
          />
        </div>
      </div>

      {sheetItem && (
        <ItemActionSheet
          tab={tab}
          item={sheetItem}
          selfKey={selfKey}
          groups={groupsByItem.get(sheetItem.id) ?? []}
          remainingUnits={Math.max(
            0,
            sheetItem.quantity - assignedUnits(sheetItem, claims),
          )}
          participantNames={Object.fromEntries(
            participants.map((participant) => [
              participant.key,
              participant.name,
            ]),
          )}
          onClose={() => setSheet(null)}
          onSaveGroup={(groupId, ownerId, memberIds, units) =>
            saveGroup(sheetItem.id, groupId, ownerId, memberIds, units)
          }
          messages={t}
        />
      )}

      {tableBillOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={t.close}
            onClick={() => setTableBillOpen(false)}
            className="absolute inset-0 bg-ink/70"
          />
          <div className="relative flex max-h-[90vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-2xl border border-primary/40 bg-background p-4 pb-8 shadow-2xl">
            <div className="flex items-start justify-end gap-3">
              <button
                type="button"
                onClick={() => setTableBillOpen(false)}
                aria-label={t.close}
                className="-mr-1 -mt-1 ml-auto rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <ReceiptEditor
              items={[...items]}
              extras={extras}
              onItemsChange={onItemsChange}
              onExtrasChange={onExtrasChange}
              messages={messages.receiptEditor}
              itemRowMessages={messages.itemRow}
            />
          </div>
        </div>
      )}

    </div>
  );
}
