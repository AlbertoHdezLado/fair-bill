"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, X } from "lucide-react";
import type { Messages } from "@/i18n";
import { backdropVariants, popVariants } from "@/lib/motion";

export interface BoardNotification {
  readonly id: string;
  readonly text: string;
  readonly at: number;
  readonly read: boolean;
  /** Whether it concerns a shared group (visible to everyone) or a private claim. */
  readonly scope: "shared" | "personal";
}

interface NotificationBellProps {
  readonly notifications: readonly BoardNotification[];
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
  readonly messages: Messages["board"];
}

export function NotificationBell({
  notifications,
  open,
  onToggle,
  onClose,
  messages,
}: NotificationBellProps) {
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter(
    (notification) => !notification.read,
  ).length;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !panelRef.current?.contains(target) &&
        !bellRef.current?.contains(target)
      ) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className="relative shrink-0">
      <button
        ref={bellRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={
          unread > 0
            ? messages.notificationsUnread.replace("{{count}}", String(unread))
            : messages.notifications
        }
        className="relative rounded-full border border-primary p-2 text-primary hover:bg-primary/10"
      >
        <Bell aria-hidden="true" size={16} />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key="unread-badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="absolute -right-1 -top-1 min-w-4 rounded-full bg-gold px-1 text-[10px] font-semibold leading-4 text-foreground"
            >
              {unread > 9 ? "9+" : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/70 p-4">
            <motion.button
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              type="button"
              aria-label={messages.close}
              onClick={onClose}
              className="absolute inset-0 cursor-default"
            />
            <motion.div
              ref={panelRef}
              variants={popVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-primary/20 bg-surface p-2 shadow-lg"
            >
              <span
                aria-hidden="true"
                className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-l border-t border-primary/20 bg-surface"
              />
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <p className="text-xs font-semibold">{messages.notifications}</p>
                <button
                  type="button"
                  aria-label={messages.close}
                  onClick={onClose}
                  className="rounded p-0.5 hover:bg-primary/10"
                >
                  <X aria-hidden="true" size={14} />
                </button>
              </div>

              {notifications.length === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-muted-foreground">
                  {messages.notificationsEmpty}
                </p>
              ) : (
                <div className="space-y-3 overflow-y-auto pr-1">
                  <NotificationGroup
                    title={messages.notificationsShared}
                    notifications={notifications.filter(
                      (notification) => notification.scope === "shared",
                    )}
                  />
                  <NotificationGroup
                    title={messages.notificationsForYou}
                    notifications={notifications.filter(
                      (notification) => notification.scope === "personal",
                    )}
                  />
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotificationGroup({
  title,
  notifications,
}: {
  readonly title: string;
  readonly notifications: readonly BoardNotification[];
}) {
  if (notifications.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-1">
        {notifications.map((notification) => (
          <li
            key={notification.id}
            role="alert"
            className={`rounded-xl px-2 py-1.5 text-xs ${
              notification.read ? "bg-primary/5" : "bg-gold/15"
            }`}
          >
            <p>{notification.text}</p>
            <p className="pt-0.5 text-[10px] tabular-nums text-muted-foreground">
              {new Date(notification.at).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
