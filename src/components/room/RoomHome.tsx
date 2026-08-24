"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom } from "@/lib/rooms/api";
import { isValidRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from "@/lib/rooms/code";
import type { Messages } from "@/i18n";

interface RoomHomeProps {
  readonly messages: Messages["room"];
}

export function RoomHome({ messages }: RoomHomeProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-8 px-4 py-10 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="fairBill" className="h-16 w-auto" />

      <button
        type="button"
        disabled={creating}
        onClick={() => {
          setCreating(true);
          setError(null);
          createRoom()
            .then((created) => router.push(`/sala/${created}`))
            .catch(() => {
              setError(messages.createError);
              setCreating(false);
            });
        }}
        className="w-full rounded-2xl bg-primary px-6 py-5 text-lg font-bold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        {messages.createRoom}
      </button>

      <div className="flex w-full flex-col gap-2">
        <p className="text-sm text-muted-foreground">{messages.joinHint}</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={code}
            inputMode="text"
            autoCapitalize="characters"
            maxLength={ROOM_CODE_LENGTH}
            onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
            placeholder={messages.codePlaceholder}
            className="min-w-0 flex-1 rounded border-2 border-primary/70 bg-transparent px-3 py-2 text-center font-mono text-lg tracking-[0.3em] uppercase focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            disabled={!isValidRoomCode(code)}
            onClick={() => router.push(`/sala/${normalizeRoomCode(code)}`)}
            className="rounded-full border border-primary px-5 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {messages.join}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-gold">{error}</p>}
    </div>
  );
}
