"use client";

import type { PersonSplit } from "@/lib/split";
import { formatCents } from "@/lib/money";
import { defaultMessages, type Messages } from "@/i18n";

interface PersonTotalsProps {
  readonly person: PersonSplit;
  readonly currency: string;
  readonly hasPaid: boolean;
  readonly isOwn: boolean;
  readonly disabled?: boolean;
  readonly onTogglePaid?: () => void;
  readonly messages?: Messages["totals"];
}

export function PersonTotals({
  person,
  currency,
  hasPaid,
  isOwn,
  disabled,
  onTogglePaid,
  messages = defaultMessages.totals,
}: PersonTotalsProps) {
  return (
    <details className="group rounded-xl border border-primary/20 bg-primary/15 p-3 dark:border-primary/25 dark:bg-primary/10">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="text-base font-bold">
          {person.name}
          {isOwn && <span className="text-zinc-400"> ({messages.you})</span>}
        </span>
        <span className="flex items-center gap-3">
          <span className="text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
            {formatCents(person.totalCents, currency)}
          </span>
          {hasPaid && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
              {messages.paid}
            </span>
          )}
        </span>
      </summary>

      <div className="mt-3 flex flex-col gap-1 border-t border-primary/15 pt-3 text-xs text-zinc-500 dark:border-primary/20">
        {person.items.map((item) => (
          <div
            key={item.itemId}
            className={`flex justify-between gap-2 ${
              item.hasUnclaimedShare
                ? "font-medium text-warning-solid"
                : "font-medium text-zinc-700 dark:text-zinc-200"
            }`}
          >
            <span className="truncate">
              {item.itemName}
              {item.effectiveUnits > 0 && (
                <span> x{Math.round(item.effectiveUnits * 100) / 100}</span>
              )}
            </span>
            <span className="tabular-nums">
              {formatCents(item.shareCents, currency)}
            </span>
          </div>
        ))}
        {person.items.length === 0 && <p>{messages.noItems}</p>}
        {person.taxCents > 0 && (
          <div className="flex justify-between gap-2">
            <span>{messages.tax}</span>
            <span className="tabular-nums">
              {formatCents(person.taxCents, currency)}
            </span>
          </div>
        )}
        {person.tipCents > 0 && (
          <div className="flex justify-between gap-2">
            <span>{messages.tipService}</span>
            <span className="tabular-nums">
              {formatCents(person.tipCents, currency)}
            </span>
          </div>
        )}
        {person.discountCents > 0 && (
          <div className="flex justify-between gap-2">
            <span>{messages.discount}</span>
            <span className="tabular-nums">
              -{formatCents(person.discountCents, currency)}
            </span>
          </div>
        )}
      </div>

      {isOwn && onTogglePaid && (
        <button
          type="button"
          onClick={onTogglePaid}
          disabled={disabled}
          className="mt-3 w-full rounded-full border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
        >
          {hasPaid ? messages.markUnpaid : messages.markPaid}
        </button>
      )}
    </details>
  );
}
