"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ImageUp, PencilLine } from "lucide-react";
import { ScanOverlay } from "@/components/capture/ScanOverlay";
import { CodeInput } from "@/components/room/CodeInput";
import { createRoom } from "@/lib/rooms/api";
import { scanReceipt, type ScanOutcome, type ScanStage } from "@/lib/ocr/scan";
import { isValidRoomCode, normalizeRoomCode } from "@/lib/rooms/code";
import {
  setPendingCapture,
  type PendingCapture,
} from "@/lib/rooms/pending-capture";
import type { Messages } from "@/i18n";

interface RoomHomeProps {
  readonly messages: Messages["room"];
  readonly captureMessages: Messages["capture"];
}

export function RoomHome({ messages, captureMessages }: RoomHomeProps) {
  const router = useRouter();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<{
    stage: ScanStage;
    progress: number;
    previewUrl: string;
  } | null>(null);

  function start(capture: PendingCapture) {
    setBusy(true);
    setError(null);
    createRoom()
      .then((created) => {
        setPendingCapture(capture);
        router.push(`/room/${created}`);
      })
      .catch(() => {
        setError(messages.createError);
        setBusy(false);
      });
  }

  function scanAndStart(file: File) {
    const previewUrl = URL.createObjectURL(file);
    setBusy(true);
    setError(null);
    setScan({ stage: "preprocessing", progress: 0, previewUrl });
    void scanReceipt(file, (stage, progress) =>
      setScan({ stage, progress, previewUrl }),
    )
      .then((outcome: ScanOutcome) => start(outcome))
      .catch(() => {
        setError(messages.createError);
        setBusy(false);
      })
      .finally(() => {
        setScan(null);
        URL.revokeObjectURL(previewUrl);
      });
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-8">
      {/* Sin `capture`, para que el selector abra la galería en vez de la cámara */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) scanAndStart(file);
        }}
      />
      <header className="flex flex-col items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="fairBill" className="h-12 w-auto" />
        <p className="text-sm text-muted-foreground">{messages.tagline}</p>
      </header>

      <section className="flex flex-col gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => galleryInputRef.current?.click()}
          aria-label={captureMessages.uploadImageLabel}
          className="group relative flex w-full items-center gap-4 overflow-hidden rounded-3xl bg-primary px-5 py-7 text-left text-primary-foreground shadow-[0_0_14px_-2px_var(--primary)] ring-1 ring-inset ring-white/15 transition-all duration-200 hover:bg-primary-hover hover:shadow-[0_0_18px_-2px_var(--primary)] active:scale-[0.98] disabled:opacity-60 disabled:shadow-none"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <ImageUp aria-hidden="true" size={24} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-lg font-semibold tracking-tight">
              {busy ? messages.creatingRoom : captureMessages.uploadImage}
            </span>
          </span>
          <ArrowRight
            aria-hidden="true"
            size={20}
            className="ml-auto shrink-0 opacity-70 transition-transform duration-200 group-hover:translate-x-1"
          />
        </button>

        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => start("manual")}
            className="flex w-full items-center gap-3 rounded-3xl border border-border/60 bg-surface/30 px-5 py-3 text-left backdrop-blur-sm transition-colors hover:border-primary disabled:opacity-60"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-background/40">
              <PencilLine aria-hidden="true" size={18} className="opacity-70" />
            </span>
            <span className="text-base font-medium text-muted-foreground">
              {captureMessages.manualEntry}
            </span>
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {messages.howTitle}
        </h2>
        <ol className="flex flex-col gap-4">
          {messages.steps.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">{step.title}</span>
                <span className="text-xs text-muted-foreground">
                  {step.detail}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {error && (
        <p role="alert" className="text-center text-sm text-gold">
          {error}
        </p>
      )}

      {scan && (
        <ScanOverlay
          stage={scan.stage}
          progress={scan.progress}
          previewUrl={scan.previewUrl}
          messages={captureMessages}
        />
      )}

      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <p className="text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {messages.joinHint}
        </p>
        <CodeInput
          disabled={busy}
          digitLabel={messages.codeDigitLabel}
          onComplete={(code) => {
            if (!isValidRoomCode(code)) {
              setError(messages.invalidCode);
              return;
            }
            setError(null);
            setBusy(true);
            router.push(`/room/${normalizeRoomCode(code)}`);
          }}
        />
      </section>
    </main>
  );
}
