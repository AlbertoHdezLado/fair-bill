"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Plus, X } from "lucide-react";
import { ReceiptScanner } from "@/components/capture/ReceiptScanner";
import { ReceiptEditor } from "@/components/ReceiptEditor";
import { SplitBoard } from "@/components/board/SplitBoard";
import { IdentityPicker } from "@/components/board/IdentityPicker";
import { LoadingState } from "@/components/Spinner";
import { ShareRoom } from "@/components/room/ShareRoom";
import { PersonTotals } from "@/components/PersonTotals";
import { buildSplitClaims } from "@/lib/local-claims";
import {
  addParticipant,
  fetchRoom,
  renameParticipant,
  saveBill,
  saveClaim,
} from "@/lib/rooms/api";
import {
  takePendingCapture,
  takePendingReceiptImage,
} from "@/lib/rooms/pending-capture";
import { rememberRoom } from "@/lib/rooms/recent-rooms";
import { toLocalClaims } from "@/lib/rooms/claims";
import type { RoomState } from "@/lib/rooms/types";
import {
  getRealtimeClient,
  ROOM_UPDATED_EVENT,
  roomChannelName,
} from "@/lib/supabase/realtime";
import type { SplitResult } from "@/lib/split";
import {
  EMPTY_EXTRAS,
  type EditableExtras,
  type EditableItem,
} from "@/lib/receipt/editable";
import { computeSplit } from "@/lib/split";
import type { Messages } from "@/i18n";
import { MAX_PARTICIPANT_NAME_LENGTH } from "@/lib/input-limits";
import { fadeInUpVariants, listStagger } from "@/lib/motion";

interface RoomFlowProps {
  readonly code: string;
  readonly messages: Messages;
}

/** Remembers, per room, which participant this device is. */
function identityStorageKey(code: string): string {
  return `fairBill.identity.${code}`;
}

/** Compressed copy of the scanned photo, kept only on the device that captured it. */
function receiptImageStorageKey(code: string): string {
  return `fairBill.receiptImage.${code}`;
}

export function RoomFlow({ code, messages }: RoomFlowProps) {
  const t = messages.room;
  const router = useRouter();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [savingBill, setSavingBill] = useState(false);
  const [draft, setDraft] = useState<{
    items: EditableItem[];
    extras: EditableExtras;
  } | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [result, setResult] = useState<SplitResult | null>(null);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const pendingName = useRef<string | null>(null);
  const hasAutoSavedDraft = useRef(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const bulkAddOfferedRef = useRef(false);

  // The receipt is scanned before the room exists; only the parsed bill crosses
  // the navigation boundary.
  useEffect(() => {
    const pending = takePendingCapture();
    const pendingImage = takePendingReceiptImage();
    if (pendingImage) {
      window.localStorage.setItem(receiptImageStorageKey(code), pendingImage);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- traspaso puntual al montar
      setReceiptImage(pendingImage);
    }
    if (!pending) return;

    if (pending === "manual") {
      setDraft({ items: [], extras: EMPTY_EXTRAS });
      return;
    }

    setDraft({ items: pending.items, extras: pending.extras });
  }, [code]);

  const reload = useCallback(async () => {
    try {
      const next = await fetchRoom(code);
      setRoom(next);
      rememberRoom(next.code, next.extras.merchantName);
      setError(null);
    } catch {
      setError(t.notFound);
    } finally {
      setLoading(false);
    }
  }, [code, t.notFound]);

  const handleActionError = useCallback(() => {
    pendingName.current = null;
    setActionError(t.saveError);
    void reload();
  }, [reload, t.saveError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde el servidor
    void reload();
  }, [reload]);

  useEffect(() => {
    const stored = window.localStorage.getItem(identityStorageKey(code));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura puntual al montar
    if (stored) setSelfId(stored);
    const storedImage = window.localStorage.getItem(
      receiptImageStorageKey(code),
    );
    if (storedImage) setReceiptImage(storedImage);
  }, [code]);

  // Auto-save scanned receipts once the room is loaded
  useEffect(() => {
    if (!draft || !room || hasAutoSavedDraft.current) return;
    if (draft.items.filter((item) => item.name.trim()).length === 0) return;

    hasAutoSavedDraft.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- guarda el ticket escaneado en cuanto existe la sala
    setSavingBill(true);
    void saveBill(code, draft.items, draft.extras)
      .then((next) => {
        setDraft(null);
        setRoom(next);
      })
      .catch(() => {
        hasAutoSavedDraft.current = false;
        setActionError("Error al guardar");
      })
      .finally(() => setSavingBill(false));
  }, [draft, room, code]);

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
    setJoining(false);
    // Solo al creador de la sala se le ofrece rellenar de golpe al resto.
    if (match.isOwner && !bulkAddOfferedRef.current) {
      bulkAddOfferedRef.current = true;
      setShowBulkAdd(true);
    }
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

  useEffect(() => {
    // El realtime a veces no se reengancha al volver de segundo plano
    // (pantalla apagada, pestaña suspendida); forzamos una recarga al volver.
    const handleBackToForeground = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", handleBackToForeground);
    window.addEventListener("focus", handleBackToForeground);
    window.addEventListener("pageshow", handleBackToForeground);
    return () => {
      document.removeEventListener("visibilitychange", handleBackToForeground);
      window.removeEventListener("focus", handleBackToForeground);
      window.removeEventListener("pageshow", handleBackToForeground);
    };
  }, [reload]);

  if (loading) {
    return <LoadingState label={t.loading} />;
  }

  if (error || !room) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-gold">{error ?? t.notFound}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-2xl border border-border bg-surface px-5 py-3 text-sm font-medium shadow-sm transition-colors hover:border-primary"
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
    const selectExisting = (participantId: string) => {
      window.localStorage.setItem(identityStorageKey(code), participantId);
      setSelfId(participantId);
    };

    const submitName = (rawName: string) => {
      const trimmed = rawName.trim().slice(0, MAX_PARTICIPANT_NAME_LENGTH);
      if (trimmed === "") return;
      pendingName.current = trimmed;
      setActionError(null);
      setJoining(true);
      void addParticipant(code, trimmed)
        .then((next) => {
          setRoom(next);
          setActionError(null);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : "";
          setActionError(
            message === "Participant name already exists"
              ? t.duplicateName
              : t.saveError,
          );
          pendingName.current = null;
          setJoining(false);
        });
    };

    // El spinner sigue hasta que la identidad se resuelve y se pinta la sala.
    if (joining) {
      return <LoadingState label={t.joiningRoom} />;
    }

    return (
      <div className="flex flex-1 flex-col justify-center gap-5">
        <IdentityPicker
          participants={room.participants.map((participant) => ({
            key: participant.id,
            name: participant.name,
          }))}
          onSelect={selectExisting}
          onAdd={submitName}
          messages={messages.board}
        />

        {actionError && (
          <p role="alert" className="text-center text-sm text-gold">
            {actionError}
          </p>
        )}
      </div>
    );
  }

  // Al creador de la sala se le ofrece, justo tras darse de alta, meter de
  // golpe los nombres de los demás para ahorrar tiempo.
  if (self.isOwner && showBulkAdd) {
    const addNames = async (names: readonly string[]) => {
      let currentRoom = room;
      for (const rawName of names) {
        const trimmed = rawName.trim().slice(0, MAX_PARTICIPANT_NAME_LENGTH);
        if (trimmed === "") continue;
        const exists = currentRoom.participants.some(
          (participant) =>
            participant.name.trim().toUpperCase() === trimmed.toUpperCase(),
        );
        if (exists) continue;
        try {
          currentRoom = await addParticipant(code, trimmed);
        } catch {
          // Un nombre repetido u otro fallo puntual no debe frenar al resto.
        }
      }
      setRoom(currentRoom);
    };

    return (
      <BulkAddNames
        onContinue={(names) => {
          setShowBulkAdd(false);
          return addNames(names);
        }}
        addingLabel={t.addingParticipants}
        messages={t}
      />
    );
  }

  // The bill has to exist before anyone can claim anything, and only the
  // person who opened the room can scan or type it in.
  if (room.items.length === 0) {
    if (savingBill) {
      return <LoadingState label={t.savingBill} />;
    }

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
          {actionError && (
            <p role="alert" className="text-center text-sm text-gold">
              {actionError}
            </p>
          )}
          <ReceiptScanner
            messages={messages.capture}
            onScanned={(items, extras) => setDraft({ items, extras })}
            onImageCaptured={(dataUrl) => {
              window.localStorage.setItem(
                receiptImageStorageKey(code),
                dataUrl,
              );
              setReceiptImage(dataUrl);
            }}
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
            setSavingBill(true);
            void saveBill(code, draft.items, draft.extras)
              .then((next) => {
                setDraft(null);
                setRoom(next);
              })
              .catch(handleActionError)
              .finally(() => setSavingBill(false));
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {showShare && (
        <dialog
          open
          className="fixed inset-0 z-[70] m-0 h-full w-full bg-transparent p-0"
          aria-label={t.shareTitle}
          onCancel={(event) => {
            event.preventDefault();
            setShowShare(false);
          }}
        >
          <div className="relative flex min-h-full items-center justify-center p-4">
            <button
              type="button"
              aria-label={messages.capture.closeLabel}
              onClick={() => setShowShare(false)}
              className="absolute inset-0 h-full w-full bg-ink/70"
            />
            <div className="relative z-10 w-full max-w-sm rounded-3xl border border-border bg-surface p-5 shadow-2xl">
            <button
              type="button"
              aria-label={messages.capture.closeLabel}
              onClick={() => setShowShare(false)}
              className="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-transparent text-primary hover:border-primary"
            >
              <X aria-hidden="true" size={18} />
            </button>
            <ShareRoom code={room.code} messages={t} />
            </div>
          </div>
        </dialog>
      )}

      <SplitBoard
        items={room.items}
        extras={room.extras}
        participants={participants}
        claims={claims}
        events={room.events ?? []}
        selfKey={self.id}
        tableLabel={t.roomCode.replace("{{code}}", room.code)}
        roomCode={room.code}
        onToggleShare={() => setShowShare((prev) => !prev)}
        isOwner={self.isOwner}
        receiptImageUrl={receiptImage}
        onRenameSelf={(name) =>
          renameParticipant(code, self.id, name).then((next) => {
            setRoom(next);
          })
        }
        onSwitchIdentity={(participantKey) => {
          window.localStorage.setItem(identityStorageKey(code), participantKey);
          setSelfId(participantKey);
        }}
        onAddParticipant={(name) =>
          addParticipant(code, name).then((next) => {
            setRoom(next);
          })
        }
        onFinish={() => {
          const finalResult = computeSplit({
            items: room.items.map((item) => ({
              id: item.id,
              name: item.name,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
            })),
            claims: buildSplitClaims(
              room.items,
              room.participants.map((participant) => participant.id),
              claims,
            ),
            participants: room.participants.map((participant) => ({
              id: participant.id,
              name: participant.name,
            })),
            extras: {
              taxCents: room.extras.taxCents,
              tipCents: room.extras.tipCents + room.extras.serviceCents,
              discountCents: room.extras.discountCents,
            },
            distributeUnclaimed: true,
          });
          setResult(finalResult);
        }}
        onSaveBill={(items, extras) => {
          setActionError(null);
          setRoom({ ...room, items: [...items], extras });
          void saveBill(code, items, extras)
            .then((next) => {
              setRoom(next);
              setActionError(null);
            })
            .catch(handleActionError);
        }}
        onSaveGroup={(itemId, groupId, ownerId, memberIds, units, shared) => {
          setActionError(null);
          // Aplica el cambio localmente al instante; el servidor confirma o revierte después.
          const remainingClaims = room.claims.filter(
            (claim) => !(claim.itemId === itemId && claim.groupKey === groupId),
          );
          const optimisticClaims =
            units === null || memberIds.length === 0
              ? remainingClaims
              : [
                  ...remainingClaims,
                  ...memberIds.map((participantId) => ({
                    itemId,
                    participantId,
                    ownerId,
                    groupKey: groupId,
                    shared,
                    units,
                    groupIds: memberIds,
                  })),
                ];
          setRoom({ ...room, claims: optimisticClaims });
          void saveClaim(code, {
            itemId,
            ownerId,
            groupKey: groupId,
            participantIds: memberIds,
            units,
            groupIds: memberIds,
            shared,
          })
            .then((next) => {
              setRoom(next);
              setActionError(null);
            })
            .catch(handleActionError);
        }}
        messages={messages}
      />
      {actionError && <p className="text-center text-sm text-gold">{actionError}</p>}
    </div>
  );
}

interface NameRow {
  readonly id: string;
  readonly name: string;
}

function createNameRow(): NameRow {
  return { id: crypto.randomUUID(), name: "" };
}

function BulkAddNames({
  onContinue,
  addingLabel,
  messages,
}: {
  readonly onContinue: (names: readonly string[]) => Promise<void>;
  readonly addingLabel: string;
  readonly messages: Messages["room"];
}) {
  const [rows, setRows] = useState<readonly NameRow[]>(() => [createNameRow()]);
  const [adding, setAdding] = useState(false);
  const focusRowId = useRef<string | null>(null);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());

  // Cada fila nueva recibe el foco para poder encadenar nombres sin tocar la pantalla.
  useEffect(() => {
    const id = focusRowId.current;
    if (!id) return;
    focusRowId.current = null;
    inputRefs.current.get(id)?.focus();
  }, [rows]);

  const filled = rows
    .map((row) => row.name.trim())
    .filter((name) => name !== "");

  const appendRow = () => {
    const row = createNameRow();
    focusRowId.current = row.id;
    setRows((current) => [...current, row]);
  };

  const removeRow = (id: string) => {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id);
      return next.length === 0 ? [createNameRow()] : next;
    });
  };

  const submit = (names: readonly string[]) => {
    setAdding(true);
    void onContinue(names);
  };

  if (adding) {
    return <LoadingState label={addingLabel} />;
  }

  return (
    <motion.div
      variants={listStagger}
      initial="hidden"
      animate="visible"
      className="flex flex-1 flex-col justify-center gap-5"
    >
      <motion.div
        variants={fadeInUpVariants}
        className="flex flex-col gap-1 text-center"
      >
        <p className="text-xl font-bold text-primary">{messages.bulkAddTitle}</p>
        <p className="text-sm text-muted-foreground">{messages.bulkAddHint}</p>
      </motion.div>

      <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto p-1">
        <AnimatePresence initial={false}>
          {rows.map((row, index) => {
            const trimmed = row.name.trim().toUpperCase();
            const isDuplicate =
              trimmed !== "" &&
              rows.some(
                (other, otherIndex) =>
                  otherIndex < index &&
                  other.name.trim().toUpperCase() === trimmed,
              );

            return (
              <motion.li
                key={row.id}
                layout
                variants={fadeInUpVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="flex items-center gap-2"
              >
                <input
                  ref={(node) => {
                    if (node) inputRefs.current.set(row.id, node);
                    else inputRefs.current.delete(row.id);
                  }}
                  type="text"
                  autoFocus={index === 0}
                  value={row.name}
                  maxLength={MAX_PARTICIPANT_NAME_LENGTH}
                  aria-invalid={isDuplicate}
                  placeholder={messages.bulkAddNamePlaceholder.replace(
                    "{{index}}",
                    String(index + 1),
                  )}
                  onChange={(e) => {
                    const value = e.target.value
                      .toUpperCase()
                      .slice(0, MAX_PARTICIPANT_NAME_LENGTH);
                    setRows((current) =>
                      current.map((item) =>
                        item.id === row.id ? { ...item, name: value } : item,
                      ),
                    );
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (index === rows.length - 1) appendRow();
                    else inputRefs.current.get(rows[index + 1].id)?.focus();
                  }}
                  className={`min-w-0 flex-1 rounded-2xl border-2 bg-surface px-4 py-3 text-sm font-medium uppercase tracking-wide placeholder:font-normal placeholder:normal-case placeholder:text-muted-foreground focus:outline-none ${
                    isDuplicate
                      ? "border-gold"
                      : "border-primary/40 focus:border-primary"
                  }`}
                />
                <button
                  type="button"
                  aria-label={messages.bulkAddRemove}
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length === 1 && row.name === ""}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/30 text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <motion.div variants={fadeInUpVariants} className="flex flex-col gap-2">
        <button
          type="button"
          onClick={appendRow}
          className="flex items-center justify-center gap-2 rounded-full border-2 border-dashed border-primary/40 px-5 py-3 text-sm font-medium text-primary hover:border-primary hover:bg-primary/10"
        >
          <Plus className="size-4" aria-hidden />
          {messages.bulkAddAnother}
        </button>
        <button
          type="button"
          disabled={filled.length === 0}
          onClick={() => submit(filled)}
          className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {messages.bulkAddContinue}
        </button>
        <button
          type="button"
          onClick={() => submit([])}
          className="rounded-full px-5 py-2 text-sm font-medium text-muted-foreground hover:text-primary"
        >
          {messages.bulkAddSkip}
        </button>
      </motion.div>
    </motion.div>
  );
}
