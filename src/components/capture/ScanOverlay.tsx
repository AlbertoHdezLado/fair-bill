"use client";

import type { ScanStage } from "@/lib/ocr/scan";
import type { Messages } from "@/i18n";

interface ScanOverlayProps {
  readonly stage: ScanStage;
  readonly progress: number;
  readonly previewUrl: string | null;
  readonly messages: Messages["capture"];
}

export function ScanOverlay({
  stage,
  progress,
  previewUrl,
  messages,
}: ScanOverlayProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-4 backdrop-blur-sm"
    >
      <div className="flex w-full max-w-xs flex-col items-center gap-4 rounded-3xl border border-border bg-background p-6 text-center shadow-2xl">
        <div className="relative w-32 overflow-hidden rounded-2xl border border-primary/40 bg-surface">
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
        <p className="text-sm font-semibold tracking-tight">
          {messages.readingReceipt}
        </p>
        <p className="text-xs text-muted-foreground">
          {stage === "preprocessing" && messages.preprocessing}
          {stage === "recognizing" && messages.recognizing}
          {stage === "parsing" && messages.parsing}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{
              width: `${stage === "recognizing" ? Math.round(progress * 100) : stage === "parsing" ? 100 : 8}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
