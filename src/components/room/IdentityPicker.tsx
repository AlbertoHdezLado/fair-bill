"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Messages } from "@/i18n";
import { MAX_PARTICIPANT_NAME_LENGTH } from "@/lib/input-limits";
import { fadeInUpVariants, listStagger } from "@/lib/motion";

interface Participant {
  readonly key: string;
  readonly name: string;
}

interface IdentityPickerProps {
  readonly participants: readonly Participant[];
  readonly onSelect: (key: string) => void;
  readonly onAdd: (name: string) => void;
  readonly messages: Messages["roomSplit"];
}

export function IdentityPicker({
  participants,
  onSelect,
  onAdd,
  messages,
}: IdentityPickerProps) {
  const hasParticipants = participants.length > 0;
  const [name, setName] = useState("");
  const isOdd = participants.length % 2 === 1;

  const trimmed = name.trim();
  const isDuplicate = participants.some(
    (participant) =>
      participant.name.trim().toUpperCase() === trimmed.toUpperCase(),
  );

  return (
    <motion.div
      variants={listStagger}
      initial={false}
      animate="visible"
      className="flex flex-col gap-4"
    >
      <motion.div
        variants={fadeInUpVariants}
        className="flex flex-col gap-1 text-center"
      >
        <p className="text-xl font-bold text-primary">{messages.whoAreYou}</p>
        {hasParticipants && (
          <p className="text-sm text-muted-foreground">
            {messages.whoAreYouHint}
          </p>
        )}
      </motion.div>

      {hasParticipants && (
        <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto p-1">
          <AnimatePresence initial={false}>
            {participants.map((participant, index) => (
              <motion.li
                key={participant.key}
                layout
                variants={fadeInUpVariants}
                initial={false}
                animate="visible"
                exit="exit"
                className={
                  isOdd && index === participants.length - 1
                    ? "col-span-2"
                    : undefined
                }
              >
                <button
                  type="button"
                  onClick={() => onSelect(participant.key)}
                  className={`flex min-h-16 w-full items-center justify-center rounded-2xl border border-primary/40 bg-surface px-3 py-4 text-base font-bold hover:border-primary hover:bg-primary/10 ${
                    isOdd && index === participants.length - 1
                      ? "mx-auto max-w-[calc(50%-0.25rem)]"
                      : ""
                  }`}
                >
                  <span className="min-w-0 truncate">{participant.name}</span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <motion.div
        initial={false}
        animate={{ opacity: 1, height: "auto" }}
        className="flex flex-col gap-2"
      >
        <div className="flex gap-2">
          <input
            type="text"
            autoFocus
            value={name}
            maxLength={MAX_PARTICIPANT_NAME_LENGTH}
            onChange={(e) =>
              setName(
                e.target.value
                  .toUpperCase()
                  .slice(0, MAX_PARTICIPANT_NAME_LENGTH),
              )
            }
            placeholder={messages.newUserPlaceholder}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmed !== "" && !isDuplicate) {
                e.preventDefault();
                onAdd(trimmed);
                setName("");
              }
            }}
            className="min-w-0 flex-1 rounded-2xl border-2 border-primary/40 bg-surface px-4 py-3 text-sm font-medium uppercase tracking-wide placeholder:font-normal placeholder:normal-case placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            disabled={trimmed === "" || isDuplicate}
            onClick={() => {
              onAdd(trimmed);
              setName("");
            }}
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {messages.add}
          </button>
        </div>
        {isDuplicate && (
          <p className="text-xs text-gold-text">{messages.duplicateName}</p>
        )}
      </motion.div>
    </motion.div>
  );
}
