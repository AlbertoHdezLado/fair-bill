"use client";

// Turno de un participante: se muestran las líneas como tarjetas centradas. Al
// tocar una se abre un modal para elegir "Solo" (una cantidad de unidades) o
// "Compartir" (con qué otros participantes y cuántas unidades entre todos). Al
// verificar se vuelve a la lista. Las líneas que ya cubren todas sus unidades
// entre el resto de participantes dejan de mostrarse (salvo que sea la propia
// elección la que se esté editando).

import { useState } from "react";
import { Users } from "lucide-react";
import { formatCents } from "@/lib/money";
import { defaultMessages, type Messages } from "@/i18n";
import type { EditableItem } from "@/lib/receipt/editable";
import {
  claimedUnits,
  choiceGroup,
  choiceTotalUnits,
  choiceUnits,
  entriesFor,
  isItemFullyClaimedByOthers,
  ownChoice,
  unitsTakenExcludingOwner,
  type ClaimEntry,
  type ClaimChoice,
  type LocalClaims,
} from "@/lib/local-claims";

interface Participant {
  readonly key: string;
  readonly name: string;
}

interface PersonClaimStepProps {
  readonly participantKey: string;
  readonly participantName: string;
  readonly participants: readonly Participant[];
  readonly items: readonly EditableItem[];
  readonly claims: LocalClaims;
  readonly onChange: (
    itemId: string,
    participantKeys: readonly string[],
    choice: ClaimChoice | null,
  ) => void;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
  readonly messages?: Messages["claim"];
}

export function PersonClaimStep({
  participantKey,
  participantName,
  participants,
  items,
  claims,
  onChange,
  onConfirm,
  onBack,
  messages = defaultMessages.claim,
}: PersonClaimStepProps) {
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const selectedCents = items.reduce((sum, item) => {
    const units = claimedUnits(item, claims, participantKey);
    return sum + Math.round(units * item.unitPriceCents);
  }, 0);

  const visibleItems = items.filter(
    (item) => !isItemFullyClaimedByOthers(item, claims, participantKey),
  );

  const openItem = visibleItems.find((item) => item.id === openItemId) ?? null;
  const others = participants.filter((p) => p.key !== participantKey);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-xl font-bold text-primary">
        {participantName}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {visibleItems.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            availableUnits={availableUnitsForOwner(
              item,
              claims,
              participantKey,
            )}
            entries={entriesFor(claims, participantKey, item.id)}
            onClick={() => setOpenItemId(item.id)}
            messages={messages}
          />
        ))}
      </div>

      {visibleItems.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {messages.noItemsLeft}
        </p>
      )}

      <p className="text-sm">
        {messages.yourSelection}{" "}
        <span className="font-semibold tabular-nums">
          {formatCents(selectedCents)}
        </span>
        <span className="text-xs text-muted-foreground">
          {" "}
          {messages.withoutExtras}
        </span>
      </p>

      <button
        type="button"
        onClick={onConfirm}
        className="mt-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
      >
        {messages.confirm}
      </button>

      {openItem && (
        <ItemClaimModal
          item={openItem}
          choice={ownChoice(claims, participantKey, openItem.id)}
          others={others}
          availableUnits={availableUnitsForOwner(
            openItem,
            claims,
            participantKey,
          )}
          selfKey={participantKey}
          onClose={() => setOpenItemId(null)}
          onApply={(participantKeys, choice) => {
            // Si el grupo cambia (p. ej. se quita a alguien), su elección
            // anterior queda obsoleta y hay que borrarla explícitamente.
            const previousGroup = choiceGroup(
              participantKey,
              ownChoice(claims, participantKey, openItem.id),
            );
            const staleKeys = previousGroup.filter(
              (key) => key !== participantKey && !participantKeys.includes(key),
            );
            if (staleKeys.length > 0) onChange(openItem.id, staleKeys, null);
            onChange(openItem.id, participantKeys, choice);
            setOpenItemId(null);
          }}
          messages={messages}
        />
      )}
    </div>
  );
}

interface ItemCardProps {
  readonly item: EditableItem;
  readonly availableUnits: number;
  readonly entries: readonly ClaimEntry[];
  readonly onClick: () => void;
  readonly messages: Messages["claim"];
}

function ItemCard({
  item,
  availableUnits,
  entries,
  onClick,
  messages,
}: ItemCardProps) {
  const hasChoice = entries.length > 0;
  const label = hasChoice
    ? `${entries.map((entry) => formatEntryUnits(item, entry)).join(" + ")} ${messages.unitsAbbr}`
    : messages.select;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center ${
        hasChoice
          ? "border-primary bg-primary/20"
          : "border-border bg-surface"
      }`}
    >
      <span className="flex min-h-10 w-full items-center justify-center">
        <span className="line-clamp-2 text-sm font-medium">
          {item.name || messages.unnamedItem}
        </span>
      </span>
      <span className="tabular-nums text-xs text-muted-foreground">
        {formatUnits(availableUnits)} × {formatCents(item.unitPriceCents)}
      </span>
      <span
        className={`mt-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          hasChoice
            ? "bg-primary text-primary-foreground"
            : "border border-dashed border-border text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function formatEntryUnits(item: EditableItem, entry: ClaimEntry): string {
  if (entry.choice.mode === "units") {
    const groupSize = Math.max(entry.choice.group?.length ?? 1, 1);
    const totalUnits = choiceTotalUnits(item, entry.choice);
    if (groupSize > 1 && Math.abs(totalUnits - 1) < 1e-9) {
      return `1/${groupSize}`;
    }
  }
  return formatUnits(choiceUnits(item, entry.choice));
}

type ModalStage = "units" | "shared-people";

interface ItemClaimModalProps {
  readonly item: EditableItem;
  readonly choice: ClaimChoice | null;
  readonly others: readonly Participant[];
  readonly availableUnits: number;
  readonly selfKey: string;
  readonly onClose: () => void;
  readonly onApply: (
    participantKeys: readonly string[],
    choice: ClaimChoice | null,
  ) => void;
  readonly messages: Messages["claim"];
}

function ItemClaimModal({
  item,
  choice,
  others,
  availableUnits,
  selfKey,
  onClose,
  onApply,
  messages,
}: ItemClaimModalProps) {
  const existingGroup = choiceGroup(selfKey, choice).filter(
    (key) => key !== selfKey,
  );
  const [stage, setStage] = useState<ModalStage>("units");
  const [sharedWith, setSharedWith] = useState<string[]>(existingGroup);

  const currentGroupUnits = choice ? choiceTotalUnits(item, choice) : 0;
  const available = availableUnits;
  const minimumUnits = available > 0 ? 1 : 0;

  const [text, setText] = useState(() => {
    if (choice) {
      return currentGroupUnits > 0 ? formatUnits(currentGroupUnits) : "";
    }
    return "1";
  });
  const parsed = parseUnitsInput(text);
  const units = parsed === null ? null : clamp(parsed, minimumUnits, available);

  function setUnits(next: number) {
    setText(formatUnits(clamp(next, minimumUnits, available)));
  }

  function toggleShared(key: string) {
    setSharedWith((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-ink/70"
      />
      <div className="relative flex w-full max-w-sm flex-col gap-3 rounded-lg border border-primary/40 bg-background p-4 pt-16 shadow-2xl">
        <button
          type="button"
          aria-label={messages.cancelLabel}
          onClick={onClose}
          className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full text-3xl leading-none text-primary hover:bg-primary/10 hover:text-primary-hover"
        >
          ×
        </button>
        <div className="flex flex-col items-center gap-0.5 text-center">
          <p className="text-lg font-bold text-primary">
            {item.name || messages.unnamedItem}
          </p>
        </div>

        {stage === "units" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={units === null || units <= minimumUnits}
                onClick={() => setUnits((units ?? 0) - 1)}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-primary text-xl font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                −
              </button>
              <input
                type="text"
                inputMode="decimal"
                value={text}
                onChange={(e) => {
                  // Strip anything that isn't part of a number or fraction
                  // (digits, decimal separator, "/" and spaces for mixed
                  // fractions) so letters can never be typed in.
                  const value = e.target.value.replace(/[^0-9.,/\s]/g, "");
                  const parsedValue = parseUnitsInput(value);
                  // Clamp only once the input resolves to a valid number, so
                  // partial input (e.g. "1/", trailing decimal separator) can
                  // still be typed without being reset mid-way. Out-of-range
                  // values are snapped to the limit immediately, rather than
                  // letting an invalid value sit until blur.
                  if (parsedValue !== null && parsedValue > available) {
                    setText(formatUnits(available));
                    return;
                  }
                  if (parsedValue !== null && parsedValue < minimumUnits) {
                    setText(formatUnits(minimumUnits));
                    return;
                  }
                  setText(value);
                }}
                onBlur={() => {
                  if (text.trim() === "") setText("0");
                }}
                placeholder="0"
                className="w-20 rounded border border-primary bg-transparent px-2 py-2 text-center text-lg tabular-nums text-primary outline-none focus:outline-primary"
              />
              <button
                type="button"
                disabled={units === null || units >= available}
                onClick={() => setUnits((units ?? 0) + 1)}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-primary text-xl font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
            </div>

            <button
              type="button"
              disabled={units === null || units >= available}
              onClick={() => setUnits(available)}
              className="self-center rounded-full border border-gold px-3 py-1 text-xs text-gold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {messages.selectAll}
            </button>

            {others.length > 0 && (
              <button
                type="button"
                disabled={units === null || units <= 0}
                onClick={() => setStage("shared-people")}
                className="mt-3 inline-flex self-center items-center justify-center gap-2 rounded-full bg-gold px-4 py-2.5 text-sm font-medium text-gold-foreground hover:bg-gold-hover disabled:opacity-50"
              >
                <Users aria-hidden="true" size={18} strokeWidth={2} />
                {messages.share}
              </button>
            )}

            <button
              type="button"
              disabled={units === null || units <= 0}
              onClick={() =>
                onApply([selfKey], { mode: "units", count: units ?? 0 })
              }
              className="mt-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {messages.confirm}
            </button>

            {choice && (
              <button
                type="button"
                onClick={() => onApply([selfKey], null)}
                className="rounded-full border border-primary/50 px-4 py-2 text-sm text-primary hover:bg-primary/10"
              >
                {messages.removeSelection}
              </button>
            )}
          </div>
        )}

        {stage === "shared-people" && (
          <div className="flex flex-col gap-2">
            <p className="text-center text-xs text-muted-foreground">
              {messages.sharedWith}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {others.map((person) => {
                const isSelected = sharedWith.includes(person.key);
                return (
                  <button
                    key={person.key}
                    type="button"
                    onClick={() => toggleShared(person.key)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-foreground"
                    }`}
                  >
                    {person.name || messages.unnamedItem}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={sharedWith.length === others.length}
              onClick={() => setSharedWith(others.map((p) => p.key))}
              className="self-center rounded-full border border-gold px-3 py-1 text-xs text-gold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {messages.selectEveryone}
            </button>
            <button
              type="button"
              disabled={sharedWith.length === 0}
              onClick={() =>
                onApply([selfKey, ...sharedWith], {
                  mode: "units",
                  count: units ?? 0,
                  group: [selfKey, ...sharedWith],
                })
              }
              className="mt-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {messages.confirm}
            </button>
            <button
              type="button"
              onClick={() => setStage("units")}
              className="rounded-full px-4 py-2 text-sm text-muted-foreground"
            >
              {messages.back}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function parseUnitsInput(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;

  // Fracción mixta o simple: "1 1/2", "3/4"...
  const fractionMatch = /^(\d+\s+)?(\d+)\/(\d+)$/.exec(trimmed);
  if (fractionMatch) {
    const whole = fractionMatch[1] ? Number.parseInt(fractionMatch[1], 10) : 0;
    const numerator = Number.parseInt(fractionMatch[2], 10);
    const denominator = Number.parseInt(fractionMatch[3], 10);
    if (denominator === 0) return null;
    return whole + numerator / denominator;
  }

  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function availableUnitsForOwner(
  item: EditableItem,
  claims: LocalClaims,
  ownerKey: string,
): number {
  return Math.max(item.quantity - unitsTakenExcludingOwner(item, claims, ownerKey), 0);
}

/** Aproxima un decimal a la fracción n/d más sencilla con d <= maxDenominator. */
function toFraction(
  value: number,
  maxDenominator = 8,
): { numerator: number; denominator: number } {
  let bestNumerator = 0;
  let bestDenominator = 1;
  let bestError = Number.POSITIVE_INFINITY;
  for (let denominator = 1; denominator <= maxDenominator; denominator++) {
    const numerator = Math.round(value * denominator);
    const error = Math.abs(value - numerator / denominator);
    if (error < bestError) {
      bestError = error;
      bestNumerator = numerator;
      bestDenominator = denominator;
    }
  }
  return { numerator: bestNumerator, denominator: bestDenominator };
}

function formatUnits(units: number): string {
  const whole = Math.trunc(units);
  const fractional = Math.abs(units - whole);
  if (fractional < 1e-9) return String(whole);

  const { numerator, denominator } = toFraction(fractional);
  if (numerator === 0) return String(whole);
  if (numerator === denominator) return String(whole + Math.sign(units || 1));

  const fractionText = `${numerator}/${denominator}`;
  return whole === 0 ? fractionText : `${whole} ${fractionText}`;
}
