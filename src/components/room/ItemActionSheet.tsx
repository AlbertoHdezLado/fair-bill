"use client";

import { useState } from "react";
import { User, Users } from "lucide-react";
import { formatCents } from "@/lib/money";
import type { EditableItem } from "@/lib/receipt/editable";
import type { ItemGroup } from "@/lib/local-claims";
import { formatUnits, perPersonCents } from "./ProductCard";
import type { RoomTab } from "./BillProgress";
import type { Messages } from "@/i18n";

interface ItemActionSheetProps {
  readonly tab: RoomTab;
  readonly item: EditableItem;
  readonly selfKey: string;
  readonly groups: readonly ItemGroup[];
  /** Units of the line nobody has taken yet. */
  readonly remainingUnits: number;
  readonly participantNames: Readonly<Record<string, string>>;
  /** Opens straight into editing this group, e.g. when tapped from its card. */
  readonly initialGroupId?: string;
  readonly onClose: () => void;
  readonly onSaveGroup: (
    groupId: string,
    ownerId: string,
    memberIds: readonly string[],
    units: number | null,
    shared: boolean,
    allParticipants: boolean,
  ) => void;
  readonly messages: Messages["roomSplit"];
}

export function ItemActionSheet({
  tab,
  item,
  selfKey,
  groups,
  remainingUnits,
  participantNames,
  initialGroupId,
  onClose,
  onSaveGroup,
  messages,
}: ItemActionSheetProps) {
  const myGroups = groups.filter((group) => group.memberIds.includes(selfKey));
  const nameOf = (key: string) => participantNames[key] ?? key;
  const [editingGroupId, setEditingGroupId] = useState<string | null>(
    initialGroupId ?? null,
  );
  const editingGroup = myGroups.find((group) => group.groupId === editingGroupId);
  const itemName = item.name || messages.unnamedItem;
  const modalTitle = itemName.toUpperCase();

  // Salir deja intacta la parte de los demás, así que el grupo encoge justo lo
  // que era mío.
  const leaveGroup = (group: ItemGroup) => {
    const rest = group.memberIds.filter((member) => member !== selfKey);
    if (rest.length === 0) {
      onSaveGroup(
        group.groupId,
        group.ownerId,
        [],
        null,
        group.shared,
        group.allParticipants,
      );
      return;
    }
    onSaveGroup(
      group.groupId,
      group.ownerId,
      rest,
      (group.units / group.memberIds.length) * rest.length,
      group.shared,
      group.allParticipants,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label={messages.close}
        onClick={onClose}
        className="absolute inset-0 bg-ink/70"
      />
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl border border-primary/40 bg-background p-4 shadow-2xl sm:rounded-2xl">
        <p className="truncate text-lg font-bold text-primary">{modalTitle}</p>

        {tab === "remaining" && (
          <NewGroupForm
            item={item}
            selfKey={selfKey}
            groups={groups}
            remainingUnits={remainingUnits}
            participantNames={participantNames}
            onSaveGroup={onSaveGroup}
            messages={messages}
          />
        )}

        {tab === "mine" && (
          <section className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {messages.myGroupsTitle}
            </p>
            {myGroups.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {messages.noGroups}
              </p>
            )}
            {myGroups.map((group) => (
              <button
                key={group.groupId}
                type="button"
                onClick={() => setEditingGroupId(group.groupId)}
                className="rounded-lg border border-primary/20 bg-surface px-3 py-2 text-left"
              >
                <p className="truncate text-sm font-semibold">
                  {group.memberIds.map(nameOf).join(", ")}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {messages.groupUnits.replace(
                    "{{count}}",
                    formatUnits(group.units),
                  )}
                  {" · "}
                  {messages.perPerson.replace(
                    "{{amount}}",
                    formatCents(
                      perPersonCents(
                        item,
                        group.units,
                        group.memberIds.length,
                      ),
                    ),
                  )}
                </p>
              </button>
            ))}
          </section>
        )}

        {tab === "shared" && (
          <section className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {messages.sharedGroupsTitle}
            </p>
            {groups.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {messages.noGroups}
              </p>
            )}
            {groups.map((group) => {
              const includesSelf = group.memberIds.includes(selfKey);
              const rowClassName = `flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                includesSelf
                  ? "border-gold bg-gold/15"
                  : "border-primary/20 bg-surface"
              }`;
              const groupInfo = (
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {group.memberIds.map(nameOf).join(", ")}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {messages.groupUnits.replace(
                      "{{count}}",
                      formatUnits(group.units),
                    )}
                    {" · "}
                    {messages.perPerson.replace(
                      "{{amount}}",
                      formatCents(
                        perPersonCents(
                          item,
                          group.units,
                          group.memberIds.length,
                        ),
                      ),
                    )}
                  </p>
                </div>
              );

              if (includesSelf) {
                return (
                  <button
                    key={group.groupId}
                    type="button"
                    onClick={() => setEditingGroupId(group.groupId)}
                    className={`${rowClassName} text-left`}
                  >
                    {groupInfo}
                  </button>
                );
              }

              return (
                <div key={group.groupId} className={rowClassName}>
                  {groupInfo}
                  <button
                    type="button"
                    onClick={() =>
                      onSaveGroup(
                        group.groupId,
                        group.ownerId,
                        [...group.memberIds, selfKey],
                        group.units,
                        true,
                        group.allParticipants,
                      )
                    }
                    className="shrink-0 rounded-full bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary-hover"
                  >
                    {messages.joinShared}
                  </button>
                </div>
              );
            })}
          </section>
        )}
      </div>

      {editingGroup && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label={messages.close}
            onClick={() => setEditingGroupId(null)}
            className="absolute inset-0 bg-ink/70"
          />
          <div className="relative flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl border border-primary/40 bg-background p-4 shadow-2xl sm:rounded-2xl">
            <p className="min-w-0 truncate text-sm font-semibold text-primary">
              {editingGroup.memberIds.map(nameOf).join(", ")}
            </p>
            <GroupEditor
              item={item}
              group={editingGroup}
              remainingUnits={remainingUnits}
              nameOf={nameOf}
              onSaveGroup={(
                groupId,
                ownerId,
                memberIds,
                units,
                shared,
                allParticipants,
              ) => {
                onSaveGroup(
                  groupId,
                  ownerId,
                  memberIds,
                  units,
                  shared,
                  allParticipants,
                );
                setEditingGroupId(null);
              }}
              onLeave={() => {
                leaveGroup(editingGroup);
                setEditingGroupId(null);
              }}
              messages={messages}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function NewGroupForm({
  item,
  selfKey,
  groups,
  remainingUnits,
  participantNames,
  onSaveGroup,
  messages,
}: {
  readonly item: EditableItem;
  readonly selfKey: string;
  readonly groups: readonly ItemGroup[];
  readonly remainingUnits: number;
  readonly participantNames: Readonly<Record<string, string>>;
  readonly onSaveGroup: (
    groupId: string,
    ownerId: string,
    memberIds: readonly string[],
    units: number | null,
    shared: boolean,
    allParticipants: boolean,
  ) => void;
  readonly messages: Messages["roomSplit"];
}) {
  const [units, setUnits] = useState(1);
  const [pickingPeople, setPickingPeople] = useState(false);
  const capped = Math.min(units, remainingUnits);
  const others = Object.entries(participantNames).filter(
    ([key]) => key !== selfKey,
  );
  const existingSharedGroup = groups.find(
    (group) => group.shared && !group.memberIds.includes(selfKey),
  );

  if (pickingPeople) {
    return (
      <SharePicker
        others={others}
        onCancel={() => setPickingPeople(false)}
        onConfirm={(memberIds, allParticipants) => {
          onSaveGroup(
            crypto.randomUUID(),
            selfKey,
            [selfKey, ...memberIds],
            capped,
            true,
            allParticipants,
          );
          setPickingPeople(false);
        }}
        messages={messages}
      />
    );
  }

  return (
    <section className="flex flex-col items-center gap-2 rounded-xl border border-primary/20 bg-surface p-3">
      <UnitStepper
        units={capped}
        max={remainingUnits}
        onChange={setUnits}
        messages={messages}
      />
      <p className="text-sm tabular-nums text-muted-foreground">
        {formatCents(perPersonCents(item, capped, 1))}
      </p>
      <div className="flex w-full gap-2">
        <button
          type="button"
          disabled={remainingUnits <= 0}
          onClick={() =>
            onSaveGroup(
              crypto.randomUUID(),
              selfKey,
              [selfKey],
              capped,
              false,
              false,
            )
          }
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
        >
          <User aria-hidden="true" size={16} />
          {messages.forMe}
        </button>
        <button
          type="button"
          disabled={remainingUnits <= 0}
          onClick={() => setPickingPeople(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-gold px-4 py-3 text-sm font-medium text-ink hover:bg-gold-hover disabled:opacity-40"
        >
          <Users aria-hidden="true" size={16} />
          {messages.shareUnits}
        </button>
      </div>
      {existingSharedGroup && (
        <button
          type="button"
          disabled={remainingUnits <= 0}
          onClick={() =>
            onSaveGroup(
              existingSharedGroup.groupId,
              existingSharedGroup.ownerId,
              [...existingSharedGroup.memberIds, selfKey],
              existingSharedGroup.units + capped,
              true,
              existingSharedGroup.allParticipants,
            )
          }
          className="flex w-full items-center justify-center gap-2 rounded-full border border-gold px-4 py-3 text-sm font-medium text-gold disabled:opacity-40"
        >
          <Users aria-hidden="true" size={16} />
          {messages.joinExistingGroup}
        </button>
      )}
    </section>
  );
}

function SharePicker({
  others,
  onCancel,
  onConfirm,
  messages,
}: {
  readonly others: readonly (readonly [string, string])[];
  readonly onCancel: () => void;
  readonly onConfirm: (
    memberIds: readonly string[],
    allParticipants: boolean,
  ) => void;
  readonly messages: Messages["roomSplit"];
}) {
  const [selectMode, setSelectMode] = useState<"none" | "select">("none");
  const [selected, setSelected] = useState<readonly string[]>([]);

  const toggle = (key: string) => {
    setSelected((previous) =>
      previous.includes(key)
        ? previous.filter((candidate) => candidate !== key)
        : [...previous, key],
    );
  };

  return (
    <section className="flex w-full flex-col gap-3 rounded-xl border border-primary/20 bg-surface p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {messages.shareWith}
      </p>

      {selectMode === "none" && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onConfirm(others.map(([key]) => key), true)}
            className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-hover"
          >
            {messages.everyone}
          </button>
          {others.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectMode("select")}
              className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-ink hover:bg-gold-hover"
            >
              {messages.selectPeople}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-muted-foreground underline"
          >
            {messages.back}
          </button>
        </div>
      )}

      {selectMode === "select" && (
        <div className="flex flex-col gap-3">
          <ul className="grid grid-cols-2 gap-2">
            {others.map(([key, name]) => {
              const isSelected = selected.includes(key);
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    className={`flex min-h-12 w-full items-center justify-center rounded-2xl border px-3 py-2 text-sm font-bold ${
                      isSelected
                        ? "border-gold bg-gold/15"
                        : "border-primary/40 bg-surface hover:border-primary"
                    }`}
                  >
                    <span className="min-w-0 truncate">{name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelectMode("none")}
              className="rounded-full border border-primary/50 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10"
            >
              {messages.back}
            </button>
            <button
              type="button"
              onClick={() => onConfirm(selected, false)}
              className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              {messages.confirm}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function GroupEditor({
  item,
  group,
  remainingUnits,
  nameOf,
  onSaveGroup,
  onLeave,
  messages,
}: {
  readonly item: EditableItem;
  readonly group: ItemGroup;
  readonly remainingUnits: number;
  readonly nameOf: (key: string) => string;
  readonly onSaveGroup: (
    groupId: string,
    ownerId: string,
    memberIds: readonly string[],
    units: number | null,
    shared: boolean,
    allParticipants: boolean,
  ) => void;
  readonly onLeave: () => void;
  readonly messages: Messages["roomSplit"];
}) {
  const [units, setUnits] = useState(group.units);
  const max = group.units + remainingUnits;
  const capped = Math.min(units, max);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-surface p-3">
      <div className="flex items-center gap-2 text-sm">
        <Users
          aria-hidden="true"
          size={14}
          className="shrink-0 text-primary"
        />
        <span className="min-w-0 truncate font-semibold">
          {group.memberIds.map(nameOf).join(", ")}
        </span>
      </div>

      <UnitStepper
        units={capped}
        max={max}
        onChange={setUnits}
        messages={messages}
      />

      <p className="text-center text-sm tabular-nums text-muted-foreground">
        {messages.perPerson.replace(
          "{{amount}}",
          formatCents(perPersonCents(item, capped, group.memberIds.length)),
        )}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onLeave}
          className="rounded-full border border-red-600 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-600/10"
        >
          {messages.leaveGroup}
        </button>
        <button
          type="button"
          onClick={() =>
            onSaveGroup(
              group.groupId,
              group.ownerId,
              group.memberIds,
              capped,
              group.shared,
              group.allParticipants,
            )
          }
          className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          {messages.saveSelection}
        </button>
      </div>
    </section>
  );
}

function UnitStepper({
  units,
  max,
  onChange,
  messages,
}: {
  readonly units: number;
  readonly max: number;
  readonly onChange: (units: number) => void;
  readonly messages: Messages["roomSplit"];
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {messages.units}
      </p>
      <div className="flex items-center gap-4">
        <StepperButton
          icon="minus"
          disabled={units <= 1}
          onClick={() => onChange(Math.max(1, units - 1))}
        />
        <span className="w-14 text-center text-2xl font-bold tabular-nums text-primary">
          {formatUnits(units)}
        </span>
        <StepperButton
          icon="plus"
          disabled={units >= max}
          onClick={() => onChange(Math.min(max, units + 1))}
        />
      </div>
      <button
        type="button"
        disabled={units >= max || max <= 0}
        onClick={() => onChange(max)}
        className="rounded-full border border-gold px-3 py-1 text-xs text-gold disabled:opacity-40"
      >
        {messages.takeAll}
      </button>
    </div>
  );
}

function StepperButton({
  icon,
  disabled,
  onClick,
}: {
  readonly icon: "minus" | "plus";
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={icon === "plus" ? "+" : "-"}
      className="flex h-12 w-12 items-center justify-center rounded-full border border-primary text-primary disabled:opacity-40"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <line x1="5" y1="12" x2="19" y2="12" />
        {icon === "plus" && <line x1="12" y1="5" x2="12" y2="19" />}
      </svg>
    </button>
  );
}
