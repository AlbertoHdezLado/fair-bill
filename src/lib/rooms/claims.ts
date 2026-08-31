import type { LocalClaims } from "@/lib/local-claims";
import type { RoomClaim } from "./types";

/** Maps stored room claims onto the shape the split room already works with. */
export function toLocalClaims(claims: readonly RoomClaim[]): LocalClaims {
  const local: LocalClaims = {};

  for (const claim of claims) {
    const forPerson = (local[claim.participantId] ??= {});
    const entries = (forPerson[claim.itemId] ??= []);
    entries.push({
      owner: claim.ownerId,
      groupId: claim.groupKey,
      shared: claim.shared,
      allParticipants: claim.allParticipants,
      choice: {
        mode: "units",
        count: claim.units,
        group: claim.groupIds.length > 0 ? [...claim.groupIds] : undefined,
      },
    });
  }

  return local;
}
