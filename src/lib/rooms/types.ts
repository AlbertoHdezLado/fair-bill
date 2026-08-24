import type { EditableExtras, EditableItem } from "@/lib/receipt/editable";

export interface RoomParticipant {
  readonly id: string;
  readonly name: string;
  readonly isOwner: boolean;
}

/** One stored choice: `units` is what the whole group takes, not each share. */
export interface RoomClaim {
  readonly itemId: string;
  readonly participantId: string;
  readonly ownerId: string;
  readonly units: number;
  readonly groupIds: readonly string[];
}

export interface RoomState {
  readonly code: string;
  readonly participants: RoomParticipant[];
  readonly items: EditableItem[];
  readonly extras: EditableExtras;
  readonly claims: RoomClaim[];
}
