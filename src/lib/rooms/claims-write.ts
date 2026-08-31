import type { SupabaseClient } from "@supabase/supabase-js";

export function isMissingGroupKeyColumnError(
  error: { code?: string; message?: string } | null,
): boolean {
  return (
    (error?.code === "42703" || error?.code === "PGRST204") &&
    /(group_key|shared|all_participants)/.test(error.message ?? "")
  );
}

export interface ClaimRowsInput {
  readonly roomId: string;
  readonly itemId: string;
  readonly ownerId: string;
  readonly groupKey: string;
  readonly participantIds: readonly string[];
  readonly units: number | null;
  readonly groupIds: readonly string[];
  readonly shared: boolean;
  readonly allParticipants: boolean;
}

export async function saveClaimRows(
  supabase: Pick<SupabaseClient, "from">,
  {
    roomId,
    itemId,
    ownerId,
    groupKey,
    participantIds,
    units,
    groupIds,
    shared,
    allParticipants,
  }: ClaimRowsInput,
): Promise<void> {
  const deleteResult = await supabase
    .from("claims")
    .delete()
    .eq("room_id", roomId)
    .eq("item_id", itemId)
    .eq("group_key", groupKey);

  if (deleteResult.error && !isMissingGroupKeyColumnError(deleteResult.error)) {
    throw new Error("Could not save");
  }

  if (deleteResult.error && isMissingGroupKeyColumnError(deleteResult.error)) {
    const legacyDeleteResult = await supabase
      .from("claims")
      .delete()
      .eq("room_id", roomId)
      .eq("item_id", itemId)
      .eq("owner_id", ownerId);

    if (legacyDeleteResult.error) {
      throw new Error("Could not save");
    }
  }

  if (units === null || participantIds.length === 0) return;

  const rows = participantIds.map((participantId) => ({
    room_id: roomId,
    item_id: itemId,
    participant_id: participantId,
    owner_id: ownerId,
    group_key: groupKey,
    units,
    group_ids: [...groupIds],
    shared,
    all_participants: allParticipants,
  }));

  const insertResult = await supabase.from("claims").insert(rows);
  if (!insertResult.error) return;

  if (!isMissingGroupKeyColumnError(insertResult.error)) {
    throw new Error("Could not save");
  }

  const legacyInsertResult = await supabase.from("claims").insert(
    rows.map(
      ({ group_key: _groupKey, shared: _shared, all_participants: _allParticipants, ...row }) => row,
    ),
  );

  if (legacyInsertResult.error) {
    throw new Error("Could not save");
  }
}
