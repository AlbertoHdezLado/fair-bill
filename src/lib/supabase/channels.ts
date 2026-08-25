export function roomChannelName(code: string): string {
  return `room:${code.toUpperCase()}`;
}

export const ROOM_UPDATED_EVENT = "room-updated";