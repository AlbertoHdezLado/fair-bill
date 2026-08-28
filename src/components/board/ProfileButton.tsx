"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { User, X } from "lucide-react";
import type { Messages } from "@/i18n";
import { MAX_PARTICIPANT_NAME_LENGTH } from "@/lib/input-limits";
import { backdropVariants, sheetVariants } from "@/lib/motion";
import { Spinner } from "@/components/Spinner";

interface ProfileButtonProps {
  readonly currentName: string;
  readonly onRename: (name: string) => Promise<void>;
  readonly messages: Messages["board"];
}

export function ProfileButton({
  currentName,
  onRename,
  messages,
}: ProfileButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(currentName);
          setError(null);
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
              className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-primary/40 bg-background p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-lg font-bold text-primary">
                  {messages.changeNameTitle}
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
                className="min-w-0 flex-1 rounded-2xl border-2 border-primary/40 bg-surface px-4 py-3 text-sm font-medium uppercase tracking-wide placeholder:font-normal placeholder:normal-case placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              {error && <p className="text-xs text-gold">{error}</p>}

              <button
                type="button"
                disabled={trimmed === "" || saving}
                onClick={() => {
                  setSaving(true);
                  setError(null);
                  void onRename(trimmed)
                    .then(() => setOpen(false))
                    .catch(() => setError(messages.duplicateName))
                    .finally(() => setSaving(false));
                }}
                className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving && <Spinner size={16} />}
                {messages.saveName}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
