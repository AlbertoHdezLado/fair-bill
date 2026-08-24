"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Messages } from "@/i18n";
import { getOcrProvider, preprocessReceiptImage } from "@/lib/ocr";
import { warpToRectangle, type Quad } from "@/lib/ocr/perspective";
import { parseReceipt } from "@/lib/receipt/parser";
import { computeSplit, type SplitResult } from "@/lib/split";
import { ReceiptEditor } from "@/components/ReceiptEditor";
import { CropStep, DEFAULT_CORNERS } from "@/components/CropStep";
import { ParticipantRoster } from "@/components/ParticipantRoster";
import { PersonClaimStep } from "@/components/PersonClaimStep";
import { PersonTotals } from "@/components/PersonTotals";
import { formatCents } from "@/lib/money";
import {
  buildSplitClaims,
  choiceGroup,
  choiceTotalUnits,
  ownChoice,
  removeParticipantClaims,
  setClaimChoice,
  unitsTakenByAll,
  type ClaimChoice,
  type LocalClaims,
} from "@/lib/local-claims";
import {
  EMPTY_EXTRAS,
  getItemState,
  newItemId,
  type EditableExtras,
  type EditableItem,
} from "@/lib/receipt/editable";
import { clearSession, loadSession, saveSession } from "@/lib/session-storage";

type ScanStatus =
  "idle" | "preprocessing" | "recognizing" | "parsing" | "done" | "error";

type LocalStage = "bill" | "names" | "roster" | "claim" | "results";

interface CaptureFlowProps {
  readonly messages: Messages;
}

export function CaptureFlow({ messages }: CaptureFlowProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const participantInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [rawFile, setRawFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropCorners, setCropCorners] = useState<Quad>(DEFAULT_CORNERS);
  const [showCrop, setShowCrop] = useState(false);
  const [showProcessingPreview, setShowProcessingPreview] = useState(false);
  const [warpedPreviewUrl, setWarpedPreviewUrl] = useState<string | null>(null);
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string | null>(
    null,
  );
  const [processedForOcr, setProcessedForOcr] = useState<Blob | null>(null);
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
  const [confirmedKeys, setConfirmedKeys] = useState<string[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [localResult, setLocalResult] = useState<SplitResult | null>(null);
  const [showUnclaimedPrompt, setShowUnclaimedPrompt] = useState(false);
  const [showBillInRoster, setShowBillInRoster] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "error">("idle");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const hydrated = useRef(false);

  // La imagen del ticket no se puede serializar: al recargar se recupera el
  // reparto ya extraído, no el flujo de captura.
  useEffect(() => {
    const saved = loadSession();
    const summaryFromUrl = parseSharedSummaryFromLocation();
    hydrated.current = true;

    if (summaryFromUrl) {
      /* eslint-disable react-hooks/set-state-in-effect -- rehidratacion puntual al montar */
      setLocalResult(summaryFromUrl);
      setLocalStage("results");
      setShowEditor(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    if (!saved) return;
    /* eslint-disable react-hooks/set-state-in-effect -- rehidratacion puntual al montar */
    setItems(saved.items);
    setExtras(saved.extras);
    setShowEditor(saved.showEditor);
    setLocalStage(saved.localStage);
    setParticipants(saved.participants);
    setClaims(saved.claims);
    setConfirmedKeys(saved.confirmedKeys);
    setActiveKey(saved.activeKey);
    setLocalResult(saved.localResult);
    setShowBillInRoster(saved.showBillInRoster);
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
      confirmedKeys,
      activeKey,
      localResult,
      showBillInRoster,
    });
  }, [
    items,
    extras,
    showEditor,
    localStage,
    participants,
    claims,
    confirmedKeys,
    activeKey,
    localResult,
    showBillInRoster,
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

  useEffect(() => {
    return () => {
      if (warpedPreviewUrl) URL.revokeObjectURL(warpedPreviewUrl);
    };
  }, [warpedPreviewUrl]);

  useEffect(() => {
    return () => {
      if (processedPreviewUrl) URL.revokeObjectURL(processedPreviewUrl);
    };
  }, [processedPreviewUrl]);

  // Once diners start picking their items, the global bill is only reachable
  // through the "edit bill" toggle in the names roster, not shown by default.
  const showReceiptEditor =
    localStage === "bill" || (localStage === "roster" && showBillInRoster);

  function handleFileSelected(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (warpedPreviewUrl) URL.revokeObjectURL(warpedPreviewUrl);
    if (processedPreviewUrl) URL.revokeObjectURL(processedPreviewUrl);
    setRawFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setWarpedPreviewUrl(null);
    setProcessedPreviewUrl(null);
    setProcessedForOcr(null);
    setShowProcessingPreview(false);
    setScanError(null);
    setShowEditor(false);
    setCropCorners(DEFAULT_CORNERS);
    setShowCrop(true);
  }

  async function recognizeFromProcessedImage(processed: Blob) {
    setShowProcessingPreview(false);
    setScanError(null);
    try {
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
          state: getItemState(item.confidence),
          confidence: item.confidence,
        })),
      );
      setExtras({
        taxCents: sumByKind(parsed.summary, "tax"),
        tipCents: sumByKind(parsed.summary, "tip"),
        serviceCents: sumByKind(parsed.summary, "service"),
        discountCents: sumByKind(parsed.summary, "discount"),
        detectedTotalCents: parsed.detectedTotalCents,
      });

      setStatus("done");
      setShowEditor(true);
    } catch (err) {
      setStatus("error");
      setScanError(
        err instanceof Error ? err.message : messages.capture.readReceiptError,
      );
    }
  }

  async function handleCropConfirmed(
    fractionalQuad: Quad,
    naturalWidth: number,
    naturalHeight: number,
  ) {
    if (!rawFile) return;
    setCropCorners(fractionalQuad);
    setShowCrop(false);

    // CropStep reports corners as fractions (0-1) of the displayed image;
    // warpToRectangle needs actual pixel coordinates in the source image.
    const quad = fractionalQuad.map((point) => ({
      x: point.x * naturalWidth,
      y: point.y * naturalHeight,
    })) as Quad;

    try {
      setStatus("preprocessing");
      const warped = await warpToRectangle(rawFile, quad);
      const processed = await preprocessReceiptImage(warped);

      if (warpedPreviewUrl) URL.revokeObjectURL(warpedPreviewUrl);
      if (processedPreviewUrl) URL.revokeObjectURL(processedPreviewUrl);
      setWarpedPreviewUrl(URL.createObjectURL(warped));
      setProcessedPreviewUrl(URL.createObjectURL(processed));
      setProcessedForOcr(processed);
      setShowProcessingPreview(true);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setScanError(
        err instanceof Error ? err.message : "Error al leer el ticket",
      );
    }
  }

  async function copyResultToClipboard() {
    if (!localResult) return;
    const text = buildSummaryText(localResult, messages);

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setCopyStatus("error");
    }
  }

  async function shareResultSummary() {
    if (!localResult) return;
    const text = buildSummaryText(localResult, messages);
    const shareUrl = buildSummaryShareUrl(text);

    try {
      if (navigator.share) {
        await navigator.share({
          title: messages.capture.shareTitle,
          text,
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(shareUrl);
    } catch {
      setCopyStatus("error");
    }
  }

  function resetToStart() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (warpedPreviewUrl) URL.revokeObjectURL(warpedPreviewUrl);
    if (processedPreviewUrl) URL.revokeObjectURL(processedPreviewUrl);
    setRawFile(null);
    setPreviewUrl(null);
    setWarpedPreviewUrl(null);
    setProcessedPreviewUrl(null);
    setProcessedForOcr(null);
    setCropCorners(DEFAULT_CORNERS);
    setShowCrop(false);
    setShowProcessingPreview(false);
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
    setConfirmedKeys([]);
    setActiveKey(null);
    setLocalResult(null);
    setShowUnclaimedPrompt(false);
    setShowBillInRoster(false);
    setCopyStatus("idle");
    setShowResetConfirm(false);
    clearSession();
  }

  function startManualEntry() {
    setShowProcessingPreview(false);
    setProcessedForOcr(null);
    setItems([]);
    setExtras(EMPTY_EXTRAS);
    setShowEditor(true);
    setShowCrop(false);
    setStatus("idle");
    setScanError(null);
  }

  function removeParticipant(index: number) {
    const key = participants[index]?.key;
    setParticipants((prev) => prev.filter((_, i) => i !== index));
    if (!key) return;
    setClaims((prev) => removeParticipantClaims(prev, key));
    setConfirmedKeys((prev) => prev.filter((k) => k !== key));
  }

  function removeEmptyParticipant(index: number) {
    if (!participants[index]?.name.trim() && participants.length > 2) {
      removeParticipant(index);
    }
  }

  function handleClaimChange(
    itemId: string,
    participantKeys: readonly string[],
    choice: ClaimChoice | null,
  ) {
    // La elección la crea el participante que tiene el turno: se replica en
    // el grupo entero pero sigue siendo suya, sin pisar lo que ya tenían.
    const owner = activeKey;
    if (!owner) return;
    setClaims((prev) =>
      participantKeys.reduce(
        (acc, key) => setClaimChoice(acc, key, itemId, owner, choice),
        prev,
      ),
    );
  }

  function confirmActiveParticipant() {
    if (!activeKey) return;
    setConfirmedKeys((prev) =>
      prev.includes(activeKey) ? prev : [...prev, activeKey],
    );
    setActiveKey(null);
    setLocalStage("roster");
  }

  function finishRoster() {
    const unclaimed = items.filter(
      (item) => unitsTakenByAll(item, claims) < item.quantity,
    );
    if (unclaimed.length > 0) {
      setShowUnclaimedPrompt(true);
      return;
    }
    computeLocalResult();
  }

  function computeLocalResult() {
    setShowUnclaimedPrompt(false);
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
  const hasDuplicateNames =
    duplicateNames.size > 0;
  const canContinueFromNames = namedParticipants.length >= 2 && !hasDuplicateNames;
  const unclaimedItems = items.filter(
    (item) => unitsTakenByAll(item, claims) < item.quantity,
  );
  const hasProgress =
    showEditor || showCrop || showProcessingPreview || items.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <button
          type="button"
          onClick={() => {
            if (hasProgress) setShowResetConfirm(true);
          }}
          aria-label={messages.capture.resetToStartLabel}
          className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <img src="/logo.svg" alt="fairBill" className="h-16 w-auto" />
        </button>

        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
              type="button"
              aria-label={messages.capture.closeLabel}
              onClick={() => setShowResetConfirm(false)}
              className="absolute inset-0 bg-black/70"
            />
            <div className="relative flex w-full max-w-sm flex-col gap-3 rounded-lg border border-warning-solid bg-warning-bg p-4 shadow-2xl">
              <div className="flex items-center justify-center gap-2 text-warning-foreground">
                <AlertTriangle
                  aria-hidden="true"
                  size={20}
                  strokeWidth={2}
                  className="shrink-0"
                />
                <p className="text-center text-lg font-bold">
                  {messages.capture.resetTitle}
                </p>
              </div>
              <p className="text-center text-sm text-warning-foreground">
                {messages.capture.resetDescription}
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="rounded-full border border-warning-solid px-5 py-3 text-sm font-medium text-warning-foreground hover:bg-warning-solid/10"
                >
                  {messages.capture.stayHere}
                </button>
                <button
                  type="button"
                  onClick={resetToStart}
                  className="rounded-full bg-warning-solid px-5 py-3 text-sm font-medium text-warning-solid-foreground hover:brightness-95"
                >
                  {messages.capture.startAgain}
                </button>
              </div>
            </div>
          </div>
        )}
        {localStage === "bill" &&
          !showEditor &&
          !showCrop &&
          !showProcessingPreview && (
          <>
            <p className="text-xl font-bold text-accent">
              {messages.capture.selectOption}
            </p>
            <div className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-left dark:border-accent/40">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="mt-0.5 h-5 w-5 shrink-0 text-accent"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" d="M12 11v5" />
                <path strokeLinecap="round" d="M12 8h.01" />
              </svg>
              <p className="text-sm text-accent">
                {messages.capture.uploadHint}
              </p>
            </div>
          </>
        )}
      </div>

      {showCrop && previewUrl && (
        <CropStep
          imageUrl={previewUrl}
          initialCorners={cropCorners}
          onCancel={() => {
            setShowCrop(false);
            cameraInputRef.current?.click();
          }}
          onConfirm={(quad, naturalWidth, naturalHeight) =>
            void handleCropConfirmed(quad, naturalWidth, naturalHeight)
          }
        />
      )}

      {showProcessingPreview && processedPreviewUrl && (
        <div className="flex flex-col gap-4">
          <p className="text-center text-xl font-bold text-accent">
            {messages.capture.reviewProcessedImage}
          </p>

          <div className="rounded-lg border border-zinc-300/70 p-2 dark:border-zinc-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={warpedPreviewUrl ?? processedPreviewUrl}
              alt={messages.capture.straightenedReceiptAlt}
              className="w-full rounded"
            />
          </div>

          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => {
                setShowProcessingPreview(false);
                setCropCorners((prev) => prev);
                setShowCrop(true);
              }}
              className="flex-1 rounded-full border border-zinc-400 px-5 py-2 text-sm font-medium"
            >
              {messages.capture.adjustCrop}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!processedForOcr) return;
                void recognizeFromProcessedImage(processedForOcr);
              }}
              disabled={!processedForOcr}
              className="flex-1 rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              {messages.capture.continue}
            </button>
          </div>
        </div>
      )}

      {localStage === "bill" &&
        !showEditor &&
        !showCrop &&
        !showProcessingPreview && (
        <div className="flex flex-col items-center gap-5 text-center">
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

          <div className="grid w-full max-w-sm grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isScanning}
              aria-label={messages.capture.takePhotoLabel}
              className="flex flex-col items-center gap-3 rounded-2xl border border-primary/25 bg-primary/20 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md disabled:pointer-events-none disabled:opacity-50 dark:border-primary/40 dark:bg-primary/15"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="h-6 w-6"
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
              </span>
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                {messages.capture.takePhoto}
              </span>
            </button>

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={isScanning}
              aria-label={messages.capture.uploadImageLabel}
              className="flex flex-col items-center gap-3 rounded-2xl border border-accent/25 bg-accent/20 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md disabled:pointer-events-none disabled:opacity-50 dark:border-accent/40 dark:bg-accent/15"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="h-6 w-6"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v2.75A1.25 1.25 0 0 0 5.25 20h13.5A1.25 1.25 0 0 0 20 18.75V16M8 8l4-4m0 0 4 4m-4-4v13"
                  />
                </svg>
              </span>
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                {messages.capture.uploadImage}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={startManualEntry}
            disabled={isScanning}
            className="rounded-full border border-accent bg-accent-soft px-5 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
          >
            {messages.capture.manualEntry}
          </button>

          {scanError && (
            <p className="text-sm text-error-foreground">{scanError}</p>
          )}
        </div>
      )}

      {isScanning && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-2xl border-t-4 border-t-primary bg-background p-6 text-center shadow-xl">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent-soft border-t-primary" />
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {messages.capture.readingReceipt}
            </p>
            <p className="text-xs text-zinc-500">
              {status === "preprocessing" &&
                messages.capture.preprocessing}
              {status === "recognizing" && messages.capture.recognizing}
              {status === "parsing" && messages.capture.parsing}
            </p>
            {status === "recognizing" && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {showEditor && (
        <>
          {showReceiptEditor && (
            <ReceiptEditor
              items={items}
              extras={extras}
              onItemsChange={setItems}
              onExtrasChange={setExtras}
              messages={messages.receiptEditor}
              itemRowMessages={messages.itemRow}
            />
          )}

          {localStage === "bill" && (
            <button
              type="button"
              onClick={() => setLocalStage("names")}
              disabled={items.filter((item) => item.name.trim()).length === 0}
              className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              {messages.capture.continue}
            </button>
          )}

          {localStage === "names" && (
            <div className="flex flex-col gap-3">
              <p className="text-center text-xl font-bold text-accent">
                {messages.capture.enterParticipants}
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
                      onBlur={() => removeEmptyParticipant(index)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        // El siguiente input puede tardar un tick en montarse
                        // si este era el último hueco.
                        setTimeout(() => {
                          participantInputRefs.current[index + 1]?.focus();
                        }, 0);
                      }}
                      placeholder={messages.capture.participantPlaceholder.replace(
                        "{{number}}",
                        String(index + 1),
                      )}
                      enterKeyHint="next"
                      className={`min-w-0 flex-1 rounded border-2 bg-transparent px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 ${
                        duplicateNames.has(
                          normalizeParticipantName(participant.name),
                        )
                          ? "border-red-500/85 text-red-700 shadow-[0_0_0_1px_rgba(239,68,68,0.22)] focus:border-red-500 focus:ring-red-500/35 dark:border-red-400/85 dark:text-red-300"
                          : "border-primary/75 shadow-[0_0_0_1px_rgba(34,197,94,0.18)] focus:border-primary focus:ring-primary/35 dark:border-primary/80"
                      }`}
                    />
                    {isPendingSlot ? (
                      <span
                        aria-hidden="true"
                        className="rounded px-2 py-1 text-sm invisible"
                      >
                        ✕
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeParticipant(index)}
                        aria-label={messages.capture.removeParticipantLabel}
                        className="rounded px-2 py-1 text-sm text-accent/70 hover:bg-error-bg hover:text-error-foreground"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setLocalStage("roster")}
                disabled={!canContinueFromNames}
                className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
              >
                {messages.capture.continue}
              </button>
              {hasDuplicateNames && (
                <p className="text-center text-sm text-error-foreground">
                  {messages.capture.duplicateNames}
                </p>
              )}
            </div>
          )}

          {localStage === "roster" && (
            <ParticipantRoster
              participants={namedParticipants}
              confirmedKeys={confirmedKeys}
              onSelect={(key) => {
                setActiveKey(key);
                setLocalStage("claim");
              }}
              onFinish={finishRoster}
              onEditNames={() => setLocalStage("names")}
              showBill={showBillInRoster}
              onToggleBill={() => setShowBillInRoster((prev) => !prev)}
              messages={messages.roster}
            />
          )}

          {showUnclaimedPrompt && (
            <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
              <button
                type="button"
                aria-label={messages.capture.closeLabel}
                onClick={() => setShowUnclaimedPrompt(false)}
                className="absolute inset-0 bg-black/70"
              />
              <div className="relative flex w-full max-w-sm flex-col gap-3 rounded-lg border border-warning-solid bg-warning-bg p-4 shadow-2xl">
                <div className="flex items-center justify-center gap-2 text-warning-foreground">
                  <AlertTriangle
                    aria-hidden="true"
                    size={20}
                    strokeWidth={2}
                    className="shrink-0"
                  />
                  <p className="text-center text-lg font-bold">
                    {messages.capture.unclaimedTitle}
                  </p>
                </div>
                <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1 text-sm text-warning-foreground">
                  {unclaimedItems.map((item) => {
                    const missing =
                      item.quantity - unitsTakenByAll(item, claims);
                    const assignments = namedParticipants
                      .map((participant) => {
                        const choice = ownChoice(
                          claims,
                          participant.key,
                          item.id,
                        );
                        if (!choice) return null;
                        const group = choiceGroup(participant.key, choice).map(
                          (key) =>
                            namedParticipants
                              .find((p) => p.key === key)
                              ?.name.trim() || "?",
                        );
                        return {
                          ownerKey: participant.key,
                          units: choiceTotalUnits(item, choice),
                          names: group.join(" + "),
                        };
                      })
                      .filter((entry) => entry !== null);
                    return (
                      <li
                        key={item.id}
                        className="rounded border border-warning-solid/40 px-2 py-1.5"
                      >
                        <p className="font-medium">
                          {item.name || messages.capture.unnamedProduct} x
                          {roundUnits(missing)}
                        </p>
                        {assignments.length > 0 && (
                          <ul className="mt-1 list-disc pl-4 text-xs opacity-80">
                            {assignments.map((assignment) => (
                              <li key={assignment.ownerKey}>
                                {roundUnits(assignment.units)} {messages.capture.unitsAbbr} —{" "}
                                {assignment.names}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={computeLocalResult}
                    className="rounded-full bg-warning-solid px-5 py-3 text-sm font-medium text-warning-solid-foreground hover:brightness-95"
                  >
                    {messages.capture.splitBetweenEveryone}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUnclaimedPrompt(false)}
                    className="rounded-full border border-warning-solid px-5 py-3 text-sm font-medium text-warning-foreground hover:bg-warning-solid/10"
                  >
                    {messages.capture.review}
                  </button>
                </div>
              </div>
            </div>
          )}

          {localStage === "claim" && activeKey && (
            <PersonClaimStep
              participantKey={activeKey}
              participantName={
                participants.find((p) => p.key === activeKey)?.name.trim() ?? ""
              }
              participants={namedParticipants.map((p) => ({
                key: p.key,
                name: p.name.trim(),
              }))}
              items={items}
              claims={claims}
              onChange={handleClaimChange}
              onConfirm={confirmActiveParticipant}
              onBack={() => {
                setActiveKey(null);
                setLocalStage("roster");
              }}
              messages={messages.claim}
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
                  isOwn={false}
                  messages={messages.totals}
                />
              ))}
              <button
                type="button"
                onClick={() => {
                  void shareResultSummary();
                }}
                className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground"
              >
                {messages.capture.share}
              </button>
              {copyStatus === "error" && (
                <p className="text-xs text-error-foreground">
                  {messages.capture.copyError}
                </p>
              )}
              <button
                type="button"
                onClick={() => setLocalStage("roster")}
                className="rounded-full border border-accent px-5 py-2 text-sm font-medium text-accent hover:bg-accent/10"
              >
                {messages.capture.backToSplit}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function buildSummaryText(localResult: SplitResult, messages: Messages): string {
  return localResult.people
    .map((person) => {
      const items = person.items.map(
        (item) => {
          const sharedMark = item.hasUnclaimedShare
            ? ` [${messages.capture.splitAcrossEveryoneMark}]`
            : "";
          return `- ${item.itemName} x${item.effectiveUnits}: ${formatCents(item.shareCents, "EUR")}${sharedMark}`;
        },
      );
      return [
        `${person.name}: ${formatCents(person.totalCents, "EUR")}`,
        ...items,
      ].join("\n");
    })
    .join("\n");
}

const sharedSummaryMarks = ["dividido entre todos", "split between everyone"];

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
      const currentPerson = people.at(-1);
      if (currentPerson) addSharedItemLine(currentPerson, line);
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;

    const rawName = line.slice(0, separatorIndex);
    const rawAmount = line.slice(separatorIndex + 1);
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

  const subtotalTotalCents = people.reduce((sum, person) => sum + person.totalCents, 0);

  return {
    people,
    unclaimedItemIds: [],
    grandTotalCents: subtotalTotalCents,
    subtotalTotalCents,
  };
}

function addSharedItemLine(person: SplitResult["people"][number], line: string) {
  const { hasUnclaimedShare, itemLine } = stripSharedSummaryMark(line);
  const itemDetails = parseSharedItemDetails(itemLine);
  if (!itemDetails) return;

  person.items.push({
    itemId: `${person.participantId}-item-${person.items.length}`,
    itemName: itemDetails.itemName,
    claimedUnits: itemDetails.effectiveUnits,
    effectiveUnits: itemDetails.effectiveUnits,
    hasUnclaimedShare,
    shareCents: itemDetails.shareCents,
    itemTotalCents: itemDetails.shareCents,
  });
}

function stripSharedSummaryMark(line: string): {
  readonly hasUnclaimedShare: boolean;
  readonly itemLine: string;
} {
  for (const mark of sharedSummaryMarks) {
    const suffix = ` [${mark}]`;
    if (line.endsWith(suffix)) {
      return { hasUnclaimedShare: true, itemLine: line.slice(0, -suffix.length) };
    }
  }

  return { hasUnclaimedShare: false, itemLine: line };
}

function parseSharedItemDetails(
  itemLine: string,
): { readonly itemName: string; readonly effectiveUnits: number; readonly shareCents: number } | null {
  const quantityMarker = itemLine.lastIndexOf(" x");
  const amountMarker = itemLine.lastIndexOf(":");
  if (quantityMarker < 2 || amountMarker <= quantityMarker + 2) return null;

  const itemName = itemLine.slice(2, quantityMarker).trim();
  const rawUnits = itemLine.slice(quantityMarker + 2, amountMarker).trim();
  const rawItemAmount = itemLine.slice(amountMarker + 1).trim();
  const effectiveUnits = Number.parseFloat(rawUnits.replace(",", "."));
  const shareCents = parseSharedAmountToCents(rawItemAmount);

  if (!itemName || Number.isNaN(effectiveUnits) || Number.isNaN(shareCents)) {
    return null;
  }

  return { itemName, effectiveUnits, shareCents };
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

function roundUnits(units: number): number {
  return Math.round(units * 100) / 100;
}
