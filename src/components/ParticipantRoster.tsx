"use client";

import { defaultMessages, type Messages } from "@/i18n";

// Pantalla "pasa el móvil": lista de participantes. En verde los que ya han
// marcado lo suyo (se puede volver a entrar para editarlo). Solo se puede
// terminar cuando todos están en verde.

interface RosterParticipant {
  readonly key: string;
  readonly name: string;
}

interface ParticipantRosterProps {
  readonly participants: readonly RosterParticipant[];
  readonly confirmedKeys: readonly string[];
  readonly onSelect: (key: string) => void;
  readonly onFinish: () => void;
  readonly onEditNames: () => void;
  readonly showBill: boolean;
  readonly onToggleBill: () => void;
  readonly messages?: Messages["roster"];
}

export function ParticipantRoster({
  participants,
  confirmedKeys,
  onSelect,
  onFinish,
  onEditNames,
  showBill,
  onToggleBill,
  messages = defaultMessages.roster,
}: ParticipantRosterProps) {
  const doneCount = participants.filter((p) =>
    confirmedKeys.includes(p.key),
  ).length;
  const allDone = participants.length > 0 && doneCount === participants.length;

  return (
    <div className="flex flex-col gap-3">
      {!showBill && (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-center text-xl font-bold text-primary">
              {messages.title}
            </p>
          </div>

          <ul className="grid grid-cols-2 gap-x-1.5 gap-y-3">
            {participants.map((participant) => {
              const isDone = confirmedKeys.includes(participant.key);
              return (
                <li key={participant.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(participant.key)}
                    className={`flex w-full min-h-16 items-center justify-center rounded-2xl border py-4 px-3 text-center text-sm font-medium transition-colors ${
                      isDone
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-primary/40 bg-surface text-foreground"
                    }`}
                  >
                    <span className="min-w-0 truncate text-base font-bold">
                      {participant.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={onFinish}
            disabled={!allDone}
            className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {messages.continue}
          </button>
        </>
      )}

      <div className="flex gap-2 justify-center">
        <button
          type="button"
          onClick={onEditNames}
          className="self-start text-xs text-primary underline"
        >
          {messages.editNames}
        </button>

        <button
          type="button"
          onClick={onToggleBill}
          className="self-start text-xs text-primary underline"
        >
          {showBill ? messages.hideBill : messages.editBill}
        </button>
      </div>
    </div>
  );
}
