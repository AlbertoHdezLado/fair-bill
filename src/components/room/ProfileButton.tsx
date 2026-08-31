"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { User, X } from "lucide-react";
import type { Messages } from "@/i18n";
import { MAX_PARTICIPANT_NAME_LENGTH } from "@/lib/input-limits";
import { backdropVariants, sheetVariants } from "@/lib/motion";
import { Spinner } from "@/components/Spinner";

interface Participant {
  readonly key: string;
  readonly name: string;
}

interface ProfileButtonProps {
  readonly currentName: string;
  readonly onRename: (name: string) => Promise<void>;
  readonly participants?: readonly Participant[];
  readonly selfKey?: string;
  readonly onSwitchIdentity?: (participantKey: string) => void;
  readonly onAddParticipant?: (name: string) => Promise<void>;
  readonly messages: Messages["roomSplit"];
}

export function ProfileButton({
  currentName,
  onRename,
  participants = [],
  selfKey,
  onSwitchIdentity,
  onAddParticipant,
  messages,
}: ProfileButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState("");
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [view, setView] = useState<"rename" | "switch">("rename");

  const trimmed = name.trim();
  const otherParticipants = participants.filter(
    (participant) => participant.key !== selfKey,
  );
  const trimmedNewParticipant = newParticipantName.trim();
  const isDuplicateParticipant = participants.some(
    (participant) =>
      participant.name.trim().toUpperCase() ===
      trimmedNewParticipant.toUpperCase(),
  );

  function saveName() {
    if (trimmed === "" || saving) return;
    setSaving(true);
    setError(null);
    void onRename(trimmed)
      .then(() => setOpen(false))
      .catch(() => setError(messages.duplicateName))
      .finally(() => setSaving(false));
  }

  function addNewParticipant() {
    if (
      !onAddParticipant ||
      trimmedNewParticipant === "" ||
      isDuplicateParticipant ||
      addingParticipant
    )
      return;
    setAddingParticipant(true);
    void onAddParticipant(trimmedNewParticipant)
      .then(() => setNewParticipantName(""))
      .finally(() => setAddingParticipant(false));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(currentName);
          setError(null);
          setView("rename");
          setOpen(true);
        }}
        aria-label={messages.profileLabel}
        title={messages.profileLabel}
        className="rounded-full border border-primary p-2 text-primary hover:bg-primary/10"
      >
        <User aria-hidden="true" size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <motion.button
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              type="button"
              aria-label={messages.close}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-ink/70"
            />
            <motion.div
              variants={sheetVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative flex max-h-[85vh] w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-2xl border border-primary/40 bg-background p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-lg font-bold text-primary">
                  {view === "switch"
                    ? messages.switchParticipant
                    : messages.changeNameTitle}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={messages.close}
                  className="-mr-1 -mt-1 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                >
                  <X aria-hidden="true" size={20} />
                </button>
              </div>

              {view === "rename" && (
                <>
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
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        saveName();
                      }
                    }}
                    className="min-w-0 flex-1 rounded-2xl border-2 border-primary/40 bg-surface px-4 py-3 text-sm font-medium uppercase tracking-wide placeholder:font-normal placeholder:normal-case placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                  {error && <p className="text-xs text-gold">{error}</p>}

                  <button
                    type="button"
                    disabled={trimmed === "" || saving}
                    onClick={saveName}
                    className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {saving && <Spinner size={16} />}
                    {messages.saveName}
                  </button>

                  {onSwitchIdentity && (
                    <button
                      type="button"
                      onClick={() => setView("switch")}
                      className="rounded-full border border-red-600 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-600/10"
                    >
                      {messages.switchParticipant}
                    </button>
                  )}
                </>
              )}

              {view === "switch" && onSwitchIdentity && (
                <div className="flex flex-col gap-3">
                  {otherParticipants.length > 0 && (
                    <ul className="grid grid-cols-2 gap-2">
                      {otherParticipants.map((participant) => (
                        <li key={participant.key}>
                          <button
                            type="button"
                            onClick={() => {
                              onSwitchIdentity(participant.key);
                              setOpen(false);
                            }}
                            className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-primary/40 bg-surface px-3 py-2 text-sm font-bold hover:border-primary hover:bg-primary/10"
                          >
                            <span className="min-w-0 truncate">
                              {participant.name}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {onAddParticipant && (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newParticipantName}
                          maxLength={MAX_PARTICIPANT_NAME_LENGTH}
                          onChange={(e) =>
                            setNewParticipantName(
                              e.target.value
                                .toUpperCase()
                                .slice(0, MAX_PARTICIPANT_NAME_LENGTH),
                            )
                          }
                          placeholder={messages.newUserPlaceholder}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addNewParticipant();
                            }
                          }}
                          className="min-w-0 flex-1 rounded-2xl border-2 border-primary/40 bg-surface px-4 py-3 text-sm font-medium uppercase tracking-wide placeholder:font-normal placeholder:normal-case placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={
                            trimmedNewParticipant === "" ||
                            isDuplicateParticipant ||
                            addingParticipant
                          }
                          onClick={addNewParticipant}
                          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                        >
                          {messages.add}
                        </button>
                      </div>
                      {isDuplicateParticipant && (
                        <p className="text-xs text-gold">
                          {messages.duplicateName}
                        </p>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setView("rename")}
                    className="rounded-full border border-primary/50 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
                  >
                    {messages.back}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
