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
  readonly messages: Messages["board"];
}

export function IdentityPicker({
  participants,
  onSelect,
  onAdd,
  messages,
}: IdentityPickerProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const trimmed = name.trim();
  const isDuplicate = participants.some(
    (participant) =>
      participant.name.trim().toUpperCase() === trimmed.toUpperCase(),
  );

  return (
    <motion.div
      variants={listStagger}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-4"
    >
      <motion.div
        variants={fadeInUpVariants}
        className="flex flex-col gap-1 text-center"
      >
        <p className="text-xl font-bold text-primary">{messages.whoAreYou}</p>
        <p className="text-sm text-muted-foreground">
          {messages.whoAreYouHint}
        </p>
      </motion.div>

      <ul className="grid grid-cols-2 gap-2">
        <AnimatePresence initial={false}>
          {participants.map((participant) => (
            <motion.li
              key={participant.key}
              layout
              variants={fadeInUpVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <button
                type="button"
                onClick={() => onSelect(participant.key)}
                className="flex min-h-16 w-full items-center justify-center rounded-2xl border border-primary/40 bg-surface px-3 py-4 text-base font-bold hover:border-primary hover:bg-primary/10"
              >
                <span className="min-w-0 truncate">{participant.name}</span>
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {adding ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
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
              className="min-w-0 flex-1 rounded border-2 border-primary/70 bg-transparent px-3 py-2 text-sm uppercase focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              disabled={trimmed === "" || isDuplicate}
              onClick={() => {
                onAdd(trimmed);
                setName("");
                setAdding(false);
              }}
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {messages.add}
            </button>
          </div>
          {isDuplicate && (
            <p className="text-xs text-gold">{messages.duplicateName}</p>
          )}
        </motion.div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="self-center text-sm text-primary underline"
        >
          {messages.addUser}
        </button>
      )}
    </motion.div>
  );
}
