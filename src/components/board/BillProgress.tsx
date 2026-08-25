"use client";

import type { ReactNode } from "react";
import { Receipt } from "lucide-react";
import { formatCents } from "@/lib/money";
import type { Messages } from "@/i18n";

export type BoardTab = "all" | "mine";

interface BillProgressProps {
  readonly assignedCents: number;
  readonly totalCents: number;
  readonly assignedItems: number;
  readonly totalItems: number;
  readonly onOpenTableBill: () => void;
  readonly tableLabel: string;
  readonly onToggleShare: () => void;
  readonly notifications?: ReactNode;
  readonly messages: Messages["board"];
}

export function BillProgress({
  assignedCents,
  totalCents,
  assignedItems,
  totalItems,
  onOpenTableBill,
  tableLabel,
  onToggleShare,
  notifications,
  messages,
}: BillProgressProps) {
  const percent =
    totalCents > 0
      ? Math.min(100, Math.round((assignedCents / totalCents) * 100))
      : 0;

  return (
    <div className="flex w-full flex-col gap-3 pt-3">
      <div className="flex items-center justify-between gap-3">
        <img src="/logo.svg" alt="fairBill" className="h-9 w-auto" />
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleShare}
            className="shrink-0 rounded-full border border-primary px-4 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
          >
            {tableLabel}
          </button>
          {notifications}
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 w-full overflow-hidden rounded-full bg-primary/20"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tabular-nums">
            {messages.assignedOfTotal
              .replace("{{assigned}}", formatCents(assignedCents))
              .replace("{{total}}", formatCents(totalCents))}
          </p>
          <p className="truncate text-xs tabular-nums text-muted-foreground">
            {messages.itemsProgress
              .replace("{{done}}", String(assignedItems))
              .replace("{{count}}", String(totalItems))}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenTableBill}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <Receipt aria-hidden="true" size={14} />
          {messages.viewTableBill}
        </button>
      </div>
    </div>
  );
}

interface BoardTabsProps {
  readonly tab: BoardTab;
  readonly onTabChange: (tab: BoardTab) => void;
  readonly messages: Messages["board"];
}

export function BoardTabs({ tab, onTabChange, messages }: BoardTabsProps) {
  return (
    <div className="rounded-t-2xl border-x border-t border-primary/20 bg-surface p-1">
      <div
        role="tablist"
        className="grid grid-cols-2 gap-1 rounded-full bg-primary/10 p-1"
      >
        <Tab
          label={messages.tabAll}
          active={tab === "all"}
          onClick={() => onTabChange("all")}
        />
        <Tab
          label={messages.tabMine}
          active={tab === "mine"}
          onClick={() => onTabChange("mine")}
        />
      </div>
    </div>
  );
}

function Tab({
  label,
  active,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-primary hover:bg-primary/10"
      }`}
    >
      {label}
    </button>
  );
}
