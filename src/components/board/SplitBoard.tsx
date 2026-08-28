"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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
import { backdropVariants, sheetVariants } from "@/lib/motion";
import { AssignedBar } from "./AssignedBar";
import { BillProgress, BoardTabs, type BoardTab } from "./BillProgress";
import { ItemActionSheet } from "./ItemActionSheet";
import { NotificationBell, type BoardNotification } from "./NotificationBell";
import { ProfileButton } from "./ProfileButton";
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
    shared: boolean,
  ) => void;
  readonly tableLabel: string;
  readonly roomCode: string;
  readonly onToggleShare: () => void;
  readonly onFinish?: () => void;
  /** The first person to open the room; the full receipt is shown to them automatically. */
  readonly isOwner?: boolean;
  /** Data URL of the scanned receipt photo, if this device captured it. */
  readonly receiptImageUrl?: string | null;
  readonly onRenameSelf?: (name: string) => Promise<void>;
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
    // Un cambio con más de una persona implicada es un aviso "compartido";
    // el resto son movimientos privados (para ti).
    scope: (event.peopleCount ?? 0) > 1 ? "shared" : "personal",
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
  roomCode,
  onToggleShare,
  onFinish,
  isOwner,
  receiptImageUrl,
  onRenameSelf,
  messages,
}: SplitBoardProps) {
  const t = messages.board;
  const [tab, setTab] = useState<BoardTab>("remaining");
  const [sheet, setSheet] = useState<{
    itemIds: readonly string[];
    groupId?: string;
  } | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [tableBillOpen, setTableBillOpen] = useState(false);
  const [originalImageOpen, setOriginalImageOpen] = useState(false);
  const [notifications, setNotifications] = useState<
    readonly BoardNotification[]
  >([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    // Muestra el ticket completo nada más entrar, solo a quien lo subió.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- apertura automática una única vez al montar
    if (isOwner) setTableBillOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

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

  // Misma cuenta pero repartiendo lo no reclamado, para mostrar el total
  // global (incluida tu parte de lo que nadie ha marcado todavía).
  const splitWithUnclaimed = computeSplit({
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
    distributeUnclaimed: true,
  });

  useEffect(() => {
    // Keeps read/unread flags for already seen events while reflecting
    // persisted history from the server. Tus propias acciones no generan
    // aviso: solo interesan los cambios que hacen los demás.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza avisos locales con historial remoto persistido
    setNotifications((previous) => {
      const previousById = new Map(previous.map((notice) => [notice.id, notice]));
      return events
        .filter((event) => event.actorId !== selfKey)
        .map((event) => {
          const next = toBoardNotification(event, participants, t);
          return previousById.get(next.id)
            ? { ...next, read: previousById.get(next.id)!.read }
            : next;
        });
    });
  }, [events, participants, selfKey, t]);

  const saveGroup = (
    itemId: string,
    groupId: string,
    ownerId: string,
    memberIds: readonly string[],
    units: number | null,
    shared: boolean,
  ) => {
    onSaveGroup(itemId, groupId, ownerId, memberIds, units, shared);
    setSheet(null);
  };

  // Un mismo producto puede venir repetido en varias líneas del ticket; una
  // nueva reserva se reparte entre esas líneas en orden hasta cubrir las
  // unidades pedidas, generando un grupo distinto por cada línea que aporta.
  const distributeNewGroup = (
    targetItems: readonly EditableItem[],
    groupId: string,
    ownerId: string,
    memberIds: readonly string[],
    units: number | null,
    shared: boolean,
  ) => {
    let remaining = units ?? 0;
    let nextGroupId = groupId;
    for (const item of targetItems) {
      if (remaining <= 0) break;
      const capacity = Math.max(0, item.quantity - assignedUnits(item, claims));
      const take = Math.min(remaining, capacity);
      if (take <= 0) continue;
      onSaveGroup(item.id, nextGroupId, ownerId, memberIds, take, shared);
      nextGroupId = crypto.randomUUID();
      remaining -= take;
    }
    setSheet(null);
  };

  // Cada pestaña mira una parte distinta de la misma línea: lo que queda libre,
  // los grupos abiertos y los grupos privados de esta persona.
  const groupsForTab = (itemId: string) => {
    const groups = groupsByItem.get(itemId) ?? [];
    if (tab === "shared") return groups.filter((group) => group.shared);
    if (tab === "mine")
      return groups.filter(
        (group) => !group.shared && group.memberIds.includes(selfKey),
      );
    return groups;
  };

  const visibleItems = items.filter((item) => {
    if (tab === "remaining")
      return item.quantity - assignedUnits(item, claims) > 0;
    return groupsForTab(item.id).length > 0;
  });

  // Varias líneas del ticket pueden ser el mismo producto (mismo nombre y
  // precio); en "sin asignar" se muestran fusionadas en una sola tarjeta.
  const remainingGroups = useMemo(() => {
    const map = new Map<string, EditableItem[]>();
    for (const item of items) {
      if (item.quantity - assignedUnits(item, claims) <= 0) continue;
      const key = `${item.name.trim().toLowerCase()}|${item.unitPriceCents}`;
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return [...map.values()].map((group) => ({
      key: group.map((item) => item.id).join("+"),
      items: group,
      remainingUnits: group.reduce(
        (sum, item) => sum + Math.max(0, item.quantity - assignedUnits(item, claims)),
        0,
      ),
    }));
  }, [items, claims]);

  const emptyMessages: Record<BoardTab, string> = {
    remaining: items.length === 0 ? t.nothingRemaining : t.nothingLeft,
    shared: t.nothingShared,
    mine: t.nothingAssigned,
  };
  const emptyMessage = emptyMessages[tab];

  const sheetItems = sheet
    ? items.filter((item) => sheet.itemIds.includes(item.id))
    : [];
  const primarySheetItem = sheetItems[0] ?? null;
  const sheetRemainingUnits = sheetItems.reduce(
    (sum, item) => sum + Math.max(0, item.quantity - assignedUnits(item, claims)),
    0,
  );

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
              roomCode={roomCode}
              onToggleShare={onToggleShare}
              profile={
                <ProfileButton
                  currentName={nameOf(selfKey)}
                  onRename={onRenameSelf ?? (async () => {})}
                  messages={t}
                />
              }
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
                  messages={t}
                />
              }
              messages={t}
            />
            <BoardTabs tab={tab} onTabChange={setTab} messages={t} />
          </div>
          <div className="min-h-0 space-y-2 overflow-y-auto rounded-b-2xl border-x border-b border-primary/20 bg-surface p-2">
            {tab === "remaining"
              ? remainingGroups.map(({ key, items: group, remainingUnits }) => (
                  <ProductCard
                    key={key}
                    item={group[0]}
                    remainingUnits={remainingUnits}
                    myUnits={group.reduce(
                      (sum, item) => sum + claimedUnits(item, claims, selfKey),
                      0,
                    )}
                    groups={[]}
                    showGroups={false}
                    onSelect={() =>
                      setSheet({ itemIds: group.map((item) => item.id) })
                    }
                    messages={t}
                  />
                ))
              : visibleItems.flatMap((item) => {
                  const groups = groupsForTab(item.id);

                  return groups.map((group) => (
                    <ProductCard
                      key={`${item.id}-${group.groupId}`}
                      item={item}
                      displayUnits={group.units}
                      remainingUnits={Math.max(
                        0,
                        item.quantity - assignedUnits(item, claims),
                      )}
                      myUnits={claimedUnits(item, claims, selfKey)}
                      groups={
                        tab === "mine"
                          ? []
                          : [
                              {
                                groupId: group.groupId,
                                memberNames: group.memberIds.map(nameOf),
                                units: group.units,
                                includesSelf: group.memberIds.includes(selfKey),
                              },
                            ]
                      }
                      showGroups={true}
                      onSelect={() =>
                        setSheet({ itemIds: [item.id], groupId: group.groupId })
                      }
                      messages={t}
                    />
                  ));
                })}
            {(tab === "remaining" ? remainingGroups.length === 0 : visibleItems.length === 0) && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </p>
            )}
          </div>
        </div>
        <div className="mt-auto">
          <AssignedBar
            split={split}
            splitWithUnclaimed={splitWithUnclaimed}
            selfKey={selfKey}
            open={breakdownOpen}
            onToggle={() => setBreakdownOpen((prev) => !prev)}
            messages={t}
            totalsMessages={messages.totals}
          />
        </div>
      </div>

      <AnimatePresence>
        {primarySheetItem && (
          <ItemActionSheet
            key="item-action-sheet"
            tab={tab}
            item={primarySheetItem}
            selfKey={selfKey}
            groups={groupsForTab(primarySheetItem.id)}
            remainingUnits={sheetRemainingUnits}
            participantNames={Object.fromEntries(
              participants.map((participant) => [
                participant.key,
                participant.name,
              ]),
            )}
            initialGroupId={sheet?.groupId}
            onClose={() => setSheet(null)}
            onSaveGroup={(groupId, ownerId, memberIds, units, shared) =>
              tab === "remaining"
                ? distributeNewGroup(
                    sheetItems,
                    groupId,
                    ownerId,
                    memberIds,
                    units,
                    shared,
                  )
                : saveGroup(
                    primarySheetItem.id,
                    groupId,
                    ownerId,
                    memberIds,
                    units,
                    shared,
                  )
            }
            messages={t}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tableBillOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
            <motion.button
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              type="button"
              aria-label={t.close}
              onClick={() => setTableBillOpen(false)}
              className="absolute inset-0 bg-ink/70"
            />
            <motion.div
              variants={sheetVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative flex h-full max-h-full w-full flex-col overflow-hidden bg-background shadow-2xl sm:h-auto sm:max-h-[85vh] sm:rounded-2xl"
            >
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <ReceiptEditor
                  items={[...items]}
                  extras={extras}
                  onItemsChange={onItemsChange}
                  onExtrasChange={onExtrasChange}
                  messages={messages.receiptEditor}
                  itemRowMessages={messages.itemRow}
                />
              </div>
              <div className="flex shrink-0 gap-2 border-t border-primary/20 p-4">
                {receiptImageUrl && (
                  <button
                    type="button"
                    onClick={() => setOriginalImageOpen(true)}
                    className="flex-1 rounded-full border border-primary px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10"
                  >
                    {t.viewOriginalTicket}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTableBillOpen(false)}
                  className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                >
                  {t.close}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {originalImageOpen && receiptImageUrl && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.button
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              type="button"
              aria-label={t.close}
              onClick={() => setOriginalImageOpen(false)}
              className="absolute inset-0 bg-ink/70"
            />
            <motion.div
              variants={sheetVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-hidden rounded-2xl border border-primary/40 bg-background p-3 shadow-2xl"
            >
              <div className="min-h-0 flex-1 overflow-y-auto">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote image */}
                <img
                  src={receiptImageUrl}
                  alt={t.viewOriginalTicket}
                  className="w-full rounded-lg object-contain"
                />
              </div>
              <button
                type="button"
                onClick={() => setOriginalImageOpen(false)}
                className="shrink-0 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
              >
                {t.close}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

