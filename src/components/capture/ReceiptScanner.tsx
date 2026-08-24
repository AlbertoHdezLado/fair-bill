"use client";

import { useEffect, useRef, useState } from "react";
import { getOcrProvider, preprocessReceiptImage } from "@/lib/ocr";
import { parseReceipt } from "@/lib/receipt/parser";
import {
  EMPTY_EXTRAS,
  newItemId,
  type EditableExtras,
  type EditableItem,
} from "@/lib/receipt/editable";
import type { Messages } from "@/i18n";

type ScanStatus =
  | "idle"
  | "preprocessing"
  | "recognizing"
  | "parsing"
  | "error";

interface ReceiptScannerProps {
  readonly onScanned: (items: EditableItem[], extras: EditableExtras) => void;
  readonly messages: Messages["capture"];
}

export function ReceiptScanner({ onScanned, messages }: ReceiptScannerProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const isScanning =
    status === "preprocessing" ||
    status === "recognizing" ||
    status === "parsing";

  function handleFileSelected(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setScanError(null);
    void scan(file);
  }

  async function scan(file: File) {
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

      onScanned(
        parsed.items.map((item) => ({
          id: newItemId(),
          name: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          state: "leido",
        })),
        {
          taxCents: parsed.taxIncludedInItems
            ? 0
            : sumByKind(parsed.summary, "tax"),
          tipCents: sumByKind(parsed.summary, "tip"),
          serviceCents: sumByKind(parsed.summary, "service"),
          discountCents: sumByKind(parsed.summary, "discount"),
          detectedTotalCents: parsed.detectedTotalCents,
        },
      );
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setScanError(
        err instanceof Error ? err.message : messages.readReceiptError,
      );
    }
  }

  return (
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
        aria-label={messages.uploadImageLabel}
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
          {messages.uploadImage}
        </span>
        <span className="text-xs text-muted-foreground">
          {messages.uploadHint}
        </span>
      </button>

      <button
        type="button"
        onClick={() => cameraInputRef.current?.click()}
        aria-label={messages.takePhotoLabel}
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
        {messages.takePhoto}
      </button>

      <button
        type="button"
        onClick={() => onScanned([], EMPTY_EXTRAS)}
        className="text-xs text-muted-foreground underline hover:text-primary"
      >
        {messages.manualEntry}
      </button>

      {scanError && <p className="text-sm text-gold">{scanError}</p>}

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
              {messages.readingReceipt}
            </p>
            <p className="text-xs text-muted-foreground">
              {status === "preprocessing" && messages.preprocessing}
              {status === "recognizing" && messages.recognizing}
              {status === "parsing" && messages.parsing}
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
    </div>
  );
}

function sumByKind(
  summary: { kind: string; amountCents: number }[],
  kind: string,
): number {
  return summary
    .filter((s) => s.kind === kind)
    .reduce((sum, s) => sum + s.amountCents, 0);
}
