"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getOcrProvider, preprocessReceiptImage } from "@/lib/ocr";
import { parseReceipt } from "@/lib/receipt/parser";
import { computeSplit, type SplitResult } from "@/lib/split";
import { ReceiptEditor } from "@/components/ReceiptEditor";
import { PersonTotals } from "@/components/PersonTotals";
import { IdentityPicker } from "@/components/board/IdentityPicker";
import { SplitBoard } from "@/components/board/SplitBoard";
import { formatCents } from "@/lib/money";
import { defaultMessages, type Messages } from "@/i18n";
import {
  buildSplitClaims,
  removeParticipantClaims,
  setClaimChoice,
  type ClaimChoice,
  type LocalClaims,
} from "@/lib/local-claims";
import {
  EMPTY_EXTRAS,
  newItemId,
  type EditableExtras,
  type EditableItem,
} from "@/lib/receipt/editable";
import { clearSession, loadSession, saveSession } from "@/lib/session-storage";

type ScanStatus =
  "idle" | "preprocessing" | "recognizing" | "parsing" | "done" | "error";

type LocalStage = "bill" | "names" | "identity" | "board" | "results";

interface CaptureFlowProps {
  readonly messages?: Messages;
}

export function CaptureFlow({ messages = defaultMessages }: CaptureFlowProps) {
  const t = messages.capture;
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const participantInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);

  const [items, setItems] = useState<EditableItem[]>([]);
  const [extras, setExtras] = useState<EditableExtras>(EMPTY_EXTRAS);
  const [showEditor, setShowEditor] = useState(false);

  const [localStage, setLocalStage] = useState<LocalStage>("bill");
  const [participants, setParticipants] = useState<
    { key: string; name: string }[]
  >(() => [
    { key: newItemId(), name: "" },
    { key: newItemId(), name: "" },
  ]);
  const [claims, setClaims] = useState<LocalClaims>({});
  const [selfKey, setSelfKey] = useState<string | null>(null);
  const [localResult, setLocalResult] = useState<SplitResult | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "error">("idle");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const hydrated = useRef(false);

  // La imagen del ticket no se puede serializar: al recargar se recupera el
  // reparto ya extraído, no el flujo de captura.
  useEffect(() => {
    const saved = loadSession();
    const summaryFromUrl = parseSharedSummaryFromLocation();
    hydrated.current = true;

    /* eslint-disable react-hooks/set-state-in-effect -- rehidratacion puntual al montar */
    if (summaryFromUrl) {
      setLocalResult(summaryFromUrl);
      setLocalStage("results");
      setShowEditor(true);
      return;
    }

    if (!saved) return;
    setItems(saved.items);
    setExtras(saved.extras);
    setShowEditor(saved.showEditor);
    setLocalStage(saved.localStage);
    setParticipants(saved.participants);
    setClaims(saved.claims);
    setSelfKey(saved.selfKey);
    setLocalResult(saved.localResult);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    if (!showEditor && items.length === 0) {
      clearSession();
      return;
    }
    saveSession({
      items,
      extras,
      showEditor,
      localStage,
      participants,
      claims,
      selfKey,
      localResult,
    });
  }, [
    items,
    extras,
    showEditor,
    localStage,
    participants,
    claims,
    selfKey,
    localResult,
  ]);

  useEffect(() => {
    if (
      localStage === "names" &&
      !participants.some((participant) => participant.name.trim())
    ) {
      participantInputRefs.current[0]?.focus();
    }
  }, [localStage, participants]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileSelected(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setScanError(null);
    setShowEditor(false);
    void scanReceipt(file);
  }

  async function scanReceipt(file: File) {
    setScanError(null);
    try {
      setStatus("preprocessing");
      const processed = await preprocessReceiptImage(file);

      setStatus("recognizing");
      setProgress(0);
      const provider = getOcrProvider();
      const result = await provider.recognize(processed, (p) => {
        if (p.status === "recognizing text") setProgress(p.progress);
      });

      setStatus("parsing");
      const parsed = parseReceipt(result.words);

      setItems(
        parsed.items.map((item) => ({
          id: newItemId(),
          name: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          state: "leido",
        })),
      );
      setExtras({
        taxCents: parsed.taxIncludedInItems
          ? 0
          : sumByKind(parsed.summary, "tax"),
        tipCents: sumByKind(parsed.summary, "tip"),
        serviceCents: sumByKind(parsed.summary, "service"),
        discountCents: sumByKind(parsed.summary, "discount"),
        detectedTotalCents: parsed.detectedTotalCents,
      });

      setStatus("done");
      setShowEditor(true);
    } catch (err) {
      setStatus("error");
      setScanError(err instanceof Error ? err.message : t.readReceiptError);
    }
  }

  async function shareResultSummary() {
    if (!localResult) return;
    const text = buildSummaryText(localResult);
    const shareUrl = buildSummaryShareUrl(text);

    try {
      if (navigator.share) {
        await navigator.share({ title: t.shareTitle, text, url: shareUrl });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
    } catch {
      setCopyStatus("error");
    }
  }

  function resetToStart() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStatus("idle");
    setProgress(0);
    setScanError(null);
    setItems([]);
    setExtras(EMPTY_EXTRAS);
    setShowEditor(false);
    setLocalStage("bill");
    setParticipants([
      { key: newItemId(), name: "" },
      { key: newItemId(), name: "" },
    ]);
    setClaims({});
    setSelfKey(null);
    setLocalResult(null);
    setCopyStatus("idle");
    setShowResetConfirm(false);
    clearSession();
  }

  function startManualEntry() {
    setItems([]);
    setExtras(EMPTY_EXTRAS);
    setShowEditor(true);
    setStatus("idle");
    setScanError(null);
  }

  function removeParticipant(index: number) {
    const key = participants[index]?.key;
    setParticipants((prev) => prev.filter((_, i) => i !== index));
    if (!key) return;
    setClaims((prev) => removeParticipantClaims(prev, key));
    setSelfKey((prev) => (prev === key ? null : prev));
  }

  function handleClaimChange(
    itemId: string,
    participantKeys: readonly string[],
    choice: ClaimChoice | null,
  ) {
    // La elección la crea quien está usando el móvil: se replica en el grupo
    // entero pero sigue siendo suya, sin pisar lo que ya tenían.
    const owner = selfKey;
    if (!owner) return;
    setClaims((prev) =>
      participantKeys.reduce(
        (acc, key) => setClaimChoice(acc, key, itemId, owner, choice),
        prev,
      ),
    );
  }

  function computeLocalResult() {
    const cleanParticipants = participants.filter((p) => p.name.trim());

    const result = computeSplit({
      items,
      claims: buildSplitClaims(
        items,
        cleanParticipants.map((p) => p.key),
        claims,
      ),
      participants: cleanParticipants.map((p) => ({
        id: p.key,
        name: p.name.trim(),
      })),
      extras: {
        taxCents: extras.taxCents,
        tipCents: extras.tipCents + extras.serviceCents,
        discountCents: extras.discountCents,
      },
    });

    setLocalResult(result);
    setLocalStage("results");
  }

  const isScanning =
    status === "preprocessing" ||
    status === "recognizing" ||
    status === "parsing";
  const namedParticipants = participants.filter((p) => p.name.trim());
  const nameOccurrences = new Map<string, number>();
  for (const participant of namedParticipants) {
    const normalizedName = normalizeParticipantName(participant.name);
    nameOccurrences.set(
      normalizedName,
      (nameOccurrences.get(normalizedName) ?? 0) + 1,
    );
  }
  const duplicateNames = new Set(
    Array.from(nameOccurrences.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
  );
  const hasDuplicateNames = duplicateNames.size > 0;
  const canContinueFromNames =
    namedParticipants.length >= 2 && !hasDuplicateNames;
  const hasProgress = showEditor || isScanning || items.length > 0;
  const showCaptureOptions =
    localStage === "bill" && !showEditor && !isScanning;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <button
          type="button"
          onClick={() => {
            if (hasProgress) setShowResetConfirm(true);
          }}
          aria-label={t.resetToStartLabel}
          className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="fairBill" className="h-16 w-auto" />
        </button>

        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
              type="button"
              aria-label={t.closeLabel}
              onClick={() => setShowResetConfirm(false)}
              className="absolute inset-0 bg-ink/70"
            />
            <div className="relative flex w-full max-w-sm flex-col gap-3 rounded-lg border border-gold bg-background p-4 shadow-2xl">
              <div className="flex items-center justify-center gap-2 text-gold">
                <AlertTriangle
                  aria-hidden="true"
                  size={20}
                  strokeWidth={2}
                  className="shrink-0"
                />
                <p className="text-center text-lg font-bold">{t.resetTitle}</p>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {t.resetDescription}
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="rounded-full border border-primary px-5 py-3 text-sm font-medium text-primary hover:bg-primary/10"
                >
                  {t.stayHere}
                </button>
                <button
                  type="button"
                  onClick={resetToStart}
                  className="rounded-full bg-gold px-5 py-3 text-sm font-medium text-gold-foreground hover:bg-gold-hover"
                >
                  {t.startAgain}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCaptureOptions && (
        <div className="flex flex-col items-center gap-4 text-center">
          {/* Sin `capture`, para que el selector abra la galería en vez de la cámara */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
              e.target.value = "";
            }}
          />
          {/* `capture="environment"` fuerza la cámara trasera en móviles */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
              e.target.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            aria-label={t.uploadImageLabel}
            className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border-2 border-primary bg-surface p-8 shadow-sm transition-all hover:bg-primary/10"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="h-8 w-8"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v2.75A1.25 1.25 0 0 0 5.25 20h13.5A1.25 1.25 0 0 0 20 18.75V16M8 8l4-4m0 0 4 4m-4-4v13"
                />
              </svg>
            </span>
            <span className="text-lg font-bold text-primary">
              {t.uploadImage}
            </span>
            <span className="text-xs text-muted-foreground">
              {t.uploadHint}
            </span>
          </button>

          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            aria-label={t.takePhotoLabel}
            className="inline-flex items-center gap-2 rounded-full border border-primary px-5 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.822 1.316Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
              />
            </svg>
            {t.takePhoto}
          </button>

          <button
            type="button"
            onClick={startManualEntry}
            className="text-xs text-muted-foreground underline hover:text-primary"
          >
            {t.manualEntry}
          </button>

          {scanError && <p className="text-sm text-gold">{scanError}</p>}
        </div>
      )}

      {isScanning && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4"
        >
          <div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border-t-4 border-t-gold bg-background p-6 text-center shadow-xl">
            <div className="relative w-32 overflow-hidden rounded-lg border border-primary/40 bg-surface">
              {previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewUrl}
                  alt=""
                  className="h-40 w-full object-cover opacity-80"
                />
              ) : (
                <div className="h-40 w-full" />
              )}
              <div className="absolute inset-0">
                <div className="animate-receipt-scan absolute inset-x-0 h-0.5 bg-gold shadow-[0_0_12px_2px_var(--gold)]" />
              </div>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {t.readingReceipt}
            </p>
            <p className="text-xs text-muted-foreground">
              {status === "preprocessing" && t.preprocessing}
              {status === "recognizing" && t.recognizing}
              {status === "parsing" && t.parsing}
            </p>
            {status === "recognizing" && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {showEditor && localStage === "bill" && (
        <>
          <ReceiptEditor
            items={items}
            extras={extras}
            onItemsChange={setItems}
            onExtrasChange={setExtras}
            messages={messages.receiptEditor}
            itemRowMessages={messages.itemRow}
          />
          <button
            type="button"
            onClick={() => setLocalStage("names")}
            disabled={items.filter((item) => item.name.trim()).length === 0}
            className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {t.continue}
          </button>
        </>
      )}

      {localStage === "names" && (
        <div className="flex flex-col gap-3">
          <p className="text-center text-xl font-bold text-primary">
            {t.enterParticipants}
          </p>
          {participants.map((participant, index) => {
            // El último hueco vacío es solo un anticipo del siguiente
            // participante, no cuenta todavía: se muestra más tenue.
            const isPendingSlot =
              index === participants.length - 1 && !participant.name.trim();
            return (
              <div
                key={participant.key}
                className={`flex gap-2 transition-opacity ${
                  isPendingSlot ? "opacity-40" : "opacity-100"
                }`}
              >
                <input
                  ref={(el) => {
                    participantInputRefs.current[index] = el;
                  }}
                  type="text"
                  value={participant.name}
                  onChange={(e) => {
                    const value = e.target.value.toUpperCase();
                    setParticipants((prev) => {
                      const next = prev.map((p, i) =>
                        i === index ? { ...p, name: value } : p,
                      );
                      const wasLast = index === prev.length - 1;
                      if (wasLast && value.trim()) {
                        next.push({ key: newItemId(), name: "" });
                      }
                      return next;
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    // El siguiente input puede tardar un tick en montarse
                    // si este era el último hueco.
                    setTimeout(() => {
                      participantInputRefs.current[index + 1]?.focus();
                    }, 0);
                  }}
                  placeholder={t.participantPlaceholder.replace(
                    "{{number}}",
                    String(index + 1),
                  )}
                  enterKeyHint="next"
                  className={`min-w-0 flex-1 rounded border-2 bg-transparent px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 ${
                    duplicateNames.has(
                      normalizeParticipantName(participant.name),
                    )
                      ? "border-gold text-gold focus:ring-gold/40"
                      : "border-primary/70 focus:border-primary focus:ring-primary/35"
                  }`}
                />
                {!isPendingSlot && (
                  <button
                    type="button"
                    onClick={() => removeParticipant(index)}
                    aria-label={t.removeParticipantLabel}
                    className="rounded px-2 py-1 text-sm text-primary/70 hover:bg-primary/10 hover:text-primary"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setLocalStage("identity")}
            disabled={!canContinueFromNames}
            className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {t.continue}
          </button>
          {hasDuplicateNames && (
            <p className="text-center text-sm text-gold">{t.duplicateNames}</p>
          )}
        </div>
      )}

      {localStage === "identity" && (
        <IdentityPicker
          participants={namedParticipants.map((p) => ({
            key: p.key,
            name: p.name.trim(),
          }))}
          onSelect={(key) => {
            setSelfKey(key);
            setLocalStage("board");
          }}
          onAdd={(name) => {
            const key = newItemId();
            setParticipants((prev) => [
              ...prev.filter((p) => p.name.trim()),
              { key, name },
              { key: newItemId(), name: "" },
            ]);
            setSelfKey(key);
            setLocalStage("board");
          }}
          messages={messages.board}
        />
      )}

      {localStage === "board" && selfKey && (
        <SplitBoard
          items={items}
          extras={extras}
          participants={namedParticipants.map((p) => ({
            key: p.key,
            name: p.name.trim(),
          }))}
          claims={claims}
          selfKey={selfKey}
          onItemsChange={setItems}
          onClaimChange={handleClaimChange}
          onSwitchUser={() => setLocalStage("identity")}
          onFinish={computeLocalResult}
          messages={messages}
        />
      )}

      {localStage === "results" && localResult && (
        <div className="flex flex-col gap-3">
          {localResult.people.map((person) => (
            <PersonTotals
              key={person.participantId}
              person={person}
              currency="EUR"
              hasPaid={false}
              isOwn={person.participantId === selfKey}
              messages={messages.totals}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              void shareResultSummary();
            }}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
          >
            {t.share}
          </button>
          {copyStatus === "error" && (
            <p className="text-xs text-gold">{t.copyError}</p>
          )}
          <button
            type="button"
            onClick={() => setLocalStage("board")}
            className="rounded-full border border-primary px-5 py-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            {t.backToSplit}
          </button>
        </div>
      )}
    </div>
  );
}

function buildSummaryText(localResult: SplitResult): string {
  return localResult.people
    .map((person) => {
      const items = person.items.map((item) => {
        const sharedMark = item.hasUnclaimedShare
          ? " [dividido entre todos]"
          : "";
        return `- ${item.itemName} x${item.effectiveUnits}: ${formatCents(item.shareCents, "EUR")}${sharedMark}`;
      });
      return [
        `${person.name}: ${formatCents(person.totalCents, "EUR")}`,
        ...items,
      ].join("\n");
    })
    .join("\n");
}

function parseSharedSummaryFromLocation(): SplitResult | null {
  if (typeof window === "undefined") return null;

  const summary = new URLSearchParams(window.location.search).get("summary");
  if (!summary) return null;

  const lines = summary
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  const people: SplitResult["people"] = [];
  for (const line of lines) {
    if (line.startsWith("- ")) {
      const hasUnclaimedShare = line.endsWith(" [dividido entre todos]");
      const itemLine = hasUnclaimedShare
        ? line.slice(0, -" [dividido entre todos]".length)
        : line;
      const itemMatch = itemLine.match(/^-\s+(.+?)\s+x([\d.,]+):\s+(.+)$/);
      const currentPerson = people.at(-1);
      if (!itemMatch || !currentPerson) continue;

      const [, itemName, rawUnits, rawItemAmount] = itemMatch;
      const shareCents = parseSharedAmountToCents(rawItemAmount);
      const effectiveUnits = Number.parseFloat(rawUnits.replace(",", "."));
      if (Number.isNaN(shareCents) || Number.isNaN(effectiveUnits)) continue;

      currentPerson.items.push({
        itemId: `${currentPerson.participantId}-item-${currentPerson.items.length}`,
        itemName: itemName.trim(),
        claimedUnits: effectiveUnits,
        effectiveUnits,
        hasUnclaimedShare,
        shareCents,
        itemTotalCents: shareCents,
      });
      continue;
    }

    const match = line.match(/^(.+?)\s*:\s*(.+)$/);
    if (!match) continue;

    const [, rawName, rawAmount] = match;
    const totalCents = parseSharedAmountToCents(rawAmount);
    if (Number.isNaN(totalCents)) continue;

    people.push({
      participantId: rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: rawName.trim(),
      items: [],
      subtotalCents: totalCents,
      taxCents: 0,
      tipCents: 0,
      discountCents: 0,
      totalCents,
    });
  }

  if (people.length === 0) return null;

  const subtotalTotalCents = people.reduce(
    (sum, person) => sum + person.totalCents,
    0,
  );

  return {
    people,
    unclaimedItemIds: [],
    grandTotalCents: subtotalTotalCents,
    subtotalTotalCents,
  };
}

function parseSharedAmountToCents(rawAmount: string): number {
  if (!rawAmount) return Number.NaN;

  let cleaned = rawAmount.replace(/[€£$]/g, "").replace(/EUR/gi, "").trim();
  if (!cleaned) return Number.NaN;

  const negative = cleaned.startsWith("-");
  cleaned = cleaned.replace(/-/g, "");

  if (cleaned.includes(".") && cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(",", ".");
  }

  const parsed = Number.parseFloat(cleaned.replace(/[^0-9.]/g, ""));
  if (Number.isNaN(parsed)) return Number.NaN;

  return Math.round((negative ? -parsed : parsed) * 100);
}

export function buildSummaryShareUrl(summary: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set("summary", summary);
  return url.toString();
}

function sumByKind(
  summary: { kind: string; amountCents: number }[],
  kind: string,
): number {
  return summary
    .filter((s) => s.kind === kind)
    .reduce((sum, s) => sum + s.amountCents, 0);
}

function normalizeParticipantName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}
