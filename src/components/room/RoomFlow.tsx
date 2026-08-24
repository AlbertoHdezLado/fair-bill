"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ReceiptScanner } from "@/components/capture/ReceiptScanner";
import { ReceiptEditor } from "@/components/ReceiptEditor";
import { SplitBoard } from "@/components/board/SplitBoard";
import { ShareRoom } from "@/components/room/ShareRoom";
import { PersonTotals } from "@/components/PersonTotals";
import {
  addParticipant,
  fetchRoom,
  saveBill,
  saveClaim,
} from "@/lib/rooms/api";
import { toLocalClaims } from "@/lib/rooms/claims";
import type { RoomState } from "@/lib/rooms/types";
import {
  getRealtimeClient,
  ROOM_UPDATED_EVENT,
  roomChannelName,
} from "@/lib/supabase/realtime";
import { buildSplitClaims } from "@/lib/local-claims";
import { computeSplit, type SplitResult } from "@/lib/split";
import type { EditableExtras, EditableItem } from "@/lib/receipt/editable";
import type { Messages } from "@/i18n";

interface RoomFlowProps {
  readonly code: string;
  readonly messages: Messages;
}

/** Remembers, per room, which participant this device is. */
function identityStorageKey(code: string): string {
  return `fairBill.identity.${code}`;
}

export function RoomFlow({ code, messages }: RoomFlowProps) {
  const t = messages.room;
  const router = useRouter();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<{
    items: EditableItem[];
    extras: EditableExtras;
  } | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [result, setResult] = useState<SplitResult | null>(null);
  const pendingName = useRef<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRoom(await fetchRoom(code));
      setError(null);
    } catch {
      setError(t.notFound);
    } finally {
      setLoading(false);
    }
  }, [code, t.notFound]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde el servidor
    void reload();
  }, [reload]);

  useEffect(() => {
    const stored = window.localStorage.getItem(identityStorageKey(code));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura puntual al montar
    if (stored) setSelfId(stored);
  }, [code]);

  // A newly added participant only gets an id back through the room state, so
  // the name we just submitted is matched against the refreshed list.
  useEffect(() => {
    if (!room || !pendingName.current) return;
    const match = room.participants.find(
      (participant) => participant.name === pendingName.current,
    );
    if (!match) return;
    pendingName.current = null;
    window.localStorage.setItem(identityStorageKey(code), match.id);
    setSelfId(match.id);
  }, [room, code]);

  useEffect(() => {
    const client = getRealtimeClient();
    if (!client) return;

    const channel = client
      .channel(roomChannelName(code))
      .on("broadcast", { event: ROOM_UPDATED_EVENT }, () => {
        void reload();
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [code, reload]);

  if (loading) {
    return <p className="py-10 text-center text-sm">{t.loading}</p>;
  }

  if (error || !room) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-sm text-gold">{error ?? t.notFound}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-full border border-primary px-5 py-2 text-sm font-medium text-primary hover:bg-primary/10"
        >
          {t.backHome}
        </button>
      </div>
    );
  }

  const self = room.participants.find(
    (participant) => participant.id === selfId,
  );

  if (!self) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-center text-xl font-bold text-primary">
          {t.enterName}
        </p>
        <p className="text-center text-sm text-muted-foreground">
          {t.enterNameHint.replace("{{code}}", room.code)}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            placeholder={t.namePlaceholder}
            className="min-w-0 flex-1 rounded border-2 border-primary/70 bg-transparent px-3 py-2 text-sm uppercase focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            disabled={name.trim() === ""}
            onClick={() => {
              const trimmed = name.trim();
              pendingName.current = trimmed;
              void addParticipant(code, trimmed).then(setRoom);
            }}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {t.join}
          </button>
        </div>
        {room.participants.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            {t.alreadyHere.replace(
              "{{names}}",
              room.participants.map((p) => p.name).join(", "),
            )}
          </p>
        )}
      </div>
    );
  }

  // The bill has to exist before anyone can claim anything, and only the
  // person who opened the room can scan or type it in.
  if (room.items.length === 0) {
    if (!self.isOwner) {
      return (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">{t.waitingForBill}</p>
          <ShareRoom code={room.code} messages={t} />
        </div>
      );
    }

    if (!draft) {
      return (
        <div className="flex flex-col gap-6">
          <ShareRoom code={room.code} messages={t} />
          <ReceiptScanner
            messages={messages.capture}
            onScanned={(items, extras) => setDraft({ items, extras })}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <ReceiptEditor
          items={draft.items}
          extras={draft.extras}
          onItemsChange={(items) => setDraft({ ...draft, items })}
          onExtrasChange={(extras) => setDraft({ ...draft, extras })}
          messages={messages.receiptEditor}
          itemRowMessages={messages.itemRow}
        />
        <button
          type="button"
          disabled={draft.items.filter((item) => item.name.trim()).length === 0}
          onClick={() => {
            void saveBill(code, draft.items, draft.extras).then((next) => {
              setDraft(null);
              setRoom(next);
            });
          }}
          className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {messages.capture.continue}
        </button>
      </div>
    );
  }

  const participants = room.participants.map((participant) => ({
    key: participant.id,
    name: participant.name,
  }));
  const claims = toLocalClaims(room.claims);

  if (result) {
    return (
      <div className="flex flex-col gap-3">
        {result.people.map((person) => (
          <PersonTotals
            key={person.participantId}
            person={person}
            currency="EUR"
            hasPaid={false}
            isOwn={person.participantId === self.id}
            messages={messages.totals}
          />
        ))}
        <button
          type="button"
          onClick={() => setResult(null)}
          className="rounded-full border border-primary px-5 py-2 text-sm font-medium text-primary hover:bg-primary/10"
        >
          {messages.capture.backToSplit}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setShowShare((prev) => !prev)}
        className="self-center rounded-full border border-primary px-4 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
      >
        {t.roomCode.replace("{{code}}", room.code)}
      </button>

      {showShare && <ShareRoom code={room.code} messages={t} />}

      <SplitBoard
        items={room.items}
        extras={room.extras}
        participants={participants}
        claims={claims}
        selfKey={self.id}
        onItemsChange={(items) => {
          setRoom({ ...room, items });
          void saveBill(code, items, room.extras).then(setRoom);
        }}
        onClaimChange={(itemId, participantKeys, choice) => {
          void saveClaim(code, {
            itemId,
            ownerId: self.id,
            participantIds: participantKeys,
            units: choice === null ? null : choice.mode === "half" ? 0.5 : choice.count,
            groupIds:
              choice?.mode === "units" && choice.group ? choice.group : [],
          }).then(setRoom);
        }}
        onSwitchUser={() => {
          window.localStorage.removeItem(identityStorageKey(code));
          setSelfId(null);
        }}
        onFinish={() =>
          setResult(
            computeSplit({
              items: room.items,
              claims: buildSplitClaims(
                room.items,
                participants.map((p) => p.key),
                claims,
              ),
              participants: participants.map((p) => ({
                id: p.key,
                name: p.name,
              })),
              extras: {
                taxCents: room.extras.taxCents,
                tipCents: room.extras.tipCents + room.extras.serviceCents,
                discountCents: room.extras.discountCents,
              },
            }),
          )
        }
        messages={messages}
      />
    </div>
  );
}
