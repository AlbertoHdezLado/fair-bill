/**
 * Per-participant, per-room flags kept on this device: whether the scanned
 * ticket has already been reviewed once, and which event notifications have
 * already been read, so both stop reappearing on later visits.
 */

function ticketReviewedKey(code: string, participantId: string): string {
  return `fairBill.ticketReviewed.${code}.${participantId}`;
}

function readEventsKey(code: string, participantId: string): string {
  return `fairBill.readEvents.${code}.${participantId}`;
}

export function hasReviewedTicket(code: string, participantId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ticketReviewedKey(code, participantId)) === "1";
}

export function markTicketReviewed(code: string, participantId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ticketReviewedKey(code, participantId), "1");
}

function readEventIdSet(code: string, participantId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(readEventsKey(code, participantId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function getReadEventIds(code: string, participantId: string): Set<string> {
  return readEventIdSet(code, participantId);
}

export function markEventsRead(
  code: string,
  participantId: string,
  eventIds: readonly string[],
): void {
  if (typeof window === "undefined") return;
  const next = readEventIdSet(code, participantId);
  for (const id of eventIds) next.add(id);
  window.localStorage.setItem(readEventsKey(code, participantId), JSON.stringify([...next]));
}
