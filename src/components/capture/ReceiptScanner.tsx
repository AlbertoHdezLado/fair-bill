"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ImageUp, PencilLine } from "lucide-react";
import { scanReceipt, LowQualityScanError, type ScanStage } from "@/lib/ocr/scan";
import {
  EMPTY_EXTRAS,
  type EditableExtras,
  type EditableItem,
} from "@/lib/receipt/editable";
import { fileToPreviewDataUrl } from "@/lib/receipt/image";
import { ScanOverlay } from "@/components/capture/ScanOverlay";
import type { Messages } from "@/i18n";

interface ReceiptScannerProps {
  readonly onScanned: (items: EditableItem[], extras: EditableExtras) => void;
  /** Fires with a compressed copy of the captured photo, kept only on this device. */
  readonly onImageCaptured?: (dataUrl: string) => void;
  readonly messages: Messages["capture"];
}

export function ReceiptScanner({
  onScanned,
  onImageCaptured,
  messages,
}: ReceiptScannerProps) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<ScanStage | null>(null);
  const [progress, setProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileSelected(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setScanError(null);
    if (onImageCaptured) {
      void fileToPreviewDataUrl(file).then(onImageCaptured).catch(() => {});
    }
    void scan(file);
  }

  async function scan(file: File) {
    try {
      const outcome = await scanReceipt(file, (nextStage, nextProgress) => {
        setStage(nextStage);
        setProgress(nextProgress);
      });
      setStage(null);
      onScanned(outcome.items, outcome.extras);
    } catch (err) {
      setStage(null);
      if (err instanceof LowQualityScanError) {
        setScanError(messages.lowQualityScanError);
      } else {
        setScanError(
          err instanceof Error ? err.message : messages.readReceiptError,
        );
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Sin `capture`, para que el selector abra la galería en vez de la cámara */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleFileSelected(file);
        }}
      />
      <button
        type="button"
        onClick={() => galleryInputRef.current?.click()}
        aria-label={messages.uploadImageLabel}
        className="flex w-full items-center gap-4 rounded-3xl bg-primary px-6 py-7 text-left text-primary-foreground shadow-lg transition-transform active:scale-[0.98]"
      >
        <ImageUp aria-hidden="true" size={28} className="shrink-0" />
        <span className="text-lg font-semibold tracking-tight">
          {messages.uploadImage}
        </span>
      </button>

      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={() => onScanned([], EMPTY_EXTRAS)}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-medium shadow-sm transition-colors hover:border-primary"
        >
          <PencilLine aria-hidden="true" size={18} />
          {messages.manualEntry}
        </button>
      </div>

      {scanError && (
        <p role="alert" className="text-center text-sm text-gold">
          {scanError}
        </p>
      )}

      <AnimatePresence>
        {stage && (
          <ScanOverlay
            key="scan-overlay"
            stage={stage}
            progress={progress}
            previewUrl={previewUrl}
            messages={messages}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
