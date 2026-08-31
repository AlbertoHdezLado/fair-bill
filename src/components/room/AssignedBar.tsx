"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatCents } from "@/lib/money";
import type { PersonSplit, SplitResult } from "@/lib/split";
import { backdropVariants, sheetVariants } from "@/lib/motion";
import { formatUnits } from "./ProductCard";
import type { Messages } from "@/i18n";

export interface UnassignedBreakdownEntry {
  readonly key: string;
  readonly name: string;
  readonly remainingUnits: number;
  readonly subtotalCents: number;
  readonly perPersonCents: number;
}

interface AssignedBarProps {
  readonly split: SplitResult;
  readonly splitWithUnclaimed: SplitResult;
  readonly selfKey: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly unassignedBreakdown?: readonly UnassignedBreakdownEntry[];
  readonly unassignedSubtotalCents?: number;
  readonly messages: Messages["roomSplit"];
  readonly totalsMessages: Messages["totals"];
}

export function AssignedBar({
  split,
  splitWithUnclaimed,
  selfKey,
  open,
  onToggle,
  unassignedBreakdown = [],
  unassignedSubtotalCents = 0,
  messages,
  totalsMessages,
}: AssignedBarProps) {
  const me = split.people.find((person) => person.participantId === selfKey);
  const meWithUnclaimed = splitWithUnclaimed.people.find(
    (person) => person.participantId === selfKey,
  );
  const myTotalCents = meWithUnclaimed?.totalCents ?? 0;

  // Muestra un "+X €" o "-X €" fugaz cuando cambia tu total, como si el
  // importe entrase o saliese de tu cuenta.
  const [delta, setDelta] = useState<{ id: number; value: number } | null>(
    null,
  );
  const prevTotalRef = useRef(myTotalCents);
  const deltaIdRef = useRef(0);

  useEffect(() => {
    const diff = myTotalCents - prevTotalRef.current;
    prevTotalRef.current = myTotalCents;
    if (diff === 0) return;
    deltaIdRef.current += 1;
    setDelta({ id: deltaIdRef.current, value: diff });
    const timeout = setTimeout(() => setDelta(null), 1200);
    return () => clearTimeout(timeout);
  }, [myTotalCents]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-30 flex items-end justify-center">
            <motion.button
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              type="button"
              aria-label={messages.close}
              onClick={onToggle}
              className="absolute inset-0 bg-ink/70"
            />
            <motion.div
              variants={sheetVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative flex max-h-[55vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-2xl border border-primary/40 bg-background p-3 shadow-2xl"
            >
              {me ? (
                <PersonBreakdown
                  person={me}
                  personWithUnclaimed={meWithUnclaimed ?? me}
                  unassignedBreakdown={unassignedBreakdown}
                  unassignedSubtotalCents={unassignedSubtotalCents}
                  messages={totalsMessages}
                  roomMessages={messages}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {messages.nothingAssigned}
                </p>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="relative -mx-4 -mb-4 flex w-[calc(100%+2rem)] shrink-0 items-center justify-between gap-3 border-t border-primary/40 bg-primary px-5 py-3 text-primary-foreground shadow-[0_-2px_12px_rgba(0,0,0,0.18)]"
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
      >
        <AnimatePresence>
          {delta && (
            <motion.span
              key={delta.id}
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: -8, scale: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className={`pointer-events-none absolute right-5 top-0 z-10 -translate-y-full text-sm font-bold tabular-nums ${
                delta.value > 0 ? "text-gold" : "text-primary"
              }`}
            >
              {delta.value > 0
                ? `+${formatCents(delta.value)}`
                : formatCents(delta.value)}
            </motion.span>
          )}
        </AnimatePresence>
        <span className="text-lg font-bold">{messages.yourTotal}</span>
        <span className="flex items-center gap-2">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={myTotalCents}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.15 }}
              className="text-lg font-bold tabular-nums"
            >
              {formatCents(myTotalCents)}
            </motion.span>
          </AnimatePresence>
          <ChevronUp
            aria-hidden="true"
            size={18}
            className={
              open ? "rotate-180 transition-transform" : "transition-transform"
            }
          />
        </span>
      </button>
    </>
  );
}

function PersonBreakdown({
  person,
  personWithUnclaimed,
  unassignedBreakdown,
  unassignedSubtotalCents,
  messages,
  roomMessages,
}: {
  readonly person: PersonSplit;
  readonly personWithUnclaimed: PersonSplit;
  readonly unassignedBreakdown: readonly UnassignedBreakdownEntry[];
  readonly unassignedSubtotalCents: number;
  readonly messages: Messages["totals"];
  readonly roomMessages: Messages["roomSplit"];
}) {
  const [unassignedOpen, setUnassignedOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1 text-sm">
      {person.items.map((item) => (
        <div key={item.itemId} className="flex justify-between gap-2">
          <span className="truncate">
            {formatUnits(item.effectiveUnits)}× {item.itemName}
          </span>
          <span className="tabular-nums">{formatCents(item.shareCents)}</span>
        </div>
      ))}
      {person.items.length === 0 && (
        <p className="text-muted-foreground">{messages.noItems}</p>
      )}
      <div className="mt-1 flex justify-between gap-2 border-t border-primary/20 pt-1 text-base font-semibold">
        <span>{roomMessages.yourProductsSubtotal}</span>
        <span className="tabular-nums">
          {formatCents(person.subtotalCents)}
        </span>
      </div>
      {personWithUnclaimed.taxCents > 0 && (
        <ExtraRow label={messages.tax} cents={personWithUnclaimed.taxCents} />
      )}
      {personWithUnclaimed.tipCents > 0 && (
        <ExtraRow
          label={messages.tipService}
          cents={personWithUnclaimed.tipCents}
        />
      )}
      {personWithUnclaimed.discountCents > 0 && (
        <ExtraRow
          label={messages.discount}
          cents={-personWithUnclaimed.discountCents}
        />
      )}

      {unassignedBreakdown.length > 0 && (
        <div className="mt-1 flex flex-col gap-1 border-t border-primary/20 pt-2">
          <button
            type="button"
            onClick={() => setUnassignedOpen((prev) => !prev)}
            aria-expanded={unassignedOpen}
            className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            <span className="flex items-center gap-1">
              <ChevronDown
                aria-hidden="true"
                size={14}
                className={
                  unassignedOpen ? "rotate-180 transition-transform" : "transition-transform"
                }
              />
              {roomMessages.unassignedProducts}
            </span>
            <span className="tabular-nums">
              {formatCents(
                Math.round(unassignedSubtotalCents / Math.max(personWithUnclaimed.participantCount, 1)),
              )}
            </span>
          </button>
          {unassignedOpen && (
            <div className="flex flex-col gap-1 pl-1 text-muted-foreground">
              {unassignedBreakdown.map((entry) => (
                <div key={entry.key} className="flex justify-between gap-2">
                  <span className="truncate">
                    {formatUnits(entry.remainingUnits)}× {entry.name}
                  </span>
                  <span className="tabular-nums">
                    {formatCents(entry.perPersonCents)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between gap-2 border-t border-primary/20 pt-1 text-xs font-medium">
            <span>
              {roomMessages.dividedBetween.replace(
                "{{count}}",
                String(personWithUnclaimed.participantCount),
              )}
            </span>
            <span className="tabular-nums">
              {formatCents(
                Math.round(unassignedSubtotalCents / Math.max(personWithUnclaimed.participantCount, 1)),
              )}
            </span>
          </div>
        </div>
      )}

      <div className="mt-1 flex justify-between gap-2 border-t border-primary/20 pt-2 text-lg font-bold text-primary">
        <span>{roomMessages.yourTotal}</span>
        <span className="tabular-nums">
          {formatCents(personWithUnclaimed.totalCents)}
        </span>
      </div>
    </div>
  );
}


function ExtraRow({
  label,
  cents,
}: {
  readonly label: string;
  readonly cents: number;
}) {
  return (
    <div className="flex justify-between gap-2 text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{formatCents(cents)}</span>
    </div>
  );
}
